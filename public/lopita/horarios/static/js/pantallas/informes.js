import { esc, fmtH, fmtRange, fmtShort, monthName, todayIso } from '../nucleo/util.js';
import { overlay, state } from '../nucleo/estado.js';
import { head, mic } from '../nucleo/pintado.js';
import { CLASES, ensure, monthBounds, shiftText, signed } from './portal.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ INFORMES DE HORAS (encargados)
export function viewInformes() {
  const h = state.inf; if (!h.desde) [h.desde, h.hasta] = monthBounds(0);
  const q = `desde=${h.desde}&hasta=${h.hasta}${h.borradores ? '&borradores=true' : ''}`;
  const title = head('Informes de horas', 'Cuánto ha trabajado cada persona en el periodo que elijas: horas, objetivo de contrato, horas extra, días, fines de semana, aperturas y cierres. Las horas ajustadas incluyen las correcciones aprobadas.', `<a class="btn" href="/api/informes/horas.csv?${q}">Descargar CSV</a>`);
  const anio = todayIso().slice(0, 4);
  const barra = `<div class="card"><div class="row" style="align-items:flex-end;gap:12px">
    <label class="field">Desde<input type="date" value="${h.desde}" data-act-change="periodo" data-h="inf" data-k="desde"></label>
    <label class="field">Hasta<input type="date" value="${h.hasta}" data-act-change="periodo" data-h="inf" data-k="hasta"></label>
    <button class="chip" data-act="periodoRapido" data-h="inf" data-off="0">Este mes</button>
    <button class="chip" data-act="periodoRapido" data-h="inf" data-off="-1">Mes anterior</button>
    <button class="chip" data-act="periodoRango" data-desde="${monthBounds(-2)[0]}" data-hasta="${monthBounds(0)[1]}">Últimos 3 meses</button>
    <button class="chip" data-act="periodoRango" data-desde="${anio}-01-01" data-hasta="${anio}-12-31">Este año</button>
    <label class="toggle" style="margin-left:auto"><input type="checkbox" data-act-change="infBorradores" ${h.borradores ? 'checked' : ''}> Contar también los borradores</label>
  </div></div>`;
  const err = ensure(h, 'data', `/api/informes/horas?${q}`);
  if (err) return title + barra + err;
  const rows = h.data.empleados;
  const sum = (k) => rows.reduce((t, e) => t + (e[k] || 0), 0);
  const meses = rows.length ? rows[0].meses.map((m) => m.mes) : [];
  const mesTxt = (m) => `${monthName(`${m}-01`).slice(0, 3)} ${m.slice(2, 4)}`;
  const extraBadge = (x) => (x >= 0.5 ? `<span class="badge warn">${fmtH(x)}</span>` : '—');
  const menosBadge = (x) => (x >= 0.5 ? `<span class="badge neutral">${fmtH(x)}</span>` : '—');
  const maxH = Math.max(1, ...rows.map((e) => Math.max(e.ajustadas, e.objetivo)));
  const barraH = (e) => `<div class="hbar" title="${fmtH(e.ajustadas)} h de ${fmtH(e.objetivo)} h"><i style="width:${(e.ajustadas / maxH) * 100}%" class="${e.extra >= 0.5 ? 'over' : e.de_menos >= 0.5 ? 'under' : ''}"></i><b style="left:${(e.objetivo / maxH) * 100}%"></b></div>`;
  const totales = `<div class="stats">
    <div class="stat"><b>${fmtH(Math.round(sum('ajustadas') * 10) / 10)} h</b><span>trabajadas en total</span></div>
    <div class="stat"><b>${fmtH(Math.round(sum('objetivo') * 10) / 10)} h</b><span>de contrato en esas fechas</span></div>
    <div class="stat ${sum('extra') >= 0.5 ? 'warn' : ''}"><b>${fmtH(Math.round(sum('extra') * 10) / 10)} h</b><span>horas extra</span></div>
    <div class="stat"><b>${sum('dias_trabajados')}</b><span>jornadas</span></div>
  </div>`;
  const tabla = `<div class="card section" style="padding:0"><div class="table-wrap"><table class="list">
    <thead><tr><th>Persona</th><th style="min-width:140px">Horas frente al contrato</th><th class="num">Trabajadas</th><th class="num">Contrato</th><th class="num">Extra</th><th class="num">De menos</th><th class="num">Días</th><th class="num">Fines de semana</th><th class="num">Festivos</th><th class="num">Aperturas</th><th class="num">Cierres</th><th class="num">Correcciones</th><th></th></tr></thead><tbody>
    ${rows.map((e) => `<tr><td><b>${esc(e.nombre)}</b></td><td>${barraH(e)}</td>
      <td class="num"><b>${fmtH(e.ajustadas)}</b>${e.diferencia ? `<div class="small muted">previstas ${fmtH(e.previstas)}</div>` : ''}</td><td class="num">${fmtH(e.objetivo)}</td>
      <td class="num">${extraBadge(e.extra)}</td><td class="num">${menosBadge(e.de_menos)}</td>
      <td class="num">${e.dias_trabajados}</td><td class="num">${e.fines_de_semana}</td><td class="num">${e.festivos}</td><td class="num">${e.aperturas}</td><td class="num">${e.cierres}</td>
      <td class="num">${e.pendientes ? `<span class="badge bad" title="Pendientes de aprobar">${e.pendientes}</span>` : e.diferencia ? signed(e.diferencia) : '—'}</td>
      <td style="text-align:right"><button class="btn small" data-act="infDetalle" data-e="${esc(e.empleado_id)}">Detalle</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
  const porMes = meses.length > 1 ? `<div class="section"><h2>Mes a mes</h2><div class="card" style="padding:0"><div class="table-wrap"><table class="list">
    <thead><tr><th>Persona</th>${meses.map((m) => `<th class="num">${mesTxt(m)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
    ${rows.map((e) => `<tr><td><b>${esc(e.nombre)}</b></td>${e.meses.map((m) => `<td class="num">${m.objetivo || m.ajustadas ? `<b>${fmtH(m.ajustadas)}</b><div class="small ${m.extra >= 0.5 ? 'warn-text' : 'muted'}">${m.extra >= 0.5 ? `+${fmtH(m.extra)} extra` : m.de_menos >= 0.5 ? `−${fmtH(m.de_menos)}` : m.objetivo ? `de ${fmtH(m.objetivo)}` : ''}</div>` : '<span class="muted">—</span>'}</td>`).join('')}<td class="num"><b>${fmtH(e.ajustadas)}</b></td></tr>`).join('')}
    </tbody></table></div></div><p class="small muted">Cada casilla: horas trabajadas y, debajo, las horas extra o las que faltan frente al contrato de ese mes.</p></div>` : '';
  return `${title}${barra}${totales}${tabla}${porMes}
  <p class="small muted">«Contrato» son las horas de contrato prorrateadas en los días que tienen horario${h.borradores ? '' : ' publicado'}, sin contar ausencias. Las correcciones pendientes no cuentan hasta que las apruebes en Solicitudes.</p>`;
}

export function corrDetail(clase, turnos, pre = {}) {
  const opts = (sel, blank) => `<option value="">${blank}</option>` + turnos.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.nombre)} (${s.inicio}–${s.fin})</option>`).join('');
  if (clase === 'no_trabajado') return '<p class="small muted" style="margin:0">Se contará que ese día no trabajaste ninguna hora.</p>';
  if (clase === 'turno') return `<label class="field">Turno que hiciste<select name="turno_id" required>${opts(pre.turno_id, '— Elige —')}</select></label>`;
  const req = clase === 'horas' ? 'required' : '';
  const hours = `<div class="fields two"><label class="field">Entrada<input type="time" name="inicio" value="${pre.inicio || ''}" ${req}></label><label class="field">Salida<input type="time" name="fin" value="${pre.fin || ''}" ${req}></label></div>`;
  if (clase === 'extra') return `<label class="field">Turno que hiciste<select name="turno_id">${opts('', '— Indicar horas —')}</select></label>${hours}<p class="small muted" style="margin:0">Elige un turno o indica la entrada y la salida.</p>`;
  return hours;
}

