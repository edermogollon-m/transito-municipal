// Envía los avisos al ciudadano que arma programar_avisos() (tramites.sql):
// al levantar la multa, un día antes de que venza cada descuento y al vencer.
//
// La llama pg_cron cada 15 minutos (encabezado x-cron-secret, validado contra
// Vault con es_secreto). Canales:
//   * Correo (Resend): RESEND_API_KEY y, opcional, AVISOS_REMITENTE
//     ("Tránsito Misantla <avisos@dominio>").
//   * WhatsApp Cloud API (Meta): WHATSAPP_TOKEN, WHATSAPP_PHONE_ID y
//     WHATSAPP_PLANTILLA (plantilla aprobada con 4 variables de texto en el
//     cuerpo: {{1}} nombre, {{2}} folio, {{3}} mensaje, {{4}} enlace) y,
//     opcional, WHATSAPP_IDIOMA (es_MX).
// Si falta la configuración de un canal, sus avisos se quedan en la cola.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const mxn = (n: unknown) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n) || 0);
const fecha = (d: string) =>
  new Date(d + (d.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });

type Envio = { ok?: boolean; error?: string; esperar?: boolean };

// deno-lint-ignore no-explicit-any
function mensaje(a: any) {
  const monto = a.descuento_pct ? mxn(Math.round(a.monto * (1 - a.descuento_pct / 100))) : mxn(a.monto);
  switch (a.tipo) {
    case "emision":
      return { asunto: `Infracción de tránsito ${a.folio}`,
        texto: `Se levantó la infracción ${a.folio} a la placa ${a.placa} (${a.tipo_infraccion}) por ${mxn(a.monto)}. Paga pronto y obtén descuento.` };
    case "descuento1": case "descuento2":
      return { asunto: `Último día de descuento · ${a.folio}`,
        texto: `Tu descuento del ${a.descuento_pct}% en la infracción ${a.folio} vence el ${fecha(a.fecha_limite_descuento)}. Paga hoy solo ${monto}.` };
    default:
      return { asunto: `Infracción vencida · ${a.folio}`,
        texto: `La infracción ${a.folio} a la placa ${a.placa} venció sin pago (${mxn(a.monto)}). Regulariza para evitar actualizaciones y recargos.` };
  }
}

// deno-lint-ignore no-explicit-any
async function enviarCorreo(a: any, m: { asunto: string; texto: string }, enlace: string, municipio: string): Promise<Envio> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { esperar: true };
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:26px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4B5563">Tránsito y Seguridad Vial · ${esc(municipio)}</div>
    <h1 style="font-size:20px;margin:6px 0 12px">${esc(m.asunto)}</h1>
    <p style="font-size:14px;line-height:1.55">Hola ${esc(a.infractor)}:</p>
    <p style="font-size:14px;line-height:1.55">${esc(m.texto)}</p>
    ${a.fundamento ? `<p style="font-size:12px;color:#4B5563">Fundamento: ${esc(a.fundamento)}</p>` : ""}
    <p style="margin:22px 0"><a href="${esc(enlace)}" style="display:inline-block;background:#1A7A82;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Ver la infracción y pagar</a></p>
    <p style="font-size:11px;color:#6B7280">Aviso automático. Si ya pagaste, ignora este mensaje.</p>
  </div></body></html>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("AVISOS_REMITENTE") || "Tránsito Municipal <onboarding@resend.dev>",
      to: [a.destino], subject: m.asunto, html,
    }),
  });
  return res.ok ? { ok: true } : { error: `Resend ${res.status}: ${(await res.text()).slice(0, 300)}` };
}

// deno-lint-ignore no-explicit-any
async function enviarWhatsApp(a: any, m: { asunto: string; texto: string }, enlace: string): Promise<Envio> {
  const token = Deno.env.get("WHATSAPP_TOKEN"), phone = Deno.env.get("WHATSAPP_PHONE_ID"), plantilla = Deno.env.get("WHATSAPP_PLANTILLA");
  if (!token || !phone || !plantilla) return { esperar: true };
  const texto = (s: string) => ({ type: "text", text: String(s).slice(0, 900) });
  const res = await fetch(`https://graph.facebook.com/v21.0/${phone}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: a.destino, type: "template",
      template: {
        name: plantilla, language: { code: Deno.env.get("WHATSAPP_IDIOMA") || "es_MX" },
        components: [{ type: "body", parameters: [texto(a.infractor || "ciudadano"), texto(a.folio), texto(m.texto), texto(enlace)] }],
      },
    }),
  });
  return res.ok ? { ok: true } : { error: `WhatsApp ${res.status}: ${(await res.text()).slice(0, 300)}` };
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const secreto = req.headers.get("x-cron-secret");
  const ok = !!secreto && (await admin.rpc("es_secreto", { p_nombre: "avisos_cron", p_secreto: secreto })).data === true;
  if (!ok) return json({ error: "No autorizado" }, 401);

  const [{ data: avisos, error }, { data: cfg }] = await Promise.all([
    admin.rpc("avisos_por_enviar", { p_limite: 50 }),
    admin.from("configuracion").select("municipio,app_url").eq("id", 1).single(),
  ]);
  if (error) return json({ error: error.message }, 500);
  const base = String(cfg?.app_url || "").replace(/\/$/, "");

  const resultado = { enviados: 0, errores: 0, en_espera: 0 };
  for (const a of avisos || []) {
    const m = mensaje(a);
    const enlace = `${base}/consulta?q=${encodeURIComponent(a.placa)}`;
    const r = a.canal === "correo" ? await enviarCorreo(a, m, enlace, cfg?.municipio || "") : await enviarWhatsApp(a, m, enlace);
    if (r.esperar) { resultado.en_espera++; continue; }          // canal sin configurar: se queda en la cola
    await admin.rpc("marcar_aviso", { p_id: a.id, p_ok: !!r.ok, p_error: r.error || "" });
    if (r.ok) resultado.enviados++; else resultado.errores++;
  }
  return json(resultado);
});
