// Smoke test de punta a punta: abre la app real en Chromium (Playwright) con
// un Supabase simulado y recorre login, todos los módulos del panel y el
// portal ciudadano. Falla ante cualquier error de JavaScript en la página.
// No sustituye probar contra la base real, pero detecta en CI cualquier
// ReferenceError/TypeError que dejaría un módulo en blanco.
//
// Uso:  npm test
// Sin acceso a los CDN (jsdelivr/unpkg), apunta LIBS_DIR a un node_modules con
// @supabase/supabase-js, xlsx, qrious, jsqr y leaflet para servirlos localmente.
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const PORT = 8765;
const BASE = `http://localhost:${PORT}`;
const VIEWS = ['dashboard','infracciones','permisos','reportes','configuracion','caja','oficiales','bitacora','usuarios','vehiculos','grua','accidentes','mapa','rendimiento','calendario'];

// ── Servidor estático con cleanUrls (igual que vercel.json) ──
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json', '.css':'text/css' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  let f = path.join(ROOT, p);
  if (!path.extname(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// ── Datos simulados: test/fixtures.js + SEED_CONFIG de app.js ──
const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const seeds = { ...require('./fixtures') }; const seedCtx = vm.createContext({ Date });
const cfg = src.match(/const SEED_CONFIG = (\{[\s\S]*?\n\});/);
if (cfg) seeds.SEED_CONFIG = vm.runInContext('(' + cfg[1] + ')', seedCtx);
let nextId = 1;
const withIds = a => (Array.isArray(a) ? a : [a]).map(r => { const folio = 'INF-2026-' + String(nextId).padStart(4, '0'); return { id: nextId++, folio, boleta: folio, created_at: new Date().toISOString(), ...r }; });
// Fila con HTML malicioso: si algún módulo no escapa los textos, window.__xss se define.
const XSS = '<img src=x onerror="window.__xss=1">';
const ADMIN = { id: 1, usuario: 'admin', nombre: 'Admin Prueba', rol: 'admin', activo: true, iniciales: 'AP', auth_id: '00000000-0000-0000-0000-000000000001' };
// Sesión simulada de Supabase Auth (el JWT no se verifica en el navegador)
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const EXP = Math.floor(Date.now() / 1000) + 3600;
const SESSION = {
  access_token: `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ADMIN.auth_id, role: 'authenticated', exp: EXP })}.firma`,
  token_type: 'bearer', expires_in: 3600, expires_at: EXP, refresh_token: 'refresh',
  user: { id: ADMIN.auth_id, aud: 'authenticated', role: 'authenticated', email: 'admin@transito.local' }
};
const SB_KEY = 'sb-' + fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1] + '-auth-token';
const TOKEN = '11111111-2222-4333-8444-555555555555';
const storageUploads = [];
const rpcCalls = [];
const inserts = [];   // filas que la app insertó en infracciones
// Tesseract.js simulado: "lee" una placa con texto alrededor
const TESSERACT_STUB = `window.Tesseract = { createWorker: async () => ({
  setParameters: async () => {}, terminate: async () => {},
  recognize: async () => ({ data: { text: 'NUEVO LEON\\nABC 123 D\\nMEXICO' } }) }) };`;
const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const TABLES = {
  infracciones: withIds([...(seeds.SEED_INFRACCIONES || []), { fecha: '2026-06-03T10:00:00Z', placa: 'XSS-001', infractor: XSS, tipo: XSS, monto: 500, ubicacion: XSS, estado: 'pendiente', obs: XSS, oficial: XSS, telefono: '5550000000', token_verificacion: TOKEN, fotos: '["infracciones/2026/prueba.jpg"]' }]), permisos: withIds(seeds.SEED_PERMISOS || []),
  actividad: withIds(seeds.SEED_ACTIVIDAD || []), vehiculos: withIds(seeds.SEED_VEHICULOS || []),
  grua: withIds(seeds.SEED_GRUA || []), accidentes: withIds(seeds.SEED_ACCIDENTES || []),
  // Descuento distinto de 20% para comprobar que las boletas usan la configuración
  configuracion: [{ id: 1, ...(seeds.SEED_CONFIG || {}), descuento_pct: 10, dias_descuento: 10, dias_limite: 45, valor_uma: 117.31,
    reglamento: 'Reglamento de Movilidad, Tránsito y Seguridad Vial de San Pedro Garza García, Nuevo León', fundamento_general: 'Artículos 16 y 21 de la Constitución', correo_reporte: 'director@municipio.gob.mx' }],
  // Extracto del catálogo del Reglamento de la Ley 561 de Veracruz (veracruz.sql)
  catalogo_infracciones: [
    { numero: 1091, descripcion: 'Exceder los límites de velocidad establecidos.', texto: 'Exceder los límites de velocidad establecidos.', articulo: '75, 153 F. IV', fraccion: '', inciso: '', cuotas_min: 5, cuotas_max: 15, grave: false, tipo_rapido: 'Exceso de velocidad', clasificacion: 'Leve', categoria: 'Circulación de vehículos', nota: '', articulos_ref: ['75', '153'], activo: true },
    { numero: 1133, descripcion: 'Utilizar el teléfono o cualquier otro dispositivo tecnológico que implique distracción mientras se conduce.', texto: 'Utilizar el teléfono…', articulo: '160 F. I', fraccion: '', inciso: '', cuotas_min: 16, cuotas_max: 30, grave: false, tipo_rapido: 'Uso de celular al conducir', clasificacion: 'Grave', categoria: 'Circulación de vehículos', nota: '', articulos_ref: ['160'], activo: true },
    { numero: 1011, descripcion: 'Conducir en estado de ebriedad o bajo el influjo de estupefacientes.', texto: 'Conducir en estado de ebriedad…', articulo: '244, 248, 347 F. VII y XI', fraccion: '', inciso: '', cuotas_min: 80, cuotas_max: 115, grave: true, tipo_rapido: 'Conducir en estado de ebriedad', clasificacion: 'Muy Grave', categoria: 'Aliento alcohólico', nota: '', articulos_ref: ['244'], activo: true },
    { numero: 1023, descripcion: 'Ciclistas, circular en sentido contrario.', texto: 'Ciclistas, circular en sentido contrario.', articulo: '172 F. II', fraccion: '', inciso: '', cuotas_min: null, cuotas_max: null, grave: false, tipo_rapido: null, clasificacion: 'Amonestación verbal', categoria: 'Ciclistas y motociclistas', nota: '', articulos_ref: ['172'], activo: true }
  ],
  reglamento_articulos: [
    { numero: '160', texto: 'Artículo 160. Los conductores tendrán las siguientes prohibiciones: I. Utilizar dispositivos… <img src=x onerror="window.__xss=1">' },
    { numero: '75', texto: 'Artículo 75. Límites de velocidad…' }, { numero: '153', texto: 'Artículo 153. Todo conductor…' }
  ], usuarios: [ADMIN], pagos: [], turnos: [],
  auditoria: [
    { id: 1, ts: '2026-06-03T10:05:00Z', tabla: 'infracciones', registro_id: 'x', accion: 'cambio', usuario_nombre: XSS, resumen: XSS, cambios: { monto: { antes: 800, despues: XSS } } },
    { id: 2, ts: '2026-06-03T10:00:00Z', tabla: 'infracciones', registro_id: 'x', accion: 'alta', usuario_nombre: 'Admin Prueba', resumen: 'INF-2026-0001', cambios: { tipo: XSS, placa: 'XSS-001' } }
  ]
};
TABLES.auditoria.forEach(a => { a.registro_id = String(TABLES.infracciones.find(r => r.placa === 'XSS-001').id); });

const LIBS_DIR = process.env.LIBS_DIR;
const LOCAL_LIBS = LIBS_DIR && {
  'supabase.min.js': '@supabase/supabase-js/dist/umd/supabase.js', 'xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js',
  'qrious.min.js': 'qrious/dist/qrious.min.js', 'jsQR.js': 'jsqr/dist/jsQR.js',
  'leaflet.js': 'leaflet/dist/leaflet.js', 'leaflet.css': 'leaflet/dist/leaflet.css'
};

async function newPage(browser, { dbDown = false } = {}) {
  // Sin service worker: sus peticiones no pasarían por los page.route de abajo
  const page = await browser.newPage({ serviceWorkers: 'block' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message + '\n    ' + (e.stack || '').split('\n')[1]));
  page.on('dialog', d => d.dismiss());
  if (LOCAL_LIBS) {
    await page.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//, r => {
      const rel = LOCAL_LIBS[r.request().url().split('/').pop()];
      return rel ? r.fulfill({ path: path.join(LIBS_DIR, rel) }) : r.abort();
    });
  }
  await page.route(/tesseract\.js@/, r => r.fulfill({ status: 200, headers: { 'Content-Type': 'application/javascript' }, body: TESSERACT_STUB }));
  // Fuentes, mapas y geocoding no hacen falta para la prueba.
  await page.route(/^https:\/\/(fonts\.|nominatim\.|[a-z]\.tile\.|.*basemaps)/, r => r.abort());
  await page.route(/supabase\.co/, r => {
    const req = r.request(); const u = new URL(req.url());
    if (dbDown || u.pathname.includes('/realtime/')) return r.abort();
    const json = { 'Content-Type': 'application/json' };
    if (u.pathname.startsWith('/auth/v1/token')) return r.fulfill({ status: 200, headers: json, body: JSON.stringify(SESSION) });
    if (u.pathname.startsWith('/auth/v1/')) return r.fulfill({ status: 204, body: '' });
    // Storage: subida de fotos y enlaces firmados
    if (u.pathname.startsWith('/storage/v1/object/sign/')) {
      const paths = JSON.parse(req.postData() || '{}').paths || [];
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify(paths.map(p => ({ path: p, signedURL: '/object/sign/evidencias/' + p + '?token=x', error: null }))) });
    }
    if (u.pathname.startsWith('/storage/v1/object/')) {
      storageUploads.push(u.pathname);
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify({ Key: u.pathname.replace('/storage/v1/object/', '') }) });
    }
    if (u.pathname.startsWith('/functions/v1/reporte-mensual'))
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify({ ok: true, mes: '2026-09', enviado_a: ['director@municipio.gob.mx'] }) });
    const table = (u.pathname.split('/rest/v1/')[1] || '').split('?')[0];
    if (table === 'rpc/reporte_mensual')
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify({ mes: '2026-09', municipio: XSS, estado_mun: 'NL', director: XSS,
        infracciones: 12, infracciones_monto: 9600, infracciones_prev: 10, por_estado: { pendiente: 7, [XSS]: 5 }, recaudacion: 4000, recaudacion_prev: 5000,
        pagos: 6, descuentos: 400, por_metodo: [{ metodo: XSS, pagos: 6, total: 4000 }], por_tipo: [{ tipo: XSS, n: 12, monto: 9600 }],
        por_oficial: [{ oficial: XSS, n: 12, monto: 9600 }], pendientes_total: 41, pendientes_monto: 31200, grua_ingresos: 2, grua_liberados: 1,
        accidentes: 1, lesionados: 0, fallecidos: 0 }) });
    if (table === 'rpc/verificar_documento') {
      const t = JSON.parse(req.postData() || '{}').p_token;
      const i = TABLES.infracciones.find(x => x.token_verificacion === t);
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify(i ? { tipo: 'infraccion', folio: i.folio, fecha: i.fecha, placa: i.placa, concepto: i.tipo, monto: i.monto, estado: i.estado, infractor: i.infractor, municipio: XSS } : null) });
    }
    let rows = TABLES[table] || [];
    // Filtros simples col=eq.valor (los demás se ignoran: la prueba no valida consultas)
    for (const [k, v] of u.searchParams) if (v.startsWith('eq.') && rows.length && k in rows[0]) rows = rows.filter(r => String(r[k]) === v.slice(3));
    if (table === 'rpc/registrar_pago') {
      const b = JSON.parse(req.postData() || '{}'); rpcCalls.push({ fn: 'registrar_pago', ...b });
      const inf = TABLES.infracciones.find(i => i.id === b.p_infraccion_id) || {};
      const pct = b.p_aplicar_descuento ? TABLES.configuracion[0].descuento_pct : 0;
      const pago = withIds({ infraccion_id: inf.id, folio_inf: inf.folio, monto_original: inf.monto, descuento_pct: pct, monto_final: Math.round(inf.monto * (1 - pct / 100)), metodo: b.p_metodo, cajero: ADMIN.nombre })[0];
      TABLES.pagos.push(pago);
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify(pago) });
    }
    if (table === 'rpc/parametros_descuento') {
      const c = TABLES.configuracion[0];
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify({ descuento_pct: c.descuento_pct, dias_descuento: c.dias_descuento, descuento2_pct: 0, dias_descuento2: null, dias_limite: c.dias_limite }) });
    }
    if (table === 'rpc/parametros_pago') {
      const c = TABLES.configuracion[0];
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify([{ descuento_pct: c.descuento_pct, dias_descuento: c.dias_descuento, dias_limite: c.dias_limite }]) });
    }
    if (table === 'rpc/consulta_publica' || table === 'rpc/consulta_ciudadana') {
      const q = norm(JSON.parse(req.postData() || '{}').p_q);
      rows = TABLES.infracciones.filter(i => norm(i.placa) === q || norm(i.folio) === q);
    } else if (table.startsWith('rpc/')) rows = [];
    if (!['GET', 'HEAD'].includes(req.method()) && !table.startsWith('rpc/')) {
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {}
      if (table === 'infracciones' && req.method() === 'POST') inserts.push(body);
      rows = withIds(body);
    }
    if ((req.headers()['accept'] || '').includes('vnd.pgrst.object')) {
      if (!rows.length) return r.fulfill({ status: 406, headers: json, body: JSON.stringify({ code: 'PGRST116', message: 'no rows' }) });
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify(rows[0]) });
    }
    r.fulfill({ status: 200, headers: { ...json, 'Content-Range': `0-${rows.length}/${rows.length}` }, body: JSON.stringify(rows) });
  });
  return { page, errors };
}

