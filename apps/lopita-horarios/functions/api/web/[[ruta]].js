// Cloudflare Pages Function: la web de Lopita está en Pages y sus formularios y la carta los sirve la intranet.
// Reenvía solo esas rutas a la intranet (INTRANET_URL), sin cookies ni Origin del visitante, con la IP del visitante
// en X-Lopita-IP (la intranet solo la cree si llega con LOPITA_PROXY_SECRETO) y, si la intranet está detrás de
// Cloudflare Access, con el token de servicio (ACCESS_CLIENT_ID / ACCESS_CLIENT_SECRET).
const PERMITIDAS = [
  ['POST', /^\/api\/web\/(candidatura|catering)$/],
  ['GET', /^\/api\/web\/documentos\/[a-z-]+$/],
];
const CABECERAS_RESPUESTA = ['content-type', 'content-disposition', 'x-content-type-options', 'retry-after'];

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (!PERMITIDAS.some(([m, ruta]) => m === request.method && ruta.test(url.pathname))) {
    return new Response('{"detail":"No encontrado"}', { status: 404, headers: { 'content-type': 'application/json' } });
  }
  if (!env.INTRANET_URL || !env.LOPITA_PROXY_SECRETO) {
    return new Response('{"detail":"La web no está conectada a la intranet"}', { status: 503, headers: { 'content-type': 'application/json' } });
  }
  const destino = new URL(url.pathname, env.INTRANET_URL);
  const cabeceras = new Headers({
    'X-Lopita-Proxy': env.LOPITA_PROXY_SECRETO,
    'X-Lopita-IP': request.headers.get('CF-Connecting-IP') || '',
  });
  const tipo = request.headers.get('content-type');
  if (tipo) cabeceras.set('content-type', tipo);
  if (env.ACCESS_CLIENT_ID && env.ACCESS_CLIENT_SECRET) {
    cabeceras.set('CF-Access-Client-Id', env.ACCESS_CLIENT_ID);
    cabeceras.set('CF-Access-Client-Secret', env.ACCESS_CLIENT_SECRET);
  }
  const resp = await fetch(destino, {
    method: request.method,
    headers: cabeceras,
    body: request.method === 'POST' ? request.body : undefined,
    redirect: 'manual',
  });
  const salida = new Headers();
  for (const k of CABECERAS_RESPUESTA) {
    const v = resp.headers.get(k);
    if (v) salida.set(k, v);
  }
  return new Response(resp.body, { status: resp.status, headers: salida });
}
