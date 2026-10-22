-- ═══════════════════════════════════════════════════════════════════
-- Controles por rol (segunda vuelta)
--
--   * Roles nuevos:
--       juridico     Jurídico / Juez calificador: registra y resuelve
--                    impugnaciones. El supervisor ya no las resuelve.
--       corralon     Encargado de corralón: entradas y salidas de grúa.
--       contraloria  Contraloría: ve todo (caja y bitácora incluidas),
--                    no cambia nada.
--   * Pagos inmutables: nadie los edita ni borra desde la app. El Director
--     los anula con motivo (anular_pago); el pago pasa a pagos_anulados y la
--     infracción vuelve a quedar por cobrar.
--   * Corte de caja formal (cortes_caja): el cajero captura el efectivo
--     contado y queda guardada la diferencia contra el sistema.
--   * Nada se borra: permisos, vehículos, grúa, accidentes y turnos se
--     cancelan o cierran (los permisos con motivo).
--   * Accidentes: el policía vial solo edita los suyos y mientras estén en
--     proceso.
--   * capturo_auth: quién capturó cada infracción y accidente ("Mis boletas").
--   * admin_restablecer_contrasena: contraseña temporal para un usuario.
--
-- Correr después de roles.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- Nombre del usuario en sesión (para comparar con oficial / cajero)
create or replace function public.mi_nombre()
returns text
language sql stable security definer
set search_path = public
as $$ select nombre from public.usuarios where auth_id = auth.uid() and activo $$;
revoke all on function public.mi_nombre() from public, anon;
grant execute on function public.mi_nombre() to authenticated;

-- ── Alta de usuarios con los roles nuevos ─────────────────
create or replace function public.admin_guardar_usuario(
  p_id bigint, p_nombre text, p_usuario text, p_rol text, p_iniciales text, p_contrasena text)
returns bigint
language plpgsql security definer
set search_path = public
as $$
declare v_id bigint;
begin
  if public.mi_rol() is distinct from 'admin' then
    raise exception 'Solo un administrador puede gestionar usuarios';
  end if;
  if p_rol not in ('admin','supervisor','oficial','cajero','juridico','corralon','contraloria') then
    raise exception 'Rol inválido';
  end if;
  if coalesce(p_contrasena,'') <> '' and length(p_contrasena) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres';
  end if;
  if p_id is null then
    if coalesce(p_contrasena,'') = '' then raise exception 'La contraseña es requerida'; end if;
    insert into public.usuarios (nombre, usuario, rol, iniciales)
    values (p_nombre, lower(p_usuario), p_rol, p_iniciales) returning id into v_id;
  else
    -- El Director no puede quitarse a sí mismo el rol de administrador
    if exists (select 1 from public.usuarios where id = p_id and auth_id = auth.uid()) and p_rol <> 'admin' then
      raise exception 'No puedes quitarte el rol de administrador a ti mismo';
    end if;
    update public.usuarios set nombre = p_nombre, usuario = lower(p_usuario), rol = p_rol, iniciales = p_iniciales
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Usuario no encontrado'; end if;
  end if;
  perform public._sync_auth_user(v_id, p_contrasena);
  return v_id;
end $$;
revoke all on function public.admin_guardar_usuario(bigint, text, text, text, text, text) from public, anon;
grant execute on function public.admin_guardar_usuario(bigint, text, text, text, text, text) to authenticated;

-- Contraseña temporal (el Director se la da al usuario en persona)
create or replace function public.admin_restablecer_contrasena(p_id bigint)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare v_clave text;
begin
  if public.mi_rol() is distinct from 'admin' then
    raise exception 'Solo un administrador puede restablecer contraseñas';
  end if;
  if not exists (select 1 from public.usuarios where id = p_id) then
    raise exception 'Usuario no encontrado';
  end if;
  -- 8 caracteres sin letras que se confundan (0/O, 1/l/I)
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '')
    into v_clave from generate_series(1, 8);
  perform public._sync_auth_user(p_id, v_clave);
  return v_clave;
end $$;
revoke all on function public.admin_restablecer_contrasena(bigint) from public, anon;
grant execute on function public.admin_restablecer_contrasena(bigint) to authenticated;

-- ── Quién capturó ─────────────────────────────────────────
alter table public.infracciones add column if not exists capturo_auth uuid default auth.uid();
alter table public.accidentes   add column if not exists capturo_auth uuid default auth.uid();
alter table public.permisos     add column if not exists cancelacion_motivo text default '';

