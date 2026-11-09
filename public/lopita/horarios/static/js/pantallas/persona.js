import { DAYS, DAY_CHIP, DAY_LABEL, DAY_SHORT, ICON, MOTIVOS, addDays, dayNum, daysBetween, esc, fmtH, fmtLong, fmtShort, toMin, todayIso, weekday } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { PUESTOS, empById, funcTags, head, horasDe, horasPersona, puestoDe, puestoTag, puestosDe, rolDe, rolTag, shiftById, tipoDe, usaPuestos } from '../nucleo/pintado.js';
import { route } from '../nucleo/rutas.js';
import { calChip, calNav, calRango, calTitulo } from './calendario.js';
import { ensure } from './portal.js';
// ------------------------------------------------------------------ CALENDARIO POR PERSONA
// En lugar de día a día, el horario de cada persona en la semana o el mes: una tarjeta por persona con sus horas
// frente al contrato y una tira con sus turnos. Tocarla abre su vista en detalle (#/calendario/persona/<id>), con
// cada día del periodo, sus horas, ausencias y libranzas; tocar un día lo abre en su horario para cambiarlo.
// Los turnos salen de /api/calendario (el horario que manda cada día) y las horas de contrato del informe de horas
// contando también los borradores, que elige los mismos horarios.

// Enlace a la vista de una persona; con fecha, se abre en el periodo que contiene esa fecha.
export const personaHref = (id, fecha) => `#/calendario/persona/${encodeURIComponent(id)}${fecha ? `/${fecha}` : ''}`;

// Lo que hace una persona un día en el calendario: su turno, una ausencia, su libranza fija, libre o sin horario.
function personaDia(cfg, data, porDia, e, d) {
  const info = data.dias[d];
  const aus = cfg.ausencias.find((x) => x.empleado_id === e.id && x.desde <= d && d <= x.hasta);
  if (!info) return { fecha: d, clase: 'nohay', texto: 'Sin horario', aus };
  if (info.cerrado) return { fecha: d, clase: 'cerrado', texto: 'Cerrado', info };
  const a = (porDia.get(d) || []).find((x) => x.empleado_id === e.id);
  const s = a && shiftById(cfg, a.turno_id);
  const lock = info.bloqueos.includes(e.id);
  if (s) {
    const hs = horasDe(cfg, a);
    return { fecha: d, clase: 'turno', a, s, hs, mins: toMin(hs.fin) - toMin(hs.inicio), info, lock };
  }
  if (aus) return { fecha: d, clase: 'ausencia', texto: MOTIVOS[aus.motivo] || 'Ausencia', info, lock, aus };
  const libra = (e.libranzas_fijas || []).includes(DAYS[weekday(d)]);
  return { fecha: d, clase: 'libre', texto: libra ? 'Libra' : 'Libre', libra, info, lock };
}

function calPorDia(data) {
  const porDia = new Map();
  for (const a of data.asignaciones) { if (!porDia.has(a.fecha)) porDia.set(a.fecha, []); porDia.get(a.fecha).push(a); }
  return porDia;
}

const fechasEntre = (desde, hasta) => Array.from({ length: daysBetween(desde, hasta) + 1 }, (_, i) => addDays(desde, i));

// Horas de contrato (y extra, aperturas…) de cada persona en el periodo. null mientras carga o si falla: la vista
// se pinta igual, sin esa columna.
function calInforme(desde, hasta) {
  const key = `${desde}|${hasta}`;
  ensure(state.cal.inf, key, `/api/informes/horas?desde=${desde}&hasta=${hasta}&borradores=true`);
  const v = state.cal.inf[key];
  return v && !v.error ? new Map(v.empleados.map((x) => [x.empleado_id, x])) : null;
}

// Una casilla pequeña de la tira de turnos de la tarjeta.
function tiraDia(dia) {
  const t = `${fmtShort(dia.fecha)}: ${dia.clase === 'turno' ? `${dia.s.nombre} ${dia.hs.inicio}–${dia.hs.fin}` : dia.texto}`;
  return `<i class="tira-${dia.clase}${dia.libra ? ' libra' : ''}" title="${esc(t)}" ${dia.clase === 'turno' ? `style="background:${esc(dia.s.color || 'var(--track)')}"` : ''}></i>`;
}

