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
  const map = { pagada:'badge-green', pendiente:'badge-yellow', cancelada:'badge-red', vigente:'badge-green', vencido:'badge-red', suspendido:'badge-yellow' };
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
const VIEWS = ['dashboard','infracciones','permisos','reportes','configuracion'];

function navigate(view) {
  VIEWS.forEach(v => {
    const el = $('view-'+v);
    if (el) el.style.display = v===view ? 'block' : 'none';
    const li = document.querySelector(`[data-view="${v}"]`);
    if (li) li.classList.toggle('active', v===view);
  });
  if (view==='dashboard')     renderDashboard();
  if (view==='infracciones')  renderInfracciones();
  if (view==='permisos')      renderPermisos();
  if (view==='configuracion') loadConfig();
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

  // Donut chart by tipo
  const palette = ['#1A7A82','#229099','#2AABB5','#6DCBD2','#A8E6EA','#D4F5F7','#0D5A61','#3DB8C0'];
  const tipos = {};
  inf.forEach(r=>{ tipos[r.tipo]=(tipos[r.tipo]||0)+1; });
  const sorted = Object.entries(tipos).sort((a,b)=>b[1]-a[1]);
  const total = inf.length || 1;
  let conic = '', deg = 0;
  const donutEl = $('main-donut');
  if (donutEl) {
    sorted.forEach(([,v],i)=>{
      const pct = v/total*360;
      conic += `${palette[i%palette.length]} ${deg}deg ${deg+pct}deg,`;
      deg += pct;
    });
    donutEl.style.background = `conic-gradient(${conic.slice(0,-1)})`;
    if($('donut-center-txt')) $('donut-center-txt').textContent = total;
  }
  if($('dash-legend')) {
    $('dash-legend').innerHTML = sorted.slice(0,5).map(([t,v],i)=>`
      <div class="legend-row">
        <span class="legend-dot" style="background:${palette[i%palette.length]}"></span>
        <span class="legend-label">${t}</span>
        <span class="legend-val">${v}</span>
      </div>`).join('');
  }

  // Recent infractions table
  const recent = [...inf].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,5);
  if($('dash-tbody')) {
    $('dash-tbody').innerHTML = recent.length ? recent.map(r=>`
      <tr>
        <td>${r.tipo}</td>
        <td>${fmtDateShort(r.fecha)}</td>
        <td>${fmt(r.monto)}</td>
        <td>${estadoBadge(r.estado)}</td>
      </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Sin datos</td></tr>';
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
      <td><button class="btn-sm" onclick="viewDetail('infracciones','${r.id}')">Ver</button></td>
    </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Sin resultados</td></tr>';

  renderPager('inf-pager', _infPage, pages, p=>{ _infPage=p; renderInfracciones(); });
}

function filterInfracciones() {
  _infSearch = ($('inf-search')||{}).value||'';
  _infEstado = ($('inf-estado-filter')||{}).value||'';
  _infPage = 1;
  renderInfracciones();
}

async function submitInfraccion(e) {
  e.preventDefault();
  const id = $('inf-id').value;
  const payload = {
    fecha:     $('inf-fecha').value ? new Date($('inf-fecha').value).toISOString() : new Date().toISOString(),
    placa:     $('inf-placa').value.trim().toUpperCase(),
    infractor: $('inf-infractor').value.trim(),
    tipo:      $('inf-tipo').value,
    monto:     parseInt($('inf-monto').value)||0,
    ubicacion: $('inf-ubicacion').value.trim(),
    estado:    $('inf-est').value,
    obs:       $('inf-obs').value.trim()
  };
  if (id) {
    const { error } = await _sb.from('infracciones').update(payload).eq('id', id);
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('infraccion', `Infracción actualizada — ${payload.tipo} (${payload.placa})`);
  } else {
    const { data, error } = await _sb.from('infracciones').insert(payload).select().single();
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('infraccion', `Infracción ${data.folio} registrada — ${payload.tipo} (${payload.placa})`);
  }
  closeModal('modal-infraccion');
  renderInfracciones();
  renderDashboard();
}

function openNewInfraccion() {
  $('modal-inf-title').textContent = 'Nueva infracción';
  $('inf-form').reset();
  $('inf-id').value = '';
  $('inf-fecha').value = new Date().toISOString().slice(0,16);
  openModal('modal-infraccion');
}

async function editInfraccion(id) {
  const { data, error } = await _sb.from('infracciones').select('*').eq('id', id).single();
  if (error || !data) return;
  $('modal-inf-title').textContent = 'Editar infracción';
  $('inf-id').value = data.id;
  $('inf-fecha').value = data.fecha ? data.fecha.slice(0,16) : '';
  $('inf-placa').value = data.placa;
  $('inf-infractor').value = data.infractor;
  $('inf-tipo').value = data.tipo;
  $('inf-monto').value = data.monto;
  $('inf-ubicacion').value = data.ubicacion||'';
  $('inf-est').value = data.estado;
  $('inf-obs').value = data.obs||'';
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
      'Exceso de velocidad':'velocidad', 'Estacionamiento indebido':'estacionamiento',
      'No respetar alto':'alto', 'Conducir sin licencia':'sinlicencia',
      'Uso de celular':'celular', 'Circulación en sentido contrario':'contrario',
      'Uso prohibido de vía':'uprohibido', 'Documentos incompletos':'documentos'
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
      <td><button class="btn-sm" onclick="viewDetail('permisos','${r.id}')">Ver</button></td>
    </tr>`).join('')
    : '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Sin resultados</td></tr>';

  renderPager('per-pager', _perPage, pages, p=>{ _perPage=p; renderPermisos(); });
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
      <div class="detail-field"><label>Fecha</label><span>${fmtDateShort(r.fecha)}</span></div>
      <div class="detail-field"><label>Placa</label><span>${r.placa}</span></div>
      <div class="detail-field"><label>Infractor</label><span>${r.infractor}</span></div>
      <div class="detail-field"><label>Tipo</label><span>${r.tipo}</span></div>
      <div class="detail-field"><label>Monto</label><span>${fmt(r.monto)}</span></div>
      <div class="detail-field"><label>Ubicación</label><span>${r.ubicacion||'—'}</span></div>
      <div class="detail-field"><label>Estado</label><span>${estadoBadge(r.estado)}</span></div>
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span>${r.obs}</span></div>`:''}
    </div>
    <div class="detail-actions">
      <select id="detail-estado" class="form-input" style="width:auto">
        <option value="pendiente" ${r.estado==='pendiente'?'selected':''}>Pendiente</option>
        <option value="pagada"    ${r.estado==='pagada'?'selected':''}>Pagada</option>
        <option value="cancelada" ${r.estado==='cancelada'?'selected':''}>Cancelada</option>
      </select>
      <button class="btn-primary" onclick="saveDetailEstado('infracciones','${r.id}')">Guardar estado</button>
      <button class="btn-secondary" onclick="editInfraccion('${r.id}');closeModal('modal-detail')">Editar</button>
      <button class="btn-danger" onclick="deleteDetail('infracciones','${r.id}')">Eliminar</button>
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
      <select id="detail-estado" class="form-input" style="width:auto">
        <option value="vigente"    ${r.estado==='vigente'?'selected':''}>Vigente</option>
        <option value="vencido"    ${r.estado==='vencido'?'selected':''}>Vencido</option>
        <option value="suspendido" ${r.estado==='suspendido'?'selected':''}>Suspendido</option>
      </select>
      <button class="btn-primary" onclick="saveDetailEstado('permisos','${r.id}')">Guardar estado</button>
      <button class="btn-secondary" onclick="editPermiso('${r.id}');closeModal('modal-detail')">Editar</button>
      <button class="btn-danger" onclick="deleteDetail('permisos','${r.id}')">Eliminar</button>
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
function renderPager(containerId, page, pages, cb) {
  const el = $(containerId); if(!el) return;
  if(pages<=1){ el.innerHTML=''; return; }
  let html = '';
  if(page>1) html+=`<button class="pager-btn" onclick="(${cb})(${page-1})">‹</button>`;
  html+=`<span class="pager-info">Página ${page} de ${pages}</span>`;
  if(page<pages) html+=`<button class="pager-btn" onclick="(${cb})(${page+1})">›</button>`;
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
