// ── Ticket 80mm (print functions) ────────────────────────
function buildTicket80(r, cfg, qrDataUrl) {
  const mun = esc(cfg?.municipio || 'Municipio');
  const est = esc(cfg?.estado || '');
  const fechaObj = new Date(r.fecha);
  const fechaStr = fechaObj.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
  const horaStr  = fechaObj.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const { tramos, limFecha } = plazosPago(r, cfg, {day:'2-digit',month:'2-digit',year:'numeric'});
  const montoFmt  = Number(r.monto).toLocaleString('es-MX');
  const ref = (r.folio||'INF').replace(/[^A-Z0-9]/g,'') + String(r.id||0).padStart(6,'0');

  return `<div class="t80">
    <div class="t-center t-bold" style="font-size:7.5pt;letter-spacing:.5px">${mun.toUpperCase()}</div>
    ${est?`<div class="t-center" style="font-size:6.5pt">${est.toUpperCase()}</div>`:''}
    <div class="t-center" style="font-size:7pt">DIRECCIÓN DE TRÁNSITO Y MOVILIDAD</div>
    <div class="t-div"></div>
    <div class="t-invert">INFRACCIÓN DE TRÁNSITO</div>
    <div style="margin:1.5mm 0"></div>
    <div class="t-center t-xl">${esc(r.folio||'—')}</div>
    <div class="t-div"></div>
    <div class="t-row"><span>FECHA:</span><span>${fechaStr}</span></div>
    <div class="t-row"><span>HORA:</span><span>${horaStr}</span></div>
    <div class="t-div"></div>
    <div class="t-bold" style="font-size:7.5pt">INFRACTOR:</div>
    <div>${esc(r.infractor)}</div>
    <div class="t-row t-small"><span>LIC:</span><span>${esc(r.licencia||'N/A')}${r.licencia_tipo ? ' ' + esc(r.licencia_tipo) : ''}</span></div>
    <div class="t-small" style="word-break:break-word">${htmlDatosInfractor(r)}</div>
    <div style="margin:.5mm 0"></div>
    <div class="t-bold" style="font-size:7.5pt">VEHÍCULO:</div>
    <div class="t-row"><span>PLACA:</span><span class="t-bold">${esc(r.placa)}</span></div>
    ${r.color_vehiculo?`<div class="t-row t-small"><span>COLOR:</span><span>${esc(r.color_vehiculo)}</span></div>`:''}
    ${r.vehiculo?`<div class="t-small" style="word-break:break-word">${esc(r.vehiculo)}</div>`:''}
    <div class="t-div"></div>
    <div class="t-bold" style="font-size:7.5pt">INFRACCIÓN:</div>
    <div>${esc(r.tipo)}</div>
    ${r.fundamento ? `<div class="t-small" style="margin-top:.5mm">Fundamento: ${esc(r.fundamento)}</div>` : ''}
    ${r.ubicacion?`<div class="t-small" style="margin-top:.5mm">Lugar: ${esc(r.ubicacion)}</div>`:''}
    <div class="t-small" style="margin-top:.5mm">Circunstancias (art. 331): ${htmlCircunstancias(r)}</div>
    ${(r._lista||[]).length > 1 ? `<div class="t-div"></div>
    <div class="t-bold" style="font-size:7pt">INFRACCIONES DE ESTA BOLETA (ART. 327):</div>
    ${r._lista.map((x, i) => `<div class="t-row t-small"><span>${esc(x.folio||'—')}${i===0?' (mayor cuantía)':''}</span><span>$${Number(x.monto).toLocaleString('es-MX')}</span></div>`).join('')}` : ''}
    <div class="t-solid"></div>
    <div class="t-center t-bold" style="font-size:7.5pt">MONTO A PAGAR</div>
    <div class="t-amount">
      <div class="t-xl">$${montoFmt}</div>
      <div class="t-small">MXN</div>
    </div>
    ${r._grave ? `<div class="t-disc">
      <div class="t-bold">SIN DESCUENTO</div>
      <div>Se paga íntegra conforme al Reglamento</div>
    </div>` : tramos.map(x => `<div class="t-disc">
      <div class="t-bold">▼ ${x.pct}% descuento pagando a más tardar el</div>
      <div>${x.hasta} — solo $${x.monto} MXN</div>
    </div>`).join('')}
    <div class="t-disc" style="border-color:#DC2626;color:#DC2626">
      <div class="t-bold">⚠ Fecha límite de pago: ${limFecha}</div>
    </div>
    <div class="t-div"></div>
    <div class="t-center t-small">Pague en Tesorería Municipal</div>
    <div class="t-center t-small">Lunes a Viernes 8:00–15:00 hrs</div>
    <div class="t-center t-small" style="margin-top:.5mm">Referencia de pago:</div>
    <div class="t-barref">${ref}</div>
    ${qrDataUrl?`<div style="text-align:center;margin:2mm 0 1mm"><img src="${qrDataUrl}" style="width:130px;height:130px;display:block;margin:0 auto"/><div style="font-size:6.5pt;margin-top:.5mm;color:#444">Escanea para verificar o pagar</div></div>`:''}
    <div class="t-div"></div>
    ${r.documento_retenido ? `<div class="t-bold" style="font-size:7pt">DOCUMENTO RETENIDO (ARTS. 343-344):</div>
    <div class="t-small">${esc(DOC_RETENIDO[r.documento_retenido] || '')}${r.documento_numero ? ' ' + esc(r.documento_numero) : ''}. Se devuelve en ${esc(cfg?.resguardo_lugar || 'la Delegación')} al pagar.</div>
    <div class="t-div"></div>` : ''}
    <div class="t-bold" style="font-size:7pt">FIRMA DEL OFICIAL:</div>
    ${r.firma_oficial ? imgFirma(r.firma_oficial, 12) : '<div class="t-sig"></div>'}
    <div class="t-small">${esc(r.oficial||'Agente de Tránsito')}${r.oficial_placa ? ' · Placa ' + esc(r.oficial_placa) : ''}</div>
    ${r.oficial_adscripcion ? `<div class="t-small">${esc(r.oficial_adscripcion)}</div>` : ''}
    <div style="margin:.5mm 0"></div>
    <div class="t-bold" style="font-size:7pt">FIRMA / HUELLA DEL INFRACTOR:</div>
    ${r.firma_infractor ? imgFirma(r.firma_infractor, 12) : (r.firma_negada ? '<div class="t-small">Se negó a firmar</div>' : '<div class="t-sig"></div>')}
    <div class="t-div"></div>
    <div class="t-small" style="text-align:justify">${esc(cfg?.leyenda_recurso || 'Contra esta boleta procede el recurso de revocación.')}</div>
    <div class="t-center t-small" style="margin-top:1mm">Sistema Tránsito Municipal · HCE</div>
  </div>`;
}

