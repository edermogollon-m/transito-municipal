-- ═══════════════════════════════════════════════════════════════════
-- Avisos de permisos, Caja sin conexión y constancia
-- de no adeudo
--
--   * permisos.correo + avisos_permisos: tareas-diarias avisa al titular
--     15 días antes del vencimiento (una vez por vencimiento).
--   * registrar_pago_diferido(): registra un cobro que Caja hizo sin
--     internet, con el descuento que tocaba a la hora real del cobro (hasta
--     7 días atrás). El token del dispositivo evita registrarlo dos veces.
--   * constancias + emitir_constancia(): la consulta ciudadana expide una
--     constancia de no adeudo con QR verificable cuando la placa no tiene
--     infracciones pendientes, vencidas ni en revisión.
--
-- Correr después de tramites.sql (las firmas de la boleta están ahí). Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ── Avisos de vencimiento de permisos ─────────────────────
alter table public.permisos add column if not exists correo text not null default '';
create table if not exists public.avisos_permisos (
  permiso_id  bigint not null references public.permisos(id),
  vencimiento date not null,
  correo      text not null default '',
  enviado_at  timestamptz not null default now(),
  primary key (permiso_id, vencimiento)
);
alter table public.avisos_permisos enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_permisos' and policyname = 'mando_select') then
    create policy mando_select on public.avisos_permisos for select to authenticated
      using (public.tiene_rol('admin','supervisor'));
  end if;
end $$;
grant select on public.avisos_permisos to authenticated;

-- ── Caja sin conexión ─────────────────────────────────────
create or replace function public.registrar_pago_diferido(
  p_infraccion_id bigint, p_aplicar_descuento boolean, p_metodo text, p_notas text,
  p_cobrado_at timestamptz, p_token uuid)
returns public.pagos
language plpgsql security definer set search_path = public as $$
declare
  v_inf public.infracciones%rowtype;
  v_cfg public.configuracion%rowtype;
  v_cajero text;
  v_desc numeric := 0;
  v_pago public.pagos%rowtype;
begin
  select nombre into v_cajero from public.usuarios where auth_id = auth.uid() and activo and rol in ('admin','cajero');
  if v_cajero is null then raise exception 'Solo Caja (cajero) o el Director pueden registrar cobros'; end if;
  if p_metodo not in ('efectivo','tarjeta','transferencia') then raise exception 'Método de pago inválido'; end if;
  if p_cobrado_at is null or p_cobrado_at > now() + interval '10 minutes' or p_cobrado_at < now() - interval '7 days' then
    raise exception 'La hora del cobro sin conexión no es válida (máximo 7 días atrás)';
  end if;

  -- Ya se había registrado (se cortó la respuesta): devolver el mismo pago
  select * into v_pago from public.pagos where token_verificacion = p_token;
  if found then return v_pago; end if;

  select * into v_inf from public.infracciones where id = p_infraccion_id for update;
  if not found then raise exception 'Infracción no encontrada'; end if;
  if v_inf.estado in ('pagada','cancelada') or exists (select 1 from public.pagos where infraccion_id = p_infraccion_id) then
    raise exception 'La infracción % ya está %: otra caja la cobró mientras no había conexión', v_inf.folio,
      case when v_inf.estado = 'cancelada' then 'cancelada' else 'pagada' end;
  end if;

  select * into v_cfg from public.configuracion where id = 1;
  if p_aplicar_descuento then
    if exists (select 1 from public.catalogo_infracciones where numero = v_inf.catalogo_numero and grave) then
      raise exception 'Esta infracción se paga íntegra, sin descuento (conducir en estado de ebriedad)';
    end if;
    if p_cobrado_at - v_inf.fecha <= make_interval(days => coalesce(v_cfg.dias_descuento, 5)) then
      v_desc := coalesce(v_cfg.descuento_pct, 0);
    elsif v_cfg.dias_descuento2 is not null and p_cobrado_at - v_inf.fecha <= make_interval(days => v_cfg.dias_descuento2) then
      v_desc := coalesce(v_cfg.descuento2_pct, 0);
    else
      raise exception 'El periodo de descuento ya había terminado a la hora del cobro';
    end if;
  end if;

  insert into public.pagos (infraccion_id, folio_inf, monto_original, descuento_pct, monto_final, metodo, cajero, notas, token_verificacion)
  values (v_inf.id, v_inf.folio, v_inf.monto, v_desc, round(v_inf.monto * (1 - v_desc / 100.0)), p_metodo, v_cajero,
          coalesce(p_notas, ''), p_token)
  returning * into v_pago;

  update public.infracciones set estado = 'pagada' where id = v_inf.id;
  return v_pago;
