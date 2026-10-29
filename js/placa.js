// ── Vencimientos automáticos ──────────────────────────────
async function checkAndUpdateVencidos() {
  // También corre a diario en el servidor (pg_cron); aquí solo se adelanta.
  await _sb.rpc('marcar_infracciones_vencidas');
}

// ── Leer la placa con la cámara (OCR en el navegador con Tesseract.js) ──
// La librería (~3 MB con el modelo) se descarga solo la primera vez que se usa.
// Solo se lee lo que queda dentro del recuadro guía, nunca la foto completa
// (calcomanías, letreros y la marca del carro confundían al lector). Si la
// lectura no es clara se pregunta al oficial antes de llenar el campo.
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let _ocrWorker = null, _ocrCargando = null;

function cargarScript(src) {
  return new Promise((resolve, reject) => {
    if ([...document.scripts].some(s => s.src === src)) return resolve();
    const el = document.createElement('script');
    el.src = src; el.onload = resolve; el.onerror = () => reject(new Error('No se pudo descargar el lector de placas'));
    document.head.appendChild(el);
  });
}

function workerPlaca() {
  if (_ocrWorker) return Promise.resolve(_ocrWorker);
  if (!_ocrCargando) _ocrCargando = (async () => {
    await cargarScript(TESSERACT_URL);
    // Sin diccionario: una placa no son palabras, y el diccionario "corrige" hacia palabras.
    // Modo 11 (texto suelto): con el recuadro y las leyendas de la placa lee mucho mejor que por bloque
    const w = await Tesseract.createWorker('eng', 1, {}, { load_system_dawg: '0', load_freq_dawg: '0' });
    await w.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-', tessedit_pageseg_mode: '11', user_defined_dpi: '300' });
    return (_ocrWorker = w);
  })().catch(e => { _ocrCargando = null; throw e; });
  return _ocrCargando;
}

// Formatos de placa mexicana (L letra, D número) y cómo se agrupan con guiones
const FORMATOS_PLACA = [
  { forma: 'LLLDDDL', grupos: [[3, 3, 1]] },          // particular actual: ABC-123-D
  { forma: 'LLLDDDD', grupos: [[3, 4], [3, 2, 2]] },  // anteriores: ABC-1234 / ABC-12-34
  { forma: 'DDDLLL',  grupos: [[3, 3]] },             // 123-ABC
  { forma: 'LDDLLL',  grupos: [[1, 2, 3]] }
];
// Lo que el lector suele confundir, según si en esa posición va letra o número
const A_LETRA = { 0: 'O', 1: 'I', 2: 'Z', 4: 'A', 5: 'S', 6: 'G', 7: 'T', 8: 'B' };
const A_NUMERO = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', J: '1', T: '7', Z: '2', S: '5', B: '8', G: '6', A: '4' };

// Acomoda un texto al formato de placa que mejor le quede, corrigiendo
// confusiones por posición. Devuelve { placa, cambios, alterna } o null.
// alterna: otro formato que le queda casi igual de bien (ABC-1237 / ABC-123-T);
// el lector a menudo se come el último guion y lee la letra final como número.
function ajustarFormato(plano, partes) {
  const ajustes = [];
  for (const f of FORMATOS_PLACA) {
    if (f.forma.length !== plano.length) continue;
    let cambios = 0, txt = '';
    for (let i = 0; i < plano.length && cambios < 9; i++) {
      const c = plano[i], letra = f.forma[i] === 'L';
      if (letra === /[A-Z]/.test(c)) txt += c;
      else if (letra ? A_LETRA[c] : A_NUMERO[c]) { txt += letra ? A_LETRA[c] : A_NUMERO[c]; cambios++; }
      else cambios = 9;
    }
    if (cambios > 2) continue;
    const largos = partes && partes.length > 1 ? partes.map(p => p.length).join() : '';
    const g = f.grupos.find(g => g.join() === largos) || f.grupos[0];
    let k = 0;
    ajustes.push({ placa: g.map(n => txt.slice(k, (k += n))).join('-'), cambios, forma: f.forma, agrupado: !!largos && g.join() === largos });
  }
  if (!ajustes.length) return null;
  // Gana el de menos correcciones; si empatan, el que respeta los guiones leídos
  ajustes.sort((a, b) => a.cambios - b.cambios || b.agrupado - a.agrupado);
  const [mejor, otro] = ajustes;
  // Dos guiones leídos donde los lleva este formato (ABC-12-34) bastan para descartar el otro
  const guiones = mejor.agrupado && partes.length >= 3;
  const alterna = otro && otro.cambios - mejor.cambios <= 1 && mejor.forma !== 'LLLDDDL' && !guiones ? otro.placa : '';
  return { placa: mejor.placa, cambios: mejor.cambios, alterna };
}

