/* ─────────────────────────────────────────────────────────
   Tránsito Municipal — app.js  (Supabase backend)
   ───────────────────────────────────────────────────────── */

// ── Auth (session stays in localStorage) ─────────────────
const _session = JSON.parse(localStorage.getItem('tm_session') || 'null');
if (!_session) window.location.replace('login.html');

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
const VIEWS = ['dashboard','infracciones','permisos','reportes','configuracion','tickets'];

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
  const titles = { dashboard:'Panel general', infracciones:'Control de Infracciones', permisos:'Permisos de Circulación', reportes:'Reportes', configuracion:'Configuración', tickets:'Impresión de Ticket' };
  const crumbs = { dashboard:'Dashboard', infracciones:'Infracciones', permisos:'Permisos', reportes:'Reportes', configuracion:'Configuración', tickets:'Tickets' };
  if($('topbar-title')) $('topbar-title').textContent = titles[view] || view;
  if($('topbar-crumb')) $('topbar-crumb').textContent = crumbs[view] || view;
  if (view==='dashboard')     renderDashboard();
  if (view==='infracciones')  renderInfracciones();
  if (view==='permisos')      renderPermisos();
  if (view==='configuracion') loadConfig();
  if (view==='tickets')       renderTicketView();
}

// ── Dashboard ─────────────────────────────────────────────
async function renderDashboard() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1;
  const mesInicio = `${y}-${String(m).padStart(2,'0')}-01`;
  const mesFin = new Date(y, m, 1).toISOString().slice(0,10);

  const [
    { data: infAll },
    { data: infMes },
    { data: perAll },
    { data: act }
  ] = await Promise.all([
    _sb.from('infracciones').select('id,monto,estado,fecha,tipo'),
    _sb.from('infracciones').select('id,monto,estado').gte('fecha', mesInicio).lt('fecha', mesFin),
    _sb.from('permisos').select('id,estado'),
    _sb.from('actividad').select('*').order('ts',{ascending:false}).limit(8)
  ]);

  const inf = infAll || [], infM = infMes || [], per = perAll || [];

  const infMesCount = infM.length;
  const infPend = inf.filter(r=>r.estado==='pendiente').length;
  const perVig  = per.filter(r=>r.estado==='vigente').length;
  const recMes  = infM.filter(r=>r.estado==='pagada').reduce((a,r)=>a+r.monto,0);

  const pm = m===1?12:m-1, py = m===1?y-1:y;
  const pmInicio = `${py}-${String(pm).padStart(2,'0')}-01`;
  const { data: infPrevMes } = await _sb.from('infracciones').select('id,monto,estado').gte('fecha',pmInicio).lt('fecha',mesInicio);
  const prevM = infPrevMes || [];
  const prevCount = prevM.length;
  const prevRec = prevM.filter(r=>r.estado==='pagada').reduce((a,r)=>a+r.monto,0);
  const delta = c => c>0 ? `<span class="delta-up">▲ ${c}</span>` : c<0 ? `<span class="delta-dn">▼ ${Math.abs(c)}</span>` : `<span style="color:var(--muted)">—</span>`;

  if($('s-inf'))        $('s-inf').textContent      = infMesCount;
  if($('s-pend'))       $('s-pend').textContent     = infPend;
  if($('s-per'))        $('s-per').textContent      = perVig;
  if($('s-rec'))        $('s-rec').textContent      = fmt(recMes);
  if($('s-inf-delta'))  $('s-inf-delta').innerHTML  = delta(infMesCount - prevCount);
  if($('s-pend-delta')) $('s-pend-delta').innerHTML = delta(0);
  if($('s-rec-delta'))  $('s-rec-delta').innerHTML  = delta(recMes - prevRec > 0 ? 1 : recMes - prevRec < 0 ? -1 : 0);
  if($('s-per-delta'))  $('s-per-delta').textContent = '';
  if($('badge-pendientes')) $('badge-pendientes').textContent = infPend || '';

  // Donut por estado
  const estadoColors = { pendiente:'#D97706', pagada:'#059669', impugnada:'#2563EB', cancelada:'#DC2626', vencida:'#9CA3AF' };
  const estados = {};
  inf.forEach(r=>{ estados[r.estado]=(estados[r.estado]||0)+1; });
  const sorted = Object.entries(estados).sort((a,b)=>b[1]-a[1]);
  const total = inf.length || 1;
  let conic = '', deg = 0;
  const donutEl = $('main-donut');
  if (donutEl) {
    sorted.forEach(([k,v])=>{
      const pct = v/total*360;
      const color = estadoColors[k] || '#9CA3AF';
      conic += `${color} ${deg}deg ${deg+pct}deg,`;
      deg += pct;
    });
    donutEl.style.background = `conic-gradient(${conic.slice(0,-1)})`;
    if($('donut-center-txt')) $('donut-center-txt').textContent = total;
  }
  if($('dash-legend')) {
    $('dash-legend').innerHTML = sorted.map(([k,v])=>`
      <div class="legend-row">
        <span class="legend-dot" style="background:${estadoColors[k]||'#9CA3AF'}"></span>
        <span class="legend-label">${k.charAt(0).toUpperCase()+k.slice(1)}</span>
        <span class="legend-val">${v}</span>
      </div>`).join('');
  }

  // Recent infractions table (5 cols: Folio, Fecha, Tipo, Monto, Estado)
  const recent = [...inf].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,5);
  if($('dash-tbody')) {
    $('dash-tbody').innerHTML = recent.length ? recent.map(r=>`
      <tr>
        <td class="mono">${r.folio||'—'}</td>
        <td>${fmtDateShort(r.fecha)}</td>
        <td>${r.tipo}</td>
        <td>${fmt(r.monto)}</td>
        <td>${estadoBadge(r.estado)}</td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Sin datos</td></tr>';
  }

  // Activity feed
  if($('dash-activity')) {
    $('dash-activity').innerHTML = (act||[]).map(a=>`
      <div class="act-row">
        <span class="act-dot act-dot-${a.tipo||'info'}"></span>
        <span class="act-txt">${a.texto}</span>
        <span class="act-time">${fmtDateShort(a.ts)}</span>
      </div>`).join('') || '<div style="color:var(--muted);font-size:.8rem">Sin actividad reciente</div>';
  }

  renderBarChart(infAll);
}

async function renderBarChart(infAll) {
  const el = $('dash-bar-chart');
  if (!el) return;
  const yearEl = $('dash-chart-year');
  const year = yearEl ? parseInt(yearEl.textContent)||new Date().getFullYear() : new Date().getFullYear();
  const inf = infAll || [];
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const counts = Array(12).fill(0);
  inf.forEach(r => {
    const d = new Date(r.fecha);
    if (d.getFullYear()===year) counts[d.getMonth()]++;
  });
  const max = Math.max(...counts, 1);
  el.innerHTML = counts.map((c,i)=>`
    <div class="bar-col">
      <div class="bar-fill" style="height:${Math.round(c/max*100)}%" title="${c} infracciones"></div>
      <div class="bar-label">${months[i]}</div>
    </div>`).join('');
}

// ── Infracciones ──────────────────────────────────────────
let _infPage = 1, _infSearch = '', _infEstado = '';
const INF_PAGE_SIZE = 12;

async function renderInfracciones() {
  const tbody = $('inf-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';

  let q = _sb.from('infracciones').select('*').order('fecha',{ascending:false});
  if (_infEstado) q = q.eq('estado', _infEstado);
  if (_infSearch) q = q.or(`placa.ilike.%${_infSearch}%,infractor.ilike.%${_infSearch}%,folio.ilike.%${_infSearch}%`);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="8" style="color:red">${error.message}</td></tr>`; return; }

  const all = data || [];
  const pages = Math.max(1, Math.ceil(all.length/INF_PAGE_SIZE));
  if (_infPage > pages) _infPage = pages;
  const rows = all.slice((_infPage-1)*INF_PAGE_SIZE, _infPage*INF_PAGE_SIZE);

  tbody.innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td>${r.folio||'—'}</td>
      <td>${fmtDateShort(r.fecha)}</td>
      <td>${r.placa}</td>
      <td>${r.infractor}</td>
      <td>${r.tipo}</td>
      <td>${fmt(r.monto)}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewDetail('infracciones','${r.id}')">Ver</button></td>
    </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Sin resultados</td></tr>';

  renderPager('inf-pager', _infPage, pages, 'goInfPage');
}

