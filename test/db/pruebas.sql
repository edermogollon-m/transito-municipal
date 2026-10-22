-- Pruebas de schema.sql + security_auth.sql. Cualquier fallo aborta.
\set ON_ERROR_STOP 1

-- Folios automáticos
insert into infracciones (placa, infractor, tipo) values ('ABC-123', 'Prueba', 'Exceso de velocidad');
do $$ begin
  assert (select folio from infracciones order by id desc limit 1) ~ '^MIS-\d{2}-[2-9A-HJKMNP-Z]{6}$', 'folio de infracción no consecutivo';
end $$;

-- Migración de usuarios: misma contraseña, ahora con bcrypt en auth.users
do $$ begin
  assert not exists (select 1 from information_schema.columns
                     where table_name = 'usuarios' and column_name = 'contrasena'), 'columna contrasena sigue existiendo';
  assert (select count(*) from usuarios where auth_id is null) = 0, 'usuarios sin cuenta de Auth';
  assert (select encrypted_password = extensions.crypt('secreto', encrypted_password)
          from auth.users where email = 'admin@transito.local'), 'contraseña del admin no se conservó';
  assert (select count(*) from auth.identities) = 4, 'identidades de Auth';
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

-- Cambia el usuario de la sesión simulada (roles.sql separa funciones)
create or replace function pg_temp.como(p_usuario text) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', (select auth_id::text from public.usuarios where usuario = p_usuario), false) $$;

-- El oficial levanta; Caja cobra (vuelve a la sesión del oficial al terminar)
create or replace function pg_temp.cobrar(p_id bigint, p_desc boolean) returns public.pagos language plpgsql as $$
declare p public.pagos;
begin
  perform pg_temp.como('caja');
  begin p := public.registrar_pago(p_id, p_desc, 'efectivo');
  exception when others then perform pg_temp.como('ofi'); raise; end;
  perform pg_temp.como('ofi');
  return p;
end $$;

-- ── Bitácora (auditoria.sql) ─────────────────────────────────────────
-- El oficial cambia una infracción: queda quién, qué campo, antes y después
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
do $$ declare v bigint; begin
  insert into infracciones (placa, infractor, tipo, monto) values ('AUD-001', 'Auditado', 'Exceso de velocidad', 800) returning id into v;
  perform pg_temp.como('sup');   -- los cambios de estado son de los mandos (roles.sql)
  update infracciones set estado = 'impugnada', impugnacion_motivo = 'No era yo' where id = v;
  update infracciones set estado = 'impugnada' where id = v;   -- sin cambios reales: no registra
  perform pg_temp.como('ofi');
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
  assert (select resumen from auditoria where registro_id = v and accion = 'alta') like 'MIS-%', 'resumen con folio';
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
  begin
    perform registrar_pago(v_id, true, 'efectivo');
    raise exception 'el oficial pudo cobrar';
  exception when others then if sqlerrm = 'el oficial pudo cobrar' then raise; end if;
  end;
  perform pg_temp.como('caja');   -- quien levanta la multa no la cobra
  p := registrar_pago(v_id, true, 'efectivo');
  assert p.monto_final = 900 and p.descuento_pct = 10, 'descuento calculado en el servidor';
  assert p.cajero = 'Caja', 'cajero = usuario en sesión';
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
  -- El oficial no cambia estados (controles.sql: ni siquiera ve la fila para actualizarla)
  begin
    update infracciones set estado = 'pagada' where id = v_id;
  exception when others then null;
  end;
  begin
    update infracciones set estado = 'cancelada', cancelacion_motivo = 'x' where id = v_id;
  exception when others then null;
  end;
  assert (select estado from infracciones where id = v_id) = 'pendiente', 'el oficial cambió el estado';
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
  -- Celular (art. 160 fr. I): grave, 16 UMA y 30 con agravante; el monto lo fija el servidor
  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('VER-001', 'X', 'Uso de celular al conducir', 800, 1133) returning id into v_id;
  assert (select monto from infracciones where id = v_id) = 1876, 'UMA base sin agravantes';
  assert (select fundamento from infracciones where id = v_id) like 'Artículo 160 fracción I, del Reglamento%', 'fundamento guardado';
  assert (pg_temp.cobrar(v_id, true)).descuento_pct = 75, '75% dentro de 5 días';

  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero, fecha) values ('VER-002', 'X', 'Uso de celular al conducir', 1876, 1133, now() - interval '7 days') returning id into v_id;
  assert (pg_temp.cobrar(v_id, true)).descuento_pct = 50, '50% del 6.º al 10.º día';

  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero, fecha) values ('VER-003', 'X', 'Uso de celular al conducir', 1876, 1133, now() - interval '12 days') returning id into v_id;
  begin
    perform pg_temp.cobrar(v_id, true);
    raise exception 'descuento después del día 10';
  exception when others then if sqlerrm = 'descuento después del día 10' then raise; end if;
  end;

  -- Ebriedad (80/115 UMA): se paga íntegra
  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('VER-004', 'X', 'Conducir en estado de ebriedad', 9385, 1011) returning id into v_id;
  begin
    perform pg_temp.cobrar(v_id, true);
    raise exception 'descuento en ebriedad';
  exception when others then if sqlerrm = 'descuento en ebriedad' then raise; end if;
  end;
  assert (pg_temp.cobrar(v_id, false)).monto_final = 9384, 'ebriedad se cobra íntegra';

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

