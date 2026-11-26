// OAuth 2.1 del conector MCP del Cerebro (ver src/mcp.js). Clientes públicos con PKCE S256, sin secreto de cliente.
//
//   GET  /.well-known/oauth-protected-resource[/mcp]    metadatos del recurso (RFC 9728)
//   GET  /.well-known/oauth-authorization-server[/...]  metadatos del servidor de autorización (RFC 8414)
//   POST /oauth/registro                                registro dinámico (RFC 7591), solo con redirects permitidos
//   GET  /admin/oauth/autorizar                         pantalla de consentimiento (usa la sesión del panel)
//   POST /admin/oauth/autorizar                         decisión → redirige con ?code=…&state=…&iss=…
//   POST /oauth/token                                   authorization_code (+PKCE) y refresh_token (con rotación)
//
// Códigos: un solo uso, 5 minutos. Access token: 1 hora. Refresh: 60 días, cambia en cada uso. Todo se guarda como sha256.
// Redirects permitidos: https://claude.ai, https://claude.com, https://chatgpt.com y loopback (http://localhost,
// 127.0.0.1, [::1]) para Claude Code y Claude Desktop.
import { json, responder, escHtml, sha256, segundos, tokenAleatorio } from './cerebro.js';
import { BASE, personaDeSesion, pantallaAcceso, pagina, origenValido } from './admin.js';

export const RUTA_AUTORIZAR = `${BASE}/oauth/autorizar`;
const SEG_CODIGO = 5 * 60;
const SEG_ACCESS = 60 * 60;
const SEG_REFRESH = 60 * 86400;
const MAX_CLIENTES = 1000;
const HOSTS_PERMITIDOS = { 'claude.ai': 'claude', 'claude.com': 'claude', 'chatgpt.com': 'chatgpt' };
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version' };
const jsonCors = (datos, estado = 200) => json(datos, estado, cors);
const errorOAuth = (codigo, descripcion, estado = 400) => jsonCors({ error: codigo, error_description: descripcion }, estado);

// Origen de un redirect permitido ('claude' | 'chatgpt'), o null si no se admite
function origenDeRedirect(uri) {
  let u;
  try { u = new URL(uri); } catch { return null; }
  if (u.hash || uri.length > 500) return null;
  if (u.protocol === 'https:' && HOSTS_PERMITIDOS[u.hostname]) return HOSTS_PERMITIDOS[u.hostname];
  if (u.protocol === 'http:' && LOOPBACK.has(u.hostname)) return 'claude';
  return null;
}

// ── Metadatos ─────────────────────────────────────────────────────────────────────────────────────────────────────
export const recursoMcp = (origen) => `${origen}/mcp`;
export const urlMetadatosRecurso = (origen) => `${origen}/.well-known/oauth-protected-resource`;

export function esRutaMetadatos(ruta) {
  return /^\/\.well-known\/(oauth-protected-resource|oauth-authorization-server)(\/.*)?$/.test(ruta);
}

export function metadatos(request, url) {
  if (request.method === 'OPTIONS') return responder(null, 204, cors);
  const o = url.origin;
  if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) {
    return jsonCors({
      resource: recursoMcp(o), authorization_servers: [o], scopes_supported: ['cerebro'],
      bearer_methods_supported: ['header'], resource_name: 'Cerebro de llume',
    });
  }
  return jsonCors({
    issuer: o,
    authorization_endpoint: `${o}${RUTA_AUTORIZAR}`,
    token_endpoint: `${o}/oauth/token`,
    registration_endpoint: `${o}/oauth/registro`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['cerebro'],
    authorization_response_iss_parameter_supported: true,
  });
}

