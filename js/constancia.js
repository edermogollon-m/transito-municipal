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

// Orden de pago para pagar la constancia en Caja (constancias_orden.sql).
// o: { token, placa, monto, vence }. El QR lleva a /verificar?c=<token>: Caja lo
// escanea para cobrar y, ya pagada, ahí mismo aparece la constancia.
function urlOrdenConstancia(token, base = location.origin) { return `${base}/verificar?c=${token}`; }
function htmlOrdenConstancia(o, base = location.origin) {
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const url = urlOrdenConstancia(o.token, base);
  let qr = '';
  try { qr = new QRious({ value: url, size: 300, padding: 8 }).toDataURL(); } catch (_) {}
  const f = d => new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const monto = Number(o.monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Orden de pago · constancia ${e(o.placa)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:420px;margin:1.5rem auto;padding:0 1rem;text-align:center}
    .k{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:#4B5563}
    h1{font-size:1.2rem;margin:.3rem 0 1rem}
    .monto{font-size:2.2rem;font-weight:700;letter-spacing:-.02em}
    .placa{display:inline-block;font-family:'Courier New',monospace;font-size:1.3rem;font-weight:700;border:2px solid #111827;border-radius:6px;padding:.05rem .6rem;letter-spacing:.06em;margin:.4rem 0}
    .vence{font-size:.9rem;margin:.6rem 0 1rem}
    ol{text-align:left;font-size:.82rem;line-height:1.6;color:#374151;padding-left:1.2rem}
    .corte{border-top:2px dashed #9CA3AF;margin:1rem 0}
    button{margin-bottom:1rem;padding:.5rem 1rem;background:#1A7A82;color:#fff;border:0;border-radius:6px;cursor:pointer;font-weight:700}
    @media print{button{display:none}body{margin:0 auto}}
  </style></head><body>
  <button onclick="window.print()">Imprimir o guardar como PDF</button>
  <div class="k">Dirección de Tránsito y Vialidad</div>
  <h1>Orden de pago · Constancia de no adeudo</h1>
  <div class="placa">${e(String(o.placa).toUpperCase())}</div>
  <div class="monto">${e(monto)}</div>
  <div class="vence">Paga en la Caja antes del <b>${e(f(o.vence))}</b></div>
  ${qr ? `<img src="${qr}" width="220" height="220" alt="Código QR de la orden de pago">` : ''}
  <div class="corte"></div>
  <ol>
    <li>Presenta este código en la Caja de la Dirección de Tránsito, en tu celular o impreso.</li>
    <li>Paga en efectivo, con tarjeta o por transferencia.</li>
    <li>Te entregan tu constancia impresa. También puedes escanear este mismo código para descargarla: vale 30 días.</li>
  </ol>
  <p style="font-size:.72rem;color:#6B7280;word-break:break-all">${e(url)}</p>
  </body></html>`;
}
