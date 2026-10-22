// ══════════════════════════════════════════════════════════
// ALERTAS DE PLACA (institucional.sql)
// Placas reportadas (robo, orden de retención, búsqueda) y vehículos con
// muchos adeudos: al capturar la placa el celular del oficial muestra una
// alerta a pantalla completa. Las placas reportadas avisan a los mandos en
// tiempo real. La lista se guarda en el dispositivo para revisar sin señal.
// ══════════════════════════════════════════════════════════
const MOTIVOS_REPORTE = { robo: 'Reporte de robo', retencion: 'Orden de retención', busqueda: 'En búsqueda u operativo', otro: 'Otro motivo' };
const ALERTA_ADEUDOS_MIN = 3;   // desde cuántas infracciones sin pagar se alerta
let _reportados = null;
let _alertaMostrada = '';

function normPlaca(p) { return String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }

async function cargarReportados() {
  try {
    const { data, error } = await _sb.from('vehiculos_reportados')
      .select('id,placa,motivo,detalle,reportado_por,created_at').eq('activo', true).order('created_at', { ascending: false });
    if (error) throw error;
    _reportados = data || [];
    _guardarLocal('tm_reportados', _reportados);
  } catch (_) {
    if (!_reportados) _reportados = _leerLocal('tm_reportados') || [];
  }
  return _reportados;
}
function reportadoDe(placa) {
  const n = normPlaca(placa);
  return (_reportados || _leerLocal('tm_reportados') || []).find(r => r.placa === n) || null;
}

// La llama checkPlacaHistory con los adeudos ya calculados (vacíos sin señal)
function revisarAlertaPlaca(placa, adeudos = []) {
  const n = normPlaca(placa);
  if (n.length < 3) { _alertaMostrada = ''; return; }
  const rep = reportadoDe(n);
  const vencidas = adeudos.filter(r => r.estado === 'vencida').length;
  const tipo = rep ? 'reporte' : (adeudos.length >= ALERTA_ADEUDOS_MIN || vencidas > 0) ? 'adeudos' : null;
  if (!tipo || _alertaMostrada === n + ':' + tipo) return;
  _alertaMostrada = n + ':' + tipo;
  mostrarAlertaPlaca({ tipo, placa: ($('inf-placa')?.value || n).trim().toUpperCase(), rep, adeudos, vencidas });
  if (rep) avisarMandos(n, rep);
}

async function avisarMandos(placa, rep) {
  const nota = $('alerta-placa-aviso');
  try {
    const { error } = await _sb.from('alertas_placa').insert({ placa, motivo: MOTIVOS_REPORTE[rep.motivo] || rep.motivo, ubicacion: ($('inf-ubicacion')?.value || '').trim() });
    if (error) throw error;
    if (nota) nota.textContent = 'Ya se avisó a los mandos desde el sistema.';
  } catch (_) {
    if (nota) nota.textContent = 'Sin señal: avisa a tu supervisor por radio.';
  }
}

function sonarAlerta() {
  try { navigator.vibrate?.([350, 150, 350, 150, 700]); } catch (_) {}
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, .32, .64].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = 880;
      g.gain.setValueAtTime(.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(.25, ctx.currentTime + t + .02);
      g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .27);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch (_) {}
}

