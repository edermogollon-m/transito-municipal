// ══════════════════════════════════════════════════════════
// IMAGEN INSTITUCIONAL Y CREDENCIAL DEL OFICIAL (institucional.sql)
// ══════════════════════════════════════════════════════════

// Marca del Ayuntamiento tal como está en Configuración (o la última guardada)
function marcaActual() {
  const c = _cachedConfig || _leerLocal('tm_config') || {};
  if (c.escudo !== undefined || c.color_institucional !== undefined)
    return { escudo: marcaImagen(c.escudo), logo: marcaImagen(c.logo), color: marcaColor(c.color_institucional), institucion: c.institucion || '' };
  return marcaGuardada() || {};
}

// Aplica la marca a un documento impreso antes de abrirlo: el color de acento
// (#1A7A82) pasa a ser el del Ayuntamiento, el sello "HCE" se cambia por el
// escudo y los marcadores <!--ESCUDO:alto--> / <!--LOGO:alto--> por las imágenes.
function conMarca(html) {
  const m = marcaActual();
  let out = String(html);
  if (m.color) {
    out = out.replace(/#1A7A82/gi, m.color)
      .replace(/#229099/gi, mezclarColor(m.color, '#ffffff', .15))
      .replace(/#0F5F66|#126069/gi, mezclarColor(m.color, '#000000', .25))
      .replace(/#f0fafa/gi, mezclarColor(m.color, '#ffffff', .94))
      .replace(/rgba\(26,\s*122,\s*130,/g, `rgba(${rgbColor(m.color)},`);
  }
  const img = (src, alto, extra = '') => `<img src="${src}" alt="" style="height:${alto};max-width:calc(${alto} * 2.6);object-fit:contain;${extra}">`;
  out = out.replace(/<div class="seal">HCE<\/div>/g, m.escudo
    ? `<div class="seal" style="border:none;border-radius:0">${img(m.escudo, '100%', 'width:100%')}</div>` : '$&');
  out = out.replace(/<!--ESCUDO:([0-9.]+(?:mm|px))(:gris)?-->/g, (_, alto, gris) => m.escudo ? img(m.escudo, alto, gris ? 'filter:grayscale(1)' : '') : '');
  out = out.replace(/<!--LOGO:([0-9.]+(?:mm|px))-->/g, (_, alto) => m.logo ? img(m.logo, alto) : '');
  return out;
}

// Al iniciar: el escudo en el menú lateral (el panel conserva sus colores)
function iniciarMarcaPanel(cfg) {
  const m = cfg ? guardarMarca({ escudo: cfg.escudo, logo: cfg.logo, color: cfg.color_institucional, institucion: cfg.institucion }) : marcaGuardada();
  aplicarMarca(m, { color: false });
}

// ── Configuración: imagen institucional ──────────────────
// Las imágenes se reducen en el navegador (máx. 400 px) y se guardan en la
// configuración; la base rechaza archivos de más de ~300 KB.
let _marcaEdit = { escudo: '', logo: '' };
function cargarMarcaConfig(data) {
  _marcaEdit = { escudo: marcaImagen(data.escudo), logo: marcaImagen(data.logo) };
  if ($('cfg-institucion')) $('cfg-institucion').value = data.institucion || '';
  if ($('cfg-color')) $('cfg-color').value = marcaColor(data.color_institucional) || '#1A7A82';
  pintarMarcaConfig();
}
function pintarMarcaConfig() {
  ['escudo', 'logo'].forEach(k => {
    const prev = $(`cfg-${k}-prev`), quitar = $(`cfg-${k}-quitar`); if (!prev) return;
    if (_marcaEdit[k]) {
      const img = document.createElement('img');
      img.src = _marcaEdit[k]; img.alt = k === 'escudo' ? 'Escudo' : 'Logo';
      img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain';
      prev.replaceChildren(img);
    } else prev.textContent = 'Sin imagen';
    if (quitar) quitar.style.display = _marcaEdit[k] ? '' : 'none';
  });
  const c = marcaColor($('cfg-color')?.value) || '#1A7A82';
  const muestra = $('cfg-marca-muestra');
  if (muestra) {
    muestra.style.background = c;
    muestra.querySelector('[data-muestra-escudo]').replaceChildren(...(_marcaEdit.escudo ? [Object.assign(document.createElement('img'), { src: _marcaEdit.escudo, alt: '', style: 'width:100%;height:100%;object-fit:contain' })] : []));
    muestra.querySelector('[data-muestra-nombre]').textContent = $('cfg-institucion')?.value.trim() || 'H. Ayuntamiento';
  }
}
async function reducirImagen(file, max = 400) {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file?.type || '')) throw new Error('Sube una imagen PNG, JPG o WebP.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('No se pudo leer la imagen.')); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth || max, img.naturalHeight || max));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round((img.naturalWidth || max) * k)); c.height = Math.max(1, Math.round((img.naturalHeight || max) * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL('image/png');                       // PNG conserva la transparencia del escudo
    if (out.length > 300000) out = c.toDataURL('image/webp', .85);
    if (out.length > 300000 || !marcaImagen(out)) throw new Error('La imagen es demasiado pesada; usa una más sencilla.');
    return out;
  } finally { URL.revokeObjectURL(url); }
}
async function elegirImagenMarca(tipo, input) {
  const f = input.files?.[0]; input.value = '';
  if (!f) return;
  try { _marcaEdit[tipo] = await reducirImagen(f); pintarMarcaConfig(); }
  catch (e) { alert(e.message); }
}
function quitarImagenMarca(tipo) { _marcaEdit[tipo] = ''; pintarMarcaConfig(); }
async function guardarMarcaInstitucional() {
  const payload = {
    institucion: ($('cfg-institucion')?.value || '').trim(),
    color_institucional: marcaColor($('cfg-color')?.value) || '',
    escudo: _marcaEdit.escudo || '', logo: _marcaEdit.logo || ''
  };
  if (payload.color_institucional.toUpperCase() === '#1A7A82') payload.color_institucional = '';
  const btn = $('btn-guardar-marca'); if (btn) btn.disabled = true;
  const { error } = await _sb.from('configuracion').update(payload).eq('id', 1);
  if (btn) btn.disabled = false;
  if (error) { alert('No se pudo guardar la imagen institucional: ' + error.message); return; }
  _cachedConfig = { ...(_cachedConfig || {}), ...payload };
  _guardarLocal('tm_config', _cachedConfig);
  iniciarMarcaPanel(_cachedConfig);
  await logActivity('config', `Imagen institucional actualizada por ${_session.name}`);
  showToast('Imagen institucional guardada');
}
function restablecerColorMarca() { if ($('cfg-color')) $('cfg-color').value = '#1A7A82'; pintarMarcaConfig(); }

// ── Credencial digital del oficial ───────────────────────
// El QR lleva a /verificar?o=<token>: cualquiera comprueba nombre, foto y
// vigencia sin iniciar sesión. Reponer la credencial invalida el QR anterior.
const CRED_COLS = USR_COLS + ',foto,token_credencial';
function urlCredencial(token) { return `${window.location.origin}/verificar?o=${token}`; }
function qrCredencial(token, size = 240) {
  try { return new QRious({ value: urlCredencial(token), size, padding: 8, backgroundAlpha: 1 }).toDataURL(); }
  catch (e) { console.warn('QR credencial:', e); return ''; }
}
function inicialesDe(u) { return (u.iniciales || String(u.nombre || '').split(' ').map(n => n[0]).join('').slice(0, 2)).toUpperCase(); }

// Tarjeta (85.6 × 54 mm): sirve para imprimir y, más grande, en pantalla
function htmlCredencial(u, qr) {
  const m = marcaActual(), color = m.color || '#1A7A82';
  const rol = ROLES[u.rol]?.nombre || u.rol;
  const foto = marcaImagen(u.foto);
  return `<div class="cred" style="--c:${color}">
    <div class="cred-top">
      <div class="cred-escudo">${m.escudo ? `<img src="${m.escudo}" alt="Escudo">` : 'T'}</div>
      <div class="cred-inst"><b>${esc(m.institucion || ('Gobierno Municipal' + (_cachedConfig?.municipio ? ' de ' + _cachedConfig.municipio : '')))}</b><span>Dirección de Tránsito y Movilidad</span></div>
      ${m.logo ? `<img class="cred-logo" src="${m.logo}" alt="Logo">` : ''}
    </div>
    <div class="cred-body">
      <div class="cred-foto">${foto ? `<img src="${foto}" alt="Foto">` : esc(inicialesDe(u))}</div>
      <div class="cred-datos">
        <div class="cred-nombre">${esc(u.nombre)}</div>
        <div class="cred-rol">${esc(rol)}</div>
        ${u.numero_placa ? `<div class="cred-f"><span>Placa</span>${esc(u.numero_placa)}</div>` : ''}
        ${u.adscripcion ? `<div class="cred-f"><span>Adscripción</span>${esc(u.adscripcion)}</div>` : ''}
        <div class="cred-estado ${u.activo ? 'ok' : 'no'}">${u.activo ? 'Credencial vigente' : 'Credencial no vigente'}</div>
      </div>
      ${qr ? `<div class="cred-qr"><img src="${qr}" alt="QR de verificación"><span>Escanee para verificar</span></div>` : ''}
    </div>
  </div>`;
}
const CSS_CREDENCIAL = `
  .cred{width:85.6mm;height:54mm;border-radius:3mm;overflow:hidden;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;border:.3mm solid #d4d9dc;box-sizing:border-box}
  .cred-top{background:var(--c);color:#fff;display:flex;align-items:center;gap:2.2mm;padding:2.2mm 3mm}
  .cred-escudo{width:9mm;height:9mm;flex-shrink:0;border-radius:50%;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12pt}
  .cred-escudo img{width:100%;height:100%;object-fit:contain}
  .cred-escudo:has(img){background:none;border-radius:0}
  .cred-inst{display:flex;flex-direction:column;line-height:1.15;min-width:0}
  .cred-inst b{font-size:7pt;text-transform:uppercase;letter-spacing:.02em}
  .cred-inst span{font-size:6pt;opacity:.85}
  .cred-logo{height:8mm;max-width:16mm;object-fit:contain;margin-left:auto;background:#fff;border-radius:1mm;padding:.5mm}
  .cred-body{flex:1;display:flex;gap:2.6mm;padding:2.6mm 3mm;align-items:center}
  .cred-foto{width:19mm;height:24mm;flex-shrink:0;border-radius:1.5mm;background:#e8eef0;color:var(--c);display:flex;align-items:center;justify-content:center;font-size:16pt;font-weight:800;overflow:hidden;border:.3mm solid #d4d9dc}
  .cred-foto img{width:100%;height:100%;object-fit:cover}
  .cred-datos{flex:1;min-width:0;display:flex;flex-direction:column;gap:.8mm}
  .cred-nombre{font-size:8.5pt;font-weight:800;line-height:1.15}
  .cred-rol{font-size:6.5pt;font-weight:700;color:var(--c);text-transform:uppercase;letter-spacing:.03em}
  .cred-f{font-size:6.5pt;line-height:1.2}.cred-f span{display:block;font-size:5pt;color:#777;text-transform:uppercase;letter-spacing:.05em}
  .cred-estado{font-size:5.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-top:.4mm}
  .cred-estado.ok{color:#047857}.cred-estado.no{color:#B91C1C}
  .cred-qr{display:flex;flex-direction:column;align-items:center;gap:.6mm;flex-shrink:0}
  .cred-qr img{width:19mm;height:19mm}
  .cred-qr span{font-size:4.6pt;color:#666;text-align:center;width:20mm}`;

async function leerCredencial(filtro) {
  const { data, error } = await _sb.from('usuarios').select(CRED_COLS).match(filtro).maybeSingle();
  if (error || !data) { alert('No se pudo cargar la credencial' + (error ? ': ' + error.message : '.')); return null; }
  if (!data.token_credencial) { alert('Falta actualizar la base de datos (institucional.sql) para usar credenciales verificables.'); return null; }
  return data;
}

async function printCredencial(userId) {
  const u = await leerCredencial({ id: userId }); if (!u) return;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Credencial — ${esc(u.nombre)}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}@page{size:85.6mm 54mm;margin:0}
  body{background:#eef1f2;display:flex;flex-direction:column;align-items:center;gap:6mm;padding:8mm}
  .no-print button{padding:8px 18px;background:#1A7A82;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;margin:0 4px}
  @media print{body{background:#fff;padding:0;display:block}.no-print{display:none}.cred{border:none;border-radius:0}}
  ${CSS_CREDENCIAL}</style></head><body>
  <div class="no-print"><button onclick="window.print()">Imprimir credencial</button><button onclick="window.close()">Cerrar</button></div>
  ${htmlCredencial(u, qrCredencial(u.token_credencial))}
  </body></html>`;
  const w = window.open('', '_blank', 'width=520,height=460');
  if (w) { w.document.write(conMarca(html)); w.document.close(); }
}

// "Mi credencial": la del usuario en sesión, en pantalla, para mostrarla en el celular
async function abrirMiCredencial() {
  if (!_authUid) await _authListo;
  const u = await leerCredencial({ auth_id: _authUid }); if (!u) return;
  let ov = $('mi-credencial');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'mi-credencial';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(6,14,14,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.1rem;padding:1rem';
    ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML = `<style>${CSS_CREDENCIAL}
    #mi-credencial .cred-wrap{width:85.6mm;height:54mm}
    #mi-credencial .cred{box-shadow:0 10px 40px rgba(0,0,0,.45);border:none}</style>
    <div class="cred-wrap">${htmlCredencial(u, qrCredencial(u.token_credencial, 320))}</div>
    <div style="color:rgba(255,255,255,.75);font-size:.8rem;text-align:center;max-width:320px;line-height:1.5">Muestra esta credencial al ciudadano: al escanear el QR confirma que eres personal de Tránsito.</div>
    <button class="btn btn-ghost" style="background:#fff;color:#111" onclick="document.getElementById('mi-credencial').remove()">Cerrar</button>`;
  const ajustar = () => {
    const w = ov.querySelector('.cred-wrap'); if (!w) return;
    const base = w.offsetWidth || 323;
    w.style.zoom = Math.min(2.2, (window.innerWidth - 32) / base, (window.innerHeight * .6) / (base * .63)).toFixed(3);
  };
  ajustar();
}

// Foto de la credencial (la sube el administrador al editar al usuario)
async function subirFotoCredencial(input) {
  const f = input.files?.[0]; input.value = '';
  const id = $('usr-id')?.value;
  if (!f) return;
  if (!id) { alert('Guarda primero al usuario y después súbele la foto.'); return; }
  try {
    const foto = await reducirImagen(f, 360);
    const { error } = await _sb.from('usuarios').update({ foto }).eq('id', id);
    if (error) throw error;
    pintarFotoUsuario(foto);
    showToast('Foto de la credencial guardada');
  } catch (e) { alert('No se pudo guardar la foto: ' + (e.message || e)); }
}
function pintarFotoUsuario(foto) {
  const prev = $('usr-foto-prev'); if (!prev) return;
  if (marcaImagen(foto)) {
    const img = document.createElement('img'); img.src = foto; img.alt = 'Foto'; img.style.cssText = 'width:100%;height:100%;object-fit:cover';
    prev.replaceChildren(img);
  } else prev.textContent = 'Sin foto';
}
async function reponerCredencial(id, nombre) {
  if (!confirm(`¿Reponer la credencial de ${nombre}? El QR de la credencial anterior dejará de validar.`)) return;
  const { error } = await _sb.rpc('regenerar_credencial', { p_id: id });
  if (error) { alert('No se pudo reponer: ' + error.message); return; }
  await logActivity('usuario', `Credencial repuesta para ${nombre}`);
  showToast('Credencial repuesta: imprime la nueva');
  printCredencial(id);
}