function filterInfracciones() {
  _infSearch = ($('inf-search')||{}).value||'';
  _infEstado = ($('inf-estado-filter')||{}).value||'';
  _infPage = 1;
  renderInfracciones();
}

async function submitInfraccion(e) {
  e.preventDefault();
  const btn = $('inf-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  const id = $('inf-id').value;
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
    obs:            $('inf-obs').value.trim()
  };

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
    printInfraccion(data.id);
  }

  renderInfracciones();
  renderDashboard();
}

function openNewInfraccion() {
  $('modal-inf-title').textContent = 'Nueva infracción';
  $('inf-form').reset();
  $('inf-id').value = '';
  $('inf-fecha').value = new Date().toISOString().slice(0,16);
  $('inf-est').value = 'pendiente';
  openModal('modal-infraccion');
}

async function editInfraccion(id) {
  const { data, error } = await _sb.from('infracciones').select('*').eq('id', id).single();
  if (error || !data) return;
  $('modal-inf-title').textContent = 'Editar infracción';
  $('inf-id').value       = data.id;
  $('inf-fecha').value    = data.fecha ? data.fecha.slice(0,16) : '';
  $('inf-placa').value    = data.placa;
  $('inf-infractor').value= data.infractor;
  $('inf-licencia').value = data.licencia||'';
  $('inf-vehiculo').value = data.vehiculo||'';
  $('inf-color').value    = data.color_vehiculo||'';
  $('inf-oficial').value  = data.oficial||'';
  $('inf-tipo').value     = data.tipo;
  $('inf-monto').value    = data.monto;
  $('inf-ubicacion').value= data.ubicacion||'';
  $('inf-est').value      = data.estado;
  $('inf-obs').value      = data.obs||'';
  openModal('modal-infraccion');
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
}