-- ── Boleta: arts. 327 y 331 (boleta.sql) ────────────────────────────
update usuarios set numero_placa = 'PV-7', adscripcion = 'Delegación Misantla' where usuario = 'ofi';
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
do $$ declare v_id bigint; v_id2 bigint; begin
  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero, oficial, circunstancias, boleta,
                            infractor_domicilio, infractor_correo, licencia_tipo)
  values ('BOL-001', 'X', 'Conducir sin licencia', 1, 1216, 'Oficial', '["agr_g","ate_d"]', 'GRUPO-A', 'Calle 1', 'x@x.mx', 'Automovilista')
  returning id into v_id;
  assert (select monto from infracciones where id = v_id) = 3519, 'con agravante: 30 UMA';
  assert (select oficial_placa || '|' || oficial_adscripcion from infracciones where id = v_id) = 'PV-7|Delegación Misantla', 'placa y adscripción del policía vial';
  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero, boleta)
  values ('BOL-001', 'X', 'Uso de celular al conducir', 1, 1133, 'GRUPO-A') returning id into v_id2;
  assert (select count(*) from infracciones where boleta = 'GRUPO-A') = 2, 'varias infracciones en una boleta';
  begin
    update infracciones set circunstancias = '["agr_e"]' where id = v_id2;
  exception when insufficient_privilege then null;   -- inmutable.sql (y el oficial no actualiza: controles.sql)
  end;
  assert (select circunstancias::text from infracciones where id = v_id2) = '[]', 'se pudieron cambiar las circunstancias';
  insert into infracciones (placa, infractor, tipo, monto, catalogo_numero) values ('BOL-002', 'X', 'Uso de celular al conducir', 1, 1133) returning id into v_id;
  assert (select boleta = folio from infracciones where id = v_id), 'sin grupo, la boleta es el folio';
  begin
    insert into infracciones (placa, infractor, tipo, monto, catalogo_numero, circunstancias) values ('BOL-003', 'X', 'Otro', 1, 1133, '["agr_z"]');
    raise exception 'circunstancia inventada aceptada';
  exception when others then if sqlerrm = 'circunstancia inventada aceptada' then raise; end if;
  end;
  assert (select count(*) from circunstancias_331) = 14, 'circunstancias del art. 331';
end $$;
reset role;
-- El recálculo por circunstancias sigue funcionando (mantenimiento con el dueño de la base)
do $$ declare v_id2 bigint := (select id from infracciones where boleta = 'GRUPO-A' and catalogo_numero = 1133); begin
  update infracciones set circunstancias = '["agr_e"]' where id = v_id2;
  assert (select monto from infracciones where id = v_id2) = 3519, 'agravante agregada recalcula el monto';
  update infracciones set circunstancias = '[]' where id = v_id2;
  assert (select monto from infracciones where id = v_id2) = 1876, 'sin agravantes vuelve a la UMA base';
end $$;

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

