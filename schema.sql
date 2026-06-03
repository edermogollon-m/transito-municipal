-- ═══════════════════════════════════════════════════════════════
-- Sistema Tránsito y Movilidad Municipal · Supabase Schema
-- Ejecuta este archivo completo en: Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- ─── TABLAS ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS infracciones (
  id          BIGSERIAL PRIMARY KEY,
  folio       TEXT,
  fecha       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  placa       TEXT NOT NULL,
  infractor   TEXT NOT NULL,
  tipo        TEXT NOT NULL,
  monto       INTEGER NOT NULL DEFAULT 0,
  ubicacion   TEXT DEFAULT '',
  estado      TEXT DEFAULT 'pendiente',
  obs         TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permisos (
  id          BIGSERIAL PRIMARY KEY,
  num         TEXT,
  titular     TEXT NOT NULL,
  tipo        TEXT NOT NULL,
  placa       TEXT DEFAULT '',
  ruta        TEXT NOT NULL,
  inicio      DATE,
  vencimiento DATE NOT NULL,
  estado      TEXT DEFAULT 'vigente',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actividad (
  id    BIGSERIAL PRIMARY KEY,
  tipo  TEXT NOT NULL,
  texto TEXT NOT NULL,
  ts    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS configuracion (
  id        INTEGER PRIMARY KEY DEFAULT 1,
  municipio TEXT DEFAULT 'San Pedro Garza García',
  estado    TEXT DEFAULT 'Nuevo León',
  director  TEXT DEFAULT 'Carlos Alvarado',
  correo    TEXT DEFAULT 'transito@sanpedro.gob.mx',
  montos    JSONB DEFAULT '{"velocidad":800,"estacionamiento":500,"alto":1200,"sinlicencia":2000,"celular":1500,"contrario":1800,"uprohibido":600,"documentos":400}'::jsonb
);

-- ─── TRIGGERS: FOLIO / NUM AUTOMÁTICO ─────────────────────────

CREATE OR REPLACE FUNCTION gen_folio_inf()
RETURNS TRIGGER AS $$
BEGIN
  NEW.folio := 'INF-' ||
    EXTRACT(YEAR FROM COALESCE(NEW.fecha, NOW()))::INTEGER::TEXT ||
    '-' || LPAD(NEW.id::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_folio_inf ON infracciones;
CREATE TRIGGER trig_folio_inf
  BEFORE INSERT ON infracciones
  FOR EACH ROW EXECUTE FUNCTION gen_folio_inf();

CREATE OR REPLACE FUNCTION gen_num_per()
RETURNS TRIGGER AS $$
BEGIN
  NEW.num := 'PER-' ||
    EXTRACT(YEAR FROM NOW())::INTEGER::TEXT ||
    '-' || LPAD(NEW.id::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trig_num_per ON permisos;
CREATE TRIGGER trig_num_per
  BEFORE INSERT ON permisos
  FOR EACH ROW EXECUTE FUNCTION gen_num_per();

-- ─── ROW LEVEL SECURITY ────────────────────────────────────────

ALTER TABLE infracciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE permisos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividad     ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracion ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_all" ON infracciones;
DROP POLICY IF EXISTS "public_all" ON permisos;
DROP POLICY IF EXISTS "public_all" ON actividad;
DROP POLICY IF EXISTS "public_all" ON configuracion;

CREATE POLICY "public_all" ON infracciones  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON permisos      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON actividad     FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "public_all" ON configuracion FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ─── DATOS INICIALES ───────────────────────────────────────────

INSERT INTO configuracion (id, municipio, estado, director, correo, montos)
VALUES (1, 'San Pedro Garza García', 'Nuevo León', 'Carlos Alvarado', 'transito@sanpedro.gob.mx',
  '{"velocidad":800,"estacionamiento":500,"alto":1200,"sinlicencia":2000,"celular":1500,"contrario":1800,"uprohibido":600,"documentos":400}')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN

-- ── Infracciones (solo si la tabla está vacía) ─────────────────
IF NOT EXISTS (SELECT 1 FROM infracciones LIMIT 1) THEN

INSERT INTO infracciones (fecha, placa, infractor, tipo, monto, ubicacion, estado, obs) VALUES
-- Enero 2026
('2026-01-05T10:30', 'IJK-0014', 'Ignacio Xerez Z.',     'No portar documentos',          400,  'Zona Comercial',        'pagada',    ''),
('2026-01-07T13:00', 'FGH-0013', 'Hilda Ware Y.',         'Girar en U prohibido',          600,  'Centro',                'pendiente', ''),
('2026-01-10T08:45', 'CDE-0012', 'Gustavo Vargas X.',     'Circular en sentido contrario', 1800, 'Periférico',            'pagada',    ''),
('2026-01-14T11:15', 'ZAB-0011', 'Fernanda Uribe W.',     'Conducir sin licencia',         2000, 'Blvd. Sur',             'pagada',    ''),
('2026-01-17T14:00', 'WXY-0010', 'Ernesto Torres V.',     'Uso de celular al conducir',    1500, 'Calle Principal',       'impugnada', ''),
('2026-01-20T09:30', 'TUV-0009', 'Diana Sánchez U.',      'No respetar señal de alto',     1200, 'Av. Central',           'pagada',    ''),
('2026-01-24T10:45', 'QRS-0008', 'Cristóbal Reyes T.',    'Estacionamiento prohibido',     500,  'Plaza',                 'pendiente', ''),
('2026-01-28T16:30', 'NOP-0007', 'Beatriz Quiroz S.',     'Exceso de velocidad',           800,  'Blvd. Norte',           'pagada',    ''),
-- Febrero 2026
('2026-02-01T11:00', 'KLM-0006', 'Alfonso Peña R.',       'No portar documentos',          400,  'Av. Juárez',            'pagada',    ''),
('2026-02-03T13:15', 'HIJ-0005', 'Esperanza Olvera Q.',   'Girar en U prohibido',          600,  'Zona Centro',           'pagada',    ''),
('2026-02-06T08:30', 'EFG-0004', 'Gerardo Navarrete P.',  'Circular en sentido contrario', 1800, 'Periférico',            'pendiente', ''),
('2026-02-10T10:00', 'BCD-0003', 'Rebeca Flores D.',      'No respetar señal de alto',     1200, 'Blvd. Central',         'pagada',    ''),
('2026-02-14T15:45', 'YZA-0002', 'Oscar Medina C.',       'Estacionamiento prohibido',     500,  'Centro',                'pagada',    ''),
('2026-02-18T09:15', 'VWX-0001', 'Adriana Salinas B.',    'Conducir sin licencia',         2000, 'Calle Morelos',         'impugnada', ''),
('2026-02-22T11:30', 'STU-9999', 'Víctor Ramírez A.',     'Uso de celular al conducir',    1500, 'Av. Reforma',           'pendiente', ''),
('2026-02-26T14:00', 'PQR-8888', 'Natalia Torres S.',     'Exceso de velocidad',           800,  'Carretera Federal',     'pagada',    ''),
-- Marzo 2026
('2026-03-01T09:45', 'MNO-7777', 'Alejandro Cruz R.',     'No respetar señal de alto',     1200, 'Blvd. Sur',             'pagada',    ''),
('2026-03-02T10:15', 'JKL-6666', 'Lorena Ibáñez M.',      'Estacionamiento prohibido',     500,  'Mercado',               'pendiente', ''),
('2026-03-05T13:00', 'GHI-5555', 'Martín Fuentes V.',     'Exceso de velocidad',           800,  'Av. Principal',         'pagada',    ''),
('2026-03-08T08:30', 'DEF-4444', 'Verónica Silva T.',     'No portar documentos',          400,  'Zona Norte',            'pagada',    ''),
('2026-03-12T11:45', 'ABC-3333', 'Eduardo Rojas C.',      'Girar en U prohibido',          600,  'Centro',                'pendiente', ''),
('2026-03-15T16:30', 'XYZ-2222', 'Carmen Leal F.',        'Circular en sentido contrario', 1800, 'Periférico Poniente',   'pagada',    ''),
('2026-03-18T09:00', 'UVW-1111', 'Roberto Paz G.',        'Conducir sin licencia',         2000, 'Av. Hidalgo',           'pagada',    ''),
('2026-03-22T14:15', 'RST-7890', 'Silvia Castillo M.',    'Uso de celular al conducir',    1500, 'Calle Central',         'impugnada', ''),
('2026-03-25T10:30', 'OPQ-3456', 'Javier Herrera N.',     'No respetar señal de alto',     1200, 'Blvd. Oriente',         'pendiente', ''),
('2026-03-28T15:00', 'LMN-9012', 'Gabriela Ramos Q.',     'Estacionamiento prohibido',     500,  'Plaza Central',         'pagada',    ''),
-- Abril 2026
('2026-04-02T09:30', 'IJK-5678', 'Fernando Castro L.',    'Exceso de velocidad',           800,  'Carretera',             'pagada',    ''),
('2026-04-05T11:15', 'FGH-1234', 'Claudia Vega S.',       'No portar documentos',          400,  'Zona Residencial',      'pendiente', ''),
('2026-04-10T13:30', 'CDE-9900', 'Hugo Alvarado T.',      'Girar en U prohibido',          600,  'Centro',                'pagada',    ''),
('2026-04-15T08:45', 'ZAB-7788', 'Isabel Mendoza P.',     'Circular en sentido contrario', 1800, 'Av. 5 de Mayo',         'pagada',    ''),
('2026-04-18T10:20', 'WXY-5566', 'Andrés Reyes C.',       'Conducir sin licencia',         2000, 'Calle Principal',       'pendiente', ''),
('2026-04-20T16:45', 'TUV-3344', 'Patricia Núñez R.',     'Uso de celular al conducir',    1500, 'Periférico Sur',        'impugnada', ''),
('2026-04-22T09:00', 'QRS-1122', 'Felipe Ortega M.',      'No respetar señal de alto',     1200, 'Av. Constitución',      'pagada',    ''),
('2026-04-25T14:30', 'NOP-8899', 'Marcela Soto V.',       'Estacionamiento prohibido',     500,  'Centro Comercial',      'pendiente', ''),
('2026-04-28T11:00', 'KLM-6677', 'Diego Ruiz Peña',       'Exceso de velocidad',           800,  'Blvd. Norte',           'pagada',    ''),
-- Mayo 2026
('2026-05-28T09:45', 'HIJ-5555', 'Sandra Mora Leal',      'Circular en sentido contrario', 1800, 'Av. Revolución',        'pagada',    ''),
('2026-05-28T12:00', 'EFG-4444', 'Roberto Díaz Cruz',     'Estacionamiento prohibido',     500,  'Mercado Municipal',     'pendiente', ''),
('2026-05-29T15:50', 'BCD-3333', 'Laura Sánchez T.',      'Exceso de velocidad',           800,  'Carretera Nacional',    'impugnada', ''),
('2026-05-29T17:10', 'YZA-2222', 'Pedro Castillo N.',     'No portar documentos',          400,  'Zona Centro',           'pagada',    ''),
('2026-05-30T08:30', 'VWX-1111', 'Carla Ríos Mon.',       'Uso de celular al conducir',    1500, 'Periférico Norte',      'vencida',   ''),
('2026-05-30T11:00', 'STU-7890', 'Luis Torres Vega',      'Girar en U prohibido',          600,  'Calle Reforma',         'pagada',    ''),
('2026-05-31T14:20', 'PQR-3456', 'Ana Martínez Sol.',     'Conducir sin licencia',         2000, 'Av. Hidalgo',           'pendiente', ''),
('2026-05-31T16:45', 'MNO-9012', 'José Hernández P.',     'No respetar señal de alto',     1200, 'Blvd. Central',         'impugnada', ''),
-- Junio 2026
('2026-06-01T09:15', 'ABC-5678', 'María García Ruiz',     'Estacionamiento prohibido',     500,  'Calle 5 de Mayo',       'pagada',    ''),
('2026-06-01T10:30', 'XYZ-1234', 'Ramón López Hdz.',      'Exceso de velocidad',           800,  'Av. Juárez',            'pendiente', '');

END IF;

-- ── Permisos (solo si la tabla está vacía) ─────────────────────
IF NOT EXISTS (SELECT 1 FROM permisos LIMIT 1) THEN

INSERT INTO permisos (titular, tipo, placa, ruta, inicio, vencimiento, estado) VALUES
('Trans. Urbanos S.A.',  'Transporte público', 'YZA-2222',  'Ruta 14 — Centro/Periférico', '2026-01-01', '2026-12-31', 'vigente'),
('Sandra Mora Leal',     'Carga y logística',  'QRS-1122',  'Zona Comercial Norte',         '2026-01-01', '2026-09-30', 'vigente'),
('Pedro Castillo N.',    'Servicio especial',  'KLM-4455',  'Todo el municipio',            '2026-01-15', '2026-12-15', 'vigente'),
('Logística del Norte',  'Carga y logística',  'HIJ-9988',  'Zona Industrial',              '2026-01-01', '2026-06-30', 'por-vencer'),
('Evento Feria 2026',    'Temporal',           'Múltiples', 'Parque Central',               '2026-05-20', '2026-06-15', 'por-vencer'),
('Autobuses Veracruz',   'Transporte público', 'NOP-7766',  'Ruta 7 — Hospital/Central',   '2025-01-01', '2025-12-31', 'vencida');

END IF;

-- ── Actividad inicial ─────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM actividad LIMIT 1) THEN

INSERT INTO actividad (tipo, texto, ts) VALUES
('infraccion', 'Infracción registrada — Ramón López Hdz. (XYZ-1234)',  '2026-06-01T10:30:00'),
('infraccion', 'Infracción registrada — María García Ruiz (ABC-5678)', '2026-06-01T09:15:00'),
('permiso',    'Permiso emitido — Trans. Urbanos S.A.',                '2026-01-01T08:00:00'),
('permiso',    'Permiso emitido — Pedro Castillo N.',                  '2026-01-15T09:00:00');

END IF;

END $$;
