/* =====================================================================
   Nar&Co · capa de datos compartida (web pública + panel de Mateo)
   DEMO: sin servidor. Todo vive en localStorage (clave `naranco_demo_v1`)
   y se siembra con datos de ejemplo (semilla fija) la primera vez.
   Funciona aunque localStorage falle (queda en memoria durante la visita).

   FECHAS: siempre ISO `YYYY-MM-DD`. Un alquiler "desde–hasta" cuenta ambos
   días (desde 12-05 hasta 12-06 = 2 días). `dias(desde, hasta)` lo calcula.

   API (global `NC`)
   ── Utilidades
   NC.iso(Date) → 'YYYY-MM-DD'          NC.parse('YYYY-MM-DD') → Date (12:00)
   NC.hoy  → Date (hoy 00:00)           NC.mas(n) → Date (hoy + n días)
   NC.isoMas(n) → ISO de hoy + n        NC.sumaDias(iso, n) → ISO
   NC.dias(desdeISO, hastaISO) → nº de días del alquiler (inclusive)
   NC.esc(v) → texto escapado para HTML
   NC.eur(n) → '1.234,50 €' (es-ES, sin decimales si son .00)
   NC.ahora() → fecha-hora ISO local 'YYYY-MM-DDTHH:MM:SS'
   ── Configuración
   NC.config() → {negocio:{id,nombre}, tipos:[{id,nombre:{es,en},precio}], tallas:['S','M','L'],
                  descuentos:[0,5,10,15] (€ menos en el día 1,2,3,4), diasMaxPrecio:4,
                  extras:[{id,nombre:{es,en},precio|null,incluido,tipo:'por_bici'|'por_reserva'|'presupuesto'}],
                  senalPct:20, colectivos:[{codigo,nombre,descuento(%),activo}],
                  cancelacion:{horas:24, texto:{es,en}}, diasBloqueados:['YYYY-MM-DD',…]}
   NC.guardarConfig(cfg)   NC.tipo(id) → tipo de bici (o undefined)
   NC.extra(id) → extra (o undefined)
   NC.validarCodigo(codigo) → colectivo activo o null (no distingue mayúsculas)
   ── Stock y disponibilidad
   NC.stock() → {carretera:{S:1,M:2,L:1}, gravel:{…}, emtb:{…}}   NC.guardarStock(s)
   NC.disponibles(tipo, talla, desdeISO, hastaISO) → unidades libres (0 si hay día bloqueado).
       Descuenta reservas `pendiente` y `confirmada` que se solapan (el máximo diario).
   NC.diaBloqueado(iso) → boolean
   NC.ocupacion(iso) → {total, usadas} unidades de bici ocupadas ese día (para calendarios del panel)
   ── Precio
   NC.precio({lineas:[{tipo,talla,cantidad}], dias, extras:{id:cantidad}, entrega:'local'|'oviedo'|'fuera', codigo})
     → {dias, consultar:boolean, motivo:null|'dias'|'entrega',
        lineas:[{tipo,talla,cantidad,porBici,importe,detalle:[{dia,precio}]}],
        extras:[{id,cantidad,precioUd,importe,incluido}], entrega:{tipo,importe},
        alquiler, descuentoDias (ahorro frente a tarifa plana), extrasTotal,
        colectivo:null|{codigo,nombre,descuento}, descuentoColectivo,
        subtotal, total, senal, resto}
     El descuento de colectivo se aplica solo sobre el alquiler de las bicis.
     Con 5+ días o entrega 'fuera': consultar=true y los importes de alquiler no se calculan (total 0).
   ── Reservas
   NC.reservas() → [reserva] (más recientes primero)   NC.reserva(id)
   NC.crearReserva(datos) → reserva. datos: {desde,hasta,lineas,extras,entrega,direccion,codigo,
        cliente:{nombre,email,telefono,altura,documento}, novedades, idioma, sesion, origen}
        Calcula precio; estado inicial `pendiente` y pago `retenido`
        (o estado `presupuesto` y pago `ninguno` si consultar=true).
   NC.cambiarEstado(id, estado, opts?) → reserva
        pendiente → confirmada (pago cobrado) | rechazada (pago liberado)
        cualquiera → cancelada (opts.devolverSenal=true ⇒ pago `devuelto`; retenido ⇒ `liberado`)
        confirmada → completada. presupuesto → pendiente/confirmada/rechazada.
   NC.marcarRespondido(id, v=true) → marca un presupuesto como respondido (reserva.respondido; lo usa el panel)
   NC.cancelacionGratis(reserva) → boolean (faltan más de `cancelacion.horas` h para `desde`)
   Reserva: {id:'NC-1042', creada:'ISO fecha-hora', estado, pago:'retenido'|'cobrado'|'liberado'|'devuelto'|'ninguno',
     desde, hasta, dias, lineas:[{tipo,talla,cantidad}], extras:{id:n}, entrega, direccion, codigo, colectivo:null|{codigo,nombre,descuento},
     precio:{…desglose de NC.precio}, total, senal, resto,
     cliente:{nombre,email,telefono,altura,documento}, novedades:boolean, idioma:'es'|'en', origen, sesion,
     notas, historial:[{estado,fecha}]}
   NC.ESTADOS → {pendiente:'Pendiente de confirmar', confirmada:…, …} (etiquetas en español para el panel)
   ── Embudo
   NC.evento(sesionId, paso, datos) → registra {id,sesion,paso(1..5),fecha,datos:{tipo,talla,dias,desde,hasta,idioma,lineas,total…}}
        paso 1 fechas/bici · 2 extras · 3 datos · 4 pago · 5 enviada
   NC.eventos() → [evento]    NC.embudo(desdeISO?) → [{paso, sesiones}] sesiones distintas que llegaron a cada paso
   ── Consultas de contacto
   NC.MOTIVOS → [{id:'talla'|'fechas'|'bici'|'precio'|'entrega'|'otro', es, en}]
   NC.crearConsulta({motivo,tipo,talla,fechas,mensaje,nombre,contacto}) → consulta
   NC.consultas() → [{id,fecha,motivo,tipo,talla,fechas,mensaje,nombre,contacto,estado:'nueva'|'atendida'}]
   NC.cambiarConsulta(id, estado)
   ── Visitas (métricas)
   NC.ORIGENES → [{id:'google'|'maps'|'instagram'|'directo'|'otros', nombre}]
   NC.visitas → [{fecha, total, origen:{google,maps,instagram,directo,otros}}] (un elemento por día)
   NC.registrarVisita(origen?) → suma 1 visita hoy (la web lo llama una vez por sesión)
   ── Otros
   NC.reset() → borra y vuelve a sembrar los datos de ejemplo
   NC.ID_SESION() → id aleatorio de sesión (para NC.evento)
   ===================================================================== */
