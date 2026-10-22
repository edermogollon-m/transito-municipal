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

  const consulta = () => {
    let q = _sb.from('infracciones').select('oficial,monto,estado,fecha');
    if (desde) q = q.gte('fecha', desde);
    return q;
  };
  const { data } = await todas(consulta);
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
      _sb.from('infracciones').select('id,folio,placa,infractor,tipo,estado,monto').or(orBuscar(['folio', 'placa', 'infractor'], q)).limit(5),
      _sb.from('vehiculos').select('id,placa,propietario,marca,modelo,estado').or(orBuscar(['placa', 'propietario'], q)).limit(4),
      _sb.from('permisos').select('id,num,titular,tipo,placa,estado').or(orBuscar(['num', 'titular', 'placa'], q)).limit(4),
      _sb.from('grua').select('id,folio,placa,propietario,motivo,estado').or(orBuscar(['folio', 'placa', 'propietario'], q)).limit(3),
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

  const { data } = await todas(() => _sb.from('infracciones').select('id,fecha,estado,monto').gte('fecha', desde+'T00:00:00').lte('fecha', hasta+'T23:59:59'));
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

