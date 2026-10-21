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
  update infracciones set estado = 'impugnada', impugnacion_motivo = 'No era yo' where id = v;
  update infracciones set estado = 'impugnada' where id = v;   -- sin cambios reales: no registra
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
  assert (select cambios -> 'estado' from auditoria where registro_id = v and accion = 'cambio')
         = '{"antes": "pendiente", "despues": "impugnada"}'::jsonb, 'detalle del cambio';
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
-- ── Reglamento de Veracruz (veracruz.sql) ───────────────────────────
update configuracion set valor_uma = 117.31, descuento_pct = 75, dias_descuento = 5, descuento2_pct = 50, dias_descuento2 = 10,
  reglamento = 'Reglamento de la Ley Número 561 de Tránsito y Seguridad Vial para el Estado de Veracruz de Ignacio de la Llave' where id = 1;
do $$ begin
  assert (select count(*) from catalogo_infracciones where activo) = 357, 'catálogo vigente de Veracruz';
  assert (select count(*) from catalogo_infracciones where numero < 1000 and activo) = 0, 'catálogo de San Pedro inactivo';
  assert (select count(*) from reglamento_articulos) = 383, 'artículos del reglamento';
  assert fundamento_de(1091) like 'Artículos 75, 153 fracción IV, del Reglamento de la Ley Número 561%', 'fundamento con fracción';
  assert fundamento_de(1133) like 'Artículo 160 fracción I, del %', 'fundamento de un artículo';
  assert fundamento_de(1239) like 'Artículo 125 apartado A fracción I, del %', 'fundamento con apartado';
  assert (select grave from catalogo_infracciones where numero = 1011), 'ebriedad sin descuento';
  assert not (select grave from catalogo_infracciones where numero = 1133), 'celular conserva el descuento';
  assert (select tipo_rapido from catalogo_infracciones where numero = 1091) = 'Exceso de velocidad', 'tipo rápido';
end $$;

select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
do $$ declare v_id bigint; begin
  -- Celular (art. 160 fr. I): grave, 16 UMA y 30 con agravante
  begin
    insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('VER-001', 'X', 'Uso de celular al conducir', 800, 1133);
    raise exception 'monto fuera del tabulador';
  exception when others then if sqlerrm = 'monto fuera del tabulador' then raise; end if;
  end;
  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('VER-001', 'X', 'Uso de celular al conducir', 1876, 1133) returning id into v_id;
  assert (select fundamento from infracciones where id = v_id) like 'Artículo 160 fracción I, del Reglamento%', 'fundamento guardado';
  assert (registrar_pago(v_id, true, 'efectivo')).descuento_pct = 75, '75% dentro de 5 días';

  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero, fecha) values ('VER-002', 'X', 'Uso de celular al conducir', 1876, 1133, now() - interval '7 days') returning id into v_id;
  assert (registrar_pago(v_id, true, 'efectivo')).descuento_pct = 50, '50% del 6.º al 10.º día';

  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero, fecha) values ('VER-003', 'X', 'Uso de celular al conducir', 1876, 1133, now() - interval '12 days') returning id into v_id;
  begin
    perform registrar_pago(v_id, true, 'efectivo');
    raise exception 'descuento después del día 10';
  exception when others then if sqlerrm = 'descuento después del día 10' then raise; end if;
  end;

  -- Ebriedad (80/115 UMA): se paga íntegra
  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('VER-004', 'X', 'Conducir en estado de ebriedad', 9385, 1011) returning id into v_id;
  begin
    perform registrar_pago(v_id, true, 'efectivo');
    raise exception 'descuento en ebriedad';
  exception when others then if sqlerrm = 'descuento en ebriedad' then raise; end if;
  end;
  assert (registrar_pago(v_id, false, 'efectivo')).monto_final = 9385, 'ebriedad se cobra íntegra';

  -- Amonestación verbal: sin multa
  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero)
    select 'VER-005', 'X', 'Otro', 500, numero from catalogo_infracciones where clasificacion = 'Amonestación verbal' order by numero limit 1
    returning id into v_id;
  assert (select monto from infracciones where id = v_id) = 0, 'amonestación sin multa';

  -- Un número de catálogo de San Pedro ya no se puede usar
  begin
    insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('VER-006', 'X', 'Otro', 1407, 112);
    raise exception 'catálogo anterior todavía vigente';
  exception when others then if sqlerrm = 'catálogo anterior todavía vigente' then raise; end if;
  end;
  assert (select count(*) from reglamento_articulos where numero = '330') = 1, 'personal lee artículos';
