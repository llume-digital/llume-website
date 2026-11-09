import { ICON, esc } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { dayChips, empOptions, head } from '../nucleo/pintado.js';
// ------------------------------------------------------------------ PREFERENCIAS
function shiftChips(path, selected) {
  const set = new Set(selected || []);
  return `<div class="chips">${state.draft.turnos.map((s) => `<button type="button" class="chip ${set.has(s.id) ? 'on' : ''}" data-act="toggleShift" data-path="${path}" data-shift="${esc(s.id)}" aria-pressed="${set.has(s.id)}" title="${esc(s.nombre)} ${s.inicio}–${s.fin}">${esc(s.nombre)}</button>`).join('')}</div>`;
}
export function viewPreferencias() {
  const p = state.draft.preferencias;
  return `${head('Preferencias', 'Lo que a cada persona le gusta o prefiere evitar. Se respeta siempre que no deje sin cubrir un pico; el peso indica cuánto importa.', `<button class="btn primary" data-act="addPref">${ICON.plus} Añadir preferencia</button>`)}
  ${p.length ? `<div class="grid">${p.map((x, i) => `<div class="card">
    <div class="fields two">
      <label class="field">Persona<select data-bind="preferencias.${i}.empleado_id">${empOptions(x.empleado_id)}</select></label>
      <label class="field">Preferencia<select data-bind="preferencias.${i}.tipo"><option value="prefiere" ${x.tipo === 'prefiere' ? 'selected' : ''}>Prefiere estos turnos</option><option value="evita" ${x.tipo === 'evita' ? 'selected' : ''}>Prefiere evitar estos turnos</option></select></label>
    </div>
    <div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Turnos</div>${shiftChips(`preferencias.${i}.turnos`, x.turnos)}</div>
    <div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Qué días</div>${dayChips(`preferencias.${i}.dias`, x.dias, 'Todos los días')}</div>
    <div class="row" style="margin-top:12px;align-items:flex-end">
      <label class="field" style="flex:1">Importancia: <b style="color:var(--ink)" id="w${i}">${x.peso}</b> de 10<input type="range" min="1" max="10" value="${x.peso}" data-type="int" data-bind="preferencias.${i}.peso" data-rerender></label>
      <button class="icon-btn" data-act="delRow" data-list="preferencias" data-i="${i}" title="Quitar">${ICON.trash}</button>
    </div></div>`).join('')}</div>` : `<div class="card empty"><p>Sin preferencias. El motor solo atenderá a la demanda y a las reglas.</p><button class="btn primary" data-act="addPref">${ICON.plus} Añadir preferencia</button></div>`}`;
}

