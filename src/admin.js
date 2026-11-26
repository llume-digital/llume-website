// Panel interno de llume en /admin: pestañas Cerebro (notas y pendientes), Conectar (conector MCP), Accesos (conexiones
// y auditoría) y Equipo (personas e invitaciones). La lógica de datos está en src/cerebro.js.
//
// Acceso: cada persona entra con su nombre y su contraseña (PBKDF2 en personas.clave). Para elegirla o restablecerla
// hace falta un enlace de invitación de un solo uso (48 h) que genera cualquier persona del equipo en la pestaña
// Equipo, o `scripts/invitar.sh` para la primera. Todos son administradores.
// Sesión: cookie HttpOnly `llume_admin` con un token aleatorio (en D1 solo su sha256), 14 días, limitada a /admin.
// SameSite=Lax para que siga valiendo al volver desde Claude o ChatGPT a la pantalla de consentimiento OAuth.
// Desactivar a una persona cierra sus sesiones y revoca sus conexiones.
//
// API (todo bajo /admin/api, JSON, solo con sesión; POST/PATCH rechazan otros orígenes):
//   GET   sesion                          → {yo, personas, clientes}
//   GET   entradas?vista=activas|hechas|todo&tipo&cliente&persona&responsable&etiqueta&q
//   POST  entradas                        {tipo, texto, etiquetas, enlaces, cliente_id, persona_id, responsable_id, vence}
//   POST  entradas/<id>/corregir          mismos campos (los que falten se copian de la versión anterior)
//   POST  entradas/<id>/cerrar | reabrir
//   GET   entradas/<id>/versiones
//   GET   contadores | revision | etiquetas
//   GET   estados?sujeto_tipo&sujeto_id   POST estados {sujeto_tipo, sujeto_id, texto}
//   POST  clientes {nombre}               PATCH clientes/<id> {nombre?, activo?}
//   GET   equipo                          POST equipo {nombre}    PATCH equipo/<id> {activa}
//   POST  equipo/<id>/invitacion          → {enlace, caduca} (el enlace solo se muestra una vez)
//   GET   conexiones                      POST conexiones/<id>/revocar
//   GET   auditoria
import {
  Invalido, json, responder, escHtml, sha256, segundos, tokenAleatorio, hashClave, claveCorrecta, idOpcional,
  crearEntrada, corregirEntrada, cerrarEntrada, reabrirEntrada, versionesEntrada, listarEntradas, revision, contadores,
  listaEtiquetas, comprobarSujeto, historialEstado, guardarEstado,
} from './cerebro.js';

export const BASE = '/admin';
const COOKIE = 'llume_admin';
const DIAS_SESION = 14;
const HORAS_INVITACION = 48;
const MIN_CLAVE = 10;
// Límite de intentos fallidos de acceso por IP
const MAX_FALLOS = 10;
const VENTANA_FALLOS = 15 * 60;

const error = (mensaje, estado = 400) => json({ error: mensaje }, estado);
const redirigir = (destino, cookie) => responder(null, 303, { Location: destino, ...(cookie ? { 'Set-Cookie': cookie } : {}) });

// ── Sesión ────────────────────────────────────────────────────────────────────────────────────────────────────────
function leerCookie(request, nombre) {
  for (const parte of (request.headers.get('Cookie') || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return '';
}

const cookieSesion = (valor, segs) => `${COOKIE}=${valor}; Path=${BASE}; Max-Age=${segs}; HttpOnly; Secure; SameSite=Lax`;

async function crearSesion(env, personaId) {
  const token = tokenAleatorio();
  const t = segundos();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sesiones (hash, persona_id, creada, caduca) VALUES (?, ?, ?, ?)')
      .bind(await sha256(token), personaId, t, t + DIAS_SESION * 86400),
    env.DB.prepare('DELETE FROM sesiones WHERE caduca < ?').bind(t),
  ]);
  return cookieSesion(token, DIAS_SESION * 86400);
}

// Persona de la sesión (revalidada en la base de datos: activa y con contraseña) o null
export async function personaDeSesion(request, env) {
  const token = leerCookie(request, COOKIE);
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return env.DB.prepare(`SELECT p.id, p.nombre FROM sesiones s JOIN personas p ON p.id = s.persona_id
    WHERE s.hash = ? AND s.caduca > ? AND p.activa = 1 AND p.clave IS NOT NULL`).bind(await sha256(token), segundos()).first();
}

