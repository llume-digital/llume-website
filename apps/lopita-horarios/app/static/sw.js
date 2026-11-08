// Service worker de la web app: guarda la interfaz en el móvil para que abra al instante y sin conexión.
// La interfaz va bajo /i/<huella>/ (y las fuentes con ?v=<huella>), así que se puede servir desde la caché sin
// preguntar: cuando cambia, cambia la URL. La API (/api/…) nunca pasa por aquí: los datos siempre son los del servidor.
const VERSION = '__VERSION__';
const ARCHIVOS = __ARCHIVOS__;
const CACHE = `lopita-${VERSION}`;

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(caches.keys()
    .then((claves) => Promise.all(claves.filter((k) => k.startsWith('lopita-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (ev) => {
  const r = ev.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== location.origin) return;
  if (r.mode === 'navigate' && url.pathname === '/') {
    // La página siempre se pide al servidor (trae las URL de la última versión); sin conexión, la guardada.
    ev.respondWith(fetch(r).then((resp) => {
      const copia = resp.clone();
      if (resp.ok) caches.open(CACHE).then((c) => c.put('/', copia));
      return resp;
    }).catch(() => caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/i/') || url.pathname.startsWith('/static/') || url.pathname.startsWith('/fonts/')) {
    ev.respondWith(caches.match(r).then((guardada) => guardada || fetch(r).then((resp) => {
      const copia = resp.clone();
      if (resp.ok) caches.open(CACHE).then((c) => c.put(r, copia));
      return resp;
    })));
  }
});
