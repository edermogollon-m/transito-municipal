// ── Vencimientos automáticos ──────────────────────────────
async function checkAndUpdateVencidos() {
  // También corre a diario en el servidor (pg_cron); aquí solo se adelanta.
  await _sb.rpc('marcar_infracciones_vencidas');
}

// ── Leer la placa con la cámara (OCR en el navegador con Tesseract.js) ──
// La librería (~3 MB con el modelo) se descarga solo la primera vez que se usa.
// El resultado siempre queda en el campo para que el oficial lo confirme.
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let _ocrWorker = null;

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const el = document.createElement('script');
    el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('No se pudo descargar el lector de placas'));
    document.head.appendChild(el);
  });
}

// Busca en el texto leído algo con forma de placa: 5 a 8 letras y números
// mezclados (ABC-123-D, ABC-12-34, 123-ABC…), ignorando "MÉXICO", el estado, etc.
function extraerPlaca(texto) {
  const candidatos = [];
  String(texto || '').toUpperCase().split(/\n+/).forEach(linea => {
    const tokens = linea.replace(/[^A-Z0-9\-\s]/g, ' ').split(/[\s\-]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      for (let n = 1; n <= 3 && i + n <= tokens.length; n++) {
        const partes = tokens.slice(i, i + n);
        if (n > 1 && partes.some(p => p.length > 4)) continue;   // "MEXICO", "LEON"… no son parte de la placa
        const plano = partes.join('');
        if (plano.length >= 5 && plano.length <= 8 && /[A-Z]/.test(plano) && /\d/.test(plano)) candidatos.push({ partes, plano });
      }
    }
  });
  if (!candidatos.length) return '';
  const forma = p => /^[A-Z]{3}\d{3}[A-Z]$/.test(p) || /^[A-Z]{3}\d{4}$/.test(p) || /^\d{3}[A-Z]{3}$/.test(p) || /^[A-Z]\d{2}[A-Z]{3}$/.test(p);
  const puntos = c => (forma(c.plano) ? 4 : 0) + (c.plano.length === 7 ? 2 : c.plano.length === 6 ? 1 : 0) + (c.partes.length > 1 ? 1 : 0);
  const mejor = candidatos.sort((a, b) => puntos(b) - puntos(a))[0];
  if (mejor.partes.length > 1) return mejor.partes.join('-');
  // Sin separadores: formato más común de placa mexicana
  const m = mejor.plano.match(/^([A-Z]{3})(\d{3})([A-Z])$/) || mejor.plano.match(/^([A-Z]{3})(\d{3,4})$/) || mejor.plano.match(/^(\d{3})([A-Z]{3})$/);
  return m ? m.slice(1).join('-') : mejor.plano;
}