// Mismo origen (las peticiones que cambian algo deben venir del propio panel)
export const origenValido = (request, url) => {
  const o = request.headers.get('Origin');
  return !o || o === url.origin;
};

// Solo se vuelve a rutas del panel (evita redirecciones abiertas)
export const destinoSeguro = (d) => (typeof d === 'string' && d.startsWith(`${BASE}/`) && !d.startsWith('//') && !d.includes('\\') ? d : `${BASE}/`);

// ── Pantallas (acceso, invitación) ────────────────────────────────────────────────────────────────────────────────
const ESTILO = `:root{--bg:#07070a;--ink:#f4f1ec;--muted:#a19c94;--ambar:#f2c08a;--line:rgba(244,241,236,.14)}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.caja{width:100%;max-width:400px;border:1px solid var(--line);border-radius:16px;padding:32px 24px;background:rgba(255,255,255,.03)}
h1{font-size:28px;margin:0 0 4px;letter-spacing:-.02em}h1 span{color:var(--ambar)}
p{color:var(--muted);margin:0 0 20px;line-height:1.5;font-size:15px}strong{color:var(--ink)}
label{display:block;font-size:13px;color:var(--muted);margin:16px 0 6px}
input,select{width:100%;font:inherit;font-size:16px;padding:12px;border:1px solid var(--line);border-radius:10px;background:#111116;color:var(--ink)}
input:focus,select:focus{outline:2px solid var(--ambar);outline-offset:1px}
button{margin-top:24px;width:100%;font:inherit;font-weight:600;font-size:16px;padding:13px;border:0;border-radius:999px;background:var(--ambar);color:#07070a;cursor:pointer}
button.secundario{background:transparent;color:var(--ink);border:1px solid var(--line);margin-top:10px}
ul{color:var(--muted);padding-left:20px;line-height:1.6;font-size:14px;margin:0 0 8px}
.error{color:#ff8a80;font-size:14px;margin:16px 0 0}`;

export function pagina(titulo, cuerpo, estado = 200) {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>${escHtml(titulo)}</title><style>${ESTILO}</style></head>
<body><main>${cuerpo}</main></body></html>`;
  return responder(html, estado, {
    'Content-Type': 'text/html; charset=utf-8',
    // form-action sin restricciones: la pantalla de consentimiento redirige a Claude o ChatGPT tras enviar el formulario
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
  });
}

const personasConClave = async (env) =>
  (await env.DB.prepare('SELECT id, nombre FROM personas WHERE activa = 1 AND clave IS NOT NULL ORDER BY nombre').all()).results;

export function pantallaAcceso(personas, destino, mensaje, estado = 401) {
  const opciones = personas.map((p) => `<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('');
  return pagina('llume · Panel', `<form class="caja" method="post" action="${BASE}/acceso">
<h1>llume<span>.</span> panel</h1>
<p>Panel interno del equipo. ¿No tienes contraseña? Pide un enlace de invitación a alguien del equipo.</p>
<label for="persona">Nombre</label>
<select id="persona" name="persona" required><option value="">Elige tu nombre</option>${opciones}</select>
<label for="clave">Contraseña</label>
<input id="clave" name="clave" type="password" autocomplete="current-password" required>
<input type="hidden" name="destino" value="${escHtml(destinoSeguro(destino))}">
${mensaje ? `<p class="error" role="alert">${escHtml(mensaje)}</p>` : ''}
<button type="submit">Entrar</button>
</form>`, estado);
}

// ── Límite de intentos ────────────────────────────────────────────────────────────────────────────────────────────
const ipDe = (request) => request.headers.get('CF-Connecting-IP') || 'local';

async function demasiadosFallos(env, ip) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM intentos_acceso WHERE ip = ? AND creado > ?').bind(ip, segundos() - VENTANA_FALLOS).first();
  return r.n >= MAX_FALLOS;
}