-- ── Roles y separación de funciones (roles.sql) ─────────────────────
insert into infracciones (placa, infractor, tipo, monto) values ('ROL-ofi','X','Prueba',100), ('ROL-sup','X','Prueba',100), ('ROL-caja','X','Prueba',100), ('ROL-admin','X','Prueba',100);
create temp table matriz (usuario text, prueba text, ok boolean);
grant all on matriz to authenticated;
create or replace function pg_temp.probar_rol(u text) returns void language plpgsql as $$
declare n int;
begin
  perform pg_temp.como(u);
  begin insert into public.infracciones (placa, infractor, tipo, monto) values ('ROL-X','X','Prueba',1); insert into matriz values (u,'levantar',true);
  exception when others then insert into matriz values (u,'levantar',false); end;
  begin update public.infracciones set estado='impugnada', impugnacion_motivo='x' where placa='ROL-'||u; get diagnostics n = row_count; insert into matriz values (u,'estado',n>0);
  exception when others then insert into matriz values (u,'estado',false); end;
  begin perform public.registrar_pago((select id from public.infracciones where placa='ROL-'||u), false, 'efectivo'); insert into matriz values (u,'cobrar',true);
  exception when others then insert into matriz values (u,'cobrar',false); end;
  insert into matriz values (u,'ver pagos', (select count(*) from public.pagos) > 0);
  begin insert into public.permisos (titular, tipo, ruta, vencimiento) values ('X','taxi','R', current_date+1); insert into matriz values (u,'permiso',true);
  exception when others then insert into matriz values (u,'permiso',false); end;
  update public.configuracion set director = director where id = 1; get diagnostics n = row_count; insert into matriz values (u,'configurar',n>0);
end $$;
set role authenticated;
select pg_temp.probar_rol('admin'); select pg_temp.probar_rol('sup'); select pg_temp.probar_rol('ofi'); select pg_temp.probar_rol('caja');
reset role;
do $$
declare esperado jsonb := '{
  "admin": {"levantar":true,"estado":true,"cobrar":true,"ver pagos":true,"permiso":true,"configurar":true},
  "sup":   {"levantar":true,"estado":true,"cobrar":false,"ver pagos":true,"permiso":true,"configurar":false},
  "ofi":   {"levantar":true,"estado":false,"cobrar":false,"ver pagos":false,"permiso":false,"configurar":false},
  "caja":  {"levantar":false,"estado":false,"cobrar":true,"ver pagos":true,"permiso":false,"configurar":false}}';
  m record;
begin
  for m in select * from matriz loop
    assert m.ok = (esperado -> m.usuario ->> m.prueba)::boolean, format('rol %s, %s: %s', m.usuario, m.prueba, m.ok);
  end loop;
  assert (select count(*) from matriz) = 24, 'matriz completa';
end $$;
-- Siempre queda un administrador activo
select pg_temp.como('admin');
set role authenticated;
do $$ begin
  begin
    update usuarios set activo = false where usuario = 'admin';
    raise exception 'se desactivó el último administrador';
  exception when others then if sqlerrm = 'se desactivó el último administrador' then raise; end if;
  end;
  begin
    perform admin_guardar_usuario((select id from usuarios where usuario = 'admin'), 'Admin', 'admin', 'supervisor', 'AD', null);
    raise exception 'el administrador se quitó su rol';
  exception when others then if sqlerrm = 'el administrador se quitó su rol' then raise; end if;
  end;
  assert admin_guardar_usuario(null, 'Nueva Caja', 'caja2', 'cajero', 'NC', 'clave123') > 0, 'alta de cajero';
end $$;
reset role;

-- ── Controles por rol (controles.sql) ───────────────────────────────
select pg_temp.como('admin');
set role authenticated;
do $$ declare v_clave text; begin
  perform admin_guardar_usuario(null, 'Lic. Jurídico', 'juri', 'juridico', 'LJ', 'clave123');
  perform admin_guardar_usuario(null, 'Corralón', 'corral', 'corralon', 'CO', 'clave123');
  perform admin_guardar_usuario(null, 'Contralora', 'contra', 'contraloria', 'CT', 'clave123');
  v_clave := admin_restablecer_contrasena((select id from usuarios where usuario = 'corral'));
  assert length(v_clave) = 8, 'contraseña temporal de 8 caracteres';
end $$;
reset role;
do $$ begin
  assert (select encrypted_password = extensions.crypt('clave123', encrypted_password) from auth.users u join usuarios x on x.auth_id = u.id where x.usuario = 'corral') = false,
    'la contraseña no cambió';
end $$;
select pg_temp.como('ofi');
set role authenticated;
do $$ begin
  begin
    perform admin_restablecer_contrasena((select id from usuarios where usuario = 'admin'));
    raise exception 'el oficial restableció una contraseña';
  exception when others then if sqlerrm = 'el oficial restableció una contraseña' then raise; end if;
  end;
