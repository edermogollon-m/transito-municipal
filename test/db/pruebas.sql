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

-- Una de hace 12 días la registra el dueño de la base: la app ya no acepta fechas tan atrasadas (oficial.sql)
insert into infracciones (placa, infractor, tipo, monto, catalogo_numero, fecha) values ('VER-003', 'X', 'Uso de celular al conducir', 1876, 1133, now() - interval '12 days');
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

  select id into v_id from infracciones where placa = 'VER-003';
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
-- ── Trámites (tramites.sql) ─────────────────────────────────────────
do $$ begin
  assert sumar_dias_habiles('2026-10-21', 15) = '2026-11-11', '15 días hábiles sin fines de semana';
  assert sumar_dias_habiles('2026-10-23', 1) = '2026-10-26', 'del viernes al lunes';
end $$;
insert into infracciones (placa, infractor, tipo, monto, documento_retenido, documento_numero, licencia, catalogo_numero, fecha)
values ('TRA-001', 'X', 'Uso de celular al conducir', 1, 'licencia', 'L-1', 'LIC-9', 1133, now() - interval '2 days');
set role authenticated;
select pg_temp.como('caja');
do $$ declare v_id bigint := (select id from infracciones where placa = 'TRA-001'); begin
  begin
    perform devolver_documento(v_id, 'Juan', 'INE', '', '');
    raise exception 'caja devolvió sin pago';
  exception when others then if sqlerrm = 'caja devolvió sin pago' then raise; end if;
  end;
  perform registrar_pago(v_id, true, 'efectivo');
  assert (devolver_documento(v_id, 'Juan', 'INE', '', '')).devuelto_por = 'Caja', 'devolución tras el pago';
  begin
    perform devolver_documento(v_id, 'Juan', 'INE', '', '');
    raise exception 'se devolvió dos veces';
  exception when others then if sqlerrm = 'se devolvió dos veces' then raise; end if;
  end;
  assert not exists (select 1 from documentos_en_resguardo where id = v_id), 'ya no está en resguardo';
end $$;
reset role;
-- Historial del conductor: el oficial ve la reincidencia aunque no capturó esas boletas
set role authenticated;
select pg_temp.como('ofi');
do $$ begin
  assert (select count(*) from historial_conductor('lic 9')) = 1, 'historial por licencia (sin guiones ni mayúsculas)';
  assert (select count(*) from historial_conductor('L')) = 0, 'licencia demasiado corta';
end $$;
reset role;
-- Recurso de revocación: lo registra un mando; lo resuelve Jurídico o el Director
insert into infracciones (placa, infractor, tipo, monto, fecha) values ('TRA-002', 'X', 'Prueba', 500, '2026-10-21 10:00-06');
set role authenticated;
select pg_temp.como('ofi');
do $$ begin
  begin
    perform presentar_impugnacion((select id from infracciones where placa = 'TRA-002'), current_date, 'X', '', 'hechos');
    raise exception 'el oficial registró un recurso';
  exception when others then if sqlerrm = 'el oficial registró un recurso' then raise; end if;
  end;
end $$;
select pg_temp.como('sup');
do $$ declare v impugnaciones; begin
  v := presentar_impugnacion((select id from infracciones where placa = 'TRA-002'), '2026-11-12', 'Promovente', 'Calle 1', 'No era mi vehículo');
  assert v.plazo_vence = '2026-11-11' and v.extemporanea, 'extemporáneo al día siguiente del plazo';
  assert (select estado from infracciones where placa = 'TRA-002') = 'impugnada', 'la infracción queda impugnada';
  begin
    perform resolver_impugnacion(v.id, 'procedente', 'Se revoca la boleta por no acreditarse los hechos que la motivan, con fundamento en el artículo 383.');
    raise exception 'el supervisor resolvió el recurso';
  exception when others then if sqlerrm = 'el supervisor resolvió el recurso' then raise; end if;
  end;