export function openCorrection(pre = {}) {
  const turnos = state.mi.perfil.turnos, today = todayIso();
  const clase = pre.clase || 'horas';
  const sh = turnos.find((s) => s.id === pre.turno_id);
  overlay(`<h2>Solicitar corrección</h2>
    <form id="corr-form" class="stack" style="gap:12px">
      <label class="field">Día<input type="date" name="fecha" max="${today}" value="${esc(pre.fecha || '')}" required></label>
      <label class="field">¿Qué ocurrió?<select name="clase" data-act-change="corrClase">
        ${Object.entries({ horas: 'Hice más o menos horas de las previstas', turno: 'Hice otro turno distinto', no_trabajado: 'No trabajé ese día', extra: 'Trabajé un día que tenía libre' }).map(([k, v]) => `<option value="${k}" ${k === clase ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div id="corr-detail" class="stack" style="gap:12px">${corrDetail(clase, turnos, { inicio: sh && clase === 'horas' ? sh.inicio : '', fin: sh && clase === 'horas' ? sh.fin : '' })}</div>
      <label class="field">Motivo<textarea name="motivo" rows="3" required placeholder="Por ejemplo: me pidieron quedarme hasta el cierre"></textarea></label>${mic("motivo")}
      <div class="row end"><button type="button" class="btn" data-act="closeOverlay">Cancelar</button><button class="btn primary" type="submit">Enviar solicitud</button></div>
    </form>`);
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
  infDetalle: (el) => {
    const e = state.inf.data.empleados.find((x) => x.empleado_id === el.dataset.e); const turnos = state.config.turnos;
    overlay(`<h2>${esc(e.nombre)}</h2><p class="small muted" style="margin-top:-6px">${fmtRange(e.desde, e.hasta)} · previstas ${fmtH(e.previstas)} h · ajustadas ${fmtH(e.ajustadas)} h</p>
      ${e.dias.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Día</th><th>Turno</th><th class="num">Prev.</th><th class="num">Ajust.</th><th>Corrección</th></tr></thead><tbody>
      ${e.dias.map((x) => `<tr><td>${esc(fmtShort(x.fecha))}</td><td>${x.turno_id ? esc(shiftText(turnos, x.turno_id)) : '—'}</td><td class="num">${fmtH(x.previstas)}</td><td class="num"><b>${fmtH(x.ajustadas)}</b></td>
        <td class="small">${x.correccion ? `${CLASES[x.correccion.clase]}${x.correccion.motivo ? `<div class="muted">${esc(x.correccion.motivo)}</div>` : ''}` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin turnos en este periodo.</p>'}
      <div class="row end" style="margin-top:16px"><button class="btn primary" data-act="closeOverlay">Cerrar</button></div>`);
  },
});
