/* ─────────────────────────────────────────────────────────
   Tránsito Municipal — app.js  (Supabase backend)
   ───────────────────────────────────────────────────────── */

// ── Auth (session stays in localStorage) ─────────────────
const _session = JSON.parse(localStorage.getItem('tm_session') || 'null');
if (!_session) window.location.replace('/login');
const _rol = _session?.rol || (_session?.role === 'Director de Tránsito' ? 'admin' : 'oficial');

// ── Config cache (populated on first autoFillMonto call) ──
let _cachedConfig = null;

// ── Seed constants (used by resetData & initData) ─────────
const SEED_CONFIG = {
  municipio: 'San Marcos',
  estado: 'Estado de México',
  director: 'Carlos Alvarado',
  correo: 'transito@sanmarcos.gob.mx',
  montos: {
    velocidad: 800, estacionamiento: 500, alto: 600,
    sinlicencia: 1200, celular: 700, contrario: 900,
    uprohibido: 1000, documentos: 400
  }
};

const SEED_INFRACCIONES = [
  // Jan 2026
  { fecha:'2026-01-05T09:15:00Z', placa:'ABC-123', infractor:'Roberto Gómez L.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Av. Juárez #145', estado:'pagada', obs:'' },
  { fecha:'2026-01-08T11:30:00Z', placa:'XYZ-456', infractor:'María López R.', tipo:'Estacionamiento indebido', monto:500, ubicacion:'Calle Morelos #22', estado:'pagada', obs:'' },
  { fecha:'2026-01-12T14:45:00Z', placa:'DEF-789', infractor:'Carlos Hernández M.', tipo:'No respetar alto', monto:600, ubicacion:'Av. Hidalgo esq. Reforma', estado:'pendiente', obs:'' },
  { fecha:'2026-01-15T08:20:00Z', placa:'GHI-012', infractor:'Ana Martínez S.', tipo:'Conducir sin licencia', monto:1200, ubicacion:'Blvd. Principal #500', estado:'pendiente', obs:'Reincidente' },
  { fecha:'2026-01-18T16:00:00Z', placa:'JKL-345', infractor:'Pedro Sánchez V.', tipo:'Uso de celular', monto:700, ubicacion:'Calle Libertad #88', estado:'pagada', obs:'' },
  { fecha:'2026-01-22T10:10:00Z', placa:'MNO-678', infractor:'Laura García T.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Carretera Municipal km 3', estado:'pendiente', obs:'' },
  { fecha:'2026-01-25T13:55:00Z', placa:'PQR-901', infractor:'Jorge Ramírez H.', tipo:'Documentos incompletos', monto:400, ubicacion:'Av. Independencia #33', estado:'pagada', obs:'' },
  // Feb 2026
  { fecha:'2026-02-03T09:00:00Z', placa:'STU-234', infractor:'Sofía Torres N.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Av. Juárez #200', estado:'pendiente', obs:'' },
  { fecha:'2026-02-07T15:30:00Z', placa:'VWX-567', infractor:'Diego Flores P.', tipo:'No respetar alto', monto:600, ubicacion:'Calle Hidalgo #55', estado:'pagada', obs:'' },
  { fecha:'2026-02-10T11:20:00Z', placa:'YZA-890', infractor:'Fernanda Cruz O.', tipo:'Estacionamiento indebido', monto:500, ubicacion:'Plaza Central', estado:'pagada', obs:'' },
  { fecha:'2026-02-14T08:45:00Z', placa:'BCD-123', infractor:'Arturo Mendoza K.', tipo:'Circulación en sentido contrario', monto:900, ubicacion:'Blvd. Reforma #12', estado:'pendiente', obs:'' },
  { fecha:'2026-02-17T14:10:00Z', placa:'EFG-456', infractor:'Isabel Vargas C.', tipo:'Uso de celular', monto:700, ubicacion:'Av. Morelos #45', estado:'pagada', obs:'' },
  { fecha:'2026-02-20T16:40:00Z', placa:'HIJ-789', infractor:'Manuel Ortega L.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Carretera Sur km 5', estado:'pendiente', obs:'' },
  { fecha:'2026-02-24T10:00:00Z', placa:'KLM-012', infractor:'Patricia Reyes M.', tipo:'Uso prohibido de vía', monto:1000, ubicacion:'Zona Escolar Benito Juárez', estado:'pagada', obs:'' },
  // Mar 2026
  { fecha:'2026-03-02T09:30:00Z', placa:'NOP-345', infractor:'Héctor Jiménez A.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Av. Juárez #350', estado:'pagada', obs:'' },
  { fecha:'2026-03-05T13:00:00Z', placa:'QRS-678', infractor:'Claudia Ríos B.', tipo:'Conducir sin licencia', monto:1200, ubicacion:'Calle Principal #100', estado:'pendiente', obs:'Primera infracción' },
  { fecha:'2026-03-08T11:15:00Z', placa:'TUV-901', infractor:'Enrique Morales D.', tipo:'Estacionamiento indebido', monto:500, ubicacion:'Mercado Municipal', estado:'pagada', obs:'' },
  { fecha:'2026-03-11T15:45:00Z', placa:'WXY-234', infractor:'Gloria Castillo F.', tipo:'No respetar alto', monto:600, ubicacion:'Av. 5 de Mayo esq. Juárez', estado:'pendiente', obs:'' },
  { fecha:'2026-03-15T09:20:00Z', placa:'ZAB-567', infractor:'Raúl Herrera G.', tipo:'Uso de celular', monto:700, ubicacion:'Blvd. Norte #78', estado:'pagada', obs:'' },
  { fecha:'2026-03-18T14:30:00Z', placa:'CDE-890', infractor:'Verónica Luna H.', tipo:'Documentos incompletos', monto:400, ubicacion:'Calle Reforma #25', estado:'pagada', obs:'' },
  { fecha:'2026-03-22T10:50:00Z', placa:'FGH-123', infractor:'Alejandro Peña I.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Carretera Norte km 2', estado:'pendiente', obs:'' },
  { fecha:'2026-03-25T16:15:00Z', placa:'IJK-456', infractor:'Yolanda Silva J.', tipo:'Circulación en sentido contrario', monto:900, ubicacion:'Av. Independencia #150', estado:'pagada', obs:'' },
  // Abr 2026
  { fecha:'2026-04-03T08:30:00Z', placa:'LMN-789', infractor:'Gustavo Vega K.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Av. Juárez #480', estado:'pendiente', obs:'' },
  { fecha:'2026-04-07T12:00:00Z', placa:'OPQ-012', infractor:'Beatriz Rojas L.', tipo:'Estacionamiento indebido', monto:500, ubicacion:'Centro Histórico', estado:'pagada', obs:'' },
  { fecha:'2026-04-10T15:20:00Z', placa:'RST-345', infractor:'César Aguilar M.', tipo:'Conducir sin licencia', monto:1200, ubicacion:'Calle Hidalgo #200', estado:'pendiente', obs:'' },
  { fecha:'2026-04-14T09:45:00Z', placa:'UVW-678', infractor:'Dolores Campos N.', tipo:'No respetar alto', monto:600, ubicacion:'Calle Morelos #99', estado:'pagada', obs:'' },
  { fecha:'2026-04-17T11:30:00Z', placa:'XYZ-901', infractor:'Francisco Nava O.', tipo:'Uso de celular', monto:700, ubicacion:'Blvd. Sur #34', estado:'pendiente', obs:'' },
  { fecha:'2026-04-22T14:00:00Z', placa:'ABC-234', infractor:'Guadalupe Torres P.', tipo:'Uso prohibido de vía', monto:1000, ubicacion:'Zona Peatonal Centro', estado:'pagada', obs:'' },
  { fecha:'2026-04-25T16:30:00Z', placa:'DEF-567', infractor:'Ignacio Reyes Q.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Carretera Este km 1', estado:'pendiente', obs:'' },
  // May 2026
  { fecha:'2026-05-04T09:10:00Z', placa:'GHI-890', infractor:'Julia Medina R.', tipo:'Estacionamiento indebido', monto:500, ubicacion:'Av. Morelos #320', estado:'pagada', obs:'' },
  { fecha:'2026-05-07T13:30:00Z', placa:'JKL-123', infractor:'Luis Fuentes S.', tipo:'No respetar alto', monto:600, ubicacion:'Calle 5 de Febrero #45', estado:'pendiente', obs:'' },
  { fecha:'2026-05-10T10:00:00Z', placa:'MNO-456', infractor:'Martha Guerrero T.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Av. Juárez #600', estado:'pagada', obs:'' },
  { fecha:'2026-05-13T15:45:00Z', placa:'PQR-789', infractor:'Nicolás Ramos U.', tipo:'Documentos incompletos', monto:400, ubicacion:'Calle Guerrero #18', estado:'pendiente', obs:'' },
  { fecha:'2026-05-16T08:50:00Z', placa:'STU-012', infractor:'Ofelia Cruz V.', tipo:'Circulación en sentido contrario', monto:900, ubicacion:'Blvd. Oriente #56', estado:'pagada', obs:'' },
  { fecha:'2026-05-20T12:20:00Z', placa:'VWX-345', infractor:'Pablo Espinoza W.', tipo:'Conducir sin licencia', monto:1200, ubicacion:'Av. Hidalgo #250', estado:'pendiente', obs:'Documentos vencidos' },
  { fecha:'2026-05-24T14:40:00Z', placa:'YZA-678', infractor:'Quintina Arias X.', tipo:'Uso de celular', monto:700, ubicacion:'Calle Independencia #77', estado:'pagada', obs:'' },
  { fecha:'2026-05-27T10:30:00Z', placa:'BCD-901', infractor:'Rodrigo Leal Y.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Carretera Oeste km 4', estado:'pendiente', obs:'' },
  // Jun 2026
  { fecha:'2026-06-02T09:00:00Z', placa:'EFG-234', infractor:'Sandra Mena Z.', tipo:'Estacionamiento indebido', monto:500, ubicacion:'Av. Juárez #720', estado:'pendiente', obs:'' },
  { fecha:'2026-06-02T11:15:00Z', placa:'HIJ-567', infractor:'Tomás Blanco A.', tipo:'No respetar alto', monto:600, ubicacion:'Calle Reforma #88', estado:'pendiente', obs:'' },
  { fecha:'2026-06-02T14:30:00Z', placa:'KLM-890', infractor:'Ursula Navas B.', tipo:'Exceso de velocidad', monto:800, ubicacion:'Blvd. Central #12', estado:'pendiente', obs:'' },
  { fecha:'2026-06-02T16:00:00Z', placa:'NOP-123', infractor:'Víctor Prado C.', tipo:'Uso de celular', monto:700, ubicacion:'Av. 16 de Septiembre #33', estado:'pendiente', obs:'' },
  { fecha:'2026-06-02T17:20:00Z', placa:'QRS-456', infractor:'Wendy Quintero D.', tipo:'Documentos incompletos', monto:400, ubicacion:'Calle Hidalgo #400', estado:'pendiente', obs:'' }
];

const SEED_PERMISOS = [
  { titular:'Transportes El Águila S.A.', tipo:'Transporte de carga', placa:'TRC-001', ruta:'San Marcos – Toluca', inicio:'2026-01-01', vencimiento:'2026-12-31', estado:'vigente' },
  { titular:'Servicios Viales Norte', tipo:'Transporte público', placa:'BUS-202', ruta:'Ruta 5 – Centro/Norte', inicio:'2026-03-01', vencimiento:'2026-08-31', estado:'vigente' },
  { titular:'Mudanzas Rápidas Hdez', tipo:'Transporte de carga', placa:'MUD-303', ruta:'Local – Zona Industrial', inicio:'2025-11-15', vencimiento:'2026-05-15', estado:'vencido' },
  { titular:'Autobuses Regionales SA', tipo:'Transporte público', placa:'ARG-404', ruta:'Ruta 8 – Centro/Sur', inicio:'2026-02-01', vencimiento:'2027-01-31', estado:'vigente' },
  { titular:'Distribuidora Central', tipo:'Transporte de carga', placa:'DIS-505', ruta:'Mercado Central – Distribuidoras', inicio:'2026-04-01', vencimiento:'2026-10-01', estado:'vigente' },
  { titular:'Taxis Ejecutivos Mun.', tipo:'Taxi ejecutivo', placa:'TAX-606', ruta:'Zona Centro', inicio:'2026-05-01', vencimiento:'2026-11-01', estado:'vigente' }
];

const SEED_ACTIVIDAD = [
  { tipo:'infraccion', texto:'Infracción INF-2026-0045 registrada — Documentos incompletos (QRS-456)', ts: new Date().toISOString() },
  { tipo:'infraccion', texto:'Infracción INF-2026-0044 registrada — Uso de celular (NOP-123)', ts: new Date(Date.now()-3600000).toISOString() },
  { tipo:'permiso',    texto:'Permiso PER-2026-0001 creado — Transportes El Águila S.A.', ts: new Date(Date.now()-86400000).toISOString() },
  { tipo:'config',    texto:'Configuración del sistema actualizada por Carlos Alvarado', ts: new Date(Date.now()-172800000).toISOString() }
];

const SEED_VEHICULOS = [
  { placa:'ABC-123', propietario:'Roberto Gómez López',    tipo:'automovil',   marca:'Nissan',        modelo:'Sentra',    anio:2019, color:'Blanco',   num_serie:'3N1AB7AP4KL123456', estado:'activo', telefono:'5551234567' },
  { placa:'XYZ-456', propietario:'María López Ramírez',    tipo:'camioneta',   marca:'Ford',          modelo:'Explorer',  anio:2021, color:'Gris',     num_serie:'1FMHK8D80BGA45678', estado:'activo', telefono:'5552345678' },
  { placa:'DEF-789', propietario:'Carlos Hernández Mora',  tipo:'automovil',   marca:'Volkswagen',    modelo:'Jetta',     anio:2020, color:'Negro',    num_serie:null, estado:'activo', telefono:'5553456789' },
  { placa:'GHI-012', propietario:'Ana Martínez Soto',      tipo:'automovil',   marca:'Chevrolet',     modelo:'Aveo',      anio:2018, color:'Rojo',     num_serie:null, estado:'activo', telefono:'5554567890' },
  { placa:'JKL-345', propietario:'Pedro Sánchez Vargas',   tipo:'motocicleta', marca:'Honda',         modelo:'CB500F',    anio:2022, color:'Azul',     num_serie:null, estado:'activo', telefono:'5555678901' },
  { placa:'MNO-678', propietario:'Laura García Torres',    tipo:'automovil',   marca:'Toyota',        modelo:'Corolla',   anio:2020, color:'Plateado', num_serie:'2T1BURHE8JC123789', estado:'activo', telefono:'5556789012' },
  { placa:'PQR-901', propietario:'Jorge Ramírez Herrera',  tipo:'camioneta',   marca:'Chevrolet',     modelo:'Silverado', anio:2019, color:'Blanco',   num_serie:null, estado:'activo', telefono:null },
  { placa:'STU-234', propietario:'Sofía Torres Nuño',      tipo:'automovil',   marca:'Kia',           modelo:'Rio',       anio:2021, color:'Rojo',     num_serie:null, estado:'activo', telefono:'5557890123' },
  { placa:'KLM-890', propietario:'Ursula Navas Bravo',     tipo:'camion',      marca:'International', modelo:'4300',      anio:2017, color:'Blanco',   num_serie:'INTLDCFE67H123001', estado:'activo', telefono:'5558901234' },
  { placa:'RST-345', propietario:'César Aguilar Mora',     tipo:'automovil',   marca:'Honda',         modelo:'Civic',     anio:2022, color:'Negro',    num_serie:null, estado:'activo', telefono:'5559012345' },
  { placa:'VWX-345', propietario:'Pablo Espinoza Walker',  tipo:'automovil',   marca:'Mazda',         modelo:'3',         anio:2021, color:'Azul',     num_serie:null, estado:'activo', telefono:'5550123456' },
  { placa:'BCD-901', propietario:'Rodrigo Leal Yáñez',    tipo:'camioneta',   marca:'RAM',           modelo:'1500',      anio:2020, color:'Gris',     num_serie:null, estado:'activo', telefono:'5551122334' },
  { placa:'EFG-234', propietario:'Sandra Mena Zárate',     tipo:'automovil',   marca:'Seat',          modelo:'Ibiza',     anio:2019, color:'Verde',    num_serie:null, estado:'activo', telefono:'5552233445' },
  { placa:'NOP-123', propietario:'Víctor Prado Castro',    tipo:'automovil',   marca:'Hyundai',       modelo:'Elantra',   anio:2020, color:'Blanco',   num_serie:null, estado:'activo', telefono:'5553344556' },
  { placa:'QRS-456', propietario:'Wendy Quintero Díaz',    tipo:'motocicleta', marca:'Yamaha',        modelo:'MT-07',     anio:2021, color:'Naranja',  num_serie:null, estado:'activo', telefono:'5554455667' }
];

const SEED_GRUA = [
  { placa:'KLM-890', propietario:'Ursula Navas Bravo',  motivo:'Doble fila',                    oficial:'Agente Martínez R.', ubicacion:'Av. Juárez esq. Hidalgo, Centro',           costo_deposito:900,  costo_diario:200, estado:'retenido', fecha:'2026-06-01T09:30:00Z', obs:'Obstruyendo carril de autobuses' },
  { placa:'PQR-901', propietario:'Jorge Ramírez Herrera', motivo:'Obstrucción de vía pública',  oficial:'Agente López G.',    ubicacion:'Calle Morelos #88, Centro',                 costo_deposito:700,  costo_diario:150, estado:'retenido', fecha:'2026-05-28T14:15:00Z', obs:null },
  { placa:'DEF-789', propietario:'Carlos Hernández Mora', motivo:'Sin verificación vehicular',  oficial:'Agente García F.',   ubicacion:'Blvd. Norte km 3',                          costo_deposito:600,  costo_diario:120, estado:'retenido', fecha:'2026-05-20T11:00:00Z', obs:'Verificación vencida desde enero 2026' },
  { placa:'RST-345', propietario:'César Aguilar Mora',   motivo:'Placa no visible / inválida', oficial:'Agente García F.',   ubicacion:'Carretera Federal km 12',                   costo_deposito:600,  costo_diario:100, estado:'retenido', fecha:'2026-06-02T16:30:00Z', obs:'Placa delantera destruida intencionalmente' },
  { placa:'GHI-012', propietario:'Ana Martínez Soto',    motivo:'Conductor en estado etílico', oficial:'Agente Ramos P.',    ubicacion:'Av. Independencia #200, Zona Centro',       costo_deposito:1200, costo_diario:250, estado:'liberado', fecha:'2026-05-10T22:45:00Z', obs:'Conductora alcoholizada en operativo nocturno', fecha_liberacion:'2026-05-11T10:00:00Z' },
  { placa:'BCD-901', propietario:'Rodrigo Leal Yáñez',   motivo:'Vehículo abandonado',         oficial:'Agente Torres V.',   ubicacion:'Periférico Sur km 8',                       costo_deposito:800,  costo_diario:180, estado:'liberado', fecha:'2026-04-25T08:00:00Z', obs:'Abandonado más de 5 días en vía pública', fecha_liberacion:'2026-05-01T09:30:00Z' },
  { placa:'MNO-678', propietario:'Laura García Torres',  motivo:'Zona prohibida',              oficial:'Agente Mendoza L.',  ubicacion:'Zona Escolar Benito Juárez, Col. Centro',   costo_deposito:700,  costo_diario:150, estado:'liberado', fecha:'2026-04-15T07:20:00Z', obs:null, fecha_liberacion:'2026-04-15T16:00:00Z' },
  { placa:'VWX-345', propietario:'Pablo Espinoza Walker', motivo:'Doble fila',                 oficial:'Agente López G.',    ubicacion:'Mercado Municipal, Acceso Sur',             costo_deposito:700,  costo_diario:150, estado:'liberado', fecha:'2026-05-05T10:00:00Z', obs:null, fecha_liberacion:'2026-05-06T08:00:00Z' }
];

const SEED_ACCIDENTES = [
  { tipo:'choque',    ubicacion:'Av. Juárez esq. Hidalgo, Centro',            descripcion:'Colisión frontal entre vehículo particular y camioneta de reparto. El conductor del vehículo menor invadió carril contrario al intentar rebasar.',                                                         lesionados:2, fallecidos:0, oficial:'Agente Martínez R.', estado:'cerrado',    fecha:'2026-05-15T08:30:00Z', obs:'Ambos conductores con lesiones leves. Daños materiales significativos.', partes:'[{"nombre":"Roberto Gómez López","placa":"ABC-123","licencia":"MX-1234567","aseguradora":"GNP Seguros"},{"nombre":"Transportes Veloz S.A.","placa":"TRP-881","licencia":"CP-8876543","aseguradora":"AXA Seguros"}]' },
  { tipo:'atropello', ubicacion:'Calle Morelos #45, Centro Histórico',         descripcion:'Peatón cruzó fuera del cruce peatonal y fue impactado por vehículo que circulaba a velocidad reglamentaria.',                                                                                            lesionados:1, fallecidos:0, oficial:'Agente López G.', estado:'derivado',   fecha:'2026-05-22T17:45:00Z', obs:'Peatón trasladado a hospital. Expediente derivado al Ministerio Público.', partes:'[{"nombre":"Carlos Hernández Mora","placa":"DEF-789","licencia":"MX-9876543","aseguradora":"Qualitas"}]' },
  { tipo:'choque',    ubicacion:'Blvd. Central esq. Av. Reforma',              descripcion:'Alcance en cadena entre tres vehículos durante hora pico. El primer vehículo frenó de emergencia y los siguientes no mantuvieron distancia de seguridad.',                                               lesionados:0, fallecidos:0, oficial:'Agente Ramos P.', estado:'cerrado',    fecha:'2026-04-18T18:20:00Z', obs:'Sin lesionados. Los tres conductores llegaron a acuerdo entre partes.', partes:'[{"nombre":"Laura García Torres","placa":"MNO-678","licencia":"MX-5555123","aseguradora":"GNP Seguros"},{"nombre":"Sofía Torres Nuño","placa":"STU-234","licencia":"MX-7771234","aseguradora":"HDI Seguros"},{"nombre":"Sin identificar","placa":"AAA-999","licencia":"","aseguradora":""}]' },
  { tipo:'volcadura', ubicacion:'Carretera Municipal km 5, curva La Loma',     descripcion:'Camioneta perdió el control en curva pronunciada por exceso de velocidad. El vehículo volcó quedando sobre el acotamiento.',                                                                              lesionados:1, fallecidos:0, oficial:'Agente García F.', estado:'cerrado',   fecha:'2026-04-05T21:10:00Z', obs:'Conductor con fractura en brazo. Vehículo con daño total. Alcoholemia negativa.', partes:'[{"nombre":"Pablo Espinoza Walker","placa":"VWX-345","licencia":"MX-3334567","aseguradora":"Mapfre"}]' },
  { tipo:'choque',    ubicacion:'Av. 16 de Septiembre esq. Calle Guerrero',    descripcion:'Colisión entre motocicleta y unidad de transporte público. La motociclista se incorporó de forma imprudente al carril de la ruta 5.',                                                                    lesionados:1, fallecidos:0, oficial:'Agente Torres V.', estado:'en_proceso', fecha:'2026-06-01T12:05:00Z', obs:'Motociclista con traumatismo leve, hospitalizada para observación. Se investigan responsabilidades.', partes:'[{"nombre":"Wendy Quintero Díaz","placa":"QRS-456","licencia":"MX-9990012","aseguradora":"Sin seguro"},{"nombre":"Autobuses del Norte S.A.","placa":"BUS-202","licencia":"CP-2234567","aseguradora":"AIG Seguros"}]' },
  { tipo:'atropello', ubicacion:'Zona Escolar Benito Juárez, Entrada Principal',descripcion:'Menor de edad fue rozado por vehículo al salir del plantel escolar. El conductor realizó maniobra imprudente en zona de seguridad escolar.',                                                             lesionados:1, fallecidos:0, oficial:'Agente Mendoza L.', estado:'en_proceso', fecha:'2026-06-02T13:30:00Z', obs:'Menor trasladado a clínica. Padres presentaron denuncia. Conductora con aliento alcohólico.', partes:'[{"nombre":"Ana Martínez Soto","placa":"GHI-012","licencia":"MX-4443210","aseguradora":"HDI Seguros"}]' }
];