const NC = (() => {
  const KEY = 'naranco_demo_v1', VERSION = 1;
  const p2 = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const parse = s => new Date(s + 'T12:00:00');
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const mas = n => { const d = new Date(hoy); d.setDate(d.getDate() + n); return d; };
  const isoMas = n => iso(mas(n));
  const sumaDias = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const dias = (a, b) => Math.round((parse(b) - parse(a)) / 864e5) + 1;
  const ahora = (d = new Date()) => `${iso(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => { n = Math.round((+n || 0) * 100) / 100; return n.toLocaleString('es-ES', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 }) + ' €'; };
  const r2 = n => Math.round(n * 100) / 100;
  const ID_SESION = () => 's' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  const ESTADOS = { pendiente: 'Pendiente de confirmar', confirmada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada', completada: 'Completada', presupuesto: 'Presupuesto' };
  const MOTIVOS = [
    { id: 'talla', es: 'Tallas', en: 'Sizes' }, { id: 'fechas', es: 'Fechas', en: 'Dates' },
    { id: 'bici', es: 'Tipo de bici', en: 'Bike type' }, { id: 'precio', es: 'Precios', en: 'Prices' },
    { id: 'entrega', es: 'Entrega', en: 'Delivery' }, { id: 'otro', es: 'Otros', en: 'Other' },
  ];
  const ORIGENES = [{ id: 'google', nombre: 'Búsqueda en Google' }, { id: 'maps', nombre: 'Google Maps / perfil' }, { id: 'instagram', nombre: 'Instagram' }, { id: 'directo', nombre: 'Directo' }, { id: 'otros', nombre: 'Otros' }];

  const configBase = () => ({
    negocio: { id: 'naranco', nombre: 'Nar&Co' },
    tipos: [
      { id: 'carretera', nombre: { es: 'Carretera', en: 'Road' }, precio: 60 },
      { id: 'gravel', nombre: { es: 'Gravel', en: 'Gravel' }, precio: 50 },
      { id: 'emtb', nombre: { es: 'eMTB', en: 'eMTB' }, precio: 50 },
    ],
    tallas: ['S', 'M', 'L'],
    descuentos: [0, 5, 10, 15],
    diasMaxPrecio: 4,
    extras: [
      { id: 'casco', nombre: { es: 'Casco', en: 'Helmet' }, precio: 0, incluido: true, tipo: 'por_bici' },
      { id: 'luz', nombre: { es: 'Luz trasera', en: 'Rear light' }, precio: 0, incluido: true, tipo: 'por_bici' },
      { id: 'garmin', nombre: { es: 'Soporte Garmin', en: 'Garmin mount' }, precio: 0, incluido: true, tipo: 'por_bici' },
      { id: 'candado', nombre: { es: 'Candado', en: 'Lock' }, precio: 3, incluido: false, tipo: 'por_bici' },
      { id: 'portabultos', nombre: { es: 'Portabultos / alforjas', en: 'Rack / panniers' }, precio: 5, incluido: false, tipo: 'por_bici' },
      { id: 'movil', nombre: { es: 'Soporte de móvil', en: 'Phone mount' }, precio: 5, incluido: false, tipo: 'por_bici' },
      { id: 'entrega_oviedo', nombre: { es: 'Entrega y recogida en Oviedo', en: 'Delivery and pick-up in Oviedo' }, precio: 30, incluido: false, tipo: 'por_reserva' },
      { id: 'entrega_fuera', nombre: { es: 'Entrega fuera de Oviedo', en: 'Delivery outside Oviedo' }, precio: null, incluido: false, tipo: 'presupuesto' },
    ],
    senalPct: 20,
    colectivos: [
      { codigo: 'MIR2027', nombre: 'MIR Asturias', descuento: 15, activo: true },
      { codigo: 'CASTURIANO', nombre: 'Centro Asturiano', descuento: 10, activo: true },
    ],
    cancelacion: {
      horas: 24,
      texto: {
        es: 'Cancelación gratuita hasta 24 horas antes del inicio del alquiler: te devolvemos la señal. Pasado ese plazo, la señal no se devuelve.',
        en: 'Free cancellation up to 24 hours before the rental starts: your deposit is returned. After that, the deposit is non-refundable.',
      },
    },
    diasBloqueados: [],
  });
  const stockBase = () => ({ carretera: { S: 1, M: 2, L: 1 }, gravel: { S: 1, M: 2, L: 1 }, emtb: { S: 1, M: 2, L: 2 } });

  // ---------- almacenamiento ----------
  let mem = null, rawCache = null, objCache = null;
  const leerRaw = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
  const escribir = st => {
    const raw = JSON.stringify(st); mem = st; rawCache = raw; objCache = st;
    try { localStorage.setItem(KEY, raw); } catch { }
  };
  const estado = () => {
    const raw = leerRaw();
    if (raw && raw === rawCache && objCache) return objCache;
    if (raw) {
      try { const o = JSON.parse(raw); if (o && o.v === VERSION) { rawCache = raw; objCache = mem = o; return o; } } catch { }
    }
    if (mem && !raw) return mem;
    const st = sembrar(); escribir(st); return st;
  };
  const guardar = () => escribir(estado());

  // ---------- disponibilidad ----------
  const solapa = (r, desde, hasta) => r.desde <= hasta && r.hasta >= desde;
  const ocupa = r => r.estado === 'pendiente' || r.estado === 'confirmada';
  function usadasMax(reservas, tipo, talla, desde, hasta) {
    let max = 0;
    for (let d = desde; d <= hasta; d = sumaDias(d, 1)) {
      let u = 0;
      for (const r of reservas) if (ocupa(r) && r.desde <= d && r.hasta >= d) for (const l of r.lineas) if (l.tipo === tipo && l.talla === talla) u += l.cantidad;
      if (u > max) max = u;
    }
    return max;
  }
  const diaBloqueado = f => estado().config.diasBloqueados.includes(f);
  function disponibles(tipo, talla, desde, hasta) {
    const st = estado();
    if (!desde || !hasta || hasta < desde) return 0;
    for (let d = desde; d <= hasta; d = sumaDias(d, 1)) if (st.config.diasBloqueados.includes(d)) return 0;
    const total = (st.stock[tipo] || {})[talla] || 0;
    return Math.max(0, total - usadasMax(st.reservas, tipo, talla, desde, hasta));
  }
  function ocupacion(f) {
    const st = estado(); let usadas = 0, total = 0;
    for (const t of Object.values(st.stock)) for (const n of Object.values(t)) total += n;
    for (const r of st.reservas) if (ocupa(r) && r.desde <= f && r.hasta >= f) usadas += r.lineas.reduce((a, l) => a + l.cantidad, 0);
    return { total, usadas };
  }

  // ---------- precio ----------
  function calcPrecio(cfg, { lineas = [], dias: nd = 1, extras = {}, entrega = 'local', codigo = '' } = {}) {
    const out = { dias: nd, consultar: false, motivo: null, lineas: [], extras: [], entrega: { tipo: entrega, importe: 0 }, alquiler: 0, descuentoDias: 0, extrasTotal: 0, colectivo: null, descuentoColectivo: 0, subtotal: 0, total: 0, senal: 0, resto: 0 };
    if (nd > cfg.diasMaxPrecio) { out.consultar = true; out.motivo = 'dias'; }
    if (entrega === 'fuera') { out.consultar = true; out.motivo = out.motivo || 'entrega'; }
    const nBicis = lineas.reduce((a, l) => a + (+l.cantidad || 0), 0);
    for (const l of lineas) {
      const t = cfg.tipos.find(x => x.id === l.tipo); if (!t) continue;
      const cant = +l.cantidad || 0, detalle = [];
      let porBici = 0;
      if (out.motivo !== 'dias') {
        for (let d = 1; d <= Math.min(nd, cfg.diasMaxPrecio); d++) { const pr = t.precio - (cfg.descuentos[d - 1] || 0); detalle.push({ dia: d, precio: pr }); porBici += pr; }
      }
      const importe = r2(porBici * cant);
      out.lineas.push({ tipo: l.tipo, talla: l.talla, cantidad: cant, porBici, importe, detalle });
      if (out.motivo !== 'dias') { out.alquiler += importe; out.descuentoDias += r2((t.precio * nd - porBici) * cant); }
    }
    for (const e of cfg.extras) {
      if (e.tipo === 'por_reserva' || e.tipo === 'presupuesto') continue;
      const cant = e.incluido ? nBicis : Math.min(+extras[e.id] || 0, nBicis);
      if (e.incluido || cant > 0) {
        const importe = e.incluido ? 0 : r2(e.precio * cant);
        out.extras.push({ id: e.id, cantidad: cant, precioUd: e.precio || 0, importe, incluido: !!e.incluido });
        out.extrasTotal += importe;
      }
    }
    if (entrega === 'oviedo') { const e = cfg.extras.find(x => x.id === 'entrega_oviedo'); out.entrega.importe = e ? e.precio : 30; }
    const col = codigo ? cfg.colectivos.find(c => c.activo && c.codigo.toUpperCase() === String(codigo).trim().toUpperCase()) : null;
    if (col) { out.colectivo = { codigo: col.codigo, nombre: col.nombre, descuento: col.descuento }; out.descuentoColectivo = r2(out.alquiler * col.descuento / 100); }
    out.alquiler = r2(out.alquiler); out.extrasTotal = r2(out.extrasTotal);
    out.subtotal = r2(out.alquiler + out.extrasTotal + out.entrega.importe);
    out.total = r2(out.subtotal - out.descuentoColectivo);
    if (out.motivo === 'dias') { out.alquiler = out.extrasTotal = out.subtotal = out.total = 0; out.descuentoDias = 0; }
    out.senal = r2(out.total * cfg.senalPct / 100); out.resto = r2(out.total - out.senal);
    return out;
  }
  const precio = datos => calcPrecio(estado().config, datos);

  // ---------- reservas ----------
  function siguienteId(st) { const n = st.reservas.reduce((m, r) => Math.max(m, +String(r.id).replace(/\D/g, '') || 0), 1000); return 'NC-' + (n + 1); }
  function crearReserva(d) {
    const st = estado(), cfg = st.config;
    const nd = dias(d.desde, d.hasta);
    const lineas = (d.lineas || []).filter(l => l.cantidad > 0).map(l => ({ tipo: l.tipo, talla: l.talla, cantidad: +l.cantidad }));
    const pr = calcPrecio(cfg, { lineas, dias: nd, extras: d.extras || {}, entrega: d.entrega || 'local', codigo: d.codigo });
    const ppto = pr.consultar;
    const r = {
      id: siguienteId(st), creada: ahora(), estado: ppto ? 'presupuesto' : 'pendiente', pago: ppto ? 'ninguno' : 'retenido',
      desde: d.desde, hasta: d.hasta, dias: nd, lineas, extras: d.extras || {}, entrega: d.entrega || 'local', direccion: d.direccion || '',
      codigo: pr.colectivo ? pr.colectivo.codigo : '', colectivo: pr.colectivo, precio: pr, total: pr.total, senal: pr.senal, resto: pr.resto,
      cliente: d.cliente || {}, novedades: !!d.novedades, idioma: d.idioma || 'es', origen: d.origen || 'web', sesion: d.sesion || '', notas: d.notas || '',
      historial: [],
    };
    r.historial.push({ estado: r.estado, fecha: r.creada });
    st.reservas.unshift(r); guardar(); return r;
  }
  function cambiarEstado(id, nuevo, opts = {}) {
    const st = estado(), r = st.reservas.find(x => x.id === id);
    if (!r) return null;
    if (!ESTADOS[nuevo]) throw new Error('Estado no válido: ' + nuevo);
    const antes = r.pago;
    r.estado = nuevo;
    if (nuevo === 'confirmada' || nuevo === 'completada') r.pago = r.precio && r.precio.consultar && !r.senal ? 'ninguno' : (antes === 'retenido' || antes === 'ninguno' ? 'cobrado' : antes);
    else if (nuevo === 'rechazada') r.pago = antes === 'retenido' ? 'liberado' : antes;
    else if (nuevo === 'cancelada') r.pago = antes === 'retenido' ? 'liberado' : (antes === 'cobrado' && opts.devolverSenal ? 'devuelto' : antes);
    r.historial.push({ estado: nuevo, fecha: ahora() });
    guardar(); return r;
  }
  const cancelacionGratis = r => (parse(r.desde).setHours(0, 0, 0, 0) - Date.now()) / 36e5 > estado().config.cancelacion.horas;

  // ---------- embudo ----------
  function evento(sesion, paso, datos = {}) {
    const st = estado(), e = { id: 'e' + (st.eventos.length + 1) + Math.random().toString(36).slice(2, 5), sesion, paso, fecha: ahora(), datos };
    st.eventos.push(e); guardar(); return e;
  }
  function embudo(desde) {
    const ev = estado().eventos.filter(e => !desde || e.fecha.slice(0, 10) >= desde);
    return [1, 2, 3, 4, 5].map(p => ({ paso: p, sesiones: new Set(ev.filter(e => e.paso >= p).map(e => e.sesion)).size }));
  }

  // ---------- consultas / visitas ----------
  function crearConsulta(c) {
    const st = estado(), n = st.consultas.reduce((m, x) => Math.max(m, +String(x.id).replace(/\D/g, '') || 0), 0);
    const o = { id: 'C-' + (n + 1), fecha: ahora(), motivo: c.motivo || 'otro', tipo: c.tipo || '', talla: c.talla || '', fechas: c.fechas || '', mensaje: c.mensaje || '', nombre: c.nombre || '', contacto: c.contacto || '', estado: 'nueva' };
    st.consultas.unshift(o); guardar(); return o;
  }
  function marcarRespondido(id, v = true) { const r = estado().reservas.find(x => x.id === id); if (r) { r.respondido = !!v; guardar(); } return r; }
  function cambiarConsulta(id, est) { const c = estado().consultas.find(x => x.id === id); if (c) { c.estado = est; guardar(); } return c; }
  function registrarVisita(origen) {
    const st = estado(), f = iso(new Date());
    let v = st.visitas.find(x => x.fecha === f);
    if (!v) { v = { fecha: f, total: 0, origen: { google: 0, maps: 0, instagram: 0, directo: 0, otros: 0 } }; st.visitas.push(v); }
    if (!origen) { const ref = (document.referrer || '').toLowerCase(); origen = ref.includes('instagram') ? 'instagram' : ref.includes('maps') ? 'maps' : ref.includes('google') ? 'google' : ref ? 'otros' : 'directo'; }
    v.total++; v.origen[origen] = (v.origen[origen] || 0) + 1; guardar();
  }

  // ---------- datos sembrados ----------
  function sembrar() {
    let s = 20261123;
    const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const pick = a => a[Math.floor(rnd() * a.length)];
    const cfg = configBase(), stock = stockBase();
    cfg.diasBloqueados = [isoMas(9), isoMas(10), isoMas(16)];
    const NOM = ['Lucía', 'Carlos', 'Marta', 'Javier', 'Elena', 'Pablo', 'Sofía', 'Álvaro', 'Paula', 'Diego', 'Carmen', 'Hugo', 'Laura', 'Sergio', 'Noelia', 'Iván', 'Claudia', 'Rubén', 'Andrea', 'Mario', 'Cristina', 'Adrián', 'Irene', 'Óscar', 'Beatriz', 'Nacho', 'Raquel', 'Dani', 'Emma', 'Thomas', 'Sophie', 'James', 'Anna', 'Lukas'];
    const APE = ['García', 'Fernández', 'González', 'Rodríguez', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Álvarez', 'Suárez', 'Menéndez', 'Díaz', 'Alonso', 'Cuesta', 'Valdés', 'Rionda', 'Müller', 'Smith', 'Dubois', 'Rossi'];
    const reservas = [], eventos = [];
    let num = 1001;
    const fac = m => [.35, .4, .6, .9, 1.2, 1.5, 1.9, 2.3, 1.3, .8, .4, .3][m]; // estacionalidad (ene..dic)
    const libresSembrado = (tipo, talla, a, b) => (stock[tipo][talla]) - usadasMax(reservas, tipo, talla, a, b);
    for (let off = -150; off <= 21; off++) {
      const d = mas(off), dow = d.getDay(), f = iso(d);
      if (cfg.diasBloqueados.includes(f)) continue;
      const base = (dow === 5 || dow === 6 ? 2.2 : dow === 0 ? 1.7 : dow === 1 ? .5 : 1) * fac(d.getMonth()) * (off > 0 ? 2.2 : 1);
      const n = Math.round(base * (.5 + rnd()));
      for (let i = 0; i < n; i++) {
        const rd = rnd(), nd = rd < .34 ? 1 : rd < .64 ? 2 : rd < .84 ? 3 : rd < .96 ? 4 : 5 + Math.floor(rnd() * 3);
        const desde = f, hasta = sumaDias(f, nd - 1);
        const grupo = rnd() < .55 ? 2 : rnd() < .5 ? 1 : rnd() < .6 ? 3 : 4;
        const lineas = [];
        for (let k = 0; k < grupo; k++) {
          const tipo = pick(['carretera', 'carretera', 'gravel', 'emtb', 'emtb']), talla = pick(['S', 'M', 'M', 'M', 'L', 'L']);
          const ex = lineas.find(l => l.tipo === tipo && l.talla === talla);
          if (ex) ex.cantidad++; else lineas.push({ tipo, talla, cantidad: 1 });
        }
        const entrega = rnd() < .22 ? 'oviedo' : rnd() < .05 ? 'fuera' : 'local';
        const extras = {}; const nb = lineas.reduce((a, l) => a + l.cantidad, 0);
        if (rnd() < .3) extras.candado = Math.min(nb, 1 + Math.floor(rnd() * nb));
        if (rnd() < .22) extras.portabultos = 1;
        if (rnd() < .3) extras.movil = Math.min(nb, 1 + Math.floor(rnd() * 2));
        const codigo = rnd() < .09 ? pick(['MIR2027', 'CASTURIANO']) : '';
        const pr = calcPrecio(cfg, { lineas, dias: nd, extras, entrega, codigo });
        let est;
        if (pr.consultar) est = 'presupuesto';
        else {
          if (lineas.some(l => libresSembrado(l.tipo, l.talla, desde, hasta) < l.cantidad)) continue;
          if (off < -1) est = rnd() < .84 ? 'completada' : rnd() < .5 ? 'cancelada' : 'rechazada';
          else est = rnd() < .08 ? 'cancelada' : 'confirmada';
        }
        const antelacion = 1 + Math.floor(rnd() * 25);
        const creada = new Date(d.getTime() - antelacion * 864e5); creada.setHours(8 + Math.floor(rnd() * 13), Math.floor(rnd() * 60), 0, 0);
        const idioma = rnd() < .68 ? 'es' : 'en', nombre = `${pick(NOM)} ${pick(APE)}`, sesion = 'sem' + num;
        const pago = est === 'presupuesto' ? 'ninguno' : est === 'confirmada' || est === 'completada' ? 'cobrado' : est === 'rechazada' ? 'liberado' : (rnd() < .5 ? 'devuelto' : 'cobrado');
        const r = {
          id: 'NC-' + num++, creada: ahora(creada), estado: est, pago, desde, hasta, dias: nd, lineas, extras, entrega, direccion: entrega === 'local' ? '' : (entrega === 'oviedo' ? pick(['Hotel de la Reconquista', 'Hotel Barceló Oviedo Cervantes', 'Hotel Oviedo Center', 'C/ Uría 12']) : pick(['Hotel en Gijón', 'Casa rural en Cangas de Onís', 'Hotel en Avilés'])),
          codigo: pr.colectivo ? pr.colectivo.codigo : '', colectivo: pr.colectivo, precio: pr, total: pr.total, senal: pr.senal, resto: pr.resto,
          cliente: { nombre, email: nombre.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '.') + '@example.com', telefono: `6${Math.floor(rnd() * 90 + 10)} ${Math.floor(rnd() * 900 + 100)} ${Math.floor(rnd() * 900 + 100)}`, altura: 155 + Math.floor(rnd() * 45), documento: '' },
          novedades: rnd() < .4, idioma, origen: 'web', sesion, notas: '', historial: [{ estado: est === 'presupuesto' ? 'presupuesto' : 'pendiente', fecha: ahora(creada) }],
        };
        if (est !== 'presupuesto' && est !== 'pendiente') r.historial.push({ estado: est, fecha: ahora(new Date(creada.getTime() + (1 + rnd() * 20) * 36e5)) });
        reservas.push(r);
        // embudo de la reserva completada (los 5 pasos)
        const dat = { tipo: lineas[0].tipo, talla: lineas[0].talla, dias: nd, desde, hasta, idioma, lineas };
        for (let p = 1; p <= 5; p++) eventos.push({ id: 'ev' + eventos.length, sesion, paso: p, fecha: ahora(new Date(creada.getTime() + p * 70000)), datos: dat });
      }
    }
    // algunas pendientes de confirmar en los próximos días (creadas ayer / hoy)
    const pendientes = [[1, 2, [{ tipo: 'emtb', talla: 'M', cantidad: 2 }]], [3, 3, [{ tipo: 'carretera', talla: 'L', cantidad: 1 }]], [4, 1, [{ tipo: 'gravel', talla: 'S', cantidad: 1 }, { tipo: 'gravel', talla: 'M', cantidad: 1 }]], [6, 4, [{ tipo: 'carretera', talla: 'M', cantidad: 1 }, { tipo: 'emtb', talla: 'M', cantidad: 1 }]], [7, 2, [{ tipo: 'emtb', talla: 'L', cantidad: 1 }]]];
    pendientes.forEach(([off, nd, lineas], i) => {
      const desde = isoMas(off), hasta = sumaDias(desde, nd - 1);
      if (cfg.diasBloqueados.some(b => b >= desde && b <= hasta) || lineas.some(l => libresSembrado(l.tipo, l.talla, desde, hasta) < l.cantidad)) return;
      const ent = i === 2 ? 'oviedo' : 'local', extras = i === 0 ? { candado: 2 } : i === 3 ? { movil: 1, portabultos: 1 } : {};
      const pr = calcPrecio(cfg, { lineas, dias: nd, extras, entrega: ent, codigo: i === 4 ? 'MIR2027' : '' });
      const creada = new Date(); creada.setHours(creada.getHours() - (2 + i * 5));
      const nombre = ['Marina Costa', 'Peter Hoffmann', 'Inés Valle', 'Carolina Prieto', 'Daniel Ferreira'][i];
      reservas.push({
        id: 'NC-' + num++, creada: ahora(creada), estado: 'pendiente', pago: 'retenido', desde, hasta, dias: nd, lineas, extras, entrega: ent, direccion: ent === 'oviedo' ? 'Hotel de la Reconquista' : '',
        codigo: pr.colectivo ? pr.colectivo.codigo : '', colectivo: pr.colectivo, precio: pr, total: pr.total, senal: pr.senal, resto: pr.resto,
        cliente: { nombre, email: nombre.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com', telefono: '612 345 6' + (10 + i * 7), altura: [172, 184, 160, 178, 190][i], documento: '' },
        novedades: i % 2 === 0, idioma: i === 1 ? 'en' : 'es', origen: 'web', sesion: 'semp' + i, notas: '', historial: [{ estado: 'pendiente', fecha: ahora(creada) }],
      });
      for (let p = 1; p <= 5; p++) eventos.push({ id: 'evp' + i + p, sesion: 'semp' + i, paso: p, fecha: ahora(new Date(creada.getTime() + p * 60000)), datos: { tipo: lineas[0].tipo, talla: lineas[0].talla, dias: nd, desde, hasta, idioma: i === 1 ? 'en' : 'es', lineas } });
    });
    reservas.sort((a, b) => b.creada.localeCompare(a.creada));
    // sesiones de embudo abandonadas en distintos pasos
    for (let i = 0; i < 360; i++) {
      const off = -150 + Math.floor(rnd() * 150), d = mas(off), f = fac(d.getMonth());
      if (rnd() > f / 2.4 + .15) continue;
      const r = rnd(), paso = r < .5 ? 1 : r < .78 ? 2 : r < .93 ? 3 : 4, tipo = pick(['carretera', 'gravel', 'emtb', 'emtb']), talla = pick(['S', 'M', 'M', 'L']), nd = 1 + Math.floor(rnd() * 5);
      const desde = isoMas(off + 5 + Math.floor(rnd() * 20)), hasta = sumaDias(desde, nd - 1), idioma = rnd() < .66 ? 'es' : 'en';
      const t0 = new Date(d); t0.setHours(9 + Math.floor(rnd() * 12), Math.floor(rnd() * 60), 0, 0);
      for (let p = 1; p <= paso; p++) eventos.push({ id: 'ea' + i + '_' + p, sesion: 'sab' + i, paso: p, fecha: ahora(new Date(t0.getTime() + p * 80000)), datos: { tipo, talla, dias: nd, desde, hasta, idioma, lineas: [{ tipo, talla, cantidad: 1 }] } });
    }
    eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    // consultas de contacto (~40)
    const CON = {
      talla: ['Mido 1,83 y entre la M y la L, ¿cuál me recomendáis?', 'Mi pareja mide 1,58, ¿tenéis talla S en eMTB?', 'I am 1.78 m, would a M road bike fit me?', '¿Hay talla XL? Mido 1,95.'],
      fechas: ['¿Podéis tener las bicis listas el viernes a primera hora?', 'Queremos alquilar 6 días en agosto, ¿hay disponibilidad?', 'Is there availability for the weekend of the 14th?', '¿Se puede ampliar un día más una vez empezado el alquiler?'],
      bici: ['¿Qué diferencia hay entre gravel y carretera para ir por el Naranco?', 'Is the eMTB suitable for a beginner?', '¿La batería de la eMTB aguanta una mañana larga?', '¿Tenéis bicis de niño?'],
      precio: ['¿Hay descuento para grupos de 6 personas?', 'Do you accept payment by card on pick-up?', '¿El descuento de colectivos se aplica a los extras?', '¿Hacéis precio especial para una semana completa?'],
      entrega: ['¿Podéis entregarlas en un hotel de Gijón?', 'We stay at a hotel near the station, can you deliver there?', '¿A qué hora se recogen las bicis en Oviedo?', '¿Hay que devolverlas en el local o las recogéis vosotros?'],
      otro: ['¿Dejáis dejar el equipaje mientras ruedo?', 'Do you sell inner tubes and spare parts?', '¿Puedo llevar mis propios pedales?', 'Buenas, ¿tenéis factura para empresa?'],
    };
    const consultas = [];
    for (let i = 0; i < 40; i++) {
      const motivo = pick(MOTIVOS).id, off = -Math.floor(Math.pow(rnd(), 1.6) * 120), d = mas(off); d.setHours(8 + Math.floor(rnd() * 14), Math.floor(rnd() * 60), 0, 0);
      const nombre = `${pick(NOM)} ${pick(APE)}`;
      consultas.push({ id: 'C-' + (i + 1), fecha: ahora(d), motivo, tipo: pick(['', 'carretera', 'gravel', 'emtb']), talla: pick(['', 'S', 'M', 'L']), fechas: rnd() < .7 ? `${isoMas(off + 7)} → ${isoMas(off + 9)}` : '', mensaje: pick(CON[motivo]), nombre, contacto: rnd() < .5 ? `6${Math.floor(rnd() * 90 + 10)} ${Math.floor(rnd() * 900 + 100)} ${Math.floor(rnd() * 900 + 100)}` : nombre.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(' ', '.') + '@example.com', estado: off < -4 || rnd() < .3 ? 'atendida' : 'nueva' });
    }
    consultas.sort((a, b) => b.fecha.localeCompare(a.fecha)).forEach((c, i, a) => { c.id = 'C-' + (a.length - i); });
    // visitas por día y origen
    const visitas = [];
    for (let off = -150; off <= 0; off++) {
      const d = mas(off), dow = d.getDay(), v = Math.round((dow === 5 || dow === 6 ? 62 : dow === 0 ? 50 : 38) * (.55 + fac(d.getMonth()) * .6) * (.75 + rnd() * .5));
      const pesos = [.34 + rnd() * .06, .22 + rnd() * .05, .14 + rnd() * .06, .2, 0]; pesos[4] = Math.max(.02, 1 - pesos.reduce((a, b) => a + b, 0));
      const origen = {}; let rest = v;
      ORIGENES.forEach((o, i) => { const n = i === 4 ? rest : Math.min(rest, Math.round(v * pesos[i])); origen[o.id] = n; rest -= n; });
      visitas.push({ fecha: iso(d), total: v, origen });
    }
    return { v: VERSION, config: cfg, stock, reservas, eventos, consultas, visitas };
  }

  const api = {
    iso, parse, hoy, mas, isoMas, sumaDias, dias, ahora, esc, eur, ID_SESION, ESTADOS, MOTIVOS, ORIGENES,
    config: () => estado().config,
    guardarConfig: c => { estado().config = c; guardar(); },
    tipo: id => estado().config.tipos.find(t => t.id === id),
    extra: id => estado().config.extras.find(e => e.id === id),
    validarCodigo: c => { c = String(c || '').trim().toUpperCase(); return c ? estado().config.colectivos.find(x => x.activo && x.codigo.toUpperCase() === c) || null : null; },
    stock: () => estado().stock,
    guardarStock: s => { estado().stock = s; guardar(); },
    disponibles, diaBloqueado, ocupacion, precio,
    reservas: () => estado().reservas, reserva: id => estado().reservas.find(r => r.id === id),
    crearReserva, cambiarEstado, cancelacionGratis, marcarRespondido,
    evento, eventos: () => estado().eventos, embudo,
    crearConsulta, consultas: () => estado().consultas, cambiarConsulta,
    registrarVisita,
    reset: () => { try { localStorage.removeItem(KEY); } catch { } mem = rawCache = objCache = null; escribir(sembrar()); },
  };
  Object.defineProperty(api, 'visitas', { get: () => estado().visitas, enumerable: true });
  return api;
})();