end $$;
select pg_temp.como('juri');
do $$ declare v impugnaciones := (select i from impugnaciones i join infracciones f on f.id = i.infraccion_id where f.placa = 'TRA-002'); begin
  begin
    perform resolver_impugnacion(v.id, 'procedente', 'corta');
    raise exception 'resolución sin fundamentos';
  exception when others then if sqlerrm = 'resolución sin fundamentos' then raise; end if;
  end;
  v := resolver_impugnacion(v.id, 'procedente', 'Se revoca la boleta por no acreditarse los hechos que la motivan, con fundamento en el artículo 383.');
  assert v.estado = 'procedente' and v.resuelto_por = 'Lic. Jurídico', 'resolución registrada';
  assert (select estado || '|' || cancelacion_motivo from infracciones where placa = 'TRA-002') like 'cancelada|Recurso de revocación IMP-%', 'procedente cancela la infracción';
end $$;
reset role;
-- Avisos: la cola se arma solo con los canales activos; el recordatorio de
-- descuento por correo es de tareas-diarias, aquí solo va por WhatsApp
update configuracion set avisos_correo = true, avisos_whatsapp = true where id = 1;
insert into infracciones (placa, infractor, tipo, monto, infractor_correo, telefono, fecha) values ('TRA-003', 'X', 'Prueba', 500, 'a@b.mx', '228 123 4567', now() - interval '4 days 2 hours');
do $$ begin
  perform programar_avisos();
  assert exists (select 1 from avisos a join infracciones i on i.id = a.infraccion_id where i.placa = 'TRA-003' and a.canal = 'correo' and a.tipo = 'emision'), 'aviso de emisión por correo';
  assert (select destino from avisos a join infracciones i on i.id = a.infraccion_id where i.placa = 'TRA-003' and a.canal = 'whatsapp' and a.tipo = 'emision') = '522281234567', 'whatsapp con lada 52';
  assert exists (select 1 from avisos a join infracciones i on i.id = a.infraccion_id where i.placa = 'TRA-003' and a.canal = 'whatsapp' and a.tipo = 'descuento1'), 'aviso de descuento por WhatsApp';
  assert not exists (select 1 from avisos a join infracciones i on i.id = a.infraccion_id where i.placa = 'TRA-003' and a.canal = 'correo' and a.tipo like 'descuento%'), 'sin correo de descuento duplicado';
  assert programar_avisos() = 0, 'no duplica avisos';
  perform marcar_aviso((select min(id) from avisos), true);
  assert (select estado from avisos where id = (select min(id) from avisos)) = 'enviado', 'aviso marcado como enviado';
end $$;
update configuracion set avisos_correo = false, avisos_whatsapp = false where id = 1;
-- Pago en línea: monto con descuento e idempotencia por referencia
do $$ declare v_id bigint := (select id from infracciones where placa = 'TRA-003'); p pagos; begin
  assert (select descuento_pct from monto_a_pagar(v_id)) = 75, 'descuento vigente para el pago en línea';
  p := registrar_pago_en_linea(v_id, 'MP-1', 125);
  assert p.metodo = 'en_linea' and p.monto_final = 125, 'pago en línea asentado';
  assert (registrar_pago_en_linea(v_id, 'MP-1', 125)).id = p.id, 'la misma notificación no duplica el pago';
  assert (select estado from infracciones where id = v_id) = 'pagada', 'infracción pagada';
end $$;
set role anon;
do $$ begin
  begin
    perform registrar_pago_en_linea(1, 'MP-X', 1);
    raise exception 'anon registró un pago en línea';
  exception when others then if sqlerrm = 'anon registró un pago en línea' then raise; end if;
  end;
  assert (parametros_descuento() ? 'pago_en_linea'), 'el portal sabe si hay pago en línea';
end $$;
reset role;