// Candidatos a placa en un texto leído: 5 a 8 letras y números juntos,
// ignorando "VERACRUZ", "MÉXICO", etc. Cada uno trae sus puntos.
function candidatosPlaca(texto, extra = 0) {
  const lista = [];
  String(texto || '').toUpperCase().split(/\n+/).forEach(linea => {
    const tokens = linea.replace(/[^A-Z0-9\-\s]/g, ' ').split(/[\s\-]+/).filter(Boolean);
    for (let i = 0; i < tokens.length; i++) {
      for (let n = 1; n <= 3 && i + n <= tokens.length; n++) {
        const partes = tokens.slice(i, i + n);
        if (n > 1 && partes.some(p => p.length > 4)) continue;   // "MEXICO", "LEON"… no son parte de la placa
        let plano = partes.join('');
        if (plano.length < 5 || plano.length > 9) continue;
        let ajuste = ajustarFormato(plano, partes);
        // El borde de la placa a veces se lee como "1" o "I" pegado a la primera o última letra
        if (!ajuste && plano.length >= 7) {
          for (const recorte of [plano.replace(/^[1IJL]/, ''), plano.replace(/[1IJL]$/, '')]) {
            if (recorte.length === plano.length || ajuste) continue;
            const p2 = partes.map((p, k) => k === 0 && recorte !== plano.slice(0, -1) ? p.replace(/^[1IJL]/, '') : k === partes.length - 1 && recorte === plano.slice(0, -1) ? p.replace(/[1IJL]$/, '') : p).filter(Boolean);
            const a = ajustarFormato(recorte, p2);
            if (a) { ajuste = { ...a, cambios: a.cambios + 1 }; plano = recorte; }
          }
        }
        if (plano.length > 8) continue;
        if (ajuste) lista.push({ placa: ajuste.placa, alterna: ajuste.alterna, formato: true, cambios: ajuste.cambios, puntos: 10 - 3 * ajuste.cambios - (ajuste.alterna ? 1 : 0) + (n > 1 ? 1 : 0) + extra });
        else if (/[A-Z]/.test(plano) && /\d/.test(plano)) lista.push({ placa: n > 1 ? partes.join('-') : plano, formato: false, cambios: 9, puntos: 1 + extra });
      }
    }
  });
  return lista.sort((a, b) => b.puntos - a.puntos);
}

function extraerPlaca(texto) {
  return candidatosPlaca(texto)[0]?.placa || '';
}

