-- Pruebas de schema.sql + security_usuarios.sql. Cualquier fallo aborta.
\set ON_ERROR_STOP 1

-- Folios automáticos
insert into infracciones (placa, infractor, tipo) values ('ABC-123', 'Prueba', 'Exceso de velocidad');
do $$ begin
  assert (select folio from infracciones order by id desc limit 1) like 'INF-____-0001', 'folio de infracción';
end $$;

-- Contraseñas: se guardan con hash y el login funciona
insert into usuarios (nombre, usuario, contrasena, rol) values ('Admin', 'admin', 'secreto', 'admin');
do $$ begin
  assert (select contrasena from usuarios where usuario = 'admin') like '$2%', 'contraseña sin hash';
  assert (select count(*) from verificar_login('admin', 'secreto')) = 1, 'login correcto';
  assert (select count(*) from verificar_login('admin', 'otra')) = 0, 'login con contraseña incorrecta';
end $$;

-- Como el navegador (rol anon): crear usuario, cambiar contraseña, sin poder leerla
set role anon;
insert into usuarios (nombre, usuario, contrasena) values ('Oficial', 'ofi', 'abc');
update usuarios set contrasena = 'nueva' where usuario = 'admin';
update usuarios set activo = false where usuario = 'ofi';
do $$ begin
  assert (select count(*) from verificar_login('admin', 'nueva')) = 1, 'cambio de contraseña';
  assert (select count(*) from verificar_login('admin', 'secreto')) = 0, 'contraseña vieja';
  assert (select count(*) from verificar_login('ofi', 'abc')) = 0, 'usuario inactivo no entra';
  assert (select count(*) from usuarios) = 2, 'listado de usuarios';
  begin
    perform contrasena from usuarios;
    raise exception 'anon pudo leer contraseñas';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
\echo 'OK   pruebas de base de datos'