end $$;
reset role;

set role anon;
do $$ begin
  assert (select fundamento from consulta_ciudadana('VER-004', true)) like 'Artículos 244%', 'portal muestra el fundamento';
  assert (select grave from consulta_ciudadana('VER-004', true)), 'portal sabe que no hay descuento';
  assert (parametros_descuento() ->> 'descuento2_pct')::int = 50, 'parámetros con dos tramos';
  assert (select count(*) from reglamento_articulos) = 0, 'anon no lee el reglamento interno';
end $$;
reset role;

-- ── Reporte mensual (reporte_mensual.sql) ────────────────────────────
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
do $$ begin
  perform reporte_mensual(null);
  raise exception 'oficial pudo ver el reporte mensual';
exception when raise_exception then
  if sqlerrm not like 'Sin permiso%' then raise; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'admin'), false);
set role authenticated;
do $$ declare j jsonb; begin
  j := reporte_mensual(date_trunc('month', now() at time zone 'America/Mexico_City')::date);
  assert (j ->> 'infracciones')::int >= 1, 'reporte cuenta las infracciones del mes';
  assert (j ->> 'recaudacion')::numeric = (select sum(monto_final) from pagos) and (j ->> 'recaudacion')::numeric > 0,
         'reporte suma la recaudación del mes';
  assert jsonb_array_length(j -> 'por_tipo') >= 1 and jsonb_typeof(j -> 'por_oficial') = 'array', 'reporte con desglose';
  assert reporte_mensual(null) ->> 'mes' = to_char((now() at time zone 'America/Mexico_City') - interval '1 month', 'YYYY-MM'), 'por omisión, el mes anterior';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false);
select set_config('request.jwt.claim.role', 'service_role', false);
do $$ begin
  assert reporte_mensual(null) is not null, 'envío automático con la llave de servicio';
end $$;
select set_config('request.jwt.claim.role', '', false);

-- ── Infracciones inmutables (inmutable.sql) ──────────────────────────
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'admin'), false);
set role authenticated;
do $$ declare v bigint; begin
  insert into infracciones (placa, infractor, tipo, monto) values ('INM-001', 'Fijo', 'Exceso de velocidad', 800) returning id into v;
  begin
    update infracciones set placa = 'OTRA-01' where id = v;
    raise exception 'se pudo cambiar la placa';
  exception when insufficient_privilege then null;
  end;
  begin
    update infracciones set monto = 1, obs = 'x' where id = v;
    raise exception 'se pudo cambiar el monto';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from infracciones where id = v;   -- RLS o el trigger lo impiden
  exception when insufficient_privilege then null;
  end;
  assert exists (select 1 from infracciones where id = v), 'se pudo borrar la infracción';
  -- El estado sí cambia: impugnación y cancelación con motivo
  update infracciones set estado = 'impugnada', impugnacion_motivo = 'No era yo' where id = v;
  update infracciones set estado = 'cancelada', cancelacion_motivo = 'Error de captura' where id = v;
  assert (select placa || estado || monto from infracciones where id = v) = 'INM-001cancelada800', 'solo cambió el estado';
end $$;
reset role;
do $$ begin
  -- Mantenimiento con el dueño de la base (migraciones) no se bloquea
  update infracciones set obs = 'migración' where placa = 'INM-001';
end $$;

\echo 'OK   pruebas de base de datos'