-- Caja sin conexión: cobro diferido con la hora real y token idempotente
insert into infracciones (placa, infractor, tipo, monto, fecha) values ('DIF-001', 'Prueba', 'Exceso de velocidad', 1000, now() - interval '1 day');
insert into infracciones (placa, infractor, tipo, monto) values ('DEU-001', 'Prueba', 'Exceso de velocidad', 500);
set role authenticated;
do $$ declare v bigint := (select id from infracciones where placa = 'DIF-001'); t uuid := gen_random_uuid(); p pagos; p2 pagos; begin
  perform pg_temp.como('caja');
  begin
    perform registrar_pago_diferido(v, false, 'efectivo', '', now() - interval '30 days', gen_random_uuid());
    raise exception 'cobro de hace 30 días aceptado';
  exception when others then if sqlerrm = 'cobro de hace 30 días aceptado' then raise; end if;
  end;
  p := registrar_pago_diferido(v, true, 'efectivo', 'sin señal', now() - interval '1 hour', t);
  assert p.descuento_pct > 0 and p.token_verificacion = t, 'cobro diferido con descuento';
  p2 := registrar_pago_diferido(v, true, 'efectivo', 'sin señal', now() - interval '1 hour', t);
  assert p2.id = p.id, 'el mismo cobro no se registra dos veces';
  begin
    perform registrar_pago_diferido(v, false, 'efectivo', '', now(), gen_random_uuid());
    raise exception 'cobro doble diferido';
  exception when others then if sqlerrm = 'cobro doble diferido' then raise; end if;
  end;
  perform pg_temp.como('ofi');
  begin
    perform registrar_pago_diferido(v, false, 'efectivo', '', now(), gen_random_uuid());
    raise exception 'el oficial cobró sin conexión';
  exception when others then if sqlerrm = 'el oficial cobró sin conexión' then raise; end if;
  end;
end $$;
reset role;

-- Constancia de no adeudo: se paga en línea o en Caja y entonces se expide (constancias_cobro.sql)
set role anon;
do $$ declare s jsonb; s2 jsonb; c jsonb; begin
  begin
    perform emitir_constancia('DIF-001');
    raise exception 'constancia gratis';
  exception when others then if sqlerrm = 'constancia gratis' then raise; end if;
  end;
  s := solicitar_constancia('dif 001');
  assert (s ->> 'monto')::numeric = 150, 'costo de la constancia';
  s2 := solicitar_constancia('DIF-001');
  assert s2 ->> 'token' = s ->> 'token', 'reusa el cobro sin pagar';
  c := constancia_de_cobro((s ->> 'token')::uuid);
  assert not (c ->> 'pagada')::boolean and c ->> 'folio' is null, 'sin pagar no hay constancia';
  begin
    perform solicitar_constancia('DEU-001');
    raise exception 'constancia con adeudo';
  exception when others then if sqlerrm = 'constancia con adeudo' then raise; end if;
  end;
  begin
    perform registrar_pago_constancia((s ->> 'token')::uuid, 'MP-1', 150);
    raise exception 'el público asentó un pago';
  exception when others then if sqlerrm = 'el público asentó un pago' then raise; end if;
  end;
  begin
    assert (select count(*) from constancias) = 0, 'anónimo lee constancias';
  exception when insufficient_privilege then null;
  end;
  perform set_config('prueba.cnd', s ->> 'token', false);
end $$;
reset role;
-- Mercado Pago acredita el pago (la función pago-mp usa la llave de servicio)
do $$ declare t uuid := current_setting('prueba.cnd')::uuid; begin
  begin
    perform registrar_pago_constancia(t, 'MP-1', 100);
    raise exception 'aceptó un pago incompleto';
  exception when others then if sqlerrm = 'aceptó un pago incompleto' then raise; end if;
  end;
  perform registrar_pago_constancia(t, 'MP-1', 150);
  perform registrar_pago_constancia(t, 'MP-1', 150);   -- Mercado Pago avisa dos veces
  assert (select count(*) from constancias where placa = 'DIF001') = 1, 'una constancia por pago';