// ── Helpers ───────────────────────────────────────────────
function fmt(n) { return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0}).format(n||0); }
function fmtDateShort(d) { if(!d) return '—'; try { return new Date(d).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){return d;} }
function fmtDateInput(d) { if(!d) return ''; const dt=new Date(d); const y=dt.getFullYear(); const m=String(dt.getMonth()+1).padStart(2,'0'); const dd=String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function estadoBadge(e) {
  const map = {
    pagada:'badge-green', vigente:'badge-green', activa:'badge-green',
    pendiente:'badge-yellow', suspendido:'badge-yellow', 'por-vencer':'badge-yellow',
    cancelada:'badge-red', vencido:'badge-red', vencida:'badge-red',
    impugnada:'badge-blue'
  };
  return `<span class="${map[e]||'badge-muted'}">${e||'—'}</span>`;
}
function $(id) { return document.getElementById(id); }

// ── logActivity ───────────────────────────────────────────
async function logActivity(tipo, texto) {
  await _sb.from('actividad').insert({ tipo, texto });
  const { count } = await _sb.from('actividad').select('*', { count: 'exact', head: true });
  if (count > 20) {
    const { data: old } = await _sb.from('actividad').select('id').order('ts',{ascending:true}).range(0, count-21);
    if (old && old.length) {
      await _sb.from('actividad').delete().in('id', old.map(r=>r.id));
    }
  }
}

// ── Navigation ────────────────────────────────────────────
const VIEWS = ['dashboard','infracciones','permisos','reportes','configuracion','caja','oficiales','usuarios','vehiculos','grua','accidentes','mapa','rendimiento','calendario'];

// ── Fotos (compresión client-side) ───────────────────────
async function compressPhoto(file, maxPx = 1000) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxPx || h > maxPx) {
          if (w > h) { h = Math.round(h * maxPx / w); w = maxPx; }
          else { w = Math.round(w * maxPx / h); h = maxPx; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function previewFotos(input, containerId) {
  const prev = document.getElementById(containerId || 'inf-fotos-preview');
  if (!prev) return;
  prev.innerHTML = '';
  const files = Array.from(input.files).slice(0, 3);
  files.forEach(f => {
    const url = URL.createObjectURL(f);
    const img = document.createElement('img');
    img.src = url; img.className = 'foto-thumb';
    img.title = 'Clic para ver en grande';
    img.onclick = () => window.open(url, '_blank');
    prev.appendChild(img);
  });
}

// ── Geolocalización ──────────────────────────────────────
async function captureLocation() {
  const btn = document.getElementById('btn-geolocate');
  const status = document.getElementById('inf-geo-status');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000, enableHighAccuracy: true })
    );
    window._infLat = pos.coords.latitude;
    window._infLng = pos.coords.longitude;
    const ubi = document.getElementById('inf-ubicacion');
    if (status) status.innerHTML = `<span style="color:var(--muted)">Obteniendo dirección…</span>`;
    // Reverse geocode with Nominatim (free, no API key)
    let addr = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
    try {
      const gr = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&accept-language=es`,
        { headers: { 'Accept': 'application/json' } }
      );
      if (gr.ok) {
        const gj = await gr.json();
        const a = gj.address || {};
        const parts = [a.road, a.house_number, a.suburb||a.neighbourhood||a.quarter, a.city||a.town||a.municipality||a.county].filter(Boolean);
        if (parts.length) addr = parts.join(', ');
      }
    } catch(_) { /* sin conexión — usar coordenadas */ }
    if (ubi && !ubi.value) ubi.value = addr;
    if (status) status.innerHTML = `<span style="color:var(--green)">✓ Ubicación capturada (±${Math.round(pos.coords.accuracy)}m)</span>`;
    if (btn) { btn.textContent = '✓ GPS'; btn.style.color = 'var(--green)'; btn.disabled = false; }
  } catch(e) {
    if (status) status.textContent = 'No se pudo obtener la ubicación GPS';
    if (btn) { btn.textContent = 'GPS'; btn.disabled = false; }
    showToast('GPS no disponible: ' + e.message);
  }
}

function toggleSidebar() {
  const s = document.getElementById('sidebar');
  const b = document.getElementById('sidebar-backdrop');
  const open = s.classList.toggle('open');
  b.classList.toggle('open', open);
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-backdrop')?.classList.remove('open');
}

function navigate(view, btn) {
  VIEWS.forEach(v => {
    const el = $('view-'+v);
    if (el) el.style.display = v===view ? 'block' : 'none';
  });
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    const match = document.querySelector(`.nav-item[onclick*="'${view}'"]`);
    if (match) match.classList.add('active');
  }
  const titles = { dashboard:'Panel general', infracciones:'Control de Infracciones', permisos:'Permisos de Circulación', reportes:'Reportes', configuracion:'Configuración', caja:'Pagos / Caja', oficiales:'Desempeño de Oficiales', usuarios:'Gestión de Usuarios', vehiculos:'Padrón Vehicular', grua:'Grúa / Corralón', accidentes:'Accidentes Viales', mapa:'Mapa de Infracciones', rendimiento:'Rendimiento por Oficial', calendario:'Calendario de Infracciones' };
  const crumbs = { dashboard:'Dashboard', infracciones:'Infracciones', permisos:'Permisos', reportes:'Reportes', configuracion:'Configuración', caja:'Caja', oficiales:'Oficiales', usuarios:'Usuarios', vehiculos:'Vehículos', grua:'Grúa', accidentes:'Accidentes', mapa:'Mapa', rendimiento:'Rendimiento', calendario:'Calendario' };
  if($('topbar-title')) $('topbar-title').textContent = titles[view] || view;
  if($('topbar-crumb')) $('topbar-crumb').textContent = crumbs[view] || view;
  if (view==='dashboard')     renderDashboard();
  if (view==='infracciones')  renderInfracciones();
  if (view==='permisos')      renderPermisos();
  if (view==='configuracion') loadConfig();
  if (view==='caja')          renderCaja();
  if (view==='oficiales')     renderOficiales();
  if (view==='usuarios')      renderUsuarios();
  if (view==='vehiculos')     renderVehiculos();
  if (view==='grua')          renderGrua();
  if (view==='mapa')          renderMapa();
  if (view==='rendimiento')   renderRendimiento();
  if (view==='accidentes')    renderAccidentes();
  if (view==='calendario')    renderCalendario();
  if (window.innerWidth <= 768) closeSidebar();
}

// ── Dashboard ─────────────────────────────────────────────
async function renderDashboard() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1;
  const mesInicio = `${y}-${String(m).padStart(2,'0')}-01`;
  const mesFin = new Date(y, m, 1).toISOString().slice(0,10);
  const today = now.toISOString().slice(0,10);

  // Actualizar fecha en header
  if ($('dash-fecha-hoy')) {
    $('dash-fecha-hoy').textContent = now.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  }

  const [
    { data: infAll },
    { data: infMes },
    { data: perAll },
    { data: act },
    { data: pagosHoy },
    { count: gruaCount }
  ] = await Promise.all([
    _sb.from('infracciones').select('id,folio,placa,monto,estado,fecha,tipo,oficial'),
    _sb.from('infracciones').select('id,monto,estado,tipo').gte('fecha', mesInicio).lt('fecha', mesFin),
    _sb.from('permisos').select('id,estado'),
    _sb.from('actividad').select('*').order('ts',{ascending:false}).limit(8),
    _sb.from('pagos').select('monto_final').gte('created_at', today+'T00:00:00').lte('created_at', today+'T23:59:59'),
    _sb.from('grua').select('*',{count:'exact',head:true}).eq('estado','retenido')
  ]);

  const inf = infAll || [], infM = infMes || [], per = perAll || [];
  const infMesCount = infM.length;
  const infPend = inf.filter(r=>r.estado==='pendiente').length;
  const perVig  = per.filter(r=>r.estado==='vigente').length;
  const recMes  = infM.filter(r=>r.estado==='pagada').reduce((a,r)=>a+Number(r.monto),0);
  const recHoy  = (pagosHoy||[]).reduce((a,r)=>a+Number(r.monto_final),0);
  const pagosHoyCount = (pagosHoy||[]).length;

  const pm = m===1?12:m-1, py = m===1?y-1:y;
  const pmInicio = `${py}-${String(pm).padStart(2,'0')}-01`;
  const { data: infPrevMes } = await _sb.from('infracciones').select('id,monto,estado').gte('fecha',pmInicio).lt('fecha',mesInicio);
  const prevM = infPrevMes || [];
  const prevCount = prevM.length;
  const prevRec = prevM.filter(r=>r.estado==='pagada').reduce((a,r)=>a+Number(r.monto),0);
  const delta = c => c>0 ? `<span class="delta-up">▲ ${c} vs mes anterior</span>` : c<0 ? `<span class="delta-dn">▼ ${Math.abs(c)} vs mes anterior</span>` : `<span style="color:var(--muted)">igual al mes anterior</span>`;

  const mesNombre = now.toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  if($('s-inf-label'))  $('s-inf-label').textContent = `Infracciones · ${mesNombre}`;
  if($('s-rec-label'))  $('s-rec-label').textContent = `Recaudación · ${mesNombre}`;

  if($('s-inf'))        $('s-inf').textContent     = infMesCount;
  if($('s-pend'))       $('s-pend').textContent    = infPend;
  if($('s-per'))        $('s-per').textContent     = perVig;
  if($('s-rec'))        $('s-rec').textContent     = fmt(recMes);
  if($('s-hoy'))        $('s-hoy').textContent     = fmt(recHoy);
  if($('s-hoy-count'))  $('s-hoy-count').textContent = pagosHoyCount ? `${pagosHoyCount} pago${pagosHoyCount>1?'s':''} registrado${pagosHoyCount>1?'s':''}` : 'Sin pagos hoy';
  if($('s-grua'))       $('s-grua').textContent    = gruaCount ?? '—';
  if($('s-grua-sub'))   $('s-grua-sub').textContent = gruaCount ? 'vehículos retenidos actualmente' : 'corralón vacío';
  if($('s-inf-delta'))  $('s-inf-delta').innerHTML = delta(infMesCount - prevCount);
  if($('s-pend-delta')) $('s-pend-delta').innerHTML = `<span style="color:var(--muted)">${infPend} sin cobrar en total</span>`;
  if($('s-rec-delta'))  $('s-rec-delta').innerHTML = delta(recMes - prevRec);
  if($('s-per-delta'))  $('s-per-delta').textContent = '';
  if($('badge-pendientes')) $('badge-pendientes').textContent = infPend || '';

  // Donut por estado
  const estadoColors = { pendiente:'#D97706', pagada:'#059669', impugnada:'#2563EB', cancelada:'#DC2626', vencida:'#9CA3AF' };
  const estados = {};
  inf.forEach(r=>{ estados[r.estado]=(estados[r.estado]||0)+1; });
  const sorted = Object.entries(estados).sort((a,b)=>b[1]-a[1]);
  const totalInf = inf.length || 1;
  let conic = '', deg = 0;
  const donutEl = $('main-donut');
  if (donutEl) {
    sorted.forEach(([k,v])=>{
      const pct = v/totalInf*360;
      conic += `${estadoColors[k]||'#9CA3AF'} ${deg}deg ${deg+pct}deg,`;
      deg += pct;
    });
    donutEl.style.background = `conic-gradient(${conic.slice(0,-1)})`;
    if($('donut-center-txt')) {
      $('donut-center-txt').innerHTML = `<div style="font-size:.9rem;font-weight:800;color:var(--ink)">${inf.length}</div><div style="font-size:.6rem;color:var(--muted)">total</div>`;
    }
  }
  if($('dash-legend')) {
    $('dash-legend').innerHTML = sorted.map(([k,v])=>`
      <div class="legend-row">
        <span class="legend-dot" style="background:${estadoColors[k]||'#9CA3AF'}"></span>
        <span class="legend-label">${k.charAt(0).toUpperCase()+k.slice(1)}</span>
        <span class="legend-val">${v}</span>
      </div>`).join('');
  }

  // Top tipos del mes
  if ($('dash-tipos-body')) {
    const tipoCount = {};
    infM.forEach(r=>{ if(r.tipo) tipoCount[r.tipo]=(tipoCount[r.tipo]||0)+1; });
    const topTipos = Object.entries(tipoCount).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const maxT = topTipos[0]?.[1] || 1;
    if ($('dash-tipos-mes')) $('dash-tipos-mes').textContent = mesNombre;
    $('dash-tipos-body').innerHTML = topTipos.length ? topTipos.map(([t,c])=>`
      <div style="margin-bottom:.65rem">
        <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:.25rem">
          <span style="color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:75%">${t}</span>
          <span style="color:var(--muted);flex-shrink:0;margin-left:.4rem">${c}</span>
        </div>
        <div style="height:6px;background:var(--stone);border-radius:3px;overflow:hidden">
          <div style="width:${Math.round(c/maxT*100)}%;height:100%;background:var(--ac);border-radius:3px;transition:width .4s"></div>
        </div>
      </div>`).join('') : '<div style="color:var(--muted);font-size:.8rem;padding:.25rem 0">Sin infracciones este mes</div>';
  }

  // Infracciones recientes (8 filas, con placa, clickeables)
  const recent = [...inf].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,8);
  if($('dash-rec-sub')) $('dash-rec-sub').textContent = `Últimas ${recent.length} registradas`;
  if($('dash-tbody')) {
    $('dash-tbody').innerHTML = recent.length ? recent.map(r=>`
      <tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer">
        <td class="mono" style="font-size:.72rem">${r.folio||'—'}</td>
        <td style="font-weight:600;font-family:monospace;font-size:.78rem">${r.placa||'—'}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.tipo}</td>
        <td style="font-weight:600">${fmt(r.monto)}</td>
        <td>${estadoBadge(r.estado)}</td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Sin datos</td></tr>';
  }

  // Activity feed
  const actColors = { infraccion:'#DC2626', permiso:'#1A7A82', config:'#6B7280', info:'#2563EB', pago:'#059669' };
  if($('dash-activity')) {
    $('dash-activity').innerHTML = (act||[]).map(a=>`
      <div class="act-row">
        <span class="act-dot" style="background:${actColors[a.tipo]||'#9CA3AF'}33;color:${actColors[a.tipo]||'#9CA3AF'}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>
        </span>
        <div style="flex:1;min-width:0">
          <div class="act-txt" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.texto}</div>
          <div class="act-time">${fmtDateShort(a.ts)}</div>
        </div>
      </div>`).join('') || '<div style="color:var(--muted);font-size:.8rem;padding:.5rem 0">Sin actividad reciente</div>';
  }

  renderBarChart(infAll);

  // Alertas: permisos por vencer y multas por prescribir
  const en30 = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const hace25 = new Date(Date.now()-25*86400000).toISOString();
  const todayStr = new Date().toISOString().slice(0,10);
  const [{ data: permAlerta }, { data: infAlerta }] = await Promise.all([
    _sb.from('permisos').select('id,num,titular,vencimiento').in('estado',['vigente','por-vencer']).lte('vencimiento',en30).gte('vencimiento',todayStr),
    _sb.from('infracciones').select('id,folio,placa').eq('estado','pendiente').lt('fecha',hace25)
  ]);
  const alertsEl = $('dash-alerts');
  if (alertsEl) {
    let html = '';
    if (permAlerta && permAlerta.length) {
      const btn = `<button class="btn btn-ghost btn-sm" onclick="navigate('permisos',document.querySelector('.nav-item[onclick*=permisos]'))">Ver permisos</button>`;
      html += `<div style="background:var(--amber-bg);border:1px solid #FDE68A;border-radius:var(--r);padding:.8rem 1.1rem;margin-bottom:.75rem;display:flex;align-items:center;gap:.75rem">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <div style="flex:1"><div style="font-size:.8rem;font-weight:700;color:#92400E">${permAlerta.length} permiso${permAlerta.length>1?'s':''} vence${permAlerta.length>1?'n':''} en los próximos 30 días</div>
        <div style="font-size:.73rem;color:#D97706">${permAlerta.slice(0,2).map(p=>`${p.num||'—'} — ${p.titular}`).join(' · ')}${permAlerta.length>2?' · …':''}</div></div>${btn}</div>`;
    }
    if (infAlerta && infAlerta.length) {
      const btn2 = `<button class="btn btn-ghost btn-sm" onclick="navigate('infracciones',document.querySelector('.nav-item[onclick*=infracciones]'))">Ver infracciones</button>`;
      html += `<div style="background:var(--red-bg);border:1px solid #FECACA;border-radius:var(--r);padding:.8rem 1.1rem;margin-bottom:.75rem;display:flex;align-items:center;gap:.75rem">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div style="flex:1"><div style="font-size:.8rem;font-weight:700;color:#991B1B">${infAlerta.length} infracción${infAlerta.length>1?'es':''} pendiente${infAlerta.length>1?'s':''} con más de 25 días sin pagar</div>
        <div style="font-size:.73rem;color:#DC2626">${infAlerta.slice(0,2).map(i=>`${i.folio||'—'} (${i.placa})`).join(' · ')}${infAlerta.length>2?' · …':''}</div></div>${btn2}</div>`;
    }
    alertsEl.innerHTML = html;
  }
  renderAlertas();
}

