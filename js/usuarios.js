// ── Oficiales ─────────────────────────────────────────────
async function renderOficiales() {
  renderTurnosActivos();
  const tbody = $('oficiales-table'); if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  const { data, error } = await todas(() => _sb.from('infracciones').select('id,oficial,monto,estado,fecha'));
  if (error) { tbody.innerHTML=`<tr><td colspan="6" style="color:red">${esc(error.message)}</td></tr>`; return; }
  const map = {};
  (data||[]).forEach(r => {
    const k = r.oficial?.trim() || '(Sin asignar)';
    if (!map[k]) map[k]={ total:0, monto:0, pend:0, pag:0, ultima:null };
    map[k].total++;
    map[k].monto += Number(r.monto||0);
    if (r.estado==='pendiente') map[k].pend++;
    if (r.estado==='pagada')    map[k].pag++;
    if (!map[k].ultima || new Date(r.fecha)>new Date(map[k].ultima)) map[k].ultima = r.fecha;
  });
  const sorted = Object.entries(map).sort((a,b)=>b[1].total-a[1].total);
  tbody.innerHTML = sorted.length ? sorted.map(([n,s])=>`
    <tr>
      <td style="font-weight:600">${esc(n)}</td>
      <td style="text-align:center;font-weight:700">${s.total}</td>
      <td>${fmt(s.monto)}</td>
      <td>${s.pend>0?`<span class="badge-yellow">${s.pend}</span>`:'<span class="badge-muted">0</span>'}</td>
      <td>${s.pag>0?`<span class="badge-green">${s.pag}</span>`:'<span class="badge-muted">0</span>'}</td>
      <td>${fmtDateShort(s.ultima)}</td>
    </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Sin datos — agrega el nombre del oficial al registrar infracciones</td></tr>';
}

// Turnos abiertos ahora; el supervisor puede cerrar el que un oficial olvidó
async function renderTurnosActivos() {
  const card = $('turnos-activos-card'), el = $('turnos-activos'); if (!card || !el) return;
  card.style.display = '';
  const { data, error } = await _sb.from('turnos').select('id,oficial_nombre,inicio').eq('estado','activo').order('inicio');
  if (error) { el.innerHTML = `<div style="color:red;font-size:.8rem">${esc(error.message)}</div>`; return; }
  el.innerHTML = (data||[]).length ? data.map(t => {
    const min = Math.max(0, Math.floor((Date.now() - new Date(t.inicio).getTime()) / 60000)), largo = min > 12*60;
    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding:.55rem 0;border-top:1px solid var(--border)">
      <div>
        <div style="font-weight:600;font-size:.85rem">${esc(t.oficial_nombre || '—')}</div>
        <div style="font-size:.74rem;color:${largo?'var(--red)':'var(--muted)'}">Desde ${new Date(t.inicio).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})} · ${Math.floor(min/60)} h ${min%60} min${largo?' · ¿se le olvidó cerrarlo?':''}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="cerrarTurnoDe('${t.id}', ${jsArg(t.oficial_nombre)})">Cerrar turno</button>
    </div>`;
  }).join('') : '<div style="font-size:.8rem;color:var(--muted);padding-top:.3rem">No hay oficiales en turno.</div>';
}

async function cerrarTurnoDe(id, nombre) {
  if (!confirm(`¿Cerrar el turno de ${nombre}? Úsalo cuando se le olvidó cerrarlo.`)) return;
  const { data, error } = await _sb.from('turnos')
    .update({ estado: 'cerrado', fin: new Date().toISOString(), notas: `Cerrado por ${_session?.name || 'supervisor'}` })
    .eq('id', id).select('id');
  if (error || !data?.length) { alert('No se pudo cerrar el turno' + (error ? ': ' + error.message : '')); return; }
  await logActivity('turno', `Turno de ${nombre} cerrado por ${_session?.name || 'supervisor'}`);
  showToast('Turno cerrado');
  renderTurnosActivos();
}

// ── Usuarios ──────────────────────────────────────────────
async function renderUsuarios() {
  const tbody = $('usuarios-table'); if (!tbody) return;
  if (_rol !== 'admin') {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem">Acceso restringido a administradores</td></tr>';
    const navUsr = $('nav-usuarios'); if (navUsr) navUsr.style.opacity = '.4';
    return;
  }
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Cargando…</td></tr>';
  const { data, error } = await _sb.from('usuarios').select(USR_COLS).order('id');
  if (error) { tbody.innerHTML=`<tr><td colspan="5" style="color:red">${esc(error.message)}</td></tr>`; return; }
  const labels = Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.nombre]));
  tbody.innerHTML = (data||[]).map(u=>`
    <tr>
      <td style="font-weight:600">${esc(u.nombre)}</td>
      <td class="mono">${esc(u.usuario)}</td>
      <td>${esc(labels[u.rol]||u.rol)}</td>
      <td>${u.activo?'<span class="badge-green">Activo</span>':'<span class="badge-muted">Inactivo</span>'}</td>
      <td style="display:flex;gap:.4rem">
        <button class="btn btn-ghost btn-sm" onclick="editUsuario(${u.id})">Editar</button>
        <button class="btn btn-ghost btn-sm" onclick="printCredencial(${Number(u.id)})" title="Imprimir credencial con QR verificable">Credencial</button>
        <button class="btn btn-ghost btn-sm" onclick="restablecerContrasena(${u.id}, ${jsArg(u.nombre)})" title="Generar una contraseña temporal">Restablecer contraseña</button>
        ${u.usuario!=='admin'?`<button class="btn btn-ghost btn-sm" onclick="toggleUsuario(${u.id},${!u.activo})">${u.activo?'Desactivar':'Activar'}</button>`:''}
      </td>
    </tr>`).join('');
}

