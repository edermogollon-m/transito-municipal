// ── Configuración ─────────────────────────────────────────
const PRIVACIDAD_CAMPOS = [['cfg-domicilio-transito', 'domicilio_transito'], ['cfg-ut-domicilio', 'ut_domicilio'], ['cfg-ut-telefono', 'ut_telefono'], ['cfg-ut-correo', 'ut_correo']];
async function loadConfig() {
  const { data } = await _sb.from('configuracion').select('*').eq('id',1).single();
  if (!data) return;
  _cachedConfig = data;
  if($('cfg-municipio')) $('cfg-municipio').value = data.municipio||'';
  if($('cfg-estado'))    $('cfg-estado').value    = data.estado||'';
  if($('cfg-director'))  $('cfg-director').value  = data.director||'';
  if($('cfg-correo'))    $('cfg-correo').value     = data.correo||'';
  if($('cfg-correo-reporte')) $('cfg-correo-reporte').value = data.correo_reporte||'';
  if($('cfg-repuve-url')) $('cfg-repuve-url').value = data.repuve_url||'';
  if($('cfg-descuento-pct'))  $('cfg-descuento-pct').value  = data.descuento_pct  ?? 20;
  if($('cfg-dias-descuento')) $('cfg-dias-descuento').value = data.dias_descuento ?? 15;
  if($('cfg-dias-limite'))    $('cfg-dias-limite').value    = data.dias_limite    ?? 30;
  if($('cfg-descuento2-pct')) $('cfg-descuento2-pct').value = data.descuento2_pct ?? '';
  if($('cfg-dias-descuento2'))$('cfg-dias-descuento2').value= data.dias_descuento2 ?? '';
  if($('cfg-valor-uma'))      $('cfg-valor-uma').value      = data.valor_uma      ?? '';
  if($('cfg-constancia-costo')) $('cfg-constancia-costo').value = data.constancia_costo ?? '';
  if($('cfg-reglamento'))     $('cfg-reglamento').value     = data.reglamento     || '';
  if($('cfg-fundamento'))     $('cfg-fundamento').value     = data.fundamento_general || '';
  if($('cfg-recurso'))        $('cfg-recurso').value        = data.leyenda_recurso || '';
  if($('cfg-folio-prefijo'))  $('cfg-folio-prefijo').value  = data.folio_prefijo || 'MIS';
  if($('cfg-pago-banco'))     $('cfg-pago-banco').value     = data.pago_banco || '';
  if($('cfg-pago-clabe'))     $('cfg-pago-clabe').value     = data.pago_clabe || '';
  if($('cfg-pago-beneficiario')) $('cfg-pago-beneficiario').value = data.pago_beneficiario || '';
  if($('cfg-resguardo'))      $('cfg-resguardo').value      = data.resguardo_lugar || '';
  if($('cfg-avisos-correo'))  $('cfg-avisos-correo').checked   = !!data.avisos_correo;
  if($('cfg-avisos-whatsapp'))$('cfg-avisos-whatsapp').checked = !!data.avisos_whatsapp;
  if($('cfg-pago-linea'))     $('cfg-pago-linea').checked      = !!data.pago_en_linea;
  PRIVACIDAD_CAMPOS.forEach(([id, col]) => { if ($(id)) $(id).value = data[col] || ''; });
  if ($('cfg-privacidad-fecha')) $('cfg-privacidad-fecha').textContent = data.privacidad_actualizado ? 'Última actualización del aviso: ' + fmtDateShort(String(data.privacidad_actualizado).slice(0, 10) + 'T12:00:00') : '';
  estadoMercadoPago();
  if($('cfg-tipos-extra')) {
    const extras = data.tipos_extra || [];
    $('cfg-tipos-extra').value = Array.isArray(extras) ? extras.join('\n') : '';
  }
  cargarMarcaConfig(data);
  if (_rol === 'admin') renderRespaldos();
}

