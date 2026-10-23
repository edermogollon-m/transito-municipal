// Página de la Dirección de Tránsito: consulta, pago en línea, constancia de
// no infracción y contenido informativo. Usa solo las funciones públicas del
// sistema (las mismas que el portal /consulta), con la llave pública.
'use strict';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = n => Number(n || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fechaCorta = d => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
const fechaLarga = d => d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
const icono = (id, w = 20) => `<svg width="${w}" height="${w}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
const SIS = SITIO.sistema.replace(/\/$/, '');

let _info = {};
let _params = { descuento_pct: 0, dias_descuento: 0, descuento2_pct: 0, dias_descuento2: 0, dias_limite: 30 };
let _pagoEnLinea = false;

// ── Llamadas al sistema ────────────────────────────────────
async function rpc(fn, args = {}) {
  const res = await fetch(`${SITIO.supabase.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SITIO.supabase.llave, Authorization: `Bearer ${SITIO.supabase.llave}` },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn}: ${res.status}`);
  return res.json();
}
async function funcion(nombre, cuerpo) {
  const res = await fetch(`${SITIO.supabase.url}/functions/v1/${nombre}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SITIO.supabase.llave }, body: JSON.stringify(cuerpo),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'El servicio no respondió');
  return d;
}

function avisar(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('ver');
  clearTimeout(avisar._t); avisar._t = setTimeout(() => t.classList.remove('ver'), 3200);
}

// ── Contenido fijo (datos.js) ──────────────────────────────
function pintarContenido() {
  const o = SITIO.oficina;
  document.querySelectorAll('[data-oficina-nombre]').forEach(el => { el.textContent = o.nombre; });
  document.querySelectorAll('[data-oficina-domicilio]').forEach(el => { el.textContent = o.domicilio; });
  document.querySelectorAll('[data-caja-nombre]').forEach(el => { el.textContent = SITIO.caja.nombre; });
  document.querySelectorAll('[data-caja-domicilio]').forEach(el => { el.textContent = SITIO.caja.domicilio; });
  document.querySelectorAll('[data-caja-horario]').forEach(el => { el.textContent = SITIO.caja.horario; });
  document.querySelectorAll('[data-uma]').forEach(el => { el.textContent = '$' + SITIO.uma.toFixed(2); });
  $('horario').innerHTML = o.horario.map(([d, h]) => `<dt>${esc(d)}</dt><dd>${esc(h)}</dd>`).join('');
  const tel = $('oficina-tel'); tel.textContent = o.telefono; tel.href = 'tel:' + o.telefono.replace(/\D/g, '');
  if (o.whatsapp) { const wa = $('oficina-wa'); wa.hidden = false; wa.href = 'https://wa.me/52' + o.whatsapp.replace(/\D/g, ''); }
  const { lat, lng } = o.mapa, d = .006;
  $('mapa').innerHTML = `<iframe title="Mapa de la ${esc(o.nombre)}" loading="lazy" referrerpolicy="no-referrer"
    src="https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d * .6},${lng + d},${lat + d * .6}&layer=mapnik&marker=${lat},${lng}"></iframe>`;
  $('como-llegar').href = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  $('emergencias').innerHTML = SITIO.emergencias.map(([n, t]) => `<a href="tel:${esc(t)}"><b>${esc(t)}</b>${esc(n)}</a>`).join('');
  $('lnk-privacidad').href = SIS + '/privacidad';
  $('lnk-personal').href = SIS + '/login';
  $('btn-avisos').href = SIS + '/consulta';

  const claseCss = c => c.toLowerCase().replace(/\s+/g, '-');
  $('multas-grid').innerHTML = SITIO.multas.map(m => `<article class="multa revelar">
    <div class="multa-top"><span class="prohibido">${icono(m.icono)}</span><h3>${esc(m.titulo)}</h3></div>
    <span class="clase ${claseCss(m.clase)}">${esc(m.clase)}</span>
    <div class="rango">${pesos(m.uma[0] * SITIO.uma)} a ${pesos(m.uma[1] * SITIO.uma)}<small>De ${m.uma[0]} a ${m.uma[1]} UMA</small></div>
    ${m.nota ? `<div class="nota-multa">${esc(m.nota)}</div>` : ''}
    <div class="art">Art. ${esc(m.art)} del Reglamento</div>
  </article>`).join('');

  $('tramites-lista').innerHTML = SITIO.tramites.map(t => `<details class="tramite revelar" id="tramite-${esc(t.id)}">
    <summary><span class="ico">${icono(t.icono, 26)}</span><b>${esc(t.titulo)}</b><span class="mas" aria-hidden="true"></span></summary>
    <div class="tramite-cuerpo">
      <div><h4>Pasos</h4><ol class="pasos">${t.pasos.map(p => `<li><span>${esc(p)}</span></li>`).join('')}</ol></div>
      <div><h4>${t.id === 'constancia' ? 'Bueno saber' : 'Qué llevar'}</h4><ul class="requisitos">${t.requisitos.map(r => `<li>${icono('ok', 18)}<span>${esc(r)}</span></li>`).join('')}</ul></div>
      ${t.id === 'corralon' ? `<p class="tramite-cta">El corralón está en <b>${esc(SITIO.corralon.domicilio)}</b>, ${esc(SITIO.corralon.horario.toLowerCase())}.</p>` : ''}
      ${t.id === 'constancia' || t.id === 'corralon' ? `<div class="tramite-cta"><a class="btn-oscuro" href="#consulta" data-foco="q">Consultar mi placa ${icono('flecha', 18)}</a></div>` : ''}
    </div>
  </details>`).join('');

  $('consejos-grid').innerHTML = SITIO.consejos.map(([ico, t, p]) => `<article class="consejo revelar">
    <span class="preventiva">${icono(ico, 24)}</span><div><h3>${esc(t)}</h3><p>${esc(p)}</p></div></article>`).join('');

  $('faq').innerHTML = SITIO.preguntas.map(([p, r]) => `<details class="revelar"><summary>${esc(p)}</summary><p>${esc(r)}</p></details>`).join('');
}

