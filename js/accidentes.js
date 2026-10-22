// ══════════════════════════════════════════════════════════
// ACCIDENTES VIALES
// ══════════════════════════════════════════════════════════
let _accPage=1, _accSearch='', _accTipo='', _accEstado='';
const ACC_PAGE=20;
let _accPartes=[];

// El policía vial edita solo sus accidentes y mientras sigan en proceso (controles.sql)
function puedeEditarAccidente(r) {
  if (!puede('accidentes')) return false;
  if (_rol !== 'oficial') return true;
  return r.estado === 'en_proceso' && (esMio(r));
}

async function renderAccidentes() {
  const tbody=$('accidentes-table'); if(!tbody) return;
  tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  let q=_sb.from('accidentes').select('*');
  if(_accSearch) q=q.or(`folio.ilike.%${_accSearch}%,ubicacion.ilike.%${_accSearch}%,oficial.ilike.%${_accSearch}%`);
  if(_accTipo)   q=q.eq('tipo',_accTipo);
  if(_accEstado) q=q.eq('estado',_accEstado);
  q=q.order('fecha',{ascending:false});
  const {data,error}=await q;
  if(error){tbody.innerHTML=`<tr><td colspan="8" style="color:red">${esc(error.message)}</td></tr>`;return;}
  const all=data||[];
  // stats
  const enProceso=all.filter(r=>r.estado==='en_proceso').length;
  const totalLes=all.reduce((s,r)=>s+Number(r.lesionados||0),0);
  const totalFall=all.reduce((s,r)=>s+Number(r.fallecidos||0),0);
  if($('acc-stat-total'))     $('acc-stat-total').textContent=all.length;
  if($('acc-stat-proceso'))   $('acc-stat-proceso').textContent=enProceso;
  if($('acc-stat-lesionados'))$('acc-stat-lesionados').textContent=totalLes;
  if($('acc-stat-fallecidos'))$('acc-stat-fallecidos').textContent=totalFall;
  const badge=$('badge-accidentes'); if(badge){badge.textContent=enProceso;badge.style.display=enProceso?'inline':'none';}
  const pages=Math.max(1,Math.ceil(all.length/ACC_PAGE));
  if(_accPage>pages)_accPage=pages;
  const rows=all.slice((_accPage-1)*ACC_PAGE,_accPage*ACC_PAGE);
  const tipoLabel={choque:'Choque',atropello:'Atropello',volcadura:'Volcadura',otro:'Otro'};
  const estadoAcc={en_proceso:'<span class="badge pendiente">En proceso</span>',cerrado:'<span class="badge pagada">Cerrado</span>',derivado:'<span class="badge impugnada">Derivado a MP</span>'};
  tbody.innerHTML=rows.length?rows.map(r=>`<tr onclick="viewAccidenteDetalle('${r.id}')">
    <td class="mono" style="font-weight:700">${esc(r.folio||'—')}</td>
    <td>${fmtDateShort(r.fecha)}</td>
    <td>${esc(tipoLabel[r.tipo]||r.tipo)}</td>
    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.ubicacion||'—')}</td>
    <td style="text-align:center">${r.lesionados||0}${r.fallecidos>0?` / <span style="color:var(--red);font-weight:700">${r.fallecidos} fall.</span>`:''}</td>
    <td>${esc(r.oficial||'—')}</td>
    <td>${estadoAcc[r.estado]||esc(r.estado)}</td>
    <td>${puedeEditarAccidente(r)?`<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();editAccidente('${r.id}')">Editar</button>`:''}</td>
  </tr>`).join(''):'<tr><td colspan="8" style="text-align:center;color:var(--muted)">Sin accidentes registrados</td></tr>';
  renderPager('accidentes-pager',_accPage,pages,'goAccPage');
}
function filterAccidentes(){
  _accSearch=($('acc-search')||{}).value||'';
  _accTipo=($('acc-tipo-fil')||{}).value||'';
  _accEstado=($('acc-estado-fil')||{}).value||'';
  _accPage=1;renderAccidentes();
}
function goAccPage(p){_accPage=p;renderAccidentes();}

function addParte(data){
  _accPartes.push(data||{nombre:'',placa:'',licencia:'',aseguradora:''});
  renderPartesForm();
}
function removeParte(i){_accPartes.splice(i,1);renderPartesForm();}
function renderPartesForm(){
  const el=$('acc-partes-list'); if(!el) return;
  el.innerHTML=_accPartes.map((p,i)=>`
    <div style="border:1px solid var(--border);border-radius:8px;padding:.75rem;margin-bottom:.5rem;background:var(--stone)">
      <div style="display:flex;justify-content:space-between;margin-bottom:.5rem;font-size:.75rem;font-weight:700;color:var(--muted)">Parte ${i+1} <button type="button" class="btn btn-ghost btn-sm" style="padding:.1rem .4rem;font-size:.7rem" onclick="removeParte(${i})">✕</button></div>
      <div class="form-row">
        <input class="form-input" placeholder="Nombre" value="${esc(p.nombre)}" oninput="_accPartes[${i}].nombre=this.value" style="font-size:.8rem"/>
        <input class="form-input" placeholder="Placa" value="${esc(p.placa)}" oninput="_accPartes[${i}].placa=this.value.toUpperCase()" style="font-size:.8rem"/>
      </div>
      <div class="form-row" style="margin-top:.4rem">
        <input class="form-input" placeholder="Núm. licencia" value="${esc(p.licencia)}" oninput="_accPartes[${i}].licencia=this.value" style="font-size:.8rem"/>
        <input class="form-input" placeholder="Aseguradora" value="${esc(p.aseguradora)}" oninput="_accPartes[${i}].aseguradora=this.value" style="font-size:.8rem"/>
      </div>
    </div>`).join('');
}

function openNewAccidente(){
  $('acc-id').value='';_accPartes=[];renderPartesForm();
  $('acc-tipo').value='choque';$('acc-ubicacion').value='';$('acc-descripcion').value='';
  $('acc-lesionados').value=0;$('acc-fallecidos').value=0;$('acc-obs').value='';
  $('acc-estado').value='en_proceso';
  if($('acc-fotos-preview'))$('acc-fotos-preview').innerHTML='';
  const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());
  $('acc-fecha').value=now.toISOString().slice(0,16);
  $('modal-acc-title').textContent='Registrar accidente vial';
  if ($('acc-oficial')) $('acc-oficial').dataset.preload = _session?.name||'';
  loadOficiales(['acc-oficial']);
  openModal('modal-accidente');
}

async function editAccidente(id){
  const{data,error}=await _sb.from('accidentes').select('*').eq('id',id).single();
  if(error||!data)return;
  $('acc-id').value=data.id;
  _accPartes=[];try{_accPartes=JSON.parse(data.partes||'[]');}catch(e){}
  renderPartesForm();
  $('acc-tipo').value=data.tipo||'choque';$('acc-ubicacion').value=data.ubicacion||'';
  $('acc-descripcion').value=data.descripcion||'';$('acc-lesionados').value=data.lesionados||0;
  $('acc-fallecidos').value=data.fallecidos||0;$('acc-obs').value=data.obs||'';
  $('acc-estado').value=data.estado||'en_proceso';
  if(data.fecha){const d=new Date(data.fecha);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('acc-fecha').value=d.toISOString().slice(0,16);}
  $('modal-acc-title').textContent='Editar accidente vial';
  if ($('acc-oficial')) $('acc-oficial').dataset.preload = data.oficial||'';
  await loadOficiales(['acc-oficial']);
  openModal('modal-accidente');
}

async function submitAccidente(e){
  e.preventDefault();
  const btn=$('acc-submit-btn');btn.disabled=true;btn.textContent='Guardando…';
  const id=$('acc-id').value;
  let fotosArr=[];
  try{ fotosArr=await subirFotos($('acc-fotos'),'accidentes'); }
  catch(err){ btn.disabled=false; btn.textContent='Registrar accidente'; alert('No se pudieron subir las fotos: '+err.message); return; }
  const payload={
    tipo:$('acc-tipo').value,
    fecha:$('acc-fecha').value?new Date($('acc-fecha').value).toISOString():new Date().toISOString(),
    ubicacion:$('acc-ubicacion').value.trim(),
    descripcion:$('acc-descripcion').value.trim(),
    lesionados:parseInt($('acc-lesionados').value)||0,
    fallecidos:parseInt($('acc-fallecidos').value)||0,
    oficial:$('acc-oficial').value.trim(),
    estado:$('acc-estado').value,
    obs:$('acc-obs').value.trim(),
    partes:JSON.stringify(_accPartes)
  };
  if(fotosArr.length) payload.fotos=JSON.stringify(fotosArr);
  const{error}=id?await _sb.from('accidentes').update(payload).eq('id',id):await _sb.from('accidentes').insert(payload);
  btn.disabled=false;btn.textContent='Registrar accidente';
  if(error){alert('Error: '+error.message);return;}
  closeModal('modal-accidente');
  logActivity('info',`Accidente ${id?'actualizado':'registrado'} en ${payload.ubicacion}`);
  renderAccidentes();renderAlertas();
  showToast(id?'Accidente actualizado':'Accidente registrado');
}

async function viewAccidenteDetalle(id){
  const{data:r,error}=await _sb.from('accidentes').select('*').eq('id',id).single();
  if(error||!r)return;
  let partes=[];try{partes=JSON.parse(r.partes||'[]');}catch(e){}
  let fotos=[];try{fotos=JSON.parse(r.fotos||'[]');}catch(e){}
  const tipoLabel={choque:'Choque',atropello:'Atropello',volcadura:'Volcadura',otro:'Otro'};
  const estadoAcc={en_proceso:'<span class="badge pendiente">En proceso</span>',cerrado:'<span class="badge pagada">Cerrado</span>',derivado:'<span class="badge impugnada">Derivado a MP</span>'};
  const dm=$('modal-detail');if(!dm)return;
  dm.querySelector('.modal-title').textContent=`Accidente ${r.folio||'—'}`;
  dm.querySelector('.detail-body').innerHTML=`
    <div class="detail-grid">
      <div class="detail-field"><label>Folio</label><span style="font-family:monospace;font-weight:700">${esc(r.folio||'—')}</span></div>
      <div class="detail-field"><label>Fecha</label><span>${fmtDateShort(r.fecha)}</span></div>
      <div class="detail-field"><label>Tipo</label><span>${esc(tipoLabel[r.tipo]||r.tipo)}</span></div>
      <div class="detail-field"><label>Estado</label><span>${esc(estadoAcc[r.estado]||r.estado)}</span></div>
      <div class="detail-field full"><label>Ubicación</label><span>${esc(r.ubicacion||'—')}${r.lat?` <a href="https://maps.google.com/?q=${r.lat},${r.lng}" target="_blank" style="color:var(--ac);font-size:.75rem;margin-left:.4rem">Ver mapa ↗</a>`:''}</span></div>
      <div class="detail-field"><label>Lesionados</label><span style="font-weight:700;color:var(--amber)">${r.lesionados||0}</span></div>
      <div class="detail-field"><label>Fallecidos</label><span style="font-weight:700;color:var(--red)">${r.fallecidos||0}</span></div>
      <div class="detail-field"><label>Oficial</label><span>${esc(r.oficial||'—')}</span></div>
      ${r.descripcion?`<div class="detail-field full"><label>Descripción</label><span>${esc(r.descripcion)}</span></div>`:''}
      ${r.obs?`<div class="detail-field full"><label>Observaciones</label><span>${esc(r.obs)}</span></div>`:''}
      ${partes.length?`<div class="detail-field full"><label>Partes involucradas</label>
        <div style="display:flex;flex-direction:column;gap:.5rem;margin-top:.4rem">
          ${partes.map((p,i)=>`<div style="background:var(--stone);border-radius:6px;padding:.5rem .75rem;font-size:.8rem"><strong>Parte ${i+1}:</strong> ${esc(p.nombre||'—')} · Placa: ${esc(p.placa||'—')} · Lic: ${esc(p.licencia||'—')} · Aseg: ${esc(p.aseguradora||'—')}</div>`).join('')}
        </div></div>`:''}
      ${fotos.length?`<div class="detail-field full"><label>Fotos de evidencia</label><div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.3rem">${fotos.map(f=>`<img data-foto="${esc(f)}" alt="Foto de evidencia" style="width:80px;height:80px;object-fit:cover;border-radius:6px;border:1px solid var(--border);background:var(--stone);cursor:pointer"/>`).join('')}</div></div>`:''}
    </div>
    <div class="detail-actions">
      <button class="btn btn-ghost btn-sm" onclick="printAccidente('${r.id}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Imprimir parte
      </button>
      ${puedeEditarAccidente(r)?`<button class="btn btn-secondary btn-sm" onclick="editAccidente('${r.id}');closeModal('modal-detail')">Editar</button>`:''}
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-detail')">Cerrar</button>
    </div>`;
  openModal('modal-detail');
  hidratarFotos($('modal-detail'));
}

