import { $, DAYS, DAY_LABEL, ICON, esc, fmtH, fmtMin, fmtShort, monthName, toMin, todayIso } from '../nucleo/util.js';
import { state, toast } from '../nucleo/estado.js';
import { PUESTOS, dayChips, dayTypeOptions, head, renderView, toggle } from '../nucleo/pintado.js';
import { timeline } from './turnos.js';
import { getPath, markDirty, setPath } from '../nucleo/enlace.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ DEMANDA
function slotsEditor(path, slots) {
  const mal = (f) => (f.cocina || 0) + (f.sala || 0) > f.personas;
  return `<div class="table-wrap"><table class="list edit slots"><thead><tr><th>Desde</th><th>Hasta</th><th class="num" style="width:76px">Personas</th>
    <th class="num" style="width:62px" title="De ellas, mínimo en cocina">Cocina</th><th class="num" style="width:62px" title="De ellas, mínimo en sala">Sala</th><th style="width:40px"></th></tr></thead><tbody>
    ${slots.map((f, j) => `<tr${mal(f) ? ' class="bad-row"' : ''}>
      <td><input type="time" step="900" value="${f.inicio}" data-bind="${path}.${j}.inicio" data-rerender aria-label="Desde"></td>
      <td><input type="time" step="900" value="${f.fin === '24:00' ? '23:59' : f.fin}" data-bind="${path}.${j}.fin" data-rerender aria-label="Hasta"></td>
      <td><input type="number" min="0" max="20" value="${f.personas}" data-type="int" data-bind="${path}.${j}.personas" data-rerender aria-label="Personas"></td>
      <td><input type="number" min="0" max="20" value="${f.cocina || 0}" data-type="int" data-bind="${path}.${j}.cocina" data-rerender aria-label="Mínimo en cocina"></td>
      <td><input type="number" min="0" max="20" value="${f.sala || 0}" data-type="int" data-bind="${path}.${j}.sala" data-rerender aria-label="Mínimo en sala"></td>
      <td><button class="icon-btn" data-act="delSlot" data-path="${path}" data-j="${j}" title="Quitar franja">${ICON.trash}</button></td></tr>`).join('')}
  </tbody></table></div>
  ${slots.some(mal) ? '<p class="small" style="color:var(--bad);margin:4px 0">Cocina y sala no pueden sumar más que el total de personas de la franja.</p>' : ''}
  <p class="small muted" style="margin:4px 0">Cocina y sala son mínimos dentro del total (0 = da igual el puesto).</p>
  <button class="btn small ghost" data-act="addSlot" data-path="${path}">${ICON.plus} Añadir franja</button>`;
}

function profile(slots) {
  const from = 6 * 60, to = 24 * 60, step = 30;
  const n = (to - from) / step;
  const req = Array(n).fill(0);
  for (const f of slots) for (let k = 0; k < n; k++) { const t = from + k * step; if (t >= toMin(f.inicio) && t < toMin(f.fin)) req[k] = Math.max(req[k], f.personas); }
  const max = Math.max(1, ...req);
  const peak = Math.max(...req);
  return `<div class="profile" role="img" aria-label="Personas necesarias por hora; máximo ${peak}">${req.map((v, k) => `<i style="height:${(v / max) * 100}%" title="${fmtMin(from + k * step)}: ${v} personas"></i>`).join('')}</div>
  <div class="profile-axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>
  <p class="small muted" style="margin:6px 0 0">Pico: ${peak} personas · ${fmtH(slots.reduce((s, f) => s + Math.max(0, toMin(f.fin) - toMin(f.inicio)) * f.personas, 0) / 60)} horas-persona al día</p>`;
}

