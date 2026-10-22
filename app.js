/* ─────────────────────────────────────────────────────────
   Tránsito Municipal — app.js  (Supabase backend)
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
    resumen: 'Acceso total: usuarios, configuración, cobro, cancelaciones, impugnaciones y bitácora.'
  },
  supervisor: {
    nombre: 'Supervisor de Tránsito',
    vistas: ['dashboard','infracciones','permisos','reportes','caja','oficiales','bitacora','vehiculos','grua','accidentes','mapa','rendimiento','calendario'],
    acciones: ['infraccion','estado','impugnar','permisos','grua','liberar','accidentes','padron','reportes','caja_ver','turnos','devolver'],
    resumen: 'Opera todo el día a día: levanta infracciones, cambia estados, cancela con motivo, registra impugnaciones, emite permisos, libera el corralón, cierra turnos olvidados y revisa la bitácora. No resuelve impugnaciones, no cobra ni administra usuarios o configuración.'
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
    vistas: ['dashboard','infracciones','permisos','reportes','caja','oficiales','bitacora','vehiculos','grua','accidentes','mapa','rendimiento','calendario'],
    acciones: ['reportes','caja_ver'],
    resumen: 'Ve todo, incluidas la caja, los cortes, los pagos anulados y la bitácora, y puede exportar. No puede cambiar nada.'
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
const VIEWS = ['dashboard','infracciones','permisos','reportes','configuracion','caja','oficiales','bitacora','usuarios','vehiculos','grua','accidentes','mapa','rendimiento','calendario'];

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
  const titles = { dashboard:'Panel general', infracciones:'Control de Infracciones', permisos:'Permisos de Circulación', reportes:'Reportes', configuracion:'Configuración', caja:'Pagos / Caja', oficiales:'Desempeño de Oficiales', bitacora:'Bitácora', usuarios:'Gestión de Usuarios', vehiculos:'Padrón Vehicular', grua:'Grúa / Corralón', accidentes:'Accidentes Viales', mapa:'Mapa de Infracciones', rendimiento:'Rendimiento por Oficial', calendario:'Calendario de Infracciones' };
  const crumbs = { dashboard:'Dashboard', infracciones:'Infracciones', permisos:'Permisos', reportes:'Reportes', configuracion:'Configuración', caja:'Caja', oficiales:'Oficiales', bitacora:'Bitácora', usuarios:'Usuarios', vehiculos:'Vehículos', grua:'Grúa', accidentes:'Accidentes', mapa:'Mapa', rendimiento:'Rendimiento', calendario:'Calendario' };
  if($('topbar-title')) $('topbar-title').textContent = titles[view] || view;
  if($('topbar-crumb')) $('topbar-crumb').textContent = crumbs[view] || view;
  if (view==='dashboard')     renderDashboard();
  if (view==='infracciones')  renderInfracciones();
  if (view==='permisos')      renderPermisos();
  if (view==='configuracion') loadConfig();
  if (view==='caja')          renderCaja();
  if (view==='oficiales')     renderOficiales();
  if (view==='usuarios')      renderUsuarios();
  if (view==='bitacora')      renderBitacora();
  if (view==='vehiculos')     renderVehiculos();
  if (view==='grua')          renderGrua();
  if (view==='reportes')      initReporteMensual();
  if (view==='mapa')          renderMapa();
  if (view==='rendimiento')   renderRendimiento();
  if (view==='accidentes')    renderAccidentes();
  if (view==='calendario')    renderCalendario();
  if (window.innerWidth <= 768) closeSidebar();
}

// ── Dashboard ─────────────────────────────────────────────
async function renderDashboard() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1, dia = now.getDate();
  const mesInicio = `${y}-${String(m).padStart(2,'0')}-01`;
  const mesFin = new Date(y, m, 1).toISOString().slice(0,10);
  const pm = m===1?12:m-1, py = m===1?y-1:y;
  const pmInicio = `${py}-${String(pm).padStart(2,'0')}-01`;
  // Mismo tramo del mes anterior (del 1 al día de hoy) para comparar parejo
  const pmCorte = new Date(py, pm-1, Math.min(dia, new Date(py, pm, 0).getDate()) + 1).toISOString().slice(0,10);
  const hoyIni = new Date(y, m-1, dia).toISOString();

  if ($('dash-fecha-hoy')) {
    $('dash-fecha-hoy').textContent = now.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  }
  const h = now.getHours();
  const nombre = (_session?.name || '').split(' ')[0];
  if ($('dash-saludo')) $('dash-saludo').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}${nombre ? ', ' + nombre : ''}`;

  const [
    { data: infAll },
    { data: pagosMes },
    { data: pagosPrev },
    { data: gruaRet },
    { data: turnosAct }
  ] = await Promise.all([
    _sb.from('infracciones').select('id,folio,placa,monto,estado,fecha,tipo,oficial,capturo_auth'),
    _sb.from('pagos').select('monto_final,created_at').gte('created_at', mesInicio).lt('created_at', mesFin),
    _sb.from('pagos').select('monto_final').gte('created_at', pmInicio).lt('created_at', pmCorte),
    _sb.from('grua').select('id').eq('estado','retenido'),
    _sb.from('turnos').select('id').eq('estado','activo')
  ]);

  await _authListo;
  // El policía vial ve en su panel solo sus boletas
  const inf = (infAll || []).filter(r => !_permisosRol.soloMias || esMio(r));
  const enMes = r => r.fecha >= mesInicio && r.fecha < mesFin;
  const infM = inf.filter(enMes);
  const prevCount = inf.filter(r => r.fecha >= pmInicio && r.fecha < pmCorte).length;
  const sum = (arr, k) => arr.reduce((a,r)=>a+Number(r[k]||0),0);
  const recMes = sum(pagosMes||[], 'monto_final'), prevRec = sum(pagosPrev||[], 'monto_final');
  const pagosHoy = (pagosMes||[]).filter(p => p.created_at >= hoyIni);
  const infHoy = inf.filter(r => r.fecha >= hoyIni).length;
  const porCobrar = inf.filter(r => r.estado==='pendiente' || r.estado==='vencida');
  const vencidas = porCobrar.filter(r => r.estado==='vencida').length;
  const gruaCount = (gruaRet||[]).length;
  const enTurno = (turnosAct||[]).length;

  // Resumen de hoy
  if ($('dash-hoy-items')) {
    const pl = (n, uno, varios) => `<strong>${n}</strong> ${n===1?uno:varios}`;
    $('dash-hoy-items').innerHTML = `<span>Hoy:</span>
      <span>${pl(infHoy,'infracción','infracciones')}</span>
      <span><strong>${fmt(sum(pagosHoy,'monto_final'))}</strong> cobrados en ${pagosHoy.length} ${pagosHoy.length===1?'pago':'pagos'}</span>
      <span>${pl(enTurno,'oficial en turno','oficiales en turno')}</span>`;
  }

  // % contra el mismo tramo del mes anterior
  const pct = (act, prev) => {
    if (!prev) return act ? '<span style="color:var(--muted)">sin datos del mes anterior para comparar</span>' : '<span style="color:var(--muted)">sin movimiento</span>';
    const p = Math.round((act-prev)/prev*100);
    const txt = `vs. 1–${dia} de ${new Date(py, pm-1, 1).toLocaleDateString('es-MX',{month:'long'})}`;
    return p > 0 ? `<span class="delta-up">▲ ${p}%</span> ${txt}` : p < 0 ? `<span class="delta-dn">▼ ${Math.abs(p)}%</span> ${txt}` : `igual que ${txt.slice(4)}`;
  };
  // Barras por día del mes (las que faltan quedan vacías)
  const spark = (porDia) => {
    const diasMes = new Date(y, m, 0).getDate(), max = Math.max(...porDia, 1);
    return Array.from({length: diasMes}, (_, i) => {
      const v = porDia[i] || 0;
      return `<i class="${i+1===dia ? 'hoy' : v ? 'lleno' : ''}" style="height:${i < dia ? Math.max(8, Math.round(v/max*100)) : 8}%;${i >= dia ? 'opacity:.35' : ''}" title="${i+1}: ${v}"></i>`;
    }).join('');
  };
  const porDia = (arr, campoFecha, valor) => { const d = []; arr.forEach(r => { const i = new Date(r[campoFecha]).getDate()-1; d[i] = (d[i]||0) + valor(r); }); return d; };

  const mesNombre = now.toLocaleDateString('es-MX',{month:'long'});
  if($('s-rec-label'))  $('s-rec-label').textContent = `Recaudación de ${mesNombre}`;
  if($('s-inf-label'))  $('s-inf-label').textContent = `Infracciones de ${mesNombre}`;
  if($('s-rec'))        $('s-rec').textContent   = fmt(recMes);
  if($('s-rec-delta'))  $('s-rec-delta').innerHTML = pct(recMes, prevRec);
  if($('s-rec-spark'))  $('s-rec-spark').innerHTML = spark(porDia(pagosMes||[], 'created_at', r => Number(r.monto_final||0)));
  if($('s-inf'))        $('s-inf').textContent   = infM.length;
  if($('s-inf-delta'))  $('s-inf-delta').innerHTML = pct(infM.length, prevCount);
  if($('s-inf-spark'))  $('s-inf-spark').innerHTML = spark(porDia(infM, 'fecha', () => 1));
  if($('s-pend'))       $('s-pend').textContent  = fmt(sum(porCobrar,'monto'));
  if($('s-pend-delta')) $('s-pend-delta').innerHTML = `${porCobrar.length} ${porCobrar.length===1?'boleta':'boletas'}` + (vencidas ? ` · <span class="vencidas">${vencidas} ${vencidas===1?'vencida':'vencidas'}</span>` : '');
  if($('s-grua'))       $('s-grua').textContent  = gruaCount;
  if($('s-grua-sub'))   $('s-grua-sub').textContent = gruaCount ? (gruaCount===1 ? 'vehículo retenido' : 'vehículos retenidos') : 'corralón vacío';
  if($('badge-pendientes')) $('badge-pendientes').textContent = porCobrar.length || '';

  // Cobranza de las boletas levantadas este mes
  if ($('dash-cobranza')) {
    const estadoColors = { pagada:'var(--green)', pendiente:'var(--amber)', vencida:'var(--red)', impugnada:'var(--blue)', cancelada:'var(--subtle)' };
    const nombres = { pagada:'Pagadas', pendiente:'Pendientes', vencida:'Vencidas', impugnada:'Impugnadas', cancelada:'Canceladas' };
    const tot = infM.length;
    const filas = Object.keys(nombres).map(k => ({ k, n: infM.filter(r=>r.estado===k).length, monto: sum(infM.filter(r=>r.estado===k),'monto') })).filter(f => f.n);
    const pagadas = filas.find(f=>f.k==='pagada')?.n || 0;
    if ($('dash-cob-sub')) $('dash-cob-sub').textContent = tot ? `${tot} boletas de ${mesNombre}` : '';
    $('dash-cobranza').innerHTML = tot ? `
      <div class="cob-tasa">${Math.round(pagadas/tot*100)}%<small>ya pagadas</small></div>
      <div class="cob-barra">${filas.map(f=>`<span style="width:${f.n/tot*100}%;background:${estadoColors[f.k]}" title="${nombres[f.k]}: ${f.n}"></span>`).join('')}</div>
      ${filas.map(f=>`<div class="cob-fila"><span class="legend-dot" style="background:${estadoColors[f.k]}"></span><span>${nombres[f.k]} · ${f.n}</span><strong>${fmt(f.monto)}</strong><small>${Math.round(f.n/tot*100)}%</small></div>`).join('')}`
      : '<div style="color:var(--muted);font-size:.8rem">Sin infracciones este mes</div>';
  }

  // Motivos del mes
  if ($('dash-tipos-body')) {
    const tipoCount = {};
    infM.forEach(r=>{ if(r.tipo) tipoCount[r.tipo]=(tipoCount[r.tipo]||0)+1; });
    const topTipos = Object.entries(tipoCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxT = topTipos[0]?.[1] || 1;
    if ($('dash-tipos-mes')) $('dash-tipos-mes').textContent = mesNombre;
    $('dash-tipos-body').innerHTML = topTipos.length ? topTipos.map(([t,c])=>`
      <div style="margin-bottom:.65rem">
        <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:.25rem">
          <span style="color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:75%">${esc(t)}</span>
          <span style="color:var(--muted);flex-shrink:0;margin-left:.4rem">${c}</span>
        </div>
        <div style="height:6px;background:var(--stone);border-radius:3px;overflow:hidden">
          <div style="width:${Math.round(c/maxT*100)}%;height:100%;background:var(--ac);border-radius:3px;transition:width .4s"></div>
        </div>
      </div>`).join('') : '<div style="color:var(--muted);font-size:.8rem;padding:.25rem 0">Sin infracciones este mes</div>';
  }

  // Infracciones recientes (10 filas, clickeables)
  const recent = [...inf].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,10);
  if($('dash-rec-sub')) $('dash-rec-sub').textContent = `Últimas ${recent.length} registradas`;
  const cuando = f => {
    const d = new Date(f), min = Math.round((now - d)/60000);
    const hora = d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
    if (min < 60) return `<b>hace ${Math.max(min,1)} min</b>${hora}`;
    if (d.toDateString() === now.toDateString()) return `<b>hoy</b>${hora}`;
    const ayer = new Date(now); ayer.setDate(dia-1);
    if (d.toDateString() === ayer.toDateString()) return `<b>ayer</b>${hora}`;
    return `<b>${d.toLocaleDateString('es-MX',{day:'numeric',month:'short'})}</b>${hora}`;
  };
  if($('dash-tbody')) {
    $('dash-tbody').innerHTML = recent.length ? recent.map(r=>`
      <tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer" title="${esc(r.folio||'')}">
        <td class="dash-cuando">${cuando(r.fecha)}</td>
        <td style="font-weight:700;font-family:monospace;font-size:.8rem">${esc(r.placa||'—')}<span class="solo-movil">${esc(r.tipo)}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.tipo)}</td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">${esc(r.oficial||'—')}</td>
        <td style="font-weight:600;text-align:right;font-variant-numeric:tabular-nums">${fmt(r.monto)}</td>
        <td>${estadoBadge(r.estado)}</td>
      </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Sin datos</td></tr>';
  }

  renderBarChart(infAll);

  renderAlertas();
}

// "Pendientes de hoy": una sola lista con todo lo que requiere atención
async function renderAlertas() {
  const panel = $('alertas-panel'), list = $('alertas-list'); if (!panel || !list) return;
  const hoy = new Date().toISOString().slice(0,10);
  const en7  = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const en30 = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const hace25 = new Date(Date.now()-25*86400000).toISOString();
  const hace15 = new Date(Date.now()-15*86400000).toISOString();
  const hace7  = new Date(Date.now()-7*86400000).toISOString();

  const [
    { data: permVenc },
    { data: infVenc },
    { data: gruaLarga },
    { data: impSinResolver },
    { data: accProceso }
  ] = await Promise.all([
    _sb.from('permisos').select('id,num,titular,vencimiento').in('estado',['vigente','por-vencer']).lte('vencimiento', en30).gte('vencimiento', hoy).order('vencimiento'),
    _sb.from('infracciones').select('id,folio,placa').eq('estado','pendiente').lt('fecha', hace25).order('fecha'),
    _sb.from('grua').select('id').eq('estado','retenido').lte('fecha', hace15),
    _sb.from('infracciones').select('id').eq('estado','impugnada').lte('fecha', hace7),
    _sb.from('accidentes').select('id').eq('estado','en_proceso').limit(99)
  ]);

  const pl = (n, uno, varios) => `${n} ${n===1?uno:varios}`;
  const alertas = [];
  if (infVenc?.length) alertas.push({ c:'var(--red)', view:'infracciones',
    title: `${pl(infVenc.length,'infracción','infracciones')} con más de 25 días sin pagar`,
    sub: infVenc.slice(0,3).map(i=>`${i.folio||'—'} (${i.placa})`).join(' · ') + (infVenc.length>3?' · …':'') });
  if (gruaLarga?.length) alertas.push({ c:'var(--red)', view:'grua',
    title: `${pl(gruaLarga.length,'vehículo','vehículos')} en corralón hace más de 15 días`, sub:'Revisar liberación o remate' });
  if (permVenc?.length) {
    const semana = permVenc.filter(p=>p.vencimiento<=en7).length;
    alertas.push({ c:'var(--amber)', view:'permisos',
      title: `${pl(permVenc.length,'permiso vence','permisos vencen')} en los próximos 30 días`,
      sub: (semana ? `${semana} esta semana · ` : '') + permVenc.slice(0,2).map(p=>p.num ? `${p.num} ${p.titular}` : p.titular).join(' · ') });
  }
  if (impSinResolver?.length) alertas.push({ c:'var(--blue)', view:'infracciones',
    title: `${pl(impSinResolver.length,'impugnación','impugnaciones')} sin resolver hace más de 7 días`, sub:'Requieren resolución del supervisor' });
  if (accProceso?.length) alertas.push({ c:'var(--subtle)', view:'accidentes',
    title: `${pl(accProceso.length,'accidente','accidentes')} en proceso`, sub:'Registros sin cerrar' });

  if (!alertas.length) { panel.style.display='none'; return; }
  panel.style.display='';
  list.innerHTML = alertas.map(a => `
    <li><button type="button" class="pend-row" onclick="navigate('${a.view}')">
      <span class="pend-dot" style="background:${a.c}"></span>
      <span class="pend-txt"><strong>${esc(a.title)}</strong><small>${esc(a.sub)}</small></span>
      <span class="pend-go">Ver</span>
    </button></li>`).join('');
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
    <div class="bar-col" title="${months[i]}: ${c} ${c!==1?'infracciones':'infracción'}" onclick="navigate('calendario')">
      <div class="bar-val ${isCurrent?'current':''}">${c > 0 ? c : ''}</div>
      <div class="bar-fill ${isCurrent?'current':''}" style="height:${h}%"></div>
      <div class="bar-label ${isCurrent?'current':''}">${months[i]}</div>
    </div>`}).join('');
}

// ── Infracciones ──────────────────────────────────────────
let _infPage = 1, _infSearch = '', _infEstado = '', _infTipo = '', _infPeriodo = '', _infSort = 'fecha_desc';
let _infMias = !!_permisosRol.soloMias;   // el policía vial ve primero sus boletas
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
      [...new Set(tipos)].filter(t=>t&&t!=='Otro').map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('') +
      '<option value="Otro">Otro</option>';
  }

  let q = _sb.from('infracciones').select('*');
  if (_infMias) { await _authListo; q = q.or(filtroMios()); }
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
  else if (sortCol === 'folio') q = q.order('id', {ascending: asc});   // los folios son aleatorios (folios.sql)
  else q = q.order('fecha', {ascending: asc});

  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="9" style="color:red">${esc(error.message)}</td></tr>`; return; }

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
      : `${all.length} ${all.length!==1?'infracciones':'infracción'} en total`;
  }

  // Pagination
  const pages = Math.max(1, Math.ceil(all.length/INF_PAGE_SIZE));
  if (_infPage > pages) _infPage = pages;
  const rows = all.slice((_infPage-1)*INF_PAGE_SIZE, _infPage*INF_PAGE_SIZE);

  const montoColor = { pagada:'var(--green)', vencida:'var(--red)', pendiente:'var(--amber)', impugnada:'var(--blue)', cancelada:'var(--muted)' };

  tbody.innerHTML = rows.length ? rows.map(r=>`
    <tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer">
      <td class="mono" style="font-size:.73rem;font-weight:700">${esc(r.folio||'—')}</td>
      <td style="font-size:.78rem;white-space:nowrap">${fmtDateShort(r.fecha)}</td>
      <td>
        <span style="font-family:monospace;font-weight:700;font-size:.8rem">${esc(r.placa)}</span>
        ${placaCount[r.placa]>1?`<span title="${placaCount[r.placa]} infracciones — Reincidente" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--amber-bg);color:var(--amber);font-size:.55rem;font-weight:800;margin-left:.25rem;cursor:default">R</span>`:''}
      </td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.infractor)}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem">${esc(r.tipo)}</td>
      <td style="font-weight:700;color:${montoColor[r.estado]||'var(--text)'}">${fmt(r.monto)}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td style="font-size:.75rem;color:var(--muted);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.oficial||'—')}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;text-align:right;padding-right:.6rem">
        ${(r.estado==='pendiente'||r.estado==='vencida')?`<button class="btn btn-sm" style="background:var(--green-bg);color:var(--green);border:1px solid #A7F3D0;padding:.25rem .6rem;font-size:.72rem" onclick="event.stopPropagation();openRegistrarPago('${r.id}')" title="Registrar pago">Cobrar</button>`:''}
        ${r.telefono?`<button class="btn-wa-icon" style="margin-left:.2rem"
          data-tel="${r.telefono.replace(/\D/g,'')}"
          data-nombre="${esc(r.infractor)}"
          data-folio="${esc(r.folio||'')}"
          data-placa="${esc(r.placa||'')}"
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
  if ($('inf-alcance')) _infMias = $('inf-alcance').value === 'mias';
  _infPage = 1;
  renderInfracciones();
}

async function submitInfraccion(e) {
  e.preventDefault();
  const btn = $('inf-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  const id = $('inf-id').value;

  // Sin señal (solo boletas nuevas): se guarda en el dispositivo y se sube sola
  // al volver internet. Las fotos se guardan comprimidas para subirlas después.
  let sinSenal = !id && !navigator.onLine;

  // Fotos: se comprimen y se suben a Storage; en la base solo van las rutas
  let fotosArr = [], fotosPendientes = [];
  if (!sinSenal) {
    try { fotosArr = await subirFotos(document.getElementById('inf-fotos'), 'infracciones'); }
    catch (err) {
      if (!id && esErrorDeRed(err)) sinSenal = true;
      else {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
        alert('No se pudieron subir las fotos: ' + err.message); return;
      }
    }
  }
  if (sinSenal) fotosPendientes = await fotosComoDataURL(document.getElementById('inf-fotos'));

  const payload = {
    fecha:          $('inf-fecha').value ? new Date($('inf-fecha').value).toISOString() : new Date().toISOString(),
    placa:          $('inf-placa').value.trim().toUpperCase(),
    infractor:      $('inf-infractor').value.trim(),
    licencia:       ($('inf-licencia')||{}).value?.trim() || '',
    vehiculo:       ($('inf-vehiculo')||{}).value?.trim() || '',
    color_vehiculo: ($('inf-color')||{}).value?.trim()    || '',
    oficial:        ($('inf-oficial')||{}).value?.trim()  || '',
    tipo:           $('inf-tipo').value,
    catalogo_numero: parseInt(($('inf-catalogo')||{}).value) || null,
    monto:          parseInt($('inf-monto').value)||0,
    ubicacion:      $('inf-ubicacion').value.trim(),
    estado:         $('inf-est').value,
    obs:            $('inf-obs').value.trim(),
    telefono:       ($('inf-telefono')||{}).value?.trim() || '',
    infractor_domicilio: ($('inf-domicilio')||{}).value?.trim() || '',
    infractor_correo:    ($('inf-correo')||{}).value?.trim() || '',
    infractor_ausente:   !!($('inf-ausente')||{}).checked,
    licencia_tipo:       ($('inf-licencia-tipo')||{}).value?.trim() || '',
    circunstancias:      circunstanciasSeleccionadas(),
    documento_retenido:  ($('inf-doc-retenido')||{}).value || '',
    documento_numero:    ($('inf-doc-numero')||{}).value?.trim() || '',
    firma_infractor:     firmaDataURL('firma-infractor'),
    firma_oficial:       firmaDataURL('firma-oficial'),
    firma_negada:        !!($('inf-firma-negada')||{}).checked,
    lat:            window._infLat || null,
    lng:            window._infLng || null,
    fotos:          fotosArr.length ? JSON.stringify(fotosArr) : (id ? undefined : '[]')
  };
  if (payload.fotos === undefined) delete payload.fotos;

  // Fundamento legal: obligatorio en altas; el tipo libre toma la descripción del reglamento
  const cat = catalogoPorNumero(payload.catalogo_numero);
  if (!id && !cat) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
    alert('Selecciona el artículo del reglamento que fundamenta la infracción.');
    $('inf-catalogo-buscar')?.focus();
    return;
  }
  if (!payload.catalogo_numero) delete payload.catalogo_numero;
  if (cat && payload.tipo === 'Otro') payload.tipo = cat.descripcion;

  // Motivación (art. 327 fr. II inciso b): domicilio, o constancia de que no se proporcionó
  if (!id && !payload.infractor_domicilio && !payload.infractor_ausente) {
    if (!confirm('Falta el domicilio del infractor.\n\n¿Hacer constar que no se encontraba presente o no lo proporcionó (art. 327)?')) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
      $('inf-domicilio')?.focus();
      return;
    }
    payload.infractor_ausente = true;
    if ($('inf-ausente')) $('inf-ausente').checked = true;
  }
  if (!id && !payload.firma_infractor && !payload.firma_negada) {
    if (!confirm('El infractor no ha firmado.\n\n¿Hacer constar que se negó a firmar?')) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
      return;
    }
    payload.firma_negada = true;
  }
  if (!id) payload.boleta = _boletaGrupo || (_boletaGrupo = crypto.randomUUID());
  const continuar = { datos: datosBoletaActual(), circunstancias: [], lat: window._infLat, lng: window._infLng,
    firmas: { infractor: payload.firma_infractor, oficial: payload.firma_oficial }, firmaNegada: payload.firma_negada };

  if (sinSenal) {
    await encolarBoleta(payload, fotosPendientes);
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
    closeModal('modal-infraccion');
    showToast('Sin señal: la boleta quedó guardada en este dispositivo y se subirá sola');
    if (confirm('¿Registrar otra infracción del mismo conductor en esta boleta?')) {
      _boletaGrupo = payload.boleta; continuar.n = await contarBoleta(payload.boleta); openNewInfraccion(continuar);
    }
    return;
  }

  // ── Verificar adeudos antes de registrar infracción nueva ──
  if (!id) {
    // Usar cache de checkPlacaHistory si la placa coincide, si no consultar la BD
    let adeudos = window._placaAdeudos || [];
    let montoAdeudos = window._placaMontoAdeudos || 0;

    // Si el cache está vacío o puede ser de otra placa, consultar de nuevo
    if (!adeudos.length) {
      const { data: adData } = await _sb.from('infracciones')
        .select('folio,monto,tipo,boleta').eq('placa', payload.placa).in('estado',['pendiente','vencida']);
      adeudos = (adData || []).filter(r => !(_boletaGrupo && r.boleta === _boletaGrupo));
      montoAdeudos = adeudos.reduce((a,r)=>a+Number(r.monto),0);
    }

    if (adeudos.length > 0) {
      const folios = adeudos.slice(0,3).map(a=>a.folio||'—').join(', ');
      const confirmMsg =
        `⚠ ADEUDOS PENDIENTES DE PAGO\n\n` +
        `La placa ${esc(payload.placa)} tiene ${adeudos.length} ${adeudos.length>1?'infracciones':'infracción'} sin pagar por un total de $${montoAdeudos.toLocaleString('es-MX')} MXN.\n` +
        `Folios: ${folios}${adeudos.length>3?` y ${adeudos.length-3} más`:''}\n\n` +
        `El infractor deberá regularizar sus adeudos en Tesorería Municipal.\n\n` +
        `¿Desea registrar la nueva infracción de todas formas?`;

      const ok = window.confirm(confirmMsg);
      if (!ok) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
        return;
      }

      // Auto-anotar en observaciones
      const adeudoNota = `Reincidente con ${adeudos.length} adeudo${adeudos.length>1?'s':''} previo${adeudos.length>1?'s':''} sin pagar ($${montoAdeudos.toLocaleString('es-MX')} MXN) — Debe regularizar en Tesorería Municipal`;
      payload.obs = payload.obs ? `${payload.obs} | ${adeudoNota}` : adeudoNota;
    }
  }

  if (id) {
    const { error } = await _sb.from('infracciones').update(payload).eq('id', id);
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('infraccion', `Infracción actualizada — ${payload.tipo} (${payload.placa})`);
    closeModal('modal-infraccion');
  } else {
    payload.token_verificacion = crypto.randomUUID();
    const { data, error } = await _sb.from('infracciones').insert(payload).select().single();
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
    if (error && esErrorDeRed(error)) {
      // Se cayó la señal justo al guardar: a la cola, con las fotos ya subidas
      await encolarBoleta(payload, []);
      closeModal('modal-infraccion');
      showToast('Se perdió la señal: la boleta quedó guardada y se subirá sola');
      return;
    }
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('infraccion', `Infracción ${data.folio} registrada — ${payload.tipo} (${payload.placa})`);
    closeModal('modal-infraccion');
    if (confirm(`Infracción ${data.folio} registrada.\n\n¿Registrar otra infracción del mismo conductor en esta boleta? (art. 327)`)) {
      continuar.n = await contarBoleta(data.boleta);
      openNewInfraccion(continuar);
      renderInfracciones(); renderDashboard();
      return;
    }
    _boletaGrupo = null;
    printTicket80(data.id);
    if (payload.telefono) notificarWhatsApp(data);
  }

  renderInfracciones();
  renderDashboard();
}

async function contarBoleta(boleta) {
  try { const { count } = await _sb.from('infracciones').select('id', { count: 'exact', head: true }).eq('boleta', boleta); return count || 1; }
  catch (_) { return 1; }
}

// Infracciones de la misma boleta, con la de mayor cuantía primero
async function infraccionesDeBoleta(r) {
  if (!r.boleta) return [r];
  const { data } = await _sb.from('infracciones').select('id,folio,tipo,fundamento,monto,circunstancias,catalogo_numero').eq('boleta', r.boleta).order('monto', { ascending: false });
  return data && data.length ? data : [r];
}

// ── Boletas sin señal ─────────────────────────────────────
// Si el oficial no tiene internet, la boleta se guarda en IndexedDB (con sus
// fotos comprimidas) y se sube sola cuando vuelve la señal. Cada boleta lleva
// su token_verificacion desde el dispositivo: si la subida se corta a medias y
// se reintenta, el índice único de ese token evita que quede duplicada.
const esErrorDeRed = err => /failed to fetch|networkerror|network request failed|load failed/i.test(String(err?.message || err || ''));

function _colaDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('transito', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('boletas')) db.createObjectStore('boletas', { keyPath: 'token' });
      if (!db.objectStoreNames.contains('cobros')) db.createObjectStore('cobros', { keyPath: 'token' });   // Caja sin conexión
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function _colaTx(modo, fn, store = 'boletas') {
  const db = await _colaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}
const colaListar = () => _colaTx('readonly', st => st.getAll()).then(r => r || []);
const colaGuardar = item => _colaTx('readwrite', st => st.put(item));
const colaQuitar = token => _colaTx('readwrite', st => st.delete(token));
const cobrosListar = () => _colaTx('readonly', st => st.getAll(), 'cobros').then(r => r || []);
const cobrosGuardar = item => _colaTx('readwrite', st => st.put(item), 'cobros');
const cobrosQuitar = token => _colaTx('readwrite', st => st.delete(token), 'cobros');

async function fotosComoDataURL(fileInput) {
  const out = [];
  if (!fileInput || !fileInput.files.length) return out;
  for (let i = 0; i < Math.min(fileInput.files.length, 3); i++) out.push(await compressPhoto(fileInput.files[i]));
  return out;
}

async function encolarBoleta(payload, fotos) {
  const token = payload.token_verificacion || crypto.randomUUID();
  await colaGuardar({ token, payload: { ...payload, token_verificacion: token }, fotos: fotos || [], guardada: new Date().toISOString(), error: '' });
  await actualizarIndicadorCola();
}

let _sincronizando = false;
async function sincronizarCola() {
  if (_sincronizando || !navigator.onLine) return;
  _sincronizando = true;
  const subidas = [];
  try {
    for (const item of await colaListar()) {
      try {
        const p = { ...item.payload };
        if (item.fotos.length) {
          const rutas = [];
          for (const f of item.fotos) {
            const blob = await (await fetch(f)).blob();
            const ruta = `infracciones/${new Date(p.fecha).getFullYear()}/${crypto.randomUUID()}.jpg`;
            const { error } = await _sb.storage.from('evidencias').upload(ruta, blob, { contentType: 'image/jpeg' });
            if (error) throw error;
            rutas.push(ruta);
          }
          p.fotos = JSON.stringify(rutas);
          // Si algo falla más adelante, no volver a subir las mismas fotos
          await colaGuardar({ ...item, payload: p, fotos: [] });
        }
        const nota = `Capturada sin señal el ${new Date(item.guardada).toLocaleString('es-MX')}`;
        p.obs = p.obs ? `${p.obs} | ${nota}` : nota;
        let { data, error } = await _sb.from('infracciones').insert(p).select('id,folio,placa,tipo').single();
        if (error && error.code === '23505') {
          // Ya se había subido (se cortó la respuesta): tomar la existente
          ({ data, error } = await _sb.from('infracciones').select('id,folio,placa,tipo').eq('token_verificacion', item.token).single());
        }
        if (error) throw error;
        await colaQuitar(item.token);
        subidas.push(data);
        logActivity('infraccion', `Infracción ${data.folio} registrada sin señal — ${data.tipo} (${data.placa})`).catch(() => {});
      } catch (err) {
        if (esErrorDeRed(err)) break;          // sigue sin señal: reintentar después
        await colaGuardar({ ...(await colaListar()).find(i => i.token === item.token) || item, error: err.message || String(err) });
      }
    }
  } finally {
    _sincronizando = false;
    await actualizarIndicadorCola();
  }
  if (subidas.length) {
    showToast(subidas.length === 1 ? `Se subió la boleta ${subidas[0].folio} levantada sin señal`
                                   : `Se subieron ${subidas.length} boletas levantadas sin señal`);
    if ($('view-infracciones')?.classList.contains('active')) renderInfracciones();
    if ($('view-dashboard')?.classList.contains('active')) renderDashboard();
  }
  return subidas;
}

async function actualizarIndicadorCola() {
  let items = [];
  try { items = await colaListar(); } catch (_) {}
  let el = $('cola-boletas');
  if (!items.length) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('button');
    el.id = 'cola-boletas';
    el.type = 'button';
    el.className = 'cola-chip';
    el.onclick = () => verColaBoletas();
    const right = document.querySelector('.topbar-right');
    if (right) right.prepend(el); else document.body.appendChild(el);
  }
  const conError = items.filter(i => i.error).length;
  el.classList.toggle('cola-error', !!conError);
  el.textContent = `${items.length} ${items.length === 1 ? 'boleta' : 'boletas'} por subir`;
  el.title = conError ? 'Hay boletas que no se pudieron subir: toca para ver' : 'Se subirán solas al volver la señal';
}

async function verColaBoletas() {
  const items = await colaListar();
  if (navigator.onLine) await sincronizarCola();
  const quedan = await colaListar();
  if (!quedan.length) return;
  const lineas = quedan.map(i => `• ${i.payload.placa} · ${i.payload.tipo} · ${new Date(i.guardada).toLocaleString('es-MX')}` + (i.error ? `\n   No se pudo subir: ${i.error}` : ''));
  alert(`${quedan.length} ${quedan.length === 1 ? 'boleta guardada' : 'boletas guardadas'} en este dispositivo:\n\n${lineas.join('\n')}\n\n` +
        (navigator.onLine ? 'Se reintentará en unos minutos.' : 'Se subirán solas cuando vuelva la señal.'));
}

// ── Caja sin conexión ─────────────────────────────────────
// Caja guarda la última lista de pendientes. Sin internet, el cobro se anota
// en IndexedDB con su token (el del recibo) y la hora real del cobro; al volver
// la señal, registrar_pago_diferido lo registra con el descuento que tocaba a
// esa hora. Si otra caja ya la cobró, queda marcado para revisarlo a mano.
async function encolarCobro(r, aplicarDescuento, metodo, notas, montoFinal) {
  const item = {
    token: crypto.randomUUID(), infraccion_id: Number(r.id), folio: r.folio || '', placa: r.placa || '', infractor: r.infractor || '',
    tipo: r.tipo || '', monto_original: Number(r.monto), monto_final: montoFinal, aplicar_descuento: aplicarDescuento,
    metodo, notas, cajero: _session?.name || '', cobrado_at: new Date().toISOString(), error: '',
  };
  await cobrosGuardar(item);
  const cache = _leerLocal('tm_pendientes');
  if (cache?.rows) { cache.rows = cache.rows.filter(x => String(x.id) !== String(r.id)); _guardarLocal('tm_pendientes', cache); }
  await actualizarIndicadorCobros();
  return item;
}

let _sincCobros = false;
async function sincronizarCobros() {
  if (_sincCobros || !navigator.onLine) return;
  _sincCobros = true;
  let n = 0;
  try {
    for (const c of await cobrosListar()) {
      if (c.error) continue;
      const nota = `Cobrado sin conexión el ${new Date(c.cobrado_at).toLocaleString('es-MX')} por ${c.cajero}`;
      const { data, error } = await _sb.rpc('registrar_pago_diferido', {
        p_infraccion_id: c.infraccion_id, p_aplicar_descuento: c.aplicar_descuento, p_metodo: c.metodo,
        p_notas: c.notas ? `${c.notas} | ${nota}` : nota, p_cobrado_at: c.cobrado_at, p_token: c.token,
      });
      if (error && esErrorDeRed(error)) break;
      if (error) { await cobrosGuardar({ ...c, error: error.message }); continue; }
      await cobrosQuitar(c.token);
      n++;
      logActivity('infraccion', `Pago registrado sin conexión — ${data.folio_inf}: ${fmt(data.monto_final)} (${c.metodo})`).catch(() => {});
    }
  } finally {
    _sincCobros = false;
    await actualizarIndicadorCobros();
  }
  if (n) {
    showToast(n === 1 ? 'Se registró 1 cobro hecho sin conexión' : `Se registraron ${n} cobros hechos sin conexión`);
    if ($('view-caja')?.classList.contains('active')) renderCaja();
  }
}

async function actualizarIndicadorCobros() {
  let items = [];
  try { items = await cobrosListar(); } catch (_) {}
  let el = $('cola-cobros');
  if (!items.length) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('button');
    el.id = 'cola-cobros'; el.type = 'button'; el.className = 'cola-chip';
    el.onclick = () => verColaCobros();
    const right = document.querySelector('.topbar-right');
    if (right) right.prepend(el); else document.body.appendChild(el);
  }
  const conError = items.filter(i => i.error).length;
  el.classList.toggle('cola-error', !!conError);
  el.textContent = conError ? `${conError} ${conError === 1 ? 'cobro' : 'cobros'} por revisar` : `${items.length} ${items.length === 1 ? 'cobro' : 'cobros'} por subir`;
  el.title = conError ? 'Hay cobros sin conexión que no se pudieron registrar: toca para ver' : 'Se registrarán solos al volver la señal';
}

async function verColaCobros() {
  if (navigator.onLine) await sincronizarCobros();
  const quedan = await cobrosListar();
  if (!quedan.length) return;
  const lineas = quedan.map(c => `• ${c.folio} · ${c.placa} · ${fmt(c.monto_final)} ${c.metodo} · ${new Date(c.cobrado_at).toLocaleString('es-MX')}` + (c.error ? `\n   No se registró: ${c.error}` : ''));
  const conError = quedan.filter(c => c.error);
  if (conError.length && confirm(`Cobros hechos sin conexión:\n\n${lineas.join('\n')}\n\n` +
      `Los que no se registraron necesitan revisión (por ejemplo, otra caja ya los cobró: devuelve el dinero o avisa al Director).\n\n¿Quitar de la lista los ${conError.length} ya revisados?`)) {
    for (const c of conError) await cobrosQuitar(c.token);
    await actualizarIndicadorCobros();
  } else if (!conError.length) {
    alert(`Cobros hechos sin conexión:\n\n${lineas.join('\n')}\n\nSe registrarán solos al volver la señal.`);
  }
}

function printComprobanteProvisional(c) {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comprobante provisional ${esc(c.folio)}</title>
  <style>body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;font-size:11px;color:#000}h1{font-size:13px;text-align:center;margin:6px 0}
  .c{text-align:center}.r{display:flex;justify-content:space-between;margin:2px 0}.t{font-size:16px;font-weight:900;text-align:center;margin:6px 0}
  .aviso{border:1.5px dashed #000;padding:4px;margin-top:6px;font-size:10px;text-align:center}@media print{button{display:none}}</style></head><body>
  <button onclick="window.print()">Imprimir</button>
  <h1>COMPROBANTE PROVISIONAL DE PAGO</h1>
  <div class="c">${esc(_cachedConfig?.municipio || '')} · Tesorería / Caja de Tránsito</div><hr>
  <div class="r"><span>Infracción</span><b>${esc(c.folio)}</b></div>
  <div class="r"><span>Placa</span><span>${esc(c.placa)}</span></div>
  <div class="r"><span>Infractor</span><span>${esc(c.infractor)}</span></div>
  <div class="r"><span>Motivo</span><span>${esc(c.tipo)}</span></div>
  <div class="r"><span>Monto original</span><span>${fmt(c.monto_original)}</span></div>
  <div class="t">${fmt(c.monto_final)}</div>
  <div class="r"><span>Forma de pago</span><span>${esc(c.metodo)}</span></div>
  <div class="r"><span>Cajero</span><span>${esc(c.cajero)}</span></div>
  <div class="r"><span>Fecha</span><span>${new Date(c.cobrado_at).toLocaleString('es-MX')}</span></div>
  <div class="r"><span>Clave</span><span style="font-family:monospace">${esc(c.token.slice(0, 8).toUpperCase())}</span></div>
  <div class="aviso">Cobro hecho sin conexión. El recibo oficial con código QR queda registrado al volver el internet y se puede reimprimir en Caja con el folio.</div>
  </body></html>`;
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) { alert('Permite las ventanas emergentes para imprimir el comprobante'); return; }
  w.document.write(html); w.document.close();
}

window.addEventListener('online', () => { checkConexion().then(ok => { if (ok) { sincronizarCola(); sincronizarCobros(); } }); });
window.addEventListener('offline', () => checkConexion());

function _leerLocal(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }
function _guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }

// ── Catálogo del reglamento (fundamento legal) ───────────
// Tabulador de infracciones del Reglamento de Tránsito (ver articulos.sql).
let _catalogo = null;
async function cargarCatalogo() {
  if (_catalogo) return _catalogo;
  const { data, error } = await _sb.from('catalogo_infracciones').select('*').eq('activo', true).order('numero');
  if (error) {
    // Sin señal: se usa la copia guardada para poder levantar boletas
    const local = _leerLocal('tm_catalogo');
    if (local?.length) return (_catalogo = local);
    console.error('catálogo:', error); return [];
  }
  _guardarLocal('tm_catalogo', data || []);
  return (_catalogo = data || []);
}
// Deja en el dispositivo el catálogo y la configuración (UMA, descuentos) para
// que el oficial pueda levantar boletas aunque se quede sin señal.
async function precargarSinSenal() {
  const { data } = await _sb.from('configuracion').select('*').eq('id', 1).single();
  if (data) { _cachedConfig = { ...(_cachedConfig||{}), ...data }; _guardarLocal('tm_config', data); }
  else if (!_cachedConfig) _cachedConfig = _leerLocal('tm_config');
  await cargarCatalogo();
}
function catalogoPorNumero(n) { return (_catalogo||[]).find(c => c.numero === Number(n)) || null; }
function citaCorta(c) {
  return `Art. ${c.articulo}${c.fraccion ? (/párrafo|anexo/i.test(c.fraccion) ? ', ' + c.fraccion : ' fr. ' + c.fraccion) : ''}${c.inciso ? ' inc. ' + c.inciso : ''}`;
}
function etiquetaCatalogo(c) { return `${citaCorta(c)} — ${c.descripcion} [#${c.numero}]`; }
function rangoMonto(c, cfg) {
  const uma = Number(cfg?.valor_uma) || 0;
  if (c.cuotas_min == null) return { min: 0, max: 0, uma, sinMulta: true };   // amonestación / arresto
  // Igual que el servidor (aplicar_fundamento): UMA × cuotas, redondeado hacia abajo
  return uma ? { min: Math.floor(c.cuotas_min * uma), max: Math.floor(c.cuotas_max * uma), uma } : null;
}
// Texto de los artículos del reglamento citados (se cargan al abrirlos)
const _articulos = {};
async function leerArticulos(det, numero) {
  if (!det.open || det.dataset.cargado) return;
  const c = catalogoPorNumero(numero); if (!c) return;
  const faltan = (c.articulos_ref || []).filter(n => !_articulos[n]);
  if (faltan.length) {
    const { data } = await _sb.from('reglamento_articulos').select('numero,texto').in('numero', faltan);
    (data || []).forEach(a => { _articulos[a.numero] = a.texto; });
  }
  const box = det.querySelector('.fund-articulos');
  if (box) box.innerHTML = (c.articulos_ref || []).map(n => `<p style="margin:.35rem 0">${esc(_articulos[n] || ('Artículo ' + n))}</p>`).join('') || esc(c.texto);
  det.dataset.cargado = '1';
}
function tarjetaFundamento(c, cfg) {
  const r = rangoMonto(c, cfg);
  const badge = { 'Leve':'badge-green', 'Grave':'badge-yellow', 'Muy Grave':'badge-red' }[c.clasificacion] || 'badge-muted';
  const sancion = r?.sinMulta
    ? `Sanción: <strong>${esc(c.clasificacion)}</strong> (sin multa)`
    : c.cuotas_min === c.cuotas_max
      ? `Sanción: <strong>${c.cuotas_min} UMA</strong>${r ? ` = <strong>${fmt(r.min)}</strong>` : ''}`
      : `Sanción: <strong>${c.cuotas_min} UMA</strong>${r ? ` (${fmt(r.min)})` : ''}; con agravante <strong>${c.cuotas_max} UMA</strong>${r ? ` (${fmt(r.max)})` : ''}`;
  return `<div style="background:var(--stone);border:1px solid var(--border);border-radius:8px;padding:.6rem .75rem;margin-top:.4rem;font-size:.78rem;line-height:1.45">
    <div style="font-weight:700;color:var(--ink)">${esc(citaCorta(c))}
      ${c.clasificacion ? `<span class="${badge}">${esc(c.clasificacion)}</span>` : ''}
      ${c.grave ? '<span class="badge-red" title="Se paga íntegra, sin descuento">Sin descuento</span>' : ''}</div>
    <div style="color:var(--muted);margin:.15rem 0">${esc(cfg?.reglamento || 'Reglamento de Tránsito')}${c.categoria ? ' · ' + esc(c.categoria) : ''}</div>
    <div>${sancion}${r && !r.sinMulta ? ` <span style="color:var(--muted)">· UMA $${r.uma}</span>` : ''}</div>
    ${c.nota ? `<div style="color:var(--muted);font-size:.72rem;margin-top:.15rem">${esc(c.nota)}</div>` : ''}
    <details style="margin-top:.3rem" ontoggle="leerArticulos(this, ${Number(c.numero)})"><summary style="cursor:pointer;color:var(--ac);font-weight:600">Leer los artículos del reglamento</summary>
      <div class="fund-articulos" style="margin-top:.3rem;white-space:normal">${c.articulos_ref?.length ? 'Cargando…' : esc(c.texto)}</div></details>
  </div>`;
}

// ── Firmas en el teléfono ─────────────────────────────────
// Se guardan como PNG (data URL) en la boleta; funcionan sin señal.
const _firmas = {};
function iniciarFirma(id, previa) {
  const c = $(id); if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827';
  const f = _firmas[id] = { vacio: true };
  if (previa) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height); img.src = previa; f.vacio = false; }
  if (c.dataset.listo) return;
  c.dataset.listo = '1';
  let trazando = false;
  const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', e => { trazando = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
  c.addEventListener('pointermove', e => { if (!trazando) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); _firmas[id].vacio = false; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => c.addEventListener(ev, () => { trazando = false; }));
}
function limpiarFirma(id) { iniciarFirma(id); }
function firmaDataURL(id) { const c = $(id); return c && _firmas[id] && !_firmas[id].vacio ? c.toDataURL('image/png') : ''; }
const imgFirma = (src, alto = 34) => src && /^data:image\/png;base64,/.test(src) ? `<img src="${src}" alt="Firma" style="height:${alto}mm;max-width:100%;object-fit:contain;display:block;margin:0 auto"/>` : '';
const DOC_RETENIDO = { licencia: 'Licencia o permiso de conducir', tarjeta_circulacion: 'Tarjeta de circulación' };

// ── Historial del conductor (por número de licencia) ──────
// La reincidencia (art. 331 fr. II inc. g) es del conductor, no del vehículo.
window._conductorPrevias = [];
async function checkConductorHistory() {
  const lic = ($('inf-licencia')?.value || '').trim();
  const box = $('conductor-history');
  if (lic.length < 4) { window._conductorPrevias = []; if (box) box.innerHTML = ''; sugerirAgravanteAdeudos(); return; }
  let data = [];
  try {
    ({ data } = await _sb.rpc('historial_conductor', { p_licencia: lic }));
  } catch (_) { data = []; }
  const previas = (data || []).filter(r => !(_boletaGrupo && r.boleta === _boletaGrupo));
  window._conductorPrevias = previas;
  if (box) box.innerHTML = previas.length ? `<div style="font-size:.78rem;background:var(--amber-bg,#FFFBEB);border:1px solid #FDE68A;border-radius:8px;padding:.5rem .7rem;margin:-.2rem 0 .6rem">
    <strong>Conductor con ${previas.length} infracción(es) previa(s)</strong> (licencia ${esc(lic)}):
    ${previas.slice(0, 4).map(r => `${esc(r.folio||'—')} · ${esc(r.tipo)} · ${esc(r.placa)} · ${estadoBadge(r.estado)}`).join('<br>')}</div>` : '';
  sugerirAgravanteAdeudos();
  sugerirReincidencia();
}
function sugerirReincidencia() {
  if ($('inf-id')?.value) return;
  const cat = parseInt(($('inf-catalogo')||{}).value) || null;
  const misma = cat && (window._conductorPrevias || []).some(r => r.catalogo_numero === cat);
  const cb = document.querySelector('.inf-circ[value="agr_g"]');
  const nota = document.querySelector('.circ-nota[data-c="agr_g"]');
  if (nota) nota.textContent = misma ? ' — sugerida: el conductor ya cometió esta infracción' : '';
  if (cb && !cb.dataset.tocado) { cb.checked = !!misma; recalcularMonto(); }
}

// ── Circunstancias agravantes y atenuantes (art. 331) ──────
// La lista es la del Reglamento (también en la tabla circunstancias_331, que
// valida el servidor). Con al menos una agravante se cobra la UMA "con
// agravante" del tabulador; sin agravantes, la UMA base.
const CIRCUNSTANCIAS_331 = [
  ['agr_a','agravante','II','a','Cometer la infracción en estado de ebriedad o de intoxicación por sustancias estupefacientes o psicotrópicas'],
  ['agr_b','agravante','II','b','Abandonar a las víctimas del accidente o no procurarles la ayuda requerida, pudiendo hacerlo'],
  ['agr_c','agravante','II','c','Evadir la acción de la justicia por fuga u ocultamiento'],
  ['agr_d','agravante','II','d','Borrar, alterar u ocultar señales, huellas, indicios o vestigios de la infracción, u obstaculizar las investigaciones'],
  ['agr_e','agravante','II','e','Tener infracciones anteriores sin haber sido pagadas'],
  ['agr_f','agravante','II','f','Conducir sin licencia, con licencia vencida o que no corresponda al vehículo, o con la licencia suspendida'],
  ['agr_g','agravante','II','g','La reincidencia'],
  ['agr_h','agravante','II','h','No cumplir con las obligaciones y requisitos señalados en la Ley y el Reglamento'],
  ['agr_i','agravante','II','i','Que la infracción ocasione o pueda ocasionar lesiones o daños, o ponga en peligro a las personas o a su patrimonio'],
  ['ate_a','atenuante','I','a','El auxilio y ayuda inmediata a las víctimas de un accidente'],
  ['ate_b','atenuante','I','b','Oportuna y espontánea reparación de daños y perjuicios ocasionados'],
  ['ate_c','atenuante','I','c','Avisar a la autoridad más cercana'],
  ['ate_d','atenuante','I','d','Respeto a autoridades y policías viales'],
  ['ate_e','atenuante','I','e','Acatamiento a las órdenes y disposiciones de las autoridades']
].map(([codigo, tipo, fraccion, inciso, descripcion]) => ({ codigo, tipo, fraccion, inciso, descripcion }));

function renderCircunstancias(seleccion) {
  const box = $('inf-circunstancias'); if (!box) return;
  const sel = new Set(seleccion || []);
  const grupo = (tipo, titulo) => `<div style="font-weight:700;margin:.3rem 0 .15rem;color:${tipo==='agravante'?'var(--red)':'var(--green)'}">${titulo}</div>` +
    CIRCUNSTANCIAS_331.filter(x => x.tipo === tipo).map(x => `<label style="display:flex;gap:.4rem;align-items:flex-start;cursor:pointer;margin:.1rem 0">
      <input type="checkbox" class="inf-circ" value="${x.codigo}" ${sel.has(x.codigo)?'checked':''} onchange="this.dataset.tocado='1';recalcularMonto()"/>
      <span>${esc(x.descripcion)} <span style="color:var(--muted)">(fr. ${x.fraccion}, inc. ${x.inciso})</span><span class="circ-nota" data-c="${x.codigo}" style="color:var(--amber);font-weight:600"></span></span></label>`).join('');
  box.innerHTML = grupo('agravante', 'Agravantes (fr. II)') + grupo('atenuante', 'Atenuantes (fr. I)');
  recalcularMonto(false);
}
function circunstanciasSeleccionadas() { return [...document.querySelectorAll('.inf-circ:checked')].map(x => x.value); }
function textoCircunstancia(codigo) {
  const x = CIRCUNSTANCIAS_331.find(c => c.codigo === codigo);
  return x ? `${x.descripcion} (art. 331, fr. ${x.fraccion}, inc. ${x.inciso})` : codigo;
}

// Monto del tabulador: UMA base, o UMA con agravante si hay alguna agravante
function recalcularMonto(fijar = true) {
  const sel = circunstanciasSeleccionadas();
  const agr = sel.some(c => c.startsWith('agr_'));
  const res = $('inf-circ-resumen');
  if (res) res.textContent = sel.length ? `— ${sel.filter(c=>c.startsWith('agr_')).length} agravante(s), ${sel.filter(c=>c.startsWith('ate_')).length} atenuante(s)` : '';
  const c = catalogoPorNumero(($('inf-catalogo')||{}).value);
  const r = c && rangoMonto(c, _cachedConfig);
  if (fijar && r && $('inf-monto')) $('inf-monto').value = r.sinMulta ? 0 : (agr ? r.max : r.min);
  updateInfSummary();
}

// Sugerir la agravante del inciso e) cuando la placa tiene multas sin pagar
function sugerirAgravanteAdeudos() {
  if ($('inf-id')?.value) return;
  const cb = document.querySelector('.inf-circ[value="agr_e"]');
  const nota = document.querySelector('.circ-nota[data-c="agr_e"]');
  const ids = new Set((window._placaAdeudos || []).map(r => r.folio));
  (window._conductorPrevias || []).filter(r => r.estado === 'pendiente' || r.estado === 'vencida').forEach(r => ids.add(r.folio));
  const n = ids.size;
  if (nota) nota.textContent = n ? ` — sugerida: ${n} infracción(es) sin pagar` : '';
  if (cb && !cb.dataset.tocado) { cb.checked = n > 0; recalcularMonto(); }
}

async function prepararCatalogoForm() {
  const cat = await cargarCatalogo();
  const dl = $('inf-catalogo-lista');
  if (dl && !dl.children.length) dl.innerHTML = cat.map(c => `<option value="${esc(etiquetaCatalogo(c))}"></option>`).join('');
}

// fijarMonto: en altas propone el monto mínimo del tabulador
function seleccionarCatalogo(numero, fijarMonto) {
  const c = catalogoPorNumero(numero);
  if ($('inf-catalogo')) $('inf-catalogo').value = c ? c.numero : '';
  if ($('inf-catalogo-buscar')) $('inf-catalogo-buscar').value = c ? etiquetaCatalogo(c) : '';
  const box = $('inf-fundamento');
  if (box) box.innerHTML = c ? tarjetaFundamento(c, _cachedConfig) : '<div style="font-size:.75rem;color:var(--muted);margin-top:.3rem">Busca la infracción en el reglamento para citar el artículo.</div>';
  const r = c && rangoMonto(c, _cachedConfig);
  if (c && fijarMonto) sugerirReincidencia();
  if (c && fijarMonto && r && $('inf-monto')) $('inf-monto').value = r.sinMulta ? 0 : (circunstanciasSeleccionadas().some(x => x.startsWith('agr_')) ? r.max : r.min);
  if ($('inf-monto')) {
    $('inf-monto').min = r ? r.min : 1; $('inf-monto').max = r && !r.sinMulta ? r.max : '';
    $('inf-monto').readOnly = !!r?.sinMulta; $('inf-monto').required = !r?.sinMulta;
  }
  updateInfSummary();
}

function onCatalogoBuscar() {
  const v = $('inf-catalogo-buscar')?.value || '';
  const m = v.match(/\[#(\d+)\]\s*$/);
  if (!m) return;
  const c = catalogoPorNumero(m[1]);
  if (!c) return;
  if ($('inf-tipo')) {
    const opts = [...$('inf-tipo').options].map(o => o.value);
    $('inf-tipo').value = c.tipo_rapido && opts.includes(c.tipo_rapido) ? c.tipo_rapido : 'Otro';
  }
  seleccionarCatalogo(c.numero, !$('inf-id').value);
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
  el.innerHTML = all.map(t => `<option value="${esc(t)}"${t === prev ? ' selected' : ''}>${esc(t)}</option>`).join('');
}

// Varias infracciones del mismo conductor van en una sola boleta (art. 327,
// último párrafo). _boletaGrupo identifica la boleta; se genera en el teléfono
// para que también funcione sin señal.
let _boletaGrupo = null;

async function openNewInfraccion(continuar) {
  const previos = continuar ? continuar.datos : null;
  if (!continuar) _boletaGrupo = null;
  $('modal-inf-title').textContent = continuar ? `Otra infracción en la misma boleta (${continuar.n + 1})` : 'Nueva infracción';
  $('inf-form').reset();
  $('inf-id').value = '';
  $('inf-fecha').value = new Date().toISOString().slice(0,16);
  $('inf-est').value = 'pendiente';
  if ($('inf-est-wrap')) $('inf-est-wrap').style.display = 'none';
  window._infLat = null; window._infLng = null;
  window._placaAdeudos = []; window._placaMontoAdeudos = 0;
  const geoStatus = document.getElementById('inf-geo-status');
  if (geoStatus) geoStatus.textContent = '';
  const geoBtn = document.getElementById('btn-geolocate');
  if (geoBtn) { geoBtn.textContent = 'GPS'; geoBtn.style.color = ''; geoBtn.disabled = false; }
  const prev = document.getElementById('inf-fotos-preview');
  if (prev) prev.innerHTML = '';
  const plHist = document.getElementById('placa-history');
  if (plHist) plHist.innerHTML = '';
  if ($('placa-ocr-status')) $('placa-ocr-status').textContent = '';
  // Pre-fill official with logged-in user if they are an oficial/supervisor
  if ($('inf-oficial')) {
    $('inf-oficial').dataset.preload = _session?.name || '';
  }
  if (previos) {
    // Misma boleta: se conservan los datos del conductor, vehículo y lugar
    Object.entries(previos).forEach(([k, v]) => { const el = $(k); if (!el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; });
    if ($('inf-oficial')) $('inf-oficial').dataset.preload = previos['inf-oficial'] || '';
    window._infLat = continuar.lat; window._infLng = continuar.lng;
  }
  loadOficiales(['inf-oficial']);
  openModal('modal-infraccion');
  if ($('inf-catalogo')) $('inf-catalogo').value = '';
  renderCircunstancias(previos ? continuar.circunstancias : []);
  window._conductorPrevias = [];
  if ($('conductor-history')) $('conductor-history').innerHTML = '';
  if ($('inf-doc-retenido')) $('inf-doc-retenido').value = '';
  if ($('inf-doc-numero')) $('inf-doc-numero').value = '';
  if ($('inf-firma-negada')) $('inf-firma-negada').checked = !!continuar?.firmaNegada;
  iniciarFirma('firma-infractor', continuar?.firmas?.infractor);
  iniciarFirma('firma-oficial', continuar?.firmas?.oficial);
  await loadTiposInfraccion();
  await prepararCatalogoForm();
  autoFillMonto();
  if (previos?.["inf-placa"]) checkPlacaHistory();
  if (previos?.["inf-licencia"]) checkConductorHistory();
}

const CAMPOS_BOLETA = ['inf-fecha','inf-placa','inf-vehiculo','inf-color','inf-infractor','inf-licencia','inf-licencia-tipo','inf-correo','inf-domicilio','inf-ausente','inf-telefono','inf-ubicacion','inf-oficial'];
function datosBoletaActual() {
  const d = {};
  CAMPOS_BOLETA.forEach(k => { const el = $(k); if (el) d[k] = el.type === 'checkbox' ? el.checked : el.value; });
  return d;
}

async function editInfraccion(id) {
  // Las infracciones registradas no se modifican (inmutable.sql): solo cambia su estado
  alert('Las infracciones registradas no se pueden modificar. Si hay un error, cancélala con su motivo y levanta una nueva.');
  return;
  const { data, error } = await _sb.from('infracciones').select('*').eq('id', id).single();
  if (error || !data) return;
  $('modal-inf-title').textContent = 'Editar infracción';
  if ($('inf-est-wrap')) $('inf-est-wrap').style.display = '';
  $('inf-id').value       = data.id;
  $('inf-fecha').value    = data.fecha ? data.fecha.slice(0,16) : '';
  $('inf-placa').value    = data.placa;
  $('inf-infractor').value= data.infractor;
  $('inf-licencia').value = data.licencia||'';
  if ($('inf-licencia-tipo')) $('inf-licencia-tipo').value = data.licencia_tipo||'';
  if ($('inf-domicilio')) $('inf-domicilio').value = data.infractor_domicilio||'';
  if ($('inf-correo')) $('inf-correo').value = data.infractor_correo||'';
  if ($('inf-ausente')) $('inf-ausente').checked = !!data.infractor_ausente;
  renderCircunstancias(data.circunstancias || []);
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
  if ($('inf-tipo') && $('inf-tipo').value !== data.tipo) $('inf-tipo').value = 'Otro';
  await prepararCatalogoForm();
  seleccionarCatalogo(data.catalogo_numero, false);
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
      (tipo   ? `<strong>${esc(tipo)}</strong>` : '') +
      (placa  ? ` · Placa <strong style="font-family:monospace">${esc(placa)}</strong>` : '') +
      (monto  ? ` · <strong style="color:var(--ac)">${fmt(monto)}</strong>` : '');
  } else {
    sumEl.style.display = 'none';
  }
}

async function autoFillMonto() {
  if ($('inf-id').value) return;
  const tipo = $('inf-tipo').value;
  if (!_cachedConfig?.valor_uma) {
    const { data } = await _sb.from('configuracion').select('*').eq('id',1).single();
    if (data) _cachedConfig = { ...(_cachedConfig||{}), ...data };
  }
  // El tipo rápido trae su artículo del reglamento y el monto mínimo del tabulador
  const cat = await cargarCatalogo();
  const c = cat.find(x => x.tipo_rapido === tipo);
  if (c) { seleccionarCatalogo(c.numero, true); return; }
  if (tipo === 'Otro') { seleccionarCatalogo(null); $('inf-catalogo-buscar')?.focus(); return; }
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
  if (error) { tbody.innerHTML = `<tr><td colspan="9" style="color:red">${esc(error.message)}</td></tr>`; return; }

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
      <td class="mono" style="font-size:.73rem;font-weight:700">${esc(r.num||'—')}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">${esc(r.titular)}</td>
      <td style="font-size:.78rem">${esc(r.tipo)}</td>
      <td style="font-family:monospace;font-weight:700;font-size:.8rem">${esc(r.placa||'—')}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem">${esc(r.ruta||'—')}</td>
      <td style="font-size:.78rem;white-space:nowrap">${fmtDateShort(r.vencimiento)}</td>
      <td><span style="background:${diasBg};color:${diasColor};font-weight:700;font-size:.78rem;padding:.15rem .5rem;border-radius:6px">${diasTxt}</span></td>
      <td>${estadoBadge(r.estado)}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;text-align:right;padding-right:.6rem">
        ${r.telefono && dias !== null && dias <= 15 && r.estado !== 'suspendido' ? `<button class="btn-wa-icon" title="Avisar por WhatsApp que vence" onclick="event.stopPropagation();avisarVencimientoPermiso(${jsArg(r.telefono)},${jsArg(r.titular)},${jsArg(r.num||'')},${jsArg(r.placa||'')},${jsArg(r.vencimiento)})">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#128C7E" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        </button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editPermiso('${r.id}')">Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();printPermiso('${r.id}')" title="Imprimir">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        </button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:2rem">Sin resultados</td></tr>`;

  renderPager('per-pager', _perPage, pages, 'goPerPage');
}

// Aviso de vencimiento por WhatsApp (el correo lo manda tareas-diarias 15 días antes)
function avisarVencimientoPermiso(tel, titular, num, placa, venc) {
  tel = String(tel || '').replace(/\D/g, ''); if (!tel) return;
  const dias = _diasVigencia(venc);
  const fecha = new Date(venc + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const cuando = dias < 0 ? `venció el ${fecha}` : dias === 0 ? 'vence hoy' : `vence el ${fecha} (en ${dias} día${dias === 1 ? '' : 's'})`;
  const msg = `Estimado/a ${titular}, le recordamos que su permiso de circulación${num ? ` ${num}` : ''}${placa ? ` de la placa ${placa}` : ''} ${cuando}.\n\n` +
    `Acuda a la Dirección de Tránsito y Movilidad Municipal para renovarlo y evitar infracciones.`;
  window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  showToast('WhatsApp listo para enviar');
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
    correo:      ($('per-correo')||{}).value?.trim()||'',
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
  if ($('per-correo')) $('per-correo').value = data.correo||'';
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
function fundamentoDetalle(r) {
  const c = catalogoPorNumero(r.catalogo_numero);
  if (!c && !r.fundamento) return '';
  return `<div style="margin-top:.75rem">
    <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.2rem">Fundamento legal</div>
    ${r.fundamento ? `<div style="font-size:.82rem;font-weight:600;color:var(--ink)">${esc(r.fundamento)}</div>` : '<div style="font-size:.75rem;color:var(--muted)">Registrada antes del catálogo; referencia según su tipo:</div>'}
    ${c ? tarjetaFundamento(c, _cachedConfig) : ''}
  </div>`;
}

async function viewDetail(tabla, id) {
  const { data, error } = await _sb.from(tabla).select('*').eq('id', id).single();
  if (error || !data) return;
  if (tabla === 'infracciones') {
    await cargarCatalogo();
    if (!_cachedConfig?.valor_uma) {
      const { data: cfg } = await _sb.from('configuracion').select('*').eq('id', 1).single();
      if (cfg) _cachedConfig = { ...(_cachedConfig||{}), ...cfg };
    }
  }
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
          <div style="font-family:monospace;font-size:1.15rem;font-weight:800;color:var(--ink)">${esc(r.folio||'—')}</div>
          <div style="font-size:.88rem;font-weight:700;color:var(--ink);margin-top:.3rem">${esc(r.tipo)}</div>
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
      <div class="detail-field"><label>Placa</label><span style="font-family:monospace;font-size:1rem;font-weight:800">${esc(r.placa)}</span></div>
      <div class="detail-field"><label>Color</label><span>${esc(r.color_vehiculo||'—')}</span></div>
      <div class="detail-field full"><label>Marca y modelo</label><span>${esc(r.vehiculo||'—')}</span></div>

      <!-- Infractor -->
      <div class="detail-field full">${secLabel('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>','Infractor')}</div>
      <div class="detail-field full"><label>Nombre</label><span style="font-weight:600;font-size:.88rem">${esc(r.infractor)}</span></div>
      <div class="detail-field"><label>Licencia o permiso</label><span>${esc(r.licencia||'—')}${r.licencia_tipo ? ' · ' + esc(r.licencia_tipo) : ''}</span></div>
      <div class="detail-field full"><label>Domicilio y correo</label><span>${r.infractor_ausente && !r.infractor_domicilio ? '<em>No se encontraba presente o no los proporcionó</em>' : `${esc(r.infractor_domicilio||'—')}${r.infractor_correo ? ' · ' + esc(r.infractor_correo) : ''}`}</span></div>
      <div class="detail-field"><label>Teléfono</label><span>${r.telefono?`<a href="https://wa.me/52${r.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener" style="color:#128C7E;text-decoration:none;display:inline-flex;align-items:center;gap:.3rem"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>${esc(r.telefono)}</a>`:'—'}</span></div>

      <!-- Infracción -->
      <div class="detail-field full">${secLabel('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/>','Datos de la infracción')}</div>
      <div class="detail-field"><label>Oficial</label><span>${esc(r.oficial||'—')}${r.oficial_placa ? ' · Placa ' + esc(r.oficial_placa) : ''}${r.oficial_adscripcion ? ' · ' + esc(r.oficial_adscripcion) : ''}</span></div>
      <div class="detail-field"><label>Estado actual</label><span>${estadoBadge(r.estado)}</span></div>
      <div class="detail-field full"><label>Ubicación</label>
        <span>${esc(r.ubicacion||'—')}${r.lat?` <a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:.25rem;color:var(--ac);font-size:.75rem;margin-left:.5rem;font-weight:600;text-decoration:none"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>Ver en mapa</a>`:''}</span>
      </div>
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span style="background:var(--stone);display:block;padding:.45rem .7rem;border-radius:6px;font-size:.82rem">${esc(r.obs)}</span></div>`:''}
      ${r.impugnacion_motivo?`<div class="detail-field full"><label>Motivo de impugnación</label><span style="background:var(--blue-bg);color:var(--blue);display:block;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;font-weight:500">${esc(r.impugnacion_motivo)}</span></div>`:''}
      ${fotos.length?`<div class="detail-field full"><label>Evidencia fotográfica</label><div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.4rem">${fotos.map(f=>`<img data-foto="${esc(f)}" alt="Foto de evidencia" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:var(--stone);cursor:pointer;transition:opacity .15s" onmouseenter="this.style.opacity='.75'" onmouseleave="this.style.opacity='1'" />`).join('')}</div></div>`:''}
    </div>
    ${fundamentoDetalle(r)}
    ${(r.circunstancias||[]).length ? `<div style="margin-top:.6rem"><div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.2rem">Circunstancias (art. 331)</div>
      <ul style="margin:0;padding-left:1.1rem;font-size:.8rem">${r.circunstancias.map(c => `<li>${esc(textoCircunstancia(c))}</li>`).join('')}</ul></div>` : ''}
    ${r.documento_retenido ? `<div style="margin-top:.6rem"><div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.2rem">Documento retenido (arts. 343-344)</div>
      <div style="font-size:.82rem">${esc(DOC_RETENIDO[r.documento_retenido] || r.documento_retenido)}${r.documento_numero ? ' · ' + esc(r.documento_numero) : ''} — <span id="detail-devolucion">consultando…</span></div></div>` : ''}
    ${(r.firma_infractor || r.firma_oficial || r.firma_negada) ? `<div style="display:flex;gap:1rem;margin-top:.6rem;flex-wrap:wrap">
      <div style="flex:1;min-width:140px;text-align:center;font-size:.72rem;color:var(--muted)">${r.firma_infractor ? imgFirma(r.firma_infractor, 14) : (r.firma_negada ? '<em>Se negó a firmar</em>' : '—')}<div>Firma del infractor</div></div>
      <div style="flex:1;min-width:140px;text-align:center;font-size:.72rem;color:var(--muted)">${imgFirma(r.firma_oficial, 14) || '—'}<div>Firma del policía vial</div></div></div>` : ''}
    <div id="detail-recurso"></div>
    <div id="detail-boleta"></div>

    <!-- Cambiar estado (una impugnación la resuelve Jurídico o el Director) -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem;margin-top:.5rem;display:${r.estado==='impugnada'&&!puede('resolver')?'none':'flex'};align-items:center;gap:.6rem;flex-wrap:wrap">
      <span style="font-size:.75rem;font-weight:600;color:var(--muted)">Cambiar estado:</span>
      <select id="detail-estado" class="form-select" style="width:auto;min-width:130px;flex-shrink:0">
        <option value="pendiente"  ${r.estado==='pendiente'?'selected':''}>Pendiente</option>
        <option value="pagada"     ${r.estado==='pagada'?'selected':''}>Pagada</option>
        ${r.estado==='impugnada'?'<option value="impugnada" selected>Impugnada (recurso en trámite)</option>':''}
        <option value="cancelada"  ${r.estado==='cancelada'?'selected':''}>Cancelada</option>
        <option value="vencida"    ${r.estado==='vencida'?'selected':''}>Vencida</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="saveDetailEstado('infracciones','${r.id}')">Aplicar</button>
    </div>

    <!-- Acciones -->
    <div class="detail-actions" style="margin-top:.75rem;flex-wrap:wrap;gap:.5rem">
      ${(r.estado==='pendiente'||r.estado==='vencida')?`<button class="btn btn-sm" style="background:var(--green);color:#fff;border:none" onclick="openRegistrarPago('${r.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        Cobrar
      </button>`:''}
      ${(r.estado==='pendiente'||r.estado==='vencida')?`<button class="btn btn-ghost btn-sm" style="color:var(--blue);border-color:#BFDBFE" onclick="impugnarInfraccion('${r.id}','${r.estado}')">Recurso de revocación</button>`:''}
      ${r.estado==='impugnada'?`<button class="btn btn-ghost btn-sm" style="color:var(--blue);border-color:#BFDBFE" onclick="resolverImpugnacion('${r.id}')">Resolver impugnación</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="printTicket80('${r.id}')">Ticket 80mm</button>
      <button class="btn btn-ghost btn-sm" onclick="printInfraccion('${r.id}')">Boleta carta</button>
      ${r.telefono?`<button class="btn btn-ghost btn-sm" style="color:#128C7E;border-color:#A7F3D0" onclick="notificarWhatsApp({telefono:${jsArg(r.telefono)},infractor:${jsArg(r.infractor)},folio:${jsArg(r.folio||'')},placa:${jsArg(r.placa)},tipo:${jsArg(r.tipo)},monto:${Number(r.monto)||0},ubicacion:${jsArg(r.ubicacion||'')},fecha:${jsArg(r.fecha||'')}})" >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        WhatsApp
      </button>`:''}
    </div>
    <div style="font-size:.72rem;color:var(--muted);margin-top:.6rem">Una infracción registrada no se puede modificar. Si tiene un error, cancélala con su motivo y levanta una nueva.</div>`;
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
          <div style="font-family:monospace;font-size:1.1rem;font-weight:800;color:var(--ink)">${esc(r.num||'—')}</div>
          <div style="font-size:.92rem;font-weight:700;color:var(--ink);margin-top:.3rem">${esc(r.titular)}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">${esc(r.tipo)}</div>
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
      <div class="detail-field full"><label>Razón social / Nombre</label><span style="font-weight:600">${esc(r.titular)}</span></div>
      ${r.telefono?`<div class="detail-field"><label>Teléfono</label><span><a href="https://wa.me/52${r.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener" style="color:#128C7E;text-decoration:none">${esc(r.telefono)}</a></span></div>`:''}
      ${r.unidades>1?`<div class="detail-field"><label>Núm. de unidades</label><span>${r.unidades}</span></div>`:''}

      <!-- Vehículo -->
      <div class="detail-field full">${secLabel('<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>','Vehículo y ruta')}</div>
      <div class="detail-field"><label>Placa</label><span style="font-family:monospace;font-weight:800;font-size:.95rem">${esc(r.placa||'—')}</span></div>
      <div class="detail-field"><label>Tipo de permiso</label><span>${esc(r.tipo)}</span></div>
      <div class="detail-field full"><label>Ruta / Zona de circulación</label><span>${esc(r.ruta||'—')}</span></div>

      <!-- Vigencia -->
      <div class="detail-field full">${secLabel('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>','Vigencia')}</div>
      <div class="detail-field"><label>Fecha de inicio</label><span>${fmtDateShort(r.inicio)}</span></div>
      <div class="detail-field"><label>Fecha de vencimiento</label><span style="font-weight:700;color:${diasColor}">${fmtDateShort(r.vencimiento)}</span></div>
      <div class="detail-field full"><label>Días restantes</label>
        <span style="font-weight:700;font-size:.9rem;color:${diasColor}">${diasTxt}</span>
      </div>
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span style="background:var(--stone);display:block;padding:.45rem .7rem;border-radius:6px;font-size:.82rem">${esc(r.obs)}</span></div>`:''}
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
      ${r.estado!=='cancelado'?`<button class="btn btn-danger btn-sm" onclick="cancelarPermiso('${r.id}')">Cancelar permiso</button>`:''}
    </div>`;
  })();
  openModal('modal-detail');
  hidratarFotos($('modal-detail'));
  if (isInf && r.documento_retenido) mostrarDevolucion(r);
  if (isInf) mostrarRecurso(r);
  if (isInf && r.boleta) infraccionesDeBoleta(r).then(lista => {
    const box = $('detail-boleta'); if (!box || lista.length < 2) return;
    box.innerHTML = `<div style="margin-top:.6rem"><div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.2rem">Infracciones de esta boleta (art. 327)</div>
      ${lista.map((x, i) => `<div style="font-size:.8rem;display:flex;justify-content:space-between;gap:.5rem;padding:.15rem 0;${x.id===r.id?'font-weight:700':''}"><span>${esc(x.folio||'—')} · ${esc(x.tipo)}${i===0?' <span class="badge-yellow">Mayor cuantía</span>':''}</span><span>${fmt(x.monto)}</span></div>`).join('')}</div>`;
  });
}

async function saveDetailEstado(tabla, id) {
  const estado = $('detail-estado').value;
  const cambios = { estado };
  if (tabla==='infracciones' && estado==='pagada') {
    closeModal('modal-detail');
    openRegistrarPago(id);   // marcar como pagada siempre pasa por el cobro
    return;
  }
  if (tabla==='infracciones' && estado==='cancelada') {
    const motivo = prompt('Motivo de la cancelación (queda registrado en la bitácora):');
    if (!motivo || !motivo.trim()) return;
    cambios.cancelacion_motivo = motivo.trim();
  }
  const { error } = await _sb.from(tabla).update(cambios).eq('id', id);
  if (error) { alert('Error: '+error.message); return; }
  closeModal('modal-detail');
  if (tabla==='infracciones') { renderInfracciones(); renderDashboard(); }
  else renderPermisos();
}

// Los registros no se borran (controles.sql): el permiso se cancela con motivo
async function cancelarPermiso(id) {
  const motivo = prompt('Motivo de la cancelación del permiso (queda registrado en la bitácora):');
  if (!motivo || !motivo.trim()) return;
  const { error } = await _sb.from('permisos').update({ estado: 'cancelado', cancelacion_motivo: motivo.trim() }).eq('id', id);
  if (error) { alert('Error: '+error.message); return; }
  await logActivity('permiso', `Permiso cancelado: ${motivo.trim()}`);
  closeModal('modal-detail');
  renderPermisos();
  showToast('Permiso cancelado');
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
  if($('cfg-correo-reporte')) $('cfg-correo-reporte').value = data.correo_reporte||'';
  if($('cfg-descuento-pct'))  $('cfg-descuento-pct').value  = data.descuento_pct  ?? 20;
  if($('cfg-dias-descuento')) $('cfg-dias-descuento').value = data.dias_descuento ?? 15;
  if($('cfg-dias-limite'))    $('cfg-dias-limite').value    = data.dias_limite    ?? 30;
  if($('cfg-descuento2-pct')) $('cfg-descuento2-pct').value = data.descuento2_pct ?? '';
  if($('cfg-dias-descuento2'))$('cfg-dias-descuento2').value= data.dias_descuento2 ?? '';
  if($('cfg-valor-uma'))      $('cfg-valor-uma').value      = data.valor_uma      ?? '';
  if($('cfg-reglamento'))     $('cfg-reglamento').value     = data.reglamento     || '';
  if($('cfg-fundamento'))     $('cfg-fundamento').value     = data.fundamento_general || '';
  if($('cfg-recurso'))        $('cfg-recurso').value        = data.leyenda_recurso || '';
  if($('cfg-folio-prefijo'))  $('cfg-folio-prefijo').value  = data.folio_prefijo || 'MIS';
  if($('cfg-pago-banco'))     $('cfg-pago-banco').value     = data.pago_banco || '';
  if($('cfg-pago-clabe'))     $('cfg-pago-clabe').value     = data.pago_clabe || '';
  if($('cfg-pago-beneficiario')) $('cfg-pago-beneficiario').value = data.pago_beneficiario || '';
  if($('cfg-resguardo'))      $('cfg-resguardo').value      = data.resguardo_lugar || '';
  if($('cfg-avisos-correo'))  $('cfg-avisos-correo').checked   = !!data.avisos_correo;
  if($('cfg-avisos-whatsapp'))$('cfg-avisos-whatsapp').checked = !!data.avisos_whatsapp;
  if($('cfg-pago-linea'))     $('cfg-pago-linea').checked      = !!data.pago_en_linea;
  if($('cfg-tipos-extra')) {
    const extras = data.tipos_extra || [];
    $('cfg-tipos-extra').value = Array.isArray(extras) ? extras.join('\n') : '';
  }
  if (_rol === 'admin') renderRespaldos();
}

async function saveConfig() {
  const tiposRaw = ($('cfg-tipos-extra')||{}).value||'';
  const tiposExtra = tiposRaw.split('\n').map(s=>s.trim()).filter(Boolean);
  const payload = {
    id: 1,
    municipio: ($('cfg-municipio')||{}).value||'',
    estado:    ($('cfg-estado')||{}).value||'',
    director:  ($('cfg-director')||{}).value||'',
    correo:    ($('cfg-correo')||{}).value||'',
    descuento_pct:  parseInt(($('cfg-descuento-pct')||{}).value)||20,
    dias_descuento: parseInt(($('cfg-dias-descuento')||{}).value)||15,
    dias_limite:    parseInt(($('cfg-dias-limite')||{}).value)||30,
    descuento2_pct: parseInt(($('cfg-descuento2-pct')||{}).value)||0,
    dias_descuento2: parseInt(($('cfg-dias-descuento2')||{}).value)||null,
    valor_uma:      parseFloat(($('cfg-valor-uma')||{}).value) || null,
    reglamento:     ($('cfg-reglamento')||{}).value?.trim() || null,
    fundamento_general: ($('cfg-fundamento')||{}).value?.trim() || null,
    leyenda_recurso:    ($('cfg-recurso')||{}).value?.trim() || null,
    resguardo_lugar:    ($('cfg-resguardo')||{}).value?.trim() || null,
    avisos_correo:      !!($('cfg-avisos-correo')||{}).checked,
    avisos_whatsapp:    !!($('cfg-avisos-whatsapp')||{}).checked,
    pago_en_linea:      !!($('cfg-pago-linea')||{}).checked,
    tipos_extra:    tiposExtra
  };
  if ($('cfg-correo-reporte')) payload.correo_reporte = $('cfg-correo-reporte').value.trim();
  if ($('cfg-folio-prefijo')) {
    const pre = $('cfg-folio-prefijo').value.trim().toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(pre)) { alert('El prefijo de los folios debe tener de 2 a 5 letras.'); return; }
    payload.folio_prefijo = pre;
  }
  if ($('cfg-pago-clabe')) {
    const clabe = $('cfg-pago-clabe').value.replace(/\s/g, '');
    if (clabe && !/^\d{18}$/.test(clabe)) { alert('La CLABE debe tener 18 dígitos.'); return; }
    payload.pago_clabe = clabe;
    payload.pago_banco = $('cfg-pago-banco').value.trim();
    payload.pago_beneficiario = $('cfg-pago-beneficiario').value.trim();
  }
  const { error } = await _sb.from('configuracion').upsert(payload, { onConflict:'id' });
  if (error) { alert('Error guardando configuración: '+error.message); return; }
  _cachedConfig = { ...(_cachedConfig||{}), ...payload };
  await logActivity('config', `Configuración del sistema actualizada por ${_session.name}`);
  showToast('Configuración guardada correctamente');
}

// ── Respaldos diarios (mejoras.sql + función tareas-diarias) ─────
async function renderRespaldos() {
  const cont = $('respaldos-lista'); if (!cont) return;
  cont.innerHTML = '<div style="font-size:.8rem;color:var(--muted)">Cargando…</div>';
  const { data, error } = await _sb.storage.from('respaldos').list('', { limit: 60, sortBy: { column: 'name', order: 'desc' } });
  if (error) { cont.innerHTML = `<div style="font-size:.8rem;color:var(--red)">${esc(error.message)}</div>`; return; }
  const archivos = (data || []).filter(f => /^\d{4}-\d{2}-\d{2}/.test(f.name));
  cont.innerHTML = archivos.length ? `<table><thead><tr><th>Día</th><th>Tamaño</th><th></th></tr></thead><tbody>${archivos.map(f => `<tr>
      <td>${esc(fmtDateShort(f.name.slice(0, 10) + 'T12:00:00'))}</td>
      <td>${((f.metadata?.size || 0) / 1024).toFixed(0)} KB</td>
      <td style="text-align:right"><button class="btn btn-ghost btn-sm" onclick="descargarRespaldo(${esc(JSON.stringify(f.name))})">Descargar</button></td>
    </tr>`).join('')}</tbody></table>`
    : '<div style="font-size:.8rem;color:var(--muted)">Todavía no hay respaldos. El primero se genera esta madrugada o con “Respaldar ahora”.</div>';
}
async function descargarRespaldo(nombre) {
  const { data, error } = await _sb.storage.from('respaldos').createSignedUrl(nombre, 120, { download: true });
  if (error) { alert('No se pudo descargar: ' + error.message); return; }
  window.location.href = data.signedUrl;
}
async function respaldarAhora() {
  const btn = $('btn-respaldar'); if (btn) { btn.disabled = true; btn.textContent = 'Respaldando…'; }
  try {
    const { data, error } = await _sb.functions.invoke('tareas-diarias', { body: { solo: 'respaldo' } });
    if (error) throw error;
    if (data?.respaldo?.error) throw new Error(data.respaldo.error);
    showToast(`Respaldo listo: ${data.respaldo.filas} registros`);
    renderRespaldos();
  } catch (e) { alert('No se pudo respaldar: ' + (e.message || e)); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Respaldar ahora'; } }
}

// ── Ticket de infracción ──────────────────────────────────
// ── QR de verificación (verificacion.sql) ───────────────────
// Apunta a /verificar?t=<token aleatorio>: cualquiera puede comprobar que el
// documento es auténtico y su estado actual, sin iniciar sesión. El escáner de
// Caja también lo reconoce para cobrar.
function urlVerificacion(token) { return token ? `${window.location.origin}/verificar?t=${token}` : ''; }
function qrVerificacion(token, size = 220) {
  if (!token) return '';
  try { return new QRious({ value: urlVerificacion(token), size, padding: 6, backgroundAlpha: 1 }).toDataURL(); }
  catch (e) { console.warn('QR:', e); return ''; }
}

// Tramos de descuento por pronto pago, según Configuración
// (Veracruz, art. 330: 75% dentro de 5 días y 50% del 6.º al 10.º)
function tramosDescuento(cfg) {
  const t = [{ pct: Number(cfg?.descuento_pct ?? 0), dias: Number(cfg?.dias_descuento ?? 0) }];
  if (cfg?.dias_descuento2 && Number(cfg?.descuento2_pct) > 0) t.push({ pct: Number(cfg.descuento2_pct), dias: Number(cfg.dias_descuento2) });
  return t.filter(x => x.pct > 0 && x.dias > 0);
}
// Descuento que corresponde hoy a una infracción (null si ya no aplica)
function descuentoVigente(r, cfg) {
  const dias = (Date.now() - new Date(r.fecha).getTime()) / 86400000;
  return tramosDescuento(cfg).find(x => dias <= x.dias) || null;
}
function plazosPago(r, cfg, fmtFecha) {
  const dLim  = Number(cfg?.dias_limite ?? 30);
  const t = new Date(r.fecha).getTime();
  const tramos = tramosDescuento(cfg).map(x => ({
    ...x,
    hasta: new Date(t + x.dias*86400000).toLocaleDateString('es-MX', fmtFecha),
    monto: Math.round(r.monto * (1 - x.pct/100)).toLocaleString('es-MX')
  }));
  return { tramos, dLim, limFecha: new Date(t + dLim*86400000).toLocaleDateString('es-MX', fmtFecha) };
}

// Motivación del monto (art. 331) y relación de infracciones de la boleta (art. 327)
function htmlCircunstancias(r) {
  const c = r.circunstancias || [];
  if (!c.length) return 'Sin circunstancias agravantes ni atenuantes; se aplica la UMA base del tabulador (art. 333).';
  const agr = c.some(x => x.startsWith('agr_'));
  return c.map(x => esc(textoCircunstancia(x))).join('; ') + (agr ? '. Por existir agravante se aplica la UMA con agravante del tabulador (arts. 331 y 333).' : '.');
}
function htmlDatosInfractor(r) {
  if (r.infractor_ausente && !r.infractor_domicilio) return 'No se encontraba presente o no proporcionó domicilio ni correo electrónico (art. 327, fr. II, inciso b).';
  return `${esc(r.infractor_domicilio || 'Domicilio no proporcionado')} · ${esc(r.infractor_correo || 'correo no proporcionado')}`;
}

async function printInfraccion(id) {
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('infracciones').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id',1).single()
  ]);
  if (!r) return;

  const mun      = esc(cfg?.municipio || 'Municipio');
  const estMun   = esc(cfg?.estado    || '');
  const director = esc(cfg?.director  || '');
  const qrBoleta = qrVerificacion(r.token_verificacion);

  const fechaObj  = new Date(r.fecha);
  const fechaStr  = fechaObj.toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const horaStr   = fechaObj.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});

  const { tramos, limFecha } = plazosPago(r, cfg, {day:'2-digit',month:'long',year:'numeric'});
  await cargarCatalogo();
  const catInf = catalogoPorNumero(r.catalogo_numero);
  const grave = !!catInf?.grave;
  const montoFmt  = Number(r.monto).toLocaleString('es-MX');
  const lista = await infraccionesDeBoleta(r);

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
        <span class="folio-num">${esc(r.folio||'—')}</span>
      </div>
    </div>

    <div class="sections">
      <div class="section-row">
        <div class="section" style="flex:1">
          <div class="sec-title">Datos de la infracción</div>
          <div class="fields-grid">
            <div class="f"><span class="fl">Fecha</span><span class="fv">${fechaStr}</span></div>
            <div class="f"><span class="fl">Hora</span><span class="fv">${horaStr}</span></div>
            <div class="f full"><span class="fl">Ubicación / Lugar de los hechos</span><span class="fv">${esc(r.ubicacion||'—')}</span></div>
            <div class="f full"><span class="fl">Tipo de infracción</span><span class="fv bold">${esc(r.tipo)}</span></div>
            ${r.fundamento ? `<div class="f full"><span class="fl">Fundamento legal</span><span class="fv">${esc(r.fundamento)}${catInf?.clasificacion ? ' — infracción ' + esc(catInf.clasificacion.toLowerCase()) : ''}</span></div>` : ''}
            ${r.obs ? `<div class="f full"><span class="fl">Observaciones</span><span class="fv">${esc(r.obs)}</span></div>` : ''}
          </div>
        </div>
        <div class="section" style="flex:1">
          <div class="sec-title">Datos del vehículo</div>
          <div class="fields-grid">
            <div class="f"><span class="fl">Placa</span><span class="fv mono bold">${esc(r.placa)}</span></div>
            <div class="f"><span class="fl">Color</span><span class="fv">${esc(r.color_vehiculo||'—')}</span></div>
            <div class="f full"><span class="fl">Marca y modelo</span><span class="fv">${esc(r.vehiculo||'—')}</span></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="sec-title">Datos del infractor</div>
        <div class="fields-grid">
          <div class="f" style="flex:2"><span class="fl">Nombre completo</span><span class="fv bold">${esc(r.infractor)}</span></div>
          <div class="f"><span class="fl">Licencia o permiso</span><span class="fv mono">${esc(r.licencia||'—')}${r.licencia_tipo ? ' · ' + esc(r.licencia_tipo) : ''}</span></div>
          <div class="f full"><span class="fl">Domicilio y correo electrónico</span><span class="fv">${htmlDatosInfractor(r)}</span></div>
        </div>
      </div>

      ${r.documento_retenido ? `<div class="section">
        <div class="sec-title">Documento retenido en garantía (arts. 343 y 344)</div>
        <div class="pay-info">${esc(DOC_RETENIDO[r.documento_retenido] || '')}${r.documento_numero ? ' núm. ' + esc(r.documento_numero) : ''}. Se devolverá en ${esc(cfg?.resguardo_lugar || 'la Delegación de Tránsito')} al acreditar el pago o la cancelación de la multa, presentando esta boleta e identificación oficial.</div>
      </div>` : ''}
      <div class="section">
        <div class="sec-title">Motivación — circunstancias (art. 331)</div>
        <div class="pay-info">${htmlCircunstancias(r)}</div>
      </div>
      ${lista.length > 1 ? `<div class="section">
        <div class="sec-title">Infracciones de esta boleta (art. 327)</div>
        ${lista.map((x, i) => `<div class="pay-info" style="display:flex;justify-content:space-between;gap:3mm"><span><strong>${esc(x.folio||'—')}</strong> · ${esc(x.tipo)}${x.fundamento ? ' — ' + esc(x.fundamento) : ''}</span><span style="white-space:nowrap">${i===0?'<strong>Sanción de mayor cuantía:</strong> ':''}$${Number(x.monto).toLocaleString('es-MX')}</span></div>`).join('')}
      </div>` : ''}

      <div class="amount-section">
        <div class="amount-label">MONTO DE LA INFRACCIÓN</div>
        <div class="amount-num">$${montoFmt} <span class="currency">MXN</span></div>
        <div class="payment-dates">
          ${grave ? `<div class="pd-item limit">
            <div class="pd-label">Sin descuento</div>
            <div class="pd-date">Se paga íntegra</div>
            <div class="pd-amount">${esc(catInf?.descripcion?.slice(0,60) || '')}</div>
          </div>` : tramos.map(x => `<div class="pd-item discount">
            <div class="pd-label">▼ ${x.pct}% descuento si paga a más tardar el</div>
            <div class="pd-date">${x.hasta}</div>
            <div class="pd-amount">Pague solo $${x.monto} MXN</div>
          </div>`).join('')}
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
          Presente esta boleta en ventanilla de infracciones. Referencia de pago: <strong class="mono">${esc(r.folio||'—')}</strong>
        </div>
        ${qrBoleta?`<div style="display:flex;align-items:center;gap:3mm;margin-top:2mm"><img src="${qrBoleta}" style="width:22mm;height:22mm"/><div style="font-size:7.5pt;color:#555;line-height:1.4">Escanee el código para verificar que esta boleta es auténtica y consultar su estado.</div></div>`:''}
      </div>

      <div class="signatures">
        <div class="sig-box">
          ${imgFirma(r.firma_oficial, 14)}
          <div class="sig-line"></div>
          <div class="sig-label">Policía vial: ${esc(r.oficial||'—')}${r.oficial_placa ? ' · Placa ' + esc(r.oficial_placa) : ''}${r.oficial_adscripcion ? ' · ' + esc(r.oficial_adscripcion) : ''}</div>
        </div>
        <div class="sig-box">
          ${r.firma_infractor ? imgFirma(r.firma_infractor, 14) : (r.firma_negada ? '<div style="font-size:8pt;text-align:center;color:#555">Se negó a firmar</div>' : '')}
          <div class="sig-line"></div>
          <div class="sig-label">Firma o huella del infractor</div>
        </div>
      </div>

      <div class="legal-note">
        La presente boleta se expide con fundamento en ${esc(cfg?.fundamento_general || 'la legislación de tránsito vigente')}${r.fundamento ? '; y en el ' + esc(r.fundamento.replace(/^Artículo/, 'artículo')) : ''}.
        El no pago dentro del plazo establecido generará la actualización y los accesorios que determinen las disposiciones fiscales.
        ${esc(cfg?.leyenda_recurso || 'Contra esta boleta procede el recurso de revocación en los términos de la legislación aplicable.')}
      </div>
    </div>
  </div>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Boleta ${esc(r.folio||'')}</title>
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
  const mun   = esc(cfg?.municipio || 'Municipio');
  const edo   = esc(cfg?.estado    || '');
  const dir   = esc(cfg?.director  || '');
  const tipoMap = { choque:'Choque vehicular', atropello:'Atropello', volcadura:'Volcadura', otro:'Otro' };
  const estadoMap = { en_proceso:'En proceso', cerrado:'Cerrado', derivado:'Derivado al Ministerio Público' };
  const fecha = r.fecha ? new Date(r.fecha).toLocaleString('es-MX',{dateStyle:'long',timeStyle:'short'}) : '—';
  const win = window.open('','_blank','width=850,height=1100');
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Parte de Accidente ${esc(r.folio||'')}</title>
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
      <div class="val">${esc(r.folio||'—')}</div>
    </div>
  </div>

  <div class="section-title">Datos del accidente</div>
  <div class="grid">
    <div class="field"><label>Tipo</label><span>${esc(tipoMap[r.tipo]||r.tipo)}</span></div>
    <div class="field"><label>Estado</label><span class="badge ${esc(r.estado)}">${esc(estadoMap[r.estado]||r.estado)}</span></div>
    <div class="field"><label>Fecha y hora</label><span>${fecha}</span></div>
    <div class="field"><label>Oficial que levanta</label><span>${esc(r.oficial||'—')}</span></div>
    <div class="field full"><label>Ubicación / Lugar de los hechos</label><span>${esc(r.ubicacion||'—')}</span></div>
    <div class="field"><label>Personas lesionadas</label><span>${r.lesionados||0}</span></div>
    <div class="field"><label>Personas fallecidas</label><span>${r.fallecidos||0}</span></div>
    ${r.descripcion?`<div class="field full"><label>Descripción</label><span>${esc(r.descripcion)}</span></div>`:''}
    ${r.obs?`<div class="field full"><label>Observaciones</label><span>${esc(r.obs)}</span></div>`:''}
  </div>

  ${partes.length ? `
  <div class="section-title">Partes involucradas</div>
  ${partes.map((p,i)=>`
    <div class="parte-box">
      <strong>Parte ${i+1}:</strong>&nbsp; ${esc(p.nombre||'—')} &nbsp;|&nbsp;
      Placa: <strong>${esc(p.placa||'—')}</strong> &nbsp;|&nbsp;
      Licencia: ${esc(p.licencia||'—')} &nbsp;|&nbsp;
      Aseguradora: ${esc(p.aseguradora||'—')}
    </div>`).join('')}` : ''}

  <div class="firma-row">
    <div class="firma-box">Firma del oficial<br><br><br>${esc(r.oficial||'_________________')}</div>
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

  const mun      = esc(cfg?.municipio || 'Municipio');
  const estMun   = esc(cfg?.estado    || '');
  const director = esc(cfg?.director  || 'Director de Tránsito');
  const correo   = esc(cfg?.correo    || '');

  const hoy      = new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const inicioStr = r.inicio      ? new Date(r.inicio).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}) : '—';
  const vencStr   = r.vencimiento ? new Date(r.vencimiento).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}) : '—';

  const vigente  = r.estado === 'vigente';
  const estadoLabel = { vigente:'VIGENTE', vencido:'VENCIDO', 'por-vencer':'POR VENCER', suspendido:'SUSPENDIDO' }[r.estado] || r.estado.toUpperCase();
  const estadoColor = { vigente:'#059669', vencido:'#DC2626', 'por-vencer':'#D97706', suspendido:'#DC2626' }[r.estado] || '#6B7280';

  const ref = (r.num||'PER').replace(/[^A-Z0-9]/g,'') + String(r.id||0).padStart(6,'0');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Permiso ${esc(r.num||'')} — ${esc(r.titular)}</title>
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
        <div class="doc-num">${esc(r.num||'—')}</div>
      </div>
    </div>

    <!-- STAMP + TITLE -->
    <div class="stamp-wrap"><div class="stamp">${estadoLabel}</div></div>
    <div class="title-bar">
      <h1>Permiso de Circulación</h1>
      <p>${esc(r.tipo)}</p>
    </div>

    <!-- TITULAR -->
    <div class="section">
      <div class="sec-title">Datos del titular</div>
      <div class="fields">
        <div class="field w-full"><label>Nombre completo / Razón social</label><span class="bold">${esc(r.titular)}</span></div>
      </div>
    </div>

    <!-- VEHÍCULO -->
    <div class="section">
      <div class="sec-title">Datos del vehículo y ruta</div>
      <div class="fields">
        <div class="field"><label>Placas del vehículo</label><span class="mono bold">${esc(r.placa||'—')}</span></div>
        <div class="field"><label>Tipo de permiso</label><span>${esc(r.tipo)}</span></div>
        <div class="field w-full"><label>Ruta / Zona de circulación autorizada</label><span class="big">${esc(r.ruta||'—')}</span></div>
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
      exclusivamente la operación del vehículo con placas <strong>${esc(r.placa||'indicadas')}</strong> en la ruta o zona señalada.
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
        <div class="sig-name">${esc(r.titular)}</div>
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
  // También corre a diario en el servidor (pg_cron); aquí solo se adelanta.
  await _sb.rpc('marcar_infracciones_vencidas');
}

// ── Leer la placa con la cámara (OCR en el navegador con Tesseract.js) ──
// La librería (~3 MB con el modelo) se descarga solo la primera vez que se usa.
// El resultado siempre queda en el campo para que el oficial lo confirme.
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let _ocrWorker = null;

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const el = document.createElement('script');
    el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('No se pudo descargar el lector de placas'));
    document.head.appendChild(el);
  });
}

// Busca en el texto leído algo con forma de placa: 5 a 8 letras y números
// mezclados (ABC-123-D, ABC-12-34, 123-ABC…), ignorando "MÉXICO", el estado, etc.
function extraerPlaca(texto) {
  const candidatos = [];
  String(texto || '').toUpperCase().split(/\n+/).forEach(linea => {
    const tokens = linea.replace(/[^A-Z0-9\-\s]/g, ' ').split(/[\s\-]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      for (let n = 1; n <= 3 && i + n <= tokens.length; n++) {
        const partes = tokens.slice(i, i + n);
        if (n > 1 && partes.some(p => p.length > 4)) continue;   // "MEXICO", "LEON"… no son parte de la placa
        const plano = partes.join('');
        if (plano.length >= 5 && plano.length <= 8 && /[A-Z]/.test(plano) && /\d/.test(plano)) candidatos.push({ partes, plano });
      }
    }
  });
  if (!candidatos.length) return '';
  const forma = p => /^[A-Z]{3}\d{3}[A-Z]$/.test(p) || /^[A-Z]{3}\d{4}$/.test(p) || /^\d{3}[A-Z]{3}$/.test(p) || /^[A-Z]\d{2}[A-Z]{3}$/.test(p);
  const puntos = c => (forma(c.plano) ? 4 : 0) + (c.plano.length === 7 ? 2 : c.plano.length === 6 ? 1 : 0) + (c.partes.length > 1 ? 1 : 0);
  const mejor = candidatos.sort((a, b) => puntos(b) - puntos(a))[0];
  if (mejor.partes.length > 1) return mejor.partes.join('-');
  // Sin separadores: formato más común de placa mexicana
  const m = mejor.plano.match(/^([A-Z]{3})(\d{3})([A-Z])$/) || mejor.plano.match(/^([A-Z]{3})(\d{3,4})$/) || mejor.plano.match(/^(\d{3})([A-Z]{3})$/);
  return m ? m.slice(1).join('-') : mejor.plano;
}

// Escala de grises y más contraste: Tesseract lee mucho mejor así
async function prepararImagenPlaca(file) {
  const url = await compressPhoto(file, 1400);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.6 + 128));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

async function leerPlacaDesdeArchivo(file) {
  if (!file) return;
  const st = $('placa-ocr-status'), btn = $('btn-placa-camara');
  const msg = (t, color) => { if (st) { st.textContent = t; st.style.color = color || 'var(--muted)'; } };
  if (btn) btn.disabled = true;
  try {
    msg(_ocrWorker ? 'Leyendo la placa…' : 'Preparando el lector (solo la primera vez tarda un poco)…');
    await cargarScript(TESSERACT_URL);
    if (!_ocrWorker) {
      _ocrWorker = await Tesseract.createWorker('eng');
      await _ocrWorker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ' });
    }
    msg('Leyendo la placa…');
    const { data } = await _ocrWorker.recognize(await prepararImagenPlaca(file));
    const placa = extraerPlaca(data?.text);
    if (!placa) { msg('No se encontró la placa en la foto. Acércate más o escríbela a mano.', 'var(--amber)'); return; }
    $('inf-placa').value = placa;
    msg(`Leída: ${placa}. Revisa que coincida con la placa del vehículo.`, 'var(--green)');
    await checkPlacaHistory();
    updateInfSummary();
  } catch (err) {
    msg(navigator.onLine ? 'No se pudo leer la placa. Escríbela a mano.' : 'Sin señal: la primera lectura necesita internet. Escribe la placa a mano.', 'var(--red)');
    console.warn('OCR placa:', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Historial por placa + auto-fill desde padrón vehicular ──
async function checkPlacaHistory() {
  const placa = ($('inf-placa')||{}).value?.trim().toUpperCase();
  const panel = $('placa-history');
  if (!panel) return;
  if (!placa || placa.length < 3) { panel.innerHTML = ''; window._placaAdeudos = []; return; }

  // Consultar historial completo y padrón vehicular en paralelo
  const [{ data }, { data: veh }] = await Promise.all([
    _sb.from('infracciones').select('id,folio,fecha,tipo,estado,monto,boleta').eq('placa', placa).order('fecha',{ascending:false}),
    _sb.from('vehiculos').select('propietario,marca,modelo,color,telefono').eq('placa', placa).maybeSingle()
  ]);

  // Auto-completar campos del formulario si están vacíos
  if (veh) {
    const infractor = $('inf-infractor');
    if (infractor && !infractor.value) infractor.value = veh.propietario || '';
    const vehiculo = $('inf-vehiculo');
    if (vehiculo && !vehiculo.value) vehiculo.value = [veh.marca, veh.modelo].filter(Boolean).join(' ');
    const color = $('inf-color');
    if (color && !color.value) color.value = veh.color || '';
    const tel = $('inf-telefono');
    if (tel && !tel.value) tel.value = veh.telefono || '';
  }

  const prevId  = $('inf-id')?.value;
  const prev    = (data||[]).filter(r => String(r.id) !== String(prevId));
  // Las infracciones de la boleta que se está levantando no son adeudos anteriores
  const adeudos = prev.filter(r => (r.estado === 'pendiente' || r.estado === 'vencida') && !(_boletaGrupo && r.boleta === _boletaGrupo));
  const montoAdeudos = adeudos.reduce((a,r) => a + Number(r.monto), 0);

  // Guardar adeudos para consultarlos en submitInfraccion sin otra llamada a la BD
  window._placaAdeudos = adeudos;
  sugerirAgravanteAdeudos();
  window._placaMontoAdeudos = montoAdeudos;

  let html = '';

  // Banner verde: vehículo en padrón
  if (veh) {
    html += `<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:.55rem .9rem;margin:.35rem 0;font-size:.77rem;color:#065F46">
      ✓ En padrón: <strong>${esc(veh.propietario)}</strong>${veh.marca?` · ${esc([veh.marca,veh.modelo].filter(Boolean).join(' '))}`:''}${veh.color?` · ${esc(veh.color)}`:''}
    </div>`;
  }

  // Banner rojo: adeudos sin pagar (más prominente)
  if (adeudos.length > 0) {
    html += `
    <div style="background:#FEF2F2;border:2px solid #DC2626;border-radius:8px;padding:.75rem 1rem;margin:.35rem 0">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.45rem;flex-wrap:wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span style="font-size:.8rem;font-weight:800;color:#DC2626">
          ${adeudos.length} ADEUDO${adeudos.length>1?'S':''} SIN PAGAR — Total: ${fmt(montoAdeudos)}
        </span>
      </div>
      ${adeudos.slice(0,3).map(r=>`
        <div style="font-size:.72rem;color:#991B1B;display:flex;gap:.5rem;margin-bottom:.2rem;flex-wrap:wrap;align-items:center">
          <span style="font-family:monospace;font-weight:700">${esc(r.folio||'—')}</span>
          <span>${fmtDateShort(r.fecha)}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.tipo)}</span>
          <span style="font-weight:700">${fmt(r.monto)}</span>
          ${estadoBadge(r.estado)}
        </div>`).join('')}
      ${adeudos.length>3?`<div style="font-size:.7rem;color:#9CA3AF;margin-top:.2rem">+ ${adeudos.length-3} adeudo${adeudos.length-3>1?'s':''} más</div>`:''}
      <div style="font-size:.73rem;color:#7F1D1D;margin-top:.5rem;padding-top:.45rem;border-top:1px solid #FECACA;font-weight:600">
        📌 El infractor debe regularizar sus adeudos en <strong>Tesorería Municipal</strong> (ventanilla de infracciones, Lun–Vie 8:00–15:00 h).
      </div>
    </div>`;
  }

  // Banner ámbar: reincidente en general (infracciones anteriores pagadas u otras)
  const otrasInf = prev.filter(r => r.estado !== 'pendiente' && r.estado !== 'vencida');
  if (otrasInf.length > 0) {
    html += `
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:.55rem .9rem;margin:.35rem 0">
      <div style="font-size:.75rem;font-weight:700;color:#92400E;margin-bottom:.35rem">
        ⚠ Reincidente — ${prev.length} ${prev.length>1?'infracciones':'infracción'} previa${prev.length>1?'s':''} en el historial
      </div>
      ${otrasInf.slice(0,2).map(r=>`
        <div style="font-size:.71rem;color:#78350F;display:flex;gap:.5rem;margin-bottom:.15rem;flex-wrap:wrap;align-items:center">
          <span style="font-family:monospace;font-weight:700">${esc(r.folio||'—')}</span>
          <span>${fmtDateShort(r.fecha)}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.tipo)}</span>
          ${estadoBadge(r.estado)}
        </div>`).join('')}
    </div>`;
  }

  panel.innerHTML = html || '';
}

// ── Pagos / Caja ──────────────────────────────────────────
let _cajaPage = 1, _cajaSearch = '', _cajaFecha = '', _cajaMetodo = '', _cajaCajero = '';
let _cajaTab = 'pendientes', _pendSearch = '', _pendSort = 'fecha_desc', _pendPage = 1;
const CAJA_PAGE_SIZE = 15;
const PEND_PAGE_SIZE = 15;

function switchCajaTab(tab) {
  _cajaTab = tab;
  ['pendientes','pagos','cortes','resguardo'].forEach(t => {
    const btn = $('tab-'+t), sec = $('caja-section-'+t);
    if (btn) btn.classList.toggle('active', t===tab);
    if (sec) sec.style.display = t===tab ? 'block' : 'none';
  });
  if (tab==='pagos') {
    if (!_cajaFecha) _cajaFecha = new Date().toISOString().slice(0,10);
    renderCajaTable();
  }
  if (tab==='resguardo') renderResguardo();
  if (tab==='cortes') renderCortes();
}

// ── Anulación de pagos (solo el Director, con motivo: controles.sql) ──
async function anularPago(id, folio) {
  const motivo = prompt(`Motivo para anular el pago de ${folio || 'la infracción'}.\nLa infracción vuelve a quedar por cobrar y el recibo queda marcado como anulado.`);
  if (!motivo || !motivo.trim()) return;
  const { error } = await _sb.rpc('anular_pago', { p_pago_id: Number(id), p_motivo: motivo.trim() });
  if (error) { alert('Error: '+error.message); return; }
  await logActivity('caja', `Pago anulado — ${folio || 'infracción'}: ${motivo.trim()}`);
  showToast('Pago anulado');
  renderCajaStats(); renderCajaTable(); renderPendientesTable();
}

// ── Corte de caja formal (controles.sql) ──────────────────
// El cajero cuenta el efectivo; el sistema guarda la diferencia contra lo cobrado
let _resumenCorte = null;
async function openCorteCaja() {
  const { data, error } = await _sb.rpc('resumen_corte');
  if (error) { alert('Error: '+error.message); return; }
  _resumenCorte = data;
  const fh = d => new Date(d).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const fila = (k, v, fuerte) => `<div style="display:flex;justify-content:space-between;padding:.3rem 0;font-size:.84rem;${fuerte?'font-weight:700;color:var(--ink)':'color:var(--text)'}"><span>${k}</span><span>${v}</span></div>`;
  $('corte-resumen').innerHTML = `
    <div style="font-size:.76rem;color:var(--muted);margin-bottom:.5rem">${esc(data.cajero)} · del ${fh(data.desde)} a ahora</div>
    ${fila('Pagos cobrados', data.num_pagos)}
    ${fila('Tarjeta', fmt(data.tarjeta))}
    ${fila('Transferencia', fmt(data.transferencia))}
    ${fila('Total cobrado', fmt(data.total))}
    <div style="border-top:1px solid var(--border);margin-top:.35rem;padding-top:.35rem">${fila('Efectivo que debe haber en caja', fmt(data.efectivo), true)}</div>`;
  $('corte-contado').value = ''; $('corte-notas').value = '';
  calcularDiferenciaCorte();
  openModal('modal-corte');
}

function calcularDiferenciaCorte() {
  const el = $('corte-diferencia'), v = $('corte-contado').value;
  if (!el) return;
  if (v === '') { el.innerHTML = ''; return; }
  const dif = Number(v) - Number(_resumenCorte?.efectivo || 0);
  el.innerHTML = dif === 0
    ? '<span style="color:var(--green)">✓ Cuadra exacto</span>'
    : `<span style="color:${dif < 0 ? 'var(--red)' : 'var(--amber)'}">${dif < 0 ? 'Faltante' : 'Sobrante'}: ${fmt(Math.abs(dif))}</span>`;
}

async function cerrarCorte() {
  const v = $('corte-contado').value;
  if (v === '' || Number(v) < 0) { alert('Captura el efectivo que contaste en caja'); return; }
  const btn = $('corte-submit'); if (btn) btn.disabled = true;
  const { data: c, error } = await _sb.rpc('cerrar_corte', { p_efectivo_contado: Number(v), p_notas: $('corte-notas').value.trim() });
  if (btn) btn.disabled = false;
  if (error) { alert('Error: '+error.message); return; }
  await logActivity('caja', `Corte de caja de ${c.cajero}: ${fmt(c.total)} cobrado, diferencia en efectivo ${fmt(c.diferencia)}`);
  closeModal('modal-corte');
  showToast('Corte de caja cerrado');
  printCorteFormal(c);
  if (_cajaTab === 'cortes') renderCortes();
}

let _cortes = {};
async function renderCortes() {
  const tb = $('cortes-table'), ta = $('anulados-table'); if (!tb) return;
  tb.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  const [{ data: cortes, error }, { data: anul }] = await Promise.all([
    _sb.from('cortes_caja').select('*').order('created_at', { ascending: false }).limit(60),
    _sb.from('pagos_anulados').select('id,folio_inf,monto_final,metodo,cajero,created_at,anulacion_motivo,anulado_por,anulado_at').order('anulado_at', { ascending: false }).limit(60)
  ]);
  if (error) { tb.innerHTML = `<tr><td colspan="9" style="color:red">${esc(error.message)}</td></tr>`; return; }
  _cortes = Object.fromEntries((cortes || []).map(c => [c.id, c]));
  const fh = d => new Date(d).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
  const dif = n => Number(n) === 0 ? '<span class="badge-green">Cuadra</span>'
    : `<span class="${Number(n) < 0 ? 'badge-red' : 'badge-yellow'}">${Number(n) < 0 ? 'Falta' : 'Sobra'} ${fmt(Math.abs(n))}</span>`;
  tb.innerHTML = (cortes || []).length ? cortes.map(c => `<tr>
      <td style="white-space:nowrap;font-size:.78rem">${fh(c.created_at)}</td>
      <td>${esc(c.cajero)}</td>
      <td style="text-align:center">${c.num_pagos}</td>
      <td style="font-weight:700">${fmt(c.total)}</td>
      <td>${fmt(c.efectivo)}</td>
      <td>${fmt(c.efectivo_contado)}</td>
      <td>${dif(c.diferencia)}</td>
      <td style="max-width:180px;font-size:.76rem;color:var(--muted)">${esc(c.notas || '')}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="printCorteFormal(_cortes[${Number(c.id)}])">Imprimir</button></td>
    </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:1.5rem">Todavía no hay cortes cerrados</td></tr>';
  if (ta) ta.innerHTML = (anul || []).length ? anul.map(a => `<tr>
      <td style="white-space:nowrap;font-size:.78rem">${fh(a.anulado_at)}</td>
      <td class="mono" style="font-size:.73rem;font-weight:700">${esc(a.folio_inf || '—')}</td>
      <td>${fmt(a.monto_final)}</td>
      <td style="font-size:.78rem">${esc(a.cajero || '—')} · ${fh(a.created_at)}</td>
      <td style="font-size:.78rem">${esc(a.anulado_por || '—')}</td>
      <td style="font-size:.78rem">${esc(a.anulacion_motivo)}</td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.2rem">Ningún pago ha sido anulado</td></tr>';
}

function printCorteFormal(c) {
  if (!c) return;
  const cfg = _cachedConfig || {};
  const fh = d => new Date(d).toLocaleString('es-MX',{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const fila = (k, v, b) => `<tr${b?' class="b"':''}><td>${k}</td><td>${v}</td></tr>`;
  const d = Number(c.diferencia);
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Corte de caja ${esc(c.cajero)}</title>
  <style>body{font-family:Arial,sans-serif;max-width:560px;margin:2rem auto;color:#111;font-size:13px}h1{font-size:17px;margin:0}h2{font-size:12px;font-weight:normal;color:#555;margin:.2rem 0 1.2rem}
  table{width:100%;border-collapse:collapse}td{padding:7px 4px;border-bottom:1px solid #ddd}td:last-child{text-align:right}tr.b td{font-weight:bold;font-size:14px}
  .dif{margin-top:1rem;padding:.7rem;border:2px solid ${d===0?'#047857':d<0?'#B91C1C':'#B45309'};font-weight:bold;text-align:center}
  .firmas{display:flex;gap:2rem;margin-top:4rem}.firmas div{flex:1;border-top:1px solid #111;text-align:center;padding-top:.3rem;font-size:11px}</style></head><body>
  <h1>Corte de caja — ${esc(cfg.municipio || 'Tránsito Municipal')}</h1>
  <h2>Folio CC-${String(c.id).padStart(5,'0')} · ${esc(c.cajero)}<br>Del ${fh(c.desde)} al ${fh(c.hasta)}</h2>
  <table>
    ${fila('Pagos cobrados', c.num_pagos)}
    ${fila('Tarjeta', fmt(c.tarjeta))}
    ${fila('Transferencia', fmt(c.transferencia))}
    ${fila('Total cobrado', fmt(c.total), true)}
    ${fila('Efectivo según el sistema', fmt(c.efectivo))}
    ${fila('Efectivo contado', fmt(c.efectivo_contado), true)}
  </table>
  <div class="dif">${d === 0 ? 'El efectivo cuadra' : (d < 0 ? 'Faltante: ' : 'Sobrante: ') + fmt(Math.abs(d))}</div>
  ${c.notas ? `<p><strong>Notas:</strong> ${esc(c.notas)}</p>` : ''}
  <div class="firmas"><div>Cajero(a)</div><div>Recibe / Tesorería</div></div>
  </body></html>`;
  const win = window.open('', '_blank', 'width=700,height=700');
  if (!win) return;
  win.document.write(html); win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

async function renderCaja() {
  await Promise.all([renderCajaStats(), renderPendientesTable()]);
  // lazy-render historial only when user switches to it
}

async function renderPendientesTable() {
  const tbody = $('pendientes-table'); if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>`;

  let q = _sb.from('infracciones').select('id,folio,placa,infractor,tipo,monto,fecha,estado,telefono,catalogo_numero').in('estado',['pendiente','vencida']);   // las vencidas también se cobran
  if (_pendSearch) q = q.or(`placa.ilike.%${_pendSearch}%,infractor.ilike.%${_pendSearch}%,folio.ilike.%${_pendSearch}%`);

  // Período
  const periodoVal = ($('pend-periodo')||{}).value||'';
  if (periodoVal) {
    const desde = _periodoRango(periodoVal);
    if (periodoVal === 'hoy') q = q.gte('fecha', desde+'T00:00:00').lte('fecha', desde+'T23:59:59');
    else if (desde) q = q.gte('fecha', desde);
  }
  await Promise.all([cargarCatalogo(), asegurarConfig()]).catch(() => {});

  if (_pendSort==='fecha_asc')   q = q.order('fecha',{ascending:true});
  else if (_pendSort==='monto_desc') q = q.order('monto',{ascending:false});
  else q = q.order('fecha',{ascending:false});

  let { data, error } = await q;
  let sinConexion = false;
  if (error && esErrorDeRed(error) || !navigator.onLine) {
    // Caja sin conexión: última lista guardada en este equipo
    const cache = _leerLocal('tm_pendientes');
    if (cache?.rows) {
      const s = _pendSearch.toLowerCase();
      data = cache.rows.filter(r => !s || [r.placa, r.infractor, r.folio].some(v => String(v || '').toLowerCase().includes(s)));
      error = null; sinConexion = cache.at;
    }
  }
  if (error) { tbody.innerHTML=`<tr><td colspan="8" style="color:red">${esc(error.message)}</td></tr>`; return; }
  if (!sinConexion && !_pendSearch && !periodoVal) _guardarLocal('tm_pendientes', { at: new Date().toISOString(), rows: data || [] });
  const avisoOff = $('pend-offline');
  if (avisoOff) { avisoOff.style.display = sinConexion ? '' : 'none'; avisoOff.textContent = sinConexion ? `Sin conexión: lista guardada el ${new Date(sinConexion).toLocaleString('es-MX')}. Puedes cobrar; los cobros se registran solos al volver el internet.` : ''; }
  let all = data||[];
  // Recordatorio: descuento que vence en 2 días o menos (sin graves, que no tienen)
  if (periodoVal === 'desc_vence') all = all.filter(r => {
    const t = !catalogoPorNumero(r.catalogo_numero)?.grave && descuentoVigente(r, _cachedConfig);
    return t && (new Date(r.fecha).getTime() + t.dias * 86400000 - Date.now()) <= 2 * 86400000;
  });

  const badge = $('badge-pendientes');
  if (badge) { badge.textContent = all.length; badge.style.display = all.length ? 'inline' : 'none'; }

  // Contador y totales
  const montoTotal = all.reduce((a,r)=>a+Number(r.monto),0);
  const pendLabel = $('pend-count-label');
  if (pendLabel) pendLabel.textContent = `${all.length} ${all.length!==1?'infracciones':'infracción'} · Total: ${fmt(montoTotal)}`;

  const pages = Math.max(1,Math.ceil(all.length/PEND_PAGE_SIZE));
  if (_pendPage>pages) _pendPage=pages;
  const rows = all.slice((_pendPage-1)*PEND_PAGE_SIZE, _pendPage*PEND_PAGE_SIZE);
  const today = Date.now();

  tbody.innerHTML = rows.length ? rows.map(r=>{
    const dias = Math.floor((today - new Date(r.fecha).getTime())/86400000);
    const urgColor = dias > 25 ? '#DC2626' : dias > 15 ? '#D97706' : dias > 7 ? '#1A7A82' : '#059669';
    const tramo = catalogoPorNumero(r.catalogo_numero)?.grave ? null : descuentoVigente(r, _cachedConfig);
    const descOk = !!tramo, descPct = tramo?.pct || 0;
    const montoFinal = descOk ? Math.round(Number(r.monto)*(1-descPct/100)) : Number(r.monto);
      return `<tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer">
      <td style="width:4px;padding:0;background:${urgColor};border-radius:3px 0 0 3px"></td>
      <td class="mono" style="font-size:.73rem;font-weight:700">${esc(r.folio||'—')}${r.estado==='vencida'?' <span class="badge-red">Vencida</span>':''}</td>
      <td style="font-family:monospace;font-weight:700;font-size:.8rem">${esc(r.placa)}</td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.infractor)}</td>
      <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem">${esc(r.tipo)}</td>
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
          data-folio="${esc(r.folio||'')}" data-placa="${esc(r.placa||'')}" data-tipo="${esc(r.tipo)}"
          data-monto="${r.monto||0}" data-ubicacion="" data-fecha="${r.fecha||''}"
          data-desc-pct="${descPct}" data-desc-hasta="${descOk ? new Date(new Date(r.fecha).getTime() + tramo.dias*86400000).toISOString() : ''}">
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
    _sb.from('infracciones').select('monto').in('estado',['pendiente','vencida'])
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
  if (error) { tbody.innerHTML=`<tr><td colspan="10" style="color:red">${esc(error.message)}</td></tr>`; return; }
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
      <td class="mono" style="font-size:.73rem;font-weight:700">${esc(r.folio_inf||'—')}</td>
      <td style="font-size:.78rem;white-space:nowrap">${fmtDateShort(r.created_at)}</td>
      <td style="font-family:monospace;font-weight:700;font-size:.8rem">${esc(inf.placa||'—')}</td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(inf.infractor||'—')}</td>
      <td style="color:var(--muted)">${fmt(r.monto_original)}</td>
      <td>${r.descuento_pct>0?`<span style="background:var(--green-bg);color:var(--green);padding:.15rem .5rem;border-radius:12px;font-size:.72rem;font-weight:700">${r.descuento_pct}%</span>`:'—'}</td>
      <td style="font-weight:800;color:var(--green)">${fmt(r.monto_final)}</td>
      <td><span style="font-size:.8rem">${metodoIcon[r.metodo]||''} ${esc(r.metodo||'—')}</span></td>
      <td style="font-size:.78rem;color:var(--muted)">${esc(r.cajero||'—')}</td>
      <td style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="printReciboPago('${r.id}')">Recibo</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="anularPago('${r.id}', ${jsArg(r.folio_inf||'')})" title="Anular este pago con motivo">Anular</button></td>
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
  const tok = String(data).match(/[?&]t=([0-9a-f-]{36})/i);
  if (tok) {
    const { data: r } = await _sb.from('infracciones').select('id').eq('token_verificacion', tok[1]).maybeSingle();
    if (r) infId = r.id;
  } else try {
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
  // Las vencidas también se cobran; solo se rechazan las pagadas, canceladas o en impugnación
  if (inf.estado !== 'pendiente' && inf.estado !== 'vencida') {
    showToast(inf.estado === 'pagada' ? 'Esta infracción ya está pagada' : `Esta infracción está ${inf.estado}: no se puede cobrar`);
    return;
  }
  openRegistrarPago(infId);
}

async function openBuscarParaPago() {
  if ($('buscar-pago-input')) $('buscar-pago-input').value = '';
  if ($('buscar-pago-results')) $('buscar-pago-results').innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Escribe la placa o el folio para cobrar o reimprimir un recibo</div>';
  openModal('modal-buscar-pago');
}

async function buscarInfPago() {
  const q = ($('buscar-pago-input')||{}).value?.trim()||'';
  const el = $('buscar-pago-results'); if (!el) return;
  if (q.length < 2) { el.innerHTML='<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Escribe al menos 2 caracteres</div>'; return; }
  const qf = q.replace(/[,()"'\\%*]/g, ' ').trim();
  // También las pagadas, para reimprimir su recibo
  const { data } = await _sb.from('infracciones').select('id,folio,placa,infractor,tipo,monto,fecha,estado,pagos(id)')
    .in('estado',['pendiente','vencida','pagada']).or(`placa.ilike.%${qf}%,infractor.ilike.%${qf}%,folio.ilike.%${qf}%`).order('fecha',{ascending:false}).limit(12);
  const rows = data||[];
  const accion = r => {
    const pagoId = r.estado === 'pagada' ? (Array.isArray(r.pagos) ? r.pagos[0]?.id : r.pagos?.id) : null;
    if (r.estado === 'pagada') return pagoId ? `closeModal('modal-buscar-pago');printReciboPago('${pagoId}')` : `showToast('Pagada: el recibo no está disponible')`;
    return `closeModal('modal-buscar-pago');openRegistrarPago('${r.id}')`;
  };
  el.innerHTML = rows.length ? rows.map(r=>`
    <div class="bp-item" style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s" onmouseenter="this.style.background='var(--stone)'" onmouseleave="this.style.background=''" onclick="${accion(r)}">
      <div style="flex:1">
        <div style="font-size:.82rem;font-weight:700;font-family:monospace">${esc(r.folio||'—')}</div>
        <div style="font-size:.78rem;color:var(--text)">${esc(r.infractor)} · ${esc(r.placa)}</div>
        <div style="font-size:.73rem;color:var(--muted)">${esc(r.tipo)} · ${fmtDateShort(r.fecha)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.9rem;font-weight:700;color:var(--ac)">${fmt(r.monto)}</div>
        ${estadoBadge(r.estado)}
        <div style="font-size:.7rem;font-weight:700;color:${r.estado==='pagada'?'var(--muted)':'var(--green)'};margin-top:.2rem">${r.estado==='pagada'?'Reimprimir recibo':'Cobrar'} →</div>
      </div>
    </div>`).join('') : '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Sin resultados</div>';
}

async function asegurarConfig() {
  if (_cachedConfig?.valor_uma !== undefined) return _cachedConfig;
  const { data } = await _sb.from('configuracion').select('*').eq('id', 1).single();
  if (data) _cachedConfig = { ...(_cachedConfig||{}), ...data };
  return _cachedConfig;
}

async function openRegistrarPago(infId) {
  await asegurarConfig().catch(() => {});
  if (!_cachedConfig) _cachedConfig = _leerLocal('tm_config');

  let { data: r, error: errInf } = await _sb.from('infracciones').select('*').eq('id', infId).single();
  window._pagoSinConexion = null;
  if (!r && (!navigator.onLine || esErrorDeRed(errInf))) {
    r = (_leerLocal('tm_pendientes')?.rows || []).find(x => String(x.id) === String(infId));
    window._pagoSinConexion = r || null;
  }
  if (!r) return;
  $('pago-inf-id').value = infId;
  const dias = Math.floor((Date.now()-new Date(r.fecha).getTime())/86400000);
  await cargarCatalogo();
  const grave = !!catalogoPorNumero(r.catalogo_numero)?.grave;
  const tramo = grave ? null : descuentoVigente(r, _cachedConfig);
  const descOk = !!tramo, descPct = tramo?.pct || 0;
  const ultimo = tramosDescuento(_cachedConfig).slice(-1)[0];
  const infoEl = $('pago-inf-info');
  if (infoEl) infoEl.innerHTML = `
    <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.35rem">Infracción</div>
    <div style="font-size:.92rem;font-weight:700;color:var(--ink)">${esc(r.folio||'—')} — ${esc(r.tipo)}</div>
    <div style="font-size:.8rem;color:var(--text);margin-top:.2rem">${esc(r.infractor)} · Placa: <strong>${esc(r.placa)}</strong></div>
    <div style="font-size:.8rem;color:var(--text)">${fmtDateShort(r.fecha)} · <strong>${fmt(r.monto)}</strong></div>
    ${descOk?`<div style="font-size:.75rem;color:var(--green);margin-top:.3rem;font-weight:600">✓ Elegible para descuento del ${descPct}% (pago dentro de ${tramo.dias} días)</div>`:`<div style="font-size:.75rem;color:var(--muted);margin-top:.3rem">${grave ? 'Esta infracción se paga íntegra, sin descuento (conducir en estado de ebriedad)' : `Sin descuento disponible (han pasado más de ${ultimo?.dias ?? 0} días)`}</div>`}`;
  const descEl = $('pago-descuento');
  if (descEl) {
    descEl.innerHTML = `<option value="0">Sin descuento (100%)</option><option value="${descPct}"${descOk ? '' : ' disabled'}>${descOk ? descPct + '% — pronto pago' : 'Descuento no disponible'}</option>`;
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
  if (window._pagoSinConexion && infoEl) infoEl.insertAdjacentHTML('beforeend', '<div style="font-size:.75rem;color:#92400E;background:var(--amber-bg);border-radius:6px;padding:.4rem .6rem;margin-top:.5rem;font-weight:600">Sin conexión: se imprimirá un comprobante provisional y el pago se registrará al volver el internet.</div>');
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
  // El servidor calcula el descuento, asigna el cajero y marca la infracción
  // como pagada en una sola operación (evita cobros dobles).
  const metodo = $('pago-metodo')?.value||'efectivo';
  const aplicar = parseInt(($('pago-descuento')||{}).value||'0') > 0, notas = $('pago-notas')?.value?.trim()||'';
  const sinConexion = async () => {
    const r = window._pagoSinConexion || (_leerLocal('tm_pendientes')?.rows || []).find(x => String(x.id) === String(infId));
    if (btn) { btn.disabled=false; btn.textContent='Registrar pago'; }
    if (!r) { alert('Sin conexión y esta infracción no está en la lista guardada de Caja. Intenta de nuevo cuando vuelva el internet.'); return; }
    const c = await encolarCobro(r, aplicar, metodo, notas, window._pagoMontoFinal ?? Number(r.monto));
    closeModal('modal-pago'); closeModal('modal-detail');
    showToast(`Cobro guardado sin conexión: ${fmt(c.monto_final)}`);
    printComprobanteProvisional(c);
    renderPendientesTable();
  };
  if (!navigator.onLine || window._pagoSinConexion) return sinConexion();
  const { data: pago, error } = await _sb.rpc('registrar_pago', {
    p_infraccion_id: parseInt(infId),
    p_aplicar_descuento: aplicar,
    p_metodo: metodo,
    p_notas: notas
  });
  if (error && esErrorDeRed(error)) return sinConexion();
  if (btn) { btn.disabled=false; btn.textContent='Registrar pago'; }
  if (error) { alert('Error: '+error.message); return; }
  const final = Number(pago.monto_final);
  await logActivity('infraccion',`Pago registrado — ${pago.folio_inf||'infracción'}: ${fmt(final)} (${metodo})`);
  closeModal('modal-pago'); closeModal('modal-detail');
  showToast(`Pago registrado: ${fmt(final)} — ${metodo}`);
  printReciboPago(pago.id);
  renderInfracciones(); renderDashboard();
  if ($('view-caja')?.style.display==='block') { renderCajaStats(); renderPendientesTable(); renderCajaTable(); }
}

async function printReciboPago(pagoId) {
  const { data: p } = await _sb.from('pagos').select('*, infracciones(folio,tipo,placa,infractor,fecha,ubicacion)').eq('id',pagoId).single();
  const { data: cfg } = await _sb.from('configuracion').select('*').eq('id',1).single();
  if (!p) return;
  const inf = p.infracciones||{};
  const mun = esc(cfg?.municipio||'Municipio'), est = esc(cfg?.estado||'');
  const qrRecibo = qrVerificacion(p.token_verificacion);
  const fechaPago = new Date(p.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const horaPago  = new Date(p.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Recibo ${esc(p.folio_inf||'')}</title>
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
        <div class="f"><div class="fl">Folio</div><div class="fv" style="font-family:monospace;font-weight:700">${esc(p.folio_inf||'—')}</div></div>
        <div class="f"><div class="fl">Tipo</div><div class="fv">${esc(inf.tipo||'—')}</div></div>
        <div class="f"><div class="fl">Fecha infracción</div><div class="fv">${fmtDateShort(inf.fecha)}</div></div>
        <div class="f"><div class="fl">Infractor</div><div class="fv" style="font-weight:700">${esc(inf.infractor||'—')}</div></div>
        <div class="f"><div class="fl">Placa</div><div class="fv" style="font-family:monospace">${esc(inf.placa||'—')}</div></div>
      </div>
      <div class="col">
        <div class="sec">Detalle del pago</div>
        <div class="f"><div class="fl">Monto original</div><div class="fv">${fmt(p.monto_original)}</div></div>
        <div class="f"><div class="fl">Descuento</div><div class="fv" style="color:#059669">${p.descuento_pct>0?p.descuento_pct+'%':'Sin descuento'}</div></div>
        <div class="f"><div class="fl">Método de pago</div><div class="fv" style="text-transform:capitalize">${esc(p.metodo)}</div></div>
        <div class="f"><div class="fl">Cajero</div><div class="fv">${esc(p.cajero||'—')}</div></div>
        <div class="amount"><div class="al">Total cobrado</div><div class="av">${fmt(p.monto_final)}</div><div class="as">MXN — ${esc(p.metodo.charAt(0).toUpperCase()+p.metodo.slice(1))}</div></div>
      </div>
    </div>
    <div class="sig">
      <div class="sb"><div class="sl"></div><div class="sn">${esc(p.cajero||'Cajero')}</div><div class="st">Cajero que recibe</div></div>
      <div class="sb"><div class="sl"></div><div class="sn">${esc(inf.infractor||'Infractor')}</div><div class="st">Firma de conformidad</div></div>
    </div>
    ${qrRecibo?`<div style="display:flex;align-items:center;justify-content:center;gap:3mm;margin-top:4mm"><img src="${qrRecibo}" style="width:20mm;height:20mm"/><div style="font-size:7.5px;color:#555;max-width:70mm;line-height:1.4">Escanee el código para verificar que este recibo es auténtico.</div></div>`:''}
    <div class="foot">Recibo REC-${String(p.id).padStart(6,'0')} · Infracción ${esc(p.folio_inf||'')}. Este documento acredita el pago total. Expedido por Dirección de Tránsito, ${mun}.</div>
  </div>
  <script>setTimeout(()=>window.print(),600)<\/script>
  </body></html>`;
  const win = window.open('','_blank','width=900,height=700');
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Oficiales ─────────────────────────────────────────────
async function renderOficiales() {
  renderTurnosActivos();
  const tbody = $('oficiales-table'); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  const { data, error } = await _sb.from('infracciones').select('oficial,monto,estado,fecha');
  if (error) { tbody.innerHTML=`<tr><td colspan="6" style="color:red">${esc(error.message)}</td></tr>`; return; }
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
      <td style="font-weight:600">${esc(n)}</td>
      <td style="text-align:center;font-weight:700">${s.total}</td>
      <td>${fmt(s.monto)}</td>
      <td>${s.pend>0?`<span class="badge-yellow">${s.pend}</span>`:'<span class="badge-muted">0</span>'}</td>
      <td>${s.pag>0?`<span class="badge-green">${s.pag}</span>`:'<span class="badge-muted">0</span>'}</td>
      <td>${fmtDateShort(s.ultima)}</td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Sin datos — agrega el nombre del oficial al registrar infracciones</td></tr>';
}

// Turnos abiertos ahora; el supervisor puede cerrar el que un oficial olvidó
async function renderTurnosActivos() {
  const card = $('turnos-activos-card'), el = $('turnos-activos'); if (!card || !el) return;
  card.style.display = '';
  const { data, error } = await _sb.from('turnos').select('id,oficial_nombre,inicio').eq('estado','activo').order('inicio');
  if (error) { el.innerHTML = `<div style="color:red;font-size:.8rem">${esc(error.message)}</div>`; return; }
  el.innerHTML = (data||[]).length ? data.map(t => {
    const min = Math.max(0, Math.floor((Date.now() - new Date(t.inicio).getTime()) / 60000)), largo = min > 12*60;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.55rem 0;border-top:1px solid var(--border)">
      <div>
        <div style="font-weight:600;font-size:.85rem">${esc(t.oficial_nombre || '—')}</div>
        <div style="font-size:.74rem;color:${largo?'var(--red)':'var(--muted)'}">Desde ${new Date(t.inicio).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} · ${Math.floor(min/60)} h ${min%60} min${largo?' · ¿se le olvidó cerrarlo?':''}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="cerrarTurnoDe('${t.id}', ${jsArg(t.oficial_nombre)})">Cerrar turno</button>
    </div>`;
  }).join('') : '<div style="font-size:.8rem;color:var(--muted);padding-top:.3rem">No hay oficiales en turno.</div>';
}

async function cerrarTurnoDe(id, nombre) {
  if (!confirm(`¿Cerrar el turno de ${nombre}? Úsalo cuando se le olvidó cerrarlo.`)) return;
  const { data, error } = await _sb.from('turnos')
    .update({ estado: 'cerrado', fin: new Date().toISOString(), notas: `Cerrado por ${_session?.name || 'supervisor'}` })
    .eq('id', id).select('id');
  if (error || !data?.length) { alert('No se pudo cerrar el turno' + (error ? ': ' + error.message : '')); return; }
  await logActivity('turno', `Turno de ${nombre} cerrado por ${_session?.name || 'supervisor'}`);
  showToast('Turno cerrado');
  renderTurnosActivos();
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
  const { data, error } = await _sb.from('usuarios').select(USR_COLS).order('id');
  if (error) { tbody.innerHTML=`<tr><td colspan="5" style="color:red">${esc(error.message)}</td></tr>`; return; }
  const labels = Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.nombre]));
  tbody.innerHTML = (data||[]).map(u=>`
    <tr>
      <td style="font-weight:600">${esc(u.nombre)}</td>
      <td class="mono">${esc(u.usuario)}</td>
      <td>${esc(labels[u.rol]||u.rol)}</td>
      <td>${u.activo?'<span class="badge-green">Activo</span>':'<span class="badge-muted">Inactivo</span>'}</td>
      <td style="display:flex;gap:.4rem">
        <button class="btn btn-ghost btn-sm" onclick="editUsuario(${u.id})">Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="printCredencial('${u.id}')" title="Imprimir credencial">🪪</button>
        <button class="btn btn-ghost btn-sm" onclick="restablecerContrasena(${u.id}, ${jsArg(u.nombre)})" title="Generar una contraseña temporal">Restablecer contraseña</button>
        ${u.usuario!=='admin'?`<button class="btn btn-ghost btn-sm" onclick="toggleUsuario(${u.id},${!u.activo})">${u.activo?'Desactivar':'Activar'}</button>`:''}
      </td>
    </tr>`).join('');
}

function describirRol() {
  const d = $('usr-rol-desc'), r = ROLES[$('usr-rol')?.value];
  if (d) d.textContent = r ? r.resumen : '';
}

function openNewUsuario() {
  $('modal-usr-title').textContent = 'Nuevo usuario';
  ['usr-id','usr-nombre','usr-usuario','usr-pass','usr-iniciales','usr-placa','usr-adscripcion'].forEach(id=>{ if($(id)) $(id).value=''; });
  if ($('usr-rol')) $('usr-rol').value = 'oficial';
  if ($('usr-pass')) $('usr-pass').placeholder = 'Contraseña requerida';
  describirRol();
  openModal('modal-usuario');
}

async function editUsuario(id) {
  const { data } = await _sb.from('usuarios').select(USR_COLS).eq('id',id).single();
  if (!data) return;
  $('modal-usr-title').textContent = 'Editar usuario';
  $('usr-id').value        = data.id;
  $('usr-nombre').value    = data.nombre;
  $('usr-usuario').value   = data.usuario;
  $('usr-pass').value      = '';
  $('usr-iniciales').value = data.iniciales||'';
  $('usr-rol').value       = data.rol;
  if ($('usr-placa')) $('usr-placa').value = data.numero_placa||'';
  if ($('usr-adscripcion')) $('usr-adscripcion').value = data.adscripcion||'';
  describirRol();
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
  if (pass && pass.length < 6) { alert('La contraseña debe tener al menos 6 caracteres'); return; }
  const { data: usrId, error } = await _sb.rpc('admin_guardar_usuario', {
    p_id: id ? parseInt(id) : null, p_nombre: nombre, p_usuario: usuario,
    p_rol: rol, p_iniciales: iniciales, p_contrasena: pass || null
  });
  if (error) { alert('Error: '+error.message); return; }
  // Datos del policía vial que se imprimen en la boleta (art. 327)
  const { error: e2 } = await _sb.from('usuarios').update({
    numero_placa: ($('usr-placa')||{}).value?.trim() || '',
    adscripcion:  ($('usr-adscripcion')||{}).value?.trim() || ''
  }).eq('id', usrId || id);
  if (e2) { alert('Usuario guardado, pero no la placa/adscripción: '+e2.message); }
  closeModal('modal-usuario');
  renderUsuarios();
  showToast('Usuario '+(id?'actualizado':'creado')+' correctamente');
}

// Contraseña temporal generada en el servidor (controles.sql)
async function restablecerContrasena(id, nombre) {
  if (!confirm(`¿Generar una contraseña temporal para ${nombre}? La actual dejará de funcionar.`)) return;
  const { data, error } = await _sb.rpc('admin_restablecer_contrasena', { p_id: id });
  if (error) { alert('Error: '+error.message); return; }
  await logActivity('usuario', `Contraseña restablecida para ${nombre}`);
  prompt(`Contraseña temporal de ${nombre}. Entrégasela en persona y pídele que la cambie en "Cambiar mi contraseña":`, data);
}

async function toggleUsuario(id, activo) {
  const { error } = await _sb.from('usuarios').update({activo}).eq('id',id);
  if (error) { alert('Error: '+error.message); return; }
  renderUsuarios();
}

// ── Ticket 80mm (print functions) ────────────────────────
function buildTicket80(r, cfg, qrDataUrl) {
  const mun = esc(cfg?.municipio || 'Municipio');
  const est = esc(cfg?.estado || '');
  const fechaObj = new Date(r.fecha);
  const fechaStr = fechaObj.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
  const horaStr  = fechaObj.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const { tramos, limFecha } = plazosPago(r, cfg, {day:'2-digit',month:'2-digit',year:'numeric'});
  const montoFmt  = Number(r.monto).toLocaleString('es-MX');
  const ref = (r.folio||'INF').replace(/[^A-Z0-9]/g,'') + String(r.id||0).padStart(6,'0');

  return `<div class="t80">
    <div class="t-center t-bold" style="font-size:7.5pt;letter-spacing:.5px">${mun.toUpperCase()}</div>
    ${est?`<div class="t-center" style="font-size:6.5pt">${est.toUpperCase()}</div>`:''}
    <div class="t-center" style="font-size:7pt">DIRECCIÓN DE TRÁNSITO Y MOVILIDAD</div>
    <div class="t-div"></div>
    <div class="t-invert">INFRACCIÓN DE TRÁNSITO</div>
    <div style="margin:1.5mm 0"></div>
    <div class="t-center t-xl">${esc(r.folio||'—')}</div>
    <div class="t-div"></div>
    <div class="t-row"><span>FECHA:</span><span>${fechaStr}</span></div>
    <div class="t-row"><span>HORA:</span><span>${horaStr}</span></div>
    <div class="t-div"></div>
    <div class="t-bold" style="font-size:7.5pt">INFRACTOR:</div>
    <div>${esc(r.infractor)}</div>
    <div class="t-row t-small"><span>LIC:</span><span>${esc(r.licencia||'N/A')}${r.licencia_tipo ? ' ' + esc(r.licencia_tipo) : ''}</span></div>
    <div class="t-small" style="word-break:break-word">${htmlDatosInfractor(r)}</div>
    <div style="margin:.5mm 0"></div>
    <div class="t-bold" style="font-size:7.5pt">VEHÍCULO:</div>
    <div class="t-row"><span>PLACA:</span><span class="t-bold">${esc(r.placa)}</span></div>
    ${r.color_vehiculo?`<div class="t-row t-small"><span>COLOR:</span><span>${esc(r.color_vehiculo)}</span></div>`:''}
    ${r.vehiculo?`<div class="t-small" style="word-break:break-word">${esc(r.vehiculo)}</div>`:''}
    <div class="t-div"></div>
    <div class="t-bold" style="font-size:7.5pt">INFRACCIÓN:</div>
    <div>${esc(r.tipo)}</div>
    ${r.fundamento ? `<div class="t-small" style="margin-top:.5mm">Fundamento: ${esc(r.fundamento)}</div>` : ''}
    ${r.ubicacion?`<div class="t-small" style="margin-top:.5mm">Lugar: ${esc(r.ubicacion)}</div>`:''}
    <div class="t-small" style="margin-top:.5mm">Circunstancias (art. 331): ${htmlCircunstancias(r)}</div>
    ${(r._lista||[]).length > 1 ? `<div class="t-div"></div>
    <div class="t-bold" style="font-size:7pt">INFRACCIONES DE ESTA BOLETA (ART. 327):</div>
    ${r._lista.map((x, i) => `<div class="t-row t-small"><span>${esc(x.folio||'—')}${i===0?' (mayor cuantía)':''}</span><span>$${Number(x.monto).toLocaleString('es-MX')}</span></div>`).join('')}` : ''}
    <div class="t-solid"></div>
    <div class="t-center t-bold" style="font-size:7.5pt">MONTO A PAGAR</div>
    <div class="t-amount">
      <div class="t-xl">$${montoFmt}</div>
      <div class="t-small">MXN</div>
    </div>
    ${r._grave ? `<div class="t-disc">
      <div class="t-bold">SIN DESCUENTO</div>
      <div>Se paga íntegra conforme al Reglamento</div>
    </div>` : tramos.map(x => `<div class="t-disc">
      <div class="t-bold">▼ ${x.pct}% descuento pagando a más tardar el</div>
      <div>${x.hasta} — solo $${x.monto} MXN</div>
    </div>`).join('')}
    <div class="t-disc" style="border-color:#DC2626;color:#DC2626">
      <div class="t-bold">⚠ Fecha límite de pago: ${limFecha}</div>
    </div>
    <div class="t-div"></div>
    <div class="t-center t-small">Pague en Tesorería Municipal</div>
    <div class="t-center t-small">Lunes a Viernes 8:00–15:00 hrs</div>
    <div class="t-center t-small" style="margin-top:.5mm">Referencia de pago:</div>
    <div class="t-barref">${ref}</div>
    ${qrDataUrl?`<div style="text-align:center;margin:2mm 0 1mm"><img src="${qrDataUrl}" style="width:130px;height:130px;display:block;margin:0 auto"/><div style="font-size:6.5pt;margin-top:.5mm;color:#444">Escanea para verificar o pagar</div></div>`:''}
    <div class="t-div"></div>
    ${r.documento_retenido ? `<div class="t-bold" style="font-size:7pt">DOCUMENTO RETENIDO (ARTS. 343-344):</div>
    <div class="t-small">${esc(DOC_RETENIDO[r.documento_retenido] || '')}${r.documento_numero ? ' ' + esc(r.documento_numero) : ''}. Se devuelve en ${esc(cfg?.resguardo_lugar || 'la Delegación')} al pagar.</div>
    <div class="t-div"></div>` : ''}
    <div class="t-bold" style="font-size:7pt">FIRMA DEL OFICIAL:</div>
    ${r.firma_oficial ? imgFirma(r.firma_oficial, 12) : '<div class="t-sig"></div>'}
    <div class="t-small">${esc(r.oficial||'Agente de Tránsito')}${r.oficial_placa ? ' · Placa ' + esc(r.oficial_placa) : ''}</div>
    ${r.oficial_adscripcion ? `<div class="t-small">${esc(r.oficial_adscripcion)}</div>` : ''}
    <div style="margin:.5mm 0"></div>
    <div class="t-bold" style="font-size:7pt">FIRMA / HUELLA DEL INFRACTOR:</div>
    ${r.firma_infractor ? imgFirma(r.firma_infractor, 12) : (r.firma_negada ? '<div class="t-small">Se negó a firmar</div>' : '<div class="t-sig"></div>')}
    <div class="t-div"></div>
    <div class="t-small" style="text-align:justify">${esc(cfg?.leyenda_recurso || 'Contra esta boleta procede el recurso de revocación.')}</div>
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
    qrDataUrl = qrVerificacion(r.token_verificacion, 260);
  } catch(e) { console.warn('QR gen error:', e); }

  await cargarCatalogo();
  r._grave = !!catalogoPorNumero(r.catalogo_numero)?.grave;
  r._lista = await infraccionesDeBoleta(r);
  const ticketHTML = buildTicket80(r, cfg, qrDataUrl);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Ticket ${esc(r.folio||'')}</title>
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
// ── Reporte mensual (reporte_mensual.sql + función reporte-mensual) ──
function initReporteMensual(mesSel) {
  const sel = $('rep-mes'); if (!sel) return;
  if (!sel.options.length) {
    const hoy = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      sel.add(new Option(d.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }), v));
    }
    // El mes en curso al final, por si se quiere ver cómo va
    const v = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    sel.add(new Option(hoy.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) + ' (en curso)', v));
  }
  if (mesSel && [...sel.options].some(o => o.value === mesSel)) sel.value = mesSel;
  const tri = $('rep-trimestre');
  if (tri && !tri.options.length) {
    const hoy = new Date();
    let y = hoy.getFullYear(), q = Math.floor(hoy.getMonth() / 3) + 1;
    for (let i = 0; i < 8; i++) {
      tri.add(new Option(`${['Primer', 'Segundo', 'Tercer', 'Cuarto'][q - 1]} trimestre ${y}${i === 0 ? ' (en curso)' : ''}`, `${y}-${q}`));
      if (--q === 0) { q = 4; y--; }
    }
    if (tri.options.length > 1) tri.selectedIndex = 1;
  }
  const enviar = $('rep-enviar'); if (enviar) enviar.style.display = _rol === 'admin' ? '' : 'none';
}

async function printReporteMensual() {
  const mes = ($('rep-mes')||{}).value;
  const win = window.open('', '_blank', 'width=900,height=800');
  const { data: r, error } = await _sb.rpc('reporte_mensual', { p_mes: mes ? mes + '-01' : null });
  if (error || !r) { if (win) win.close(); alert('No se pudo generar el reporte: ' + (error?.message || 'sin datos')); return; }
  const [y, m] = r.mes.split('-').map(Number);
  const nombre = new Date(y, m - 1, 15).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
  const varia = (a, b) => { if (!b) return ''; const p = Math.round((a - b) / b * 100); return p === 0 ? 'igual que el mes anterior' : `${p > 0 ? '+' : ''}${p}% vs. mes anterior`; };
  const tabla = (titulo, cab, filas) => filas.length ? `<h3>${titulo}</h3><table><thead><tr>${cab.map((c, i) => `<th${i ? ' class="n"' : ''}>${c}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(f => `<tr>${f.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
  const estados = Object.entries(r.por_estado || {}).map(([k, v]) => `${esc(k)}: ${v}`).join(' · ') || '—';
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Reporte de Tránsito · ${esc(nombre)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:2rem auto;max-width:780px;padding:0 1rem}
    .k{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#4B5563}
    h1{font-size:1.5rem;margin:.3rem 0 .2rem}
    .sub{color:#4B5563;font-size:.85rem;margin-bottom:1.3rem}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);border-top:2px solid #111827;border-bottom:1px solid #111827;margin-bottom:1.2rem}
    .grid div{padding:.7rem .8rem .7rem 0;border-right:1px solid #E5E7EB}
    .grid div:last-child{border-right:0}
    .grid b{display:block;font-size:1.35rem;margin-top:.15rem}
    .grid small{color:#4B5563;font-size:.72rem}
    h3{font-size:.95rem;margin:1.4rem 0 .4rem}
    table{width:100%;border-collapse:collapse;font-size:.82rem}
    th{text-align:left;border-bottom:1px solid #111827;padding:.35rem 0}
    td{border-bottom:1px solid #E5E7EB;padding:.35rem 0}
    .n{text-align:right}
    .firma{margin-top:3.5rem;display:flex;justify-content:flex-end}
    .firma div{border-top:1px solid #111827;padding-top:.3rem;width:260px;text-align:center;font-size:.8rem}
    .pie{margin-top:2rem;font-size:.7rem;color:#6B7280}
    button{margin-bottom:1rem;padding:.45rem 1rem;background:#1A7A82;color:#fff;border:0;border-radius:6px;cursor:pointer;font:inherit}
    @media print{button{display:none}body{margin:0 auto}}
  </style></head><body>
  <button onclick="window.print()">Imprimir o guardar como PDF</button>
  <div class="k">Dirección de Tránsito y Movilidad · ${esc(r.municipio || '')}${r.estado_mun ? ', ' + esc(r.estado_mun) : ''}</div>
  <h1>Reporte mensual · ${esc(nombre)}</h1>
  <div class="sub">Generado el ${new Date().toLocaleString('es-MX')}</div>
  <div class="grid">
    <div><small>Infracciones levantadas</small><b>${r.infracciones}</b><small>${esc(varia(r.infracciones, r.infracciones_prev))}</small></div>
    <div><small>Recaudación</small><b>${fmt(r.recaudacion)}</b><small>${esc(varia(Number(r.recaudacion), Number(r.recaudacion_prev)))}</small></div>
    <div><small>Pendientes de cobro (acumulado)</small><b>${fmt(r.pendientes_monto)}</b><small>${r.pendientes_total} boletas</small></div>
  </div>
  <table><tbody>
    <tr><td>Monto de las infracciones del mes</td><td class="n">${fmt(r.infracciones_monto)}</td></tr>
    <tr><td>Estado de las boletas del mes</td><td class="n">${estados}</td></tr>
    <tr><td>Pagos registrados</td><td class="n">${r.pagos}</td></tr>
    <tr><td>Descuentos por pronto pago otorgados</td><td class="n">${fmt(r.descuentos)}</td></tr>
    <tr><td>Vehículos ingresados al corralón / liberados</td><td class="n">${r.grua_ingresos} / ${r.grua_liberados}</td></tr>
    <tr><td>Accidentes registrados (lesionados / fallecidos)</td><td class="n">${r.accidentes} (${r.lesionados} / ${r.fallecidos})</td></tr>
  </tbody></table>
  ${tabla('Motivos más frecuentes', ['Motivo', 'Boletas', 'Monto'], (r.por_tipo || []).map(t => [esc(t.tipo), t.n, fmt(t.monto)]))}
  ${tabla('Boletas por oficial', ['Oficial', 'Boletas', 'Monto'], (r.por_oficial || []).map(o => [esc(o.oficial), o.n, fmt(o.monto)]))}
  ${tabla('Recaudación por forma de pago', ['Forma de pago', 'Pagos', 'Total'], (r.por_metodo || []).map(p => [esc(p.metodo), p.pagos, fmt(p.total)]))}
  <div class="firma"><div>${esc(r.director || 'Director de Tránsito')}<br>Director de Tránsito y Movilidad</div></div>
  <div class="pie">Sistema de Tránsito y Movilidad Municipal</div>
  </body></html>`;
  if (!win) { alert('Permite las ventanas emergentes para ver el reporte'); return; }
  win.document.write(html); win.document.close();
}

// ── Reporte trimestral para Cabildo (comparado con el mismo trimestre del año anterior) ──
async function _todasFilas(tabla, cols, campo, desde, hasta) {
  const filas = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await _sb.from(tabla).select(cols).gte(campo, desde).lt(campo, hasta).range(i, i + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) return filas;
  }
}
function _barrasSVG(titulo, meses, actual, anterior, fmtV) {
  const W = 640, H = 210, L = 64, B = 30, T = 14, max = Math.max(1, ...actual, ...anterior);
  const paso = Math.pow(10, Math.floor(Math.log10(max)));
  let tope = Math.ceil(max / paso) * paso;
  if ([...actual, ...anterior].every(Number.isInteger) && tope < 4) tope = 4;
  const y = v => T + (H - T - B) * (1 - v / tope), gw = (W - L - 10) / meses.length, bw = Math.min(46, gw / 3);
  const ticks = [0, .25, .5, .75, 1].map(f => tope * f);
  return `<h3>${titulo}</h3><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${titulo}">
    ${ticks.map(t => `<line x1="${L}" x2="${W - 10}" y1="${y(t)}" y2="${y(t)}" stroke="#E5E7EB"/><text x="${L - 6}" y="${y(t) + 4}" font-size="10" text-anchor="end" fill="#4B5563">${fmtV(t)}</text>`).join('')}
    ${meses.map((m, i) => { const x = L + gw * i + gw / 2; return `
      <rect x="${x - bw - 2}" y="${y(anterior[i])}" width="${bw}" height="${H - B - y(anterior[i])}" fill="#9CA3AF"/>
      <rect x="${x + 2}" y="${y(actual[i])}" width="${bw}" height="${H - B - y(actual[i])}" fill="#1A7A82"/>
      <text x="${x + 2 + bw / 2}" y="${y(actual[i]) - 4}" font-size="10" text-anchor="middle" fill="#111827">${fmtV(actual[i])}</text>
      <text x="${x}" y="${H - 10}" font-size="11" text-anchor="middle" fill="#111827">${m}</text>`; }).join('')}
  </svg>`;
}
async function printReporteCabildo() {
  const [y, q] = (($('rep-trimestre')||{}).value || '').split('-').map(Number);
  if (!y) return;
  const win = window.open('', '_blank', 'width=900,height=800');
  const rango = yy => [new Date(yy, (q - 1) * 3, 1).toISOString(), new Date(yy, q * 3, 1).toISOString()];
  const [d1, h1] = rango(y), [d0, h0] = rango(y - 1);
  let datos;
  try {
    const cargar = (d, h) => Promise.all([
      _todasFilas('infracciones', 'fecha,tipo,monto,estado,ubicacion', 'fecha', d, h),
      _todasFilas('pagos', 'created_at,monto_final,monto_original,metodo', 'created_at', d, h),
      _todasFilas('accidentes', 'fecha,tipo,lesionados,fallecidos,ubicacion', 'fecha', d, h),
      _todasFilas('permisos', 'created_at', 'created_at', d, h),
    ]);
    datos = await Promise.all([cargar(d1, h1), cargar(d0, h0), asegurarConfig()]);
  } catch (e) { if (win) win.close(); alert('No se pudo generar el reporte: ' + (e.message || e)); return; }
  const [[inf, pag, acc, per], [inf0, pag0, acc0, per0], cfg] = datos;
  const suma = (a, k) => a.reduce((s, r) => s + Number(r[k] || 0), 0);
  const varia = (a, b) => !b ? (a ? 'sin datos del año anterior' : '') : `${a >= b ? '+' : ''}${Math.round((a - b) / b * 100)}% vs. ${y - 1}`;
  const nombreTri = `${['Primer', 'Segundo', 'Tercer', 'Cuarto'][q - 1]} trimestre ${y}`;
  const mesesIdx = [0, 1, 2].map(i => (q - 1) * 3 + i);
  const meses = mesesIdx.map(m => new Date(y, m, 15).toLocaleDateString('es-MX', { month: 'short' }));
  const porMes = (a, campo, k) => mesesIdx.map(m => a.filter(r => new Date(r[campo]).getMonth() === m).reduce((s, r) => s + (k ? Number(r[k] || 0) : 1), 0));
  const contar = (a, f) => Object.entries(a.reduce((o, r) => { const k = f(r); if (k) o[k] = (o[k] || 0) + 1; return o; }, {})).sort((x, z) => z[1] - x[1]);
  const infValidas = inf.filter(r => r.estado !== 'cancelada'), infValidas0 = inf0.filter(r => r.estado !== 'cancelada');
  const recaud = suma(pag, 'monto_final'), recaud0 = suma(pag0, 'monto_final');
  const pagadas = infValidas.filter(r => r.estado === 'pagada').length;
  const motivos = contar(infValidas, r => r.tipo).slice(0, 10);
  const calles = contar([...infValidas, ...acc], r => _calle(r.ubicacion)).slice(0, 8);
  const tiposAcc = contar(acc, r => r.tipo);
  const lesion = suma(acc, 'lesionados'), lesion0 = suma(acc0, 'lesionados'), fall = suma(acc, 'fallecidos'), fall0 = suma(acc0, 'fallecidos');
  const fmtCorto = v => v >= 1000 ? `$${(v / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })}k` : `$${Math.round(v)}`;
  const tabla = (titulo, cab, filas) => filas.length ? `<h3>${titulo}</h3><table><thead><tr>${cab.map((c, i) => `<th${i ? ' class="n"' : ''}>${c}</th>`).join('')}</tr></thead>
    <tbody>${filas.map(f => `<tr>${f.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '';
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe a Cabildo · ${esc(nombreTri)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:2rem auto;max-width:780px;padding:0 1rem}
    .k{font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:#4B5563}
    h1{font-size:1.5rem;margin:.3rem 0 .2rem}
    .sub{color:#4B5563;font-size:.85rem;margin-bottom:1.3rem}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);border-top:2px solid #111827;border-bottom:1px solid #111827;margin-bottom:.4rem}
    .grid div{padding:.7rem .8rem .7rem 0;border-right:1px solid #E5E7EB}
    .grid div:nth-child(3n){border-right:0}
    .grid div:nth-child(n+4){border-top:1px solid #E5E7EB}
    .grid b{display:block;font-size:1.3rem;margin-top:.15rem}
    .grid small{color:#4B5563;font-size:.72rem}
    .ley{font-size:.72rem;color:#4B5563;display:flex;gap:1rem;margin-top:.3rem}
    .ley i{display:inline-block;width:10px;height:10px;margin-right:.3rem;vertical-align:-1px}
    h3{font-size:.95rem;margin:1.4rem 0 .4rem}
    table{width:100%;border-collapse:collapse;font-size:.82rem}
    th{text-align:left;border-bottom:1px solid #111827;padding:.35rem 0}
    td{border-bottom:1px solid #E5E7EB;padding:.35rem 0}
    .n{text-align:right;font-variant-numeric:tabular-nums}
    .firma{margin-top:3.5rem;display:flex;justify-content:flex-end}
    .firma div{border-top:1px solid #111827;padding-top:.3rem;width:260px;text-align:center;font-size:.8rem}
    .pie{margin-top:2rem;font-size:.7rem;color:#6B7280}
    button{margin-bottom:1rem;padding:.45rem 1rem;background:#1A7A82;color:#fff;border:0;border-radius:6px;cursor:pointer;font:inherit}
    @media print{button{display:none}body{margin:0 auto}h3{break-after:avoid}svg,table{break-inside:avoid}}
  </style></head><body>
  <button onclick="window.print()">Imprimir o guardar como PDF</button>
  <div class="k">Dirección de Tránsito y Movilidad · ${esc(cfg?.municipio || '')}${cfg?.estado ? ', ' + esc(cfg.estado) : ''}</div>
  <h1>Informe trimestral al H. Cabildo</h1>
  <div class="sub">${esc(nombreTri)} · comparado con el mismo periodo de ${y - 1} · generado el ${new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
  <div class="grid">
    <div><small>Recaudación</small><b>${fmt(recaud)}</b><small>${esc(varia(recaud, recaud0))}</small></div>
    <div><small>Infracciones levantadas</small><b>${infValidas.length}</b><small>${esc(varia(infValidas.length, infValidas0.length))}</small></div>
    <div><small>Cobradas del trimestre</small><b>${infValidas.length ? Math.round(pagadas / infValidas.length * 100) : 0}%</b><small>${pagadas} de ${infValidas.length} boletas</small></div>
    <div><small>Accidentes viales</small><b>${acc.length}</b><small>${esc(varia(acc.length, acc0.length))}</small></div>
    <div><small>Lesionados / fallecidos</small><b>${lesion} / ${fall}</b><small>${y - 1}: ${lesion0} / ${fall0}</small></div>
    <div><small>Permisos expedidos</small><b>${per.length}</b><small>${esc(varia(per.length, per0.length))}</small></div>
  </div>
  <div class="ley"><span><i style="background:#1A7A82"></i>${y}</span><span><i style="background:#9CA3AF"></i>${y - 1}</span></div>
  ${_barrasSVG('Recaudación por mes', meses, porMes(pag, 'created_at', 'monto_final'), porMes(pag0, 'created_at', 'monto_final'), fmtCorto)}
  ${_barrasSVG('Infracciones por mes', meses, porMes(infValidas, 'fecha'), porMes(infValidas0, 'fecha'), v => String(Math.round(v)))}
  ${_barrasSVG('Accidentes por mes', meses, porMes(acc, 'fecha'), porMes(acc0, 'fecha'), v => String(Math.round(v)))}
  ${tabla('Motivos de infracción más frecuentes', ['Motivo', 'Boletas', '% del total'], motivos.map(([t, n]) => [esc(t), n, Math.round(n / infValidas.length * 100) + '%']))}
  ${tabla('Accidentes por tipo', ['Tipo', 'Accidentes'], tiposAcc.map(([t, n]) => [esc(t), n]))}
  ${tabla('Calles con más hechos (infracciones y accidentes)', ['Calle o lugar', 'Hechos'], calles.map(([c, n]) => [esc(c), n]))}
  <div class="firma"><div>${esc(cfg?.director || 'Director de Tránsito')}<br>Director de Tránsito y Movilidad</div></div>
  <div class="pie">Cifras del Sistema de Tránsito y Movilidad Municipal al ${new Date().toLocaleDateString('es-MX')}. Recaudación = pagos registrados en Caja dentro del trimestre.</div>
  </body></html>`;
  if (!win) { alert('Permite las ventanas emergentes para ver el reporte'); return; }
  win.document.write(html); win.document.close();
}

async function enviarReporteMensual() {
  const mes = ($('rep-mes')||{}).value, st = $('rep-estado'), btn = $('rep-enviar');
  if (btn) btn.disabled = true;
  if (st) { st.textContent = 'Enviando…'; st.style.color = 'var(--muted)'; }
  try {
    const { data, error } = await _sb.functions.invoke('reporte-mensual', { body: { mes } });
    let msg = error?.message;
    if (error?.context?.json) { try { msg = (await error.context.json()).error || msg; } catch (_) {} }
    if (error) throw new Error(msg);
    if (st) { st.textContent = `Enviado a ${data.enviado_a.join(', ')}`; st.style.color = 'var(--green)'; }
  } catch (err) {
    if (st) { st.textContent = 'No se pudo enviar: ' + err.message; st.style.color = 'var(--red)'; }
  } finally { if (btn) btn.disabled = false; }
}

async function generateReport(tipo) {
  const { data: cfg } = await _sb.from('configuracion').select('*').eq('id',1).single();
  const mun = esc(cfg ? cfg.municipio : 'Municipio');
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
    ? rows.map(r=>`<tr><td>${esc(r.folio||'—')}</td><td>${fmtDateShort(r.fecha)}</td><td>${esc(r.placa)}</td><td>${esc(r.infractor)}</td><td>${esc(r.tipo)}</td><td>${fmt(r.monto)}</td><td>${r.estado}</td></tr>`).join('')
    : rows.map(r=>`<tr><td>${esc(r.num||'—')}</td><td>${esc(r.titular)}</td><td>${esc(r.tipo)}</td><td>${esc(r.placa||'—')}</td><td>${esc(r.ruta||'—')}</td><td>${fmtDateShort(r.vencimiento)}</td><td>${r.estado}</td></tr>`).join('');

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
// ── Recurso de revocación (art. 383 del Reglamento; arts. 43, 260-262 CPA) ──
const hoyISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function sumarDiasHabiles(fechaISO, n) {   // igual que sumar_dias_habiles() en la base: sin sábados ni domingos
  const d = new Date(fechaISO + 'T12:00:00'); let k = 0;
  while (k < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) k++; }
  return d.toISOString().slice(0, 10);
}
const fechaLarga = iso => iso ? new Date(iso.slice(0, 10) + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

async function impugnarInfraccion(id) {
  const { data: r } = await _sb.from('infracciones').select('id,folio,fecha,placa,infractor,tipo,fundamento,infractor_domicilio').eq('id', id).single();
  if (!r) return;
  $('imp-inf-id').value = id;
  $('imp-inf-id').dataset.fecha = r.fecha;
  $('imp-info').innerHTML = `<strong>${esc(r.folio||'—')}</strong> · ${esc(r.tipo)} · Placa ${esc(r.placa)}<br>${esc(r.fundamento||'')}`;
  $('imp-fecha').value = hoyISO();
  $('imp-promovente').value = r.infractor || '';
  $('imp-domicilio').value = r.infractor_domicilio || '';
  $('imp-motivo').value = '';
  if ($('imp-pruebas')) $('imp-pruebas').value = '';
  calcularPlazoRecurso();
  closeModal('modal-detail');
  openModal('modal-impugnacion');
}
function calcularPlazoRecurso() {
  const f = $('imp-inf-id')?.dataset.fecha; if (!f) return;
  const vence = sumarDiasHabiles(new Date(f).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' }), 15);
  const pres = $('imp-fecha').value;
  const fuera = pres && pres > vence;
  $('imp-plazo').innerHTML = `Plazo para interponerlo: hasta el <strong>${fechaLarga(vence)}</strong> (15 días hábiles, arts. 43 y 261 del Código de Procedimientos Administrativos).` +
    (fuera ? ' <span style="color:var(--red);font-weight:700">Se presenta fuera de plazo (extemporáneo).</span>' : '');
}
async function submitImpugnacion() {
  const id = parseInt($('imp-inf-id').value);
  const hechos = ($('imp-motivo').value || '').trim(), promovente = ($('imp-promovente').value || '').trim();
  if (!promovente || !hechos) { alert('Indica quién promueve y los hechos o agravios.'); return; }
  const btn = $('imp-submit-btn'); btn.disabled = true; btn.textContent = 'Guardando…';
  let pruebas = [];
  try { pruebas = await subirFotos($('imp-pruebas'), 'impugnaciones'); }
  catch (err) { btn.disabled = false; btn.textContent = 'Registrar recurso'; alert('No se pudieron subir las pruebas: ' + err.message); return; }
  const { data, error } = await _sb.rpc('presentar_impugnacion', {
    p_infraccion_id: id, p_presentada_el: $('imp-fecha').value, p_promovente: promovente,
    p_domicilio: ($('imp-domicilio').value || '').trim(), p_hechos: hechos, p_pruebas: pruebas
  });
  btn.disabled = false; btn.textContent = 'Registrar recurso';
  if (error) { alert('Error: ' + error.message); return; }
  closeModal('modal-impugnacion');
  logActivity('infraccion', `Recurso de revocación ${data.folio} registrado`);
  renderInfracciones();
  showToast(`Recurso ${data.folio} registrado${data.extemporanea ? ' (extemporáneo)' : ''}`);
  printAcuseRecurso(data.id);
}

async function mostrarRecurso(r) {
  const box = $('detail-recurso'); if (!box) return;
  const { data: v } = await _sb.from('impugnaciones').select('*').eq('infraccion_id', r.id).maybeSingle();
  if (!v) { box.innerHTML = ''; return; }
  const color = { en_tramite: 'badge-yellow', procedente: 'badge-green', improcedente: 'badge-red', desechada: 'badge-muted' }[v.estado];
  const nombre = { en_tramite: 'En trámite', procedente: 'Procedente', improcedente: 'Improcedente', desechada: 'Desechado' }[v.estado];
  box.innerHTML = `<div style="margin-top:.6rem"><div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.2rem">Recurso de revocación</div>
    <div style="font-size:.82rem"><strong>${esc(v.folio)}</strong> <span class="${color}">${nombre}</span> · presentado el ${fechaLarga(v.presentada_el)} por ${esc(v.promovente)}
    · plazo hasta ${fechaLarga(v.plazo_vence)}${v.extemporanea ? ' <span class="badge-red">Extemporáneo</span>' : ''}</div>
    <div style="font-size:.78rem;color:var(--text);margin-top:.2rem">${esc(v.hechos)}</div>
    ${(v.pruebas||[]).length ? `<div style="display:flex;gap:.4rem;margin-top:.35rem;flex-wrap:wrap">${v.pruebas.map(f => `<img data-foto="${esc(f)}" alt="Prueba" style="width:70px;height:70px;object-fit:cover;border-radius:6px;border:1px solid var(--border)"/>`).join('')}</div>` : ''}
    ${v.resolucion ? `<div style="font-size:.78rem;margin-top:.3rem"><strong>Resolución</strong> (${esc(v.resuelto_por)}, ${fechaLarga(v.resuelto_el)}): ${esc(v.resolucion.slice(0, 240))}${v.resolucion.length > 240 ? '…' : ''}</div>` : ''}
    <div style="display:flex;gap:.4rem;margin-top:.4rem;flex-wrap:wrap">
      ${v.estado === 'en_tramite' ? `<button class="btn btn-sm btn-primary" onclick="abrirResolucion(${v.id})">Resolver recurso</button>` : `<button class="btn btn-ghost btn-sm" onclick="printResolucion(${v.id})">Imprimir resolución</button>`}
      <button class="btn btn-ghost btn-sm" onclick="printAcuseRecurso(${v.id})">Acuse de recibo</button>
    </div></div>`;
  hidratarFotos(box);
}

let _recursoActual = null;
async function abrirResolucion(impId) {
  const { data: v } = await _sb.from('impugnaciones').select('*, infracciones(folio,fecha,placa,infractor,tipo,fundamento,oficial)').eq('id', impId).single();
  if (!v) return;
  _recursoActual = v;
  $('res-imp-id').value = impId;
  $('res-info').innerHTML = `<strong>${esc(v.folio)}</strong> · Infracción ${esc(v.infracciones?.folio||'')} · ${esc(v.promovente)}<br>Presentado el ${fechaLarga(v.presentada_el)}; plazo hasta ${fechaLarga(v.plazo_vence)}${v.extemporanea ? ' — <strong style="color:var(--red)">extemporáneo</strong>' : ''}`;
  $('res-resultado').value = v.extemporanea ? 'desechada' : 'improcedente';
  plantillaResolucion();
  closeModal('modal-detail');
  openModal('modal-resolucion');
}
function plantillaResolucion() {
  const v = _recursoActual; if (!v) return;
  const inf = v.infracciones || {};
  const resultado = $('res-resultado').value;
  const sentido = {
    improcedente: `PRIMERO. Es IMPROCEDENTE el recurso de revocación ${v.folio} y se CONFIRMA la boleta de infracción ${inf.folio}, al no desvirtuarse los hechos que la motivan.`,
    procedente:   `PRIMERO. Es PROCEDENTE el recurso de revocación ${v.folio}; se REVOCA y deja sin efectos la boleta de infracción ${inf.folio}.`,
    desechada:    `PRIMERO. Se DESECHA el recurso de revocación ${v.folio} por haberse presentado fuera del plazo de quince días hábiles que establece el artículo 261 del Código de Procedimientos Administrativos para el Estado de Veracruz de Ignacio de la Llave.`
  }[resultado];
  $('res-texto').value =
`VISTO el recurso de revocación ${v.folio}, interpuesto por ${v.promovente} el ${fechaLarga(v.presentada_el)}, en contra de la boleta de infracción ${inf.folio} (${inf.tipo}, placa ${inf.placa}), con fundamento en el artículo 383 del Reglamento de la Ley Número 561 de Tránsito y Seguridad Vial para el Estado de Veracruz de Ignacio de la Llave y en los artículos 260 a 262 del Código de Procedimientos Administrativos para el Estado de Veracruz de Ignacio de la Llave, se resuelve:

CONSIDERANDO
I. Que el recurso se presentó ${v.extemporanea ? 'fuera del plazo' : 'dentro del plazo'} de quince días hábiles (vencía el ${fechaLarga(v.plazo_vence)}).
II. Que el promovente expone: ${v.hechos}
III. Que, analizadas las constancias y pruebas, [exponer aquí la valoración de los argumentos y pruebas, y el fundamento de la infracción: ${inf.fundamento || ''}].

RESUELVE
${sentido}
SEGUNDO. Notifíquese personalmente al promovente en el domicilio señalado${v.domicilio ? ' (' + v.domicilio + ')' : ''}.`;
}
async function submitResolucion() {
  const id = parseInt($('res-imp-id').value);
  const texto = ($('res-texto').value || '').trim();
  if (/\[exponer aquí/.test(texto) && !confirm('La resolución todavía tiene el texto de ejemplo entre corchetes. ¿Emitirla así?')) return;
  const btn = $('res-submit-btn'); btn.disabled = true;
  const { data, error } = await _sb.rpc('resolver_impugnacion', { p_id: id, p_resultado: $('res-resultado').value, p_resolucion: texto });
  btn.disabled = false;
  if (error) { alert('Error: ' + error.message); return; }
  closeModal('modal-resolucion');
  logActivity('infraccion', `Recurso ${data.folio} resuelto: ${data.estado}`);
  renderInfracciones(); renderDashboard();
  showToast(`Recurso ${data.folio}: ${data.estado}`);
  printResolucion(data.id);
}
// Resolver: con expediente abre la resolución escrita; las impugnaciones
// registradas antes del expediente se resuelven como antes (procede / no procede)
async function resolverImpugnacion(infId) {
  const { data: v } = await _sb.from('impugnaciones').select('id').eq('infraccion_id', infId).maybeSingle();
  if (v) return abrirResolucion(v.id);
  const { data: r } = await _sb.from('infracciones').select('id,folio,estado,impugnacion_motivo').eq('id', infId).single();
  if (!r || r.estado !== 'impugnada') return impugnarInfraccion(infId);
  const procede = confirm(`Impugnación de ${r.folio} registrada antes del expediente:\n"${r.impugnacion_motivo || ''}"\n\n¿PROCEDE? (Aceptar = se cancela la infracción · Cancelar = elegir "no procede")`);
  if (!procede && !confirm(`¿Confirmas que la impugnación de ${r.folio} NO procede y la infracción vuelve a quedar por cobrar?`)) return;
  const cambios = procede ? { estado: 'cancelada', cancelacion_motivo: 'Impugnación procedente' } : { estado: 'pendiente' };
  const { error } = await _sb.from('infracciones').update(cambios).eq('id', infId);
  if (error) { alert('Error: ' + error.message); return; }
  closeModal('modal-detail');
  logActivity('infraccion', `Impugnación de ${r.folio} resuelta: ${procede ? 'procede' : 'no procede'}`);
  renderInfracciones(); renderDashboard();
  showToast(procede ? 'Infracción cancelada (impugnación procedente)' : 'Infracción reactivada como pendiente');
}

async function docRecurso(impId, cuerpo) {
  const [{ data: v }, { data: cfg }] = await Promise.all([
    _sb.from('impugnaciones').select('*, infracciones(folio,fecha,placa,infractor,tipo,fundamento)').eq('id', impId).single(),
    _sb.from('configuracion').select('*').eq('id', 1).single()
  ]);
  if (!v) return;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>${esc(v.folio)}</title>
  <style>body{font-family:Arial,sans-serif;font-size:11pt;color:#111;margin:22mm 20mm}h1{font-size:14pt;text-align:center;margin:0 0 4mm}h2{font-size:10pt;text-align:center;margin:0 0 8mm;color:#444;font-weight:normal}
  p{line-height:1.5;text-align:justify;white-space:pre-wrap}.f{margin-top:22mm;text-align:center}.f div{border-top:1px solid #111;width:70mm;margin:0 auto;padding-top:2mm;font-size:9pt}</style></head><body>
  <h1>${esc((cfg?.municipio||'Municipio').toUpperCase())} · DIRECCIÓN DE TRÁNSITO Y SEGURIDAD VIAL</h1>
  ${cuerpo(v, cfg)}</body></html>`;
  const w = window.open('', '_blank', 'width=800,height=900'); w.document.write(html); w.document.close(); w.onload = () => { w.focus(); w.print(); };
}
function printAcuseRecurso(impId) {
  return docRecurso(impId, v => `<h2>ACUSE DE RECIBO DEL RECURSO DE REVOCACIÓN ${esc(v.folio)}</h2>
  <p>Se recibió el recurso de revocación presentado por <strong>${esc(v.promovente)}</strong> el ${fechaLarga(v.presentada_el)}, en contra de la boleta de infracción <strong>${esc(v.infracciones?.folio||'')}</strong> (${esc(v.infracciones?.tipo||'')}, placa ${esc(v.infracciones?.placa||'')}).</p>
  <p>Plazo legal para interponerlo: hasta el ${fechaLarga(v.plazo_vence)} (quince días hábiles, artículos 43 y 261 del Código de Procedimientos Administrativos para el Estado de Veracruz de Ignacio de la Llave)${v.extemporanea ? '. El recurso se presentó fuera de ese plazo.' : '.'}</p>
  <p>Pruebas ofrecidas: ${(v.pruebas||[]).length} archivo(s). Domicilio para notificaciones: ${esc(v.domicilio||'no señalado')}.</p>
  <div class="f"><div>${esc(v.registrado_por)}<br>Recibió</div></div>`);
}
function printResolucion(impId) {
  return docRecurso(impId, v => `<h2>RESOLUCIÓN DEL RECURSO DE REVOCACIÓN ${esc(v.folio)}</h2>
  <p>${esc(v.resolucion)}</p>
  <p style="font-size:9pt;color:#555">Emitida el ${fechaLarga(v.resuelto_el)}.</p>
  <div class="f"><div>${esc(v.resuelto_por)}<br>Superior jerárquico</div></div>`);
}

// ── Devolución de documentos retenidos (arts. 343-344) ────
async function mostrarDevolucion(r) {
  const el = $('detail-devolucion'); if (!el) return;
  const { data: d } = await _sb.from('devoluciones').select('*').eq('infraccion_id', r.id).maybeSingle();
  el.innerHTML = d
    ? `<span class="badge-green">Devuelto</span> el ${fechaLarga(d.created_at)} a ${esc(d.entregado_a)} (entregó ${esc(d.devuelto_por)})`
    : `<span class="badge-yellow">En resguardo</span> en ${esc(_cachedConfig?.resguardo_lugar || 'la Delegación')} <button class="btn btn-ghost btn-sm" onclick="abrirDevolucion(${r.id})">Devolver</button>`;
  aplicarPermisosUI(el);
}
async function abrirDevolucion(infId) {
  const { data: r } = await _sb.from('infracciones').select('id,folio,infractor,estado,documento_retenido,documento_numero').eq('id', infId).single();
  if (!r) return;
  $('dev-inf-id').value = infId;
  const pagada = r.estado === 'pagada' || r.estado === 'cancelada';
  $('dev-info').innerHTML = `<strong>${esc(r.folio)}</strong> · ${esc(DOC_RETENIDO[r.documento_retenido] || '')}${r.documento_numero ? ' ' + esc(r.documento_numero) : ''} · multa ${estadoBadge(r.estado)}` +
    (pagada ? '' : '<br><span style="color:var(--red)">La multa no está pagada: solo un mando puede devolverlo, indicando el motivo.</span>');
  $('dev-entregado').value = r.infractor || '';
  $('dev-identificacion').value = ''; $('dev-notas').value = '';
  $('dev-notas-req').textContent = pagada ? '' : '(obligatorio: motivo de la devolución anticipada)';
  closeModal('modal-detail');
  openModal('modal-devolucion');
  iniciarFirma('firma-devolucion');
}
async function submitDevolucion() {
  const { error } = await _sb.rpc('devolver_documento', {
    p_infraccion_id: parseInt($('dev-inf-id').value), p_entregado_a: $('dev-entregado').value.trim(),
    p_identificacion: $('dev-identificacion').value.trim(), p_firma: firmaDataURL('firma-devolucion'), p_notas: $('dev-notas').value.trim()
  });
  if (error) { alert('Error: ' + error.message); return; }
  closeModal('modal-devolucion');
  showToast('Documento devuelto');
  if ($('caja-section-resguardo')?.style.display === 'block') renderResguardo();
}
async function renderResguardo() {
  const tb = $('resguardo-table'); if (!tb) return;
  tb.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  const { data, error } = await _sb.from('documentos_en_resguardo').select('*').order('fecha', { ascending: true });
  if (error) { tb.innerHTML = `<tr><td colspan="7" style="color:var(--red)">${esc(error.message)}</td></tr>`; return; }
  tb.innerHTML = (data || []).length ? data.map(r => `<tr>
    <td class="mono" style="font-weight:700">${esc(r.folio||'—')}</td><td>${fmtDateShort(r.fecha)}</td><td class="mono">${esc(r.placa)}</td><td>${esc(r.infractor)}</td>
    <td>${esc(DOC_RETENIDO[r.documento_retenido]||'')}${r.documento_numero ? ' · ' + esc(r.documento_numero) : ''}</td><td>${estadoBadge(r.estado)}</td>
    <td style="text-align:right"><button class="btn btn-sm btn-primary" onclick="abrirDevolucion(${r.id})">Devolver</button></td></tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.2rem">No hay documentos en resguardo</td></tr>';
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
    .select('monto_original,descuento_pct,monto_final,created_at,cajero')
    .gte('created_at', desde).lte('created_at', hasta);

  const totalRecaudado = (pagosHoy||[]).reduce((s,p) => s + Number(p.monto_final||0), 0);
  const totalInfracciones = (pagosHoy||[]).length;
  const totalDescuentos = (pagosHoy||[]).reduce((s,p) => s + (Number(p.monto_original||0) - Number(p.monto_final||0)), 0);

  const cfg = _cachedConfig || {};
  const fechaStr = today.toLocaleDateString('es-MX', {weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  const horaStr  = today.toLocaleTimeString('es-MX', {hour:'2-digit',minute:'2-digit'});

  const filas = (pagosHoy||[]).map((p,i) => {
    const hora = new Date(p.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
    return `<tr>
      <td>${i+1}</td>
      <td>${hora}</td>
      <td>${fmt(p.monto_original)}</td>
      <td>${p.descuento_pct>0?`Sí (${p.descuento_pct}%)`:'No'}</td>
      <td style="font-weight:700">${fmt(p.monto_final)}</td>
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
    <h2>${esc(cfg.municipio||'Municipio')} — Dirección de Tránsito y Movilidad</h2>
  </div>
  <div class="meta">
    Fecha: <strong>${fechaStr}</strong> &nbsp;|&nbsp; Hora de corte: <strong>${horaStr}</strong><br>
    Elaboró: <strong>${esc(_session?.name||'—')}</strong>
  </div>
  <div class="totals">
    <div class="total-row"><span>Pagos registrados:</span><span>${totalInfracciones}</span></div>
    <div class="total-row"><span>Descuentos aplicados:</span><span>${fmt(totalDescuentos)}</span></div>
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
    const { data } = await _sb.from('pagos').select('created_at,folio_inf,monto_original,descuento_pct,monto_final,metodo,cajero').order('created_at',{ascending:false});
    rows = (data||[]).map(r => ({
      'Fecha y hora': r.created_at ? new Date(r.created_at).toLocaleString('es-MX') : '',
      'Folio infracción': r.folio_inf||'',
      'Monto original (MXN)': Number(r.monto_original)||0,
      'Descuento (MXN)': (Number(r.monto_original)||0) - (Number(r.monto_final)||0),
      'Total pagado (MXN)': Number(r.monto_final)||0,
      'Método de pago': r.metodo||'Efectivo',
      'Cajero': r.cajero||''
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
    if (data) { _oficiales = data.map(u => u.nombre); _guardarLocal('tm_oficiales', _oficiales); }
    else _oficiales = _leerLocal('tm_oficiales') || (_session?.name ? [_session.name] : []);
  }
  selectIds.forEach(id => {
    const el = $(id);
    if (!el) return;
    const prev = el.dataset.preload || '';
    el.innerHTML = '<option value="">— Seleccionar oficial —</option>' +
      _oficiales.map(n => `<option value="${esc(n)}"${n===prev?' selected':''}>${esc(n)}</option>`).join('');
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
    (data.descPct && data.descHasta
      ? `⏰ Si paga a más tardar el ${new Date(data.descHasta).toLocaleDateString('es-MX',{weekday:'long',day:'2-digit',month:'long'})} paga $${Math.round(Number(data.monto)*(1-data.descPct/100)).toLocaleString('es-MX')} MXN (${data.descPct}% de descuento).\n\n`
      : '') +
    `Consulte y pague en: ${window.location.origin}/consulta?q=${encodeURIComponent(data.folio||data.placa||'')}\n` +
    `Dirección de Tránsito y Movilidad Municipal.`;
  window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  const fmt10 = tel.replace(/(\d{3})(\d{3})(\d{4})/,'$1-$2-$3');
  showToast(`WhatsApp listo para enviar a ${fmt10||tel}`);
}

function _waFromBtn(btn) {
  const d = btn.dataset;
  notificarWhatsApp({ telefono:d.tel, infractor:d.nombre, folio:d.folio,
    placa:d.placa, tipo:d.tipo, monto:d.monto, ubicacion:d.ubicacion, fecha:d.fecha,
    descPct:Number(d.descPct)||0, descHasta:d.descHasta||'' });
}

// ══════════════════════════════════════════════════════════
// BITÁCORA (tabla auditoria, la llenan triggers en el servidor)
// ══════════════════════════════════════════════════════════
const BIT_MODULOS = { infracciones:'Infracciones', pagos:'Pagos', permisos:'Permisos', vehiculos:'Vehículos', grua:'Grúa', accidentes:'Accidentes', usuarios:'Usuarios', configuracion:'Configuración', turnos:'Turnos' };
const BIT_ACCIONES = { alta:['Alta','badge-green'], cambio:['Cambio','badge-blue'], baja:['Baja','badge-red'] };
const BIT_CAMPOS = { estado:'Estado', monto:'Monto', placa:'Placa', infractor:'Infractor', tipo:'Tipo', ubicacion:'Ubicación', obs:'Observaciones', oficial:'Oficial', fecha:'Fecha', licencia:'Licencia', vehiculo:'Vehículo', color_vehiculo:'Color', telefono:'Teléfono', impugnacion_motivo:'Motivo de impugnación', monto_final:'Total cobrado', monto_original:'Monto original', descuento_pct:'Descuento %', metodo:'Método', cajero:'Cajero', rol:'Rol', activo:'Activo', nombre:'Nombre', usuario:'Usuario', vencimiento:'Vencimiento', titular:'Titular', propietario:'Propietario', fecha_liberacion:'Liberación', montos:'Tarifas', descripcion:'Descripción', valor_uma:'Valor UMA', correo_reporte:'Correo del reporte', infractor_domicilio:'Domicilio del infractor', infractor_correo:'Correo del infractor', infractor_ausente:'Infractor ausente', licencia_tipo:'Tipo de licencia', circunstancias:'Circunstancias (art. 331)', numero_placa:'Placa del policía vial', adscripcion:'Adscripción', leyenda_recurso:'Medio de defensa', documento_retenido:'Documento retenido', documento_numero:'Número del documento', firma_negada:'Se negó a firmar', resguardo_lugar:'Lugar de resguardo', avisos_correo:'Avisos por correo', avisos_whatsapp:'Avisos por WhatsApp', pago_en_linea:'Pago en línea' };
let _bitDesde = 0;

function _bitValor(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateShort(v);
  return String(v);
}

function _bitDetalle(e) {
  const c = e.cambios || {};
  if (e.accion === 'cambio') {
    return Object.entries(c).map(([k, v]) =>
      `<div><span style="color:var(--muted)">${esc(BIT_CAMPOS[k] || k)}:</span> ${esc(_bitValor(v.antes))} → <strong>${esc(_bitValor(v.despues))}</strong></div>`).join('');
  }
  const clave = ['tipo','placa','infractor','monto','monto_final','estado','titular','nombre','rol'].filter(k => c[k] !== undefined && c[k] !== '');
  return clave.slice(0, 4).map(k => `<span style="color:var(--muted)">${esc(BIT_CAMPOS[k] || k)}:</span> ${esc(_bitValor(c[k]))}`).join(' · ');
}

async function renderBitacora(mas) {
  const tbody = $('bitacora-table'); if (!tbody) return;
  if (!mas && _rol === 'admin') renderErroresApp();
  if (!mas) { _bitDesde = 0; tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Cargando…</td></tr>'; }
  const PAG = 100;
  let q = _sb.from('auditoria').select('*').order('ts', { ascending: false }).range(_bitDesde, _bitDesde + PAG - 1);
  const tabla = $('bit-tabla')?.value, accion = $('bit-accion')?.value;
  const desde = $('bit-desde')?.value, hasta = $('bit-hasta')?.value;
  const buscar = ($('bit-buscar')?.value || '').trim().replace(/[,()"'\\%*]/g, ' ').trim();
  if (tabla)  q = q.eq('tabla', tabla);
  if (accion) q = q.eq('accion', accion);
  if (desde)  q = q.gte('ts', desde + 'T00:00:00');
  if (hasta)  q = q.lte('ts', hasta + 'T23:59:59');
  if (buscar) q = q.or(`usuario_nombre.ilike.%${buscar}%,resumen.ilike.%${buscar}%`);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="6" style="color:red">${esc(error.message)}</td></tr>`; return; }
  const filas = (data || []).map(e => {
    const [acc, cls] = BIT_ACCIONES[e.accion] || [e.accion, 'badge-muted'];
    return `<tr>
      <td style="white-space:nowrap">${esc(new Date(e.ts).toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }))}</td>
      <td style="font-weight:600">${esc(e.usuario_nombre || '—')}</td>
      <td><span class="${cls}">${esc(acc)}</span></td>
      <td>${esc(BIT_MODULOS[e.tabla] || e.tabla)}</td>
      <td class="mono">${esc(e.resumen || e.registro_id || '—')}</td>
      <td style="font-size:.78rem;line-height:1.5">${_bitDetalle(e)}</td>
    </tr>`;
  }).join('');
  if (!mas) tbody.innerHTML = filas || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Sin movimientos con estos filtros</td></tr>';
  else tbody.insertAdjacentHTML('beforeend', filas);
  _bitDesde += (data || []).length;
  const btnMas = $('bit-mas'); if (btnMas) btnMas.style.display = (data || []).length === PAG ? '' : 'none';
}

// Errores que reportó la app en los navegadores del personal (solo el Director)
async function renderErroresApp() {
  const card = $('errores-card'), tbody = $('errores-table'); if (!card || !tbody) return;
  card.style.display = '';
  const { data, error } = await _sb.from('errores_app').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { tbody.innerHTML = `<tr><td colspan="4" style="color:red">${esc(error.message)}</td></tr>`; return; }
  const n = $('errores-count'); if (n) n.textContent = (data || []).length ? `${data.length} recientes` : '';
  tbody.innerHTML = (data || []).length ? data.map(e => `<tr>
      <td style="white-space:nowrap">${esc(new Date(e.created_at).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }))}</td>
      <td style="font-weight:600">${esc(e.usuario || '—')}</td>
      <td style="font-size:.78rem">${esc(/^view-[a-z]+$/.test(e.pagina || '') ? (document.querySelector(`[data-view="${e.pagina.slice(5)}"]`)?.textContent.replace(/\d+/g, '').trim() || e.pagina.slice(5)) : (e.pagina || '—'))}</td>
      <td style="font-size:.78rem;line-height:1.5"><div style="font-weight:600">${esc(e.mensaje)}</div>
        ${e.detalle ? `<details><summary style="cursor:pointer;color:var(--muted)">Detalle</summary><pre style="white-space:pre-wrap;font-size:.7rem;margin:.3rem 0 0">${esc(e.detalle)}</pre><div style="color:var(--muted);font-size:.7rem">${esc(e.navegador)}</div></details>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Sin errores registrados. Todo en orden.</td></tr>';
}

// ── Registro de errores (mejoras.sql: errores_app) ────────
// Se anotan hasta 5 errores distintos por sesión para no llenar la tabla.
const _erroresVistos = new Set();
function reportarError(mensaje, detalle) {
  try {
    if (typeof _sb === 'undefined' || !_sb || !_rol) return;
    mensaje = String(mensaje || 'Error desconocido').slice(0, 1000);
    if (_erroresVistos.has(mensaje) || _erroresVistos.size >= 5) return;
    if (/ResizeObserver loop|Script error\.?$/.test(mensaje)) return;
    _erroresVistos.add(mensaje);
    _sb.from('errores_app').insert({
      pagina: (document.querySelector('.view.active')?.id || location.pathname).slice(0, 300),
      mensaje, detalle: String(detalle || '').slice(0, 4000), navegador: navigator.userAgent.slice(0, 300),
    }).then(() => {}, () => {});
  } catch (_) { /* nunca romper la app por reportar */ }
}
window.addEventListener('error', e => reportarError(e.message, `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}\n${e.error?.stack || ''}`));
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  reportarError(r?.message || String(r), r?.stack || '');
});

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

  // ── Menú según el rol (ver ROLES) ────────────────────────
  document.querySelectorAll('.nav-item').forEach(btn => {
    const view = btn.dataset.view || (btn.getAttribute('onclick')||'').match(/navigate\('(\w+)'/)?.[1];
    if (view && !vistaPermitida(view)) btn.style.display = 'none';
  });
  document.querySelectorAll('.sidebar-section').forEach(sec => {
    const visible = [...sec.querySelectorAll('.nav-item')].some(b => b.style.display !== 'none');
    if (!visible) sec.style.display = 'none';
  });
  aplicarPermisosUI();
  if (_permisosRol.soloMias && $('inf-alcance')) $('inf-alcance').style.display = '';

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

// ── Cambiar mi contraseña ─────────────────────────────────
function openCambiarContrasena() {
  ['pwd-actual','pwd-nueva','pwd-confirma'].forEach(id => { if ($(id)) $(id).value = ''; });
  openModal('modal-contrasena');
  setTimeout(() => $('pwd-actual')?.focus(), 50);
}

async function cambiarContrasena() {
  const actual = $('pwd-actual').value, nueva = $('pwd-nueva').value, confirma = $('pwd-confirma').value;
  if (!actual || !nueva) { alert('Escribe tu contraseña actual y la nueva'); return; }
  if (nueva.length < 6) { alert('La nueva contraseña debe tener al menos 6 caracteres'); return; }
  if (nueva !== confirma) { alert('La confirmación no coincide con la nueva contraseña'); return; }
  if (nueva === actual) { alert('La nueva contraseña debe ser distinta de la actual'); return; }
  const btn = $('pwd-submit'); if (btn) btn.disabled = true;
  try {
    // Confirmar la contraseña actual antes de cambiarla
    const { data: { session } } = await _sb.auth.getSession();
    const email = session?.user?.email;
    const { error: e1 } = await _sb.auth.signInWithPassword({ email, password: actual });
    if (e1) { alert('La contraseña actual no es correcta'); return; }
    const { error: e2 } = await _sb.auth.updateUser({ password: nueva });
    if (e2) { alert('No se pudo cambiar: ' + e2.message); return; }
    await logActivity('usuario', `${_session?.name || 'Usuario'} cambió su contraseña`);
    closeModal('modal-contrasena');
    showToast('Contraseña actualizada');
  } finally { if (btn) btn.disabled = false; }
}

async function logout() {
  try { await _sb.auth.signOut(); } catch(_) {}
  localStorage.removeItem('tm_session');
  window.location.replace('/login');
}

// ── Cierre de sesión por inactividad ──────────────────────
// En los equipos compartidos (ventanilla, oficina) la sesión se cierra sola
// tras 15 minutos sin usar la app; un minuto antes avisa. Los oficiales en
// campo quedan fuera, y sin internet no se cierra (para no perder la cola).
const INACTIVIDAD_MIN = 15;
let _ultimaActividad = Date.now(), _avisoInactividad = null;
function _marcarActividad() {
  _ultimaActividad = Date.now();
  try { localStorage.setItem('tm_actividad', String(_ultimaActividad)); } catch (_) {}
  if (_avisoInactividad) { _avisoInactividad.remove(); _avisoInactividad = null; }
}
function iniciarControlInactividad() {
  if (!_rol || _rol === 'oficial') return;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => {
    if (Date.now() - _ultimaActividad > 5000 || _avisoInactividad) _marcarActividad();
  }, { passive: true, capture: true }));
  window.addEventListener('storage', e => { if (e.key === 'tm_actividad') { _ultimaActividad = Number(e.newValue) || Date.now(); if (_avisoInactividad) { _avisoInactividad.remove(); _avisoInactividad = null; } } });
  _marcarActividad();
  setInterval(() => {
    if (!navigator.onLine) { _ultimaActividad = Date.now(); return; }
    const quieto = Date.now() - _ultimaActividad, limite = INACTIVIDAD_MIN * 60000;
    if (quieto >= limite) { logActivity('sesion', `Sesión cerrada por inactividad — ${_session?.name || ''}`).catch(() => {}); logout(); return; }
    if (quieto >= limite - 60000) {
      const seg = Math.max(0, Math.ceil((limite - quieto) / 1000));
      if (!_avisoInactividad) {
        _avisoInactividad = document.createElement('div');
        _avisoInactividad.className = 'aviso-inactividad';
        _avisoInactividad.setAttribute('role', 'alertdialog');
        _avisoInactividad.innerHTML = `<div><strong>¿Sigues ahí?</strong><p>Por seguridad, la sesión se cerrará en <span id="inact-seg"></span> segundos.</p>
          <button type="button" class="btn btn-primary" id="inact-seguir">Seguir trabajando</button></div>`;
        document.body.appendChild(_avisoInactividad);
        $('inact-seguir').onclick = _marcarActividad;
      }
      const el = $('inact-seg'); if (el) el.textContent = seg;
    }
  }, 1000);
}

