// ── QR Scanner ────────────────────────────────────────────
let _qrStream = null, _qrScanInterval = null;

async function openQRScanner() {
  openModal('modal-qr-scanner');
  const statusEl = $('qr-status');
  const box = document.getElementById('qr-box');
  if (statusEl) statusEl.textContent = 'Iniciando cámara…';
  if (box) box.style.borderColor = 'var(--ac)';

  try {
    _qrStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } }
    });
    const video = document.getElementById('qr-video');
    video.srcObject = _qrStream;
    await video.play();
    if (statusEl) statusEl.textContent = 'Escaneando — acerca el QR al recuadro…';

    // BarcodeDetector (nativo en Chrome/Android/Edge — más confiable)
    if ('BarcodeDetector' in window) {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      _qrScanInterval = setInterval(async () => {
        if (!_qrStream) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0 && codes[0].rawValue) {
            if (box) box.style.borderColor = '#059669';
            stopQRScan();
            handleQRResult(codes[0].rawValue);
          }
        } catch(e) {}
      }, 300);
    } else {
      // Fallback: jsQR sobre canvas
      const canvas = document.getElementById('qr-canvas');
      if (!canvas) { if (statusEl) statusEl.textContent = 'Error interno (canvas).'; return; }
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      _qrScanInterval = setInterval(() => {
        if (!_qrStream || video.readyState < 2 || !video.videoWidth) return;
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        try {
          const img  = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
          if (code?.data) {
            if (box) box.style.borderColor = '#059669';
            stopQRScan();
            handleQRResult(code.data);
          }
        } catch(e) {}
      }, 250);
    }
  } catch(err) {
    if (statusEl) statusEl.textContent = 'Cámara no disponible: ' + err.message;
  }
}

function stopQRScan() {
  if (_qrScanInterval) { clearInterval(_qrScanInterval); _qrScanInterval = null; }
  if (_qrStream) { _qrStream.getTracks().forEach(t => t.stop()); _qrStream = null; }
  const video = document.getElementById('qr-video');
  if (video) { video.srcObject = null; }
  closeModal('modal-qr-scanner');
}

async function handleQRResult(data) {
  let infId = null;
  const tok = String(data).match(/[?&]t=([0-9a-f-]{36})/i);
  if (tok) {
    const { data: r } = await _sb.from('infracciones').select('id').eq('token_verificacion', tok[1]).maybeSingle();
    if (r) infId = r.id;
  } else try {
    const obj = JSON.parse(data);
    infId = obj.id || null;
    if (!infId && obj.folio) {
      const { data: r } = await _sb.from('infracciones').select('id,estado').eq('folio', obj.folio).single();
      if (r) infId = r.id;
    }
  } catch(e) {
    // Try as plain folio text
    const q = data.trim();
    const { data: r } = await _sb.from('infracciones').select('id,estado').eq('folio', q).single();
    if (r) infId = r.id;
  }
  if (!infId) { showToast('QR no reconocido o la infracción no existe'); return; }
  const { data: inf } = await _sb.from('infracciones').select('estado').eq('id', infId).single();
  if (!inf) { showToast('Infracción no encontrada'); return; }
  // Las vencidas también se cobran; solo se rechazan las pagadas, canceladas o en impugnación
  if (inf.estado !== 'pendiente' && inf.estado !== 'vencida') {
    showToast(inf.estado === 'pagada' ? 'Esta infracción ya está pagada' : `Esta infracción está ${inf.estado}: no se puede cobrar`);
    return;
  }
  openRegistrarPago(infId);
}

async function openBuscarParaPago() {
  if ($('buscar-pago-input')) $('buscar-pago-input').value = '';
  if ($('buscar-pago-results')) $('buscar-pago-results').innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Escribe la placa o el folio para cobrar o reimprimir un recibo</div>';
  openModal('modal-buscar-pago');
}