// Los accesos que llevan a un trámite lo abren; los de la consulta enfocan la placa
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const destino = document.querySelector(a.getAttribute('href'));
  if (destino?.tagName === 'DETAILS') destino.open = true;
  if (a.dataset.foco) setTimeout(() => $(a.dataset.foco)?.focus({ preventScroll: true }), 450);
});

// ── Datos del sistema ──────────────────────────────────────
function pintarMarca(d) {
  // "Veracruz de Ignacio de la Llave" → "Veracruz" (cabe en la placa y en la barra)
  const municipio = d.municipio || SITIO.municipio, estado = (d.estado || SITIO.estado).split(' de ')[0];
  document.querySelectorAll('[data-municipio]').forEach(el => { el.textContent = municipio; });
  $('marca-municipio').textContent = `${municipio}, ${estado}`;
  document.querySelectorAll('[data-estado-placa]').forEach(el => { el.textContent = estado.toUpperCase(); });
  const inst = d.institucion || `H. Ayuntamiento de ${municipio}`;
  document.querySelectorAll('[data-institucion]').forEach(el => { el.textContent = inst; });
  document.title = `Tránsito ${municipio} — Consulta y paga tus infracciones`;
  if (/^#[0-9a-f]{6}$/i.test(d.color || '')) document.documentElement.style.setProperty('--ac', d.color);
  const esc0 = $('escudo');
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d.escudo || '')) {
    const img = new Image(); img.src = d.escudo; img.alt = ''; esc0.replaceChildren(img); esc0.style.background = 'transparent';
  } else esc0.innerHTML = '<span class="escudo-vacio"></span>';
  if (d.pago_clabe) {
    $('transferencia-txt').innerHTML = `${d.pago_banco ? `<b>${esc(d.pago_banco)}</b><br>` : ''}${d.pago_beneficiario ? esc(d.pago_beneficiario) + '<br>' : ''}
      <span class="clabe"><code>${esc(d.pago_clabe)}</code><button class="link-btn" type="button" data-copiar="${esc(d.pago_clabe)}">Copiar</button></span>
      <br>Escribe el folio de tu boleta como concepto y envía tu comprobante${d.correo ? ` a <a href="mailto:${esc(d.correo)}">${esc(d.correo)}</a>` : ' a la Dirección'}.`;
  }
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-copiar]');
  if (b) navigator.clipboard?.writeText(b.dataset.copiar).then(() => avisar(b.dataset.aviso || 'CLABE copiada')).catch(() => avisar(b.dataset.copiar));
});

function tramosDescuento() {
  return [[_params.descuento_pct, _params.dias_descuento], [_params.descuento2_pct, _params.dias_descuento2]]
    .filter(([p, d]) => p > 0 && d > 0).map(([pct, dias]) => ({ pct, dias }));
}
function pintarDescuentos() {
  const tramos = tramosDescuento(), lim = _params.dias_limite || 30;
  if (tramos.length) document.querySelectorAll('[data-desc1]').forEach(el => { el.textContent = tramos[0].pct; });
  const colores = ['#3DDC97', '#9BE8C2'];
  let ini = 0;
  const html = tramos.map((t, i) => {
    const s = `<div class="tramo" style="--dias:${Math.max(t.dias - ini, 3)};--color:${colores[i] || '#C9F0DC'}">
      <span class="pct">${t.pct}<small>% menos</small></span><span class="dias">Del día ${ini + 1} al ${t.dias}</span></div>`;
    ini = t.dias; return s;
  }).join('') + `<div class="tramo" style="--dias:${Math.max(lim - ini, 4)};--color:#FFD45C">
      <span class="pct">100<small>% de la multa</small></span><span class="dias">Del día ${ini + 1} al ${lim}</span></div>
    <div class="tramo" style="--dias:4;--color:#FF8A8A"><span class="pct" style="font-size:1.3rem">Vencida</span><span class="dias">Después del día ${lim}</span></div>`;
  $('carretera').innerHTML = `<div class="tramos">${html}</div><div class="postes"><span>Día de la boleta</span><span>Día ${lim}</span></div>`;
  const ej = 10 * SITIO.uma;
  $('ejemplo-descuento').innerHTML = `<b>Ejemplo:</b> una multa de 10 UMA (${pesos(ej)}).
    <span class="cifras">${tramos.map(t => `<span>${pesos(ej * (1 - t.pct / 100))} hasta el día ${t.dias}</span>`).join('')}<span>${pesos(ej)} hasta el día ${lim}</span></span>
    <small style="display:block;margin-top:.4rem;color:var(--gris)">Conducir en estado de ebriedad no tiene descuento.</small>`;
}

async function pintarAvisosViales() {
  try {
    const avisos = await rpc('avisos_viales_vigentes');
    if (!avisos?.length) return;
    const f = d => fechaCorta(new Date(d + 'T12:00'));
    $('avisos-lista').innerHTML = avisos.map(a => `<article class="aviso-vial">
      <span class="rombo">${icono('alerta')}</span>
      <div><h3>${esc(a.titulo)}</h3>${a.texto ? `<p>${esc(a.texto)}</p>` : ''}
      <small>${a.hasta ? `Del ${f(a.desde)} al ${f(a.hasta)}` : `Desde el ${f(a.desde)}`}</small></div></article>`).join('');
    $('avisos').hidden = false;
  } catch (_) { /* sin avisos */ }
}

const _listo = (async () => {
  const [info, params, pago] = await Promise.allSettled([
    rpc('portal_info'), rpc('parametros_descuento'), funcion('pago-mp', { accion: 'estado' }),
  ]);
  if (info.status === 'fulfilled' && info.value) { _info = Array.isArray(info.value) ? info.value[0] : info.value; }
  pintarMarca(_info || {});
  if (params.status === 'fulfilled' && params.value) _params = { ..._params, ...params.value };
  _pagoEnLinea = pago.status === 'fulfilled' && pago.value?.disponible === true;
  pintarDescuentos();
})();