// Escala de grises y más contraste: Tesseract lee mucho mejor así
async function prepararImagenPlaca(file) {
  const url = await compressPhoto(file, 1400);
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const v = Math.max(0, Math.min(255, (g - 128) * 1.6 + 128));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

async function leerPlacaDesdeArchivo(file) {
  if (!file) return;
  const st = $('placa-ocr-status'), btn = $('btn-placa-camara');
  const msg = (t, color) => { if (st) { st.textContent = t; st.style.color = color || 'var(--muted)'; } };
  if (btn) btn.disabled = true;
  try {
    msg(_ocrWorker ? 'Leyendo la placa…' : 'Preparando el lector (solo la primera vez tarda un poco)…');
    await cargarScript(TESSERACT_URL);
    if (!_ocrWorker) {
      _ocrWorker = await Tesseract.createWorker('eng');
      await _ocrWorker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ' });
    }
    msg('Leyendo la placa…');
    const { data } = await _ocrWorker.recognize(await prepararImagenPlaca(file));
    const placa = extraerPlaca(data?.text);
    if (!placa) { msg('No se encontró la placa en la foto. Acércate más o escríbela a mano.', 'var(--amber)'); return; }
    $('inf-placa').value = placa;
    msg(`Leída: ${placa}. Revisa que coincida con la placa del vehículo.`, 'var(--green)');
    await checkPlacaHistory();
    updateInfSummary();
  } catch (err) {
    msg(navigator.onLine ? 'No se pudo leer la placa. Escríbela a mano.' : 'Sin señal: la primera lectura necesita internet. Escribe la placa a mano.', 'var(--red)');
    console.warn('OCR placa:', err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ── Historial por placa + auto-fill desde padrón vehicular ──
async function checkPlacaHistory() {
  const placa = ($('inf-placa')||{}).value?.trim().toUpperCase();
  const panel = $('placa-history');
  if (!panel) return;
  if (!placa || placa.length < 3) { panel.innerHTML = ''; window._placaAdeudos = []; return; }

  // Consultar historial completo y padrón vehicular en paralelo
  const [{ data }, { data: veh }] = await Promise.all([
    _sb.from('infracciones').select('id,folio,fecha,tipo,estado,monto,boleta').eq('placa', placa).order('fecha',{ascending:false}),
    _sb.from('vehiculos').select('propietario,marca,modelo,color,telefono').eq('placa', placa).maybeSingle()
  ]);

  // Auto-completar campos del formulario si están vacíos
  if (veh) {
    const infractor = $('inf-infractor');
    if (infractor && !infractor.value) infractor.value = veh.propietario || '';
    const vehiculo = $('inf-vehiculo');
    if (vehiculo && !vehiculo.value) vehiculo.value = [veh.marca, veh.modelo].filter(Boolean).join(' ');
    const color = $('inf-color');
    if (color && !color.value) color.value = veh.color || '';
    const tel = $('inf-telefono');
    if (tel && !tel.value) tel.value = veh.telefono || '';
  }

  const prevId  = $('inf-id')?.value;
  const prev    = (data||[]).filter(r => String(r.id) !== String(prevId));
  // Las infracciones de la boleta que se está levantando no son adeudos anteriores
  const adeudos = prev.filter(r => (r.estado === 'pendiente' || r.estado === 'vencida') && !(_boletaGrupo && r.boleta === _boletaGrupo));
  const montoAdeudos = adeudos.reduce((a,r) => a + Number(r.monto), 0);

  // Guardar adeudos para consultarlos en submitInfraccion sin otra llamada a la BD
  window._placaAdeudos = adeudos;
  sugerirAgravanteAdeudos();
  window._placaMontoAdeudos = montoAdeudos;

  let html = '';

  // Banner verde: vehículo en padrón
  if (veh) {
    html += `<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:.55rem .9rem;margin:.35rem 0;font-size:.77rem;color:#065F46">
      ✓ En padrón: <strong>${esc(veh.propietario)}</strong>${veh.marca?` · ${esc([veh.marca,veh.modelo].filter(Boolean).join(' '))}`:''}${veh.color?` · ${esc(veh.color)}`:''}
    </div>`;
  }

  // Banner rojo: adeudos sin pagar (más prominente)
  if (adeudos.length > 0) {
    html += `
    <div style="background:#FEF2F2;border:2px solid #DC2626;border-radius:8px;padding:.75rem 1rem;margin:.35rem 0">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.45rem;flex-wrap:wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span style="font-size:.8rem;font-weight:800;color:#DC2626">
          ${adeudos.length} ADEUDO${adeudos.length>1?'S':''} SIN PAGAR — Total: ${fmt(montoAdeudos)}
        </span>
      </div>
      ${adeudos.slice(0,3).map(r=>`
        <div style="font-size:.72rem;color:#991B1B;display:flex;gap:.5rem;margin-bottom:.2rem;flex-wrap:wrap;align-items:center">
          <span style="font-family:monospace;font-weight:700">${esc(r.folio||'—')}</span>
          <span>${fmtDateShort(r.fecha)}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.tipo)}</span>
          <span style="font-weight:700">${fmt(r.monto)}</span>
          ${estadoBadge(r.estado)}
        </div>`).join('')}
      ${adeudos.length>3?`<div style="font-size:.7rem;color:#9CA3AF;margin-top:.2rem">+ ${adeudos.length-3} adeudo${adeudos.length-3>1?'s':''} más</div>`:''}
      <div style="font-size:.73rem;color:#7F1D1D;margin-top:.5rem;padding-top:.45rem;border-top:1px solid #FECACA;font-weight:600">
        📌 El infractor debe regularizar sus adeudos en <strong>Tesorería Municipal</strong> (ventanilla de infracciones, Lun–Vie 8:00–15:00 h).
      </div>
    </div>`;
  }

  // Banner ámbar: reincidente en general (infracciones anteriores pagadas u otras)
  const otrasInf = prev.filter(r => r.estado !== 'pendiente' && r.estado !== 'vencida');
  if (otrasInf.length > 0) {
    html += `
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:.55rem .9rem;margin:.35rem 0">
      <div style="font-size:.75rem;font-weight:700;color:#92400E;margin-bottom:.35rem">
        ⚠ Reincidente — ${prev.length} ${prev.length>1?'infracciones':'infracción'} previa${prev.length>1?'s':''} en el historial
      </div>
      ${otrasInf.slice(0,2).map(r=>`
        <div style="font-size:.71rem;color:#78350F;display:flex;gap:.5rem;margin-bottom:.15rem;flex-wrap:wrap;align-items:center">
          <span style="font-family:monospace;font-weight:700">${esc(r.folio||'—')}</span>
          <span>${fmtDateShort(r.fecha)}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.tipo)}</span>
          ${estadoBadge(r.estado)}
        </div>`).join('')}
    </div>`;
  }

  panel.innerHTML = html || '';
}

