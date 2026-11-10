import { ICON, TIPOS_TURNO, esc, fmtH, toMin } from '../nucleo/util.js';
import { state, toast } from '../nucleo/estado.js';
import { dayChips, head, renderView } from '../nucleo/pintado.js';
import { conDeshacer } from '../nucleo/borrador.js';
import { getPath, markDirty, setPath } from '../nucleo/enlace.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ TURNOS
export function timeline(items, from = 6 * 60, to = 24 * 60) {
  const pct = (m) => `${((Math.min(Math.max(m, from), to) - from) / (to - from)) * 100}%`;
  return `<div class="timeline">${items.map((s) => `<i style="left:${pct(toMin(s.inicio))};width:calc(${pct(toMin(s.fin))} - ${pct(toMin(s.inicio))});background:${esc(s.color || 'var(--gold)')}"></i>`).join('')}</div>
  <div class="timeline-axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>`;
}

export function viewTurnos() {
  const t = state.draft.turnos;
  return `${head('Turnos', 'El catálogo de turnos entre los que elige el motor. Solo quien esté habilitado hará los de apertura y cierre.', `<button class="btn" data-act="addShiftPreset" data-ini="07:00" data-fin="13:00">${ICON.plus} 7–13</button><button class="btn" data-act="addShiftPreset" data-ini="10:00" data-fin="18:00">${ICON.plus} 10–18</button><button class="btn primary" data-act="addShift">${ICON.plus} Añadir turno</button>`)}
  ${t.length ? `<div class="grid">${t.map((s, i) => {
    const hrs = (toMin(s.fin) - toMin(s.inicio)) / 60;
    return `<div class="card">
    <div class="row" style="flex-wrap:nowrap"><input class="title-input" type="text" value="${esc(s.nombre)}" data-bind="turnos.${i}.nombre" aria-label="Nombre del turno"><button class="icon-btn" data-act="delShift" data-i="${i}" title="Eliminar">${ICON.trash}</button></div>
    ${timeline([s])}
    <div class="fields" style="margin-top:12px">
      <label class="field">Código<input type="text" maxlength="6" value="${esc(s.id)}" data-rename="shift" data-i="${i}"></label>
      <label class="field">Entrada<input type="time" step="900" value="${s.inicio}" data-bind="turnos.${i}.inicio" data-rerender></label>
      <label class="field">Salida<input type="time" step="900" value="${s.fin === '24:00' ? '23:59' : s.fin}" data-bind="turnos.${i}.fin" data-rerender></label>
      <label class="field">Tipo<select data-bind="turnos.${i}.tipo">${Object.entries(TIPOS_TURNO).map(([k, v]) => `<option value="${k}" ${s.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field">Para<select data-bind="turnos.${i}.puesto" data-type="nullstr" data-rerender><option value="" ${!s.puesto ? 'selected' : ''}>Cualquiera</option><option value="sala" ${s.puesto === 'sala' ? 'selected' : ''}>Camarero</option><option value="cocina" ${s.puesto === 'cocina' ? 'selected' : ''}>Cocina</option></select></label>
      <label class="field">Color<input class="swatch-input" type="color" value="${esc(s.color || '#E8D5B0')}" data-bind="turnos.${i}.color" data-rerender></label>
      <div class="field">Duración<b style="color:var(--ink);padding-top:8px">${hrs > 0 ? `${fmtH(hrs)} h` : '<span style="color:var(--bad)">revisa las horas</span>'}</b></div>
    </div>
    <div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Días en que existe</div>${dayChips(`turnos.${i}.dias`, s.dias, 'Todos los días')}</div>
  </div>`;
  }).join('')}</div>
  <div class="card section"><h2>Así cubren el día</h2>${t.map((s) => `<div class="row" style="flex-wrap:nowrap;margin-bottom:6px"><b style="width:120px;flex:none" class="small">${esc(s.nombre)}</b><div style="flex:1">${timeline([s]).split('<div class="timeline-axis">')[0]}</div></div>`).join('')}
  <div class="row" style="flex-wrap:nowrap"><span style="width:120px;flex:none"></span><div style="flex:1" class="timeline-axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div></div></div>`
    : `<div class="card empty"><p>No hay turnos. Sin ellos el generador no puede hacer horarios.</p><button class="btn primary" data-act="addShift">${ICON.plus} Añadir el primer turno</button></div>`}`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
  toggleShift: (el) => {
    const path = el.dataset.path; let arr = getPath(state.draft, path) || [];
    arr = arr.includes(el.dataset.shift) ? arr.filter((d) => d !== el.dataset.shift) : [...arr, el.dataset.shift];
    setPath(state.draft, path, arr); markDirty(); renderView();
  },
  addShift: () => {
    const ids = state.draft.turnos.map((s) => s.id);
    let n = 1; while (ids.includes(`T${n}`)) n++;
    state.draft.turnos.push({ id: `T${n}`, nombre: 'Nuevo turno', inicio: '09:00', fin: '15:00', tipo: 'normal', dias: null, color: '#E8D5B0', puesto: null });
    markDirty(); renderView();
  },
  addShiftPreset: (el) => {
    const { ini, fin } = el.dataset;
    if (state.draft.turnos.some((s) => s.inicio === ini && s.fin === fin)) { toast(`Ya tienes un turno de ${ini}–${fin}`, true); return; }
    const ids = state.draft.turnos.map((s) => s.id);
    let n = 1; while (ids.includes(`T${n}`)) n++;
    state.draft.turnos.push({ id: `T${n}`, nombre: `${Number(ini.slice(0, 2))}–${Number(fin.slice(0, 2))}`, inicio: ini, fin, tipo: 'normal', dias: null, color: '#E8D5B0' });
    markDirty(); renderView();
  },
  delShift: (el) => {
    const c = state.draft; const s = c.turnos[Number(el.dataset.i)];
    const avisar = conDeshacer(`Turno ${s.nombre} eliminado`);
    c.turnos.splice(Number(el.dataset.i), 1);
    c.preferencias.forEach((p) => { p.turnos = p.turnos.filter((t) => t !== s.id); });
    c.preferencias = c.preferencias.filter((p) => p.turnos.length);
    c.excepciones_asignacion = c.excepciones_asignacion.filter((o) => o.turno_id !== s.id);
    markDirty(); renderView(); avisar();
  },
});