async function apuntarFallo(env, ip) {
  const t = segundos();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO intentos_acceso (ip, creado) VALUES (?, ?)').bind(ip, t),
    env.DB.prepare('DELETE FROM intentos_acceso WHERE creado < ?').bind(t - VENTANA_FALLOS),
  ]);
}

async function acceso(request, env, url) {
  if (request.method !== 'POST') return redirigir(`${BASE}/`);
  const personas = await personasConClave(env);
  if (!origenValido(request, url)) return pantallaAcceso(personas, '', 'Origen no permitido', 403);
  let datos;
  try { datos = await request.formData(); } catch { return pantallaAcceso(personas, '', 'Formulario no válido'); }
  const destino = destinoSeguro(String(datos.get('destino') || ''));
  const ip = ipDe(request);
  if (await demasiadosFallos(env, ip)) return pantallaAcceso(personas, destino, 'Demasiados intentos fallidos. Espera 15 minutos.', 429);
  const persona = await env.DB.prepare('SELECT id, clave FROM personas WHERE id = ? AND activa = 1')
    .bind(Number(datos.get('persona')) || 0).first();
  if (!persona || !(await claveCorrecta(String(datos.get('clave') || ''), persona.clave))) {
    await apuntarFallo(env, ip);
    return pantallaAcceso(personas, destino, 'Nombre o contraseña incorrectos.');
  }
  return redirigir(destino, await crearSesion(env, persona.id));
}

// ── Invitaciones ──────────────────────────────────────────────────────────────────────────────────────────────────
async function invitacionValida(env, token) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token || '')) return null;
  return env.DB.prepare(`SELECT i.hash, p.id AS persona_id, p.nombre FROM invitaciones i JOIN personas p ON p.id = i.persona_id
    WHERE i.hash = ? AND i.usada IS NULL AND i.caduca > ? AND p.activa = 1`).bind(await sha256(token), segundos()).first();
}

function pantallaInvitacion(inv, token, mensaje, estado = 200) {
  return pagina('llume · Elige tu contraseña', `<form class="caja" method="post" action="${BASE}/invitacion">
<h1>llume<span>.</span> panel</h1>
<p>Hola, <strong>${escHtml(inv.nombre)}</strong>. Elige tu contraseña para entrar al panel y conectar tu asistente al Cerebro.
Mínimo ${MIN_CLAVE} caracteres. Este enlace solo sirve una vez.</p>
<input type="hidden" name="t" value="${escHtml(token)}">
<input type="text" name="usuario" value="${escHtml(inv.nombre)}" autocomplete="username" hidden>
<label for="clave">Contraseña nueva</label>
<input id="clave" name="clave" type="password" autocomplete="new-password" minlength="${MIN_CLAVE}" maxlength="200" required>
<label for="clave2">Repítela</label>
<input id="clave2" name="clave2" type="password" autocomplete="new-password" minlength="${MIN_CLAVE}" maxlength="200" required>
${mensaje ? `<p class="error" role="alert">${escHtml(mensaje)}</p>` : ''}
<button type="submit">Guardar y entrar</button>
</form>`, estado);
}

const invitacionCaducada = () => pagina('llume · Invitación no válida', `<div class="caja"><h1>llume<span>.</span> panel</h1>
<p>Este enlace de invitación no es válido: ya se usó, caducó o la persona está desactivada. Pide uno nuevo a alguien del equipo.</p></div>`, 410);

