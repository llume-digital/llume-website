// Service worker de la app offline: guarda todos los archivos en el móvil al instalarla y los sirve
// desde ahí, con o sin conexión. La lista y la versión las escribe herramientas/construir_offline.py.
/* global self, caches */
const VERSION = "02b5fbcaea1a";
const ARCHIVOS = ["./", "arranque.js", "config.js", "fonts/OFL-Oswald.txt", "fonts/OFL-Raleway.txt", "fonts/fonts.css", "fonts/oswald-latin-300-normal.woff2", "fonts/oswald-latin-400-normal.woff2", "fonts/oswald-latin-500-normal.woff2", "fonts/raleway-latin-400-normal.woff2", "fonts/raleway-latin-500-normal.woff2", "fonts/raleway-latin-600-normal.woff2", "fonts/raleway-latin-700-normal.woff2", "index.html", "lopita.zip", "manifest.webmanifest", "motor.worker.js", "pyodide/annotated_doc-0.0.4-py3-none-any.whl", "pyodide/annotated_types-0.7.0-py3-none-any.whl", "pyodide/anyio-4.13.0-py3-none-any.whl", "pyodide/certifi-2026.4.22-py3-none-any.whl", "pyodide/fastapi-0.136.1-py3-none-any.whl", "pyodide/h11-0.16.0-py3-none-any.whl", "pyodide/highspy-1.13.1-cp314-cp314-pyemscripten_2026_0_wasm32.whl", "pyodide/httpcore-1.0.9-py3-none-any.whl", "pyodide/httpx-0.28.1-py3-none-any.whl", "pyodide/idna-3.11-py3-none-any.whl", "pyodide/itsdangerous-2.2.0-py3-none-any.whl", "pyodide/jinja2-3.1.6-py3-none-any.whl", "pyodide/markupsafe-3.0.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl", "pyodide/numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl", "pyodide/pydantic-2.12.5-py3-none-any.whl", "pyodide/pydantic_core-2.41.5-cp314-cp314-pyemscripten_2026_0_wasm32.whl", "pyodide/pyodide-lock.json", "pyodide/pyodide.asm.mjs", "pyodide/pyodide.asm.wasm", "pyodide/pyodide.mjs", "pyodide/python_stdlib.zip", "pyodide/sniffio-1.3.1-py3-none-any.whl", "pyodide/starlette-1.0.0-py3-none-any.whl", "pyodide/typing_extensions-4.15.0-py3-none-any.whl", "pyodide/typing_inspection-0.4.2-py3-none-any.whl", "static/app.js", "static/apple-touch-icon.png", "static/favicon.svg", "static/icono-192.png", "static/icono-512.png", "static/styles.css"];
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
