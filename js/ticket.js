// ── Ticket 80mm (print functions) ────────────────────────
// Pensado para térmica en blanco y negro: solo negro sólido, bordes y texto,
// sin grises ni colores (la térmica los imprime como puntos sueltos).
function buildTicket80(r, cfg, qrDataUrl) {
  const mun = esc(cfg?.municipio || 'Municipio');
  const est = esc(cfg?.estado || '');
  const inst = esc(cfg?.institucion || '');
  const fechaObj = new Date(r.fecha);
  const fechaStr = fechaObj.toLocaleDateString('es-MX',{day:'2-digit',month:'2-digit',year:'numeric'});
  const horaStr  = fechaObj.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const { tramos, limFecha } = plazosPago(r, cfg, {day:'2-digit',month:'2-digit',year:'numeric'});
  const montoFmt  = Number(r.monto).toLocaleString('es-MX');
  const ref = (r.folio||'INF').replace(/[^A-Z0-9]/g,'') + String(r.id||0).padStart(6,'0');
  const sec = t => `<div class="t-sec"><b>${t}</b></div>`;
  const lista = r._lista || [];

  return `<div class="t80">
    <div class="t-head">
      <!--ESCUDO:14mm:gris-->
      ${inst ? `<div class="t-inst">${inst}</div>` : ''}
      <div class="t-mun">${mun.toUpperCase()}</div>
      ${est ? `<div class="t-est">${est.toUpperCase()}</div>` : ''}
      <div class="t-dir">Dirección de Tránsito y Movilidad</div>
    </div>
    <div class="t-band">BOLETA DE INFRACCIÓN</div>
    <div class="t-folio"><span>FOLIO</span><b>${esc(r.folio||'—')}</b></div>
    <div class="t-grid">
      <div><span>FECHA</span><b>${fechaStr}</b></div>
      <div><span>HORA</span><b>${horaStr}</b></div>
    </div>
    ${r.ubicacion ? `<div class="t-lugar"><span>LUGAR</span> ${esc(r.ubicacion)}</div>` : ''}

    ${sec('VEHÍCULO')}
    <div class="t-placa"><span>${est ? est.toUpperCase() : 'MÉXICO'}</span><b>${esc(r.placa||'—')}</b></div>
    ${r.vehiculo || r.color_vehiculo ? `<div class="t-center t-small">${esc(r.vehiculo||'')}${r.vehiculo && r.color_vehiculo ? ' · ' : ''}${r.color_vehiculo ? 'Color ' + esc(r.color_vehiculo) : ''}</div>` : ''}

    ${sec('CONDUCTOR')}
    <div class="t-nombre">${esc(r.infractor||'—')}</div>
    <div class="t-kv"><span>Licencia</span><b>${esc(r.licencia||'N/A')}${r.licencia_tipo ? ' · ' + esc(r.licencia_tipo) : ''}</b></div>
    <div class="t-small t-wrap">${htmlDatosInfractor(r)}</div>

    ${sec('INFRACCIÓN')}
    <div class="t-tipo">${esc(r.tipo||'—')}</div>
    ${r.fundamento ? `<div class="t-small t-wrap">Fundamento: ${esc(r.fundamento)}</div>` : ''}
    <div class="t-small t-wrap">Circunstancias (art. 331): ${htmlCircunstancias(r)}</div>
    ${lista.length > 1 ? `<div class="t-lista">
      <div class="t-lista-t">INFRACCIONES DE ESTA BOLETA (ART. 327)</div>
      ${lista.map((x, i) => `<div class="t-kv"><span>${esc(x.folio||'—')}${i===0?' · mayor cuantía':''}</span><b>$${Number(x.monto).toLocaleString('es-MX')}</b></div>`).join('')}
    </div>` : ''}

    <div class="t-total">
      <span>TOTAL A PAGAR</span>
      <b>$${montoFmt}</b>
      <small>PESOS MEXICANOS</small>
    </div>
    ${r._grave ? `<div class="t-nodesc"><b>SIN DESCUENTO</b><span>Se paga íntegra conforme al Reglamento</span></div>`
      : tramos.length ? `<div class="t-desc">
      <div class="t-desc-t">PAGA ANTES Y AHORRA</div>
      ${tramos.map(x => `<div class="t-desc-r"><span class="t-pct">−${x.pct}%</span><span>hasta el ${x.hasta}</span><b>$${x.monto}</b></div>`).join('')}
    </div>` : ''}
    <div class="t-limite"><span>FECHA LÍMITE DE PAGO</span><b>${limFecha}</b></div>

    ${sec('CÓMO PAGAR')}
    <div class="t-pago">
      ${qrDataUrl ? `<img src="${qrDataUrl}" alt="QR"/>` : ''}
      <div>
        <div class="t-paso"><i>1</i>Escanea el código para ver tu boleta${cfg?.pago_en_linea ? ' y pagar en línea' : ''}.</div>
        <div class="t-paso"><i>2</i>O paga en la Tesorería Municipal, de lunes a viernes de 8:00 a 15:00 h.</div>
        <div class="t-ref"><span>REFERENCIA</span><b>${ref}</b></div>
      </div>
    </div>

    ${r.documento_retenido ? `<div class="t-retenido">
      <b>DOCUMENTO RETENIDO (ARTS. 343-344)</b>
      <div>${esc(DOC_RETENIDO[r.documento_retenido] || '')}${r.documento_numero ? ' ' + esc(r.documento_numero) : ''}</div>
      <div class="t-small">Se devuelve en ${esc(cfg?.resguardo_lugar || 'la Delegación')} al pagar.</div>
    </div>` : ''}

    ${sec('FIRMAS')}
    <div class="t-firmas">
      <div>
        ${r.firma_oficial ? imgFirma(r.firma_oficial, 11) : '<div class="t-sig"></div>'}
        <div class="t-fcap">POLICÍA VIAL</div>
        <div class="t-fnom">${esc(r.oficial||'Agente de Tránsito')}${r.oficial_placa ? '<br>Placa ' + esc(r.oficial_placa) : ''}</div>
      </div>
      <div>
        ${r.firma_infractor ? imgFirma(r.firma_infractor, 11) : (r.firma_negada ? '<div class="t-sig t-negada">Se negó a firmar</div>' : '<div class="t-sig"></div>')}
        <div class="t-fcap">INFRACTOR</div>
        <div class="t-fnom">Firma o huella</div>
      </div>
    </div>
    ${r.oficial_adscripcion ? `<div class="t-center t-small">${esc(r.oficial_adscripcion)}</div>` : ''}

    <div class="t-legal">${esc(cfg?.leyenda_recurso || 'Contra esta boleta procede el recurso de revocación.')}</div>
    <div class="t-legal">${esc(leyendaPrivacidad())}</div>
    <div class="t-corte">CONSERVE ESTE COMPROBANTE</div>
  </div>`;
}

