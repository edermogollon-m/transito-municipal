/* ─────────────────────────────────────────────────────────
   Tránsito Municipal — núcleo (Supabase backend)
   ───────────────────────────────────────────────────────── */

// ── Auth (Supabase Auth; tm_session guarda solo el perfil para la UI) ──
// Los permisos reales los aplica la BD (RLS); _rol solo decide qué se muestra.
const _session = JSON.parse(localStorage.getItem('tm_session') || 'null');
const _sbToken = localStorage.getItem(`sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`);
if (!_session || !_sbToken) { localStorage.removeItem('tm_session'); window.location.replace('/login'); }
// Columnas visibles de usuarios (las contraseñas viven en Supabase Auth)
const USR_COLS = 'id,nombre,usuario,rol,iniciales,activo,created_at,numero_placa,adscripcion';
const _rol = _session?.rol || (_session?.role === 'Director de Tránsito' ? 'admin' : 'oficial');

// ── Permisos por rol ──────────────────────────────────────
// La base de datos aplica los permisos (RLS y funciones, ver roles.sql); esto
// solo decide qué se muestra a cada rol para no ofrecer acciones que fallarían.
const ROLES = {
  admin: {
    nombre: 'Director de Tránsito', vistas: '*', acciones: '*',
    resumen: 'Acceso total: usuarios, configuración, cobro, cancelaciones e impugnaciones.'
  },
  supervisor: {
    nombre: 'Supervisor de Tránsito',
    vistas: ['dashboard','infracciones','permisos','reportes','caja','oficiales','vehiculos','grua','accidentes','mapa','rendimiento','calendario'],
    acciones: ['infraccion','estado','impugnar','permisos','grua','liberar','accidentes','padron','reportes','caja_ver','turnos','devolver'],
    resumen: 'Opera todo el día a día: levanta infracciones, cambia estados, cancela con motivo, registra impugnaciones, emite permisos, libera el corralón y cierra turnos olvidados. No resuelve impugnaciones, no cobra ni administra usuarios o configuración.'
  },
  oficial: {
    nombre: 'Policía vial', soloMias: true,
    vistas: ['dashboard','infracciones','permisos','vehiculos','grua','accidentes','calendario'],
    acciones: ['infraccion','grua','accidentes','padron'],
    resumen: 'Levanta infracciones ("Mis boletas"), envía vehículos al corralón, registra accidentes (edita los suyos mientras están en proceso) y actualiza el padrón. No cobra, no cambia estados ni libera vehículos.'
  },
  cajero: {
    nombre: 'Caja · Tesorería',
    vistas: ['dashboard','infracciones','caja','grua','calendario'],
    acciones: ['cobrar','liberar','caja_ver','devolver'],
    resumen: 'Cobra multas (con el descuento que corresponda), emite y reimprime recibos, cierra su corte de caja con el efectivo contado y libera vehículos del corralón. No levanta infracciones.'
  },
  juridico: {
    nombre: 'Jurídico · Juez calificador',
    vistas: ['dashboard','infracciones','reportes','calendario'],
    acciones: ['impugnar','resolver','reportes'],
    resumen: 'Registra y resuelve impugnaciones (procede: se cancela; no procede: vuelve a pendiente). No levanta infracciones, no cobra ni cambia otros estados.'
  },
  corralon: {
    nombre: 'Encargado de corralón',
    vistas: ['dashboard','grua','vehiculos','calendario'],
    acciones: ['grua','liberar'],
    resumen: 'Registra las entradas al corralón y libera vehículos. Consulta el padrón. No ve caja ni infracciones.'
  },
  contraloria: {
    nombre: 'Contraloría (solo lectura)',
    vistas: ['dashboard','infracciones','permisos','reportes','caja','oficiales','vehiculos','grua','accidentes','mapa','rendimiento','calendario'],
    acciones: ['reportes','caja_ver'],
    resumen: 'Ve todo, incluidas la caja, los cortes y los pagos anulados, y puede exportar. No puede cambiar nada.'
  }
};
const _permisosRol = ROLES[_rol] || ROLES.oficial;
function puede(accion) { return _permisosRol.acciones === '*' || _permisosRol.acciones.includes(accion); }
function vistaPermitida(v) { return _permisosRol.vistas === '*' || _permisosRol.vistas.includes(v); }

