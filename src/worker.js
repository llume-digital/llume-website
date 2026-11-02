// Worker de llumedigital.com. La web es estática (public/) y la sirve Cloudflare sin pasar por aquí: este código
// solo atiende las rutas de run_worker_first en wrangler.jsonc.
//
// /lopita/horarios/nube/db: base de datos compartida de la app de horarios de Lopita (la app calcula en el
// navegador y aquí solo se guarda el fichero SQLite). Un Durable Object guarda la última versión:
//   GET  → el fichero, con ETag "v<n>" (304 si llega If-None-Match con la misma versión; 404 si aún no hay)
//   PUT  → sube una versión nueva; exige If-Match con la versión de la que parte ("v0" la primera vez).
//          Si alguien subió otra antes, 412 y la página recarga los datos.
// Acceso: cabecera «Authorization: Bearer <clave>»; solo se guarda el sha256 de la clave (LOPITA_CLAVE_SHA256).
import { DurableObject } from 'cloudflare:workers';

const RUTA_DB = '/lopita/horarios/nube/db';
const MAX_BYTES = 20 * 1024 * 1024;
const TROZO = 1024 * 1024; // las filas de SQLite en un Durable Object admiten hasta 2 MB

const cabecerasBase = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const responder = (cuerpo, estado, extra = {}) => new Response(cuerpo, { status: estado, headers: { ...cabecerasBase, ...extra } });

async function sha256(texto) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function autorizado(request, env) {
  const m = /^Bearer (\S+)$/.exec(request.headers.get('Authorization') || '');
  if (!m || !env.LOPITA_CLAVE_SHA256) return false;
  return iguales(await sha256(m[1]), env.LOPITA_CLAVE_SHA256);
}

export class LopitaDatos extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK (id = 1), version INTEGER NOT NULL, bytes INTEGER NOT NULL, actualizado TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS trozos (i INTEGER PRIMARY KEY, datos BLOB NOT NULL)');
  }

  version() {
    const fila = this.sql.exec('SELECT version FROM meta WHERE id = 1').toArray()[0];
    return fila ? fila.version : 0;
  }

  leer(siNoCoincide) {
    const v = this.version();
    if (v === 0) return { estado: 404 };
    if (siNoCoincide === `"v${v}"`) return { estado: 304, version: v };
    const trozos = this.sql.exec('SELECT datos FROM trozos ORDER BY i').toArray().map((f) => new Uint8Array(f.datos));
    const total = trozos.reduce((n, t) => n + t.length, 0);
    const datos = new Uint8Array(total);
    let pos = 0;
    for (const t of trozos) { datos.set(t, pos); pos += t.length; }
    return { estado: 200, version: v, datos };
  }

  escribir(siCoincide, datos) {
    const v = this.version();
    if (siCoincide !== `"v${v}"`) return { estado: 412, version: v };
    const nueva = v + 1;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM trozos');
      for (let i = 0; i * TROZO < datos.length; i++) {
        this.sql.exec('INSERT INTO trozos (i, datos) VALUES (?, ?)', i, datos.subarray(i * TROZO, (i + 1) * TROZO));
      }
      this.sql.exec("INSERT OR REPLACE INTO meta (id, version, bytes, actualizado) VALUES (1, ?, ?, datetime('now'))", nueva, datos.length);
    });
    return { estado: 200, version: nueva };
  }
}

async function baseDeDatos(request, env) {
  if (!(await autorizado(request, env))) return responder('Clave incorrecta', 401);
  const almacen = env.LOPITA_DATOS.get(env.LOPITA_DATOS.idFromName('lopita'));
  if (request.method === 'GET') {
    const r = await almacen.leer(request.headers.get('If-None-Match'));
    if (r.estado === 404) return responder(null, 404);
    if (r.estado === 304) return responder(null, 304, { ETag: `"v${r.version}"` });
    return responder(r.datos, 200, { ETag: `"v${r.version}"`, 'Content-Type': 'application/vnd.sqlite3' });
  }
  if (request.method === 'PUT') {
    const siCoincide = request.headers.get('If-Match');
    if (!siCoincide) return responder('Falta If-Match', 428);
    const datos = new Uint8Array(await request.arrayBuffer());
    if (datos.length === 0 || datos.length > MAX_BYTES) return responder('Tamaño no válido', 413);
    if (new TextDecoder().decode(datos.subarray(0, 15)) !== 'SQLite format 3') return responder('No es una base de datos SQLite', 415);
    const r = await almacen.escribir(siCoincide, datos);
    return responder(null, r.estado === 200 ? 204 : 412, { ETag: `"v${r.version}"` });
  }
  return responder(null, 405, { Allow: 'GET, PUT' });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === RUTA_DB) return baseDeDatos(request, env);
    return env.ASSETS.fetch(request);
  },
};
