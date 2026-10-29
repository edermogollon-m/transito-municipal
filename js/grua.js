// ══════════════════════════════════════════════════════════
// GRÚA / CORRALÓN
// ══════════════════════════════════════════════════════════
let _gruaPage = 1, _gruaSearch = '', _gruaEstado = '';
const GRUA_PAGE = 20;

async function renderGrua() {
  const tbody = $('grua-table'); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  const consulta = () => {
    let q = _sb.from('grua').select('*');
    if (_gruaSearch) q = q.or(orBuscar(['placa', 'propietario'], _gruaSearch));
    if (_gruaEstado) q = q.eq('estado', _gruaEstado);
    q = q.order('fecha', {ascending:false});
    return q;
  };
  const { data, error } = await todas(consulta);
  if (error) { tbody.innerHTML=`<tr><td colspan="8" style="color:red">${esc(error.message)}</td></tr>`; return; }
  const all = data||[];

  // Stats
  const today = new Date().toISOString().slice(0,10);
  const mesInicio = new Date().toISOString().slice(0,7)+'-01';
  const retenidos = all.filter(r=>r.estado==='retenido').length;
  const libHoy = all.filter(r=>r.estado==='liberado'&&r.fecha_liberacion&&r.fecha_liberacion.slice(0,10)===today).length;
  const mesTotal = all.filter(r=>r.estado==='liberado'&&r.fecha_liberacion&&r.fecha_liberacion>=mesInicio).reduce((s,r)=>s+Number(r.costo_deposito||0),0);
  if($('grua-stat-retenidos')) $('grua-stat-retenidos').textContent=retenidos;
  if($('grua-stat-liberados')) $('grua-stat-liberados').textContent=libHoy;
  if($('grua-stat-monto')) $('grua-stat-monto').textContent=fmt(mesTotal);
  const badge=$('badge-grua'); if(badge){badge.textContent=retenidos;badge.style.display=retenidos?'inline':'none';}

  const pages = Math.max(1,Math.ceil(all.length/GRUA_PAGE));
  if(_gruaPage>pages)_gruaPage=pages;
  const rows = all.slice((_gruaPage-1)*GRUA_PAGE,_gruaPage*GRUA_PAGE);
  tbody.innerHTML = rows.length ? rows.map(r=>{
    const dias = Math.floor((Date.now()-new Date(r.fecha).getTime())/86400000);
    const costoAcum = Number(r.costo_deposito||0) + dias*Number(r.costo_diario||0);
    return `<tr>
      <td class="mono">${esc(r.folio||'—')}</td>
      <td>${fmtDateShort(r.fecha)}</td>
      <td class="mono" style="font-weight:700">${esc(r.placa)}</td>
      <td>${esc(r.propietario||'—')}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.motivo||'—')}</td>
      <td style="font-weight:700">${fmt(costoAcum)}</td>
      <td>${estadoBadge(r.estado)}</td>
      <td style="white-space:nowrap">
        ${r.estado==='retenido'?`<button class="btn btn-primary btn-sm" style="background:var(--green);border-color:var(--green)" onclick="liberarVehiculo('${r.id}')">Liberar</button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="editGrua('${r.id}')">Editar</button>
      </td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--muted)">Sin registros en corralón</td></tr>';
  renderPager('grua-pager', _gruaPage, pages, 'goGruaPage');
}

function filterGrua() {
  _gruaSearch=($('grua-search')||{}).value||'';
  _gruaEstado=($('grua-estado')||{}).value||'';
  _gruaPage=1; renderGrua();
}
function goGruaPage(p) { _gruaPage=p; renderGrua(); }

function openNewGrua() {
  $('grua-id').value=''; $('grua-placa').value=''; $('grua-propietario').value='';
  $('grua-motivo').value=''; $('grua-ubicacion').value='';
  $('grua-costo').value=''; $('grua-diario').value=''; $('grua-obs').value='';
  const now = new Date(); now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  $('grua-fecha').value=now.toISOString().slice(0,16);
  $('modal-grua-title').textContent='Registrar retención';
  $('grua-submit-btn').textContent='Registrar';
  if ($('grua-oficial')) $('grua-oficial').dataset.preload = _session?.name||'';
  loadOficiales(['grua-oficial']);
  openModal('modal-grua');
}

async function editGrua(id) {
  const { data, error } = await _sb.from('grua').select('*').eq('id',id).single();
  if (error || !data) return;
  $('grua-id').value=data.id; $('grua-placa').value=data.placa; $('grua-propietario').value=data.propietario||'';
  $('grua-ubicacion').value=data.ubicacion||'';
  $('grua-costo').value=data.costo_deposito||''; $('grua-diario').value=data.costo_diario||''; $('grua-obs').value=data.obs||'';
  if(data.fecha){ const d=new Date(data.fecha); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); $('grua-fecha').value=d.toISOString().slice(0,16); }
  // motivo select
  if ($('grua-motivo')) $('grua-motivo').value = data.motivo||'';
  // oficial select
  if ($('grua-oficial')) $('grua-oficial').dataset.preload = data.oficial||'';
  await loadOficiales(['grua-oficial']);
  $('modal-grua-title').textContent='Editar registro';
  $('grua-submit-btn').textContent='Actualizar';
  openModal('modal-grua');
}