// Recorta la zona de la placa, la agranda y la limpia para el lector.
// Se estira a lo ancho porque la letra de las placas es muy angosta y el
// lector la confunde (con 1.8 acierta mucho más que sin estirar).
// modo: 'adapt' (blanco y negro con umbral local: aguanta sombras),
//       'otsu' (blanco y negro con un solo umbral) o 'gris' (solo contraste)
function prepararRecorte(fuente, r, { modo, estirar }) {
  const ancho = Math.round(520 * estirar), alto = Math.max(1, Math.round(r.h * 520 / r.w)), m = 24;
  const c = document.createElement('canvas');
  c.width = ancho + 2 * m; c.height = alto + 2 * m;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(fuente, r.x, r.y, r.w, r.h, m, m, ancho, alto);
  const img = ctx.getImageData(m, m, ancho, alto), d = img.data, N = ancho * alto;
  const g = new Float32Array(N);
  for (let i = 0; i < N; i++) g[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
  let out = new Uint8ClampedArray(N);
  if (modo === 'gris') {
    const orden = Float32Array.from(g).sort(), lo = orden[Math.floor(N * .02)], hi = orden[Math.floor(N * .98)] || lo + 1;
    for (let i = 0; i < N; i++) out[i] = (g[i] - lo) * 255 / Math.max(1, hi - lo);
  } else if (modo === 'otsu') {
    const hist = new Array(256).fill(0); g.forEach(v => hist[v | 0]++);
    let total = 0; for (let t = 0; t < 256; t++) total += t * hist[t];
    let sB = 0, wB = 0, mejor = 0, umbral = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB || wB === N) continue;
      sB += t * hist[t];
      const mB = sB / wB, mF = (total - sB) / (N - wB), v = wB * (N - wB) * (mB - mF) ** 2;
      if (v > mejor) { mejor = v; umbral = t; }
    }
    for (let i = 0; i < N; i++) out[i] = g[i] > umbral ? 255 : 0;
  } else {
    // Umbral local (Bradley): cada punto se compara con el promedio de su vecindad
    const S = new Float64Array((ancho + 1) * (alto + 1)), rad = Math.round(ancho / 16);
    for (let y = 0; y < alto; y++) {
      let fila = 0;
      for (let x = 0; x < ancho; x++) { fila += g[y * ancho + x]; S[(y + 1) * (ancho + 1) + x + 1] = S[y * (ancho + 1) + x + 1] + fila; }
    }
    for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
      const x0 = Math.max(0, x - rad), x1 = Math.min(ancho, x + rad + 1), y0 = Math.max(0, y - rad), y1 = Math.min(alto, y + rad + 1);
      const suma = S[y1 * (ancho + 1) + x1] - S[y0 * (ancho + 1) + x1] - S[y1 * (ancho + 1) + x0] + S[y0 * (ancho + 1) + x0];
      out[y * ancho + x] = g[y * ancho + x] * (x1 - x0) * (y1 - y0) < suma * 0.85 ? 0 : 255;
    }
  }
  // La placa es letra oscura sobre fondo claro; si salió al revés, se invierte
  if (modo !== 'gris') {
    let oscuros = 0; out.forEach(v => { if (v < 128) oscuros++; });
    if (oscuros > N * 0.55) out = out.map(v => 255 - v);
  }
  for (let i = 0; i < N; i++) d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = out[i];
  ctx.putImageData(img, m, m);
  return c;
}
const MODOS_RECORTE = [{ modo: 'adapt', estirar: 1.8 }, { modo: 'gris', estirar: 1.6 }, { modo: 'otsu', estirar: 1.8 }, { modo: 'gris', estirar: 2 }];

// Lee un recorte y devuelve los candidatos. Las palabras se juntan por
// renglón según su posición (el lector a veces separa "-D" del resto) y las
// letras más grandes (la placa) pesan más que las chicas (estado, leyendas).
async function leerCandidatos(lienzo) {
  const w = await workerPlaca();
  const { data } = await w.recognize(lienzo);
  const palabras = (data?.words || []).filter(p => p.text && p.bbox)
    .map(p => ({ text: p.text, x: p.bbox.x0, y0: p.bbox.y0, y1: p.bbox.y1, cy: (p.bbox.y0 + p.bbox.y1) / 2, h: p.bbox.y1 - p.bbox.y0, conf: p.confidence || 0 }));
  if (!palabras.length) return candidatosPlaca(data?.text);
  const renglones = [];
  palabras.sort((a, b) => b.h - a.h).forEach(p => {
    const r = renglones.find(r => Math.abs(p.cy - r.cy) < r.h * 0.5 && p.h > r.h * 0.6);
    if (r) r.palabras.push(p); else renglones.push({ cy: p.cy, h: p.h, palabras: [p] });
  });
  const altoMax = renglones[0].h;
  const cands = renglones.flatMap(r => {
    const texto = r.palabras.sort((a, b) => a.x - b.x).map(p => p.text).join(' ');
    const conf = r.palabras.reduce((a, p) => a + p.conf, 0) / r.palabras.length;
    return candidatosPlaca(texto, 3 * r.h / altoMax + conf / 40);
  });
  // Si no salió una placa completa, se relee solo la franja de las letras grandes
  // como un renglón: así no se pierden la primera o la última letra
  const mejor = cands.sort((a, b) => b.puntos - a.puntos)[0];
  if (!mejor || !mejor.formato || mejor.cambios || mejor.alterna) {
    const r = renglones[0], y0 = Math.min(...r.palabras.map(p => p.y0)), y1 = Math.max(...r.palabras.map(p => p.y1)), m = (y1 - y0) * 0.25;
    const top = Math.max(0, Math.round(y0 - m)), height = Math.min(lienzo.height - top, Math.round(y1 - y0 + 2 * m));
    await w.setParameters({ tessedit_pageseg_mode: '7' });
    try {
      const { data: d2 } = await w.recognize(lienzo, { rectangle: { left: 0, top, width: lienzo.width, height } });
      cands.push(...candidatosPlaca(d2?.text, 3 + (d2?.confidence || 0) / 40));
    } finally { await w.setParameters({ tessedit_pageseg_mode: '11' }); }
  }
  return cands.sort((a, b) => b.puntos - a.puntos);
}

