import { DAYS, DAY_LABEL, ICON, MOTIVOS, addDays, clone, dayNum, esc, fmtH, fmtLong, fmtMin, fmtRange, monthName, toMin, todayIso, weekday } from '../nucleo/util.js';
import { confirmar, state, toast } from '../nucleo/estado.js';
import { PUESTOS, abreviaturas, capTags, empById, esRol, funcById, funcionesDe, horasDe, puestoDe, puestoTag, puestosDe, renderView, rolTag, rolesDe, shiftById, tipoDe, usaPuestos } from '../nucleo/pintado.js';
import { horasFila, nameIn } from './cuadrante.js';
import { SEV, SEV_ORDER, alertCard, sevBadges } from './alertas.js';
import { aMin, franjaDe } from './equipo.js';
// ------------------------------------------------------------------ VISTA DIARIA (diagrama de Gantt editable)
// Filas: personas; columnas: horas. Cada barra es el turno de una persona ese día. Se mueve arrastrándola,
// se alarga o acorta por los bordes y se añade tocando un hueco de la fila. Los cambios se quedan en el
// navegador hasta «Confirmar»: entonces se evalúan las alertas del horario resultante y se decide si se
// guarda (y publica). En un horario publicado se guardan como arreglo, que el equipo no ve hasta publicarlo.

const DIA_PASO = () => Math.min(30, state.config.reglas.resolucion_minutos);

function tramosDe(cfg, h, fecha) {
  return h.asignaciones.filter((a) => a.fecha === fecha && shiftById(cfg, a.turno_id)).map((a) => {
    const hs = horasDe(cfg, a);
    return { empleado_id: a.empleado_id, inicio: hs.inicio, fin: hs.fin, puesto: puestoDe(cfg, a), funcion: a.funcion || null, turno_id: a.turno_id };
  });
}

function diaFechaPara(h) {
  const f = state.diaFecha;
  if (f && f >= h.desde && f <= h.hasta) return f;
  const hoy = todayIso();
  return hoy >= h.desde && hoy <= h.hasta ? hoy : h.desde;
}

// Estado de edición del día. Se rehace si cambia el horario o el día, salvo que haya cambios sin confirmar.
function diaEstado(cur) {
  const fecha = diaFechaPara(cur.horario);
  state.diaFecha = fecha;
  const d = state.dia;
  if (d && d.sid === cur.id && d.fecha === fecha && (d.base === cur.version || diaCambios(d).length)) return d;
  const orig = tramosDe(state.config, cur.horario, fecha);
  state.dia = { sid: cur.id, fecha, base: cur.version, orig, tramos: clone(orig) };
  return state.dia;
}

const tramoClave = (t) => (t ? `${t.inicio}|${t.fin}|${t.puesto}|${t.funcion || ''}` : '');
export function diaCambios(d) {
  const a = new Map(d.orig.map((t) => [t.empleado_id, t]));
  const b = new Map(d.tramos.map((t) => [t.empleado_id, t]));
  return [...new Set([...a.keys(), ...b.keys()])].filter((e) => tramoClave(a.get(e)) !== tramoClave(b.get(e)));
}

export function diaSoloLectura(cur) {
  return cur.estado === 'publicado' && cur.arreglo_pendiente;
}

// Ventana de horas que se dibuja: de la primera a la última demanda o turno, con margen, en horas enteras.
function diaVentana(cur, d) {
  const day = cur.cobertura[d.fecha];
  const mins = [];
  for (const [t, req] of (day && day.pasos) || []) if (req > 0) mins.push(t, t + state.config.reglas.resolucion_minutos);
  for (const t of d.tramos) mins.push(toMin(t.inicio), toMin(t.fin));
  if (!mins.length) return [7 * 60, 23 * 60];
  let from = Math.max(0, Math.floor((Math.min(...mins) - 30) / 60) * 60);
  let to = Math.min(24 * 60, Math.ceil((Math.max(...mins) + 30) / 60) * 60);
  if (to - from < 6 * 60) to = Math.min(24 * 60, from + 6 * 60);
  return [from, to];
}

// Cobertura con los cambios sin confirmar: personas en cada paso frente a las que pide la demanda.
function diaCobertura(cur, d) {
  const res = state.config.reglas.resolucion_minutos;
  const day = cur.cobertura[d.fecha] || { pasos: [], puestos: {} };
  const cubre = (t, paso) => toMin(t.inicio) <= paso && paso + res <= toMin(t.fin);
  const filas = [{ clave: 'total', nombre: 'Personas', req: new Map(day.pasos.map(([t, r]) => [t, r])), cuenta: (paso) => d.tramos.filter((t) => cubre(t, paso)).length }];
  for (const [p, arr] of Object.entries(day.puestos || {})) {
    filas.push({ clave: p, nombre: PUESTOS[p], req: new Map(arr.map(([t, r]) => [t, r])), cuenta: (paso) => d.tramos.filter((t) => t.puesto === p && cubre(t, paso)).length });
  }
  for (const [fid, arr] of Object.entries(day.funciones || {})) {
    const f = funcById(state.config, fid);
    if (!f) continue;
    // Un rol solo lo cubre quien lo tiene asignado ese día; una tarea de apoyo, cualquiera que sepa hacerla.
    const con = new Set(state.config.empleados.filter((e) => (e.funciones || []).includes(fid)).map((e) => e.id));
    const cuenta = esRol(f) ? (paso) => d.tramos.filter((t) => t.funcion === fid && cubre(t, paso)).length
      : (paso) => d.tramos.filter((t) => con.has(t.empleado_id) && cubre(t, paso)).length;
    filas.push({ clave: `f:${fid}`, nombre: f.nombre, req: new Map(arr.map(([t, r]) => [t, r])), tope: new Map(arr.filter((x) => x[3] != null).map(([t, , , m]) => [t, m])), cuenta, soloRegla: true });
  }
  return { res, filas, cerrado: day.cerrado };
}

