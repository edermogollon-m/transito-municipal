// Imagen institucional (institucional.sql): escudo, logo, nombre y color del
// Ayuntamiento. La usan el panel, el login y las páginas públicas. Se guarda
// en este dispositivo para pintarla sin esperar a la base de datos.
const MARCA_IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
function marcaImagen(v) { return MARCA_IMG.test(v || '') ? v : ''; }
function marcaColor(v) { return /^#[0-9a-f]{6}$/i.test(v || '') ? v : ''; }
// Mezcla dos colores hex (f = 0 → a, f = 1 → b)
function mezclarColor(a, b, f) {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const x = p(a), y = p(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * f).toString(16).padStart(2, '0')).join('');
}
function rgbColor(h) { return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(','); }

function marcaGuardada() { try { return JSON.parse(localStorage.getItem('tm_marca') || 'null'); } catch (_) { return null; } }
function guardarMarca(info) {
  const m = { escudo: marcaImagen(info?.escudo), logo: marcaImagen(info?.logo), color: marcaColor(info?.color), institucion: String(info?.institucion || '') };
  try { localStorage.setItem('tm_marca', JSON.stringify(m)); } catch (_) {}
  return m;
}

// Pinta la marca en la página: [data-escudo] recibe el escudo, [data-institucion]
// el nombre, y con color:true los colores de acento (--ac…) toman el del Ayuntamiento.
function aplicarMarca(info, { color = true } = {}) {
  if (!info) return;
  const escudo = marcaImagen(info.escudo), c = marcaColor(info.color);
  if (escudo) document.querySelectorAll('[data-escudo]').forEach(el => {
    const img = document.createElement('img');
    img.src = escudo; img.alt = 'Escudo'; img.style.cssText = 'width:100%;height:100%;object-fit:contain';
    el.replaceChildren(img);
    el.style.background = 'transparent'; el.style.border = 'none';
  });
  if (info.institucion) document.querySelectorAll('[data-institucion]').forEach(el => { el.textContent = info.institucion; });
  if (c && color) {
    const s = document.documentElement.style;
    s.setProperty('--ac', c);
    s.setProperty('--ac-lt', mezclarColor(c, '#ffffff', .15));
    s.setProperty('--ac-dk', mezclarColor(c, '#000000', .25));
    s.setProperty('--ac-gl', `rgba(${rgbColor(c)},.12)`);
    s.setProperty('--ac-bg', mezclarColor(c, '#ffffff', .9));
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = c;
  }
}
