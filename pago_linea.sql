-- ═══════════════════════════════════════════════════════════════════
-- Pago en línea: confirmación al regresar de Mercado Pago
--
--   * pago_en_linea_estado(): el portal pregunta si la infracción ya quedó
--     pagada (Mercado Pago avisa a la función pago-mp en segundos) y, si se
--     pagó en línea, recibe el enlace del recibo digital (/verificar?t=…).
--     Igual que consulta_ciudadana, pide la placa o el folio de esa misma
--     infracción.
--
-- Correr después de ciudadano.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.pago_en_linea_estado(p_id bigint, p_q text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'estado', i.estado,
    'folio', i.folio,
    'pagado', p.id is not null,
    'monto', p.monto_final,
    'fecha', p.created_at,
    'token', case when p.metodo = 'en_linea' then p.token_verificacion end)
  from public.infracciones i
  left join lateral (select * from public.pagos where infraccion_id = i.id order by id desc limit 1) p on true
  where i.id = p_id
    and length(regexp_replace(upper(coalesce(p_q, '')), '[^A-Z0-9]', '', 'g')) >= 3
    and (regexp_replace(upper(i.placa), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_q), '[^A-Z0-9]', '', 'g')
      or regexp_replace(upper(i.folio), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_q), '[^A-Z0-9]', '', 'g'))
$$;
grant execute on function public.pago_en_linea_estado(bigint, text) to anon, authenticated;
