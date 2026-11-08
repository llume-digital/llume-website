// Prueba del .apk en un emulador de Android: con la app abierta, se conecta a su WebView por el protocolo
// de depuración de Chrome (adb forward) y recorre lo básico: arranca Python, entra, genera una semana y
// comprueba que se guarda. Uso: node movil/probar_apk.mjs http://localhost:9222
// Android puede recrear la actividad justo después de abrirla (y con ella la página): entonces se pierde la
// conexión y se vuelve a empezar con la página nueva, hasta tres veces.
const base = process.argv[2] || 'http://localhost:9222';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function pagina() {
  for (let i = 0; i < 60; i++) {
    try {
      const lista = await (await fetch(`${base}/json`)).json();
      const p = lista.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* aún no está */ }
    await espera(2000);
  }
  throw new Error('No aparece la WebView de la app');
}

async function conectar() {
  const ws = new WebSocket(await pagina());
  await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = () => mal(new Error('No se pudo conectar a la WebView')); });
  let id = 0;
  const pendientes = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendientes.has(m.id)) { pendientes.get(m.id).ok(m); pendientes.delete(m.id); }
  };
  ws.onclose = () => {
    for (const p of pendientes.values()) p.mal(new Error('Se cerró la página'));
    pendientes.clear();
  };
  async function evaluar(expr) {
    if (ws.readyState !== WebSocket.OPEN) throw new Error('Se cerró la página');
    const n = ++id;
    const r = await new Promise((ok, mal) => {
      pendientes.set(n, { ok, mal });
      ws.send(JSON.stringify({ id: n, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
    });
    if (r.error) throw new Error(`CDP: ${JSON.stringify(r.error)}`);
    if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 2000));
    return r.result.result.value;
  }
  return { evaluar, cerrar: () => ws.close() };
}

async function recorrido({ evaluar }) {
  const api = (metodo, ruta, cuerpo) => evaluar(`fetch(${JSON.stringify(ruta)}, { method: ${JSON.stringify(metodo)},
    headers: { 'Content-Type': 'application/json' }, body: ${cuerpo === undefined ? 'undefined' : JSON.stringify(JSON.stringify(cuerpo))} })
    .then(async (r) => [r.status, await r.json()])`);
  const t0 = Date.now();
  console.log('Navegador:', await evaluar('navigator.userAgent'));
  for (;;) {
    const estado = await evaluar(`[!!document.querySelector('input[name=usuario]'), (document.getElementById('cargando-texto') || {}).textContent || '']`);
    if (estado[0]) break;
    if (/No se pudo arrancar/.test(estado[1])) throw Object.assign(new Error(estado[1]), { definitivo: true });
    if (Date.now() - t0 > 240000) throw Object.assign(new Error(`No arranca: ${estado[1]}`), { definitivo: true });
    await espera(1000);
  }
  console.log(`Arranque: ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const [s1] = await api('POST', '/api/login', { usuario: 'admin', password: 'lopita' });
  if (s1 !== 200) throw new Error(`Entrar: ${s1}`);
  const t1 = Date.now();
  const [s2, h] = await api('POST', '/api/horarios/generar', { desde: '2026-11-09', hasta: '2026-11-15' });
  if (s2 !== 200 || !h.horario.asignaciones.length) throw new Error(`Generar: ${s2} ${JSON.stringify(h).slice(0, 500)}`);
  console.log(`Semana generada en ${((Date.now() - t1) / 1000).toFixed(1)} s con ${h.horario.asignaciones.length} turnos`);
  const [s3, lista] = await api('GET', '/api/horarios');
  if (s3 !== 200 || !lista.length) throw new Error(`Lista: ${s3}`);
}

for (let intento = 1; ; intento++) {
  let conexion;
  try {
    conexion = await conectar();
    await recorrido(conexion);
    console.log('APK correcto');
    conexion.cerrar();
    process.exit(0);
  } catch (e) {
    conexion?.cerrar();
    console.log(`Intento ${intento}: ${e.message}`);
    if (e.definitivo || intento >= 3) process.exit(1);
    await espera(5000);
  }
}