// Estilos del ticket: negro sólido sobre blanco (print-color-adjust para que
// las franjas negras sí se impriman).
const CSS_TICKET80 = `
    .t80{width:72mm;min-width:72mm;background:#fff;color:#000;padding:3mm 2.5mm;font-family:Arial,Helvetica,sans-serif;font-size:8pt;line-height:1.35;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .t80 b{font-weight:700}
    .t80 .t-center{text-align:center}
    .t80 .t-small{font-size:6.8pt}
    .t80 .t-wrap{word-break:break-word;margin-top:.6mm}
    .t80 .t-head{text-align:center}
    .t80 .t-head img{display:block;margin:0 auto 1mm}
    .t80 .t-inst{font-size:7pt;font-weight:700}
    .t80 .t-mun{font-size:10pt;font-weight:900;letter-spacing:.6px}
    .t80 .t-est{font-size:7pt;letter-spacing:1.5px}
    .t80 .t-dir{font-size:7.5pt;margin-top:.3mm}
    .t80 .t-band{background:#000;color:#fff;text-align:center;font-weight:900;font-size:10pt;letter-spacing:1.5px;padding:1.6mm 0;margin:2mm 0 0}
    .t80 .t-folio{border:2px solid #000;border-top:none;text-align:center;padding:1mm 0 1.2mm;margin:0 0 1.5mm}
    .t80 .t-folio span,.t80 .t-grid span,.t80 .t-lugar span,.t80 .t-ref span,.t80 .t-total span,.t80 .t-limite span,.t80 .t-placa span{display:block;font-size:6pt;font-weight:700;letter-spacing:1.2px}
    .t80 .t-folio b{font-family:'Courier New',Courier,monospace;font-size:15pt;font-weight:900;letter-spacing:.5px}
    .t80 .t-grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #000}
    .t80 .t-grid div{padding:.8mm 1.5mm;text-align:center}
    .t80 .t-grid div+div{border-left:1px solid #000}
    .t80 .t-grid b{font-size:9pt}
    .t80 .t-lugar{font-size:7.5pt;margin-top:1mm;word-break:break-word}
    .t80 .t-lugar span{display:inline;font-size:6pt}
    .t80 .t-sec{display:flex;align-items:center;margin:2.6mm 0 1.2mm}
    .t80 .t-sec b{background:#000;color:#fff;font-size:7pt;letter-spacing:1px;padding:.4mm 1.8mm}
    .t80 .t-sec::after{content:"";flex:1;border-top:1.5px solid #000}
    .t80 .t-placa{width:46mm;margin:0 auto 1mm;border:2.5px solid #000;border-radius:2.5mm;text-align:center;padding:.6mm 0 1mm;position:relative}
    .t80 .t-placa::before{content:"";position:absolute;inset:.8mm;border:.5px solid #000;border-radius:1.6mm}
    .t80 .t-placa b{display:block;font-family:'Courier New',Courier,monospace;font-size:17pt;font-weight:900;letter-spacing:1.5px;line-height:1.1}
    .t80 .t-nombre{font-size:9pt;font-weight:700;word-break:break-word}
    .t80 .t-kv{display:flex;justify-content:space-between;gap:2mm;font-size:7.5pt}
    .t80 .t-kv b{text-align:right;word-break:break-word}
    .t80 .t-tipo{font-size:9pt;font-weight:700;word-break:break-word}
    .t80 .t-lista{border:1px dashed #000;padding:1mm 1.5mm;margin-top:1.2mm}
    .t80 .t-lista-t{font-size:6.5pt;font-weight:700;margin-bottom:.5mm}
    .t80 .t-total{border:3px double #000;text-align:center;padding:1.5mm 0 1.2mm;margin:3mm 0 1.5mm}
    .t80 .t-total b{display:block;font-size:24pt;font-weight:900;line-height:1.05;letter-spacing:-.5px}
    .t80 .t-total small{font-size:6pt;letter-spacing:1.2px}
    .t80 .t-desc{border:1px solid #000}
    .t80 .t-desc-t{text-align:center;font-size:6.5pt;font-weight:700;letter-spacing:1.2px;border-bottom:1px solid #000;padding:.5mm 0}
    .t80 .t-desc-r{display:flex;align-items:center;gap:1.5mm;padding:.8mm 1.5mm;font-size:7.5pt}
    .t80 .t-desc-r+.t-desc-r{border-top:1px dashed #000}
    .t80 .t-desc-r span:nth-child(2){flex:1}
    .t80 .t-desc-r b{font-size:10pt}
    .t80 .t-pct{border:1.5px solid #000;border-radius:1mm;font-weight:900;font-size:8pt;padding:0 1mm;min-width:11mm;text-align:center}
    .t80 .t-nodesc{border:2px solid #000;text-align:center;padding:1mm;font-size:7.5pt}
    .t80 .t-nodesc b{display:block;font-size:9pt;letter-spacing:1px}
    .t80 .t-limite{background:#000;color:#fff;text-align:center;padding:1mm 0 1.2mm;margin-top:1.5mm}
    .t80 .t-limite b{font-size:11pt;letter-spacing:.5px}
    .t80 .t-pago{display:flex;gap:2mm;align-items:center}
    .t80 .t-pago img{width:27mm;height:27mm;flex:none;image-rendering:pixelated}
    .t80 .t-paso{display:flex;gap:1.2mm;font-size:7pt;line-height:1.3;margin-bottom:1mm}
    .t80 .t-paso i{flex:none;width:3.6mm;height:3.6mm;border-radius:50%;background:#000;color:#fff;font-style:normal;font-weight:700;font-size:6.5pt;display:flex;align-items:center;justify-content:center}
    .t80 .t-ref{border-top:1px dashed #000;padding-top:.8mm}
    .t80 .t-ref b{font-family:'Courier New',Courier,monospace;font-size:8pt;word-break:break-all}
    .t80 .t-retenido{border:2px solid #000;padding:1.2mm 1.5mm;margin-top:2.5mm;font-size:7.5pt}
    .t80 .t-retenido b{display:block;font-size:7pt;letter-spacing:.5px}
    .t80 .t-firmas{display:grid;grid-template-columns:1fr 1fr;gap:3mm;text-align:center}
    .t80 .t-firmas img{height:11mm}
    .t80 .t-sig{height:11mm;border-bottom:1px solid #000}
    .t80 .t-negada{display:flex;align-items:flex-end;justify-content:center;font-size:7pt;font-style:italic;padding-bottom:.5mm}
    .t80 .t-firmas img+.t-fcap{border-top:1px solid #000}
    .t80 .t-fcap{font-size:6pt;font-weight:700;letter-spacing:1px;padding-top:.4mm}
    .t80 .t-fnom{font-size:6.5pt;line-height:1.25;word-break:break-word}
    .t80 .t-legal{font-size:6.2pt;line-height:1.3;margin-top:2mm;word-break:break-word}
    .t80 .t-corte{margin-top:3mm;border-top:1.5px dashed #000;padding-top:1mm;text-align:center;font-size:6pt;font-weight:700;letter-spacing:1.5px}
`;

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

