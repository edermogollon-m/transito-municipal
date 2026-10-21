-- Login con Supabase Auth + acceso por rol (RLS)
--
-- 1. Cada registro de public.usuarios obtiene un usuario de Supabase Auth
--    (<usuario>@transito.local) con su MISMA contraseña actual, cifrada con bcrypt.
-- 2. Se elimina la columna de contraseñas en texto plano.
-- 3. Solo el personal autenticado y activo puede leer/escribir; borrar y
--    configurar queda restringido por rol.
-- 4. El portal ciudadano consulta mediante consulta_publica(), que solo
--    acepta placa o folio exactos.
--
-- Se ejecuta completa en una transacción: si algo falla, no cambia nada.

begin;

create extension if not exists pgcrypto with schema extensions;

-- ── Usuarios ↔ Auth ───────────────────────────────────────
alter table public.usuarios add column if not exists auth_id uuid unique references auth.users(id) on delete set null;

create or replace function public._sync_auth_user(p_usuario_id bigint, p_contrasena text)
returns uuid
language plpgsql security definer
set search_path = public, extensions, auth
as $$
declare
  u public.usuarios%rowtype;
  v_email text;
  v_uid uuid;
begin
  select * into u from public.usuarios where id = p_usuario_id;
  v_email := lower(u.usuario) || '@transito.local';
  v_uid := u.auth_id;

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated', v_email,
      crypt(p_contrasena, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', u.nombre), now(), now(),
      '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid::text, 'email',
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true), now(), now(), now());
    update public.usuarios set auth_id = v_uid where id = p_usuario_id;
  else
    update auth.users set email = v_email, updated_at = now(),
      encrypted_password = case when coalesce(p_contrasena,'') <> '' then crypt(p_contrasena, gen_salt('bf')) else encrypted_password end
    where id = v_uid;
    update auth.identities set identity_data = identity_data || jsonb_build_object('email', v_email)
    where user_id = v_uid and provider = 'email';
  end if;
  return v_uid;
end $$;
revoke all on function public._sync_auth_user(bigint, text) from public, anon, authenticated;

-- Migrar usuarios existentes conservando su contraseña
select public._sync_auth_user(id, contrasena) from public.usuarios where auth_id is null;

-- Ya no se guardan contraseñas en texto plano
alter table public.usuarios drop column contrasena;

-- ── Helpers de rol ────────────────────────────────────────
create or replace function public.mi_rol()
returns text
language sql stable security definer
set search_path = public
as $$ select rol from public.usuarios where auth_id = auth.uid() and activo $$;
revoke all on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated;

-- ── Gestión de usuarios (solo admin) ──────────────────────
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
  if p_rol not in ('admin','supervisor','oficial') then
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
    update public.usuarios set nombre = p_nombre, usuario = lower(p_usuario), rol = p_rol, iniciales = p_iniciales
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Usuario no encontrado'; end if;
  end if;
  perform public._sync_auth_user(v_id, p_contrasena);
  return v_id;
end $$;
revoke all on function public.admin_guardar_usuario(bigint, text, text, text, text, text) from public, anon;
grant execute on function public.admin_guardar_usuario(bigint, text, text, text, text, text) to authenticated;

-- ── Portal ciudadano ──────────────────────────────────────
-- Solo coincidencia exacta de placa o folio (ignora mayúsculas, espacios y guiones).
create or replace function public.consulta_publica(p_q text, p_historial boolean default false)
returns table (id bigint, folio text, fecha timestamptz, placa text, infractor text, tipo text,
               monto integer, estado text, ubicacion text, obs text)
language sql stable security definer
set search_path = public
as $$
  select i.id, i.folio, i.fecha, i.placa, i.infractor, i.tipo, i.monto, i.estado, i.ubicacion, i.obs
  from public.infracciones i
  where length(regexp_replace(upper(coalesce(p_q,'')), '[^A-Z0-9]', '', 'g')) >= 3
    and (regexp_replace(upper(i.placa), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_q), '[^A-Z0-9]', '', 'g')
      or regexp_replace(upper(i.folio), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_q), '[^A-Z0-9]', '', 'g'))
    and (p_historial or i.estado in ('pendiente','impugnada','vencida'))
  order by i.fecha desc
  limit 25
$$;
grant execute on function public.consulta_publica(text, boolean) to anon, authenticated;

-- marcar_infracciones_vencidas solo para personal
revoke all on function public.marcar_infracciones_vencidas() from public, anon;
grant execute on function public.marcar_infracciones_vencidas() to authenticated;

-- ── Políticas RLS ─────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['configuracion','usuarios','infracciones','pagos','permisos','actividad',
                           'vehiculos','grua','accidentes','turnos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists public_all on public.%I', t);
  end loop;

  -- Operación diaria: cualquier miembro activo del personal
  foreach t in array array['infracciones','permisos','vehiculos','grua','accidentes','turnos','actividad'] loop
    execute format('create policy personal_select on public.%I for select to authenticated using (public.mi_rol() is not null)', t);
    execute format('create policy personal_insert on public.%I for insert to authenticated with check (public.mi_rol() is not null)', t);
    execute format('create policy personal_update on public.%I for update to authenticated using (public.mi_rol() is not null) with check (public.mi_rol() is not null)', t);
  end loop;

  -- Borrado: admin y supervisor
  foreach t in array array['infracciones','permisos','vehiculos','grua','accidentes','turnos'] loop
    execute format($p$create policy mando_delete on public.%I for delete to authenticated using (public.mi_rol() in ('admin','supervisor'))$p$, t);
  end loop;
end $$;

-- La bitácora de actividad se recorta automáticamente desde cualquier sesión
create policy personal_delete on public.actividad for delete to authenticated using (public.mi_rol() is not null);

-- Pagos: se registran y consultan; solo admin corrige o borra
create policy personal_select on public.pagos for select to authenticated using (public.mi_rol() is not null);
create policy personal_insert on public.pagos for insert to authenticated with check (public.mi_rol() is not null);
create policy admin_update on public.pagos for update to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');
create policy admin_delete on public.pagos for delete to authenticated using (public.mi_rol() = 'admin');

-- Configuración: todos leen, admin escribe
create policy personal_select on public.configuracion for select to authenticated using (public.mi_rol() is not null);
create policy admin_insert on public.configuracion for insert to authenticated with check (public.mi_rol() = 'admin');
create policy admin_update on public.configuracion for update to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

-- Usuarios: todos leen (listas de oficiales); admin activa/desactiva; altas vía admin_guardar_usuario()
create policy personal_select on public.usuarios for select to authenticated using (public.mi_rol() is not null);
create policy admin_update on public.usuarios for update to authenticated using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');

-- Cada usuario puede leer su propio perfil aunque esté inactivo (para mostrar el aviso en el login)
create policy propio_select on public.usuarios for select to authenticated using (auth_id = auth.uid());

commit;