end $$;
set role anon;
do $$ declare c jsonb; v jsonb; begin
  c := constancia_de_cobro(current_setting('prueba.cnd')::uuid);
  assert (c ->> 'pagada')::boolean and c ->> 'folio' ~ '^CND-\d{2}-[2-9A-HJKMNP-Z]{6}$', 'constancia pagada en línea: ' || c::text;
  assert c ->> 'placa' = 'DIF-001' and c ->> 'metodo' = 'en_linea', 'datos de la constancia';
  v := verificar_documento((c ->> 'token')::uuid);
  assert v ->> 'tipo' = 'constancia' and v ->> 'estado' = 'vigente' and (v ->> 'adeudos_actuales')::int = 0, 'constancia verificable';
end $$;
reset role;
-- En ventanilla: Caja la cobra, la imprime y entra a su corte; el policía vial no
select pg_temp.como('caja');
set role authenticated;
do $$ declare c jsonb; antes numeric; r jsonb; begin
  antes := (resumen_corte() ->> 'efectivo')::numeric;
  c := cobrar_constancia_caja('DIF-001', 'efectivo');
  assert c ->> 'folio' like 'CND-%' and (c ->> 'monto')::numeric = 150 and c ->> 'cajero' = 'Caja', 'constancia cobrada en caja';
  r := resumen_corte();
  assert (r ->> 'efectivo')::numeric = antes + 150 and (r ->> 'num_constancias')::int = 1, 'la constancia entra al corte: ' || r::text;
  begin
    perform cobrar_constancia_caja('DEU-001', 'efectivo');
    raise exception 'caja cobró constancia con adeudo';
  exception when others then if sqlerrm = 'caja cobró constancia con adeudo' then raise; end if;
  end;
  perform pg_temp.como('ofi');
  begin
    perform cobrar_constancia_caja('DIF-001', 'efectivo');
    raise exception 'el oficial cobró una constancia';
  exception when others then if sqlerrm = 'el oficial cobró una constancia' then raise; end if;
  end;
end $$;
reset role;
-- Credencial verificable, placas reportadas e imagen institucional (institucional.sql)
select pg_temp.como('ofi');
set role authenticated;
do $$ declare t uuid; t2 uuid; v jsonb; n int; begin
  select token_credencial into t from usuarios where usuario = 'ofi';
  assert t is not null, 'token de credencial';
  begin
    perform regenerar_credencial((select id from usuarios where usuario = 'ofi'));
    raise exception 'el oficial repuso su credencial';
  exception when others then if sqlerrm = 'el oficial repuso su credencial' then raise; end if;
  end;
  begin
    insert into vehiculos_reportados (placa, motivo) values ('XYZ-1', 'robo');
    raise exception 'el oficial reportó una placa';
  exception when others then if sqlerrm = 'el oficial reportó una placa' then raise; end if;
  end;
  insert into alertas_placa (placa, motivo, oficial) values ('rob-123 a', 'Robo', 'Otro nombre');
  assert (select count(*) from alertas_placa) = 0, 'el oficial lee las alertas';
end $$;
reset role;
select pg_temp.como('sup');
set role authenticated;
do $$ declare r vehiculos_reportados; begin
  insert into vehiculos_reportados (placa, motivo, detalle) values ('rob-123 a', 'robo', 'denuncia') returning * into r;
  assert r.placa = 'ROB123A' and r.reportado_por = 'Supervisor', 'placa normalizada y quién reportó';
  begin
    insert into vehiculos_reportados (placa, motivo) values ('ROB123A', 'busqueda');
    raise exception 'placa reportada dos veces';
  exception when unique_violation then null;
  end;
  assert (select oficial from alertas_placa limit 1) = 'Oficial' and (select placa from alertas_placa limit 1) = 'ROB123A', 'el servidor pone al oficial de la alerta';
  update vehiculos_reportados set activo = false where id = r.id;
  assert (select retirado_por from vehiculos_reportados where id = r.id) = 'Supervisor', 'quién retiró el reporte';
