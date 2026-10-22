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

