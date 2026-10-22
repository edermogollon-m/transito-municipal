// Recibo de pago digital por correo (ciudadano.sql: datos_recibo).
// La llama Caja al cobrar, con su propia sesión: datos_recibo() revisa que
// sea cajero o admin. Correo con Resend: RESEND_API_KEY y, opcional,
// AVISOS_REMITENTE ("Tránsito Misantla <avisos@dominio>").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const mxn = (n: unknown) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 }).format(Number(n) || 0);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const { pago_id, correo } = await req.json().catch(() => ({}));
  if (!Number.isInteger(pago_id)) return json({ error: "Falta el pago" }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(correo || ""))) return json({ error: "Correo no válido" }, 400);
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return json({ error: "El envío de correos no está configurado" }, 503);

  const usuario = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: r, error } = await usuario.rpc("datos_recibo", { p_pago_id: pago_id });
  if (error || !r) return json({ error: error?.message || "Pago no encontrado" }, 403);

  const base = String(r.app_url || "").replace(/\/$/, "");
  const enlace = `${base}/verificar?t=${r.token}`;
  const fecha = new Date(r.fecha).toLocaleString("es-MX", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });
  const fila = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#6B7280;font-size:13px">${k}</td><td style="padding:6px 0;text-align:right;font-size:13px">${v}</td></tr>`;
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#F3F4F6;font-family:Arial,Helvetica,sans-serif;color:#111827">
  <div style="max-width:560px;margin:0 auto;background:#fff;padding:26px">
    <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#4B5563">${esc(r.institucion || "Tránsito y Seguridad Vial")} · ${esc(r.municipio || "")}</div>
    <h1 style="font-size:20px;margin:6px 0 4px">Recibo de pago ${esc(r.recibo)}</h1>
    <p style="font-size:14px;line-height:1.55;margin:0 0 16px">Hola ${esc(r.infractor || "")}, gracias por tu pago. Este es tu recibo digital.</p>
    <div style="font-size:30px;font-weight:700;margin:6px 0 14px">${mxn(r.monto)}</div>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #E5E7EB">
      ${fila("Infracción", esc(r.folio || "—"))}${fila("Placa", esc(r.placa || "—"))}${fila("Concepto", esc(r.concepto || "—"))}
      ${Number(r.descuento_pct) > 0 ? fila("Monto original", mxn(r.monto_original)) + fila("Descuento", `${esc(r.descuento_pct)}%`) : ""}
      ${fila("Forma de pago", esc(r.metodo || "—"))}${fila("Fecha", esc(fecha))}
    </table>
    ${base ? `<p style="margin:22px 0"><a href="${esc(enlace)}" style="display:inline-block;background:#1A7A82;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:600">Ver y verificar mi recibo</a></p>` : ""}
    <p style="font-size:11px;color:#6B7280">El enlace confirma que el recibo es auténtico. Consérvalo como comprobante.</p>
  </div></body></html>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("AVISOS_REMITENTE") || "Tránsito Municipal <onboarding@resend.dev>",
      to: [correo], subject: `Recibo de pago ${r.recibo} · ${r.placa || ""}`, html,
    }),
  });
  if (!res.ok) return json({ error: `No se pudo enviar (${res.status})`, detalle: (await res.text()).slice(0, 300) }, 502);
  return json({ ok: true });
});