end $$;
reset role;
select pg_temp.como('admin');
set role authenticated;
do $$ declare t uuid; t2 uuid; v jsonb; begin
  select token_credencial into t from usuarios where usuario = 'ofi';
  t2 := regenerar_credencial((select id from usuarios where usuario = 'ofi'));
  assert t2 <> t, 'credencial repuesta';
  update configuracion set color_institucional = '#7A1F3D', institucion = 'H. Ayuntamiento', escudo = 'data:image/png;base64,iVBORw0KGgo=' where id = 1;
  begin
    update configuracion set escudo = 'data:image/png;base64,x" onerror="alert(1)' where id = 1;
    raise exception 'escudo no válido aceptado';
  exception when check_violation then null;
  end;
  begin
    update usuarios set foto = 'https://ejemplo.com/foto.jpg' where usuario = 'ofi';
    raise exception 'foto no válida aceptada';
  exception when check_violation then null;
  end;
end $$;
reset role;
select set_config('prueba.token_cred', (select token_credencial::text from usuarios where usuario = 'ofi'), false);
set role anon;
do $$ declare v jsonb; begin
  v := verificar_oficial(current_setting('prueba.token_cred')::uuid);
  assert v ->> 'nombre' = 'Oficial' and (v ->> 'activo')::boolean and v ->> 'color' = '#7A1F3D' and not (v ? 'usuario'), 'verificación pública de la credencial';
  assert verificar_oficial(gen_random_uuid()) is null, 'credencial falsa';
  assert (portal_info() ->> 'institucion') = 'H. Ayuntamiento', 'portal con imagen institucional';
end $$;
reset role;
-- Consulta REPUVE (repuve.sql): el oficial registra el robo con un toque
select pg_temp.como('ofi');
set role authenticated;
do $$ declare r vehiculos_reportados; r2 vehiculos_reportados; begin
  r := reportar_robo_repuve('rpv-77 b', 'Consultado hoy.');
  assert r.placa = 'RPV77B' and r.motivo = 'robo' and r.activo and r.reportado_por = 'Oficial', 'reporte REPUVE del oficial';
  assert r.detalle like 'Reporte de robo en REPUVE.%Consultado hoy.', 'detalle del reporte REPUVE';
  r2 := reportar_robo_repuve('RPV77B');
  assert r2.id = r.id, 'el reporte REPUVE se duplicó';
  begin
    perform reportar_robo_repuve('a');
    raise exception 'placa corta aceptada';
  exception when others then if sqlerrm = 'placa corta aceptada' then raise; end if;
  end;
  assert (select repuve_url from configuracion where id = 1) like 'https://%', 'página del REPUVE por omisión';
end $$;
reset role;
select pg_temp.como('caja');
set role authenticated;
do $$ begin
  perform reportar_robo_repuve('CAJ123');
  raise exception 'caja reportó una placa';
exception when others then if sqlerrm = 'caja reportó una placa' then raise; end if;
end $$;
reset role;
do $$ begin
  begin
    update configuracion set repuve_url = 'javascript:alert(1)' where id = 1;
    raise exception 'página REPUVE no segura aceptada';
  exception when check_violation then null;
  end;
end $$;
reset role;
-- Portal ciudadano (ciudadano.sql): explicación, recibo, avisos viales y avisos al celular
insert into infracciones (placa, infractor, tipo, monto, catalogo_numero, fecha)
  select 'PQR-901', 'Ciudadano Prueba', 'Abandonar a personas lesionadas', 1000, 1001,
         now() - make_interval(days => dias_descuento) + interval '2 hours' from configuracion where id = 1;
insert into pagos (infraccion_id, folio_inf, monto_original, descuento_pct, monto_final, metodo, cajero)
  select id, folio, 900, 0, 900, 'efectivo', 'Caja' from infracciones where placa = 'ABC-123' limit 1;
