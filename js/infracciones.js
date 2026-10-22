// ── Infracciones ──────────────────────────────────────────
let _infPage = 1, _infSearch = '', _infEstado = '', _infTipo = '', _infPeriodo = '', _infSort = 'fecha_desc';
let _infMias = !!_permisosRol.soloMias;   // el policía vial ve primero sus boletas
const INF_PAGE_SIZE = 15;

function _periodoRango(periodo) {
  const now = new Date();
  if (periodo === 'hoy') {
    return now.toISOString().slice(0,10);
  }
  if (periodo === 'semana') {
    const d = new Date(now); d.setDate(d.getDate()-7); return d.toISOString();
  }
  if (periodo === 'mes') {
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01T00:00:00`;
  }
  if (periodo === 'mes3') {
    const d = new Date(now); d.setMonth(d.getMonth()-3); return d.toISOString();
  }
  return null;
}

async function renderInfracciones() {
  const tbody = $('inf-table');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--muted)">Cargando…</td></tr>`;

  // Populate tipo filter on first run
  const tipoEl = $('inf-tipo-filter');
  if (tipoEl && tipoEl.options.length <= 1) {
    const tipos = [...TIPOS_BASE];
    if (_cachedConfig?.tipos_extra) tipos.push(...(_cachedConfig.tipos_extra||[]));
    tipoEl.innerHTML = '<option value="">Todos los tipos</option>' +
      [...new Set(tipos)].filter(t=>t&&t!=='Otro').map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('') +
      '<option value="Otro">Otro</option>';
  }

  // Solo las columnas de la tabla: la boleta completa (fotos, firmas) se pide al abrir el detalle.
  if (_infMias) await _authListo;
  const consulta = () => {
    let q = _sb.from('infracciones').select('id,folio,fecha,placa,infractor,tipo,monto,estado,oficial,telefono,ubicacion');
    if (_infMias) q = q.or(filtroMios());
    if (_infEstado)  q = q.eq('estado', _infEstado);
    if (_infTipo)    q = q.eq('tipo', _infTipo);
    if (_infSearch)  q = q.or(orBuscar(['placa', 'infractor', 'folio'], _infSearch));
    if (_infPeriodo) {
      const desde = _periodoRango(_infPeriodo);
      if (_infPeriodo === 'hoy') {
        q = q.gte('fecha', desde+'T00:00:00').lte('fecha', desde+'T23:59:59');
      } else if (desde) {
        q = q.gte('fecha', desde);
      }
    }

    // Sort
    const [sortCol, sortDir] = _infSort.split('_');
    const asc = sortDir === 'asc';
    if (sortCol === 'monto') q = q.order('monto', {ascending: asc});
    else if (sortCol === 'folio') q = q.order('id', {ascending: asc});   // los folios son aleatorios (folios.sql)
    else q = q.order('fecha', {ascending: asc});
    return q;
  };

  const { data, error } = await todas(consulta);
  if (error) { tbody.innerHTML = `<tr><td colspan="9" style="color:red">${esc(error.message)}</td></tr>`; return; }

  const all = data || [];

  // Stats strip
  const strip = $('inf-stats-strip');
  if (strip) {
    const pend = all.filter(r=>r.estado==='pendiente');
    const paga = all.filter(r=>r.estado==='pagada');
    const venc = all.filter(r=>r.estado==='vencida');
    const montoPend = pend.reduce((a,r)=>a+Number(r.monto),0);
    const montoRec  = paga.reduce((a,r)=>a+Number(r.monto),0);
    const pill = (label, num, sub, color) =>
      `<div class="inf-stat-pill">
        <span style="color:${color||'var(--muted)'}">●</span>
        <span><span class="isp-num">${num}</span> ${label}${sub?`<span class="isp-amt"> · ${sub}</span>`:''}</span>
      </div>`;
    strip.innerHTML =
      pill('total', all.length, '', 'var(--subtle)') +
      pill('pendientes', pend.length, fmt(montoPend), 'var(--amber)') +
      pill('pagadas', paga.length, fmt(montoRec), 'var(--green)') +
      (venc.length ? pill('vencidas', venc.length, '', 'var(--red)') : '');
  }

  // Reincidentes (placas con > 1 infracción en el set)
  const placaCount = {};
  all.forEach(r => { placaCount[r.placa] = (placaCount[r.placa]||0)+1; });

  // Sort header indicators
  ['folio','fecha','monto'].forEach(col => {
    const el = $('th-'+col);
    if (!el) return;
    const isActive = _infSort.startsWith(col);
    el.classList.toggle('active', isActive);
    const icon = el.querySelector('.th-sort-icon');
    if (icon) icon.textContent = isActive ? (_infSort.endsWith('asc') ? '↑' : '↓') : '↕';
  });

  // Count label
  const countEl = $('inf-count-label');
  if (countEl) {
    const filterActive = _infSearch || _infEstado || _infTipo || _infPeriodo;
    countEl.textContent = filterActive
      ? `${all.length} resultado${all.length!==1?'s':''} con los filtros aplicados`
      : `${all.length} ${all.length!==1?'infracciones':'infracción'} en total`;
  }

  // Pagination
  const pages = Math.max(1, Math.ceil(all.length/INF_PAGE_SIZE));
  if (_infPage > pages) _infPage = pages;
  const rows = all.slice((_infPage-1)*INF_PAGE_SIZE, _infPage*INF_PAGE_SIZE);

  const montoColor = { pagada:'var(--green)', vencida:'var(--red)', pendiente:'var(--amber)', impugnada:'var(--blue)', cancelada:'var(--muted)' };

  tbody.innerHTML = rows.length ? rows.map(r=>`
    <tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer">
      <td class="mono" style="font-size:.73rem;font-weight:700">${esc(r.folio||'—')}</td>
      <td style="font-size:.78rem;white-space:nowrap">${fmtDateShort(r.fecha)}</td>
      <td>
        <span style="font-family:monospace;font-weight:700;font-size:.8rem">${esc(r.placa)}</span>
        ${placaCount[r.placa]>1?`<span title="${placaCount[r.placa]} infracciones — Reincidente" style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:var(--amber-bg);color:var(--amber);font-size:.55rem;font-weight:800;margin-left:.25rem;cursor:default">R</span>`:''}
      </td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.infractor)}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem">${esc(r.tipo)}</td>
      <td style="font-weight:700;color:${montoColor[r.estado]||'var(--text)'}">${fmt(r.monto)}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td style="font-size:.75rem;color:var(--muted);max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.oficial||'—')}</td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap;text-align:right;padding-right:.6rem">
        ${(r.estado==='pendiente'||r.estado==='vencida')?`<button class="btn btn-sm" style="background:var(--green-bg);color:var(--green);border:1px solid #A7F3D0;padding:.25rem .6rem;font-size:.72rem" onclick="event.stopPropagation();openRegistrarPago('${r.id}')" title="Registrar pago">Cobrar</button>`:''}
        ${r.telefono?`<button class="btn-wa-icon" style="margin-left:.2rem"
          data-tel="${r.telefono.replace(/\D/g,'')}"
          data-nombre="${esc(r.infractor)}"
          data-folio="${esc(r.folio||'')}"
          data-placa="${esc(r.placa||'')}"
          data-tipo="${esc(r.tipo)}"
          data-monto="${r.monto||0}"
          data-ubicacion="${esc(r.ubicacion)}"
          data-fecha="${r.fecha||''}"
          onclick="event.stopPropagation();_waFromBtn(this)"
          title="Enviar WhatsApp">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#128C7E" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        </button>`:''}
      </td>
    </tr>`).join('')
    : `<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:2rem">Sin resultados</td></tr>`;

  renderPager('inf-pager', _infPage, pages, 'goInfPage');
}

