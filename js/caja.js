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
  <div style="float:right"><!--ESCUDO:52px--></div>
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
  win.document.write(conMarca(html)); win.document.close();
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
        <button class="btn btn-ghost btn-sm" style="color:#128C7E" onclick="ofrecerRecibo('${r.id}')" title="Enviar el recibo digital por WhatsApp o correo">Enviar</button>
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