// Tareas fijas: trabajo que no depende de la clientela y se suma a la demanda (preparar, limpiar, reponer…).
function tasksCard(tareas) {
  const rows = tareas.map((t, i) => `<div style="border-top:1px solid var(--line);padding:12px 0">
    <div class="row" style="flex-wrap:nowrap"><input class="title-input" type="text" value="${esc(t.nombre)}" data-bind="tareas.${i}.nombre" aria-label="Nombre de la tarea"><button class="icon-btn" data-act="delTask" data-i="${i}" title="Quitar tarea">${ICON.trash}</button></div>
    <div class="fields" style="margin-top:8px">
      <label class="field">Desde<input type="time" step="900" value="${t.inicio}" data-bind="tareas.${i}.inicio" data-rerender></label>
      <label class="field">Hasta<input type="time" step="900" value="${t.fin === '24:00' ? '23:59' : t.fin}" data-bind="tareas.${i}.fin" data-rerender></label>
      <label class="field">Personas<input type="number" min="1" max="20" value="${t.personas}" data-type="int" data-bind="tareas.${i}.personas" data-rerender></label>
      <label class="field">Puesto<select data-bind="tareas.${i}.puesto" data-type="nullstr"><option value="" ${!t.puesto ? 'selected' : ''}>Cualquiera</option>${Object.entries(PUESTOS).map(([k, v]) => `<option value="${k}" ${t.puesto === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <div style="margin-top:10px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Qué días</div>${dayChips(`tareas.${i}.dias`, t.dias, 'Todos los días que abre')}</div>
  </div>`).join('');
  return `<div class="card section"><div class="row"><h2 style="margin:0">Tareas fijas</h2><span class="spacer"></span><button class="btn small" data-act="addTask">${ICON.plus} Añadir tarea</button></div>
    <p class="small muted">Trabajo que no depende de la clientela: preparar la cafetería al abrir, limpiar al cerrar, recibir pedidos… En esas horas hacen falta las personas de la franja <b>más</b> las de la tarea, aunque el local esté vacío. Si alguien sale como «personal de más» pero en realidad está haciendo esto, añádelo aquí.</p>
    ${tareas.length ? `${timeline(tareas.map((t) => ({ ...t, color: '#764A09' })))}${rows}` : '<p class="muted small">Ninguna. La demanda solo cuenta la clientela.</p>'}
  </div>`;
}

export function viewDemanda() {
  const c = state.draft;
  const ex = c.excepciones_fecha;
  return `${head('Demanda', 'Cuántas personas hacen falta en cada franja. Defines unos pocos tipos de día y asignas uno a cada día de la semana; los festivos y los días especiales pueden tener el suyo.', `<button class="btn primary" data-act="addDayType">${ICON.plus} Tipo de día</button>`)}
  <div class="card"><h2>Cada día de la semana</h2><div class="fields">
    ${DAYS.map((d, i) => `<label class="field">${DAY_LABEL[i]}<select data-bind="tipo_dia_por_semana.${d}">${dayTypeOptions(c.tipo_dia_por_semana[d])}</select></label>`).join('')}
  </div></div>
  <div class="grid wide section">${c.tipos_dia.map((t, i) => `<div class="card">
    <div class="row" style="flex-wrap:nowrap"><input class="title-input" type="text" value="${esc(t.nombre)}" data-rename="daytype" data-i="${i}" aria-label="Nombre del tipo de día"><button class="icon-btn" data-act="delDayType" data-i="${i}" title="Eliminar">${ICON.trash}</button></div>
    <div style="margin:6px 0 10px">${toggle(`tipos_dia.${i}.cerrado`, t.cerrado, 'Local cerrado')}</div>
    ${t.cerrado ? '<p class="muted small">Los días de este tipo no se asigna a nadie.</p>' : `${profile(t.franjas)}<div style="margin-top:10px">${slotsEditor(`tipos_dia.${i}.franjas`, t.franjas)}</div>`}
  </div>`).join('')}</div>
  ${tasksCard(c.tareas || [])}
  <div class="card section"><h2>Festivos</h2>
    <div class="row" style="align-items:flex-end">
      <label class="field" style="max-width:260px">Los festivos funcionan como<select data-bind="tipo_dia_festivo" data-type="nullstr">${dayTypeOptions(c.tipo_dia_festivo, 'un día normal de la semana')}</select></label>
      <label class="field" style="max-width:200px">Añadir festivo<input type="date" id="new-holiday"></label>
      <button class="btn" data-act="addHoliday">${ICON.plus} Añadir</button>
    </div>
    <div class="chips" style="margin-top:12px">${[...c.festivos].sort().map((f) => `<span class="chip on" style="cursor:default">${fmtShort(f)} ${monthName(f)} ${f.slice(0, 4)} <button class="icon-btn" style="padding:0 0 0 6px;color:var(--white)" data-act="delHoliday" data-date="${f}" aria-label="Quitar">×</button></span>`).join('') || '<span class="muted small">Sin festivos.</span>'}</div>
  </div>
  <div class="card section"><div class="row"><h2 style="margin:0">Días especiales</h2><span class="spacer"></span><button class="btn small" data-act="addSpecial">${ICON.plus} Añadir día</button></div>
    <p class="small muted">Para una fecha concreta: otro tipo de día, cerrar o unas franjas propias (Nochebuena, una reforma, un evento…).</p>
    ${ex.length ? ex.map((o, i) => {
      const mode = o.cerrado ? 'cerrado' : o.franjas ? 'propias' : 'tipo';
      return `<div style="border-top:1px solid var(--line);padding:12px 0">
      <div class="fields two">
        <label class="field">Fecha<input type="date" value="${o.fecha}" data-bind="excepciones_fecha.${i}.fecha"></label>
        <label class="field">Qué pasa ese día<select data-act-change="specialMode" data-i="${i}">
          <option value="tipo" ${mode === 'tipo' ? 'selected' : ''}>Usa otro tipo de día</option>
          <option value="cerrado" ${mode === 'cerrado' ? 'selected' : ''}>Cerrado</option>
          <option value="propias" ${mode === 'propias' ? 'selected' : ''}>Franjas propias</option></select></label>
        ${mode === 'tipo' ? `<label class="field">Tipo de día<select data-bind="excepciones_fecha.${i}.tipo_dia" data-type="nullstr">${dayTypeOptions(o.tipo_dia, 'el habitual')}</select></label>` : ''}
        <label class="field">Nota<input type="text" value="${esc(o.nota || '')}" data-type="nullstr" data-bind="excepciones_fecha.${i}.nota"></label>
      </div>
      ${mode === 'propias' ? `<div style="margin-top:10px">${slotsEditor(`excepciones_fecha.${i}.franjas`, o.franjas)}</div>` : ''}
      <button class="btn small danger" style="margin-top:8px" data-act="delSpecial" data-i="${i}">Quitar este día</button></div>`;
    }).join('') : '<p class="muted small">Ninguno.</p>'}
  </div>`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {

  toggleDay: (el) => {
    const path = el.dataset.path; let arr = getPath(state.draft, path) || [];
    arr = arr.includes(el.dataset.day) ? arr.filter((d) => d !== el.dataset.day) : DAYS.filter((d) => d === el.dataset.day || arr.includes(d));
    setPath(state.draft, path, path.startsWith('turnos') || path.startsWith('preferencias') || path.startsWith('tareas') || path.startsWith('funciones') ? (arr.length ? arr : null) : arr);
    markDirty(); renderView();
  },
  addDayType: () => {
    const names = state.draft.tipos_dia.map((t) => t.nombre);
    let n = 1; while (names.includes(`nuevo ${n}`)) n++;
    state.draft.tipos_dia.push({ nombre: `nuevo ${n}`, cerrado: false, franjas: [{ inicio: '08:00', fin: '20:00', personas: 2 }] });
    markDirty(); renderView();
  },
  delDayType: (el) => {
    const c = state.draft; const t = c.tipos_dia[Number(el.dataset.i)];
    const used = Object.values(c.tipo_dia_por_semana).includes(t.nombre) || c.tipo_dia_festivo === t.nombre || c.excepciones_fecha.some((o) => o.tipo_dia === t.nombre);
    if (used) { toast(`«${t.nombre}» está en uso. Cámbialo antes en los días de la semana, festivos o días especiales.`, true); return; }
    c.tipos_dia.splice(Number(el.dataset.i), 1); markDirty(); renderView();
  },
  addSlot: (el) => {
    const arr = getPath(state.draft, el.dataset.path);
    const last = arr[arr.length - 1];
    const start = last ? last.fin : '08:00';
    arr.push({ inicio: start, fin: fmtMin(Math.min(toMin(start) + 120, 23 * 60 + 59)), personas: last ? last.personas : 2, cocina: last ? last.cocina || 0 : 0, sala: last ? last.sala || 0 : 0 });
    markDirty(); renderView();
  },
  delSlot: (el) => { getPath(state.draft, el.dataset.path).splice(Number(el.dataset.j), 1); markDirty(); renderView(); },
  addHoliday: () => {
    const v = $('#new-holiday').value;
    if (!v) { toast('Elige una fecha', true); return; }
    if (!state.draft.festivos.includes(v)) state.draft.festivos.push(v);
    markDirty(); renderView();
  },
  delHoliday: (el) => { state.draft.festivos = state.draft.festivos.filter((f) => f !== el.dataset.date); markDirty(); renderView(); },
  addSpecial: () => { state.draft.excepciones_fecha.push({ fecha: todayIso(), tipo_dia: null, franjas: null, cerrado: true, nota: null }); markDirty(); renderView(); },
  addTask: () => {
    if (!state.draft.tareas) state.draft.tareas = [];
    state.draft.tareas.push({ nombre: 'Nueva tarea', inicio: '07:00', fin: '08:00', personas: 1, dias: null, puesto: null });
    markDirty(); renderView();
  },
  delTask: (el) => { state.draft.tareas.splice(Number(el.dataset.i), 1); markDirty(); renderView(); },
  delSpecial: (el) => { state.draft.excepciones_fecha.splice(Number(el.dataset.i), 1); markDirty(); renderView(); },
});
