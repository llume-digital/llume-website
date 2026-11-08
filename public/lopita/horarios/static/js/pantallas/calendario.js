import { DAYS, DAY_SHORT, ICON, MOTIVOS, addDays, dayNum, esc, fmtH, fmtLong, fmtRange, iso, monthName, toMin, todayIso, weekday } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { abreviaturas, capTags, funcionesDe, head, horasDe, puestoDe, puestoTag, rolDe, rolTag, route, shiftById, tipoDe, usaPuestos } from '../nucleo/pintado.js';
import { coverageBar } from './alertas.js';
import { monthDayHtml, monthGrid } from './mes.js';
import { calPersonas, personaHref, viewPersona } from './persona.js';
import { ensure } from './portal.js';
// ------------------------------------------------------------------ CALENDARIO (todos los horarios juntos)
// Semana a semana o mes a mes, con lo que manda cada día (el horario publicado o, si no hay, el borrador más
// reciente). Tocar un día o un turno abre ese día en su horario para editarlo hora a hora.
export function calRango() {
  const c = state.cal;
  if (!c.ref) c.ref = todayIso();
  if (c.modo === 'mes') {
    const y = Number(c.ref.slice(0, 4)), m = Number(c.ref.slice(5, 7));
    return [`${c.ref.slice(0, 7)}-01`, iso(new Date(Date.UTC(y, m, 0)))];
  }
  const lunes = addDays(c.ref, -weekday(c.ref));
  return [lunes, addDays(lunes, 6)];
}

// Título del periodo que se enseña (semana o mes) y botones para moverse.
export function calTitulo(desde, hasta) {
  return state.cal.modo === 'mes' ? `<span style="text-transform:capitalize">${monthName(desde)}</span> ${desde.slice(0, 4)}` : `Semana del ${fmtRange(desde, hasta)}`;
}
export const calNav = () => `<div class="row" style="gap:6px"><button class="btn small" data-act="calMover" data-dir="-1" aria-label="Anterior">‹</button>
      <button class="btn small" data-act="calHoy">Hoy</button>
      <button class="btn small" data-act="calMover" data-dir="1" aria-label="Siguiente">›</button></div>`;
export const calChip = (act, actual, v, l) => `<button type="button" class="chip ${actual === v ? 'on' : ''}" data-act="${act}" data-v="${v}" aria-pressed="${actual === v}">${l}</button>`;

