-- ═══════════════════════════════════════════════════════════════════
-- Tránsito Municipal — esquema de la base de datos (Supabase/Postgres)
-- Copia fiel del proyecto `transito-municipal` al 2026-10-21, para poder
-- recrear la base desde cero en un proyecto nuevo. Correr en el SQL Editor.
-- Después correr security_auth.sql (login con Supabase Auth y permisos por rol).
-- ═══════════════════════════════════════════════════════════════════

-- ── Tablas ──────────────────────────────────────────────────────────
create table if not exists configuracion (
  id             integer primary key default 1,
  municipio      text default 'San Pedro Garza García',
  estado         text default 'Nuevo León',
  director       text default 'Carlos Alvarado',
  correo         text default 'transito@sanpedro.gob.mx',
  montos         jsonb default '{"alto": 1200, "celular": 1500, "contrario": 1800, "velocidad": 800, "documentos": 400, "uprohibido": 600, "sinlicencia": 2000, "estacionamiento": 500}',
  descuento_pct  integer default 20,
  dias_descuento integer default 15,
  tipos_extra    jsonb default '[]'
);

create table if not exists usuarios (
  id         bigserial primary key,
  nombre     text not null,
  usuario    text not null unique,
  contrasena text not null,
  rol        text not null default 'oficial',   -- admin | supervisor | oficial
  iniciales  text default '',
  activo     boolean default true,
  created_at timestamptz default now()
);

create table if not exists infracciones (
  id                 bigserial primary key,
  folio              text,
  fecha              timestamptz not null default now(),
  placa              text not null,
  infractor          text not null,
  tipo               text not null,
  monto              integer not null default 0,
  ubicacion          text default '',
  estado             text default 'pendiente',  -- pendiente | pagada | vencida | impugnada | cancelada
  obs                text default '',
  created_at         timestamptz default now(),
  oficial            text default '',
  vehiculo           text default '',
  color_vehiculo     text default '',
  licencia           text default '',
  telefono           text default '',
  fotos              text default '[]',
  lat                double precision,
  lng                double precision,
  impugnacion_motivo text default ''
);

create table if not exists pagos (
  id             bigserial primary key,
  infraccion_id  bigint references infracciones(id) on delete cascade,
  folio_inf      text,
  monto_original numeric not null,
  descuento_pct  numeric default 0,
  monto_final    numeric not null,
  metodo         text default 'efectivo',
  cajero         text,
  notas          text,
  created_at     timestamptz default now()
);

create table if not exists permisos (
  id          bigserial primary key,
  num         text,
  titular     text not null,
  tipo        text not null,
  placa       text default '',
  ruta        text not null,
  inicio      date,
  vencimiento date not null,
  estado      text default 'vigente',
  created_at  timestamptz default now(),
  telefono    text,
  obs         text,
  unidades    integer default 1
);

create table if not exists vehiculos (
  id          uuid primary key default gen_random_uuid(),
  placa       text not null unique,
  propietario text not null default '',
  marca       text default '',
  modelo      text default '',
  anio        integer,
  color       text default '',
  num_serie   text default '',
  num_motor   text default '',
  estado      text default 'activo',
  obs         text default '',
  created_at  timestamptz default now(),
  tipo        text,
  telefono    text
);

create table if not exists grua (
  id               uuid primary key default gen_random_uuid(),
  folio            text default '',
  fecha            timestamptz default now(),
  placa            text not null default '',
  propietario      text default '',
  motivo           text default '',
  oficial          text default '',
  ubicacion        text default '',
  costo_deposito   numeric default 0,
  costo_diario     numeric default 0,
  estado           text default 'retenido',  -- retenido | liberado
  fecha_liberacion timestamptz,
  lat              double precision,
  lng              double precision,
  obs              text default '',
  created_at       timestamptz default now()
);