async function submitGrua(e) {
  e.preventDefault();
  const btn = $('grua-submit-btn'); btn.disabled=true; btn.textContent='Guardando…';
  const id = $('grua-id').value;
  const n = Date.now();
  const payload = {
    placa: formatoPlaca($('grua-placa').value),
    propietario: $('grua-propietario').value.trim(),
    motivo: $('grua-motivo').value.trim(),
    oficial: $('grua-oficial').value.trim(),
    ubicacion: $('grua-ubicacion').value.trim(),
    costo_deposito: parseFloat($('grua-costo').value)||0,
    costo_diario: parseFloat($('grua-diario').value)||0,
    obs: $('grua-obs').value.trim(),
    fecha: $('grua-fecha').value ? new Date($('grua-fecha').value).toISOString() : new Date().toISOString()
  };
  if (!id) {
    payload.estado = 'retenido';
  }
  const { error } = id
    ? await _sb.from('grua').update(payload).eq('id',id)
    : await _sb.from('grua').insert(payload);
  btn.disabled=false; btn.textContent='Registrar';
  if (error) { alert('Error: '+error.message); return; }
  closeModal('modal-grua');
  logActivity('info', `Grúa: vehículo ${payload.placa} ${id?'actualizado':'retenido'}`);
  renderGrua();
  showToast(id?'Registro actualizado':'Vehículo retenido en corralón');

  // WhatsApp automático al propietario (solo en retención nueva)
  if (!id) {
    const { data: vehWa } = await _sb.from('vehiculos').select('telefono,propietario').in('placa', variantesPlaca(payload.placa)).limit(1).maybeSingle();
    if (vehWa?.telefono) {
      const tel = vehWa.telefono.replace(/\D/g,'');
      const msg = `Estimado/a ${vehWa.propietario||payload.propietario}, su vehículo de placas ${payload.placa} ha sido retirado al corralón municipal.\n\n` +
        `🚗 Placa: ${payload.placa}\n` +
        `📋 Motivo: ${payload.motivo}\n` +
        `📍 Lugar: ${payload.ubicacion||'—'}\n` +
        `💰 Costo de depósito: $${payload.costo_deposito} MXN + $${payload.costo_diario} por día\n\n` +
        `Acuda a Tránsito Municipal para recuperar su vehículo. Dirección de Tránsito y Movilidad.`;
      window.open(`https://wa.me/52${tel}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      showToast(`WhatsApp enviado al propietario de ${payload.placa}`);
    }
  }
}

async function liberarVehiculo(id) {
  if (!confirm('¿Confirmas la liberación del vehículo?')) return;
  const { error } = await _sb.from('grua').update({ estado:'liberado', fecha_liberacion: new Date().toISOString() }).eq('id',id);
  if (error) { alert('Error: '+error.message); return; }
  logActivity('info', `Grúa: vehículo liberado del corralón`);
  renderGrua();
  showToast('Vehículo liberado del corralón');
}

