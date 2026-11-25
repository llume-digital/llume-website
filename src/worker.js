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
//
// /naranco/*: demo privada de la web de Nar&Co. Todo pasa por aquí y solo se sirve con la clave:
//   · POST /naranco/acceso con el campo «clave» (formulario de la pantalla de acceso), o
//   · un enlace con ?clave=… en cualquier ruta de /naranco/ (se quita de la dirección al entrar).
// Con la clave buena se guarda una cookie HttpOnly limitada a /naranco durante 30 días; /naranco/salir la borra.
// Solo se guarda el sha256 de la clave (NARANCO_CLAVE_SHA256); la cookie lleva la clave y se comprueba igual.
//
// /bioasturias/*: prototipo privado del panel de BioAsturias, con la misma lógica que /naranco (cookie `bioasturias_clave`,
// variable BIOASTURIAS_CLAVE_SHA256, comentarios en la instancia «bioasturias-comentarios»). Ver DEMOS más abajo.
//
// /naranco/api/comentarios: comentarios que Mateo deja sobre la demo (botón «Comentar» de la web y pestaña del panel).
// Solo con la cookie de la demo. Se guardan en otra instancia del mismo Durable Object («naranco-comentarios»),
// separada de los datos de Lopita:
//   GET   → {comentarios: [...]} del más nuevo al más antiguo
//   POST  {texto, donde, prioridad, autor, url} → crea uno (estado «nuevo»)
//   PATCH ?id=<n> {estado?, respuesta?} → cambia el estado o deja una respuesta
// Las vistas previas no tienen el Durable Object: responde 503 y la página guarda en el navegador.
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

  // ---- comentarios de la demo de Nar&Co (solo en la instancia «naranco-comentarios») ----
  tablaComentarios() {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS comentarios (id INTEGER PRIMARY KEY AUTOINCREMENT, creado TEXT NOT NULL,
      actualizado TEXT NOT NULL, autor TEXT NOT NULL, donde TEXT NOT NULL, prioridad TEXT NOT NULL, texto TEXT NOT NULL,
      url TEXT NOT NULL, estado TEXT NOT NULL, respuesta TEXT NOT NULL)`);
  }

  listarComentarios() {
    this.tablaComentarios();
    return this.sql.exec('SELECT * FROM comentarios ORDER BY id DESC LIMIT 500').toArray();
  }

  crearComentario(c) {
    this.tablaComentarios();
    const n = this.sql.exec('SELECT COUNT(*) AS n FROM comentarios').toArray()[0].n;
    if (n >= 2000) return null;
    const ahora = new Date().toISOString();
    return this.sql.exec(`INSERT INTO comentarios (creado, actualizado, autor, donde, prioridad, texto, url, estado, respuesta)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'nuevo', '') RETURNING *`, ahora, ahora, c.autor, c.donde, c.prioridad, c.texto, c.url).toArray()[0];
  }

  cambiarComentario(id, cambios) {
    this.tablaComentarios();
    const fila = this.sql.exec('SELECT * FROM comentarios WHERE id = ?', id).toArray()[0];
    if (!fila) return null;
    return this.sql.exec('UPDATE comentarios SET estado = ?, respuesta = ?, actualizado = ? WHERE id = ? RETURNING *',
      cambios.estado ?? fila.estado, cambios.respuesta ?? fila.respuesta, new Date().toISOString(), id).toArray()[0];
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

// ── Demos privadas con clave (Nar&Co y BioAsturias) ────────────────────────────────────────────────────────────────
// Cada demo se describe con un objeto de configuración (ruta, cookie, variable con el sha256 de la clave, pantalla de
// acceso e instancia del Durable Object para los comentarios); la lógica es la misma para todas.
const DIAS_COOKIE = 30;

const DEMOS = {
  naranco: {
    base: '/naranco',
    cookie: 'naranco_clave',
    claveVar: 'NARANCO_CLAVE_SHA256',
    comentarios: 'naranco-comentarios',
    pantalla: {
      titulo: 'Nar&amp;Co · Acceso a la demo',
      estilo: `:root{--bg:#f2f2f2;--ink:#212121;--muted:#6b6b6b;--verde:#00b485;--line:#d6d6d6}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font-family:"Space Grotesk",system-ui,-apple-system,"Segoe UI",sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.caja{width:100%;max-width:380px;background:#fff;border:1px solid var(--line);padding:32px 24px}
.logo{font-weight:700;font-size:28px;letter-spacing:.04em;margin:0 0 4px}.logo span{color:var(--verde)}
p{color:var(--muted);margin:0 0 24px;line-height:1.5;font-size:15px}
label{display:block;font-size:13px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}
input{width:100%;font:inherit;font-size:16px;padding:12px;border:1px solid var(--ink);background:#fff;color:var(--ink);border-radius:0}
input:focus{outline:2px solid var(--verde);outline-offset:1px}
button{margin-top:16px;width:100%;font:inherit;font-weight:600;font-size:16px;padding:14px;border:0;border-radius:0;background:var(--ink);color:#fff;cursor:pointer}
button:hover{background:#00372a}.error{color:#b3261e;font-size:14px;margin:12px 0 0}`,
      logo: 'NAR<span>&amp;</span>CO',
      texto: 'Demo privada de la nueva web. Introduce la clave para entrar.<br><span lang="en">Private demo: enter the access key.</span>',
      etiqueta: 'Clave · Key',
    },
  },
  bioasturias: {
    base: '/bioasturias',
    cookie: 'bioasturias_clave',
    claveVar: 'BIOASTURIAS_CLAVE_SHA256',
    comentarios: 'bioasturias-comentarios',
    pantalla: {
      titulo: 'BioAsturias · Acceso al prototipo',
      estilo: `:root{--bg:#f5f5f7;--ink:#1d1d1f;--muted:#6e6e73;--acento:#2a72b8;--relleno:rgba(118,118,128,.1)}
*{box-sizing:border-box}html,body{margin:0;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased;letter-spacing:-.006em}
body{background:radial-gradient(900px 520px at 85% -10%,rgba(42,114,184,.12),transparent 62%),radial-gradient(760px 520px at 10% 110%,rgba(10,102,216,.07),transparent 62%),var(--bg)}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.caja{width:100%;max-width:380px;background:rgba(255,255,255,.82);backdrop-filter:saturate(180%) blur(30px);-webkit-backdrop-filter:saturate(180%) blur(30px);border:1px solid rgba(255,255,255,.8);border-radius:24px;padding:36px 28px 30px;box-shadow:0 1px 2px rgba(0,0,0,.04),0 24px 60px rgba(0,0,0,.08)}
.logo{margin:0 0 14px;font-size:13px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--muted)}.logo img{display:block;width:184px;height:auto;margin:0 0 18px -6px}
p{color:var(--muted);margin:0 0 24px;line-height:1.5;font-size:14px}
label{display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin-bottom:6px}
input{width:100%;font:inherit;font-size:16px;padding:12px 14px;border:1px solid transparent;background:var(--relleno);color:var(--ink);border-radius:12px;transition:.15s}
input:focus{outline:none;background:#fff;border-color:rgba(42,114,184,.5);box-shadow:0 0 0 4px rgba(42,114,184,.14)}
button{margin-top:16px;width:100%;font:inherit;font-weight:600;font-size:15px;padding:13px;border:0;border-radius:999px;background:var(--acento);color:#fff;cursor:pointer;box-shadow:0 6px 18px rgba(42,114,184,.26);transition:.15s}
button:hover{background:#1d5a96}button:focus-visible{outline:3px solid rgba(42,114,184,.45);outline-offset:2px}.error{color:#e0362c;font-size:13.5px;margin:12px 0 0}`,
      logo: '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOYAAABQCAYAAAAN+QnTAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAAyJpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMy1jMDExIDY2LjE0NTY2MSwgMjAxMi8wMi8wNi0xNDo1NjoyNyAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIiB4bWxuczp4bXBNTT0iaHR0cDovL25zLmFkb2JlLmNvbS94YXAvMS4wL21tLyIgeG1sbnM6c3RSZWY9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9zVHlwZS9SZXNvdXJjZVJlZiMiIHhtcDpDcmVhdG9yVG9vbD0iQWRvYmUgUGhvdG9zaG9wIENTNiAoV2luZG93cykiIHhtcE1NOkluc3RhbmNlSUQ9InhtcC5paWQ6NzAyNDY5NTg0QkFCMTFFREI0RjRFQjE1QjUxMDJBRDYiIHhtcE1NOkRvY3VtZW50SUQ9InhtcC5kaWQ6NzAyNDY5NTk0QkFCMTFFREI0RjRFQjE1QjUxMDJBRDYiPiA8eG1wTU06RGVyaXZlZEZyb20gc3RSZWY6aW5zdGFuY2VJRD0ieG1wLmlpZDo3MDI0Njk1NjRCQUIxMUVEQjRGNEVCMTVCNTEwMkFENiIgc3RSZWY6ZG9jdW1lbnRJRD0ieG1wLmRpZDo3MDI0Njk1NzRCQUIxMUVEQjRGNEVCMTVCNTEwMkFENiIvPiA8L3JkZjpEZXNjcmlwdGlvbj4gPC9yZGY6UkRGPiA8L3g6eG1wbWV0YT4gPD94cGFja2V0IGVuZD0iciI/Pii2bRgAACPZSURBVHja7F0JmBXV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" alt="BioAsturias" width="230" height="80">Panel de trabajo',
      texto: 'Prototipo privado del panel de trabajo. Introduce la clave para entrar.',
      etiqueta: 'Clave',
    },
  },
};

function leerCookie(request, nombre) {
  for (const parte of (request.headers.get('Cookie') || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) {
      try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch { return ''; }
    }
  }
  return '';
}

async function claveDemoValida(demo, clave, env) {
  const hash = env[demo.claveVar];
  if (!clave || clave.length > 200 || !hash) return false;
  return iguales(await sha256(clave), hash);
}

const cookieDemo = (demo, valor, segundos) =>
  `${demo.cookie}=${encodeURIComponent(valor)}; Path=${demo.base}; Max-Age=${segundos}; HttpOnly; Secure; SameSite=Lax`;

// Solo se vuelve a rutas de la propia demo (evita redirecciones abiertas)
function destinoDemo(demo, texto) {
  if (typeof texto !== 'string' || !(texto === demo.base || texto.startsWith(`${demo.base}/`)) || texto.startsWith('//')) return `${demo.base}/`;
  return texto;
}

const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function pantallaAcceso(demo, destino, error) {
  const p = demo.pantalla;
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${p.titulo}</title>
<style>
${p.estilo}
</style></head><body><main><form class="caja" method="post" action="${demo.base}/acceso">
<h1 class="logo">${p.logo}</h1>
<p>${p.texto}</p>
<label for="clave">${p.etiqueta}</label>
<input id="clave" name="clave" type="password" autocomplete="current-password" required autofocus>
<input type="hidden" name="destino" value="${escHtml(destino)}">
${error ? '<p class="error" role="alert">Clave incorrecta. Inténtalo de nuevo.</p>' : ''}
<button type="submit">Entrar</button>
</form></main></body></html>`;
  return responder(html, 401, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
  });
}

const redirigir = (destino, cookie) =>
  responder(null, 303, { Location: destino, ...(cookie ? { 'Set-Cookie': cookie } : {}) });

const ESTADOS_COMENTARIO = new Set(['nuevo', 'en_curso', 'hecho', 'descartado']);
const PRIORIDADES = new Set(['imprescindible', 'me_gustaria', 'mas_adelante']);
const textoLimpio = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function comentariosDemo(demo, request, env, url) {
  const json = (datos, estado = 200) => responder(JSON.stringify(datos), estado, { 'Content-Type': 'application/json; charset=utf-8' });
  if (!env.LOPITA_DATOS) return json({ error: 'sin_almacen' }, 503);
  const almacen = env.LOPITA_DATOS.get(env.LOPITA_DATOS.idFromName(demo.comentarios));
  if (request.method === 'GET') return json({ comentarios: await almacen.listarComentarios() });
  if (request.method !== 'POST' && request.method !== 'PATCH') return responder(null, 405, { Allow: 'GET, POST, PATCH' });
  // Misma web: rechaza envíos desde otros orígenes
  const origen = request.headers.get('Origin');
  if (origen && origen !== url.origin) return json({ error: 'origen' }, 403);
  const texto = await request.text();
  if (texto.length > 20000) return json({ error: 'tamaño' }, 413);
  let d;
  try { d = JSON.parse(texto); } catch { return json({ error: 'json' }, 400); }
  if (!d || typeof d !== 'object') return json({ error: 'formato' }, 400);
  if (request.method === 'POST') {
    const c = {
      texto: textoLimpio(d.texto, 4000), donde: textoLimpio(d.donde, 120) || 'General', autor: textoLimpio(d.autor, 60) || 'Mateo',
      prioridad: PRIORIDADES.has(d.prioridad) ? d.prioridad : 'me_gustaria', url: textoLimpio(d.url, 300),
    };
    if (!c.texto) return json({ error: 'vacio' }, 400);
    const fila = await almacen.crearComentario(c);
    return fila ? json({ comentario: fila }, 201) : json({ error: 'lleno' }, 507);
  }
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id < 1) return json({ error: 'id' }, 400);
  const cambios = {};
  if (d.estado !== undefined) { if (!ESTADOS_COMENTARIO.has(d.estado)) return json({ error: 'estado' }, 400); cambios.estado = d.estado; }
  if (d.respuesta !== undefined) cambios.respuesta = textoLimpio(d.respuesta, 4000);
  const fila = await almacen.cambiarComentario(id, cambios);
  return fila ? json({ comentario: fila }) : json({ error: 'no_existe' }, 404);
}

async function demoPrivada(demo, request, env, url) {
  // Formulario de acceso
  if (url.pathname === `${demo.base}/acceso`) {
    if (request.method !== 'POST') return redirigir(`${demo.base}/`);
    let datos;
    try { datos = await request.formData(); } catch { return pantallaAcceso(demo, `${demo.base}/`, true); }
    const clave = String(datos.get('clave') || '');
    const destino = destinoDemo(demo, String(datos.get('destino') || ''));
    if (await claveDemoValida(demo, clave, env)) return redirigir(destino, cookieDemo(demo, clave, DIAS_COOKIE * 86400));
    return pantallaAcceso(demo, destino, true);
  }
  if (url.pathname === `${demo.base}/salir`) return redirigir(`${demo.base}/`, cookieDemo(demo, '', 0));

  // Enlace con la clave: guarda la cookie y la quita de la dirección
  const claveEnlace = url.searchParams.get('clave');
  if (claveEnlace !== null) {
    url.searchParams.delete('clave');
    const limpia = destinoDemo(demo, url.pathname) + (url.search || '');
    if (await claveDemoValida(demo, claveEnlace, env)) return redirigir(limpia, cookieDemo(demo, claveEnlace, DIAS_COOKIE * 86400));
    return pantallaAcceso(demo, limpia, true);
  }

  if (!(await claveDemoValida(demo, leerCookie(request, demo.cookie), env))) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return responder('Acceso restringido', 401);
    return pantallaAcceso(demo, destinoDemo(demo, url.pathname + url.search), false);
  }

  if (url.pathname === `${demo.base}/api/comentarios`) return comentariosDemo(demo, request, env, url);

  const r = await env.ASSETS.fetch(request);
  const res = new Response(r.body, r);
  res.headers.set('Cache-Control', 'private, no-cache');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

const rutaDeDemo = (ruta, demo) => ruta === demo.base || ruta.startsWith(`${demo.base}/`);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    for (const demo of Object.values(DEMOS)) {
      if (rutaDeDemo(url.pathname, demo)) return demoPrivada(demo, request, env, url);
    }
    if (url.pathname === RUTA_DB) return baseDeDatos(request, env);
    if (url.pathname === RUTA_CAL) return subirCalendarios(request, env);
    if (url.pathname.startsWith(`${RUTA_CAL}/`)) return leerCalendario(request, env, url.pathname.slice(RUTA_CAL.length + 1));
    if (url.pathname.startsWith(RUTA_SLACK)) return relevoSlack(request, env, url.pathname.slice(RUTA_SLACK.length));
    return env.ASSETS.fetch(request);
  },
};
