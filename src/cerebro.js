// Lógica compartida del Cerebro de llume: la usan el panel (src/admin.js) y el servidor MCP (src/mcp.js).
// Datos en D1 (binding DB, esquema en migrations/). Nada se borra:
//   · corregir crea una entrada nueva (sustituye_id → la anterior) y marca la anterior como «superseded»;
//   · cerrar pone «closed» y la saca de las activas (se puede reabrir desde el panel);
//   · cada «estado actual» guardado es una fila nueva (el vigente es el último).

export const MAX_TEXTO = 2000;
export const MAX_ESTADO = 4000;
export const DIAS_SIN_TOCAR = 14;

// ── Respuestas y utilidades ───────────────────────────────────────────────────────────────────────────────────────
const cabecerasBase = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
export const responder = (cuerpo, estado, extra = {}) => new Response(cuerpo, { status: estado, headers: { ...cabecerasBase, ...extra } });
export const json = (datos, estado = 200, extra = {}) =>
  responder(JSON.stringify(datos), estado, { 'Content-Type': 'application/json; charset=utf-8', ...extra });
export const escHtml = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const ahora = () => new Date().toISOString();
export const segundos = () => Math.floor(Date.now() / 1000);

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const deHex = (h) => new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));

export async function sha256(texto) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto)));
}

export function iguales(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Token aleatorio de 256 bits en base64url (sesiones, invitaciones, códigos y tokens OAuth)
export function tokenAleatorio() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Contraseñas: PBKDF2-SHA256 (Workers admite hasta 100 000 iteraciones)
const ITERACIONES = 100000;

async function pbkdf2(clave, sal, iteraciones) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: sal, iterations: iteraciones }, base, 256));
}

export async function hashClave(clave) {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERACIONES}$${hex(sal)}$${await pbkdf2(clave, sal, ITERACIONES)}`;
}

export async function claveCorrecta(clave, guardada) {
  const m = /^pbkdf2\$(\d+)\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(guardada || '');
  if (!m || typeof clave !== 'string' || !clave || clave.length > 200) return false;
  return iguales(await pbkdf2(clave, deHex(m[2]), Number(m[1])), m[3]);
}

// ── Validación ────────────────────────────────────────────────────────────────────────────────────────────────────
export class Invalido extends Error {}

export function idOpcional(v, campo) {
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
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) throw new Invalido('Fecha no válida (AAAA-MM-DD)');
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

export const entradaDeFila = (f) => ({ ...f, etiquetas: JSON.parse(f.etiquetas), enlaces: JSON.parse(f.enlaces) });

// ── Operaciones sobre entradas ────────────────────────────────────────────────────────────────────────────────────
export async function crearEntrada(env, datos, autorId, origen) {
  const c = camposEntrada(datos);
  await comprobarEnlaces(env, c);
  const fila = await env.DB.prepare(`INSERT INTO entradas (tipo, texto, etiquetas, enlaces, cliente_id, persona_id, responsable_id,
    vence, autor_id, origen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(c.tipo, c.texto, c.etiquetas, c.enlaces, c.cliente_id, c.persona_id, c.responsable_id, c.vence, autorId, origen).first();
  return entradaDeFila(fila);
}

