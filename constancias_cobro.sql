-- ═══════════════════════════════════════════════════════════════════
-- Constancia de no adeudo con costo
--
--   * La constancia de no adeudo (mejoras2.sql) ya no es gratuita: tiene el
--     costo de configuracion.constancia_costo y se expide solo cuando está
--     pagada.
--   * En línea: el portal pide el cobro (solicitar_constancia), la función
--     pago-mp crea el pago en Mercado Pago y, cuando se acredita, asienta el
--     pago y expide la constancia (registrar_pago_constancia, solo la llave
--     de servicio). El ciudadano la descarga con el enlace de su cobro
--     (constancia_de_cobro).
--   * En ventanilla: Caja o el Director la cobran y la imprimen
--     (cobrar_constancia_caja). Entra en su corte de caja.
--
-- Correr después de mejoras2.sql, controles.sql y privacidad.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.configuracion add column if not exists constancia_costo numeric not null default 150;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'configuracion_constancia_costo_check') then
    alter table public.configuracion add constraint configuracion_constancia_costo_check check (constancia_costo > 0);
  end if;
end $$;

create table if not exists public.cobros_constancia (
  id            bigserial primary key,
  placa         text not null,                                   -- normalizada: solo letras y números
  token         uuid not null unique default gen_random_uuid(),  -- con él el ciudadano recupera su constancia
  monto         numeric not null check (monto > 0),
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'pagada')),
  metodo        text not null default '' check (metodo in ('', 'en_linea', 'efectivo', 'tarjeta', 'transferencia')),
  referencia    text unique,                                     -- MP-<id> de Mercado Pago
  cajero        text not null default '',
  constancia_id bigint references public.constancias(id),
  notas         text not null default '',
  created_at    timestamptz not null default now(),
  pagada_at     timestamptz
);
alter table public.cobros_constancia enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cobros_constancia' and policyname = 'control_select') then
    create policy control_select on public.cobros_constancia for select to authenticated
      using (public.tiene_rol('admin','supervisor','cajero','contraloria'));
  end if;
end $$;
grant select on public.cobros_constancia to authenticated;
create index if not exists cobros_constancia_pagada_idx on public.cobros_constancia (cajero, pagada_at) where estado = 'pagada';

-- ── Expedición (solo la llaman las funciones de abajo) ──
create or replace function public.expedir_constancia(p_norm text)
returns public.constancias
language plpgsql volatile security definer set search_path = public as $$
declare
  abc constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_c public.constancias%rowtype;
  b bytea;
  cod text;
begin
  if exists (select 1 from public.infracciones
             where regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g') = p_norm
               and estado in ('pendiente', 'vencida', 'impugnada')) then
    raise exception 'La placa tiene infracciones pendientes o en revisión: no se puede expedir la constancia';
  end if;
  loop
    b := extensions.gen_random_bytes(6); cod := '';
    for i in 0..5 loop cod := cod || substr(abc, (get_byte(b, i) % length(abc)) + 1, 1); end loop;
    exit when not exists (select 1 from public.constancias where folio = 'CND-' || to_char(now() at time zone 'America/Mexico_City', 'YY') || '-' || cod);
  end loop;
  insert into public.constancias (folio, placa, vigente_hasta)
  values ('CND-' || to_char(now() at time zone 'America/Mexico_City', 'YY') || '-' || cod, p_norm,
          (now() at time zone 'America/Mexico_City')::date + 30)
  returning * into v_c;
  return v_c;
end $$;
revoke all on function public.expedir_constancia(text) from public, anon, authenticated;

-- Datos para imprimir la constancia (portal y Caja)
create or replace function public.datos_constancia(p_id bigint)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('folio', c.folio, 'token', c.token, 'emitida', c.created_at, 'vigente_hasta', c.vigente_hasta,
    'placa', coalesce((select i.placa from public.infracciones i
                        where regexp_replace(upper(i.placa), '[^A-Z0-9]', '', 'g') = c.placa order by i.fecha desc limit 1), c.placa),
    'municipio', g.municipio, 'estado', g.estado, 'director', g.director)
  from public.constancias c cross join (select * from public.configuracion where id = 1) g
  where c.id = p_id
