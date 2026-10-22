// ══════════════════════════════════════════════════════════
// PORTAL CIUDADANO (ciudadano.sql)
//   * "¿Por qué me multaron?": la falta en palabras sencillas, por qué
//     importa, qué dice el Reglamento y cuánto se paga según la fecha.
//   * Avisos viales publicados por la Dirección.
//   * App con avisos al celular: el ciudadano registra sus placas y le llega
//     una multa nueva, el último día de su descuento y los avisos viales.
// Usa las utilidades de consulta.html ($, esc, montoFmt, fechaLarga, plazos).
// ══════════════════════════════════════════════════════════

// ── ¿Por qué me multaron? ──
const _explicaciones = {};
async function porQue(btn, id) {
  const panel = btn.nextElementSibling;
  const abierto = btn.getAttribute('aria-expanded') === 'true';
  btn.setAttribute('aria-expanded', String(!abierto));
  panel.hidden = abierto;
  if (abierto || panel.dataset.cargado) return;
  panel.innerHTML = '<div class="pq-cargando">Cargando explicación…</div>';
  let e = _explicaciones[id];
  if (!e) {
    try {
      const { data, error } = await _sb.rpc('explicar_infraccion', { p_id: id, p_q: _lastQ });
      if (error) throw error;
      e = _explicaciones[id] = data;
    } catch (_) {
      panel.innerHTML = '<div class="pq-cargando">No se pudo cargar la explicación. Intenta de nuevo.</div>';
      return;
    }
  }
  const r = (window._ultimos || []).find(x => Number(x.id) === Number(id));
  panel.innerHTML = htmlPorQue(e || {}, r);
  panel.dataset.cargado = '1';
}

function htmlPorQue(e, r) {
  const gravedad = { 'Leve': 'verde', 'Grave': 'ambar', 'Muy Grave': 'rojo' }[e.clasificacion] || 'gris';
  const uma = Number(e.uma) || 0;
  const rango = e.cuotas_min != null && uma
    ? `El Reglamento fija para esta falta de <strong>${e.cuotas_min} a ${e.cuotas_max} UMA</strong> (de ${montoFmt(Math.floor(e.cuotas_min * uma))} a ${montoFmt(Math.floor(e.cuotas_max * uma))}). La UMA es la unidad de medida que se usa en lugar de pesos para las multas.`
    : '';
  let tabla = '';
  if (r && (r.estado === 'pendiente' || r.estado === 'vencida')) {
    const p = plazos(r), filas = [];
    p.tramos.forEach(t => {
      const hasta = new Date(new Date(r.fecha).getTime() + t.dias * 86400000);
      const monto = Math.round(r.monto * (1 - t.pct / 100));
      filas.push({ cuando: `Hasta el ${fechaLarga(hasta)}`, monto, nota: `${t.pct}% de descuento · ahorras ${montoFmt(r.monto - monto)}`, hoy: p.tramo === t, paso: p.dias > t.dias });
    });
    filas.push({ cuando: `Hasta el ${fechaLarga(p.limite)}`, monto: r.monto, nota: 'Monto completo', hoy: !p.tramo && !p.vencida, paso: p.vencida });
    tabla = `<div class="pq-sec"><h4>Cuánto pagas según cuándo pagues</h4>
      <div class="pq-tabla">${filas.map(f => `<div class="pq-fila${f.hoy ? ' hoy' : ''}${f.paso ? ' paso' : ''}">
        <span>${f.cuando}${f.hoy ? ' <b class="pq-hoy">Hoy estás aquí</b>' : ''}<small>${f.nota}</small></span><strong>${montoFmt(f.monto)}</strong></div>`).join('')}
        <div class="pq-fila${p.vencida ? ' hoy' : ''}"><span>Después de esa fecha${p.vencida ? ' <b class="pq-hoy">Hoy estás aquí</b>' : ''}<small>La multa se considera vencida y la Tesorería puede cobrarla por la vía fiscal</small></span><strong>${montoFmt(r.monto)}</strong></div>
      </div>
      ${e.grave ? '<p class="pq-nota">Por su gravedad, esta falta no tiene descuento.</p>' : ''}</div>`;
  }
  const arts = (e.articulos || []).filter(a => a.texto);
  return `
    <div class="pq-sec"><h4>Qué pasó</h4><p>${esc(e.conducta || r?.tipo || '')}</p>
      ${e.clasificacion ? `<span class="pq-chip ${gravedad}">Falta ${esc(e.clasificacion.toLowerCase())}</span>` : ''}</div>
    ${e.por_que ? `<div class="pq-sec"><h4>Por qué es importante</h4><p>${esc(e.por_que)}</p></div>` : ''}
    ${rango ? `<div class="pq-sec"><h4>Cuánto cuesta</h4><p>${rango}${r ? ` Tu multa quedó en <strong>${montoFmt(r.monto)}</strong>.` : ''}</p></div>` : ''}
    ${tabla}
    ${arts.length || e.fundamento ? `<details class="pq-sec pq-ley"><summary>Qué dice el Reglamento</summary>
      ${e.fundamento ? `<p class="pq-fund">${esc(e.fundamento)}</p>` : ''}
      ${arts.map(a => `<p><strong>Artículo ${esc(a.numero)}.</strong> ${esc(a.texto)}</p>`).join('')}</details>` : ''}
    <p class="pq-nota">¿No estás de acuerdo? Puedes inconformarte: abajo te decimos cómo.</p>`;
}

