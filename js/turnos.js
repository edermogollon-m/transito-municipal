// ══════════════════════════════════════════════════════════
// BITÁCORA DE TURNO
// ══════════════════════════════════════════════════════════
function checkTurnoActivo() {
  const turno = JSON.parse(localStorage.getItem('tm_turno')||'null');
  const btn=$('turno-btn'), dot=$('turno-dot'), label=$('turno-label');
  if(!btn)return;
  if(turno && turno.inicio) {
    const mins=Math.floor((Date.now()-new Date(turno.inicio).getTime())/60000);
    const hrs=Math.floor(mins/60), m=mins%60;
    btn.className='turno-chip activo';
    dot.className='turno-dot on';
    label.textContent=`Turno activo ${hrs>0?hrs+'h ':''}${m}min`;
  } else {
    btn.className='turno-chip inactivo';
    dot.className='turno-dot off';
    label.textContent='Iniciar turno';
  }
}

// Si un supervisor cerró el turno, el teléfono del oficial también lo suelta
async function verificarTurnoEnServidor() {
  const turno = JSON.parse(localStorage.getItem('tm_turno')||'null');
  if (!turno?.inicio) return;
  const { data, error } = await _sb.from('turnos').select('id').eq('oficial_nombre', turno.oficial).eq('estado','activo').limit(1);
  if (error || !Array.isArray(data) || data.length) return;
  localStorage.removeItem('tm_turno');
  checkTurnoActivo();
  showToast('Tu turno fue cerrado por un supervisor');
}

async function toggleTurno() {
  const turno = JSON.parse(localStorage.getItem('tm_turno')||'null');
  if (turno && turno.inicio) {
    await cerrarTurno(turno);
  } else {
    iniciarTurno();
  }
}

function iniciarTurno() {
  const turno = { inicio: new Date().toISOString(), oficial: _session?.name||'' };
  localStorage.setItem('tm_turno', JSON.stringify(turno));
  _sb.from('turnos').insert({ oficial_nombre: turno.oficial, inicio: turno.inicio }).then(()=>{});
  checkTurnoActivo();
  showToast('Turno iniciado — ' + new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}));
}

async function cerrarTurno(turno) {
  const fin = new Date().toISOString();
  const [ {data:infs}, {data:gru} ] = await Promise.all([
    _sb.from('infracciones').select('id,monto,estado').eq('oficial',turno.oficial).gte('fecha',turno.inicio),
    _sb.from('grua').select('id').eq('oficial',turno.oficial).gte('fecha',turno.inicio)
  ]);
  const recaudacion = (infs||[]).filter(r=>r.estado==='pagada').reduce((s,r)=>s+Number(r.monto||0),0);
  const infCount = (infs||[]).length;
  const gruaCount = (gru||[]).length;
  const durMin = Math.floor((new Date(fin)-new Date(turno.inicio))/60000);
  const durHrs = Math.floor(durMin/60), durM=durMin%60;

  // Actualizar turno en BD
  await _sb.from('turnos').update({ fin, infracciones_count:infCount, grua_count:gruaCount, recaudacion, estado:'cerrado' })
    .eq('oficial_nombre', turno.oficial).eq('estado','activo');

  localStorage.removeItem('tm_turno');
  checkTurnoActivo();

  // Mostrar resumen
  const body = $('turno-resumen-body');
  if (body) {
    body.innerHTML = `
      <div style="padding:.5rem 0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1rem">
          <div class="stat-card" style="text-align:center;padding:.9rem">
            <div style="font-size:1.6rem;font-weight:800;color:var(--ink)">${infCount}</div>
            <div style="font-size:.72rem;color:var(--muted)">Infracciones levantadas</div>
          </div>
          <div class="stat-card" style="text-align:center;padding:.9rem">
            <div style="font-size:1.6rem;font-weight:800;color:var(--ink)">${gruaCount}</div>
            <div style="font-size:.72rem;color:var(--muted)">Retenciones de grúa</div>
          </div>
          <div class="stat-card" style="text-align:center;padding:.9rem">
            <div style="font-size:1.3rem;font-weight:800;color:var(--green)">${fmt(recaudacion)}</div>
            <div style="font-size:.72rem;color:var(--muted)">Recaudación directa</div>
          </div>
          <div class="stat-card" style="text-align:center;padding:.9rem">
            <div style="font-size:1.6rem;font-weight:800;color:var(--ac)">${durHrs}h ${durM}m</div>
            <div style="font-size:.72rem;color:var(--muted)">Duración del turno</div>
          </div>
        </div>
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:.4rem">Oficial: <strong>${esc(turno.oficial)}</strong></div>
        <div style="font-size:.78rem;color:var(--muted);margin-bottom:1rem">Periodo: ${new Date(turno.inicio).toLocaleString('es-MX')} → ${new Date(fin).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</div>
        <div class="modal-actions">
          <button class="btn btn-ghost" onclick="closeModal('modal-turno-resumen')">Cerrar</button>
          <button class="btn btn-primary" onclick="printTurnoResumen(${JSON.stringify({oficial:turno.oficial,inicio:turno.inicio,fin,infCount,gruaCount,recaudacion,durHrs,durM}).replace(/"/g,'&quot;')})">Imprimir resumen</button>
        </div>
      </div>`;
  }
  openModal('modal-turno-resumen');
}

function printTurnoResumen(d) {
  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Resumen de Turno</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11pt;padding:2cm}@page{size:letter portrait;margin:2cm}
  h1{font-size:16pt;margin-bottom:.3cm}h2{font-size:11pt;color:#555;margin-bottom:.8cm}.grid{display:grid;grid-template-columns:1fr 1fr;gap:.5cm;margin-bottom:1cm}
  .box{border:1px solid #ddd;border-radius:6px;padding:.5cm;text-align:center}.num{font-size:22pt;font-weight:800;color:#1A7A82}.lbl{font-size:9pt;color:#888;margin-top:.1cm}
  .meta{font-size:9pt;color:#555;margin-bottom:.3cm}.firma{margin-top:2cm;display:flex;justify-content:space-between}.firma-line{border-top:1px solid #333;padding-top:.2cm;font-size:9pt;color:#555;text-align:center;width:44%}
  </style></head><body>
  <h1>Resumen de Turno</h1><h2>Dirección de Tránsito y Movilidad Municipal</h2>
  <div class="meta">Oficial: <strong>${esc(d.oficial)}</strong></div>
  <div class="meta">Inicio: ${new Date(d.inicio).toLocaleString('es-MX')} &nbsp;|&nbsp; Fin: ${new Date(d.fin).toLocaleString('es-MX')}</div>
  <div class="meta" style="margin-bottom:.8cm">Duración: <strong>${d.durHrs}h ${d.durM}m</strong></div>
  <div class="grid">
    <div class="box"><div class="num">${d.infCount}</div><div class="lbl">Infracciones</div></div>
    <div class="box"><div class="num">${d.gruaCount}</div><div class="lbl">Retenciones grúa</div></div>
    <div class="box" style="grid-column:1/-1"><div class="num" style="color:#059669">$${Number(d.recaudacion).toLocaleString('es-MX')}</div><div class="lbl">Recaudación directa</div></div>
  </div>
  <div class="firma"><div class="firma-line">Firma del oficial</div><div class="firma-line">Vo.Bo. Supervisor</div></div>
  </body></html>`;
  const w=window.open('','_blank','width=850,height=650');w.document.write(html);w.document.close();w.onload=()=>{w.focus();w.print();};
}

