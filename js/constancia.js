// Constancia de no adeudo imprimible (constancias_cobro.sql): hoja carta con
// la imagen del Ayuntamiento, marco y fondo de seguridad, la placa destacada,
// datos de expedición y vigencia, firma y QR de verificación. La usan Caja, el
// portal, /verificar y la página pública.
// data: { folio, token, placa, emitida, vigente_hasta, municipio, estado,
//         director, monto?, metodo? }
// opc.base: dirección del sistema para el QR (la página pública la pasa)
// opc.marca: { escudo, color, institucion } (por omisión la guardada en marca.js)
function htmlConstancia(data, opc = {}) {
  const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const base = opc.base || location.origin;
  const marca = opc.marca || (typeof marcaGuardada === 'function' ? marcaGuardada() : null) || {};
  const color = /^#[0-9a-f]{6}$/i.test(marca.color || '') ? marca.color : '#1A5E63';
  const escudo = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(marca.escudo || '') ? marca.escudo : '';
  const municipio = data.municipio || '';
  const institucion = marca.institucion || (municipio ? 'H. Ayuntamiento de ' + municipio : 'H. Ayuntamiento');
  const url = `${base}/verificar?t=${data.token}`;
  let qr = '';
  try { qr = new QRious({ value: url, size: 300, padding: 0, level: 'M' }).toDataURL(); } catch (_) {}
  const zona = { timeZone: 'America/Mexico_City' };
  const larga = d => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric', ...zona });
  const corta = d => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric', ...zona }).replace('.', '');
  const hora = d => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', ...zona });
  const vence = larga(data.vigente_hasta + 'T12:00:00');
  const metodo = { en_linea: 'Pago en línea', efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' }[data.metodo] || '—';
  const derechos = data.monto != null ? Number(data.monto).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' }) : '—';
  const placa = String(data.placa || '').toUpperCase();
  const estadoCorto = String(data.estado || '').split(' de ')[0].toUpperCase();
  // Fondo de seguridad: ondas finas del color institucional (guilloché)
  let ondas = '';
  for (let k = 0; k < 14; k++) {
    let d = `M0 ${20 + k * 14}`;
    for (let x = 0; x <= 400; x += 10) d += ` L${x} ${(20 + k * 14 + Math.sin(x / 22 + k * .7) * 9).toFixed(1)}`;
    ondas += `<path d="${d}" fill="none" stroke="${color}" stroke-width=".35"/>`;
  }
  const fondo = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220">${ondas}</svg>`);
  const micro = (`${institucion} · Dirección de Tránsito y Vialidad · Constancia de no adeudo · ${data.folio} · `).toUpperCase().repeat(6);
  const escudoHtml = escudo
    ? `<img src="${escudo}" alt="Escudo">`
    : `<svg viewBox="0 0 64 74" aria-hidden="true"><path d="M32 2 60 12v24c0 18-12 30-28 36C16 66 4 54 4 36V12z" fill="none" stroke="${color}" stroke-width="3"/><path d="M32 14 48 20v15c0 10-7 18-16 22-9-4-16-12-16-22V20z" fill="${color}" opacity=".18"/></svg>`;
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Constancia de no adeudo ${e(data.folio)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Source+Sans+3:wght@400;600;700&family=IBM+Plex+Mono:wght@600&display=swap" rel="stylesheet">
  <style>
    @page { size: letter; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --c: ${color}; --tinta: #1B1F24; --gris: #5A6370; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: #E7E9EC; font-family: 'Source Sans 3', Arial, sans-serif; color: var(--tinta); }
    .barra { position: sticky; top: 0; display: flex; justify-content: center; gap: .6rem; padding: .7rem; background: #1B1F24; z-index: 5; }
    .barra button { font: 700 .9rem 'Source Sans 3', Arial, sans-serif; padding: .55rem 1.1rem; border: 0; border-radius: 8px; cursor: pointer; background: var(--c); color: #fff; }
    .hoja { position: relative; width: 8.5in; height: 11in; margin: 1.2rem auto; background: #fff; box-shadow: 0 10px 40px rgba(0,0,0,.18); padding: .45in; overflow: hidden; }
    .marco { position: absolute; inset: .3in; border: 2.5px solid var(--c); border-radius: 6px; }
    .marco::before { content: ""; position: absolute; inset: 5px; border: .75px solid var(--c); border-radius: 3px; }
    .esq { position: absolute; width: 22px; height: 22px; background: #fff; border: 2.5px solid var(--c); transform: rotate(45deg); }
    .esq.a { top: -12px; left: -12px; } .esq.b { top: -12px; right: -12px; } .esq.c { bottom: -12px; left: -12px; } .esq.d { bottom: -12px; right: -12px; }
    .fondo { position: absolute; inset: .42in; background: url("${fondo}") repeat; opacity: .16; }
    .agua { position: absolute; left: 50%; top: 52%; width: 4.3in; height: 4.3in; transform: translate(-50%, -50%); opacity: .055; display: grid; place-items: center; }
    .agua img, .agua svg { width: 100%; height: 100%; object-fit: contain; }
    .cont { position: relative; height: 100%; padding: .32in .45in .48in; display: flex; flex-direction: column; }
    .cont > * { flex-shrink: 0; }
    header { display: grid; grid-template-columns: 1in 1fr 1.55in; align-items: center; gap: .2in; padding-bottom: .16in; border-bottom: 1.5px solid var(--c); }
    .escudo { width: .95in; height: .95in; display: grid; place-items: center; }
    .escudo img, .escudo svg { max-width: 100%; max-height: 100%; }
    .inst { text-align: center; }
    .inst .uno { font: 700 1.05rem 'Source Sans 3', Arial, sans-serif; letter-spacing: .02em; }
    .inst .dos { font-weight: 600; font-size: .86rem; color: var(--c); text-transform: uppercase; letter-spacing: .14em; margin-top: .1rem; }
    .inst .tres { font-size: .78rem; color: var(--gris); margin-top: .08rem; }
    .folio { border: 1.5px solid var(--c); border-radius: 6px; text-align: center; padding: .4rem .3rem; background: #fff; }
    .folio small { display: block; font-size: .6rem; letter-spacing: .18em; color: var(--gris); font-weight: 700; }
    .folio b { font: 600 .92rem 'IBM Plex Mono', monospace; color: var(--tinta); letter-spacing: .02em; }
    .titulo { text-align: center; margin: .26in 0 .16in; }
    .titulo h1 { font: 700 2.15rem 'Cormorant Garamond', Georgia, serif; letter-spacing: .06em; text-transform: uppercase; line-height: 1.05; }
    .titulo p { font: 600 1.15rem 'Cormorant Garamond', Georgia, serif; color: var(--c); letter-spacing: .05em; margin-top: .25rem; }
    .titulo .orla { display: flex; align-items: center; justify-content: center; gap: .6rem; margin-top: .15in; color: var(--c); }
    .titulo .orla i { width: 1.3in; height: 1px; background: currentColor; }
    .titulo .orla span { width: 7px; height: 7px; transform: rotate(45deg); background: currentColor; }
    .cuerpo { font: 400 1.04rem/1.62 'Source Sans 3', Arial, sans-serif; text-align: justify; color: #2A3038; }
    .cuerpo b { color: var(--tinta); }
    .cuerpo .acq { font-weight: 700; letter-spacing: .04em; margin-bottom: .12in; }
    .placa { margin: .15in auto; width: 3.3in; border: 3px solid var(--tinta); border-radius: 12px; padding: .06in .2in .07in; text-align: center; background: linear-gradient(#fff, #F4F5F6); box-shadow: inset 0 0 0 2.5px #fff, inset 0 0 0 4px #B9BEC5; position: relative; }
    .placa::before, .placa::after { content: ""; position: absolute; top: 50%; width: 8px; height: 8px; margin-top: -4px; border-radius: 50%; background: #9AA1AA; }
    .placa::before { left: .12in; } .placa::after { right: .12in; }
    .placa small { display: block; font-size: .62rem; font-weight: 700; letter-spacing: .3em; color: var(--c); }
    .placa b { display: block; font: 600 2.3rem 'IBM Plex Mono', monospace; letter-spacing: .1em; line-height: 1.15; }
    .placa i { display: block; font-style: normal; font-size: .55rem; letter-spacing: .3em; color: var(--gris); font-weight: 700; }
    .datos { display: grid; grid-template-columns: repeat(4, 1fr); margin-top: .2in; border: 1.5px solid var(--c); border-radius: 8px; overflow: hidden; background: #fff; }
    .datos div { padding: .1in .12in; border-right: 1px solid color-mix(in srgb, var(--c) 35%, #fff); }
    .datos div:last-child { border-right: 0; }
    .datos small { display: block; font-size: .6rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--gris); }
    .datos b { font-size: .95rem; }
    .datos .vig { background: color-mix(in srgb, var(--c) 10%, #fff); }
    .datos .vig b { color: var(--c); }
    .nota { margin-top: .14in; font-size: .8rem; color: var(--gris); line-height: 1.45; text-align: justify; }
    .pie { margin-top: auto; display: grid; grid-template-columns: 1.55in 1fr 1.25in; align-items: end; gap: .25in; }
    .qr { text-align: center; }
    .qr img { width: 1.25in; height: 1.25in; display: block; margin: 0 auto .05in; padding: 5px; border: 1.5px solid var(--c); border-radius: 6px; background: #fff; }
    .qr small { font-size: .62rem; line-height: 1.3; color: var(--gris); display: block; }
    .firma { text-align: center; padding-bottom: .05in; }
    .firma .linea { border-top: 1.2px solid var(--tinta); margin: 0 .2in .06in; }
    .firma b { display: block; font-size: .95rem; }
    .firma span { font-size: .78rem; color: var(--gris); }
    .sello { width: 1.2in; height: 1.2in; border-radius: 50%; border: 1.5px dashed var(--c); display: grid; place-items: center; text-align: center; color: var(--c); font-size: .58rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; justify-self: center; opacity: .8; }
    .micro { margin-top: .16in; font-size: 4.2px; letter-spacing: .4px; color: var(--c); white-space: nowrap; overflow: hidden; border-top: .5px solid var(--c); border-bottom: .5px solid var(--c); padding: 1px 0; }
    .ref { display: flex; justify-content: space-between; font-size: .62rem; color: var(--gris); margin-top: .05in; }
    @media print { body { background: #fff; } .barra { display: none; } .hoja { margin: 0 !important; box-shadow: none; transform: none !important; } }
  </style></head><body>
  <div class="barra"><button onclick="window.print()">Imprimir o guardar como PDF</button></div>
  <div class="hoja">
    <div class="fondo"></div>
    <div class="marco"><span class="esq a"></span><span class="esq b"></span><span class="esq c"></span><span class="esq d"></span></div>
    <div class="agua">${escudoHtml}</div>
    <div class="cont">
      <header>
        <div class="escudo">${escudoHtml}</div>
        <div class="inst">
          <div class="uno">${e(institucion)}</div>
          <div class="dos">Dirección de Tránsito y Vialidad</div>
          <div class="tres">${e(municipio)}${data.estado ? ', ' + e(data.estado) : ''}</div>
        </div>
        <div class="folio"><small>FOLIO</small><b>${e(data.folio)}</b></div>
      </header>

      <div class="titulo">
        <h1>Constancia de no adeudo</h1>
        <p>de infracciones de tránsito</p>
        <div class="orla"><i></i><span></span><i></i></div>
      </div>

      <div class="cuerpo">
        <p class="acq">A QUIEN CORRESPONDA:</p>
        <p>La Dirección de Tránsito y Vialidad${municipio ? ' del municipio de <b>' + e(municipio) + '</b>' : ''} <b>HACE CONSTAR</b> que, de acuerdo con los registros de su sistema de infracciones, el vehículo con placa de circulación</p>
        <div class="placa"><small>${e(estadoCorto || 'MÉXICO')}</small><b>${e(placa)}</b><i>MÉXICO</i></div>
        <p>no tiene infracciones de tránsito <b>pendientes de pago, vencidas ni en proceso de impugnación</b> a la fecha y hora de su expedición.</p>
        <p style="margin-top:.1in">Se expide la presente a petición del interesado, para los fines legales que a éste convengan, en ${municipio ? e(municipio) + (data.estado ? ', ' + e(data.estado) : '') : 'esta ciudad'}, el ${e(larga(data.emitida))}.</p>
      </div>

      <div class="datos">
        <div><small>Expedida</small><b>${e(corta(data.emitida))}</b><br><span style="font-size:.75rem;color:var(--gris)">${e(hora(data.emitida))}</span></div>
        <div class="vig"><small>Válida hasta</small><b>${e(corta(data.vigente_hasta + 'T12:00:00'))}</b><br><span style="font-size:.75rem">30 días naturales</span></div>
        <div><small>Derechos pagados</small><b>${e(derechos)}</b></div>
        <div><small>Forma de pago</small><b>${e(metodo)}</b></div>
      </div>
      <p class="nota">Esta constancia es válida únicamente hasta el ${e(vence)}; después de esa fecha carece de validez y deberá solicitarse una nueva. Refleja la situación del vehículo en el momento de su expedición. Su autenticidad y vigencia pueden comprobarse en cualquier momento escaneando el código QR.</p>

      <div class="pie">
        <div class="qr">${qr ? `<img src="${qr}" alt="Código QR de verificación">` : ''}<small>Escanee para verificar autenticidad y vigencia</small></div>
        <div class="firma"><div class="linea"></div><b>${e(data.director || 'Director de Tránsito y Vialidad')}</b><span>Director de Tránsito y Vialidad</span></div>
        <div class="sello">Sello de la<br>Dirección</div>
      </div>
      <div class="micro">${e(micro)}</div>
      <div class="ref"><span>Documento emitido electrónicamente · verifíquelo en ${e(url.replace(/^https?:\/\//, ''))}</span><span>Ref. ${e(String(data.token || '').slice(0, 8).toUpperCase())}</span></div>
    </div>
  </div>
  <script>
    // En el celular la hoja carta se ve completa, a escala (al imprimir sale a tamaño real)
    function ajustar() {
      const h = document.querySelector('.hoja'), f = Math.min(1, (innerWidth - 16) / h.offsetWidth);
      h.style.transformOrigin = 'top left'; h.style.transform = f < 1 ? 'scale(' + f + ')' : '';
      h.style.margin = f < 1 ? '8px 0 ' + (-(1 - f) * h.offsetHeight + 8) + 'px 8px' : '';
    }
    ajustar(); addEventListener('resize', ajustar);
  <\/script>
  </body></html>`;
}

// Abre la constancia en una ventana nueva. win: ventana abierta en el clic
// (los navegadores bloquean window.open después de un await).
function abrirConstancia(data, win, opc) {
  win = win || window.open('', '_blank', 'width=900,height=1000');
  if (!win) return false;
  win.document.write(htmlConstancia(data, opc)); win.document.close();
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
