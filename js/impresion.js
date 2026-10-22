// ── Ticket de infracción ──────────────────────────────────
// ── QR de verificación (verificacion.sql) ───────────────────
// Apunta a /verificar?t=<token aleatorio>: cualquiera puede comprobar que el
// documento es auténtico y su estado actual, sin iniciar sesión. El escáner de
// Caja también lo reconoce para cobrar.
function urlVerificacion(token) { return token ? `${window.location.origin}/verificar?t=${token}` : ''; }
function qrVerificacion(token, size = 220) {
  if (!token) return '';
  try { return new QRious({ value: urlVerificacion(token), size, padding: 6, backgroundAlpha: 1 }).toDataURL(); }
  catch (e) { console.warn('QR:', e); return ''; }
}

// Tramos de descuento por pronto pago, según Configuración
// (Veracruz, art. 330: 75% dentro de 5 días y 50% del 6.º al 10.º)
function tramosDescuento(cfg) {
  const t = [{ pct: Number(cfg?.descuento_pct ?? 0), dias: Number(cfg?.dias_descuento ?? 0) }];
  if (cfg?.dias_descuento2 && Number(cfg?.descuento2_pct) > 0) t.push({ pct: Number(cfg.descuento2_pct), dias: Number(cfg.dias_descuento2) });
  return t.filter(x => x.pct > 0 && x.dias > 0);
}
// Descuento que corresponde hoy a una infracción (null si ya no aplica)
function descuentoVigente(r, cfg) {
  const dias = (Date.now() - new Date(r.fecha).getTime()) / 86400000;
  return tramosDescuento(cfg).find(x => dias <= x.dias) || null;
}
function plazosPago(r, cfg, fmtFecha) {
  const dLim  = Number(cfg?.dias_limite ?? 30);
  const t = new Date(r.fecha).getTime();
  const tramos = tramosDescuento(cfg).map(x => ({
    ...x,
    hasta: new Date(t + x.dias*86400000).toLocaleDateString('es-MX', fmtFecha),
    monto: Math.round(r.monto * (1 - x.pct/100)).toLocaleString('es-MX')
  }));
  return { tramos, dLim, limFecha: new Date(t + dLim*86400000).toLocaleDateString('es-MX', fmtFecha) };
}

// Motivación del monto (art. 331) y relación de infracciones de la boleta (art. 327)
function htmlCircunstancias(r) {
  const c = r.circunstancias || [];
  if (!c.length) return 'Sin circunstancias agravantes ni atenuantes; se aplica la UMA base del tabulador (art. 333).';
  const agr = c.some(x => x.startsWith('agr_'));
  return c.map(x => esc(textoCircunstancia(x))).join('; ') + (agr ? '. Por existir agravante se aplica la UMA con agravante del tabulador (arts. 331 y 333).' : '.');
}
function htmlDatosInfractor(r) {
  if (r.infractor_ausente && !r.infractor_domicilio) return 'No se encontraba presente o no proporcionó domicilio ni correo electrónico (art. 327, fr. II, inciso b).';
  return `${esc(r.infractor_domicilio || 'Domicilio no proporcionado')} · ${esc(r.infractor_correo || 'correo no proporcionado')}`;
}