// Junta las lecturas de varios intentos: gana la placa que más se repite
// (una con formato de placa completo le gana a un pedazo)
function votarPlaca(votos, candidatos) {
  const vistos = new Set();
  candidatos.slice(0, 3).forEach((c, i) => {
    if (vistos.has(c.placa)) return; vistos.add(c.placa);
    const v = votos[c.placa] || (votos[c.placa] = { placa: c.placa, puntos: 0, lecturas: 0, formato: c.formato, cambios: c.cambios, alterna: '' });
    if (c.alterna) v.alterna = c.alterna;
    v.puntos += c.puntos * (i ? 0.5 : 1); v.lecturas += i ? 0 : 1; v.cambios = Math.min(v.cambios, c.cambios);
  });
  return ordenVotos(votos)[0] || null;
}
const ordenVotos = votos => Object.values(votos).sort((a, b) => b.formato - a.formato || b.puntos - a.puntos);

// Se llena sin preguntar solo si salió igual al menos dos veces, con formato
// de placa, y ninguna otra lectura completa le hace competencia (NZH-885-K / NZH-885-X)
function placaSegura(v, votos) {
  if (!v || !v.formato || v.alterna || v.lecturas < 2 || v.cambios > 1) return false;
  const rival = ordenVotos(votos).find(o => o !== v && o.formato && o.lecturas);
  return !rival || v.lecturas > 2 * rival.lecturas;
}

// ── Pantalla del lector ──
const _lector = { sesion: 0, stream: null, votos: {}, placa: '', modo: '', luz: false };
const esperaMs = ms => new Promise(r => setTimeout(r, ms));

// Parte de la imagen original que cae dentro del recuadro guía
function zonaRecuadro(medio, ancho, alto, cubrir) {
  const vista = $('ps-vista').getBoundingClientRect(), marco = $('ps-marco').getBoundingClientRect();
  const s = cubrir ? Math.max(vista.width / ancho, vista.height / alto) : Math.min(vista.width / ancho, vista.height / alto);
  const ox = vista.left + (vista.width - ancho * s) / 2, oy = vista.top + (vista.height - alto * s) / 2;
  const x = Math.max(0, (marco.left - ox) / s), y = Math.max(0, (marco.top - oy) / s);
  const w = Math.min(ancho - x, marco.width / s), h = Math.min(alto - y, marco.height / s);
  return w >= 8 && h >= 4 ? { x, y, w, h } : null;   // el recuadro quedó fuera de la imagen
}

function avisoLector(t, tono) {
  const a = $('ps-ayuda'); if (!a) return;
  a.textContent = t; a.dataset.tono = tono || '';
}