set role anon;
do $$ declare v jsonb; id_inf bigint; r text[]; begin
  select id into id_inf from consulta_ciudadana('PQR901', true) limit 1;
  v := explicar_infraccion(id_inf, 'pqr 901');
  assert v ->> 'conducta' like 'Abandonar a personas lesionadas%', 'explicación: conducta';
  assert v ->> 'por_que' like '%auxiliar a los lesionados%', 'explicación: por qué importa';
  assert v ->> 'categoria' = 'Accidentes' and (v ->> 'cuotas_min')::int = 31, 'explicación: categoría y cuotas';
  assert explicar_infraccion(id_inf, 'ABC123') is null, 'explicación con otra placa';
  assert (select count(*) from explicaciones_categoria) = 0, 'anon lee la tabla de explicaciones';
  r := suscribir_push('https://push.example.com/abc', repeat('B', 87), repeat('a', 22), array['pqr-901', 'abc 123', 'x', 'PQR901']);
  assert r @> array['PQR901', 'ABC123'] and cardinality(r) = 2, 'placas del celular normalizadas';
  assert placas_push('https://push.example.com/abc') = r, 'placas registradas';
  begin
    perform suscribir_push('https://push.example.com/abc', repeat('B', 87), repeat('a', 22), array['AAA1','BBB2','CCC3','DDD4','EEE5','FFF6']);
    raise exception 'más de 5 placas';
  exception when others then if sqlerrm = 'más de 5 placas' then raise; end if;
  end;
  begin
    perform suscribir_push('http://inseguro', repeat('B', 87), repeat('a', 22), array['AAA1']);
    raise exception 'endpoint sin https';
  exception when check_violation then null;
  end;
  assert (select count(*) from suscripciones_push) = 0, 'anon lee las suscripciones';
  begin
    perform tomar_push(10);
    raise exception 'anon tomó avisos';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select pg_temp.como('ofi');
set role authenticated;
do $$ begin
  begin
    insert into avisos_viales (titulo) values ('Cierre');
    raise exception 'el oficial publicó un aviso vial';
  exception when insufficient_privilege then null;
  end;
  begin
    perform datos_recibo((select max(id) from pagos));
    raise exception 'el oficial leyó un recibo';
  exception when others then if sqlerrm = 'el oficial leyó un recibo' then raise; end if;
  end;
end $$;
reset role;
select pg_temp.como('sup');
set role authenticated;
do $$ declare a avisos_viales; begin
  insert into avisos_viales (titulo, texto, creado_por) values ('Cierre de la calle Comonfort', 'Por desfile, de 9 a 13 h.', 'Otro') returning * into a;
  assert a.creado_por = 'Supervisor', 'autor del aviso vial';
  insert into avisos_viales (titulo, desde) values ('Aviso futuro', current_date + 5);
end $$;
reset role;
select pg_temp.como('caja');
set role authenticated;
do $$ declare v jsonb; begin
  v := datos_recibo((select max(id) from pagos));
  assert v ->> 'recibo' like 'REC-%' and (v ->> 'monto')::numeric = 900 and v ->> 'token' is not null, 'datos del recibo';
end $$;
reset role;
set role anon;
do $$ begin
  assert (select count(*) from avisos_viales_vigentes()) = 1, 'avisos viales vigentes';
end $$;
reset role;
do $$ declare n int; tipos text[]; begin
  select count(*), array_agg(tipo order by tipo) into n, tipos from tomar_push(50);
  assert tipos @> array['aviso', 'descuento', 'multa'], 'avisos al celular: ' || coalesce(array_to_string(tipos, ','), 'ninguno');
  assert (select count(*) from tomar_push(50)) = 0, 'avisos al celular repetidos';
  perform desactivar_push('https://push.example.com/abc');
  assert not (select activo from suscripciones_push where endpoint = 'https://push.example.com/abc'), 'suscripción desactivada';
  perform suscribir_push('https://push.example.com/abc', repeat('B', 87), repeat('a', 22), array['PQR901']);
  perform cancelar_push('https://push.example.com/abc');
  assert placas_push('https://push.example.com/abc') = '{}', 'suscripción cancelada';