// ── Consulta ───────────────────────────────────────────────
function plazos(r) {
  const f = new Date(r.fecha);
  const dias = Math.max(0, Math.floor((Date.now() - f.getTime()) / 86400000));
  const tramos = r.grave ? [] : tramosDescuento();
  const tramo = tramos.find(t => dias <= t.dias) || null;
  const lim = _params.dias_limite || 30;
  const enDias = n => new Date(f.getTime() + n * 86400000);
  return { dias, lim, tramo, tramos, hoy: Math.round(r.monto * (1 - (tramo?.pct || 0) / 100)), descHasta: tramo ? enDias(tramo.dias) : null, limite: enDias(lim), vencida: r.estado === 'vencida' || dias > lim };
}
const pareceFolio = q => /^[A-Z]{2,5}-?\d{2}-?[2-9A-Z]{6}$/i.test(q.trim()) || /^INF-/i.test(q.trim());
// En una página pública solo se muestran las iniciales del infractor
const iniciales = n => String(n || '').trim().split(/\s+/).filter(Boolean).map(p => p[0].toUpperCase() + '.').join(' ') || '—';

let _ultimos = [], _ultimaQ = '', _historial = false;

async function buscar() {
  $('q').value = formatoPlaca($('q').value);
  const q = $('q').value.trim();
  if (q.replace(/[^A-Za-z0-9]/g, '').length < 3) { $('q').focus(); avisar('Escribe tu placa o el folio de tu boleta'); return; }
  const caja = $('resultado'), btn = $('btn-buscar');
  if (q !== _ultimaQ) _historial = false;
  caja.hidden = false; $('zona-resultado').hidden = false; btn.disabled = true;
  caja.innerHTML = `<div class="res-panel"><div class="cargando"><div class="rueda"></div>Buscando ${esc(q.toUpperCase())}…</div></div>`;
  $('zona-resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', '?q=' + encodeURIComponent(q));
  await _listo;
  let datos;
  try { datos = await rpc('consulta_ciudadana', { p_q: q, p_historial: _historial }); }
  catch (_) {
    // Si el servidor falla no se puede decir "sin adeudos": sería información falsa
    caja.innerHTML = `<div class="res-panel"><div class="estado-vacio"><div class="sello-ok sello-alerta">${icono('alerta', 36)}</div>
      <h3>No pudimos hacer la consulta</h3><p>El servicio no está disponible en este momento. Intenta de nuevo en unos minutos.</p>
      <p style="margin-top:1rem"><button class="btn-oscuro" type="button" onclick="buscar()">Reintentar</button></p></div></div>`;
    btn.disabled = false; return;
  }
  btn.disabled = false;
  _ultimos = datos || []; _ultimaQ = q;
  caja.innerHTML = `<div class="res-panel">${_ultimos.length ? conMultas(q, _ultimos) : sinMultas(q)}</div>`;
}
// Incluir las multas pagadas y canceladas (historial) sin salir de la página
function verHistorial(si) { _historial = !!si; buscar(); }
const interruptorHistorial = () => `<label class="interruptor"><input type="checkbox"${_historial ? ' checked' : ''} onchange="verHistorial(this.checked)"><span></span>Incluir multas pagadas</label>`;

function sinMultas(q) {
  const placa = q.toUpperCase();
  return `<div class="res-cabeza"><span class="res-placa">${esc(placa)}</span><span class="res-conteo"><b>${_historial ? 'Sin registros' : 'Sin adeudos'}</b>al día de hoy</span></div>
    <div class="estado-vacio"><div class="sello-ok">${icono('ok', 36)}</div>
      <h3>${_historial ? 'No encontramos infracciones' : 'No tienes infracciones por pagar'}</h3>
      <p>${_historial ? `No hay infracciones registradas para <b>${esc(placa)}</b>.` : `<b>${esc(placa)}</b> no tiene multas pendientes.`} Revisa que la placa o el folio estén bien escritos.</p>
      ${pareceFolio(q) ? '' : bloqueConstancia(q)}
    </div>
    <div class="res-pie">${interruptorHistorial()}</div>`;
}

function conMultas(q, datos) {
  const porPagar = datos.filter(r => r.estado === 'pendiente' || r.estado === 'vencida');
  const enRevision = datos.filter(r => r.estado === 'impugnada');
  const pl = porPagar.map(plazos);
  const totalHoy = pl.reduce((a, p) => a + p.hoy, 0);
  const totalLleno = porPagar.reduce((a, r) => a + Number(r.monto), 0);
  const conDesc = pl.filter(p => p.tramo);
  const primerCorte = conDesc.length ? new Date(Math.min(...conDesc.map(p => p.descHasta.getTime()))) : null;
  const placas = [...new Set(datos.map(r => r.placa))];
  const unaPlaca = placas.length === 1 ? placas[0] : '';
  return `<div class="res-cabeza"><span class="res-placa">${esc(unaPlaca || q.toUpperCase())}</span>
      <span class="res-conteo"><b>${porPagar.length ? `${porPagar.length} por pagar` : 'Nada por pagar'}</b>${datos.length} ${datos.length === 1 ? 'infracción' : 'infracciones'}${_historial ? ' en total' : datos.length === 1 ? ' activa' : ' activas'}</span></div>
    ${porPagar.length ? `<div class="res-total"><small>${conDesc.length ? 'Total si pagas hoy' : 'Total a pagar'}</small>
      <div class="cifra">${pesos(totalHoy)}</div>
      ${conDesc.length ? `<div class="ahorro">${icono('ok', 18)}<span>Ahorras <b>${pesos(totalLleno - totalHoy)}</b> por pronto pago. ${conDesc.length === porPagar.length ? 'Aplica' : 'El primer descuento vence'} hasta el <b>${fechaLarga(primerCorte)}</b>.</span></div>` : ''}
    </div>` : `<div class="res-total"><div class="nota-inf ${enRevision.length ? 'info' : 'ok'}">${icono(enRevision.length ? 'alerta' : 'ok', 17)}<span>${enRevision.length ? 'Tus infracciones están en revisión: no pagues por ahora.' : 'No tienes adeudos.'}</span></div></div>`}
    ${!porPagar.length && !enRevision.length && unaPlaca ? `<div class="res-constancia">${bloqueConstancia(unaPlaca)}</div>` : ''}
    <div class="res-sub"><span>Detalle</span>${interruptorHistorial()}</div>
    <div class="res-lista">${datos.map(tarjeta).join('')}</div>
    ${ayuda(porPagar, pl)}
    ${unaPlaca ? `<div class="res-pie"><span>${icono('campana', 18)} Recibe un aviso en tu celular si le levantan una multa a esta placa.</span><a href="${SIS}/consulta?q=${encodeURIComponent(unaPlaca)}" target="_blank" rel="noopener">Activar avisos</a></div>` : ''}`;
}