-- ── Políticas ─────────────────────────────────────────────
-- Los campos de la infracción son inmutables (inmutable.sql); solo cambia el
-- estado, y eso lo hacen mandos y Jurídico (el cobro va por registrar_pago)
alter policy personal_update on public.infracciones
  using (public.tiene_rol('admin','supervisor','juridico'))
  with check (public.tiene_rol('admin','supervisor','juridico'));

alter policy personal_insert on public.grua with check (public.tiene_rol('admin','supervisor','oficial','corralon'));
alter policy personal_update on public.grua
  using (public.tiene_rol('admin','supervisor','cajero','corralon'))
  with check (public.tiene_rol('admin','supervisor','cajero','corralon'));

-- Accidentes: el policía vial edita solo los suyos y mientras sigan en proceso
alter policy personal_update on public.accidentes
  using (public.tiene_rol('admin','supervisor')
         or (public.tiene_rol('oficial') and estado = 'en_proceso'
             and (capturo_auth = auth.uid() or oficial = public.mi_nombre())))
  with check (public.tiene_rol('admin','supervisor')
         or (public.tiene_rol('oficial') and (capturo_auth = auth.uid() or oficial = public.mi_nombre())));

-- Dinero y bitácora: Contraloría también los ve
alter policy personal_select on public.pagos using (public.tiene_rol('admin','supervisor','cajero','contraloria'));
alter policy mando_select on public.auditoria using (public.tiene_rol('admin','supervisor','contraloria'));

-- Nada se borra desde la app (se cancela o se cierra)
alter policy mando_delete on public.permisos   using (false);
alter policy mando_delete on public.vehiculos  using (false);
alter policy mando_delete on public.grua       using (false);
alter policy mando_delete on public.accidentes using (false);
alter policy mando_delete on public.turnos     using (false);

-- ── Estados de infracción: impugnaciones a Jurídico ───────
create or replace function public.validar_estado_infraccion()
returns trigger
language plpgsql security invoker
set search_path = public
as $$
declare v_rol text;
begin
  if new.estado is not distinct from old.estado or auth.uid() is null then
    return new;
  end if;
  v_rol := public.mi_rol();

  -- Reglas para los usuarios de la app. El cobro (registrar_pago), la
  -- anulación de pagos y los vencimientos corren como el dueño de la base.
  if current_user in ('authenticated', 'anon') then
    if v_rol is null or v_rol not in ('admin','supervisor','juridico') then
      raise exception 'Solo un supervisor, Jurídico o el Director pueden cambiar el estado de una infracción';
    end if;
    if old.estado = 'impugnada' and v_rol not in ('admin','juridico') then
      raise exception 'Las impugnaciones las resuelve Jurídico o el Director';
    end if;
    if v_rol = 'juridico' and new.estado <> 'impugnada' and old.estado <> 'impugnada' then
      raise exception 'Jurídico solo registra y resuelve impugnaciones';
    end if;
    if old.estado in ('pagada','cancelada') and v_rol <> 'admin' then
      raise exception 'Solo un administrador puede reabrir una infracción %', old.estado;
    end if;
  end if;
  if new.estado = 'pagada' and not exists (select 1 from public.pagos where infraccion_id = new.id) then
    raise exception 'Para marcarla como pagada registra el cobro en Caja';
  end if;
  if new.estado = 'cancelada' then
    if v_rol is null or v_rol not in ('admin','supervisor','juridico') then
      raise exception 'Solo un supervisor, Jurídico o el Director pueden cancelar infracciones';
    end if;
    if coalesce(trim(new.cancelacion_motivo), '') = '' then
      raise exception 'Indica el motivo de la cancelación';
    end if;
  end if;
  return new;
end $$;

-- ── Pagos inmutables y anulación con motivo ───────────────
create or replace function public.bloquear_edicion_pago()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    raise exception 'Los pagos no se pueden modificar ni borrar. El Director puede anularlo indicando el motivo.'
      using errcode = 'insufficient_privilege';
  end if;
  return coalesce(new, old);
end $$;
create or replace trigger trg_pago_inmutable before update or delete on public.pagos
  for each row execute function public.bloquear_edicion_pago();
alter policy admin_update on public.pagos using (false) with check (false);

create table if not exists public.pagos_anulados (like public.pagos);
alter table public.pagos_anulados
  add column if not exists anulacion_motivo text not null default '',
  add column if not exists anulado_por      text,
  add column if not exists anulado_at       timestamptz not null default now();
alter table public.pagos_anulados enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'pagos_anulados' and policyname = 'control_select') then
    create policy control_select on public.pagos_anulados for select to authenticated
      using (public.tiene_rol('admin','supervisor','cajero','contraloria'));
  end if;