end $$;
reset role;
-- Pago en línea: el portal confirma el pago y obtiene el recibo
select set_config('prueba.tra003', id::text, false), set_config('prueba.def456', (select min(id) from infracciones where placa = 'DEF-456')::text, false) from infracciones where placa = 'TRA-003';
set role anon;
do $$ declare v_id bigint := current_setting('prueba.tra003')::bigint; v jsonb; begin
  v := pago_en_linea_estado(v_id, 'tra 003');
  assert (v ->> 'pagado')::boolean and v ->> 'estado' = 'pagada' and v ->> 'token' is not null, 'pago en línea confirmado: ' || coalesce(v::text, 'nulo');
  assert pago_en_linea_estado(v_id, 'OTRA99') is null, 'otra placa no ve el pago';
  assert (pago_en_linea_estado(current_setting('prueba.def456')::bigint, 'DEF-456') ->> 'pagado')::boolean is not null, 'estado de una infracción';
end $$;
reset role;
do $$ begin
  assert not exists (select 1 from auditoria where tabla = 'configuracion' and cambios ? 'escudo'), 'la bitácora copia el escudo';
end $$;
-- Aviso de privacidad (privacidad.sql): datos de la Unidad de Transparencia, públicos sin sesión
update configuracion set ut_correo = 'transparencia@misantla.gob.mx', domicilio_transito = 'Palacio Municipal s/n' where id = 1;
set role anon;
do $$ begin
  assert portal_info() ->> 'ut_correo' = 'transparencia@misantla.gob.mx' and portal_info() ->> 'domicilio_transito' = 'Palacio Municipal s/n', 'aviso de privacidad en el portal';
  assert portal_info() ? 'privacidad_actualizado', 'fecha del aviso de privacidad';
end $$;
reset role;
-- La boleta del policía vial lleva su nombre y no puede tener fecha futura (oficial.sql)
select set_config('request.jwt.claim.sub', (select auth_id::text from usuarios where usuario = 'ofi'), false);
set role authenticated;
do $$ declare v bigint; begin
  insert into infracciones (placa, infractor, tipo, monto, oficial) values ('OFI-001', 'X', 'Prueba', 500, 'Otro Agente') returning id into v;
  assert (select oficial from infracciones where id = v) = 'Oficial', 'el oficial levantó a nombre de otro';
  begin
    insert into infracciones (placa, infractor, tipo, monto, fecha) values ('OFI-002', 'X', 'Prueba', 500, now() + interval '6 hours');
    raise exception 'aceptó una fecha futura';
  exception when others then if sqlerrm = 'aceptó una fecha futura' then raise; end if;
  end;
  insert into infracciones (placa, infractor, tipo, monto, fecha) values ('OFI-003', 'X', 'Prueba', 500, now() - interval '2 days');
  perform pg_temp.como('sup');
  insert into infracciones (placa, infractor, tipo, monto, oficial) values ('OFI-004', 'X', 'Prueba', 500, 'Oficial') returning id into v;
  assert (select oficial from infracciones where id = v) = 'Oficial', 'el supervisor elige al oficial';
  -- Nadie (ni el supervisor) registra con fecha de hace más de 7 días ni la cambia después
  begin
    insert into infracciones (placa, infractor, tipo, monto, fecha) values ('OFI-005', 'X', 'Prueba', 500, now() - interval '10 days');
    raise exception 'aceptó una fecha de hace 10 días';
  exception when others then if sqlerrm = 'aceptó una fecha de hace 10 días' then raise; end if;
  end;
  begin
    update infracciones set fecha = fecha - interval '1 hour' where id = v;
    raise exception 'dejó cambiar la fecha';
  exception when others then if sqlerrm = 'dejó cambiar la fecha' then raise; end if;
  end;
end $$;
reset role;
\echo 'OK   pruebas de base de datos'
