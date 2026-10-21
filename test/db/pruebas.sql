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

-- ── Bitácora (auditoria.sql) ─────────────────────────────────────────
-- El oficial cambia una infracción: queda quién, qué campo, antes y después
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
do $$ declare v bigint; begin
  insert into infracciones (placa, infractor, tipo, monto) values ('AUD-001', 'Auditado', 'Exceso de velocidad', 800) returning id into v;
  update infracciones set monto = 500, fotos = '["x.jpg"]' where id = v;
  update infracciones set monto = 500 where id = v;           -- sin cambios reales: no registra
  assert (select count(*) from auditoria) = 0, 'oficial pudo leer la bitácora';
  begin
    delete from auditoria;
    update auditoria set usuario_nombre = 'x';
    insert into auditoria (tabla, accion) values ('x', 'alta');
    raise exception 'oficial pudo escribir en la bitácora';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ declare v text := (select id::text from infracciones where placa = 'AUD-001'); begin
  assert (select count(*) from auditoria where tabla = 'infracciones' and registro_id = v) = 2, 'alta + 1 cambio';
  assert (select usuario_nombre from auditoria where registro_id = v and accion = 'alta') = 'Oficial', 'autor del alta';
  assert (select resumen from auditoria where registro_id = v and accion = 'alta') like 'INF-%', 'resumen con folio';
  assert (select cambios from auditoria where registro_id = v and accion = 'cambio')
         = '{"monto": {"antes": 800, "despues": 500}}'::jsonb, 'detalle del cambio (sin fotos)';
end $$;
-- El admin sí la lee
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'admin'), false);
set role authenticated;
do $$ begin
  assert (select count(*) from auditoria where tabla = 'infracciones') >= 2, 'admin lee la bitácora';
end $$;
reset role;

-- ── Fotos en Storage (evidencias_storage.sql) ────────────────────────
do $$ begin
  assert (select not public from storage.buckets where id = 'evidencias'), 'bucket privado';
end $$;
set role anon;
do $$ begin
  begin
    insert into storage.objects (bucket_id, name) values ('evidencias', 'infracciones/x.jpg');
    raise exception 'anon pudo subir fotos';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
insert into storage.objects (bucket_id, name) values ('evidencias', 'infracciones/2026/prueba.jpg');
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'evidencias') = 1, 'oficial ve sus fotos';
  delete from storage.objects where bucket_id = 'evidencias';
  assert (select count(*) from storage.objects where bucket_id = 'evidencias') = 1, 'oficial pudo borrar fotos';
end $$;
reset role;

-- ── Verificación pública (verificacion.sql) ──────────────────────────
insert into pagos (infraccion_id, folio_inf, monto_original, descuento_pct, monto_final)
  select id, folio, 800, 20, 640 from infracciones where placa = 'AUD-001';
set role anon;
do $$ declare t_inf uuid; t_pag uuid; j jsonb; begin
  reset role;
  t_inf := (select token_verificacion from infracciones where placa = 'AUD-001');
  t_pag := (select token_verificacion from pagos order by id desc limit 1);
  set role anon;
  j := verificar_documento(t_inf);
  assert j ->> 'tipo' = 'infraccion' and j ->> 'placa' = 'AUD-001', 'verifica boleta';
  assert j ->> 'infractor' = 'Auditado', 'nombre abreviado (una palabra)';
  j := verificar_documento(t_pag);
  assert j ->> 'tipo' = 'pago' and (j ->> 'monto')::numeric = 640 and j ->> 'folio' like 'REC-%', 'verifica recibo';
  assert verificar_documento(gen_random_uuid()) is null, 'token inexistente';
end $$;
reset role;
do $$ begin
  assert nombre_abreviado('Roberto  Gómez López') = 'Roberto G. L.', 'abreviatura';
  assert (select count(distinct token_verificacion) = count(*) from infracciones), 'tokens únicos';
end $$;
\echo 'OK   pruebas de base de datos'