// ── Permisos ──────────────────────────────────────────────
let _perPage = 1, _perSearch = '', _perEstado = '';
const PER_PAGE_SIZE = 12;

async function renderPermisos() {
  const tbody = $('per-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';

  let q = _sb.from('permisos').select('*').order('created_at',{ascending:false});
  if (_perEstado) q = q.eq('estado', _perEstado);
  if (_perSearch) q = q.or(`titular.ilike.%${_perSearch}%,placa.ilike.%${_perSearch}%,num.ilike.%${_perSearch}%`);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="8" style="color:red">${error.message}</td></tr>`; return; }

  const all = data || [];
  const pages = Math.max(1, Math.ceil(all.length/PER_PAGE_SIZE));
  if (_perPage > pages) _perPage = pages;
  const rows = all.slice((_perPage-1)*PER_PAGE_SIZE, _perPage*PER_PAGE_SIZE);

  tbody.innerHTML = rows.length ? rows.map(r=>`
    <tr>
      <td>${r.num||'—'}</td>
      <td>${r.titular}</td>
      <td>${r.tipo}</td>
      <td>${r.placa||'—'}</td>
      <td>${r.ruta||'—'}</td>
      <td>${fmtDateShort(r.vencimiento)}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="viewDetail('permisos','${r.id}')">Ver</button></td>
    </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Sin resultados</td></tr>';

  renderPager('per-pager', _perPage, pages, 'goPerPage');
}

function filterPermisos() {
  _perSearch = ($('per-search')||{}).value||'';
  _perEstado = ($('per-estado-filter')||{}).value||'';
  _perPage = 1;
  renderPermisos();
}

async function submitPermiso(e) {
  e.preventDefault();
  const id = $('per-id').value;
  const payload = {
    titular:     $('per-titular').value.trim(),
    tipo:        $('per-tipo').value,
    placa:       $('per-placa').value.trim().toUpperCase(),
    ruta:        $('per-ruta').value.trim(),
    inicio:      $('per-inicio').value||null,
    vencimiento: $('per-venc').value,
    estado:      $('per-est').value
  };
  if (id) {
    const { error } = await _sb.from('permisos').update(payload).eq('id', id);
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('permiso', `Permiso actualizado — ${payload.titular} (${payload.placa})`);
  } else {
    const { data, error } = await _sb.from('permisos').insert(payload).select().single();
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('permiso', `Permiso ${data.num} creado — ${payload.titular}`);
  }
  closeModal('modal-permiso');
  renderPermisos();
}

function openNewPermiso() {
  $('modal-per-title').textContent = 'Nuevo permiso';
  $('per-form').reset();
  $('per-id').value = '';
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
  openModal('modal-permiso');
}

// ── Detail modal ──────────────────────────────────────────
async function viewDetail(tabla, id) {
  const { data, error } = await _sb.from(tabla).select('*').eq('id', id).single();
  if (error || !data) return;
  const r = data, isInf = tabla==='infracciones';
  const dm = $('modal-detail');
  if (!dm) return;
  dm.querySelector('.modal-title').textContent = isInf ? `Infracción ${r.folio||''}` : `Permiso ${r.num||''}`;
  dm.querySelector('.detail-body').innerHTML = isInf ? `
    <div class="detail-grid">
      <div class="detail-field"><label>Folio</label><span>${r.folio||'—'}</span></div>
      <div class="detail-field"><label>Fecha y hora</label><span>${fmtDateShort(r.fecha)}</span></div>
      <div class="detail-field"><label>Placa</label><span>${r.placa}</span></div>
      <div class="detail-field"><label>Color del vehículo</label><span>${r.color_vehiculo||'—'}</span></div>
      <div class="detail-field full"><label>Marca y modelo</label><span>${r.vehiculo||'—'}</span></div>
      <div class="detail-field full"><label>Infractor</label><span>${r.infractor}</span></div>
      <div class="detail-field"><label>Núm. de licencia</label><span>${r.licencia||'—'}</span></div>
      <div class="detail-field"><label>Oficial que levantó</label><span>${r.oficial||'—'}</span></div>
      <div class="detail-field full"><label>Tipo de infracción</label><span>${r.tipo}</span></div>
      <div class="detail-field"><label>Monto</label><span style="font-size:1rem;font-weight:700;color:var(--ac)">${fmt(r.monto)}</span></div>
      <div class="detail-field"><label>Estado</label><span>${estadoBadge(r.estado)}</span></div>
      <div class="detail-field full"><label>Ubicación</label><span>${r.ubicacion||'—'}</span></div>
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span>${r.obs}</span></div>`:''}
    </div>
    <div class="detail-actions">
      <select id="detail-estado" class="form-select" style="width:auto;min-width:130px">
        <option value="pendiente"  ${r.estado==='pendiente'?'selected':''}>Pendiente</option>
        <option value="pagada"     ${r.estado==='pagada'?'selected':''}>Pagada</option>
        <option value="impugnada"  ${r.estado==='impugnada'?'selected':''}>Impugnada</option>
        <option value="cancelada"  ${r.estado==='cancelada'?'selected':''}>Cancelada</option>
        <option value="vencida"    ${r.estado==='vencida'?'selected':''}>Vencida</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="saveDetailEstado('infracciones','${r.id}')">Guardar estado</button>
      <button class="btn btn-secondary btn-sm" onclick="editInfraccion('${r.id}');closeModal('modal-detail')">Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="printInfraccion('${r.id}')" title="Imprimir boleta de infracción">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir boleta
      </button>
      <button class="btn btn-danger btn-sm" onclick="deleteDetail('infracciones','${r.id}')">Eliminar</button>
    </div>` : `
    <div class="detail-grid">
      <div class="detail-field"><label>Núm.</label><span>${r.num||'—'}</span></div>
      <div class="detail-field"><label>Titular</label><span>${r.titular}</span></div>
      <div class="detail-field"><label>Tipo</label><span>${r.tipo}</span></div>
      <div class="detail-field"><label>Placa</label><span>${r.placa||'—'}</span></div>
      <div class="detail-field"><label>Ruta</label><span>${r.ruta||'—'}</span></div>
      <div class="detail-field"><label>Inicio</label><span>${fmtDateShort(r.inicio)}</span></div>
      <div class="detail-field"><label>Vencimiento</label><span>${fmtDateShort(r.vencimiento)}</span></div>
      <div class="detail-field"><label>Estado</label><span>${estadoBadge(r.estado)}</span></div>
    </div>
    <div class="detail-actions">
      <select id="detail-estado" class="form-select" style="width:auto;min-width:130px">
        <option value="vigente"    ${r.estado==='vigente'?'selected':''}>Vigente</option>
        <option value="por-vencer" ${r.estado==='por-vencer'?'selected':''}>Por vencer</option>
        <option value="vencido"    ${r.estado==='vencido'?'selected':''}>Vencido</option>
        <option value="suspendido" ${r.estado==='suspendido'?'selected':''}>Suspendido</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="saveDetailEstado('permisos','${r.id}')">Guardar estado</button>
      <button class="btn btn-secondary btn-sm" onclick="editPermiso('${r.id}');closeModal('modal-detail')">Editar</button>
      <button class="btn btn-danger btn-sm" onclick="deleteDetail('permisos','${r.id}')">Eliminar</button>
    </div>`;
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
}

async function saveConfig() {
  const montos = {};
  ['velocidad','estacionamiento','alto','sinlicencia','celular','contrario','uprohibido','documentos'].forEach(k=>{
    montos[k] = parseInt(($('cfg-m-'+k)||{}).value)||0;
  });
  const payload = {
    id: 1,
    municipio: ($('cfg-municipio')||{}).value||'',
    estado:    ($('cfg-estado')||{}).value||'',
    director:  ($('cfg-director')||{}).value||'',
    correo:    ($('cfg-correo')||{}).value||'',
    montos
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
    _sb.from('actividad').delete().neq('id', 0)
  ]);
  await _sb.from('configuracion').upsert({ ...SEED_CONFIG, id:1 }, { onConflict:'id' });
  await _sb.from('infracciones').insert(SEED_INFRACCIONES);
  await _sb.from('permisos').insert(SEED_PERMISOS);
  await _sb.from('actividad').insert(SEED_ACTIVIDAD);
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

// ── Ticket view (80mm) ────────────────────────────────────
let _tktPage = 1, _tktSearch = '', _tktEstado = '', _tktSelected = null;
const TKT_PAGE_SIZE = 15;

async function renderTicketView() {
  _tktPage = 1; _tktSearch = ''; _tktEstado = ''; _tktSelected = null;
  const btn80 = $('tkt-btn-80'), btnA4 = $('tkt-btn-a4');
  if (btn80) btn80.style.display = 'none';
  if (btnA4) btnA4.style.display = 'none';
  const empty = $('tkt-empty'), scroll = $('tkt-preview-scroll');
  if (empty) empty.style.display = 'flex';
  if (scroll) { scroll.style.display = 'none'; scroll.innerHTML = ''; }
  await renderTktList();
}

async function renderTktList() {
  const body = $('tkt-list-body');
  if (!body) return;
  body.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.8rem">Cargando…</div>';

  let q = _sb.from('infracciones').select('id,folio,fecha,placa,infractor,tipo,monto,estado').order('fecha',{ascending:false});
  if (_tktEstado) q = q.eq('estado', _tktEstado);
  if (_tktSearch) q = q.or(`placa.ilike.%${_tktSearch}%,infractor.ilike.%${_tktSearch}%,folio.ilike.%${_tktSearch}%`);
  const { data, error } = await q;
  if (error) { body.innerHTML = `<div style="color:var(--red);padding:1rem;font-size:.8rem">${error.message}</div>`; return; }

  const all = data || [];
  const pages = Math.max(1, Math.ceil(all.length / TKT_PAGE_SIZE));
  if (_tktPage > pages) _tktPage = pages;
  const rows = all.slice((_tktPage-1)*TKT_PAGE_SIZE, _tktPage*TKT_PAGE_SIZE);

  if (!rows.length) {
    body.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--muted);font-size:.82rem">Sin resultados</div>';
    renderPager('tkt-pager', 1, 1, 'goTktPage');
    return;
  }

  body.innerHTML = rows.map(r => `
    <div class="tkt-item${_tktSelected===r.id?' selected':''}" onclick="selectTicket('${r.id}')">
      <div class="tkt-item-info">
        <div class="tkt-item-folio">${r.folio||'—'}</div>
        <div class="tkt-item-name">${r.infractor}</div>
        <div class="tkt-item-meta">${r.placa} · ${fmtDateShort(r.fecha)}</div>
      </div>
      <div class="tkt-item-right">
        ${estadoBadge(r.estado)}
        <span style="font-size:.74rem;font-weight:700;color:var(--ink)">${fmt(r.monto)}</span>
      </div>
    </div>`).join('');

  renderPager('tkt-pager', _tktPage, pages, 'goTktPage');
}

function filterTickets() {
  _tktSearch = ($('tkt-search')||{}).value||'';
  _tktEstado = ($('tkt-estado-filter')||{}).value||'';
  _tktPage = 1;
  renderTktList();
}

function goTktPage(p) { _tktPage = p; renderTktList(); }

async function selectTicket(id) {
  _tktSelected = id;
  document.querySelectorAll('.tkt-item').forEach(el => el.classList.remove('selected'));
  const found = document.querySelector(`.tkt-item[onclick*="'${id}'"]`);
  if (found) found.classList.add('selected');

  const btn80 = $('tkt-btn-80'), btnA4 = $('tkt-btn-a4');
  if (btn80) btn80.style.display = 'inline-flex';
  if (btnA4) btnA4.style.display = 'inline-flex';

  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('infracciones').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id', 1).single()
  ]);
  if (!r) return;

  const empty = $('tkt-empty'), scroll = $('tkt-preview-scroll');
  if (empty) empty.style.display = 'none';
  if (scroll) { scroll.style.display = 'flex'; scroll.innerHTML = buildTicket80(r, cfg); }
}

function buildTicket80(r, cfg) {
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

  const ticketHTML = buildTicket80(r, cfg);

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
}

function logout() {
  localStorage.removeItem('tm_session');
  window.location.replace('login.html');
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
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initUI();
  try { await initData(); } catch(err) { console.warn('initData:', err.message); }
  navigate('dashboard');
});