function sortInf(col) {
  if (_infSort === col+'_desc') _infSort = col+'_asc';
  else _infSort = col+'_desc';
  renderInfracciones();
}

function limpiarFiltrosInf() {
  _infSearch = ''; _infEstado = ''; _infTipo = ''; _infPeriodo = ''; _infSort = 'fecha_desc';
  if ($('inf-search'))        $('inf-search').value = '';
  if ($('inf-estado-filter')) $('inf-estado-filter').value = '';
  if ($('inf-tipo-filter'))   $('inf-tipo-filter').value = '';
  if ($('inf-periodo-filter')) $('inf-periodo-filter').value = '';
  _infPage = 1;
  renderInfracciones();
}

function filterInfracciones() {
  _infSearch  = ($('inf-search')||{}).value||'';
  _infEstado  = ($('inf-estado-filter')||{}).value||'';
  _infTipo    = ($('inf-tipo-filter')||{}).value||'';
  _infPeriodo = ($('inf-periodo-filter')||{}).value||'';
  if ($('inf-alcance')) _infMias = $('inf-alcance').value === 'mias';
  _infPage = 1;
  renderInfracciones();
}

async function submitInfraccion(e) {
  e.preventDefault();
  const btn = $('inf-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }

  const id = $('inf-id').value;

  // Sin señal (solo boletas nuevas): se guarda en el dispositivo y se sube sola
  // al volver internet. Las fotos se guardan comprimidas para subirlas después.
  let sinSenal = !id && !navigator.onLine;

  // Fotos: se comprimen y se suben a Storage; en la base solo van las rutas
  let fotosArr = [], fotosPendientes = [];
  if (!sinSenal) {
    try { fotosArr = await subirFotos(document.getElementById('inf-fotos'), 'infracciones'); }
    catch (err) {
      if (!id && esErrorDeRed(err)) sinSenal = true;
      else {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
        alert('No se pudieron subir las fotos: ' + err.message); return;
      }
    }
  }
  if (sinSenal) fotosPendientes = await fotosComoDataURL(document.getElementById('inf-fotos'));

  const payload = {
    fecha:          $('inf-fecha').value ? new Date($('inf-fecha').value).toISOString() : new Date().toISOString(),
    placa:          $('inf-placa').value.trim().toUpperCase(),
    infractor:      $('inf-infractor').value.trim(),
    licencia:       ($('inf-licencia')||{}).value?.trim() || '',
    vehiculo:       ($('inf-vehiculo')||{}).value?.trim() || '',
    color_vehiculo: ($('inf-color')||{}).value?.trim()    || '',
    oficial:        ($('inf-oficial')||{}).value?.trim()  || '',
    tipo:           $('inf-tipo').value,
    catalogo_numero: parseInt(($('inf-catalogo')||{}).value) || null,
    monto:          parseInt($('inf-monto').value)||0,
    ubicacion:      $('inf-ubicacion').value.trim(),
    estado:         $('inf-est').value,
    obs:            $('inf-obs').value.trim(),
    telefono:       ($('inf-telefono')||{}).value?.trim() || '',
    infractor_domicilio: ($('inf-domicilio')||{}).value?.trim() || '',
    infractor_correo:    ($('inf-correo')||{}).value?.trim() || '',
    infractor_ausente:   !!($('inf-ausente')||{}).checked,
    licencia_tipo:       ($('inf-licencia-tipo')||{}).value?.trim() || '',
    circunstancias:      circunstanciasSeleccionadas(),
    documento_retenido:  ($('inf-doc-retenido')||{}).value || '',
    documento_numero:    ($('inf-doc-numero')||{}).value?.trim() || '',
    firma_infractor:     firmaDataURL('firma-infractor'),
    firma_oficial:       firmaDataURL('firma-oficial'),
    firma_negada:        !!($('inf-firma-negada')||{}).checked,
    lat:            window._infLat || null,
    lng:            window._infLng || null,
    fotos:          fotosArr.length ? JSON.stringify(fotosArr) : (id ? undefined : '[]')
  };
  if (payload.fotos === undefined) delete payload.fotos;

  // Fundamento legal: obligatorio en altas; el tipo libre toma la descripción del reglamento
  const cat = catalogoPorNumero(payload.catalogo_numero);
  if (!id && !cat) {
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
    alert('Selecciona el artículo del reglamento que fundamenta la infracción.');
    $('inf-catalogo-buscar')?.focus();
    return;
  }
  if (!payload.catalogo_numero) delete payload.catalogo_numero;
  if (cat && payload.tipo === 'Otro') payload.tipo = cat.descripcion;

  // Motivación (art. 327 fr. II inciso b): domicilio, o constancia de que no se proporcionó
  if (!id && !payload.infractor_domicilio && !payload.infractor_ausente) {
    if (!confirm('Falta el domicilio del infractor.\n\n¿Hacer constar que no se encontraba presente o no lo proporcionó (art. 327)?')) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
      $('inf-domicilio')?.focus();
      return;
    }
    payload.infractor_ausente = true;
    if ($('inf-ausente')) $('inf-ausente').checked = true;
  }
  if (!id && !payload.firma_infractor && !payload.firma_negada) {
    if (!confirm('El infractor no ha firmado.\n\n¿Hacer constar que se negó a firmar?')) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
      return;
    }
    payload.firma_negada = true;
  }
  if (!id) payload.boleta = _boletaGrupo || (_boletaGrupo = crypto.randomUUID());
  const continuar = { datos: datosBoletaActual(), circunstancias: [], lat: window._infLat, lng: window._infLng,
    firmas: { infractor: payload.firma_infractor, oficial: payload.firma_oficial }, firmaNegada: payload.firma_negada };

  if (sinSenal) {
    await encolarBoleta(payload, fotosPendientes);
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
    closeModal('modal-infraccion');
    showToast('Sin señal: la boleta quedó guardada en este dispositivo y se subirá sola');
    if (confirm('¿Registrar otra infracción del mismo conductor en esta boleta?')) {
      _boletaGrupo = payload.boleta; continuar.n = await contarBoleta(payload.boleta); openNewInfraccion(continuar);
    }
    return;
  }

  // ── Verificar adeudos antes de registrar infracción nueva ──
  if (!id) {
    // Usar cache de checkPlacaHistory si la placa coincide, si no consultar la BD
    let adeudos = window._placaAdeudos || [];
    let montoAdeudos = window._placaMontoAdeudos || 0;

    // Si el cache está vacío o puede ser de otra placa, consultar de nuevo
    if (!adeudos.length) {
      const { data: adData } = await _sb.from('infracciones')
        .select('folio,monto,tipo,boleta').eq('placa', payload.placa).in('estado',['pendiente','vencida']);
      adeudos = (adData || []).filter(r => !(_boletaGrupo && r.boleta === _boletaGrupo));
      montoAdeudos = adeudos.reduce((a,r)=>a+Number(r.monto),0);
    }

    if (adeudos.length > 0) {
      const folios = adeudos.slice(0,3).map(a=>a.folio||'—').join(', ');
      const confirmMsg =
        `⚠ ADEUDOS PENDIENTES DE PAGO\n\n` +
        `La placa ${esc(payload.placa)} tiene ${adeudos.length} ${adeudos.length>1?'infracciones':'infracción'} sin pagar por un total de $${montoAdeudos.toLocaleString('es-MX')} MXN.\n` +
        `Folios: ${folios}${adeudos.length>3?` y ${adeudos.length-3} más`:''}\n\n` +
        `El infractor deberá regularizar sus adeudos en Tesorería Municipal.\n\n` +
        `¿Desea registrar la nueva infracción de todas formas?`;

      const ok = window.confirm(confirmMsg);
      if (!ok) {
        if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
        return;
      }

      // Auto-anotar en observaciones
      const adeudoNota = `Reincidente con ${adeudos.length} adeudo${adeudos.length>1?'s':''} previo${adeudos.length>1?'s':''} sin pagar ($${montoAdeudos.toLocaleString('es-MX')} MXN) — Debe regularizar en Tesorería Municipal`;
      payload.obs = payload.obs ? `${payload.obs} | ${adeudoNota}` : adeudoNota;
    }
  }

  if (id) {
    const { error } = await _sb.from('infracciones').update(payload).eq('id', id);
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('infraccion', `Infracción actualizada — ${payload.tipo} (${payload.placa})`);
    closeModal('modal-infraccion');
  } else {
    payload.token_verificacion = crypto.randomUUID();
    const { data, error } = await _sb.from('infracciones').insert(payload).select().single();
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Registrar infracción'; }
    if (error && esErrorDeRed(error)) {
      // Se cayó la señal justo al guardar: a la cola, con las fotos ya subidas
      await encolarBoleta(payload, []);
      closeModal('modal-infraccion');
      showToast('Se perdió la señal: la boleta quedó guardada y se subirá sola');
      return;
    }
    if (error) { alert('Error: '+error.message); return; }
    await logActivity('infraccion', `Infracción ${data.folio} registrada — ${payload.tipo} (${payload.placa})`);
    closeModal('modal-infraccion');
    if (confirm(`Infracción ${data.folio} registrada.\n\n¿Registrar otra infracción del mismo conductor en esta boleta? (art. 327)`)) {
      continuar.n = await contarBoleta(data.boleta);
      openNewInfraccion(continuar);
      renderInfracciones(); renderDashboard();
      return;
    }
    _boletaGrupo = null;
    // Conductor ausente: aviso corto con QR para dejar en el parabrisas
    if (payload.infractor_ausente) printParabrisas(data.id); else printTicket80(data.id);
    if (payload.telefono) notificarWhatsApp(data);
  }

  renderInfracciones();
  renderDashboard();
}