end $$;
reset role;

-- Impugnaciones: el supervisor registra, Jurídico resuelve
insert into infracciones (placa, infractor, tipo, monto) values ('IMP-001', 'X', 'Prueba', 500), ('IMP-002', 'X', 'Prueba', 500);
set role authenticated;
do $$ declare v bigint := (select id from infracciones where placa = 'IMP-001'); begin
  perform pg_temp.como('sup');
  update infracciones set estado = 'impugnada', impugnacion_motivo = 'No era yo' where id = v;
  begin
    update infracciones set estado = 'cancelada', cancelacion_motivo = 'Procede' where id = v;
    raise exception 'el supervisor resolvió la impugnación';
  exception when others then if sqlerrm = 'el supervisor resolvió la impugnación' then raise; end if;
  end;
  perform pg_temp.como('juri');
  update infracciones set estado = 'cancelada', cancelacion_motivo = 'Impugnación procedente' where id = v;
  assert (select estado from infracciones where id = v) = 'cancelada', 'Jurídico resuelve';
  begin
    update infracciones set estado = 'cancelada', cancelacion_motivo = 'x' where placa = 'IMP-002';
    raise exception 'Jurídico canceló sin impugnación';
  exception when others then if sqlerrm = 'Jurídico canceló sin impugnación' then raise; end if;
  end;
end $$;
reset role;

-- Pagos: nadie los edita; el Director los anula con motivo
insert into infracciones (placa, infractor, tipo, monto, fecha) values ('ANU-001', 'X', 'Prueba', 1000, now());
set role authenticated;
do $$ declare v bigint := (select id from infracciones where placa = 'ANU-001'); p pagos; n int; begin
  perform pg_temp.como('caja');
  p := registrar_pago(v, false, 'efectivo');
  update pagos set monto_final = 1 where id = p.id; get diagnostics n = row_count;
  assert n = 0, 'Caja editó un pago';
  begin
    perform anular_pago(p.id, 'error');
    raise exception 'Caja anuló un pago';
  exception when others then if sqlerrm = 'Caja anuló un pago' then raise; end if;
  end;
  perform pg_temp.como('admin');
  begin
    update pagos set monto_final = 1 where id = p.id; get diagnostics n = row_count;
    assert n = 0, 'el Director editó un pago';
  exception when insufficient_privilege then null;
  end;
  begin
    perform anular_pago(p.id, ' ');
    raise exception 'anulación sin motivo';
  exception when others then if sqlerrm = 'anulación sin motivo' then raise; end if;
  end;
  perform anular_pago(p.id, 'Se cobró a la placa equivocada');
  assert not exists (select 1 from pagos where id = p.id), 'el pago sigue vigente';
  assert (select anulacion_motivo || '|' || anulado_por from pagos_anulados where id = p.id) = 'Se cobró a la placa equivocada|Admin', 'registro de la anulación';
  assert (select estado from infracciones where id = v) = 'pendiente', 'la infracción vuelve a pendiente';
  assert verificar_documento(p.token_verificacion) ->> 'estado' = 'anulado', 'el QR dice anulado';
  perform pg_temp.como('caja');
  p := registrar_pago(v, false, 'tarjeta');   -- se puede volver a cobrar
  assert p.monto_final = 1000, 'nuevo cobro';
end $$;
reset role;

-- Corte de caja: efectivo contado contra el sistema
set role authenticated;
do $$ declare r jsonb; c cortes_caja; begin
  perform pg_temp.como('caja');
  r := resumen_corte();
  assert (r ->> 'num_pagos')::int >= 1, 'pagos del día en el corte';
  c := cerrar_corte((r ->> 'efectivo')::numeric - 50, 'Faltaron 50');
  assert c.diferencia = -50 and c.cajero = 'Caja', 'diferencia del corte';
  r := resumen_corte();
  assert (r ->> 'num_pagos')::int = 0, 'el siguiente corte empieza después del anterior';
  perform pg_temp.como('ofi');
  begin
    perform cerrar_corte(0);
    raise exception 'el oficial hizo un corte';
  exception when others then if sqlerrm = 'el oficial hizo un corte' then raise; end if;
  end;
  assert (select count(*) from cortes_caja) = 0, 'el oficial ve los cortes';
  perform pg_temp.como('contra');
  assert (select count(*) from cortes_caja) = 1 and (select count(*) from pagos) > 0 and (select count(*) from auditoria) > 0,
    'Contraloría ve caja y bitácora';
