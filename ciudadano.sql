-- ═══════════════════════════════════════════════════════════════════
-- Portal ciudadano: "¿Por qué me multaron?", recibo digital, avisos al
-- celular y avisos viales
--
--   * explicaciones_categoria + explicar_infraccion(): el ciudadano ve en
--     palabras sencillas qué falta cometió, por qué importa, qué dice el
--     Reglamento y cuánto se ahorra si paga a tiempo.
--   * datos_recibo(): lo que la función "recibo" manda por correo al cobrar.
--   * suscripciones_push / avisos_viales: el ciudadano registra sus placas en
--     el portal (se instala como app) y recibe en el celular una multa nueva,
--     el último día de su descuento y los avisos viales que publica la
--     Dirección. La función "push" los envía cada 15 minutos.
--
-- Correr después de repuve.sql. Es idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. ¿Por qué me multaron? ──────────────────────────────
create table if not exists public.explicaciones_categoria (
  categoria text primary key,
  por_que   text not null
);
alter table public.explicaciones_categoria enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'explicaciones_categoria' and policyname = 'personal_select') then
    create policy personal_select on public.explicaciones_categoria for select to authenticated using (public.mi_rol() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'explicaciones_categoria' and policyname = 'admin_update') then
    create policy admin_update on public.explicaciones_categoria for update to authenticated
      using (public.tiene_rol('admin')) with check (public.tiene_rol('admin'));
  end if;
end $$;
grant select, update on public.explicaciones_categoria to authenticated;

insert into public.explicaciones_categoria (categoria, por_que) values
  ('Circulación de vehículos (exceptuando los de propulsión humana)', 'Las reglas de circulación (velocidad, sentido de la calle, semáforos y preferencia de paso) existen para que todos lleguemos a salvo. No respetarlas es la causa más común de choques en la ciudad.'),
  ('Estacionamiento en la vía pública', 'Estacionarse donde no está permitido estorba el paso de peatones, ambulancias y transporte, y provoca embotellamientos.'),
  ('Ciclistas y motociclistas', 'Quien va en moto o bicicleta es el más expuesto en un choque. El casco y estas reglas evitan lesiones graves.'),
  ('Transporte público de pasajeros', 'Quien lleva pasajeros es responsable de su seguridad. Estas reglas protegen a los usuarios del transporte.'),
  ('Transporte público de carga', 'Los vehículos de carga pesan mucho: si no respetan rutas, horarios y medidas, dañan las calles y ponen en riesgo a las personas.'),
  ('Luces', 'Las luces sirven para ver y para que te vean, sobre todo de noche y con lluvia.'),
  ('Placas, tarjeta de circulación, póliza de responsabilidad civil y daños a terceros y documentos obligatorios para circular', 'Las placas y los documentos vigentes identifican al vehículo y a su responsable, y el seguro cubre los daños a otras personas si hay un accidente.'),
  ('Estacionamientos', 'Los estacionamientos deben funcionar con orden y seguridad para sus usuarios y para los vecinos.'),
  ('Vía pública', 'Las calles y las banquetas son de todos. Obstruirlas pone en riesgo a peatones y conductores.'),
  ('De los dispositivos en vehículos y mantenimiento y buen estado de los vehículos', 'Un vehículo en mal estado (frenos, llantas, espejos, cinturones) puede fallar en el peor momento y causar un accidente.'),
  ('Escuela de manejo', 'Las escuelas de manejo forman a los nuevos conductores y deben enseñar con vehículos y condiciones seguras.'),
  ('Servicios auxiliares vehículos de carga especializada para el arrastre y salvamento de vehículos', 'Las grúas deben trabajar con permiso, equipo adecuado y tarifas autorizadas para no dañar vehículos ni cobrar de más.'),
  ('Semovientes', 'Los animales sueltos o sin control en la calle provocan accidentes graves.'),
  ('Desobediencia civil y ultrajes a la autoridad', 'Atender las indicaciones de la autoridad evita riesgos y permite resolver cualquier situación con orden.'),
  ('Accidentes', 'Después de un accidente la ley pide auxiliar a los lesionados y no alterar el lugar, para proteger a las personas y aclarar quién es responsable.'),
  ('Licencia y permiso de conducir', 'La licencia acredita que sabes manejar y conoces las reglas. Manejar sin ella pone en riesgo a los demás.'),
  ('Aliento alcohólico, ebriedad y consumo de estupefacientes u otras sustancias tóxicas o psicotrópicas', 'El alcohol y las drogas reducen los reflejos y son una de las principales causas de muertes en el camino. Por eso se sancionan con más severidad.'),
  ('Protección al ambiente', 'El humo excesivo y el ruido dañan la salud de todos.'),
  ('Vehículos de servicio oficial, emergencia o seguridad pública', 'Las torretas y sirenas son exclusivas de los servicios de emergencia, para que la gente sepa cuándo cederles el paso.')