const horasFrenteContrato = (e, mins, inf) => {
  const h = mins / 60;
  if (e.comodin || !inf || !inf.objetivo) return `<b>${fmtH(Math.round(h * 100) / 100)} h</b>`;
  const dif = Math.round((h - inf.objetivo) * 100) / 100;
  const cls = dif >= 0.5 ? 'warn-text' : dif <= -0.5 ? 'muted' : '';
  return `<b>${fmtH(Math.round(h * 100) / 100)} h</b> <span class="small ${cls}">de ${fmtH(inf.objetivo)} h${Math.abs(dif) >= 0.5 ? ` (${dif > 0 ? '+' : '−'}${fmtH(Math.abs(dif))})` : ''}</span>`;
};

export function calPersonas(desde, hasta, data) {
  const cfg = state.config;
  const porDia = calPorDia(data);
  const inf = calInforme(desde, hasta);
  const fechas = fechasEntre(desde, hasta);
  const emps = cfg.empleados.filter((e) => e.activo || data.asignaciones.some((a) => a.empleado_id === e.id));
  if (!emps.length) return '<div class="empty">No hay nadie en la plantilla.</div>';
  const sinHorario = Object.keys(data.dias).length === 0;
  const aviso = sinHorario ? '<div class="notice info section"><span>No hay ningún horario en estas fechas: verás a cada persona sin turnos.</span><span class="spacer"></span><a class="btn small primary" href="#/horarios">Crear un horario</a></div>' : '';
  const tarjetas = emps.map((e) => {
    const dias = fechas.map((d) => personaDia(cfg, data, porDia, e, d));
    const turnos = dias.filter((x) => x.clase === 'turno');
    const mins = turnos.reduce((t, x) => t + x.mins, 0);
    const ausencias = dias.filter((x) => x.clase === 'ausencia').length;
    const hoy = todayIso();
    const prox = turnos.find((x) => x.fecha >= hoy);
    return `<a class="card persona-card" href="${personaHref(e.id)}" aria-label="${esc(`${e.nombre}: ${turnos.length} turnos, ${fmtH(mins / 60)} horas. Ver su horario`)}">
      <div class="persona-top"><div><b class="persona-nombre">${esc(e.nombre)}</b>${e.activo ? '' : ' <span class="badge neutral">Fuera de plantilla</span>'}<div class="small muted">${esc(horasPersona(e))} · ${esc(tipoDe(e))}</div></div>
        <div class="persona-horas">${horasFrenteContrato(e, mins, inf && inf.get(e.id))}<div class="small muted">${turnos.length} ${turnos.length === 1 ? 'turno' : 'turnos'}${ausencias ? ` · ${ausencias} de ausencia` : ''}</div></div></div>
      <span class="func-tags">${funcTags(cfg, e)}</span>
      <div class="tira${fechas.length > 7 ? ' mes' : ''}" aria-hidden="true">${dias.map(tiraDia).join('')}</div>
      ${fechas.length <= 7 ? `<div class="tira tira-dias" aria-hidden="true">${fechas.map((d) => `<span>${DAY_CHIP[weekday(d)]}</span>`).join('')}</div>` : ''}
      <div class="small muted persona-prox">${prox ? `Próximo turno: ${esc(fmtLong(prox.fecha))}, ${prox.hs.inicio}–${prox.hs.fin}` : turnos.length ? 'Sin más turnos en estas fechas' : 'Sin turnos en estas fechas'}</div>
    </a>`;
  }).join('');
  return `${aviso}<div class="persona-grid section">${tarjetas}</div>`;
}

// Ventana de horas de la línea de tiempo: de la primera hora a la que empieza un turno a la última a la que acaba.
function personaVentana(cfg, dias) {
  const mins = cfg.turnos.flatMap((s) => [toMin(s.inicio), toMin(s.fin)]);
  for (const x of dias) if (x.hs) mins.push(toMin(x.hs.inicio), toMin(x.hs.fin));
  if (!mins.length) return [7 * 60, 23 * 60];
  return [Math.floor(Math.min(...mins) / 60) * 60, Math.ceil(Math.max(...mins) / 60) * 60];
}

const franjasTexto = (e) => (e.restricciones_horarias || []).map((r) => `${r.dias && r.dias.length ? r.dias.map((d) => DAY_SHORT[DAYS.indexOf(d)]).join(', ') : 'Todos los días'} de ${r.desde} a ${r.hasta}`);

