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
    todas(() => _sb.from('vehiculos').select('*')),
    todas(() => _sb.from('infracciones').select('id,placa,monto,estado'))
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