// Cómo pagar, transferencia e inconformidad, plegados para no saturar
function ayuda(porPagar, pl) {
  const bloques = [];
  if (porPagar.length) bloques.push(['tarjeta', 'Cómo pagar en ventanilla', `<ol class="pasos">
      <li><span>Acude a <b>${esc(SITIO.caja.nombre)}</b>${SITIO.caja.domicilio ? `, ${esc(SITIO.caja.domicilio)}` : ''}${SITIO.caja.horario ? `. ${esc(SITIO.caja.horario)}` : ''}.</span></li>
      <li><span>Da tu placa o el folio de la boleta.</span></li>
      <li><span>Paga y conserva tu recibo: trae un código QR para comprobar que es auténtico.</span></li></ol>`]);
  if (porPagar.length && _info.pago_clabe) bloques.push(['documento', 'Pagar por transferencia', `
      <dl class="datos-banco">
        ${_info.pago_banco ? `<div><dt>Banco</dt><dd>${esc(_info.pago_banco)}</dd></div>` : ''}
        ${_info.pago_beneficiario ? `<div><dt>Beneficiario</dt><dd>${esc(_info.pago_beneficiario)}</dd></div>` : ''}
        <div class="ancho"><dt>CLABE</dt><dd class="clabe"><code>${esc(_info.pago_clabe)}</code><button class="link-btn" type="button" data-copiar="${esc(_info.pago_clabe)}">Copiar</button></dd></div>
      </dl>
      <p class="ayuda-tit">Haz una transferencia por cada multa, por el monto de hoy:</p>
      <ul class="montos-hoy">${porPagar.map((r, i) => `<li><code>${esc(r.folio || '—')}</code><b>${pesos(pl[i].hoy)}</b></li>`).join('')}</ul>
      <ol class="pasos">
        <li><span>Escribe el <b>folio</b> de la boleta como referencia o concepto.</span></li>
        <li><span>Envía tu comprobante a ${_info.correo ? `<a href="mailto:${esc(_info.correo)}">${esc(_info.correo)}</a>` : 'la Dirección de Tránsito'}. Cuando la Tesorería confirme el depósito, aparecerá como pagada.</span></li>
      </ol>
      <p class="ayuda-nota">El descuento se respeta con la fecha de tu transferencia.</p>`]);
  bloques.push(['balanza', '¿No estás de acuerdo con la infracción?', `<p>${esc(_info.leyenda_recurso || 'Contra la boleta procede el recurso de revocación en los términos de la legislación aplicable. Acude a la Dirección de Tránsito para orientarte.')}</p>
      <p class="ayuda-nota"><a href="#tramite-recurso">Ver cómo presentar el recurso paso a paso</a></p>`]);
  return `<div class="res-ayuda">${bloques.map(([ico, t, html]) => `<details><summary>${icono(ico, 20)}<b>${t}</b></summary><div class="ayuda-cuerpo">${html}</div></details>`).join('')}</div>`;
}