// ── Impresión en campo (impresora térmica) ───────────────
// Cada teléfono elige cómo imprime el ticket (se guarda en el dispositivo):
//   navegador → el diálogo de impresión (impresoras de oficina, PDF)
//   bluetooth → ESC/POS directo a una impresora térmica BLE (Chrome en Android)
//   rawbt     → ESC/POS a la app RawBT (Android), para impresoras Bluetooth clásicas
// Si el modo elegido falla, se imprime con el navegador.
const IMPRESORA_KEY = 'tm_impresora';
function prefImpresora() {
  try { return { modo: 'navegador', ancho: 48, ...JSON.parse(localStorage.getItem(IMPRESORA_KEY) || '{}') }; }
  catch (_) { return { modo: 'navegador', ancho: 48 }; }
}
function guardarPrefImpresora(p) { try { localStorage.setItem(IMPRESORA_KEY, JSON.stringify(p)); } catch (_) {} }

// Las térmicas baratas no comparten página de códigos: el ticket va en ASCII
function asciiTicket(t) {
  return String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[ñÑ]/g, m => m === 'ñ' ? 'n' : 'N').replace(/[¿¡]/g, '').replace(/[—–]/g, '-').replace(/[·•]/g, '-')
    .replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/°/g, 'o').replace(/[^\x20-\x7E\n]/g, '?');
}
function envolverTexto(t, ancho) {
  const out = [];
  asciiTicket(t).split('\n').forEach(par => {
    let linea = '';
    par.split(/\s+/).filter(Boolean).forEach(w => {
      while (w.length > ancho) { if (linea) { out.push(linea); linea = ''; } out.push(w.slice(0, ancho)); w = w.slice(ancho); }
      if (!linea) linea = w; else if ((linea + ' ' + w).length <= ancho) linea += ' ' + w; else { out.push(linea); linea = w; }
    });
    out.push(linea);
  });
  return out;
}

