-- Esquema de la base de datos de Tránsito Municipal (Supabase / Postgres 17)
-- Extraído del proyecto tqqeixymxpuewpjhcjno el 2026-10-21.
-- Sirve para recrear la BD desde cero en un proyecto nuevo (SQL Editor → Run).
-- No incluye datos; los registros de ejemplo los inserta app.js (SEED_*).
-- Después de este archivo aplica, en orden, los de supabase/migrations/
-- (login con Supabase Auth y políticas por rol).

-- ── Secuencias de folios ──────────────────────────────────
create sequence if not exists public.acc_folio_seq;
create sequence if not exists public.grua_folio_seq;
create sequence if not exists public.inf_folio_seq;

-- ── Tablas ────────────────────────────────────────────────
create table if not exists public.configuracion (
  id integer not null default 1,
  municipio text default 'San Pedro Garza García'::text,
  estado text default 'Nuevo León'::text,
  director text default 'Carlos Alvarado'::text,
  correo text default 'transito@sanpedro.gob.mx'::text,
  montos jsonb default '{"alto": 1200, "celular": 1500, "contrario": 1800, "velocidad": 800, "documentos": 400, "uprohibido": 600, "sinlicencia": 2000, "estacionamiento": 500}'::jsonb,
  descuento_pct integer default 20,
  dias_descuento integer default 15,
  tipos_extra jsonb default '[]'::jsonb,
  constraint configuracion_pkey PRIMARY KEY (id)
);

create table if not exists public.usuarios (
  id bigserial,
  nombre text not null,
  usuario text not null,
  contrasena text not null,
  rol text not null default 'oficial'::text,
  iniciales text default ''::text,
  activo boolean default true,
  created_at timestamp with time zone default now(),
  constraint usuarios_pkey PRIMARY KEY (id),
  constraint usuarios_usuario_key UNIQUE (usuario)
);

create table if not exists public.infracciones (
  id bigserial,
  folio text,
  fecha timestamp with time zone not null default now(),
  placa text not null,
  infractor text not null,
  tipo text not null,
  monto integer not null default 0,
  ubicacion text default ''::text,
  estado text default 'pendiente'::text,
  obs text default ''::text,
  created_at timestamp with time zone default now(),
  oficial text default ''::text,
  vehiculo text default ''::text,
  color_vehiculo text default ''::text,
  licencia text default ''::text,
  telefono text default ''::text,
  fotos text default '[]'::text,
  lat double precision,
  lng double precision,
  impugnacion_motivo text default ''::text,
  constraint infracciones_pkey PRIMARY KEY (id)
);

create table if not exists public.pagos (
  id bigserial,
  infraccion_id bigint,
  folio_inf text,
  monto_original numeric not null,
  descuento_pct numeric default 0,
  monto_final numeric not null,
  metodo text default 'efectivo'::text,
  cajero text,
  notas text,
  created_at timestamp with time zone default now(),
  constraint pagos_infraccion_id_fkey FOREIGN KEY (infraccion_id) REFERENCES infracciones(id) ON DELETE CASCADE,
  constraint pagos_pkey PRIMARY KEY (id)
);

create table if not exists public.permisos (
  id bigserial,
  num text,
  titular text not null,
  tipo text not null,
  placa text default ''::text,
  ruta text not null,
  inicio date,
  vencimiento date not null,
  estado text default 'vigente'::text,
  created_at timestamp with time zone default now(),
  telefono text,
  obs text,
  unidades integer default 1,
  constraint permisos_pkey PRIMARY KEY (id)
);

create table if not exists public.vehiculos (
  id uuid not null default gen_random_uuid(),
  placa text not null,
  propietario text not null default ''::text,
  marca text default ''::text,
  modelo text default ''::text,
  anio integer,
  color text default ''::text,
  num_serie text default ''::text,
  num_motor text default ''::text,
  estado text default 'activo'::text,
  obs text default ''::text,
  created_at timestamp with time zone default now(),
  tipo text,
  telefono text,
  constraint vehiculos_pkey PRIMARY KEY (id),
  constraint vehiculos_placa_key UNIQUE (placa)
);

create table if not exists public.grua (
  id uuid not null default gen_random_uuid(),
  folio text default ''::text,
  fecha timestamp with time zone default now(),
  placa text not null default ''::text,
  propietario text default ''::text,
  motivo text default ''::text,
  oficial text default ''::text,
  ubicacion text default ''::text,
  costo_deposito numeric default 0,
  costo_diario numeric default 0,
  estado text default 'retenido'::text,
  fecha_liberacion timestamp with time zone,
  lat double precision,
  lng double precision,
  obs text default ''::text,
  created_at timestamp with time zone default now(),
  constraint grua_pkey PRIMARY KEY (id)
);

create table if not exists public.accidentes (
  id uuid not null default gen_random_uuid(),
  folio text default ''::text,
  fecha timestamp with time zone default now(),
  tipo text default 'choque'::text,
  ubicacion text default ''::text,
  lat double precision,
  lng double precision,
  descripcion text default ''::text,
  partes jsonb default '[]'::jsonb,
  lesionados integer default 0,
  fallecidos integer default 0,
  oficial text default ''::text,
  fotos text default '[]'::text,
  estado text default 'en_proceso'::text,
  obs text default ''::text,
  created_at timestamp with time zone default now(),
  constraint accidentes_pkey PRIMARY KEY (id)
);

create table if not exists public.actividad (
  id bigserial,
  tipo text not null,
  texto text not null,
  ts timestamp with time zone default now(),
  constraint actividad_pkey PRIMARY KEY (id)
);