function describirRol() {
  const d = $('usr-rol-desc'), r = ROLES[$('usr-rol')?.value];
  if (d) d.textContent = r ? r.resumen : '';
}

function openNewUsuario() {
  $('modal-usr-title').textContent = 'Nuevo usuario';
  ['usr-id','usr-nombre','usr-usuario','usr-pass','usr-iniciales','usr-placa','usr-adscripcion'].forEach(id=>{ if($(id)) $(id).value=''; });
  if ($('usr-rol')) $('usr-rol').value = 'oficial';
  if ($('usr-pass')) $('usr-pass').placeholder = 'Contraseña requerida';
  describirRol();
  pintarFotoUsuario('');
  if ($('usr-credencial')) $('usr-credencial').style.display = 'none';
  openModal('modal-usuario');
}

async function editUsuario(id) {
  let { data, error } = await _sb.from('usuarios').select(USR_COLS + ',foto').eq('id',id).single();
  if (error) ({ data } = await _sb.from('usuarios').select(USR_COLS).eq('id',id).single());   // sin institucional.sql
  if (!data) return;
  $('modal-usr-title').textContent = 'Editar usuario';
  $('usr-id').value        = data.id;
  $('usr-nombre').value    = data.nombre;
  $('usr-usuario').value   = data.usuario;
  $('usr-pass').value      = '';
  $('usr-iniciales').value = data.iniciales||'';
  $('usr-rol').value       = data.rol;
  if ($('usr-placa')) $('usr-placa').value = data.numero_placa||'';
  if ($('usr-adscripcion')) $('usr-adscripcion').value = data.adscripcion||'';
  describirRol();
  pintarFotoUsuario(data.foto);
  if ($('usr-credencial')) $('usr-credencial').style.display = '';
  if ($('usr-reponer')) $('usr-reponer').onclick = () => reponerCredencial(data.id, data.nombre);
  if ($('usr-pass')) $('usr-pass').placeholder = 'Dejar vacío para no cambiar';
  openModal('modal-usuario');
}

async function submitUsuario() {
  const id = $('usr-id')?.value;
  const nombre = $('usr-nombre')?.value?.trim();
  const usuario = $('usr-usuario')?.value?.trim().toLowerCase();
  const pass = $('usr-pass')?.value;
  const iniciales = $('usr-iniciales')?.value?.trim().toUpperCase() || nombre.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
  const rol = $('usr-rol')?.value;
  if (!nombre||!usuario) { alert('Nombre y usuario son requeridos'); return; }
  if (!id && !pass) { alert('La contraseña es requerida para nuevos usuarios'); return; }
  if (pass && pass.length < 6) { alert('La contraseña debe tener al menos 6 caracteres'); return; }
  const { data: usrId, error } = await _sb.rpc('admin_guardar_usuario', {
    p_id: id ? parseInt(id) : null, p_nombre: nombre, p_usuario: usuario,
    p_rol: rol, p_iniciales: iniciales, p_contrasena: pass || null
  });
  if (error) { alert('Error: '+error.message); return; }
  // Datos del policía vial que se imprimen en la boleta (art. 327)
  const { error: e2 } = await _sb.from('usuarios').update({
    numero_placa: ($('usr-placa')||{}).value?.trim() || '',
    adscripcion:  ($('usr-adscripcion')||{}).value?.trim() || ''
  }).eq('id', usrId || id);
  if (e2) { alert('Usuario guardado, pero no la placa/adscripción: '+e2.message); }
  closeModal('modal-usuario');
  renderUsuarios();
  showToast('Usuario '+(id?'actualizado':'creado')+' correctamente');
}

// Contraseña temporal generada en el servidor (controles.sql)
async function restablecerContrasena(id, nombre) {
  if (!confirm(`¿Generar una contraseña temporal para ${nombre}? La actual dejará de funcionar.`)) return;
  const { data, error } = await _sb.rpc('admin_restablecer_contrasena', { p_id: id });
  if (error) { alert('Error: '+error.message); return; }
  await logActivity('usuario', `Contraseña restablecida para ${nombre}`);
  prompt(`Contraseña temporal de ${nombre}. Entrégasela en persona y pídele que la cambie en "Cambiar mi contraseña":`, data);
}

async function toggleUsuario(id, activo) {
  const { error } = await _sb.from('usuarios').update({activo}).eq('id',id);
  if (error) { alert('Error: '+error.message); return; }
  renderUsuarios();
}