// Devuelve la versión nueva. Lanza Invalido con `estado` 404/409 si no se puede.
export async function corregirEntrada(env, id, datos, autorId, origen) {
  const anterior = await env.DB.prepare('SELECT * FROM entradas WHERE id = ?').bind(id).first();
  if (!anterior) throw Object.assign(new Invalido(`La entrada ${id} no existe`), { estado: 404 });
  if (anterior.estado === 'superseded') {
    const ultima = await env.DB.prepare(`WITH RECURSIVE v(id) AS (SELECT ? UNION ALL
      SELECT e.id FROM entradas e JOIN v ON e.sustituye_id = v.id LIMIT 200) SELECT max(id) AS id FROM v`).bind(id).first();
    throw Object.assign(new Invalido(`Esta versión ya se corrigió: corrige la última (id ${ultima.id})`), { estado: 409 });
  }
  const c = camposEntrada(datos, anterior);
  await comprobarEnlaces(env, c);
  const t = ahora();
  // En una transacción: solo se inserta la versión nueva si la anterior seguía vigente (changes() = 1)
  const [, insertada] = await env.DB.batch([
    env.DB.prepare("UPDATE entradas SET estado = 'superseded', actualizada = ? WHERE id = ? AND estado = ?").bind(t, id, anterior.estado),
    env.DB.prepare(`INSERT INTO entradas (tipo, estado, texto, etiquetas, enlaces, cliente_id, persona_id, responsable_id, vence,
      autor_id, origen, sustituye_id, creada, actualizada, cerrada, cerrada_por)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1 RETURNING *`)
      .bind(c.tipo, anterior.estado, c.texto, c.etiquetas, c.enlaces, c.cliente_id, c.persona_id, c.responsable_id, c.vence,
        autorId, origen, id, t, t, anterior.cerrada, anterior.cerrada_por),
  ]);
  if (!insertada.results.length) throw Object.assign(new Invalido('Alguien la cambió a la vez. Vuelve a intentarlo.'), { estado: 409 });
  return entradaDeFila(insertada.results[0]);
}

export async function cerrarEntrada(env, id, personaId) {
  const t = ahora();
  const fila = await env.DB.prepare(`UPDATE entradas SET estado = 'closed', cerrada = ?, cerrada_por = ?, actualizada = ?
    WHERE id = ? AND estado = 'open' RETURNING *`).bind(t, personaId, t, id).first();
  if (!fila) throw Object.assign(new Invalido(`La entrada ${id} no existe o no está abierta`), { estado: 409 });
  return entradaDeFila(fila);
}

export async function reabrirEntrada(env, id) {
  const fila = await env.DB.prepare(`UPDATE entradas SET estado = 'open', cerrada = NULL, cerrada_por = NULL, actualizada = ?
    WHERE id = ? AND estado = 'closed' RETURNING *`).bind(ahora(), id).first();
  if (!fila) throw Object.assign(new Invalido(`La entrada ${id} no existe o no está cerrada`), { estado: 409 });
  return entradaDeFila(fila);
}

export async function versionesEntrada(env, id) {
  const r = await env.DB.prepare(`WITH RECURSIVE v(id) AS (SELECT ? UNION ALL
    SELECT e.sustituye_id FROM entradas e JOIN v ON e.id = v.id WHERE e.sustituye_id IS NOT NULL LIMIT 200)
    SELECT * FROM entradas WHERE id IN (SELECT id FROM v) ORDER BY id DESC`).bind(id).all();
  return r.results.map(entradaDeFila);
}

