import { DAYS, DAY_LABEL, ICON, clone, esc, fmtH, toMin, todayIso, uid } from '../nucleo/util.js';
import { state, toast } from '../nucleo/estado.js';
import { markDirty } from '../nucleo/enlace.js';
import { empName, head, renderView } from '../nucleo/pintado.js';
import { conDeshacer } from '../nucleo/borrador.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ SEMANAS TIPO Y ROTACIONES
const semanas = () => (state.draft.semanas_tipo ||= []);
const rotaciones = () => (state.draft.rotaciones ||= []);
const horasTurno = (id) => { const s = state.draft.turnos.find((t) => t.id === id); return s ? (toMin(s.fin) - toMin(s.inicio)) / 60 : 0; };
export const horasSemana = (w) => Object.values(w.dias).reduce((t, id) => t + horasTurno(id), 0);
const opcionesTurno = (sel) => `<option value="">Libre</option>${state.draft.turnos.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.nombre)} (${s.inicio}–${s.fin})</option>`).join('')}`;
const opcionesSemana = (sel) => semanas().map((w) => `<option value="${esc(w.id)}" ${w.id === sel ? 'selected' : ''}>${esc(w.nombre)}</option>`).join('');

function tarjetaSemana(w, i) {
  return `<div class="card">
    <div class="row" style="flex-wrap:nowrap"><input class="title-input" type="text" value="${esc(w.nombre)}" data-bind="semanas_tipo.${i}.nombre" aria-label="Nombre de la semana tipo">
      <button class="btn small" data-act="semDup" data-i="${i}">Duplicar</button>
      <button class="icon-btn" data-act="semDel" data-i="${i}" title="Borrar" aria-label="Borrar ${esc(w.nombre)}">${ICON.trash}</button></div>
    <div class="fields" style="margin-top:12px">${DAYS.map((d, k) => `<label class="field">${DAY_LABEL[k]}<select data-act-change="semDia" data-i="${i}" data-dia="${d}">${opcionesTurno(w.dias[d])}</select></label>`).join('')}</div>
    <p class="small muted" style="margin:12px 0 0">Total: <b class="num">${fmtH(horasSemana(w))} h</b> a la semana</p>
  </div>`;
}

function tarjetaRotacion(r, i) {
  const e = state.draft.empleados.find((x) => x.id === r.empleado_id);
  const horas = r.semanas.map((id) => { const w = semanas().find((x) => x.id === id); return w ? horasSemana(w) : 0; });
  const contrato = e && !e.comodin ? e.horas_semanales : null;
  const desajuste = contrato === null ? [] : horas.map((h, j) => (Math.abs(h - contrato) > 0.01 ? j : -1)).filter((j) => j >= 0);
  const iguales = rotaciones().map((o, k) => ({ o, k })).filter(({ o, k }) => {
    const c = state.draft.empleados.find((x) => x.id === o.empleado_id);
    return k !== i && c && e && c.horas_semanales === e.horas_semanales && !!c.comodin === !!e.comodin;
  });
  return `<div class="card">
    <div class="row" style="flex-wrap:nowrap"><h3 style="margin:0">${esc(empName(r.empleado_id))}</h3><span class="spacer"></span>
      ${contrato !== null ? `<span class="small muted">Contrato: ${fmtH(contrato)} h/semana</span>` : ''}
      <button class="btn small danger-text" data-act="rotDel" data-i="${i}" aria-label="Quitar la rotación de ${esc(empName(r.empleado_id))}">${ICON.trash} Quitar rotación</button></div>
    <div class="fields two" style="margin-top:12px">
      <label class="field">Desde (se cuenta desde el lunes de esa semana)<input type="date" value="${r.desde}" data-bind="rotaciones.${i}.desde" data-rerender></label>
      <label class="field">Hasta (vacío = sin fin)<input type="date" value="${r.hasta || ''}" min="${r.desde}" data-bind="rotaciones.${i}.hasta" data-type="nullstr"></label>
    </div>
    <h4 style="margin:16px 0 6px">Semanas, en orden (después de la última vuelve a la primera)</h4>
    <ol class="stack" style="gap:8px;margin:0;padding:0;list-style:none">${r.semanas.map((id, j) => `<li class="row" style="flex-wrap:nowrap"><span class="small muted num" style="width:70px;flex:none">Semana ${j + 1}</span>
      <select data-act-change="rotSemSet" data-i="${i}" data-j="${j}" aria-label="Semana ${j + 1} de la rotación">${opcionesSemana(id)}</select>
      <span class="small num" style="flex:none${desajuste.includes(j) ? ';color:var(--warn)' : ''}">${fmtH(horas[j])} h${desajuste.includes(j) ? ' · no cuadra con el contrato' : ''}</span>
      <button class="icon-btn" data-act="rotSemDel" data-i="${i}" data-j="${j}" title="Quitar esta semana" aria-label="Quitar la semana ${j + 1}"${r.semanas.length < 2 ? ' disabled' : ''}>${ICON.trash}</button></li>`).join('')}</ol>
    <div class="row" style="margin-top:12px"><button class="btn small" data-act="rotSemAdd" data-i="${i}">${ICON.plus} Añadir semana</button>
      ${iguales.length ? `<span class="spacer"></span><label class="field" style="flex-direction:row;align-items:center;gap:8px">Intercambiar con<select id="inter-${i}">${iguales.map(({ o }) => `<option value="${esc(o.empleado_id)}">${esc(empName(o.empleado_id))}</option>`).join('')}</select></label>
      <button class="btn small" data-act="rotInter" data-i="${i}">Intercambiar</button>` : ''}</div>
    ${desajuste.length ? '<p class="small" style="color:var(--warn);margin:12px 0 0">Alguna semana no suma las horas de su contrato. Se guarda igual, pero las horas del periodo no cuadrarán.</p>' : ''}
  </div>`;
}

export function viewSemanas() {
  const ws = semanas(), rs = rotaciones();
  const sinRot = state.draft.empleados.filter((e) => e.activo && !e.comodin && !rs.some((r) => r.empleado_id === e.id));
  return `${head('Semanas tipo', 'Crea plantillas de semana (qué turno hace cada día) y haz que una persona las siga en orden: semanas alternas, ciclos de cuatro semanas... Al generar un horario de esas fechas se aplican solas; las ausencias y lo que cambies a mano en el cuadrante mandan sobre la rotación.',
    `<button class="btn primary" data-act="semAdd">${ICON.plus} Añadir semana tipo</button>`)}
  ${ws.length ? `<div class="grid">${ws.map(tarjetaSemana).join('')}</div>` : `<div class="card empty"><p>Todavía no hay semanas tipo.</p><button class="btn primary" data-act="semAdd">${ICON.plus} Crear la primera</button></div>`}
  <div class="section"><h2>Rotación por persona</h2>
    ${rs.length ? `<div class="stack">${rs.map(tarjetaRotacion).join('')}</div>` : '<p class="muted small">Nadie sigue una rotación. Se usa la planificación automática de siempre.</p>'}
    ${ws.length && sinRot.length ? `<div class="card section"><div class="row"><label class="field" style="flex-direction:row;align-items:center;gap:8px">Persona<select id="rot-nueva">${sinRot.map((e) => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</select></label>
      <button class="btn primary" data-act="rotAdd">${ICON.plus} Añadir rotación</button></div></div>` : ''}
    ${!ws.length ? '<p class="small muted">Primero crea al menos una semana tipo.</p>' : ''}
  </div>
  <p class="small muted">Los cambios se guardan con el botón de abajo.</p>`;
}

Object.assign(actions, {
  semAdd: () => {
    const ws = semanas();
    ws.push({ id: uid(`semana-${ws.length + 1}`, ws.map((w) => w.id)), nombre: `Semana ${ws.length + 1}`, dias: {} });
    markDirty(); renderView();
  },
  semDup: (el) => {
    const ws = semanas(), w = ws[Number(el.dataset.i)];
    ws.splice(Number(el.dataset.i) + 1, 0, { ...clone(w), id: uid(`${w.id}-copia`, ws.map((x) => x.id)), nombre: `${w.nombre} (copia)` });
    markDirty(); renderView();
  },
  semDel: (el) => {
    const ws = semanas(), w = ws[Number(el.dataset.i)];
    const avisar = conDeshacer(`Semana tipo «${w.nombre}» borrada`);
    ws.splice(Number(el.dataset.i), 1);
    // Se quita de las rotaciones; la que se queda sin semanas desaparece.
    state.draft.rotaciones = rotaciones().map((r) => ({ ...r, semanas: r.semanas.filter((id) => id !== w.id) })).filter((r) => r.semanas.length);
    markDirty(); renderView(); avisar();
  },
  semDia: (el) => {
    const w = semanas()[Number(el.dataset.i)];
    if (el.value) w.dias[el.dataset.dia] = el.value; else delete w.dias[el.dataset.dia];
    markDirty(); renderView();
  },
  rotAdd: () => {
    const sel = document.getElementById('rot-nueva');
    if (!sel || !sel.value || !semanas().length) return;
    rotaciones().push({ empleado_id: sel.value, semanas: [semanas()[0].id], desde: todayIso(), hasta: null });
    markDirty(); renderView();
  },
  rotDel: (el) => {
    const avisar = conDeshacer('Rotación quitada');
    rotaciones().splice(Number(el.dataset.i), 1);
    markDirty(); renderView(); avisar();
  },
  rotSemAdd: (el) => {
    const r = rotaciones()[Number(el.dataset.i)];
    r.semanas.push(r.semanas[r.semanas.length - 1]);
    markDirty(); renderView();
  },
  rotSemDel: (el) => {
    const r = rotaciones()[Number(el.dataset.i)];
    if (r.semanas.length < 2) return;
    r.semanas.splice(Number(el.dataset.j), 1);
    markDirty(); renderView();
  },
  rotSemSet: (el) => {
    rotaciones()[Number(el.dataset.i)].semanas[Number(el.dataset.j)] = el.value;
    markDirty(); renderView();
  },
  // Cambia las rotaciones de dos personas con las mismas horas de contrato (cada una pasa a seguir la de la otra).
  rotInter: (el) => {
    const rs = rotaciones(), mia = rs[Number(el.dataset.i)];
    const sel = document.getElementById(`inter-${el.dataset.i}`);
    const otra = sel && rs.find((r) => r.empleado_id === sel.value);
    if (!mia || !otra) { toast('Elige con quién intercambiar', true); return; }
    const avisar = conDeshacer(`Rotación intercambiada con ${empName(otra.empleado_id)}`);
    [mia.empleado_id, otra.empleado_id] = [otra.empleado_id, mia.empleado_id];
    markDirty(); renderView(); avisar();
  },
});
