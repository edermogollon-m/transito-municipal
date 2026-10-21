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
const VIEWS = ['dashboard','infracciones','permisos','reportes','configuracion','caja','oficiales','usuarios','vehiculos','grua','accidentes','mapa','rendimiento','calendario'];

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

// ── Datos simulados: los mismos SEED_* de app.js ──
const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const seeds = {}; const seedCtx = vm.createContext({ Date });
for (const m of src.matchAll(/const (SEED_[A-Z]+) = ([\[{][\s\S]*?\n[\]}]);/g)) seeds[m[1]] = vm.runInContext('(' + m[2] + ')', seedCtx);
let nextId = 1;
const withIds = a => (Array.isArray(a) ? a : [a]).map(r => ({ id: nextId++, folio: 'INF-2026-' + String(nextId).padStart(4, '0'), created_at: new Date().toISOString(), ...r }));
const ADMIN = { id: 1, usuario: 'admin', nombre: 'Admin Prueba', rol: 'admin', activo: true, iniciales: 'AP' };
const TABLES = {
  infracciones: withIds(seeds.SEED_INFRACCIONES || []), permisos: withIds(seeds.SEED_PERMISOS || []),
  actividad: withIds(seeds.SEED_ACTIVIDAD || []), vehiculos: withIds(seeds.SEED_VEHICULOS || []),
  grua: withIds(seeds.SEED_GRUA || []), accidentes: withIds(seeds.SEED_ACCIDENTES || []),
  configuracion: [{ id: 1, ...(seeds.SEED_CONFIG || {}) }], usuarios: [ADMIN], pagos: [], turnos: []
};

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
    const table = (u.pathname.split('/rest/v1/')[1] || '').split('?')[0];
    let rows = TABLES[table] || [];
    if (table.startsWith('rpc/')) rows = [];
    if (!['GET', 'HEAD'].includes(req.method())) { let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch {} rows = withIds(body); }
    const json = { 'Content-Type': 'application/json' };
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
    for (const v of VIEWS) {
      await page.evaluate(v => navigate(v), v);
      await page.waitForTimeout(500);
      check('módulo ' + v, errors);
    }
    await page.close();

    // 3. Portal ciudadano: búsqueda por placa
    ({ page, errors } = await newPage(browser));
    await page.goto(BASE + '/consulta');
    await page.fill('#q', 'ABC-123'); await page.click('.search-btn');
    await page.waitForTimeout(1000);
    const resultado = await page.textContent('#result');
    check('consulta ciudadana', errors, resultado.includes('ABC-123') ? null : 'no mostró resultados');
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
    await page.evaluate(() => localStorage.setItem('tm_session', JSON.stringify({ id: 1, user: 'admin', name: 'Admin', role: 'Director de Tránsito', rol: 'admin', initials: 'AD' })));
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