end $$;
grant select on public.pagos_anulados to authenticated;

create or replace function public.anular_pago(p_pago_id bigint, p_motivo text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_pago public.pagos%rowtype;
  v_quien text;
begin
  select nombre into v_quien from public.usuarios where auth_id = auth.uid() and activo and rol = 'admin';
  if v_quien is null then raise exception 'Solo el Director puede anular pagos'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Indica el motivo de la anulación'; end if;

  select * into v_pago from public.pagos where id = p_pago_id for update;
  if not found then raise exception 'Pago no encontrado'; end if;

  insert into public.pagos_anulados
  select * from jsonb_populate_record(null::public.pagos_anulados,
    to_jsonb(v_pago) || jsonb_build_object('anulacion_motivo', trim(p_motivo), 'anulado_por', v_quien, 'anulado_at', now()));
  delete from public.pagos where id = p_pago_id;

  -- La infracción vuelve a quedar por cobrar (vencida si ya pasó su plazo)
  update public.infracciones set estado = case
      when fecha < now() - make_interval(days => coalesce((select dias_limite from public.configuracion where id = 1), 30))
      then 'vencida' else 'pendiente' end
  where id = v_pago.infraccion_id and estado = 'pagada';
end $$;
revoke all on function public.anular_pago(bigint, text) from public, anon;
grant execute on function public.anular_pago(bigint, text) to authenticated;

-- El QR de un recibo anulado lo dice (verificacion.sql + pagos_anulados)
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
     where p.token_verificacion = p_token)
  )
$$;
grant execute on function public.verificar_documento(uuid) to anon, authenticated;

-- ── Corte de caja formal ──────────────────────────────────
create table if not exists public.cortes_caja (
  id               bigserial primary key,
  created_at       timestamptz not null default now(),
  cajero           text not null,
  desde            timestamptz not null,
  hasta            timestamptz not null,
  num_pagos        integer not null default 0,
  total            numeric not null default 0,
  efectivo         numeric not null default 0,
  tarjeta          numeric not null default 0,
  transferencia    numeric not null default 0,
  efectivo_contado numeric not null default 0,
  diferencia       numeric not null default 0,
  notas            text not null default ''
);
alter table public.cortes_caja enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cortes_caja' and policyname = 'control_select') then
    create policy control_select on public.cortes_caja for select to authenticated
      using (public.tiene_rol('admin','supervisor','cajero','contraloria'));
  end if;
end $$;
grant select on public.cortes_caja to authenticated;

-- Lo cobrado por el usuario en sesión desde su último corte (o desde las
-- 00:00 de hoy si nunca ha hecho uno)
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
      'total', coalesce(sum(monto_final), 0),
      'efectivo', coalesce(sum(monto_final) filter (where metodo = 'efectivo'), 0),
      'tarjeta', coalesce(sum(monto_final) filter (where metodo = 'tarjeta'), 0),
      'transferencia', coalesce(sum(monto_final) filter (where metodo = 'transferencia'), 0))
    from public.pagos where cajero = v_cajero and created_at > v_desde and created_at <= now());
end $$;
revoke all on function public.resumen_corte() from public, anon;
grant execute on function public.resumen_corte() to authenticated;

create or replace function public.cerrar_corte(p_efectivo_contado numeric, p_notas text default '')
returns public.cortes_caja
language plpgsql security definer
set search_path = public
as $$
declare
  r jsonb;
  v_corte public.cortes_caja%rowtype;
begin
  if p_efectivo_contado is null or p_efectivo_contado < 0 then
    raise exception 'Captura el efectivo contado en caja';
  end if;
  r := public.resumen_corte();
  insert into public.cortes_caja (cajero, desde, hasta, num_pagos, total, efectivo, tarjeta, transferencia,
                                  efectivo_contado, diferencia, notas)
  values (r->>'cajero', (r->>'desde')::timestamptz, (r->>'hasta')::timestamptz, (r->>'num_pagos')::int,
          (r->>'total')::numeric, (r->>'efectivo')::numeric, (r->>'tarjeta')::numeric, (r->>'transferencia')::numeric,
          p_efectivo_contado, p_efectivo_contado - (r->>'efectivo')::numeric, coalesce(p_notas, ''))
  returning * into v_corte;
  return v_corte;
end $$;
revoke all on function public.cerrar_corte(numeric, text) from public, anon;
grant execute on function public.cerrar_corte(numeric, text) to authenticated;