let failed = false;
function check(name, errors, extra) {
  if (errors.length || extra) { failed = true; console.error(`FAIL ${name}\n  ` + [...errors, extra].filter(Boolean).join('\n  ')); }
  else console.log(`OK   ${name}`);
  errors.length = 0;
}

(async () => {
  await new Promise(r => server.listen(PORT, r));
  const browser = await chromium.launch();
  try {
    // 1. Login con credenciales válidas → entra al panel
    let { page, errors } = await newPage(browser);
    await page.goto(BASE + '/login');
    await page.fill('#username', 'admin'); await page.fill('#password', 'x');
    await Promise.all([page.waitForURL(BASE + '/', { timeout: 10000 }).catch(() => {}), page.click('.btn-login')]);
    check('login → panel', errors, page.url() === BASE + '/' ? null : 'no redirigió al panel: ' + page.url());

    // 2. Cada módulo del panel se abre sin errores
    await page.waitForFunction(() => typeof navigate === 'function');
    await page.waitForTimeout(1500);
    check('panel inicial', errors, await page.evaluate(() => window.__xss) ? 'se ejecutó HTML inyectado' : null);
    for (const v of VIEWS) {
      await page.evaluate(v => navigate(v), v);
      await page.waitForTimeout(500);
      check('módulo ' + v, errors, await page.evaluate(() => window.__xss) ? 'se ejecutó HTML inyectado' : null);
    }
    // Boleta nueva con su artículo del reglamento (se reusa abajo para la prueba sin señal)
    await page.evaluate(() => openNewInfraccion());
    await page.waitForTimeout(600);
    await page.evaluate(async () => { $('inf-tipo').value = 'Exceso de velocidad'; await autoFillMonto(); });

    // Leer la placa con la cámara (Tesseract simulado)
    const placaLeida = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = 120; c.height = 40;
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      await leerPlacaDesdeArchivo(new File([blob], 'placa.png', { type: 'image/png' }));
      return { placa: $('inf-placa').value, estado: $('placa-ocr-status').textContent };
    });
    check('lectura de placa con cámara', errors, placaLeida.placa === 'ABC-123-D' ? null : JSON.stringify(placaLeida));
    const formatos = await page.evaluate(() => ['ABC1234', 'JALISCO\n123-ABC', 'texto sin placa', 'PBA123C'].map(extraerPlaca));
    check('formatos de placa', errors, JSON.stringify(formatos) === JSON.stringify(['ABC-1234', '123-ABC', '', 'PBA-123-C']) ? null : JSON.stringify(formatos));

    // Boleta sin señal: se guarda en el dispositivo y se sube sola al volver internet
    await page.evaluate(() => { $('inf-infractor').value = 'Sin Señal'; $('inf-ubicacion').value = 'Carretera'; $('inf-domicilio').value = 'Conocido, Misantla'; });
    await page.context().setOffline(true);
    await page.evaluate(() => submitInfraccion({ preventDefault() {} }));
    await page.waitForTimeout(500);
    const enCola = await page.evaluate(async () => ({ n: (await colaListar()).length, chip: $('cola-boletas')?.textContent || '' }));
    check('boleta sin señal queda en el dispositivo', errors, enCola.n === 1 && /1 boleta por subir/.test(enCola.chip) ? null : JSON.stringify(enCola));
    const antes = inserts.length;
    await page.context().setOffline(false);
    await page.waitForFunction(() => !document.getElementById('cola-boletas'), null, { timeout: 15000 }).catch(() => {});
    const subida = inserts.slice(antes).find(b => b.infractor === 'Sin Señal');
    check('boleta sin señal se sube al volver la señal', errors,
      subida && /Capturada sin señal/.test(subida.obs) && /^[0-9a-f-]{36}$/.test(subida.token_verificacion) && subida.catalogo_numero === 1091
        ? null : 'insert: ' + JSON.stringify(subida || inserts.slice(antes)));
    await page.evaluate(() => closeModal('modal-infraccion'));

    // Reporte mensual: PDF imprimible y envío por correo
    await page.evaluate(() => navigate('reportes'));
    await page.waitForTimeout(500);
    const [popRep] = await Promise.all([page.context().waitForEvent('page'), page.evaluate(() => printReporteMensual())]);
    await popRep.waitForLoadState().catch(() => {});
    const repTxt = await popRep.evaluate(() => document.body.innerText).catch(() => '');
    const repXss = await popRep.evaluate(() => window.__xss).catch(() => false);
    await popRep.close().catch(() => {});
    check('reporte mensual en PDF', errors, /Reporte mensual/.test(repTxt) && /31,200/.test(repTxt) ? null : 'texto: ' + repTxt.slice(0, 150));
    check('reporte mensual escapa los textos', errors, repXss ? 'se ejecutó HTML inyectado' : null);
    await page.evaluate(() => enviarReporteMensual());
    await page.waitForTimeout(500);
    const envio = await page.textContent('#rep-estado');
    check('enviar reporte por correo', errors, /Enviado a director@municipio\.gob\.mx/.test(envio) ? null : envio);
    // Detalle, edición e impresiones de la fila con HTML malicioso
    const xssId = TABLES.infracciones.find(r => r.placa === 'XSS-001').id;
    const popups = [];
    page.context().on('page', p => popups.push(p));
    for (const fn of ['viewDetail', 'editInfraccion', 'printInfraccion', 'printTicket80']) {
      await page.evaluate(([fn, id]) => fn === 'viewDetail' ? viewDetail('infracciones', id) : window[fn](id), [fn, xssId]);
      await page.waitForTimeout(800);
      let xss = await page.evaluate(() => window.__xss);
      for (const p of popups.splice(0)) { xss = xss || await p.evaluate(() => window.__xss).catch(() => false); await p.close().catch(() => {}); }
      check(fn + ' escapa los textos', errors, xss ? 'se ejecutó HTML inyectado' : null);
    }
    // Fotos: el detalle pide el enlace firmado y lo pone en la imagen; subirFotos sube a Storage
    await page.evaluate(id => viewDetail('infracciones', id), xssId);
    await page.waitForTimeout(800);
    const src = await page.evaluate(() => document.querySelector('#modal-detail img[data-foto]')?.src || '');
    check('fotos con enlace firmado de Storage', errors, src.includes('/object/sign/evidencias/infracciones/2026/prueba.jpg') ? null : 'src de la foto: ' + src);
    const rutas = await page.evaluate(async () => {
      const c = document.createElement('canvas'); c.width = c.height = 20;
      const blob = await new Promise(r => c.toBlob(r, 'image/png'));
      return subirFotos({ files: [new File([blob], 'x.png', { type: 'image/png' })] }, 'infracciones');
    });
    check('subida de fotos a Storage', errors,
      rutas.length === 1 && /^infracciones\/\d{4}\/[0-9a-f-]{36}\.jpg$/.test(rutas[0]) && storageUploads.some(p => p.includes('/evidencias/infracciones/'))
        ? null : 'rutas: ' + JSON.stringify(rutas));

    // Bitácora: historial dentro del detalle (solo mandos)
    const hist = await page.evaluate(() => document.getElementById('detail-historial')?.textContent || '');
    check('historial en el detalle', errors, /Cambio/.test(hist) ? null : 'no mostró el historial');
    check('historial escapa los textos', errors, await page.evaluate(() => window.__xss) ? 'se ejecutó HTML inyectado' : null);

    // Boleta y ticket usan el descuento de Configuración (10%), no un 20% fijo
    const pendId = TABLES.infracciones.find(r => r.placa !== 'XSS-001').id;
    for (const fn of ['printTicket80', 'printInfraccion']) {
      await page.evaluate(([fn, id]) => window[fn](id), [fn, pendId]);
      await page.waitForTimeout(800);
      let html = '';
      for (const p of popups.splice(0)) { html += await p.content().catch(() => ''); await p.close().catch(() => {}); }
      check(fn + ' usa el descuento configurado', errors, html.includes('10% descuento') && !html.includes('20% descuento') ? null : 'no mostró 10% de descuento');
    }

    // Fundamento legal: el tipo rápido propone su artículo y el monto mínimo del tabulador
    await page.evaluate(() => openNewInfraccion());
    await page.waitForTimeout(800);
    await page.selectOption('#inf-tipo', 'Exceso de velocidad');
    await page.evaluate(() => autoFillMonto());
    await page.waitForTimeout(500);
    const alta = await page.evaluate(() => ({ cat: $('inf-catalogo').value, monto: $('inf-monto').value, card: $('inf-fundamento').textContent }));
    check('alta: artículo y monto del tabulador', errors, alta.cat === '1091' && alta.monto === '586' && /Art\. 75, 153 F\. IV/.test(alta.card) && /Leve/.test(alta.card) && /con agravante 15 UMA/.test(alta.card) ? null : JSON.stringify(alta));
    // Búsqueda en el reglamento por artículo
    await page.evaluate(() => { const c = catalogoPorNumero(1133); $('inf-catalogo-buscar').value = etiquetaCatalogo(c); onCatalogoBuscar(); });
    const busq = await page.evaluate(() => ({ cat: $('inf-catalogo').value, tipo: $('inf-tipo').value, monto: $('inf-monto').value }));
    check('búsqueda por artículo del reglamento', errors, busq.cat === '1133' && busq.tipo === 'Uso de celular al conducir' && busq.monto === '1876' ? null : JSON.stringify(busq));
    await page.evaluate(() => { document.querySelector('#inf-fundamento details').open = true; });
    await page.waitForTimeout(600);
    const artTxt = await page.evaluate(() => $('inf-fundamento').querySelector('.fund-articulos').textContent);
    check('lee los artículos del reglamento', errors, /Artículo 160\. Los conductores/.test(artTxt) ? null : 'texto: ' + artTxt.slice(0, 80));
    check('artículos del reglamento escapados', errors, await page.evaluate(() => window.__xss) ? 'se ejecutó HTML inyectado' : null);
    // Amonestación verbal: sin multa
    await page.evaluate(() => { const c = catalogoPorNumero(1023); $('inf-catalogo-buscar').value = etiquetaCatalogo(c); onCatalogoBuscar(); });
    const amon = await page.evaluate(() => ({ monto: $('inf-monto').value, ro: $('inf-monto').readOnly, card: $('inf-fundamento').textContent }));
    check('amonestación verbal sin multa', errors, amon.monto === '0' && amon.ro && /sin multa/.test(amon.card) ? null : JSON.stringify(amon).slice(0, 160));
    await page.evaluate(() => closeModal('modal-infraccion'));
    // Ticket de una infracción grave: con fundamento y sin descuento
    const graveInf = TABLES.infracciones.find(r => r.placa !== 'XSS-001' && r.id !== pendId);
    Object.assign(graveInf, { catalogo_numero: 1011, fundamento: 'Artículos 244, 248, 347 fracción VII y XI, del Reglamento de la Ley Número 561' });
    await page.evaluate(id => printTicket80(id), graveInf.id);
    await page.waitForTimeout(800);
    let tk = ''; for (const p of popups.splice(0)) { tk += await p.content().catch(() => ''); await p.close().catch(() => {}); }
    check('ticket de ebriedad sin descuento', errors, tk.includes('Fundamento: Artículos 244') && tk.includes('SIN DESCUENTO') && !tk.includes('% descuento pagando') ? null : 'ticket sin fundamento o con descuento');
    await page.evaluate(id => viewDetail('infracciones', id), graveInf.id);
    await page.waitForTimeout(800);
    const det = await page.evaluate(() => $('modal-detail').textContent);
    check('detalle muestra el fundamento', errors, /Fundamento legal/.test(det) && /Artículos 244/.test(det) && /Muy Grave/.test(det) ? null : 'sin fundamento en el detalle');
    await page.evaluate(() => closeModal('modal-detail'));

    // Art. 331: con agravante se aplica la UMA con agravante (celular: 16 → 30 UMA)
    await page.evaluate(() => openNewInfraccion()); await page.waitForTimeout(800);
    await page.selectOption('#inf-tipo', 'Uso de celular al conducir'); await page.evaluate(() => autoFillMonto()); await page.waitForTimeout(400);
    const base = await page.inputValue('#inf-monto');
    await page.evaluate(() => { const cb = document.querySelector('.inf-circ[value="agr_g"]'); cb.checked = true; cb.dispatchEvent(new Event('change')); });
    const conAgr = await page.inputValue('#inf-monto');
    check('agravante aplica la UMA con agravante', errors, base === '1876' && conAgr === '3519' ? null : `base ${base}, con agravante ${conAgr}`);
    // Adeudos de la placa → se sugiere la agravante del inciso e)
    await page.evaluate(() => { window._placaAdeudos = [{ folio: 'X', monto: 1 }]; sugerirAgravanteAdeudos(); });
    const sug = await page.evaluate(() => ({ e: document.querySelector('.inf-circ[value="agr_e"]').checked, nota: document.querySelector('.circ-nota[data-c="agr_e"]').textContent }));
    check('sugiere agravante por adeudos', errors, sug.e && /sin pagar/.test(sug.nota) ? null : JSON.stringify(sug));
    await page.evaluate(() => closeModal('modal-infraccion'));
    // Art. 327: varias infracciones en una boleta, datos del infractor y del policía vial, medio de defensa
    const g1 = TABLES.infracciones.find(r => r.placa !== 'XSS-001' && r.id !== pendId && r.id !== graveInf.id);
    const g2 = TABLES.infracciones.find(r => r.placa !== 'XSS-001' && ![pendId, graveInf.id, g1.id].includes(r.id));
    Object.assign(g1, { boleta: 'B-1', monto: 3519, infractor_domicilio: 'Av. Principal 10, Misantla', infractor_correo: 'x@correo.mx', licencia_tipo: 'Automovilista',
      oficial: 'Ana Ruiz', oficial_placa: 'PV-123', oficial_adscripcion: 'Delegación Misantla', circunstancias: ['agr_g', 'ate_d'] });
    Object.assign(g2, { boleta: 'B-1', monto: 586 });
    TABLES.configuracion[0].leyenda_recurso = 'Contra esta boleta procede el recurso de revocación (artículo 383).';
    for (const fn of ['printTicket80', 'printInfraccion']) {
      await page.evaluate(([fn, id]) => window[fn](id), [fn, g1.id]);
      await page.waitForTimeout(900);
      let h = ''; for (const p of popups.splice(0)) { h += await p.content().catch(() => ''); await p.close().catch(() => {}); }
      const falta = [g1.folio, g2.folio, 'mayor cuantía', 'Av. Principal 10', 'Automovilista', 'PV-123', 'Delegación Misantla', 'La reincidencia', 'recurso de revocación (artículo 383)']
        .filter(t => !h.toLowerCase().includes(t.toLowerCase()));
      check(fn + ': boleta conforme al art. 327', errors, falta.length ? 'falta: ' + falta.join(', ') : null);
    }

    // La infracción de la misma boleta no cuenta como adeudo anterior (agravante e)
    TABLES.infracciones.push(...withIds({ placa: 'GRP-001', infractor: 'X', tipo: 'Otro', monto: 100, estado: 'pendiente', boleta: 'B-9', fecha: new Date().toISOString() }));
    const adeudosBoleta = await page.evaluate(async () => {
      await openNewInfraccion(); $('inf-placa').value = 'GRP-001';
      _boletaGrupo = 'B-9'; await checkPlacaHistory(); const misma = window._placaAdeudos.length;
      _boletaGrupo = null; await checkPlacaHistory(); const otra = window._placaAdeudos.length;
      closeModal('modal-infraccion'); return { misma, otra };
    });
    check('misma boleta no cuenta como adeudo', errors, adeudosBoleta.misma === 0 && adeudosBoleta.otra === 1 ? null : JSON.stringify(adeudosBoleta));

    // Cobro: pasa por registrar_pago (el servidor calcula el descuento)
    await page.evaluate(id => openRegistrarPago(id), pendId);
    await page.waitForTimeout(500);
    await page.evaluate(() => submitPago());
    await page.waitForTimeout(800);
    for (const p of popups.splice(0)) await p.close().catch(() => {});
    const cobro = rpcCalls.find(c => c.fn === 'registrar_pago');
    check('cobro con registrar_pago', errors, cobro && cobro.p_infraccion_id === pendId && cobro.p_metodo === 'efectivo' ? null : 'llamada: ' + JSON.stringify(cobro));

    // QR de la boleta: apunta a /verificar?t=<token>
    const qrUrl = await page.evaluate(id => urlVerificacion(id), TOKEN);
    check('QR de verificación', errors, qrUrl === BASE + '/verificar?t=' + TOKEN ? null : qrUrl);
    await page.close();

    // 3b. Verificación pública del QR
    ({ page, errors } = await newPage(browser));
    await page.goto(BASE + '/verificar?t=' + TOKEN);
    await page.waitForTimeout(1200);
    let txt = await page.textContent('#card');
    check('verificar: boleta auténtica', errors, /auténtica/.test(txt) && txt.includes('XSS-001') ? null : 'texto: ' + txt.slice(0, 120));
    check('verificar escapa los textos', errors, await page.evaluate(() => window.__xss) ? 'se ejecutó HTML inyectado' : null);
    await page.goto(BASE + '/verificar?t=00000000-0000-4000-8000-000000000000');
    await page.waitForTimeout(1200);
    txt = await page.textContent('#card');
    check('verificar: token inexistente', errors, /no válido/.test(txt) ? null : 'texto: ' + txt.slice(0, 120));
    await page.close();

    // 3. Portal ciudadano: búsqueda por placa
    ({ page, errors } = await newPage(browser));
    await page.goto(BASE + '/consulta');
    await page.fill('#q', 'ABC-123'); await page.click('.search-btn');
    await page.waitForTimeout(1000);
    const resultado = await page.textContent('#result');
    check('consulta ciudadana', errors, resultado.includes('ABC-123') ? null : 'no mostró resultados');
    await page.goto(BASE + '/consulta?q=' + encodeURIComponent(XSS));
    await page.waitForTimeout(1500);
    check('consulta ciudadana escapa la búsqueda', errors, await page.evaluate(() => window.__xss) ? 'se ejecutó HTML inyectado' : null);
    await page.close();

    // 4. Sin base de datos: mensajes claros en vez de pantallas vacías
    ({ page, errors } = await newPage(browser, { dbDown: true }));
    await page.goto(BASE + '/login');
    await page.fill('#username', 'admin'); await page.fill('#password', 'x');
    await page.click('.btn-login');
    // supabase-js reintenta las lecturas fallidas antes de rendirse.
    await page.waitForFunction(() => document.querySelector('.btn-login').disabled === false, null, { timeout: 30000 }).catch(() => {});
    const msg = await page.textContent('#error-msg');
    check('login sin servidor', errors, /conectar con el servidor/.test(msg) ? null : 'mensaje incorrecto: ' + msg);
    await page.evaluate(([k, s]) => {
      localStorage.setItem('tm_session', JSON.stringify({ id: 1, user: 'admin', name: 'Admin', role: 'Director de Tránsito', rol: 'admin', initials: 'AD' }));
      localStorage.setItem(k, JSON.stringify(s));
    }, [SB_KEY, SESSION]);
    await page.goto(BASE + '/');
    const banner = await page.waitForSelector('#conn-banner', { timeout: 30000 }).catch(() => null);
    check('panel sin servidor', errors.filter(e => !/fetch/i.test(e)), banner ? null : 'no mostró el aviso de conexión');
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
