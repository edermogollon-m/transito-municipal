-- ═══════════════════════════════════════════════════════════════════
-- Verificación pública de boletas y recibos (QR)
--
-- Cada infracción y cada pago tienen un token aleatorio imposible de
-- adivinar. El QR impreso apunta a /verificar?t=<token>; cualquiera puede
-- abrirlo sin iniciar sesión y ver si el documento es auténtico y su estado
-- actual (p. ej. que una boleta "pendiente" ya fue pagada, o que un recibo
-- no existe). Se muestra solo lo que ya trae el papel, con el nombre
-- abreviado. No se usa el id ni el folio (serían adivinables).
-- Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.infracciones add column if not exists token_verificacion uuid not null default gen_random_uuid();
alter table public.pagos        add column if not exists token_verificacion uuid not null default gen_random_uuid();
create unique index if not exists infracciones_token_idx on public.infracciones (token_verificacion);
create unique index if not exists pagos_token_idx on public.pagos (token_verificacion);

-- "Roberto Gómez López" → "Roberto G. L."
create or replace function public.nombre_abreviado(p text) returns text
language sql immutable set search_path = public as $$
  select case when coalesce(trim(p), '') = '' then '' else
    split_part(trim(p), ' ', 1) || coalesce(' ' || nullif(
      (select string_agg(left(w, 1) || '.', ' ')
       from unnest((string_to_array(regexp_replace(trim(p), '\s+', ' ', 'g'), ' '))[2:]) w), ''), '')
  end
$$;

create or replace function public.verificar_documento(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object(
       'tipo', 'infraccion', 'folio', i.folio, 'fecha', i.fecha, 'placa', i.placa,
       'concepto', i.tipo, 'monto', i.monto, 'estado', i.estado,
       'infractor', nombre_abreviado(i.infractor),
       'municipio', (select municipio from configuracion where id = 1))
     from infracciones i where i.token_verificacion = p_token),
    (select jsonb_build_object(
       'tipo', 'pago', 'folio', 'REC-' || lpad(p.id::text, 6, '0'), 'fecha', p.created_at,
       'folio_infraccion', p.folio_inf, 'placa', i.placa, 'concepto', i.tipo,
       'monto', p.monto_final, 'monto_original', p.monto_original, 'metodo', p.metodo,
       'estado', 'pagado', 'infractor', nombre_abreviado(i.infractor),
       'municipio', (select municipio from configuracion where id = 1))
     from pagos p left join infracciones i on i.id = p.infraccion_id
     where p.token_verificacion = p_token)
  )
$$;
grant execute on function public.verificar_documento(uuid) to anon, authenticated;
