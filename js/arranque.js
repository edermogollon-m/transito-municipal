// ── initData: crea la fila de configuración si no existe ──
// Ya no inserta datos de demostración: en producción una tabla vacía es
// legítima y no debe llenarse con infracciones ficticias.
async function initData() {
  const { count: cfgCount } = await _sb.from('configuracion').select('*',{count:'exact',head:true});
  if (!cfgCount) {
    await _sb.from('configuracion').insert({ ...SEED_CONFIG, id:1 });
  }
}

// ── Conexión con la base de datos ─────────────────────────
// Si Supabase no responde (sin internet, o el proyecto está pausado), cada
// módulo se vería vacío sin explicación. Avisarlo con una franja visible.
async function checkConexion() {
  let ok = false;
  try {
    const { error } = await _sb.from('configuracion').select('id', { head: true, count: 'exact' });
    ok = !error;
    if (error) console.error('conexión:', error);
  } catch (err) { console.error('conexión:', err.message); }
  let bar = document.getElementById('conn-banner');
  if (ok) { if (bar) bar.remove(); return true; }
  if (bar && bar.dataset.offline !== String(!navigator.onLine)) { bar.remove(); bar = null; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'conn-banner';
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#DC2626;color:#fff;font:600 .8rem DM Sans,sans-serif;padding:.55rem 1rem;text-align:center;display:flex;gap:.75rem;justify-content:center;align-items:center;flex-wrap:wrap';
    bar.dataset.offline = String(!navigator.onLine);
    if (!navigator.onLine) {
      // Sin internet en el dispositivo: se puede seguir levantando boletas
      bar.style.background = '#92400E';
      bar.innerHTML = '<span>Sin internet. Puedes seguir levantando boletas: se guardan en este dispositivo y se suben solas al volver la señal.</span>'
        + '<button type="button" style="background:#fff;color:#92400E;border:none;border-radius:6px;padding:.25rem .7rem;font:inherit;cursor:pointer">Nueva infracción</button>';
      bar.querySelector('button').onclick = () => openNewInfraccion();
    } else {
      bar.innerHTML = '<span>No hay conexión con la base de datos. Los datos no se pueden cargar ni guardar.</span>'
        + '<button type="button" style="background:#fff;color:#DC2626;border:none;border-radius:6px;padding:.25rem .7rem;font:inherit;cursor:pointer">Reintentar</button>';
      bar.querySelector('button').onclick = async () => { if (await checkConexion()) location.reload(); };
    }
    document.body.appendChild(bar);
  }
  return false;
}

// ── Boot ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(()=>{});
  }
  initUI();
  actualizarIndicadorCola();
  actualizarIndicadorCobros();
  if (!(await checkConexion())) {
    navigate('dashboard');
    // Sin internet con sesión ya iniciada: queda listo para levantar boletas
    if (!navigator.onLine && _session) precargarSinSenal();
    return;
  }
  if (!(await verificarSesion())) return;
  iniciarControlInactividad();
  precargarSinSenal();
  sincronizarCola();
  sincronizarCobros();
  setInterval(() => { sincronizarCola(); sincronizarCobros(); }, 120000);
  checkTurnoActivo();
  setInterval(checkTurnoActivo, 60000);
  verificarTurnoEnServidor().catch(() => {});
  try { await initData(); } catch(err) { console.warn('initData:', err.message); }
  try { await checkAndUpdateVencidos(); } catch(err) { console.warn('vencidos:', err.message); }
  setupPushNotifications().catch(()=>{});
  const repMes = new URLSearchParams(location.search).get('reporte');
  if (repMes && /^\d{4}-\d{2}$/.test(repMes)) {
    // Enlace del correo mensual: abre Reportes con ese mes elegido
    navigate('reportes'); initReporteMensual(repMes);
    history.replaceState(null, '', location.pathname);
  } else navigate('dashboard');
});

// ── Guardas de permisos ───────────────────────────────────
// Si una acción restringida se llama sin pasar por un botón (atajo, consola),
// se avisa en lugar de dejar que la base de datos la rechace con un error.
[['openNewInfraccion','infraccion'], ['openRegistrarPago','cobrar'], ['submitPago','cobrar'],
 ['impugnarInfraccion','impugnar'], ['resolverImpugnacion','resolver'],
 ['openNewPermiso','permisos'], ['editPermiso','permisos'], ['renovarPermiso','permisos'], ['cancelarPermiso','permisos'],
 ['anularPago','anular'], ['cerrarTurnoDe','turnos'], ['openCorteCaja','cobrar'], ['cerrarCorte','cobrar'],
 ['openNewGrua','grua'], ['editGrua','liberar'], ['liberarVehiculo','liberar'],
 ['openNewAccidente','accidentes'], ['editAccidente','accidentes'], ['openNewVehiculo','padron'], ['editVehiculo','padron'],
 ['printCorteCaja','caja_ver'], ['abrirResolucion','impugnar'], ['abrirDevolucion','devolver']
].forEach(([fn, accion]) => {
  const orig = window[fn];
  if (typeof orig !== 'function' || puede(accion)) return;
  window[fn] = function () { showToast(`Tu rol (${_permisosRol.nombre}) no tiene permiso para esta acción`); };
});
