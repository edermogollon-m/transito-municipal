// ══════════════════════════════════════════════════════════
// MAPA DE INFRACCIONES (Leaflet.js)
// ══════════════════════════════════════════════════════════
let _leafletMap = null, _leafletMarkers = [];

async function renderMapa() {
  const estadoFil = ($('mapa-estado')||{}).value||'';
  const mesFil    = ($('mapa-mes')||{}).value||'';

  const selMes = $('mapa-mes');
  if (selMes && selMes.options.length <= 1) {
    const hoy = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      selMes.add(new Option(d.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`));
    }
  }
  renderZonas();

  const consulta = () => {
    let q = _sb.from('infracciones').select('id,folio,placa,infractor,tipo,monto,estado,fecha,lat,lng').not('lat','is',null).not('lng','is',null);
    if (estadoFil) q = q.eq('estado', estadoFil);
    if (mesFil) {
      const [y, m] = mesFil.split('-').map(Number);
      q = q.gte('fecha', new Date(y, m - 1, 1).toISOString()).lt('fecha', new Date(y, m, 1).toISOString());
    }
    return q;
  };
  const { data } = await todas(consulta);
  const franja = (($('mapa-hora')||{}).value || '').split('-').map(Number);
  const infs = (data||[]).filter(r => r.lat && r.lng && (franja.length < 2 || (new Date(r.fecha).getHours() >= franja[0] && new Date(r.fecha).getHours() < franja[1])));

  if($('mapa-count')) $('mapa-count').textContent = `${infs.length} infracciones con ubicación`;

  // Init map once
  if (!_leafletMap) {
    _leafletMap = L.map('leaflet-map').setView([19.4326,-99.1332], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap contributors', maxZoom:19
    }).addTo(_leafletMap);
  }

  // Clear existing markers
  _leafletMarkers.forEach(m=>m.remove());
  _leafletMarkers=[];

  const colorMap = { pendiente:'#D97706', pagada:'#059669', impugnada:'#2563EB', vencida:'#DC2626', cancelada:'#6B7280' };

  infs.forEach(r => {
    const color = colorMap[r.estado]||'#6B7280';
    const icon = L.divIcon({
      className:'',
      html:`<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)"></div>`,
      iconSize:[14,14], iconAnchor:[7,7]
    });
    const marker = L.marker([r.lat, r.lng], {icon}).addTo(_leafletMap);
    marker.bindPopup(`<div style="font-family:'DM Sans',sans-serif;font-size:.8rem;min-width:180px">
      <div style="font-weight:700;margin-bottom:.3rem">${esc(r.folio||'—')} · ${esc(r.placa)}</div>
      <div style="color:#374151">${esc(r.tipo)}</div>
      <div style="display:flex;justify-content:space-between;margin-top:.4rem">
        <span style="color:#6B7280;font-size:.75rem">${fmtDateShort(r.fecha)}</span>
        <strong>$${Number(r.monto).toLocaleString('es-MX')}</strong>
      </div>
    </div>`);
    _leafletMarkers.push(marker);
  });

  if (infs.length) {
    const bounds = L.latLngBounds(infs.map(r=>[r.lat,r.lng]));
    _leafletMap.fitBounds(bounds, {padding:[40,40]});
  }

  // Trigger resize in case map was hidden when initialized
  setTimeout(()=>_leafletMap.invalidateSize(),200);
}

// ── Zonas conflictivas por día y hora (infracciones + accidentes) ──
const DIAS_SEM = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
function _calle(u) {
  const t = String(u || '').split(/[,(]/)[0].replace(/\s+/g, ' ').trim();
  return t.length >= 3 ? t : '';
}
async function renderZonas() {
  const cont = $('zonas-heatmap'), tbody = $('zonas-calles'); if (!cont || !tbody) return;
  const fuente = ($('zonas-fuente')||{}).value || 'ambos';
  const dias = Number(($('zonas-periodo')||{}).value || 90);
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  const [{ data: infs }, { data: accs }] = await Promise.all([
    fuente === 'accidentes' ? { data: [] } : todas(() => _sb.from('infracciones').select('id,fecha,ubicacion').gte('fecha', desde).neq('estado', 'cancelada')),
    fuente === 'infracciones' ? { data: [] } : todas(() => _sb.from('accidentes').select('id,fecha,ubicacion').gte('fecha', desde)),
  ]);
  const celdas = Array.from({ length: 7 }, () => Array(24).fill(0));
  const calles = {};
  const sumar = (rows, clave) => (rows || []).forEach(r => {
    const d = new Date(r.fecha), dia = (d.getDay() + 6) % 7, h = d.getHours();
    celdas[dia][h]++;
    const c = _calle(r.ubicacion); if (!c) return;
    const k = c.toLowerCase();
    const e = calles[k] || (calles[k] = { nombre: c, infracciones: 0, accidentes: 0, horas: Array(24).fill(0), dias: Array(7).fill(0) });
    e[clave]++; e.horas[h]++; e.dias[dia]++;
  });
  sumar(infs, 'infracciones'); sumar(accs, 'accidentes');
  const max = Math.max(1, ...celdas.flat());
  const total = celdas.flat().reduce((a, b) => a + b, 0);
  const color = n => n ? `rgba(220,38,38,${(0.12 + 0.88 * n / max).toFixed(2)})` : 'var(--stone)';
  cont.innerHTML = total ? `<div class="heatmap" role="img" aria-label="Hechos por día de la semana y hora">
      <div></div>${Array.from({ length: 24 }, (_, h) => `<div class="hm-h">${h % 3 === 0 ? h : ''}</div>`).join('')}
      ${celdas.map((fila, d) => `<div class="hm-d">${DIAS_SEM[d]}</div>${fila.map((n, h) => `<div class="hm-c" style="background:${color(n)}" title="${DIAS_SEM[d]} ${h}:00–${h + 1}:00 · ${n} ${n === 1 ? 'hecho' : 'hechos'}"></div>`).join('')}`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:.5rem;font-size:.72rem;color:var(--muted);margin-top:.5rem">
      <span>${total} hechos · el cuadro más oscuro tiene ${max}</span>
      <span>${(() => { let b = [0, 0]; celdas.forEach((f, d) => f.forEach((n, h) => { if (n > celdas[b[0]][b[1]]) b = [d, h]; })); return `Pico: ${DIAS_SEM[b[0]]} de ${b[1]}:00 a ${b[1] + 1}:00`; })()}</span>
    </div>` : '<div style="font-size:.8rem;color:var(--muted);padding:1rem 0">Sin hechos registrados en este periodo.</div>';
  const top = Object.values(calles).sort((a, b) => (b.infracciones + b.accidentes) - (a.infracciones + a.accidentes)).slice(0, 10);
  const pico = arr => arr.indexOf(Math.max(...arr));
  tbody.innerHTML = top.length ? top.map(c => {
    const h = pico(c.horas);
    return `<tr>
      <td style="font-weight:600">${esc(c.nombre)}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${c.infracciones}</td>
      <td style="text-align:right;font-variant-numeric:tabular-nums">${c.accidentes}</td>
      <td>${h}:00–${h + 1}:00</td>
      <td>${DIAS_SEM[pico(c.dias)]}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--muted)">Sin ubicaciones capturadas en este periodo</td></tr>';
}