end $$;
reset role;

-- Contraloría no cambia nada; Corralón solo grúa
set role authenticated;
do $$ declare n int; begin
  perform pg_temp.como('contra');
  begin insert into infracciones (placa, infractor, tipo, monto) values ('CON-1','X','Prueba',1); raise exception 'Contraloría levantó';
  exception when others then if sqlerrm = 'Contraloría levantó' then raise; end if; end;
  update infracciones set estado = 'impugnada', impugnacion_motivo = 'x' where placa = 'IMP-002'; get diagnostics n = row_count;
  assert n = 0, 'Contraloría cambió un estado';
  begin insert into grua (placa) values ('CON-1'); raise exception 'Contraloría metió a corralón';
  exception when others then if sqlerrm = 'Contraloría metió a corralón' then raise; end if; end;
  perform pg_temp.como('corral');
  insert into grua (placa) values ('COR-1');
  update grua set estado = 'liberado' where placa = 'COR-1'; get diagnostics n = row_count;
  assert n = 1, 'Corralón libera';
  begin insert into infracciones (placa, infractor, tipo, monto) values ('COR-1','X','Prueba',1); raise exception 'Corralón levantó';
  exception when others then if sqlerrm = 'Corralón levantó' then raise; end if; end;
end $$;
reset role;

-- Nada se borra; accidentes: el oficial edita solo los suyos en proceso
insert into accidentes (tipo, oficial, estado) values ('choque', 'Otro Agente', 'en_proceso');
set role authenticated;
do $$ declare n int; v uuid; begin
  perform pg_temp.como('ofi');
  insert into accidentes (tipo, estado) values ('choque', 'en_proceso') returning id into v;
  update accidentes set descripcion = 'actualizado' where id = v; get diagnostics n = row_count;
  assert n = 1, 'el oficial edita su accidente';
  update accidentes set estado = 'cerrado' where id = v;
  update accidentes set descripcion = 'otra vez' where id = v; get diagnostics n = row_count;
  assert n = 0, 'el oficial editó un accidente cerrado';
  update accidentes set descripcion = 'ajeno' where oficial = 'Otro Agente'; get diagnostics n = row_count;
  assert n = 0, 'el oficial editó un accidente ajeno';
  perform pg_temp.como('sup');
  update accidentes set descripcion = 'revisado' where id = v; get diagnostics n = row_count;
  assert n = 1, 'el supervisor edita cualquiera';
  delete from accidentes where id = v; get diagnostics n = row_count;
  assert n = 0, 'el supervisor borró un accidente';
  delete from grua; get diagnostics n = row_count;
  assert n = 0, 'el supervisor borró grúas';
  perform pg_temp.como('admin');
  delete from permisos; get diagnostics n = row_count;
  assert n = 0, 'el Director borró permisos';
end $$;
reset role;

-- ── Errores de la app y datos de transferencia (mejoras.sql) ────────
select pg_temp.como('ofi');
set role authenticated;
do $$ begin
  insert into errores_app (pagina, mensaje) values ('/', 'TypeError: x is undefined');
  assert (select count(*) from errores_app) = 0, 'el oficial lee los errores';
end $$;
select pg_temp.como('admin');
do $$ begin
  assert (select usuario from errores_app where mensaje like 'TypeError%') = 'Oficial', 'error con el usuario';
  update configuracion set pago_clabe = '012345678901234567', pago_banco = 'BBVA' where id = 1;
end $$;
reset role;
set role anon;
do $$ begin
  begin
    insert into errores_app (mensaje) values ('spam');
    raise exception 'anon escribió errores';
  exception when others then if sqlerrm = 'anon escribió errores' then raise; end if;
  end;
  assert portal_info() ->> 'pago_clabe' = '012345678901234567', 'CLABE en el portal';
end $$;
reset role;

-- El folio lo pone siempre el servidor, nunca se repite
insert into infracciones (placa, infractor, tipo, folio) values ('FOL-001', 'Prueba', 'Exceso de velocidad', 'INF-2026-0001');
do $$ begin
  assert (select folio from infracciones where placa = 'FOL-001') like 'MIS-%', 'el cliente no elige el folio';
  assert (select count(distinct public.nuevo_folio_inf()) from generate_series(1, 200)) = 200, 'folios distintos';
end $$;
\echo 'OK   pruebas de base de datos'