export function viewPersona(id) {
  const cfg = state.config;
  const c = state.cal;
  const e = empById(cfg, id);
  const r = route();
  if (r.arg3 && c.refPersona !== `${id}|${r.arg3}`) { c.refPersona = `${id}|${r.arg3}`; c.ref = r.arg3; }
  if (c.modo === 'dia') c.modo = 'semana';
  if (!e) return `${head('Calendario')}<div class="card"><div class="notice warn">No encuentro a esa persona en la plantilla.</div><p><a class="btn" href="#/calendario">Volver al calendario</a></p></div>`;
  const [desde, hasta] = calRango();
  const datos = [];
  if (e.puede_abrir) datos.push('abre');
  if (e.puede_cerrar) datos.push('cierra');
  const fijas = (e.libranzas_fijas || []).map((d) => DAY_LABEL[DAYS.indexOf(d)].toLowerCase());
  const franjas = franjasTexto(e);
  const ficha = `<div class="persona-ficha small">
      <span><b>${esc(horasPersona(e))}</b></span><span>${esc(tipoDe(e))}${usaPuestos(cfg) ? ` · principal: ${esc(PUESTOS[puestosDe(e)[0]].toLowerCase())}` : ''}</span>
      ${fijas.length ? `<span>Libra los ${esc(fijas.join(', '))}</span>` : ''}
      ${franjas.length ? `<span>Puede trabajar: ${esc(franjas.join('; '))}</span>` : ''}
      ${e.activo ? '' : '<span class="badge neutral">Fuera de plantilla</span>'}
      <span class="func-tags">${funcTags(cfg, e)}</span>
    </div>`;
  const otras = cfg.empleados.filter((x) => x.activo || x.id === e.id);
  const barra = `<div class="card cal-bar no-print"><div class="row" style="gap:10px;align-items:center">
    <a class="btn small" href="#/calendario" data-act="calVolverPersonas">‹ Todo el equipo</a>
    <div class="chips" role="group" aria-label="Periodo">${calChip('calModo', c.modo, 'semana', 'Semana')}${calChip('calModo', c.modo, 'mes', 'Mes')}</div>
    ${calNav()}
    <h2 style="margin:0">${calTitulo(desde, hasta)}</h2><span class="spacer"></span>
    <label class="field inline">Persona<select data-act-change="calIrPersona">${otras.map((x) => `<option value="${esc(x.id)}" ${x.id === e.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>
  </div></div>`;
  const head0 = `${head(esc(e.nombre), 'Su horario día a día. Toca un día para abrirlo en su horario y cambiarlo hora a hora.')}${ficha}`;
  const key = `${desde}|${hasta}`;
  const err = ensure(c.data, key, `/api/calendario?desde=${desde}&hasta=${hasta}`);
  if (err) return head0 + barra + err;
  const data = c.data[key];
  const porDia = calPorDia(data);
  const infMap = calInforme(desde, hasta);
  const inf = infMap && infMap.get(e.id);
  const dias = fechasEntre(desde, hasta).map((d) => personaDia(cfg, data, porDia, e, d));
  const turnos = dias.filter((x) => x.clase === 'turno');
  const mins = turnos.reduce((t, x) => t + x.mins, 0);
  const cuenta = (cl) => dias.filter((x) => x.clase === cl).length;
  const findes = turnos.filter((x) => weekday(x.fecha) >= 5).length;
  const tipoT = (x) => x.s.tipo;
  const conPuestos = usaPuestos(cfg);
  const h = Math.round(mins / 6) / 10;
  const dif = inf && !e.comodin && inf.objetivo ? Math.round((h - inf.objetivo) * 10) / 10 : null;
  const stats = `<div class="stats section">
    <div class="stat"><b>${fmtH(h)} h</b><span>previstas en estas fechas</span></div>
    ${e.comodin ? '<div class="stat"><b>—</b><span>sin contrato (comodín)</span></div>' : `<div class="stat"><b>${inf ? `${fmtH(inf.objetivo)} h` : '…'}</b><span>de contrato en los días con horario</span></div>`}
    ${dif !== null ? `<div class="stat ${dif >= 0.5 ? 'warn' : ''}"><b>${dif > 0 ? '+' : dif < 0 ? '−' : ''}${fmtH(Math.abs(dif))} h</b><span>${dif >= 0.5 ? 'horas extra' : dif <= -0.5 ? 'de menos' : 'cuadra con el contrato'}</span></div>` : ''}
    <div class="stat"><b>${turnos.length}</b><span>${turnos.length === 1 ? 'jornada' : 'jornadas'}</span></div>
    <div class="stat"><b>${cuenta('libre')}</b><span>días libres</span></div>
    ${cuenta('ausencia') ? `<div class="stat"><b>${cuenta('ausencia')}</b><span>días de ausencia</span></div>` : ''}
    <div class="stat"><b>${findes}</b><span>días de fin de semana</span></div>
    <div class="stat"><b>${turnos.filter((x) => tipoT(x) === 'apertura').length} · ${turnos.filter((x) => tipoT(x) === 'cierre').length}</b><span>aperturas · cierres</span></div>
  </div>`;
  const [v0, v1] = personaVentana(cfg, dias);
  const pct = (m) => `${((m - v0) / (v1 - v0)) * 100}%`;
  const marcas = [];
  for (let m = v0; m <= v1; m += 120) marcas.push(m);
  const regla = `<div class="pd-row pd-head" aria-hidden="true"><span></span><span></span><span class="pd-time">${marcas.map((m) => `<em style="left:${pct(m)}">${m / 60}</em>`).join('')}</span><span></span></div>`;
  const hoy = todayIso();
  // Si todo el periodo es borrador (o todo publicado) se dice una vez arriba; si se mezclan, en cada día.
  const conHorario = dias.filter((x) => x.info);
  const borradores = conHorario.filter((x) => x.info.estado !== 'publicado').length;
  const mezcla = borradores && borradores < conHorario.length;
  const avisoBorrador = borradores && !mezcla
    ? '<div class="notice info section"><span>Estas fechas son de un horario en borrador: el equipo aún no las ve.</span></div>' : '';
  const filas = dias.map((x) => {
    const fecha = `<span class="pd-date"><b>${DAY_SHORT[weekday(x.fecha)]} ${dayNum(x.fecha)}</b>${x.fecha === hoy ? ' <span class="badge borrador">Hoy</span>' : ''}${mezcla && x.info && x.info.estado !== 'publicado' ? ' <span class="badge neutral">Borrador</span>' : ''}</span>`;
    let que, linea = '', horas = '';
    if (x.clase === 'turno') {
      que = `<span class="pill${x.a.inicio ? ' custom' : ''}" style="background:${esc(x.s.color || 'var(--track)')}">${esc(x.s.nombre)}${conPuestos ? ` ${puestoTag(puestoDe(cfg, x.a))}` : ''}</span>${rolTag(rolDe(cfg, x.a))} <span class="pd-hours">${x.hs.inicio}–${x.hs.fin}</span>${x.lock ? `<span class="lock" title="Cambio manual">${ICON.lock}</span>` : ''}`;
      linea = `<i style="left:${pct(toMin(x.hs.inicio))};width:${((toMin(x.hs.fin) - toMin(x.hs.inicio)) / (v1 - v0)) * 100}%;background:${esc(x.s.color || 'var(--track)')}"></i>`;
      horas = `${fmtH(Math.round(x.mins / 6) / 10)} h`;
    } else que = `<span class="pd-txt-${x.clase}">${esc(x.texto)}</span>${x.lock ? `<span class="lock" title="Cambio manual">${ICON.lock}</span>` : ''}`;
    const label = `${fmtLong(x.fecha)}: ${x.clase === 'turno' ? `${x.s.nombre} de ${x.hs.inicio} a ${x.hs.fin}` : x.texto}`;
    const cuerpo = `${fecha}<span class="pd-what">${que}</span><span class="pd-time">${linea}</span><span class="pd-tot">${horas}</span>`;
    return x.info
      ? `<button type="button" class="pd-row pd-${x.clase}${x.fecha === hoy ? ' hoy' : ''}" data-act="calDia" data-date="${x.fecha}" aria-label="${esc(`${label}. Abrir el día`)}">${cuerpo}</button>`
      : `<div class="pd-row pd-nohay" aria-label="${esc(label)}">${cuerpo}</div>`;
  }).join('');
  const sinHorario = Object.keys(data.dias).length === 0
    ? '<div class="notice info section"><span>No hay ningún horario en estas fechas.</span><span class="spacer"></span><a class="btn small primary" href="#/horarios">Crear un horario</a></div>' : '';
  return `${head0}${barra}${sinHorario}${avisoBorrador}${stats}<div class="card section persona-dias" style="padding:0">${regla}${filas}</div>
    <p class="small muted">Cada día sale del horario que manda en esa fecha: el publicado o, si no hay, el borrador más reciente. «Contrato» son sus horas de contrato prorrateadas en los días que tienen horario, sin contar ausencias.</p>`;
}