create table if not exists accidentes (
  id          uuid primary key default gen_random_uuid(),
  folio       text default '',
  fecha       timestamptz default now(),
  tipo        text default 'choque',
  ubicacion   text default '',
  lat         double precision,
  lng         double precision,
  descripcion text default '',
  partes      jsonb default '[]',
  lesionados  integer default 0,
  fallecidos  integer default 0,
  oficial     text default '',
  fotos       text default '[]',
  estado      text default 'en_proceso',  -- en_proceso | cerrado | derivado
  obs         text default '',
  created_at  timestamptz default now()
);

create table if not exists turnos (
  id                 uuid primary key default gen_random_uuid(),
  oficial_nombre     text default '',
  inicio             timestamptz default now(),
  fin                timestamptz,
  infracciones_count integer default 0,
  grua_count         integer default 0,
  recaudacion        numeric default 0,
  notas              text default '',
  estado             text default 'activo',
  created_at         timestamptz default now()
);

create table if not exists actividad (
  id    bigserial primary key,
  tipo  text not null,
  texto text not null,
  ts    timestamptz default now()
);

-- ── Folios automáticos ──────────────────────────────────────────────
create sequence if not exists grua_folio_seq;
create sequence if not exists acc_folio_seq;

-- Infracciones: INF-<año>-<id>
create or replace function gen_folio_inf() returns trigger
language plpgsql set search_path = public as $$
begin
  new.folio := 'INF-' || extract(year from coalesce(new.fecha, now()))::integer::text
            || '-' || lpad(new.id::text, 4, '0');
  return new;
end; $$;
drop trigger if exists trig_folio_inf on infracciones;
create trigger trig_folio_inf before insert on infracciones
  for each row execute function gen_folio_inf();

-- Permisos: PER-<año>-<id>
create or replace function gen_num_per() returns trigger
language plpgsql set search_path = public as $$
begin
  new.num := 'PER-' || extract(year from now())::integer::text || '-' || lpad(new.id::text, 4, '0');
  return new;
end; $$;
drop trigger if exists trig_num_per on permisos;
create trigger trig_num_per before insert on permisos
  for each row execute function gen_num_per();

create or replace function generate_grua_folio() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.folio is null or new.folio = '' then
    new.folio := 'GRU-' || extract(year from now())::text || '-' || lpad(nextval('grua_folio_seq')::text, 4, '0');
  end if;
  return new;
end; $$;
drop trigger if exists trg_grua_folio on grua;
create trigger trg_grua_folio before insert on grua
  for each row execute function generate_grua_folio();

create or replace function generate_acc_folio() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.folio is null or new.folio = '' then
    new.folio := 'ACC-' || extract(year from now())::text || '-' || lpad(nextval('acc_folio_seq')::text, 4, '0');
  end if;
  return new;
end; $$;
drop trigger if exists trg_acc_folio on accidentes;
create trigger trg_acc_folio before insert on accidentes
  for each row execute function generate_acc_folio();

-- ── Vencimiento automático (lo llama la app al abrir el panel) ───────
create or replace function marcar_infracciones_vencidas() returns void
language plpgsql set search_path = public as $$
begin
  update infracciones set estado = 'vencida'
  where estado = 'pendiente' and fecha < now() - interval '30 days';
end; $$;

-- ── Tiempo real (avisos de nuevas infracciones/accidentes) ──────────
do $$ begin
  alter publication supabase_realtime add table infracciones, accidentes;
exception when duplicate_object then null; end $$;

-- ── Acceso ──────────────────────────────────────────────────────────
-- La app usa la llave anon y su propia tabla de usuarios (no Supabase Auth),
-- así que por ahora cada tabla tiene una política abierta. Ver README,
-- sección "Seguridad".
do $$
declare t text;
begin
  foreach t in array array['configuracion','usuarios','infracciones','pagos','permisos','vehiculos','grua','accidentes','turnos','actividad'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists public_all on %I', t);
    execute format('create policy public_all on %I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;
