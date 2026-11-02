// Arranque de la app offline: prepara Python en un worker y hace que la interfaz normal (static/app.js)
// hable con él en lugar de con un servidor. La interfaz no cambia: sus fetch('/api/…'), los enlaces de
// descarga (CSV) y las ventanas de impresión se desvían aquí al worker.
const PAQUETES = window.LOPITA_OFFLINE.paquetes;
const RUTAS_APP = /^\/(api|ver)\//;
const ORIGEN_INTERNO = 'http://lopita.offline'; // el de las URL que genera la app (enlaces públicos)

const $estado = document.getElementById('cargando-texto');
const fetchOriginal = window.fetch.bind(window);
const worker = new Worker('motor.worker.js', { type: 'module' });
let siguiente = 0;
const pendientes = new Map();

worker.onmessage = (ev) => {
  const m = ev.data;
  if (m.tipo === 'progreso') { if ($estado) $estado.textContent = m.texto; return; }
  if (m.tipo === 'conflicto') {
    alert('Otra persona ha guardado cambios a la vez que tú. Se cargan sus datos: repite tu último cambio.');
    location.reload();
    return;
  }
  const p = pendientes.get(m.id);
  if (!p) return;
  pendientes.delete(m.id);
  if (m.ok) p.ok(m.resultado); else p.mal(new Error(m.error));
};

function pedir(tipo, datos = {}, transferir = []) {
  const id = ++siguiente;
  return new Promise((ok, mal) => {
    pendientes.set(id, { ok, mal });
    worker.postMessage({ id, tipo, ...datos }, transferir);
  });
}

// Devuelve la ruta (con consulta) si la URL es de la app; si no, null.
function rutaDeLaApp(url) {
  const u = new URL(url, location.href);
  if (u.origin === ORIGEN_INTERNO) return u.pathname + u.search;
  if (u.origin === location.origin && RUTAS_APP.test(u.pathname)) return u.pathname + u.search;
  return null;
}

async function peticionLocal(ruta, init = {}) {
  const cabeceras = {};
  new Headers(init.headers || {}).forEach((v, k) => { cabeceras[k] = v; });
  let cuerpo = null;
  if (init.body != null) cuerpo = await new Response(init.body).arrayBuffer();
  const r = await pedir('peticion', { metodo: (init.method || 'GET').toUpperCase(), ruta, cabeceras, cuerpo },
    cuerpo ? [cuerpo] : []);
  return new Response(r.estado === 204 || r.estado === 304 ? null : r.cuerpo, { status: r.estado, headers: r.cabeceras });
}

window.fetch = (recurso, init) => {
  const url = recurso instanceof Request ? recurso.url : String(recurso);
  const ruta = rutaDeLaApp(url);
  if (ruta === null) return fetchOriginal(recurso, init);
  return peticionLocal(ruta, recurso instanceof Request ? { method: recurso.method, headers: recurso.headers, body: init && init.body } : init);
};

function nombreDeDescarga(r, ruta) {
  const m = /filename="?([^";]+)"?/.exec(r.headers.get('content-disposition') || '');
  return m ? m[1] : ruta.split('?')[0].split('/').pop();
}

async function abrirDeLaApp(ruta, ventana) {
  const r = await peticionLocal(ruta);
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  if ((r.headers.get('content-type') || '').includes('text/html')) {
    if (ventana) ventana.location.href = url; else location.href = url;
  } else {
    const a = document.createElement('a');
    a.href = url; a.download = nombreDeDescarga(r, ruta);
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Enlaces a la API (CSV, informes, vista pública): se piden al worker y se descargan o se abren.
document.addEventListener('click', (ev) => {
  const a = ev.target.closest && ev.target.closest('a[href]');
  if (!a || ev.defaultPrevented) return;
  const ruta = rutaDeLaApp(a.href);
  if (ruta === null) return;
  ev.preventDefault();
  const nueva = a.target === '_blank' ? window.open('', '_blank') : null;
  abrirDeLaApp(ruta, nueva).catch((e) => { if (nueva) nueva.close(); alert(e.message); });
}, true);

const abrirOriginal = window.open.bind(window);
window.open = (url, ...resto) => {
  const ruta = url ? rutaDeLaApp(url) : null;
  if (ruta === null) return abrirOriginal(url, ...resto);
  const ventana = abrirOriginal('', ...resto);
  abrirDeLaApp(ruta, ventana).catch((e) => { if (ventana) ventana.close(); alert(e.message); });
  return ventana;
};

async function reiniciarDemo() {
  if (!window.confirm('Se borran todos los cambios hechos en este móvil y se vuelve a los datos de ejemplo. ¿Seguir?')) return;
  await pedir('reiniciar');
  location.reload();
}

// Datos compartidos (config.js → nube): la clave llega una vez en el enlace (#clave=…) y se recuerda en este
// navegador. Sin ella, se pide.
const CLAVE = 'lopita-clave-nube';
function claveNube() {
  const enEnlace = /(?:^#|&)clave=([^&]+)/.exec(location.hash);
  if (enEnlace) {
    try { localStorage.setItem(CLAVE, decodeURIComponent(enEnlace[1])); } catch (e) { /* sin almacenamiento */ }
    history.replaceState(null, '', location.pathname + location.search);
    return decodeURIComponent(enEnlace[1]);
  }
  try { if (localStorage.getItem(CLAVE)) return localStorage.getItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
  return (window.prompt('Clave de acceso a los horarios de Lopita:') || '').trim();
}

function olvidarClave() {
  try { localStorage.removeItem(CLAVE); } catch (e) { /* sin almacenamiento */ }
}

async function iniciar() {
  // Dentro del .apk (Capacitor) los archivos ya van en la app: el service worker sobra y sus fetch no los
  // serviría el contenedor nativo, así que solo se registra en la versión web.
  const nativa = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if ('serviceWorker' in navigator && !nativa) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Sin modo offline:', e));
  }
  try {
    const rutaNube = window.LOPITA_OFFLINE.nube;
    const nube = rutaNube ? { ruta: rutaNube, clave: claveNube() } : null;
    const demo = await pedir('arrancar', { paquetes: PAQUETES, nube });
    window.LOPITA_OFFLINE.demo = demo;
    if (nube) {
      document.querySelector('#demo summary').textContent = 'Datos compartidos';
      document.getElementById('demo-texto').textContent = 'Los datos se guardan en el servidor de llume y los ve todo el que tenga la clave. El horario se calcula en este dispositivo. Slack no envía nada todavía.';
      document.getElementById('demo-acceso').textContent = `Primera entrada: usuario «${demo.usuario}», contraseña «${demo.clave}» (cámbiala desde la app).`;
      document.getElementById('demo-reiniciar').remove();
    } else {
      document.getElementById('demo-acceso').textContent = `Usuario «${demo.usuario}», contraseña «${demo.clave}»`;
      document.getElementById('demo-reiniciar').addEventListener('click', reiniciarDemo);
    }
    document.getElementById('demo').hidden = false;
    await import('./static/app.js');
  } catch (e) {
    console.error(e);
    if (e.message === 'CLAVE') {
      olvidarClave();
      if ($estado) $estado.textContent = 'Clave incorrecta. Recarga la página para volver a escribirla.';
      return;
    }
    if ($estado) $estado.textContent = `No se pudo arrancar la app: ${e.message}`;
  }
}

iniciar();
