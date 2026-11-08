import { esc, fmtStamp } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { head } from '../nucleo/pintado.js';
import { ensure, reqBadge, reqSummary, shiftHours, signed } from './portal.js';
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