async function contarBoleta(boleta) {
  try { const { count } = await _sb.from('infracciones').select('id', { count: 'exact', head: true }).eq('boleta', boleta); return count || 1; }
  catch (_) { return 1; }
}

// Infracciones de la misma boleta, con la de mayor cuantía primero
async function infraccionesDeBoleta(r) {
  if (!r.boleta) return [r];
  const { data } = await _sb.from('infracciones').select('id,folio,tipo,fundamento,monto,circunstancias,catalogo_numero').eq('boleta', r.boleta).order('monto', { ascending: false });
  return data && data.length ? data : [r];
}

// ── Boletas sin señal ─────────────────────────────────────
// Si el oficial no tiene internet, la boleta se guarda en IndexedDB (con sus
// fotos comprimidas) y se sube sola cuando vuelve la señal. Cada boleta lleva
// su token_verificacion desde el dispositivo: si la subida se corta a medias y
// se reintenta, el índice único de ese token evita que quede duplicada.
const esErrorDeRed = err => /failed to fetch|networkerror|network request failed|load failed/i.test(String(err?.message || err || ''));

function _colaDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('transito', 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('boletas')) db.createObjectStore('boletas', { keyPath: 'token' });
      if (!db.objectStoreNames.contains('cobros')) db.createObjectStore('cobros', { keyPath: 'token' });   // Caja sin conexión
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function _colaTx(modo, fn, store = 'boletas') {
  const db = await _colaDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, modo);
    const out = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}
const colaListar = () => _colaTx('readonly', st => st.getAll()).then(r => r || []);
const colaGuardar = item => _colaTx('readwrite', st => st.put(item));
const colaQuitar = token => _colaTx('readwrite', st => st.delete(token));
const cobrosListar = () => _colaTx('readonly', st => st.getAll(), 'cobros').then(r => r || []);
const cobrosGuardar = item => _colaTx('readwrite', st => st.put(item), 'cobros');
const cobrosQuitar = token => _colaTx('readwrite', st => st.delete(token), 'cobros');

async function fotosComoDataURL(fileInput) {
  const out = [];
  if (!fileInput || !fileInput.files.length) return out;
  for (let i = 0; i < Math.min(fileInput.files.length, 3); i++) out.push(await compressPhoto(fileInput.files[i]));
  return out;
}

async function encolarBoleta(payload, fotos) {
  const token = payload.token_verificacion || crypto.randomUUID();
  await colaGuardar({ token, payload: { ...payload, token_verificacion: token }, fotos: fotos || [], guardada: new Date().toISOString(), error: '' });
  await actualizarIndicadorCola();
}

