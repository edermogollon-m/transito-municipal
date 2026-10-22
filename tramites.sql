-- ═══════════════════════════════════════════════════════════════════
-- Trámites: retención de documentos, recurso de revocación, avisos al
-- ciudadano, pago en línea (Mercado Pago) y firmas en la boleta.
--
-- * Retención (arts. 343 y 344 del Reglamento de la Ley 561): el policía vial
--   puede retener la licencia o permiso, o la tarjeta de circulación. Se anota
--   en la boleta y se devuelve con firma de quien lo recoge (devoluciones).
-- * Recurso de revocación (art. 383 del Reglamento; arts. 43, 260 a 262 del
--   Código de Procedimientos Administrativos): expediente con fecha de
--   presentación, plazo de 15 días hábiles, pruebas y resolución escrita.
-- * Avisos: cola de correos y WhatsApp (emisión, antes de que venza cada
--   descuento y al vencer). Los envía la función avisos cada 15 minutos.
-- * Pago en línea: la función pago-mp crea el cobro en Mercado Pago y, cuando
--   el pago se acredita, registrar_pago_en_linea lo asienta (solo la llave de
--   servicio puede llamarla).
-- * Firmas del infractor y del policía vial capturadas en el teléfono.
--
-- Recursos: los registran supervisor, Jurídico o el Director y los resuelve
-- Jurídico o el Director (controles.sql).
-- Correr después de mejoras.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ── Columnas nuevas de la boleta (se capturan al registrarla) ──
alter table public.infracciones add column if not exists documento_retenido text not null default ''
  check (documento_retenido in ('', 'licencia', 'tarjeta_circulacion'));
alter table public.infracciones add column if not exists documento_numero text not null default '';
alter table public.infracciones add column if not exists firma_infractor text not null default '';   -- imagen PNG (data URL)
alter table public.infracciones add column if not exists firma_oficial   text not null default '';
alter table public.infracciones add column if not exists firma_negada    boolean not null default false;
create index if not exists infracciones_licencia_idx
  on public.infracciones (upper(regexp_replace(licencia, '[^A-Za-z0-9]', '', 'g'))) where licencia <> '';

alter table public.configuracion add column if not exists resguardo_lugar text default 'Delegación de Tránsito';
alter table public.configuracion add column if not exists avisos_correo boolean not null default false;
alter table public.configuracion add column if not exists avisos_whatsapp boolean not null default false;
alter table public.configuracion add column if not exists pago_en_linea boolean not null default false;
alter table public.configuracion add column if not exists app_url text default 'https://transito-municipal.vercel.app';

-- ── Días hábiles (art. 43 del Código: sin sábados ni domingos) ──
create or replace function public.sumar_dias_habiles(p_desde date, p_dias integer)
returns date
language plpgsql immutable
set search_path = public
as $$
declare d date := p_desde; n int := 0;
begin
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- ═══ 1. Devolución de documentos retenidos ════════════════
create table if not exists public.devoluciones (
  id             bigserial primary key,
  infraccion_id  bigint not null unique references public.infracciones(id),
  entregado_a    text not null,
  identificacion text not null default '',
  firma          text not null default '',            -- firma de quien recoge (data URL)
  devuelto_por   text not null,
  notas          text not null default '',
  created_at     timestamptz not null default now()
);
alter table public.devoluciones enable row level security;
drop policy if exists personal_select on public.devoluciones;
create policy personal_select on public.devoluciones for select to authenticated using (public.mi_rol() is not null);

-- Se devuelve cuando la multa está pagada o cancelada; un mando puede
-- devolverlo antes indicando el motivo.
create or replace function public.devolver_documento(
  p_infraccion_id bigint, p_entregado_a text, p_identificacion text, p_firma text, p_notas text default '')