on conflict (categoria) do nothing;

-- Pública, pero solo con la placa o el folio de esa misma infracción (igual que consulta_ciudadana)
create or replace function public.explicar_infraccion(p_id bigint, p_q text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'conducta', coalesce(nullif(c.descripcion, ''), i.tipo),
    'categoria', coalesce(c.categoria, ''),
    'clasificacion', coalesce(c.clasificacion, ''),
    'por_que', coalesce(e.por_que, ''),
    'nota', coalesce(c.nota, ''),
    'grave', coalesce(c.grave, false),
    'cuotas_min', c.cuotas_min, 'cuotas_max', c.cuotas_max, 'uma', cfg.valor_uma,
    'fundamento', coalesce(i.fundamento, ''),
    'articulos', coalesce((select jsonb_agg(jsonb_build_object('numero', a.numero, 'texto', left(a.texto, 1500)) order by a.numero)
                           from public.reglamento_articulos a where a.numero = any(c.articulos_ref)), '[]'::jsonb))
  from public.infracciones i
  left join public.catalogo_infracciones c on c.numero = i.catalogo_numero
  left join public.explicaciones_categoria e on e.categoria = c.categoria
  cross join public.configuracion cfg
  where cfg.id = 1 and i.id = p_id
    and length(regexp_replace(upper(coalesce(p_q, '')), '[^A-Z0-9]', '', 'g')) >= 3
    and (regexp_replace(upper(i.placa), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_q), '[^A-Z0-9]', '', 'g')
      or regexp_replace(upper(i.folio), '[^A-Z0-9]', '', 'g') = regexp_replace(upper(p_q), '[^A-Z0-9]', '', 'g'))
$$;
grant execute on function public.explicar_infraccion(bigint, text) to anon, authenticated;

-- ── 2. Recibo digital por correo ──────────────────────────
-- La función "recibo" la llama con la sesión del cajero: solo caja y admin.
create or replace function public.datos_recibo(p_pago_id bigint)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.tiene_rol('admin', 'cajero') then raise exception 'Solo caja puede enviar recibos'; end if;
  select jsonb_build_object(
    'recibo', 'REC-' || lpad(p.id::text, 6, '0'), 'fecha', p.created_at, 'token', p.token_verificacion,
    'folio', p.folio_inf, 'placa', i.placa, 'concepto', i.tipo, 'infractor', i.infractor,
    'monto_original', p.monto_original, 'descuento_pct', p.descuento_pct, 'monto', p.monto_final, 'metodo', p.metodo,
    'correo', coalesce(i.infractor_correo, ''), 'telefono', coalesce(i.telefono, ''),
    'municipio', c.municipio, 'institucion', c.institucion, 'app_url', coalesce(c.app_url, ''))
  into v
  from public.pagos p left join public.infracciones i on i.id = p.infraccion_id
  cross join public.configuracion c
  where c.id = 1 and p.id = p_pago_id;
  if v is null then raise exception 'Pago no encontrado'; end if;
  return v;
end $$;
revoke all on function public.datos_recibo(bigint) from public, anon;
grant execute on function public.datos_recibo(bigint) to authenticated;