create table if not exists public.turnos (
  id uuid not null default gen_random_uuid(),
  oficial_nombre text default ''::text,
  inicio timestamp with time zone default now(),
  fin timestamp with time zone,
  infracciones_count integer default 0,
  grua_count integer default 0,
  recaudacion numeric default 0,
  notas text default ''::text,
  estado text default 'activo'::text,
  created_at timestamp with time zone default now(),
  constraint turnos_pkey PRIMARY KEY (id)
);

-- ── Funciones ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gen_folio_inf()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.folio := 'INF-' ||
    EXTRACT(YEAR FROM COALESCE(NEW.fecha, NOW()))::INTEGER::TEXT ||
    '-' || LPAD(NEW.id::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_inf_folio()
 RETURNS trigger LANGUAGE plpgsql
AS $function$ BEGIN IF NEW.folio IS NULL OR NEW.folio = '' THEN NEW.folio := 'INF-' || EXTRACT(YEAR FROM NOW())::text || '-' || LPAD(nextval('inf_folio_seq')::text, 5, '0'); END IF; RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.gen_num_per()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.num := 'PER-' ||
    EXTRACT(YEAR FROM NOW())::INTEGER::TEXT ||
    '-' || LPAD(NEW.id::TEXT, 4, '0');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_grua_folio()
 RETURNS trigger LANGUAGE plpgsql
AS $function$ BEGIN IF NEW.folio IS NULL OR NEW.folio = '' THEN NEW.folio := 'GRU-' || EXTRACT(YEAR FROM NOW())::text || '-' || LPAD(nextval('grua_folio_seq')::text, 4, '0'); END IF; RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.generate_acc_folio()
 RETURNS trigger LANGUAGE plpgsql
AS $function$ BEGIN IF NEW.folio IS NULL OR NEW.folio = '' THEN NEW.folio := 'ACC-' || EXTRACT(YEAR FROM NOW())::text || '-' || LPAD(nextval('acc_folio_seq')::text, 4, '0'); END IF; RETURN NEW; END; $function$;

CREATE OR REPLACE FUNCTION public.marcar_infracciones_vencidas()
 RETURNS void LANGUAGE plpgsql
AS $function$ BEGIN UPDATE infracciones SET estado = 'vencida' WHERE estado = 'pendiente' AND fecha < NOW() - INTERVAL '30 days'; END; $function$;

alter function public.gen_folio_inf() set search_path = public;
alter function public.generate_inf_folio() set search_path = public;
alter function public.gen_num_per() set search_path = public;
alter function public.generate_grua_folio() set search_path = public;
alter function public.generate_acc_folio() set search_path = public;
alter function public.marcar_infracciones_vencidas() set search_path = public;

-- ── Triggers ──────────────────────────────────────────────
-- Se disparan en orden alfabético: trg_inf_folio y luego trig_folio_inf,
-- que es el que deja el folio definitivo (INF-<año>-<id>).
CREATE TRIGGER trg_inf_folio BEFORE INSERT ON public.infracciones FOR EACH ROW EXECUTE FUNCTION generate_inf_folio();
CREATE TRIGGER trig_folio_inf BEFORE INSERT ON public.infracciones FOR EACH ROW EXECUTE FUNCTION gen_folio_inf();
CREATE TRIGGER trig_num_per BEFORE INSERT ON public.permisos FOR EACH ROW EXECUTE FUNCTION gen_num_per();
CREATE TRIGGER trg_grua_folio BEFORE INSERT ON public.grua FOR EACH ROW EXECUTE FUNCTION generate_grua_folio();
CREATE TRIGGER trg_acc_folio BEFORE INSERT ON public.accidentes FOR EACH ROW EXECUTE FUNCTION generate_acc_folio();

-- ── Acceso (RLS) ──────────────────────────────────────────
-- La app usa la anon key y un login propio contra public.usuarios,
-- por eso las políticas permiten todo a anon (cualquiera con la anon key puede leer/escribir).
alter table public.configuracion enable row level security;
alter table public.usuarios      enable row level security;
alter table public.infracciones  enable row level security;
alter table public.pagos         enable row level security;
alter table public.permisos      enable row level security;
alter table public.actividad     enable row level security;
alter table public.vehiculos     enable row level security;
alter table public.grua          enable row level security;
alter table public.accidentes    enable row level security;
alter table public.turnos        enable row level security;

create policy public_all on public.configuracion for all to anon, authenticated using (true) with check (true);
create policy public_all on public.usuarios      for all to public using (true) with check (true);
create policy public_all on public.infracciones  for all to anon, authenticated using (true) with check (true);
create policy public_all on public.pagos         for all to public using (true) with check (true);
create policy public_all on public.permisos      for all to anon, authenticated using (true) with check (true);
create policy public_all on public.actividad     for all to anon, authenticated using (true) with check (true);
create policy public_all on public.vehiculos     for all to anon, authenticated using (true) with check (true);
create policy public_all on public.grua          for all to anon, authenticated using (true) with check (true);
create policy public_all on public.accidentes    for all to anon, authenticated using (true) with check (true);
create policy public_all on public.turnos        for all to anon, authenticated using (true) with check (true);

-- ── Realtime ──────────────────────────────────────────────
alter publication supabase_realtime add table public.infracciones, public.accidentes;

-- ── Datos mínimos ─────────────────────────────────────────
insert into public.configuracion (id) values (1) on conflict (id) do nothing;