async function saveConfig() {
  const tiposRaw = ($('cfg-tipos-extra')||{}).value||'';
  const tiposExtra = tiposRaw.split('\n').map(s=>s.trim()).filter(Boolean);
  const payload = {
    id: 1,
    municipio: ($('cfg-municipio')||{}).value||'',
    estado:    ($('cfg-estado')||{}).value||'',
    director:  ($('cfg-director')||{}).value||'',
    correo:    ($('cfg-correo')||{}).value||'',
    descuento_pct:  parseInt(($('cfg-descuento-pct')||{}).value)||20,
    dias_descuento: parseInt(($('cfg-dias-descuento')||{}).value)||15,
    dias_limite:    parseInt(($('cfg-dias-limite')||{}).value)||30,
    descuento2_pct: parseInt(($('cfg-descuento2-pct')||{}).value)||0,
    dias_descuento2: parseInt(($('cfg-dias-descuento2')||{}).value)||null,
    valor_uma:      parseFloat(($('cfg-valor-uma')||{}).value) || null,
    constancia_costo: parseFloat(($('cfg-constancia-costo')||{}).value) || _cachedConfig?.constancia_costo || 150,
    reglamento:     ($('cfg-reglamento')||{}).value?.trim() || null,
    fundamento_general: ($('cfg-fundamento')||{}).value?.trim() || null,
    leyenda_recurso:    ($('cfg-recurso')||{}).value?.trim() || null,
    resguardo_lugar:    ($('cfg-resguardo')||{}).value?.trim() || null,
    avisos_correo:      !!($('cfg-avisos-correo')||{}).checked,
    avisos_whatsapp:    !!($('cfg-avisos-whatsapp')||{}).checked,
    pago_en_linea:      !!($('cfg-pago-linea')||{}).checked,
    tipos_extra:    tiposExtra
  };
  if ($('cfg-correo-reporte')) payload.correo_reporte = $('cfg-correo-reporte').value.trim();
  // Aviso de privacidad (privacidad.sql): si cambian sus datos, cambia su fecha de actualización
  if ($('cfg-ut-correo')) {
    let cambio = false;
    PRIVACIDAD_CAMPOS.forEach(([id, col]) => { payload[col] = $(id).value.trim(); cambio ||= payload[col] !== (_cachedConfig?.[col] || ''); });
    if (payload.ut_correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.ut_correo)) { alert('El correo de la Unidad de Transparencia no es válido.'); return; }
    if (cambio) payload.privacidad_actualizado = fmtDateInput(new Date());
  }
  if ($('cfg-repuve-url')) {
    const url = $('cfg-repuve-url').value.trim() || REPUVE_URL;
    if (!/^https:\/\/[^\s"'<>]+$/.test(url)) { alert('La página del REPUVE debe empezar con https://'); return; }
    payload.repuve_url = url;
  }
  if ($('cfg-folio-prefijo')) {
    const pre = $('cfg-folio-prefijo').value.trim().toUpperCase();
    if (!/^[A-Z]{2,5}$/.test(pre)) { alert('El prefijo de los folios debe tener de 2 a 5 letras.'); return; }
    payload.folio_prefijo = pre;
  }
  if ($('cfg-pago-clabe')) {
    const clabe = $('cfg-pago-clabe').value.replace(/\s/g, '');
    if (clabe && !/^\d{18}$/.test(clabe)) { alert('La CLABE debe tener 18 dígitos.'); return; }
    payload.pago_clabe = clabe;
    payload.pago_banco = $('cfg-pago-banco').value.trim();
    payload.pago_beneficiario = $('cfg-pago-beneficiario').value.trim();
  }
  const { error } = await _sb.from('configuracion').upsert(payload, { onConflict:'id' });
  if (error) { alert('Error guardando configuración: '+error.message); return; }
  _cachedConfig = { ...(_cachedConfig||{}), ...payload };
  await logActivity('config', `Configuración del sistema actualizada por ${_session.name}`);
  showToast('Configuración guardada correctamente');
}

// ── Respaldos diarios (mejoras.sql + función tareas-diarias) ─────
async function renderRespaldos() {
  const cont = $('respaldos-lista'); if (!cont) return;
  cont.innerHTML = '<div style="font-size:.8rem;color:var(--muted)">Cargando…</div>';
  const { data, error } = await _sb.storage.from('respaldos').list('', { limit: 60, sortBy: { column: 'name', order: 'desc' } });
  if (error) { cont.innerHTML = `<div style="font-size:.8rem;color:var(--red)">${esc(error.message)}</div>`; return; }
  const archivos = (data || []).filter(f => /^\d{4}-\d{2}-\d{2}/.test(f.name));
  cont.innerHTML = archivos.length ? `<table><thead><tr><th>Día</th><th>Tamaño</th><th></th></tr></thead><tbody>${archivos.map(f => `<tr>
      <td>${esc(fmtDateShort(f.name.slice(0, 10) + 'T12:00:00'))}</td>
      <td>${((f.metadata?.size || 0) / 1024).toFixed(0)} KB</td>
      <td style="text-align:right"><button class="btn btn-ghost btn-sm" onclick="descargarRespaldo(${esc(JSON.stringify(f.name))})">Descargar</button></td>
    </tr>`).join('')}</tbody></table>`
    : '<div style="font-size:.8rem;color:var(--muted)">Todavía no hay respaldos. El primero se genera esta madrugada o con “Respaldar ahora”.</div>';
}
async function descargarRespaldo(nombre) {
  const { data, error } = await _sb.storage.from('respaldos').createSignedUrl(nombre, 120, { download: true });
  if (error) { alert('No se pudo descargar: ' + error.message); return; }
  window.location.href = data.signedUrl;
}
async function respaldarAhora() {
  const btn = $('btn-respaldar'); if (btn) { btn.disabled = true; btn.textContent = 'Respaldando…'; }
  try {
    const { data, error } = await _sb.functions.invoke('tareas-diarias', { body: { solo: 'respaldo' } });
    if (error) throw error;
    if (data?.respaldo?.error) throw new Error(data.respaldo.error);
    showToast(`Respaldo listo: ${data.respaldo.filas} registros`);
    renderRespaldos();
  } catch (e) { alert('No se pudo respaldar: ' + (e.message || e)); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Respaldar ahora'; } }
}

// ¿La función pago-mp tiene la cuenta de Mercado Pago? (secreto MP_ACCESS_TOKEN)
async function estadoMercadoPago() {
  const el = $('cfg-mp-estado'); if (!el) return;
  el.textContent = 'Revisando la cuenta de Mercado Pago…';
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/pago-mp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ accion: 'estado' })
    });
    const d = await res.json();
    el.innerHTML = !d.conectado
      ? '<span style="color:var(--amber)">● Falta conectar la cuenta de Mercado Pago.</span> Mientras tanto el portal muestra el botón desactivado con la leyenda "por el momento no está disponible".'
      : d.prueba
        ? '<span style="color:var(--blue)">● Cuenta conectada en modo de prueba:</span> los pagos no son reales.'
        : '<span style="color:var(--green)">● Cuenta de Mercado Pago conectada.</span>';
  } catch { el.textContent = 'No se pudo revisar la cuenta de Mercado Pago.'; }
}