function tarjeta(r) {
  const p = plazos(r);
  const activa = r.estado === 'pendiente' || r.estado === 'vencida';
  const estado = activa && p.vencida ? 'vencida' : r.estado;
  const nombres = { pendiente: 'Pendiente', vencida: 'Vencida', impugnada: 'En revisión', pagada: 'Pagada', cancelada: 'Cancelada' };
  let barra = '';
  if (activa) {
    let ini = 0;
    const segs = p.tramos.map((t, i) => { const s = `<span style="width:${(t.dias - ini) / p.lim * 100}%;background:${i ? '#9BE8C2' : '#3DDC97'}"></span>`; ini = t.dias; return s; });
    segs.push(`<span style="width:${(p.lim - ini) / p.lim * 100}%;background:#FFD45C"></span>`);
    barra = `<div><div class="plazo-barra" aria-hidden="true">${segs.join('')}<i class="plazo-hoy" style="left:${Math.min(100, p.dias / p.lim * 100)}%"></i></div>
      <div class="plazo-txt"><span>${p.tramo ? `<b>${p.tramo.pct}% de descuento</b> hasta el ${fechaCorta(p.descHasta)}` : p.vencida ? '<b>Plazo vencido</b>' : 'Sin descuento'}</span><span>Límite: <b>${fechaCorta(p.limite)}</b></span></div></div>`;
  }
  let nota = '';
  if (activa && p.vencida) nota = `<div class="nota-inf mal">${icono('alerta', 17)}<span>Pasó la fecha límite (${fechaLarga(p.limite)}). Regulariza cuanto antes.</span></div>`;
  else if (activa && r.grave) nota = `<div class="nota-inf gris">${icono('alerta', 17)}<span>Por su gravedad, esta multa se paga completa.</span></div>`;
  else if (r.estado === 'impugnada') nota = `<div class="nota-inf info">${icono('alerta', 17)}<span>Está en revisión. <b>No pagues por ahora.</b> Si no procede, volverá a quedar pendiente.</span></div>`;
  else if (r.estado === 'pagada') nota = `<div class="nota-inf ok">${icono('ok', 17)}<span>Pagada. No tienes adeudo por este folio.</span></div>`;
  else if (r.estado === 'cancelada') nota = `<div class="nota-inf gris">${icono('alerta', 17)}<span>Cancelada: no requiere pago.</span></div>`;
  const pago = activa ? `<button type="button" class="btn-pagar"${_pagoEnLinea ? ` onclick="pagar(${Number(r.id)}, ${esc(JSON.stringify(r.placa))}, this)"` : ' disabled'}>${icono('tarjeta', 20)} Pagar en línea ${pesos(p.tramo ? p.hoy : r.monto)}</button>
    <div class="pagar-nota">${_pagoEnLinea ? 'Tarjeta, OXXO o SPEI con Mercado Pago.' : 'Por ahora el pago en línea no está disponible: paga en la Tesorería.'}</div>` : '';
  const id = Number(r.id);
  return `<article class="inf ${estado}">
    <div class="inf-top">
      <div><div class="inf-motivo">${esc(r.tipo)}</div>
        <div class="inf-meta"><code>${esc(r.folio || '—')}</code> · ${fechaLarga(new Date(r.fecha))}</div>
        <span class="chip ${estado}">${nombres[estado] || esc(estado)}</span></div>
      <div class="inf-monto"><b>${pesos(activa && p.tramo ? p.hoy : r.monto)}</b>${activa && p.tramo ? `<s>${pesos(r.monto)}</s>` : ''}</div>
    </div>${barra}${nota}${pago}
    <div class="inf-pestanas" role="group" aria-label="Más información">
      ${r.estado !== 'cancelada' ? `<button type="button" class="inf-pestana" aria-expanded="false" onclick="panelInf(this, ${id}, 'pq')">¿Por qué me multaron?</button>` : ''}
      <button type="button" class="inf-pestana" aria-expanded="false" onclick="panelInf(this, ${id}, 'detalle')">Ver detalle</button>
    </div>
    <div class="inf-panel" hidden></div></article>`;
}

// Un solo panel por tarjeta: "¿Por qué me multaron?" o "Ver detalle"
async function panelInf(btn, id, cual) {
  const tarjetaEl = btn.closest('.inf'), panel = tarjetaEl.querySelector('.inf-panel');
  const abierto = btn.getAttribute('aria-expanded') === 'true';
  tarjetaEl.querySelectorAll('.inf-pestana').forEach(b => b.setAttribute('aria-expanded', 'false'));
  if (abierto) { panel.hidden = true; return; }
  btn.setAttribute('aria-expanded', 'true'); panel.hidden = false;
  const r = _ultimos.find(x => Number(x.id) === id) || {};
  if (cual === 'detalle') { panel.innerHTML = htmlDetalle(r); return; }
  panel.innerHTML = '<div class="pq-cargando"><div class="rueda-chica"></div>Cargando explicación…</div>';
  let e = _explicaciones[id];
  if (!e) {
    try { e = _explicaciones[id] = await rpc('explicar_infraccion', { p_id: id, p_q: _ultimaQ }); }
    catch (_) { if (btn.getAttribute('aria-expanded') === 'true') panel.innerHTML = '<div class="pq-cargando">No se pudo cargar la explicación. Intenta de nuevo.</div>'; return; }
  }
  if (btn.getAttribute('aria-expanded') === 'true') panel.innerHTML = htmlPorQue(e || {}, r);
}
const _explicaciones = {};

function htmlDetalle(r) {
  const enlace = `${location.origin}${location.pathname}?q=${encodeURIComponent(r.placa || '')}`;
  return `<dl class="inf-datos">
      <div><dt>Placa</dt><dd><code>${esc(r.placa)}</code></dd></div>
      <div><dt>Infractor</dt><dd>${esc(iniciales(r.infractor))}</dd></div>
      ${r.ubicacion ? `<div class="ancho"><dt>Lugar</dt><dd>${esc(r.ubicacion)}</dd></div>` : ''}
      ${r.fundamento ? `<div class="ancho"><dt>Fundamento legal</dt><dd>${esc(r.fundamento)}</dd></div>` : ''}
    </dl>
    <div class="inf-btns">
      <button class="btn-chico" type="button" data-copiar="${esc(r.folio || '')}" data-aviso="Folio copiado">Copiar folio</button>
      <a class="btn-chico" href="https://wa.me/?text=${encodeURIComponent(`Consulta de infracciones de la placa ${r.placa}: ${enlace}`)}" target="_blank" rel="noopener">${icono('whatsapp', 16)} Compartir</a>
    </div>`;
}

