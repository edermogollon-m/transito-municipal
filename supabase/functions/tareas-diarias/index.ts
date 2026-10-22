// Tareas diarias de Tránsito (mejoras.sql):
//
//   1. Respaldo: copia de las tablas en JSON comprimido al bucket privado
//      "respaldos" (un archivo por día, se guardan los últimos 30).
//   2. Recordatorios: correo a los infractores con correo registrado cuyo
//      descuento por pronto pago vence en las próximas 36 horas.
//
// La llama pg_cron cada día (encabezado x-cron-secret, validado contra Vault
// con es_secreto_cron) o el Director desde Configuración con su sesión.
// Secretos: RESEND_API_KEY y, opcionales, REPORTE_REMITENTE y APP_URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const TABLAS = [
  "configuracion", "usuarios", "infracciones", "pagos", "pagos_anulados", "cortes_caja",
  "permisos", "vehiculos", "grua", "accidentes", "turnos", "auditoria", "recordatorios_enviados",
  "catalogo_infracciones", "reglamento_articulos",
];
const DIAS_RESPALDO = 30;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const mxn = (n: unknown) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fechaMx = (d: Date) =>
  d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" });

// deno-lint-ignore no-explicit-any
type Db = any;

async function todas(db: Db, tabla: string) {
  const filas: unknown[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await db.from(tabla).select("*").range(desde, desde + 999);
    if (error) throw new Error(`${tabla}: ${error.message}`);
    filas.push(...(data || []));
    if (!data || data.length < 1000) return filas;
  }
}