// "Mis boletas": lo que capturó el usuario en sesión (capturo_auth, controles.sql)
// o lo que lleva su nombre como oficial (registros anteriores a esa columna)
let _authUid = null;
const _authListo = _sb.auth.getSession().then(({ data }) => { _authUid = data?.session?.user?.id || null; }).catch(() => {});
function esMio(r) { return (!!_authUid && r.capturo_auth === _authUid) || (!!_session?.name && r.oficial === _session.name); }
function filtroMios() { return `oficial.eq.${JSON.stringify(_session?.name || '')}` + (_authUid ? `,capturo_auth.eq.${_authUid}` : ''); }

// Botones que llevan a una acción restringida (se reconocen por su onclick)
const ACCION_DE_BOTON = [
  [/\bopenNewInfraccion\(/, 'infraccion'],
  [/\bopenRegistrarPago\(/, 'cobrar'],
  [/\bsaveDetailEstado\('infracciones'/, 'estado', true],
  [/\bimpugnarInfraccion\(/, 'impugnar'],
  [/\bresolverImpugnacion\(/, 'resolver'],
  [/\babrirResolucion\(/, 'resolver'],
  [/\babrirDevolucion\(/, 'devolver'],
  [/\bsaveDetailEstado\('permisos'/, 'permisos', true],
  [/\b(openNewPermiso|editPermiso|renovarPermiso|cancelarPermiso)\(/, 'permisos'],
  [/\banularPago\(/, 'anular'],
  [/\bcerrarTurnoDe\(/, 'turnos'],
  [/\bopenCorteCaja\(/, 'cobrar'],
  [/\bopenNewGrua\(/, 'grua'],
  [/\b(editGrua|liberarVehiculo)\(/, 'liberar'],
  [/\b(openNewAccidente|editAccidente)\(/, 'accidentes'],
  [/\b(openNewVehiculo|editVehiculo)\(/, 'padron'],
  [/\b(printCorteCaja\(|exportExcel\('pagos')/, 'caja_ver'],
  [/\bexportExcel\('infracciones'/, 'reportes']
];
function aplicarPermisosUI(raiz) {
  if (_permisosRol.acciones === '*') return;
  (raiz || document).querySelectorAll('[onclick], [data-permiso]').forEach(el => {
    if (el.dataset.permiso) { if (!puede(el.dataset.permiso)) el.style.display = 'none'; return; }
    const oc = el.getAttribute('onclick') || '';
    for (const [re, accion, contenedor] of ACCION_DE_BOTON) {
      if (re.test(oc) && !puede(accion)) { (contenedor ? el.parentElement : el).style.display = 'none'; break; }
    }
  });
}
// Las vistas se pintan con HTML dinámico: revisar lo que se agregue
if (typeof MutationObserver !== 'undefined') {
  new MutationObserver(muts => {
    for (const m of muts) m.addedNodes.forEach(n => { if (n.nodeType === 1) aplicarPermisosUI(n.parentElement || n); });
  }).observe(document.documentElement, { childList: true, subtree: true });
}

// ── Config cache (populated on first autoFillMonto call) ──
let _cachedConfig = null;

// ── Configuración inicial (se crea si la tabla está vacía) ─
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


// ── Helpers ───────────────────────────────────────────────
function fmt(n) { return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0}).format(n||0); }
function fmtDateShort(d) { if(!d) return '—'; try { return new Date(d).toLocaleDateString('es-MX',{day:'2-digit',month:'short',year:'numeric'}); } catch(e){return d;} }
function fmtDateInput(d) { if(!d) return ''; const dt=new Date(d); const y=dt.getFullYear(); const m=String(dt.getMonth()+1).padStart(2,'0'); const dd=String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function estadoBadge(e) {
  const map = {
    pagada:'badge-green', vigente:'badge-green', activa:'badge-green',
    pendiente:'badge-yellow', suspendido:'badge-yellow', 'por-vencer':'badge-yellow',
    cancelada:'badge-red', cancelado:'badge-red', vencido:'badge-red', vencida:'badge-red',
    impugnada:'badge-blue'
  };
  return `<span class="${map[e]||'badge-muted'}">${esc(e)||'—'}</span>`;
}
function $(id) { return document.getElementById(id); }
// Escapa texto para insertarlo en HTML (contenido o atributos). Todo dato que
// venga de la base o del usuario pasa por aquí antes de ir a innerHTML: un
// nombre como <img onerror=...> se mostraría como texto, no se ejecutaría.
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
// Argumento seguro para un onclick="fn(...)" construido con un template.
function jsArg(v) { return esc(JSON.stringify(v ?? '')); }

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

// ── Fotos de evidencia en Supabase Storage (bucket privado "evidencias") ──
// La columna fotos guarda rutas como "infracciones/2026/<uuid>.jpg". Las fotos
// antiguas pueden ser data: URLs (antes se guardaban dentro de la base).
async function subirFotos(fileInput, carpeta) {
  const rutas = [];
  if (!fileInput || !fileInput.files.length) return rutas;
  for (let i = 0; i < Math.min(fileInput.files.length, 3); i++) {
    const blob = await (await fetch(await compressPhoto(fileInput.files[i]))).blob();
    const ruta = `${carpeta}/${new Date().getFullYear()}/${crypto.randomUUID()}.jpg`;
    const { error } = await _sb.storage.from('evidencias').upload(ruta, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    rutas.push(ruta);
  }
  return rutas;
}

async function urlsFotos(fotos) {
  const esData = f => String(f).startsWith('data:');
  const rutas = fotos.filter(f => !esData(f));
  const firmadas = {};
  if (rutas.length) {
    const { data } = await _sb.storage.from('evidencias').createSignedUrls(rutas, 3600);
    (data || []).forEach(d => { if (d.signedUrl) firmadas[d.path] = d.signedUrl; });
  }
  return fotos.map(f => esData(f) ? f : (firmadas[f] || ''));
}

// Pone el enlace firmado (válido 1 h) en cada <img data-foto="ruta"> de root.
async function hidratarFotos(root) {
  const imgs = root ? [...root.querySelectorAll('img[data-foto]')] : [];
  if (!imgs.length) return;
  const urls = await urlsFotos(imgs.map(img => img.dataset.foto));
  imgs.forEach((img, i) => {
    if (!urls[i]) return;
    img.src = urls[i];
    img.onclick = () => window.open(urls[i], '_blank', 'noopener');
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
  toggleMenuCuenta(false);
}

// Menú "Mi cuenta" al pie del menú lateral (credencial, impresora, contraseña, salir)
function toggleMenuCuenta(abrir) {
  const menu = document.getElementById('menu-cuenta'), chip = document.getElementById('user-chip');
  if (!menu || !chip) return;
  const open = typeof abrir === 'boolean' ? abrir : menu.hidden;
  menu.hidden = !open;
  chip.setAttribute('aria-expanded', String(open));
}

function navigate(view, btn) {
  if (!vistaPermitida(view)) { view = 'dashboard'; btn = null; }
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
  if (view==='configuracion') { loadConfig(); if (_rol === 'admin') renderErroresApp(); }
  if (view==='caja')          renderCaja();
  if (view==='oficiales')     renderOficiales();
  if (view==='usuarios')      renderUsuarios();
  if (view==='vehiculos')     { renderVehiculos(); renderReportados(); }
  if (view==='grua')          renderGrua();
  if (view==='reportes')      initReporteMensual();
  if (view==='mapa')          renderMapa();
  if (view==='rendimiento')   renderRendimiento();
  if (view==='accidentes')    renderAccidentes();
  if (view==='calendario')    renderCalendario();
  if (window.innerWidth <= 768) closeSidebar();
}