-- ── 3. Avisos viales ──────────────────────────────────────
create table if not exists public.avisos_viales (
  id         bigserial primary key,
  titulo     text not null check (length(titulo) between 3 and 120),
  texto      text not null default '' check (length(texto) <= 600),
  desde      date not null default (now() at time zone 'America/Mexico_City')::date,
  hasta      date,
  activo     boolean not null default true,
  creado_por text not null default '',
  created_at timestamptz not null default now()
);
alter table public.avisos_viales enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_viales' and policyname = 'personal_select') then
    create policy personal_select on public.avisos_viales for select to authenticated using (public.mi_rol() is not null);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_viales' and policyname = 'mando_insert') then
    create policy mando_insert on public.avisos_viales for insert to authenticated with check (public.tiene_rol('admin','supervisor'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'avisos_viales' and policyname = 'mando_update') then
    create policy mando_update on public.avisos_viales for update to authenticated
      using (public.tiene_rol('admin','supervisor')) with check (public.tiene_rol('admin','supervisor'));
  end if;
end $$;
grant select, insert, update on public.avisos_viales to authenticated;
grant usage on sequence public.avisos_viales_id_seq to authenticated;

create or replace function public.avisos_viales_autor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.creado_por := coalesce(public.mi_nombre(), '');
  return new;
end $$;
create or replace trigger trg_avisos_viales before insert on public.avisos_viales
  for each row execute function public.avisos_viales_autor();

create or replace function public.avisos_viales_vigentes()
returns table (id bigint, titulo text, texto text, desde date, hasta date)
language sql stable security definer set search_path = public as $$
  select a.id, a.titulo, a.texto, a.desde, a.hasta from public.avisos_viales a
  where a.activo and a.desde <= (now() at time zone 'America/Mexico_City')::date
    and (a.hasta is null or a.hasta >= (now() at time zone 'America/Mexico_City')::date)
  order by a.desde desc, a.id desc
  limit 10
$$;
grant execute on function public.avisos_viales_vigentes() to anon, authenticated;

-- ── 4. Avisos al celular del ciudadano (Web Push) ─────────
alter table public.configuracion add column if not exists push_publica text not null default '';

create table if not exists public.suscripciones_push (
  id         bigserial primary key,
  endpoint   text not null unique check (endpoint ~ '^https://[^\s]+$' and length(endpoint) <= 1000),
  p256dh     text not null check (length(p256dh) between 40 and 200),
  auth       text not null check (length(auth) between 10 and 100),
  placas     text[] not null default '{}',
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.suscripciones_push enable row level security;   -- solo por las funciones

create table if not exists public.push_enviados (
  suscripcion_id bigint not null references public.suscripciones_push(id),
  tipo           text not null,
  ref            text not null,
  created_at     timestamptz not null default now(),
  primary key (suscripcion_id, tipo, ref)
);
alter table public.push_enviados enable row level security;

create or replace function public.push_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('publica', push_publica) from public.configuracion where id = 1
$$;
grant execute on function public.push_config() to anon, authenticated;

-- El ciudadano registra hasta 5 placas en su celular (la suscripción es la llave)
create or replace function public.suscribir_push(p_endpoint text, p_p256dh text, p_auth text, p_placas text[])
returns text[]
language plpgsql security definer set search_path = public as $$
declare v text[];
begin
  select coalesce(array_agg(distinct x), '{}') into v
  from unnest(coalesce(p_placas, '{}')) p, lateral regexp_replace(upper(p), '[^A-Z0-9]', '', 'g') x
  where length(x) between 3 and 10;
  if cardinality(v) > 5 then raise exception 'Máximo 5 placas por celular'; end if;
  insert into public.suscripciones_push (endpoint, p256dh, auth, placas)
  values (p_endpoint, p_p256dh, p_auth, v)
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, placas = excluded.placas,
    activo = true, updated_at = now();
  return v;
end $$;
grant execute on function public.suscribir_push(text, text, text, text[]) to anon, authenticated;

create or replace function public.placas_push(p_endpoint text)
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select placas from public.suscripciones_push where endpoint = p_endpoint and activo), '{}')
$$;
grant execute on function public.placas_push(text) to anon, authenticated;

create or replace function public.cancelar_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  update public.suscripciones_push set activo = false, placas = '{}', updated_at = now() where endpoint = p_endpoint
$$;
grant execute on function public.cancelar_push(text) to anon, authenticated;