async function invitacion(request, env, url) {
  if (request.method === 'GET') {
    const token = url.searchParams.get('t') || '';
    const inv = await invitacionValida(env, token);
    return inv ? pantallaInvitacion(inv, token, '') : invitacionCaducada();
  }
  if (request.method !== 'POST') return responder(null, 405, { Allow: 'GET, POST' });
  if (!origenValido(request, url)) return responder('Origen no permitido', 403);
  let datos;
  try { datos = await request.formData(); } catch { return invitacionCaducada(); }
  const token = String(datos.get('t') || '');
  const inv = await invitacionValida(env, token);
  if (!inv) return invitacionCaducada();
  const clave = String(datos.get('clave') || '');
  if (clave.length < MIN_CLAVE || clave.length > 200) return pantallaInvitacion(inv, token, `La contraseña debe tener entre ${MIN_CLAVE} y 200 caracteres.`, 400);
  if (clave !== String(datos.get('clave2') || '')) return pantallaInvitacion(inv, token, 'Las dos contraseñas no coinciden.', 400);
  const t = segundos();
  // Restablecer la contraseña cierra las sesiones abiertas e invalida el resto de invitaciones de esa persona
  const [marcada] = await env.DB.batch([
    env.DB.prepare('UPDATE invitaciones SET usada = ? WHERE hash = ? AND usada IS NULL').bind(t, inv.hash),
    env.DB.prepare('UPDATE personas SET clave = ? WHERE id = ? AND changes() = 1').bind(await hashClave(clave), inv.persona_id),
    env.DB.prepare('UPDATE invitaciones SET usada = ? WHERE persona_id = ? AND usada IS NULL').bind(t, inv.persona_id),
    env.DB.prepare('DELETE FROM sesiones WHERE persona_id = ?').bind(inv.persona_id),
  ]);
  if (!marcada.meta.changes) return invitacionCaducada();
  return redirigir(`${BASE}/`, await crearSesion(env, inv.persona_id));
}

