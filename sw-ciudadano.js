// Service worker del portal ciudadano (/consulta instalado como app).
// Recibe los avisos al celular que manda la función "push" (ciudadano.sql)
// y deja abrir la consulta sin internet con la última versión guardada.
const CACHE = 'consulta-v1';
const BASICOS = ['/consulta', '/ciudadano.js', '/marca.js', '/config.js', '/supabase.js', '/manifest-ciudadano.json', '/icono-ciudadano-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASICOS)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('consulta-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero la red; sin señal, lo guardado (solo la página y sus archivos)
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || !BASICOS.includes(url.pathname)) return;
  e.respondWith(fetch(e.request).then(res => {
    const copia = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copia)).catch(() => {});
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { cuerpo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Tránsito Municipal', {
    body: d.cuerpo || '', tag: d.tag || undefined, data: { url: d.url || '/consulta' },
    icon: '/icono-ciudadano-192.png', badge: '/icono-ciudadano-192.png', lang: 'es'
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const destino = new URL(e.notification.data?.url || '/consulta', location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ventanas => {
    const abierta = ventanas.find(v => v.url.startsWith(location.origin + '/consulta'));
    if (abierta) return abierta.navigate(destino).then(v => (v || abierta).focus());
    return self.clients.openWindow(destino);
  }));
});