// Filtros: {estado: 'activas'|'hechas'|'todo', tipo, cliente, persona, responsable, autor, etiqueta, q, limite}
// cliente/persona/responsable/autor admiten un id o 'ninguno'.
export async function listarEntradas(env, f) {
  const donde = [];
  const valores = [];
  const vista = f.estado || 'activas';
  if (vista === 'activas') donde.push("e.estado = 'open'");
  else if (vista === 'hechas') donde.push("e.estado = 'closed'");
  else if (vista === 'todo') donde.push("e.estado != 'superseded'");
  else throw new Invalido('Vista no válida');
  if (f.tipo) {
    if (f.tipo !== 'nota' && f.tipo !== 'pendiente') throw new Invalido('Tipo no válido');
    donde.push('e.tipo = ?');
    valores.push(f.tipo);
  }
  for (const [param, col] of [['cliente', 'cliente_id'], ['persona', 'persona_id'], ['responsable', 'responsable_id'], ['autor', 'autor_id']]) {
    const v = f[param];
    if (v === undefined || v === null || v === '') continue;
    if (v === 'ninguno') { donde.push(`e.${col} IS NULL`); continue; }
    donde.push(`e.${col} = ?`);
    valores.push(idOpcional(v, param));
  }
  if (f.etiqueta) { donde.push('EXISTS (SELECT 1 FROM json_each(e.etiquetas) WHERE lower(value) = lower(?))'); valores.push(f.etiqueta); }
  const q = (f.q || '').trim();
  if (q) { donde.push("e.texto LIKE ? ESCAPE '\\'"); valores.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`); }
  const orden = vista === 'activas'
    ? "CASE e.tipo WHEN 'pendiente' THEN 0 ELSE 1 END, e.vence IS NULL, e.vence, e.actualizada DESC"
    : 'e.actualizada DESC';
  const limite = Math.min(Math.max(Number(f.limite) || 500, 1), 500);
  const r = await env.DB.prepare(`SELECT e.* FROM entradas e WHERE ${donde.join(' AND ')} ORDER BY ${orden} LIMIT ${limite}`).bind(...valores).all();
  return r.results.map(entradaDeFila);
}

// Pendientes abiertos vencidos o sin tocar en DIAS_SIN_TOCAR días (cola de revisión)
export async function revision(env) {
  const hoy = ahora().slice(0, 10);
  const limite = new Date(Date.now() - DIAS_SIN_TOCAR * 86400000).toISOString();
  const r = await env.DB.prepare(`SELECT *, CASE WHEN vence IS NOT NULL AND vence < ? THEN 'vencido' ELSE 'sin_tocar' END AS motivo
    FROM entradas WHERE estado = 'open' AND tipo = 'pendiente' AND ((vence IS NOT NULL AND vence < ?) OR actualizada < ?)
    ORDER BY vence IS NULL, vence, actualizada LIMIT 500`).bind(hoy, hoy, limite).all();
  return r.results.map(entradaDeFila);
}

export async function contadores(env, personaId) {
  const hoy = ahora().slice(0, 10);
  const limite = new Date(Date.now() - DIAS_SIN_TOCAR * 86400000).toISOString();
  const c = await env.DB.prepare(`SELECT
    SUM(estado = 'open') AS activas,
    SUM(estado = 'closed') AS hechas,
    SUM(estado = 'open' AND tipo = 'pendiente' AND responsable_id = ?) AS mios,
    SUM(estado = 'open' AND tipo = 'pendiente' AND ((vence IS NOT NULL AND vence < ?) OR actualizada < ?)) AS revision
    FROM entradas`).bind(personaId, hoy, limite).first();
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v ?? 0]));
}

export async function listaEtiquetas(env) {
  const r = await env.DB.prepare(`SELECT j.value AS etiqueta, COUNT(*) AS n FROM entradas e, json_each(e.etiquetas) j
    WHERE e.estado != 'superseded' GROUP BY lower(j.value) ORDER BY n DESC, etiqueta COLLATE NOCASE LIMIT 200`).all();
  return r.results;
}

// ── Estado actual ─────────────────────────────────────────────────────────────────────────────────────────────────
// Sujeto: 'general' (id 0), 'cliente' o 'persona'. Devuelve el id comprobado.
export async function comprobarSujeto(env, tipo, idTexto) {
  if (tipo === 'general') return 0;
  if (tipo !== 'cliente' && tipo !== 'persona') throw new Invalido('Sujeto no válido');
  const id = idOpcional(idTexto, 'Sujeto');
  if (!id) throw new Invalido('Falta el sujeto');
  const tabla = tipo === 'cliente' ? 'clientes' : 'personas';
  if (!(await env.DB.prepare(`SELECT 1 FROM ${tabla} WHERE id = ?`).bind(id).first())) throw new Invalido('El sujeto no existe');
  return id;
}

export async function historialEstado(env, tipo, id, limite = 50) {
  const r = await env.DB.prepare('SELECT * FROM estados WHERE sujeto_tipo = ? AND sujeto_id = ? ORDER BY id DESC LIMIT ?').bind(tipo, id, limite).all();
  return r.results;
}

export async function guardarEstado(env, tipo, id, texto, autorId) {
  const t = typeof texto === 'string' ? texto.trim() : '';
  if (t.length > MAX_ESTADO) throw new Invalido(`Máximo ${MAX_ESTADO} caracteres. Es la foto actual: breve y sin historia.`);
  return env.DB.prepare('INSERT INTO estados (sujeto_tipo, sujeto_id, texto, autor_id) VALUES (?, ?, ?, ?) RETURNING *')
    .bind(tipo, id, t, autorId).first();
}