returns public.devoluciones
language plpgsql security definer
set search_path = public
as $$
declare v_inf public.infracciones%rowtype; v_usr public.usuarios%rowtype; v public.devoluciones;
begin
  select * into v_usr from public.usuarios where auth_id = auth.uid() and activo;
  if v_usr.rol is null or v_usr.rol not in ('admin','supervisor','cajero') then
    raise exception 'Solo Caja o un mando pueden devolver documentos retenidos';
  end if;
  select * into v_inf from public.infracciones where id = p_infraccion_id for update;
  if not found then raise exception 'Infracción no encontrada'; end if;
  if v_inf.documento_retenido = '' then raise exception 'Esta infracción no tiene documentos retenidos'; end if;
  if exists (select 1 from public.devoluciones where infraccion_id = p_infraccion_id) then
    raise exception 'El documento ya fue devuelto';
  end if;
  if coalesce(trim(p_entregado_a), '') = '' then raise exception 'Indica a quién se entrega el documento'; end if;
  if v_inf.estado not in ('pagada','cancelada') then
    if v_usr.rol not in ('admin','supervisor') then
      raise exception 'La multa %: aún no está pagada. Solo un mando puede devolver el documento antes del pago', v_inf.folio;
    end if;
    if coalesce(trim(p_notas), '') = '' then raise exception 'Indica el motivo de la devolución antes del pago'; end if;
  end if;
  insert into public.devoluciones (infraccion_id, entregado_a, identificacion, firma, devuelto_por, notas)
  values (p_infraccion_id, trim(p_entregado_a), coalesce(p_identificacion, ''), coalesce(p_firma, ''), v_usr.nombre, coalesce(p_notas, ''))
  returning * into v;
  return v;
end $$;
revoke all on function public.devolver_documento(bigint, text, text, text, text) from public, anon;
grant execute on function public.devolver_documento(bigint, text, text, text, text) to authenticated;

-- Documentos en resguardo (sin devolver)
create or replace view public.documentos_en_resguardo with (security_invoker = true) as
  select i.id, i.folio, i.fecha, i.placa, i.infractor, i.documento_retenido, i.documento_numero, i.estado, i.monto, i.oficial
  from public.infracciones i
  where i.documento_retenido <> '' and not exists (select 1 from public.devoluciones d where d.infraccion_id = i.id);
grant select on public.documentos_en_resguardo to authenticated;

-- ═══ 2. Recurso de revocación ═════════════════════════════
create sequence if not exists public.impugnacion_folio_seq;
create table if not exists public.impugnaciones (
  id             bigserial primary key,
  folio          text not null unique,
  infraccion_id  bigint not null unique references public.infracciones(id),
  presentada_el  date not null,
  promovente     text not null,
  domicilio      text not null default '',
  hechos         text not null,
  pruebas        jsonb not null default '[]',       -- rutas en Storage (evidencias/impugnaciones/…)
  plazo_vence    date not null,
  extemporanea   boolean not null default false,
  estado         text not null default 'en_tramite' check (estado in ('en_tramite','procedente','improcedente','desechada')),
  resolucion     text not null default '',
  resuelto_por   text not null default '',
  resuelto_el    timestamptz,
  registrado_por text not null,
  created_at     timestamptz not null default now()
);
alter table public.impugnaciones enable row level security;
drop policy if exists personal_select on public.impugnaciones;
create policy personal_select on public.impugnaciones for select to authenticated using (public.mi_rol() is not null);

create or replace function public.presentar_impugnacion(
  p_infraccion_id bigint, p_presentada_el date, p_promovente text, p_domicilio text, p_hechos text, p_pruebas jsonb default '[]')
returns public.impugnaciones
language plpgsql security definer
set search_path = public
as $$
declare v_inf public.infracciones%rowtype; v_usr public.usuarios%rowtype; v public.impugnaciones; v_vence date;
begin
  select * into v_usr from public.usuarios where auth_id = auth.uid() and activo;
  if v_usr.rol is null or v_usr.rol not in ('admin','supervisor','juridico') then
    raise exception 'Solo un supervisor, Jurídico o el Director registran recursos de revocación';
  end if;
  select * into v_inf from public.infracciones where id = p_infraccion_id for update;
  if not found then raise exception 'Infracción no encontrada'; end if;
  if v_inf.estado not in ('pendiente','vencida') then raise exception 'La infracción % está %: no se puede impugnar', v_inf.folio, v_inf.estado; end if;
  if exists (select 1 from public.impugnaciones where infraccion_id = p_infraccion_id) then raise exception 'La infracción ya tiene un recurso registrado'; end if;
  if coalesce(trim(p_promovente), '') = '' or coalesce(trim(p_hechos), '') = '' then raise exception 'Indica quién promueve y los hechos o agravios'; end if;
  -- La boleta se entrega en el acto: surte efectos el día de la infracción
  v_vence := public.sumar_dias_habiles((v_inf.fecha at time zone 'America/Mexico_City')::date, 15);
  insert into public.impugnaciones (folio, infraccion_id, presentada_el, promovente, domicilio, hechos, pruebas, plazo_vence, extemporanea, registrado_por)
  values ('IMP-' || extract(year from p_presentada_el)::int || '-' || lpad(nextval('public.impugnacion_folio_seq')::text, 4, '0'),
          p_infraccion_id, p_presentada_el, trim(p_promovente), coalesce(p_domicilio, ''), trim(p_hechos), coalesce(p_pruebas, '[]'),
          v_vence, p_presentada_el > v_vence, v_usr.nombre)
  returning * into v;
  update public.infracciones set estado = 'impugnada', impugnacion_motivo = 'Recurso de revocación ' || v.folio || ': ' || left(trim(p_hechos), 300)
  where id = p_infraccion_id;
  return v;
