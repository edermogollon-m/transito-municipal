// Envía por correo el reporte mensual de Tránsito (reporte_mensual.sql).
//
// La llama pg_cron el día 1 de cada mes (encabezado x-cron-secret) o el
// director desde Reportes → "Enviar por correo ahora" (con su sesión).
// La clave de pg_cron se valida contra Vault (es_secreto_cron).
// Secretos de la función: RESEND_API_KEY y, opcionales,
// REPORTE_REMITENTE ("Tránsito <reportes@dominio>") y APP_URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
const nombreMes = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
};
const variacion = (act: number, prev: number) => {
  if (!prev) return "";
  const p = Math.round(((act - prev) / prev) * 100);
  return p === 0 ? " (igual que el mes anterior)" : ` (${p > 0 ? "+" : ""}${p}% vs. mes anterior)`;
};

// deno-lint-ignore no-explicit-any
function htmlReporte(r: any, appUrl: string) {
  const fila = (a: string, b: string) =>
    `<tr><td style="padding:6px 0;color:#4B5563">${a}</td><td style="padding:6px 0;text-align:right;font-weight:600">${b}</td></tr>`;
  const tabla = (titulo: string, cab: string[], filas: string[][]) => filas.length ? `
    <h3 style="font-size:15px;margin:24px 0 8px">${titulo}</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr>${cab.map((c, i) => `<th style="text-align:${i ? "right" : "left"};border-bottom:1px solid #111;padding:6px 0">${c}</th>`).join("")}</tr>
      ${filas.map((f) => `<tr>${f.map((c, i) => `<td style="text-align:${i ? "right" : "left"};border-bottom:1px solid #E5E7EB;padding:6px 0">${c}</td>`).join("")}</tr>`).join("")}
    </table>` : "";
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="max-width:620px;margin:0 auto;background:#fff;padding:28px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4B5563">Tránsito y Movilidad · ${esc(r.municipio)}</div>
    <h1 style="font-size:22px;margin:6px 0 4px">Reporte de ${esc(nombreMes(r.mes))}</h1>
    <p style="margin:0 0 18px;color:#4B5563;font-size:13px">Resumen automático del sistema de Tránsito Municipal.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      ${fila("Infracciones levantadas", `${r.infracciones}${esc(variacion(r.infracciones, r.infracciones_prev))}`)}
      ${fila("Monto de las infracciones del mes", mxn(r.infracciones_monto))}
      ${fila("Recaudación (pagos cobrados)", `${mxn(r.recaudacion)}${esc(variacion(r.recaudacion, r.recaudacion_prev))}`)}
      ${fila("Pagos registrados", String(r.pagos))}
      ${fila("Descuentos por pronto pago", mxn(r.descuentos))}
      ${fila("Pendientes de cobro (acumulado)", `${r.pendientes_total} · ${mxn(r.pendientes_monto)}`)}
      ${fila("Vehículos ingresados al corralón", `${r.grua_ingresos} (liberados: ${r.grua_liberados})`)}
      ${fila("Accidentes registrados", `${r.accidentes} (lesionados: ${r.lesionados}, fallecidos: ${r.fallecidos})`)}
    </table>
    ${tabla("Motivos más frecuentes", ["Motivo", "Boletas", "Monto"], (r.por_tipo || []).map((t: any) => [esc(t.tipo), String(t.n), mxn(t.monto)]))}
    ${tabla("Por oficial", ["Oficial", "Boletas", "Monto"], (r.por_oficial || []).map((o: any) => [esc(o.oficial), String(o.n), mxn(o.monto)]))}
    ${tabla("Recaudación por forma de pago", ["Forma de pago", "Pagos", "Total"], (r.por_metodo || []).map((m: any) => [esc(m.metodo), String(m.pagos), mxn(m.total)]))}
    ${appUrl ? `<p style="margin:26px 0 0"><a href="${esc(appUrl)}/?reporte=${esc(r.mes)}" style="display:inline-block;background:#1A7A82;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Abrir el reporte completo en PDF</a></p>` : ""}
    <p style="margin:26px 0 0;font-size:11px;color:#6B7280">Correo automático del sistema de Tránsito Municipal. Para dejar de recibirlo, quita tu correo en Configuración.</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // ¿Quién llama? pg_cron con la clave secreta, o el director con su sesión
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const secreto = req.headers.get("x-cron-secret");
  const cronOk = !!secreto && (await admin.rpc("es_secreto_cron", { p_secreto: secreto })).data === true;
  if (!cronOk) {
    const auth = req.headers.get("Authorization") ?? "";
    const usuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: auth } } });
    const { data: rol } = await usuario.rpc("mi_rol");
    if (rol !== "admin") return json({ error: "Solo el director puede enviar el reporte" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const mes = typeof body?.mes === "string" && /^\d{4}-\d{2}$/.test(body.mes) ? `${body.mes}-01` : null;

  const [{ data: rep, error }, { data: cfg }] = await Promise.all([
    admin.rpc("reporte_mensual", { p_mes: mes }),
    admin.from("configuracion").select("correo_reporte,correo").eq("id", 1).single(),
  ]);
  if (error) return json({ error: error.message }, 500);

  const destinos = String(cfg?.correo_reporte || "").split(/[,;\s]+/).filter((c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c));
  if (!destinos.length) return json({ error: "No hay correo configurado para el reporte (Configuración)" }, 400);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "Falta configurar el servicio de correo (RESEND_API_KEY)" }, 500);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("REPORTE_REMITENTE") || "Tránsito Municipal <onboarding@resend.dev>",
      to: destinos,
      reply_to: cfg?.correo || undefined,
      subject: `Reporte de Tránsito · ${nombreMes(rep.mes)}`,
      html: htmlReporte(rep, (Deno.env.get("APP_URL") || "").replace(/\/$/, "")),
    }),
  });
  if (!res.ok) return json({ error: `El servicio de correo respondió: ${await res.text()}` }, 502);
  return json({ ok: true, mes: rep.mes, enviado_a: destinos });
});
