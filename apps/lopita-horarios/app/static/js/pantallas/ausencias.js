import { ICON, MOTIVOS, daysBetween, todayIso } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { empOptions, head, shiftOptions } from '../nucleo/pintado.js';
// ------------------------------------------------------------------ AUSENCIAS Y PETICIONES
export function viewAusencias() {
  const c = state.draft;
  const today = todayIso();
  const rows = c.ausencias.map((a, i) => ({ a, i })).filter(({ a }) => state.showPast || a.hasta >= today).sort((x, y) => x.a.desde.localeCompare(y.a.desde));
  const hidden = c.ausencias.length - rows.length;
  const reqs = c.excepciones_asignacion.map((o, i) => ({ o, i })).filter(({ o }) => state.showPast || o.fecha >= today).sort((x, y) => x.o.fecha.localeCompare(y.o.fecha));
  return `${head('Ausencias', 'Vacaciones, bajas y peticiones puntuales. El motor no asigna turnos a quien está ausente y respeta lo que fijes aquí.')}
  <div class="card"><div class="row"><h2 style="margin:0">Vacaciones, bajas y permisos</h2><span class="spacer"></span>
    <label class="toggle small"><input type="checkbox" data-act-change="togglePast" ${state.showPast ? 'checked' : ''}> Ver pasadas</label>
    <button class="btn small primary" data-act="addAbsence">${ICON.plus} Añadir</button></div>
    ${rows.length ? `<div class="table-wrap"><table class="list edit" style="margin-top:10px"><thead><tr><th>Persona</th><th>Desde</th><th>Hasta</th><th>Motivo</th><th class="num">Días</th><th></th></tr></thead><tbody>
    ${rows.map(({ a, i }) => `<tr>
      <td style="min-width:150px"><select data-bind="ausencias.${i}.empleado_id">${empOptions(a.empleado_id)}</select></td>
      <td><input type="date" value="${a.desde}" data-bind="ausencias.${i}.desde" data-rerender></td>
      <td><input type="date" value="${a.hasta}" data-bind="ausencias.${i}.hasta" data-rerender></td>
      <td style="min-width:130px"><select data-bind="ausencias.${i}.motivo">${Object.entries(MOTIVOS).map(([k, v]) => `<option value="${k}" ${a.motivo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td class="num">${a.hasta >= a.desde ? daysBetween(a.desde, a.hasta) + 1 : '<span style="color:var(--bad)">!</span>'}</td>
      <td><button class="icon-btn" data-act="delRow" data-list="ausencias" data-i="${i}" title="Quitar">${ICON.trash}</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted small">No hay ausencias próximas.</p>'}
    ${hidden ? `<p class="small muted">${hidden} ausencias pasadas ocultas.</p>` : ''}
  </div>
  <div class="card section"><div class="row"><h2 style="margin:0">Peticiones puntuales</h2><span class="spacer"></span><button class="btn small primary" data-act="addRequest">${ICON.plus} Añadir</button></div>
    <p class="small muted">Un día libre que alguien pide, que trabaje en su día de libranza o que haga un turno concreto.</p>
    ${reqs.length ? `<div class="table-wrap"><table class="list edit"><thead><tr><th>Persona</th><th>Fecha</th><th>Petición</th><th>Turno</th><th></th></tr></thead><tbody>
    ${reqs.map(({ o, i }) => `<tr>
      <td style="min-width:150px"><select data-bind="excepciones_asignacion.${i}.empleado_id">${empOptions(o.empleado_id)}</select></td>
      <td><input type="date" value="${o.fecha}" data-bind="excepciones_asignacion.${i}.fecha"></td>
      <td style="min-width:170px"><select data-act-change="requestType" data-i="${i}">
        <option value="libre" ${o.tipo === 'libre' ? 'selected' : ''}>Librar ese día</option>
        <option value="trabaja" ${o.tipo === 'trabaja' ? 'selected' : ''}>Trabajar (aunque libre)</option>
        <option value="turno" ${o.tipo === 'turno' ? 'selected' : ''}>Hacer un turno concreto</option></select></td>
      <td style="min-width:170px">${o.tipo === 'turno' ? `<select data-bind="excepciones_asignacion.${i}.turno_id">${shiftOptions(o.turno_id)}</select>` : '<span class="muted">—</span>'}</td>
      <td><button class="icon-btn" data-act="delRow" data-list="excepciones_asignacion" data-i="${i}" title="Quitar">${ICON.trash}</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted small">Ninguna.</p>'}
  </div>`;
}

