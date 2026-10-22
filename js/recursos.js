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
  const w = window.open('', '_blank', 'width=800,height=900'); w.document.write(conMarca(html)); w.document.close(); w.onload = () => { w.focus(); w.print(); };
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

