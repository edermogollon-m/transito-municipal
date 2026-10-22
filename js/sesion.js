// ══════════════════════════════════════════════════════════
// BITÁCORA (tabla auditoria, la llenan triggers en el servidor)
// ══════════════════════════════════════════════════════════
const BIT_MODULOS = { infracciones:'Infracciones', pagos:'Pagos', permisos:'Permisos', vehiculos:'Vehículos', grua:'Grúa', accidentes:'Accidentes', usuarios:'Usuarios', configuracion:'Configuración', turnos:'Turnos' };
const BIT_ACCIONES = { alta:['Alta','badge-green'], cambio:['Cambio','badge-blue'], baja:['Baja','badge-red'] };
const BIT_CAMPOS = { estado:'Estado', monto:'Monto', placa:'Placa', infractor:'Infractor', tipo:'Tipo', ubicacion:'Ubicación', obs:'Observaciones', oficial:'Oficial', fecha:'Fecha', licencia:'Licencia', vehiculo:'Vehículo', color_vehiculo:'Color', telefono:'Teléfono', impugnacion_motivo:'Motivo de impugnación', monto_final:'Total cobrado', monto_original:'Monto original', descuento_pct:'Descuento %', metodo:'Método', cajero:'Cajero', rol:'Rol', activo:'Activo', nombre:'Nombre', usuario:'Usuario', vencimiento:'Vencimiento', titular:'Titular', propietario:'Propietario', fecha_liberacion:'Liberación', montos:'Tarifas', descripcion:'Descripción', valor_uma:'Valor UMA', correo_reporte:'Correo del reporte', infractor_domicilio:'Domicilio del infractor', infractor_correo:'Correo del infractor', infractor_ausente:'Infractor ausente', licencia_tipo:'Tipo de licencia', circunstancias:'Circunstancias (art. 331)', numero_placa:'Placa del policía vial', adscripcion:'Adscripción', leyenda_recurso:'Medio de defensa', documento_retenido:'Documento retenido', documento_numero:'Número del documento', firma_negada:'Se negó a firmar', resguardo_lugar:'Lugar de resguardo', avisos_correo:'Avisos por correo', avisos_whatsapp:'Avisos por WhatsApp', pago_en_linea:'Pago en línea' };
let _bitDesde = 0;

function _bitValor(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) return fmtDateShort(v);
  return String(v);
}

function _bitDetalle(e) {
  const c = e.cambios || {};
  if (e.accion === 'cambio') {
    return Object.entries(c).map(([k, v]) =>
      `<div><span style="color:var(--muted)">${esc(BIT_CAMPOS[k] || k)}:</span> ${esc(_bitValor(v.antes))} → <strong>${esc(_bitValor(v.despues))}</strong></div>`).join('');
  }
  const clave = ['tipo','placa','infractor','monto','monto_final','estado','titular','nombre','rol'].filter(k => c[k] !== undefined && c[k] !== '');
  return clave.slice(0, 4).map(k => `<span style="color:var(--muted)">${esc(BIT_CAMPOS[k] || k)}:</span> ${esc(_bitValor(c[k]))}`).join(' · ');
}

