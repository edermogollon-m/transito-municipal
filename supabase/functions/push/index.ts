// Avisos al celular del ciudadano (ciudadano.sql): multa nueva a una placa
// registrada, último día de descuento y avisos viales.
//
// La llama pg_cron cada 15 minutos (encabezado x-cron-secret, validado contra
// Vault 'push_cron'). Llaves VAPID: la pública en configuracion.push_publica
// y la privada en Vault 'vapid_privada' (o los secretos VAPID_PUBLICA y
// VAPID_PRIVADA). Opcional: VAPID_CONTACTO ("mailto:transito@municipio.gob.mx").
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const secreto = req.headers.get("x-cron-secret");
  const ok = !!secreto && (await admin.rpc("es_secreto", { p_nombre: "push_cron", p_secreto: secreto })).data === true;
  if (!ok) return json({ error: "No autorizado" }, 401);

  const publica = Deno.env.get("VAPID_PUBLICA") || (await admin.rpc("push_config")).data?.publica;
  const privada = Deno.env.get("VAPID_PRIVADA") || (await admin.rpc("llave_push_privada")).data;
  if (!publica || !privada) return json({ error: "Faltan las llaves VAPID" }, 500);
  webpush.setVapidDetails(Deno.env.get("VAPID_CONTACTO") || "mailto:transito@example.com", publica, privada);

  const { data: avisos, error } = await admin.rpc("tomar_push", { p_limite: 200 });
  if (error) return json({ error: error.message }, 500);

  const resultado = { enviados: 0, errores: 0, desactivados: 0 };
  for (const a of avisos || []) {
    try {
      await webpush.sendNotification(
        { endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } },
        JSON.stringify({ titulo: a.titulo, cuerpo: a.cuerpo, url: a.url, tag: `${a.tipo}-${a.ref}` }),
        { TTL: 60 * 60 * 24 },
      );
      resultado.enviados++;
    } catch (e) {
      // deno-lint-ignore no-explicit-any
      const status = (e as any)?.statusCode;
      if (status === 404 || status === 410) {   // el celular ya no tiene la suscripción
        await admin.rpc("desactivar_push", { p_endpoint: a.endpoint });
        resultado.desactivados++;
      } else {
        resultado.errores++;
        console.error("push:", status, String((e as Error)?.message || e).slice(0, 200));
      }
    }
  }
  return json(resultado);
});
