// Service worker de la app offline: guarda todos los archivos en el móvil al instalarla y los sirve
// desde ahí, con o sin conexión. La lista y la versión las escribe herramientas/construir_offline.py.
/* global self, caches */
const VERSION = '__VERSION__';
const ARCHIVOS = __ARCHIVOS__;
const CACHE = `lopita-offline-${VERSION}`;

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k.startsWith('lopita-offline-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  if (ev.request.method !== 'GET') return;
  const url = new URL(ev.request.url);
  if (url.origin !== self.location.origin) return;
  const pagina = ev.request.mode === 'navigate';
  ev.respondWith(caches.open(CACHE).then(async (c) => {
    const guardado = await c.match(pagina ? './' : ev.request, { ignoreSearch: pagina });
    return guardado || fetch(ev.request);
  }));
});