// ── Registro dinámico ─────────────────────────────────────────────────────────────────────────────────────────────
export async function registro(request, env) {
  if (request.method === 'OPTIONS') return responder(null, 204, cors);
  if (request.method !== 'POST') return responder(null, 405, { Allow: 'POST', ...cors });
  const texto = await request.text();
  if (texto.length > 10000) return errorOAuth('invalid_client_metadata', 'Petición demasiado grande');
  let d;
  try { d = JSON.parse(texto); } catch { return errorOAuth('invalid_client_metadata', 'JSON no válido'); }
  const uris = Array.isArray(d?.redirect_uris) ? d.redirect_uris : [];
  if (!uris.length || uris.length > 10) return errorOAuth('invalid_redirect_uri', 'Hacen falta entre 1 y 10 redirect_uris');
  const origenes = uris.map((u) => (typeof u === 'string' ? origenDeRedirect(u) : null));
  if (origenes.includes(null)) return errorOAuth('invalid_redirect_uri', 'Solo se admiten Claude, ChatGPT y direcciones locales (loopback)');
  if (d.token_endpoint_auth_method && d.token_endpoint_auth_method !== 'none') {
    return errorOAuth('invalid_client_metadata', 'Solo clientes públicos (token_endpoint_auth_method «none») con PKCE');
  }
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM oauth_clientes').first();
  if (n.n >= MAX_CLIENTES) return errorOAuth('temporarily_unavailable', 'Demasiados clientes registrados', 503);
  const nombre = (typeof d.client_name === 'string' && d.client_name.trim().slice(0, 80)) || (origenes[0] === 'chatgpt' ? 'ChatGPT' : 'Claude');
  const origen = origenes.includes('chatgpt') ? 'chatgpt' : 'claude';
  const clientId = `llume_${tokenAleatorio()}`;
  const t = segundos();
  await env.DB.prepare('INSERT INTO oauth_clientes (client_id, nombre, redirect_uris, origen, creado) VALUES (?, ?, ?, ?, ?)')
    .bind(clientId, nombre, JSON.stringify(uris), origen, t).run();
  return jsonCors({
    client_id: clientId, client_id_issued_at: t, client_name: nombre, redirect_uris: uris,
    token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
  }, 201);
}

// ── Autorización (consentimiento) ─────────────────────────────────────────────────────────────────────────────────
const CAMPOS = ['response_type', 'client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'scope', 'resource'];

function paginaError(mensaje) {
  return pagina('llume · No se puede conectar', `<div class="caja"><h1>llume<span>.</span> cerebro</h1>
<p>No se puede completar la conexión: ${escHtml(mensaje)}</p><p>Vuelve a tu asistente e inténtalo de nuevo desde el principio.</p></div>`, 400);
}

function volverConError(p, codigo, descripcion, origen) {
  const u = new URL(p.redirect_uri);
  u.searchParams.set('error', codigo);
  u.searchParams.set('error_description', descripcion);
  if (p.state) u.searchParams.set('state', p.state);
  u.searchParams.set('iss', origen);
  return responder(null, 303, { Location: u.href });
}

// Valida la petición. Devuelve {cliente} o {respuesta} con el error (página propia si no hay redirect fiable).
async function validarPeticion(env, p, origen) {
  if (!p.client_id || !p.redirect_uri) return { respuesta: paginaError('faltan client_id o redirect_uri.') };
  const cliente = await env.DB.prepare('SELECT * FROM oauth_clientes WHERE client_id = ?').bind(p.client_id).first();
  if (!cliente) return { respuesta: paginaError('este asistente no está registrado. Quita el conector y vuelve a añadirlo.') };
  if (!JSON.parse(cliente.redirect_uris).includes(p.redirect_uri)) return { respuesta: paginaError('la dirección de vuelta no coincide con la registrada.') };
  if (p.response_type !== 'code') return { respuesta: volverConError(p, 'unsupported_response_type', 'Solo response_type=code', origen) };
  if (p.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge || '')) {
    return { respuesta: volverConError(p, 'invalid_request', 'PKCE S256 obligatorio', origen) };
  }
  if (p.resource && p.resource.replace(/\/$/, '') !== recursoMcp(origen)) {
    return { respuesta: volverConError(p, 'invalid_target', 'Recurso desconocido', origen) };
  }
  return { cliente };
}