// Ticket ESC/POS de la boleta (mismos datos y orden que el ticket del navegador).
// La térmica solo tiene texto: los títulos van en negativo (blanco sobre negro),
// el folio, la placa y el monto en letra doble.
function escposTicket(r, cfg, ancho = 48) {
  const b = [], txt = s => { for (const ch of asciiTicket(s)) b.push(ch.charCodeAt(0)); };
  const cmd = (...xs) => b.push(...xs), ln = (s = '') => { txt(s); cmd(0x0A); };
  const centro = () => cmd(0x1B, 0x61, 1), izq = () => cmd(0x1B, 0x61, 0);
  const negrita = on => cmd(0x1B, 0x45, on ? 1 : 0), grande = on => cmd(0x1D, 0x21, on ? 0x11 : 0);
  const alto = on => cmd(0x1D, 0x21, on ? 0x01 : 0), negativo = on => cmd(0x1D, 0x42, on ? 1 : 0);
  const raya = (c = '-') => ln(c.repeat(ancho));
  const par = (k, v) => {   // etiqueta a la izquierda, valor a la derecha; si no cabe, en dos renglones
    const a = asciiTicket(k), z = asciiTicket(v);
    if (a.length + z.length + 1 <= ancho) ln(a + ' '.repeat(ancho - a.length - z.length) + z);
    else { ln(a); envolverTexto(z, ancho).forEach(l => ln(' '.repeat(Math.max(0, ancho - l.length)) + l)); }
  };
  const parrafo = t => envolverTexto(t, ancho).forEach(l => ln(l));
  const franja = t => {     // renglón completo en negativo, texto al centro
    const x = asciiTicket(t).slice(0, ancho), izqE = Math.floor((ancho - x.length) / 2);
    negrita(true); negativo(true); txt(' '.repeat(izqE) + x + ' '.repeat(ancho - x.length - izqE)); negativo(false); negrita(false); cmd(0x0A);
  };
  const seccion = t => {    // " VEHICULO " en negativo y una raya hasta el borde
    const x = ' ' + asciiTicket(t) + ' ';
    ln(); negrita(true); negativo(true); txt(x); negativo(false); txt(' ' + '-'.repeat(Math.max(0, ancho - x.length - 1))); negrita(false); cmd(0x0A);
  };
  const fecha = new Date(r.fecha);
  const fmtF = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const { tramos, limFecha } = plazosPago(r, cfg, fmtF);
  cmd(0x1B, 0x40);
  centro();
  if (cfg?.institucion) parrafo(cfg.institucion);
  negrita(true); alto(true); parrafo((cfg?.municipio || 'Municipio').toUpperCase()); alto(false); negrita(false);
  if (cfg?.estado) parrafo(cfg.estado.toUpperCase());
  parrafo('Direccion de Transito y Movilidad'); ln();
  franja('BOLETA DE INFRACCION');
  ln('FOLIO'); negrita(true); grande(true); ln(r.folio || '-'); grande(false); negrita(false);
  izq(); raya('=');
  par('FECHA: ' + fecha.toLocaleDateString('es-MX', fmtF), 'HORA: ' + fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
  if (r.ubicacion) parrafo('LUGAR: ' + r.ubicacion);

  seccion('VEHICULO');
  const placa = asciiTicket(r.placa || '-'), caja = placa.length * 2 + 6;   // la letra doble ocupa dos columnas
  centro();
  if (caja <= ancho) {
    ln('+' + '-'.repeat(caja - 2) + '+');
    txt('|  '); negrita(true); grande(true); txt(placa); grande(false); negrita(false); txt('  |'); cmd(0x0A);
    ln('+' + '-'.repeat(caja - 2) + '+');
  } else { negrita(true); grande(true); ln(placa); grande(false); negrita(false); }
  if (r.vehiculo || r.color_vehiculo) parrafo([r.vehiculo, r.color_vehiculo && 'Color ' + r.color_vehiculo].filter(Boolean).join(' - '));
  izq();

  seccion('CONDUCTOR');
  negrita(true); parrafo(r.infractor || '-'); negrita(false);
  par('Licencia', (r.licencia || 'N/A') + (r.licencia_tipo ? ' ' + r.licencia_tipo : ''));
  parrafo(r.infractor_ausente && !r.infractor_domicilio ? 'No presente o no proporciono domicilio (art. 327)' : 'Dom.: ' + (r.infractor_domicilio || 'no proporcionado'));

  seccion('INFRACCION');
  negrita(true); parrafo(r.tipo || '-'); negrita(false);
  if (r.fundamento) parrafo('Fundamento: ' + r.fundamento);
  const circ = (r.circunstancias || []).map(c => textoCircunstancia(c));
  parrafo('Circunstancias (art. 331): ' + (circ.length ? circ.join('; ') : 'ninguna; UMA base del tabulador'));
  if ((r._lista || []).length > 1) {
    ln(); ln('INFRACCIONES DE ESTA BOLETA:');
    r._lista.forEach((x, i) => par((x.folio || '-') + (i === 0 ? ' (mayor)' : ''), '$' + Number(x.monto).toLocaleString('es-MX')));
  }

  ln(); raya('='); centro(); ln('TOTAL A PAGAR');
  grande(true); negrita(true); ln('$' + Number(r.monto).toLocaleString('es-MX')); grande(false); negrita(false);
  ln('PESOS MEXICANOS'); izq(); raya('=');
  if (r._grave) { centro(); negrita(true); ln('SIN DESCUENTO'); negrita(false); parrafo('Se paga integra conforme al Reglamento.'); izq(); }
  else if (tramos.length) {
    centro(); ln('PAGA ANTES Y AHORRA'); izq();
    tramos.forEach(x => par(`-${x.pct}%  hasta el ${x.hasta}`, `$${x.monto}`));
  }
  ln(); franja('FECHA LIMITE DE PAGO: ' + limFecha);

  seccion('COMO PAGAR');
  parrafo('1. Escanee el codigo QR para ver su boleta' + (cfg?.pago_en_linea ? ' y pagar en linea.' : '.'));
  parrafo('2. O pague en la Tesoreria Municipal, de lunes a viernes de 8:00 a 15:00 h.');
  const url = asciiTicket(urlVerificacion(r.token_verificacion));
  if (url) { centro(); ln(); escposQR(cmd, url, ancho >= 48 ? 6 : 5); ln(); izq(); }

  if (r.documento_retenido) {
    seccion('DOCUMENTO RETENIDO');
    parrafo('DOCUMENTO RETENIDO (arts. 343-344): ' + (DOC_RETENIDO[r.documento_retenido] || '') + (r.documento_numero ? ' ' + r.documento_numero : '') + '. Se devuelve en ' + (cfg?.resguardo_lugar || 'la Delegacion') + ' al pagar.');
  }

  seccion('FIRMAS');
  parrafo('Policia vial: ' + (r.oficial || '-') + (r.oficial_placa ? ' - Placa ' + r.oficial_placa : '') + (r.oficial_adscripcion ? ' - ' + r.oficial_adscripcion : ''));
  if (r.firma_oficial) parrafo('Firma del oficial: capturada en el dispositivo'); else { ln(); ln(); ln('Firma del oficial: ' + '_'.repeat(Math.max(4, ancho - 19))); }
  if (r.firma_infractor) parrafo('Firma del infractor: capturada en el dispositivo');
  else if (r.firma_negada) parrafo('Firma del infractor: se nego a firmar');
  else { ln(); ln(); ln('Firma del infractor: ' + '_'.repeat(Math.max(4, ancho - 21))); }

  ln(); parrafo(cfg?.leyenda_recurso || 'Contra esta boleta procede el recurso de revocacion.');
  ln(); parrafo(leyendaPrivacidad());
  ln(); centro(); ln('- '.repeat(Math.floor(ancho / 2)).trimEnd()); ln('CONSERVE ESTE COMPROBANTE'); izq();
  cmd(0x1B, 0x64, 3, 0x1D, 0x56, 0x42, 0);                       // avanzar y cortar
  return new Uint8Array(b);
}

function escposQR(cmd, url, modulo) {
  const datos = [...url].map(c => c.charCodeAt(0)), n = datos.length + 3;
  cmd(0x1D, 0x28, 0x6B, 4, 0, 0x31, 0x41, 0x32, 0);          // QR modelo 2
  cmd(0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x43, modulo);           // tamaño de módulo
  cmd(0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x45, 0x31);             // corrección M
  cmd(0x1D, 0x28, 0x6B, n & 0xFF, n >> 8, 0x31, 0x50, 0x30, ...datos);
  cmd(0x1D, 0x28, 0x6B, 3, 0, 0x31, 0x51, 0x30);             // imprimir
}

// ── Boleta para el parabrisas (conductor ausente) ────────
// Aviso corto con un QR grande: el dueño lo escanea, ve la multa, por qué se
// la pusieron y la paga desde su celular. La boleta completa queda en el sistema.
const urlConsultaFolio = r => `${location.origin}/consulta?q=${encodeURIComponent(String(r.folio || r.placa || '').replace(/[^A-Za-z0-9]/g, ''))}`;

function buildParabrisas(r, cfg, qrDataUrl) {
  const f = new Date(r.fecha);
  const { tramos, limFecha } = plazosPago(r, cfg, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `<div class="t80 pb">
    <div class="t-center"><!--ESCUDO:12mm:gris--></div>
    <div class="t-center t-bold" style="font-size:7.5pt">${esc((cfg?.municipio || 'Municipio').toUpperCase())}</div>
    <div class="t-center" style="font-size:6.5pt">DIRECCIÓN DE TRÁNSITO Y MOVILIDAD</div>
    <div class="t-invert">AVISO DE INFRACCIÓN</div>
    <div class="t-center t-small">Su vehículo fue infraccionado en su ausencia</div>
    <div class="t-center pb-placa">${esc(r.placa)}</div>
    <div class="t-row"><span>FOLIO:</span><span class="t-bold">${esc(r.folio || '—')}</span></div>
    <div class="t-row"><span>FECHA:</span><span>${f.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span></div>
    ${r.ubicacion ? `<div class="t-small">LUGAR: ${esc(r.ubicacion)}</div>` : ''}
    <div class="t-div"></div>
    <div class="t-bold" style="font-size:7.5pt">MOTIVO:</div>
    <div>${esc(r.tipo)}</div>
    <div class="t-solid"></div>
    <div class="t-row t-bold"><span>MONTO:</span><span>$${Number(r.monto).toLocaleString('es-MX')} MXN</span></div>
    ${r._grave ? '<div class="t-small">Sin descuento por su gravedad.</div>' : tramos.map(x => `<div class="t-disc"><b>${x.pct}% de descuento</b> pagando a más tardar el ${x.hasta}: solo $${x.monto}</div>`).join('')}
    <div class="t-small t-center" style="margin-top:1mm">Fecha límite: ${limFecha}</div>
    ${qrDataUrl ? `<div class="pb-qr"><img src="${qrDataUrl}" alt=""/></div>` : ''}
    <div class="t-center t-bold" style="font-size:9pt">ESCANEE CON SU CELULAR</div>
    <div class="t-center t-small">Vea el detalle, por qué se le multó y pague en línea o en Tesorería.</div>
    <div class="t-center t-small" style="margin-top:1mm;word-break:break-all">${esc(urlConsultaFolio(r).replace(/^https?:\/\//, ''))}</div>
    <div class="t-div"></div>
    <div class="t-small">Policía vial: ${esc(r.oficial || '—')}${r.oficial_placa ? ' · Placa ' + esc(r.oficial_placa) : ''}</div>
  </div>`;
}

function escposParabrisas(r, cfg, ancho = 48) {
  const b = [], txt = s => { for (const ch of asciiTicket(s)) b.push(ch.charCodeAt(0)); };
  const cmd = (...xs) => b.push(...xs), ln = (s = '') => { txt(s); cmd(0x0A); };
  const centro = () => cmd(0x1B, 0x61, 1), izq = () => cmd(0x1B, 0x61, 0);
  const negrita = on => cmd(0x1B, 0x45, on ? 1 : 0), grande = on => cmd(0x1D, 0x21, on ? 0x11 : 0);
  const parrafo = t => envolverTexto(t, ancho).forEach(l => ln(l));
  const f = new Date(r.fecha), fmtF = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const { tramos, limFecha } = plazosPago(r, cfg, fmtF);
  cmd(0x1B, 0x40); centro();
  negrita(true); parrafo((cfg?.municipio || 'Municipio').toUpperCase()); negrita(false);
  parrafo('DIRECCION DE TRANSITO Y MOVILIDAD'); ln('='.repeat(ancho));
  negrita(true); ln('AVISO DE INFRACCION'); negrita(false);
  parrafo('Su vehiculo fue infraccionado en su ausencia');
  grande(true); negrita(true); ln(r.placa || '-'); grande(false); negrita(false);
  ln('Folio: ' + (r.folio || '-'));
  ln(f.toLocaleDateString('es-MX', fmtF) + ' ' + f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
  izq(); ln('-'.repeat(ancho));
  if (r.ubicacion) parrafo('Lugar: ' + r.ubicacion);
  parrafo('Motivo: ' + (r.tipo || '-'));
  negrita(true); parrafo('Monto: $' + Number(r.monto).toLocaleString('es-MX') + ' MXN'); negrita(false);
  if (r._grave) parrafo('Sin descuento por su gravedad.');
  else tramos.forEach(x => parrafo(`${x.pct}% de descuento pagando a mas tardar el ${x.hasta}: $${x.monto}`));
  parrafo('Fecha limite: ' + limFecha);
  centro(); ln(); escposQR(cmd, asciiTicket(urlConsultaFolio(r)), ancho >= 48 ? 8 : 6); ln();
  negrita(true); ln('ESCANEE CON SU CELULAR'); negrita(false);
  parrafo('Vea el detalle y pague en linea o en Tesoreria.');
  izq(); parrafo('Policia vial: ' + (r.oficial || '-') + (r.oficial_placa ? ' - Placa ' + r.oficial_placa : ''));
  cmd(0x1B, 0x64, 3, 0x1D, 0x56, 0x42, 0);
  return new Uint8Array(b);
}

async function printParabrisas(id) {
  if (!id) return;
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('infracciones').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id', 1).single()
  ]);
  if (!r) return;
  await cargarCatalogo();
  r._grave = !!catalogoPorNumero(r.catalogo_numero)?.grave;
  if (await imprimirTermica(escposParabrisas(r, cfg, prefImpresora().ancho))) return;
  let qr = '';
  try { qr = new QRious({ value: urlConsultaFolio(r), size: 360, padding: 6, backgroundAlpha: 1 }).toDataURL(); } catch (_) {}
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Parabrisas ${esc(r.folio || '')}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#fff;display:flex;flex-direction:column;align-items:center;padding:4mm;font-family:Arial,Helvetica,sans-serif}
    .no-print{text-align:center;margin-bottom:4mm}
    .no-print button{padding:6px 16px;background:#1A7A82;color:#fff;border:none;border-radius:5px;font-size:12px;cursor:pointer;margin:0 3px}
    .t80{width:72mm;background:#fff;font-size:8.5pt;line-height:1.45;color:#000;padding:4mm 3mm}
    .t-center{text-align:center}.t-bold{font-weight:700}.t-small{font-size:7pt}
    .t-div{border-top:1px dashed #555;margin:1.5mm 0}.t-solid{border-top:2px solid #000;margin:1.5mm 0}
    .t-row{display:flex;justify-content:space-between;gap:2mm}
    .t-invert{background:#000;color:#fff;text-align:center;font-weight:700;font-size:10pt;padding:1.5mm 0;margin:1.5mm -3mm;letter-spacing:1px}
    .t-disc{border:1px solid #555;text-align:center;padding:1mm;margin:1mm 0;font-size:7.5pt}
    .pb-placa{font-size:20pt;font-weight:900;letter-spacing:2px;border:2px solid #000;border-radius:2mm;margin:2mm 6mm;padding:1mm 0}
    .pb-qr{text-align:center;margin:3mm 0 1.5mm}.pb-qr img{width:52mm;height:52mm}
    @media print{body{padding:0}.no-print{display:none!important}@page{margin:2mm;size:80mm auto}}
  </style></head><body>
  <div class="no-print"><button onclick="window.print()">Imprimir</button><button onclick="window.close()">Cerrar</button></div>
  ${buildParabrisas(r, cfg, qr)}
  <script>setTimeout(()=>window.print(),500)<\/script>
  </body></html>`;
  const win = window.open('', '_blank', 'width=340,height=750');
  if (win) { win.document.write(conMarca(html)); win.document.close(); }
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
    body{background:#fff;display:flex;flex-direction:column;align-items:center;padding:4mm;font-family:Arial,Helvetica,sans-serif}
    .no-print{text-align:center;margin-bottom:4mm}
    .no-print button{padding:6px 16px;background:#1A7A82;color:#fff;border:none;border-radius:5px;font-size:12px;cursor:pointer;margin:0 3px}
    .no-print button:hover{background:#229099}
    ${CSS_TICKET80}
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
  if (win) { win.document.write(conMarca(html)); win.document.close(); }
}