function dayNav(cur, fecha) {
  const h = cur.horario;
  const vecino = (f) => state.schedules.filter((s) => s.id !== cur.id && s.desde <= f && f <= s.hasta)
    .sort((a, b) => (a.estado === 'publicado' ? 0 : 1) - (b.estado === 'publicado' ? 0 : 1))[0];
  const nav = (f, label, dir) => {
    if (f >= h.desde && f <= h.hasta) return `<button class="btn small" data-act="dayGo" data-date="${f}" aria-label="${dir}">${label}</button>`;
    const v = vecino(f);
    return v ? `<button class="btn small" data-act="dayGo" data-date="${f}" data-sid="${v.id}" title="Está en otro horario (${esc(fmtRange(v.desde, v.hasta))})">${label}</button>`
      : `<button class="btn small" disabled aria-label="${dir}">${label}</button>`;
  };
  return `<div class="day-nav row">
    ${nav(addDays(fecha, -1), '‹ Anterior', 'Día anterior')}
    <label class="field day-pick"><span class="sr-only">Día</span><input type="date" value="${fecha}" min="${h.desde}" max="${h.hasta}" data-act-change="dayPick"></label>
    ${nav(addDays(fecha, 1), 'Siguiente ›', 'Día siguiente')}
    <h2 class="day-title">${esc(DAY_LABEL[weekday(fecha)])} ${dayNum(fecha)} de ${monthName(fecha)} <span class="small muted">${esc(cur.cobertura[fecha]?.tipo || '')}</span></h2>
  </div>`;
}

// Zoom horizontal del diagrama del día: más ancho para afinar al arrastrar, más estrecho para verlo entero.
export const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];
export function ganttZoom() {
  if (state.zoom == null) { let z = 1; try { z = Number(localStorage.getItem('lopita-zoom')) || 1; } catch { /* sin almacenamiento */ } state.zoom = ZOOMS.includes(z) ? z : 1; }
  return state.zoom;
}
function zoomCtl() {
  const z = ganttZoom(), k = ZOOMS.indexOf(z);
  return `<div class="zoom-ctl" role="group" aria-label="Zoom del horario">
    <button class="btn small" data-act="zoom" data-d="-1" ${k === 0 ? 'disabled' : ''} aria-label="Alejar" title="Alejar">−</button>
    <button class="btn small zoom-val" data-act="zoom" data-d="0" title="Volver al 100 %">${Math.round(z * 100)} %</button>
    <button class="btn small" data-act="zoom" data-d="1" ${k === ZOOMS.length - 1 ? 'disabled' : ''} aria-label="Acercar" title="Acercar">+</button></div>`;
}

