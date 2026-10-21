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
-- ── Cobros y estados (cobros.sql) ────────────────────────────────────
insert into configuracion (id, descuento_pct, dias_descuento, dias_limite) values (1, 10, 15, 30)
  on conflict (id) do update set descuento_pct = 10, dias_descuento = 15, dias_limite = 30;
insert into infracciones (placa, infractor, tipo, monto, fecha) values
  ('COB-001', 'Cobro', 'Prueba', 1000, now()),
  ('COB-002', 'Cobro', 'Prueba', 1000, now() - interval '20 days');

select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
do $$ declare v_id bigint; p pagos; begin
  v_id := (select id from infracciones where placa = 'COB-001');
  p := registrar_pago(v_id, true, 'efectivo');
  assert p.monto_final = 900 and p.descuento_pct = 10, 'descuento calculado en el servidor';
  assert p.cajero = 'Oficial', 'cajero = usuario en sesión';
  assert (select estado from infracciones where id = v_id) = 'pagada', 'infracción marcada como pagada';
  begin
    perform registrar_pago(v_id, false, 'efectivo');
    raise exception 'cobro doble';
  exception when others then if sqlerrm = 'cobro doble' then raise; end if;
  end;

  v_id := (select id from infracciones where placa = 'COB-002');
  begin
    perform registrar_pago(v_id, true, 'efectivo');
    raise exception 'descuento fuera de plazo';
  exception when others then if sqlerrm = 'descuento fuera de plazo' then raise; end if;
  end;
  begin
    update infracciones set estado = 'pagada' where id = v_id;
    raise exception 'pagada sin cobro';
  exception when others then if sqlerrm = 'pagada sin cobro' then raise; end if;
  end;
  begin
    update infracciones set estado = 'cancelada', cancelacion_motivo = 'x' where id = v_id;
    raise exception 'oficial canceló';
  exception when others then if sqlerrm = 'oficial canceló' then raise; end if;
  end;
  begin
    insert into pagos (infraccion_id, monto_original, monto_final) values (v_id, 1, 1);
    raise exception 'pago directo sin registrar_pago';
  exception when others then if sqlerrm = 'pago directo sin registrar_pago' then raise; end if;
  end;
end $$;
reset role;

select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'admin'), false);
set role authenticated;
do $$ declare v_id bigint; begin
  v_id := (select id from infracciones where placa = 'COB-002');
  begin
    update infracciones set estado = 'cancelada' where id = v_id;
    raise exception 'cancelación sin motivo';
  exception when others then if sqlerrm = 'cancelación sin motivo' then raise; end if;
  end;
  update infracciones set estado = 'cancelada', cancelacion_motivo = 'Error de captura' where id = v_id;
  assert (select estado from infracciones where id = v_id) = 'cancelada', 'admin cancela con motivo';
  delete from infracciones where id = v_id;
  assert exists (select 1 from infracciones where id = v_id), 'admin pudo borrar una infracción';
end $$;
reset role;

-- Vencimientos según los días límite de Configuración
insert into infracciones (placa, infractor, tipo, fecha) values
  ('VEN-040', 'Vence', 'Prueba', now() - interval '40 days'),
  ('VEN-020', 'Vence', 'Prueba', now() - interval '20 days');
select marcar_infracciones_vencidas();
do $$ begin
  assert (select estado from infracciones where placa = 'VEN-040') = 'vencida', 'vence a los 30 días';
  assert (select estado from infracciones where placa = 'VEN-020') = 'pendiente', 'aún no vence';
end $$;
update configuracion set dias_limite = 15 where id = 1;
select marcar_infracciones_vencidas();
do $$ begin
  assert (select estado from infracciones where placa = 'VEN-020') = 'vencida', 'usa dias_limite configurado';
end $$;

set role anon;
do $$ begin
  assert (select descuento_pct from parametros_pago()) = 10, 'parámetros públicos de pago';
end $$;
reset role;
-- ── Fundamento legal (articulos.sql) ─────────────────────────────────
do $$ begin
  assert (select count(*) from catalogo_infracciones) = 224, 'catálogo completo del tabulador';
  assert fundamento_de(112) like 'Artículo 59, primer párrafo, del Reglamento de Movilidad%', 'fundamento con párrafo';
  assert fundamento_de(82)  like 'Artículo 58, fracción II, del %', 'fundamento con fracción';
  assert fundamento_de(221) like 'Artículo 161, fracción II, inciso b), del %', 'fundamento con inciso';
  assert fundamento_de(136) like 'Artículo 80, fracciones III, IV,%', 'fundamento con varias fracciones';
  assert (select grave from catalogo_infracciones where numero = 82), 'celular es grave (art. 192 XIII)';
  assert not (select grave from catalogo_infracciones where numero = 136), 'estacionamiento no es grave';
end $$;
update configuracion set valor_uma = 117.31, descuento_pct = 10, dias_descuento = 15 where id = 1;

select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
do $$ declare v_id bigint; begin
  begin
    insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('FUN-001', 'X', 'Exceso de velocidad', 800, 112);
    raise exception 'monto fuera del tabulador';
  exception when others then if sqlerrm = 'monto fuera del tabulador' then raise; end if;
  end;
  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('FUN-001', 'X', 'Exceso de velocidad', 1407, 112) returning id into v_id;
  assert (select fundamento from infracciones where id = v_id) like 'Artículo 59, primer párrafo%', 'fundamento guardado al registrar';
  begin
    perform registrar_pago(v_id, true, 'efectivo');
    raise exception 'descuento en infracción grave';
  exception when others then if sqlerrm = 'descuento en infracción grave' then raise; end if;
  end;
  assert (registrar_pago(v_id, false, 'efectivo')).monto_final = 1407, 'grave se cobra íntegra';

  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('FUN-002', 'X', 'Estacionamiento prohibido', 1173, 136) returning id into v_id;
  assert (registrar_pago(v_id, true, 'efectivo')).descuento_pct = 10, 'no grave conserva el descuento';
end $$;
reset role;

set role anon;
do $$ begin
  assert (select fundamento from consulta_publica('FUN-001', true)) like 'Artículo 59%', 'portal muestra el fundamento';
  assert (select grave from consulta_publica('FUN-001', true)), 'portal sabe que es grave';
end $$;
reset role;
\echo 'OK   pruebas de base de datos'