let _sincronizando = false;
async function sincronizarCola() {
  if (_sincronizando || !navigator.onLine) return;
  _sincronizando = true;
  const subidas = [];
  try {
    for (const item of await colaListar()) {
      try {
        const p = { ...item.payload };
        if (item.fotos.length) {
          const rutas = [];
          for (const f of item.fotos) {
            const blob = await (await fetch(f)).blob();
            const ruta = `infracciones/${new Date(p.fecha).getFullYear()}/${crypto.randomUUID()}.jpg`;
            const { error } = await _sb.storage.from('evidencias').upload(ruta, blob, { contentType: 'image/jpeg' });
            if (error) throw error;
            rutas.push(ruta);
          }
          p.fotos = JSON.stringify(rutas);
          // Si algo falla más adelante, no volver a subir las mismas fotos
          await colaGuardar({ ...item, payload: p, fotos: [] });
        }
        const nota = `Capturada sin señal el ${new Date(item.guardada).toLocaleString('es-MX')}`;
        p.obs = p.obs ? `${p.obs} | ${nota}` : nota;
        let { data, error } = await _sb.from('infracciones').insert(p).select('id,folio,placa,tipo').single();
        if (error && error.code === '23505') {
          // Ya se había subido (se cortó la respuesta): tomar la existente
          ({ data, error } = await _sb.from('infracciones').select('id,folio,placa,tipo').eq('token_verificacion', item.token).single());
        }
        if (error) throw error;
        await colaQuitar(item.token);
        subidas.push(data);
        logActivity('infraccion', `Infracción ${data.folio} registrada sin señal — ${data.tipo} (${data.placa})`).catch(() => {});
      } catch (err) {
        if (esErrorDeRed(err)) break;          // sigue sin señal: reintentar después
        await colaGuardar({ ...(await colaListar()).find(i => i.token === item.token) || item, error: err.message || String(err) });
      }
    }
  } finally {
    _sincronizando = false;
    await actualizarIndicadorCola();
  }
  if (subidas.length) {
    showToast(subidas.length === 1 ? `Se subió la boleta ${subidas[0].folio} levantada sin señal`
                                   : `Se subieron ${subidas.length} boletas levantadas sin señal`);
    if ($('view-infracciones')?.classList.contains('active')) renderInfracciones();
    if ($('view-dashboard')?.classList.contains('active')) renderDashboard();
  }
  return subidas;
}

async function actualizarIndicadorCola() {
  let items = [];
  try { items = await colaListar(); } catch (_) {}
  let el = $('cola-boletas');
  if (!items.length) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('button');
    el.id = 'cola-boletas';
    el.type = 'button';
    el.className = 'cola-chip';
    el.onclick = () => verColaBoletas();
    const right = document.querySelector('.topbar-right');
    if (right) right.prepend(el); else document.body.appendChild(el);
  }
  const conError = items.filter(i => i.error).length;
  el.classList.toggle('cola-error', !!conError);
  el.textContent = `${items.length} ${items.length === 1 ? 'boleta' : 'boletas'} por subir`;
  el.title = conError ? 'Hay boletas que no se pudieron subir: toca para ver' : 'Se subirán solas al volver la señal';
}

async function verColaBoletas() {
  const items = await colaListar();
  if (navigator.onLine) await sincronizarCola();
  const quedan = await colaListar();
  if (!quedan.length) return;
  const lineas = quedan.map(i => `• ${i.payload.placa} · ${i.payload.tipo} · ${new Date(i.guardada).toLocaleString('es-MX')}` + (i.error ? `\n   No se pudo subir: ${i.error}` : ''));
  alert(`${quedan.length} ${quedan.length === 1 ? 'boleta guardada' : 'boletas guardadas'} en este dispositivo:\n\n${lineas.join('\n')}\n\n` +
        (navigator.onLine ? 'Se reintentará en unos minutos.' : 'Se subirán solas cuando vuelva la señal.'));
}

// ── Caja sin conexión ─────────────────────────────────────
// Caja guarda la última lista de pendientes. Sin internet, el cobro se anota
// en IndexedDB con su token (el del recibo) y la hora real del cobro; al volver
// la señal, registrar_pago_diferido lo registra con el descuento que tocaba a
// esa hora. Si otra caja ya la cobró, queda marcado para revisarlo a mano.
async function encolarCobro(r, aplicarDescuento, metodo, notas, montoFinal) {
  const item = {
    token: crypto.randomUUID(), infraccion_id: Number(r.id), folio: r.folio || '', placa: r.placa || '', infractor: r.infractor || '',
    tipo: r.tipo || '', monto_original: Number(r.monto), monto_final: montoFinal, aplicar_descuento: aplicarDescuento,
    metodo, notas, cajero: _session?.name || '', cobrado_at: new Date().toISOString(), error: '',
  };
  await cobrosGuardar(item);
  const cache = _leerLocal('tm_pendientes');
  if (cache?.rows) { cache.rows = cache.rows.filter(x => String(x.id) !== String(r.id)); _guardarLocal('tm_pendientes', cache); }
  await actualizarIndicadorCobros();
  return item;
}

let _sincCobros = false;
async function sincronizarCobros() {
  if (_sincCobros || !navigator.onLine) return;
  _sincCobros = true;
  let n = 0;
  try {
    for (const c of await cobrosListar()) {
      if (c.error) continue;
      const nota = `Cobrado sin conexión el ${new Date(c.cobrado_at).toLocaleString('es-MX')} por ${c.cajero}`;
      const { data, error } = await _sb.rpc('registrar_pago_diferido', {
        p_infraccion_id: c.infraccion_id, p_aplicar_descuento: c.aplicar_descuento, p_metodo: c.metodo,
        p_notas: c.notas ? `${c.notas} | ${nota}` : nota, p_cobrado_at: c.cobrado_at, p_token: c.token,
      });
      if (error && esErrorDeRed(error)) break;
      if (error) { await cobrosGuardar({ ...c, error: error.message }); continue; }
      await cobrosQuitar(c.token);
      n++;
      logActivity('infraccion', `Pago registrado sin conexión — ${data.folio_inf}: ${fmt(data.monto_final)} (${c.metodo})`).catch(() => {});
    }
  } finally {
    _sincCobros = false;
    await actualizarIndicadorCobros();
  }
  if (n) {
    showToast(n === 1 ? 'Se registró 1 cobro hecho sin conexión' : `Se registraron ${n} cobros hechos sin conexión`);
    if ($('view-caja')?.classList.contains('active')) renderCaja();
  }
}

async function actualizarIndicadorCobros() {
  let items = [];
  try { items = await cobrosListar(); } catch (_) {}
  let el = $('cola-cobros');
  if (!items.length) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('button');
    el.id = 'cola-cobros'; el.type = 'button'; el.className = 'cola-chip';
    el.onclick = () => verColaCobros();
    const right = document.querySelector('.topbar-right');
    if (right) right.prepend(el); else document.body.appendChild(el);
  }
  const conError = items.filter(i => i.error).length;
  el.classList.toggle('cola-error', !!conError);
  el.textContent = conError ? `${conError} ${conError === 1 ? 'cobro' : 'cobros'} por revisar` : `${items.length} ${items.length === 1 ? 'cobro' : 'cobros'} por subir`;
  el.title = conError ? 'Hay cobros sin conexión que no se pudieron registrar: toca para ver' : 'Se registrarán solos al volver la señal';
}

async function verColaCobros() {
  if (navigator.onLine) await sincronizarCobros();
  const quedan = await cobrosListar();
  if (!quedan.length) return;
  const lineas = quedan.map(c => `• ${c.folio} · ${c.placa} · ${fmt(c.monto_final)} ${c.metodo} · ${new Date(c.cobrado_at).toLocaleString('es-MX')}` + (c.error ? `\n   No se registró: ${c.error}` : ''));
  const conError = quedan.filter(c => c.error);
  if (conError.length && confirm(`Cobros hechos sin conexión:\n\n${lineas.join('\n')}\n\n` +
      `Los que no se registraron necesitan revisión (por ejemplo, otra caja ya los cobró: devuelve el dinero o avisa al Director).\n\n¿Quitar de la lista los ${conError.length} ya revisados?`)) {
    for (const c of conError) await cobrosQuitar(c.token);
    await actualizarIndicadorCobros();
  } else if (!conError.length) {
    alert(`Cobros hechos sin conexión:\n\n${lineas.join('\n')}\n\nSe registrarán solos al volver la señal.`);
  }
}