function mostrarAlertaPlaca({ tipo, placa, rep, adeudos, vencidas }) {
  $('alerta-placa')?.remove();
  const ov = document.createElement('div');
  ov.id = 'alerta-placa';
  ov.setAttribute('role', 'alertdialog');
  ov.setAttribute('aria-modal', 'true');
  const esReporte = tipo === 'reporte';
  const fondo = esReporte ? '#B91C1C' : '#B45309';
  const total = adeudos.reduce((a, r) => a + Number(r.monto || 0), 0);
  ov.style.cssText = `position:fixed;inset:0;z-index:9500;background:${fondo};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;padding:1.5rem;text-align:center;font-family:inherit`;
  ov.innerHTML = `
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" class="alerta-pulso"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    <div style="font-size:.85rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.9">${esReporte ? 'Vehículo reportado' : 'Vehículo con adeudos'}</div>
    <div style="font-family:'DM Mono',monospace;font-size:clamp(2.2rem,11vw,3.6rem);font-weight:700;letter-spacing:.06em;background:rgba(0,0,0,.18);border-radius:12px;padding:.2rem 1rem">${esc(placa)}</div>
    ${esReporte ? `
      <div style="font-size:1.35rem;font-weight:800">${esc(MOTIVOS_REPORTE[rep.motivo] || rep.motivo)}</div>
      ${rep.detalle ? `<div style="font-size:.95rem;max-width:440px;line-height:1.45;opacity:.95">${esc(rep.detalle)}</div>` : ''}
      <div style="font-size:.8rem;opacity:.8">Reportado por ${esc(rep.reportado_por || 'la Dirección')} el ${esc(fmtDateShort(rep.created_at))}</div>
      <div style="font-size:.95rem;font-weight:700;max-width:440px;line-height:1.45;background:rgba(0,0,0,.2);border-radius:10px;padding:.75rem 1rem">No dejes ir el vehículo y pide apoyo a tu supervisor.<br><span id="alerta-placa-aviso" style="font-weight:500;opacity:.9">Avisando a los mandos…</span></div>`
    : `
      <div style="font-size:1.35rem;font-weight:800">${adeudos.length} infracci${adeudos.length === 1 ? 'ón' : 'ones'} sin pagar · ${esc(fmt(total))}</div>
      ${vencidas ? `<div style="font-size:.95rem;font-weight:700">${vencidas} ya vencida${vencidas === 1 ? '' : 's'}</div>` : ''}
      <div style="font-size:.95rem;max-width:440px;line-height:1.45;background:rgba(0,0,0,.2);border-radius:10px;padding:.75rem 1rem">Infórmale al conductor que debe regularizarse en Tesorería. El detalle de los adeudos queda en el formulario.</div>`}
    <button type="button" class="btn" style="background:#fff;color:${fondo};font-weight:800;font-size:1rem;padding:.75rem 2.2rem;border-radius:10px;margin-top:.4rem">Entendido</button>
    <style>@media (prefers-reduced-motion:no-preference){.alerta-pulso{animation:alertaPulso 1s ease-in-out infinite}}@keyframes alertaPulso{50%{transform:scale(1.12)}}</style>`;
  ov.querySelector('button').onclick = () => ov.remove();
  document.body.appendChild(ov);
  ov.querySelector('button').focus();
  sonarAlerta();
}

// ── Mandos: aviso en tiempo real cuando un oficial encuentra una placa reportada ──
function escucharAlertasPlaca() {
  if (!['admin', 'supervisor'].includes(_rol)) return;
  _sb.channel('rt-alertas-placa')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'alertas_placa' }, ({ new: a }) => {
      const texto = `${a.oficial || 'Un oficial'} encontró la placa ${a.placa} (${a.motivo})${a.ubicacion ? ' en ' + a.ubicacion : ''}.`;
      avisoMando(texto);
      try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Tránsito — Placa reportada', { body: texto, tag: `alerta-${a.id}` }); } catch (_) {}
    })
    .subscribe();
}
function avisoMando(texto) {
  let pila = $('avisos-mando');
  if (!pila) {
    pila = document.createElement('div');
    pila.id = 'avisos-mando';
    pila.style.cssText = 'position:fixed;right:calc(1rem + env(safe-area-inset-right,0px));top:calc(1rem + env(safe-area-inset-top,0px));z-index:9400;display:flex;flex-direction:column;gap:.5rem;max-width:min(380px,calc(100vw - 2rem))';
    document.body.appendChild(pila);
  }
  const el = document.createElement('div');
  el.setAttribute('role', 'alert');
  el.style.cssText = 'background:#B91C1C;color:#fff;border-radius:10px;padding:.8rem 1rem;box-shadow:0 8px 28px rgba(0,0,0,.35);font-size:.84rem;line-height:1.45;display:flex;gap:.7rem;align-items:flex-start';
  el.innerHTML = `<div style="flex:1"><div style="font-weight:800;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;margin-bottom:.15rem">Placa reportada</div>${esc(texto)}</div><button type="button" aria-label="Cerrar" style="background:none;border:0;color:#fff;font-size:1.1rem;cursor:pointer;line-height:1">×</button>`;
  el.querySelector('button').onclick = () => el.remove();
  pila.prepend(el);
  sonarAlerta();
}