async function buscarInfPago() {
  const q = ($('buscar-pago-input')||{}).value?.trim()||'';
  const el = $('buscar-pago-results'); if (!el) return;
  if (q.length < 2) { el.innerHTML='<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Escribe al menos 2 caracteres</div>'; return; }
  const qf = q.replace(/[,()"'\\%*]/g, ' ').trim();
  // También las pagadas, para reimprimir su recibo
  const { data } = await _sb.from('infracciones').select('id,folio,placa,infractor,tipo,monto,fecha,estado,pagos(id)')
    .in('estado',['pendiente','vencida','pagada']).or(orBuscar(['placa', 'infractor', 'folio'], qf)).order('fecha',{ascending:false}).limit(12);
  const rows = data||[];
  const accion = r => {
    const pagoId = r.estado === 'pagada' ? (Array.isArray(r.pagos) ? r.pagos[0]?.id : r.pagos?.id) : null;
    if (r.estado === 'pagada') return pagoId ? `closeModal('modal-buscar-pago');printReciboPago('${pagoId}')` : `showToast('Pagada: el recibo no está disponible')`;
    return `closeModal('modal-buscar-pago');openRegistrarPago('${r.id}')`;
  };
  el.innerHTML = rows.length ? rows.map(r=>`
    <div class="bp-item" style="display:flex;align-items:center;gap:.75rem;padding:.75rem 1rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s" onmouseenter="this.style.background='var(--stone)'" onmouseleave="this.style.background=''" onclick="${accion(r)}">
      <div style="flex:1">
        <div style="font-size:.82rem;font-weight:700;font-family:monospace">${esc(r.folio||'—')}</div>
        <div style="font-size:.78rem;color:var(--text)">${esc(r.infractor)} · ${esc(r.placa)}</div>
        <div style="font-size:.73rem;color:var(--muted)">${esc(r.tipo)} · ${fmtDateShort(r.fecha)}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:.9rem;font-weight:700;color:var(--ac)">${fmt(r.monto)}</div>
        ${estadoBadge(r.estado)}
        <div style="font-size:.7rem;font-weight:700;color:${r.estado==='pagada'?'var(--muted)':'var(--green)'};margin-top:.2rem">${r.estado==='pagada'?'Reimprimir recibo':'Cobrar'} →</div>
      </div>
    </div>`).join('') : '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:.82rem">Sin resultados</div>';
}

async function asegurarConfig() {
  if (_cachedConfig?.valor_uma !== undefined) return _cachedConfig;
  const { data } = await _sb.from('configuracion').select('*').eq('id', 1).single();
  if (data) _cachedConfig = { ...(_cachedConfig||{}), ...data };
  return _cachedConfig;
}

async function openRegistrarPago(infId) {
  await asegurarConfig().catch(() => {});
  if (!_cachedConfig) _cachedConfig = _leerLocal('tm_config');

  let { data: r, error: errInf } = await _sb.from('infracciones').select('*').eq('id', infId).single();
  window._pagoSinConexion = null;
  if (!r && (!navigator.onLine || esErrorDeRed(errInf))) {
    r = (_leerLocal('tm_pendientes')?.rows || []).find(x => String(x.id) === String(infId));
    window._pagoSinConexion = r || null;
  }
  if (!r) return;
  $('pago-inf-id').value = infId;
  const dias = Math.floor((Date.now()-new Date(r.fecha).getTime())/86400000);
  await cargarCatalogo();
  const grave = !!catalogoPorNumero(r.catalogo_numero)?.grave;
  const tramo = grave ? null : descuentoVigente(r, _cachedConfig);
  const descOk = !!tramo, descPct = tramo?.pct || 0;
  const ultimo = tramosDescuento(_cachedConfig).slice(-1)[0];
  const infoEl = $('pago-inf-info');
  if (infoEl) infoEl.innerHTML = `
    <div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.35rem">Infracción</div>
    <div style="font-size:.92rem;font-weight:700;color:var(--ink)">${esc(r.folio||'—')} — ${esc(r.tipo)}</div>
    <div style="font-size:.8rem;color:var(--text);margin-top:.2rem">${esc(r.infractor)} · Placa: <strong>${esc(r.placa)}</strong></div>
    <div style="font-size:.8rem;color:var(--text)">${fmtDateShort(r.fecha)} · <strong>${fmt(r.monto)}</strong></div>
    ${descOk?`<div style="font-size:.75rem;color:var(--green);margin-top:.3rem;font-weight:600">✓ Elegible para descuento del ${descPct}% (pago dentro de ${tramo.dias} días)</div>`:`<div style="font-size:.75rem;color:var(--muted);margin-top:.3rem">${grave ? 'Esta infracción se paga íntegra, sin descuento (conducir en estado de ebriedad)' : `Sin descuento disponible (han pasado más de ${ultimo?.dias ?? 0} días)`}</div>`}`;
  const descEl = $('pago-descuento');
  if (descEl) {
    descEl.innerHTML = `<option value="0">Sin descuento (100%)</option><option value="${descPct}"${descOk ? '' : ' disabled'}>${descOk ? descPct + '% — pronto pago' : 'Descuento no disponible'}</option>`;
    descEl.value='0';
  }
  if ($('pago-metodo'))  $('pago-metodo').value = 'efectivo';
  if ($('pago-cajero'))  $('pago-cajero').value = _session?.name||'';
  if ($('pago-notas'))   $('pago-notas').value  = '';
  if ($('pago-recibido')) $('pago-recibido').value = '';
  if ($('pago-cambio-display')) $('pago-cambio-display').textContent = '—';
  if ($('pago-efectivo-wrap')) $('pago-efectivo-wrap').style.display = '';
  window._pagoMontoOriginal = r.monto;
  calcularMontoPago();
  if (window._pagoSinConexion && infoEl) infoEl.insertAdjacentHTML('beforeend', '<div style="font-size:.75rem;color:#92400E;background:var(--amber-bg);border-radius:6px;padding:.4rem .6rem;margin-top:.5rem;font-weight:600">Sin conexión: se imprimirá un comprobante provisional y el pago se registrará al volver el internet.</div>');
  openModal('modal-pago');
}

function calcularMontoPago() {
  const desc = parseInt(($('pago-descuento')||{}).value||'0');
  const final = Math.round((window._pagoMontoOriginal||0)*(1-desc/100));
  window._pagoMontoFinal = final;
  const el = $('pago-monto-display'); if (el) el.textContent = fmt(final);
  calcularCambio();
}

function onMetodoChange() {
  const metodo = ($('pago-metodo')||{}).value;
  const wrap = $('pago-efectivo-wrap');
  if (wrap) wrap.style.display = metodo === 'efectivo' ? '' : 'none';
  if (metodo !== 'efectivo') {
    if ($('pago-recibido')) $('pago-recibido').value = '';
    if ($('pago-cambio-display')) $('pago-cambio-display').textContent = '—';
  }
}

function calcularCambio() {
  const recibido = parseFloat(($('pago-recibido')||{}).value)||0;
  const final = window._pagoMontoFinal || 0;
  const cambioEl = $('pago-cambio-display');
  if (!cambioEl) return;
  if (recibido <= 0) { cambioEl.textContent = '—'; cambioEl.style.color = 'var(--green)'; return; }
  const cambio = recibido - final;
  cambioEl.textContent = fmt(Math.max(0, cambio));
  cambioEl.style.color = cambio < 0 ? 'var(--red)' : 'var(--green)';
}

async function submitPago() {
  const infId = $('pago-inf-id')?.value; if (!infId) return;
  const btn = $('pago-submit-btn');
  if (btn) { btn.disabled=true; btn.textContent='Registrando…'; }
  // El servidor calcula el descuento, asigna el cajero y marca la infracción
  // como pagada en una sola operación (evita cobros dobles).
  const metodo = $('pago-metodo')?.value||'efectivo';
  const aplicar = parseInt(($('pago-descuento')||{}).value||'0') > 0, notas = $('pago-notas')?.value?.trim()||'';
  const sinConexion = async () => {
    const r = window._pagoSinConexion || (_leerLocal('tm_pendientes')?.rows || []).find(x => String(x.id) === String(infId));
    if (btn) { btn.disabled=false; btn.textContent='Registrar pago'; }
    if (!r) { alert('Sin conexión y esta infracción no está en la lista guardada de Caja. Intenta de nuevo cuando vuelva el internet.'); return; }
    const c = await encolarCobro(r, aplicar, metodo, notas, window._pagoMontoFinal ?? Number(r.monto));
    closeModal('modal-pago'); closeModal('modal-detail');
    showToast(`Cobro guardado sin conexión: ${fmt(c.monto_final)}`);
    printComprobanteProvisional(c);
    renderPendientesTable();
  };
  if (!navigator.onLine || window._pagoSinConexion) return sinConexion();
  const { data: pago, error } = await _sb.rpc('registrar_pago', {
    p_infraccion_id: parseInt(infId),
    p_aplicar_descuento: aplicar,
    p_metodo: metodo,
    p_notas: notas
  });
  if (error && esErrorDeRed(error)) return sinConexion();
  if (btn) { btn.disabled=false; btn.textContent='Registrar pago'; }
  if (error) { alert('Error: '+error.message); return; }
  const final = Number(pago.monto_final);
  await logActivity('infraccion',`Pago registrado — ${pago.folio_inf||'infracción'}: ${fmt(final)} (${metodo})`);
  closeModal('modal-pago'); closeModal('modal-detail');
  showToast(`Pago registrado: ${fmt(final)} — ${metodo}`);
  printReciboPago(pago.id);
  ofrecerRecibo(pago.id);
  renderInfracciones(); renderDashboard();
  if ($('view-caja')?.style.display==='block') { renderCajaStats(); renderPendientesTable(); renderCajaTable(); }
}

async function printReciboPago(pagoId) {
  const { data: p } = await _sb.from('pagos').select('*, infracciones(folio,tipo,placa,infractor,fecha,ubicacion)').eq('id',pagoId).single();
  const { data: cfg } = await _sb.from('configuracion').select('*').eq('id',1).single();
  if (!p) return;
  const inf = p.infracciones||{};
  const mun = esc(cfg?.municipio||'Municipio'), est = esc(cfg?.estado||'');
  const qrRecibo = qrVerificacion(p.token_verificacion);
  const fechaPago = new Date(p.created_at).toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const horaPago  = new Date(p.created_at).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Recibo ${esc(p.folio_inf||'')}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#f5f5f5;font-size:11px}
    .page{width:215.9mm;min-height:139.7mm;margin:0 auto;background:#fff;padding:12mm 14mm}
    .no-print{text-align:center;padding:8px 0 10px;background:#f5f5f5}
    .no-print button{padding:6px 18px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer;margin:0 3px}
    .hdr{display:flex;align-items:center;gap:6mm;padding-bottom:4mm;border-bottom:3px solid #059669;margin-bottom:5mm}
    .seal{width:14mm;height:14mm;border-radius:50%;border:2px solid #059669;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;color:#059669;flex-shrink:0}
    .ht{flex:1}.gov{font-size:7.5px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.5px}
    .dept{font-size:12px;font-weight:900;color:#1A1F2B;margin:1px 0}.sub{font-size:8px;color:#6B7280}
    .rn{text-align:right}.rnl{font-size:7px;color:#9CA3AF;text-transform:uppercase}.rnv{font-size:14px;font-weight:900;color:#059669;font-family:'Courier New',monospace}
    .tbar{background:#059669;color:#fff;text-align:center;padding:2.5mm 0;margin-bottom:4mm;border-radius:3px}
    .tbar h1{font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase}.tbar p{font-size:8px;opacity:.85;margin-top:1px}
    .cols{display:flex;gap:6mm;margin-bottom:4mm}
    .col{flex:1}.sec{font-size:7px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#059669;border-bottom:1.5px solid #059669;padding-bottom:1mm;margin-bottom:2.5mm}
    .f{margin-bottom:2mm}.fl{font-size:6.5px;text-transform:uppercase;color:#9CA3AF;letter-spacing:.3px;margin-bottom:.3mm}.fv{font-size:10px;color:#1A1F2B;font-weight:500}
    .amount{background:#f0fdf4;border:2px solid #059669;border-radius:4px;text-align:center;padding:3mm;margin:3mm 0}
    .al{font-size:7px;text-transform:uppercase;letter-spacing:1px;color:#059669;font-weight:700;margin-bottom:1mm}
    .av{font-size:24px;font-weight:900;color:#059669}.as{font-size:8px;color:#6B7280;margin-top:.5mm}
    .stamp{position:absolute;right:18mm;top:45mm;border:3px solid #059669;color:#059669;font-size:18px;font-weight:900;letter-spacing:3px;padding:2mm 5mm;border-radius:3px;transform:rotate(-8deg);opacity:.65}
    .page{position:relative}
    .sig{display:flex;gap:10mm;margin-top:6mm}.sb{flex:1;text-align:center}.sl{height:8mm;border-bottom:1.5px solid #374151;margin-bottom:1mm}.sn{font-size:8.5px;font-weight:700}.st{font-size:7px;color:#6B7280}
    .foot{text-align:center;font-size:7px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:2.5mm;margin-top:4mm}
    @media print{body{background:#fff}.no-print{display:none!important}.page{margin:0;padding:10mm 12mm;width:100%}@page{margin:0;size:letter portrait}}
  </style></head><body>
  <div class="no-print"><button onclick="window.print()">Imprimir recibo</button><button onclick="window.close()">Cerrar</button></div>
  <div class="page">
    <div class="stamp">PAGADO</div>
    <div class="hdr">
      <div class="seal">HCE</div>
      <div class="ht"><div class="gov">Gobierno Municipal · ${mun}</div><div class="dept">Dirección de Tránsito y Movilidad</div><div class="sub">${est}</div></div>
      <div class="rn"><div class="rnl">Núm. de recibo</div><div class="rnv">REC-${String(p.id).padStart(6,'0')}</div></div>
    </div>
    <div class="tbar"><h1>Recibo de Pago de Infracción</h1><p>Emitido el ${fechaPago} a las ${horaPago}</p></div>
    <div class="cols">
      <div class="col">
        <div class="sec">Infracción pagada</div>
        <div class="f"><div class="fl">Folio</div><div class="fv" style="font-family:monospace;font-weight:700">${esc(p.folio_inf||'—')}</div></div>
        <div class="f"><div class="fl">Tipo</div><div class="fv">${esc(inf.tipo||'—')}</div></div>
        <div class="f"><div class="fl">Fecha infracción</div><div class="fv">${fmtDateShort(inf.fecha)}</div></div>
        <div class="f"><div class="fl">Infractor</div><div class="fv" style="font-weight:700">${esc(inf.infractor||'—')}</div></div>
        <div class="f"><div class="fl">Placa</div><div class="fv" style="font-family:monospace">${esc(inf.placa||'—')}</div></div>
      </div>
      <div class="col">
        <div class="sec">Detalle del pago</div>
        <div class="f"><div class="fl">Monto original</div><div class="fv">${fmt(p.monto_original)}</div></div>
        <div class="f"><div class="fl">Descuento</div><div class="fv" style="color:#059669">${p.descuento_pct>0?p.descuento_pct+'%':'Sin descuento'}</div></div>
        <div class="f"><div class="fl">Método de pago</div><div class="fv" style="text-transform:capitalize">${esc(p.metodo)}</div></div>
        <div class="f"><div class="fl">Cajero</div><div class="fv">${esc(p.cajero||'—')}</div></div>
        <div class="amount"><div class="al">Total cobrado</div><div class="av">${fmt(p.monto_final)}</div><div class="as">MXN — ${esc(p.metodo.charAt(0).toUpperCase()+p.metodo.slice(1))}</div></div>
      </div>
    </div>
    <div class="sig">
      <div class="sb"><div class="sl"></div><div class="sn">${esc(p.cajero||'Cajero')}</div><div class="st">Cajero que recibe</div></div>
      <div class="sb"><div class="sl"></div><div class="sn">${esc(inf.infractor||'Infractor')}</div><div class="st">Firma de conformidad</div></div>
    </div>
    ${qrRecibo?`<div style="display:flex;align-items:center;justify-content:center;gap:3mm;margin-top:4mm"><img src="${qrRecibo}" style="width:20mm;height:20mm"/><div style="font-size:7.5px;color:#555;max-width:70mm;line-height:1.4">Escanee el código para verificar que este recibo es auténtico.</div></div>`:''}
    <div class="foot">Recibo REC-${String(p.id).padStart(6,'0')} · Infracción ${esc(p.folio_inf||'')}. Este documento acredita el pago total. Expedido por Dirección de Tránsito, ${mun}.</div>
  </div>
  <script>setTimeout(()=>window.print(),600)<\/script>
  </body></html>`;
  const win = window.open('','_blank','width=900,height=700');
  if (win) { win.document.write(conMarca(html)); win.document.close(); }
}

