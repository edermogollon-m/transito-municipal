// ── Dashboard ─────────────────────────────────────────────
async function renderDashboard() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth()+1, dia = now.getDate();
  const mesInicio = `${y}-${String(m).padStart(2,'0')}-01`;
  const mesFin = new Date(y, m, 1).toISOString().slice(0,10);
  const pm = m===1?12:m-1, py = m===1?y-1:y;
  const pmInicio = `${py}-${String(pm).padStart(2,'0')}-01`;
  // Mismo tramo del mes anterior (del 1 al día de hoy) para comparar parejo
  const pmCorte = new Date(py, pm-1, Math.min(dia, new Date(py, pm, 0).getDate()) + 1).toISOString().slice(0,10);
  const hoyIni = new Date(y, m-1, dia).toISOString();

  if ($('dash-fecha-hoy')) {
    $('dash-fecha-hoy').textContent = now.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  }
  renderInicioRol();
  const h = now.getHours();
  const nombre = (_session?.name || '').split(' ')[0];
  if ($('dash-saludo')) $('dash-saludo').textContent = `${h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'}${nombre ? ', ' + nombre : ''}`;

  const [
    { data: infAll },
    { data: pagosMes },
    { data: pagosPrev },
    { data: gruaRet },
    { data: turnosAct }
  ] = await Promise.all([
    todas(() => _sb.from('infracciones').select('id,folio,placa,monto,estado,fecha,tipo,oficial,capturo_auth')),
    todas(() => _sb.from('pagos').select('id,monto_final,created_at').gte('created_at', mesInicio).lt('created_at', mesFin)),
    todas(() => _sb.from('pagos').select('id,monto_final').gte('created_at', pmInicio).lt('created_at', pmCorte)),
    _sb.from('grua').select('id').eq('estado','retenido'),
    _sb.from('turnos').select('id').eq('estado','activo')
  ]);

  await _authListo;
  // El policía vial ve en su panel solo sus boletas
  const inf = (infAll || []).filter(r => !_permisosRol.soloMias || esMio(r));
  const enMes = r => r.fecha >= mesInicio && r.fecha < mesFin;
  const infM = inf.filter(enMes);
  const prevCount = inf.filter(r => r.fecha >= pmInicio && r.fecha < pmCorte).length;
  const sum = (arr, k) => arr.reduce((a,r)=>a+Number(r[k]||0),0);
  const recMes = sum(pagosMes||[], 'monto_final'), prevRec = sum(pagosPrev||[], 'monto_final');
  const pagosHoy = (pagosMes||[]).filter(p => p.created_at >= hoyIni);
  const infHoy = inf.filter(r => r.fecha >= hoyIni).length;
  const porCobrar = inf.filter(r => r.estado==='pendiente' || r.estado==='vencida');
  const vencidas = porCobrar.filter(r => r.estado==='vencida').length;
  const gruaCount = (gruaRet||[]).length;
  const enTurno = (turnosAct||[]).length;

  // Resumen de hoy
  if ($('dash-hoy-items')) {
    const pl = (n, uno, varios) => `<strong>${n}</strong> ${n===1?uno:varios}`;
    $('dash-hoy-items').innerHTML = `<span>Hoy:</span>
      <span>${pl(infHoy,'infracción','infracciones')}</span>
      <span><strong>${fmt(sum(pagosHoy,'monto_final'))}</strong> cobrados en ${pagosHoy.length} ${pagosHoy.length===1?'pago':'pagos'}</span>
      <span>${pl(enTurno,'oficial en turno','oficiales en turno')}</span>`;
  }

  // % contra el mismo tramo del mes anterior
  const pct = (act, prev) => {
    if (!prev) return act ? '<span style="color:var(--muted)">sin datos del mes anterior para comparar</span>' : '<span style="color:var(--muted)">sin movimiento</span>';
    const p = Math.round((act-prev)/prev*100);
    const txt = `vs. 1–${dia} de ${new Date(py, pm-1, 1).toLocaleDateString('es-MX',{month:'long'})}`;
    return p > 0 ? `<span class="delta-up">▲ ${p}%</span> ${txt}` : p < 0 ? `<span class="delta-dn">▼ ${Math.abs(p)}%</span> ${txt}` : `igual que ${txt.slice(4)}`;
  };
  // Barras por día del mes (las que faltan quedan vacías)
  const spark = (porDia) => {
    const diasMes = new Date(y, m, 0).getDate(), max = Math.max(...porDia, 1);
    return Array.from({length: diasMes}, (_, i) => {
      const v = porDia[i] || 0;
      return `<i class="${i+1===dia ? 'hoy' : v ? 'lleno' : ''}" style="height:${i < dia ? Math.max(8, Math.round(v/max*100)) : 8}%;${i >= dia ? 'opacity:.35' : ''}" title="${i+1}: ${v}"></i>`;
    }).join('');
  };
  const porDia = (arr, campoFecha, valor) => { const d = []; arr.forEach(r => { const i = new Date(r[campoFecha]).getDate()-1; d[i] = (d[i]||0) + valor(r); }); return d; };

  const mesNombre = now.toLocaleDateString('es-MX',{month:'long'});
  if($('s-rec-label'))  $('s-rec-label').textContent = `Recaudación de ${mesNombre}`;
  if($('s-inf-label'))  $('s-inf-label').textContent = `Infracciones de ${mesNombre}`;
  if($('s-rec'))        $('s-rec').textContent   = fmt(recMes);
  if($('s-rec-delta'))  $('s-rec-delta').innerHTML = pct(recMes, prevRec);
  if($('s-rec-spark'))  $('s-rec-spark').innerHTML = spark(porDia(pagosMes||[], 'created_at', r => Number(r.monto_final||0)));
  if($('s-inf'))        $('s-inf').textContent   = infM.length;
  if($('s-inf-delta'))  $('s-inf-delta').innerHTML = pct(infM.length, prevCount);
  if($('s-inf-spark'))  $('s-inf-spark').innerHTML = spark(porDia(infM, 'fecha', () => 1));
  if($('s-pend'))       $('s-pend').textContent  = fmt(sum(porCobrar,'monto'));
  if($('s-pend-delta')) $('s-pend-delta').innerHTML = `${porCobrar.length} ${porCobrar.length===1?'boleta':'boletas'}` + (vencidas ? ` · <span class="vencidas">${vencidas} ${vencidas===1?'vencida':'vencidas'}</span>` : '');
  if($('s-grua'))       $('s-grua').textContent  = gruaCount;
  if($('s-grua-sub'))   $('s-grua-sub').textContent = gruaCount ? (gruaCount===1 ? 'vehículo retenido' : 'vehículos retenidos') : 'corralón vacío';
  { const b = $('badge-pendientes'); if (b) { b.textContent = porCobrar.length; b.style.display = porCobrar.length ? 'inline' : 'none'; } }

  // Cobranza de las boletas levantadas este mes
  if ($('dash-cobranza')) {
    const estadoColors = { pagada:'var(--green)', pendiente:'var(--amber)', vencida:'var(--red)', impugnada:'var(--blue)', cancelada:'var(--subtle)' };
    const nombres = { pagada:'Pagadas', pendiente:'Pendientes', vencida:'Vencidas', impugnada:'Impugnadas', cancelada:'Canceladas' };
    const tot = infM.length;
    const filas = Object.keys(nombres).map(k => ({ k, n: infM.filter(r=>r.estado===k).length, monto: sum(infM.filter(r=>r.estado===k),'monto') })).filter(f => f.n);
    const pagadas = filas.find(f=>f.k==='pagada')?.n || 0;
    if ($('dash-cob-sub')) $('dash-cob-sub').textContent = tot ? `${tot} boletas de ${mesNombre}` : '';
    $('dash-cobranza').innerHTML = tot ? `
      <div class="cob-tasa">${Math.round(pagadas/tot*100)}%<small>ya pagadas</small></div>
      <div class="cob-barra">${filas.map(f=>`<span style="width:${f.n/tot*100}%;background:${estadoColors[f.k]}" title="${nombres[f.k]}: ${f.n}"></span>`).join('')}</div>
      ${filas.map(f=>`<div class="cob-fila"><span class="legend-dot" style="background:${estadoColors[f.k]}"></span><span>${nombres[f.k]} · ${f.n}</span><strong>${fmt(f.monto)}</strong><small>${Math.round(f.n/tot*100)}%</small></div>`).join('')}`
      : '<div style="color:var(--muted);font-size:.8rem">Sin infracciones este mes</div>';
  }

  // Motivos del mes
  if ($('dash-tipos-body')) {
    const tipoCount = {};
    infM.forEach(r=>{ if(r.tipo) tipoCount[r.tipo]=(tipoCount[r.tipo]||0)+1; });
    const topTipos = Object.entries(tipoCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxT = topTipos[0]?.[1] || 1;
    if ($('dash-tipos-mes')) $('dash-tipos-mes').textContent = mesNombre;
    $('dash-tipos-body').innerHTML = topTipos.length ? topTipos.map(([t,c])=>`
      <div style="margin-bottom:.65rem">
        <div style="display:flex;justify-content:space-between;font-size:.75rem;margin-bottom:.25rem">
          <span style="color:var(--ink);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:75%">${esc(t)}</span>
          <span style="color:var(--muted);flex-shrink:0;margin-left:.4rem">${c}</span>
        </div>
        <div style="height:6px;background:var(--stone);border-radius:3px;overflow:hidden">
          <div style="width:${Math.round(c/maxT*100)}%;height:100%;background:var(--ac);border-radius:3px;transition:width .4s"></div>
        </div>
      </div>`).join('') : '<div style="color:var(--muted);font-size:.8rem;padding:.25rem 0">Sin infracciones este mes</div>';
  }

  // Infracciones recientes (10 filas, clickeables)
  const recent = [...inf].sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,10);
  if($('dash-rec-sub')) $('dash-rec-sub').textContent = `Últimas ${recent.length} registradas`;
  const cuando = f => {
    const d = new Date(f), min = Math.round((now - d)/60000);
    const hora = d.toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
    if (min < 60) return `<b>hace ${Math.max(min,1)} min</b>${hora}`;
    if (d.toDateString() === now.toDateString()) return `<b>hoy</b>${hora}`;
    const ayer = new Date(now); ayer.setDate(dia-1);
    if (d.toDateString() === ayer.toDateString()) return `<b>ayer</b>${hora}`;
    return `<b>${d.toLocaleDateString('es-MX',{day:'numeric',month:'short'})}</b>${hora}`;
  };
  if($('dash-tbody')) {
    $('dash-tbody').innerHTML = recent.length ? recent.map(r=>`
      <tr onclick="viewDetail('infracciones','${r.id}')" style="cursor:pointer" title="${esc(r.folio||'')}">
        <td class="dash-cuando">${cuando(r.fecha)}</td>
        <td style="font-weight:700;font-family:monospace;font-size:.8rem">${esc(r.placa||'—')}<span class="solo-movil">${esc(r.tipo)}</span></td>
        <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.tipo)}</td>
        <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted)">${esc(r.oficial||'—')}</td>
        <td style="font-weight:600;text-align:right;font-variant-numeric:tabular-nums">${fmt(r.monto)}</td>
        <td>${estadoBadge(r.estado)}</td>
      </tr>`).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--muted)">Sin datos</td></tr>';
  }

  renderBarChart(infAll);

  renderAlertas();
}

