// Panel interno de llume en /admin, con la pestaña «Cerebro»: bitácora compartida de notas y pendientes del equipo.
//
// Acceso: clave compartida (secreto ADMIN_CLAVE: `npx wrangler secret put ADMIN_CLAVE`; en local, en .dev.vars) y,
// al entrar, cada uno elige su nombre de la tabla `personas`. Ojo: el nombre lo declara quien entra, no se verifica.
// Antes de conectar el MCP hacen falta cuentas individuales.
// La sesión es una cookie HttpOnly firmada con HMAC (persona.caducidad.firma), limitada a /admin. No lleva la clave.
// Cambiar ADMIN_CLAVE cierra todas las sesiones.
//
// Datos en D1 (binding DB, esquema en migrations/). Nada se borra:
//   · corregir crea una entrada nueva (sustituye_id → la anterior) y marca la anterior como «superseded»;
//   · cerrar pone «closed» y la saca de las activas;
//   · cada «estado actual» guardado es una fila nueva (el vigente es el último).
//
// API (todo bajo /admin/api, JSON, solo con sesión; los POST/PATCH rechazan otros orígenes):
//   GET   sesion                          → {yo, personas, clientes}
//   GET   entradas?vista=activas|hechas|todo&tipo&cliente&persona&responsable&etiqueta&q
//   POST  entradas                        {tipo, texto, etiquetas, enlaces, cliente_id, persona_id, responsable_id, vence}
//   POST  entradas/<id>/corregir          mismos campos (los que falten se copian de la versión anterior)
//   POST  entradas/<id>/cerrar
//   POST  entradas/<id>/reabrir           una cerrada vuelve a activa
//   GET   contadores                      → {activas, hechas, mios, revision}
//   GET   entradas/<id>/versiones         → la entrada y sus versiones anteriores
//   GET   revision                        → pendientes abiertos vencidos o sin tocar en 14 días
//   GET   etiquetas                       → [{etiqueta, n}]
//   GET   estados?sujeto_tipo&sujeto_id   → historial del estado actual (el primero es el vigente)
//   POST  estados                         {sujeto_tipo, sujeto_id, texto}
//   POST  clientes                        {nombre}
//   PATCH clientes/<id>                   {nombre?, activo?}

const BASE = '/admin';
const COOKIE = 'llume_admin';
const DIAS_SESION = 14;
const MAX_TEXTO = 2000;
const MAX_ESTADO = 4000;
const DIAS_SIN_TOCAR = 14;
// Límite de intentos fallidos de acceso por IP
const MAX_FALLOS = 10;
const VENTANA_FALLOS = 15 * 60;

const cabecerasBase = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const responder = (cuerpo, estado, extra = {}) => new Response(cuerpo, { status: estado, headers: { ...cabecerasBase, ...extra } });
const json = (datos, estado = 200) => responder(JSON.stringify(datos), estado, { 'Content-Type': 'application/json; charset=utf-8' });
const error = (mensaje, estado = 400) => json({ error: mensaje }, estado);
const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ahora = () => new Date().toISOString();