export async function crearInvitacion(env, personaId, creadaPor, origen) {
  const token = tokenAleatorio();
  const t = segundos();
  const caduca = t + HORAS_INVITACION * 3600;
  await env.DB.prepare('INSERT INTO invitaciones (hash, persona_id, creada_por, creada, caduca) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), personaId, creadaPor, t, caduca).run();
  return { enlace: `${origen}${BASE}/invitacion?t=${token}`, caduca: new Date(caduca * 1000).toISOString() };
}

// ── API ───────────────────────────────────────────────────────────────────────────────────────────────────────────
async function leerCuerpo(request) {
  const texto = await request.text();
  if (texto.length > 20000) throw new Invalido('Petición demasiado grande');
  let d;
  try { d = JSON.parse(texto || '{}'); } catch { throw new Invalido('JSON no válido'); }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Invalido('Formato no válido');
  return d;
}

const nombreLimpio = (v, max) => {
  const n = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (!n || n.length > max) throw new Invalido(`Nombre de 1 a ${max} caracteres`);
  return n;
};

async function api(request, env, url, yo) {
  const ruta = url.pathname.slice(`${BASE}/api/`.length);
  const metodo = request.method;
  if (metodo !== 'GET' && metodo !== 'HEAD' && !origenValido(request, url)) return error('Origen no permitido', 403);
  const p = url.searchParams;
  let m;

  // Cerebro
  if (ruta === 'sesion' && metodo === 'GET') {
    const [personas, clientes] = await env.DB.batch([
      env.DB.prepare('SELECT id, nombre, activa FROM personas ORDER BY nombre'),
      env.DB.prepare('SELECT id, nombre, activo FROM clientes ORDER BY nombre COLLATE NOCASE'),
    ]);
    return json({ yo, personas: personas.results, clientes: clientes.results, mcp: `${url.origin}/mcp` });
  }
  if (ruta === 'entradas' && metodo === 'GET') {
    const filtros = Object.fromEntries(['tipo', 'cliente', 'persona', 'responsable', 'autor', 'etiqueta', 'q'].map((k) => [k, p.get(k)]));
    return json({ entradas: await listarEntradas(env, { ...filtros, estado: p.get('vista') || 'activas' }) });
  }
  if (ruta === 'entradas' && metodo === 'POST') return json({ entrada: await crearEntrada(env, await leerCuerpo(request), yo.id, 'panel') }, 201);
  if ((m = /^entradas\/(\d+)\/corregir$/.exec(ruta)) && metodo === 'POST') {
    return json({ entrada: await corregirEntrada(env, Number(m[1]), await leerCuerpo(request), yo.id, 'panel') }, 201);
  }
  if ((m = /^entradas\/(\d+)\/cerrar$/.exec(ruta)) && metodo === 'POST') return json({ entrada: await cerrarEntrada(env, Number(m[1]), yo.id) });
  if ((m = /^entradas\/(\d+)\/reabrir$/.exec(ruta)) && metodo === 'POST') return json({ entrada: await reabrirEntrada(env, Number(m[1])) });
  if ((m = /^entradas\/(\d+)\/versiones$/.exec(ruta)) && metodo === 'GET') {
    const versiones = await versionesEntrada(env, Number(m[1]));
    return versiones.length ? json({ versiones }) : error('No existe', 404);
  }
  if (ruta === 'contadores' && metodo === 'GET') return json(await contadores(env, yo.id));
  if (ruta === 'revision' && metodo === 'GET') return json({ entradas: await revision(env) });
  if (ruta === 'etiquetas' && metodo === 'GET') return json({ etiquetas: await listaEtiquetas(env) });
  if (ruta === 'estados' && metodo === 'GET') {
    const tipo = p.get('sujeto_tipo');
    return json({ historial: await historialEstado(env, tipo, await comprobarSujeto(env, tipo, p.get('sujeto_id'))) });
  }
  if (ruta === 'estados' && metodo === 'POST') {
    const d = await leerCuerpo(request);
    const id = await comprobarSujeto(env, d.sujeto_tipo, d.sujeto_id);
    return json({ estado: await guardarEstado(env, d.sujeto_tipo, id, d.texto, yo.id) }, 201);
  }

  // Clientes
  if (ruta === 'clientes' && metodo === 'POST') {
    const nombre = nombreLimpio((await leerCuerpo(request)).nombre, 80);
    if (await env.DB.prepare('SELECT 1 FROM clientes WHERE nombre = ?').bind(nombre).first()) throw new Invalido('Ya existe un cliente con ese nombre');
    return json({ cliente: await env.DB.prepare('INSERT INTO clientes (nombre) VALUES (?) RETURNING *').bind(nombre).first() }, 201);
  }
  if ((m = /^clientes\/(\d+)$/.exec(ruta)) && metodo === 'PATCH') {
    const id = Number(m[1]);
    const actual = await env.DB.prepare('SELECT * FROM clientes WHERE id = ?').bind(id).first();
    if (!actual) return error('No existe', 404);
    const d = await leerCuerpo(request);
    let nombre = actual.nombre;
    if (d.nombre !== undefined) {
      nombre = nombreLimpio(d.nombre, 80);
      if (await env.DB.prepare('SELECT 1 FROM clientes WHERE nombre = ? AND id != ?').bind(nombre, id).first()) throw new Invalido('Ya existe un cliente con ese nombre');
    }
    const activo = d.activo === undefined ? actual.activo : (d.activo ? 1 : 0);
    return json({ cliente: await env.DB.prepare('UPDATE clientes SET nombre = ?, activo = ? WHERE id = ? RETURNING *').bind(nombre, activo, id).first() });
  }

  // Equipo
  if (ruta === 'equipo' && metodo === 'GET') {
    const r = await env.DB.prepare(`SELECT p.id, p.nombre, p.activa, p.clave IS NOT NULL AS tiene_clave,
      (SELECT max(caduca) FROM invitaciones i WHERE i.persona_id = p.id AND i.usada IS NULL AND i.caduca > ?) AS invitacion_caduca
      FROM personas p ORDER BY p.activa DESC, p.nombre`).bind(segundos()).all();
    return json({ equipo: r.results });
  }
  if (ruta === 'equipo' && metodo === 'POST') {
    const nombre = nombreLimpio((await leerCuerpo(request)).nombre, 40);
    if (await env.DB.prepare('SELECT 1 FROM personas WHERE lower(nombre) = lower(?)').bind(nombre).first()) throw new Invalido('Ya existe una persona con ese nombre');
    return json({ persona: await env.DB.prepare('INSERT INTO personas (nombre) VALUES (?) RETURNING id, nombre, activa').bind(nombre).first() }, 201);
  }
  if ((m = /^equipo\/(\d+)$/.exec(ruta)) && metodo === 'PATCH') {
    const id = Number(m[1]);
    const d = await leerCuerpo(request);
    if (typeof d.activa !== 'boolean') throw new Invalido('Falta «activa»');
    if (id === yo.id && !d.activa) throw new Invalido('No puedes desactivarte a ti mismo');
    const fila = await env.DB.prepare('UPDATE personas SET activa = ? WHERE id = ? RETURNING id, nombre, activa').bind(d.activa ? 1 : 0, id).first();
    if (!fila) return error('No existe', 404);
    if (!d.activa) {
      const t = segundos();
      await env.DB.batch([
        env.DB.prepare('DELETE FROM sesiones WHERE persona_id = ?').bind(id),
        env.DB.prepare('UPDATE oauth_conexiones SET revocada = ?, revocada_por = ? WHERE persona_id = ? AND revocada IS NULL').bind(t, yo.id, id),
        env.DB.prepare('UPDATE invitaciones SET usada = ? WHERE persona_id = ? AND usada IS NULL').bind(t, id),
      ]);
    }
    return json({ persona: fila });
  }
  if ((m = /^equipo\/(\d+)\/invitacion$/.exec(ruta)) && metodo === 'POST') {
    const id = Number(m[1]);
    if (!(await env.DB.prepare('SELECT 1 FROM personas WHERE id = ? AND activa = 1').bind(id).first())) throw new Invalido('La persona no existe o está desactivada');
    return json(await crearInvitacion(env, id, yo.id, url.origin), 201);
  }

  // Accesos
  if (ruta === 'conexiones' && metodo === 'GET') {
    const r = await env.DB.prepare(`SELECT c.id, c.persona_id, c.creada, c.ultimo_uso, c.revocada, c.revocada_por, c.refresh_caduca,
      k.nombre AS cliente, k.origen FROM oauth_conexiones c JOIN oauth_clientes k ON k.client_id = c.client_id
      ORDER BY c.revocada IS NOT NULL, COALESCE(c.ultimo_uso, c.creada) DESC LIMIT 300`).all();
    return json({ conexiones: r.results, ahora: segundos() });
  }
  if ((m = /^conexiones\/(\d+)\/revocar$/.exec(ruta)) && metodo === 'POST') {
    const fila = await env.DB.prepare('UPDATE oauth_conexiones SET revocada = ?, revocada_por = ? WHERE id = ? AND revocada IS NULL RETURNING id')
      .bind(segundos(), yo.id, Number(m[1])).first();
    return fila ? json({ ok: true }) : error('No existe o ya está revocada', 409);
  }
  if (ruta === 'auditoria' && metodo === 'GET') {
    const persona = idOpcional(p.get('persona'), 'Persona');
    const r = await env.DB.prepare(`SELECT a.id, a.persona_id, a.herramienta, a.argumentos, a.ok, a.error, a.creado, k.nombre AS cliente
      FROM mcp_auditoria a LEFT JOIN oauth_conexiones c ON c.id = a.conexion_id LEFT JOIN oauth_clientes k ON k.client_id = c.client_id
      ${persona ? 'WHERE a.persona_id = ?' : ''} ORDER BY a.id DESC LIMIT 200`).bind(...(persona ? [persona] : [])).all();
    return json({ auditoria: r.results });
  }

  return error('No encontrado', 404);
}

// ── Entrada ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const esRutaAdmin = (ruta) => ruta === BASE || ruta.startsWith(`${BASE}/`);

export async function panelAdmin(request, env) {
  const url = new URL(request.url);
  if (!env.DB) return responder('Panel no configurado', 503, { 'Content-Type': 'text/plain; charset=utf-8' });

  if (url.pathname === `${BASE}/acceso`) return acceso(request, env, url);
  if (url.pathname === `${BASE}/invitacion`) return invitacion(request, env, url);
  if (url.pathname === `${BASE}/salir`) {
    const token = leerCookie(request, COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sesiones WHERE hash = ?').bind(await sha256(token)).run();
    return redirigir(`${BASE}/`, cookieSesion('', 0));
  }

  const yo = await personaDeSesion(request, env);
  if (url.pathname.startsWith(`${BASE}/api/`)) {
    if (!yo) return error('Sesión caducada', 401);
    try {
      return await api(request, env, url, yo);
    } catch (e) {
      if (e instanceof Invalido) return error(e.message, e.estado || 400);
      console.error(e);
      return error('Error interno', 500);
    }
  }
  if (!yo) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return responder('Acceso restringido', 401);
    return pantallaAcceso(await personasConClave(env), url.pathname + url.search, '');
  }

  const r = await env.ASSETS.fetch(request);
  const res = new Response(r.body, r);
  res.headers.set('Cache-Control', 'private, no-cache');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