async function abrirLectorPlaca() {
  const sesion = ++_lector.sesion;
  Object.assign(_lector, { votos: {}, placa: '', luz: false });
  $('placa-scan').hidden = false; document.body.style.overflow = 'hidden';
  $('ps-res').hidden = true; $('ps-acciones').hidden = false;
  workerPlaca().catch(() => {});   // se va descargando mientras abre la cámara
  if (!navigator.mediaDevices?.getUserMedia) return modoFotoPlaca('Este celular no deja usar la cámara aquí. Toma una foto de la placa.');
  avisoLector('Abriendo la cámara…');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    if (sesion !== _lector.sesion) return stream.getTracks().forEach(t => t.stop());
    _lector.stream = stream; _lector.modo = 'camara';
    const v = $('ps-video'); v.srcObject = stream; v.hidden = false; $('ps-foto').hidden = true;
    $('ps-marco').classList.remove('movible'); $('ps-marco').removeAttribute('style');
    $('ps-leer').hidden = true;
    await v.play().catch(() => {});
    const pista = stream.getVideoTracks()[0];
    $('ps-luz').hidden = !(pista.getCapabilities?.().torch);
    cicloCamara(sesion);
  } catch (err) {
    console.warn('Cámara para placa:', err);
    modoFotoPlaca(err?.name === 'NotAllowedError' ? 'No hay permiso para la cámara. Puedes tomar una foto de la placa.' : 'No se pudo abrir la cámara. Toma una foto de la placa.');
  }
}

async function cicloCamara(sesion) {
  const v = $('ps-video');
  let i = 0, mejor = null;
  try {
    avisoLector(_ocrWorker ? 'Acomoda la placa dentro del recuadro' : 'Preparando el lector (solo la primera vez tarda un poco)…');
    await workerPlaca();
  } catch (err) {
    if (sesion === _lector.sesion) avisoLector(navigator.onLine ? 'No se pudo cargar el lector. Escribe la placa a mano.' : 'Sin señal: la primera lectura necesita internet. Escribe la placa a mano.', 'error');
    return;
  }
  const t0 = Date.now();
  while (sesion === _lector.sesion && _lector.modo === 'camara') {
    if (v.readyState < 2 || !v.videoWidth) { await esperaMs(150); continue; }
    const zona = zonaRecuadro(v, v.videoWidth, v.videoHeight, true);
    if (!zona) { await esperaMs(150); continue; }
    const cands = await leerCandidatos(prepararRecorte(v, zona, MODOS_RECORTE[i++ % MODOS_RECORTE.length])).catch(() => []);
    if (sesion !== _lector.sesion || _lector.modo !== 'camara') return;
    mejor = votarPlaca(_lector.votos, cands);
    if (placaSegura(mejor, _lector.votos)) return usarPlacaLeida(mejor.placa);
    if (Date.now() - t0 > 12000) return mejor ? preguntarPlaca(mejor) : sinLectura();
    avisoLector(mejor?.formato ? `Leyendo… ${mejor.placa}` : 'Acomoda la placa dentro del recuadro y mantén el celular quieto');
    await esperaMs(80);
  }
}

function modoFotoPlaca(aviso) {
  pararCamara(); _lector.modo = 'foto';
  $('ps-video').hidden = true; $('ps-luz').hidden = true;
  $('ps-leer').hidden = !$('ps-foto').src || $('ps-foto').hidden;
  avisoLector(aviso || 'Toma una foto de la placa.');
}

function usarFotoPlaca() {
  $('inf-placa-foto').click();
}

// Desde la foto: se muestra con el recuadro, que se puede mover y agrandar
async function leerPlacaDesdeArchivo(file) {
  if (!file) return;
  if ($('placa-scan').hidden) await abrirSoloFoto();
  pararCamara(); _lector.modo = 'foto'; _lector.votos = {};
  const foto = $('ps-foto');
  await new Promise(async res => { foto.onload = res; foto.onerror = res; foto.src = await compressPhoto(file, 1800); });
  foto.hidden = false; $('ps-video').hidden = true; $('ps-luz').hidden = true;
  $('ps-res').hidden = true; $('ps-acciones').hidden = false; $('ps-leer').hidden = false;
  colocarMarcoFoto();
  avisoLector('Mueve el recuadro para que cubra la placa y toca «Leer placa».');
}

async function abrirSoloFoto() {
  ++_lector.sesion;
  Object.assign(_lector, { votos: {}, placa: '' });
  $('placa-scan').hidden = false; document.body.style.overflow = 'hidden';
  workerPlaca().catch(() => {});
}

// El recuadro se guarda en coordenadas de la foto para que no se mueva de la
// placa si cambia el tamaño de la pantalla (girar el celular, aparece la pregunta…)
function colocarMarcoFoto() {
  const foto = $('ps-foto'), iw = foto.naturalWidth, ih = foto.naturalHeight;
  const w = iw * 0.7, h = Math.min(w / 2, ih);
  _lector.zonaFoto = { x: (iw - w) / 2, y: (ih - h) / 2, w, h };
  $('ps-marco').classList.add('movible');
  ubicarMarcoFoto();
}

