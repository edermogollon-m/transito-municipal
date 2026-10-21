-- ═══════════════════════════════════════════════════════════════════
-- Roles y separación de funciones
--
--   admin       Director de Tránsito: todo, incluidos usuarios y configuración.
--   supervisor  Supervisor / jefe de turno: operación completa, cancelar,
--               impugnaciones, cambios de estado, permisos de circulación,
--               bitácora y borrar registros (no infracciones ni pagos).
--   oficial     Policía vial: levanta infracciones, grúa, accidentes y padrón;
--               consulta lo demás. No cobra, no cambia estados, no emite
--               permisos ni libera vehículos del corralón.
--   cajero      Caja / Tesorería (nuevo): cobra multas, corte de caja y
--               liberación del corralón. No levanta infracciones.
--
-- Quien levanta la multa no la cobra: registrar_pago solo para admin y cajero.
-- Correr después de inmutable.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.tiene_rol(variadic p_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(public.mi_rol() = any (p_roles), false) $$;
revoke all on function public.tiene_rol(text[]) from public, anon;
grant execute on function public.tiene_rol(text[]) to authenticated;

-- ── Políticas por tabla ───────────────────────────────────
alter policy personal_insert on public.infracciones with check (public.tiene_rol('admin','supervisor','oficial'));

alter policy personal_insert on public.permisos with check (public.tiene_rol('admin','supervisor'));
alter policy personal_update on public.permisos using (public.tiene_rol('admin','supervisor')) with check (public.tiene_rol('admin','supervisor'));

alter policy personal_insert on public.grua with check (public.tiene_rol('admin','supervisor','oficial'));
alter policy personal_update on public.grua using (public.tiene_rol('admin','supervisor','cajero')) with check (public.tiene_rol('admin','supervisor','cajero'));

alter policy personal_insert on public.accidentes with check (public.tiene_rol('admin','supervisor','oficial'));
alter policy personal_update on public.accidentes using (public.tiene_rol('admin','supervisor','oficial')) with check (public.tiene_rol('admin','supervisor','oficial'));

alter policy personal_insert on public.vehiculos with check (public.tiene_rol('admin','supervisor','oficial'));
alter policy personal_update on public.vehiculos using (public.tiene_rol('admin','supervisor','oficial')) with check (public.tiene_rol('admin','supervisor','oficial'));

-- Turnos: cada oficial abre y cierra el suyo; los mandos, cualquiera
alter policy personal_insert on public.turnos with check (public.tiene_rol('admin','supervisor','oficial'));
alter policy personal_update on public.turnos
  using (public.tiene_rol('admin','supervisor') or oficial_nombre = (select nombre from public.usuarios where auth_id = auth.uid()))
  with check (public.tiene_rol('admin','supervisor') or oficial_nombre = (select nombre from public.usuarios where auth_id = auth.uid()));

-- Pagos (dinero): solo mandos y caja
alter policy personal_select on public.pagos using (public.tiene_rol('admin','supervisor','cajero'));

-- ── Cambios de estado de infracciones: solo mandos ────────
-- El cobro (registrar_pago) y los vencimientos (marcar_infracciones_vencidas)
-- corren como el dueño de la base y no pasan por esta regla.
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

  if current_user in ('authenticated', 'anon') and v_rol is distinct from 'admin' and v_rol is distinct from 'supervisor' then
    raise exception 'Solo un supervisor o el Director pueden cambiar el estado de una infracción';
  end if;
  if old.estado in ('pagada','cancelada') and v_rol is distinct from 'admin' and current_user in ('authenticated', 'anon') then
    raise exception 'Solo un administrador puede reabrir una infracción %', old.estado;
  end if;
  if new.estado = 'pagada' and not exists (select 1 from public.pagos where infraccion_id = new.id) then
    raise exception 'Para marcarla como pagada registra el cobro en Caja';
  end if;
  if new.estado = 'cancelada' then
    if v_rol not in ('admin','supervisor') then
      raise exception 'Solo un supervisor o administrador puede cancelar infracciones';
    end if;
    if coalesce(trim(new.cancelacion_motivo), '') = '' then
      raise exception 'Indica el motivo de la cancelación';
    end if;
  end if;
  return new;
end $$;

-- Vencimientos automáticos: los dispara cualquier sesión, pero corren como el
-- dueño de la base (no son un cambio de estado hecho por el usuario)
alter function public.marcar_infracciones_vencidas() security definer;

-- ── Cobro: solo caja y Director ───────────────────────────
create or replace function public.registrar_pago(
  p_infraccion_id bigint, p_aplicar_descuento boolean, p_metodo text, p_notas text default '')
returns public.pagos
language plpgsql security definer
set search_path = public
as $$
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

  select * into v_inf from public.infracciones where id = p_infraccion_id for update;
  if not found then raise exception 'Infracción no encontrada'; end if;
  if v_inf.estado in ('pagada','cancelada') or exists (select 1 from public.pagos where infraccion_id = p_infraccion_id) then
    raise exception 'La infracción % ya está %', v_inf.folio, case when v_inf.estado = 'cancelada' then 'cancelada' else 'pagada' end;
  end if;

  select * into v_cfg from public.configuracion where id = 1;
  if p_aplicar_descuento then
    if exists (select 1 from public.catalogo_infracciones where numero = v_inf.catalogo_numero and grave) then
      raise exception 'Esta infracción se paga íntegra, sin descuento (conducir en estado de ebriedad)';
    end if;
    if now() - v_inf.fecha <= make_interval(days => coalesce(v_cfg.dias_descuento, 5)) then
      v_desc := coalesce(v_cfg.descuento_pct, 0);
    elsif v_cfg.dias_descuento2 is not null and now() - v_inf.fecha <= make_interval(days => v_cfg.dias_descuento2) then
      v_desc := coalesce(v_cfg.descuento2_pct, 0);
    else
      raise exception 'El periodo de descuento ya terminó';
    end if;
  end if;

  insert into public.pagos (infraccion_id, folio_inf, monto_original, descuento_pct, monto_final, metodo, cajero, notas)
  values (v_inf.id, v_inf.folio, v_inf.monto, v_desc, round(v_inf.monto * (1 - v_desc / 100.0)), p_metodo, v_cajero, coalesce(p_notas, ''))
  returning * into v_pago;

  update public.infracciones set estado = 'pagada' where id = v_inf.id;
  return v_pago;
end $$;
revoke all on function public.registrar_pago(bigint, boolean, text, text) from public, anon;
grant execute on function public.registrar_pago(bigint, boolean, text, text) to authenticated;

-- ── Alta de usuarios con el rol de caja ───────────────────
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
  if p_rol not in ('admin','supervisor','oficial','cajero') then
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

-- Que siempre quede al menos un administrador activo
create or replace function public.proteger_ultimo_admin()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo)
     and not exists (select 1 from public.usuarios where rol = 'admin' and activo and id <> old.id) then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;
  return new;
end $$;
create or replace trigger trg_proteger_ultimo_admin before update of rol, activo on public.usuarios
  for each row execute function public.proteger_ultimo_admin();