// ── Avisos viales ──
async function cargarAvisosViales() {
  const caja = $('avisos'); if (!caja) return;
  try {
    const { data } = await _sb.rpc('avisos_viales_vigentes');
    if (!data || !data.length) return;
    caja.innerHTML = `<div class="av-tit">Avisos viales</div>` + data.map(a => `<div class="av">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div><strong>${esc(a.titulo)}</strong>${a.texto ? `<p>${esc(a.texto)}</p>` : ''}
      <small>${a.hasta ? `Del ${fechaCorta(new Date(a.desde + 'T12:00'))} al ${fechaCorta(new Date(a.hasta + 'T12:00'))}` : `Desde el ${fechaCorta(new Date(a.desde + 'T12:00'))}`}</small></div></div>`).join('');
    caja.hidden = false;
  } catch (_) {}
}

// ── App y avisos al celular ──
let _swCiudadano = null, _pushPublica = '', _instalar = null;
const pushSoportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function iniciarApp() {
  if ('serviceWorker' in navigator) {
    _swCiudadano = navigator.serviceWorker.register('/sw-ciudadano.js', { scope: '/consulta' }).catch(() => null);
  }
  _sb.rpc('push_config').then(({ data }) => { _pushPublica = data?.publica || ''; pintarAvisosCelular(); }).catch(() => {});
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _instalar = e; pintarAvisosCelular(); });
  cargarAvisosViales();
}

async function suscripcionActual() {
  if (!pushSoportado()) return null;
  const reg = await _swCiudadano;
  return reg ? reg.pushManager.getSubscription() : null;
}

function b64aBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - b64.length % 4) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

// Bloque "Avisos en tu celular": se muestra al inicio y después de cada búsqueda
async function pintarAvisosCelular(placaSugerida) {
  const caja = $('app-ciudadano'); if (!caja) return;
  if (placaSugerida !== undefined) caja.dataset.placa = placaSugerida;
  const placa = caja.dataset.placa || '';
  const sub = await suscripcionActual().catch(() => null);
  let placas = [];
  if (sub) { try { placas = (await _sb.rpc('placas_push', { p_endpoint: sub.endpoint })).data || []; } catch (_) {} }
  const n = normPlaca(placa);
  let cuerpo;
  if (!_pushPublica) {
    caja.hidden = true; return;
  } else if (!pushSoportado() || (esIOS() && !instalada())) {
    cuerpo = esIOS()
      ? `<p>En iPhone, primero agrega esta página a tu pantalla de inicio: toca <strong>Compartir</strong> y luego <strong>Agregar a inicio</strong>. Ábrela desde ahí y activa los avisos.</p>`
      : `<p>Este navegador no permite avisos. Prueba con Chrome en Android o en tu computadora.</p>`;
  } else if (placas.length) {
    cuerpo = `<p>Este celular recibe avisos de: ${placas.map(p => `<span class="ap-placa">${esc(p)}</span>`).join(' ')}</p>
      <div class="ap-botones">
        ${n.length >= 3 && !placas.includes(n) && placas.length < 5 ? `<button type="button" class="ap-btn" onclick="activarAvisos(${esc(JSON.stringify(n))})">Agregar ${esc(placa.toUpperCase())}</button>` : ''}
        <button type="button" class="ap-btn sec" onclick="quitarAvisos()">Dejar de recibir avisos</button>
      </div>`;
  } else {
    cuerpo = `<p>Te avisamos aquí si le levantan una multa a tu vehículo, un día antes de que se acabe tu descuento y cuando haya cierres de calles o desfiles.</p>
      <div class="ap-form">
        <input id="ap-placa" class="ap-campo" type="text" autocapitalize="characters" maxlength="12" placeholder="Tu placa" value="${esc(placa.toUpperCase())}" aria-label="Placa para recibir avisos"/>
        <button type="button" class="ap-btn" onclick="activarAvisos($('ap-placa').value)">Activar avisos</button>
      </div>`;
  }
  caja.innerHTML = `<div class="ap-tit">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
      Avisos en tu celular</div>${cuerpo}
    ${_instalar && !instalada() ? `<button type="button" class="ap-instalar" onclick="instalarApp()">Instalar como app en este celular</button>` : ''}`;
  caja.hidden = false;
}
const normPlaca = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function activarAvisos(placa) {
  const n = normPlaca(placa);
  if (n.length < 3) { showToast('Escribe tu placa'); $('ap-placa')?.focus(); return; }
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') { showToast('Para recibir avisos, permite las notificaciones'); return; }
    const reg = await _swCiudadano;
    if (!reg) throw new Error('sin service worker');
    // Esperar a que el service worker quede activo (la primera vez se está instalando)
    await Promise.race([navigator.serviceWorker?.ready, new Promise(r => setTimeout(r, 4000))]);
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(_pushPublica) });
    const j = sub.toJSON();
    const actuales = (await _sb.rpc('placas_push', { p_endpoint: j.endpoint })).data || [];
    const { error } = await _sb.rpc('suscribir_push', { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_placas: [...new Set([...actuales, n])] });
    if (error) throw error;
    showToast(`Listo: te avisaremos de la placa ${n}`);
  } catch (e) {
    console.error('avisos:', e);
    showToast('No se pudieron activar los avisos. Intenta de nuevo.');
  }
  await pintarAvisosCelular();
}

async function quitarAvisos() {
  try {
    const sub = await suscripcionActual();
    if (sub) { await _sb.rpc('cancelar_push', { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
    showToast('Ya no recibirás avisos en este celular');
  } catch (_) { showToast('No se pudo quitar. Intenta de nuevo.'); }
  await pintarAvisosCelular();
}

async function instalarApp() {
  if (!_instalar) return;
  _instalar.prompt();
  try { await _instalar.userChoice; } catch (_) {}
  _instalar = null;
  pintarAvisosCelular();
}