end $$;
revoke all on function public.presentar_impugnacion(bigint, date, text, text, text, jsonb) from public, anon;
grant execute on function public.presentar_impugnacion(bigint, date, text, text, text, jsonb) to authenticated;

-- procedente → se cancela la infracción; improcedente o desechada → vuelve a
-- pendiente (o vencida, según su fecha)
create or replace function public.resolver_impugnacion(p_id bigint, p_resultado text, p_resolucion text)
returns public.impugnaciones
language plpgsql security definer
set search_path = public
as $$
declare v public.impugnaciones; v_usr public.usuarios%rowtype; v_lim int;
begin
  select * into v_usr from public.usuarios where auth_id = auth.uid() and activo;
  if v_usr.rol is null or v_usr.rol not in ('admin','juridico') then
    raise exception 'Los recursos de revocación los resuelve Jurídico o el Director';
  end if;
  if p_resultado not in ('procedente','improcedente','desechada') then raise exception 'Resultado inválido'; end if;
  if length(coalesce(trim(p_resolucion), '')) < 30 then raise exception 'Redacta la resolución con sus fundamentos y motivos'; end if;
  select * into v from public.impugnaciones where id = p_id for update;
  if not found then raise exception 'Recurso no encontrado'; end if;
  if v.estado <> 'en_tramite' then raise exception 'El recurso % ya fue resuelto', v.folio; end if;
  update public.impugnaciones set estado = p_resultado, resolucion = trim(p_resolucion), resuelto_por = v_usr.nombre, resuelto_el = now()
  where id = p_id returning * into v;
  if p_resultado = 'procedente' then
    update public.infracciones set estado = 'cancelada', cancelacion_motivo = 'Recurso de revocación ' || v.folio || ' procedente'
    where id = v.infraccion_id;
  else
    select coalesce(dias_limite, 30) into v_lim from public.configuracion where id = 1;
    update public.infracciones set estado = case when fecha < now() - make_interval(days => v_lim) then 'vencida' else 'pendiente' end
    where id = v.infraccion_id;
  end if;
  return v;
end $$;
revoke all on function public.resolver_impugnacion(bigint, text, text) from public, anon;
grant execute on function public.resolver_impugnacion(bigint, text, text) to authenticated;

-- ═══ 3. Avisos al ciudadano ═══════════════════════════════
create table if not exists public.avisos (
  id            bigserial primary key,
  infraccion_id bigint not null references public.infracciones(id),
  canal         text not null check (canal in ('correo','whatsapp')),
  tipo          text not null check (tipo in ('emision','descuento1','descuento2','vencimiento')),
  destino       text not null,
  estado        text not null default 'pendiente' check (estado in ('pendiente','enviado','error')),
  intentos      integer not null default 0,
  error         text not null default '',
  enviado_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (infraccion_id, canal, tipo)
);
alter table public.avisos enable row level security;
drop policy if exists mando_select on public.avisos;
create policy mando_select on public.avisos for select to authenticated using (public.tiene_rol('admin','supervisor','contraloria'));

-- Arma la cola: emisión (al registrarla), un día antes de que venza cada
-- descuento y al vencer. Solo infracciones de los últimos 60 días.
create or replace function public.programar_avisos()
returns integer
language plpgsql security definer
set search_path = public
as $$
declare c public.configuracion%rowtype; n int := 0; k int;
begin
  select * into c from public.configuracion where id = 1;
  if not (c.avisos_correo or c.avisos_whatsapp) then return 0; end if;
  with base as (
    select i.id, i.estado, i.fecha, nullif(trim(i.infractor_correo), '') correo,
           nullif(regexp_replace(i.telefono, '\D', '', 'g'), '') tel,
           extract(epoch from now() - i.fecha) / 86400 dias,
           coalesce(cat.grave, false) sin_desc
    from public.infracciones i left join public.catalogo_infracciones cat on cat.numero = i.catalogo_numero
    where i.fecha > now() - interval '60 days' and i.monto > 0
  ), tipos as (
    select b.*, t.tipo from base b cross join lateral (values
      ('emision',     b.estado in ('pendiente','vencida','impugnada')),
      ('descuento1',  b.estado = 'pendiente' and not b.sin_desc and c.descuento_pct > 0 and b.dias between c.dias_descuento - 1 and c.dias_descuento),
      ('descuento2',  b.estado = 'pendiente' and not b.sin_desc and coalesce(c.descuento2_pct, 0) > 0 and c.dias_descuento2 is not null and b.dias between c.dias_descuento2 - 1 and c.dias_descuento2),
      ('vencimiento', b.estado = 'vencida')
    ) t(tipo, aplica) where t.aplica
  )
  insert into public.avisos (infraccion_id, canal, tipo, destino)
  -- El recordatorio de descuento por correo ya lo manda tareas-diarias (mejoras.sql)
  select id, 'correo', tipo, correo from tipos where c.avisos_correo and tipo in ('emision','vencimiento') and correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  union all
  select id, 'whatsapp', tipo, '52' || right(tel, 10) from tipos where c.avisos_whatsapp and length(tel) >= 10
  on conflict (infraccion_id, canal, tipo) do nothing;
  get diagnostics k = row_count; n := n + k;
  return n;
