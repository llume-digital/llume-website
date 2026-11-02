// Web Worker de la app offline: arranca Python (Pyodide) con la app y le pasa las peticiones de la página.
// Va en un worker para que la interfaz no se congele mientras el motor calcula un horario.
// Los datos viven en /datos, guardado en IndexedDB del propio móvil (IDBFS) tras cada cambio.
import { loadPyodide } from './pyodide/pyodide.mjs';

const DATOS = '/datos';
let py = null;
let servidor = null;
let cola = Promise.resolve(); // las peticiones se atienden de una en una, como un servidor de un hilo

function guardar() {
  return new Promise((ok, mal) => py.FS.syncfs(false, (e) => (e ? mal(e) : ok())));
}

async function arrancar(paquetes) {
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

  py.runPython("import sys; sys.path.insert(0, '/lopita')");
  servidor = py.pyimport('lopita_offline');
  const demo = servidor.iniciar(DATOS).toJs({ dict_converter: Object.fromEntries });
  await guardar();
  return demo;
}

async function atender({ metodo, ruta, cabeceras, cuerpo }) {
  const pyCabeceras = py.toPy(cabeceras);
  const r = await servidor.peticion(metodo, ruta, pyCabeceras, cuerpo ? new Uint8Array(cuerpo) : undefined); // undefined llega a Python como None
  pyCabeceras.destroy();
  const estado = r.get('estado');
  const pyLista = r.get('cabeceras');
  const pyCuerpo = r.get('cuerpo');
  const lista = pyLista.toJs();
  const bytes = pyCuerpo.toJs(); // Uint8Array (copia)
  pyLista.destroy(); pyCuerpo.destroy(); r.destroy();
  if (metodo !== 'GET') await guardar();
  return { estado, cabeceras: lista, cuerpo: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}

async function reiniciar() {
  for (const f of py.FS.readdir(DATOS)) if (f !== '.' && f !== '..') py.FS.unlink(`${DATOS}/${f}`);
  await guardar();
}

self.onmessage = (ev) => {
  const { id, tipo } = ev.data;
  const tarea = async () => {
    if (tipo === 'arrancar') return arrancar(ev.data.paquetes);
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
