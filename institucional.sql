-- ═══════════════════════════════════════════════════════════════════
-- Credencial verificable del oficial, alertas de placa e imagen
-- institucional
--
--   * usuarios.token_credencial + usuarios.foto: el QR de la credencial
--     apunta a /verificar?o=<token>; verificar_oficial() muestra nombre,
--     foto, cargo, número de placa y si la credencial está vigente. Si se
--     pierde una credencial, el admin genera un token nuevo y la anterior
--     deja de validar.
--   * vehiculos_reportados: placas con reporte de robo, orden de retención
--     o búsqueda. Al capturar una de ellas el celular del oficial muestra
--     una alerta a pantalla completa y se guarda en alertas_placa, que los
--     mandos reciben en tiempo real.
--   * configuracion.escudo / logo / color_institucional / institucion:
--     imagen del Ayuntamiento en boletas, recibos, credenciales y portal.
--
-- Correr después de mejoras2.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ── Imagen institucional ──────────────────────────────────
alter table public.configuracion add column if not exists institucion text not null default '';
alter table public.configuracion add column if not exists escudo text not null default '';
alter table public.configuracion add column if not exists logo text not null default '';
alter table public.configuracion add column if not exists color_institucional text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'configuracion_imagenes_validas') then
    alter table public.configuracion add constraint configuracion_imagenes_validas check (
      (escudo = '' or (escudo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(escudo) <= 400000)) and
      (logo   = '' or (logo   ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(logo)   <= 400000)) and
      (color_institucional = '' or color_institucional ~ '^#[0-9A-Fa-f]{6}$'));
  end if;
end $$;

-- ── Credencial del oficial ────────────────────────────────
alter table public.usuarios add column if not exists token_credencial uuid not null default gen_random_uuid();
alter table public.usuarios add column if not exists foto text not null default '';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'usuarios_token_credencial_key') then
    alter table public.usuarios add constraint usuarios_token_credencial_key unique (token_credencial);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usuarios_foto_valida') then
    alter table public.usuarios add constraint usuarios_foto_valida
      check (foto = '' or (foto ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(foto) <= 400000));
  end if;
end $$;

-- Pública: lo que ve quien escanea la credencial (sin usuario ni datos internos)
create or replace function public.verificar_oficial(p_token uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nombre', u.nombre, 'rol', u.rol, 'numero_placa', u.numero_placa,
    'adscripcion', u.adscripcion, 'activo', u.activo, 'foto', u.foto,
    'municipio', c.municipio, 'institucion', c.institucion,
    'escudo', c.escudo, 'color', c.color_institucional)
  from public.usuarios u cross join (select * from public.configuracion where id = 1) c
  where u.token_credencial = p_token
$$;
grant execute on function public.verificar_oficial(uuid) to anon, authenticated;

-- Reponer una credencial perdida: la anterior deja de validar
create or replace function public.regenerar_credencial(p_id bigint)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.tiene_rol('admin') then
    raise exception 'Solo un administrador puede reponer credenciales';
  end if;
  update public.usuarios set token_credencial = gen_random_uuid() where id = p_id returning token_credencial into v;
  if v is null then raise exception 'Usuario no encontrado'; end if;
  return v;
end $$;
grant execute on function public.regenerar_credencial(bigint) to authenticated;

