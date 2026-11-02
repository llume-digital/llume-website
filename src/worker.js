// Worker de llumedigital.com. La web es estática (public/) y la sirve Cloudflare sin pasar por aquí: este código
// solo atiende las rutas de run_worker_first en wrangler.jsonc.
//
// /lopita/horarios/nube/db: base de datos compartida de la app de horarios de Lopita (la app calcula en el
// navegador y aquí solo se guarda el fichero SQLite). Un Durable Object guarda la última versión:
//   GET  → el fichero, con ETag "v<n>" (304 si llega If-None-Match con la misma versión; 404 si aún no hay)
//   PUT  → sube una versión nueva; exige If-Match con la versión de la que parte ("v0" la primera vez).
//          Si alguien subió otra antes, 412 y la página recarga los datos.
// Acceso: cabecera «Authorization: Bearer <clave>»; solo se guarda el sha256 de la clave (LOPITA_CLAVE_SHA256).
//
// /lopita/horarios/nube/cal: calendarios .ics de cada persona del equipo (suscripción desde Google Calendar o iPhone).
//   PUT  (con la clave) → la app sube {token: contenido .ics} de todos tras cada cambio; sustituye a los anteriores.
//   GET  /lopita/horarios/nube/cal/<token>.ics → público: el token es el secreto, como la «dirección secreta» de Google.
//
// /lopita/horarios/nube/slack/<método>: relevo hacia la API de Slack (con la clave). El token del bot no puede estar en
// la app (cualquiera que la abra lo vería), así que está aquí como secreto SLACK_BOT_TOKEN y el canal en SLACK_CHANNEL.
// Solo deja pasar los métodos que usa la app. Sin token responde {ok:false, error:"sin_token"} y la app simula.
import { DurableObject } from 'cloudflare:workers';

const RUTA_DB = '/lopita/horarios/nube/db';
const RUTA_CAL = '/lopita/horarios/nube/cal';
const RUTA_SLACK = '/lopita/horarios/nube/slack/';
const MAX_CAL_BYTES = 5 * 1024 * 1024;
const TOKEN_CAL = /^[A-Za-z0-9_-]{20,64}$/;
const METODOS_SLACK = new Set(['auth.test', 'chat.postMessage', 'users.lookupByEmail']);
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
    this.sql.exec('CREATE TABLE IF NOT EXISTS calendarios (token TEXT PRIMARY KEY, ics TEXT NOT NULL)');
  }

  guardarCalendarios(calendarios) {
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM calendarios');
      for (const [token, ics] of Object.entries(calendarios)) {
        this.sql.exec('INSERT INTO calendarios (token, ics) VALUES (?, ?)', token, ics);
      }
    });
  }

  leerCalendario(token) {
    const fila = this.sql.exec('SELECT ics FROM calendarios WHERE token = ?', token).toArray()[0];
    return fila ? fila.ics : null;
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
  const almacen = almacenDe(env);
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

const almacenDe = (env) => env.LOPITA_DATOS.get(env.LOPITA_DATOS.idFromName('lopita'));

async function subirCalendarios(request, env) {
  if (!(await autorizado(request, env))) return responder('Clave incorrecta', 401);
  if (request.method !== 'PUT') return responder(null, 405, { Allow: 'PUT' });
  const texto = await request.text();
  if (texto.length > MAX_CAL_BYTES) return responder('Tamaño no válido', 413);
  let calendarios;
  try { calendarios = JSON.parse(texto); } catch { return responder('No es JSON', 400); }
  if (!calendarios || typeof calendarios !== 'object' || Array.isArray(calendarios)) return responder('Formato no válido', 400);
  for (const [token, ics] of Object.entries(calendarios)) {
    if (!TOKEN_CAL.test(token) || typeof ics !== 'string' || !ics.startsWith('BEGIN:VCALENDAR')) return responder('Formato no válido', 400);
  }
  await almacenDe(env).guardarCalendarios(calendarios);
  return responder(null, 204);
}

async function leerCalendario(request, env, nombre) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return responder(null, 405, { Allow: 'GET, HEAD' });
  const token = nombre.endsWith('.ics') ? nombre.slice(0, -4) : '';
  const ics = TOKEN_CAL.test(token) ? await almacenDe(env).leerCalendario(token) : null;
  if (!ics) return responder('Calendario no encontrado', 404, { 'Content-Type': 'text/plain; charset=utf-8' });
  return responder(request.method === 'HEAD' ? null : ics, 200, {
    'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="turnos.ics"', 'Cache-Control': 'no-cache',
  });
}

async function relevoSlack(request, env, metodo) {
  if (!(await autorizado(request, env))) return responder('Clave incorrecta', 401);
  if (!METODOS_SLACK.has(metodo)) return responder('Método no permitido', 403);
  const json = (datos) => responder(JSON.stringify(datos), 200, { 'Content-Type': 'application/json' });
  if (!env.SLACK_BOT_TOKEN) return json({ ok: false, error: 'sin_token' });
  const destino = new URL(`https://slack.com/api/${metodo}`);
  destino.search = new URL(request.url).search;
  const cabeceras = { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` };
  const tipo = request.headers.get('Content-Type');
  if (tipo) cabeceras['Content-Type'] = tipo.includes('json') ? 'application/json; charset=utf-8' : tipo;
  const cuerpo = request.method === 'GET' ? undefined : await request.arrayBuffer();
  let datos;
  try {
    const r = await fetch(destino, { method: request.method === 'GET' ? 'GET' : 'POST', headers: cabeceras, body: cuerpo });
    datos = await r.json();
  } catch (e) {
    datos = { ok: false, error: `slack_no_responde: ${e.message}` };
  }
  if (metodo === 'auth.test') datos.canal = env.SLACK_CHANNEL || null;
  return json(datos);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === RUTA_DB) return baseDeDatos(request, env);
    if (url.pathname === RUTA_CAL) return subirCalendarios(request, env);
    if (url.pathname.startsWith(`${RUTA_CAL}/`)) return leerCalendario(request, env, url.pathname.slice(RUTA_CAL.length + 1));
    if (url.pathname.startsWith(RUTA_SLACK)) return relevoSlack(request, env, url.pathname.slice(RUTA_SLACK.length));
    return env.ASSETS.fetch(request);
  },
};