// Ticket ESC/POS de la boleta (mismos datos que el ticket impreso por el navegador)
function escposTicket(r, cfg, ancho = 48) {
  const b = [], txt = s => { for (const ch of asciiTicket(s)) b.push(ch.charCodeAt(0)); };
  const cmd = (...xs) => b.push(...xs), ln = (s = '') => { txt(s); cmd(0x0A); };
  const centro = () => cmd(0x1B, 0x61, 1), izq = () => cmd(0x1B, 0x61, 0);
  const negrita = on => cmd(0x1B, 0x45, on ? 1 : 0), grande = on => cmd(0x1D, 0x21, on ? 0x11 : 0);
  const raya = (c = '-') => ln(c.repeat(ancho));
  const par = (k, v) => {   // etiqueta a la izquierda, valor a la derecha; si no cabe, en dos renglones
    const a = asciiTicket(k), z = asciiTicket(v);
    if (a.length + z.length + 1 <= ancho) ln(a + ' '.repeat(ancho - a.length - z.length) + z);
    else { ln(a); envolverTexto(z, ancho).forEach(l => ln(' '.repeat(Math.max(0, ancho - l.length)) + l)); }
  };
  const parrafo = t => envolverTexto(t, ancho).forEach(l => ln(l));
  const fecha = new Date(r.fecha);
  const fmtF = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const { tramos, limFecha } = plazosPago(r, cfg, fmtF);
  cmd(0x1B, 0x40);
  centro(); negrita(true); parrafo((cfg?.municipio || 'Municipio').toUpperCase()); negrita(false);
  if (cfg?.estado) parrafo(cfg.estado.toUpperCase());
  parrafo('DIRECCION DE TRANSITO Y SEGURIDAD VIAL'); raya('=');
  negrita(true); ln('BOLETA DE INFRACCION'); grande(true); ln(r.folio || '-'); grande(false); negrita(false);
  izq(); raya();
  par('FECHA:', fecha.toLocaleDateString('es-MX', fmtF)); par('HORA:', fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
  if (r.ubicacion) parrafo('LUGAR: ' + r.ubicacion);
  raya(); negrita(true); ln('VEHICULO'); negrita(false);
  par('PLACA:', r.placa || '-'); if (r.vehiculo) parrafo(r.vehiculo + (r.color_vehiculo ? ' - ' + r.color_vehiculo : ''));
  raya(); negrita(true); ln('INFRACTOR'); negrita(false);
  parrafo(r.infractor || '-');
  parrafo(r.infractor_ausente && !r.infractor_domicilio ? 'No presente o no proporciono domicilio (art. 327)' : 'Dom.: ' + (r.infractor_domicilio || 'no proporcionado'));
  par('LIC:', (r.licencia || 'N/A') + (r.licencia_tipo ? ' ' + r.licencia_tipo : ''));
  raya(); negrita(true); ln('INFRACCION'); negrita(false);
  parrafo(r.tipo || '-');
  if (r.fundamento) parrafo('Fundamento: ' + r.fundamento);
  const circ = (r.circunstancias || []).map(c => textoCircunstancia(c));
  parrafo('Circunstancias (art. 331): ' + (circ.length ? circ.join('; ') : 'ninguna; UMA base del tabulador'));
  if ((r._lista || []).length > 1) {
    raya(); negrita(true); ln('INFRACCIONES DE ESTA BOLETA'); negrita(false);
    r._lista.forEach((x, i) => par((x.folio || '-') + (i === 0 ? ' (mayor)' : ''), '$' + Number(x.monto).toLocaleString('es-MX')));
  }
  raya('='); centro(); ln('MONTO A PAGAR'); grande(true); negrita(true); ln('$' + Number(r.monto).toLocaleString('es-MX') + ' MXN'); grande(false); negrita(false); izq();
  if (r._grave) parrafo('SIN DESCUENTO: se paga integra conforme al Reglamento.');
  else tramos.forEach(x => parrafo(`${x.pct}% de descuento pagando a mas tardar el ${x.hasta}: $${x.monto} MXN`));
  parrafo('Fecha limite de pago: ' + limFecha);
  if (r.documento_retenido) { raya(); parrafo('DOCUMENTO RETENIDO (arts. 343-344): ' + (DOC_RETENIDO[r.documento_retenido] || '') + (r.documento_numero ? ' ' + r.documento_numero : '') + '. Se devuelve en ' + (cfg?.resguardo_lugar || 'la Delegacion') + ' al pagar.'); }
  raya();
  parrafo('Policia vial: ' + (r.oficial || '-') + (r.oficial_placa ? ' - Placa ' + r.oficial_placa : '') + (r.oficial_adscripcion ? ' - ' + r.oficial_adscripcion : ''));
  parrafo('Firma del oficial: ' + (r.firma_oficial ? 'capturada en el dispositivo' : '______________________'));
  parrafo('Firma del infractor: ' + (r.firma_infractor ? 'capturada en el dispositivo' : r.firma_negada ? 'se nego a firmar' : '____________________'));
  raya(); parrafo(cfg?.leyenda_recurso || 'Contra esta boleta procede el recurso de revocacion.');
  const url = asciiTicket(urlVerificacion(r.token_verificacion));
  if (url) {
    centro(); ln('Verifique su boleta:');
    const datos = [...url].map(c => c.charCodeAt(0)), n = datos.length + 3;
    cmd(0x1D, 0x28, 0x6B, 4, 0, 0x31, 0x41, 0x32, 0);          // QR modelo 2
    cmd(0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x43, ancho >= 48 ? 6 : 5); // tamaño de módulo
    cmd(0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x45, 0x31);              // corrección M
    cmd(0x1D, 0x28, 0x6B, n & 0xFF, n >> 8, 0x31, 0x50, 0x30, ...datos);
    cmd(0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x51, 0x30);              // imprimir
    ln(); izq();
  }
  cmd(0x1B, 0x64, 3, 0x1D, 0x56, 0x42, 0);                       // avanzar y cortar
  return new Uint8Array(b);
}

// ── Impresora Bluetooth (BLE) ──
const BT_SERVICIOS = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000ff00-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb'];
let _btDev = null, _btChar = null;
async function abrirCaracteristicaBT(dev) {
  const gatt = dev.gatt.connected ? dev.gatt : await dev.gatt.connect();
  for (const uuid of BT_SERVICIOS) {
    let serv; try { serv = await gatt.getPrimaryService(uuid); } catch (_) { continue; }
    const c = (await serv.getCharacteristics()).find(x => x.properties.writeWithoutResponse || x.properties.write);
    if (c) { _btDev = dev; _btChar = c; return c; }
  }
  throw new Error('La impresora no ofrece un canal de escritura conocido');
}
async function conectarImpresoraBT() {
  if (!navigator.bluetooth) throw new Error('Este navegador no permite Bluetooth. Usa Chrome en Android o el modo RawBT');
  const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICIOS });
  await abrirCaracteristicaBT(dev);
  guardarPrefImpresora({ ...prefImpresora(), modo: 'bluetooth', nombre: dev.name || 'Impresora' });
  return dev.name || 'Impresora';
}
async function enviarBT(bytes) {
  if (!_btChar || !_btDev?.gatt.connected) {
    // Reconectar sin pedir permiso de nuevo (Chrome recuerda las impresoras autorizadas)
    const conocidas = navigator.bluetooth?.getDevices ? await navigator.bluetooth.getDevices() : [];
    const dev = _btDev || conocidas.find(d => d.name === prefImpresora().nombre) || conocidas[0];
    if (!dev) throw new Error('Conecta la impresora en "Impresora del ticket"');
    await abrirCaracteristicaBT(dev);
  }
  for (let i = 0; i < bytes.length; i += 180) {
    const trozo = bytes.slice(i, i + 180);
    if (_btChar.properties.writeWithoutResponse && _btChar.writeValueWithoutResponse) await _btChar.writeValueWithoutResponse(trozo);
    else await _btChar.writeValue(trozo);
    await new Promise(res => setTimeout(res, 20));
  }
}
function enviarRawBT(bytes) {
  let bin = ''; bytes.forEach(x => { bin += String.fromCharCode(x); });
  window.location.href = 'intent:base64,' + btoa(bin) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
}
// Devuelve true si se imprimió por la impresora térmica; false = usar el navegador
async function imprimirTermica(bytes) {
  const { modo } = prefImpresora();
  if (modo === 'navegador') return false;
  try {
    if (modo === 'bluetooth') await enviarBT(bytes); else enviarRawBT(bytes);
    return true;
  } catch (err) {
    console.warn('impresora:', err);
    showToast('No se pudo imprimir en la impresora (' + err.message + '). Se abre la impresión del navegador.');
    return false;
  }
}

