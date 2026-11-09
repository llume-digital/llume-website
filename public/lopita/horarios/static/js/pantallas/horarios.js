import { addDays, daysBetween, esc, fmtLong, fmtRange, fmtStamp, todayIso, weekday } from '../nucleo/util.js';
import { api, confirmar, saveConfig, state, toast, withBusy } from '../nucleo/estado.js';
import { head, renderView } from '../nucleo/pintado.js';
import { sevBadges } from './alertas.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ HORARIOS: lista y generador
// Un publicado deja de valer en las fechas que ocupa otro publicado después (línea de tiempo de lo publicado)
function vigencia(s) {
  if (s.sustituido) return ' <span class="badge neutral" title="Otros horarios publicados después ocupan todas sus fechas">Sustituido</span>';
  const total = daysBetween(s.desde, s.hasta) + 1;
  if (s.estado === 'publicado' && s.dias_vigentes != null && s.dias_vigentes < total) return ` <span class="badge neutral" title="En los demás días vale otro horario publicado después">Vale ${s.dias_vigentes} de ${total} días</span>`;
  return '';
}
function nextMonday() { const t = todayIso(); return addDays(t, 7 - weekday(t)); }
function nextMonth() { const t = todayIso(); let y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) + 1; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; }
export function genPeriod() {
  const g = state.gen;
  if (g.modo === 'semana') { const d = g.semana || nextMonday(); const mon = addDays(d, -weekday(d)); return [mon, addDays(mon, 6)]; }
  if (g.modo === 'mes') { const [y, m] = (g.mes || nextMonth()).split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`]; }
  return [g.desde, g.hasta];
}

export function viewHorarios() {
  if (!state.gen) { const mon = nextMonday(); state.gen = { modo: 'semana', semana: mon, mes: nextMonth(), desde: mon, hasta: addDays(mon, 6) }; }
  const g = state.gen;
  const [a, b] = genPeriod();
  const valid = a && b && a <= b && daysBetween(a, b) <= 62;
  const overlaps = valid ? state.schedules.filter((s) => s.desde <= b && s.hasta >= a) : [];
  const list = state.schedules;
  const modeChip = (m, l) => `<button type="button" class="chip ${g.modo === m ? 'on' : ''}" data-act="genMode" data-mode="${m}">${l}</button>`;
  return `${head('Horarios', 'Genera el horario de una semana o un mes. El motor reparte los turnos para cubrir la demanda y cumplir las reglas; luego puedes retocarlo a mano y publicarlo en Slack.')}
  <div class="card">
    <h2>Nuevo horario</h2>
    <div class="row" style="align-items:flex-end;gap:16px">
      <div class="chips">${modeChip('semana', 'Semana')}${modeChip('mes', 'Mes')}${modeChip('fechas', 'Fechas')}</div>
      ${g.modo === 'semana' ? `<label class="field">Cualquier día de la semana<input type="date" data-bind="@gen.semana" data-rerender value="${esc(g.semana)}"></label>` : ''}
      ${g.modo === 'mes' ? `<label class="field">Mes<input type="month" data-bind="@gen.mes" data-rerender value="${esc(g.mes)}"></label>` : ''}
      ${g.modo === 'fechas' ? `<label class="field">Desde<input type="date" data-bind="@gen.desde" data-rerender value="${esc(g.desde)}"></label><label class="field">Hasta<input type="date" data-bind="@gen.hasta" data-rerender value="${esc(g.hasta)}"></label>` : ''}
      <button class="btn primary" data-act="generate" ${valid ? '' : 'disabled'}>Generar horario</button>
    </div>
    <p class="small muted" style="margin:12px 0 0">${valid ? `Del ${fmtLong(a)} al ${fmtLong(b)} (${daysBetween(a, b) + 1} días).` : 'Elige un periodo válido (máximo 9 semanas).'}
    ${overlaps.length ? ` <span style="color:var(--warn)">Ya hay ${overlaps.length === 1 ? 'un horario que se solapa' : `${overlaps.length} horarios que se solapan`} con estas fechas. Se creará otro borrador aparte y, al publicarlo, será el que valga en todas sus fechas.</span>` : ''}
    ${state.dirty ? ' <span style="color:var(--warn)">Antes de generar se guardarán tus cambios de configuración.</span>' : ''}</p>
  </div>
  <div class="section">
    <h2>Horarios creados</h2>
    ${list.length ? `<div class="card" style="padding:0"><div class="table-wrap"><table class="list">
      <thead><tr><th>Periodo</th><th>Estado</th><th class="num">Huecos</th><th>Alertas</th><th class="num">Errores</th><th>Actualizado</th></tr></thead>
      <tbody>${list.map((s) => `<tr class="click" data-act="open" data-id="${s.id}" tabindex="0">
        <td><b>${fmtRange(s.desde, s.hasta)}</b><div class="small muted">${daysBetween(s.desde, s.hasta) + 1} días · ${s.turnos} turnos${s.bloqueos ? ` · ${s.bloqueos} cambios manuales` : ''}</div></td>
        <td><span class="badge ${s.estado}">${s.estado === 'publicado' ? 'Publicado' : 'Borrador'}</span>${vigencia(s)}${s.reemplaza ? ' <span class="badge warn">Arreglo sin publicar</span>' : ''}${s.cambios_pendientes.length ? ' <span class="badge warn">Cambios sin avisar</span>' : ''}</td>
        <td class="num">${s.huecos ? `<span class="badge bad">${s.huecos}</span>` : '0'}</td>
        <td>${sevBadges(s.alertas)}</td>
        <td class="num">${s.errores ? `<span class="badge bad">${s.errores}</span>` : '0'}</td>
        <td class="small muted">${fmtStamp(s.actualizado)}</td></tr>`).join('')}</tbody></table></div></div>`
    : '<div class="card empty">Aún no hay horarios. Genera el primero arriba.</div>'}
  </div>`;
}

export async function refreshList() { state.schedules = await api('GET', '/api/horarios'); }

export function generationToast(g) {
  if (!g || !g.valido || !g.reintentos) return;
  toast(`El primer intento tenía alertas críticas; se ${g.reintentos === 1 ? 'ha arreglado en el reintento' : `han arreglado en ${g.reintentos} reintentos`}.`);
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {

  genMode: (el) => { state.gen.modo = el.dataset.mode; renderView(); },
  open: (el) => { location.hash = `#/horarios/${el.dataset.id}`; },
  generate: async () => {
    if (state.dirty && !(await saveConfig())) { toast('Corrige la configuración antes de generar', true); return; }
    const [desde, hasta] = genPeriod();
    try {
      const d = await withBusy('Calculando el mejor horario…', () => api('POST', '/api/horarios/generar', { desde, hasta }));
      state.current = d; await refreshList();
      location.hash = `#/horarios/${d.id}`;
      generationToast(d.generacion);
    } catch (e) { toast(e.message, true); }
  },
  regenerate: async (el) => {
    const n = state.current.horario.bloqueos.length;
    const desde = el && el.dataset ? el.dataset.desde : null;
    const alcance = desde ? `a partir del ${fmtLong(desde)} (los días anteriores no cambian)` : 'entero';
    if (!(await confirmar({ titulo: 'Regenerar el horario', texto: `Se recalculará el horario ${alcance} con la configuración actual${n ? `, respetando tus ${n} cambios manuales` : ''}.`, verbo: 'Regenerar' }))) return;
    if (state.dirty && !(await saveConfig())) return;
    try {
      state.current = await withBusy('Recalculando…', () => api('POST', `/api/horarios/${state.current.id}/regenerar`, desde ? { desde } : {}));
      refreshList(); renderView(); generationToast(state.current.generacion);
    } catch (e) { toast(e.message, true); }
  },
  clearLocks: async () => {
    if (!(await confirmar({ titulo: '¿Quitar los bloqueos?', texto: 'Los turnos actuales se mantienen hasta que regeneres.', verbo: 'Quitar bloqueos' }))) return;
    state.current = await api('DELETE', `/api/horarios/${state.current.id}/bloqueos`); renderView();
  },
  print: () => window.open(`/api/horarios/${state.current.id}/html`, '_blank'),
  pdf: async () => {
    try {
      const r = await fetch(`/api/horarios/${state.current.id}/pdf`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.json()).detail);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `horario_${state.current.desde}_${state.current.hasta}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { toast(e.message, true); }
  },
  deleteSchedule: async () => {
    if (!(await confirmar({ titulo: '¿Eliminar este horario?', texto: 'No se puede deshacer.', verbo: 'Eliminar horario', peligro: true }))) return;
    await api('DELETE', `/api/horarios/${state.current.id}`);
    state.current = null; await refreshList(); location.hash = '#/horarios';
  },
});