end $$;
grant execute on function public.registrar_pago_diferido(bigint, boolean, text, text, timestamptz, uuid) to authenticated;

-- ── Constancia de no adeudo ───────────────────────────────
create table if not exists public.constancias (
  id            bigserial primary key,
  folio         text not null unique,
  placa         text not null,
  token         uuid not null unique default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  vigente_hasta date not null
);
alter table public.constancias enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'constancias' and policyname = 'control_select') then
    create policy control_select on public.constancias for select to authenticated
      using (public.tiene_rol('admin','supervisor','cajero','contraloria'));
  end if;
end $$;
grant select on public.constancias to authenticated;
create index if not exists constancias_placa_idx on public.constancias (placa, created_at desc);

create or replace function public.emitir_constancia(p_placa text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  abc constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_norm text := regexp_replace(upper(coalesce(p_placa, '')), '[^A-Z0-9]', '', 'g');
  v_placa text;
  v_c public.constancias%rowtype;
  b bytea;
  cod text;
begin
  if length(v_norm) < 4 or length(v_norm) > 12 then raise exception 'Escribe la placa completa'; end if;
  if exists (select 1 from public.infracciones
             where regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g') = v_norm
               and estado in ('pendiente', 'vencida', 'impugnada')) then
    raise exception 'La placa tiene infracciones pendientes o en revisión: no se puede expedir la constancia';
  end if;
  if (select count(*) from public.constancias where created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Demasiadas solicitudes. Intenta de nuevo en unos minutos';
  end if;

  -- Una por placa y día: se reimprime la misma
  select * into v_c from public.constancias
   where placa = v_norm and created_at >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City'
   order by created_at desc limit 1;
  if not found then
    loop
      b := extensions.gen_random_bytes(6); cod := '';
      for i in 0..5 loop cod := cod || substr(abc, (get_byte(b, i) % length(abc)) + 1, 1); end loop;
      exit when not exists (select 1 from public.constancias where folio = 'CND-' || to_char(now() at time zone 'America/Mexico_City', 'YY') || '-' || cod);
    end loop;
    insert into public.constancias (folio, placa, vigente_hasta)
    values ('CND-' || to_char(now() at time zone 'America/Mexico_City', 'YY') || '-' || cod, v_norm,
            (now() at time zone 'America/Mexico_City')::date + 30)
    returning * into v_c;
  end if;

  select placa into v_placa from public.infracciones
   where regexp_replace(upper(placa), '[^A-Z0-9]', '', 'g') = v_norm order by fecha desc limit 1;
  return jsonb_build_object('folio', v_c.folio, 'placa', coalesce(v_placa, v_norm), 'token', v_c.token,
    'emitida', v_c.created_at, 'vigente_hasta', v_c.vigente_hasta,
    'municipio', (select municipio from public.configuracion where id = 1),
    'estado', (select estado from public.configuracion where id = 1),
    'director', (select director from public.configuracion where id = 1));
end $$;
grant execute on function public.emitir_constancia(text) to anon, authenticated;

-- controles.sql + constancias
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
     where p.token_verificacion = p_token),
    (select jsonb_build_object(
       'tipo', 'pago', 'folio', 'REC-' || lpad(p.id::text, 6, '0'), 'fecha', p.created_at,
       'folio_infraccion', p.folio_inf, 'placa', i.placa, 'concepto', i.tipo,
       'monto', p.monto_final, 'monto_original', p.monto_original, 'metodo', p.metodo,
       'estado', 'anulado', 'infractor', nombre_abreviado(i.infractor),
       'municipio', (select municipio from configuracion where id = 1))
     from pagos_anulados p left join infracciones i on i.id = p.infraccion_id
     where p.token_verificacion = p_token),
    (select jsonb_build_object(
       'tipo', 'constancia', 'folio', c.folio, 'fecha', c.created_at, 'placa', c.placa,
       'vigente_hasta', c.vigente_hasta,
       'estado', case when c.vigente_hasta < (now() at time zone 'America/Mexico_City')::date then 'vencida_constancia' else 'vigente' end,
       'adeudos_actuales', (select count(*) from infracciones i
          where regexp_replace(upper(i.placa), '[^A-Z0-9]', '', 'g') = c.placa and i.estado in ('pendiente','vencida','impugnada')),
       'municipio', (select municipio from configuracion where id = 1))
     from constancias c where c.token = p_token)
  )
$$;
grant execute on function public.verificar_documento(uuid) to anon, authenticated;