async function renderBitacora(mas) {
  const tbody = $('bitacora-table'); if (!tbody) return;
  if (!mas && _rol === 'admin') renderErroresApp();
  if (!mas) { _bitDesde = 0; tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Cargando…</td></tr>'; }
  const PAG = 100;
  let q = _sb.from('auditoria').select('*').order('ts', { ascending: false }).range(_bitDesde, _bitDesde + PAG - 1);
  const tabla = $('bit-tabla')?.value, accion = $('bit-accion')?.value;
  const desde = $('bit-desde')?.value, hasta = $('bit-hasta')?.value;
  const buscar = ($('bit-buscar')?.value || '').trim().replace(/[,()"'\\%*]/g, ' ').trim();
  if (tabla)  q = q.eq('tabla', tabla);
  if (accion) q = q.eq('accion', accion);
  if (desde)  q = q.gte('ts', desde + 'T00:00:00');
  if (hasta)  q = q.lte('ts', hasta + 'T23:59:59');
  if (buscar) q = q.or(`usuario_nombre.ilike.%${buscar}%,resumen.ilike.%${buscar}%`);
  const { data, error } = await q;
  if (error) { tbody.innerHTML = `<tr><td colspan="6" style="color:red">${esc(error.message)}</td></tr>`; return; }
  const filas = (data || []).map(e => {
    const [acc, cls] = BIT_ACCIONES[e.accion] || [e.accion, 'badge-muted'];
    return `<tr>
      <td style="white-space:nowrap">${esc(new Date(e.ts).toLocaleString('es-MX', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }))}</td>
      <td style="font-weight:600">${esc(e.usuario_nombre || '—')}</td>
      <td><span class="${cls}">${esc(acc)}</span></td>
      <td>${esc(BIT_MODULOS[e.tabla] || e.tabla)}</td>
      <td class="mono">${esc(e.resumen || e.registro_id || '—')}</td>
      <td style="font-size:.78rem;line-height:1.5">${_bitDetalle(e)}</td>
    </tr>`;
  }).join('');
  if (!mas) tbody.innerHTML = filas || '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Sin movimientos con estos filtros</td></tr>';
  else tbody.insertAdjacentHTML('beforeend', filas);
  _bitDesde += (data || []).length;
  const btnMas = $('bit-mas'); if (btnMas) btnMas.style.display = (data || []).length === PAG ? '' : 'none';
}

// Errores que reportó la app en los navegadores del personal (solo el Director)
async function renderErroresApp() {
  const card = $('errores-card'), tbody = $('errores-table'); if (!card || !tbody) return;
  card.style.display = '';
  const { data, error } = await _sb.from('errores_app').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) { tbody.innerHTML = `<tr><td colspan="4" style="color:red">${esc(error.message)}</td></tr>`; return; }
  const n = $('errores-count'); if (n) n.textContent = (data || []).length ? `${data.length} recientes` : '';
  tbody.innerHTML = (data || []).length ? data.map(e => `<tr>
      <td style="white-space:nowrap">${esc(new Date(e.created_at).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }))}</td>
      <td style="font-weight:600">${esc(e.usuario || '—')}</td>
      <td style="font-size:.78rem">${esc(/^view-[a-z]+$/.test(e.pagina || '') ? (document.querySelector(`[data-view="${e.pagina.slice(5)}"]`)?.textContent.replace(/\d+/g, '').trim() || e.pagina.slice(5)) : (e.pagina || '—'))}</td>
      <td style="font-size:.78rem;line-height:1.5"><div style="font-weight:600">${esc(e.mensaje)}</div>
        ${e.detalle ? `<details><summary style="cursor:pointer;color:var(--muted)">Detalle</summary><pre style="white-space:pre-wrap;font-size:.7rem;margin:.3rem 0 0">${esc(e.detalle)}</pre><div style="color:var(--muted);font-size:.7rem">${esc(e.navegador)}</div></details>` : ''}</td>
    </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--muted)">Sin errores registrados. Todo en orden.</td></tr>';
}

// Historial de un registro dentro de su detalle (solo lo ven mandos: RLS).
async function cargarHistorial(tabla, id, cont) {
  if (!cont || (_rol !== 'admin' && _rol !== 'supervisor')) return;
  const { data } = await _sb.from('auditoria').select('*').eq('tabla', tabla).eq('registro_id', String(id)).order('ts', { ascending: true });
  if (!data || !data.length) return;
  cont.innerHTML = `<div style="margin-top:1rem">
    <div style="font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:.5rem">Historial</div>
    ${data.map(e => `<div style="font-size:.78rem;padding:.4rem 0;border-top:1px solid var(--border)">
      <div><strong>${esc((BIT_ACCIONES[e.accion] || [e.accion])[0])}</strong> · ${esc(e.usuario_nombre || '—')} · <span style="color:var(--muted)">${esc(new Date(e.ts).toLocaleString('es-MX'))}</span></div>
      ${e.accion === 'cambio' ? `<div style="margin-top:.2rem">${_bitDetalle(e)}</div>` : ''}
    </div>`).join('')}
  </div>`;
}

// ── Registro de errores (mejoras.sql: errores_app) ────────
// Se anotan hasta 5 errores distintos por sesión para no llenar la tabla.
const _erroresVistos = new Set();
function reportarError(mensaje, detalle) {
  try {
    if (typeof _sb === 'undefined' || !_sb || !_rol) return;
    mensaje = String(mensaje || 'Error desconocido').slice(0, 1000);
    if (_erroresVistos.has(mensaje) || _erroresVistos.size >= 5) return;
    if (/ResizeObserver loop|Script error\.?$/.test(mensaje)) return;
    _erroresVistos.add(mensaje);
    _sb.from('errores_app').insert({
      pagina: (document.querySelector('.view.active')?.id || location.pathname).slice(0, 300),
      mensaje, detalle: String(detalle || '').slice(0, 4000), navegador: navigator.userAgent.slice(0, 300),
    }).then(() => {}, () => {});
  } catch (_) { /* nunca romper la app por reportar */ }
}
window.addEventListener('error', e => reportarError(e.message, `${e.filename || ''}:${e.lineno || ''}:${e.colno || ''}\n${e.error?.stack || ''}`));
window.addEventListener('unhandledrejection', e => {
  const r = e.reason;
  reportarError(r?.message || String(r), r?.stack || '');
});

// ── Toast ─────────────────────────────────────────────────
function showToast(msg) {
  let t = document.querySelector('.toast');
  if(!t){ t=document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent=msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

// ── Sidebar / logout ──────────────────────────────────────
function initUI() {
  const userNameEl = document.querySelector('.user-name');
  const userRoleEl = document.querySelector('.user-role');
  const userInitEl = document.querySelector('.user-avatar');
  if(userNameEl) userNameEl.textContent = _session.name;
  if(userRoleEl) userRoleEl.textContent = _session.role;
  if(userInitEl) userInitEl.textContent = _session.initials;

  const dateEl = $('topbar-date');
  if(dateEl) dateEl.textContent = new Date().toLocaleDateString('es-MX',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});

  document.querySelectorAll('[data-view]').forEach(el=>{
    el.addEventListener('click', ()=>navigate(el.dataset.view));
  });
  document.querySelectorAll('.modal-overlay').forEach(m=>{
    m.addEventListener('click', e=>{ if(e.target===m) closeModal(m.id); });
  });

  // ── Menú según el rol (ver ROLES) ────────────────────────
  document.querySelectorAll('.nav-item').forEach(btn => {
    const view = btn.dataset.view || (btn.getAttribute('onclick')||'').match(/navigate\('(\w+)'/)?.[1];
    if (view && !vistaPermitida(view)) btn.style.display = 'none';
  });
  document.querySelectorAll('.sidebar-section').forEach(sec => {
    const visible = [...sec.querySelectorAll('.nav-item')].some(b => b.style.display !== 'none');
    if (!visible) sec.style.display = 'none';
  });
  aplicarPermisosUI();
  if (_permisosRol.soloMias && $('inf-alcance')) $('inf-alcance').style.display = '';

  // ── Realtime: refrescar dashboard al recibir cambios ─────
  _sb.channel('rt-infracciones')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'infracciones' }, () => {
      const dash = $('view-dashboard');
      if (dash && dash.style.display !== 'none') renderDashboard();
      const badge = $('badge-pendientes');
      if (badge) _sb.from('infracciones').select('id',{count:'exact',head:true}).eq('estado','pendiente')
        .then(({count}) => { if(count!=null){badge.textContent=count;badge.style.display=count?'inline':'none';} });
    })
    .subscribe();

  // ── Búsqueda global ⌘K / Ctrl+K ─────────────────────────
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openGlobalSearch();
    }
    if (e.key === 'Escape') {
      closeModal('modal-search');
    }
  });
}

// ── Cambiar mi contraseña ─────────────────────────────────
function openCambiarContrasena() {
  ['pwd-actual','pwd-nueva','pwd-confirma'].forEach(id => { if ($(id)) $(id).value = ''; });
  openModal('modal-contrasena');
  setTimeout(() => $('pwd-actual')?.focus(), 50);
}

async function cambiarContrasena() {
  const actual = $('pwd-actual').value, nueva = $('pwd-nueva').value, confirma = $('pwd-confirma').value;
  if (!actual || !nueva) { alert('Escribe tu contraseña actual y la nueva'); return; }
  if (nueva.length < 6) { alert('La nueva contraseña debe tener al menos 6 caracteres'); return; }
  if (nueva !== confirma) { alert('La confirmación no coincide con la nueva contraseña'); return; }
  if (nueva === actual) { alert('La nueva contraseña debe ser distinta de la actual'); return; }
  const btn = $('pwd-submit'); if (btn) btn.disabled = true;
  try {
    // Confirmar la contraseña actual antes de cambiarla
    const { data: { session } } = await _sb.auth.getSession();
    const email = session?.user?.email;
    const { error: e1 } = await _sb.auth.signInWithPassword({ email, password: actual });
    if (e1) { alert('La contraseña actual no es correcta'); return; }
    const { error: e2 } = await _sb.auth.updateUser({ password: nueva });
    if (e2) { alert('No se pudo cambiar: ' + e2.message); return; }
    await logActivity('usuario', `${_session?.name || 'Usuario'} cambió su contraseña`);
    closeModal('modal-contrasena');
    showToast('Contraseña actualizada');
  } finally { if (btn) btn.disabled = false; }
}

async function logout() {
  try { await _sb.auth.signOut(); } catch(_) {}
  localStorage.removeItem('tm_session');
  window.location.replace('/login');
}

// ── Cierre de sesión por inactividad ──────────────────────
// En los equipos compartidos (ventanilla, oficina) la sesión se cierra sola
// tras 15 minutos sin usar la app; un minuto antes avisa. Los oficiales en
// campo quedan fuera, y sin internet no se cierra (para no perder la cola).
const INACTIVIDAD_MIN = 15;
let _ultimaActividad = Date.now(), _avisoInactividad = null;
function _marcarActividad() {
  _ultimaActividad = Date.now();
  try { localStorage.setItem('tm_actividad', String(_ultimaActividad)); } catch (_) {}
  if (_avisoInactividad) { _avisoInactividad.remove(); _avisoInactividad = null; }
}
function iniciarControlInactividad() {
  if (!_rol || _rol === 'oficial') return;
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => document.addEventListener(ev, () => {
    if (Date.now() - _ultimaActividad > 5000 || _avisoInactividad) _marcarActividad();
  }, { passive: true, capture: true }));
  window.addEventListener('storage', e => { if (e.key === 'tm_actividad') { _ultimaActividad = Number(e.newValue) || Date.now(); if (_avisoInactividad) { _avisoInactividad.remove(); _avisoInactividad = null; } } });
  _marcarActividad();
  setInterval(() => {
    if (!navigator.onLine) { _ultimaActividad = Date.now(); return; }
    const quieto = Date.now() - _ultimaActividad, limite = INACTIVIDAD_MIN * 60000;
    if (quieto >= limite) { logActivity('sesion', `Sesión cerrada por inactividad — ${_session?.name || ''}`).catch(() => {}); logout(); return; }
    if (quieto >= limite - 60000) {
      const seg = Math.max(0, Math.ceil((limite - quieto) / 1000));
      if (!_avisoInactividad) {
        _avisoInactividad = document.createElement('div');
        _avisoInactividad.className = 'aviso-inactividad';
        _avisoInactividad.setAttribute('role', 'alertdialog');
        _avisoInactividad.innerHTML = `<div><strong>¿Sigues ahí?</strong><p>Por seguridad, la sesión se cerrará en <span id="inact-seg"></span> segundos.</p>
          <button type="button" class="btn btn-primary" id="inact-seguir">Seguir trabajando</button></div>`;
        document.body.appendChild(_avisoInactividad);
        $('inact-seguir').onclick = _marcarActividad;
      }
      const el = $('inact-seg'); if (el) el.textContent = seg;
    }
  }, 1000);
}

// Confirma que la sesión de Supabase sigue siendo válida y el usuario activo
async function verificarSesion() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { await logout(); return false; }
  const { data: u, error } = await _sb.from('usuarios').select('rol,activo').eq('auth_id', session.user.id).maybeSingle();
  if (error) { console.error('sesión:', error); return true; }   // falla de red: la BD sigue aplicando permisos
  if (!u || !u.activo) { await logout(); return false; }
  if (u.rol !== _rol) {
    // El rol cambió desde el último login: refrescar perfil y recargar la UI
    localStorage.setItem('tm_session', JSON.stringify({ ..._session, rol: u.rol }));
    window.location.reload();
    return false;
  }
  _sb.auth.onAuthStateChange(evt => {
    if (evt === 'SIGNED_OUT') { localStorage.removeItem('tm_session'); window.location.replace('/login'); }
  });
  return true;
}

