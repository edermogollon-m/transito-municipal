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
  win.document.write(conMarca(html));
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
}

// ── Export Excel ──────────────────────────────────────────
async function exportExcel(tipo) {
  if (typeof XLSX === 'undefined') { alert('La librería Excel no está cargada. Recarga la página.'); return; }
  let rows = [], wsName = '', filename = '';

  if (tipo === 'infracciones') {
    const { data } = await todas(() => _sb.from('infracciones').select('id,folio,fecha,placa,infractor,tipo,monto,ubicacion,estado,obs').order('fecha',{ascending:false}));
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
    const { data } = await todas(() => _sb.from('pagos').select('id,created_at,folio_inf,monto_original,descuento_pct,monto_final,metodo,cajero').order('created_at',{ascending:false}));
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
    const { data } = await todas(() => _sb.from('infracciones').select('*').order('fecha',{ascending:false}));
    rows = data||[]; headers = ['folio','fecha','placa','infractor','tipo','monto','ubicacion','estado','obs'];
    filename = 'infracciones.csv';
  } else {
    const { data } = await todas(() => _sb.from('permisos').select('*').order('created_at',{ascending:false}));
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

