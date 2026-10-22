// ── Detail modal ──────────────────────────────────────────
function fundamentoDetalle(r) {
  const c = catalogoPorNumero(r.catalogo_numero);
  if (!c && !r.fundamento) return '';
  return `<div style="margin-top:.75rem">
    <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.2rem">Fundamento legal</div>
    ${r.fundamento ? `<div style="font-size:.82rem;font-weight:600;color:var(--ink)">${esc(r.fundamento)}</div>` : '<div style="font-size:.75rem;color:var(--muted)">Registrada antes del catálogo; referencia según su tipo:</div>'}
    ${c ? tarjetaFundamento(c, _cachedConfig) : ''}
  </div>`;
}

async function viewDetail(tabla, id) {
  const { data, error } = await _sb.from(tabla).select('*').eq('id', id).single();
  if (error || !data) return;
  if (tabla === 'infracciones') {
    await cargarCatalogo();
    if (!_cachedConfig?.valor_uma) {
      const { data: cfg } = await _sb.from('configuracion').select('*').eq('id', 1).single();
      if (cfg) _cachedConfig = { ...(_cachedConfig||{}), ...cfg };
    }
  }
  const r = data, isInf = tabla==='infracciones';
  const dm = $('modal-detail');
  if (!dm) return;
  dm.querySelector('.modal-title').textContent = isInf ? `Infracción ${r.folio||''}` : `Permiso ${r.num||''}`;
  dm.querySelector('.detail-body').innerHTML = isInf ? (()=>{
    let fotos=[]; try{fotos=JSON.parse(r.fotos||'[]');}catch(e){}
    const montoColor = { pendiente:'var(--amber)', pagada:'var(--green)', vencida:'var(--red)', impugnada:'var(--blue)', cancelada:'var(--muted)' };
    const diasDesde = r.fecha ? Math.floor((Date.now()-new Date(r.fecha).getTime())/86400000) : null;
    const diasStr = diasDesde===0?'Hoy':diasDesde===1?'Ayer':`Hace ${diasDesde} días`;
    const diasAlerta = diasDesde!==null && diasDesde>25;

    const secLabel = (icon, txt) =>
      `<div style="display:flex;align-items:center;gap:.4rem;margin:1rem 0 .6rem;padding-bottom:.4rem;border-bottom:1px solid var(--border)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2">${icon}</svg>
        <span style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">${txt}</span>
      </div>`;

    return `
    <!-- Header -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:1rem">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem">
        <div style="flex:1;min-width:0">
          <div style="font-size:.68rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Folio</div>
          <div style="font-family:monospace;font-size:1.15rem;font-weight:800;color:var(--ink)">${esc(r.folio||'—')}</div>
          <div style="font-size:.88rem;font-weight:700;color:var(--ink);margin-top:.3rem">${esc(r.tipo)}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:.2rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
            <span>${new Date(r.fecha).toLocaleString('es-MX',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
            <span style="font-weight:600;color:${diasAlerta?'var(--red)':'var(--muted)'}">${diasStr}</span>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${estadoBadge(r.estado)}
          <div style="font-size:1.5rem;font-weight:800;color:${montoColor[r.estado]||'var(--ink)'};margin-top:.4rem;line-height:1">${fmt(r.monto)}</div>
          <div style="font-size:.68rem;color:var(--muted);margin-top:.15rem">MXN</div>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <!-- Vehículo -->
      <div class="detail-field full">${secLabel('<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>','Vehículo')}</div>
      <div class="detail-field"><label>Placa</label><span style="font-family:monospace;font-size:1rem;font-weight:800">${esc(r.placa)}</span></div>
      <div class="detail-field"><label>Color</label><span>${esc(r.color_vehiculo||'—')}</span></div>
      <div class="detail-field full"><label>Marca y modelo</label><span>${esc(r.vehiculo||'—')}</span></div>

      <!-- Infractor -->
      <div class="detail-field full">${secLabel('<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>','Infractor')}</div>
      <div class="detail-field full"><label>Nombre</label><span style="font-weight:600;font-size:.88rem">${esc(r.infractor)}</span></div>
      <div class="detail-field"><label>Licencia o permiso</label><span>${esc(r.licencia||'—')}${r.licencia_tipo ? ' · ' + esc(r.licencia_tipo) : ''}</span></div>
      <div class="detail-field full"><label>Domicilio y correo</label><span>${r.infractor_ausente && !r.infractor_domicilio ? '<em>No se encontraba presente o no los proporcionó</em>' : `${esc(r.infractor_domicilio||'—')}${r.infractor_correo ? ' · ' + esc(r.infractor_correo) : ''}`}</span></div>
      <div class="detail-field"><label>Teléfono</label><span>${r.telefono?`<a href="https://wa.me/52${r.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener" style="color:#128C7E;text-decoration:none;display:inline-flex;align-items:center;gap:.3rem"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>${esc(r.telefono)}</a>`:'—'}</span></div>

      <!-- Infracción -->
      <div class="detail-field full">${secLabel('<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/>','Datos de la infracción')}</div>
      <div class="detail-field"><label>Oficial</label><span>${esc(r.oficial||'—')}${r.oficial_placa ? ' · Placa ' + esc(r.oficial_placa) : ''}${r.oficial_adscripcion ? ' · ' + esc(r.oficial_adscripcion) : ''}</span></div>
      <div class="detail-field"><label>Estado actual</label><span>${estadoBadge(r.estado)}</span></div>
      <div class="detail-field full"><label>Ubicación</label>
        <span>${esc(r.ubicacion||'—')}${r.lat?` <a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:.25rem;color:var(--ac);font-size:.75rem;margin-left:.5rem;font-weight:600;text-decoration:none"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>Ver en mapa</a>`:''}</span>
      </div>
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span style="background:var(--stone);display:block;padding:.45rem .7rem;border-radius:6px;font-size:.82rem">${esc(r.obs)}</span></div>`:''}
      ${r.impugnacion_motivo?`<div class="detail-field full"><label>Motivo de impugnación</label><span style="background:var(--blue-bg);color:var(--blue);display:block;padding:.45rem .7rem;border-radius:6px;font-size:.82rem;font-weight:500">${esc(r.impugnacion_motivo)}</span></div>`:''}
      ${fotos.length?`<div class="detail-field full"><label>Evidencia fotográfica</label><div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.4rem">${fotos.map(f=>`<img data-foto="${esc(f)}" alt="Foto de evidencia" style="width:110px;height:110px;object-fit:cover;border-radius:8px;border:1px solid var(--border);background:var(--stone);cursor:pointer;transition:opacity .15s" onmouseenter="this.style.opacity='.75'" onmouseleave="this.style.opacity='1'" />`).join('')}</div></div>`:''}
    </div>
    ${fundamentoDetalle(r)}
    ${(r.circunstancias||[]).length ? `<div style="margin-top:.6rem"><div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.2rem">Circunstancias (art. 331)</div>
      <ul style="margin:0;padding-left:1.1rem;font-size:.8rem">${r.circunstancias.map(c => `<li>${esc(textoCircunstancia(c))}</li>`).join('')}</ul></div>` : ''}
    ${r.documento_retenido ? `<div style="margin-top:.6rem"><div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.2rem">Documento retenido (arts. 343-344)</div>
      <div style="font-size:.82rem">${esc(DOC_RETENIDO[r.documento_retenido] || r.documento_retenido)}${r.documento_numero ? ' · ' + esc(r.documento_numero) : ''} — <span id="detail-devolucion">consultando…</span></div></div>` : ''}
    ${(r.firma_infractor || r.firma_oficial || r.firma_negada) ? `<div style="display:flex;gap:1rem;margin-top:.6rem;flex-wrap:wrap">
      <div style="flex:1;min-width:140px;text-align:center;font-size:.72rem;color:var(--muted)">${r.firma_infractor ? imgFirma(r.firma_infractor, 14) : (r.firma_negada ? '<em>Se negó a firmar</em>' : '—')}<div>Firma del infractor</div></div>
      <div style="flex:1;min-width:140px;text-align:center;font-size:.72rem;color:var(--muted)">${imgFirma(r.firma_oficial, 14) || '—'}<div>Firma del policía vial</div></div></div>` : ''}
    <div id="detail-recurso"></div>
    <div id="detail-boleta"></div>

    <!-- Cambiar estado (una impugnación la resuelve Jurídico o el Director) -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem;margin-top:.5rem;display:${r.estado==='impugnada'&&!puede('resolver')?'none':'flex'};align-items:center;gap:.6rem;flex-wrap:wrap">
      <span style="font-size:.75rem;font-weight:600;color:var(--muted)">Cambiar estado:</span>
      <select id="detail-estado" class="form-select" style="width:auto;min-width:130px;flex-shrink:0">
        <option value="pendiente"  ${r.estado==='pendiente'?'selected':''}>Pendiente</option>
        <option value="pagada"     ${r.estado==='pagada'?'selected':''}>Pagada</option>
        ${r.estado==='impugnada'?'<option value="impugnada" selected>Impugnada (recurso en trámite)</option>':''}
        <option value="cancelada"  ${r.estado==='cancelada'?'selected':''}>Cancelada</option>
        <option value="vencida"    ${r.estado==='vencida'?'selected':''}>Vencida</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="saveDetailEstado('infracciones','${r.id}')">Aplicar</button>
    </div>

    <!-- Acciones -->
    <div class="detail-actions" style="margin-top:.75rem;flex-wrap:wrap;gap:.5rem">
      ${(r.estado==='pendiente'||r.estado==='vencida')?`<button class="btn btn-sm" style="background:var(--green);color:#fff;border:none" onclick="openRegistrarPago('${r.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        Cobrar
      </button>`:''}
      ${(r.estado==='pendiente'||r.estado==='vencida')?`<button class="btn btn-ghost btn-sm" style="color:var(--blue);border-color:#BFDBFE" onclick="impugnarInfraccion('${r.id}','${r.estado}')">Recurso de revocación</button>`:''}
      ${r.estado==='impugnada'?`<button class="btn btn-ghost btn-sm" style="color:var(--blue);border-color:#BFDBFE" onclick="resolverImpugnacion('${r.id}')">Resolver impugnación</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="printTicket80('${r.id}')">Ticket 80mm</button>
      <button class="btn btn-ghost btn-sm" onclick="printParabrisas('${r.id}')" title="Aviso corto con QR para dejar en el parabrisas cuando el conductor no está">Parabrisas</button>
      <button class="btn btn-ghost btn-sm" onclick="printInfraccion('${r.id}')">Boleta carta</button>
      ${r.telefono?`<button class="btn btn-ghost btn-sm" style="color:#128C7E;border-color:#A7F3D0" onclick="notificarWhatsApp({telefono:${jsArg(r.telefono)},infractor:${jsArg(r.infractor)},folio:${jsArg(r.folio||'')},placa:${jsArg(r.placa)},tipo:${jsArg(r.tipo)},monto:${Number(r.monto)||0},ubicacion:${jsArg(r.ubicacion||'')},fecha:${jsArg(r.fecha||'')}})" >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        WhatsApp
      </button>`:''}
    </div>
    <div style="font-size:.72rem;color:var(--muted);margin-top:.6rem">Una infracción registrada no se puede modificar. Si tiene un error, cancélala con su motivo y levanta una nueva.</div>`;
  })() : (()=>{
    const dias = _diasVigencia(r.vencimiento);
    const diasColor = dias===null?'var(--muted)':dias<0?'var(--red)':dias<=7?'var(--red)':dias<=30?'var(--amber)':'var(--green)';
    const diasTxt = dias===null?'—':dias<0?`Vencido hace ${Math.abs(dias)} días`:dias===0?'Vence hoy':`Vence en ${dias} días`;
    const secLabel = (icon, txt) =>
      `<div style="display:flex;align-items:center;gap:.4rem;margin:1rem 0 .6rem;padding-bottom:.4rem;border-bottom:1px solid var(--border)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2">${icon}</svg>
        <span style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">${txt}</span>
      </div>`;
    return `
    <!-- Header -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:10px;padding:1.1rem 1.2rem;margin-bottom:1rem">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem">
        <div style="flex:1;min-width:0">
          <div style="font-size:.68rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em">Núm. permiso</div>
          <div style="font-family:monospace;font-size:1.1rem;font-weight:800;color:var(--ink)">${esc(r.num||'—')}</div>
          <div style="font-size:.92rem;font-weight:700;color:var(--ink);margin-top:.3rem">${esc(r.titular)}</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:.2rem">${esc(r.tipo)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${estadoBadge(r.estado)}
          <div style="font-size:1rem;font-weight:800;color:${diasColor};margin-top:.5rem">${diasTxt}</div>
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <!-- Titular -->
      <div class="detail-field full">${secLabel('<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>','Datos del titular')}</div>
      <div class="detail-field full"><label>Razón social / Nombre</label><span style="font-weight:600">${esc(r.titular)}</span></div>
      ${r.telefono?`<div class="detail-field"><label>Teléfono</label><span><a href="https://wa.me/52${r.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener" style="color:#128C7E;text-decoration:none">${esc(r.telefono)}</a></span></div>`:''}
      ${r.unidades>1?`<div class="detail-field"><label>Núm. de unidades</label><span>${r.unidades}</span></div>`:''}

      <!-- Vehículo -->
      <div class="detail-field full">${secLabel('<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>','Vehículo y ruta')}</div>
      <div class="detail-field"><label>Placa</label><span style="font-family:monospace;font-weight:800;font-size:.95rem">${esc(r.placa||'—')}</span></div>
      <div class="detail-field"><label>Tipo de permiso</label><span>${esc(r.tipo)}</span></div>
      <div class="detail-field full"><label>Ruta / Zona de circulación</label><span>${esc(r.ruta||'—')}</span></div>

      <!-- Vigencia -->
      <div class="detail-field full">${secLabel('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>','Vigencia')}</div>
      <div class="detail-field"><label>Fecha de inicio</label><span>${fmtDateShort(r.inicio)}</span></div>
      <div class="detail-field"><label>Fecha de vencimiento</label><span style="font-weight:700;color:${diasColor}">${fmtDateShort(r.vencimiento)}</span></div>
      <div class="detail-field full"><label>Días restantes</label>
        <span style="font-weight:700;font-size:.9rem;color:${diasColor}">${diasTxt}</span>
      </div>
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span style="background:var(--stone);display:block;padding:.45rem .7rem;border-radius:6px;font-size:.82rem">${esc(r.obs)}</span></div>`:''}
    </div>

    <!-- Cambiar estado -->
    <div style="background:var(--stone);border:1px solid var(--border);border-radius:8px;padding:.75rem 1rem;margin-top:.5rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">
      <span style="font-size:.75rem;font-weight:600;color:var(--muted)">Cambiar estado:</span>
      <select id="detail-estado" class="form-select" style="width:auto;min-width:130px;flex-shrink:0">
        <option value="vigente"    ${r.estado==='vigente'?'selected':''}>Vigente</option>
        <option value="por-vencer" ${r.estado==='por-vencer'?'selected':''}>Por vencer</option>
        <option value="vencido"    ${r.estado==='vencido'?'selected':''}>Vencido</option>
        <option value="suspendido" ${r.estado==='suspendido'?'selected':''}>Suspendido</option>
      </select>
      <button class="btn btn-primary btn-sm" onclick="saveDetailEstado('permisos','${r.id}')">Aplicar</button>
    </div>

    <!-- Acciones -->
    <div class="detail-actions" style="margin-top:.75rem;flex-wrap:wrap;gap:.5rem">
      <button class="btn btn-ghost btn-sm" onclick="editPermiso('${r.id}');closeModal('modal-detail')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        Editar
      </button>
      <button class="btn btn-ghost btn-sm" style="color:var(--green);border-color:#A7F3D0" onclick="renovarPermiso('${r.id}');closeModal('modal-detail')" title="Renovar permiso por 1 año más">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
        Renovar
      </button>
      <button class="btn btn-ghost btn-sm" onclick="printPermiso('${r.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir
      </button>
      ${r.telefono?`<a class="btn btn-ghost btn-sm" style="color:#128C7E;border-color:#A7F3D0;text-decoration:none" href="https://wa.me/52${r.telefono.replace(/\D/g,'')}" target="_blank" rel="noopener">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>
        WhatsApp
      </a>`:''}
      ${r.estado!=='cancelado'?`<button class="btn btn-danger btn-sm" onclick="cancelarPermiso('${r.id}')">Cancelar permiso</button>`:''}
    </div>`;
  })();
  openModal('modal-detail');
  hidratarFotos($('modal-detail'));
  if (isInf && r.documento_retenido) mostrarDevolucion(r);
  if (isInf) mostrarRecurso(r);
  if (isInf && r.boleta) infraccionesDeBoleta(r).then(lista => {
    const box = $('detail-boleta'); if (!box || lista.length < 2) return;
    box.innerHTML = `<div style="margin-top:.6rem"><div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.2rem">Infracciones de esta boleta (art. 327)</div>
      ${lista.map((x, i) => `<div style="font-size:.8rem;display:flex;justify-content:space-between;gap:.5rem;padding:.15rem 0;${x.id===r.id?'font-weight:700':''}"><span>${esc(x.folio||'—')} · ${esc(x.tipo)}${i===0?' <span class="badge-yellow">Mayor cuantía</span>':''}</span><span>${fmt(x.monto)}</span></div>`).join('')}</div>`;
  });
}

async function saveDetailEstado(tabla, id) {
  const estado = $('detail-estado').value;
  const cambios = { estado };
  if (tabla==='infracciones' && estado==='pagada') {
    closeModal('modal-detail');
    openRegistrarPago(id);   // marcar como pagada siempre pasa por el cobro
    return;
  }
  if (tabla==='infracciones' && estado==='cancelada') {
    const motivo = prompt('Motivo de la cancelación:');
    if (!motivo || !motivo.trim()) return;
    cambios.cancelacion_motivo = motivo.trim();
  }
  const { error } = await _sb.from(tabla).update(cambios).eq('id', id);
  if (error) { alert('Error: '+error.message); return; }
  closeModal('modal-detail');
  if (tabla==='infracciones') { renderInfracciones(); renderDashboard(); }
  else renderPermisos();
}

// Los registros no se borran (controles.sql): el permiso se cancela con motivo
async function cancelarPermiso(id) {
  const motivo = prompt('Motivo de la cancelación del permiso:');
  if (!motivo || !motivo.trim()) return;
  const { error } = await _sb.from('permisos').update({ estado: 'cancelado', cancelacion_motivo: motivo.trim() }).eq('id', id);
  if (error) { alert('Error: '+error.message); return; }
  await logActivity('permiso', `Permiso cancelado: ${motivo.trim()}`);
  closeModal('modal-detail');
  renderPermisos();
  showToast('Permiso cancelado');
}