function ubicarMarcoFoto() {
  const z = _lector.zonaFoto, foto = $('ps-foto');
  if (_lector.modo !== 'foto' || !z || !foto.naturalWidth) return;
  const vista = $('ps-vista').getBoundingClientRect();
  const s = Math.min(vista.width / foto.naturalWidth, vista.height / foto.naturalHeight);
  const ox = (vista.width - foto.naturalWidth * s) / 2, oy = (vista.height - foto.naturalHeight * s) / 2;
  Object.assign($('ps-marco').style, { left: ox + z.x * s + 'px', top: oy + z.y * s + 'px', width: z.w * s + 'px', height: z.h * s + 'px', transform: 'none' });
}
if (typeof ResizeObserver === 'function') addEventListener('DOMContentLoaded', () => {
  const vista = $('ps-vista'); if (vista) new ResizeObserver(() => ubicarMarcoFoto()).observe(vista);
});

// Arrastrar el recuadro (o su esquina para cambiar el tamaño)
function iniciarArrastreMarco(e) {
  const marco = $('ps-marco');
  if (!marco.classList.contains('movible')) return;
  e.preventDefault();
  const esquina = e.target.id === 'ps-asa', vista = $('ps-vista').getBoundingClientRect();
  const ini = { x: e.clientX, y: e.clientY, l: marco.offsetLeft, t: marco.offsetTop, w: marco.offsetWidth, h: marco.offsetHeight };
  const mover = ev => {
    const dx = ev.clientX - ini.x, dy = ev.clientY - ini.y;
    if (esquina) {
      marco.style.width = Math.max(80, Math.min(vista.width - ini.l, ini.w + dx)) + 'px';
      marco.style.height = Math.max(40, Math.min(vista.height - ini.t, ini.h + dy)) + 'px';
    } else {
      marco.style.left = Math.max(0, Math.min(vista.width - ini.w, ini.l + dx)) + 'px';
      marco.style.top = Math.max(0, Math.min(vista.height - ini.h, ini.t + dy)) + 'px';
    }
  };
  const soltar = () => {
    const foto = $('ps-foto'), z = zonaRecuadro(foto, foto.naturalWidth, foto.naturalHeight, false);
    if (z) _lector.zonaFoto = z;
    removeEventListener('pointermove', mover); removeEventListener('pointerup', soltar); removeEventListener('pointercancel', soltar); };
  addEventListener('pointermove', mover); addEventListener('pointerup', soltar); addEventListener('pointercancel', soltar);
}