export function dayView(cur) {
  const cfg = state.config;
  const d = diaEstado(cur);
  const ro = diaSoloLectura(cur);
  const [from, to] = diaVentana(cur, d);
  const span = to - from;
  const pct = (m) => `${((m - from) / span) * 100}%`;
  const conPuestos = usaPuestos(cfg);
  const cambiados = new Set(diaCambios(d));
  const horas = [];
  for (let m = from; m <= to; m += 60) horas.push(m);
  const cob = diaCobertura(cur, d);
  const cobFila = (f) => {
    const cells = [];
    const faltan = [];
    const sobran = [];
    for (let t = from; t < to; t += cob.res) {
      const req = f.req.get(t) || 0, n = f.cuenta(t);
      const tope = f.tope ? f.tope.get(t) : undefined;
      const conRegla = req > 0 || tope !== undefined;
      const cls = n < req || (tope !== undefined && n > tope) ? 'short' : f.soloRegla ? (conRegla ? 'ok' : 'none') : n > req ? 'extra' : req ? 'ok' : 'none';
      if (f.soloRegla && !conRegla) { cells.push(''); continue; }
      if (n < req) faltan.push(`${fmtMin(t)} (${req - n})`);
      if (tope !== undefined && n > tope) sobran.push(`${fmtMin(t)} (${n - tope})`);
      const regla = tope === undefined ? `${n} de ${req}` : `${n}, ${req ? `mínimo ${req}, ` : ''}máximo ${tope}`;
      cells.push(`<i class="${cls}" style="left:${pct(t)};width:${(cob.res / span) * 100}%" title="${fmtMin(t)}–${fmtMin(t + cob.res)}: ${regla}">${req || n ? `<b>${n}</b>` : ''}</i>`);
    }
    const lista = (l) => `${l.slice(0, 4).join(', ')}${l.length > 4 ? '…' : ''}`;
    const resumen = faltan.length || sobran.length
      ? [faltan.length ? `Falta gente: ${lista(faltan)}` : '', sobran.length ? `Sobra gente: ${lista(sobran)}` : ''].filter(Boolean).join(' · ')
      : 'Cubierto';
    return `<div class="g-row g-cov"><div class="g-name" title="${esc(`${f.nombre}: ${resumen}`)}">${esc(f.nombre)}<small class="${faltan.length || sobran.length ? 'bad-text' : ''}">${esc(resumen)}</small></div>
      <div class="g-track" aria-label="${esc(`${f.nombre}: ${resumen}`)}">${cells.join('')}</div></div>`;
  };
  // Ordenadas por hora de entrada: primero quien entra antes; después, quien no trabaja ese día.
  const entrada = (e) => { const t = d.tramos.find((x) => x.empleado_id === e.id); return t ? toMin(t.inicio) * 2000 + toMin(t.fin) : Infinity; };
  const emps = cfg.empleados.filter((e) => e.activo || d.tramos.some((t) => t.empleado_id === e.id))
    .map((e, k) => [e, entrada(e), k]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
  const abrev = abreviaturas(cfg);
  const enLeyenda = new Map();
  const filas = emps.map((e) => {
    const t = d.tramos.find((x) => x.empleado_id === e.id);
    const etiquetas = funcionesDe(cfg, e);
    const ausencia = cfg.ausencias.find((a) => a.empleado_id === e.id && a.desde <= d.fecha && d.fecha <= a.hasta);
    const libra = (e.libranzas_fijas || []).includes(DAYS[weekday(d.fecha)]);
    const nota = ausencia ? MOTIVOS[ausencia.motivo] || ausencia.motivo : libra ? 'Libra (fijo)' : '';
    let bar = '';
    if (t) {
      const s = shiftById(cfg, t.turno_id);
      const durH = (toMin(t.fin) - toMin(t.inicio)) / 60;
      const rol = t.funcion ? funcById(cfg, t.funcion) : null;
      const caps = etiquetas.filter((f) => !(esRol(rol) && f.id === rol.id));
      caps.forEach((f) => enLeyenda.set(f.nombre, f));
      bar = `<div class="g-bar${conPuestos ? ` ${t.puesto}` : ''}${cambiados.has(e.id) ? ' changed' : ''}" data-emp="${esc(e.id)}" tabindex="0" role="button"
        style="left:${pct(toMin(t.inicio))};width:${((toMin(t.fin) - toMin(t.inicio)) / span) * 100}%;--c:${esc((s && s.color) || 'var(--shift-default)')}"
        aria-label="${esc(`${e.nombre}: de ${t.inicio} a ${t.fin}${conPuestos ? `, ${PUESTOS[t.puesto]}` : ''}${esRol(rol) ? `, ${rol.nombre}` : ''}${caps.length ? `. ${caps.map((f) => f.nombre).join(', ')}` : ''}. Arrastra para mover; bordes para alargar o acortar; Intro para más opciones.`)}">
        ${ro ? '' : '<span class="g-h l" data-h="l" aria-hidden="true"></span>'}
        <span class="g-txt">${conPuestos ? puestoTag(t.puesto) : ''}<b>${t.inicio}–${t.fin}</b><small>${fmtH(durH)} h</small>${rolTag(esRol(rol) ? rol : null)}${capTags(caps, abrev)}</span>
        ${ro ? '' : '<span class="g-h r" data-h="r" aria-hidden="true"></span>'}</div>`;
    }
    const titulo = [e.nombre, tipoDe(e), ...etiquetas.map((f) => f.nombre)].join(' · ');
    return `<div class="g-row${nota ? ' unavailable' : ''}"><div class="g-name" title="${esc(titulo)}">${esc(e.nombre)}<small>${esc(tipoDe(e))}${nota ? ` · <span class="warn-text">${esc(nota)}</span>` : ''}</small></div>
      <div class="g-track${ro ? '' : ' editable'}" data-emp="${esc(e.id)}" ${t || ro ? '' : `title="Toca para añadir un turno a ${esc(e.nombre)}"`}>${bar}</div></div>`;
  }).join('');
  const n = cambiados.size;
  const alertasDia = cur.alertas_detalle.activas.filter((a) => a.fecha === d.fecha || (a.fechas || []).includes(d.fecha) || (a.fecha && a.fecha_fin && a.fecha <= d.fecha && d.fecha <= a.fecha_fin));
  return `${dayNav(cur, d.fecha)}
    ${ro ? `<div class="notice warn no-print"><span>Este horario tiene un <b>arreglo pendiente de publicar</b>: los cambios se hacen en él.</span><span class="spacer"></span><a class="btn small primary" href="#/horarios/${cur.arreglo_pendiente}">Editar el arreglo</a></div>` : ''}
    ${cob.cerrado ? '<div class="notice info">El local está cerrado este día.</div>' : ''}
    <div class="row no-print" style="margin:8px 0;gap:10px;align-items:center;flex-wrap:nowrap"><p class="small muted" style="margin:0;flex:1">${ro ? 'Solo lectura.' : 'Arrastra un turno para moverlo, tira de sus bordes para alargarlo o acortarlo, tócalo para cambiar el puesto, las horas o quitarlo, y toca un hueco en la fila de alguien para añadirle un turno. Nada se guarda hasta que confirmes.'}</p>${zoomCtl()}</div>
    <div class="gantt-wrap"><div class="gantt" style="--hours:${span / 60};--zoom:${ganttZoom()}">
      <div class="g-row g-head"><div class="g-name"></div><div class="g-track">${horas.map((m) => `<span style="left:${pct(m)}">${String(Math.floor(m / 60)).padStart(2, '0')}</span>`).join('')}</div></div>
      ${cob.filas.map(cobFila).join('')}
      ${filas}
    </div></div>
    ${conPuestos ? `<div class="row small muted" style="margin-top:8px;gap:14px">${Object.keys(PUESTOS).map((p) => `<span>${puestoTag(p)} ${PUESTOS[p]}</span>`).join('')}<span><i class="legend-changed"></i> Cambio sin confirmar</span></div>` : ''}
    ${enLeyenda.size ? `<div class="cap-legend small muted">${[...enLeyenda.values()].map((f) => `<span>${capTags([f], abrev)} ${esc(f.nombre)}</span>`).join('')}</div>` : ''}
    ${alertasDia.length ? `<div class="section"><h2>Alertas de este día ${sevBadges(Object.fromEntries(SEV_ORDER.map((k) => [k, alertasDia.filter((a) => a.severidad === k).length])))}</h2>
      <div class="alert-list">${alertasDia.slice(0, 6).map((a) => alertCard(a, { sid: cur.id })).join('')}</div>
      <p class="small muted">Son las del horario guardado; al confirmar tus cambios verás cómo quedan.</p></div>` : ''}
    ${n ? `<div class="day-pending no-print" role="status"><span><b>${n} cambio${n > 1 ? 's' : ''}</b> sin confirmar</span><span class="spacer"></span>
      <button class="btn" data-act="dayDiscard">Descartar</button><button class="btn primary" data-act="dayConfirm">Confirmar cambios</button></div>` : ''}`;
}

// --- interacción con las barras (ratón y dedo)
let gDrag = null;

function gDragStart(e) {
  const track = e.target.closest('.g-track.editable');
  if (!track || e.button > 0 || !state.dia) return;
  const bar = e.target.closest('.g-bar');
  const rect = track.getBoundingClientRect();
  const [from, to] = diaVentana(state.current, state.dia);
  const base = { track, rect, from, to, x0: e.clientX, moved: false, emp: track.dataset.emp, id: e.pointerId };
  if (!bar) { gDrag = { ...base, modo: 'nuevo' }; return; }
  const t = state.dia.tramos.find((x) => x.empleado_id === bar.dataset.emp);
  const h = e.target.dataset.h;
  gDrag = { ...base, bar, modo: h === 'l' ? 'inicio' : h === 'r' ? 'fin' : 'mover', a0: toMin(t.inicio), b0: toMin(t.fin), a: toMin(t.inicio), b: toMin(t.fin) };
  bar.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function gDragMove(e) {
  const g = gDrag;
  if (!g || e.pointerId !== g.id) return;
  if (Math.abs(e.clientX - g.x0) > 5) g.moved = true;
  if (!g.bar || !g.moved) return;
  const paso = DIA_PASO();
  const dm = Math.round(((e.clientX - g.x0) / g.rect.width) * (g.to - g.from) / paso) * paso;
  let a = g.a0, b = g.b0;
  if (g.modo === 'mover') { const len = b - a; a = Math.min(Math.max(g.from, a + dm), g.to - len); b = a + len; }
  if (g.modo === 'inicio') a = Math.min(Math.max(g.from, a + dm), b - paso);
  if (g.modo === 'fin') b = Math.max(Math.min(g.to, b + dm), a + paso);
  a = Math.max(0, a); b = Math.min(24 * 60, b);
  g.a = a; g.b = b;
  const span = g.to - g.from;
  g.bar.style.left = `${((a - g.from) / span) * 100}%`;
  g.bar.style.width = `${((b - a) / span) * 100}%`;
  g.bar.classList.add('dragging', 'changed');
  const txt = g.bar.querySelector('.g-txt b');
  if (txt) txt.textContent = `${fmtMin(a)}–${fmtMin(b)}`;
  const dur = g.bar.querySelector('.g-txt small');
  if (dur) dur.textContent = `${fmtH((b - a) / 60)} h`;
}

function gDragEnd(e) {
  const g = gDrag;
  if (!g || e.pointerId !== g.id) return;
  gDrag = null;
  if (e.type === 'pointercancel') { if (g.bar) renderView(); return; }
  if (g.modo === 'nuevo') {
    if (g.moved) return;  // era un desplazamiento de la rejilla, no un toque
    const minuto = g.from + ((e.clientX - g.rect.left) / g.rect.width) * (g.to - g.from);
    diaAnadir(g.emp, minuto);
    return;
  }
  if (!g.moved) { openBarMenu(g.emp, g.bar); return; }
  const t = state.dia.tramos.find((x) => x.empleado_id === g.emp);
  t.inicio = fmtMin(g.a); t.fin = fmtMin(g.b);
  renderView();
}

document.addEventListener('pointerdown', gDragStart);
document.addEventListener('pointermove', gDragMove);
document.addEventListener('pointerup', gDragEnd);
document.addEventListener('pointercancel', gDragEnd);

// Turnos que existen ese día y que la persona puede hacer (abrir y cerrar solo quien está habilitado).
function turnosPosibles(e, fecha) {
  const cfg = state.config;
  const dia = DAYS[weekday(fecha)];
  const existen = cfg.turnos.filter((s) => !s.dias || !s.dias.length || s.dias.includes(dia));
  const puede = existen.filter((s) => (s.tipo !== 'apertura' || e.puede_abrir) && (s.tipo !== 'cierre' || e.puede_cerrar));
  return puede.length ? puede : existen;
}

function diaAnadir(empId, minuto) {
  const d = state.dia;
  const e = empById(state.config, empId);
  if (d.tramos.some((t) => t.empleado_id === empId)) return;
  const opciones = turnosPosibles(e, d.fecha);
  if (!opciones.length) { toast('No hay turnos definidos para este día', true); return; }
  // El turno que contiene la hora tocada y empieza más cerca de ella; si ninguno la contiene, el que empieza más cerca.
  const dist = (s) => Math.abs(toMin(s.inicio) - minuto) + (toMin(s.inicio) <= minuto && minuto < toMin(s.fin) ? 0 : 24 * 60);
  const s = opciones.reduce((m, x) => (dist(x) < dist(m) ? x : m));
  d.tramos.push({ empleado_id: empId, inicio: s.inicio, fin: s.fin, puesto: puestosDe(e)[0], funcion: null, turno_id: s.id });
  renderView();
}

// Ajustes rápidos de un turno: alargar o acortar por un extremo, o desplazarlo entero.
const AJUSTES = [
  ['Alargar', [['fin', 30, '+30 min al final'], ['fin', 60, '+1 h al final'], ['ini', -30, '+30 min al principio'], ['ini', -60, '+1 h al principio']]],
  ['Acortar', [['fin', -30, '−30 min al final'], ['fin', -60, '−1 h al final'], ['ini', 30, '−30 min al principio'], ['ini', 60, '−1 h al principio']]],
  ['Desplazar', [['mover', -60, '← 1 h antes'], ['mover', -30, '← 30 min'], ['mover', 30, '30 min →'], ['mover', 60, '1 h después →']]],
];
function quickAdjustHtml(act, attrs) {
  return `<div class="quick-adj">${AJUSTES.map(([titulo, ops]) => `<div class="qa-row"><span>${titulo}</span>${ops.map(([k, dm, l]) => `<button type="button" data-act="${act}" ${attrs} data-k="${k}" data-dm="${dm}">${l}</button>`).join('')}</div>`).join('')}</div>`;
}
// Aplica un ajuste a un tramo {inicio, fin}; devuelve false si no cabe (antes de las 00:00, después de las 24:00 o sin duración).
export function ajustarTramo(t, k, dm) {
  let a = toMin(t.inicio), b = toMin(t.fin);
  if (k === 'ini') a += dm; else if (k === 'fin') b += dm; else { a += dm; b += dm; }
  if (a < 0 || b > 24 * 60 || b - a < 30) return false;
  t.inicio = fmtMin(a); t.fin = fmtMin(b);
  return true;
}

// Botones para elegir el rol (caja, cafetera...) de un turno: los roles de su puesto que sabe hacer y «sin rol».
function rolesMenu(cfg, e, puesto, actual, act, attrs) {
  const roles = rolesDe(cfg, e, puesto).map((id) => funcById(cfg, id));
  if (!roles.length) return '';
  const boton = (f) => `<button type="button" role="menuitemradio" aria-checked="${(actual || null) === (f ? f.id : null)}" class="rol-opt${(actual || null) === (f ? f.id : null) ? ' current' : ''}" data-act="${act}" ${attrs} data-funcion="${f ? esc(f.id) : ''}">${f ? `<i style="background:${esc(f.color || 'var(--brown)')}"></i>${esc(f.nombre)}` : 'Sin rol'}</button>`;
  return `<hr><div class="ph" style="border:none;margin:0;padding-bottom:2px">Qué hace en el turno</div><div class="rol-opts">${roles.map(boton).join('')}${boton(null)}</div>`;
}

export function openBarMenu(empId, anchor) {
  closeMenu();
  const cfg = state.config;
  const d = state.dia;
  const t = d.tramos.find((x) => x.empleado_id === empId);
  const e = empById(cfg, empId);
  if (!t || !e) return;
  const m = document.createElement('div');
  m.className = 'popover bar-menu';
  m.tabIndex = -1;
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-label', `Turno de ${e.nombre}`);
  m.innerHTML = `<div class="ph"><b>${esc(e.nombre)}</b> · ${esc(fmtLong(d.fecha))}</div>
    <div class="bar-times"><label class="field">Entra<input type="time" step="900" id="bar-ini" value="${t.inicio}"></label>
      <label class="field">Sale<input type="time" step="900" id="bar-fin" value="${t.fin === '24:00' ? '23:59' : t.fin}"></label>
      <button class="btn small primary" data-act="barTimes" data-emp="${esc(empId)}">Aplicar</button></div>
    ${quickAdjustHtml('barAdj', `data-emp="${esc(empId)}"`)}
    ${puestosDe(e).length > 1 ? `<hr>${puestosDe(e).map((p) => `<button class="${t.puesto === p ? 'current' : ''}" data-act="barPuesto" data-emp="${esc(empId)}" data-p="${p}">${puestoTag(p)} En ${PUESTOS[p].toLowerCase()}</button>`).join('')}` : ''}
    ${rolesMenu(cfg, e, t.puesto, t.funcion, 'barRol', `data-emp="${esc(empId)}"`)}
    <hr><div class="ph" style="border:none;margin:0;padding-bottom:2px">Poner las horas de un turno</div>
    ${turnosPosibles(e, d.fecha).map((s) => `<button data-act="barShift" data-emp="${esc(empId)}" data-shift="${esc(s.id)}"><i style="background:${esc(s.color || 'var(--track)')}"></i>${esc(s.nombre)} <small>${s.inicio}–${s.fin}</small></button>`).join('')}
    <hr><button data-act="barRemove" data-emp="${esc(empId)}" class="danger-text">${ICON.trash} Quitar el turno (libra)</button>`;
  document.body.appendChild(m);
  placePopover(m, `.g-bar[data-emp="${CSS.escape(empId)}"]`);
  // En pantallas táctiles no se enfoca la hora: abriría el teclado, que tapa el menú y desplaza la página.
  enfocar(esTactil() ? m : m.querySelector('#bar-ini'));
  return m;
}

const esTactil = () => window.matchMedia('(pointer: coarse)').matches;
const enfocar = (el) => el.focus({ preventScroll: true });

// Un menú flotante se ancla a su casilla o barra por un selector, no por el elemento: la vista se vuelve a
// pintar por detrás (p. ej. al llegar las alertas) y el elemento cambia, pero la casilla sigue siendo la misma.
const MENU_MARGEN = 8, MENU_HUECO = 4;
const altoVisible = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight);

// Coloca el menú junto a su ancla, en el lado (abajo o arriba) con más sitio, y limita su alto a ese sitio para
// que nunca se salga de la pantalla: lo que no quepa se ve desplazando el propio menú.
function placePopover(m, ancla) {
  m.dataset.ancla = ancla;
  const r = document.querySelector(ancla).getBoundingClientRect();
  const abajo = altoVisible() - r.bottom - MENU_HUECO - MENU_MARGEN;
  const arriba = r.top - MENU_HUECO - MENU_MARGEN;
  const mh = m.scrollHeight;
  m.dataset.lado = mh <= abajo || abajo >= arriba ? 'abajo' : 'arriba';
  m.style.maxHeight = `${Math.max(120, Math.min(mh, m.dataset.lado === 'abajo' ? abajo : arriba))}px`;
  seguirAncla(m);
}

// Vuelve a pegar el menú a su ancla (tras desplazar la página o redibujar la vista). Si el ancla ya no existe
// o ha salido de la pantalla, el menú se cierra: ya no se sabría a qué casilla se refiere.
function seguirAncla(m) {
  const ancla = document.querySelector(m.dataset.ancla);
  const r = ancla && ancla.getBoundingClientRect();
  const alto = altoVisible();
  if (!r || r.bottom < 0 || r.top > alto || r.right < 0 || r.left > window.innerWidth) { m.remove(); return; }
  const mh = m.offsetHeight;
  const top = m.dataset.lado === 'abajo' ? r.bottom + MENU_HUECO : r.top - MENU_HUECO - mh;
  m.style.top = `${Math.max(MENU_MARGEN, Math.min(top, alto - MENU_MARGEN - mh))}px`;
  m.style.left = `${Math.max(MENU_MARGEN, Math.min(r.left, window.innerWidth - m.offsetWidth - MENU_MARGEN))}px`;
}
export const seguirAnclas = () => document.querySelectorAll('.popover[data-ancla]').forEach(seguirAncla);

// Teclado: con una barra enfocada, flechas para moverla (Mayús + flechas, para alargarla o acortarla) e Intro para el menú.
document.addEventListener('keydown', (e) => {
  const bar = e.target.closest && e.target.closest('.g-bar');
  if (!bar || !state.dia || diaSoloLectura(state.current)) return;
  const t = state.dia.tramos.find((x) => x.empleado_id === bar.dataset.emp);
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBarMenu(bar.dataset.emp, bar); return; }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const paso = (e.key === 'ArrowLeft' ? -1 : 1) * DIA_PASO();
  const a = toMin(t.inicio), b = toMin(t.fin);
  if (e.shiftKey) { if (b + paso > a && b + paso <= 24 * 60) t.fin = fmtMin(b + paso); }
  else if (a + paso >= 0 && b + paso <= 24 * 60) { t.inicio = fmtMin(a + paso); t.fin = fmtMin(b + paso); }
  renderView();
  const again = document.querySelector(`.g-bar[data-emp="${CSS.escape(t.empleado_id)}"]`);
  if (again) again.focus();
});