async function respaldar(db: Db) {
  const hoy = new Date().toISOString().slice(0, 10);
  const datos: Record<string, unknown[]> = {};
  let filas = 0;
  for (const t of TABLAS) {
    try { datos[t] = await todas(db, t); filas += datos[t].length; }
    catch (e) { datos[t] = []; console.warn("respaldo", (e as Error).message); }
  }
  const texto = JSON.stringify({ generado: new Date().toISOString(), tablas: datos });
  const gz = await new Response(new Blob([texto]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer();
  const archivo = `${hoy}.json.gz`;
  const { error } = await db.storage.from("respaldos").upload(archivo, gz, { contentType: "application/gzip", upsert: true });
  if (error) throw new Error(`No se pudo guardar el respaldo: ${error.message}`);

  // Conservar solo los últimos DIAS_RESPALDO días
  const limite = new Date(Date.now() - DIAS_RESPALDO * 86400000).toISOString().slice(0, 10);
  const { data: lista } = await db.storage.from("respaldos").list("", { limit: 1000 });
  const viejos = (lista || []).map((f: { name: string }) => f.name).filter((n: string) => /^\d{4}-\d{2}-\d{2}/.test(n) && n.slice(0, 10) < limite);
  if (viejos.length) await db.storage.from("respaldos").remove(viejos);
  return { archivo, filas, bytes: gz.byteLength, borrados: viejos.length };
}

async function recordar(db: Db) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { enviados: 0, aviso: "Falta RESEND_API_KEY" };
  const { data: cfg } = await db.from("configuracion").select("*").eq("id", 1).single();
  const tramos = [
    { pct: Number(cfg?.descuento_pct || 0), dias: Number(cfg?.dias_descuento || 0) },
    { pct: Number(cfg?.descuento2_pct || 0), dias: Number(cfg?.dias_descuento2 || 0) },
  ].filter((t) => t.pct > 0 && t.dias > 0).sort((a, b) => a.dias - b.dias);
  if (!tramos.length) return { enviados: 0, aviso: "Sin descuentos configurados" };

  const desde = new Date(Date.now() - tramos[tramos.length - 1].dias * 86400000).toISOString();
  const [{ data: infs }, { data: graves }, { data: enviados }] = await Promise.all([
    db.from("infracciones").select("id,folio,placa,tipo,monto,fecha,infractor,infractor_correo,catalogo_numero")
      .eq("estado", "pendiente").neq("infractor_correo", "").gte("fecha", desde).limit(500),
    db.from("catalogo_infracciones").select("numero").eq("grave", true),
    db.from("recordatorios_enviados").select("infraccion_id,tramo_dias").gte("enviado_at", desde),
  ]);
  const esGrave = new Set((graves || []).map((g: { numero: number }) => g.numero));
  const ya = new Set((enviados || []).map((e: { infraccion_id: number; tramo_dias: number }) => `${e.infraccion_id}:${e.tramo_dias}`));
  const appUrl = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");
  const ahora = Date.now();
  let n = 0;
  const errores: string[] = [];

  for (const r of infs || []) {
    if (n >= 50) break;
    if (r.catalogo_numero && esGrave.has(r.catalogo_numero)) continue;
    const correo = String(r.infractor_correo || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) continue;
    const fecha = new Date(r.fecha).getTime();
    const tramo = tramos.find((t) => ahora <= fecha + t.dias * 86400000);
    if (!tramo) continue;
    const vence = new Date(fecha + tramo.dias * 86400000);
    const faltan = vence.getTime() - ahora;
    if (faltan <= 0 || faltan > 36 * 3600000 || ya.has(`${r.id}:${tramo.dias}`)) continue;

    const conDesc = Math.round(Number(r.monto) * (1 - tramo.pct / 100));
    const transferencia = cfg?.pago_clabe
      ? `<p style="font-size:13px;color:#374151">También puedes pagar por transferencia: ${esc(cfg.pago_banco)} · CLABE <b>${esc(cfg.pago_clabe)}</b>${cfg.pago_beneficiario ? ` a nombre de ${esc(cfg.pago_beneficiario)}` : ""}. Usa el folio <b>${esc(r.folio)}</b> como referencia.</p>`
      : "";
    const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#111827">
      <div style="max-width:560px;margin:0 auto;background:#fff;padding:26px">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4B5563">Tránsito Municipal · ${esc(cfg?.municipio || "")}</div>
        <h1 style="font-size:20px;margin:6px 0 10px">Tu descuento vence ${esc(fechaMx(vence))}</h1>
        <p style="font-size:14px">Hola ${esc(String(r.infractor || "").split(" ")[0])}, si pagas la infracción <b>${esc(r.folio)}</b> (placa ${esc(r.placa)}, ${esc(r.tipo)}) a más tardar ese día, pagas <b>${mxn(conDesc)}</b> en lugar de ${mxn(r.monto)} (${tramo.pct}% de descuento).</p>
        <p style="font-size:13px;color:#374151">Paga en la Tesorería Municipal con tu folio.</p>
        ${transferencia}
        ${appUrl ? `<p><a href="${esc(appUrl)}/consulta?q=${encodeURIComponent(r.folio)}" style="display:inline-block;background:#1A7A82;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Ver mi infracción</a></p>` : ""}
        <p style="font-size:11px;color:#6B7280;margin-top:22px">Correo automático. Si ya pagaste, ignora este mensaje.</p>
      </div></body></html>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("REPORTE_REMITENTE") || "Tránsito Municipal <onboarding@resend.dev>",
        to: [correo], reply_to: cfg?.correo || undefined,
        subject: `Tu descuento de la infracción ${r.folio} vence pronto`, html,
      }),
    });
    if (!res.ok) { errores.push(`${r.folio}: ${(await res.text()).slice(0, 160)}`); continue; }
    await db.from("recordatorios_enviados").insert({ infraccion_id: r.id, tramo_dias: tramo.dias, correo });
    n++;
  }
  return { enviados: n, errores };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const secreto = req.headers.get("x-cron-secret");
  const cronOk = !!secreto && (await db.rpc("es_secreto_cron", { p_secreto: secreto })).data === true;
  if (!cronOk) {
    const usuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: rol } = await usuario.rpc("mi_rol");
    if (rol !== "admin") return json({ error: "Solo el Director puede lanzar las tareas diarias" }, 403);
  }
  let solo = "";
  try { solo = (await req.json())?.solo || ""; } catch { /* sin cuerpo */ }

  const resultado: Record<string, unknown> = {};
  try { if (solo !== "recordatorios") resultado.respaldo = await respaldar(db); }
  catch (e) { resultado.respaldo = { error: (e as Error).message }; }
  try { if (solo !== "respaldo") resultado.recordatorios = await recordar(db); }
  catch (e) { resultado.recordatorios = { error: (e as Error).message }; }
  return json(resultado);
});