async function leerFotoRecortada() {
  const foto = $('ps-foto'), sesion = _lector.sesion, btn = $('ps-leer');
  if (!foto.naturalWidth) return;
  btn.disabled = true; _lector.votos = {};
  try {
    avisoLector(_ocrWorker ? 'Leyendo la placa…' : 'Preparando el lector (solo la primera vez tarda un poco)…');
    await workerPlaca();
    avisoLector('Leyendo la placa…');
    const zona = zonaRecuadro(foto, foto.naturalWidth, foto.naturalHeight, false);
    if (!zona) return avisoLector('Pon el recuadro encima de la placa.', 'duda');
    let mejor = null;
    for (const modo of MODOS_RECORTE) {
      mejor = votarPlaca(_lector.votos, await leerCandidatos(prepararRecorte(foto, zona, modo)));
      if (sesion !== _lector.sesion) return;
      if (placaSegura(mejor, _lector.votos) && mejor.cambios === 0) break;
    }
    if (placaSegura(mejor, _lector.votos)) usarPlacaLeida(mejor.placa);
    else if (mejor) preguntarPlaca(mejor);
    else sinLectura();
  } catch (err) {
    console.warn('OCR placa:', err);
    avisoLector(navigator.onLine ? 'No se pudo leer la placa. Escríbela a mano.' : 'Sin señal: la primera lectura necesita internet. Escribe la placa a mano.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// Lectura dudosa: se pregunta antes de llenar el campo. Si la placa cabe en
// dos formatos (ABC-1237 / ABC-123-T) se ofrecen las dos.
function preguntarPlaca(voto) {
  _lector.placa = voto.placa; _lector.alterna = voto.alterna || '';
  pararCamara();
  $('ps-placa').textContent = voto.placa;
  $('ps-alterna').hidden = !voto.alterna;
  $('ps-alterna').textContent = voto.alterna ? `No, es ${voto.alterna}` : '';
  $('ps-res').hidden = false; $('ps-acciones').hidden = true;
  avisoLector('No estoy seguro de la lectura. Compárala con la placa del vehículo.', 'duda');
}

function sinLectura() {
  pararCamara();
  $('ps-res').hidden = true; $('ps-acciones').hidden = false;
  if (_lector.modo === 'camara') { _lector.modo = 'pausa'; $('ps-reintentar').hidden = false; }
  avisoLector('No pude leer la placa. Acércate, evita reflejos o escríbela a mano.', 'error');
}

function aceptarPlacaLeida(alterna) { usarPlacaLeida(alterna ? _lector.alterna : _lector.placa, true); }

async function usarPlacaLeida(placa, confirmada) {
  cerrarLectorPlaca();
  $('inf-placa').value = formatoPlaca(placa);
  aplicarFormatoPlaca($('inf-placa'));
  const st = $('placa-ocr-status');
  if (st) { st.textContent = confirmada ? `Placa ${placa} confirmada.` : `Leída: ${placa}. Revisa que coincida con la placa del vehículo.`; st.style.color = 'var(--green)'; }
  await checkPlacaHistory();
  updateInfSummary();
}

function reintentarPlaca() {
  $('ps-res').hidden = true; $('ps-acciones').hidden = false; $('ps-reintentar').hidden = true;
  if (_lector.modo === 'foto') { _lector.votos = {}; avisoLector('Ajusta el recuadro sobre la placa y vuelve a leer, o toma otra foto.'); }
  else abrirLectorPlaca();
}

async function alternarLuzPlaca() {
  const pista = _lector.stream?.getVideoTracks()[0]; if (!pista) return;
  _lector.luz = !_lector.luz;
  await pista.applyConstraints({ advanced: [{ torch: _lector.luz }] }).catch(() => { _lector.luz = false; });
  $('ps-luz').classList.toggle('activo', _lector.luz);
}

function pararCamara() {
  _lector.stream?.getTracks().forEach(t => t.stop());
  _lector.stream = null;
  const v = $('ps-video'); if (v) v.srcObject = null;
}

function cerrarLectorPlaca(escribir) {
  ++_lector.sesion; _lector.modo = ''; _lector.zonaFoto = null;
  pararCamara();
  $('placa-scan').hidden = true; document.body.style.overflow = '';
  $('ps-foto').hidden = true; $('ps-foto').removeAttribute('src'); $('ps-reintentar').hidden = true;
  if (escribir) $('inf-placa').focus();
}

// ── Historial por placa + auto-fill desde padrón vehicular ──
async function checkPlacaHistory() {
  const placa = ($('inf-placa')||{}).value?.trim().toUpperCase();
  const panel = $('placa-history');
  if (!panel) return;
  if (!placa || placa.length < 3) { panel.innerHTML = ''; window._placaAdeudos = []; _alertaMostrada = ''; return; }

  // Consultar historial completo y padrón vehicular en paralelo
  const [{ data }, { data: veh }] = await Promise.all([
    _sb.from('infracciones').select('id,folio,fecha,tipo,estado,monto,boleta').in('placa', variantesPlaca(placa)).order('fecha',{ascending:false}),
    _sb.from('vehiculos').select('propietario,marca,modelo,color,telefono').in('placa', variantesPlaca(placa)).limit(1).maybeSingle()
  ]);

  // Auto-completar campos del formulario si están vacíos
  if (veh) {
    const infractor = $('inf-infractor');
    if (infractor && !infractor.value) infractor.value = veh.propietario || '';
    const vehiculo = $('inf-vehiculo');
    if (vehiculo && !vehiculo.value) vehiculo.value = [veh.marca, veh.modelo].filter(Boolean).join(' ');
    const color = $('inf-color');
    if (color && !color.value) color.value = veh.color || '';
    const tel = $('inf-telefono');
    if (tel && !tel.value) tel.value = veh.telefono || '';
  }

  const prevId  = $('inf-id')?.value;
  const prev    = (data||[]).filter(r => String(r.id) !== String(prevId));
  // Las infracciones de la boleta que se está levantando no son adeudos anteriores
  const adeudos = prev.filter(r => (r.estado === 'pendiente' || r.estado === 'vencida') && !(_boletaGrupo && r.boleta === _boletaGrupo));
  const montoAdeudos = adeudos.reduce((a,r) => a + Number(r.monto), 0);

  // Guardar adeudos para consultarlos en submitInfraccion sin otra llamada a la BD
  window._placaAdeudos = adeudos;
  sugerirAgravanteAdeudos();
  window._placaMontoAdeudos = montoAdeudos;
  revisarAlertaPlaca(placa, adeudos);

  let html = '';

  // Banner verde: vehículo en padrón
  if (veh) {
    html += `<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:.55rem .9rem;margin:.35rem 0;font-size:.77rem;color:#065F46">
      ✓ En padrón: <strong>${esc(veh.propietario)}</strong>${veh.marca?` · ${esc([veh.marca,veh.modelo].filter(Boolean).join(' '))}`:''}${veh.color?` · ${esc(veh.color)}`:''}
    </div>`;
  }

  // Banner rojo: adeudos sin pagar (más prominente)
  if (adeudos.length > 0) {
    html += `
    <div style="background:#FEF2F2;border:2px solid #DC2626;border-radius:8px;padding:.75rem 1rem;margin:.35rem 0">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.45rem;flex-wrap:wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#DC2626" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span style="font-size:.8rem;font-weight:800;color:#DC2626">
          ${adeudos.length} ADEUDO${adeudos.length>1?'S':''} SIN PAGAR — Total: ${fmt(montoAdeudos)}
        </span>
      </div>
      ${adeudos.slice(0,3).map(r=>`
        <div style="font-size:.72rem;color:#991B1B;display:flex;gap:.5rem;margin-bottom:.2rem;flex-wrap:wrap;align-items:center">
          <span style="font-family:monospace;font-weight:700">${esc(r.folio||'—')}</span>
          <span>${fmtDateShort(r.fecha)}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.tipo)}</span>
          <span style="font-weight:700">${fmt(r.monto)}</span>
          ${estadoBadge(r.estado)}
        </div>`).join('')}
      ${adeudos.length>3?`<div style="font-size:.7rem;color:#9CA3AF;margin-top:.2rem">+ ${adeudos.length-3} adeudo${adeudos.length-3>1?'s':''} más</div>`:''}
      <div style="font-size:.73rem;color:#7F1D1D;margin-top:.5rem;padding-top:.45rem;border-top:1px solid #FECACA;font-weight:600">
        📌 El infractor debe regularizar sus adeudos en <strong>Tesorería Municipal</strong> (ventanilla de infracciones, Lun–Vie 8:00–15:00 h).
      </div>
    </div>`;
  }

  // Banner ámbar: reincidente en general (infracciones anteriores pagadas u otras)
  const otrasInf = prev.filter(r => r.estado !== 'pendiente' && r.estado !== 'vencida');
  if (otrasInf.length > 0) {
    html += `
    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:.55rem .9rem;margin:.35rem 0">
      <div style="font-size:.75rem;font-weight:700;color:#92400E;margin-bottom:.35rem">
        ⚠ Reincidente — ${prev.length} ${prev.length>1?'infracciones':'infracción'} previa${prev.length>1?'s':''} en el historial
      </div>
      ${otrasInf.slice(0,2).map(r=>`
        <div style="font-size:.71rem;color:#78350F;display:flex;gap:.5rem;margin-bottom:.15rem;flex-wrap:wrap;align-items:center">
          <span style="font-family:monospace;font-weight:700">${esc(r.folio||'—')}</span>
          <span>${fmtDateShort(r.fecha)}</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.tipo)}</span>
          ${estadoBadge(r.estado)}
        </div>`).join('')}
    </div>`;
  }

  panel.innerHTML = html || '';
}

