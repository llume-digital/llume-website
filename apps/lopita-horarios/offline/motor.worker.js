// Web Worker de la app offline: arranca Python (Pyodide) con la app y le pasa las peticiones de la página.
// Va en un worker para que la interfaz no se congele mientras el motor calcula un horario.
// Los datos viven en /datos, guardado en IndexedDB del propio móvil (IDBFS) tras cada cambio.
// Con «nube» (config.js) la base de datos además se comparte: se baja al arrancar y antes de atender una petición
// si hace rato que no se mira, y se sube tras cada cambio. La versión la lleva el servidor (ETag "v<n>"): si otro
// subió antes, la subida falla con 412 y se recargan sus datos.
// Tras cada subida, si han cambiado, se suben también los calendarios .ics de cada persona (`<nube>/cal`), que el
// Worker sirve públicamente por su enlace secreto para que Google Calendar o el iPhone se suscriban.
import { loadPyodide } from './pyodide/pyodide.mjs';

const DATOS = '/datos';
let py = null;
let servidor = null;
let cola = Promise.resolve(); // las peticiones se atienden de una en una, como un servidor de un hilo
let nube = null; // { url, clave, version, mirado, calendarios }
const DB = `${DATOS}/lopita.db`;
const MIRAR_CADA_MS = 15_000;
// Una petición al servidor de datos que no responde no puede dejar la cola parada: se corta a los 30 s.
const ESPERA_NUBE_MS = 30_000;

class ErrorNube extends Error {}

// Sin internet, el navegador falla al momento. Si hay internet pero el servidor no contesta en 30 s, lo normal en España
// es el bloqueo de LaLiga: en horario de partido algunas operadoras cortan las IP compartidas de Cloudflare, que son
// las de llumedigital.com. Con una VPN u otra conexión vuelve a funcionar.
function motivoSinNube(e) {
  const pendiente = 'Los cambios no se guardan hasta que vuelva la conexión.';
  if (self.navigator && self.navigator.onLine === false) return `Sin conexión a internet. ${pendiente}`;
  if (e && e.name === 'TimeoutError') {
    return 'El servidor de datos no responde. Si estás en España y hay partido de fútbol, puede que tu operadora esté '
      + `bloqueando la web: prueba con una VPN o con otra conexión. ${pendiente}`;
  }
  return `Sin conexión con el servidor de datos. ${pendiente}`;
}

async function pedirNube(metodo, cabeceras = {}, cuerpo = undefined) {
  let r;
  try {
    r = await fetch(nube.url, { method: metodo, cache: 'no-store', body: cuerpo, signal: AbortSignal.timeout(ESPERA_NUBE_MS),
      headers: { Authorization: `Bearer ${nube.clave}`, ...cabeceras } });
  } catch (e) {
    throw new ErrorNube(motivoSinNube(e));
  }
  if (r.status === 401) throw new ErrorNube('CLAVE');
  return r;
}

const versionDe = (r) => Number(/"v(\d+)"/.exec(r.headers.get('ETag') || '')?.[1] || 0);

// Baja la base de datos si hay una versión más nueva que la nuestra. Devuelve true si ha cambiado.
async function bajar() {
  const r = await pedirNube('GET', nube.version ? { 'If-None-Match': `"v${nube.version}"` } : {});
  nube.mirado = Date.now();
  if (r.status === 304 || r.status === 404) return false;
  if (!r.ok) throw new ErrorNube(`El servidor de datos respondió ${r.status}`);
  py.FS.writeFile(DB, new Uint8Array(await r.arrayBuffer()));
  nube.version = versionDe(r);
  // Puede venir de otro dispositivo con una versión anterior de la app: se pone al día su esquema (en local; se
  // sube con el siguiente cambio). Al arrancar aún no hay servidor: lo hace él al abrir la base.
  if (servidor) servidor.reabrir();
  await guardar();
  return true;
}

async function subir() {
  const r = await pedirNube('PUT', { 'If-Match': `"v${nube.version}"`, 'Content-Type': 'application/vnd.sqlite3' },
    py.FS.readFile(DB));
  if (r.status === 412) {
    await bajar();
    postMessage({ tipo: 'conflicto' });
    return;
  }
  if (!r.ok) throw new ErrorNube(`No se pudo guardar en el servidor (${r.status})`);
  nube.version = versionDe(r);
  nube.mirado = Date.now();
  await subirCalendarios();
}