function abrirImpresora() {
  const p = prefImpresora();
  $('imp-modo').value = p.modo; $('imp-ancho').value = String(p.ancho);
  $('imp-estado').textContent = p.modo === 'bluetooth' ? (p.nombre ? `Impresora: ${p.nombre}${_btChar ? ' (conectada)' : ''}` : 'Sin impresora conectada') : '';
  $('imp-bt-wrap').style.display = p.modo === 'bluetooth' ? '' : 'none';
  openModal('modal-impresora');
}
function cambiarModoImpresora() {
  guardarPrefImpresora({ ...prefImpresora(), modo: $('imp-modo').value, ancho: parseInt($('imp-ancho').value) || 48 });
  $('imp-bt-wrap').style.display = $('imp-modo').value === 'bluetooth' ? '' : 'none';
}
async function botonConectarBT() {
  try { const n = await conectarImpresoraBT(); $('imp-estado').textContent = `Impresora: ${n} (conectada)`; showToast('Impresora conectada'); }
  catch (err) { $('imp-estado').textContent = err.message; }
}
async function imprimirPrueba() {
  const cfg = _cachedConfig || {};
  const r = { folio: 'PRUEBA', fecha: new Date().toISOString(), placa: 'ABC-123', infractor: 'Ticket de prueba', tipo: 'Prueba de impresión',
    monto: 0, circunstancias: [], token_verificacion: '00000000-0000-4000-8000-000000000000' };
  const ok = await imprimirTermica(escposTicket(r, cfg, prefImpresora().ancho));
  if (!ok) showToast('El modo "navegador" imprime con el botón Ticket 80mm');
}