-- ── Vehículos reportados ──────────────────────────────────
create table if not exists public.vehiculos_reportados (
  id            bigserial primary key,
  placa         text not null,                 -- normalizada: solo letras y números
  motivo        text not null check (motivo in ('robo','retencion','busqueda','otro')),
  detalle       text not null default '',
  reportado_por text not null default '',
  activo        boolean not null default true,
  retirado_por  text,
  retirado_at   timestamptz,
  created_at    timestamptz not null default now()
);
create unique index if not exists vehiculos_reportados_placa_activa on public.vehiculos_reportados (placa) where activo;
alter table public.vehiculos_reportados enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehiculos_reportados' and policyname = 'personal_select') then
    create policy personal_select on public.vehiculos_reportados for select to authenticated using (public.mi_rol() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehiculos_reportados' and policyname = 'mando_insert') then
    create policy mando_insert on public.vehiculos_reportados for insert to authenticated with check (public.tiene_rol('admin','supervisor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehiculos_reportados' and policyname = 'mando_update') then
    create policy mando_update on public.vehiculos_reportados for update to authenticated
      using (public.tiene_rol('admin','supervisor')) with check (public.tiene_rol('admin','supervisor'));
  end if;
end $$;
grant select, insert, update on public.vehiculos_reportados to authenticated;
grant usage on sequence public.vehiculos_reportados_id_seq to authenticated;

-- Quién lo reportó lo decide el servidor, y la placa se guarda normalizada
create or replace function public.vehiculos_reportados_normalizar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.placa := regexp_replace(upper(new.placa), '[^A-Z0-9]', '', 'g');
  if length(new.placa) < 3 then raise exception 'Placa no válida'; end if;
  if tg_op = 'INSERT' then
    new.reportado_por := coalesce(public.mi_nombre(), '');
  elsif old.activo and not new.activo then
    new.retirado_por := coalesce(public.mi_nombre(), '');
    new.retirado_at := now();
  end if;
  return new;
end $$;
create or replace trigger trg_vehiculos_reportados before insert or update on public.vehiculos_reportados
  for each row execute function public.vehiculos_reportados_normalizar();

-- ── Alertas de placa (cada vez que un oficial captura una placa reportada) ──
create table if not exists public.alertas_placa (
  id         bigserial primary key,
  placa      text not null,
  motivo     text not null default '',
  oficial    text not null default '',
  ubicacion  text not null default '',
  created_at timestamptz not null default now()
);
alter table public.alertas_placa enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alertas_placa' and policyname = 'personal_insert') then
    create policy personal_insert on public.alertas_placa for insert to authenticated with check (public.mi_rol() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'alertas_placa' and policyname = 'mando_select') then
    create policy mando_select on public.alertas_placa for select to authenticated using (public.tiene_rol('admin','supervisor'));
  end if;
end $$;
grant select, insert on public.alertas_placa to authenticated;
grant usage on sequence public.alertas_placa_id_seq to authenticated;

create or replace function public.alertas_placa_oficial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.oficial := coalesce(public.mi_nombre(), '');
  new.placa := regexp_replace(upper(new.placa), '[^A-Z0-9]', '', 'g');
  return new;
end $$;
create or replace trigger trg_alertas_placa before insert on public.alertas_placa
  for each row execute function public.alertas_placa_oficial();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'alertas_placa') then
    alter publication supabase_realtime add table public.alertas_placa;
  end if;
end $$;

-- mejoras.sql + imagen institucional (portal, verificación y login la usan sin sesión)
create or replace function public.portal_info()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('municipio', coalesce(municipio,''), 'estado', coalesce(estado,''),
    'correo', coalesce(correo,''), 'leyenda_recurso', coalesce(leyenda_recurso,''),
    'pago_banco', coalesce(pago_banco,''), 'pago_clabe', coalesce(pago_clabe,''),
    'pago_beneficiario', coalesce(pago_beneficiario,''),
    'institucion', institucion, 'escudo', escudo, 'logo', logo, 'color', color_institucional)
  from public.configuracion where id = 1
$$;
grant execute on function public.portal_info() to anon, authenticated;

-- auditoria.sql: las imágenes (foto, escudo, logo) y el token de la credencial no se copian a la bitácora
create or replace function public.registrar_auditoria() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  -- Columnas que no aportan a la bitácora (fotos e imágenes pesan mucho; fechas y tokens técnicos).
  excluir text[] := array['fotos', 'created_at', 'token_verificacion', 'foto', 'escudo', 'logo', 'token_credencial'];
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_cambios jsonb := '{}';
  v_uid bigint; v_nombre text; k text;
begin
  select u.id, u.nombre into v_uid, v_nombre from usuarios u where u.auth_id = auth.uid();

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(v_new) loop
      if not (k = any(excluir)) and v_new -> k is distinct from v_old -> k then
        v_cambios := v_cambios || jsonb_build_object(k, jsonb_build_object('antes', v_old -> k, 'despues', v_new -> k));
      end if;
    end loop;
    if v_cambios = '{}' then return null; end if;   -- nada relevante cambió
  else
    v_cambios := v_row - excluir;
  end if;

  insert into auditoria (tabla, registro_id, accion, usuario_id, usuario_nombre, resumen, cambios)
  values (
    tg_table_name,
    v_row ->> 'id',
    case tg_op when 'INSERT' then 'alta' when 'UPDATE' then 'cambio' else 'baja' end,
    v_uid,
    coalesce(v_nombre, case when auth.uid() is null then 'Sistema' else 'Desconocido' end),
    coalesce(v_row ->> 'folio', v_row ->> 'num', v_row ->> 'folio_inf', v_row ->> 'placa',
             v_row ->> 'usuario', v_row ->> 'titular', v_row ->> 'oficial_nombre', v_row ->> 'municipio',
             v_row ->> 'descripcion'),
    v_cambios
  );
  return null;
end; $$;
