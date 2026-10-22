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
  <div style="float:right;margin-left:1rem"><!--ESCUDO:56px--></div>
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
  win.document.write(conMarca(html)); win.document.close();
}

// ── Reporte trimestral para Cabildo (comparado con el mismo trimestre del año anterior) ──
async function _todasFilas(tabla, cols, campo, desde, hasta) {
  const { data, error } = await todas(() => _sb.from(tabla).select('id,' + cols).gte(campo, desde).lt(campo, hasta));
  if (error) throw error;
  return data;
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
  <div style="float:right;margin-left:1rem"><!--ESCUDO:56px--></div>
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
  win.document.write(conMarca(html)); win.document.close();
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
    const { data } = await todas(() => _sb.from('infracciones').select('*').order('fecha',{ascending:false}));
    rows = data||[]; headers = ['Folio','Fecha','Placa','Infractor','Tipo','Monto','Estado'];
    title = 'Reporte de Infracciones';
  } else {
    const { data } = await todas(() => _sb.from('permisos').select('*').order('created_at',{ascending:false}));
    rows = data||[]; headers = ['Núm.','Titular','Tipo','Placa','Ruta','Vencimiento','Estado'];
    title = 'Reporte de Permisos de Circulación';
  }

  const tableRows = tipo==='infracciones'
    ? rows.map(r=>`<tr><td>${esc(r.folio||'—')}</td><td>${fmtDateShort(r.fecha)}</td><td>${esc(r.placa)}</td><td>${esc(r.infractor)}</td><td>${esc(r.tipo)}</td><td>${fmt(r.monto)}</td><td>${r.estado}</td></tr>`).join('')
    : rows.map(r=>`<tr><td>${esc(r.num||'—')}</td><td>${esc(r.titular)}</td><td>${esc(r.tipo)}</td><td>${esc(r.placa||'—')}</td><td>${esc(r.ruta||'—')}</td><td>${fmtDateShort(r.vencimiento)}</td><td>${r.estado}</td></tr>`).join('');

  const win = window.open('','_blank','width=900,height=700');
  win.document.write(conMarca(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
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
  </body></html>`));
  win.document.close();
}

