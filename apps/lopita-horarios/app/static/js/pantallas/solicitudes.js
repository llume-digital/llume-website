import { esc, fmtStamp } from '../nucleo/util.js';
import { overlay, state, toast } from '../nucleo/estado.js';
import { head, mic, renderView } from '../nucleo/pintado.js';
import { ensure, reqBadge, reqSummary, shiftHours, signed } from './portal.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ SOLICITUDES (encargados)
export function viewSolicitudes() {
  const s = state.sol; if (!s.filtro) s.filtro = 'pendiente';
  const url = `/api/solicitudes${s.filtro === 'pendiente' ? '?estado=pendiente' : ''}`;
  if (s.url !== url) { s.url = url; s.data = undefined; }
  const chip = (k, l) => `<button type="button" class="chip ${s.filtro === k ? 'on' : ''}" data-act="solFiltro" data-f="${k}">${l}</button>`;
  const top = `${head('Solicitudes', 'Vacaciones y correcciones de horas que piden los trabajadores. Al aprobar unas vacaciones se añaden a las ausencias; al aprobar una corrección se ajustan sus horas y el saldo que se arrastra al siguiente horario.')}<div class="chips" style="margin-bottom:14px">${chip('pendiente', 'Pendientes')}${chip('todas', 'Todas')}</div>`;
  const err = ensure(s, 'data', url);
  if (err) return top + err;
  if (!s.data.length) return top + `<div class="card empty">${s.filtro === 'pendiente' ? 'No hay solicitudes pendientes.' : 'Todavía no hay solicitudes.'}</div>`;
  const turnos = state.config.turnos;
  return `${top}<div class="grid">${s.data.map((r) => {
    const d = r.datos;
    let impact = '';
    if (r.tipo === 'correccion') { const diff = d.minutos / 60 - shiftHours(turnos, d.turno_previsto); impact = `<span class="badge ${diff ? 'warn' : 'neutral'}">${signed(diff)}</span>`; }
    return `<div class="card">
      <div class="row" style="flex-wrap:nowrap"><b style="font-size:var(--text-lg)">${esc(r.nombre)}</b><span class="spacer"></span>${r.estado === 'pendiente' ? '' : reqBadge(r.estado)}</div>
      <div style="margin-top:8px">${reqSummary(r, turnos)} ${impact}</div>
      ${r.motivo ? `<p class="small" style="margin:10px 0 0">«${esc(r.motivo)}»</p>` : ''}
      <div class="small muted" style="margin-top:8px">Enviada ${fmtStamp(r.created_at)}</div>
      ${r.estado === 'pendiente' ? `<div class="row" style="margin-top:14px"><button class="btn primary" data-act="resolve" data-id="${r.id}" data-accion="aprobar" data-tipo="${r.tipo}">Aprobar</button><button class="btn danger" data-act="resolve" data-id="${r.id}" data-accion="rechazar" data-tipo="${r.tipo}">Rechazar</button></div>`
      : `<div class="small muted" style="margin-top:6px">${esc(r.resuelto_por || '')} · ${fmtStamp(r.resuelto_at)}${r.respuesta ? `<br>«${esc(r.respuesta)}»` : ''}</div>`}
    </div>`;
  }).join('')}</div>`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {

  // ---- solicitudes e informes (encargados)
  solFiltro: (el) => { state.sol.filtro = el.dataset.f; renderView(); },
  resolve: (el) => {
    if (state.dirty) { toast('Guarda o descarta antes los cambios de configuración sin guardar', true); return; }
    const ap = el.dataset.accion === 'aprobar';
    const nota = !ap ? 'La persona verá que se ha rechazado y tu respuesta.'
      : el.dataset.tipo === 'ausencia' ? 'La ausencia se añadirá a la configuración y el motor la respetará al generar o regenerar horarios.'
        : 'Se ajustarán las horas de ese día en su informe y el saldo que se arrastra al siguiente horario.';
    overlay(`<h2>${ap ? 'Aprobar' : 'Rechazar'} solicitud</h2>
      <form id="resolve-form" class="stack" style="gap:12px" data-id="${el.dataset.id}" data-accion="${el.dataset.accion}" data-tipo="${el.dataset.tipo}">
        <p class="small muted" style="margin:0">${nota}</p>
        <label class="field">Respuesta para la persona (opcional)<textarea name="respuesta" rows="3"></textarea></label>${mic("respuesta")}
        <div class="row end"><button type="button" class="btn" data-act="closeOverlay">Cancelar</button><button class="btn ${ap ? 'primary' : 'danger'}" type="submit">${ap ? 'Aprobar' : 'Rechazar'}</button></div>
      </form>`);
  },
});