// Confirma que la sesión de Supabase sigue siendo válida y el usuario activo
async function verificarSesion() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { await logout(); return false; }
  const { data: u, error } = await _sb.from('usuarios').select('rol,activo').eq('auth_id', session.user.id).maybeSingle();
  if (error) { console.error('sesión:', error); return true; }   // falla de red: la BD sigue aplicando permisos
  if (!u || !u.activo) { await logout(); return false; }
  if (u.rol !== _rol) {
    // El rol cambió desde el último login: refrescar perfil y recargar la UI
    localStorage.setItem('tm_session', JSON.stringify({ ..._session, rol: u.rol }));
    window.location.reload();
    return false;
  }
  _sb.auth.onAuthStateChange(evt => {
    if (evt === 'SIGNED_OUT') { localStorage.removeItem('tm_session'); window.location.replace('/login'); }
  });
  return true;
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
  if (vehRes.error) { tbody.innerHTML=`<tr><td colspan="8" style="color:red">${esc(vehRes.error.message)}</td></tr>`; return; }

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
        <span style="font-family:monospace;font-weight:800;font-size:.85rem">${esc(r.placa)}</span>
        ${esReincidente?`<span title="Reincidente" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:var(--amber-bg);color:var(--amber);font-size:.55rem;font-weight:800;margin-left:.25rem">R</span>`:''}
      </td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.propietario)}</td>
      <td style="font-size:.78rem;color:var(--muted)">${tipoLabel[r.tipo]||'—'}</td>
      <td style="font-size:.78rem">${esc([r.marca,r.modelo,r.anio].filter(Boolean).join(' ')||'—')}</td>
      <td style="font-size:.78rem">${esc(r.color||'—')}</td>
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
      <td class="mono" style="font-size:.73rem;font-weight:700">${esc(i.folio||'—')}</td>
      <td style="font-size:.78rem;white-space:nowrap">${fmtDateShort(i.fecha)}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem">${esc(i.tipo)}</td>
      <td style="font-weight:700">${fmt(i.monto)}</td>
      <td>${estadoBadge(i.estado)}</td>
    </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem">Sin infracciones registradas</td></tr>';

  $('veh-det-body').innerHTML = `
    <!-- Header -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:1rem">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem">
        <div>
          <div style="font-family:monospace;font-size:1.3rem;font-weight:800;color:var(--ink)">${esc(v.placa)}</div>
          <div style="font-size:.9rem;font-weight:700;color:var(--ink);margin-top:.2rem">${esc(v.propietario)}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.15rem">${tipoLabel[v.tipo]||''}${v.tipo&&v.color?' · ':''}${esc(v.color||'')}</div>
        </div>
        <div style="text-align:right">
          ${estadoBadge(v.estado)}
          ${v.telefono?`<div style="margin-top:.5rem"><a href="https://wa.me/52${v.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener" style="color:#128C7E;font-size:.78rem;text-decoration:none;display:inline-flex;align-items:center;gap:.25rem"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>${esc(v.telefono)}</a></div>`:''}
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
      <div class="detail-field"><label>Marca / Modelo</label><span>${esc([v.marca,v.modelo,v.anio].filter(Boolean).join(' ')||'—')}</span></div>
      <div class="detail-field"><label>Color</label><span>${esc(v.color||'—')}</span></div>
      ${v.num_serie?`<div class="detail-field"><label>Núm. de serie</label><span style="font-family:monospace;font-size:.8rem">${esc(v.num_serie)}</span></div>`:''}
      ${v.num_motor?`<div class="detail-field"><label>Núm. de motor</label><span style="font-family:monospace;font-size:.8rem">${esc(v.num_motor)}</span></div>`:''}
      <div class="detail-field"><label>Registrado</label><span>${fmtDateShort(v.created_at)}</span></div>
      ${v.obs?`<div class="detail-field full"><label>Observaciones</label><span style="background:var(--stone);display:block;padding:.4rem .65rem;border-radius:6px;font-size:.82rem">${esc(v.obs)}</span></div>`:''}
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
      <button class="btn btn-primary btn-sm" onclick="nuevaInfraccionParaVehiculo(${jsArg(v.placa)},${jsArg(v.propietario||'')},${jsArg(v.color||'')},${jsArg([v.marca,v.modelo,v.anio].filter(Boolean).join(' '))},${jsArg(v.telefono||'')})" title="Registrar infracción para este vehículo">
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
  if (error) { tbody.innerHTML=`<tr><td colspan="8" style="color:red">${esc(error.message)}</td></tr>`; return; }
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
      <td class="mono">${esc(r.folio||'—')}</td>
      <td>${fmtDateShort(r.fecha)}</td>
      <td class="mono" style="font-weight:700">${esc(r.placa)}</td>
      <td>${esc(r.propietario||'—')}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.motivo||'—')}</td>
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

  const selMes = $('mapa-mes');
  if (selMes && selMes.options.length <= 1) {
    const hoy = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      selMes.add(new Option(d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`));
    }
  }
  renderZonas();

  let q = _sb.from('infracciones').select('id,folio,placa,infractor,tipo,monto,estado,fecha,lat,lng').not('lat','is',null).not('lng','is',null);
  if (estadoFil) q = q.eq('estado', estadoFil);
  if (mesFil) {
    const [y, m] = mesFil.split('-').map(Number);
    q = q.gte('fecha', new Date(y, m - 1, 1).toISOString()).lt('fecha', new Date(y, m, 1).toISOString());
  }
  const { data } = await q;
  const franja = (($('mapa-hora')||{}).value || '').split('-').map(Number);
  const infs = (data||[]).filter(r => r.lat && r.lng && (franja.length < 2 || (new Date(r.fecha).getHours() >= franja[0] && new Date(r.fecha).getHours() < franja[1])));

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
      <div style="font-weight:700;margin-bottom:.3rem">${esc(r.folio||'—')} · ${esc(r.placa)}</div>
      <div style="color:#374151">${esc(r.tipo)}</div>
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