function printComprobanteProvisional(c) {
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Comprobante provisional ${esc(c.folio)}</title>
  <style>body{font-family:Arial,sans-serif;width:72mm;margin:0 auto;font-size:11px;color:#000}h1{font-size:13px;text-align:center;margin:6px 0}
  .c{text-align:center}.r{display:flex;justify-content:space-between;margin:2px 0}.t{font-size:16px;font-weight:900;text-align:center;margin:6px 0}
  .aviso{border:1.5px dashed #000;padding:4px;margin-top:6px;font-size:10px;text-align:center}@media print{button{display:none}}</style></head><body>
  <button onclick="window.print()">Imprimir</button>
  <h1>COMPROBANTE PROVISIONAL DE PAGO</h1>
  <div class="c">${esc(_cachedConfig?.municipio || '')} · Tesorería / Caja de Tránsito</div><hr>
  <div class="r"><span>Infracción</span><b>${esc(c.folio)}</b></div>
  <div class="r"><span>Placa</span><span>${esc(c.placa)}</span></div>
  <div class="r"><span>Infractor</span><span>${esc(c.infractor)}</span></div>
  <div class="r"><span>Motivo</span><span>${esc(c.tipo)}</span></div>
  <div class="r"><span>Monto original</span><span>${fmt(c.monto_original)}</span></div>
  <div class="t">${fmt(c.monto_final)}</div>
  <div class="r"><span>Forma de pago</span><span>${esc(c.metodo)}</span></div>
  <div class="r"><span>Cajero</span><span>${esc(c.cajero)}</span></div>
  <div class="r"><span>Fecha</span><span>${new Date(c.cobrado_at).toLocaleString('es-MX')}</span></div>
  <div class="r"><span>Clave</span><span style="font-family:monospace">${esc(c.token.slice(0, 8).toUpperCase())}</span></div>
  <div class="aviso">Cobro hecho sin conexión. El recibo oficial con código QR queda registrado al volver el internet y se puede reimprimir en Caja con el folio.</div>
  </body></html>`;
  const w = window.open('', '_blank', 'width=420,height=640');
  if (!w) { alert('Permite las ventanas emergentes para imprimir el comprobante'); return; }
  w.document.write(conMarca(html)); w.document.close();
}

window.addEventListener('online', () => { checkConexion().then(ok => { if (ok) { sincronizarCola(); sincronizarCobros(); } }); });
window.addEventListener('offline', () => checkConexion());

function _leerLocal(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }
function _guardarLocal(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }

// ── Catálogo del reglamento (fundamento legal) ───────────
// Tabulador de infracciones del Reglamento de Tránsito (ver articulos.sql).
let _catalogo = null;
async function cargarCatalogo() {
  if (_catalogo) return _catalogo;
  const { data, error } = await _sb.from('catalogo_infracciones').select('*').eq('activo', true).order('numero');
  if (error) {
    // Sin señal: se usa la copia guardada para poder levantar boletas
    const local = _leerLocal('tm_catalogo');
    if (local?.length) return (_catalogo = local);
    console.error('catálogo:', error); return [];
  }
  _guardarLocal('tm_catalogo', data || []);
  return (_catalogo = data || []);
}
// Deja en el dispositivo el catálogo y la configuración (UMA, descuentos) para
// que el oficial pueda levantar boletas aunque se quede sin señal.
async function precargarSinSenal() {
  const { data } = await _sb.from('configuracion').select('*').eq('id', 1).single();
  if (data) { _cachedConfig = { ...(_cachedConfig||{}), ...data }; _guardarLocal('tm_config', data); iniciarMarcaPanel(data); }
  else if (!_cachedConfig) _cachedConfig = _leerLocal('tm_config');
  await Promise.all([cargarCatalogo(), cargarReportados()]);
}
function catalogoPorNumero(n) { return (_catalogo||[]).find(c => c.numero === Number(n)) || null; }
function citaCorta(c) {
  return `Art. ${c.articulo}${c.fraccion ? (/párrafo|anexo/i.test(c.fraccion) ? ', ' + c.fraccion : ' fr. ' + c.fraccion) : ''}${c.inciso ? ' inc. ' + c.inciso : ''}`;
}
function etiquetaCatalogo(c) { return `${citaCorta(c)} — ${c.descripcion} [#${c.numero}]`; }
function rangoMonto(c, cfg) {
  const uma = Number(cfg?.valor_uma) || 0;
  if (c.cuotas_min == null) return { min: 0, max: 0, uma, sinMulta: true };   // amonestación / arresto
  // Igual que el servidor (aplicar_fundamento): UMA × cuotas, redondeado hacia abajo
  return uma ? { min: Math.floor(c.cuotas_min * uma), max: Math.floor(c.cuotas_max * uma), uma } : null;
}
// Texto de los artículos del reglamento citados (se cargan al abrirlos)
const _articulos = {};
async function leerArticulos(det, numero) {
  if (!det.open || det.dataset.cargado) return;
  const c = catalogoPorNumero(numero); if (!c) return;
  const faltan = (c.articulos_ref || []).filter(n => !_articulos[n]);
  if (faltan.length) {
    const { data } = await _sb.from('reglamento_articulos').select('numero,texto').in('numero', faltan);
    (data || []).forEach(a => { _articulos[a.numero] = a.texto; });
  }
  const box = det.querySelector('.fund-articulos');
  if (box) box.innerHTML = (c.articulos_ref || []).map(n => `<p style="margin:.35rem 0">${esc(_articulos[n] || ('Artículo ' + n))}</p>`).join('') || esc(c.texto);
  det.dataset.cargado = '1';
}
function tarjetaFundamento(c, cfg) {
  const r = rangoMonto(c, cfg);
  const badge = { 'Leve':'badge-green', 'Grave':'badge-yellow', 'Muy Grave':'badge-red' }[c.clasificacion] || 'badge-muted';
  const sancion = r?.sinMulta
    ? `Sanción: <strong>${esc(c.clasificacion)}</strong> (sin multa)`
    : c.cuotas_min === c.cuotas_max
      ? `Sanción: <strong>${c.cuotas_min} UMA</strong>${r ? ` = <strong>${fmt(r.min)}</strong>` : ''}`
      : `Sanción: <strong>${c.cuotas_min} UMA</strong>${r ? ` (${fmt(r.min)})` : ''}; con agravante <strong>${c.cuotas_max} UMA</strong>${r ? ` (${fmt(r.max)})` : ''}`;
  return `<div style="background:var(--stone);border:1px solid var(--border);border-radius:8px;padding:.6rem .75rem;margin-top:.4rem;font-size:.78rem;line-height:1.45">
    <div style="font-weight:700;color:var(--ink)">${esc(citaCorta(c))}
      ${c.clasificacion ? `<span class="${badge}">${esc(c.clasificacion)}</span>` : ''}
      ${c.grave ? '<span class="badge-red" title="Se paga íntegra, sin descuento">Sin descuento</span>' : ''}</div>
    <div style="color:var(--muted);margin:.15rem 0">${esc(cfg?.reglamento || 'Reglamento de Tránsito')}${c.categoria ? ' · ' + esc(c.categoria) : ''}</div>
    <div>${sancion}${r && !r.sinMulta ? ` <span style="color:var(--muted)">· UMA $${r.uma}</span>` : ''}</div>
    ${c.nota ? `<div style="color:var(--muted);font-size:.72rem;margin-top:.15rem">${esc(c.nota)}</div>` : ''}
    <details style="margin-top:.3rem" ontoggle="leerArticulos(this, ${Number(c.numero)})"><summary style="cursor:pointer;color:var(--ac);font-weight:600">Leer los artículos del reglamento</summary>
      <div class="fund-articulos" style="margin-top:.3rem;white-space:normal">${c.articulos_ref?.length ? 'Cargando…' : esc(c.texto)}</div></details>
  </div>`;
}

// ── Firmas en el teléfono ─────────────────────────────────
// Se guardan como PNG (data URL) en la boleta; funcionan sin señal.
const _firmas = {};
function iniciarFirma(id, previa) {
  const c = $(id); if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#111827';
  const f = _firmas[id] = { vacio: true };
  if (previa) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height); img.src = previa; f.vacio = false; }
  if (c.dataset.listo) return;
  c.dataset.listo = '1';
  let trazando = false;
  const pos = e => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  c.addEventListener('pointerdown', e => { trazando = true; c.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); });
  c.addEventListener('pointermove', e => { if (!trazando) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); _firmas[id].vacio = false; });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => c.addEventListener(ev, () => { trazando = false; }));
}
function limpiarFirma(id) { iniciarFirma(id); }
function firmaDataURL(id) { const c = $(id); return c && _firmas[id] && !_firmas[id].vacio ? c.toDataURL('image/png') : ''; }
const imgFirma = (src, alto = 34) => src && /^data:image\/png;base64,/.test(src) ? `<img src="${src}" alt="Firma" style="height:${alto}mm;max-width:100%;object-fit:contain;display:block;margin:0 auto"/>` : '';
const DOC_RETENIDO = { licencia: 'Licencia o permiso de conducir', tarjeta_circulacion: 'Tarjeta de circulación' };