// ── Padrón: lista de vehículos reportados ──
async function renderReportados() {
  const card = $('reportados-card'), lista = $('reportados-lista'); if (!card || !lista) return;
  const mando = ['admin', 'supervisor'].includes(_rol);
  if ($('btn-nuevo-reporte')) $('btn-nuevo-reporte').style.display = mando ? '' : 'none';
  await cargarReportados();
  const rows = _reportados || [];
  if ($('reportados-cuenta')) $('reportados-cuenta').textContent = rows.length ? `${rows.length} activo${rows.length === 1 ? '' : 's'}` : '';
  lista.innerHTML = rows.length ? `<table><thead><tr><th>Placa</th><th>Motivo</th><th>Detalle</th><th>Reportó</th>${mando ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(r => `<tr>
      <td class="mono" style="font-weight:700">${esc(r.placa)}</td>
      <td><span class="${r.motivo === 'robo' ? 'badge-red' : 'badge-yellow'}">${esc(MOTIVOS_REPORTE[r.motivo] || r.motivo)}</span></td>
      <td style="font-size:.8rem;color:var(--muted);max-width:280px">${esc(r.detalle || '—')}</td>
      <td style="font-size:.78rem">${esc(r.reportado_por || '—')} · ${esc(fmtDateShort(r.created_at))}</td>
      ${mando ? `<td style="text-align:right"><button class="btn btn-ghost btn-sm" onclick="retirarReporte(${Number(r.id)}, ${jsArg(r.placa)})">Retirar</button></td>` : ''}
    </tr>`).join('')}</tbody></table>`
    : '<div style="font-size:.8rem;color:var(--muted);padding:.4rem 0">No hay vehículos reportados. Los que se agreguen aquí alertan al oficial en cuanto captura la placa.</div>';
}
function openNuevoReporte() {
  ['rep-placa', 'rep-detalle'].forEach(id => { if ($(id)) $(id).value = ''; });
  if ($('rep-motivo')) $('rep-motivo').value = 'robo';
  openModal('modal-reporte');
  setTimeout(() => $('rep-placa')?.focus(), 50);
}
async function submitReporte() {
  const placa = normPlaca($('rep-placa')?.value);
  if (placa.length < 3) { alert('Escribe la placa del vehículo.'); return; }
  const { error } = await _sb.from('vehiculos_reportados').insert({ placa, motivo: $('rep-motivo')?.value || 'otro', detalle: ($('rep-detalle')?.value || '').trim() });
  if (error) { alert(/duplicate|unique/i.test(error.message) ? 'Esa placa ya está reportada.' : 'No se pudo guardar: ' + error.message); return; }
  await logActivity('reporte', `Placa ${placa} reportada por ${_session?.name || ''}`);
  closeModal('modal-reporte');
  showToast('Placa reportada: los oficiales verán la alerta');
  renderReportados();
}
async function retirarReporte(id, placa) {
  if (!confirm(`¿Retirar el reporte de la placa ${placa}? Dejará de alertar a los oficiales.`)) return;
  const { error } = await _sb.from('vehiculos_reportados').update({ activo: false }).eq('id', id);
  if (error) { alert('No se pudo retirar: ' + error.message); return; }
  await logActivity('reporte', `Reporte de la placa ${placa} retirado por ${_session?.name || ''}`);
  showToast('Reporte retirado');
  renderReportados();
}
