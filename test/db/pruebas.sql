-- Pruebas de schema.sql + security_auth.sql. Cualquier fallo aborta.
\set ON_ERROR_STOP 1

-- Folios automáticos
insert into infracciones (placa, infractor, tipo) values ('ABC-123', 'Prueba', 'Exceso de velocidad');
do $$ begin
  assert (select folio from infracciones order by id desc limit 1) like 'INF-____-0001', 'folio de infracción';
end $$;

-- Migración de usuarios: misma contraseña, ahora con bcrypt en auth.users
do $$ begin
  assert not exists (select 1 from information_schema.columns
                     where table_name = 'usuarios' and column_name = 'contrasena'), 'columna contrasena sigue existiendo';
  assert (select count(*) from usuarios where auth_id is null) = 0, 'usuarios sin cuenta de Auth';
  assert (select encrypted_password = extensions.crypt('secreto', encrypted_password)
          from auth.users where email = 'admin@transito.local'), 'contraseña del admin no se conservó';
  assert (select count(*) from auth.identities) = 2, 'identidades de Auth';
end $$;

-- Anónimo: no ve tablas, solo el portal por placa/folio exactos
set role anon;
do $$ begin
  assert (select count(*) from infracciones) = 0, 'anon pudo leer infracciones';
  assert (select count(*) from usuarios) = 0, 'anon pudo leer usuarios';
  assert (select count(*) from consulta_publica('abc 123', true)) = 1, 'portal por placa';
  assert (select count(*) from consulta_publica('a', true)) = 0, 'portal con búsqueda parcial';
  begin
    insert into infracciones (placa, infractor, tipo) values ('X', 'X', 'X');
    raise exception 'anon pudo insertar';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Oficial: opera, pero no borra, no configura y no gestiona usuarios
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
do $$ begin
  assert mi_rol() = 'oficial', 'rol del oficial';
  assert (select count(*) from infracciones) = 1, 'oficial lee infracciones';
  insert into infracciones (placa, infractor, tipo) values ('DEF-456', 'Otro', 'Uso de celular');
  delete from infracciones;
  assert (select count(*) from infracciones) = 2, 'oficial pudo borrar';
  update configuracion set director = 'x';
  assert (select count(*) from configuracion where director = 'x') = 0, 'oficial pudo editar configuración';
  begin
    perform admin_guardar_usuario(null, 'X', 'x', 'admin', 'X', 'xxxxxx');
    raise exception 'oficial pudo crear usuarios';
  exception when raise_exception then
    if sqlerrm = 'oficial pudo crear usuarios' then raise; end if;
  end;
end $$;
reset role;

-- Admin: crea usuarios y cambia contraseñas
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'admin'), false);
set role authenticated;
do $$ declare v bigint; begin
  v := admin_guardar_usuario(null, 'Nuevo', 'Nuevo', 'oficial', 'NU', 'clave123');
  assert (select usuario from usuarios where id = v) = 'nuevo', 'alta de usuario';
  perform admin_guardar_usuario(v, 'Nuevo', 'nuevo', 'supervisor', 'NU', 'otra456');
  assert (select rol from usuarios where id = v) = 'supervisor', 'cambio de rol';
  update usuarios set activo = false where id = v;
end $$;
reset role;
do $$ begin
  assert (select encrypted_password = extensions.crypt('otra456', encrypted_password)
          from auth.users where email = 'nuevo@transito.local'), 'cambio de contraseña';
end $$;

-- Usuario desactivado: pierde el acceso
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'nuevo'), false);
set role authenticated;
do $$ begin
  assert mi_rol() is null, 'usuario inactivo conserva rol';
  assert (select count(*) from infracciones) = 0, 'usuario inactivo lee infracciones';
end $$;
reset role;
\echo 'OK   pruebas de base de datos'