// ── Historial del conductor (por número de licencia) ──────
// La reincidencia (art. 331 fr. II inc. g) es del conductor, no del vehículo.
window._conductorPrevias = [];
async function checkConductorHistory() {
  const lic = ($('inf-licencia')?.value || '').trim();
  const box = $('conductor-history');
  if (lic.length < 4) { window._conductorPrevias = []; if (box) box.innerHTML = ''; sugerirAgravanteAdeudos(); return; }
  let data = [];
  try {
    ({ data } = await _sb.rpc('historial_conductor', { p_licencia: lic }));
  } catch (_) { data = []; }
  const previas = (data || []).filter(r => !(_boletaGrupo && r.boleta === _boletaGrupo));
  window._conductorPrevias = previas;
  if (box) box.innerHTML = previas.length ? `<div style="font-size:.78rem;background:var(--amber-bg,#FFFBEB);border:1px solid #FDE68A;border-radius:8px;padding:.5rem .7rem;margin:-.2rem 0 .6rem">
    <strong>Conductor con ${previas.length} infracción(es) previa(s)</strong> (licencia ${esc(lic)}):
    ${previas.slice(0, 4).map(r => `${esc(r.folio||'—')} · ${esc(r.tipo)} · ${esc(r.placa)} · ${estadoBadge(r.estado)}`).join('<br>')}</div>` : '';
  sugerirAgravanteAdeudos();
  sugerirReincidencia();
}
function sugerirReincidencia() {
  if ($('inf-id')?.value) return;
  const cat = parseInt(($('inf-catalogo')||{}).value) || null;
  const misma = cat && (window._conductorPrevias || []).some(r => r.catalogo_numero === cat);
  const cb = document.querySelector('.inf-circ[value="agr_g"]');
  const nota = document.querySelector('.circ-nota[data-c="agr_g"]');
  if (nota) nota.textContent = misma ? ' — sugerida: el conductor ya cometió esta infracción' : '';
  if (cb && !cb.dataset.tocado) { cb.checked = !!misma; recalcularMonto(); }
}

// ── Circunstancias agravantes y atenuantes (art. 331) ──────
// La lista es la del Reglamento (también en la tabla circunstancias_331, que
// valida el servidor). Con al menos una agravante se cobra la UMA "con
// agravante" del tabulador; sin agravantes, la UMA base.
const CIRCUNSTANCIAS_331 = [
  ['agr_a','agravante','II','a','Cometer la infracción en estado de ebriedad o de intoxicación por sustancias estupefacientes o psicotrópicas'],
  ['agr_b','agravante','II','b','Abandonar a las víctimas del accidente o no procurarles la ayuda requerida, pudiendo hacerlo'],
  ['agr_c','agravante','II','c','Evadir la acción de la justicia por fuga u ocultamiento'],
  ['agr_d','agravante','II','d','Borrar, alterar u ocultar señales, huellas, indicios o vestigios de la infracción, u obstaculizar las investigaciones'],
  ['agr_e','agravante','II','e','Tener infracciones anteriores sin haber sido pagadas'],
  ['agr_f','agravante','II','f','Conducir sin licencia, con licencia vencida o que no corresponda al vehículo, o con la licencia suspendida'],
  ['agr_g','agravante','II','g','La reincidencia'],
  ['agr_h','agravante','II','h','No cumplir con las obligaciones y requisitos señalados en la Ley y el Reglamento'],
  ['agr_i','agravante','II','i','Que la infracción ocasione o pueda ocasionar lesiones o daños, o ponga en peligro a las personas o a su patrimonio'],
  ['ate_a','atenuante','I','a','El auxilio y ayuda inmediata a las víctimas de un accidente'],
  ['ate_b','atenuante','I','b','Oportuna y espontánea reparación de daños y perjuicios ocasionados'],
  ['ate_c','atenuante','I','c','Avisar a la autoridad más cercana'],
  ['ate_d','atenuante','I','d','Respeto a autoridades y policías viales'],
  ['ate_e','atenuante','I','e','Acatamiento a las órdenes y disposiciones de las autoridades']
].map(([codigo, tipo, fraccion, inciso, descripcion]) => ({ codigo, tipo, fraccion, inciso, descripcion }));

