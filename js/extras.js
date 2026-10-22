// ══════════════════════════════════════════════════════════
// NOTIFICACIONES PUSH (Notifications API + Realtime)
// ══════════════════════════════════════════════════════════
async function setupPushNotifications() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  if (Notification.permission !== 'granted') return;

  // Escuchar nuevas impugnaciones en tiempo real
  _sb.channel('rt-impugnaciones')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'infracciones',
      filter: 'estado=eq.impugnada'
    }, payload => {
      if (_rol === 'admin' || _rol === 'supervisor') {
        const r = payload.new;
        new Notification('Tránsito Municipal — Impugnación', {
          body: `Infracción ${r.folio||r.id} (${r.placa}) fue impugnada. Requiere resolución.`,
          icon: '/manifest.json',
          tag: `imp-${r.id}`
        });
      }
    })
    .subscribe();

  // Escuchar nuevos accidentes
  _sb.channel('rt-accidentes')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'accidentes'
    }, payload => {
      if (_rol === 'admin' || _rol === 'supervisor') {
        const r = payload.new;
        new Notification('Tránsito Municipal — Accidente', {
          body: `Nuevo accidente registrado en ${r.ubicacion||'ubicación desconocida'}.`,
          tag: `acc-${r.id}`
        });
      }
    })
    .subscribe();
}

// ══════════════════════════════════════════════════════════
// CREDENCIAL DIGITAL DEL OFICIAL
// ══════════════════════════════════════════════════════════
async function printCredencial(userId) {
  const {data,error}=await _sb.from('usuarios').select(USR_COLS).eq('id',userId).single();
  if(error||!data){alert('No se pudo cargar el usuario.');return;}
  const rolLabel=Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.nombre]));
  const iniciales=(data.iniciales||data.nombre.split(' ').map(n=>n[0]).join('').slice(0,2)).toUpperCase();
  const qrVal=`OFICIAL:${data.usuario}|ID:${data.id}|ROL:${data.rol}`;
  let qrDataUrl='';
  try{qrDataUrl=new QRious({value:qrVal,size:180,padding:8,backgroundAlpha:1}).toDataURL();}catch(e){}

  const html=`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Credencial — ${esc(data.nombre)}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}@page{size:85.6mm 53.98mm;margin:0}
  body{width:85.6mm;height:53.98mm;font-family:Arial,sans-serif;background:#fff;overflow:hidden}
  .card{width:100%;height:100%;display:flex;flex-direction:column;border:1.5px solid #1A7A82}
  .card-top{background:#1A7A82;padding:3mm 4mm;display:flex;align-items:center;gap:3mm;flex:0}
  .avatar{width:12mm;height:12mm;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:14pt;font-weight:800;color:#fff;flex-shrink:0}
  .card-info{color:#fff}.card-name{font-size:9pt;font-weight:700;line-height:1.2}.card-role{font-size:7pt;opacity:.75}
  .card-logo{margin-left:auto;font-size:10pt;font-weight:800;color:rgba(255,255,255,.7);letter-spacing:.05em}
  .card-body{padding:3mm 4mm;display:flex;gap:3mm;flex:1;align-items:center}
  .card-fields{flex:1;display:flex;flex-direction:column;gap:1.5mm}
  .field{font-size:7pt}.field-label{color:#888;font-size:6pt;text-transform:uppercase;letter-spacing:.06em}.field-val{color:#111;font-weight:600}
  .card-qr img{width:18mm;height:18mm}
  .card-footer{background:#f5f5f5;padding:1.5mm 4mm;font-size:6pt;color:#888;text-align:center;border-top:1px solid #eee}
  </style></head><body>
  <div class="card">
    <div class="card-top">
      <div class="avatar">${esc(iniciales)}</div>
      <div class="card-info">
        <div class="card-name">${esc(data.nombre)}</div>
        <div class="card-role">${esc(rolLabel[data.rol]||data.rol)}</div>
      </div>
      <div class="card-logo">HCE</div>
    </div>
    <div class="card-body">
      <div class="card-fields">
        <div class="field"><div class="field-label">Usuario</div><div class="field-val">${esc(data.usuario)}</div></div>
        <div class="field"><div class="field-label">Rol</div><div class="field-val">${esc(rolLabel[data.rol]||data.rol)}</div></div>
        <div class="field"><div class="field-label">Estado</div><div class="field-val" style="color:${data.activo?'#059669':'#DC2626'}">${data.activo?'Activo':'Inactivo'}</div></div>
      </div>
      ${qrDataUrl?`<div class="card-qr"><img src="${qrDataUrl}"/></div>`:''}
    </div>
    <div class="card-footer">Tránsito y Movilidad Municipal · HCE Consultoría · Credencial oficial de agente</div>
  </div>
  </body></html>`;
  const w=window.open('','_blank','width=420,height=320');w.document.write(html);w.document.close();w.onload=()=>{w.focus();w.print();};
}