function pantallaConsentimiento(cliente, yo, p) {
  const ocultos = CAMPOS.filter((k) => p[k]).map((k) => `<input type="hidden" name="${k}" value="${escHtml(p[k])}">`).join('\n');
  const destino = new URL(p.redirect_uri);
  return pagina('llume · Conectar asistente', `<form class="caja" method="post" action="${RUTA_AUTORIZAR}">
<h1>llume<span>.</span> cerebro</h1>
<p><strong>${escHtml(cliente.nombre)}</strong> (${escHtml(destino.host)}) quiere conectarse al Cerebro de llume en tu nombre,
<strong>${escHtml(yo.nombre)}</strong>. Podrá:</p>
<ul><li>leer las notas, los pendientes y el estado actual de clientes y personas;</li>
<li>apuntar, corregir y cerrar entradas, que quedarán firmadas por ti.</li></ul>
<p>No puede borrar nada. Puedes revocar el acceso cuando quieras en la pestaña Accesos del panel.</p>
${ocultos}
<button type="submit" name="decision" value="permitir">Permitir</button>
<button type="submit" name="decision" value="denegar" class="secundario">Cancelar</button>
</form>`);
}

export async function autorizar(request, env) {
  const url = new URL(request.url);
  if (!env.DB) return responder('No configurado', 503);
  let p;
  if (request.method === 'GET') {
    p = Object.fromEntries(CAMPOS.map((k) => [k, url.searchParams.get(k) || '']));
  } else if (request.method === 'POST') {
    if (!origenValido(request, url)) return paginaError('origen no permitido.');
    let datos;
    try { datos = await request.formData(); } catch { return paginaError('formulario no válido.'); }
    p = Object.fromEntries([...CAMPOS, 'decision'].map((k) => [k, String(datos.get(k) || '')]));
  } else {
    return responder(null, 405, { Allow: 'GET, POST' });
  }
  const v = await validarPeticion(env, p, url.origin);
  if (v.respuesta) return v.respuesta;

  const yo = await personaDeSesion(request, env);
  if (!yo) {
    // Sin sesión: primero hay que entrar al panel; después se vuelve aquí con los mismos parámetros
    if (request.method !== 'GET') return paginaError('tu sesión ha caducado.');
    const personas = (await env.DB.prepare('SELECT id, nombre FROM personas WHERE activa = 1 AND clave IS NOT NULL ORDER BY nombre').all()).results;
    return pantallaAcceso(personas, url.pathname + url.search, '', 200);
  }
  if (request.method === 'GET') return pantallaConsentimiento(v.cliente, yo, p);

  if (p.decision !== 'permitir') return volverConError(p, 'access_denied', 'La persona ha cancelado la conexión', url.origin);
  const codigo = tokenAleatorio();
  const t = segundos();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO oauth_codigos (hash, client_id, persona_id, redirect_uri, code_challenge, caduca)
      VALUES (?, ?, ?, ?, ?, ?)`).bind(await sha256(codigo), p.client_id, yo.id, p.redirect_uri, p.code_challenge, t + SEG_CODIGO),
    env.DB.prepare('DELETE FROM oauth_codigos WHERE caduca < ?').bind(t - 86400),
  ]);
  const u = new URL(p.redirect_uri);
  u.searchParams.set('code', codigo);
  if (p.state) u.searchParams.set('state', p.state);
  u.searchParams.set('iss', url.origin);
  return responder(null, 303, { Location: u.href });
}

// ── Token ─────────────────────────────────────────────────────────────────────────────────────────────────────────
async function retoPkce(verificador) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador));
  return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function emitirTokens(env, { conexionId, refreshAnterior, clientId, personaId }) {
  const access = tokenAleatorio();
  const refresh = tokenAleatorio();
  const t = segundos();
  const [ah, rh] = [await sha256(access), await sha256(refresh)];
  if (conexionId) {
    // Rotación: solo si el refresh sigue siendo el mismo (dos renovaciones a la vez con el mismo refresh: gana una)
    const r = await env.DB.prepare(`UPDATE oauth_conexiones SET access_hash = ?, access_caduca = ?, refresh_hash = ?, refresh_caduca = ?
      WHERE id = ? AND refresh_hash = ? AND revocada IS NULL`).bind(ah, t + SEG_ACCESS, rh, t + SEG_REFRESH, conexionId, refreshAnterior).run();
    if (!r.meta.changes) return errorOAuth('invalid_grant', 'Refresh token ya usado');
  } else {
    await env.DB.prepare(`INSERT INTO oauth_conexiones (client_id, persona_id, access_hash, access_caduca, refresh_hash, refresh_caduca, creada)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(clientId, personaId, ah, t + SEG_ACCESS, rh, t + SEG_REFRESH, t).run();
  }
  return jsonCors({ access_token: access, token_type: 'Bearer', expires_in: SEG_ACCESS, refresh_token: refresh, scope: 'cerebro' });
}

