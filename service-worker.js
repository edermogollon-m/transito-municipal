const CACHE = 'transito-v17';
const PRECACHE = [
  '/',
  '/login',
  '/consulta',
  '/verificar',
  '/js/nucleo.js',
  '/js/panel.js',
  '/js/infracciones.js',
  '/js/permisos.js',
  '/js/detalle.js',
  '/js/configuracion.js',
  '/js/impresion.js',
  '/js/placa.js',
  '/js/caja.js',
  '/js/qr-scanner.js',
  '/js/usuarios.js',
  '/js/ticket.js',
  '/js/reportes.js',
  '/js/recursos.js',
  '/js/utilidades.js',
  '/js/sesion.js',
  '/js/padron.js',
  '/js/grua.js',
  '/js/mapa.js',
  '/js/analisis.js',
  '/js/accidentes.js',
  '/js/turnos.js',
  '/js/extras.js',
  '/js/institucional.js',
  '/js/alertas.js',
  '/js/recibo.js',
  '/js/inicio.js',
  '/marca.js',
  '/js/arranque.js',
  '/config.js',
  '/supabase.js',
  '/manifest.json'
];

// Página que se muestra si se abre la app sin internet.
const OFFLINE_URL = '/offline';

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([...PRECACHE, OFFLINE_URL])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Librerías y tipografías de CDN: se guardan para que la app abra sin internet
// (el oficial puede levantar boletas sin señal y se suben después).
const CDN = ['cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Estrategia "primero la red": con conexión siempre se usa la versión recién
// publicada (antes se servía la copia en caché y un deploy nuevo podía mezclar
// HTML nuevo con módulos viejos). La caché solo se usa sin conexión. Nunca se
// interceptan llamadas a Supabase: los datos son siempre en vivo.
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET') return;
  if (url.origin !== location.origin && !CDN.includes(url.hostname)) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(r => r || caches.match(OFFLINE_URL))));
    return;
  }

  e.respondWith(
    fetch(req)
      .then(res => {
        // Una respuesta redirigida no se puede reutilizar desde caché (Safari la rechaza).
        // Los scripts de CDN llegan "opacos" (status 0) y también se guardan
        if (res && (res.ok || res.type === 'opaque') && !res.redirected) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || Response.error()))
  );
});