async function renderAlertas() {
  const panel = $('alertas-panel'); if (!panel) return;
  const hoy = new Date().toISOString().slice(0,10);
  const en7 = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const hace15 = new Date(Date.now()-15*86400000).toISOString();
  const hace27 = new Date(Date.now()-27*86400000).toISOString();
  const hace7  = new Date(Date.now()-7*86400000).toISOString();

  const [
    { data: permVenc },
    { data: infProxVenc },
    { data: gruaLarga },
    { data: impSinResolver },
    { data: accProceso }
  ] = await Promise.all([
    _sb.from('permisos').select('id').in('estado',['vigente','por-vencer']).lte('vencimiento', en7).gte('vencimiento', hoy),
    _sb.from('infracciones').select('id').eq('estado','pendiente').lte('fecha', hace27),
    _sb.from('grua').select('id').eq('estado','retenido').lte('fecha', hace15),
    _sb.from('infracciones').select('id').eq('estado','impugnada').lte('fecha', hace7),
    _sb.from('accidentes').select('id').eq('estado','en_proceso').limit(99)
  ]);

  const alertas = [];
  if (permVenc?.length)       alertas.push({ color:'amber', icon:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>',  title:`${permVenc.length} permiso${permVenc.length>1?'s':''} vencen esta semana`, sub:'Renovar antes de que expiren', view:'permisos', bg:'#FFFBEB', ic:'#D97706' });
  if (infProxVenc?.length)    alertas.push({ color:'red',   icon:'<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/>', title:`${infProxVenc.length} infracción${infProxVenc.length>1?'es':''} próximas a vencer`, sub:'Sin pago, vencen en 3 días o menos', view:'infracciones', bg:'#FEF2F2', ic:'#DC2626' });
  if (gruaLarga?.length)      alertas.push({ color:'red',   icon:'<path d="M18 8h2a2 2 0 012 2v6h-4M6 8H2v10h2"/><circle cx="9" cy="18" r="2"/><circle cx="15" cy="18" r="2"/>',        title:`${gruaLarga.length} vehículo${gruaLarga.length>1?'s':''} retenido${gruaLarga.length>1?'s':''} +15 días`, sub:'Corralón con retenciones prolongadas', view:'grua', bg:'#FEF2F2', ic:'#DC2626' });
  if (impSinResolver?.length) alertas.push({ color:'blue',  icon:'<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',  title:`${impSinResolver.length} impugnación${impSinResolver.length>1?'es':''} sin resolver +7 días`, sub:'Requieren resolución del supervisor', view:'infracciones', bg:'#EFF6FF', ic:'#2563EB' });
  if (accProceso?.length)     alertas.push({ color:'amber', icon:'<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/>',  title:`${accProceso.length} accidente${accProceso.length>1?'s':''} en proceso`, sub:'Registros sin cerrar', view:'accidentes', bg:'#FFFBEB', ic:'#D97706' });

  if (!alertas.length) { panel.style.display='none'; return; }
  panel.style.display='grid';
  panel.innerHTML = alertas.map(a => `
    <div class="alerta-card ${a.color}" style="background:${a.bg};border-color:${a.ic}33" onclick="navigate('${a.view}')" title="Ver ${a.view}">
      <div class="alerta-icon" style="background:${a.ic}18"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${a.ic}" stroke-width="2">${a.icon}</svg></div>
      <div class="alerta-body"><div class="alerta-title" style="color:${a.ic}">${a.title}</div><div class="alerta-sub" style="color:${a.ic}bb">${a.sub}</div></div>
    </div>`).join('');
}

async function renderBarChart(infAll) {
  const el = $('dash-bar-chart');
  if (!el) return;
  const yearEl = $('dash-chart-year');
  const year = yearEl ? parseInt(yearEl.textContent)||new Date().getFullYear() : new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const inf = infAll || [];
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const counts = Array(12).fill(0);
  inf.forEach(r => {
    const d = new Date(r.fecha);
    if (d.getFullYear()===year) counts[d.getMonth()]++;
  });
  const max = Math.max(...counts, 1);
  el.innerHTML = counts.map((c,i)=>{
    const isCurrent = (i === currentMonth && year === new Date().getFullYear());
    const h = Math.max(Math.round(c/max*100), c > 0 ? 4 : 0);
    return `
    <div class="bar-col" title="${months[i]}: ${c} infracción${c!==1?'es':''}" onclick="navigate('calendario')">
      <div class="bar-val ${isCurrent?'current':''}">${c > 0 ? c : ''}</div>
      <div class="bar-fill ${isCurrent?'current':''}" style="height:${h}%"></div>
      <div class="bar-label ${isCurrent?'current':''}">${months[i]}</div>
    </div>`}).join('');
}

// ── Infracciones ──────────────────────────────────────────
let _infPage = 1, _infSearch = '', _infEstado = '', _infTipo = '', _infPeriodo = '', _infSort = 'fecha_desc';
const INF_PAGE_SIZE = 15;

function _periodoRango(periodo) {
  const now = new Date();
  if (periodo === 'hoy') {
    return now.toISOString().slice(0,10);
  }
  if (periodo === 'semana') {
    const d = new Date(now); d.setDate(d.getDate()-7); return d.toISOString();
  }
  if (periodo === 'mes') {
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01T00:00:00`;
  }
  if (periodo === 'mes3') {
    const d = new Date(now); d.setMonth(d.getMonth()-3); return d.toISOString();
  }
  return null;
}

async function renderInfracciones() {
  const tbody = $('inf-table');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted)">Cargando…</td></tr>`;

  // Populate tipo filter on first run
  const tipoEl = $('inf-tipo-filter');
  if (tipoEl && tipoEl.options.length <= 1) {
    const tipos = [...TIPOS_BASE];
    if (_cachedConfig?.tipos_extra) tipos.push(...(_cachedConfig.tipos_extra||[]));
    tipoEl.innerHTML = '<option value="">Todos los tipos</option>' +
      [...new Set(tipos)].filter(t=>t&&t!=='Otro').map(t=>`<option value="${t}">${t}</option>`).join('') +
      '<option value="Otro">Otro</option>';
  }

  let q = _sb.from('infracciones').select('*');
  if (_infEstado)  q = q.eq('estado', _infEstado);
  if (_infTipo)    q = q.eq('tipo', _infTipo);
  if (_infSearch)  q = q.or(`placa.ilike.%${_infSearch}%,infractor.ilike.%${_infSearch}%,folio.ilike.%${_infSearch}%`);
  if (_infPeriodo) {
    const desde = _periodoRango(_infPeriodo);
    if (_infPeriodo === 'hoy') {
      q = q.gte('fecha', desde+'T00:00:00').lte('fecha', desde+'T23:59:59');
    } else if (desde) {
      q = q.gte('fecha', desde);
    }
  }

  // Sort
  const [sortCol, sortDir] = _infSort.split('_');
  const asc = sortDir === 'asc';
  if (sortCol === 'monto') q = q.order('monto', {ascending: asc});
  else if (sortCol === 'folio') q = q.order('folio', {ascending: asc});
  else q = q.order('fecha', {ascending: asc});

  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="9" style="color:red">${error.message}</td></tr>`; return; }

  const all = data || [];

  // Stats strip
  const strip = $('inf-stats-strip');
  if (strip) {
    const pend = all.filter(r=>r.estado==='pendiente');
    const paga = all.filter(r=>r.estado==='pagada');
    const venc = all.filter(r=>r.estado==='vencida');
    const montoPend = pend.reduce((a,r)=>a+Number(r.monto),0);
    const montoRec  = paga.reduce((a,r)=>a+Number(r.monto),0);
    const pill = (label, num, sub, color) =>
      `<div class="inf-stat-pill">
        <span style="color:${color||'var(--muted)'}">●</span>
        <span><span class="isp-num">${num}</span> ${label}${sub?`<span class="isp-amt"> · ${sub}</span>`:''}</span>
      </div>`;
    strip.innerHTML =
      pill('total', all.length, '', 'var(--subtle)') +
      pill('pendientes', pend.length, fmt(montoPend), 'var(--amber)') +
      pill('pagadas', paga.length, fmt(montoRec), 'var(--green)') +
      (venc.length ? pill('vencidas', venc.length, '', 'var(--red)') : '');
  }

  // Reincidentes (placas con > 1 infracción en el set)
  const placaCount = {};
  all.forEach(r => { placaCount[r.placa] = (placaCount[r.placa]||0)+1; });

  // Sort header indicators
  ['folio','fecha','monto'].forEach(col => {
    const el = $('th-'+col);
    if (!el) return;
    const isActive = _infSort.startsWith(col);
    el.classList.toggle('active', isActive);
    const icon = el.querySelector('.th-sort-icon');
    if (icon) icon.textContent = isActive ? (_infSort.endsWith('asc') ? '↑' : '↓') : '↕';
  });

  // Count label
  const countEl = $('inf-count-label');
  if (countEl) {
    const filterActive = _infSearch || _infEstado || _infTipo || _infPeriodo;
    countEl.textContent = filterActive
      ? `${all.length} resultado${all.length!==1?'s':''} con los filtros aplicados`
      : `${all.length} infracción${all.length!==1?'es':''} en total`;
  }

  // Pagination
  const pages = Math.max(1, Math.ceil(all.length/INF_PAGE_SIZE));
  if (_infPage > pages) _infPage = pages;
  const rows = all.slice((_infPage-1)*INF_PAGE_SIZE, _infPage*INF_PAGE_SIZE);

  const esc = s => (s||'').replace(/"/g,'&quot;');
  const montoColor = { pagada:'var(--green)', vencida:'var(--red)', pendiente:'var(--amber)', impugnada:'var(--blue)', cancelada:'var(--muted)' };

  tbody.innerHTML = rows.length ? rows.map(r=>`
    <tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer">
      <td class="mono" style="font-size:.73rem;font-weight:700">${r.folio||'—'}</td>
      <td style="font-size:.78rem;white-space:nowrap">${fmtDateShort(r.fecha)}</td>
      <td>
        <span style="font-family:monospace;font-weight:700;font-size:.8rem">${r.placa}</span>
        ${placaCount[r.placa]>1?`<span title="${placaCount[r.placa]} infracciones — Reincidente" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--amber-bg);color:var(--amber);font-size:.55rem;font-weight:800;margin-left:.25rem;cursor:default">R</span>`:''}
      </td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.infractor}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem">${r.tipo}</td>
      <td style="font-weight:700;color:${montoColor[r.estado]||'var(--text)'}">${fmt(r.monto)}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td style="font-size:.75rem;color:var(--muted);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.oficial||'—'}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;text-align:right;padding-right:.6rem">
        ${r.estado==='pendiente'?`<button class="btn btn-sm" style="background:var(--green-bg);color:var(--green);border:1px solid #A7F3D0;padding:.25rem .6rem;font-size:.72rem" onclick="event.stopPropagation();openRegistrarPago('${r.id}')" title="Registrar pago">Cobrar</button>`:''}
        ${r.telefono?`<button class="btn-wa-icon" style="margin-left:.2rem"
          data-tel="${r.telefono.replace(/\D/g,'')}"
          data-nombre="${esc(r.infractor)}"
          data-folio="${r.folio||''}"
          data-placa="${r.placa||''}"
          data-tipo="${esc(r.tipo)}"
          data-monto="${r.monto||0}"
          data-ubicacion="${esc(r.ubicacion)}"
          data-fecha="${r.fecha||''}"
          onclick="event.stopPropagation();_waFromBtn(this)"
          title="Enviar WhatsApp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#128C7E" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        </button>`:''}
      </td>
    </tr>`).join('')
    : `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:2rem">Sin resultados</td></tr>`;

  renderPager('inf-pager', _infPage, pages, 'goInfPage');
}

function sortInf(col) {
  if (_infSort === col+'_desc') _infSort = col+'_asc';
  else _infSort = col+'_desc';
  renderInfracciones();
}

function limpiarFiltrosInf() {
  _infSearch = ''; _infEstado = ''; _infTipo = ''; _infPeriodo = ''; _infSort = 'fecha_desc';
  if ($('inf-search'))        $('inf-search').value = '';
  if ($('inf-estado-filter')) $('inf-estado-filter').value = '';
  if ($('inf-tipo-filter'))   $('inf-tipo-filter').value = '';
  if ($('inf-periodo-filter')) $('inf-periodo-filter').value = '';
  _infPage = 1;
  renderInfracciones();
}

function filterInfracciones() {
  _infSearch  = ($('inf-search')||{}).value||'';
  _infEstado  = ($('inf-estado-filter')||{}).value||'';
  _infTipo    = ($('inf-tipo-filter')||{}).value||'';
  _infPeriodo = ($('inf-periodo-filter')||{}).value||'';
  _infPage = 1;
  renderInfracciones();
}

async function submitInfraccion(e) {
  e.preventDefault();
  const btn = $('inf-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  const id = $('inf-id').value;

  // Compress photos
  const fileInput = document.getElementById('inf-fotos');
  const fotosArr = [];
  if (fileInput && fileInput.files.length > 0) {
    for (let i = 0; i < Math.min(fileInput.files.length, 3); i++) {
      fotosArr.push(await compressPhoto(fileInput.files[i]));
    }
  }

  const payload = {
    fecha:          $('inf-fecha').value ? new Date($('inf-fecha').value).toISOString() : new Date().toISOString(),
    placa:          $('inf-placa').value.trim().toUpperCase(),
    infractor:      $('inf-infractor').value.trim(),
    licencia:       ($('inf-licencia')||{}).value?.trim() || '',
    vehiculo:       ($('inf-vehiculo')||{}).value?.trim() || '',
    color_vehiculo: ($('inf-color')||{}).value?.trim()    || '',
    oficial:        ($('inf-oficial')||{}).value?.trim()  || '',
    tipo:           $('inf-tipo').value,
    monto:          parseInt($('inf-monto').value)||0,
    ubicacion:      $('inf-ubicacion').value.trim(),
    estado:         $('inf-est').value,
    obs:            $('inf-obs').value.trim(),
    telefono:       ($('inf-telefono')||{}).value?.trim() || '',
    lat:            window._infLat || null,
    lng:            window._infLng || null,
    fotos:          fotosArr.length ? JSON.stringify(fotosArr) : (id ? undefined : '[]')
  };
  if (payload.fotos === undefined) delete payload.fotos;

  if (id) {
    const { error } = await _sb.from('infracciones').update(payload).eq('id', id);
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar y guardar'; }
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('infraccion', `Infracción actualizada — ${payload.tipo} (${payload.placa})`);
    closeModal('modal-infraccion');
  } else {
    const { data, error } = await _sb.from('infracciones').insert(payload).select().single();
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar y guardar'; }
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('infraccion', `Infracción ${data.folio} registrada — ${payload.tipo} (${payload.placa})`);
    closeModal('modal-infraccion');
    printTicket80(data.id);
    if (payload.telefono) notificarWhatsApp(data);
  }

  renderInfracciones();
  renderDashboard();
}

// ── Tipos de infracción (base + personalizables) ──────────
const TIPOS_BASE = [
  'Exceso de velocidad','Estacionamiento prohibido','No respetar señal de alto',
  'Conducir sin licencia','Uso de celular al conducir','Circular en sentido contrario',
  'Girar en U prohibido','No portar documentos','Conducir en estado de ebriedad','Otro'
];

async function loadTiposInfraccion(currentVal) {
  if (!_cachedConfig) {
    const { data } = await _sb.from('configuracion').select('tipos_extra,descuento_pct,dias_descuento').eq('id',1).single();
    if (data) _cachedConfig = { ...(_cachedConfig||{}), ...data };
  }
  const extras = (_cachedConfig?.tipos_extra || []).filter(t => t && !TIPOS_BASE.includes(t));
  const all = [...TIPOS_BASE.filter(t => t !== 'Otro'), ...extras, 'Otro'];
  const el = $('inf-tipo');
  if (!el) return;
  const prev = currentVal ?? el.value;
  el.innerHTML = all.map(t => `<option value="${t}"${t === prev ? ' selected' : ''}>${t}</option>`).join('');
}

function openNewInfraccion() {
  $('modal-inf-title').textContent = 'Nueva infracción';
  $('inf-form').reset();
  $('inf-id').value = '';
  $('inf-fecha').value = new Date().toISOString().slice(0,16);
  $('inf-est').value = 'pendiente';
  if ($('inf-est-wrap')) $('inf-est-wrap').style.display = 'none';
  window._infLat = null; window._infLng = null;
  const geoStatus = document.getElementById('inf-geo-status');
  if (geoStatus) geoStatus.textContent = '';
  const geoBtn = document.getElementById('btn-geolocate');
  if (geoBtn) { geoBtn.textContent = 'GPS'; geoBtn.style.color = ''; geoBtn.disabled = false; }
  const prev = document.getElementById('inf-fotos-preview');
  if (prev) prev.innerHTML = '';
  const plHist = document.getElementById('placa-history');
  if (plHist) plHist.innerHTML = '';
  // Pre-fill official with logged-in user if they are an oficial/supervisor
  if ($('inf-oficial')) {
    $('inf-oficial').dataset.preload = _session?.name || '';
  }
  loadOficiales(['inf-oficial']);
  loadTiposInfraccion();
  openModal('modal-infraccion');
}

async function editInfraccion(id) {
  const { data, error } = await _sb.from('infracciones').select('*').eq('id', id).single();
  if (error || !data) return;
  $('modal-inf-title').textContent = 'Editar infracción';
  if ($('inf-est-wrap')) $('inf-est-wrap').style.display = '';
  $('inf-id').value       = data.id;
  $('inf-fecha').value    = data.fecha ? data.fecha.slice(0,16) : '';
  $('inf-placa').value    = data.placa;
  $('inf-infractor').value= data.infractor;
  $('inf-licencia').value = data.licencia||'';
  $('inf-vehiculo').value = data.vehiculo||'';
  $('inf-color').value    = data.color_vehiculo||'';
  if ($('inf-oficial')) $('inf-oficial').dataset.preload = data.oficial||'';
  await loadOficiales(['inf-oficial']);
  $('inf-tipo').value     = data.tipo;
  $('inf-monto').value    = data.monto;
  $('inf-ubicacion').value= data.ubicacion||'';
  $('inf-est').value      = data.estado;
  $('inf-obs').value      = data.obs||'';
  if ($('inf-telefono')) $('inf-telefono').value = data.telefono||'';
  window._infLat = data.lat||null; window._infLng = data.lng||null;
  const geoStatus = document.getElementById('inf-geo-status');
  if (geoStatus) geoStatus.innerHTML = data.lat ? `<span style="color:var(--green)">✓ Coordenadas guardadas</span>` : '';
  const prev = document.getElementById('inf-fotos-preview');
  if (prev) prev.innerHTML = '';
  await loadTiposInfraccion(data.tipo);
  openModal('modal-infraccion');
  updateInfSummary();
}

function updateInfSummary() {
  const placa   = ($('inf-placa')||{}).value?.trim().toUpperCase() || '';
  const tipo    = ($('inf-tipo')||{}).value || '';
  const monto   = parseInt(($('inf-monto')||{}).value) || 0;
  const sumEl   = $('inf-summary');
  const prevEl  = $('inf-monto-preview');
  if (prevEl) prevEl.textContent = monto > 0 ? `= ${fmt(monto)}` : '';
  if (!sumEl) return;
  if (placa || tipo || monto) {
    sumEl.style.display = 'block';
    sumEl.innerHTML =
      `<span style="color:var(--muted)">Se registrará: </span>` +
      (tipo   ? `<strong>${tipo}</strong>` : '') +
      (placa  ? ` · Placa <strong style="font-family:monospace">${placa}</strong>` : '') +
      (monto  ? ` · <strong style="color:var(--ac)">${fmt(monto)}</strong>` : '');
  } else {
    sumEl.style.display = 'none';
  }
}

async function autoFillMonto() {
  if ($('inf-id').value) return;
  const tipo = $('inf-tipo').value;
  if (!_cachedConfig) {
    const { data } = await _sb.from('configuracion').select('montos').eq('id',1).single();
    if (data) _cachedConfig = data;
  }
  if (_cachedConfig && _cachedConfig.montos) {
    const map = {
      'Exceso de velocidad':'velocidad',
      'Estacionamiento prohibido':'estacionamiento',
      'No respetar señal de alto':'alto',
      'Conducir sin licencia':'sinlicencia',
      'Uso de celular al conducir':'celular',
      'Circular en sentido contrario':'contrario',
      'Girar en U prohibido':'uprohibido',
      'No portar documentos':'documentos'
    };
    const key = map[tipo];
    if (key && _cachedConfig.montos[key]) $('inf-monto').value = _cachedConfig.montos[key];
  }
  updateInfSummary();
}

// ── Permisos ──────────────────────────────────────────────
let _perPage = 1, _perSearch = '', _perEstado = '', _perTipo = '';
const PER_PAGE_SIZE = 15;

function _diasVigencia(vencimiento) {
  if (!vencimiento) return null;
  return Math.ceil((new Date(vencimiento+'T00:00:00').getTime() - Date.now()) / 86400000);
}

async function renderPermisos() {
  const tbody = $('per-table');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted)">Cargando…</td></tr>`;

  let q = _sb.from('permisos').select('*').order('vencimiento',{ascending:true});
  if (_perEstado) q = q.eq('estado', _perEstado);
  if (_perTipo)   q = q.eq('tipo', _perTipo);
  if (_perSearch) q = q.or(`titular.ilike.%${_perSearch}%,placa.ilike.%${_perSearch}%,num.ilike.%${_perSearch}%,ruta.ilike.%${_perSearch}%`);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="9" style="color:red">${error.message}</td></tr>`; return; }

  const all = data || [];

  // Stats strip
  const strip = $('per-stats-strip');
  if (strip) {
    const vig  = all.filter(r=>r.estado==='vigente').length;
    const pv   = all.filter(r=>r.estado==='por-vencer').length;
    const venc = all.filter(r=>r.estado==='vencido').length;
    const susp = all.filter(r=>r.estado==='suspendido').length;
    const pill = (label, n, color) => `<div class="inf-stat-pill">
      <span style="color:${color}">●</span>
      <span><span class="isp-num">${n}</span> ${label}</span>
    </div>`;
    strip.innerHTML =
      pill('total', all.length, 'var(--subtle)') +
      pill('vigentes', vig, 'var(--green)') +
      pill('por vencer', pv, 'var(--amber)') +
      pill('vencidos', venc, 'var(--red)') +
      (susp ? pill('suspendidos', susp, 'var(--muted)') : '');
  }

  // Count label
  const countLabel = $('per-count-label');
  if (countLabel) {
    const hasFilter = _perSearch || _perEstado || _perTipo;
    countLabel.textContent = hasFilter
      ? `${all.length} resultado${all.length!==1?'s':''} con los filtros aplicados`
      : `${all.length} permiso${all.length!==1?'s':''}`;
  }

  const pages = Math.max(1, Math.ceil(all.length/PER_PAGE_SIZE));
  if (_perPage > pages) _perPage = pages;
  const rows = all.slice((_perPage-1)*PER_PAGE_SIZE, _perPage*PER_PAGE_SIZE);

  tbody.innerHTML = rows.length ? rows.map(r => {
    const dias = _diasVigencia(r.vencimiento);
    const diasColor = dias === null ? 'var(--muted)' : dias < 0 ? 'var(--red)' : dias <= 7 ? 'var(--red)' : dias <= 30 ? 'var(--amber)' : 'var(--green)';
    const diasTxt = dias === null ? '—' : dias < 0 ? `${Math.abs(dias)}d vencido` : dias === 0 ? 'Vence hoy' : `${dias}d`;
    const diasBg  = dias !== null && dias < 0 ? 'var(--red-bg)' : dias !== null && dias <= 30 ? 'var(--amber-bg)' : 'transparent';
    return `<tr onclick="viewDetail('permisos','${r.id}')" style="cursor:pointer">
      <td class="mono" style="font-size:.73rem;font-weight:700">${r.num||'—'}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">${r.titular}</td>
      <td style="font-size:.78rem">${r.tipo}</td>
      <td style="font-family:monospace;font-weight:700;font-size:.8rem">${r.placa||'—'}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem">${r.ruta||'—'}</td>
      <td style="font-size:.78rem;white-space:nowrap">${fmtDateShort(r.vencimiento)}</td>
      <td><span style="background:${diasBg};color:${diasColor};font-weight:700;font-size:.78rem;padding:.15rem .5rem;border-radius:6px">${diasTxt}</span></td>
      <td>${estadoBadge(r.estado)}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;text-align:right;padding-right:.6rem">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editPermiso('${r.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();printPermiso('${r.id}')" title="Imprimir">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:2rem">Sin resultados</td></tr>`;

  renderPager('per-pager', _perPage, pages, 'goPerPage');
}

function limpiarFiltrosPer() {
  if ($('per-search')) $('per-search').value = '';
  if ($('per-tipo-filter')) $('per-tipo-filter').value = '';
  if ($('per-estado-filter')) $('per-estado-filter').value = '';
  _perSearch = ''; _perTipo = ''; _perEstado = ''; _perPage = 1;
  renderPermisos();
}

function filterPermisos() {
  _perSearch = ($('per-search')||{}).value||'';
  _perEstado = ($('per-estado-filter')||{}).value||'';
  _perTipo   = ($('per-tipo-filter')||{}).value||'';
  _perPage = 1;
  renderPermisos();
}

function goPerPage(p) { _perPage = p; renderPermisos(); }

async function submitPermiso(e) {
  e.preventDefault();
  const btn = $('per-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  const id = $('per-id').value;
  const payload = {
    titular:     $('per-titular').value.trim(),
    tipo:        $('per-tipo').value,
    placa:       $('per-placa').value.trim().toUpperCase(),
    ruta:        $('per-ruta').value.trim(),
    inicio:      $('per-inicio').value||null,
    vencimiento: $('per-venc').value,
    estado:      $('per-est').value,
    telefono:    ($('per-telefono')||{}).value?.trim()||null,
    obs:         ($('per-obs')||{}).value?.trim()||null,
    unidades:    parseInt(($('per-unidades')||{}).value)||1
  };
  if (id) {
    const { error } = await _sb.from('permisos').update(payload).eq('id', id);
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar permiso'; }
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('permiso', `Permiso actualizado — ${payload.titular} (${payload.placa||'sin placa'})`);
  } else {
    const { data, error } = await _sb.from('permisos').insert(payload).select().single();
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar permiso'; }
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('permiso', `Permiso ${data.num||''} creado — ${payload.titular}`);
  }
  closeModal('modal-permiso');
  renderPermisos();
}

function openNewPermiso() {
  $('modal-per-title').textContent = 'Nuevo permiso';
  $('per-form').reset();
  $('per-id').value = '';
  if ($('per-inicio')) $('per-inicio').value = new Date().toISOString().slice(0,10);
  if ($('per-unidades')) $('per-unidades').value = 1;
  if ($('per-vigencia-preview')) $('per-vigencia-preview').textContent = '';
  openModal('modal-permiso');
}

async function editPermiso(id) {
  const { data, error } = await _sb.from('permisos').select('*').eq('id', id).single();
  if (error || !data) return;
  $('modal-per-title').textContent = 'Editar permiso';
  $('per-id').value = data.id;
  $('per-titular').value = data.titular;
  $('per-tipo').value = data.tipo;
  $('per-placa').value = data.placa||'';
  $('per-ruta').value = data.ruta||'';
  $('per-inicio').value = fmtDateInput(data.inicio);
  $('per-venc').value = fmtDateInput(data.vencimiento);
  $('per-est').value = data.estado;
  if ($('per-telefono')) $('per-telefono').value = data.telefono||'';
  if ($('per-obs')) $('per-obs').value = data.obs||'';
  if ($('per-unidades')) $('per-unidades').value = data.unidades||1;
  calcEstadoPermiso();
  openModal('modal-permiso');
}

function renovarPermiso(id) {
  const inicioHoy = new Date().toISOString().slice(0,10);
  const d = new Date(); d.setFullYear(d.getFullYear()+1);
  const vencAno = d.toISOString().slice(0,10);
  editPermiso(id).then(() => {
    $('per-inicio').value = inicioHoy;
    $('per-venc').value = vencAno;
    calcEstadoPermiso();
    $('modal-per-title').textContent = 'Renovar permiso';
  });
}

// ── Detail modal ──────────────────────────────────────────
async function viewDetail(tabla, id) {
  const { data, error } = await _sb.from(tabla).select('*').eq('id', id).single();
  if (error || !data) return;
  const r = data, isInf = tabla==='infracciones';
  const dm = $('modal-detail');
  if (!dm) return;
  dm.querySelector('.modal-title').textContent = isInf ? `Infracción ${r.folio||''}` : `Permiso ${r.num||''}`;
  dm.querySelector('.detail-body').innerHTML = isInf ? (()=>{
    let fotos=[]; try{fotos=JSON.parse(r.fotos||'[]');}catch(e){}
    const montoColor = { pendiente:'var(--amber)', pagada:'var(--green)', vencida:'var(--red)', impugnada:'var(--blue)', cancelada:'var(--muted)' };
    const diasDesde = r.fecha ? Math.floor((Date.now()-new Date(r.fecha).getTime())/86400000) : null;
    const diasStr = diasDesde===0?'Hoy':diasDesde===1?'Ayer':`Hace ${diasDesde} días`;
    const diasAlerta = diasDesde!==null && diasDesde>25;

    const secLabel = (icon, txt) =>
      `<div style="display:flex;align-items:center;gap:.4rem;margin:1rem 0 .6rem;padding-bottom:.4rem;border-bottom:1px solid var(--border)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2">${icon}</svg>
        <span style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">${txt}</span>
      </div>`;

    return `
    <!-- Header -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:1rem">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem">
        <div style="flex:1;min-width:0">
          <div style="font-size:.68rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Folio</div>
          <div style="font-family:monospace;font-size:1.15rem;font-weight:800;color:var(--ink)">${r.folio||'—'}</div>
          <div style="font-size:.88rem;font-weight:700;color:var(--ink);margin-top:.3rem">${r.tipo}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:.2rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
            <span>${new Date(r.fecha).toLocaleString('es-MX',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            <span style="font-weight:600;color:${diasAlerta?'var(--red)':'var(--muted)'}">${diasStr}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${estadoBadge(r.estado)}
          <div style="font-size:1.5rem;font-weight:800;color:${montoColor[r.estado]||'var(--ink)'};margin-top:.4rem;line-height:1">${fmt(r.monto)}</div>
          <div style="font-size:.68rem;color:var(--muted);margin-top:.15rem">MXN</div>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <!-- Vehículo -->
      <div class="detail-field full">${secLabel('<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>','Vehículo')}</div>
      <div class="detail-field"><label>Placa</label><span style="font-family:monospace;font-size:1rem;font-weight:800">${r.placa}</span></div>
      <div class="detail-field"><label>Color</label><span>${r.color_vehiculo||'—'}</span></div>
      <div class="detail-field full"><label>Marca y modelo</label><span>${r.vehiculo||'—'}</span></div>

      <!-- Infractor -->
      <div class="detail-field full">${secLabel('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>','Infractor')}</div>
      <div class="detail-field full"><label>Nombre</label><span style="font-weight:600;font-size:.88rem">${r.infractor}</span></div>
      <div class="detail-field"><label>Núm. licencia</label><span>${r.licencia||'—'}</span></div>
      <div class="detail-field"><label>Teléfono</label><span>${r.telefono?`<a href="https://wa.me/52${r.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener" style="color:#128C7E;text-decoration:none;display:inline-flex;align-items:center;gap:.3rem"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>${r.telefono}</a>`:'—'}</span></div>

      <!-- Infracción -->
      <div class="detail-field full">${secLabel('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/>','Datos de la infracción')}</div>
      <div class="detail-field"><label>Oficial</label><span>${r.oficial||'—'}</span></div>
      <div class="detail-field"><label>Estado actual</label><span>${estadoBadge(r.estado)}</span></div>
      <div class="detail-field full"><label>Ubicación</label>
        <span>${r.ubicacion||'—'}${r.lat?` <a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:.25rem;color:var(--ac);font-size:.75rem;margin-left:.5rem;font-weight:600;text-decoration:none"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>Ver en mapa</a>`:''}</span>
      </div>
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span style="background:var(--stone);display:block;padding:.45rem .7rem;border-radius:6px;font-size:.82rem">${r.obs}</span></div>`:''}
      ${r.impugnacion_motivo?`<div class="detail-field full"><label>Motivo de impugnación</label><span style="background:var(--blue-bg);color:var(--blue);display:block;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;font-weight:500">${r.impugnacion_motivo}</span></div>`:''}
      ${fotos.length?`<div class="detail-field full"><label>Evidencia fotográfica</label><div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.4rem">${fotos.map(f=>`<img src="${f}" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;transition:opacity .15s" onmouseenter="this.style.opacity='.75'" onmouseleave="this.style.opacity='1'" onclick="window.open('${f}','_blank')" />`).join('')}</div></div>`:''}
    </div>

    <!-- Cambiar estado -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem;margin-top:.5rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
      <span style="font-size:.75rem;font-weight:600;color:var(--muted)">Cambiar estado:</span>
      <select id="detail-estado" class="form-select" style="width:auto;min-width:130px;flex-shrink:0">
        <option value="pendiente"  ${r.estado==='pendiente'?'selected':''}>Pendiente</option>
        <option value="pagada"     ${r.estado==='pagada'?'selected':''}>Pagada</option>
        <option value="impugnada"  ${r.estado==='impugnada'?'selected':''}>Impugnada</option>
        <option value="cancelada"  ${r.estado==='cancelada'?'selected':''}>Cancelada</option>
        <option value="vencida"    ${r.estado==='vencida'?'selected':''}>Vencida</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="saveDetailEstado('infracciones','${r.id}')">Aplicar</button>
    </div>

    <!-- Acciones -->
    <div class="detail-actions" style="margin-top:.75rem;flex-wrap:wrap;gap:.5rem">
      ${r.estado==='pendiente'?`<button class="btn btn-sm" style="background:var(--green);color:#fff;border:none" onclick="openRegistrarPago('${r.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        Cobrar
      </button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="editInfraccion('${r.id}');closeModal('modal-detail')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar
      </button>
      ${(r.estado==='pendiente'||r.estado==='impugnada')?`<button class="btn btn-ghost btn-sm" style="color:var(--blue);border-color:#BFDBFE" onclick="impugnarInfraccion('${r.id}','${r.estado}')">Impugnar</button>`:''}
      ${(r.estado==='impugnada'&&(_rol==='admin'||_rol==='supervisor'))?`
        <button class="btn btn-ghost btn-sm" style="color:var(--green);border-color:#A7F3D0" onclick="resolverImpugnacion('${r.id}','cancelada')">✓ Procede</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:#FECACA" onclick="resolverImpugnacion('${r.id}','pendiente')">✕ No procede</button>
      `:''}
      <button class="btn btn-ghost btn-sm" onclick="printTicket80('${r.id}')">Ticket 80mm</button>
      <button class="btn btn-ghost btn-sm" onclick="printInfraccion('${r.id}')">Boleta carta</button>
      ${r.telefono?`<button class="btn btn-ghost btn-sm" style="color:#128C7E;border-color:#A7F3D0" onclick="notificarWhatsApp({telefono:'${r.telefono}',infractor:${JSON.stringify(r.infractor)},folio:'${r.folio||''}',placa:'${r.placa}',tipo:${JSON.stringify(r.tipo)},monto:${r.monto},ubicacion:${JSON.stringify(r.ubicacion||'')},fecha:'${r.fecha||''}'})" >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        WhatsApp
      </button>`:''}
    </div>`;
  })() : (()=>{
    const dias = _diasVigencia(r.vencimiento);
    const diasColor = dias===null?'var(--muted)':dias<0?'var(--red)':dias<=7?'var(--red)':dias<=30?'var(--amber)':'var(--green)';
    const diasTxt = dias===null?'—':dias<0?`Vencido hace ${Math.abs(dias)} días`:dias===0?'Vence hoy':`Vence en ${dias} días`;
    const secLabel = (icon, txt) =>
      `<div style="display:flex;align-items:center;gap:.4rem;margin:1rem 0 .6rem;padding-bottom:.4rem;border-bottom:1px solid var(--border)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2">${icon}</svg>
        <span style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">${txt}</span>
      </div>`;
    return `
    <!-- Header -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:1rem">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem">
        <div style="flex:1;min-width:0">
          <div style="font-size:.68rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Núm. permiso</div>
          <div style="font-family:monospace;font-size:1.1rem;font-weight:800;color:var(--ink)">${r.num||'—'}</div>
          <div style="font-size:.92rem;font-weight:700;color:var(--ink);margin-top:.3rem">${r.titular}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">${r.tipo}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${estadoBadge(r.estado)}
          <div style="font-size:1rem;font-weight:800;color:${diasColor};margin-top:.5rem">${diasTxt}</div>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <!-- Titular -->
      <div class="detail-field full">${secLabel('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>','Datos del titular')}</div>
      <div class="detail-field full"><label>Razón social / Nombre</label><span style="font-weight:600">${r.titular}</span></div>
      ${r.telefono?`<div class="detail-field"><label>Teléfono</label><span><a href="https://wa.me/52${r.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener" style="color:#128C7E;text-decoration:none">${r.telefono}</a></span></div>`:''}
      ${r.unidades>1?`<div class="detail-field"><label>Núm. de unidades</label><span>${r.unidades}</span></div>`:''}

      <!-- Vehículo -->
      <div class="detail-field full">${secLabel('<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>','Vehículo y ruta')}</div>
      <div class="detail-field"><label>Placa</label><span style="font-family:monospace;font-weight:800;font-size:.95rem">${r.placa||'—'}</span></div>
      <div class="detail-field"><label>Tipo de permiso</label><span>${r.tipo}</span></div>
      <div class="detail-field full"><label>Ruta / Zona de circulación</label><span>${r.ruta||'—'}</span></div>

      <!-- Vigencia -->
      <div class="detail-field full">${secLabel('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>','Vigencia')}</div>
      <div class="detail-field"><label>Fecha de inicio</label><span>${fmtDateShort(r.inicio)}</span></div>
      <div class="detail-field"><label>Fecha de vencimiento</label><span style="font-weight:700;color:${diasColor}">${fmtDateShort(r.vencimiento)}</span></div>
      <div class="detail-field full"><label>Días restantes</label>
        <span style="font-weight:700;font-size:.9rem;color:${diasColor}">${diasTxt}</span>
      </div>
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span style="background:var(--stone);display:block;padding:.45rem .7rem;border-radius:6px;font-size:.82rem">${r.obs}</span></div>`:''}
    </div>

    <!-- Cambiar estado -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem;margin-top:.5rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
      <span style="font-size:.75rem;font-weight:600;color:var(--muted)">Cambiar estado:</span>
      <select id="detail-estado" class="form-select" style="width:auto;min-width:130px;flex-shrink:0">
        <option value="vigente"    ${r.estado==='vigente'?'selected':''}>Vigente</option>
        <option value="por-vencer" ${r.estado==='por-vencer'?'selected':''}>Por vencer</option>
        <option value="vencido"    ${r.estado==='vencido'?'selected':''}>Vencido</option>
        <option value="suspendido" ${r.estado==='suspendido'?'selected':''}>Suspendido</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="saveDetailEstado('permisos','${r.id}')">Aplicar</button>
    </div>

    <!-- Acciones -->
    <div class="detail-actions" style="margin-top:.75rem;flex-wrap:wrap;gap:.5rem">
      <button class="btn btn-ghost btn-sm" onclick="editPermiso('${r.id}');closeModal('modal-detail')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar
      </button>
      <button class="btn btn-ghost btn-sm" style="color:var(--green);border-color:#A7F3D0" onclick="renovarPermiso('${r.id}');closeModal('modal-detail')" title="Renovar permiso por 1 año más">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
        Renovar
      </button>
      <button class="btn btn-ghost btn-sm" onclick="printPermiso('${r.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir
      </button>
      ${r.telefono?`<a class="btn btn-ghost btn-sm" style="color:#128C7E;border-color:#A7F3D0;text-decoration:none" href="https://wa.me/52${r.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        WhatsApp
      </a>`:''}
      <button class="btn btn-danger btn-sm" onclick="deleteDetail('permisos','${r.id}')">Eliminar</button>
    </div>`;
  })();
  openModal('modal-detail');
}

async function saveDetailEstado(tabla, id) {
  const estado = $('detail-estado').value;
  const { error } = await _sb.from(tabla).update({ estado }).eq('id', id);
  if (error) { alert('Error: '+error.message); return; }
  closeModal('modal-detail');
  if (tabla==='infracciones') { renderInfracciones(); renderDashboard(); }
  else renderPermisos();
}

async function deleteDetail(tabla, id) {
  if (!confirm('¿Eliminar este registro? Esta acción no se puede deshacer.')) return;
  const { error } = await _sb.from(tabla).delete().eq('id', id);
  if (error) { alert('Error: '+error.message); return; }
  closeModal('modal-detail');
  if (tabla==='infracciones') { renderInfracciones(); renderDashboard(); }
  else renderPermisos();
}

// ── Configuración ─────────────────────────────────────────
async function loadConfig() {
  const { data } = await _sb.from('configuracion').select('*').eq('id',1).single();
  if (!data) return;
  _cachedConfig = data;
  if($('cfg-municipio')) $('cfg-municipio').value = data.municipio||'';
  if($('cfg-estado'))    $('cfg-estado').value    = data.estado||'';
  if($('cfg-director'))  $('cfg-director').value  = data.director||'';
  if($('cfg-correo'))    $('cfg-correo').value     = data.correo||'';
  const m = data.montos || {};
  ['velocidad','estacionamiento','alto','sinlicencia','celular','contrario','uprohibido','documentos'].forEach(k=>{
    if($('cfg-m-'+k)) $('cfg-m-'+k).value = m[k]||'';
  });
  if($('cfg-descuento-pct'))  $('cfg-descuento-pct').value  = data.descuento_pct  ?? 20;
  if($('cfg-dias-descuento')) $('cfg-dias-descuento').value = data.dias_descuento ?? 15;
  if($('cfg-tipos-extra')) {
    const extras = data.tipos_extra || [];
    $('cfg-tipos-extra').value = Array.isArray(extras) ? extras.join('\n') : '';
  }
}

async function saveConfig() {
  const montos = {};
  ['velocidad','estacionamiento','alto','sinlicencia','celular','contrario','uprohibido','documentos'].forEach(k=>{
    montos[k] = parseInt(($('cfg-m-'+k)||{}).value)||0;
  });
  const tiposRaw = ($('cfg-tipos-extra')||{}).value||'';
  const tiposExtra = tiposRaw.split('\n').map(s=>s.trim()).filter(Boolean);
  const payload = {
    id: 1,
    municipio: ($('cfg-municipio')||{}).value||'',
    estado:    ($('cfg-estado')||{}).value||'',
    director:  ($('cfg-director')||{}).value||'',
    correo:    ($('cfg-correo')||{}).value||'',
    montos,
    descuento_pct:  parseInt(($('cfg-descuento-pct')||{}).value)||20,
    dias_descuento: parseInt(($('cfg-dias-descuento')||{}).value)||15,
    tipos_extra:    tiposExtra
  };
  const { error } = await _sb.from('configuracion').upsert(payload, { onConflict:'id' });
  if (error) { alert('Error guardando configuración: '+error.message); return; }
  _cachedConfig = payload;
  await logActivity('config', `Configuración del sistema actualizada por ${_session.name}`);
  showToast('Configuración guardada correctamente');
}

async function resetData() {
  if (!confirm('¿Restablecer todos los datos de ejemplo? Se borrarán los registros actuales.')) return;
  await Promise.all([
    _sb.from('infracciones').delete().neq('id', 0),
    _sb.from('permisos').delete().neq('id', 0),
    _sb.from('actividad').delete().neq('id', 0),
    _sb.from('vehiculos').delete().neq('id', 0),
    _sb.from('grua').delete().neq('id', 0),
    _sb.from('accidentes').delete().neq('id', 0),
  ]);
  await _sb.from('configuracion').upsert({ ...SEED_CONFIG, id:1 }, { onConflict:'id' });
  await _sb.from('infracciones').insert(SEED_INFRACCIONES);
  await _sb.from('permisos').insert(SEED_PERMISOS);
  await _sb.from('actividad').insert(SEED_ACTIVIDAD);
  await _sb.from('vehiculos').insert(SEED_VEHICULOS);
  await _sb.from('grua').insert(SEED_GRUA);
  await _sb.from('accidentes').insert(SEED_ACCIDENTES);
  _cachedConfig = null;
  showToast('Datos restablecidos');
  navigate('dashboard');
}

// ── Ticket de infracción ──────────────────────────────────
async function printInfraccion(id) {
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('infracciones').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id',1).single()
  ]);
  if (!r) return;

  const mun      = cfg?.municipio || 'Municipio';
  const estMun   = cfg?.estado    || '';
  const director = cfg?.director  || '';

  const fechaObj  = new Date(r.fecha);
  const fechaStr  = fechaObj.toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const horaStr   = fechaObj.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});

  // Descuento 20% primeros 15 días; límite 30 días
  const descFecha = new Date(fechaObj.getTime() + 15*86400000).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const limFecha  = new Date(fechaObj.getTime() + 30*86400000).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const montoDesc = Math.round(r.monto * 0.80).toLocaleString('es-MX');
  const montoFmt  = Number(r.monto).toLocaleString('es-MX');

  const copyHTML = (label) => `
  <div class="copy">
    <div class="header">
      <div class="header-top">
        <div class="seal">HCE</div>
        <div class="header-text">
          <div class="gov-name">GOBIERNO MUNICIPAL · ${mun.toUpperCase()}</div>
          <div class="dept-name">DIRECCIÓN DE TRÁNSITO Y MOVILIDAD</div>
          <div class="state-name">${estMun.toUpperCase()}</div>
        </div>
        <div class="copy-tag">${label}</div>
      </div>
      <div class="title-bar">
        <span>BOLETA DE INFRACCIÓN DE TRÁNSITO</span>
        <span class="folio-num">${r.folio||'—'}</span>
      </div>
    </div>

    <div class="sections">
      <div class="section-row">
        <div class="section" style="flex:1">
          <div class="sec-title">Datos de la infracción</div>
          <div class="fields-grid">
            <div class="f"><span class="fl">Fecha</span><span class="fv">${fechaStr}</span></div>
            <div class="f"><span class="fl">Hora</span><span class="fv">${horaStr}</span></div>
            <div class="f full"><span class="fl">Ubicación / Lugar de los hechos</span><span class="fv">${r.ubicacion||'—'}</span></div>
            <div class="f full"><span class="fl">Tipo de infracción</span><span class="fv bold">${r.tipo}</span></div>
            ${r.obs ? `<div class="f full"><span class="fl">Observaciones</span><span class="fv">${r.obs}</span></div>` : ''}
          </div>
        </div>
        <div class="section" style="flex:1">
          <div class="sec-title">Datos del vehículo</div>
          <div class="fields-grid">
            <div class="f"><span class="fl">Placa</span><span class="fv mono bold">${r.placa}</span></div>
            <div class="f"><span class="fl">Color</span><span class="fv">${r.color_vehiculo||'—'}</span></div>
            <div class="f full"><span class="fl">Marca y modelo</span><span class="fv">${r.vehiculo||'—'}</span></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="sec-title">Datos del infractor</div>
        <div class="fields-grid">
          <div class="f" style="flex:2"><span class="fl">Nombre completo</span><span class="fv bold">${r.infractor}</span></div>
          <div class="f"><span class="fl">Núm. de licencia</span><span class="fv mono">${r.licencia||'—'}</span></div>
        </div>
      </div>

      <div class="amount-section">
        <div class="amount-label">MONTO DE LA INFRACCIÓN</div>
        <div class="amount-num">$${montoFmt} <span class="currency">MXN</span></div>
        <div class="payment-dates">
          <div class="pd-item discount">
            <div class="pd-label">▼ 20% descuento si paga antes del</div>
            <div class="pd-date">${descFecha}</div>
            <div class="pd-amount">Pague solo $${montoDesc} MXN</div>
          </div>
          <div class="pd-item limit">
            <div class="pd-label">⚠ Fecha límite de pago</div>
            <div class="pd-date">${limFecha}</div>
            <div class="pd-amount">Después genera recargo</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="sec-title">Lugar de pago</div>
        <div class="pay-info">
          <strong>Tesorería Municipal de ${mun}</strong> — Lunes a Viernes de 8:00 a 15:00 hrs.<br>
          Presente esta boleta en ventanilla de infracciones. Referencia de pago: <strong class="mono">${r.folio||'—'}</strong>
        </div>
      </div>

      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-label">Oficial que levanta${r.oficial ? ': '+r.oficial : ''}</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-label">Firma o huella del infractor</div>
        </div>
      </div>

      <div class="legal-note">
        La presente boleta fue expedida conforme a la Ley de Tránsito Municipal vigente. El no pago dentro del plazo establecido
        generará recargos del 2% mensual y podrá derivar en inmovilización del vehículo. Para impugnar esta infracción acuda a la
        Dirección de Tránsito dentro de los 15 días hábiles siguientes a esta fecha.
      </div>
    </div>
  </div>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Boleta ${r.folio||''}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;background:#f5f5f5;color:#222}
    .page{width:210mm;margin:0 auto;padding:8mm;display:flex;flex-direction:column;gap:4mm}
    .no-print{text-align:center;margin-bottom:6mm}
    .no-print button{padding:8px 20px;background:#1A7A82;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;margin:0 4px}
    .no-print button:hover{background:#229099}
    .cut{text-align:center;color:#aaa;font-size:9px;letter-spacing:2px;padding:2mm 0;border-top:1px dashed #ccc;border-bottom:1px dashed #ccc}
    .copy{background:#fff;border:1px solid #ccc;border-radius:4px;overflow:hidden;page-break-inside:avoid}
    .header{background:#fff}
    .header-top{display:flex;align-items:center;gap:6mm;padding:4mm 5mm 3mm;border-bottom:3px solid #1A7A82}
    .seal{width:14mm;height:14mm;border-radius:50%;border:2px solid #1A7A82;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#1A7A82;flex-shrink:0}
    .header-text{flex:1}
    .gov-name{font-size:9px;font-weight:700;color:#1A7A82;letter-spacing:.5px}
    .dept-name{font-size:11px;font-weight:900;color:#222;margin:1px 0}
    .state-name{font-size:8px;color:#666}
    .copy-tag{font-size:8px;font-weight:700;color:#fff;background:#6B7280;padding:2px 6px;border-radius:3px;white-space:nowrap;align-self:flex-start}
    .title-bar{display:flex;justify-content:space-between;align-items:center;background:#1A7A82;color:#fff;padding:3mm 5mm}
    .title-bar span:first-child{font-size:10px;font-weight:700;letter-spacing:.5px}
    .folio-num{font-size:14px;font-weight:900;letter-spacing:2px;font-family:'Courier New',monospace}
    .sections{padding:3mm 5mm 4mm}
    .section-row{display:flex;gap:4mm;margin-bottom:2mm}
    .section{margin-bottom:2mm}
    .sec-title{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#1A7A82;border-bottom:1px solid #e5e7eb;padding-bottom:1mm;margin-bottom:2mm}
    .fields-grid{display:flex;flex-wrap:wrap;gap:2mm 3mm}
    .f{display:flex;flex-direction:column;min-width:80px}
    .f.full{width:100%;flex:1 0 100%}
    .fl{font-size:6.5px;text-transform:uppercase;color:#9CA3AF;letter-spacing:.5px;margin-bottom:.5px}
    .fv{font-size:10px;color:#111}
    .fv.bold{font-weight:700}
    .fv.mono{font-family:'Courier New',monospace;font-size:9px}
    .amount-section{background:#f0fafa;border:1.5px solid #1A7A82;border-radius:4px;padding:3mm 4mm;margin:2mm 0;text-align:center}
    .amount-label{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1A7A82;margin-bottom:1mm}
    .amount-num{font-size:22px;font-weight:900;color:#1A7A82;line-height:1.1}
    .currency{font-size:12px;font-weight:600;color:#229099}
    .payment-dates{display:flex;gap:3mm;margin-top:2mm}
    .pd-item{flex:1;border-radius:3px;padding:2mm;text-align:center}
    .pd-item.discount{background:#f0fdf4;border:1px solid #6ee7b7}
    .pd-item.limit{background:#fef2f2;border:1px solid #fca5a5}
    .pd-label{font-size:7px;color:#555;margin-bottom:1px}
    .pd-date{font-size:9px;font-weight:700;color:#111}
    .pd-amount{font-size:8px;font-weight:600}
    .pd-item.discount .pd-amount{color:#059669}
    .pd-item.limit .pd-amount{color:#DC2626}
    .pay-info{font-size:9px;color:#444;line-height:1.6;background:#f9fafb;border:1px solid #e5e7eb;border-radius:3px;padding:2mm 3mm}
    .pay-info .mono{font-family:'Courier New',monospace;font-size:9px;background:#e5e7eb;padding:0 3px;border-radius:2px}
    .signatures{display:flex;gap:10mm;margin-top:4mm}
    .sig-box{flex:1;text-align:center}
    .sig-line{height:8mm;border-bottom:1px solid #333;margin-bottom:1mm}
    .sig-label{font-size:7.5px;color:#666}
    .legal-note{font-size:7px;color:#9CA3AF;line-height:1.5;margin-top:3mm;padding-top:2mm;border-top:1px solid #e5e7eb;text-align:justify}
    @media print{
      body{background:#fff}
      .no-print{display:none!important}
      .page{width:100%;margin:0;padding:4mm}
      @page{margin:8mm;size:A4 portrait}
    }
  </style></head><body>
  <div class="page">
    <div class="no-print">
      <button onclick="window.print()">🖨 Imprimir boleta</button>
      <button onclick="window.close()">Cerrar</button>
    </div>
    ${copyHTML('COPIA INFRACTOR')}
    <div class="cut">✂ &nbsp;&nbsp; CORTAR POR AQUÍ &nbsp;&nbsp; ✂</div>
    ${copyHTML('COPIA TRÁNSITO')}
  </div>
  <script>setTimeout(()=>window.print(),600)<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=870,height=960');
  win.document.write(html);
  win.document.close();
}

// ── Accidente — parte oficial imprimible ─────────────────
async function printAccidente(id) {
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('accidentes').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id', 1).single()
  ]);
  if (!r) return;
  let partes = []; try { partes = JSON.parse(r.partes||'[]'); } catch(_) {}
  const mun   = cfg?.municipio || 'Municipio';
  const edo   = cfg?.estado    || '';
  const dir   = cfg?.director  || '';
  const tipoMap = { choque:'Choque vehicular', atropello:'Atropello', volcadura:'Volcadura', otro:'Otro' };
  const estadoMap = { en_proceso:'En proceso', cerrado:'Cerrado', derivado:'Derivado al Ministerio Público' };
  const fecha = r.fecha ? new Date(r.fecha).toLocaleString('es-MX',{dateStyle:'long',timeStyle:'short'}) : '—';
  const win = window.open('','_blank','width=850,height=1100');
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Parte de Accidente ${r.folio||''}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Arial',sans-serif;font-size:11pt;color:#111;padding:1.5cm 2cm}
    .no-print{margin-bottom:1rem}
    .no-print button{padding:.4rem 1rem;background:#1A7A82;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:.5rem}
    @media print{.no-print{display:none}}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1A7A82;padding-bottom:.7rem;margin-bottom:1rem}
    .header-left h1{font-size:13pt;color:#1A7A82;font-weight:700}
    .header-left p{font-size:9pt;color:#555;margin-top:.15rem}
    .folio-box{border:2px solid #1A7A82;border-radius:8px;padding:.4rem .9rem;text-align:center}
    .folio-box .lbl{font-size:7pt;text-transform:uppercase;letter-spacing:.08em;color:#6B7280}
    .folio-box .val{font-size:14pt;font-weight:800;font-family:monospace;color:#1A7A82}
    .section-title{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#1A7A82;border-bottom:1px solid #E5E7EB;padding-bottom:.25rem;margin:1rem 0 .6rem}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem .8rem}
    .field label{font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#6B7280;display:block;margin-bottom:.15rem}
    .field span{font-size:10pt;font-weight:600}
    .field.full{grid-column:1/-1}
    .parte-box{border:1px solid #E5E7EB;border-radius:6px;padding:.5rem .75rem;margin-bottom:.4rem;font-size:9.5pt}
    .badge{display:inline-block;padding:.15rem .6rem;border-radius:12px;font-size:8pt;font-weight:700}
    .badge.en_proceso{background:#FEF3C7;color:#92400E}
    .badge.cerrado{background:#D1FAE5;color:#065F46}
    .badge.derivado{background:#DBEAFE;color:#1E40AF}
    .firma-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:2rem}
    .firma-box{border-top:1px solid #374151;padding-top:.4rem;font-size:8pt;text-align:center;color:#6B7280}
    .footer{margin-top:1.5rem;border-top:1px solid #E5E7EB;padding-top:.5rem;font-size:8pt;color:#9CA3AF;text-align:center}
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()">🖨 Imprimir / PDF</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  <div class="header">
    <div class="header-left">
      <h1>Dirección de Tránsito y Movilidad Municipal</h1>
      <p>${mun}${edo ? ', '+edo : ''}</p>
      <p style="margin-top:.5rem;font-size:11pt;font-weight:700">CONSTANCIA DE ACCIDENTE VIAL</p>
    </div>
    <div class="folio-box">
      <div class="lbl">Folio</div>
      <div class="val">${r.folio||'—'}</div>
    </div>
  </div>

  <div class="section-title">Datos del accidente</div>
  <div class="grid">
    <div class="field"><label>Tipo</label><span>${tipoMap[r.tipo]||r.tipo}</span></div>
    <div class="field"><label>Estado</label><span class="badge ${r.estado}">${estadoMap[r.estado]||r.estado}</span></div>
    <div class="field"><label>Fecha y hora</label><span>${fecha}</span></div>
    <div class="field"><label>Oficial que levanta</label><span>${r.oficial||'—'}</span></div>
    <div class="field full"><label>Ubicación / Lugar de los hechos</label><span>${r.ubicacion||'—'}</span></div>
    <div class="field"><label>Personas lesionadas</label><span>${r.lesionados||0}</span></div>
    <div class="field"><label>Personas fallecidas</label><span>${r.fallecidos||0}</span></div>
    ${r.descripcion?`<div class="field full"><label>Descripción</label><span>${r.descripcion}</span></div>`:''}
    ${r.obs?`<div class="field full"><label>Observaciones</label><span>${r.obs}</span></div>`:''}
  </div>

  ${partes.length ? `
  <div class="section-title">Partes involucradas</div>
  ${partes.map((p,i)=>`
    <div class="parte-box">
      <strong>Parte ${i+1}:</strong>&nbsp; ${p.nombre||'—'} &nbsp;|&nbsp;
      Placa: <strong>${p.placa||'—'}</strong> &nbsp;|&nbsp;
      Licencia: ${p.licencia||'—'} &nbsp;|&nbsp;
      Aseguradora: ${p.aseguradora||'—'}
    </div>`).join('')}` : ''}

  <div class="firma-row">
    <div class="firma-box">Firma del oficial<br><br><br>${r.oficial||'_________________'}</div>
    <div class="firma-box">Testigo / Parte 1<br><br><br>_________________</div>
    <div class="firma-box">Testigo / Parte 2<br><br><br>_________________</div>
  </div>

  <div class="footer">
    Documento generado el ${new Date().toLocaleString('es-MX',{dateStyle:'long',timeStyle:'short'})} · ${mun} · Sistema de Tránsito y Movilidad · HCE Consultoría
  </div>
  </body></html>`);
  win.document.close();
}

// ── Permiso — impresión hoja carta ───────────────────────
async function printPermiso(id) {
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('permisos').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id', 1).single()
  ]);
  if (!r) return;

  const mun      = cfg?.municipio || 'Municipio';
  const estMun   = cfg?.estado    || '';
  const director = cfg?.director  || 'Director de Tránsito';
  const correo   = cfg?.correo    || '';

  const hoy      = new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const inicioStr = r.inicio      ? new Date(r.inicio).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}) : '—';
  const vencStr   = r.vencimiento ? new Date(r.vencimiento).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}) : '—';

  const vigente  = r.estado === 'vigente';
  const estadoLabel = { vigente:'VIGENTE', vencido:'VENCIDO', 'por-vencer':'POR VENCER', suspendido:'SUSPENDIDO' }[r.estado] || r.estado.toUpperCase();
  const estadoColor = { vigente:'#059669', vencido:'#DC2626', 'por-vencer':'#D97706', suspendido:'#DC2626' }[r.estado] || '#6B7280';

  const ref = (r.num||'PER').replace(/[^A-Z0-9]/g,'') + String(r.id||0).padStart(6,'0');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Permiso ${r.num||''} — ${r.titular}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;color:#222;font-size:11px}
    .page{width:215.9mm;min-height:279.4mm;margin:0 auto;background:#fff;padding:12mm 14mm;display:flex;flex-direction:column;gap:0}
    .no-print{text-align:center;padding:8px 0 12px;background:#f0f0f0}
    .no-print button{padding:7px 20px;background:#1A7A82;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;margin:0 4px}
    .no-print button:hover{background:#229099}

    /* HEADER */
    .header{display:flex;align-items:center;gap:8mm;padding-bottom:5mm;border-bottom:3px solid #1A7A82;margin-bottom:5mm}
    .seal{width:22mm;height:22mm;border-radius:50%;border:2.5px solid #1A7A82;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#1A7A82;flex-shrink:0;letter-spacing:.5px}
    .header-center{flex:1}
    .gov-line{font-size:8.5px;font-weight:700;color:#1A7A82;letter-spacing:.8px;text-transform:uppercase}
    .dept-line{font-size:15px;font-weight:900;color:#1A1F2B;margin:2px 0;letter-spacing:.3px}
    .state-line{font-size:9px;color:#6B7280}
    .doc-type{text-align:right;flex-shrink:0}
    .doc-type-label{font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.8px}
    .doc-num{font-size:18px;font-weight:900;color:#1A7A82;font-family:'Courier New',monospace;letter-spacing:2px;margin-top:2px}

    /* STATUS STAMP */
    .stamp-wrap{display:flex;justify-content:flex-end;margin-bottom:3mm}
    .stamp{display:inline-flex;align-items:center;justify-content:center;border:3px solid ${estadoColor};color:${estadoColor};font-size:16px;font-weight:900;letter-spacing:3px;padding:3mm 6mm;border-radius:4px;transform:rotate(-4deg);opacity:.85}

    /* TITLE BAR */
    .title-bar{background:#1A7A82;color:#fff;text-align:center;padding:3.5mm 0;margin-bottom:6mm}
    .title-bar h1{font-size:13px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase}
    .title-bar p{font-size:9px;margin-top:1px;opacity:.85}

    /* SECTIONS */
    .section{margin-bottom:5mm}
    .sec-title{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#1A7A82;border-bottom:1.5px solid #1A7A82;padding-bottom:1.5mm;margin-bottom:3mm}
    .fields{display:flex;flex-wrap:wrap;gap:2.5mm 4mm}
    .field{display:flex;flex-direction:column;min-width:55mm}
    .field.w-full{width:100%;flex:1 0 100%}
    .field.w-half{flex:1;min-width:80mm}
    .field label{font-size:7px;text-transform:uppercase;letter-spacing:.5px;color:#9CA3AF;margin-bottom:1mm}
    .field span{font-size:11px;color:#1A1F2B;font-weight:500;border-bottom:1px solid #E5E7EB;padding-bottom:1mm}
    .field span.bold{font-weight:800;font-size:13px}
    .field span.mono{font-family:'Courier New',monospace;font-size:10px}
    .field span.big{font-size:14px;font-weight:900;color:#1A7A82}

    /* VALIDITY BOX */
    .validity-box{display:flex;gap:4mm;margin-bottom:5mm}
    .validity-item{flex:1;border:1.5px solid #E5E7EB;border-radius:5px;padding:3mm 4mm;text-align:center}
    .validity-item.start{border-color:#1A7A82;background:#f0fafa}
    .validity-item.end{border-color:${vigente?'#059669':'#DC2626'};background:${vigente?'#f0fdf4':'#fef2f2'}}
    .vi-label{font-size:7px;text-transform:uppercase;letter-spacing:.8px;color:#6B7280;margin-bottom:1.5mm}
    .vi-date{font-size:13px;font-weight:900;color:#1A1F2B}
    .vi-sub{font-size:8px;color:#6B7280;margin-top:.5mm}

    /* TERMS */
    .terms{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:4px;padding:3mm 4mm;margin-bottom:5mm}
    .terms p{font-size:8px;color:#6B7280;line-height:1.6;text-align:justify}

    /* SIGNATURES */
    .signatures{display:flex;gap:12mm;margin-top:auto;padding-top:6mm}
    .sig-block{flex:1;text-align:center}
    .sig-line{height:10mm;border-bottom:1.5px solid #374151;margin-bottom:1.5mm}
    .sig-name{font-size:9px;font-weight:700;color:#1A1F2B}
    .sig-title{font-size:8px;color:#6B7280}

    /* FOOTER */
    .footer{text-align:center;font-size:7.5px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:3mm;margin-top:4mm}
    .barcode-ref{font-family:'Courier New',monospace;font-size:8px;letter-spacing:3px;color:#374151;margin:2mm 0;display:block;text-align:center}

    @media print{
      body{background:#fff}
      .no-print{display:none!important}
      .page{margin:0;padding:12mm 14mm;width:100%}
      @page{margin:0;size:letter portrait}
    }
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()">Imprimir permiso</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  <div class="page">
    <!-- HEADER -->
    <div class="header">
      <div class="seal">HCE</div>
      <div class="header-center">
        <div class="gov-line">Gobierno Municipal · ${mun}</div>
        <div class="dept-line">Dirección de Tránsito y Movilidad</div>
        <div class="state-line">${estMun}</div>
      </div>
      <div class="doc-type">
        <div class="doc-type-label">Núm. de permiso</div>
        <div class="doc-num">${r.num||'—'}</div>
      </div>
    </div>

    <!-- STAMP + TITLE -->
    <div class="stamp-wrap"><div class="stamp">${estadoLabel}</div></div>
    <div class="title-bar">
      <h1>Permiso de Circulación</h1>
      <p>${r.tipo}</p>
    </div>

    <!-- TITULAR -->
    <div class="section">
      <div class="sec-title">Datos del titular</div>
      <div class="fields">
        <div class="field w-full"><label>Nombre completo / Razón social</label><span class="bold">${r.titular}</span></div>
      </div>
    </div>

    <!-- VEHÍCULO -->
    <div class="section">
      <div class="sec-title">Datos del vehículo y ruta</div>
      <div class="fields">
        <div class="field"><label>Placas del vehículo</label><span class="mono bold">${r.placa||'—'}</span></div>
        <div class="field"><label>Tipo de permiso</label><span>${r.tipo}</span></div>
        <div class="field w-full"><label>Ruta / Zona de circulación autorizada</label><span class="big">${r.ruta||'—'}</span></div>
      </div>
    </div>

    <!-- VIGENCIA -->
    <div class="section">
      <div class="sec-title">Periodo de vigencia</div>
      <div class="validity-box">
        <div class="validity-item start">
          <div class="vi-label">Fecha de inicio</div>
          <div class="vi-date">${inicioStr}</div>
          <div class="vi-sub">Inicio de validez</div>
        </div>
        <div class="validity-item end">
          <div class="vi-label">Fecha de vencimiento</div>
          <div class="vi-date">${vencStr}</div>
          <div class="vi-sub">${vigente?'Permiso vigente':'Vence / venció esta fecha'}</div>
        </div>
      </div>
    </div>

    <!-- TERMS -->
    <div class="terms">
      <p><strong>Condiciones del permiso:</strong> El presente permiso de circulación es personal e intransferible y autoriza
      exclusivamente la operación del vehículo con placas <strong>${r.placa||'indicadas'}</strong> en la ruta o zona señalada.
      Queda estrictamente prohibido ceder, transferir o hacer uso del mismo para fines distintos a los aquí autorizados.
      La dirección de Tránsito y Movilidad de ${mun} se reserva el derecho de suspender o cancelar este permiso en caso de
      incumplimiento de la normativa municipal vigente. El titular deberá portar este documento en todo momento durante la
      operación del vehículo. Vigencia sujeta a revisión periódica conforme a la Ley de Tránsito Municipal.</p>
    </div>

    <!-- EMISSION INFO -->
    <div class="section">
      <div class="sec-title">Información de emisión</div>
      <div class="fields">
        <div class="field"><label>Fecha de expedición</label><span>${hoy}</span></div>
        <div class="field"><label>Estado del permiso</label><span style="color:${estadoColor};font-weight:700">${estadoLabel}</span></div>
        ${correo?`<div class="field"><label>Contacto</label><span>${correo}</span></div>`:''}
      </div>
    </div>

    <!-- REFERENCE -->
    <div class="footer">
      <span class="barcode-ref">${ref}</span>
      Permiso expedido por la Dirección de Tránsito y Movilidad de ${mun}, ${estMun}.
      Para verificar la autenticidad de este documento comuníquese con la dirección.
    </div>

    <!-- SIGNATURES -->
    <div class="signatures">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-name">${director}</div>
        <div class="sig-title">Director de Tránsito y Movilidad</div>
        <div class="sig-title">Gobierno Municipal de ${mun}</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-name">${r.titular}</div>
        <div class="sig-title">Titular del permiso</div>
        <div class="sig-title">Firma de recibido</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-name" style="visibility:hidden">.</div>
        <div class="sig-title">Sello oficial</div>
        <div class="sig-title">Dirección de Tránsito</div>
      </div>
    </div>
  </div>
  <script>setTimeout(()=>window.print(),600)<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Vencimientos automáticos ──────────────────────────────
async function checkAndUpdateVencidos() {
  const today = new Date().toISOString().slice(0,10);
  await Promise.all([
    _sb.from('permisos').update({estado:'vencido'}).eq('estado','vigente').lt('vencimiento', today),
    _sb.rpc('marcar_infracciones_vencidas')
  ]);
}

// ── Historial por placa + auto-fill desde padrón vehicular ──
async function checkPlacaHistory() {
  const placa = ($('inf-placa')||{}).value?.trim().toUpperCase();
  const panel = $('placa-history');
  if (!panel) return;
  if (!placa || placa.length < 3) { panel.innerHTML = ''; return; }

  // Consultar historial de infracciones y padrón vehicular en paralelo
  const [{ data }, { data: veh }] = await Promise.all([
    _sb.from('infracciones').select('id,folio,fecha,tipo,estado,monto').eq('placa', placa).order('fecha',{ascending:false}).limit(5),
    _sb.from('vehiculos').select('propietario,marca,modelo,color,telefono').eq('placa', placa).maybeSingle()
  ]);

  // Auto-completar campos del formulario si están vacíos
  if (veh) {
    const infractor = $('inf-infractor');
    if (infractor && !infractor.value) infractor.value = veh.propietario || '';
    const vehiculo = $('inf-vehiculo');
    if (vehiculo && !vehiculo.value) {
      vehiculo.value = [veh.marca, veh.modelo].filter(Boolean).join(' ');
    }
    const color = $('inf-color');
    if (color && !color.value) color.value = veh.color || '';
    const tel = $('inf-telefono');
    if (tel && !tel.value) tel.value = veh.telefono || '';
  }

  const prevId = $('inf-id')?.value;
  const prev = (data||[]).filter(r => String(r.id) !== String(prevId));

  const vehBanner = veh ? `
    <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:.6rem 1rem;margin:.4rem 0 .4rem;font-size:.78rem;color:#065F46">
      ✓ Vehículo encontrado en padrón — <strong>${veh.propietario}</strong>${veh.marca?` · ${[veh.marca,veh.modelo].filter(Boolean).join(' ')}`:''}${veh.color?` · ${veh.color}`:''}
    </div>` : '';

  if (!prev.length) { panel.innerHTML = vehBanner; return; }
  panel.innerHTML = vehBanner + `
    <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:.75rem 1rem;margin:.4rem 0 .6rem">
      <div style="font-size:.78rem;font-weight:700;color:#DC2626;margin-bottom:.45rem">
        ⚠ Placa con ${prev.length} infracción${prev.length>1?'es':''} previa${prev.length>1?'s':''} — REINCIDENTE
      </div>
      ${prev.slice(0,3).map(r=>`
        <div style="font-size:.73rem;color:#374151;display:flex;gap:.6rem;margin-bottom:.2rem;flex-wrap:wrap;align-items:center">
          <span style="font-family:monospace;font-weight:700">${r.folio||'—'}</span>
          <span>${fmtDateShort(r.fecha)}</span>
          <span>${r.tipo}</span>
          <span style="font-weight:600">${fmt(r.monto)}</span>
          ${estadoBadge(r.estado)}
        </div>`).join('')}
      ${prev.length>3?`<div style="font-size:.7rem;color:#9CA3AF;margin-top:.2rem">+ ${prev.length-3} más</div>`:''}
    </div>`;
}

// ── Pagos / Caja ──────────────────────────────────────────
let _cajaPage = 1, _cajaSearch = '', _cajaFecha = '', _cajaMetodo = '', _cajaCajero = '';
let _cajaTab = 'pendientes', _pendSearch = '', _pendSort = 'fecha_desc', _pendPage = 1;
const CAJA_PAGE_SIZE = 15;
const PEND_PAGE_SIZE = 15;

function switchCajaTab(tab) {
  _cajaTab = tab;
  ['pendientes','pagos'].forEach(t => {
    const btn = $('tab-'+t), sec = $('caja-section-'+(t==='pagos'?'pagos':t));
    if (btn) btn.classList.toggle('active', t===tab);
    if (sec) sec.style.display = t===tab ? 'block' : 'none';
  });
  if (tab==='pagos') {
    if (!_cajaFecha) _cajaFecha = new Date().toISOString().slice(0,10);
    renderCajaTable();
  }
}

async function renderCaja() {
  await Promise.all([renderCajaStats(), renderPendientesTable()]);
  // lazy-render historial only when user switches to it
}

async function renderPendientesTable() {
  const tbody = $('pendientes-table'); if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>`;

  let q = _sb.from('infracciones').select('id,folio,placa,infractor,tipo,monto,fecha,estado,telefono').eq('estado','pendiente');
  if (_pendSearch) q = q.or(`placa.ilike.%${_pendSearch}%,infractor.ilike.%${_pendSearch}%,folio.ilike.%${_pendSearch}%`);

  // Período
  const periodoVal = ($('pend-periodo')||{}).value||'';
  if (periodoVal) {
    const desde = _periodoRango(periodoVal);
    if (periodoVal === 'hoy') q = q.gte('fecha', desde+'T00:00:00').lte('fecha', desde+'T23:59:59');
    else if (desde) q = q.gte('fecha', desde);
  }

  if (_pendSort==='fecha_asc')   q = q.order('fecha',{ascending:true});
  else if (_pendSort==='monto_desc') q = q.order('monto',{ascending:false});
  else q = q.order('fecha',{ascending:false});

  const { data, error } = await q;
  if (error) { tbody.innerHTML=`<tr><td colspan="8" style="color:red">${error.message}</td></tr>`; return; }
  const all = data||[];

  const badge = $('badge-pendientes');
  if (badge) { badge.textContent = all.length; badge.style.display = all.length ? 'inline' : 'none'; }

  // Contador y totales
  const montoTotal = all.reduce((a,r)=>a+Number(r.monto),0);
  const pendLabel = $('pend-count-label');
  if (pendLabel) pendLabel.textContent = `${all.length} infracción${all.length!==1?'es':''} · Total: ${fmt(montoTotal)}`;

  const pages = Math.max(1,Math.ceil(all.length/PEND_PAGE_SIZE));
  if (_pendPage>pages) _pendPage=pages;
  const rows = all.slice((_pendPage-1)*PEND_PAGE_SIZE, _pendPage*PEND_PAGE_SIZE);
  const today = Date.now();

  // Leer config para descuento
  const descPct  = _cachedConfig?.descuento_pct  ?? 20;
  const diasDesc = _cachedConfig?.dias_descuento ?? 15;

  tbody.innerHTML = rows.length ? rows.map(r=>{
    const dias = Math.floor((today - new Date(r.fecha).getTime())/86400000);
    const urgColor = dias > 25 ? '#DC2626' : dias > 15 ? '#D97706' : dias > 7 ? '#1A7A82' : '#059669';
    const descOk = dias <= diasDesc;
    const montoFinal = descOk ? Math.round(Number(r.monto)*(1-descPct/100)) : Number(r.monto);
    const esc = s => (s||'').replace(/"/g,'&quot;');
    return `<tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer">
      <td style="width:4px;padding:0;background:${urgColor};border-radius:3px 0 0 3px"></td>
      <td class="mono" style="font-size:.73rem;font-weight:700">${r.folio||'—'}</td>
      <td style="font-family:monospace;font-weight:700;font-size:.8rem">${r.placa}</td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.infractor}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem">${r.tipo}</td>
      <td>
        <div style="font-weight:700;color:var(--amber)">${fmt(r.monto)}</div>
        ${descOk?`<div style="font-size:.68rem;color:var(--green);font-weight:600">${descPct}% dto → ${fmt(montoFinal)}</div>`:''}
      </td>
      <td style="white-space:nowrap">
        <span style="font-weight:700;color:${urgColor};font-size:.82rem">${dias}d</span>
      </td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;text-align:right;padding-right:.6rem">
        <button class="btn btn-sm" style="background:var(--green);color:#fff;border:none" onclick="event.stopPropagation();openRegistrarPago('${r.id}')" title="Cobrar">Cobrar</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();printTicket80('${r.id}')" title="Reimprimir ticket">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        </button>
        ${r.telefono?`<button class="btn-wa-icon" onclick="event.stopPropagation();_waFromBtn(this)" title="WhatsApp"
          data-tel="${r.telefono.replace(/\D/g,'')}" data-nombre="${esc(r.infractor)}"
          data-folio="${r.folio||''}" data-placa="${r.placa||''}" data-tipo="${esc(r.tipo)}"
          data-monto="${r.monto||0}" data-ubicacion="" data-fecha="${r.fecha||''}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#128C7E" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        </button>`:''}
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:2rem">Sin infracciones pendientes de pago</td></tr>`;

  // Tfoot con total
  const tfoot = $('pendientes-tfoot');
  if (tfoot && all.length > 0) {
    tfoot.innerHTML = `<tr style="background:var(--stone);font-weight:700">
      <td colspan="5" style="text-align:right;padding:.6rem .9rem;font-size:.78rem;color:var(--muted)">Total pendiente por cobrar:</td>
      <td style="padding:.6rem .9rem;color:var(--amber);font-size:.9rem">${fmt(montoTotal)}</td>
      <td colspan="2"></td>
    </tr>`;
  } else if (tfoot) tfoot.innerHTML = '';

  renderPager('pendientes-pager', _pendPage, pages, 'goPendPage');
}

function limpiarFiltrosPend() {
  if ($('pend-search')) $('pend-search').value = '';
  if ($('pend-periodo')) $('pend-periodo').value = '';
  if ($('pend-sort')) $('pend-sort').value = 'fecha_desc';
  _pendSearch = ''; _pendSort = 'fecha_desc'; _pendPage = 1;
  renderPendientesTable();
}

function filterPendientes() {
  _pendSearch = ($('pend-search')||{}).value||'';
  _pendSort   = ($('pend-sort')||{}).value||'fecha_desc';
  _pendPage   = 1; renderPendientesTable();
}

function goPendPage(p) { _pendPage = p; renderPendientesTable(); }

async function renderCajaStats() {
  const now = new Date();
  const today = now.toISOString().slice(0,10);
  const mesInicio = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

  const [{ data: hoyData }, { data: mesData }, { data: pendData }] = await Promise.all([
    _sb.from('pagos').select('monto_final,metodo').gte('created_at', today+'T00:00:00').lte('created_at', today+'T23:59:59'),
    _sb.from('pagos').select('monto_final').gte('created_at', mesInicio+'T00:00:00'),
    _sb.from('infracciones').select('monto').eq('estado','pendiente')
  ]);

  const h = hoyData || [];
  const total   = h.reduce((a,r)=>a+Number(r.monto_final),0);
  const efect   = h.filter(r=>r.metodo==='efectivo').reduce((a,r)=>a+Number(r.monto_final),0);
  const tarj    = h.filter(r=>r.metodo==='tarjeta').reduce((a,r)=>a+Number(r.monto_final),0);
  const transf  = h.filter(r=>r.metodo==='transferencia').reduce((a,r)=>a+Number(r.monto_final),0);
  const totalMes  = (mesData||[]).reduce((a,r)=>a+Number(r.monto_final),0);
  const montoPend = (pendData||[]).reduce((a,r)=>a+Number(r.monto),0);

  const el = $('caja-stats'); if (!el) return;
  const card = (num, label, sub, icon, bg) => `
    <div class="stat-card">
      <div class="stat-top">
        <div>
          <div class="stat-num" style="font-size:1.25rem">${num}</div>
          <div class="stat-label">${label}</div>
          ${sub?`<div style="font-size:.7rem;color:var(--muted);margin-top:.1rem">${sub}</div>`:''}
        </div>
        <div class="stat-icon" style="background:${bg}">${icon}</div>
      </div>
    </div>`;

  el.innerHTML =
    card(fmt(total), 'Cobrado hoy', `${h.length} pago${h.length!==1?'s':''}`,
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1A7A82" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`, 'rgba(26,122,130,.1)') +
    card(fmt(totalMes), 'Total del mes', now.toLocaleDateString('es-MX',{month:'long'}),
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`, 'var(--blue-bg)') +
    card(fmt(montoPend), 'Pendiente por cobrar', `${(pendData||[]).length} infracciones`,
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`, 'var(--amber-bg)') +
    card(fmt(efect), 'Efectivo hoy', '',
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`, 'var(--green-bg)') +
    card(fmt(tarj), 'Tarjeta hoy', '',
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`, 'var(--blue-bg)') +
    card(fmt(transf), 'Transferencia hoy', '',
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><path d="M22 2L11 13M22 2L15 22 11 13 2 9l20-7z"/></svg>`, 'var(--amber-bg)');

  // Distribución visual
  const distEl = $('caja-distribucion');
  if (distEl) {
    if (total > 0) {
      const pct = v => Math.round(v / total * 100);
      const bar = (label, val, color) => val <= 0 ? '' : `
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem">
          <div style="width:100px;font-size:.78rem;font-weight:600;color:var(--ink);text-align:right;flex-shrink:0">${label}</div>
          <div style="flex:1;height:10px;background:var(--border);border-radius:5px;overflow:hidden">
            <div style="width:${pct(val)}%;height:100%;background:${color};border-radius:5px;transition:width .5s ease"></div>
          </div>
          <div style="width:120px;font-size:.78rem;color:var(--muted);flex-shrink:0">${fmt(val)} <span style="color:${color};font-weight:700">${pct(val)}%</span></div>
        </div>`;
      distEl.innerHTML = `<div class="card" style="padding:1rem 1.3rem">
        <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:.8rem">Distribución por método de pago — hoy</div>
        ${bar('Efectivo', efect, '#059669')}
        ${bar('Tarjeta', tarj, '#2563EB')}
        ${bar('Transferencia', transf, '#D97706')}
      </div>`;
    } else {
      distEl.innerHTML = '';
    }
  }
}

async function renderCajaTable() {
  const tbody = $('caja-table'); if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--muted)">Cargando…</td></tr>`;

  let q = _sb.from('pagos').select('*, infracciones(placa,infractor,tipo)').order('created_at',{ascending:false});
  if (_cajaFecha)  q = q.gte('created_at',_cajaFecha+'T00:00:00').lte('created_at',_cajaFecha+'T23:59:59');
  if (_cajaMetodo) q = q.eq('metodo', _cajaMetodo);
  if (_cajaCajero) q = q.ilike('cajero', `%${_cajaCajero}%`);
  if (_cajaSearch) q = q.or(`folio_inf.ilike.%${_cajaSearch}%,cajero.ilike.%${_cajaSearch}%,infracciones.placa.ilike.%${_cajaSearch}%`);

  const { data, error } = await q;
  if (error) { tbody.innerHTML=`<tr><td colspan="10" style="color:red">${error.message}</td></tr>`; return; }
  const all = data||[];

  // Poblar cajero filter en primer render
  const cajeroEl = $('caja-cajero-filter');
  if (cajeroEl && cajeroEl.options.length <= 1 && all.length > 0) {
    const cajeros = [...new Set(all.map(r=>r.cajero).filter(Boolean))].sort();
    cajeroEl.innerHTML = '<option value="">Todos los cajeros</option>' +
      cajeros.map(c=>`<option value="${c}">${c}</option>`).join('');
  }

  // Resumen
  const totalCobrado = all.reduce((a,r)=>a+Number(r.monto_final),0);
  const totalDesc = all.reduce((a,r)=>a+Number(r.monto_original)-Number(r.monto_final),0);
  const countLabel = $('caja-count-label');
  if (countLabel) countLabel.textContent = `${all.length} pago${all.length!==1?'s':''} · Recaudado: ${fmt(totalCobrado)}${totalDesc>0?' · Descuentos: '+fmt(totalDesc):''}`;

  const pages = Math.max(1,Math.ceil(all.length/CAJA_PAGE_SIZE));
  if (_cajaPage>pages) _cajaPage=pages;
  const rows = all.slice((_cajaPage-1)*CAJA_PAGE_SIZE, _cajaPage*CAJA_PAGE_SIZE);

  const metodoIcon = { efectivo:'💵', tarjeta:'💳', transferencia:'🏦' };
  tbody.innerHTML = rows.length ? rows.map(r=>{
    const inf = r.infracciones||{};
    return `<tr>
      <td class="mono" style="font-size:.73rem;font-weight:700">${r.folio_inf||'—'}</td>
      <td style="font-size:.78rem;white-space:nowrap">${fmtDateShort(r.created_at)}</td>
      <td style="font-family:monospace;font-weight:700;font-size:.8rem">${inf.placa||'—'}</td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${inf.infractor||'—'}</td>
      <td style="color:var(--muted)">${fmt(r.monto_original)}</td>
      <td>${r.descuento_pct>0?`<span style="background:var(--green-bg);color:var(--green);padding:.15rem .5rem;border-radius:12px;font-size:.72rem;font-weight:700">${r.descuento_pct}%</span>`:'—'}</td>
      <td style="font-weight:800;color:var(--green)">${fmt(r.monto_final)}</td>
      <td><span style="font-size:.8rem">${metodoIcon[r.metodo]||''} ${r.metodo||'—'}</span></td>
      <td style="font-size:.78rem;color:var(--muted)">${r.cajero||'—'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="printReciboPago('${r.id}')">Recibo</button></td>
    </tr>`;
  }).join('') : `<tr><td colspan="10" style="text-align:center;color:var(--muted);padding:2rem">Sin pagos en este período</td></tr>`;

  // Tfoot total
  const tfoot = $('caja-tfoot');
  if (tfoot && all.length > 0) {
    tfoot.innerHTML = `<tr style="background:var(--stone);font-weight:700">
      <td colspan="6" style="text-align:right;padding:.6rem .9rem;font-size:.78rem;color:var(--muted)">Total recaudado en este período:</td>
      <td style="padding:.6rem .9rem;color:var(--green);font-size:.9rem">${fmt(totalCobrado)}</td>
      <td colspan="3"></td>
    </tr>`;
  } else if (tfoot) tfoot.innerHTML = '';

  renderPager('caja-pager', _cajaPage, pages, 'goCajaPage');
}

function filterCajaByPeriodo() {
  const periodo = ($('caja-periodo-filter')||{}).value||'hoy';
  const fechaEl = $('caja-fecha-filter');
  if (periodo === 'custom') {
    if (fechaEl) fechaEl.style.display = '';
    _cajaFecha = fechaEl?.value || new Date().toISOString().slice(0,10);
  } else {
    if (fechaEl) { fechaEl.style.display = 'none'; fechaEl.value = ''; }
    if (periodo === 'hoy') {
      _cajaFecha = new Date().toISOString().slice(0,10);
    } else if (periodo === 'semana') {
      const d = new Date(); d.setDate(d.getDate()-7);
      _cajaFecha = d.toISOString().slice(0,10);
    } else if (periodo === 'mes') {
      const n = new Date();
      _cajaFecha = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`;
    }
  }
  _cajaPage = 1; renderCajaTable();
}

function limpiarFiltrosCaja() {
  if ($('caja-search')) $('caja-search').value = '';
  if ($('caja-periodo-filter')) $('caja-periodo-filter').value = 'hoy';
  if ($('caja-fecha-filter')) { $('caja-fecha-filter').value = ''; $('caja-fecha-filter').style.display = 'none'; }
  if ($('caja-metodo-filter')) $('caja-metodo-filter').value = '';
  if ($('caja-cajero-filter')) $('caja-cajero-filter').value = '';
  _cajaSearch = ''; _cajaCajero = '';
  _cajaFecha  = new Date().toISOString().slice(0,10);
  _cajaMetodo = ''; _cajaPage = 1;
  renderCajaTable();
}

function filterCaja() {
  _cajaSearch  = ($('caja-search')||{}).value||'';
  _cajaFecha   = ($('caja-fecha-filter')||{}).value||'';
  _cajaMetodo  = ($('caja-metodo-filter')||{}).value||'';
  _cajaCajero  = ($('caja-cajero-filter')||{}).value||'';
  _cajaPage = 1; renderCajaTable();
}

function goCajaPage(p) { _cajaPage = p; renderCajaTable(); }

// ── QR Scanner ────────────────────────────────────────────
let _qrStream = null, _qrScanInterval = null;

async function openQRScanner() {
  openModal('modal-qr-scanner');
  const statusEl = $('qr-status');
  const box = document.getElementById('qr-box');
  if (statusEl) statusEl.textContent = 'Iniciando cámara…';
  if (box) box.style.borderColor = 'var(--ac)';

  try {
    _qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
    const video = document.getElementById('qr-video');
    video.srcObject = _qrStream;
    await video.play();
    if (statusEl) statusEl.textContent = 'Escaneando — acerca el QR al recuadro…';

    // BarcodeDetector (nativo en Chrome/Android/Edge — más confiable)
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      _qrScanInterval = setInterval(async () => {
        if (!_qrStream) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0 && codes[0].rawValue) {
            if (box) box.style.borderColor = '#059669';
            stopQRScan();
            handleQRResult(codes[0].rawValue);
          }
        } catch(e) {}
      }, 300);
    } else {
      // Fallback: jsQR sobre canvas
      const canvas = document.getElementById('qr-canvas');
      if (!canvas) { if (statusEl) statusEl.textContent = 'Error interno (canvas).'; return; }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      _qrScanInterval = setInterval(() => {
        if (!_qrStream || video.readyState < 2 || !video.videoWidth) return;
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
          if (code?.data) {
            if (box) box.style.borderColor = '#059669';
            stopQRScan();
            handleQRResult(code.data);
          }
        } catch(e) {}
      }, 250);
    }
  } catch(err) {
    if (statusEl) statusEl.textContent = 'Cámara no disponible: ' + err.message;
  }
}

function stopQRScan() {
  if (_qrScanInterval) { clearInterval(_qrScanInterval); _qrScanInterval = null; }
  if (_qrStream) { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
  const video = document.getElementById('qr-video');
  if (video) { video.srcObject = null; }
  closeModal('modal-qr-scanner');
}

async function handleQRResult(data) {
  let infId = null;
  try {
    const obj = JSON.parse(data);
    infId = obj.id || null;
    if (!infId && obj.folio) {
      const { data: r } = await _sb.from('infracciones').select('id,estado').eq('folio', obj.folio).single();
      if (r) infId = r.id;
    }
  } catch(e) {
    // Try as plain folio text
    const q = data.trim();
    const { data: r } = await _sb.from('infracciones').select('id,estado').eq('folio', q).single();
    if (r) infId = r.id;
  }
  if (!infId) { showToast('QR no reconocido o la infracción no existe'); return; }
  const { data: inf } = await _sb.from('infracciones').select('estado').eq('id', infId).single();
  if (!inf) { showToast('Infracción no encontrada'); return; }
  if (inf.estado !== 'pendiente') { showToast('Esta infracción ya fue pagada o está vencida'); return; }
  openRegistrarPago(infId);
}

async function openBuscarParaPago() {
  if ($('buscar-pago-input')) $('buscar-pago-input').value = '';
  if ($('buscar-pago-results')) $('buscar-pago-results').innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Escribe para buscar una infracción pendiente</div>';
  openModal('modal-buscar-pago');
}

async function buscarInfPago() {
  const q = ($('buscar-pago-input')||{}).value?.trim()||'';
  const el = $('buscar-pago-results'); if (!el) return;
  if (q.length < 2) { el.innerHTML='<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Escribe al menos 2 caracteres</div>'; return; }
  const { data } = await _sb.from('infracciones').select('id,folio,placa,infractor,tipo,monto,fecha,estado')
    .eq('estado','pendiente').or(`placa.ilike.%${q}%,infractor.ilike.%${q}%,folio.ilike.%${q}%`).order('fecha',{ascending:false}).limit(10);
  const rows = data||[];
  el.innerHTML = rows.length ? rows.map(r=>`
    <div style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s" onmouseenter="this.style.background='var(--stone)'" onmouseleave="this.style.background=''" onclick="closeModal('modal-buscar-pago');openRegistrarPago('${r.id}')">
      <div style="flex:1">
        <div style="font-size:.82rem;font-weight:700;font-family:monospace">${r.folio||'—'}</div>
        <div style="font-size:.78rem;color:var(--text)">${r.infractor} · ${r.placa}</div>
        <div style="font-size:.73rem;color:var(--muted)">${r.tipo} · ${fmtDateShort(r.fecha)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.9rem;font-weight:700;color:var(--ac)">${fmt(r.monto)}</div>
        ${estadoBadge(r.estado)}
      </div>
    </div>`).join('') : '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Sin resultados pendientes</div>';
}

async function openRegistrarPago(infId) {
  if (!_cachedConfig) {
    const { data: cfg } = await _sb.from('configuracion').select('descuento_pct,dias_descuento').eq('id',1).single();
    if (cfg) _cachedConfig = { ...(_cachedConfig||{}), ...cfg };
  }
  const descPct  = _cachedConfig?.descuento_pct  ?? 20;
  const diasDesc = _cachedConfig?.dias_descuento ?? 15;

  const { data: r } = await _sb.from('infracciones').select('*').eq('id', infId).single();
  if (!r) return;
  $('pago-inf-id').value = infId;
  const dias = Math.floor((Date.now()-new Date(r.fecha).getTime())/86400000);
  const descOk = dias <= diasDesc;
  const infoEl = $('pago-inf-info');
  if (infoEl) infoEl.innerHTML = `
    <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.35rem">Infracción</div>
    <div style="font-size:.92rem;font-weight:700;color:var(--ink)">${r.folio||'—'} — ${r.tipo}</div>
    <div style="font-size:.8rem;color:var(--text);margin-top:.2rem">${r.infractor} · Placa: <strong>${r.placa}</strong></div>
    <div style="font-size:.8rem;color:var(--text)">${fmtDateShort(r.fecha)} · <strong>${fmt(r.monto)}</strong></div>
    ${descOk?`<div style="font-size:.75rem;color:var(--green);margin-top:.3rem;font-weight:600">✓ Elegible para descuento del ${descPct}% (pronto pago — menos de ${diasDesc} días)</div>`:`<div style="font-size:.75rem;color:var(--muted);margin-top:.3rem">Sin descuento disponible (más de ${diasDesc} días)</div>`}`;
  const descEl = $('pago-descuento');
  if (descEl) {
    descEl.innerHTML = `<option value="0">Sin descuento (100%)</option><option value="${descPct}">${descPct}% — pronto pago</option>`;
    Array.from(descEl.options).forEach(o=>{ if(o.value===String(descPct)) o.disabled=!descOk; });
    descEl.value='0';
  }
  if ($('pago-metodo'))  $('pago-metodo').value = 'efectivo';
  if ($('pago-cajero'))  $('pago-cajero').value = _session?.name||'';
  if ($('pago-notas'))   $('pago-notas').value  = '';
  if ($('pago-recibido')) $('pago-recibido').value = '';
  if ($('pago-cambio-display')) $('pago-cambio-display').textContent = '—';
  if ($('pago-efectivo-wrap')) $('pago-efectivo-wrap').style.display = '';
  window._pagoMontoOriginal = r.monto;
  calcularMontoPago();
  openModal('modal-pago');
}

function calcularMontoPago() {
  const desc = parseInt(($('pago-descuento')||{}).value||'0');
  const final = Math.round((window._pagoMontoOriginal||0)*(1-desc/100));
  window._pagoMontoFinal = final;
  const el = $('pago-monto-display'); if (el) el.textContent = fmt(final);
  calcularCambio();
}

function onMetodoChange() {
  const metodo = ($('pago-metodo')||{}).value;
  const wrap = $('pago-efectivo-wrap');
  if (wrap) wrap.style.display = metodo === 'efectivo' ? '' : 'none';
  if (metodo !== 'efectivo') {
    if ($('pago-recibido')) $('pago-recibido').value = '';
    if ($('pago-cambio-display')) $('pago-cambio-display').textContent = '—';
  }
}

function calcularCambio() {
  const recibido = parseFloat(($('pago-recibido')||{}).value)||0;
  const final = window._pagoMontoFinal || 0;
  const cambioEl = $('pago-cambio-display');
  if (!cambioEl) return;
  if (recibido <= 0) { cambioEl.textContent = '—'; cambioEl.style.color = 'var(--green)'; return; }
  const cambio = recibido - final;
  cambioEl.textContent = fmt(Math.max(0, cambio));
  cambioEl.style.color = cambio < 0 ? 'var(--red)' : 'var(--green)';
}

async function submitPago() {
  const infId = $('pago-inf-id')?.value; if (!infId) return;
  const btn = $('pago-submit-btn');
  if (btn) { btn.disabled=true; btn.textContent='Registrando…'; }
  const desc = parseInt(($('pago-descuento')||{}).value||'0');
  const monto = window._pagoMontoOriginal||0;
  const final = Math.round(monto*(1-desc/100));
  const { data: inf } = await _sb.from('infracciones').select('folio').eq('id',infId).single();
  const payload = {
    infraccion_id: parseInt(infId), folio_inf: inf?.folio||'',
    monto_original: monto, descuento_pct: desc, monto_final: final,
    metodo: $('pago-metodo')?.value||'efectivo',
    cajero: $('pago-cajero')?.value?.trim()||'',
    notas:  $('pago-notas')?.value?.trim()||''
  };
  const { data: pago, error } = await _sb.from('pagos').insert(payload).select().single();
  if (btn) { btn.disabled=false; btn.textContent='Registrar pago'; }
  if (error) { alert('Error: '+error.message); return; }
  await _sb.from('infracciones').update({estado:'pagada'}).eq('id',infId);
  await logActivity('infraccion',`Pago registrado — ${inf?.folio||'infracción'}: ${fmt(final)} (${payload.metodo})`);
  closeModal('modal-pago'); closeModal('modal-detail');
  showToast(`Pago registrado: ${fmt(final)} — ${payload.metodo}`);
  printReciboPago(pago.id);
  renderInfracciones(); renderDashboard();
  if ($('view-caja')?.style.display==='block') { renderCajaStats(); renderPendientesTable(); renderCajaTable(); }
}

async function printReciboPago(pagoId) {
  const { data: p } = await _sb.from('pagos').select('*, infracciones(folio,tipo,placa,infractor,fecha,ubicacion)').eq('id',pagoId).single();
  const { data: cfg } = await _sb.from('configuracion').select('*').eq('id',1).single();
  if (!p) return;
  const inf = p.infracciones||{};
  const mun = cfg?.municipio||'Municipio', est = cfg?.estado||'';
  const fechaPago = new Date(p.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const horaPago  = new Date(p.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Recibo ${p.folio_inf||''}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f5f5f5;font-size:11px}
    .page{width:215.9mm;min-height:139.7mm;margin:0 auto;background:#fff;padding:12mm 14mm}
    .no-print{text-align:center;padding:8px 0 10px;background:#f5f5f5}
    .no-print button{padding:6px 18px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;margin:0 3px}
    .hdr{display:flex;align-items:center;gap:6mm;padding-bottom:4mm;border-bottom:3px solid #059669;margin-bottom:5mm}
    .seal{width:14mm;height:14mm;border-radius:50%;border:2px solid #059669;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#059669;flex-shrink:0}
    .ht{flex:1}.gov{font-size:7.5px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.5px}
    .dept{font-size:12px;font-weight:900;color:#1A1F2B;margin:1px 0}.sub{font-size:8px;color:#6B7280}
    .rn{text-align:right}.rnl{font-size:7px;color:#9CA3AF;text-transform:uppercase}.rnv{font-size:14px;font-weight:900;color:#059669;font-family:'Courier New',monospace}
    .tbar{background:#059669;color:#fff;text-align:center;padding:2.5mm 0;margin-bottom:4mm;border-radius:3px}
    .tbar h1{font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase}.tbar p{font-size:8px;opacity:.85;margin-top:1px}
    .cols{display:flex;gap:6mm;margin-bottom:4mm}
    .col{flex:1}.sec{font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#059669;border-bottom:1.5px solid #059669;padding-bottom:1mm;margin-bottom:2.5mm}
    .f{margin-bottom:2mm}.fl{font-size:6.5px;text-transform:uppercase;color:#9CA3AF;letter-spacing:.3px;margin-bottom:.3mm}.fv{font-size:10px;color:#1A1F2B;font-weight:500}
    .amount{background:#f0fdf4;border:2px solid #059669;border-radius:4px;text-align:center;padding:3mm;margin:3mm 0}
    .al{font-size:7px;text-transform:uppercase;letter-spacing:1px;color:#059669;font-weight:700;margin-bottom:1mm}
    .av{font-size:24px;font-weight:900;color:#059669}.as{font-size:8px;color:#6B7280;margin-top:.5mm}
    .stamp{position:absolute;right:18mm;top:45mm;border:3px solid #059669;color:#059669;font-size:18px;font-weight:900;letter-spacing:3px;padding:2mm 5mm;border-radius:3px;transform:rotate(-8deg);opacity:.65}
    .page{position:relative}
    .sig{display:flex;gap:10mm;margin-top:6mm}.sb{flex:1;text-align:center}.sl{height:8mm;border-bottom:1.5px solid #374151;margin-bottom:1mm}.sn{font-size:8.5px;font-weight:700}.st{font-size:7px;color:#6B7280}
    .foot{text-align:center;font-size:7px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:2.5mm;margin-top:4mm}
    @media print{body{background:#fff}.no-print{display:none!important}.page{margin:0;padding:10mm 12mm;width:100%}@page{margin:0;size:letter portrait}}
  </style></head><body>
  <div class="no-print"><button onclick="window.print()">Imprimir recibo</button><button onclick="window.close()">Cerrar</button></div>
  <div class="page">
    <div class="stamp">PAGADO</div>
    <div class="hdr">
      <div class="seal">HCE</div>
      <div class="ht"><div class="gov">Gobierno Municipal · ${mun}</div><div class="dept">Dirección de Tránsito y Movilidad</div><div class="sub">${est}</div></div>
      <div class="rn"><div class="rnl">Núm. de recibo</div><div class="rnv">REC-${String(p.id).padStart(6,'0')}</div></div>
    </div>
    <div class="tbar"><h1>Recibo de Pago de Infracción</h1><p>Emitido el ${fechaPago} a las ${horaPago}</p></div>
    <div class="cols">
      <div class="col">
        <div class="sec">Infracción pagada</div>
        <div class="f"><div class="fl">Folio</div><div class="fv" style="font-family:monospace;font-weight:700">${p.folio_inf||'—'}</div></div>
        <div class="f"><div class="fl">Tipo</div><div class="fv">${inf.tipo||'—'}</div></div>
        <div class="f"><div class="fl">Fecha infracción</div><div class="fv">${fmtDateShort(inf.fecha)}</div></div>
        <div class="f"><div class="fl">Infractor</div><div class="fv" style="font-weight:700">${inf.infractor||'—'}</div></div>
        <div class="f"><div class="fl">Placa</div><div class="fv" style="font-family:monospace">${inf.placa||'—'}</div></div>
      </div>
      <div class="col">
        <div class="sec">Detalle del pago</div>
        <div class="f"><div class="fl">Monto original</div><div class="fv">${fmt(p.monto_original)}</div></div>
        <div class="f"><div class="fl">Descuento</div><div class="fv" style="color:#059669">${p.descuento_pct>0?p.descuento_pct+'%':'Sin descuento'}</div></div>
        <div class="f"><div class="fl">Método de pago</div><div class="fv" style="text-transform:capitalize">${p.metodo}</div></div>
        <div class="f"><div class="fl">Cajero</div><div class="fv">${p.cajero||'—'}</div></div>
        <div class="amount"><div class="al">Total cobrado</div><div class="av">${fmt(p.monto_final)}</div><div class="as">MXN — ${p.metodo.charAt(0).toUpperCase()+p.metodo.slice(1)}</div></div>
      </div>
    </div>
    <div class="sig">
      <div class="sb"><div class="sl"></div><div class="sn">${p.cajero||'Cajero'}</div><div class="st">Cajero que recibe</div></div>
      <div class="sb"><div class="sl"></div><div class="sn">${inf.infractor||'Infractor'}</div><div class="st">Firma de conformidad</div></div>
    </div>
    <div class="foot">Recibo REC-${String(p.id).padStart(6,'0')} · Infracción ${p.folio_inf||''}. Este documento acredita el pago total. Expedido por Dirección de Tránsito, ${mun}.</div>
  </div>
  <script>setTimeout(()=>window.print(),600)<\/script>
  </body></html>`;
  const win = window.open('','_blank','width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Oficiales ─────────────────────────────────────────────
async function renderOficiales() {
  const tbody = $('oficiales-table'); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  const { data, error } = await _sb.from('infracciones').select('oficial,monto,estado,fecha');
  if (error) { tbody.innerHTML=`<tr><td colspan="6" style="color:red">${error.message}</td></tr>`; return; }
  const map = {};
  (data||[]).forEach(r => {
    const k = r.oficial?.trim() || '(Sin asignar)';
    if (!map[k]) map[k]={ total:0, monto:0, pend:0, pag:0, ultima:null };
    map[k].total++;
    map[k].monto += Number(r.monto||0);
    if (r.estado==='pendiente') map[k].pend++;
    if (r.estado==='pagada')    map[k].pag++;
    if (!map[k].ultima || new Date(r.fecha)>new Date(map[k].ultima)) map[k].ultima = r.fecha;
  });
  const sorted = Object.entries(map).sort((a,b)=>b[1].total-a[1].total);
  tbody.innerHTML = sorted.length ? sorted.map(([n,s])=>`
    <tr>
      <td style="font-weight:600">${n}</td>
      <td style="text-align:center;font-weight:700">${s.total}</td>
      <td>${fmt(s.monto)}</td>
      <td>${s.pend>0?`<span class="badge-yellow">${s.pend}</span>`:'<span class="badge-muted">0</span>'}</td>
      <td>${s.pag>0?`<span class="badge-green">${s.pag}</span>`:'<span class="badge-muted">0</span>'}</td>
      <td>${fmtDateShort(s.ultima)}</td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Sin datos — agrega el nombre del oficial al registrar infracciones</td></tr>';
}

// ── Usuarios ──────────────────────────────────────────────
async function renderUsuarios() {
  const tbody = $('usuarios-table'); if (!tbody) return;
  if (_rol !== 'admin') {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem">Acceso restringido a administradores</td></tr>';
    const navUsr = $('nav-usuarios'); if (navUsr) navUsr.style.opacity = '.4';
    return;
  }
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  const { data, error } = await _sb.from('usuarios').select('*').order('id');
  if (error) { tbody.innerHTML=`<tr><td colspan="5" style="color:red">${error.message}</td></tr>`; return; }
  const labels = { admin:'Administrador', supervisor:'Supervisor', oficial:'Oficial' };
  tbody.innerHTML = (data||[]).map(u=>`
    <tr>
      <td style="font-weight:600">${u.nombre}</td>
      <td class="mono">${u.usuario}</td>
      <td>${labels[u.rol]||u.rol}</td>
      <td>${u.activo?'<span class="badge-green">Activo</span>':'<span class="badge-muted">Inactivo</span>'}</td>
      <td style="display:flex;gap:.4rem">
        <button class="btn btn-ghost btn-sm" onclick="editUsuario(${u.id})">Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="printCredencial('${u.id}')" title="Imprimir credencial">🪪</button>
        ${u.usuario!=='admin'?`<button class="btn btn-ghost btn-sm" onclick="toggleUsuario(${u.id},${!u.activo})">${u.activo?'Desactivar':'Activar'}</button>`:''}
      </td>
    </tr>`).join('');
}

function openNewUsuario() {
  $('modal-usr-title').textContent = 'Nuevo usuario';
  ['usr-id','usr-nombre','usr-usuario','usr-pass','usr-iniciales'].forEach(id=>{ if($(id)) $(id).value=''; });
  if ($('usr-rol')) $('usr-rol').value = 'oficial';
  if ($('usr-pass')) $('usr-pass').placeholder = 'Contraseña requerida';
  openModal('modal-usuario');
}

async function editUsuario(id) {
  const { data } = await _sb.from('usuarios').select('*').eq('id',id).single();
  if (!data) return;
  $('modal-usr-title').textContent = 'Editar usuario';
  $('usr-id').value        = data.id;
  $('usr-nombre').value    = data.nombre;
  $('usr-usuario').value   = data.usuario;
  $('usr-pass').value      = '';
  $('usr-iniciales').value = data.iniciales||'';
  $('usr-rol').value       = data.rol;
  if ($('usr-pass')) $('usr-pass').placeholder = 'Dejar vacío para no cambiar';
  openModal('modal-usuario');
}

async function submitUsuario() {
  const id = $('usr-id')?.value;
  const nombre = $('usr-nombre')?.value?.trim();
  const usuario = $('usr-usuario')?.value?.trim().toLowerCase();
  const pass = $('usr-pass')?.value;
  const iniciales = $('usr-iniciales')?.value?.trim().toUpperCase() || nombre.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const rol = $('usr-rol')?.value;
  if (!nombre||!usuario) { alert('Nombre y usuario son requeridos'); return; }
  if (!id && !pass) { alert('La contraseña es requerida para nuevos usuarios'); return; }
  const payload = { nombre, usuario, rol, iniciales };
  if (pass) payload.contrasena = pass;
  const { error } = id
    ? await _sb.from('usuarios').update(payload).eq('id', id)
    : await _sb.from('usuarios').insert(payload);
  if (error) { alert('Error: '+error.message); return; }
  closeModal('modal-usuario');
  renderUsuarios();
  showToast('Usuario '+(id?'actualizado':'creado')+' correctamente');
}

async function toggleUsuario(id, activo) {
  const { error } = await _sb.from('usuarios').update({activo}).eq('id',id);
  if (error) { alert('Error: '+error.message); return; }
  renderUsuarios();
}

// ── Ticket 80mm (print functions) ────────────────────────
function buildTicket80(r, cfg, qrDataUrl) {
  const mun = cfg?.municipio || 'Municipio';
  const est = cfg?.estado || '';
  const fechaObj = new Date(r.fecha);
  const fechaStr = fechaObj.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
  const horaStr  = fechaObj.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const descFecha = new Date(fechaObj.getTime()+15*86400000).toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
  const limFecha  = new Date(fechaObj.getTime()+30*86400000).toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
  const montoDesc = Math.round(r.monto*0.80).toLocaleString('es-MX');
  const montoFmt  = Number(r.monto).toLocaleString('es-MX');
  const ref = (r.folio||'INF').replace(/[^A-Z0-9]/g,'') + String(r.id||0).padStart(6,'0');

  return `<div class="t80">
    <div class="t-center t-bold" style="font-size:7.5pt;letter-spacing:.5px">${mun.toUpperCase()}</div>
    ${est?`<div class="t-center" style="font-size:6.5pt">${est.toUpperCase()}</div>`:''}
    <div class="t-center" style="font-size:7pt">DIRECCIÓN DE TRÁNSITO Y MOVILIDAD</div>
    <div class="t-div"></div>
    <div class="t-invert">INFRACCIÓN DE TRÁNSITO</div>
    <div style="margin:1.5mm 0"></div>
    <div class="t-center t-xl">${r.folio||'—'}</div>
    <div class="t-div"></div>
    <div class="t-row"><span>FECHA:</span><span>${fechaStr}</span></div>
    <div class="t-row"><span>HORA:</span><span>${horaStr}</span></div>
    <div class="t-div"></div>
    <div class="t-bold" style="font-size:7.5pt">INFRACTOR:</div>
    <div>${r.infractor}</div>
    <div class="t-row t-small"><span>LIC:</span><span>${r.licencia||'N/A'}</span></div>
    <div style="margin:.5mm 0"></div>
    <div class="t-bold" style="font-size:7.5pt">VEHÍCULO:</div>
    <div class="t-row"><span>PLACA:</span><span class="t-bold">${r.placa}</span></div>
    ${r.color_vehiculo?`<div class="t-row t-small"><span>COLOR:</span><span>${r.color_vehiculo}</span></div>`:''}
    ${r.vehiculo?`<div class="t-small" style="word-break:break-word">${r.vehiculo}</div>`:''}
    <div class="t-div"></div>
    <div class="t-bold" style="font-size:7.5pt">INFRACCIÓN:</div>
    <div>${r.tipo}</div>
    ${r.ubicacion?`<div class="t-small" style="margin-top:.5mm">Lugar: ${r.ubicacion}</div>`:''}
    <div class="t-solid"></div>
    <div class="t-center t-bold" style="font-size:7.5pt">MONTO A PAGAR</div>
    <div class="t-amount">
      <div class="t-xl">$${montoFmt}</div>
      <div class="t-small">MXN</div>
    </div>
    <div class="t-disc">
      <div class="t-bold">▼ 20% descuento pagando antes del</div>
      <div>${descFecha} — solo $${montoDesc} MXN</div>
    </div>
    <div class="t-disc" style="border-color:#DC2626;color:#DC2626">
      <div class="t-bold">⚠ Fecha límite de pago: ${limFecha}</div>
    </div>
    <div class="t-div"></div>
    <div class="t-center t-small">Pague en Tesorería Municipal</div>
    <div class="t-center t-small">Lunes a Viernes 8:00–15:00 hrs</div>
    <div class="t-center t-small" style="margin-top:.5mm">Referencia de pago:</div>
    <div class="t-barref">${ref}</div>
    ${qrDataUrl?`<div style="text-align:center;margin:2mm 0 1mm"><img src="${qrDataUrl}" style="width:130px;height:130px;display:block;margin:0 auto"/><div style="font-size:6.5pt;margin-top:.5mm;color:#444">Escanea para cobrar</div></div>`:''}
    <div class="t-div"></div>
    <div class="t-bold" style="font-size:7pt">FIRMA DEL OFICIAL:</div>
    <div class="t-sig"></div>
    <div class="t-small">${r.oficial||'Agente de Tránsito'}</div>
    <div style="margin:.5mm 0"></div>
    <div class="t-bold" style="font-size:7pt">FIRMA / HUELLA DEL INFRACTOR:</div>
    <div class="t-sig"></div>
    <div class="t-div"></div>
    <div class="t-center t-small">El no pago genera recargos del 2%</div>
    <div class="t-center t-small">mensual e inmovilización del vehículo.</div>
    <div class="t-center t-small" style="margin-top:1mm">Sistema Tránsito Municipal · HCE</div>
  </div>`;
}

async function printTicket80(id) {
  if (!id) return;
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('infracciones').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id', 1).single()
  ]);
  if (!r) return;

  let qrDataUrl = '';
  try {
    const qrPayload = JSON.stringify({ id: r.id, folio: r.folio||'', placa: r.placa, monto: r.monto, infractor: r.infractor });
    qrDataUrl = new QRious({ value: qrPayload, size: 260, padding: 6, backgroundAlpha: 1 }).toDataURL();
  } catch(e) { console.warn('QR gen error:', e); }

  const ticketHTML = buildTicket80(r, cfg, qrDataUrl);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Ticket ${r.folio||''}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#fff;display:flex;flex-direction:column;align-items:center;padding:4mm;font-family:'Courier New',Courier,monospace}
    .no-print{text-align:center;margin-bottom:4mm}
    .no-print button{padding:6px 16px;background:#1A7A82;color:#fff;border:none;border-radius:5px;font-size:12px;cursor:pointer;margin:0 3px}
    .no-print button:hover{background:#229099}
    .t80{width:72mm;min-width:72mm;background:#fff;font-family:'Courier New',Courier,monospace;font-size:8.5pt;line-height:1.45;color:#000;padding:4mm 3mm}
    .t80 .t-center{text-align:center}
    .t80 .t-bold{font-weight:700}
    .t80 .t-xl{font-size:18pt;font-weight:900;letter-spacing:-1px;text-align:center;display:block}
    .t80 .t-small{font-size:7pt}
    .t80 .t-div{border-top:1px dashed #555;margin:1.5mm 0}
    .t80 .t-solid{border-top:2px solid #000;margin:1.5mm 0}
    .t80 .t-row{display:flex;justify-content:space-between}
    .t80 .t-invert{background:#000;color:#fff;text-align:center;font-weight:700;font-size:9pt;padding:1.5mm 0;margin:1.5mm -3mm;letter-spacing:1px}
    .t80 .t-amount{border:2px solid #000;text-align:center;padding:2mm;margin:1.5mm 0}
    .t80 .t-disc{border:1px solid #555;text-align:center;padding:1.5mm;margin:1mm 0;font-size:8pt}
    .t80 .t-barref{font-family:'Courier New',monospace;font-size:7pt;letter-spacing:4px;word-break:break-all;text-align:center;margin:1mm 0;color:#333}
    .t80 .t-sig{border-bottom:1px solid #000;height:8mm;margin-bottom:1mm}
    @media print{
      body{padding:0;background:#fff}
      .no-print{display:none!important}
      @page{margin:2mm;size:80mm auto}
    }
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()">Imprimir ticket</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  ${ticketHTML}
  <script>setTimeout(()=>window.print(),500)<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=340,height=750');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Reportes ──────────────────────────────────────────────
async function generateReport(tipo) {
  const { data: cfg } = await _sb.from('configuracion').select('*').eq('id',1).single();
  const mun = cfg ? cfg.municipio : 'Municipio';
  const dir = cfg ? cfg.director  : '';
  const now = new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});

  let rows = [], headers = [], title = '';
  if (tipo==='infracciones') {
    const { data } = await _sb.from('infracciones').select('*').order('fecha',{ascending:false});
    rows = data||[]; headers = ['Folio','Fecha','Placa','Infractor','Tipo','Monto','Estado'];
    title = 'Reporte de Infracciones';
  } else {
    const { data } = await _sb.from('permisos').select('*').order('created_at',{ascending:false});
    rows = data||[]; headers = ['Núm.','Titular','Tipo','Placa','Ruta','Vencimiento','Estado'];
    title = 'Reporte de Permisos de Circulación';
  }

  const tableRows = tipo==='infracciones'
    ? rows.map(r=>`<tr><td>${r.folio||'—'}</td><td>${fmtDateShort(r.fecha)}</td><td>${r.placa}</td><td>${r.infractor}</td><td>${r.tipo}</td><td>${fmt(r.monto)}</td><td>${r.estado}</td></tr>`).join('')
    : rows.map(r=>`<tr><td>${r.num||'—'}</td><td>${r.titular}</td><td>${r.tipo}</td><td>${r.placa||'—'}</td><td>${r.ruta||'—'}</td><td>${fmtDateShort(r.vencimiento)}</td><td>${r.estado}</td></tr>`).join('');

  const win = window.open('','_blank','width=900,height=700');
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:2rem;color:#222}
    h2{font-size:1.3rem;margin-bottom:.3rem}
    .sub{color:#666;font-size:.85rem;margin-bottom:1.5rem}
    table{width:100%;border-collapse:collapse;font-size:.82rem}
    th{background:#1A7A82;color:#fff;padding:.5rem .75rem;text-align:left}
    td{padding:.45rem .75rem;border-bottom:1px solid #eee}
    tr:nth-child(even) td{background:#f9fafb}
    .footer{margin-top:2rem;font-size:.75rem;color:#999;border-top:1px solid #eee;padding-top:.75rem}
    @media print{button{display:none}}
  </style></head><body>
  <h2>${title} — ${mun}</h2>
  <div class="sub">Generado el ${now}${dir?' · Director: '+dir:''} · Total: ${rows.length} registros</div>
  <button onclick="window.print()" style="margin-bottom:1rem;padding:.4rem 1rem;background:#1A7A82;color:#fff;border:none;border-radius:6px;cursor:pointer">Imprimir / PDF</button>
  <table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${tableRows}</tbody></table>
  <div class="footer">Sistema de Tránsito y Movilidad Municipal — HCE Consultoría</div>
  </body></html>`);
  win.document.close();
}

// ── Impugnaciones ─────────────────────────────────────────
function impugnarInfraccion(id, estado) {
  $('imp-inf-id').value = id;
  $('imp-motivo').value = '';
  const title = $('modal-imp-title');
  if (title) title.textContent = estado === 'impugnada' ? 'Actualizar motivo de impugnación' : 'Registrar impugnación';
  const btn = $('imp-submit-btn');
  if (btn) btn.textContent = estado === 'impugnada' ? 'Actualizar' : 'Registrar impugnación';
  closeModal('modal-detail');
  openModal('modal-impugnacion');
}

async function submitImpugnacion() {
  const id = $('imp-inf-id').value;
  const motivo = ($('imp-motivo').value || '').trim();
  if (!motivo) { alert('Ingresa el motivo de la impugnación.'); return; }
  const btn = $('imp-submit-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  const { error } = await _sb.from('infracciones')
    .update({ estado: 'impugnada', impugnacion_motivo: motivo })
    .eq('id', id);
  btn.disabled = false; btn.textContent = 'Registrar impugnación';
  if (error) { alert('Error: ' + error.message); return; }
  closeModal('modal-impugnacion');
  logActivity('infraccion', `Impugnación registrada para infracción ID ${id}`);
  renderInfracciones();
  showToast('Impugnación registrada');
}

async function resolverImpugnacion(id, resolucion) {
  const label = resolucion === 'cancelada' ? 'cancelar (procede)' : 'reactivar como pendiente (no procede)';
  if (!confirm(`¿Confirmas ${label} esta infracción?`)) return;
  const { error } = await _sb.from('infracciones')
    .update({ estado: resolucion })
    .eq('id', id);
  if (error) { alert('Error: ' + error.message); return; }
  closeModal('modal-detail');
  logActivity('infraccion', `Impugnación resuelta (${resolucion}) para infracción ID ${id}`);
  renderInfracciones();
  renderDashboard();
  showToast(resolucion === 'cancelada' ? 'Infracción cancelada (impugnación procedente)' : 'Infracción reactivada como pendiente');
}

// ── Corte de caja ─────────────────────────────────────────
async function printCorteCaja() {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth()+1).padStart(2,'0');
  const d = String(today.getDate()).padStart(2,'0');
  const desde = `${y}-${m}-${d}T00:00:00`;
  const hasta  = `${y}-${m}-${d}T23:59:59`;

  const { data: pagosHoy } = await _sb.from('pagos')
    .select('monto,descuento,monto_pagado,created_at,oficial_id')
    .gte('created_at', desde).lte('created_at', hasta);

  const totalRecaudado = (pagosHoy||[]).reduce((s,p) => s + Number(p.monto_pagado||0), 0);
  const totalInfracciones = (pagosHoy||[]).length;
  const totalDescuentos = (pagosHoy||[]).reduce((s,p) => s + Number(p.descuento||0), 0);

  const cfg = _cachedConfig || {};
  const fechaStr = today.toLocaleDateString('es-MX', {weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const horaStr  = today.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'});

  const filas = (pagosHoy||[]).map((p,i) => {
    const hora = new Date(p.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
    return `<tr>
      <td>${i+1}</td>
      <td>${hora}</td>
      <td>${fmt(p.monto)}</td>
      <td>${p.descuento>0?'Sí (20%)':'No'}</td>
      <td style="font-weight:700">${fmt(p.monto_pagado)}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Corte de Caja — ${y}-${m}-${d}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,sans-serif;font-size:11pt;color:#111;padding:2cm}
    @page{size:letter portrait;margin:2cm}
    h1{font-size:16pt;margin-bottom:.2cm}h2{font-size:12pt;color:#555;margin-bottom:.6cm}
    .header{border-bottom:2px solid #1A7A82;padding-bottom:.5cm;margin-bottom:.7cm}
    .meta{font-size:9pt;color:#555;margin-bottom:.8cm}
    table{width:100%;border-collapse:collapse;margin-bottom:.8cm}
    th{background:#1A7A82;color:#fff;padding:.3cm .4cm;font-size:10pt;text-align:left}
    td{padding:.25cm .4cm;border-bottom:1px solid #eee;font-size:10pt}
    tr:nth-child(even) td{background:#F9FAFB}
    .totals{background:#F0FDF4;border:1px solid #A7F3D0;border-radius:6px;padding:.6cm;margin-bottom:.8cm}
    .total-row{display:flex;justify-content:space-between;margin-bottom:.2cm;font-size:11pt}
    .total-row.main{font-size:14pt;font-weight:700;color:#059669;border-top:1px solid #A7F3D0;padding-top:.3cm;margin-top:.2cm}
    .firma{margin-top:1.5cm;display:flex;justify-content:space-between}
    .firma-box{text-align:center;width:45%}
    .firma-line{border-top:1px solid #333;padding-top:.2cm;font-size:9pt;color:#555}
    .no-data{text-align:center;color:#888;padding:.8cm;font-style:italic}
  </style></head><body>
  <div class="header">
    <h1>Corte de Caja Diario</h1>
    <h2>${cfg.municipio||'Municipio'} — Dirección de Tránsito y Movilidad</h2>
  </div>
  <div class="meta">
    Fecha: <strong>${fechaStr}</strong> &nbsp;|&nbsp; Hora de corte: <strong>${horaStr}</strong><br>
    Elaboró: <strong>${_session?.name||'—'}</strong>
  </div>
  <div class="totals">
    <div class="total-row"><span>Pagos registrados:</span><span>${totalInfracciones}</span></div>
    <div class="total-row"><span>Descuentos aplicados (20%):</span><span>${fmt(totalDescuentos)}</span></div>
    <div class="total-row main"><span>Total recaudado:</span><span>${fmt(totalRecaudado)}</span></div>
  </div>
  <table>
    <thead><tr><th>#</th><th>Hora</th><th>Monto orig.</th><th>Descuento</th><th>Pagado</th></tr></thead>
    <tbody>${filas||`<tr><td colspan="5" class="no-data">Sin pagos registrados hoy</td></tr>`}</tbody>
  </table>
  <div class="firma">
    <div class="firma-box"><div class="firma-line">Oficial receptor</div></div>
    <div class="firma-box"><div class="firma-line">Supervisor / Vo.Bo.</div></div>
  </div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=850,height=700');
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ── Export Excel ──────────────────────────────────────────
async function exportExcel(tipo) {
  if (typeof XLSX === 'undefined') { alert('La librería Excel no está cargada. Recarga la página.'); return; }
  let rows = [], wsName = '', filename = '';

  if (tipo === 'infracciones') {
    const { data } = await _sb.from('infracciones').select('folio,fecha,placa,infractor,tipo,monto,ubicacion,estado,obs').order('fecha',{ascending:false});
    rows = (data||[]).map(r => ({
      'Folio': r.folio||'',
      'Fecha': r.fecha ? new Date(r.fecha).toLocaleDateString('es-MX') : '',
      'Placa': r.placa||'',
      'Infractor': r.infractor||'',
      'Tipo de infracción': r.tipo||'',
      'Monto (MXN)': Number(r.monto)||0,
      'Ubicación': r.ubicacion||'',
      'Estado': r.estado||'',
      'Observaciones': r.obs||''
    }));
    wsName = 'Infracciones'; filename = `infracciones_${new Date().toISOString().slice(0,10)}.xlsx`;
  } else {
    const { data } = await _sb.from('pagos').select('created_at,monto,descuento,monto_pagado,metodo,oficial_id').order('created_at',{ascending:false});
    rows = (data||[]).map(r => ({
      'Fecha y hora': r.created_at ? new Date(r.created_at).toLocaleString('es-MX') : '',
      'Monto original (MXN)': Number(r.monto)||0,
      'Descuento (MXN)': Number(r.descuento)||0,
      'Total pagado (MXN)': Number(r.monto_pagado)||0,
      'Método de pago': r.metodo||'Efectivo'
    }));
    wsName = 'Pagos'; filename = `pagos_${new Date().toISOString().slice(0,10)}.xlsx`;
  }

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, wsName);

  const colWidths = Object.keys(rows[0]||{}).map(k => ({ wch: Math.max(k.length, 14) }));
  ws['!cols'] = colWidths;

  XLSX.writeFile(wb, filename);
}

async function exportCSV(tipo) {
  let rows = [], headers = [], filename = '';
  if (tipo==='infracciones') {
    const { data } = await _sb.from('infracciones').select('*').order('fecha',{ascending:false});
    rows = data||[]; headers = ['folio','fecha','placa','infractor','tipo','monto','ubicacion','estado','obs'];
    filename = 'infracciones.csv';
  } else {
    const { data } = await _sb.from('permisos').select('*').order('created_at',{ascending:false});
    rows = data||[]; headers = ['num','titular','tipo','placa','ruta','inicio','vencimiento','estado'];
    filename = 'permisos.csv';
  }
  const BOM = '﻿';
  const csv = BOM + [headers.join(','), ...rows.map(r=>headers.map(h=>{
    const v = r[h]===null||r[h]===undefined ? '' : String(r[h]);
    return v.includes(',')||v.includes('"') ? `"${v.replace(/"/g,'""')}"` : v;
  }).join(','))].join('\r\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Modal helpers ─────────────────────────────────────────
function openModal(id) {
  const m = $(id); if(m){ m.style.display='flex'; requestAnimationFrame(()=>m.classList.add('open')); }
}
function closeModal(id) {
  const m = $(id); if(m){ m.classList.remove('open'); setTimeout(()=>m.style.display='none',200); }
}

// ── Pager ─────────────────────────────────────────────────
function goInfPage(p) { _infPage = p; renderInfracciones(); }
function goPerPage(p) { _perPage = p; renderPermisos(); }

function renderPager(containerId, page, pages, fnName) {
  const el = $(containerId); if(!el) return;
  if(pages<=1){ el.innerHTML=''; return; }
  let html = '';
  if(page>1) html+=`<button class="pager-btn" onclick="${fnName}(${page-1})">‹ Anterior</button>`;
  html+=`<span class="pager-info">Página ${page} de ${pages}</span>`;
  if(page<pages) html+=`<button class="pager-btn" onclick="${fnName}(${page+1})">Siguiente ›</button>`;
  el.innerHTML = html;
}

// ── Oficiales cache + helpers ─────────────────────────────
let _oficiales = null;

async function loadOficiales(selectIds) {
  if (!_oficiales) {
    const { data } = await _sb.from('usuarios').select('nombre').eq('activo', true).order('nombre');
    _oficiales = (data||[]).map(u => u.nombre);
  }
  selectIds.forEach(id => {
    const el = $(id);
    if (!el) return;
    const prev = el.dataset.preload || '';
    el.innerHTML = '<option value="">— Seleccionar oficial —</option>' +
      _oficiales.map(n => `<option value="${n}"${n===prev?' selected':''}>${n}</option>`).join('');
    delete el.dataset.preload;
  });
}

function calcEstadoPermiso() {
  const venc = ($('per-venc')||{}).value;
  if (!venc) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(venc + 'T00:00:00');
  const diff = Math.ceil((d - today) / (1000*60*60*24));
  const est = diff < 0 ? 'vencido' : diff <= 30 ? 'por-vencer' : 'vigente';
  if ($('per-est')) $('per-est').value = est;
  // Preview visual de vigencia
  const prev = $('per-vigencia-preview');
  if (prev) {
    if (diff < 0) {
      prev.innerHTML = `<span style="color:var(--red);font-weight:600">⚠ Vencido hace ${Math.abs(diff)} días — el estado se marcará como "Vencido"</span>`;
    } else if (diff === 0) {
      prev.innerHTML = `<span style="color:var(--amber);font-weight:600">⚠ Vence hoy — el estado se marcará como "Por vencer"</span>`;
    } else if (diff <= 30) {
      prev.innerHTML = `<span style="color:var(--amber);font-weight:600">⏳ Vence en ${diff} días — se marcará como "Por vencer"</span>`;
    } else {
      prev.innerHTML = `<span style="color:var(--green);font-weight:600">✓ Válido por ${diff} días — estado "Vigente"</span>`;
    }
  }
}

// ── WhatsApp automático ───────────────────────────────────
function notificarWhatsApp(data) {
  const tel = (data.telefono||'').replace(/\D/g,'');
  if (!tel) return;
  const fecha = data.fecha
    ? new Date(data.fecha).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'})
    : '—';
  const msg = `Estimado/a ${data.infractor}, se levantó una infracción de tránsito a su nombre.\n\n` +
    `📋 Folio: ${data.folio||'—'}\n` +
    `🚗 Placa: ${data.placa||'—'}\n` +
    `⚡ Infracción: ${data.tipo}\n` +
    `💰 Monto: $${Number(data.monto).toLocaleString('es-MX')} MXN\n` +
    `📍 Lugar: ${data.ubicacion||'—'}\n` +
    `📅 Fecha: ${fecha}\n\n` +
    `Consulte y pague en: ${window.location.origin}/consulta\n` +
    `Dirección de Tránsito y Movilidad Municipal.`;
  window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  const fmt10 = tel.replace(/(\d{3})(\d{3})(\d{4})/,'$1-$2-$3');
  showToast(`WhatsApp listo para enviar a ${fmt10||tel}`);
}

function _waFromBtn(btn) {
  const d = btn.dataset;
  notificarWhatsApp({ telefono:d.tel, infractor:d.nombre, folio:d.folio,
    placa:d.placa, tipo:d.tipo, monto:d.monto, ubicacion:d.ubicacion, fecha:d.fecha });
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg) {
  let t = document.querySelector('.toast');
  if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

// ── Sidebar / logout ──────────────────────────────────────
function initUI() {
  const userNameEl = document.querySelector('.user-name');
  const userRoleEl = document.querySelector('.user-role');
  const userInitEl = document.querySelector('.user-avatar');
  if(userNameEl) userNameEl.textContent = _session.name;
  if(userRoleEl) userRoleEl.textContent = _session.role;
  if(userInitEl) userInitEl.textContent = _session.initials;

  const dateEl = $('topbar-date');
  if(dateEl) dateEl.textContent = new Date().toLocaleDateString('es-MX',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});

  document.querySelectorAll('[data-view]').forEach(el=>{
    el.addEventListener('click', ()=>navigate(el.dataset.view));
  });
  document.querySelectorAll('.modal-overlay').forEach(m=>{
    m.addEventListener('click', e=>{ if(e.target===m) closeModal(m.id); });
  });

  // ── Permisos granulares por rol ──────────────────────────
  if (_rol === 'oficial') {
    // Ocultar sección Análisis y Sistema (excepto Reportes no aplica)
    document.querySelectorAll('.nav-item').forEach(btn => {
      const view = (btn.getAttribute('onclick')||'').match(/'(\w+)'/)?.[1];
      if (['mapa','rendimiento','configuracion','usuarios'].includes(view)) {
        btn.style.display = 'none';
      }
    });
    // Ocultar labels de sección si todos sus items están ocultos
    document.querySelectorAll('.sidebar-section').forEach(sec => {
      const visible = [...sec.querySelectorAll('.nav-item')].some(b=>b.style.display!=='none');
      if (!visible) sec.style.display = 'none';
    });
  } else if (_rol === 'supervisor') {
    document.querySelectorAll('.nav-item').forEach(btn => {
      const view = (btn.getAttribute('onclick')||'').match(/'(\w+)'/)?.[1];
      if (['usuarios'].includes(view)) btn.style.display = 'none';
    });
  }
  // Ocultar nav Usuarios del DOM si no es admin (evita acceso directo)
  if (_rol !== 'admin') {
    const navUsr = $('nav-usuarios'); if(navUsr) navUsr.style.display = 'none';
  }

  // ── Realtime: refrescar dashboard al recibir cambios ─────
  _sb.channel('rt-infracciones')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'infracciones' }, () => {
      const dash = $('view-dashboard');
      if (dash && dash.style.display !== 'none') renderDashboard();
      const badge = $('badge-pendientes');
      if (badge) _sb.from('infracciones').select('id',{count:'exact',head:true}).eq('estado','pendiente')
        .then(({count}) => { if(count!=null){badge.textContent=count;badge.style.display=count?'inline':'none';} });
    })
    .subscribe();

  // ── Búsqueda global ⌘K / Ctrl+K ─────────────────────────
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openGlobalSearch();
    }
    if (e.key === 'Escape') {
      closeModal('modal-search');
    }
  });
}

function logout() {
  localStorage.removeItem('tm_session');
  window.location.replace('/login');
}

// ══════════════════════════════════════════════════════════
// PADRÓN VEHICULAR
// ══════════════════════════════════════════════════════════
let _vehPage = 1, _vehSearch = '', _vehEstado = '';
const VEH_PAGE = 20;

async function renderVehiculos() {
  const tbody = $('vehiculos-table'); if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>`;

  // Fetch all vehiculos + all infractions for stats
  const [vehRes, infRes] = await Promise.all([
    _sb.from('vehiculos').select('*'),
    _sb.from('infracciones').select('placa,monto,estado')
  ]);
  if (vehRes.error) { tbody.innerHTML=`<tr><td colspan="8" style="color:red">${vehRes.error.message}</td></tr>`; return; }

  // Build infraction count map (for all plates)
  const allInfMap = {};
  (infRes.data||[]).forEach(i => {
    if (!allInfMap[i.placa]) allInfMap[i.placa] = {total:0, pendientes:0, montoPend:0};
    allInfMap[i.placa].total++;
    if (i.estado==='pendiente') { allInfMap[i.placa].pendientes++; allInfMap[i.placa].montoPend+=Number(i.monto); }
  });

  let all = vehRes.data||[];

  // Stats strip
  const strip = $('veh-stats-strip');
  if (strip) {
    const activos   = all.filter(r=>r.estado==='activo').length;
    const suspendidos = all.filter(r=>r.estado==='suspendido').length;
    const reincidentes = all.filter(r=>(allInfMap[r.placa]?.total||0)>1).length;
    const pill = (label, n, color) => `<div class="inf-stat-pill">
      <span style="color:${color}">●</span>
      <span><span class="isp-num">${n}</span> ${label}</span>
    </div>`;
    strip.innerHTML =
      pill('registrados', all.length, 'var(--subtle)') +
      pill('activos', activos, 'var(--green)') +
      (suspendidos ? pill('suspendidos', suspendidos, 'var(--red)') : '') +
      (reincidentes ? pill('reincidentes', reincidentes, 'var(--amber)') : '');
  }

  // Apply filters
  const _vehTipoF = ($('veh-tipo-filter')||{}).value||'';
  if (_vehSearch) all = all.filter(r =>
    r.placa?.toLowerCase().includes(_vehSearch.toLowerCase()) ||
    r.propietario?.toLowerCase().includes(_vehSearch.toLowerCase()) ||
    r.marca?.toLowerCase().includes(_vehSearch.toLowerCase()) ||
    r.modelo?.toLowerCase().includes(_vehSearch.toLowerCase())
  );
  if (_vehEstado) all = all.filter(r => r.estado === _vehEstado);
  if (_vehTipoF) all = all.filter(r => r.tipo === _vehTipoF);

  // Sort
  const sortVal = ($('veh-sort')||{}).value||'reciente';
  if (sortVal === 'placa') all.sort((a,b)=>(a.placa||'').localeCompare(b.placa||''));
  else if (sortVal === 'infracciones') all.sort((a,b)=>(allInfMap[b.placa]?.total||0)-(allInfMap[a.placa]?.total||0));
  else all.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  // Count label
  const countLabel = $('veh-count-label');
  if (countLabel) {
    const hasF = _vehSearch || _vehEstado || _vehTipoF;
    countLabel.textContent = hasF ? `${all.length} resultado${all.length!==1?'s':''} con filtros` : `${all.length} vehículo${all.length!==1?'s':''}`;
  }

  const pages = Math.max(1,Math.ceil(all.length/VEH_PAGE));
  if (_vehPage>pages) _vehPage=pages;
  const rows = all.slice((_vehPage-1)*VEH_PAGE, _vehPage*VEH_PAGE);

  const tipoLabel = { automovil:'Auto', camioneta:'Camioneta', motocicleta:'Moto', camion:'Camión', autobus:'Autobús', otro:'Otro' };

  tbody.innerHTML = rows.length ? rows.map(r => {
    const ic = allInfMap[r.placa]||{total:0,pendientes:0,montoPend:0};
    const infBadge = ic.pendientes>0
      ? `<div><span class="badge pendiente">${ic.pendientes} pend.</span><div style="font-size:.68rem;color:var(--amber);margin-top:.1rem">${fmt(ic.montoPend)}</div></div>`
      : ic.total>0
        ? `<span style="font-size:.75rem;color:var(--muted)">${ic.total} registrada${ic.total!==1?'s':''}</span>`
        : '<span style="color:var(--border)">—</span>';
    const esReincidente = ic.total > 1;
    return `<tr onclick="viewVehiculoDetalle('${r.id}')" style="cursor:pointer">
      <td>
        <span style="font-family:monospace;font-weight:800;font-size:.85rem">${r.placa}</span>
        ${esReincidente?`<span title="Reincidente" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:var(--amber-bg);color:var(--amber);font-size:.55rem;font-weight:800;margin-left:.25rem">R</span>`:''}
      </td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.propietario}</td>
      <td style="font-size:.78rem;color:var(--muted)">${tipoLabel[r.tipo]||'—'}</td>
      <td style="font-size:.78rem">${[r.marca,r.modelo,r.anio].filter(Boolean).join(' ')||'—'}</td>
      <td style="font-size:.78rem">${r.color||'—'}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td>${infBadge}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;text-align:right;padding-right:.6rem">
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editVehiculo('${r.id}')">Editar</button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:2rem">Sin vehículos registrados</td></tr>`;
  renderPager('vehiculos-pager', _vehPage, pages, 'goVehPage');
}

function limpiarFiltrosVeh() {
  if ($('veh-search')) $('veh-search').value = '';
  if ($('veh-tipo-filter')) $('veh-tipo-filter').value = '';
  if ($('veh-estado')) $('veh-estado').value = '';
  if ($('veh-sort')) $('veh-sort').value = 'reciente';
  _vehSearch = ''; _vehEstado = ''; _vehPage = 1;
  renderVehiculos();
}

function filterVehiculos() {
  _vehSearch = ($('veh-search')||{}).value||'';
  _vehEstado = ($('veh-estado')||{}).value||'';
  _vehPage=1; renderVehiculos();
}
function goVehPage(p) { _vehPage=p; renderVehiculos(); }

function openNewVehiculo() {
  $('veh-id').value=''; $('veh-placa').value=''; $('veh-propietario').value='';
  $('veh-marca').value=''; $('veh-modelo').value=''; $('veh-anio').value='';
  if ($('veh-color')) $('veh-color').value='';
  $('veh-serie').value=''; $('veh-motor').value=''; $('veh-obs').value='';
  $('veh-estado-field').value='activo';
  if ($('veh-tipo')) $('veh-tipo').value='';
  if ($('veh-telefono')) $('veh-telefono').value='';
  $('modal-veh-title').textContent='Registrar vehículo';
  $('veh-submit-btn').innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Guardar vehículo';
  $('veh-submit-btn').disabled=false;
  openModal('modal-vehiculo');
}

// Abre el formulario de nueva infracción pre-llenando la placa del vehículo
function nuevaInfraccionParaVehiculo(placa, propietario, color, vehiculo, telefono) {
  closeModal('modal-vehiculo-detalle');
  openNewInfraccion();
  setTimeout(() => {
    if ($('inf-placa'))     { $('inf-placa').value = placa; checkPlacaHistory(); }
    if ($('inf-infractor')) $('inf-infractor').value = propietario || '';
    if ($('inf-color'))     $('inf-color').value     = color || '';
    if ($('inf-vehiculo'))  $('inf-vehiculo').value  = vehiculo || '';
    if ($('inf-telefono'))  $('inf-telefono').value  = telefono || '';
    updateInfSummary();
  }, 100);
}

async function editVehiculo(id) {
  const { data, error } = await _sb.from('vehiculos').select('*').eq('id',id).single();
  if (error || !data) return;
  $('veh-id').value=data.id; $('veh-placa').value=data.placa; $('veh-propietario').value=data.propietario;
  $('veh-marca').value=data.marca||''; $('veh-modelo').value=data.modelo||''; $('veh-anio').value=data.anio||'';
  if ($('veh-color')) $('veh-color').value=data.color||'';
  $('veh-serie').value=data.num_serie||''; $('veh-motor').value=data.num_motor||''; $('veh-obs').value=data.obs||'';
  $('veh-estado-field').value=data.estado||'activo';
  if ($('veh-tipo')) $('veh-tipo').value=data.tipo||'';
  if ($('veh-telefono')) $('veh-telefono').value=data.telefono||'';
  $('modal-veh-title').textContent='Editar vehículo';
  $('veh-submit-btn').innerHTML='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Actualizar';
  $('veh-submit-btn').disabled=false;
  openModal('modal-vehiculo');
}

async function submitVehiculo(e) {
  e.preventDefault();
  const btn = $('veh-submit-btn'); btn.disabled=true; btn.textContent='Guardando…';
  const id = $('veh-id').value;
  const payload = {
    placa: $('veh-placa').value.trim().toUpperCase(),
    propietario: $('veh-propietario').value.trim(),
    marca: $('veh-marca').value.trim(), modelo: $('veh-modelo').value.trim(),
    anio: $('veh-anio').value ? parseInt($('veh-anio').value) : null,
    color: ($('veh-color')||{}).value||'',
    num_serie: $('veh-serie').value.trim(),
    num_motor: $('veh-motor').value.trim(), estado: $('veh-estado-field').value,
    obs: $('veh-obs').value.trim(),
    tipo: ($('veh-tipo')||{}).value||null,
    telefono: ($('veh-telefono')||{}).value?.trim()||null
  };
  const { error } = id
    ? await _sb.from('vehiculos').update(payload).eq('id',id)
    : await _sb.from('vehiculos').insert(payload);
  btn.disabled=false;
  if (error) { alert('Error: '+error.message); return; }
  closeModal('modal-vehiculo');
  renderVehiculos();
  showToast(id?'Vehículo actualizado':'Vehículo registrado');
}

async function viewVehiculoDetalle(id) {
  const { data: v, error } = await _sb.from('vehiculos').select('*').eq('id',id).single();
  if (error || !v) return;
  const { data: infs } = await _sb.from('infracciones')
    .select('id,folio,fecha,tipo,monto,estado,oficial').eq('placa',v.placa)
    .order('fecha',{ascending:false}).limit(30);
  $('veh-det-title').textContent = `Vehículo — ${v.placa}`;

  const infList = infs||[];
  const totalInf  = infList.length;
  const pendInf   = infList.filter(i=>i.estado==='pendiente');
  const montoPend = pendInf.reduce((a,i)=>a+Number(i.monto),0);
  const montoTotal= infList.reduce((a,i)=>a+Number(i.monto),0);
  const tipoLabel = { automovil:'Automóvil', camioneta:'Camioneta', motocicleta:'Motocicleta', camion:'Camión', autobus:'Autobús', otro:'Otro' };

  const historial = infList.length ? infList.map(i => `
    <tr onclick="viewDetail('infracciones','${i.id}')" style="cursor:pointer">
      <td class="mono" style="font-size:.73rem;font-weight:700">${i.folio||'—'}</td>
      <td style="font-size:.78rem;white-space:nowrap">${fmtDateShort(i.fecha)}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem">${i.tipo}</td>
      <td style="font-weight:700">${fmt(i.monto)}</td>
      <td>${estadoBadge(i.estado)}</td>
    </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem">Sin infracciones registradas</td></tr>';

  $('veh-det-body').innerHTML = `
    <!-- Header -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:1rem">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem">
        <div>
          <div style="font-family:monospace;font-size:1.3rem;font-weight:800;color:var(--ink)">${v.placa}</div>
          <div style="font-size:.9rem;font-weight:700;color:var(--ink);margin-top:.2rem">${v.propietario}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.15rem">${tipoLabel[v.tipo]||''}${v.tipo&&v.color?' · ':''}${v.color||''}</div>
        </div>
        <div style="text-align:right">
          ${estadoBadge(v.estado)}
          ${v.telefono?`<div style="margin-top:.5rem"><a href="https://wa.me/52${v.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener" style="color:#128C7E;font-size:.78rem;text-decoration:none;display:inline-flex;align-items:center;gap:.25rem"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>${v.telefono}</a></div>`:''}
        </div>
      </div>
    </div>

    <!-- Stats del vehículo -->
    ${totalInf>0?`<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-bottom:1rem">
      <div style="background:var(--stone);border:1px solid var(--border);border-radius:8px;padding:.6rem .8rem;text-align:center">
        <div style="font-size:1.2rem;font-weight:800;color:var(--ink)">${totalInf}</div>
        <div style="font-size:.7rem;color:var(--muted)">infracciones total</div>
      </div>
      <div style="background:${pendInf.length?'var(--amber-bg)':'var(--stone)'};border:1px solid ${pendInf.length?'#FDE68A':'var(--border)'};border-radius:8px;padding:.6rem .8rem;text-align:center">
        <div style="font-size:1.2rem;font-weight:800;color:${pendInf.length?'var(--amber)':'var(--ink)'}">${pendInf.length}</div>
        <div style="font-size:.7rem;color:var(--muted)">pendientes</div>
      </div>
      <div style="background:${montoPend>0?'var(--red-bg)':'var(--stone)'};border:1px solid ${montoPend>0?'#FECACA':'var(--border)'};border-radius:8px;padding:.6rem .8rem;text-align:center">
        <div style="font-size:1rem;font-weight:800;color:${montoPend>0?'var(--red)':'var(--ink)'}">${fmt(montoPend)}</div>
        <div style="font-size:.7rem;color:var(--muted)">pendiente por cobrar</div>
      </div>
    </div>`:''}

    <!-- Datos técnicos -->
    <div class="detail-grid" style="margin-bottom:1rem">
      <div class="detail-field"><label>Marca / Modelo</label><span>${[v.marca,v.modelo,v.anio].filter(Boolean).join(' ')||'—'}</span></div>
      <div class="detail-field"><label>Color</label><span>${v.color||'—'}</span></div>
      ${v.num_serie?`<div class="detail-field"><label>Núm. de serie</label><span style="font-family:monospace;font-size:.8rem">${v.num_serie}</span></div>`:''}
      ${v.num_motor?`<div class="detail-field"><label>Núm. de motor</label><span style="font-family:monospace;font-size:.8rem">${v.num_motor}</span></div>`:''}
      <div class="detail-field"><label>Registrado</label><span>${fmtDateShort(v.created_at)}</span></div>
      ${v.obs?`<div class="detail-field full"><label>Observaciones</label><span style="background:var(--stone);display:block;padding:.4rem .65rem;border-radius:6px;font-size:.82rem">${v.obs}</span></div>`:''}
    </div>

    <!-- Historial -->
    <div style="font-size:.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.6rem">
      Historial de infracciones ${totalInf>0?`(${totalInf})`:''}
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Folio</th><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead>
      <tbody>${historial}</tbody></table>
    </div>

    <!-- Acciones -->
    <div class="modal-actions" style="margin-top:1rem;flex-wrap:wrap;gap:.5rem">
      <button class="btn btn-primary btn-sm" onclick="nuevaInfraccionParaVehiculo('${v.placa}','${(v.propietario||'').replace(/'/g,"\\'")}','${v.color||''}','${[v.marca,v.modelo,v.anio].filter(Boolean).join(' ')}','${v.telefono||''}')" title="Registrar infracción para este vehículo">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nueva infracción
      </button>
      <button class="btn btn-ghost btn-sm" onclick="editVehiculo('${v.id}');closeModal('modal-vehiculo-detalle')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar
      </button>
      <button class="btn btn-ghost" onclick="closeModal('modal-vehiculo-detalle')">Cerrar</button>
    </div>`;
  openModal('modal-vehiculo-detalle');
}

// ══════════════════════════════════════════════════════════
// GRÚA / CORRALÓN
// ══════════════════════════════════════════════════════════
let _gruaPage = 1, _gruaSearch = '', _gruaEstado = '';
const GRUA_PAGE = 20;

async function renderGrua() {
  const tbody = $('grua-table'); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  let q = _sb.from('grua').select('*');
  if (_gruaSearch) q = q.or(`placa.ilike.%${_gruaSearch}%,propietario.ilike.%${_gruaSearch}%`);
  if (_gruaEstado) q = q.eq('estado', _gruaEstado);
  q = q.order('fecha', {ascending:false});
  const { data, error } = await q;
  if (error) { tbody.innerHTML=`<tr><td colspan="8" style="color:red">${error.message}</td></tr>`; return; }
  const all = data||[];

  // Stats
  const today = new Date().toISOString().slice(0,10);
  const mesInicio = new Date().toISOString().slice(0,7)+'-01';
  const retenidos = all.filter(r=>r.estado==='retenido').length;
  const libHoy = all.filter(r=>r.estado==='liberado'&&r.fecha_liberacion&&r.fecha_liberacion.slice(0,10)===today).length;
  const mesTotal = all.filter(r=>r.estado==='liberado'&&r.fecha_liberacion&&r.fecha_liberacion>=mesInicio).reduce((s,r)=>s+Number(r.costo_deposito||0),0);
  if($('grua-stat-retenidos')) $('grua-stat-retenidos').textContent=retenidos;
  if($('grua-stat-liberados')) $('grua-stat-liberados').textContent=libHoy;
  if($('grua-stat-monto')) $('grua-stat-monto').textContent=fmt(mesTotal);
  const badge=$('badge-grua'); if(badge){badge.textContent=retenidos;badge.style.display=retenidos?'inline':'none';}

  const pages = Math.max(1,Math.ceil(all.length/GRUA_PAGE));
  if(_gruaPage>pages)_gruaPage=pages;
  const rows = all.slice((_gruaPage-1)*GRUA_PAGE,_gruaPage*GRUA_PAGE);
  tbody.innerHTML = rows.length ? rows.map(r=>{
    const dias = Math.floor((Date.now()-new Date(r.fecha).getTime())/86400000);
    const costoAcum = Number(r.costo_deposito||0) + dias*Number(r.costo_diario||0);
    return `<tr>
      <td class="mono">${r.folio||'—'}</td>
      <td>${fmtDateShort(r.fecha)}</td>
      <td class="mono" style="font-weight:700">${r.placa}</td>
      <td>${r.propietario||'—'}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.motivo||'—'}</td>
      <td style="font-weight:700">${fmt(costoAcum)}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td style="white-space:nowrap">
        ${r.estado==='retenido'?`<button class="btn btn-primary btn-sm" style="background:var(--green);border-color:var(--green)" onclick="liberarVehiculo('${r.id}')">Liberar</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="editGrua('${r.id}')">Editar</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Sin registros en corralón</td></tr>';
  renderPager('grua-pager', _gruaPage, pages, 'goGruaPage');
}

function filterGrua() {
  _gruaSearch=($('grua-search')||{}).value||'';
  _gruaEstado=($('grua-estado')||{}).value||'';
  _gruaPage=1; renderGrua();
}
function goGruaPage(p) { _gruaPage=p; renderGrua(); }

function openNewGrua() {
  $('grua-id').value=''; $('grua-placa').value=''; $('grua-propietario').value='';
  $('grua-motivo').value=''; $('grua-ubicacion').value='';
  $('grua-costo').value=''; $('grua-diario').value=''; $('grua-obs').value='';
  const now = new Date(); now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  $('grua-fecha').value=now.toISOString().slice(0,16);
  $('modal-grua-title').textContent='Registrar retención';
  $('grua-submit-btn').textContent='Registrar';
  if ($('grua-oficial')) $('grua-oficial').dataset.preload = _session?.name||'';
  loadOficiales(['grua-oficial']);
  openModal('modal-grua');
}

async function editGrua(id) {
  const { data, error } = await _sb.from('grua').select('*').eq('id',id).single();
  if (error || !data) return;
  $('grua-id').value=data.id; $('grua-placa').value=data.placa; $('grua-propietario').value=data.propietario||'';
  $('grua-ubicacion').value=data.ubicacion||'';
  $('grua-costo').value=data.costo_deposito||''; $('grua-diario').value=data.costo_diario||''; $('grua-obs').value=data.obs||'';
  if(data.fecha){ const d=new Date(data.fecha); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); $('grua-fecha').value=d.toISOString().slice(0,16); }
  // motivo select
  if ($('grua-motivo')) $('grua-motivo').value = data.motivo||'';
  // oficial select
  if ($('grua-oficial')) $('grua-oficial').dataset.preload = data.oficial||'';
  await loadOficiales(['grua-oficial']);
  $('modal-grua-title').textContent='Editar registro';
  $('grua-submit-btn').textContent='Actualizar';
  openModal('modal-grua');
}

async function submitGrua(e) {
  e.preventDefault();
  const btn = $('grua-submit-btn'); btn.disabled=true; btn.textContent='Guardando…';
  const id = $('grua-id').value;
  const n = Date.now();
  const payload = {
    placa: $('grua-placa').value.trim().toUpperCase(),
    propietario: $('grua-propietario').value.trim(),
    motivo: $('grua-motivo').value.trim(),
    oficial: $('grua-oficial').value.trim(),
    ubicacion: $('grua-ubicacion').value.trim(),
    costo_deposito: parseFloat($('grua-costo').value)||0,
    costo_diario: parseFloat($('grua-diario').value)||0,
    obs: $('grua-obs').value.trim(),
    fecha: $('grua-fecha').value ? new Date($('grua-fecha').value).toISOString() : new Date().toISOString()
  };
  if (!id) {
    payload.estado = 'retenido';
  }
  const { error } = id
    ? await _sb.from('grua').update(payload).eq('id',id)
    : await _sb.from('grua').insert(payload);
  btn.disabled=false; btn.textContent='Registrar';
  if (error) { alert('Error: '+error.message); return; }
  closeModal('modal-grua');
  logActivity('info', `Grúa: vehículo ${payload.placa} ${id?'actualizado':'retenido'}`);
  renderGrua();
  showToast(id?'Registro actualizado':'Vehículo retenido en corralón');

  // WhatsApp automático al propietario (solo en retención nueva)
  if (!id) {
    const { data: vehWa } = await _sb.from('vehiculos').select('telefono,propietario').eq('placa', payload.placa).maybeSingle();
    if (vehWa?.telefono) {
      const tel = vehWa.telefono.replace(/\D/g,'');
      const msg = `Estimado/a ${vehWa.propietario||payload.propietario}, su vehículo de placas ${payload.placa} ha sido retirado al corralón municipal.\n\n` +
        `🚗 Placa: ${payload.placa}\n` +
        `📋 Motivo: ${payload.motivo}\n` +
        `📍 Lugar: ${payload.ubicacion||'—'}\n` +
        `💰 Costo de depósito: $${payload.costo_deposito} MXN + $${payload.costo_diario} por día\n\n` +
        `Acuda a Tránsito Municipal para recuperar su vehículo. Dirección de Tránsito y Movilidad.`;
      window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      showToast(`WhatsApp enviado al propietario de ${payload.placa}`);
    }
  }
}

async function liberarVehiculo(id) {
  if (!confirm('¿Confirmas la liberación del vehículo?')) return;
  const { error } = await _sb.from('grua').update({ estado:'liberado', fecha_liberacion: new Date().toISOString() }).eq('id',id);
  if (error) { alert('Error: '+error.message); return; }
  logActivity('info', `Grúa: vehículo liberado del corralón`);
  renderGrua();
  showToast('Vehículo liberado del corralón');
}

// ══════════════════════════════════════════════════════════
// MAPA DE INFRACCIONES (Leaflet.js)
// ══════════════════════════════════════════════════════════
let _leafletMap = null, _leafletMarkers = [];

async function renderMapa() {
  const estadoFil = ($('mapa-estado')||{}).value||'';
  const mesFil    = ($('mapa-mes')||{}).value||'';

  let q = _sb.from('infracciones').select('id,folio,placa,infractor,tipo,monto,estado,fecha,lat,lng').not('lat','is',null).not('lng','is',null);
  if (estadoFil) q = q.eq('estado', estadoFil);
  if (mesFil)    q = q.gte('fecha', mesFil+'-01').lte('fecha', mesFil+'-31');
  const { data } = await q;
  const infs = (data||[]).filter(r=>r.lat&&r.lng);

  if($('mapa-count')) $('mapa-count').textContent = `${infs.length} infracciones con ubicación`;

  // Init map once
  if (!_leafletMap) {
    _leafletMap = L.map('leaflet-map').setView([19.4326,-99.1332], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap contributors', maxZoom:19
    }).addTo(_leafletMap);
  }

  // Clear existing markers
  _leafletMarkers.forEach(m=>m.remove());
  _leafletMarkers=[];

  const colorMap = { pendiente:'#D97706', pagada:'#059669', impugnada:'#2563EB', vencida:'#DC2626', cancelada:'#6B7280' };

  infs.forEach(r => {
    const color = colorMap[r.estado]||'#6B7280';
    const icon = L.divIcon({
      className:'',
      html:`<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>`,
      iconSize:[14,14], iconAnchor:[7,7]
    });
    const marker = L.marker([r.lat, r.lng], {icon}).addTo(_leafletMap);
    marker.bindPopup(`<div style="font-family:'DM Sans',sans-serif;font-size:.8rem;min-width:180px">
      <div style="font-weight:700;margin-bottom:.3rem">${r.folio||'—'} · ${r.placa}</div>
      <div style="color:#374151">${r.tipo}</div>
      <div style="display:flex;justify-content:space-between;margin-top:.4rem">
        <span style="color:#6B7280;font-size:.75rem">${fmtDateShort(r.fecha)}</span>
        <strong>$${Number(r.monto).toLocaleString('es-MX')}</strong>
      </div>
    </div>`);
    _leafletMarkers.push(marker);
  });

  if (infs.length) {
    const bounds = L.latLngBounds(infs.map(r=>[r.lat,r.lng]));
    _leafletMap.fitBounds(bounds, {padding:[40,40]});
  }

  // Trigger resize in case map was hidden when initialized
  setTimeout(()=>_leafletMap.invalidateSize(),200);
}

// ══════════════════════════════════════════════════════════
// RENDIMIENTO POR OFICIAL
// ══════════════════════════════════════════════════════════
async function renderRendimiento() {
  const periodo = ($('rend-periodo')||{}).value||'mes';
  const now = new Date();
  let desde = null;
  if (periodo==='mes') {
    desde = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  } else if (periodo==='semana') {
    const d = new Date(now); d.setDate(d.getDate()-d.getDay());
    desde = d.toISOString().slice(0,10);
  }

  let q = _sb.from('infracciones').select('oficial,monto,estado,fecha');
  if (desde) q = q.gte('fecha', desde);
  const { data } = await q;
  const all = data||[];

  // Group by oficial
  const byOficial = {};
  all.forEach(r => {
    const k = r.oficial||'Sin asignar';
    if (!byOficial[k]) byOficial[k] = {nombre:k, total:0, monto:0, pagadas:0, pendientes:0};
    byOficial[k].total++;
    byOficial[k].monto += Number(r.monto||0);
    if (r.estado==='pagada') byOficial[k].pagadas++;
    if (r.estado==='pendiente') byOficial[k].pendientes++;
  });

  const sorted = Object.values(byOficial).sort((a,b)=>b.total-a.total);
  const maxTotal = sorted.length ? sorted[0].total : 1;
  const totalGlobal = sorted.reduce((s,o)=>s+o.total,0);
  const montoGlobal = sorted.reduce((s,o)=>s+o.monto,0);
  const topOficial = sorted[0]?.nombre||'—';

  // Stats cards
  const statsEl = $('rend-stats');
  if (statsEl) statsEl.innerHTML = `
    <div class="stat-card"><div class="stat-top"><div><div class="stat-num">${totalGlobal}</div><div class="stat-label">Infracciones levantadas</div></div><div class="stat-icon" style="background:#FEF2F2"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div></div></div>
    <div class="stat-card"><div class="stat-top"><div><div class="stat-num">${sorted.length}</div><div class="stat-label">Oficiales activos</div></div><div class="stat-icon" style="background:var(--ac-bg)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div></div></div>
    <div class="stat-card"><div class="stat-top"><div><div class="stat-num" style="font-size:1.1rem;letter-spacing:0">${topOficial.split(' ').slice(0,2).join(' ')}</div><div class="stat-label">Oficial más activo</div></div><div class="stat-icon" style="background:#ECFDF5"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg></div></div></div>
    <div class="stat-card"><div class="stat-top"><div><div class="stat-num">${fmt(montoGlobal)}</div><div class="stat-label">Monto total levantado</div></div><div class="stat-icon" style="background:var(--ac-bg)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div></div></div>`;

  const tbody = $('rendimiento-table');
  if (tbody) tbody.innerHTML = sorted.length ? sorted.map(o => {
    const tasa = o.total>0 ? Math.round(o.pagadas/o.total*100) : 0;
    const bar = `<div style="height:6px;border-radius:3px;background:var(--border);overflow:hidden;width:80px"><div style="height:100%;background:var(--ac);width:${Math.round(o.total/maxTotal*100)}%"></div></div>`;
    return `<tr>
      <td style="font-weight:600">${o.nombre}</td>
      <td style="font-weight:700;font-size:.95rem">${o.total}</td>
      <td>${fmt(o.monto)}</td>
      <td style="color:var(--green);font-weight:600">${o.pagadas}</td>
      <td style="color:var(--amber);font-weight:600">${o.pendientes}</td>
      <td><span class="badge ${tasa>=50?'pagada':'pendiente'}">${tasa}%</span></td>
      <td>${bar}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted)">Sin datos en el período</td></tr>';

  // Bar chart
  const chartEl = $('rend-chart');
  const labelsEl = $('rend-chart-labels');
  if (chartEl && sorted.length) {
    chartEl.innerHTML = sorted.slice(0,8).map(o => {
      const pct = Math.max(4, Math.round(o.total/maxTotal*100));
      return `<div class="bar-col"><div class="bar-fill" style="height:${pct}%;background:var(--ac)" title="${o.nombre}: ${o.total} infracciones"></div></div>`;
    }).join('');
    if (labelsEl) labelsEl.innerHTML = sorted.slice(0,8).map(o=>
      `<span style="font-size:.65rem;color:var(--muted);white-space:nowrap">${o.nombre.split(' ')[0]}</span>`).join('');
  }
}

// ══════════════════════════════════════════════════════════
// BÚSQUEDA GLOBAL ⌘K
// ══════════════════════════════════════════════════════════
let _searchTimeout = null;

function openGlobalSearch() {
  openModal('modal-search');
  const inp = $('global-search-input');
  if (inp) { inp.value = ''; inp.focus(); $('global-search-results').innerHTML = ''; }
}

async function runGlobalSearch() {
  clearTimeout(_searchTimeout);
  _searchTimeout = setTimeout(async () => {
    const q = ($('global-search-input').value || '').trim();
    const res = $('global-search-results');
    if (q.length < 2) { res.innerHTML = '<div style="padding:1.2rem;text-align:center;color:var(--muted);font-size:.82rem">Escribe al menos 2 caracteres…</div>'; return; }
    res.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Buscando…</div>';

    const [{ data: infs }, { data: vehs }, { data: pers }, { data: gru }] = await Promise.all([
      _sb.from('infracciones').select('id,folio,placa,infractor,tipo,estado,monto').or(`folio.ilike.%${q}%,placa.ilike.%${q}%,infractor.ilike.%${q}%`).limit(5),
      _sb.from('vehiculos').select('id,placa,propietario,marca,modelo,estado').or(`placa.ilike.%${q}%,propietario.ilike.%${q}%`).limit(4),
      _sb.from('permisos').select('id,num,titular,tipo,placa,estado').or(`num.ilike.%${q}%,titular.ilike.%${q}%,placa.ilike.%${q}%`).limit(4),
      _sb.from('grua').select('id,folio,placa,propietario,motivo,estado').or(`folio.ilike.%${q}%,placa.ilike.%${q}%,propietario.ilike.%${q}%`).limit(3),
    ]);

    const sections = [];

    if (infs?.length) sections.push(`
      <div class="gs-section-label">Infracciones</div>
      ${infs.map(r => `<div class="gs-item" onclick="closeModal('modal-search');navigate('infracciones');setTimeout(()=>viewDetail('infracciones','${r.id}'),300)">
        <div class="gs-item-icon" style="background:#FEF2F2"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div>
        <div class="gs-item-body"><div class="gs-item-title">${r.folio||'—'} · ${r.placa}</div><div class="gs-item-sub">${r.infractor} · ${r.tipo}</div></div>
        <div>${estadoBadge(r.estado)}</div>
      </div>`).join('')}`);

    if (vehs?.length) sections.push(`
      <div class="gs-section-label">Vehículos</div>
      ${vehs.map(r => `<div class="gs-item" onclick="closeModal('modal-search');navigate('vehiculos');setTimeout(()=>viewVehiculoDetalle('${r.id}'),300)">
        <div class="gs-item-icon" style="background:var(--ac-bg)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>
        <div class="gs-item-body"><div class="gs-item-title">${r.placa}</div><div class="gs-item-sub">${r.propietario} · ${[r.marca,r.modelo].filter(Boolean).join(' ')||'—'}</div></div>
        <div>${estadoBadge(r.estado)}</div>
      </div>`).join('')}`);

    if (pers?.length) sections.push(`
      <div class="gs-section-label">Permisos</div>
      ${pers.map(r => `<div class="gs-item" onclick="closeModal('modal-search');navigate('permisos');setTimeout(()=>viewDetail('permisos','${r.id}'),300)">
        <div class="gs-item-icon" style="background:#EFF6FF"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div class="gs-item-body"><div class="gs-item-title">${r.num||'—'} · ${r.placa||'—'}</div><div class="gs-item-sub">${r.titular} · ${r.tipo}</div></div>
        <div>${estadoBadge(r.estado)}</div>
      </div>`).join('')}`);

    if (gru?.length) sections.push(`
      <div class="gs-section-label">Grúa / Corralón</div>
      ${gru.map(r => `<div class="gs-item" onclick="closeModal('modal-search');navigate('grua')">
        <div class="gs-item-icon" style="background:#FFFBEB"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><path d="M18 8h2a2 2 0 012 2v6h-4M6 8H2v10h2"/></svg></div>
        <div class="gs-item-body"><div class="gs-item-title">${r.folio||'—'} · ${r.placa}</div><div class="gs-item-sub">${r.propietario||'—'} · ${r.motivo||'—'}</div></div>
        <div>${estadoBadge(r.estado)}</div>
      </div>`).join('')}`);

    res.innerHTML = sections.length
      ? sections.join('')
      : `<div style="padding:2rem;text-align:center;color:var(--muted);font-size:.85rem">Sin resultados para <strong>${q}</strong></div>`;
  }, 280);
}

// ══════════════════════════════════════════════════════════
// CALENDARIO DE INFRACCIONES
// ══════════════════════════════════════════════════════════
let _calYear = new Date().getFullYear(), _calMonth = new Date().getMonth();

async function renderCalendario() {
  const wrap = $('calendario-wrap'); if (!wrap) return;
  wrap.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Cargando…</div>';

  const y = _calYear, m = _calMonth;
  const desde = new Date(y, m, 1).toISOString().slice(0,10);
  const hasta  = new Date(y, m+1, 0).toISOString().slice(0,10);

  const { data } = await _sb.from('infracciones').select('fecha,estado,monto').gte('fecha', desde+'T00:00:00').lte('fecha', hasta+'T23:59:59');
  const byDay = {};
  (data||[]).forEach(r => {
    const day = r.fecha.slice(8,10);
    if (!byDay[day]) byDay[day] = { total:0, pendiente:0, pagada:0, monto:0 };
    byDay[day].total++;
    if (r.estado==='pendiente') byDay[day].pendiente++;
    if (r.estado==='pagada') byDay[day].pagada++;
    byDay[day].monto += Number(r.monto||0);
  });

  const monthName = new Date(y,m,1).toLocaleDateString('es-MX',{month:'long',year:'numeric'});
  const firstDay  = new Date(y,m,1).getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const todayStr = new Date().toISOString().slice(0,10);

  const dias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  let cells = '';
  for (let i=0;i<firstDay;i++) cells += '<div class="cal-cell cal-empty"></div>';
  for (let d=1; d<=daysInMonth; d++) {
    const key = String(d).padStart(2,'0');
    const info = byDay[key];
    const isToday = `${y}-${String(m+1).padStart(2,'0')}-${key}` === todayStr;
    const dot = info ? (info.pendiente ? 'var(--amber)' : 'var(--green)') : '';
    cells += `<div class="cal-cell${isToday?' cal-today':''}" onclick="showCalDay(${y},${m},${d})">
      <span class="cal-day-num">${d}</span>
      ${info ? `<span class="cal-count">${info.total}</span>
      <span class="cal-dot" style="background:${dot}"></span>` : ''}
    </div>`;
  }

  wrap.innerHTML = `
    <div class="cal-nav">
      <button class="btn btn-ghost btn-sm" onclick="_calMonth--;if(_calMonth<0){_calMonth=11;_calYear--;}renderCalendario()">‹</button>
      <span style="font-size:.95rem;font-weight:700;text-transform:capitalize">${monthName}</span>
      <button class="btn btn-ghost btn-sm" onclick="_calMonth++;if(_calMonth>11){_calMonth=0;_calYear++;}renderCalendario()">›</button>
      <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="_calYear=new Date().getFullYear();_calMonth=new Date().getMonth();renderCalendario()">Hoy</button>
    </div>
    <div class="cal-grid-header">${dias.map(d=>`<div class="cal-header-cell">${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div style="display:flex;gap:1.5rem;padding:.75rem 0;font-size:.75rem">
      <span style="display:flex;align-items:center;gap:.4rem"><span style="width:10px;height:10px;border-radius:50%;background:var(--amber);display:inline-block"></span>Con pendientes</span>
      <span style="display:flex;align-items:center;gap:.4rem"><span style="width:10px;height:10px;border-radius:50%;background:var(--green);display:inline-block"></span>Solo pagadas</span>
    </div>
    <div id="cal-day-detail"></div>`;
}

async function showCalDay(y, m, d) {
  const fecha = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const { data } = await _sb.from('infracciones').select('id,folio,placa,infractor,tipo,monto,estado').gte('fecha',fecha+'T00:00:00').lte('fecha',fecha+'T23:59:59').order('fecha');
  const det = $('cal-day-detail'); if(!det) return;
  if (!data?.length) { det.innerHTML = `<div style="padding:.75rem;color:var(--muted);font-size:.82rem">Sin infracciones el ${fecha}</div>`; return; }
  det.innerHTML = `<div class="card" style="margin-top:.75rem;padding:0">
    <div style="padding:.8rem 1rem;border-bottom:1px solid var(--border);font-size:.82rem;font-weight:700">${data.length} infracción${data.length>1?'es':''} — ${fecha}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Folio</th><th>Placa</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead>
      <tbody>${data.map(r=>`<tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer">
        <td class="mono">${r.folio||'—'}</td><td class="mono">${r.placa}</td>
        <td>${r.tipo}</td><td>${fmt(r.monto)}</td><td>${estadoBadge(r.estado)}</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

// ══════════════════════════════════════════════════════════
// ACCIDENTES VIALES
// ══════════════════════════════════════════════════════════
let _accPage=1, _accSearch='', _accTipo='', _accEstado='';
const ACC_PAGE=20;
let _accPartes=[];

async function renderAccidentes() {
  const tbody=$('accidentes-table'); if(!tbody) return;
  tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  let q=_sb.from('accidentes').select('*');
  if(_accSearch) q=q.or(`folio.ilike.%${_accSearch}%,ubicacion.ilike.%${_accSearch}%,oficial.ilike.%${_accSearch}%`);
  if(_accTipo)   q=q.eq('tipo',_accTipo);
  if(_accEstado) q=q.eq('estado',_accEstado);
  q=q.order('fecha',{ascending:false});
  const {data,error}=await q;
  if(error){tbody.innerHTML=`<tr><td colspan="8" style="color:red">${error.message}</td></tr>`;return;}
  const all=data||[];
  // stats
  const enProceso=all.filter(r=>r.estado==='en_proceso').length;
  const totalLes=all.reduce((s,r)=>s+Number(r.lesionados||0),0);
  const totalFall=all.reduce((s,r)=>s+Number(r.fallecidos||0),0);
  if($('acc-stat-total'))     $('acc-stat-total').textContent=all.length;
  if($('acc-stat-proceso'))   $('acc-stat-proceso').textContent=enProceso;
  if($('acc-stat-lesionados'))$('acc-stat-lesionados').textContent=totalLes;
  if($('acc-stat-fallecidos'))$('acc-stat-fallecidos').textContent=totalFall;
  const badge=$('badge-accidentes'); if(badge){badge.textContent=enProceso;badge.style.display=enProceso?'inline':'none';}
  const pages=Math.max(1,Math.ceil(all.length/ACC_PAGE));
  if(_accPage>pages)_accPage=pages;
  const rows=all.slice((_accPage-1)*ACC_PAGE,_accPage*ACC_PAGE);
  const tipoLabel={choque:'Choque',atropello:'Atropello',volcadura:'Volcadura',otro:'Otro'};
  const estadoAcc={en_proceso:'<span class="badge pendiente">En proceso</span>',cerrado:'<span class="badge pagada">Cerrado</span>',derivado:'<span class="badge impugnada">Derivado a MP</span>'};
  tbody.innerHTML=rows.length?rows.map(r=>`<tr onclick="viewAccidenteDetalle('${r.id}')">
    <td class="mono" style="font-weight:700">${r.folio||'—'}</td>
    <td>${fmtDateShort(r.fecha)}</td>
    <td>${tipoLabel[r.tipo]||r.tipo}</td>
    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.ubicacion||'—'}</td>
    <td style="text-align:center">${r.lesionados||0}${r.fallecidos>0?` / <span style="color:var(--red);font-weight:700">${r.fallecidos} fall.</span>`:''}</td>
    <td>${r.oficial||'—'}</td>
    <td>${estadoAcc[r.estado]||r.estado}</td>
    <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editAccidente('${r.id}')">Editar</button></td>
  </tr>`).join(''):'<tr><td colspan="8" style="text-align:center;color:var(--muted)">Sin accidentes registrados</td></tr>';
  renderPager('accidentes-pager',_accPage,pages,'goAccPage');
}
function filterAccidentes(){
  _accSearch=($('acc-search')||{}).value||'';
  _accTipo=($('acc-tipo-fil')||{}).value||'';
  _accEstado=($('acc-estado-fil')||{}).value||'';
  _accPage=1;renderAccidentes();
}
function goAccPage(p){_accPage=p;renderAccidentes();}

function addParte(data){
  _accPartes.push(data||{nombre:'',placa:'',licencia:'',aseguradora:''});
  renderPartesForm();
}
function removeParte(i){_accPartes.splice(i,1);renderPartesForm();}
function renderPartesForm(){
  const el=$('acc-partes-list'); if(!el) return;
  el.innerHTML=_accPartes.map((p,i)=>`
    <div style="border:1px solid var(--border);border-radius:8px;padding:.75rem;margin-bottom:.5rem;background:var(--stone)">
      <div style="display:flex;justify-content:space-between;margin-bottom:.5rem;font-size:.75rem;font-weight:700;color:var(--muted)">Parte ${i+1} <button type="button" class="btn btn-ghost btn-sm" style="padding:.1rem .4rem;font-size:.7rem" onclick="removeParte(${i})">✕</button></div>
      <div class="form-row">
        <input class="form-input" placeholder="Nombre" value="${p.nombre}" oninput="_accPartes[${i}].nombre=this.value" style="font-size:.8rem"/>
        <input class="form-input" placeholder="Placa" value="${p.placa}" oninput="_accPartes[${i}].placa=this.value.toUpperCase()" style="font-size:.8rem"/>
      </div>
      <div class="form-row" style="margin-top:.4rem">
        <input class="form-input" placeholder="Núm. licencia" value="${p.licencia}" oninput="_accPartes[${i}].licencia=this.value" style="font-size:.8rem"/>
        <input class="form-input" placeholder="Aseguradora" value="${p.aseguradora}" oninput="_accPartes[${i}].aseguradora=this.value" style="font-size:.8rem"/>
      </div>
    </div>`).join('');
}

function openNewAccidente(){
  $('acc-id').value='';_accPartes=[];renderPartesForm();
  $('acc-tipo').value='choque';$('acc-ubicacion').value='';$('acc-descripcion').value='';
  $('acc-lesionados').value=0;$('acc-fallecidos').value=0;$('acc-obs').value='';
  $('acc-estado').value='en_proceso';
  if($('acc-fotos-preview'))$('acc-fotos-preview').innerHTML='';
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  $('acc-fecha').value=now.toISOString().slice(0,16);
  $('modal-acc-title').textContent='Registrar accidente vial';
  if ($('acc-oficial')) $('acc-oficial').dataset.preload = _session?.name||'';
  loadOficiales(['acc-oficial']);
  openModal('modal-accidente');
}

async function editAccidente(id){
  const{data,error}=await _sb.from('accidentes').select('*').eq('id',id).single();
  if(error||!data)return;
  $('acc-id').value=data.id;
  _accPartes=[];try{_accPartes=JSON.parse(data.partes||'[]');}catch(e){}
  renderPartesForm();
  $('acc-tipo').value=data.tipo||'choque';$('acc-ubicacion').value=data.ubicacion||'';
  $('acc-descripcion').value=data.descripcion||'';$('acc-lesionados').value=data.lesionados||0;
  $('acc-fallecidos').value=data.fallecidos||0;$('acc-obs').value=data.obs||'';
  $('acc-estado').value=data.estado||'en_proceso';
  if(data.fecha){const d=new Date(data.fecha);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('acc-fecha').value=d.toISOString().slice(0,16);}
  $('modal-acc-title').textContent='Editar accidente vial';
  if ($('acc-oficial')) $('acc-oficial').dataset.preload = data.oficial||'';
  await loadOficiales(['acc-oficial']);
  openModal('modal-accidente');
}

async function submitAccidente(e){
  e.preventDefault();
  const btn=$('acc-submit-btn');btn.disabled=true;btn.textContent='Guardando…';
  const id=$('acc-id').value;
  const fileInput=$('acc-fotos');
  const fotosArr=[];
  if(fileInput&&fileInput.files.length>0){
    for(let i=0;i<Math.min(fileInput.files.length,3);i++) fotosArr.push(await compressPhoto(fileInput.files[i]));
  }
  const payload={
    tipo:$('acc-tipo').value,
    fecha:$('acc-fecha').value?new Date($('acc-fecha').value).toISOString():new Date().toISOString(),
    ubicacion:$('acc-ubicacion').value.trim(),
    descripcion:$('acc-descripcion').value.trim(),
    lesionados:parseInt($('acc-lesionados').value)||0,
    fallecidos:parseInt($('acc-fallecidos').value)||0,
    oficial:$('acc-oficial').value.trim(),
    estado:$('acc-estado').value,
    obs:$('acc-obs').value.trim(),
    partes:JSON.stringify(_accPartes)
  };
  if(fotosArr.length) payload.fotos=JSON.stringify(fotosArr);
  const{error}=id?await _sb.from('accidentes').update(payload).eq('id',id):await _sb.from('accidentes').insert(payload);
  btn.disabled=false;btn.textContent='Registrar accidente';
  if(error){alert('Error: '+error.message);return;}
  closeModal('modal-accidente');
  logActivity('info',`Accidente ${id?'actualizado':'registrado'} en ${payload.ubicacion}`);
  renderAccidentes();renderAlertas();
  showToast(id?'Accidente actualizado':'Accidente registrado');
}

async function viewAccidenteDetalle(id){
  const{data:r,error}=await _sb.from('accidentes').select('*').eq('id',id).single();
  if(error||!r)return;
  let partes=[];try{partes=JSON.parse(r.partes||'[]');}catch(e){}
  let fotos=[];try{fotos=JSON.parse(r.fotos||'[]');}catch(e){}
  const tipoLabel={choque:'Choque',atropello:'Atropello',volcadura:'Volcadura',otro:'Otro'};
  const estadoAcc={en_proceso:'<span class="badge pendiente">En proceso</span>',cerrado:'<span class="badge pagada">Cerrado</span>',derivado:'<span class="badge impugnada">Derivado a MP</span>'};
  const dm=$('modal-detail');if(!dm)return;
  dm.querySelector('.modal-title').textContent=`Accidente ${r.folio||'—'}`;
  dm.querySelector('.detail-body').innerHTML=`
    <div class="detail-grid">
      <div class="detail-field"><label>Folio</label><span style="font-family:monospace;font-weight:700">${r.folio||'—'}</span></div>
      <div class="detail-field"><label>Fecha</label><span>${fmtDateShort(r.fecha)}</span></div>
      <div class="detail-field"><label>Tipo</label><span>${tipoLabel[r.tipo]||r.tipo}</span></div>
      <div class="detail-field"><label>Estado</label><span>${estadoAcc[r.estado]||r.estado}</span></div>
      <div class="detail-field full"><label>Ubicación</label><span>${r.ubicacion||'—'}${r.lat?` <a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" style="color:var(--ac);font-size:.75rem;margin-left:.4rem">Ver mapa ↗</a>`:''}</span></div>
      <div class="detail-field"><label>Lesionados</label><span style="font-weight:700;color:var(--amber)">${r.lesionados||0}</span></div>
      <div class="detail-field"><label>Fallecidos</label><span style="font-weight:700;color:var(--red)">${r.fallecidos||0}</span></div>
      <div class="detail-field"><label>Oficial</label><span>${r.oficial||'—'}</span></div>
      ${r.descripcion?`<div class="detail-field full"><label>Descripción</label><span>${r.descripcion}</span></div>`:''}
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span>${r.obs}</span></div>`:''}
      ${partes.length?`<div class="detail-field full"><label>Partes involucradas</label>
        <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:.4rem">
          ${partes.map((p,i)=>`<div style="background:var(--stone);border-radius:6px;padding:.5rem .75rem;font-size:.8rem"><strong>Parte ${i+1}:</strong> ${p.nombre||'—'} · Placa: ${p.placa||'—'} · Lic: ${p.licencia||'—'} · Aseg: ${p.aseguradora||'—'}</div>`).join('')}
        </div></div>`:''}
      ${fotos.length?`<div class="detail-field full"><label>Fotos de evidencia</label><div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.3rem">${fotos.map(f=>`<img src="${f}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);cursor:pointer" onclick="window.open('${f}','_blank')"/>`).join('')}</div></div>`:''}
    </div>
    <div class="detail-actions">
      <button class="btn btn-ghost btn-sm" onclick="printAccidente('${r.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir parte
      </button>
      <button class="btn btn-secondary btn-sm" onclick="editAccidente('${r.id}');closeModal('modal-detail')">Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-detail')">Cerrar</button>
    </div>`;
  openModal('modal-detail');
}

// ══════════════════════════════════════════════════════════
// BITÁCORA DE TURNO
// ══════════════════════════════════════════════════════════
function checkTurnoActivo() {
  const turno = JSON.parse(localStorage.getItem('tm_turno')||'null');
  const btn=$('turno-btn'), dot=$('turno-dot'), label=$('turno-label');
  if(!btn)return;
  if(turno && turno.inicio) {
    const mins=Math.floor((Date.now()-new Date(turno.inicio).getTime())/60000);
    const hrs=Math.floor(mins/60), m=mins%60;
    btn.className='turno-chip activo';
    dot.className='turno-dot on';
    label.textContent=`Turno activo ${hrs>0?hrs+'h ':''}${m}min`;
  } else {
    btn.className='turno-chip inactivo';
    dot.className='turno-dot off';
    label.textContent='Iniciar turno';
  }
}

async function toggleTurno() {
  const turno = JSON.parse(localStorage.getItem('tm_turno')||'null');
  if (turno && turno.inicio) {
    await cerrarTurno(turno);
  } else {
    iniciarTurno();
  }
}

function iniciarTurno() {
  const turno = { inicio: new Date().toISOString(), oficial: _session?.name||'' };
  localStorage.setItem('tm_turno', JSON.stringify(turno));
  _sb.from('turnos').insert({ oficial_nombre: turno.oficial, inicio: turno.inicio }).then(()=>{});
  checkTurnoActivo();
  showToast('Turno iniciado — ' + new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}));
}

async function cerrarTurno(turno) {
  const fin = new Date().toISOString();
  const [ {data:infs}, {data:gru} ] = await Promise.all([
    _sb.from('infracciones').select('id,monto,estado').eq('oficial',turno.oficial).gte('fecha',turno.inicio),
    _sb.from('grua').select('id').eq('oficial',turno.oficial).gte('fecha',turno.inicio)
  ]);
  const recaudacion = (infs||[]).filter(r=>r.estado==='pagada').reduce((s,r)=>s+Number(r.monto||0),0);
  const infCount = (infs||[]).length;
  const gruaCount = (gru||[]).length;
  const durMin = Math.floor((new Date(fin)-new Date(turno.inicio))/60000);
  const durHrs = Math.floor(durMin/60), durM=durMin%60;

  // Actualizar turno en BD
  await _sb.from('turnos').update({ fin, infracciones_count:infCount, grua_count:gruaCount, recaudacion, estado:'cerrado' })
    .eq('oficial_nombre', turno.oficial).eq('estado','activo');

  localStorage.removeItem('tm_turno');
  checkTurnoActivo();

  // Mostrar resumen
  const body = $('turno-resumen-body');
  if (body) {
    body.innerHTML = `
      <div style="padding:.5rem 0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1rem">
          <div class="stat-card" style="text-align:center;padding:.9rem">
            <div style="font-size:1.6rem;font-weight:800;color:var(--ink)">${infCount}</div>
            <div style="font-size:.72rem;color:var(--muted)">Infracciones levantadas</div>
          </div>
          <div class="stat-card" style="text-align:center;padding:.9rem">
            <div style="font-size:1.6rem;font-weight:800;color:var(--ink)">${gruaCount}</div>
            <div style="font-size:.72rem;color:var(--muted)">Retenciones de grúa</div>
          </div>
          <div class="stat-card" style="text-align:center;padding:.9rem">
            <div style="font-size:1.3rem;font-weight:800;color:var(--green)">${fmt(recaudacion)}</div>
            <div style="font-size:.72rem;color:var(--muted)">Recaudación directa</div>
          </div>
          <div class="stat-card" style="text-align:center;padding:.9rem">
            <div style="font-size:1.6rem;font-weight:800;color:var(--ac)">${durHrs}h ${durM}m</div>
            <div style="font-size:.72rem;color:var(--muted)">Duración del turno</div>
          </div>
        </div>
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:.4rem">Oficial: <strong>${turno.oficial}</strong></div>
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:1rem">Periodo: ${new Date(turno.inicio).toLocaleString('es-MX')} → ${new Date(fin).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="closeModal('modal-turno-resumen')">Cerrar</button>
          <button class="btn btn-primary" onclick="printTurnoResumen(${JSON.stringify({oficial:turno.oficial,inicio:turno.inicio,fin,infCount,gruaCount,recaudacion,durHrs,durM}).replace(/"/g,'&quot;')})">Imprimir resumen</button>
        </div>
      </div>`;
  }
  openModal('modal-turno-resumen');
}

function printTurnoResumen(d) {
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Resumen de Turno</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11pt;padding:2cm}@page{size:letter portrait;margin:2cm}
  h1{font-size:16pt;margin-bottom:.3cm}h2{font-size:11pt;color:#555;margin-bottom:.8cm}.grid{display:grid;grid-template-columns:1fr 1fr;gap:.5cm;margin-bottom:1cm}
  .box{border:1px solid #ddd;border-radius:6px;padding:.5cm;text-align:center}.num{font-size:22pt;font-weight:800;color:#1A7A82}.lbl{font-size:9pt;color:#888;margin-top:.1cm}
  .meta{font-size:9pt;color:#555;margin-bottom:.3cm}.firma{margin-top:2cm;display:flex;justify-content:space-between}.firma-line{border-top:1px solid #333;padding-top:.2cm;font-size:9pt;color:#555;text-align:center;width:44%}
  </style></head><body>
  <h1>Resumen de Turno</h1><h2>Dirección de Tránsito y Movilidad Municipal</h2>
  <div class="meta">Oficial: <strong>${d.oficial}</strong></div>
  <div class="meta">Inicio: ${new Date(d.inicio).toLocaleString('es-MX')} &nbsp;|&nbsp; Fin: ${new Date(d.fin).toLocaleString('es-MX')}</div>
  <div class="meta" style="margin-bottom:.8cm">Duración: <strong>${d.durHrs}h ${d.durM}m</strong></div>
  <div class="grid">
    <div class="box"><div class="num">${d.infCount}</div><div class="lbl">Infracciones</div></div>
    <div class="box"><div class="num">${d.gruaCount}</div><div class="lbl">Retenciones grúa</div></div>
    <div class="box" style="grid-column:1/-1"><div class="num" style="color:#059669">$${Number(d.recaudacion).toLocaleString('es-MX')}</div><div class="lbl">Recaudación directa</div></div>
  </div>
  <div class="firma"><div class="firma-line">Firma del oficial</div><div class="firma-line">Vo.Bo. Supervisor</div></div>
  </body></html>`;
  const w=window.open('','_blank','width=850,height=650');w.document.write(html);w.document.close();w.onload=()=>{w.focus();w.print();};
}

// ══════════════════════════════════════════════════════════
// NOTIFICACIONES PUSH (Notifications API + Realtime)
// ══════════════════════════════════════════════════════════
async function setupPushNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission !== 'granted') return;

  // Escuchar nuevas impugnaciones en tiempo real
  _sb.channel('rt-impugnaciones')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'infracciones',
      filter: 'estado=eq.impugnada'
    }, payload => {
      if (_rol === 'admin' || _rol === 'supervisor') {
        const r = payload.new;
        new Notification('Tránsito Municipal — Impugnación', {
          body: `Infracción ${r.folio||r.id} (${r.placa}) fue impugnada. Requiere resolución.`,
          icon: '/manifest.json',
          tag: `imp-${r.id}`
        });
      }
    })
    .subscribe();

  // Escuchar nuevos accidentes
  _sb.channel('rt-accidentes')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'accidentes'
    }, payload => {
      if (_rol === 'admin' || _rol === 'supervisor') {
        const r = payload.new;
        new Notification('Tránsito Municipal — Accidente', {
          body: `Nuevo accidente registrado en ${r.ubicacion||'ubicación desconocida'}.`,
          tag: `acc-${r.id}`
        });
      }
    })
    .subscribe();
}

// ══════════════════════════════════════════════════════════
// CREDENCIAL DIGITAL DEL OFICIAL
// ══════════════════════════════════════════════════════════
async function printCredencial(userId) {
  const {data,error}=await _sb.from('usuarios').select('*').eq('id',userId).single();
  if(error||!data){alert('No se pudo cargar el usuario.');return;}
  const rolLabel={admin:'Director de Tránsito',supervisor:'Supervisor de Tránsito',oficial:'Oficial de Tránsito'};
  const iniciales=(data.iniciales||data.nombre.split(' ').map(n=>n[0]).join('').slice(0,2)).toUpperCase();
  const qrVal=`OFICIAL:${data.usuario}|ID:${data.id}|ROL:${data.rol}`;
  let qrDataUrl='';
  try{qrDataUrl=new QRious({value:qrVal,size:180,padding:8,backgroundAlpha:1}).toDataURL();}catch(e){}

  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Credencial — ${data.nombre}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}@page{size:85.6mm 53.98mm;margin:0}
  body{width:85.6mm;height:53.98mm;font-family:Arial,sans-serif;background:#fff;overflow:hidden}
  .card{width:100%;height:100%;display:flex;flex-direction:column;border:1.5px solid #1A7A82}
  .card-top{background:#1A7A82;padding:3mm 4mm;display:flex;align-items:center;gap:3mm;flex:0}
  .avatar{width:12mm;height:12mm;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:14pt;font-weight:800;color:#fff;flex-shrink:0}
  .card-info{color:#fff}.card-name{font-size:9pt;font-weight:700;line-height:1.2}.card-role{font-size:7pt;opacity:.75}
  .card-logo{margin-left:auto;font-size:10pt;font-weight:800;color:rgba(255,255,255,.7);letter-spacing:.05em}
  .card-body{padding:3mm 4mm;display:flex;gap:3mm;flex:1;align-items:center}
  .card-fields{flex:1;display:flex;flex-direction:column;gap:1.5mm}
  .field{font-size:7pt}.field-label{color:#888;font-size:6pt;text-transform:uppercase;letter-spacing:.06em}.field-val{color:#111;font-weight:600}
  .card-qr img{width:18mm;height:18mm}
  .card-footer{background:#f5f5f5;padding:1.5mm 4mm;font-size:6pt;color:#888;text-align:center;border-top:1px solid #eee}
  </style></head><body>
  <div class="card">
    <div class="card-top">
      <div class="avatar">${iniciales}</div>
      <div class="card-info">
        <div class="card-name">${data.nombre}</div>
        <div class="card-role">${rolLabel[data.rol]||data.rol}</div>
      </div>
      <div class="card-logo">HCE</div>
    </div>
    <div class="card-body">
      <div class="card-fields">
        <div class="field"><div class="field-label">Usuario</div><div class="field-val">${data.usuario}</div></div>
        <div class="field"><div class="field-label">Rol</div><div class="field-val">${rolLabel[data.rol]||data.rol}</div></div>
        <div class="field"><div class="field-label">Estado</div><div class="field-val" style="color:${data.activo?'#059669':'#DC2626'}">${data.activo?'Activo':'Inactivo'}</div></div>
      </div>
      ${qrDataUrl?`<div class="card-qr"><img src="${qrDataUrl}"/></div>`:''}
    </div>
    <div class="card-footer">Tránsito y Movilidad Municipal · HCE Consultoría · Credencial oficial de agente</div>
  </div>
  </body></html>`;
  const w=window.open('','_blank','width=420,height=320');w.document.write(html);w.document.close();w.onload=()=>{w.focus();w.print();};
}

// ── initData (seed configuracion if empty) ────────────────
async function initData() {
  const { count: cfgCount } = await _sb.from('configuracion').select('*',{count:'exact',head:true});
  if (!cfgCount) {
    await _sb.from('configuracion').insert({ ...SEED_CONFIG, id:1 });
  }
  const { count: infCount } = await _sb.from('infracciones').select('*',{count:'exact',head:true});
  if (!infCount) {
    await _sb.from('infracciones').insert(SEED_INFRACCIONES);
    await _sb.from('permisos').insert(SEED_PERMISOS);
    await _sb.from('actividad').insert(SEED_ACTIVIDAD);
  }
  const { count: vehCount } = await _sb.from('vehiculos').select('*',{count:'exact',head:true});
  if (!vehCount) {
    await _sb.from('vehiculos').insert(SEED_VEHICULOS);
  }
  const { count: gruaCount } = await _sb.from('grua').select('*',{count:'exact',head:true});
  if (!gruaCount) {
    await _sb.from('grua').insert(SEED_GRUA);
  }
  const { count: accCount } = await _sb.from('accidentes').select('*',{count:'exact',head:true});
  if (!accCount) {
    await _sb.from('accidentes').insert(SEED_ACCIDENTES);
  }
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  }
  initUI();
  checkTurnoActivo();
  setInterval(checkTurnoActivo, 60000);
  try { await initData(); } catch(err) { console.warn('initData:', err.message); }
  try { await checkAndUpdateVencidos(); } catch(err) { console.warn('vencidos:', err.message); }
  setupPushNotifications().catch(()=>{});
  navigate('dashboard');
});