export async function token(request, env) {
  if (request.method === 'OPTIONS') return responder(null, 204, cors);
  if (request.method !== 'POST') return responder(null, 405, { Allow: 'POST', ...cors });
  let p;
  try {
    const tipo = request.headers.get('Content-Type') || '';
    p = tipo.includes('application/json') ? await request.json() : Object.fromEntries(await request.formData());
  } catch { return errorOAuth('invalid_request', 'Cuerpo no válido'); }
  const str = (k) => (typeof p[k] === 'string' ? p[k] : '');
  const t = segundos();

  if (str('grant_type') === 'authorization_code') {
    if (!str('code') || !str('code_verifier') || !str('client_id')) return errorOAuth('invalid_request', 'Faltan code, code_verifier o client_id');
    // Marca el código como usado de forma atómica: un segundo intento con el mismo código no devuelve fila
    const c = await env.DB.prepare('UPDATE oauth_codigos SET usado = ? WHERE hash = ? AND usado IS NULL AND caduca > ? RETURNING *')
      .bind(t, await sha256(str('code')), t).first();
    if (!c || c.client_id !== str('client_id')) return errorOAuth('invalid_grant', 'Código no válido, caducado o ya usado');
    if (str('redirect_uri') && str('redirect_uri') !== c.redirect_uri) return errorOAuth('invalid_grant', 'redirect_uri no coincide');
    if ((await retoPkce(str('code_verifier'))) !== c.code_challenge) return errorOAuth('invalid_grant', 'PKCE no válido');
    if (!(await env.DB.prepare('SELECT 1 FROM personas WHERE id = ? AND activa = 1').bind(c.persona_id).first())) {
      return errorOAuth('invalid_grant', 'La persona está desactivada');
    }
    return emitirTokens(env, { clientId: c.client_id, personaId: c.persona_id });
  }

  if (str('grant_type') === 'refresh_token') {
    if (!str('refresh_token')) return errorOAuth('invalid_request', 'Falta refresh_token');
    const c = await env.DB.prepare(`SELECT c.* FROM oauth_conexiones c JOIN personas p ON p.id = c.persona_id
      WHERE c.refresh_hash = ? AND c.revocada IS NULL AND c.refresh_caduca > ? AND p.activa = 1`).bind(await sha256(str('refresh_token')), t).first();
    if (!c || (str('client_id') && str('client_id') !== c.client_id)) return errorOAuth('invalid_grant', 'Refresh token no válido, caducado o revocado');
    return emitirTokens(env, { conexionId: c.id, refreshAnterior: c.refresh_hash });
  }

  return errorOAuth('unsupported_grant_type', 'Solo authorization_code y refresh_token');
}
