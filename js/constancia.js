// Constancia de no adeudo imprimible (constancias_cobro.sql). La usan el
// portal ciudadano (después de pagarla en línea) y Caja (cobro en ventanilla).
// data: { folio, token, placa, emitida, vigente_hasta, municipio, estado,
//         director, monto?, metodo? }
function htmlConstancia(data) {
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const url = `${location.origin}/verificar?t=${data.token}`;
  let qr = '';
  try { qr = new QRious({ value: url, size: 260, padding: 8 }).toDataURL(); } catch (_) {}
  const f = d => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Mexico_City' });
  const metodo = { en_linea: 'pago en línea', efectivo: 'efectivo', tarjeta: 'tarjeta', transferencia: 'transferencia' }[data.metodo] || '';
  const derechos = data.monto != null
    ? `<p class="pago">Derechos pagados: ${e(Number(data.monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }))}${metodo ? ' (' + e(metodo) + ')' : ''}.</p>` : '';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Constancia de no adeudo ${e(data.folio)}</title>
  <style>
    body{font-family:Georgia,'Times New Roman',serif;color:#111827;max-width:720px;margin:2rem auto;padding:0 1.2rem;line-height:1.6}
    .k{font-family:Arial,sans-serif;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:#4B5563}
    h1{font-size:1.45rem;margin:.4rem 0 1.4rem;letter-spacing:.02em}
    .folio{font-family:'Courier New',monospace;font-weight:700}
    .placa{display:inline-block;font-family:'Courier New',monospace;font-size:1.4rem;font-weight:700;border:2px solid #111827;border-radius:6px;padding:.1rem .7rem;letter-spacing:.06em}
    .pago{font-family:Arial,sans-serif;font-size:.8rem;color:#374151}
    .qr{display:flex;gap:1.2rem;align-items:center;margin-top:2rem;padding-top:1rem;border-top:1px solid #D1D5DB;font-family:Arial,sans-serif;font-size:.78rem;color:#374151}
    .firma{margin-top:3rem;text-align:center;font-size:.85rem}.firma div{border-top:1px solid #111827;width:280px;margin:0 auto;padding-top:.3rem}
    button{font-family:Arial,sans-serif;margin-bottom:1rem;padding:.5rem 1rem;background:#1A7A82;color:#fff;border:0;border-radius:6px;cursor:pointer}
    @media print{button{display:none}body{margin:0 auto}}
  </style></head><body>
  <button onclick="window.print()">Imprimir o guardar como PDF</button>
  <div class="k">Dirección de Tránsito y Vialidad · ${e(data.municipio)}${data.estado ? ', ' + e(data.estado) : ''}</div>
  <h1>Constancia de no adeudo de infracciones de tránsito</h1>
  <p>Folio <span class="folio">${e(data.folio)}</span></p>
  <p>Se hace constar que, a la fecha de expedición, el vehículo con placa</p>
  <p style="text-align:center"><span class="placa">${e(String(data.placa).toUpperCase())}</span></p>
  <p>no tiene infracciones de tránsito pendientes de pago, vencidas ni en proceso de impugnación registradas en el sistema de la Dirección de Tránsito y Vialidad${data.municipio ? ' del municipio de ' + e(data.municipio) : ''}.</p>
  <p>Expedida el ${e(f(data.emitida))}. Vigente hasta el ${e(f(data.vigente_hasta + 'T12:00:00'))}.</p>
  ${derechos}
  <div class="firma"><div>${e(data.director || 'Director de Tránsito')}<br>Director de Tránsito y Vialidad</div></div>
  <div class="qr">${qr ? `<img src="${qr}" width="120" height="120" alt="Código QR de verificación">` : ''}<div>Escanee el código o entre a <strong>${e(url)}</strong> para comprobar que la constancia es auténtica y ver si la placa sigue sin adeudos.</div></div>
  </body></html>`;
}

// Abre la constancia en una ventana nueva. win: ventana abierta en el clic
// (los navegadores bloquean window.open después de un await).
function abrirConstancia(data, win) {
  win = win || window.open('', '_blank', 'width=820,height=900');
  if (!win) return false;
  win.document.write(htmlConstancia(data)); win.document.close();
  return true;
}
