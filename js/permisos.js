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