// La falta en palabras sencillas (rpc explicar_infraccion, igual que /consulta)
function htmlPorQue(e, r) {
  const gravedad = { 'Leve': 'ok', 'Grave': 'pend', 'Muy Grave': 'mal' }[e.clasificacion] || 'gris';
  const uma = Number(e.uma) || 0;
  const rango = e.cuotas_min != null && uma
    ? `El Reglamento fija para esta falta de <b>${esc(e.cuotas_min)} a ${esc(e.cuotas_max)} UMA</b> (de ${pesos(Math.floor(e.cuotas_min * uma))} a ${pesos(Math.floor(e.cuotas_max * uma))}).`
    : '';
  let tabla = '';
  if (r && (r.estado === 'pendiente' || r.estado === 'vencida')) {
    const p = plazos(r), filas = [];
    p.tramos.forEach(t => {
      const monto = Math.round(r.monto * (1 - t.pct / 100));
      filas.push({ cuando: `Hasta el ${fechaLarga(new Date(new Date(r.fecha).getTime() + t.dias * 86400000))}`, monto, nota: `${t.pct}% de descuento`, hoy: p.tramo === t, paso: p.dias > t.dias });
    });
    filas.push({ cuando: `Hasta el ${fechaLarga(p.limite)}`, monto: r.monto, nota: 'Monto completo', hoy: !p.tramo && !p.vencida, paso: p.vencida });
    filas.push({ cuando: 'Después de esa fecha', monto: r.monto, nota: 'Vencida: la Tesorería puede cobrarla por la vía fiscal', hoy: p.vencida, paso: false });
    tabla = `<div class="pq-sec"><h4>Cuánto pagas según cuándo pagues</h4>
      <div class="pq-tabla">${filas.map(f => `<div class="pq-fila${f.hoy ? ' hoy' : ''}${f.paso ? ' paso' : ''}">
        <span>${f.cuando}${f.hoy ? ' <b class="pq-hoy">Hoy</b>' : ''}<small>${f.nota}</small></span><strong>${pesos(f.monto)}</strong></div>`).join('')}</div></div>`;
  }
  const arts = (e.articulos || []).filter(a => a.texto);
  return `<div class="pq-sec"><h4>Qué pasó</h4><p>${esc(e.conducta || r?.tipo || '')}</p>
      ${e.clasificacion ? `<span class="chip ${gravedad}">Falta ${esc(e.clasificacion.toLowerCase())}</span>` : ''}</div>
    ${e.por_que ? `<div class="pq-sec"><h4>Por qué es importante</h4><p>${esc(e.por_que)}</p></div>` : ''}
    ${rango ? `<div class="pq-sec"><h4>Cuánto cuesta</h4><p>${rango}${r?.monto != null ? ` Tu multa quedó en <b>${pesos(r.monto)}</b>.` : ''}</p></div>` : ''}
    ${tabla}
    ${arts.length || e.fundamento ? `<details class="pq-ley"><summary>Qué dice el Reglamento</summary>
      ${e.fundamento ? `<p class="pq-fund">${esc(e.fundamento)}</p>` : ''}
      ${arts.map(a => `<p><b>Artículo ${esc(a.numero)}.</b> ${esc(a.texto)}</p>`).join('')}</details>` : ''}`;
}

// Pago con Mercado Pago (el monto lo calcula el servidor). Al terminar,
// Mercado Pago regresa a esta página (regreso: 'sitio'), que muestra el recibo.
async function pagar(id, placa, btn) {
  const antes = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Conectando con Mercado Pago…';
  try {
    const d = await funcion('pago-mp', { accion: 'crear', infraccion_id: id, placa, regreso: 'sitio' });
    if (!d.url) throw new Error('No se pudo iniciar el pago');
    location.href = d.url;
  } catch (err) {
    avisar(err.message + '. Puedes pagar en la Tesorería.');
    btn.disabled = false; btn.innerHTML = antes;
  }
}