$$;
revoke all on function public.datos_constancia(bigint) from public, anon, authenticated;

-- La gratuita ya no existe: quien tenga la app vieja abierta recibe el aviso
create or replace function public.emitir_constancia(p_placa text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  raise exception 'La constancia de no adeudo tiene un costo de $%. Págala en línea desde la consulta o en Caja.',
    (select constancia_costo from public.configuracion where id = 1);
end $$;

-- ── Portal: pedir el cobro ──
create or replace function public.solicitar_constancia(p_placa text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_norm text := regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g');
  v_cobro public.cobros_constancia%rowtype;
begin
  if length(v_norm) < 4 or length(v_norm) > 12 then raise exception 'Escribe la placa completa'; end if;
  if exists (select 1 from public.infracciones
             where regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g') = v_norm
               and estado in ('pendiente', 'vencida', 'impugnada')) then
    raise exception 'La placa tiene infracciones pendientes o en revisión: no se puede expedir la constancia';
  end if;
  if (select count(*) from public.cobros_constancia where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Demasiadas solicitudes. Intenta de nuevo en unos minutos';
  end if;
  -- Se reusa el cobro sin pagar de la misma placa del día (si recarga la página)
  select * into v_cobro from public.cobros_constancia
   where placa = v_norm and estado = 'pendiente' and created_at > now() - interval '1 day'
     and monto = (select constancia_costo from public.configuracion where id = 1)
   order by id desc limit 1;
  if not found then
    insert into public.cobros_constancia (placa, monto)
    values (v_norm, (select constancia_costo from public.configuracion where id = 1))
    returning * into v_cobro;
  end if;
  return jsonb_build_object('token', v_cobro.token, 'monto', v_cobro.monto, 'placa', v_norm);
end $$;
grant execute on function public.solicitar_constancia(text) to anon, authenticated;

-- ── Portal: ¿ya se pagó? Si sí, la constancia ──
create or replace function public.constancia_de_cobro(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when c.constancia_id is not null then public.datos_constancia(c.constancia_id)
        || jsonb_build_object('pagada', true, 'monto', c.monto, 'metodo', c.metodo)
    else jsonb_build_object('pagada', c.estado = 'pagada', 'monto', c.monto, 'placa', c.placa, 'nota', c.notas)
  end
  from public.cobros_constancia c where c.token = p_token
$$;
grant execute on function public.constancia_de_cobro(uuid) to anon, authenticated;

-- ── Mercado Pago avisó que se acreditó (solo la llave de servicio) ──
create or replace function public.registrar_pago_constancia(p_token uuid, p_referencia text, p_monto numeric)
returns public.cobros_constancia
language plpgsql security definer set search_path = public as $$
declare
  v_cobro public.cobros_constancia%rowtype;
  v_c public.constancias%rowtype;
begin
  select * into v_cobro from public.cobros_constancia where token = p_token for update;
  if not found then raise exception 'Cobro de constancia no encontrado'; end if;
  if v_cobro.estado = 'pagada' then return v_cobro; end if;   -- Mercado Pago avisa más de una vez
  if p_monto < v_cobro.monto then
    raise exception 'El pago (%) no cubre el costo de la constancia (%)', p_monto, v_cobro.monto;
  end if;
  begin
    v_c := public.expedir_constancia(v_cobro.placa);
  exception when others then
    -- Entre la solicitud y el pago apareció una infracción: el pago queda
    -- registrado para que la oficina lo resuelva (reembolso o constancia después)
    update public.cobros_constancia set estado = 'pagada', metodo = 'en_linea', referencia = p_referencia,
      cajero = 'Pago en línea (Mercado Pago)', pagada_at = now(), notas = sqlerrm
     where id = v_cobro.id returning * into v_cobro;
    return v_cobro;
  end;
  update public.cobros_constancia set estado = 'pagada', metodo = 'en_linea', referencia = p_referencia,
    cajero = 'Pago en línea (Mercado Pago)', pagada_at = now(), constancia_id = v_c.id
   where id = v_cobro.id returning * into v_cobro;
  return v_cobro;
end $$;
revoke all on function public.registrar_pago_constancia(uuid, text, numeric) from public, anon, authenticated;

-- ── Ventanilla: Caja o el Director la cobran e imprimen ──
create or replace function public.cobrar_constancia_caja(p_placa text, p_metodo text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_norm text := regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g');
  v_cajero text;
  v_c public.constancias%rowtype;
  v_cobro public.cobros_constancia%rowtype;
begin
  select nombre into v_cajero from public.usuarios where auth_id = auth.uid() and activo and rol in ('admin', 'cajero');
  if v_cajero is null then raise exception 'Solo Caja (cajero) o el Director cobran constancias'; end if;
  if p_metodo not in ('efectivo', 'tarjeta', 'transferencia') then raise exception 'Método de pago inválido'; end if;
  if length(v_norm) < 4 or length(v_norm) > 12 then raise exception 'Escribe la placa completa'; end if;
  v_c := public.expedir_constancia(v_norm);
  insert into public.cobros_constancia (placa, monto, estado, metodo, cajero, constancia_id, pagada_at)
  values (v_norm, (select constancia_costo from public.configuracion where id = 1), 'pagada', p_metodo, v_cajero, v_c.id, now())
  returning * into v_cobro;
  return public.datos_constancia(v_c.id) || jsonb_build_object('monto', v_cobro.monto, 'metodo', p_metodo, 'cajero', v_cajero);
end $$;
revoke all on function public.cobrar_constancia_caja(text, text) from public, anon;
grant execute on function public.cobrar_constancia_caja(text, text) to authenticated;

-- controles.sql + lo cobrado en constancias entra al corte de caja
create or replace function public.resumen_corte()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  v_cajero text;
  v_desde timestamptz;
begin
  select nombre into v_cajero from public.usuarios where auth_id = auth.uid() and activo and rol in ('admin','cajero');
  if v_cajero is null then raise exception 'Solo Caja (cajero) o el Director hacen cortes de caja'; end if;
  v_desde := coalesce((select max(hasta) from public.cortes_caja where cajero = v_cajero),
                      date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City');
  return (
    select jsonb_build_object(
      'cajero', v_cajero, 'desde', v_desde, 'hasta', now(),
      'num_pagos', count(*),
      'num_constancias', count(*) filter (where constancia),
      'total', coalesce(sum(monto), 0),
      'efectivo', coalesce(sum(monto) filter (where metodo = 'efectivo'), 0),
      'tarjeta', coalesce(sum(monto) filter (where metodo = 'tarjeta'), 0),
      'transferencia', coalesce(sum(monto) filter (where metodo = 'transferencia'), 0))
    from (
      select monto_final as monto, metodo, false as constancia from public.pagos
       where cajero = v_cajero and created_at > v_desde and created_at <= now()
      union all
      select monto, metodo, true from public.cobros_constancia
       where estado = 'pagada' and cajero = v_cajero and pagada_at > v_desde and pagada_at <= now()
    ) t);
end $$;

-- privacidad.sql + costo de la constancia
create or replace function public.portal_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('municipio', coalesce(municipio,''), 'estado', coalesce(estado,''),
    'correo', coalesce(correo,''), 'leyenda_recurso', coalesce(leyenda_recurso,''),
    'pago_banco', coalesce(pago_banco,''), 'pago_clabe', coalesce(pago_clabe,''),
    'pago_beneficiario', coalesce(pago_beneficiario,''),
    'institucion', institucion, 'escudo', escudo, 'logo', logo, 'color', color_institucional,
    'domicilio_transito', domicilio_transito, 'ut_domicilio', ut_domicilio,
    'ut_telefono', ut_telefono, 'ut_correo', ut_correo,
    'privacidad_actualizado', privacidad_actualizado,
    'constancia_costo', constancia_costo)
  from public.configuracion where id = 1
$$;
grant execute on function public.portal_info() to anon, authenticated;
