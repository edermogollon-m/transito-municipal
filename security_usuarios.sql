-- ═══════════════════════════════════════════════════════════════════
-- Seguridad de contraseñas de usuarios
--
-- Antes: las contraseñas se guardaban en texto plano y cualquiera con la
-- llave pública (que va dentro de config.js) podía leerlas todas con un
-- simple select a la tabla usuarios.
--
-- Después:
--   * Las contraseñas se guardan con hash bcrypt (pgcrypto). Un trigger
--     hashea automáticamente cualquier contraseña nueva o cambiada, así que
--     la pantalla de Usuarios sigue funcionando igual.
--   * El navegador ya no puede leer la columna contrasena.
--   * El login se verifica en el servidor con la función verificar_login().
--
-- Requiere la versión de login.html/app.js que llama a verificar_login
-- (esa versión también funciona sin esta migración, así que el orden es:
-- primero publicar el código, después correr este archivo).
-- Es idempotente: se puede correr más de una vez.
-- ═══════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto with schema extensions;

-- Hashea la contraseña al insertar o cambiarla. Si ya es un hash bcrypt
-- ($2a$/$2b$...) la deja igual, para no hashear dos veces.
create or replace function hash_contrasena_usuario() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.contrasena is not null and new.contrasena !~ '^\$2[abxy]\$' then
    new.contrasena := crypt(new.contrasena, gen_salt('bf'));
  end if;
  return new;
end; $$;

drop trigger if exists trg_hash_contrasena on usuarios;
create trigger trg_hash_contrasena before insert or update of contrasena on usuarios
  for each row execute function hash_contrasena_usuario();

-- Hashea las contraseñas que ya existen (el trigger lo hace al "tocarlas").
update usuarios set contrasena = contrasena where contrasena !~ '^\$2[abxy]\$';

-- Login: devuelve los datos del usuario (sin contraseña) solo si coinciden.
create or replace function verificar_login(p_usuario text, p_contrasena text)
returns table (id bigint, nombre text, usuario text, rol text, iniciales text)
language sql stable security definer set search_path = public, extensions as $$
  select u.id, u.nombre, u.usuario, u.rol, u.iniciales
  from usuarios u
  where u.usuario = lower(trim(p_usuario))
    and u.activo
    and u.contrasena = crypt(p_contrasena, u.contrasena);
$$;
revoke all on function verificar_login(text, text) from public;
grant execute on function verificar_login(text, text) to anon, authenticated;

-- El navegador puede leer todas las columnas menos contrasena, y puede
-- escribirla (para crear usuarios / cambiar contraseñas) pero no leerla.
revoke select on usuarios from anon, authenticated;
grant select (id, nombre, usuario, rol, iniciales, activo, created_at) on usuarios to anon, authenticated;
grant insert, update on usuarios to anon, authenticated;