// Los calendarios no deben impedir guardar: si fallan, se reintentan en la siguiente subida.
async function subirCalendarios() {
  try {
    const json = servidor.calendarios();
    if (json === nube.calendarios) return;
    const r = await fetch(new URL('cal', nube.base).href, { method: 'PUT', cache: 'no-store', body: json,
      signal: AbortSignal.timeout(ESPERA_NUBE_MS),
      headers: { Authorization: `Bearer ${nube.clave}`, 'Content-Type': 'application/json' } });
    if (r.ok) nube.calendarios = json;
    else console.warn('No se pudieron subir los calendarios', r.status);
  } catch (e) {
    console.warn('No se pudieron subir los calendarios', e);
  }
}

// Cuándo se escribió por última vez la base de datos (para no subirla si una petición no la ha cambiado).
function modificada() {
  try { return py.FS.stat(DB).mtime.getTime(); } catch (e) { return null; }
}

function guardar() {
  return new Promise((ok, mal) => py.FS.syncfs(false, (e) => (e ? mal(e) : ok())));
}

async function arrancar(paquetes, configNube) {
  const avisar = (texto) => postMessage({ tipo: 'progreso', texto });
  avisar('Cargando Python…');
  py = await loadPyodide({ indexURL: new URL('pyodide/', self.location.href).href });
  avisar('Cargando el motor de horarios…');
  await py.loadPackage(paquetes.map((p) => (p.endsWith('.whl') ? new URL(p, self.location.href).href : p)),
    { messageCallback: () => {}, errorCallback: (m) => console.error(m) });

  avisar('Abriendo los datos de la demo…');
  const codigo = await (await fetch('lopita.zip')).arrayBuffer();
  py.unpackArchive(codigo, 'zip', { extractDir: '/lopita' });
  py.FS.mkdirTree(DATOS);
  py.FS.mount(py.FS.filesystems.IDBFS, {}, DATOS);
  await new Promise((ok, mal) => py.FS.syncfs(true, (e) => (e ? mal(e) : ok())));

  let nueva = false;
  if (configNube) {
    const url = new URL(configNube.ruta, self.location.href).href;
    nube = { url, base: new URL('./', url).href, clave: configNube.clave, version: 0, mirado: 0, calendarios: null };
    avisar('Bajando los datos compartidos…');
    nueva = !(await bajar());
  }

  py.runPython("import sys; sys.path.insert(0, '/lopita')");
  servidor = py.pyimport('lopita_offline');
  const demo = servidor.iniciar(DATOS, 60, nube ? nube.base : undefined, nube ? nube.clave : undefined)
    .toJs({ dict_converter: Object.fromEntries });
  await guardar();
  if (nueva) await subir(); // primera vez: los datos de ejemplo pasan a ser los compartidos
  return demo;
}

async function atender({ metodo, ruta, cabeceras, cuerpo }) {
  if (nube && Date.now() - nube.mirado > MIRAR_CADA_MS) await bajar();
  const antes = modificada();
  const pyCabeceras = py.toPy(cabeceras);
  const r = await servidor.peticion(metodo, ruta, pyCabeceras, cuerpo ? new Uint8Array(cuerpo) : undefined); // undefined llega a Python como None
  pyCabeceras.destroy();
  const estado = r.get('estado');
  const pyLista = r.get('cabeceras');
  const pyCuerpo = r.get('cuerpo');
  const lista = pyLista.toJs();
  const bytes = pyCuerpo.toJs(); // Uint8Array (copia)
  pyLista.destroy(); pyCuerpo.destroy(); r.destroy();
  if (metodo !== 'GET') {
    await guardar();
    // Calcular una propuesta (solucionar alertas) es un POST que no cambia nada: no hace falta subir la base entera.
    if (nube && modificada() !== antes) await subir();
  }
  return { estado, cabeceras: lista, cuerpo: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

async function reiniciar() {
  for (const f of py.FS.readdir(DATOS)) if (f !== '.' && f !== '..') py.FS.unlink(`${DATOS}/${f}`);
  await guardar();
}

self.onmessage = (ev) => {
  const { id, tipo } = ev.data;
  const tarea = async () => {
    if (tipo === 'arrancar') return arrancar(ev.data.paquetes, ev.data.nube);
    if (tipo === 'peticion') return atender(ev.data);
    if (tipo === 'reiniciar') return reiniciar();
    throw new Error(`Mensaje desconocido: ${tipo}`);
  };
  cola = cola.then(tarea).then(
    (resultado) => {
      const transferir = resultado && resultado.cuerpo instanceof ArrayBuffer ? [resultado.cuerpo] : [];
      postMessage({ id, ok: true, resultado }, transferir);
    },
    (e) => postMessage({ id, ok: false, error: String(e && e.message ? e.message : e) }),
  );
};