export function viewCalendario() {
  const r = route();
  if (r.arg === 'persona' && r.arg2) return viewPersona(decodeURIComponent(r.arg2));
  const c = state.cal;
  const cfg = state.config;
  const porPersona = c.agrupar === 'persona';
  if (porPersona && c.modo === 'dia') c.modo = 'semana';
  const [desde, hasta] = calRango();
  const chip = (v, l) => calChip('calModo', c.modo, v, l);
  const barra = `<div class="card cal-bar no-print"><div class="row" style="gap:10px;align-items:center">
    <div class="chips" role="group" aria-label="Ver por">${calChip('calAgrupar', c.agrupar, 'fecha', 'Por fecha')}${calChip('calAgrupar', c.agrupar, 'persona', 'Por persona')}</div>
    <div class="chips" role="group" aria-label="Vista">${porPersona ? '' : chip('dia', 'Día')}${chip('semana', 'Semana')}${chip('mes', 'Mes')}</div>
    ${calNav()}
    <h2 style="margin:0">${calTitulo(desde, hasta)}</h2><span class="spacer"></span>
    ${porPersona ? '' : `<label class="field inline">Persona<select data-act-change="calPersona"><option value="">Todo el equipo</option>${cfg.empleados.filter((e) => e.activo).map((e) => `<option value="${esc(e.id)}" ${c.persona === e.id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></label>`}
  </div></div>`;
  const head0 = head('Calendario', porPersona
    ? 'El horario de cada persona en las fechas que elijas. Toca a alguien para ver sus turnos en detalle.'
    : 'Todos los horarios juntos, día a día, semana a semana o mes a mes. Toca un día o un turno para abrirlo y cambiarlo.');
  const key = `${desde}|${hasta}`;
  const err = ensure(c.data, key, `/api/calendario?desde=${desde}&hasta=${hasta}`);
  if (err) return head0 + barra + err;
  const data = c.data[key];
  if (porPersona) return head0 + barra + calPersonas(desde, hasta, data);
  const porDia = new Map();
  for (const a of data.asignaciones) { if (!porDia.has(a.fecha)) porDia.set(a.fecha, []); porDia.get(a.fecha).push(a); }
  const sinHorario = Object.keys(data.dias).length === 0;
  const aviso = sinHorario ? '<div class="notice info section"><span>No hay ningún horario en estas fechas.</span><span class="spacer"></span><a class="btn small primary" href="#/horarios">Crear un horario</a></div>' : '';
  const leyenda = `<div class="shift-legend section">${cfg.turnos.map((s) => `<span><i style="background:${esc(s.color || 'var(--track)')}"></i>${esc(s.nombre)} ${s.inicio}–${s.fin}</span>`).join('')}</div>`;
  if (c.modo === 'mes') {
    return head0 + barra + aviso + leyenda + monthGrid(desde, hasta, (f) => {
      const info = data.dias[f];
      if (!info) return '<div class="small muted mnone">Sin horario</div>';
      return monthDayHtml(cfg, f, porDia.get(f) || [], info, { act: 'calDia', persona: c.persona, borrador: info.estado !== 'publicado' });
    }, { titulo: false });
  }
  return head0 + barra + aviso + leyenda + calSemana(desde, data, porDia);
}

function calSemana(lunes, data, porDia) {
  const cfg = state.config;
  const c = state.cal;
  const dias = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  const emps = cfg.empleados.filter((e) => (c.persona ? e.id === c.persona : e.activo || data.asignaciones.some((a) => a.empleado_id === e.id)));
  const filas = emps.map((e) => {
    let mins = 0;
    const cells = dias.map((d) => {
      const info = data.dias[d];
      if (!info) return '<td class="out"></td>';
      const a = (porDia.get(d) || []).find((x) => x.empleado_id === e.id);
      const s = a && shiftById(cfg, a.turno_id);
      const aus = cfg.ausencias.find((x) => x.empleado_id === e.id && x.desde <= d && d <= x.hasta);
      const libra = (e.libranzas_fijas || []).includes(DAYS[weekday(d)]);
      let inner;
      if (s) {
        const hs = horasDe(cfg, a);
        mins += toMin(hs.fin) - toMin(hs.inicio);
        inner = `<span class="pill${a.inicio ? ' custom' : ''}" style="background:${esc(s.color || 'var(--track)')}">${esc(s.id)}${usaPuestos(cfg) ? puestoTag(puestoDe(cfg, a)) : ''}<small>${hs.inicio}–${hs.fin}</small>${rolTag(rolDe(cfg, a))}</span>`;
      } else inner = `<span class="${aus ? 'abs' : 'off'}">${aus ? esc(MOTIVOS[aus.motivo] || 'Ausencia') : libra ? 'libra' : 'libre'}</span>`;
      const lock = info.bloqueos.includes(e.id);
      return `<td><button class="cell" data-act="calDia" data-date="${d}" aria-label="${esc(`${e.nombre}, ${fmtLong(d)}: ${s ? `${s.nombre}` : 'libre'}. Abrir el día`)}">${inner}${lock ? `<span class="lock">${ICON.lock}</span>` : ''}</button></td>`;
    }).join('');
    return `<tr><td class="emp"><a class="emp-link" href="${personaHref(e.id)}" title="Ver el horario de ${esc(e.nombre)}">${esc(e.nombre)}</a><small>${esc(tipoDe(e))}</small>${capTags(funcionesDe(cfg, e), abreviaturas(cfg))}</td>${cells}<td class="tot">${fmtH(mins / 60)} h</td></tr>`;
  }).join('');
  return `<div class="sched-wrap section"><table class="sched"><thead><tr><th class="emp">Equipo</th>
    ${dias.map((d) => {
      const info = data.dias[d];
      return info ? `<th><button class="dname dlink" data-act="calDia" data-date="${d}" title="Abrir el día">${DAY_SHORT[weekday(d)]} ${dayNum(d)}</button><div class="dtype">${esc(info.tipo || '')}${info.estado !== 'publicado' ? ' · borrador' : ''}</div>${coverageBar(info)}</th>`
        : `<th class="out"><div class="dname muted">${DAY_SHORT[weekday(d)]} ${dayNum(d)}</div><div class="dtype">sin horario</div></th>`;
    }).join('')}<th class="tot">Horas</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}