async function printInfraccion(id) {
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('infracciones').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id',1).single()
  ]);
  if (!r) return;

  const mun      = esc(cfg?.municipio || 'Municipio');
  const estMun   = esc(cfg?.estado    || '');
  const director = esc(cfg?.director  || '');
  const qrBoleta = qrVerificacion(r.token_verificacion);

  const fechaObj  = new Date(r.fecha);
  const fechaStr  = fechaObj.toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const horaStr   = fechaObj.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});

  const { tramos, limFecha } = plazosPago(r, cfg, {day:'2-digit',month:'long',year:'numeric'});
  await cargarCatalogo();
  const catInf = catalogoPorNumero(r.catalogo_numero);
  const grave = !!catInf?.grave;
  const montoFmt  = Number(r.monto).toLocaleString('es-MX');
  const lista = await infraccionesDeBoleta(r);

  const copyHTML = (label) => `
  <div class="copy">
    <div class="header">
      <div class="header-top">
        <div class="seal">HCE</div>
        <div class="header-text">
          <div class="gov-name">GOBIERNO MUNICIPAL · ${mun.toUpperCase()}</div>
          <div class="dept-name">DIRECCIÓN DE TRÁNSITO Y MOVILIDAD</div>
          <div class="state-name">${estMun.toUpperCase()}</div>
        </div>
        <!--LOGO:13mm-->
        <div class="copy-tag">${label}</div>
      </div>
      <div class="title-bar">
        <span>BOLETA DE INFRACCIÓN DE TRÁNSITO</span>
        <span class="folio-num">${esc(r.folio||'—')}</span>
      </div>
    </div>

    <div class="sections">
      <div class="section-row">
        <div class="section" style="flex:1">
          <div class="sec-title">Datos de la infracción</div>
          <div class="fields-grid">
            <div class="f"><span class="fl">Fecha</span><span class="fv">${fechaStr}</span></div>
            <div class="f"><span class="fl">Hora</span><span class="fv">${horaStr}</span></div>
            <div class="f full"><span class="fl">Ubicación / Lugar de los hechos</span><span class="fv">${esc(r.ubicacion||'—')}</span></div>
            <div class="f full"><span class="fl">Tipo de infracción</span><span class="fv bold">${esc(r.tipo)}</span></div>
            ${r.fundamento ? `<div class="f full"><span class="fl">Fundamento legal</span><span class="fv">${esc(r.fundamento)}${catInf?.clasificacion ? ' — infracción ' + esc(catInf.clasificacion.toLowerCase()) : ''}</span></div>` : ''}
            ${r.obs ? `<div class="f full"><span class="fl">Observaciones</span><span class="fv">${esc(r.obs)}</span></div>` : ''}
          </div>
        </div>
        <div class="section" style="flex:1">
          <div class="sec-title">Datos del vehículo</div>
          <div class="fields-grid">
            <div class="f"><span class="fl">Placa</span><span class="fv mono bold">${esc(r.placa)}</span></div>
            <div class="f"><span class="fl">Color</span><span class="fv">${esc(r.color_vehiculo||'—')}</span></div>
            <div class="f full"><span class="fl">Marca y modelo</span><span class="fv">${esc(r.vehiculo||'—')}</span></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="sec-title">Datos del infractor</div>
        <div class="fields-grid">
          <div class="f" style="flex:2"><span class="fl">Nombre completo</span><span class="fv bold">${esc(r.infractor)}</span></div>
          <div class="f"><span class="fl">Licencia o permiso</span><span class="fv mono">${esc(r.licencia||'—')}${r.licencia_tipo ? ' · ' + esc(r.licencia_tipo) : ''}</span></div>
          <div class="f full"><span class="fl">Domicilio y correo electrónico</span><span class="fv">${htmlDatosInfractor(r)}</span></div>
        </div>
      </div>

      ${r.documento_retenido ? `<div class="section">
        <div class="sec-title">Documento retenido en garantía (arts. 343 y 344)</div>
        <div class="pay-info">${esc(DOC_RETENIDO[r.documento_retenido] || '')}${r.documento_numero ? ' núm. ' + esc(r.documento_numero) : ''}. Se devolverá en ${esc(cfg?.resguardo_lugar || 'la Delegación de Tránsito')} al acreditar el pago o la cancelación de la multa, presentando esta boleta e identificación oficial.</div>
      </div>` : ''}
      <div class="section">
        <div class="sec-title">Motivación — circunstancias (art. 331)</div>
        <div class="pay-info">${htmlCircunstancias(r)}</div>
      </div>
      ${lista.length > 1 ? `<div class="section">
        <div class="sec-title">Infracciones de esta boleta (art. 327)</div>
        ${lista.map((x, i) => `<div class="pay-info" style="display:flex;justify-content:space-between;gap:3mm"><span><strong>${esc(x.folio||'—')}</strong> · ${esc(x.tipo)}${x.fundamento ? ' — ' + esc(x.fundamento) : ''}</span><span style="white-space:nowrap">${i===0?'<strong>Sanción de mayor cuantía:</strong> ':''}$${Number(x.monto).toLocaleString('es-MX')}</span></div>`).join('')}
      </div>` : ''}

      <div class="amount-section">
        <div class="amount-label">MONTO DE LA INFRACCIÓN</div>
        <div class="amount-num">$${montoFmt} <span class="currency">MXN</span></div>
        <div class="payment-dates">
          ${grave ? `<div class="pd-item limit">
            <div class="pd-label">Sin descuento</div>
            <div class="pd-date">Se paga íntegra</div>
            <div class="pd-amount">${esc(catInf?.descripcion?.slice(0,60) || '')}</div>
          </div>` : tramos.map(x => `<div class="pd-item discount">
            <div class="pd-label">▼ ${x.pct}% descuento si paga a más tardar el</div>
            <div class="pd-date">${x.hasta}</div>
            <div class="pd-amount">Pague solo $${x.monto} MXN</div>
          </div>`).join('')}
          <div class="pd-item limit">
            <div class="pd-label">⚠ Fecha límite de pago</div>
            <div class="pd-date">${limFecha}</div>
            <div class="pd-amount">Después genera recargo</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="sec-title">Lugar de pago</div>
        <div class="pay-info">
          <strong>Tesorería Municipal de ${mun}</strong> — Lunes a Viernes de 8:00 a 15:00 hrs.<br>
          Presente esta boleta en ventanilla de infracciones. Referencia de pago: <strong class="mono">${esc(r.folio||'—')}</strong>
        </div>
        ${qrBoleta?`<div style="display:flex;align-items:center;gap:3mm;margin-top:2mm"><img src="${qrBoleta}" style="width:22mm;height:22mm"/><div style="font-size:7.5pt;color:#555;line-height:1.4">Escanee el código para verificar que esta boleta es auténtica y consultar su estado.</div></div>`:''}
      </div>

      <div class="signatures">
        <div class="sig-box">
          ${imgFirma(r.firma_oficial, 14)}
          <div class="sig-line"></div>
          <div class="sig-label">Policía vial: ${esc(r.oficial||'—')}${r.oficial_placa ? ' · Placa ' + esc(r.oficial_placa) : ''}${r.oficial_adscripcion ? ' · ' + esc(r.oficial_adscripcion) : ''}</div>
        </div>
        <div class="sig-box">
          ${r.firma_infractor ? imgFirma(r.firma_infractor, 14) : (r.firma_negada ? '<div style="font-size:8pt;text-align:center;color:#555">Se negó a firmar</div>' : '')}
          <div class="sig-line"></div>
          <div class="sig-label">Firma o huella del infractor</div>
        </div>
      </div>

      <div class="legal-note">
        La presente boleta se expide con fundamento en ${esc(cfg?.fundamento_general || 'la legislación de tránsito vigente')}${r.fundamento ? '; y en el ' + esc(r.fundamento.replace(/^Artículo/, 'artículo')) : ''}.
        El no pago dentro del plazo establecido generará la actualización y los accesorios que determinen las disposiciones fiscales.
        ${esc(cfg?.leyenda_recurso || 'Contra esta boleta procede el recurso de revocación en los términos de la legislación aplicable.')}
      </div>
    </div>
  </div>`;

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Boleta ${esc(r.folio||'')}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;font-size:11px;background:#f5f5f5;color:#222}
    .page{width:210mm;margin:0 auto;padding:8mm;display:flex;flex-direction:column;gap:4mm}
    .no-print{text-align:center;margin-bottom:6mm}
    .no-print button{padding:8px 20px;background:#1A7A82;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;margin:0 4px}
    .no-print button:hover{background:#229099}
    .cut{text-align:center;color:#aaa;font-size:9px;letter-spacing:2px;padding:2mm 0;border-top:1px dashed #ccc;border-bottom:1px dashed #ccc}
    .copy{background:#fff;border:1px solid #ccc;border-radius:4px;overflow:hidden;page-break-inside:avoid}
    .header{background:#fff}
    .header-top{display:flex;align-items:center;gap:6mm;padding:4mm 5mm 3mm;border-bottom:3px solid #1A7A82}
    .seal{width:14mm;height:14mm;border-radius:50%;border:2px solid #1A7A82;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#1A7A82;flex-shrink:0}
    .header-text{flex:1}
    .gov-name{font-size:9px;font-weight:700;color:#1A7A82;letter-spacing:.5px}
    .dept-name{font-size:11px;font-weight:900;color:#222;margin:1px 0}
    .state-name{font-size:8px;color:#666}
    .copy-tag{font-size:8px;font-weight:700;color:#fff;background:#6B7280;padding:2px 6px;border-radius:3px;white-space:nowrap;align-self:flex-start}
    .title-bar{display:flex;justify-content:space-between;align-items:center;background:#1A7A82;color:#fff;padding:3mm 5mm}
    .title-bar span:first-child{font-size:10px;font-weight:700;letter-spacing:.5px}
    .folio-num{font-size:14px;font-weight:900;letter-spacing:2px;font-family:'Courier New',monospace}
    .sections{padding:3mm 5mm 4mm}
    .section-row{display:flex;gap:4mm;margin-bottom:2mm}
    .section{margin-bottom:2mm}
    .sec-title{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#1A7A82;border-bottom:1px solid #e5e7eb;padding-bottom:1mm;margin-bottom:2mm}
    .fields-grid{display:flex;flex-wrap:wrap;gap:2mm 3mm}
    .f{display:flex;flex-direction:column;min-width:80px}
    .f.full{width:100%;flex:1 0 100%}
    .fl{font-size:6.5px;text-transform:uppercase;color:#9CA3AF;letter-spacing:.5px;margin-bottom:.5px}
    .fv{font-size:10px;color:#111}
    .fv.bold{font-weight:700}
    .fv.mono{font-family:'Courier New',monospace;font-size:9px}
    .amount-section{background:#f0fafa;border:1.5px solid #1A7A82;border-radius:4px;padding:3mm 4mm;margin:2mm 0;text-align:center}
    .amount-label{font-size:7.5px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#1A7A82;margin-bottom:1mm}
    .amount-num{font-size:22px;font-weight:900;color:#1A7A82;line-height:1.1}
    .currency{font-size:12px;font-weight:600;color:#229099}
    .payment-dates{display:flex;gap:3mm;margin-top:2mm}
    .pd-item{flex:1;border-radius:3px;padding:2mm;text-align:center}
    .pd-item.discount{background:#f0fdf4;border:1px solid #6ee7b7}
    .pd-item.limit{background:#fef2f2;border:1px solid #fca5a5}
    .pd-label{font-size:7px;color:#555;margin-bottom:1px}
    .pd-date{font-size:9px;font-weight:700;color:#111}
    .pd-amount{font-size:8px;font-weight:600}
    .pd-item.discount .pd-amount{color:#059669}
    .pd-item.limit .pd-amount{color:#DC2626}
    .pay-info{font-size:9px;color:#444;line-height:1.6;background:#f9fafb;border:1px solid #e5e7eb;border-radius:3px;padding:2mm 3mm}
    .pay-info .mono{font-family:'Courier New',monospace;font-size:9px;background:#e5e7eb;padding:0 3px;border-radius:2px}
    .signatures{display:flex;gap:10mm;margin-top:4mm}
    .sig-box{flex:1;text-align:center}
    .sig-line{height:8mm;border-bottom:1px solid #333;margin-bottom:1mm}
    .sig-label{font-size:7.5px;color:#666}
    .legal-note{font-size:7px;color:#9CA3AF;line-height:1.5;margin-top:3mm;padding-top:2mm;border-top:1px solid #e5e7eb;text-align:justify}
    @media print{
      body{background:#fff}
      .no-print{display:none!important}
      .page{width:100%;margin:0;padding:4mm}
      @page{margin:8mm;size:A4 portrait}
    }
  </style></head><body>
  <div class="page">
    <div class="no-print">
      <button onclick="window.print()">🖨 Imprimir boleta</button>
      <button onclick="window.close()">Cerrar</button>
    </div>
    ${copyHTML('COPIA INFRACTOR')}
    <div class="cut">✂ &nbsp;&nbsp; CORTAR POR AQUÍ &nbsp;&nbsp; ✂</div>
    ${copyHTML('COPIA TRÁNSITO')}
  </div>
  <script>setTimeout(()=>window.print(),600)<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=870,height=960');
  win.document.write(conMarca(html));
  win.document.close();
}

// ── Accidente — parte oficial imprimible ─────────────────
async function printAccidente(id) {
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('accidentes').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id', 1).single()
  ]);
  if (!r) return;
  let partes = []; try { partes = JSON.parse(r.partes||'[]'); } catch(_) {}
  const mun   = esc(cfg?.municipio || 'Municipio');
  const edo   = esc(cfg?.estado    || '');
  const dir   = esc(cfg?.director  || '');
  const tipoMap = { choque:'Choque vehicular', atropello:'Atropello', volcadura:'Volcadura', otro:'Otro' };
  const estadoMap = { en_proceso:'En proceso', cerrado:'Cerrado', derivado:'Derivado al Ministerio Público' };
  const fecha = r.fecha ? new Date(r.fecha).toLocaleString('es-MX',{dateStyle:'long',timeStyle:'short'}) : '—';
  const win = window.open('','_blank','width=850,height=1100');
  win.document.write(conMarca(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Parte de Accidente ${esc(r.folio||'')}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Arial',sans-serif;font-size:11pt;color:#111;padding:1.5cm 2cm}
    .no-print{margin-bottom:1rem}
    .no-print button{padding:.4rem 1rem;background:#1A7A82;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-right:.5rem}
    @media print{.no-print{display:none}}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1A7A82;padding-bottom:.7rem;margin-bottom:1rem}
    .header-left h1{font-size:13pt;color:#1A7A82;font-weight:700}
    .header-left p{font-size:9pt;color:#555;margin-top:.15rem}
    .folio-box{border:2px solid #1A7A82;border-radius:8px;padding:.4rem .9rem;text-align:center}
    .folio-box .lbl{font-size:7pt;text-transform:uppercase;letter-spacing:.08em;color:#6B7280}
    .folio-box .val{font-size:14pt;font-weight:800;font-family:monospace;color:#1A7A82}
    .section-title{font-size:9pt;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#1A7A82;border-bottom:1px solid #E5E7EB;padding-bottom:.25rem;margin:1rem 0 .6rem}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:.5rem .8rem}
    .field label{font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#6B7280;display:block;margin-bottom:.15rem}
    .field span{font-size:10pt;font-weight:600}
    .field.full{grid-column:1/-1}
    .parte-box{border:1px solid #E5E7EB;border-radius:6px;padding:.5rem .75rem;margin-bottom:.4rem;font-size:9.5pt}
    .badge{display:inline-block;padding:.15rem .6rem;border-radius:12px;font-size:8pt;font-weight:700}
    .badge.en_proceso{background:#FEF3C7;color:#92400E}
    .badge.cerrado{background:#D1FAE5;color:#065F46}
    .badge.derivado{background:#DBEAFE;color:#1E40AF}
    .firma-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-top:2rem}
    .firma-box{border-top:1px solid #374151;padding-top:.4rem;font-size:8pt;text-align:center;color:#6B7280}
    .footer{margin-top:1.5rem;border-top:1px solid #E5E7EB;padding-top:.5rem;font-size:8pt;color:#9CA3AF;text-align:center}
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()">🖨 Imprimir / PDF</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  <div class="header">
    <div class="header-left">
      <h1>Dirección de Tránsito y Movilidad Municipal</h1>
      <p>${mun}${edo ? ', '+edo : ''}</p>
      <p style="margin-top:.5rem;font-size:11pt;font-weight:700">CONSTANCIA DE ACCIDENTE VIAL</p>
    </div>
    <div class="folio-box">
      <div class="lbl">Folio</div>
      <div class="val">${esc(r.folio||'—')}</div>
    </div>
  </div>

  <div class="section-title">Datos del accidente</div>
  <div class="grid">
    <div class="field"><label>Tipo</label><span>${esc(tipoMap[r.tipo]||r.tipo)}</span></div>
    <div class="field"><label>Estado</label><span class="badge ${esc(r.estado)}">${esc(estadoMap[r.estado]||r.estado)}</span></div>
    <div class="field"><label>Fecha y hora</label><span>${fecha}</span></div>
    <div class="field"><label>Oficial que levanta</label><span>${esc(r.oficial||'—')}</span></div>
    <div class="field full"><label>Ubicación / Lugar de los hechos</label><span>${esc(r.ubicacion||'—')}</span></div>
    <div class="field"><label>Personas lesionadas</label><span>${r.lesionados||0}</span></div>
    <div class="field"><label>Personas fallecidas</label><span>${r.fallecidos||0}</span></div>
    ${r.descripcion?`<div class="field full"><label>Descripción</label><span>${esc(r.descripcion)}</span></div>`:''}
    ${r.obs?`<div class="field full"><label>Observaciones</label><span>${esc(r.obs)}</span></div>`:''}
  </div>

  ${partes.length ? `
  <div class="section-title">Partes involucradas</div>
  ${partes.map((p,i)=>`
    <div class="parte-box">
      <strong>Parte ${i+1}:</strong>&nbsp; ${esc(p.nombre||'—')} &nbsp;|&nbsp;
      Placa: <strong>${esc(p.placa||'—')}</strong> &nbsp;|&nbsp;
      Licencia: ${esc(p.licencia||'—')} &nbsp;|&nbsp;
      Aseguradora: ${esc(p.aseguradora||'—')}
    </div>`).join('')}` : ''}

  <div class="firma-row">
    <div class="firma-box">Firma del oficial<br><br><br>${esc(r.oficial||'_________________')}</div>
    <div class="firma-box">Testigo / Parte 1<br><br><br>_________________</div>
    <div class="firma-box">Testigo / Parte 2<br><br><br>_________________</div>
  </div>

  <div class="footer">
    Documento generado el ${new Date().toLocaleString('es-MX',{dateStyle:'long',timeStyle:'short'})} · ${mun} · Sistema de Tránsito y Movilidad · HCE Consultoría
  </div>
  </body></html>`));
  win.document.close();
}

// ── Permiso — impresión hoja carta ───────────────────────
async function printPermiso(id) {
  const [{ data: r }, { data: cfg }] = await Promise.all([
    _sb.from('permisos').select('*').eq('id', id).single(),
    _sb.from('configuracion').select('*').eq('id', 1).single()
  ]);
  if (!r) return;

  const mun      = esc(cfg?.municipio || 'Municipio');
  const estMun   = esc(cfg?.estado    || '');
  const director = esc(cfg?.director  || 'Director de Tránsito');
  const correo   = esc(cfg?.correo    || '');

  const hoy      = new Date().toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const inicioStr = r.inicio      ? new Date(r.inicio).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}) : '—';
  const vencStr   = r.vencimiento ? new Date(r.vencimiento).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'}) : '—';

  const vigente  = r.estado === 'vigente';
  const estadoLabel = { vigente:'VIGENTE', vencido:'VENCIDO', 'por-vencer':'POR VENCER', suspendido:'SUSPENDIDO' }[r.estado] || r.estado.toUpperCase();
  const estadoColor = { vigente:'#059669', vencido:'#DC2626', 'por-vencer':'#D97706', suspendido:'#DC2626' }[r.estado] || '#6B7280';

  const ref = (r.num||'PER').replace(/[^A-Z0-9]/g,'') + String(r.id||0).padStart(6,'0');

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/>
  <title>Permiso ${esc(r.num||'')} — ${esc(r.titular)}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;background:#f0f0f0;color:#222;font-size:11px}
    .page{width:215.9mm;min-height:279.4mm;margin:0 auto;background:#fff;padding:12mm 14mm;display:flex;flex-direction:column;gap:0}
    .no-print{text-align:center;padding:8px 0 12px;background:#f0f0f0}
    .no-print button{padding:7px 20px;background:#1A7A82;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;margin:0 4px}
    .no-print button:hover{background:#229099}

    /* HEADER */
    .header{display:flex;align-items:center;gap:8mm;padding-bottom:5mm;border-bottom:3px solid #1A7A82;margin-bottom:5mm}
    .seal{width:22mm;height:22mm;border-radius:50%;border:2.5px solid #1A7A82;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;color:#1A7A82;flex-shrink:0;letter-spacing:.5px}
    .header-center{flex:1}
    .gov-line{font-size:8.5px;font-weight:700;color:#1A7A82;letter-spacing:.8px;text-transform:uppercase}
    .dept-line{font-size:15px;font-weight:900;color:#1A1F2B;margin:2px 0;letter-spacing:.3px}
    .state-line{font-size:9px;color:#6B7280}
    .doc-type{text-align:right;flex-shrink:0}
    .doc-type-label{font-size:9px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.8px}
    .doc-num{font-size:18px;font-weight:900;color:#1A7A82;font-family:'Courier New',monospace;letter-spacing:2px;margin-top:2px}

    /* STATUS STAMP */
    .stamp-wrap{display:flex;justify-content:flex-end;margin-bottom:3mm}
    .stamp{display:inline-flex;align-items:center;justify-content:center;border:3px solid ${estadoColor};color:${estadoColor};font-size:16px;font-weight:900;letter-spacing:3px;padding:3mm 6mm;border-radius:4px;transform:rotate(-4deg);opacity:.85}

    /* TITLE BAR */
    .title-bar{background:#1A7A82;color:#fff;text-align:center;padding:3.5mm 0;margin-bottom:6mm}
    .title-bar h1{font-size:13px;font-weight:900;letter-spacing:1.5px;text-transform:uppercase}
    .title-bar p{font-size:9px;margin-top:1px;opacity:.85}

    /* SECTIONS */
    .section{margin-bottom:5mm}
    .sec-title{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#1A7A82;border-bottom:1.5px solid #1A7A82;padding-bottom:1.5mm;margin-bottom:3mm}
    .fields{display:flex;flex-wrap:wrap;gap:2.5mm 4mm}
    .field{display:flex;flex-direction:column;min-width:55mm}
    .field.w-full{width:100%;flex:1 0 100%}
    .field.w-half{flex:1;min-width:80mm}
    .field label{font-size:7px;text-transform:uppercase;letter-spacing:.5px;color:#9CA3AF;margin-bottom:1mm}
    .field span{font-size:11px;color:#1A1F2B;font-weight:500;border-bottom:1px solid #E5E7EB;padding-bottom:1mm}
    .field span.bold{font-weight:800;font-size:13px}
    .field span.mono{font-family:'Courier New',monospace;font-size:10px}
    .field span.big{font-size:14px;font-weight:900;color:#1A7A82}

    /* VALIDITY BOX */
    .validity-box{display:flex;gap:4mm;margin-bottom:5mm}
    .validity-item{flex:1;border:1.5px solid #E5E7EB;border-radius:5px;padding:3mm 4mm;text-align:center}
    .validity-item.start{border-color:#1A7A82;background:#f0fafa}
    .validity-item.end{border-color:${vigente?'#059669':'#DC2626'};background:${vigente?'#f0fdf4':'#fef2f2'}}
    .vi-label{font-size:7px;text-transform:uppercase;letter-spacing:.8px;color:#6B7280;margin-bottom:1.5mm}
    .vi-date{font-size:13px;font-weight:900;color:#1A1F2B}
    .vi-sub{font-size:8px;color:#6B7280;margin-top:.5mm}

    /* TERMS */
    .terms{background:#F9FAFB;border:1px solid #E5E7EB;border-radius:4px;padding:3mm 4mm;margin-bottom:5mm}
    .terms p{font-size:8px;color:#6B7280;line-height:1.6;text-align:justify}

    /* SIGNATURES */
    .signatures{display:flex;gap:12mm;margin-top:auto;padding-top:6mm}
    .sig-block{flex:1;text-align:center}
    .sig-line{height:10mm;border-bottom:1.5px solid #374151;margin-bottom:1.5mm}
    .sig-name{font-size:9px;font-weight:700;color:#1A1F2B}
    .sig-title{font-size:8px;color:#6B7280}

    /* FOOTER */
    .footer{text-align:center;font-size:7.5px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:3mm;margin-top:4mm}
    .barcode-ref{font-family:'Courier New',monospace;font-size:8px;letter-spacing:3px;color:#374151;margin:2mm 0;display:block;text-align:center}

    @media print{
      body{background:#fff}
      .no-print{display:none!important}
      .page{margin:0;padding:12mm 14mm;width:100%}
      @page{margin:0;size:letter portrait}
    }
  </style></head><body>
  <div class="no-print">
    <button onclick="window.print()">Imprimir permiso</button>
    <button onclick="window.close()">Cerrar</button>
  </div>
  <div class="page">
    <!-- HEADER -->
    <div class="header">
      <div class="seal">HCE</div>
      <div class="header-center">
        <div class="gov-line">Gobierno Municipal · ${mun}</div>
        <div class="dept-line">Dirección de Tránsito y Movilidad</div>
        <div class="state-line">${estMun}</div>
      </div>
      <div class="doc-type">
        <div class="doc-type-label">Núm. de permiso</div>
        <div class="doc-num">${esc(r.num||'—')}</div>
      </div>
    </div>

    <!-- STAMP + TITLE -->
    <div class="stamp-wrap"><div class="stamp">${estadoLabel}</div></div>
    <div class="title-bar">
      <h1>Permiso de Circulación</h1>
      <p>${esc(r.tipo)}</p>
    </div>

    <!-- TITULAR -->
    <div class="section">
      <div class="sec-title">Datos del titular</div>
      <div class="fields">
        <div class="field w-full"><label>Nombre completo / Razón social</label><span class="bold">${esc(r.titular)}</span></div>
      </div>
    </div>

    <!-- VEHÍCULO -->
    <div class="section">
      <div class="sec-title">Datos del vehículo y ruta</div>
      <div class="fields">
        <div class="field"><label>Placas del vehículo</label><span class="mono bold">${esc(r.placa||'—')}</span></div>
        <div class="field"><label>Tipo de permiso</label><span>${esc(r.tipo)}</span></div>
        <div class="field w-full"><label>Ruta / Zona de circulación autorizada</label><span class="big">${esc(r.ruta||'—')}</span></div>
      </div>
    </div>

    <!-- VIGENCIA -->
    <div class="section">
      <div class="sec-title">Periodo de vigencia</div>
      <div class="validity-box">
        <div class="validity-item start">
          <div class="vi-label">Fecha de inicio</div>
          <div class="vi-date">${inicioStr}</div>
          <div class="vi-sub">Inicio de validez</div>
        </div>
        <div class="validity-item end">
          <div class="vi-label">Fecha de vencimiento</div>
          <div class="vi-date">${vencStr}</div>
          <div class="vi-sub">${vigente?'Permiso vigente':'Vence / venció esta fecha'}</div>
        </div>
      </div>
    </div>

    <!-- TERMS -->
    <div class="terms">
      <p><strong>Condiciones del permiso:</strong> El presente permiso de circulación es personal e intransferible y autoriza
      exclusivamente la operación del vehículo con placas <strong>${esc(r.placa||'indicadas')}</strong> en la ruta o zona señalada.
      Queda estrictamente prohibido ceder, transferir o hacer uso del mismo para fines distintos a los aquí autorizados.
      La dirección de Tránsito y Movilidad de ${mun} se reserva el derecho de suspender o cancelar este permiso en caso de
      incumplimiento de la normativa municipal vigente. El titular deberá portar este documento en todo momento durante la
      operación del vehículo. Vigencia sujeta a revisión periódica conforme a la Ley de Tránsito Municipal.</p>
    </div>

    <!-- EMISSION INFO -->
    <div class="section">
      <div class="sec-title">Información de emisión</div>
      <div class="fields">
        <div class="field"><label>Fecha de expedición</label><span>${hoy}</span></div>
        <div class="field"><label>Estado del permiso</label><span style="color:${estadoColor};font-weight:700">${estadoLabel}</span></div>
        ${correo?`<div class="field"><label>Contacto</label><span>${correo}</span></div>`:''}
      </div>
    </div>

    <!-- REFERENCE -->
    <div class="footer">
      <span class="barcode-ref">${ref}</span>
      Permiso expedido por la Dirección de Tránsito y Movilidad de ${mun}, ${estMun}.
      Para verificar la autenticidad de este documento comuníquese con la dirección.
    </div>

    <!-- SIGNATURES -->
    <div class="signatures">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-name">${director}</div>
        <div class="sig-title">Director de Tránsito y Movilidad</div>
        <div class="sig-title">Gobierno Municipal de ${mun}</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-name">${esc(r.titular)}</div>
        <div class="sig-title">Titular del permiso</div>
        <div class="sig-title">Firma de recibido</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-name" style="visibility:hidden">.</div>
        <div class="sig-title">Sello oficial</div>
        <div class="sig-title">Dirección de Tránsito</div>
      </div>
    </div>
  </div>
  <script>setTimeout(()=>window.print(),600)<\/script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=1000');
  if (win) { win.document.write(conMarca(html)); win.document.close(); }
}