// ── Sesión ────────────────────────────────────────────────────────────────────────────────────────────────────────
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256(texto) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function firmar(texto, env) {
  const clave = await crypto.subtle.importKey('raw', new TextEncoder().encode(`cerebro:${env.ADMIN_CLAVE}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(texto)));
}

async function claveValida(clave, env) {
  if (!env.ADMIN_CLAVE || typeof clave !== 'string' || !clave || clave.length > 200) return false;
  // Se comparan los hash para que la comparación no dependa de la longitud de la clave
  return iguales(await sha256(clave), await sha256(env.ADMIN_CLAVE));
}

function leerCookie(request, nombre) {
  for (const parte of (request.headers.get('Cookie') || '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return parte.slice(i + 1).trim();
  }
  return '';
}

const cookieSesion = (valor, segundos) => `${COOKIE}=${valor}; Path=${BASE}; Max-Age=${segundos}; HttpOnly; Secure; SameSite=Strict`;

async function crearSesion(personaId, env) {
  const caduca = Math.floor(Date.now() / 1000) + DIAS_SESION * 86400;
  const cuerpo = `${personaId}.${caduca}`;
  return cookieSesion(`${cuerpo}.${await firmar(cuerpo, env)}`, DIAS_SESION * 86400);
}

// Devuelve la persona de la sesión (revalidada en la base de datos) o null
async function personaDeSesion(request, env) {
  if (!env.ADMIN_CLAVE) return null;
  const m = /^(\d+)\.(\d+)\.([0-9a-f]{64})$/.exec(leerCookie(request, COOKIE));
  if (!m || Number(m[2]) < Date.now() / 1000) return null;
  if (!iguales(await firmar(`${m[1]}.${m[2]}`, env), m[3])) return null;
  return env.DB.prepare('SELECT id, nombre FROM personas WHERE id = ? AND activa = 1').bind(Number(m[1])).first();
}

// ── Pantalla de acceso ────────────────────────────────────────────────────────────────────────────────────────────
const ESTILO_ACCESO = `:root{--bg:#07070a;--ink:#f4f1ec;--muted:#a19c94;--ambar:#f2c08a;--line:rgba(244,241,236,.14)}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
main{min-height:100vh;display:grid;place-items:center;padding:24px 16px}
.caja{width:100%;max-width:380px;border:1px solid var(--line);border-radius:16px;padding:32px 24px;background:rgba(255,255,255,.03)}
h1{font-size:28px;margin:0 0 4px;letter-spacing:-.02em}h1 span{color:var(--ambar)}
p{color:var(--muted);margin:0 0 24px;line-height:1.5;font-size:15px}
label{display:block;font-size:13px;color:var(--muted);margin:16px 0 6px}
input,select{width:100%;font:inherit;font-size:16px;padding:12px;border:1px solid var(--line);border-radius:10px;background:#111116;color:var(--ink)}
input:focus,select:focus{outline:2px solid var(--ambar);outline-offset:1px}
button{margin-top:24px;width:100%;font:inherit;font-weight:600;font-size:16px;padding:13px;border:0;border-radius:999px;background:var(--ambar);color:#07070a;cursor:pointer}
.error{color:#ff8a80;font-size:14px;margin:16px 0 0}`;

function pantallaAcceso(personas, mensaje, estado = 401) {
  const opciones = personas.map((p) => `<option value="${p.id}">${escHtml(p.nombre)}</option>`).join('');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>llume · Panel</title><style>${ESTILO_ACCESO}</style></head>
<body><main><form class="caja" method="post" action="${BASE}/acceso">
<h1>llume<span>.</span> panel</h1>
<p>Panel interno del equipo.</p>
<label for="persona">¿Quién eres?</label>
<select id="persona" name="persona" required><option value="">Elige tu nombre</option>${opciones}</select>
<label for="clave">Clave</label>
<input id="clave" name="clave" type="password" autocomplete="current-password" required>
${mensaje ? `<p class="error" role="alert">${escHtml(mensaje)}</p>` : ''}
<button type="submit">Entrar</button>
</form></main></body></html>`;
  return responder(html, estado, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy': 'no-referrer',
  });
}

// ── Límite de intentos ────────────────────────────────────────────────────────────────────────────────────────────
const ipDe = (request) => request.headers.get('CF-Connecting-IP') || 'local';

async function demasiadosFallos(env, ip) {
  const desde = Math.floor(Date.now() / 1000) - VENTANA_FALLOS;
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM intentos_acceso WHERE ip = ? AND creado > ?').bind(ip, desde).first();
  return r.n >= MAX_FALLOS;
}

async function apuntarFallo(env, ip) {
  const t = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO intentos_acceso (ip, creado) VALUES (?, ?)').bind(ip, t),
    env.DB.prepare('DELETE FROM intentos_acceso WHERE creado < ?').bind(t - VENTANA_FALLOS),
  ]);
}

const personasActivas = async (env) => (await env.DB.prepare('SELECT id, nombre FROM personas WHERE activa = 1 ORDER BY nombre').all()).results;

// ── Validación ────────────────────────────────────────────────────────────────────────────────────────────────────
class Invalido extends Error {}

function idOpcional(v, campo) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Invalido(`${campo} no válido`);
  return n;
}

function textoEntrada(v) {
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) throw new Invalido('El texto está vacío');
  if (t.length > MAX_TEXTO) throw new Invalido(`Máximo ${MAX_TEXTO} caracteres. Apunta una sola cosa por nota.`);
  return t;
}

function etiquetas(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Invalido('Etiquetas no válidas');
  const vistas = new Map();
  for (const e of v) {
    const t = typeof e === 'string' ? e.trim().replace(/\s+/g, ' ') : '';
    if (!t) continue;
    if (t.length > 40) throw new Invalido('Cada etiqueta, máximo 40 caracteres');
    if (!vistas.has(t.toLowerCase())) vistas.set(t.toLowerCase(), t);
  }
  if (vistas.size > 10) throw new Invalido('Máximo 10 etiquetas');
  return [...vistas.values()];
}

function enlaces(v) {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Invalido('Enlaces no válidos');
  const lista = [];
  for (const e of v) {
    const t = typeof e === 'string' ? e.trim() : '';
    if (!t) continue;
    let u;
    try { u = new URL(t); } catch { throw new Invalido(`Enlace no válido: ${t.slice(0, 60)}`); }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || t.length > 500) throw new Invalido(`Enlace no válido: ${t.slice(0, 60)}`);
    lista.push(u.href);
  }
  if (lista.length > 10) throw new Invalido('Máximo 10 enlaces');
  return lista;
}

function fecha(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Invalido('Fecha no válida');
  return v;
}

// Campos de una entrada a partir del cuerpo; `base` (versión anterior) rellena los que no lleguen
function camposEntrada(d, base = {}) {
  const tiene = (k) => Object.prototype.hasOwnProperty.call(d, k);
  const tipo = tiene('tipo') ? d.tipo : base.tipo;
  if (tipo !== 'nota' && tipo !== 'pendiente') throw new Invalido('El tipo debe ser «nota» o «pendiente»');
  return {
    tipo,
    texto: textoEntrada(tiene('texto') ? d.texto : base.texto),
    etiquetas: JSON.stringify(tiene('etiquetas') ? etiquetas(d.etiquetas) : JSON.parse(base.etiquetas || '[]')),
    enlaces: JSON.stringify(tiene('enlaces') ? enlaces(d.enlaces) : JSON.parse(base.enlaces || '[]')),
    cliente_id: tiene('cliente_id') ? idOpcional(d.cliente_id, 'Cliente') : base.cliente_id ?? null,
    persona_id: tiene('persona_id') ? idOpcional(d.persona_id, 'Persona') : base.persona_id ?? null,
    responsable_id: tiene('responsable_id') ? idOpcional(d.responsable_id, 'Responsable') : base.responsable_id ?? null,
    vence: tiene('vence') ? fecha(d.vence) : base.vence ?? null,
  };
}

// Comprueba que los ids enlazados existen (mensaje claro en vez de un error de clave foránea)
async function comprobarEnlaces(env, c) {
  const consultas = [];
  if (c.cliente_id) consultas.push(['Cliente', env.DB.prepare('SELECT 1 FROM clientes WHERE id = ?').bind(c.cliente_id)]);
  if (c.persona_id) consultas.push(['Persona', env.DB.prepare('SELECT 1 FROM personas WHERE id = ?').bind(c.persona_id)]);
  if (c.responsable_id) consultas.push(['Responsable', env.DB.prepare('SELECT 1 FROM personas WHERE id = ?').bind(c.responsable_id)]);
  if (!consultas.length) return;
  const r = await env.DB.batch(consultas.map(([, q]) => q));
  r.forEach((res, i) => { if (!res.results.length) throw new Invalido(`${consultas[i][0]} no existe`); });
}

// ── Consultas ─────────────────────────────────────────────────────────────────────────────────────────────────────
function filtroEntradas(p) {
  const donde = [];
  const valores = [];
  const vista = p.get('vista') || 'activas';
  if (vista === 'activas') donde.push("e.estado = 'open'");
  else if (vista === 'hechas') donde.push("e.estado = 'closed'");
  else if (vista === 'todo') donde.push("e.estado != 'superseded'");
  else throw new Invalido('Vista no válida');
  const tipo = p.get('tipo');
  if (tipo) { if (tipo !== 'nota' && tipo !== 'pendiente') throw new Invalido('Tipo no válido'); donde.push('e.tipo = ?'); valores.push(tipo); }
  for (const [param, col] of [['cliente', 'cliente_id'], ['persona', 'persona_id'], ['responsable', 'responsable_id'], ['autor', 'autor_id']]) {
    const v = p.get(param);
    if (!v) continue;
    if (v === 'ninguno') { donde.push(`e.${col} IS NULL`); continue; }
    donde.push(`e.${col} = ?`);
    valores.push(idOpcional(v, param));
  }
  const etiqueta = p.get('etiqueta');
  if (etiqueta) { donde.push('EXISTS (SELECT 1 FROM json_each(e.etiquetas) WHERE lower(value) = lower(?))'); valores.push(etiqueta); }
  const q = (p.get('q') || '').trim();
  if (q) { donde.push("e.texto LIKE ? ESCAPE '\\'"); valores.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); }
  const orden = vista === 'activas'
    ? "CASE e.tipo WHEN 'pendiente' THEN 0 ELSE 1 END, e.vence IS NULL, e.vence, e.actualizada DESC"
    : 'e.actualizada DESC';
  return { sql: `SELECT e.* FROM entradas e WHERE ${donde.join(' AND ')} ORDER BY ${orden} LIMIT 500`, valores };
}

const entradaDeFila = (f) => ({ ...f, etiquetas: JSON.parse(f.etiquetas), enlaces: JSON.parse(f.enlaces) });

async function leerCuerpo(request) {
  const texto = await request.text();
  if (texto.length > 20000) throw new Invalido('Petición demasiado grande');
  let d;
  try { d = JSON.parse(texto || '{}'); } catch { throw new Invalido('JSON no válido'); }
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Invalido('Formato no válido');
  return d;
}

async function api(request, env, url, yo) {
  const ruta = url.pathname.slice(`${BASE}/api/`.length);
  const metodo = request.method;
  if (metodo !== 'GET' && metodo !== 'HEAD') {
    const origen = request.headers.get('Origin');
    if (origen && origen !== url.origin) return error('Origen no permitido', 403);
  }
  let m;

  if (ruta === 'sesion' && metodo === 'GET') {
    const [personas, clientes] = await env.DB.batch([
      env.DB.prepare('SELECT id, nombre, activa FROM personas ORDER BY nombre'),
      env.DB.prepare('SELECT id, nombre, activo FROM clientes ORDER BY nombre COLLATE NOCASE'),
    ]);
    return json({ yo, personas: personas.results, clientes: clientes.results });
  }

  if (ruta === 'entradas' && metodo === 'GET') {
    const { sql, valores } = filtroEntradas(url.searchParams);
    const r = await env.DB.prepare(sql).bind(...valores).all();
    return json({ entradas: r.results.map(entradaDeFila) });
  }

  if (ruta === 'entradas' && metodo === 'POST') {
    const c = camposEntrada(await leerCuerpo(request));
    await comprobarEnlaces(env, c);
    const fila = await env.DB.prepare(`INSERT INTO entradas (tipo, texto, etiquetas, enlaces, cliente_id, persona_id, responsable_id,
      vence, autor_id, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'panel') RETURNING *`)
      .bind(c.tipo, c.texto, c.etiquetas, c.enlaces, c.cliente_id, c.persona_id, c.responsable_id, c.vence, yo.id).first();
    return json({ entrada: entradaDeFila(fila) }, 201);
  }

  if ((m = /^entradas\/(\d+)\/corregir$/.exec(ruta)) && metodo === 'POST') {
    const id = Number(m[1]);
    const anterior = await env.DB.prepare('SELECT * FROM entradas WHERE id = ?').bind(id).first();
    if (!anterior) return error('No existe', 404);
    if (anterior.estado === 'superseded') return error('Esta versión ya se corrigió: corrige la última', 409);
    const c = camposEntrada(await leerCuerpo(request), anterior);
    await comprobarEnlaces(env, c);
    const t = ahora();
    // En una transacción: solo se inserta la versión nueva si la anterior seguía vigente (changes() = 1)
    const [, insertada] = await env.DB.batch([
      env.DB.prepare("UPDATE entradas SET estado = 'superseded', actualizada = ? WHERE id = ? AND estado = ?").bind(t, id, anterior.estado),
      env.DB.prepare(`INSERT INTO entradas (tipo, estado, texto, etiquetas, enlaces, cliente_id, persona_id, responsable_id, vence,
        autor_id, origen, sustituye_id, creada, actualizada, cerrada, cerrada_por)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'panel', ?, ?, ?, ?, ? WHERE changes() = 1 RETURNING *`)
        .bind(c.tipo, anterior.estado, c.texto, c.etiquetas, c.enlaces, c.cliente_id, c.persona_id, c.responsable_id, c.vence,
          yo.id, id, t, t, anterior.cerrada, anterior.cerrada_por),
    ]);
    if (!insertada.results.length) return error('Alguien la cambió a la vez. Recarga y vuelve a intentarlo.', 409);
    return json({ entrada: entradaDeFila(insertada.results[0]) }, 201);
  }

  if ((m = /^entradas\/(\d+)\/cerrar$/.exec(ruta)) && metodo === 'POST') {
    const t = ahora();
    const fila = await env.DB.prepare(`UPDATE entradas SET estado = 'closed', cerrada = ?, cerrada_por = ?, actualizada = ?
      WHERE id = ? AND estado = 'open' RETURNING *`).bind(t, yo.id, t, Number(m[1])).first();
    if (!fila) return error('No existe o no está abierta', 409);
    return json({ entrada: entradaDeFila(fila) });
  }

  if ((m = /^entradas\/(\d+)\/reabrir$/.exec(ruta)) && metodo === 'POST') {
    const fila = await env.DB.prepare(`UPDATE entradas SET estado = 'open', cerrada = NULL, cerrada_por = NULL, actualizada = ?
      WHERE id = ? AND estado = 'closed' RETURNING *`).bind(ahora(), Number(m[1])).first();
    if (!fila) return error('No existe o no está cerrada', 409);
    return json({ entrada: entradaDeFila(fila) });
  }

  if (ruta === 'contadores' && metodo === 'GET') {
    const hoy = ahora().slice(0, 10);
    const limite = new Date(Date.now() - DIAS_SIN_TOCAR * 86400000).toISOString();
    const c = await env.DB.prepare(`SELECT
      SUM(estado = 'open') AS activas,
      SUM(estado = 'closed') AS hechas,
      SUM(estado = 'open' AND tipo = 'pendiente' AND responsable_id = ?) AS mios,
      SUM(estado = 'open' AND tipo = 'pendiente' AND ((vence IS NOT NULL AND vence < ?) OR actualizada < ?)) AS revision
      FROM entradas`).bind(yo.id, hoy, limite).first();
    return json(Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? 0])));
  }

  if ((m = /^entradas\/(\d+)\/versiones$/.exec(ruta)) && metodo === 'GET') {
    const r = await env.DB.prepare(`WITH RECURSIVE v(id) AS (SELECT ? UNION ALL
      SELECT e.sustituye_id FROM entradas e JOIN v ON e.id = v.id WHERE e.sustituye_id IS NOT NULL LIMIT 200)
      SELECT * FROM entradas WHERE id IN (SELECT id FROM v) ORDER BY id DESC`).bind(Number(m[1])).all();
    if (!r.results.length) return error('No existe', 404);
    return json({ versiones: r.results.map(entradaDeFila) });
  }

  if (ruta === 'revision' && metodo === 'GET') {
    const hoy = ahora().slice(0, 10);
    const limite = new Date(Date.now() - DIAS_SIN_TOCAR * 86400000).toISOString();
    const r = await env.DB.prepare(`SELECT *, CASE WHEN vence IS NOT NULL AND vence < ? THEN 'vencido' ELSE 'sin_tocar' END AS motivo
      FROM entradas WHERE estado = 'open' AND tipo = 'pendiente' AND ((vence IS NOT NULL AND vence < ?) OR actualizada < ?)
      ORDER BY vence IS NULL, vence, actualizada LIMIT 500`).bind(hoy, hoy, limite).all();
    return json({ entradas: r.results.map(entradaDeFila), dias_sin_tocar: DIAS_SIN_TOCAR });
  }

  if (ruta === 'etiquetas' && metodo === 'GET') {
    const r = await env.DB.prepare(`SELECT j.value AS etiqueta, COUNT(*) AS n FROM entradas e, json_each(e.etiquetas) j
      WHERE e.estado != 'superseded' GROUP BY lower(j.value) ORDER BY n DESC, etiqueta COLLATE NOCASE LIMIT 200`).all();
    return json({ etiquetas: r.results });
  }

  if (ruta === 'estados') {
    const sujeto = async (tipo, idTexto) => {
      if (tipo === 'general') return 0;
      if (tipo !== 'cliente' && tipo !== 'persona') throw new Invalido('Sujeto no válido');
      const id = idOpcional(idTexto, 'Sujeto');
      if (!id) throw new Invalido('Falta el sujeto');
      const tabla = tipo === 'cliente' ? 'clientes' : 'personas';
      if (!(await env.DB.prepare(`SELECT 1 FROM ${tabla} WHERE id = ?`).bind(id).first())) throw new Invalido('El sujeto no existe');
      return id;
    };
    if (metodo === 'GET') {
      const tipo = url.searchParams.get('sujeto_tipo');
      const id = await sujeto(tipo, url.searchParams.get('sujeto_id'));
      const r = await env.DB.prepare('SELECT * FROM estados WHERE sujeto_tipo = ? AND sujeto_id = ? ORDER BY id DESC LIMIT 50').bind(tipo, id).all();
      return json({ historial: r.results });
    }
    if (metodo === 'POST') {
      const d = await leerCuerpo(request);
      const id = await sujeto(d.sujeto_tipo, d.sujeto_id);
      const texto = typeof d.texto === 'string' ? d.texto.trim() : '';
      if (texto.length > MAX_ESTADO) throw new Invalido(`Máximo ${MAX_ESTADO} caracteres. Es la foto actual: breve y sin historia.`);
      const fila = await env.DB.prepare('INSERT INTO estados (sujeto_tipo, sujeto_id, texto, autor_id) VALUES (?, ?, ?, ?) RETURNING *')
        .bind(d.sujeto_tipo, id, texto, yo.id).first();
      return json({ estado: fila }, 201);
    }
  }

  if (ruta === 'clientes' && metodo === 'POST') {
    const d = await leerCuerpo(request);
    const nombre = typeof d.nombre === 'string' ? d.nombre.trim().replace(/\s+/g, ' ') : '';
    if (!nombre || nombre.length > 80) throw new Invalido('Nombre de 1 a 80 caracteres');
    if (await env.DB.prepare('SELECT 1 FROM clientes WHERE nombre = ?').bind(nombre).first()) throw new Invalido('Ya existe un cliente con ese nombre');
    const fila = await env.DB.prepare('INSERT INTO clientes (nombre) VALUES (?) RETURNING *').bind(nombre).first();
    return json({ cliente: fila }, 201);
  }

  if ((m = /^clientes\/(\d+)$/.exec(ruta)) && metodo === 'PATCH') {
    const id = Number(m[1]);
    const actual = await env.DB.prepare('SELECT * FROM clientes WHERE id = ?').bind(id).first();
    if (!actual) return error('No existe', 404);
    const d = await leerCuerpo(request);
    let nombre = actual.nombre;
    if (d.nombre !== undefined) {
      nombre = typeof d.nombre === 'string' ? d.nombre.trim().replace(/\s+/g, ' ') : '';
      if (!nombre || nombre.length > 80) throw new Invalido('Nombre de 1 a 80 caracteres');
      if (await env.DB.prepare('SELECT 1 FROM clientes WHERE nombre = ? AND id != ?').bind(nombre, id).first()) throw new Invalido('Ya existe un cliente con ese nombre');
    }
    const activo = d.activo === undefined ? actual.activo : (d.activo ? 1 : 0);
    const fila = await env.DB.prepare('UPDATE clientes SET nombre = ?, activo = ? WHERE id = ? RETURNING *').bind(nombre, activo, id).first();
    return json({ cliente: fila });
  }

  return error('No encontrado', 404);
}

// ── Entrada ───────────────────────────────────────────────────────────────────────────────────────────────────────
export const esRutaAdmin = (ruta) => ruta === BASE || ruta.startsWith(`${BASE}/`);

export async function panelAdmin(request, env) {
  const url = new URL(request.url);
  // Sin base de datos o sin clave configurada (p. ej. en las vistas previas) el panel no se abre
  if (!env.DB || !env.ADMIN_CLAVE) return responder('Panel no configurado', 503, { 'Content-Type': 'text/plain; charset=utf-8' });

  if (url.pathname === `${BASE}/acceso`) {
    if (request.method !== 'POST') return responder(null, 303, { Location: `${BASE}/` });
    const personas = await personasActivas(env);
    let datos;
    try { datos = await request.formData(); } catch { return pantallaAcceso(personas, 'Formulario no válido'); }
    const persona = personas.find((p) => String(p.id) === String(datos.get('persona') || ''));
    const ip = ipDe(request);
    if (await demasiadosFallos(env, ip)) return pantallaAcceso(personas, 'Demasiados intentos fallidos. Espera 15 minutos.', 429);
    if (!(await claveValida(String(datos.get('clave') || ''), env))) {
      await apuntarFallo(env, ip);
      return pantallaAcceso(personas, 'Clave incorrecta. Inténtalo de nuevo.');
    }
    if (!persona) return pantallaAcceso(personas, 'Elige tu nombre.');
    return responder(null, 303, { Location: `${BASE}/`, 'Set-Cookie': await crearSesion(persona.id, env) });
  }
  if (url.pathname === `${BASE}/salir`) return responder(null, 303, { Location: `${BASE}/`, 'Set-Cookie': cookieSesion('', 0) });

  const yo = await personaDeSesion(request, env);
  if (url.pathname.startsWith(`${BASE}/api/`)) {
    if (!yo) return error('Sesión caducada', 401);
    try {
      return await api(request, env, url, yo);
    } catch (e) {
      if (e instanceof Invalido) return error(e.message, 400);
      console.error(e);
      return error('Error interno', 500);
    }
  }
  if (!yo) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return responder('Acceso restringido', 401);
    return pantallaAcceso(await personasActivas(env), '');
  }

  const r = await env.ASSETS.fetch(request);
  const res = new Response(r.body, r);
  res.headers.set('Cache-Control', 'private, no-cache');
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}