function renderCircunstancias(seleccion) {
  const box = $('inf-circunstancias'); if (!box) return;
  const sel = new Set(seleccion || []);
  const grupo = (tipo, titulo) => `<div style="font-weight:700;margin:.3rem 0 .15rem;color:${tipo==='agravante'?'var(--red)':'var(--green)'}">${titulo}</div>` +
    CIRCUNSTANCIAS_331.filter(x => x.tipo === tipo).map(x => `<label style="display:flex;gap:.4rem;align-items:flex-start;cursor:pointer;margin:.1rem 0">
      <input type="checkbox" class="inf-circ" value="${x.codigo}" ${sel.has(x.codigo)?'checked':''} onchange="this.dataset.tocado='1';recalcularMonto()"/>
      <span>${esc(x.descripcion)} <span style="color:var(--muted)">(fr. ${x.fraccion}, inc. ${x.inciso})</span><span class="circ-nota" data-c="${x.codigo}" style="color:var(--amber);font-weight:600"></span></span></label>`).join('');
  box.innerHTML = grupo('agravante', 'Agravantes (fr. II)') + grupo('atenuante', 'Atenuantes (fr. I)');
  recalcularMonto(false);
}
function circunstanciasSeleccionadas() { return [...document.querySelectorAll('.inf-circ:checked')].map(x => x.value); }
function textoCircunstancia(codigo) {
  const x = CIRCUNSTANCIAS_331.find(c => c.codigo === codigo);
  return x ? `${x.descripcion} (art. 331, fr. ${x.fraccion}, inc. ${x.inciso})` : codigo;
}

// Monto del tabulador: UMA base, o UMA con agravante si hay alguna agravante
function recalcularMonto(fijar = true) {
  const sel = circunstanciasSeleccionadas();
  const agr = sel.some(c => c.startsWith('agr_'));
  const res = $('inf-circ-resumen');
  if (res) res.textContent = sel.length ? `— ${sel.filter(c=>c.startsWith('agr_')).length} agravante(s), ${sel.filter(c=>c.startsWith('ate_')).length} atenuante(s)` : '';
  const c = catalogoPorNumero(($('inf-catalogo')||{}).value);
  const r = c && rangoMonto(c, _cachedConfig);
  if (fijar && r && $('inf-monto')) $('inf-monto').value = r.sinMulta ? 0 : (agr ? r.max : r.min);
  updateInfSummary();
}

// Sugerir la agravante del inciso e) cuando la placa tiene multas sin pagar
function sugerirAgravanteAdeudos() {
  if ($('inf-id')?.value) return;
  const cb = document.querySelector('.inf-circ[value="agr_e"]');
  const nota = document.querySelector('.circ-nota[data-c="agr_e"]');
  const ids = new Set((window._placaAdeudos || []).map(r => r.folio));
  (window._conductorPrevias || []).filter(r => r.estado === 'pendiente' || r.estado === 'vencida').forEach(r => ids.add(r.folio));
  const n = ids.size;
  if (nota) nota.textContent = n ? ` — sugerida: ${n} infracción(es) sin pagar` : '';
  if (cb && !cb.dataset.tocado) { cb.checked = n > 0; recalcularMonto(); }
}

async function prepararCatalogoForm() {
  const cat = await cargarCatalogo();
  const dl = $('inf-catalogo-lista');
  if (dl && !dl.children.length) dl.innerHTML = cat.map(c => `<option value="${esc(etiquetaCatalogo(c))}"></option>`).join('');
}

// fijarMonto: en altas propone el monto mínimo del tabulador
function seleccionarCatalogo(numero, fijarMonto) {
  const c = catalogoPorNumero(numero);
  if ($('inf-catalogo')) $('inf-catalogo').value = c ? c.numero : '';
  if ($('inf-catalogo-buscar')) $('inf-catalogo-buscar').value = c ? etiquetaCatalogo(c) : '';
  const box = $('inf-fundamento');
  if (box) box.innerHTML = c ? tarjetaFundamento(c, _cachedConfig) : '<div style="font-size:.75rem;color:var(--muted);margin-top:.3rem">Busca la infracción en el reglamento para citar el artículo.</div>';
  const r = c && rangoMonto(c, _cachedConfig);
  if (c && fijarMonto) sugerirReincidencia();
  if (c && fijarMonto && r && $('inf-monto')) $('inf-monto').value = r.sinMulta ? 0 : (circunstanciasSeleccionadas().some(x => x.startsWith('agr_')) ? r.max : r.min);
  if ($('inf-monto')) {
    $('inf-monto').min = r ? r.min : 1; $('inf-monto').max = r && !r.sinMulta ? r.max : '';
    $('inf-monto').readOnly = !!r?.sinMulta; $('inf-monto').required = !r?.sinMulta;
  }
  updateInfSummary();
}

