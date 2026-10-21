-- ═══════════════════════════════════════════════════════════════════
-- Cobros, cambios de estado y vencimientos
--
-- * registrar_pago(): registra el pago y marca la infracción como pagada en
--   una sola transacción. El descuento y el cajero los decide el servidor
--   (según configuración y usuario en sesión), no el navegador. Bloquea la
--   fila, así dos cajeros no pueden cobrar la misma multa.
-- * Un pago por infracción (índice único).
-- * Reglas de estado de infracciones (trigger):
--     - "pagada" solo si existe un pago registrado.
--     - "cancelada" solo admin/supervisor y con motivo.
--     - Una infracción pagada o cancelada solo la puede reabrir un admin.
-- * Infracciones y pagos no se borran (se cancelan).
-- * Vencimiento automático diario con pg_cron, usando los días límite de
--   configuración (antes 30 días fijos y solo al abrir el panel).
--
-- Correr después de security_auth.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

alter table public.configuracion add column if not exists dias_limite integer default 30;
update public.configuracion set dias_limite = 30 where dias_limite is null;
alter table public.infracciones add column if not exists cancelacion_motivo text default '';

create unique index if not exists pagos_infraccion_unica on public.pagos (infraccion_id);

-- ── Reglas de estado ──────────────────────────────────────
-- Solo aplican a peticiones de la app (auth.uid() presente); los procesos
-- internos (pg_cron, migraciones) no pasan por aquí.
create or replace function public.validar_estado_infraccion()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare v_rol text;
begin
  if new.estado is not distinct from old.estado or auth.uid() is null then
    return new;
  end if;
  v_rol := public.mi_rol();

  if old.estado in ('pagada','cancelada') and v_rol is distinct from 'admin' then
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

drop trigger if exists trg_validar_estado on public.infracciones;
create trigger trg_validar_estado before update of estado on public.infracciones
  for each row execute function public.validar_estado_infraccion();

-- ── Registro de pago ──────────────────────────────────────
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
  select nombre into v_cajero from public.usuarios where auth_id = auth.uid() and activo;
  if v_cajero is null then raise exception 'Sesión no válida'; end if;
  if p_metodo not in ('efectivo','tarjeta','transferencia') then raise exception 'Método de pago inválido'; end if;

  select * into v_inf from public.infracciones where id = p_infraccion_id for update;
  if not found then raise exception 'Infracción no encontrada'; end if;
  if v_inf.estado in ('pagada','cancelada') or exists (select 1 from public.pagos where infraccion_id = p_infraccion_id) then
    raise exception 'La infracción % ya está %', v_inf.folio, case when v_inf.estado = 'cancelada' then 'cancelada' else 'pagada' end;
  end if;

  select * into v_cfg from public.configuracion where id = 1;
  if p_aplicar_descuento then
    if now() - v_inf.fecha > make_interval(days => coalesce(v_cfg.dias_descuento, 15)) then
      raise exception 'El periodo de descuento (% días) ya terminó', coalesce(v_cfg.dias_descuento, 15);
    end if;
    v_desc := coalesce(v_cfg.descuento_pct, 0);
  end if;

  insert into public.pagos (infraccion_id, folio_inf, monto_original, descuento_pct, monto_final, metodo, cajero, notas)
  values (v_inf.id, v_inf.folio, v_inf.monto, v_desc, round(v_inf.monto * (1 - v_desc / 100.0)), p_metodo, v_cajero, coalesce(p_notas, ''))
  returning * into v_pago;

  update public.infracciones set estado = 'pagada' where id = v_inf.id;
  return v_pago;
end $$;
revoke all on function public.registrar_pago(bigint, boolean, text, text) from public, anon;
grant execute on function public.registrar_pago(bigint, boolean, text, text) to authenticated;

-- Los pagos solo se crean con registrar_pago(); nadie borra pagos ni infracciones
drop policy if exists personal_insert on public.pagos;
drop policy if exists admin_delete    on public.pagos;
drop policy if exists mando_delete    on public.infracciones;

-- ── Vencimientos ──────────────────────────────────────────
create or replace function public.marcar_infracciones_vencidas()
returns void
language plpgsql
set search_path = public
as $$
begin
  update public.infracciones set estado = 'vencida'
  where estado = 'pendiente'
    and fecha < now() - make_interval(days => coalesce((select dias_limite from public.configuracion where id = 1), 30));
  update public.permisos set estado = 'vencido'
  where estado = 'vigente' and vencimiento < current_date;
end $$;
revoke all on function public.marcar_infracciones_vencidas() from public, anon;
grant execute on function public.marcar_infracciones_vencidas() to authenticated;

-- Diario a las 06:05 UTC (00:05 en el centro de México). Requiere pg_cron
-- (disponible en Supabase); en un Postgres sin pg_cron se omite.
do $$ begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron no disponible: %', sqlerrm;
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('marcar-vencimientos', '5 6 * * *', 'select public.marcar_infracciones_vencidas()');
  end if;
end $$;

-- ── Parámetros públicos de pago ───────────────────────────
-- El portal ciudadano no puede leer configuracion; esto expone solo lo que
-- va impreso en la boleta.
create or replace function public.parametros_pago()
returns table (descuento_pct integer, dias_descuento integer, dias_limite integer)
language sql stable security definer
set search_path = public
as $$
  select coalesce(descuento_pct, 0), coalesce(dias_descuento, 15), coalesce(dias_limite, 30)
  from public.configuracion where id = 1
$$;
grant execute on function public.parametros_pago() to anon, authenticated;
