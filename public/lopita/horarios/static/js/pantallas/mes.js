import { DAYS, DAY_SHORT, MOTIVOS, addDays, dayNum, esc, fmtLong, iso, monthName, toMin, todayIso, weekday } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { empById, horasDe, shiftById } from '../nucleo/pintado.js';
import { nameIn } from './cuadrante.js';
import { coverageBar } from './alertas.js';
// ------------------------------------------------------------------ VISTA MENSUAL
// Rejilla de calendario (lunes a domingo) de cada mes entre desde y hasta. celda(fecha) devuelve el contenido de
// los días con horario o null para los que no tiene.
export function monthGrid(desde, hasta, celda, { titulo = true } = {}) {
  let html = '';
  let m = `${desde.slice(0, 7)}-01`;
  while (m <= hasta) {
    const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7));
    const ultimo = iso(new Date(Date.UTC(y, mo, 0)));
    let d = addDays(m, -weekday(m));
    const fin = addDays(ultimo, 6 - weekday(ultimo));
    const cells = [];
    while (d <= fin) {
      const enMes = d.slice(0, 7) === m.slice(0, 7);
      const c = enMes ? celda(d) : null;
      cells.push(`<div class="mcell${enMes ? '' : ' other'}${c === null ? ' empty' : ''}${d === todayIso() ? ' today' : ''}">${enMes ? `<div class="mnum">${dayNum(d)}</div>${c || ''}` : ''}</div>`);
      d = addDays(d, 1);
    }
    html += `<div class="month section">${titulo ? `<h2 style="text-transform:capitalize">${monthName(m)} ${y}</h2>` : ''}
      <div class="mgrid">${DAY_SHORT.map((x) => `<div class="mhead">${x}</div>`).join('')}${cells.join('')}</div></div>`;
    m = addDays(ultimo, 1);
  }
  return html;
}

// Contenido de un día en la vista de mes: cobertura, quién trabaja (o el turno de una persona) y un aviso.
export function monthDayHtml(cfg, fecha, asigs, cob, { act, attrs = '', persona = '', alertas = 0, borrador = false }) {
  const horasDe2 = (a) => horasDe(cfg, a);
  const lista = asigs.filter((a) => shiftById(cfg, a.turno_id)).sort((a, b) => toMin(horasDe2(a).inicio) - toMin(horasDe2(b).inicio));
  let body;
  if (cob && cob.cerrado) body = '<div class="small muted">Cerrado</div>';
  else if (persona) {
    const a = lista.find((x) => x.empleado_id === persona);
    const e = empById(cfg, persona);
    const aus = cfg.ausencias.find((x) => x.empleado_id === persona && x.desde <= fecha && fecha <= x.hasta);
    body = a ? `<span class="mchip big" style="background:${esc(shiftById(cfg, a.turno_id).color || 'var(--track)')}">${esc(shiftById(cfg, a.turno_id).nombre)}<small>${horasDe2(a).inicio}–${horasDe2(a).fin}</small></span>`
      : `<span class="small muted">${aus ? esc(MOTIVOS[aus.motivo] || 'Ausencia') : e && (e.libranzas_fijas || []).includes(DAYS[weekday(fecha)]) ? 'Libra' : 'Libre'}</span>`;
  } else {
    const max = 6;
    body = lista.slice(0, max).map((a) => `<span class="mchip" style="background:${esc(shiftById(cfg, a.turno_id).color || 'var(--track)')}" title="${esc(`${nameIn(cfg, a.empleado_id)} ${horasDe2(a).inicio}–${horasDe2(a).fin}`)}">${esc(nameIn(cfg, a.empleado_id))} <small>${horasDe2(a).inicio.slice(0, 5).replace(':00', '')}–${horasDe2(a).fin.replace(':00', '')}</small></span>`).join('')
      + (lista.length > max ? `<span class="small muted">+${lista.length - max} más</span>` : '')
      || '<span class="small muted">Nadie</span>';
  }
  const label = `${fmtLong(fecha)}: ${lista.length} ${lista.length === 1 ? 'persona' : 'personas'}${alertas ? `, ${alertas} alertas` : ''}. Abrir el día`;
  return `<button type="button" class="mday" data-act="${act}" data-date="${fecha}" ${attrs} aria-label="${esc(label)}">
    ${alertas || borrador ? `<span class="mflags">${borrador ? '<span class="badge borrador">Borrador</span>' : ''}${alertas ? `<span class="badge warn" title="Alertas de este día">${alertas}</span>` : ''}</span>` : ''}
    <span class="mlist">${body}</span>${cob ? coverageBar(cob) : ''}</button>`;
}

export function monthOfSchedule(cur) {
  const cfg = state.config;
  const h = cur.horario;
  const porDia = new Map();
  for (const a of h.asignaciones) { if (!porDia.has(a.fecha)) porDia.set(a.fecha, []); porDia.get(a.fecha).push(a); }
  const alertasDe = (f) => cur.alertas_detalle.activas.filter((a) => a.fecha === f).length;
  return monthGrid(h.desde, h.hasta, (f) => (f < h.desde || f > h.hasta ? null
    : monthDayHtml(cfg, f, porDia.get(f) || [], cur.cobertura[f], { act: 'openDay', alertas: alertasDe(f) })));
}