// "Pendientes de hoy": una sola lista con todo lo que requiere atención
async function renderAlertas() {
  const panel = $('alertas-panel'), list = $('alertas-list'); if (!panel || !list) return;
  const hoy = new Date().toISOString().slice(0,10);
  const en7  = new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  const en30 = new Date(Date.now()+30*86400000).toISOString().slice(0,10);
  const hace25 = new Date(Date.now()-25*86400000).toISOString();
  const hace15 = new Date(Date.now()-15*86400000).toISOString();
  const hace7  = new Date(Date.now()-7*86400000).toISOString();

  const [
    { data: permVenc },
    { data: infVenc },
    { data: gruaLarga },
    { data: impSinResolver },
    { data: accProceso }
  ] = await Promise.all([
    _sb.from('permisos').select('id,num,titular,vencimiento').in('estado',['vigente','por-vencer']).lte('vencimiento', en30).gte('vencimiento', hoy).order('vencimiento'),
    todas(() => _sb.from('infracciones').select('id,folio,placa').eq('estado','pendiente').lt('fecha', hace25).order('fecha')),
    todas(() => _sb.from('grua').select('id').eq('estado','retenido').lte('fecha', hace15)),
    todas(() => _sb.from('infracciones').select('id').eq('estado','impugnada').lte('fecha', hace7)),
    _sb.from('accidentes').select('id').eq('estado','en_proceso').limit(99)
  ]);

  const pl = (n, uno, varios) => `${n} ${n===1?uno:varios}`;
  const alertas = [];
  if (infVenc?.length) alertas.push({ c:'var(--red)', view:'infracciones',
    title: `${pl(infVenc.length,'infracción','infracciones')} con más de 25 días sin pagar`,
    sub: infVenc.slice(0,3).map(i=>`${i.folio||'—'} (${i.placa})`).join(' · ') + (infVenc.length>3?' · …':'') });
  if (gruaLarga?.length) alertas.push({ c:'var(--red)', view:'grua',
    title: `${pl(gruaLarga.length,'vehículo','vehículos')} en corralón hace más de 15 días`, sub:'Revisar liberación o remate' });
  if (permVenc?.length) {
    const semana = permVenc.filter(p=>p.vencimiento<=en7).length;
    alertas.push({ c:'var(--amber)', view:'permisos',
      title: `${pl(permVenc.length,'permiso vence','permisos vencen')} en los próximos 30 días`,
      sub: (semana ? `${semana} esta semana · ` : '') + permVenc.slice(0,2).map(p=>p.num ? `${p.num} ${p.titular}` : p.titular).join(' · ') });
  }
  if (impSinResolver?.length) alertas.push({ c:'var(--blue)', view:'infracciones',
    title: `${pl(impSinResolver.length,'impugnación','impugnaciones')} sin resolver hace más de 7 días`, sub:'Requieren resolución del supervisor' });
  if (accProceso?.length) alertas.push({ c:'var(--subtle)', view:'accidentes',
    title: `${pl(accProceso.length,'accidente','accidentes')} en proceso`, sub:'Registros sin cerrar' });

  if (!alertas.length) { panel.style.display='none'; return; }
  panel.style.display='';
  list.innerHTML = alertas.map(a => `
    <li><button type="button" class="pend-row" onclick="navigate('${a.view}')">
      <span class="pend-dot" style="background:${a.c}"></span>
      <span class="pend-txt"><strong>${esc(a.title)}</strong><small>${esc(a.sub)}</small></span>
      <span class="pend-go">Ver</span>
    </button></li>`).join('');
}

async function renderBarChart(infAll) {
  const el = $('dash-bar-chart');
  if (!el) return;
  const yearEl = $('dash-chart-year');
  const year = yearEl ? parseInt(yearEl.textContent)||new Date().getFullYear() : new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const inf = infAll || [];
  const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const counts = Array(12).fill(0);
  inf.forEach(r => {
    const d = new Date(r.fecha);
    if (d.getFullYear()===year) counts[d.getMonth()]++;
  });
  const max = Math.max(...counts, 1);
  el.innerHTML = counts.map((c,i)=>{
    const isCurrent = (i === currentMonth && year === new Date().getFullYear());
    const h = Math.max(Math.round(c/max*100), c > 0 ? 4 : 0);
    return `
    <div class="bar-col" title="${months[i]}: ${c} ${c!==1?'infracciones':'infracción'}" onclick="navigate('calendario')">
      <div class="bar-val ${isCurrent?'current':''}">${c > 0 ? c : ''}</div>
      <div class="bar-fill ${isCurrent?'current':''}" style="height:${h}%"></div>
      <div class="bar-label ${isCurrent?'current':''}">${months[i]}</div>
    </div>`}).join('');
}