function onCatalogoBuscar() {
  const v = $('inf-catalogo-buscar')?.value || '';
  const m = v.match(/\[#(\d+)\]\s*$/);
  if (!m) return;
  const c = catalogoPorNumero(m[1]);
  if (!c) return;
  if ($('inf-tipo')) {
    const opts = [...$('inf-tipo').options].map(o => o.value);
    $('inf-tipo').value = c.tipo_rapido && opts.includes(c.tipo_rapido) ? c.tipo_rapido : 'Otro';
  }
  seleccionarCatalogo(c.numero, !$('inf-id').value);
}

// ── Tipos de infracción (base + personalizables) ──────────
const TIPOS_BASE = [
  'Exceso de velocidad','Estacionamiento prohibido','No respetar señal de alto',
  'Conducir sin licencia','Uso de celular al conducir','Circular en sentido contrario',
  'Girar en U prohibido','No portar documentos','Conducir en estado de ebriedad','Otro'
];

async function loadTiposInfraccion(currentVal) {
  if (!_cachedConfig) {
    const { data } = await _sb.from('configuracion').select('tipos_extra,descuento_pct,dias_descuento').eq('id',1).single();
    if (data) _cachedConfig = { ...(_cachedConfig||{}), ...data };
  }
  const extras = (_cachedConfig?.tipos_extra || []).filter(t => t && !TIPOS_BASE.includes(t));
  const all = [...TIPOS_BASE.filter(t => t !== 'Otro'), ...extras, 'Otro'];
  const el = $('inf-tipo');
  if (!el) return;
  const prev = currentVal ?? el.value;
  el.innerHTML = all.map(t => `<option value="${esc(t)}"${t === prev ? ' selected' : ''}>${esc(t)}</option>`).join('');
}

// Varias infracciones del mismo conductor van en una sola boleta (art. 327,
// último párrafo). _boletaGrupo identifica la boleta; se genera en el teléfono
// para que también funcione sin señal.
let _boletaGrupo = null;

async function openNewInfraccion(continuar) {
  const previos = continuar ? continuar.datos : null;
  if (!continuar) _boletaGrupo = null;
  $('modal-inf-title').textContent = continuar ? `Otra infracción en la misma boleta (${continuar.n + 1})` : 'Nueva infracción';
  $('inf-form').reset();
  $('inf-id').value = '';
  $('inf-fecha').value = new Date().toISOString().slice(0,16);
  $('inf-est').value = 'pendiente';
  if ($('inf-est-wrap')) $('inf-est-wrap').style.display = 'none';
  window._infLat = null; window._infLng = null;
  window._placaAdeudos = []; window._placaMontoAdeudos = 0;
  const geoStatus = document.getElementById('inf-geo-status');
  if (geoStatus) geoStatus.textContent = '';
  const geoBtn = document.getElementById('btn-geolocate');
  if (geoBtn) { geoBtn.textContent = 'GPS'; geoBtn.style.color = ''; geoBtn.disabled = false; }
  const prev = document.getElementById('inf-fotos-preview');
  if (prev) prev.innerHTML = '';
  const plHist = document.getElementById('placa-history');
  if (plHist) plHist.innerHTML = '';
  if ($('placa-ocr-status')) $('placa-ocr-status').textContent = '';
  // Pre-fill official with logged-in user if they are an oficial/supervisor
  if ($('inf-oficial')) {
    $('inf-oficial').dataset.preload = _session?.name || '';
  }
  if (previos) {
    // Misma boleta: se conservan los datos del conductor, vehículo y lugar
    Object.entries(previos).forEach(([k, v]) => { const el = $(k); if (!el) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; });
    if ($('inf-oficial')) $('inf-oficial').dataset.preload = previos['inf-oficial'] || '';
    window._infLat = continuar.lat; window._infLng = continuar.lng;
  }
  loadOficiales(['inf-oficial']);
  openModal('modal-infraccion');
  if ($('inf-catalogo')) $('inf-catalogo').value = '';
  renderCircunstancias(previos ? continuar.circunstancias : []);
  window._conductorPrevias = [];
  if ($('conductor-history')) $('conductor-history').innerHTML = '';
  if ($('inf-doc-retenido')) $('inf-doc-retenido').value = '';
  if ($('inf-doc-numero')) $('inf-doc-numero').value = '';
  if ($('inf-firma-negada')) $('inf-firma-negada').checked = !!continuar?.firmaNegada;
  iniciarFirma('firma-infractor', continuar?.firmas?.infractor);
  iniciarFirma('firma-oficial', continuar?.firmas?.oficial);
  await loadTiposInfraccion();
  await prepararCatalogoForm();
  autoFillMonto();
  if (previos?.["inf-placa"]) checkPlacaHistory();
  if (previos?.["inf-licencia"]) checkConductorHistory();
}

const CAMPOS_BOLETA = ['inf-fecha','inf-placa','inf-vehiculo','inf-color','inf-infractor','inf-licencia','inf-licencia-tipo','inf-correo','inf-domicilio','inf-ausente','inf-telefono','inf-ubicacion','inf-oficial'];
function datosBoletaActual() {
  const d = {};
  CAMPOS_BOLETA.forEach(k => { const el = $(k); if (el) d[k] = el.type === 'checkbox' ? el.checked : el.value; });
  return d;
}

async function editInfraccion(id) {
  // Las infracciones registradas no se modifican (inmutable.sql): solo cambia su estado
  alert('Las infracciones registradas no se pueden modificar. Si hay un error, cancélala con su motivo y levanta una nueva.');
  return;
  const { data, error } = await _sb.from('infracciones').select('*').eq('id', id).single();
  if (error || !data) return;
  $('modal-inf-title').textContent = 'Editar infracción';
  if ($('inf-est-wrap')) $('inf-est-wrap').style.display = '';
  $('inf-id').value       = data.id;
  $('inf-fecha').value    = data.fecha ? data.fecha.slice(0,16) : '';
  $('inf-placa').value    = data.placa;
  $('inf-infractor').value= data.infractor;
  $('inf-licencia').value = data.licencia||'';
  if ($('inf-licencia-tipo')) $('inf-licencia-tipo').value = data.licencia_tipo||'';
  if ($('inf-domicilio')) $('inf-domicilio').value = data.infractor_domicilio||'';
  if ($('inf-correo')) $('inf-correo').value = data.infractor_correo||'';
  if ($('inf-ausente')) $('inf-ausente').checked = !!data.infractor_ausente;
  renderCircunstancias(data.circunstancias || []);
  $('inf-vehiculo').value = data.vehiculo||'';
  $('inf-color').value    = data.color_vehiculo||'';
  if ($('inf-oficial')) $('inf-oficial').dataset.preload = data.oficial||'';
  await loadOficiales(['inf-oficial']);
  $('inf-tipo').value     = data.tipo;
  $('inf-monto').value    = data.monto;
  $('inf-ubicacion').value= data.ubicacion||'';
  $('inf-est').value      = data.estado;
  $('inf-obs').value      = data.obs||'';
  if ($('inf-telefono')) $('inf-telefono').value = data.telefono||'';
  window._infLat = data.lat||null; window._infLng = data.lng||null;
  const geoStatus = document.getElementById('inf-geo-status');
  if (geoStatus) geoStatus.innerHTML = data.lat ? `<span style="color:var(--green)">✓ Coordenadas guardadas</span>` : '';
  const prev = document.getElementById('inf-fotos-preview');
  if (prev) prev.innerHTML = '';
  await loadTiposInfraccion(data.tipo);
  if ($('inf-tipo') && $('inf-tipo').value !== data.tipo) $('inf-tipo').value = 'Otro';
  await prepararCatalogoForm();
  seleccionarCatalogo(data.catalogo_numero, false);
  openModal('modal-infraccion');
  updateInfSummary();
}

function updateInfSummary() {
  const placa   = ($('inf-placa')||{}).value?.trim().toUpperCase() || '';
  const tipo    = ($('inf-tipo')||{}).value || '';
  const monto   = parseInt(($('inf-monto')||{}).value) || 0;
  const sumEl   = $('inf-summary');
  const prevEl  = $('inf-monto-preview');
  if (prevEl) prevEl.textContent = monto > 0 ? `= ${fmt(monto)}` : '';
  if (!sumEl) return;
  if (placa || tipo || monto) {
    sumEl.style.display = 'block';
    sumEl.innerHTML =
      `<span style="color:var(--muted)">Se registrará: </span>` +
      (tipo   ? `<strong>${esc(tipo)}</strong>` : '') +
      (placa  ? ` · Placa <strong style="font-family:monospace">${esc(placa)}</strong>` : '') +
      (monto  ? ` · <strong style="color:var(--ac)">${fmt(monto)}</strong>` : '');
  } else {
    sumEl.style.display = 'none';
  }
}

async function autoFillMonto() {
  if ($('inf-id').value) return;
  const tipo = $('inf-tipo').value;
  if (!_cachedConfig?.valor_uma) {
    const { data } = await _sb.from('configuracion').select('*').eq('id',1).single();
    if (data) _cachedConfig = { ...(_cachedConfig||{}), ...data };
  }
  // El tipo rápido trae su artículo del reglamento y el monto mínimo del tabulador
  const cat = await cargarCatalogo();
  const c = cat.find(x => x.tipo_rapido === tipo);
  if (c) { seleccionarCatalogo(c.numero, true); return; }
  if (tipo === 'Otro') { seleccionarCatalogo(null); $('inf-catalogo-buscar')?.focus(); return; }
  updateInfSummary();
}

