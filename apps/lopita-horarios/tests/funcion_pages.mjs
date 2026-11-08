// Comprueba la función de Cloudflare Pages que reenvía los formularios de la web a la intranet (sin red: fetch simulado).
import { onRequest } from '../functions/api/web/[[ruta]].js';
import assert from 'node:assert';
let visto;
globalThis.fetch = async (url, init) => { visto = { url: String(url), init }; return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'x=1' } }); };
const env = { INTRANET_URL: 'https://horarios.ej.com', LOPITA_PROXY_SECRETO: 's', ACCESS_CLIENT_ID: 'id', ACCESS_CLIENT_SECRET: 'sec' };
const req = (m, p, h = {}) => new Request('https://lopita.ej.com' + p, { method: m, headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', cookie: 'CF_Authorization=abc', origin: 'https://lopita.ej.com', ...h }, body: m === 'POST' ? '{}' : undefined, duplex: 'half' });
let r = await onRequest({ request: req('POST', '/api/web/catering'), env });
assert.equal(r.status, 200); assert.equal(visto.url, 'https://horarios.ej.com/api/web/catering');
const h = visto.init.headers; assert.equal(h.get('x-lopita-ip'), '1.2.3.4'); assert.equal(h.get('cf-access-client-id'), 'id'); assert.equal(h.get('cookie'), null); assert.equal(h.get('origin'), null);
assert.equal(r.headers.get('set-cookie'), null);
visto = null; r = await onRequest({ request: req('GET', '/api/web/mensajes'), env }); assert.equal(r.status, 404); assert.equal(visto, null);
r = await onRequest({ request: req('GET', '/api/web/documentos/carta-comidas'), env }); assert.equal(visto.url, 'https://horarios.ej.com/api/web/documentos/carta-comidas');
r = await onRequest({ request: req('POST', '/api/web/catering'), env: {} }); assert.equal(r.status, 503);
console.log('ok');
