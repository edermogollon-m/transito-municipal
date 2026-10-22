// Pago en línea con Mercado Pago (Checkout Pro).
//
//   POST { accion: "crear", infraccion_id, placa }  → { url }   (portal ciudadano)
//   POST ?accion=webhook   (notificación de Mercado Pago)
//
// El monto lo calcula la base (monto_a_pagar: tramos de descuento del art. 330).
// Al recibir la notificación se consulta el pago en la API de Mercado Pago y,
// si está aprobado, se asienta con registrar_pago_en_linea (idempotente).
// Secretos: MP_ACCESS_TOKEN y, opcional, MP_WEBHOOK_SECRET (firma x-signature).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MP = "https://api.mercadopago.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const norm = (s: unknown) => String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function firmaValida(req: Request, dataId: string) {
  const secreto = Deno.env.get("MP_WEBHOOK_SECRET");
  if (!secreto) return true;   // sin secreto configurado se confía en la consulta a la API
  const firma = req.headers.get("x-signature") || "";
  const ts = /ts=([^,]+)/.exec(firma)?.[1], v1 = /v1=([^,]+)/.exec(firma)?.[1];
  if (!ts || !v1) return false;
  const manifiesto = `id:${dataId.toLowerCase()};request-id:${req.headers.get("x-request-id") || ""};ts:${ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifiesto)));
  return [...mac].map((b) => b.toString(16).padStart(2, "0")).join("") === v1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = Deno.env.get("MP_ACCESS_TOKEN");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));

  // ── Notificación de Mercado Pago ──
  if (url.searchParams.get("accion") === "webhook") {
    const tipo = body?.type || url.searchParams.get("type") || url.searchParams.get("topic");
    const dataId = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
    if (tipo !== "payment" || !dataId) return json({ ignorado: true });
    if (!token) return json({ error: "Falta MP_ACCESS_TOKEN" }, 500);
    if (!(await firmaValida(req, dataId))) return json({ error: "Firma inválida" }, 401);
    const r = await fetch(`${MP}/v1/payments/${encodeURIComponent(dataId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return json({ error: `Mercado Pago ${r.status}` }, 502);
    const pago = await r.json();
    if (pago.status !== "approved" || pago.currency_id !== "MXN") return json({ estado: pago.status });
    const infraccionId = Number(pago.external_reference);
    if (!infraccionId) return json({ error: "Pago sin referencia de infracción" }, 400);
    const { error } = await admin.rpc("registrar_pago_en_linea", {
      p_infraccion_id: infraccionId, p_referencia: `MP-${pago.id}`, p_monto: Number(pago.transaction_amount),
    });
    if (error) return json({ error: error.message }, 409);
    return json({ ok: true });
  }

  // ── Crear el cobro desde el portal ciudadano ──
  if (body?.accion !== "crear") return json({ error: "Acción no válida" }, 400);
  const { data: cfg } = await admin.from("configuracion").select("pago_en_linea,municipio,app_url").eq("id", 1).single();
  if (!cfg?.pago_en_linea || !token) return json({ error: "El pago en línea no está disponible por ahora" }, 503);

  const id = Number(body.infraccion_id);
  const { data: m } = await admin.rpc("monto_a_pagar", { p_infraccion_id: id }).single();
  // deno-lint-ignore no-explicit-any
  const cobro = m as any;
  if (!cobro || norm(cobro.placa) !== norm(body.placa)) return json({ error: "Infracción no encontrada" }, 404);
  if (!["pendiente", "vencida"].includes(cobro.estado)) return json({ error: `La infracción ${cobro.folio} está ${cobro.estado}` }, 409);
  const { count } = await admin.from("pagos").select("id", { count: "exact", head: true }).eq("infraccion_id", id);
  if (count) return json({ error: `La infracción ${cobro.folio} ya está pagada` }, 409);

  const base = String(cfg.app_url || "").replace(/\/$/, "");
  const regreso = (estado: string) => `${base}/consulta?q=${encodeURIComponent(cobro.placa)}&pago=${estado}`;
  const vence = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const r = await fetch(`${MP}/checkout/preferences`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{
        id: cobro.folio, title: `Infracción de tránsito ${cobro.folio}`,
        description: cobro.descuento_pct > 0 ? `Incluye ${cobro.descuento_pct}% de descuento por pronto pago` : "Multa de tránsito",
        quantity: 1, currency_id: "MXN", unit_price: Number(cobro.monto_final),
      }],
      external_reference: String(id),
      statement_descriptor: `TRANSITO ${String(cfg.municipio || "").toUpperCase()}`.slice(0, 22),
      notification_url: `${SUPABASE_URL}/functions/v1/pago-mp?accion=webhook`,
      back_urls: { success: regreso("ok"), pending: regreso("pendiente"), failure: regreso("error") },
      auto_return: "approved",
      expires: true, expiration_date_to: vence,
    }),
  });
  if (!r.ok) return json({ error: `Mercado Pago respondió ${r.status}` }, 502);
  const pref = await r.json();
  return json({ url: pref.init_point, monto: cobro.monto_final, descuento_pct: cobro.descuento_pct });
});