// ── Constancia de no adeudo con costo (constancias_cobro.sql del sistema) ──
// Se pide el cobro (solicitar_constancia), se paga con Mercado Pago y, cuando
// se acredita, se descarga con el token del cobro (constancia_de_cobro). El
// token se guarda en este navegador con la misma clave que el portal /consulta,
// así se puede volver a descargar desde cualquiera de los dos.
const normPlaca = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function tokenConstancia(placa, token) {
  const k = 'cnd:' + normPlaca(placa);
  try {
    if (token) localStorage.setItem(k, JSON.stringify({ token, t: Date.now() }));
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v && Date.now() - v.t < 31 * 864e5 ? v.token : null;
  } catch (_) { return null; }
}
function bloqueConstancia(placa) {
  const costo = Number(_info.constancia_costo) || 0;
  const id = 'cnd-' + normPlaca(placa);
  const previa = tokenConstancia(placa);
  if (previa) setTimeout(() => revisarConstanciaPrevia(previa, id), 0);
  return `<div class="constancia-caja" id="${id}">
    <h4>Constancia de no infracción</h4>
    <p>Para trámites de compraventa o del vehículo. Trae un código QR para comprobar que es auténtica y vale 30 días.</p>
    <div class="costo"><span>Costo</span><b>${costo ? pesos(costo) : 'Consulta en Caja'}</b></div>
    <button class="btn-constancia" type="button"${_pagoEnLinea ? ` onclick="pagarConstancia(${esc(JSON.stringify(placa))}, this)"` : ' disabled'}>${icono('tarjeta', 20)} Pagar en línea${costo ? ' ' + pesos(costo) : ''}</button>
    <div class="pagar-nota">${_pagoEnLinea ? 'Tarjeta, OXXO o SPEI con Mercado Pago. Al acreditarse la descargas aquí mismo.' : 'Por ahora el pago en línea no está disponible: genera tu orden y págala en la Caja.'}</div>
    <button class="btn-borde btn-caja" type="button" onclick="ordenConstancia(${esc(JSON.stringify(placa))}, this)">${icono('qr', 20)} Pagar en Caja: generar orden de pago</button>
    <div class="pagar-nota">Te damos un código QR para pagar en ventanilla. Al pagar, con ese mismo código descargas tu constancia.</div>
  </div>`;
}
// Ya la había pagado desde este navegador: ofrecer descargarla otra vez
async function revisarConstanciaPrevia(token, id) {
  let c = null;
  try { c = await rpc('constancia_de_cobro', { p_token: token }); } catch (_) { return; }
  const caja = $(id);
  if (!caja || !c) return;
  // Orden de pago sin pagar y vigente: mostrarla otra vez
  if (!c.pagada && !c.orden_vencida) return pintarOrden(caja, { token, placa: c.placa, monto: c.monto, vence: c.vence });
  if (c.vencida) return caja.insertAdjacentHTML('beforeend', `<div class="nota-inf gris">${icono('alerta', 17)}<span>Tu constancia ${esc(c.folio)} venció el ${esc(fechaLarga(new Date(c.vigente_hasta + 'T12:00:00')))} y ya no es válida. Para un trámite necesitas una nueva.</span></div>`);
  if (!c.folio || c.vigente_hasta < new Date().toISOString().slice(0, 10)) return;
  caja.insertAdjacentHTML('beforeend', `<div class="nota-inf ok">${icono('ok', 17)}<span>Ya pagaste la constancia <b>${esc(c.folio)}</b>, vigente hasta el ${esc(fechaLarga(new Date(c.vigente_hasta + 'T12:00:00')))}.
    <button class="link-btn" type="button" onclick="descargarConstancia(${esc(JSON.stringify(token))})">Descargarla</button></span></div>`);
}
// Orden de pago para pagar en Caja (constancias_orden.sql del sistema). El QR
// lleva a /verificar?c=<token> del sistema: Caja lo escanea para cobrar y, ya
// pagada, ahí mismo aparece la constancia para imprimir.
async function ordenConstancia(placa, btn) {
  const antes = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Generando tu orden de pago…';
  let o = null;
  try { [o] = await Promise.all([rpc('solicitar_constancia', { p_placa: placa }), cargarQR().catch(() => {})]); }
  catch (_) { avisar('No se pudo generar la orden. Revisa que la placa no tenga multas pendientes.'); }
  btn.disabled = false; btn.innerHTML = antes;
  if (!o?.token) return;
  tokenConstancia(placa, o.token);
  pintarOrden(btn.closest('.constancia-caja'), o);
}
const urlOrden = token => `${SIS}/verificar?c=${encodeURIComponent(token)}`;
async function pintarOrden(caja, o) {
  await cargarQR().catch(() => {});
  caja.querySelector('.orden-pago')?.remove();
  let qr = '';
  try { qr = new QRious({ value: urlOrden(o.token), size: 360, padding: 8 }).toDataURL(); } catch (_) {}
  caja.insertAdjacentHTML('beforeend', `<div class="orden-pago">
    <span class="orden-tit">Tu orden de pago</span>
    <b class="orden-monto">${pesos(o.monto)}</b>
    <p>Placa <b>${esc(String(o.placa).toUpperCase())}</b> · paga en la Caja antes del <b>${esc(fechaLarga(new Date(o.vence + 'T12:00:00')))}</b></p>
    ${qr ? `<img src="${qr}" width="190" height="190" alt="Código QR de la orden de pago">` : ''}
    <p>Muestra este código en la Caja. Después de pagar, escanéalo o vuelve a consultar tu placa en este teléfono para descargar tu constancia.</p>
    <button class="btn-oscuro" type="button" onclick="imprimirOrden(${esc(JSON.stringify(o))})">Guardar o imprimir la orden</button>
  </div>`);
}
function imprimirOrden(o) {
  const win = window.open('', '_blank', 'width=480,height=820');
  if (!win) { avisar('Permite las ventanas emergentes para imprimir la orden'); return; }
  let qr = '';
  try { qr = new QRious({ value: urlOrden(o.token), size: 300, padding: 8 }).toDataURL(); } catch (_) {}
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Orden de pago · constancia ${esc(o.placa)}</title>
  <style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111827;max-width:420px;margin:1.5rem auto;padding:0 1rem;text-align:center}
    .k{font-size:.7rem;letter-spacing:.1em;text-transform:uppercase;color:#4B5563}h1{font-size:1.2rem;margin:.3rem 0 1rem}
    .monto{font-size:2.2rem;font-weight:700}.placa{display:inline-block;font-family:'Courier New',monospace;font-size:1.3rem;font-weight:700;border:2px solid #111827;border-radius:6px;padding:.05rem .6rem;margin:.4rem 0}
    ol{text-align:left;font-size:.82rem;line-height:1.6;color:#374151;padding-left:1.2rem}.corte{border-top:2px dashed #9CA3AF;margin:1rem 0}
    button{margin-bottom:1rem;padding:.5rem 1rem;background:#15181C;color:#F5B700;border:0;border-radius:6px;cursor:pointer;font-weight:700}
    @media print{button{display:none}}
  </style></head><body>
  <button onclick="window.print()">Imprimir o guardar como PDF</button>
  <div class="k">Dirección de Tránsito y Vialidad · ${esc(_info.municipio || SITIO.municipio)}</div>
  <h1>Orden de pago · Constancia de no adeudo</h1>
  <div class="placa">${esc(String(o.placa).toUpperCase())}</div>
  <div class="monto">${esc(pesos(o.monto))}</div>
  <p>Paga en la Caja antes del <b>${esc(fechaLarga(new Date(o.vence + 'T12:00:00')))}</b></p>
  ${qr ? `<img src="${qr}" width="220" height="220" alt="Código QR">` : ''}
  <div class="corte"></div>
  <ol><li>Presenta este código en ${esc(SITIO.caja.nombre)} (${esc(SITIO.caja.domicilio)}), ${esc(SITIO.caja.horario.toLowerCase())}.</li>
  <li>Paga en efectivo, con tarjeta o por transferencia.</li>
  <li>Te entregan tu constancia impresa. También puedes escanear este código para descargarla: vale 30 días.</li></ol>
  </body></html>`);
  win.document.close();
}

async function pagarConstancia(placa, btn) {
  const antes = btn.innerHTML;
  btn.disabled = true; btn.textContent = 'Conectando con Mercado Pago…';
  try {
    const c = await rpc('solicitar_constancia', { p_placa: placa });
    if (!c?.token) throw new Error('No se pudo solicitar la constancia');
    tokenConstancia(placa, c.token);
    const d = await funcion('pago-mp', { accion: 'constancia', token: c.token, regreso: 'sitio' });
    if (!d.url) throw new Error('No se pudo iniciar el pago');
    location.href = d.url;
  } catch (err) {
    avisar(String(err.message).replace(/\.$/, '') + '. También puedes pagarla en Caja.');
    btn.disabled = false; btn.innerHTML = antes;
  }
}

function cargarQR() {
  if (window.QRious) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js';
    s.onload = ok; s.onerror = mal; document.head.appendChild(s);
  });
}
// El documento es el mismo que imprime el sistema (js/constancia.js): se carga
// de ahí, así la constancia sale igual en Caja, en el portal y en esta página
function cargarConstancia() {
  if (window.htmlConstancia) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = `${SIS}/js/constancia.js`;
    s.onload = ok; s.onerror = mal; document.head.appendChild(s);
  });
}
// La ventana se abre en el clic: después de esperar al servidor el navegador la bloquearía
async function descargarConstancia(token) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  let c = null;
  try { [c] = await Promise.all([rpc('constancia_de_cobro', { p_token: token }), cargarQR(), cargarConstancia()]); } catch (_) {}
  if (!c?.folio || c.vencida || !window.htmlConstancia) { win?.close(); avisar(c?.vencida ? 'Esta constancia ya venció y no es válida.' : 'La constancia aún no está lista. Intenta en unos minutos.'); return; }
  if (!win) { avisar('Permite las ventanas emergentes para descargar la constancia'); return; }
  abrirConstancia(c, win, { base: SIS, marca: _info });
}

// ── Regreso de Mercado Pago (?pago=ok|pendiente|error) ──
function pintarRegreso(clase, html) {
  $('zona-resultado').hidden = false;
  const r = $('regreso'); r.hidden = false; r.className = 'regreso ' + clase; r.innerHTML = html;
}
// Mercado Pago avisa al sistema en segundos; se pregunta hasta un minuto
async function esperar(fn, listo) {
  for (let i = 0; i < 15; i++) {
    let d = null;
    try { d = await fn(); } catch (_) { /* reintenta */ }
    if (listo(d)) return d;
    await new Promise(r => setTimeout(r, 4000));
  }
  return null;
}
async function confirmarPagoMulta(inf, q) {
  const d = await esperar(() => rpc('pago_en_linea_estado', { p_id: inf, p_q: q }), d => d?.pagado);
  if (!d) return pintarRegreso('info', `${icono('reloj', 22)}<div><b>Estamos confirmando tu pago con Mercado Pago.</b> Puede tardar unos minutos; vuelve a consultar tu placa más tarde. Si ya te cobraron, no pagues de nuevo.</div>`);
  pintarRegreso('ok', `${icono('ok', 22)}<div><b>¡Pago recibido!</b> La infracción ${esc(d.folio || '')} quedó pagada${d.monto != null ? ' (' + esc(pesos(d.monto)) + ')' : ''}. Guarda tu recibo como comprobante.
    ${d.token ? `<a class="btn-oscuro" href="${SIS}/verificar?t=${encodeURIComponent(d.token)}" target="_blank" rel="noopener">Ver mi recibo de pago ${icono('flecha', 18)}</a>` : ''}</div>`);
  buscar();
}
async function confirmarPagoConstancia(token) {
  const c = await esperar(() => rpc('constancia_de_cobro', { p_token: token }), c => c?.folio || c?.pagada);
  if (c?.folio) {
    tokenConstancia(c.placa, token);
    return pintarRegreso('ok', `${icono('ok', 22)}<div><b>¡Pago recibido!</b> Tu constancia ${esc(c.folio)} está lista, vigente hasta el ${esc(fechaLarga(new Date(c.vigente_hasta + 'T12:00:00')))}.
      <button class="btn-oscuro" type="button" onclick="descargarConstancia(${esc(JSON.stringify(token))})">${icono('constancia', 18)} Descargar constancia</button></div>`);
  }
  if (c?.pagada) return pintarRegreso('info', `${icono('alerta', 22)}<div><b>Recibimos tu pago, pero no se pudo expedir la constancia.</b> ${esc(c.nota || '')} Acude a la Dirección de Tránsito con tu comprobante de Mercado Pago para resolverlo.</div>`);
  pintarRegreso('info', `${icono('reloj', 22)}<div><b>Estamos confirmando tu pago con Mercado Pago.</b> Puede tardar unos minutos; vuelve a consultar tu placa en este mismo teléfono para descargarla. Si ya te cobraron, no pagues de nuevo.</div>`);
}
function regresoDePago(params) {
  const pago = params.get('pago'), cnd = params.get('constancia'), inf = Number(params.get('inf')), q = params.get('q') || '';
  if (!pago) return;
  if (pago === 'error') return pintarRegreso('mal', `${icono('alerta', 22)}<div><b>El pago no se completó</b> y no se hizo ningún cargo. Puedes intentarlo de nuevo.</div>`);
  if (pago === 'pendiente') return pintarRegreso('info', `${icono('reloj', 22)}<div><b>Tu pago está en proceso</b> (OXXO o transferencia). ${cnd
    ? 'Cuando Mercado Pago lo acredite, consulta tu placa en este mismo teléfono para descargar la constancia.'
    : 'La multa aparecerá como pagada cuando Mercado Pago lo acredite, normalmente el mismo día.'}</div>`);
  if (pago !== 'ok') return;
  pintarRegreso('info', `<div class="rueda-chica"></div><div><b>Confirmando tu pago con Mercado Pago…</b></div>`);
  if (cnd) confirmarPagoConstancia(cnd);
  else if (inf && q) confirmarPagoMulta(inf, q);
}

// ── Inicio ─────────────────────────────────────────────────
pintarContenido();
pintarAvisosViales();
const _obs = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('visible'); _obs.unobserve(e.target); }
}), { rootMargin: '0px 0px -8% 0px' }) : null;
document.querySelectorAll('.senal, .pago, .encabezado, .revelar').forEach(el => {
  el.classList.add('revelar');
  if (_obs) _obs.observe(el); else el.classList.add('visible');
});
const _params0 = new URLSearchParams(location.search);
regresoDePago(_params0);
const q0 = _params0.get('q');
if (q0) { $('q').value = q0; buscar(); }