export const diaDescartable = async () => !state.dia || !diaCambios(state.dia).length
  || confirmar({ titulo: '¿Descartar los cambios del día?', texto: 'Tienes cambios del día sin confirmar.', verbo: 'Descartar cambios', peligro: true });

// Lo que cambian los cambios del día: reglas, horas y alertas, antes de guardarlos.
export function dayEvalDialog(ev) {
  const cfg = state.config;
  const lista = (titulo, items, cls = '') => (items.length ? `<details class="alert-more"${cls ? ' open' : ''}><summary>${titulo} (${items.length})</summary>
    <ul class="fix-alerts ${cls}">${items.map((a) => `<li><span class="sev-badge ${a.severidad}">${SEV[a.severidad]}</span> ${esc(a.detalle)}</li>`).join('')}</ul></details>` : '');
  const horas = ev.horas.map((x) => horasFila(cfg, x)).join('');
  const bloquea = ev.errores_despues > 0;
  const sinReglas = (list) => list.filter((a) => a.categoria !== 'reglas' && a.severidad !== 'critica');  // ya salen arriba
  const arreglo = ev.destino === 'arreglo';
  return `<h2>Revisar los cambios</h2>
    <p style="margin-top:-6px">${esc(DAY_LABEL[weekday(ev.fecha)])} ${dayNum(ev.fecha)} de ${monthName(ev.fecha)}</p>
    <ul class="fix-list">${ev.movimientos.map((m) => `<li>${esc(m.texto)}</li>`).join('') || '<li>Sin cambios.</li>'}</ul>
    <div class="notice ${ev.criticas.length || bloquea ? 'crit' : 'ok'} small"><span>Alertas ${sevBadges(ev.alertas_antes)} → ${sevBadges(ev.alertas_despues)}${ev.errores_antes || ev.errores_despues ? ` · Reglas incumplidas: <b>${ev.errores_antes}</b> → <b>${ev.errores_despues}</b>` : ''}</span></div>
    ${ev.reglas_nuevas.length ? `<h3 style="margin-top:14px">Reglas que se incumplen</h3><ul class="fix-alerts warn">${ev.reglas_nuevas.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${ev.criticas.length ? `<h3 style="margin-top:14px">El horario no vale tal cual</h3><ul class="fix-alerts warn">${ev.criticas.map((a) => `<li><span class="sev-badge critica">Crítica</span> ${esc(a.detalle)}</li>`).join('')}</ul>` : ''}
    ${horas ? `<h3 style="margin-top:14px">Horas de quien cambia</h3><div class="table-wrap"><table class="list"><thead><tr><th>Persona</th><th class="num">Le tocan</th><th class="num">Antes → después</th></tr></thead><tbody>${horas}</tbody></table></div>` : ''}
    <div style="margin-top:12px">${lista('Alertas nuevas', sinReglas(ev.nuevas), 'warn')}${lista('Alertas que empeoran', sinReglas(ev.empeoradas), 'warn')}
      ${lista('Alertas que se resuelven', ev.resueltas)}${lista('Alertas que mejoran', ev.mejoradas)}</div>
    ${arreglo ? '<div class="notice info small" style="margin-top:12px">El horario está publicado. Al guardar, los cambios quedan en un <b>arreglo</b>: el equipo sigue viendo el horario actual hasta que lo publiques.</div>' : ''}
    ${bloquea ? '<p class="small" style="color:var(--bad)">Con reglas incumplidas se puede guardar, pero no publicar.</p>' : ''}
    <div class="row end" style="margin-top:16px">
      <button class="btn" data-act="closeOverlay">Seguir editando</button>
      <button class="btn" data-act="dayApply">${arreglo ? 'Guardar como arreglo' : 'Guardar'}</button>
      <button class="btn primary" data-act="dayApply" data-publicar="1" ${bloquea ? 'disabled' : ''}>Guardar y publicar</button>
    </div>`;
}

export function summaryTable(h) {
  const cfg = state.config;
  return `<div class="section"><h2>Horas por persona</h2><div class="card" style="padding:0"><div class="table-wrap"><table class="list">
    <thead><tr><th>Persona</th><th class="num">Horas</th><th class="num">Objetivo</th><th class="num">Arrastra</th><th class="num">Extra</th><th class="num">Días</th><th class="num">Fines de semana</th><th class="num">Aperturas</th><th class="num">Cierres</th></tr></thead>
    <tbody>${h.resumen.map((r) => {
      const diff = r.horas - r.horas_objetivo;
      if (r.comodin) {
        return `<tr><td><b>${esc(nameIn(cfg, r.empleado_id))}</b> <span class="badge neutral">Comodín</span></td><td class="num">${fmtH(r.horas)}</td><td class="num muted">—</td><td class="num muted">—</td><td class="num">—</td>
        <td class="num">${r.dias_trabajados}</td><td class="num">${r.fines_de_semana}</td><td class="num">${r.aperturas}</td><td class="num">${r.cierres}</td></tr>`;
      }
      return `<tr><td><b>${esc(nameIn(cfg, r.empleado_id))}</b></td><td class="num">${fmtH(r.horas)}</td><td class="num">${fmtH(r.horas_objetivo)}</td>
      <td class="num muted">${r.saldo_anterior ? (r.saldo_anterior > 0 ? '+' : '') + fmtH(r.saldo_anterior) : '—'}</td>
      <td class="num">${r.horas_extra >= 0.5 ? `<span class="badge warn">${fmtH(r.horas_extra)}</span>` : diff < -cfg.reglas.margen_periodo_horas ? `<span class="badge neutral">${fmtH(diff)}</span>` : '—'}</td>
      <td class="num">${r.dias_trabajados}</td><td class="num">${r.fines_de_semana}</td><td class="num">${r.aperturas}</td><td class="num">${r.cierres}</td></tr>`;
    }).join('')}</tbody></table></div></div>
    <p class="small muted">«Arrastra» son las horas de más (+) o de menos (−) del periodo anterior que se compensan en este. Objetivo = contrato prorrateado sin contar ausencias, menos lo arrastrado. Los comodines no tienen objetivo: solo cubren lo que falta.</p></div>`;
}

// menú de una casilla
export function openCellMenu(btn) {
  closeMenu();
  const cfg = state.config;
  const h = state.current.horario;
  const emp = cfg.empleados.find((e) => e.id === btn.dataset.emp);
  const d = btn.dataset.date;
  const cur = h.asignaciones.find((a) => a.empleado_id === emp.id && a.fecha === d);
  const lock = h.bloqueos.find((l) => l.empleado_id === emp.id && l.fecha === d);
  const absence = cfg.ausencias.find((a) => a.empleado_id === emp.id && a.desde <= d && d <= a.hasta);
  const fixedOff = (emp.libranzas_fijas || []).includes(DAYS[weekday(d)]);
  const note = (s) => {
    if (s.tipo === 'apertura' && !emp.puede_abrir) return 'no abre';
    if (s.tipo === 'cierre' && !emp.puede_cerrar) return 'no cierra';
    if (s.dias && s.dias.length && !s.dias.includes(DAYS[weekday(d)])) return 'no ese día';
    const [desde, hasta] = franjaDe(emp, d);
    if (aMin(s.inicio) < desde || aMin(s.fin) > hasta) return 'fuera de su horario';
    return '';
  };
  const m = document.createElement('div');
  m.className = 'popover';
  m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="ph"><b>${esc(emp.nombre)}</b> · ${fmtLong(d)}${absence ? `<br><span style="color:var(--warn)">${esc(MOTIVOS[absence.motivo])}</span>` : fixedOff ? '<br>Es su día de libranza' : ''}</div>
    ${cfg.turnos.map((s) => `<button role="menuitem" class="${cur && cur.turno_id === s.id ? 'current' : ''}" data-act="setCell" data-emp="${esc(emp.id)}" data-date="${d}" data-shift="${esc(s.id)}"><i style="background:${esc(s.color || 'var(--track)')}"></i>${esc(s.nombre)} <small>${s.inicio}–${s.fin}${note(s) ? ` · <span class="warn-note">${note(s)}</span>` : ''}</small></button>`).join('')}
    <hr>${cur
      ? `<button role="menuitem" class="danger-text" data-act="setCell" data-emp="${esc(emp.id)}" data-date="${d}" data-shift="">${ICON.trash} Quitar el turno <small>ese día libra</small></button>`
      : '<button role="menuitem" class="current" disabled>Libre <small>no tiene turno</small></button>'}
    ${cur && puestosDe(emp).length > 1 ? `<hr>${puestosDe(emp).map((p) => `<button role="menuitem" class="${puestoDe(cfg, cur) === p ? 'current' : ''}" data-act="setCell" data-emp="${esc(emp.id)}" data-date="${d}" data-shift="${esc(cur.turno_id)}" data-puesto="${p}">${puestoTag(p)} En ${PUESTOS[p].toLowerCase()} <small>mismo turno</small></button>`).join('')}` : ''}
    ${cur && shiftById(cfg, cur.turno_id) ? rolesMenu(cfg, emp, puestoDe(cfg, cur), cur.funcion, 'setCell', `data-emp="${esc(emp.id)}" data-date="${d}" data-shift="${esc(cur.turno_id)}" data-puesto="${puestoDe(cfg, cur)}"`) : ''}
    ${cur && shiftById(cfg, cur.turno_id) ? `<hr><div class="ph" style="border:none;margin:0;padding-bottom:2px">Ajustar las horas <small class="muted">(se revisa en la vista del día)</small></div>${quickAdjustHtml('cellAdj', `data-emp="${esc(emp.id)}" data-date="${d}"`)}` : ''}
    ${lock ? `<button role="menuitem" data-act="unlockCell" data-emp="${esc(emp.id)}" data-date="${d}">Quitar bloqueo <small>que decida el motor</small></button>` : ''}`;
  document.body.appendChild(m);
  placePopover(m, `[data-act="cell"][data-emp="${CSS.escape(emp.id)}"][data-date="${d}"]`);
  enfocar(m.querySelector('button.current') || m.querySelector('button'));
}
export function closeMenu() { document.querySelectorAll('.popover').forEach((p) => p.remove()); }
// Al desplazar la página o una tabla, el menú acompaña a su casilla (y se cierra si sale de la pantalla); al
// desplazar el propio menú para ver las opciones que no caben, no se toca.
export function menuOnScroll(e) {
  if (e.target instanceof Element && e.target.closest('.popover')) return;
  seguirAnclas();
}