-- Avisos por mandar (solo la llave de servicio). Se apartan al leerlos para
-- no repetirlos: multa nueva, último día de descuento y aviso vial.
create or replace function public.tomar_push(p_limite integer default 200)
returns table (suscripcion_id bigint, endpoint text, p256dh text, auth text, tipo text, ref text, titulo text, cuerpo text, url text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare c public.configuracion%rowtype; hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  select * into c from public.configuracion where id = 1;
  return query
  with s as (select * from public.suscripciones_push where activo),
  inf as (
    select i.*, regexp_replace(upper(i.placa), '[^A-Z0-9]', '', 'g') pn, coalesce(cat.grave, false) sin_desc,
           (now() - i.fecha) dias
    from public.infracciones i left join public.catalogo_infracciones cat on cat.numero = i.catalogo_numero
    where i.fecha > now() - interval '60 days' and i.estado in ('pendiente', 'vencida') and i.monto > 0
  ),
  cand as (
    select s.id sid, 'multa'::text tp, inf.id::text rf,
           'Nueva infracción a la placa ' || inf.placa tt,
           inf.tipo || ' · $' || to_char(inf.monto, 'FM999,999') || '. Toca para ver el detalle y pagar con descuento.' cu,
           '/consulta?q=' || inf.pn ur
    from s join inf on inf.pn = any(s.placas) and inf.created_at > s.created_at - interval '1 hour'
    union all
    select s.id, 'descuento', inf.id::text || '-' || t.n,
           'Último día de descuento · ' || inf.placa,
           'Mañana vence tu ' || t.pct || '% de descuento en la infracción ' || coalesce(inf.folio, '') || '. Paga hoy y ahorra.',
           '/consulta?q=' || inf.pn
    from s join inf on inf.pn = any(s.placas) and inf.estado = 'pendiente' and not inf.sin_desc
    cross join lateral (values (1, c.descuento_pct, c.dias_descuento), (2, c.descuento2_pct, c.dias_descuento2)) t(n, pct, d)
    where coalesce(t.pct, 0) > 0 and t.d is not null
      and inf.dias >= make_interval(days => t.d - 1) and inf.dias < make_interval(days => t.d)
    union all
    select s.id, 'aviso', a.id::text, 'Aviso vial: ' || a.titulo, left(a.texto, 180), '/consulta#avisos'
    from s join public.avisos_viales a on a.activo and a.desde <= hoy and (a.hasta is null or a.hasta >= hoy)
      and a.created_at > now() - interval '2 days'
  ),
  nuevos as (
    insert into public.push_enviados (suscripcion_id, tipo, ref)
    select cand.sid, cand.tp, cand.rf from cand limit p_limite
    on conflict do nothing
    returning push_enviados.suscripcion_id, push_enviados.tipo, push_enviados.ref
  )
  select s.id, s.endpoint, s.p256dh, s.auth, n.tipo, n.ref, cand.tt, cand.cu, cand.ur
  from nuevos n join cand on cand.sid = n.suscripcion_id and cand.tp = n.tipo and cand.rf = n.ref
  join public.suscripciones_push s on s.id = n.suscripcion_id;
end $$;
revoke all on function public.tomar_push(integer) from public, anon, authenticated;

-- El servicio de notificaciones dice que el celular ya no existe (410)
create or replace function public.desactivar_push(p_endpoint text)
returns void language sql security definer set search_path = public as $$
  update public.suscripciones_push set activo = false, updated_at = now() where endpoint = p_endpoint
$$;
revoke all on function public.desactivar_push(text) from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'vault') then
    execute $v$ select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'push_cron')
                where not exists (select 1 from vault.secrets where name = 'push_cron') $v$;
  end if;
  if exists (select 1 from pg_namespace where nspname = 'cron') and exists (select 1 from pg_namespace where nspname = 'net') then
    execute $s$ select cron.schedule('enviar-push', '7-59/15 * * * *', $cron$
      select net.http_post(
        url := 'https://tqqeixymxpuewpjhcjno.supabase.co/functions/v1/push',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron')),
        body := '{}'::jsonb)
    $cron$) $s$;
  end if;
end $$;