async function printTicket80(id) {
  if (!id) return;
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('infracciones').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id', 1).single()
  ]);
  if (!r) return;

  let qrDataUrl = '';
  try {
    qrDataUrl = qrVerificacion(r.token_verificacion, 260);
  } catch(e) { console.warn('QR gen error:', e); }

  await cargarCatalogo();
  r._grave = !!catalogoPorNumero(r.catalogo_numero)?.grave;
  r._lista = await infraccionesDeBoleta(r);
  if (await imprimirTermica(escposTicket(r, cfg, prefImpresora().ancho))) return;
  const ticketHTML = buildTicket80(r, cfg, qrDataUrl);

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Ticket ${esc(r.folio||'')}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#fff;display:flex;flex-direction:column;align-items:center;padding:4mm;font-family:'Courier New',Courier,monospace}
    .no-print{text-align:center;margin-bottom:4mm}
    .no-print button{padding:6px 16px;background:#1A7A82;color:#fff;border:none;border-radius:5px;font-size:12px;cursor:pointer;margin:0 3px}
    .no-print button:hover{background:#229099}
    .t80{width:72mm;min-width:72mm;background:#fff;font-family:'Courier New',Courier,monospace;font-size:8.5pt;line-height:1.45;color:#000;padding:4mm 3mm}
    .t80 .t-center{text-align:center}
    .t80 .t-bold{font-weight:700}
    .t80 .t-xl{font-size:18pt;font-weight:900;letter-spacing:-1px;text-align:center;display:block}
    .t80 .t-small{font-size:7pt}
    .t80 .t-div{border-top:1px dashed #555;margin:1.5mm 0}
    .t80 .t-solid{border-top:2px solid #000;margin:1.5mm 0}
    .t80 .t-row{display:flex;justify-content:space-between}
    .t80 .t-invert{background:#000;color:#fff;text-align:center;font-weight:700;font-size:9pt;padding:1.5mm 0;margin:1.5mm -3mm;letter-spacing:1px}
    .t80 .t-amount{border:2px solid #000;text-align:center;padding:2mm;margin:1.5mm 0}
    .t80 .t-disc{border:1px solid #555;text-align:center;padding:1.5mm;margin:1mm 0;font-size:8pt}
    .t80 .t-barref{font-family:'Courier New',monospace;font-size:7pt;letter-spacing:4px;word-break:break-all;text-align:center;margin:1mm 0;color:#333}
    .t80 .t-sig{border-bottom:1px solid #000;height:8mm;margin-bottom:1mm}
    @media print{
      body{padding:0;background:#fff}
      .no-print{display:none!important}
      @page{margin:2mm;size:80mm auto}
    }
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()">Imprimir ticket</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  ${ticketHTML}
  <script>setTimeout(()=>window.print(),500)<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=340,height=750');
  if (win) { win.document.write(html); win.document.close(); }
}

