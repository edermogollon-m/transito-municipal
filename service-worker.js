const CACHE = 'transito-v4';
const PRECACHE = [
  '/',
  '/login',
  '/consulta',
  '/verificar',
  '/app.js',
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

// Estrategia "primero la red": con conexión siempre se usa la versión recién
// publicada (antes se servía la copia en caché y un deploy nuevo podía mezclar
// HTML nuevo con app.js viejo). La caché solo se usa sin conexión. Nunca se
// interceptan llamadas a Supabase ni a otros dominios: los datos son siempre en vivo.
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(r => r || caches.match(OFFLINE_URL))));
    return;
  }

  e.respondWith(
    fetch(req)
      .then(res => {
        // Una respuesta redirigida no se puede reutilizar desde caché (Safari la rechaza).
        if (res && res.ok && !res.redirected) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || Response.error()))
  );
});
