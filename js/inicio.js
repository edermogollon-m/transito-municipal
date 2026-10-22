// ══════════════════════════════════════════════════════════
// INICIO POR ROL
// Al entrar, cada quien ve primero lo suyo, arriba del panel general: el
// policía vial su botón grande de "Nueva boleta", Caja sus cobros del día,
// Jurídico las impugnaciones por vencer, el corralón sus vehículos y los
// mandos lo que hay que atender hoy. También aquí: avisos viales del portal.
// ══════════════════════════════════════════════════════════
const ICO_INICIO = {
  mas: '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  cobrar: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
  balanza: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 006 0zM17 7l-3 7a3 3 0 006 0z"/></svg>',
  grua: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>'
};

const hoyInicio = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
const horaCorta = d => new Date(d).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

async function renderInicioRol() {
  const caja = $('inicio-rol'); if (!caja) return;
  await _authListo;
  const propios = { oficial: inicioOficial, cajero: inicioCaja, juridico: inicioJuridico, corralon: inicioCorralon };
  const fn = propios[_rol] || inicioMando;
  // Para estos roles el inicio ya trae sus accesos: la barra general sobra
  const barra = document.querySelector('#view-dashboard .quick-actions');
  if (barra) barra.style.display = propios[_rol] ? 'none' : '';
  try { caja.innerHTML = await fn(); caja.hidden = !caja.innerHTML.trim(); }
  catch (e) { console.warn('inicio:', e); caja.hidden = true; }
}

function tarjetaInicio({ clase = '', principal, stats = [], botones = [], lista = '' }) {
  return `<div class="inicio ${clase}">
    ${principal}
    ${stats.length ? `<div class="inicio-stats">${stats.map(s => `<div class="inicio-stat"><b>${s[0]}</b><span>${s[1]}</span></div>`).join('')}</div>` : ''}
    ${botones.length ? `<div class="inicio-botones">${botones.join('')}</div>` : ''}
    ${lista}
  </div>`;
}

async function inicioOficial() {
  const { data } = await _sb.from('infracciones').select('id,folio,placa,tipo,monto,fecha,oficial,capturo_auth').gte('fecha', hoyInicio()).order('fecha', { ascending: false });
  const mias = (data || []).filter(esMio);
  return tarjetaInicio({
    clase: 'oficial',
    principal: `<button type="button" class="inicio-grande" onclick="openNewInfraccion()">${ICO_INICIO.mas}<span>Nueva boleta<small>Levantar una infracción</small></span></button>`,
    stats: [[mias.length, mias.length === 1 ? 'boleta hoy' : 'boletas hoy'], [fmt(mias.reduce((a, r) => a + Number(r.monto || 0), 0)), 'en multas hoy']],
    botones: [
      `<button type="button" class="btn btn-ghost" onclick="openNewInfraccion().then(()=>$('inf-placa-foto')?.click())">Leer placa con la cámara</button>`,
      `<button type="button" class="btn btn-ghost" onclick="openNewAccidente()">Registrar accidente</button>`,
      `<button type="button" class="btn btn-ghost" onclick="openNewGrua()">Enviar al corralón</button>`,
      `<button type="button" class="btn btn-ghost" onclick="abrirMiCredencial()">Mi credencial</button>`
    ],
    lista: mias.length ? `<div class="inicio-lista"><div class="inicio-lista-tit">Mis boletas de hoy</div>${mias.slice(0, 4).map(r => `
      <button type="button" class="inicio-item" onclick="viewDetail('infracciones', ${Number(r.id)})"><span class="mono">${esc(r.placa)}</span><span>${esc(r.tipo)}</span><span>${horaCorta(r.fecha)}</span></button>`).join('')}</div>` : ''
  });
}

