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
      estilo: `:root{--bg:#f4f1ec;--ink:#1d2b2b;--muted:#5d6b6a;--acento:#0f7b78;--line:#d3cdc3}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.caja{width:100%;max-width:380px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:32px 24px}
.logo{font-weight:700;font-size:24px;margin:0 0 4px}.logo span{color:var(--acento)}
p{color:var(--muted);margin:0 0 24px;line-height:1.5;font-size:15px}
label{display:block;font-size:14px;font-weight:600;margin-bottom:8px}
input{width:100%;font:inherit;font-size:16px;padding:12px;border:1px solid #6d7b7a;background:#fff;color:var(--ink);border-radius:6px}
input:focus{outline:3px solid var(--acento);outline-offset:1px}
button{margin-top:16px;width:100%;font:inherit;font-weight:600;font-size:16px;padding:14px;border:0;border-radius:6px;background:var(--acento);color:#fff;cursor:pointer}
button:hover{background:#0a5e5c}.error{color:#b3261e;font-size:14px;margin:12px 0 0}`,
      logo: 'Bio<span>Asturias</span> · Panel',
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
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
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
