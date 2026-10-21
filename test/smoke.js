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
const withIds = a => (Array.isArray(a) ? a : [a]).map(r => ({ id: nextId++, folio: 'INF-2026-' + String(nextId).padStart(4, '0'), created_at: new Date().toISOString(), ...r }));
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
const norm = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const TABLES = {
  infracciones: withIds([...(seeds.SEED_INFRACCIONES || []), { fecha: '2026-06-03T10:00:00Z', placa: 'XSS-001', infractor: XSS, tipo: XSS, monto: 500, ubicacion: XSS, estado: 'pendiente', obs: XSS, oficial: XSS, telefono: '5550000000', token_verificacion: TOKEN, fotos: '["infracciones/2026/prueba.jpg"]' }]), permisos: withIds(seeds.SEED_PERMISOS || []),
  actividad: withIds(seeds.SEED_ACTIVIDAD || []), vehiculos: withIds(seeds.SEED_VEHICULOS || []),
  grua: withIds(seeds.SEED_GRUA || []), accidentes: withIds(seeds.SEED_ACCIDENTES || []),
  configuracion: [{ id: 1, ...(seeds.SEED_CONFIG || {}) }], usuarios: [ADMIN], pagos: [], turnos: [],
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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message + '\n    ' + (e.stack || '').split('\n')[1]));
  page.on('dialog', d => d.dismiss());
  if (LOCAL_LIBS) {
    await page.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com)\//, r => {
      const rel = LOCAL_LIBS[r.request().url().split('/').pop()];
      return rel ? r.fulfill({ path: path.join(LIBS_DIR, rel) }) : r.abort();
    });
  }
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
    const table = (u.pathname.split('/rest/v1/')[1] || '').split('?')[0];
    if (table === 'rpc/verificar_documento') {
      const t = JSON.parse(req.postData() || '{}').p_token;
      const i = TABLES.infracciones.find(x => x.token_verificacion === t);
      return r.fulfill({ status: 200, headers: json, body: JSON.stringify(i ? { tipo: 'infraccion', folio: i.folio, fecha: i.fecha, placa: i.placa, concepto: i.tipo, monto: i.monto, estado: i.estado, infractor: i.infractor, municipio: XSS } : null) });
    }
    let rows = TABLES[table] || [];
    // Filtros simples col=eq.valor (los demás se ignoran: la prueba no valida consultas)
    for (const [k, v] of u.searchParams) if (v.startsWith('eq.') && rows.length && k in rows[0]) rows = rows.filter(r => String(r[k]) === v.slice(3));
    if (table === 'rpc/consulta_publica') {
      const q = norm(JSON.parse(req.postData() || '{}').p_q);
      rows = TABLES.infracciones.filter(i => norm(i.placa) === q || norm(i.folio) === q);
    } else if (table.startsWith('rpc/')) rows = [];
    if (!['GET', 'HEAD'].includes(req.method()) && !table.startsWith('rpc/')) { let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {} rows = withIds(body); }
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