end $$;
revoke all on function public.programar_avisos() from public, anon, authenticated;

-- Avisos pendientes con los datos para redactarlos (solo la llave de servicio)
create or replace function public.avisos_por_enviar(p_limite integer default 50)
returns table (id bigint, canal text, tipo text, destino text, folio text, placa text, infractor text, tipo_infraccion text,
               fundamento text, monto integer, fecha timestamptz, token uuid, descuento_pct integer, fecha_limite_descuento date)
language sql stable security definer
set search_path = public
as $$
  select a.id, a.canal, a.tipo, a.destino, i.folio, i.placa, i.infractor, i.tipo, i.fundamento, i.monto, i.fecha, i.token_verificacion,
         case a.tipo when 'descuento1' then c.descuento_pct when 'descuento2' then c.descuento2_pct else null end,
         case a.tipo when 'descuento1' then (i.fecha + make_interval(days => c.dias_descuento))::date
                     when 'descuento2' then (i.fecha + make_interval(days => c.dias_descuento2))::date else null end
  from public.avisos a join public.infracciones i on i.id = a.infraccion_id
  cross join public.configuracion c
  where c.id = 1 and a.estado = 'pendiente' and a.intentos < 5
  order by a.created_at
  limit p_limite
$$;
revoke all on function public.avisos_por_enviar(integer) from public, anon, authenticated;

create or replace function public.marcar_aviso(p_id bigint, p_ok boolean, p_error text default '')
returns void
language sql security definer
set search_path = public
as $$
  update public.avisos set
    estado = case when p_ok then 'enviado' when intentos + 1 >= 5 then 'error' else 'pendiente' end,
    intentos = intentos + 1, error = coalesce(p_error, ''), enviado_at = case when p_ok then now() end
  where id = p_id
$$;
revoke all on function public.marcar_aviso(bigint, boolean, text) from public, anon, authenticated;

-- ═══ 4. Pago en línea (Mercado Pago) ══════════════════════
alter table public.pagos add column if not exists referencia_externa text;
create unique index if not exists pagos_referencia_externa_idx on public.pagos (referencia_externa) where referencia_externa is not null;

-- Cuánto se paga hoy (misma regla que registrar_pago: tramos del art. 330,
-- sin descuento al conducir en estado de ebriedad)
create or replace function public.monto_a_pagar(p_infraccion_id bigint)
returns table (monto_original integer, descuento_pct numeric, monto_final numeric, folio text, placa text, estado text)
language plpgsql stable security definer
set search_path = public
as $$
declare v_inf public.infracciones%rowtype; c public.configuracion%rowtype; v_desc numeric := 0;
begin
  select * into v_inf from public.infracciones where id = p_infraccion_id;
  if not found then return; end if;
  select * into c from public.configuracion where id = 1;
  if not exists (select 1 from public.catalogo_infracciones where numero = v_inf.catalogo_numero and grave) then
    if now() - v_inf.fecha <= make_interval(days => coalesce(c.dias_descuento, 5)) then v_desc := coalesce(c.descuento_pct, 0);
    elsif c.dias_descuento2 is not null and now() - v_inf.fecha <= make_interval(days => c.dias_descuento2) then v_desc := coalesce(c.descuento2_pct, 0);
    end if;
  end if;
  return query select v_inf.monto, v_desc, round(v_inf.monto * (1 - v_desc / 100.0)), v_inf.folio, v_inf.placa, v_inf.estado;
end $$;
revoke all on function public.monto_a_pagar(bigint) from public, anon, authenticated;