// ── Zonas conflictivas por día y hora (infracciones + accidentes) ──
const DIAS_SEM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function _calle(u) {
  const t = String(u || '').split(/[,(]/)[0].replace(/\s+/g, ' ').trim();
  return t.length >= 3 ? t : '';
}
async function renderZonas() {
  const cont = $('zonas-heatmap'), tbody = $('zonas-calles'); if (!cont || !tbody) return;
  const fuente = ($('zonas-fuente')||{}).value || 'ambos';
  const dias = Number(($('zonas-periodo')||{}).value || 90);
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const [{ data: infs }, { data: accs }] = await Promise.all([
    fuente === 'accidentes' ? { data: [] } : _sb.from('infracciones').select('fecha,ubicacion').gte('fecha', desde).neq('estado', 'cancelada').limit(5000),
    fuente === 'infracciones' ? { data: [] } : _sb.from('accidentes').select('fecha,ubicacion').gte('fecha', desde).limit(5000),
  ]);
  const celdas = Array.from({ length: 7 }, () => Array(24).fill(0));
  const calles = {};
  const sumar = (rows, clave) => (rows || []).forEach(r => {
    const d = new Date(r.fecha), dia = (d.getDay() + 6) % 7, h = d.getHours();
    celdas[dia][h]++;
    const c = _calle(r.ubicacion); if (!c) return;
    const k = c.toLowerCase();
    const e = calles[k] || (calles[k] = { nombre: c, infracciones: 0, accidentes: 0, horas: Array(24).fill(0), dias: Array(7).fill(0) });
    e[clave]++; e.horas[h]++; e.dias[dia]++;
  });
  sumar(infs, 'infracciones'); sumar(accs, 'accidentes');
  const max = Math.max(1, ...celdas.flat());
  const total = celdas.flat().reduce((a, b) => a + b, 0);
  const color = n => n ? `rgba(220,38,38,${(0.12 + 0.88 * n / max).toFixed(2)})` : 'var(--stone)';
  cont.innerHTML = total ? `<div class="heatmap" role="img" aria-label="Hechos por día de la semana y hora">
      <div></div>${Array.from({ length: 24 }, (_, h) => `<div class="hm-h">${h % 3 === 0 ? h : ''}</div>`).join('')}
      ${celdas.map((fila, d) => `<div class="hm-d">${DIAS_SEM[d]}</div>${fila.map((n, h) => `<div class="hm-c" style="background:${color(n)}" title="${DIAS_SEM[d]} ${h}:00–${h + 1}:00 · ${n} ${n === 1 ? 'hecho' : 'hechos'}"></div>`).join('')}`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;font-size:.72rem;color:var(--muted);margin-top:.5rem">
      <span>${total} hechos · el cuadro más oscuro tiene ${max}</span>
      <span>${(() => { let b = [0, 0]; celdas.forEach((f, d) => f.forEach((n, h) => { if (n > celdas[b[0]][b[1]]) b = [d, h]; })); return `Pico: ${DIAS_SEM[b[0]]} de ${b[1]}:00 a ${b[1] + 1}:00`; })()}</span>
    </div>` : '<div style="font-size:.8rem;color:var(--muted);padding:1rem 0">Sin hechos registrados en este periodo.</div>';
  const top = Object.values(calles).sort((a, b) => (b.infracciones + b.accidentes) - (a.infracciones + a.accidentes)).slice(0, 10);
  const pico = arr => arr.indexOf(Math.max(...arr));
  tbody.innerHTML = top.length ? top.map(c => {
    const h = pico(c.horas);
    return `<tr>
      <td style="font-weight:600">${esc(c.nombre)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${c.infracciones}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${c.accidentes}</td>
      <td>${h}:00–${h + 1}:00</td>
      <td>${DIAS_SEM[pico(c.dias)]}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Sin ubicaciones capturadas en este periodo</td></tr>';
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
    <div class="stat-card"><div class="stat-top"><div><div class="stat-num" style="font-size:1.1rem;letter-spacing:0">${esc(topOficial.split(' ').slice(0,2).join(' '))}</div><div class="stat-label">Oficial más activo</div></div><div class="stat-icon" style="background:#ECFDF5"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg></div></div></div>
    <div class="stat-card"><div class="stat-top"><div><div class="stat-num">${fmt(montoGlobal)}</div><div class="stat-label">Monto total levantado</div></div><div class="stat-icon" style="background:var(--ac-bg)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg></div></div></div>`;

  const tbody = $('rendimiento-table');
  if (tbody) tbody.innerHTML = sorted.length ? sorted.map(o => {
    const tasa = o.total>0 ? Math.round(o.pagadas/o.total*100) : 0;
    const bar = `<div style="height:6px;border-radius:3px;background:var(--border);overflow:hidden;width:80px"><div style="height:100%;background:var(--ac);width:${Math.round(o.total/maxTotal*100)}%"></div></div>`;
    return `<tr>
      <td style="font-weight:600">${esc(o.nombre)}</td>
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
      return `<div class="bar-col"><div class="bar-fill" style="height:${pct}%;background:var(--ac)" title="${esc(o.nombre)}: ${o.total} infracciones"></div></div>`;
    }).join('');
    if (labelsEl) labelsEl.innerHTML = sorted.slice(0,8).map(o=>
      `<span style="font-size:.65rem;color:var(--muted);white-space:nowrap">${esc(o.nombre.split(' ')[0])}</span>`).join('');
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
        <div class="gs-item-body"><div class="gs-item-title">${esc(r.folio||'—')} · ${esc(r.placa)}</div><div class="gs-item-sub">${esc(r.infractor)} · ${esc(r.tipo)}</div></div>
        <div>${estadoBadge(r.estado)}</div>
      </div>`).join('')}`);

    if (vehs?.length) sections.push(`
      <div class="gs-section-label">Vehículos</div>
      ${vehs.map(r => `<div class="gs-item" onclick="closeModal('modal-search');navigate('vehiculos');setTimeout(()=>viewVehiculoDetalle('${r.id}'),300)">
        <div class="gs-item-icon" style="background:var(--ac-bg)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ac)" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg></div>
        <div class="gs-item-body"><div class="gs-item-title">${esc(r.placa)}</div><div class="gs-item-sub">${esc(r.propietario)} · ${esc([r.marca,r.modelo].filter(Boolean).join(' ')||'—')}</div></div>
        <div>${estadoBadge(r.estado)}</div>
      </div>`).join('')}`);

    if (pers?.length) sections.push(`
      <div class="gs-section-label">Permisos</div>
      ${pers.map(r => `<div class="gs-item" onclick="closeModal('modal-search');navigate('permisos');setTimeout(()=>viewDetail('permisos','${r.id}'),300)">
        <div class="gs-item-icon" style="background:#EFF6FF"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div class="gs-item-body"><div class="gs-item-title">${esc(r.num||'—')} · ${esc(r.placa||'—')}</div><div class="gs-item-sub">${esc(r.titular)} · ${esc(r.tipo)}</div></div>
        <div>${estadoBadge(r.estado)}</div>
      </div>`).join('')}`);

    if (gru?.length) sections.push(`
      <div class="gs-section-label">Grúa / Corralón</div>
      ${gru.map(r => `<div class="gs-item" onclick="closeModal('modal-search');navigate('grua')">
        <div class="gs-item-icon" style="background:#FFFBEB"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2"><path d="M18 8h2a2 2 0 012 2v6h-4M6 8H2v10h2"/></svg></div>
        <div class="gs-item-body"><div class="gs-item-title">${esc(r.folio||'—')} · ${esc(r.placa)}</div><div class="gs-item-sub">${esc(r.propietario||'—')} · ${esc(r.motivo||'—')}</div></div>
        <div>${estadoBadge(r.estado)}</div>
      </div>`).join('')}`);

    res.innerHTML = sections.length
      ? sections.join('')
      : `<div style="padding:2rem;text-align:center;color:var(--muted);font-size:.85rem">Sin resultados para <strong>${esc(q)}</strong></div>`;
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
    <div style="padding:.8rem 1rem;border-bottom:1px solid var(--border);font-size:.82rem;font-weight:700">${data.length} ${data.length>1?'infracciones':'infracción'} — ${fecha}</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Folio</th><th>Placa</th><th>Tipo</th><th>Monto</th><th>Estado</th></tr></thead>
      <tbody>${data.map(r=>`<tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer">
        <td class="mono">${esc(r.folio||'—')}</td><td class="mono">${esc(r.placa)}</td>
        <td>${esc(r.tipo)}</td><td>${fmt(r.monto)}</td><td>${estadoBadge(r.estado)}</td>
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

// El policía vial edita solo sus accidentes y mientras sigan en proceso (controles.sql)
function puedeEditarAccidente(r) {
  if (!puede('accidentes')) return false;
  if (_rol !== 'oficial') return true;
  return r.estado === 'en_proceso' && (esMio(r));
}

async function renderAccidentes() {
  const tbody=$('accidentes-table'); if(!tbody) return;
  tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  let q=_sb.from('accidentes').select('*');
  if(_accSearch) q=q.or(`folio.ilike.%${_accSearch}%,ubicacion.ilike.%${_accSearch}%,oficial.ilike.%${_accSearch}%`);
  if(_accTipo)   q=q.eq('tipo',_accTipo);
  if(_accEstado) q=q.eq('estado',_accEstado);
  q=q.order('fecha',{ascending:false});
  const {data,error}=await q;
  if(error){tbody.innerHTML=`<tr><td colspan="8" style="color:red">${esc(error.message)}</td></tr>`;return;}
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
    <td class="mono" style="font-weight:700">${esc(r.folio||'—')}</td>
    <td>${fmtDateShort(r.fecha)}</td>
    <td>${esc(tipoLabel[r.tipo]||r.tipo)}</td>
    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.ubicacion||'—')}</td>
    <td style="text-align:center">${r.lesionados||0}${r.fallecidos>0?` / <span style="color:var(--red);font-weight:700">${r.fallecidos} fall.</span>`:''}</td>
    <td>${esc(r.oficial||'—')}</td>
    <td>${estadoAcc[r.estado]||esc(r.estado)}</td>
    <td>${puedeEditarAccidente(r)?`<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editAccidente('${r.id}')">Editar</button>`:''}</td>
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
        <input class="form-input" placeholder="Nombre" value="${esc(p.nombre)}" oninput="_accPartes[${i}].nombre=this.value" style="font-size:.8rem"/>
        <input class="form-input" placeholder="Placa" value="${esc(p.placa)}" oninput="_accPartes[${i}].placa=this.value.toUpperCase()" style="font-size:.8rem"/>
      </div>
      <div class="form-row" style="margin-top:.4rem">
        <input class="form-input" placeholder="Núm. licencia" value="${esc(p.licencia)}" oninput="_accPartes[${i}].licencia=this.value" style="font-size:.8rem"/>
        <input class="form-input" placeholder="Aseguradora" value="${esc(p.aseguradora)}" oninput="_accPartes[${i}].aseguradora=this.value" style="font-size:.8rem"/>
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
  let fotosArr=[];
  try{ fotosArr=await subirFotos($('acc-fotos'),'accidentes'); }
  catch(err){ btn.disabled=false; btn.textContent='Registrar accidente'; alert('No se pudieron subir las fotos: '+err.message); return; }
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
      <div class="detail-field"><label>Folio</label><span style="font-family:monospace;font-weight:700">${esc(r.folio||'—')}</span></div>
      <div class="detail-field"><label>Fecha</label><span>${fmtDateShort(r.fecha)}</span></div>
      <div class="detail-field"><label>Tipo</label><span>${esc(tipoLabel[r.tipo]||r.tipo)}</span></div>
      <div class="detail-field"><label>Estado</label><span>${esc(estadoAcc[r.estado]||r.estado)}</span></div>
      <div class="detail-field full"><label>Ubicación</label><span>${esc(r.ubicacion||'—')}${r.lat?` <a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" style="color:var(--ac);font-size:.75rem;margin-left:.4rem">Ver mapa ↗</a>`:''}</span></div>
      <div class="detail-field"><label>Lesionados</label><span style="font-weight:700;color:var(--amber)">${r.lesionados||0}</span></div>
      <div class="detail-field"><label>Fallecidos</label><span style="font-weight:700;color:var(--red)">${r.fallecidos||0}</span></div>
      <div class="detail-field"><label>Oficial</label><span>${esc(r.oficial||'—')}</span></div>
      ${r.descripcion?`<div class="detail-field full"><label>Descripción</label><span>${esc(r.descripcion)}</span></div>`:''}
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span>${esc(r.obs)}</span></div>`:''}
      ${partes.length?`<div class="detail-field full"><label>Partes involucradas</label>
        <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:.4rem">
          ${partes.map((p,i)=>`<div style="background:var(--stone);border-radius:6px;padding:.5rem .75rem;font-size:.8rem"><strong>Parte ${i+1}:</strong> ${esc(p.nombre||'—')} · Placa: ${esc(p.placa||'—')} · Lic: ${esc(p.licencia||'—')} · Aseg: ${esc(p.aseguradora||'—')}</div>`).join('')}
        </div></div>`:''}
      ${fotos.length?`<div class="detail-field full"><label>Fotos de evidencia</label><div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.3rem">${fotos.map(f=>`<img data-foto="${esc(f)}" alt="Foto de evidencia" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);background:var(--stone);cursor:pointer"/>`).join('')}</div></div>`:''}
    </div>
    <div class="detail-actions">
      <button class="btn btn-ghost btn-sm" onclick="printAccidente('${r.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir parte
      </button>
      ${puedeEditarAccidente(r)?`<button class="btn btn-secondary btn-sm" onclick="editAccidente('${r.id}');closeModal('modal-detail')">Editar</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-detail')">Cerrar</button>
    </div>`;
  openModal('modal-detail');
  hidratarFotos($('modal-detail'));
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

// Si un supervisor cerró el turno, el teléfono del oficial también lo suelta
async function verificarTurnoEnServidor() {
  const turno = JSON.parse(localStorage.getItem('tm_turno')||'null');
  if (!turno?.inicio) return;
  const { data, error } = await _sb.from('turnos').select('id').eq('oficial_nombre', turno.oficial).eq('estado','activo').limit(1);
  if (error || !Array.isArray(data) || data.length) return;
  localStorage.removeItem('tm_turno');
  checkTurnoActivo();
  showToast('Tu turno fue cerrado por un supervisor');
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
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:.4rem">Oficial: <strong>${esc(turno.oficial)}</strong></div>
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
  <div class="meta">Oficial: <strong>${esc(d.oficial)}</strong></div>
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
  const {data,error}=await _sb.from('usuarios').select(USR_COLS).eq('id',userId).single();
  if(error||!data){alert('No se pudo cargar el usuario.');return;}
  const rolLabel=Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.nombre]));
  const iniciales=(data.iniciales||data.nombre.split(' ').map(n=>n[0]).join('').slice(0,2)).toUpperCase();
  const qrVal=`OFICIAL:${data.usuario}|ID:${data.id}|ROL:${data.rol}`;
  let qrDataUrl='';
  try{qrDataUrl=new QRious({value:qrVal,size:180,padding:8,backgroundAlpha:1}).toDataURL();}catch(e){}

  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Credencial — ${esc(data.nombre)}</title>
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
      <div class="avatar">${esc(iniciales)}</div>
      <div class="card-info">
        <div class="card-name">${esc(data.nombre)}</div>
        <div class="card-role">${esc(rolLabel[data.rol]||data.rol)}</div>
      </div>
      <div class="card-logo">HCE</div>
    </div>
    <div class="card-body">
      <div class="card-fields">
        <div class="field"><div class="field-label">Usuario</div><div class="field-val">${esc(data.usuario)}</div></div>
        <div class="field"><div class="field-label">Rol</div><div class="field-val">${esc(rolLabel[data.rol]||data.rol)}</div></div>
        <div class="field"><div class="field-label">Estado</div><div class="field-val" style="color:${data.activo?'#059669':'#DC2626'}">${data.activo?'Activo':'Inactivo'}</div></div>
      </div>
      ${qrDataUrl?`<div class="card-qr"><img src="${qrDataUrl}"/></div>`:''}
    </div>
    <div class="card-footer">Tránsito y Movilidad Municipal · HCE Consultoría · Credencial oficial de agente</div>
  </div>
  </body></html>`;
  const w=window.open('','_blank','width=420,height=320');w.document.write(html);w.document.close();w.onload=()=>{w.focus();w.print();};
}

// ── initData: crea la fila de configuración si no existe ──
// Ya no inserta datos de demostración: en producción una tabla vacía es
// legítima y no debe llenarse con infracciones ficticias.
async function initData() {
  const { count: cfgCount } = await _sb.from('configuracion').select('*',{count:'exact',head:true});
  if (!cfgCount) {
    await _sb.from('configuracion').insert({ ...SEED_CONFIG, id:1 });
  }
}

// ── Conexión con la base de datos ─────────────────────────
// Si Supabase no responde (sin internet, o el proyecto está pausado), cada
// módulo se vería vacío sin explicación. Avisarlo con una franja visible.
async function checkConexion() {
  let ok = false;
  try {
    const { error } = await _sb.from('configuracion').select('id', { head: true, count: 'exact' });
    ok = !error;
    if (error) console.error('conexión:', error);
  } catch (err) { console.error('conexión:', err.message); }
  let bar = document.getElementById('conn-banner');
  if (ok) { if (bar) bar.remove(); return true; }
  if (bar && bar.dataset.offline !== String(!navigator.onLine)) { bar.remove(); bar = null; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'conn-banner';
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#DC2626;color:#fff;font:600 .8rem DM Sans,sans-serif;padding:.55rem 1rem;text-align:center;display:flex;gap:.75rem;justify-content:center;align-items:center;flex-wrap:wrap';
    bar.dataset.offline = String(!navigator.onLine);
    if (!navigator.onLine) {
      // Sin internet en el dispositivo: se puede seguir levantando boletas
      bar.style.background = '#92400E';
      bar.innerHTML = '<span>Sin internet. Puedes seguir levantando boletas: se guardan en este dispositivo y se suben solas al volver la señal.</span>'
        + '<button type="button" style="background:#fff;color:#92400E;border:none;border-radius:6px;padding:.25rem .7rem;font:inherit;cursor:pointer">Nueva infracción</button>';
      bar.querySelector('button').onclick = () => openNewInfraccion();
    } else {
      bar.innerHTML = '<span>No hay conexión con la base de datos. Los datos no se pueden cargar ni guardar.</span>'
        + '<button type="button" style="background:#fff;color:#DC2626;border:none;border-radius:6px;padding:.25rem .7rem;font:inherit;cursor:pointer">Reintentar</button>';
      bar.querySelector('button').onclick = async () => { if (await checkConexion()) location.reload(); };
    }
    document.body.appendChild(bar);
  }
  return false;
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  }
  initUI();
  actualizarIndicadorCola();
  actualizarIndicadorCobros();
  if (!(await checkConexion())) {
    navigate('dashboard');
    // Sin internet con sesión ya iniciada: queda listo para levantar boletas
    if (!navigator.onLine && _session) precargarSinSenal();
    return;
  }
  if (!(await verificarSesion())) return;
  iniciarControlInactividad();
  precargarSinSenal();
  sincronizarCola();
  sincronizarCobros();
  setInterval(() => { sincronizarCola(); sincronizarCobros(); }, 120000);
  checkTurnoActivo();
  setInterval(checkTurnoActivo, 60000);
  verificarTurnoEnServidor().catch(() => {});
  try { await initData(); } catch(err) { console.warn('initData:', err.message); }
  try { await checkAndUpdateVencidos(); } catch(err) { console.warn('vencidos:', err.message); }
  setupPushNotifications().catch(()=>{});
  const repMes = new URLSearchParams(location.search).get('reporte');
  if (repMes && /^\d{4}-\d{2}$/.test(repMes)) {
    // Enlace del correo mensual: abre Reportes con ese mes elegido
    navigate('reportes'); initReporteMensual(repMes);
    history.replaceState(null, '', location.pathname);
  } else navigate('dashboard');
});

// ── Guardas de permisos ───────────────────────────────────
// Si una acción restringida se llama sin pasar por un botón (atajo, consola),
// se avisa en lugar de dejar que la base de datos la rechace con un error.
[['openNewInfraccion','infraccion'], ['openRegistrarPago','cobrar'], ['submitPago','cobrar'],
 ['impugnarInfraccion','impugnar'], ['resolverImpugnacion','resolver'],
 ['openNewPermiso','permisos'], ['editPermiso','permisos'], ['renovarPermiso','permisos'], ['cancelarPermiso','permisos'],
 ['anularPago','anular'], ['cerrarTurnoDe','turnos'], ['openCorteCaja','cobrar'], ['cerrarCorte','cobrar'],
 ['openNewGrua','grua'], ['editGrua','liberar'], ['liberarVehiculo','liberar'],
 ['openNewAccidente','accidentes'], ['editAccidente','accidentes'], ['openNewVehiculo','padron'], ['editVehiculo','padron'],
 ['printCorteCaja','caja_ver'], ['abrirResolucion','impugnar'], ['abrirDevolucion','devolver']
].forEach(([fn, accion]) => {
  const orig = window[fn];
  if (typeof orig !== 'function' || puede(accion)) return;
  window[fn] = function () { showToast(`Tu rol (${_permisosRol.nombre}) no tiene permiso para esta acción`); };
});