async function inicioCaja() {
  const { data } = await _sb.from('pagos').select('monto_final,metodo,cajero,created_at').gte('created_at', hoyInicio());
  const mios = (data || []).filter(p => p.cajero === _session?.name);
  const suma = arr => arr.reduce((a, p) => a + Number(p.monto_final || 0), 0);
  const efectivo = suma(mios.filter(p => p.metodo === 'efectivo'));
  return tarjetaInicio({
    clase: 'caja',
    principal: `<button type="button" class="inicio-grande verde" onclick="openModal('modal-buscar-pago')">${ICO_INICIO.cobrar}<span>Cobrar<small>Escanear el QR de la boleta o buscar por placa o folio</small></span></button>`,
    stats: [[fmt(suma(mios)), `cobrados hoy en ${mios.length} ${mios.length === 1 ? 'pago' : 'pagos'}`], [fmt(efectivo), 'en efectivo (para tu corte)']],
    botones: [
      `<button type="button" class="btn btn-ghost" onclick="navigate('caja')">Pendientes de pago</button>`,
      `<button type="button" class="btn btn-ghost" onclick="openCorteCaja()">Cerrar mi corte de caja</button>`
    ]
  });
}

async function inicioJuridico() {
  const { data } = await _sb.from('impugnaciones').select('id,folio,infraccion_id,promovente,plazo_vence').eq('estado', 'en_tramite').order('plazo_vence');
  const imp = data || [];
  const dias = f => Math.ceil((new Date(f + 'T23:59:59') - Date.now()) / 86400000);
  const urgentes = imp.filter(i => dias(i.plazo_vence) <= 3).length;
  return tarjetaInicio({
    clase: 'juridico',
    principal: `<button type="button" class="inicio-grande azul" onclick="navigate('infracciones');setTimeout(()=>{const s=$('inf-estado-filter');if(s){s.value='impugnada';filterInfracciones();}},300)">${ICO_INICIO.balanza}<span>${imp.length} ${imp.length === 1 ? 'impugnación' : 'impugnaciones'} por resolver<small>${urgentes ? `${urgentes} vence${urgentes === 1 ? '' : 'n'} en 3 días o menos` : 'Ninguna vence en los próximos 3 días'}</small></span></button>`,
    lista: imp.length ? `<div class="inicio-lista"><div class="inicio-lista-tit">Por plazo</div>${imp.slice(0, 5).map(i => {
      const d = dias(i.plazo_vence);
      return `<button type="button" class="inicio-item" onclick="viewDetail('infracciones', ${Number(i.infraccion_id)})"><span class="mono">${esc(i.folio)}</span><span>${esc(i.promovente)}</span><span class="${d <= 3 ? 'urgente' : ''}">${d < 0 ? 'Venció' : d === 0 ? 'Vence hoy' : `${d} día${d === 1 ? '' : 's'}`}</span></button>`;
    }).join('')}</div>` : ''
  });
}

async function inicioCorralon() {
  const { data } = await _sb.from('grua').select('id').eq('estado', 'retenido');
  const n = (data || []).length;
  return tarjetaInicio({
    clase: 'corralon',
    principal: `<button type="button" class="inicio-grande" onclick="openNewGrua()">${ICO_INICIO.grua}<span>Ingresar vehículo<small>Registrar una entrada al corralón</small></span></button>`,
    stats: [[n, n === 1 ? 'vehículo en el corralón' : 'vehículos en el corralón']],
    botones: [`<button type="button" class="btn btn-ghost" onclick="navigate('grua')">Ver y liberar vehículos</button>`]
  });
}