-- Asienta un pago acreditado por Mercado Pago (la función pago-mp lo confirma
-- con la API antes de llamar). Idempotente por referencia_externa.
create or replace function public.registrar_pago_en_linea(p_infraccion_id bigint, p_referencia text, p_monto numeric)
returns public.pagos
language plpgsql security definer
set search_path = public
as $$
declare v_inf public.infracciones%rowtype; m record; v_pago public.pagos;
begin
  select * into v_pago from public.pagos where referencia_externa = p_referencia;
  if found then return v_pago; end if;
  select * into v_inf from public.infracciones where id = p_infraccion_id for update;
  if not found then raise exception 'Infracción no encontrada'; end if;
  if exists (select 1 from public.pagos where infraccion_id = p_infraccion_id) then
    raise exception 'La infracción % ya tiene un pago registrado (referencia %)', v_inf.folio, p_referencia;
  end if;
  select * into m from public.monto_a_pagar(p_infraccion_id);
  -- Se respeta el monto que el ciudadano pagó si cubre lo calculado hoy (el
  -- cobro pudo crearse dentro del plazo de descuento y acreditarse después)
  insert into public.pagos (infraccion_id, folio_inf, monto_original, descuento_pct, monto_final, metodo, cajero, notas, referencia_externa)
  values (v_inf.id, v_inf.folio, v_inf.monto, round(100 - p_monto * 100.0 / nullif(v_inf.monto, 0)), p_monto, 'en_linea', 'Pago en línea (Mercado Pago)',
          'Monto calculado al acreditarse: ' || m.monto_final, p_referencia)
  returning * into v_pago;
  update public.infracciones set estado = 'pagada' where id = v_inf.id;
  return v_pago;
end $$;
revoke all on function public.registrar_pago_en_linea(bigint, text, numeric) from public, anon, authenticated;

-- ═══ Tareas programadas ═══════════════════════════════════
create or replace function public.es_secreto(p_nombre text, p_secreto text)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
begin
  return exists (select 1 from vault.decrypted_secrets where name = p_nombre and decrypted_secret = p_secreto);
end $$;
revoke all on function public.es_secreto(text, text) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $v$ select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'avisos_cron')
                where not exists (select 1 from vault.secrets where name = 'avisos_cron') $v$;
  end if;
  if exists (select 1 from pg_namespace where nspname = 'cron') and exists (select 1 from pg_namespace where nspname = 'net') then
    perform cron.schedule('programar-avisos', '*/15 * * * *', 'select public.programar_avisos()');
    execute $s$ select cron.schedule('enviar-avisos', '2-59/15 * * * *', $cron$
      select net.http_post(
        url := 'https://tqqeixymxpuewpjhcjno.supabase.co/functions/v1/avisos',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'avisos_cron')),
        body := '{}'::jsonb)
    $cron$) $s$;
  end if;
end $$;

-- El portal ciudadano sabe si mostrar el botón de pago en línea
create or replace function public.parametros_descuento()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'descuento_pct', coalesce(descuento_pct, 0), 'dias_descuento', coalesce(dias_descuento, 5),
    'descuento2_pct', coalesce(descuento2_pct, 0), 'dias_descuento2', dias_descuento2,
    'dias_limite', coalesce(dias_limite, 30), 'pago_en_linea', coalesce(pago_en_linea, false))
  from public.configuracion where id = 1
$$;
grant execute on function public.parametros_descuento() to anon, authenticated;

-- Historial del conductor por licencia (reincidencia, art. 331 fr. II inc. g).
-- El policía vial solo ve sus propias boletas (controles.sql); esto le
-- devuelve lo mínimo de las demás para detectar reincidencia y adeudos.
create or replace function public.historial_conductor(p_licencia text)
returns table (id bigint, folio text, fecha timestamptz, tipo text, estado text, monto integer, catalogo_numero integer, boleta text, placa text)
language sql stable security definer
set search_path = public
as $$
  select i.id, i.folio, i.fecha, i.tipo, i.estado, i.monto, i.catalogo_numero, i.boleta, i.placa
  from public.infracciones i
  where public.mi_rol() is not null
    and length(regexp_replace(coalesce(p_licencia, ''), '[^A-Za-z0-9]', '', 'g')) >= 4
    and upper(regexp_replace(i.licencia, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace(p_licencia, '[^A-Za-z0-9]', '', 'g'))
  order by i.fecha desc
  limit 30
$$;
revoke all on function public.historial_conductor(text) from public, anon;
grant execute on function public.historial_conductor(text) to authenticated;
