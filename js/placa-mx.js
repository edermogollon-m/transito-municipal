// ══════════════════════════════════════════════════════════
// FORMATO DE PLACA MEXICANA
// Acomoda lo que se escribe (con o sin guiones, en minúsculas, con espacios)
// al formato de placa que le corresponde según su tipo de vehículo, con las
// series de la NOM-001-SCT-2-2016 y las anteriores que siguen circulando.
// Si no coincide con ninguna se deja en mayúsculas (placas extranjeras).
// La misma copia está en sitio-web/placa-mx.js (npm run check las compara).
// ══════════════════════════════════════════════════════════
'use strict';

// [forma (L letra, D número), cómo se agrupa, tipo de vehículo, ejemplo]
const PLACAS_MX = [
  ['LLLDDDL', [3, 3, 1], 'Automóvil particular', 'ABC-123-D'],
  ['LLLDDDD', [3, 2, 2], 'Automóvil particular (serie anterior)', 'ABC-12-34'],
  ['LLLDDD',  [3, 3],    'Automóvil (serie anterior)', 'ABC-123'],
  ['LDDLLL',  [3, 3],    'Automóvil particular (Ciudad de México)', 'A12-ABC'],
  ['DDDLLL',  [3, 3],    'Automóvil particular (Ciudad de México, anterior)', '123-ABC'],
  ['LDDDLLL', [1, 3, 3], 'Taxi o servicio público', 'A-123-ABC'],
  ['DDDDLLL', [2, 2, 3], 'Taxi o servicio público (serie anterior)', '12-34-ABC'],
  ['LLDDDDL', [2, 4, 1], 'Camión de carga particular', 'AB-1234-C'],
  ['LLDDDDD', [2, 2, 3], 'Camión de carga particular (serie anterior)', 'AB-12-345'],
  ['LDDDLL',  [1, 3, 2], 'Camión de carga (Ciudad de México)', 'C-123-AB'],
  ['DDDDLL',  [2, 2, 2], 'Camión de carga (Ciudad de México, anterior)', '12-34-AB'],
  ['DLLLDDD', [1, 3, 3], 'Camión de servicio público', '1-ABC-234'],
  ['DLLLDDL', [1, 3, 3], 'Camión de servicio público', '1-ABC-23D'],
  ['DDLLLDD', [2, 3, 2], 'Autobús particular', '12-ABC-34'],
  ['DLLLDD',  [1, 3, 2], 'Autobús particular', '1-ABC-23'],
  ['DDLLD',   [2, 2, 1], 'Autobús particular (Ciudad de México)', '12-AB-3'],
  ['LDDDDDL', [1, 5, 1], 'Autobús de servicio público', 'B-12345-A'],
  ['DDDDDDL', [3, 3, 1], 'Autobús de servicio público', '123-456-A'],
  ['LDDDL',   [5],       'Motocicleta', 'A123B'],
  ['LLLDD',   [5],       'Motocicleta', 'ABC12'],
  ['DDDDL',   [4, 1],    'Motocicleta (Ciudad de México)', '1234-A'],
  ['DLLDDDL', [3, 3, 1], 'Remolque', '1AB-234-C'],
  ['DLLDDDD', [1, 2, 4], 'Remolque', '1-AB-2345'],
  ['DDDDDLL', [5, 2],    'Remolque de servicio público', '12345-AB'],
  ['LDDDDDD', [1, 3, 3], 'Remolque de servicio público', 'A-123-456'],
  ['DLLDDL',  [1, 2, 3], 'Demostración (agencia)', '1-AB-23C'],
  ['DLLDDD',  [1, 2, 3], 'Demostración (agencia)', '1-AB-234'],
  ['DDDLL',   [3, 2],    'Persona con discapacidad', '123-AB'],
  ['LDDLLLD', [3, 3, 1], 'Fronteriza', 'D12-ABC-3'],
  ['DDDLLLD', [3, 3, 1], 'Fronteriza', '123-ABC-4'],
  ['LLDD',    [2, 2],    'Auto antiguo', 'AB-12'],
  ['DLLDD',   [3, 2],    'Auto antiguo', '1AB-12'],
  ['DDDDD',   [2, 3],    'Servicio público federal', '01-234'],
];

const planoPlaca = t => String(t ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const formaPlaca = t => t.replace(/[A-Z]/g, 'L').replace(/\d/g, 'D');
const datosPlaca = t => { const p = planoPlaca(t); return PLACAS_MX.find(f => f[0] === formaPlaca(p)) || null; };

// "abc123d", "ABC 123 D", "abc-12-3d" → "ABC-123-D"
function formatoPlaca(texto) {
  const plano = planoPlaca(texto), f = datosPlaca(plano);
  if (!f) return String(texto ?? '').toUpperCase().trim().replace(/[^A-Z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  let k = 0;
  return f[1].map(n => plano.slice(k, (k += n))).join('-');
}
// Tipo de vehículo que indica el formato ('' si no se reconoce)
function tipoPlaca(texto) { return datosPlaca(texto)?.[2] || ''; }
// Cómo puede estar guardada la misma placa (registros anteriores sin formato)
function variantesPlaca(texto) {
  const plano = planoPlaca(texto), v = [formatoPlaca(texto), plano, String(texto ?? '').trim().toUpperCase()];
  if (formaPlaca(plano) === 'LLLDDDD') v.push(plano.slice(0, 3) + '-' + plano.slice(3));
  return [...new Set(v.filter(Boolean))];
}

// Casillas con data-placa: mayúsculas al escribir y formato al salir.
// data-placa="tipo" además muestra debajo el tipo de vehículo.
function aplicarFormatoPlaca(el) {
  if (!el.value.trim()) { el.setCustomValidity?.(''); return pintarTipoPlaca(el, ''); }
  const nuevo = formatoPlaca(el.value);
  if (nuevo !== el.value) { el.value = nuevo; el.dispatchEvent(new Event('input', { bubbles: true })); }
  pintarTipoPlaca(el, tipoPlaca(nuevo));
}
function pintarTipoPlaca(el, tipo) {
  if (el.dataset.placa !== 'tipo') return;
  // Justo debajo de la casilla (o de su fila, si comparte renglón con un botón)
  const ancla = el.parentElement.matches('.form-field, label') ? el : el.parentElement;
  let n = ancla.nextElementSibling;
  if (!n?.classList.contains('placa-tipo')) { n = document.createElement('div'); n.className = 'placa-tipo'; n.setAttribute('aria-live', 'polite'); ancla.after(n); }
  const valor = el.value.trim();
  n.style.cssText = `font-size:.72rem;margin-top:.25rem;min-height:.9rem;color:${tipo || !valor ? 'var(--muted,#6B7280)' : '#B45309'}`;
  n.textContent = !valor ? '' : tipo ? tipo : 'Formato no reconocido: revisa que la placa esté bien escrita';
}
document.addEventListener('input', e => {
  const el = e.target;
  if (!el.matches?.('input[data-placa]')) return;
  const limpio = el.value.toUpperCase().replace(/[^A-Z0-9 -]/g, '');
  if (limpio !== el.value) {
    const pos = el.selectionStart;
    el.value = limpio;
    try { el.setSelectionRange(pos, pos); } catch (_) {}
  }
});
document.addEventListener('focusout', e => { if (e.target.matches?.('input[data-placa]')) aplicarFormatoPlaca(e.target); });
document.addEventListener('change', e => { if (e.target.matches?.('input[data-placa]')) aplicarFormatoPlaca(e.target); });