async function inicioMando() {
  const hoy = hoyInicio();
  const tresDias = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const cuenta = q => q.then(r => r.count || 0).catch(() => 0);
  const [imp, impUrg, alertas, vencidas, corralon] = await Promise.all([
    cuenta(_sb.from('impugnaciones').select('id', { count: 'exact', head: true }).eq('estado', 'en_tramite')),
    cuenta(_sb.from('impugnaciones').select('id', { count: 'exact', head: true }).eq('estado', 'en_tramite').lte('plazo_vence', tresDias)),
    ['admin', 'supervisor'].includes(_rol) ? cuenta(_sb.from('alertas_placa').select('id', { count: 'exact', head: true }).gte('created_at', hoy)) : Promise.resolve(null),
    cuenta(_sb.from('infracciones').select('id', { count: 'exact', head: true }).eq('estado', 'vencida')),
    cuenta(_sb.from('grua').select('id', { count: 'exact', head: true }).eq('estado', 'retenido'))
  ]);
  const tile = (n, txt, accion, alerta) => `<button type="button" class="inicio-tile${alerta && n ? ' alerta' : ''}" onclick="${accion}"><b>${n}</b><span>${txt}</span></button>`;
  const mando = ['admin', 'supervisor'].includes(_rol);
  return `<div class="inicio mando">
    <div class="inicio-lista-tit">Para atender hoy</div>
    <div class="inicio-tiles">
      ${tile(imp, `impugnaciones en trámite${impUrg ? ` · ${impUrg} vencen pronto` : ''}`, "navigate('infracciones');setTimeout(()=>{const s=$('inf-estado-filter');if(s){s.value='impugnada';filterInfracciones();}},300)", impUrg > 0)}
      ${alertas !== null ? tile(alertas, 'placas reportadas encontradas hoy', "navigate('vehiculos')", true) : ''}
      ${tile(vencidas, 'infracciones vencidas sin pagar', "navigate('caja')")}
      ${tile(corralon, 'vehículos en el corralón', "navigate('grua')")}
    </div>
    ${mando ? `<div class="inicio-botones"><button type="button" class="btn btn-ghost" onclick="abrirAvisosViales()">Avisos viales del portal</button></div>` : ''}
  </div>`;
}

// ── Avisos viales (ciudadano.sql): los publica la Dirección en el portal y
// llegan al celular de quien activó avisos ──
async function abrirAvisosViales() {
  $('av-titulo').value = ''; $('av-texto').value = ''; $('av-hasta').value = '';
  $('av-desde').value = fmtDateInput(new Date());
  openModal('modal-avisos-viales');
  await listarAvisosViales();
}

async function listarAvisosViales() {
  const lista = $('av-lista'); if (!lista) return;
  const { data, error } = await _sb.from('avisos_viales').select('*').eq('activo', true).order('desde', { ascending: false }).limit(20);
  if (error) { lista.innerHTML = `<div class="av-vacio">No se pudieron cargar los avisos.</div>`; return; }
  const hoy = fmtDateInput(new Date());
  lista.innerHTML = (data || []).length ? data.map(a => {
    const estado = a.hasta && a.hasta < hoy ? 'Terminó' : a.desde > hoy ? 'Programado' : 'En el portal';
    return `<div class="av-item"><div><strong>${esc(a.titulo)}</strong>${a.texto ? `<p>${esc(a.texto)}</p>` : ''}
      <small>${estado} · ${a.hasta ? `del ${fmtDateShort(a.desde + 'T12:00')} al ${fmtDateShort(a.hasta + 'T12:00')}` : `desde el ${fmtDateShort(a.desde + 'T12:00')}`} · ${esc(a.creado_por || '')}</small></div>
      <button type="button" class="btn btn-ghost btn-sm" onclick="retirarAvisoVial(${Number(a.id)})">Quitar</button></div>`;
  }).join('') : '<div class="av-vacio">No hay avisos publicados.</div>';
}

async function publicarAvisoVial() {
  const titulo = $('av-titulo').value.trim(), texto = $('av-texto').value.trim();
  const desde = $('av-desde').value || fmtDateInput(new Date()), hasta = $('av-hasta').value || null;
  if (titulo.length < 3) { showToast('Escribe el título del aviso'); $('av-titulo').focus(); return; }
  if (hasta && hasta < desde) { showToast('La fecha final no puede ser antes de la inicial'); return; }
  const { error } = await _sb.from('avisos_viales').insert({ titulo, texto, desde, hasta });
  if (error) { showToast('No se pudo publicar: ' + error.message); return; }
  logActivity('aviso', `Aviso vial publicado: ${titulo}`).catch(() => {});
  showToast('Aviso publicado en el portal');
  $('av-titulo').value = ''; $('av-texto').value = ''; $('av-hasta').value = '';
  listarAvisosViales();
}

async function retirarAvisoVial(id) {
  const { error } = await _sb.from('avisos_viales').update({ activo: false }).eq('id', id);
  if (error) { showToast('No se pudo quitar: ' + error.message); return; }
  showToast('Aviso quitado del portal');
  listarAvisosViales();
}
