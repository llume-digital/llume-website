import { ICON, esc, fmtH, fmtRange, fmtStamp } from '../nucleo/util.js';
import { api, state, toast } from '../nucleo/estado.js';
import { head, renderView } from '../nucleo/pintado.js';
import { alertsPanel, weeksGrid } from './alertas.js';
import { monthOfSchedule } from './mes.js';
import { closeMenu, dayView, openCellMenu, summaryTable } from './dia.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ HORARIOS: detalle y cuadrante
export function viewDetalle(id) {
  const cur = state.current;
  if (!cur || cur.id !== id) {
    if (!state.loading) {
      state.loading = true;
      api('GET', `/api/horarios/${id}`).then((d) => { state.current = d; }).catch((e) => { toast(e.message, true); location.hash = '#/horarios'; })
        .finally(() => { state.loading = false; renderView(); });
    }
    return '<div class="empty">Cargando horario…</div>';
  }
  const cfg = state.config;
  const h = cur.horario;
  const errors = h.incidencias.filter((i) => i.nivel === 'error');
  const extra = h.resumen.reduce((s, r) => s + r.horas_extra, 0);
  const pend = cur.cambios_pendientes;
  const actions = [
    `<button class="btn" data-act="solve">Solucionar problemas</button>`,
    `<button class="btn" data-act="regenerate">Regenerar</button>`,
    h.bloqueos.length ? `<button class="btn" data-act="clearLocks">Quitar ${h.bloqueos.length === 1 ? 'el bloqueo' : `${h.bloqueos.length} bloqueos`}</button>` : '',
    `<button class="btn" data-act="print">Imprimir</button>`,
    `<button class="btn" data-act="pdf">PDF</button>`,
    `<a class="btn" href="/api/horarios/${cur.id}/csv">Horas (CSV)</a>`,
    cur.url_publica ? `<button class="btn" data-act="copyLink">Copiar enlace</button>` : '',
    cur.estado === 'publicado' ? `<button class="btn" data-act="unpublish">Volver a borrador</button>` : '',
    cur.estado === 'borrador' ? `<button class="btn primary" data-act="publish">${cur.reemplaza ? 'Publicar el arreglo' : 'Publicar y enviar a Slack'}</button>` : '',
    `<a class="btn" href="#/horarios/${cur.id}/historial">Historial</a>`,
    `<button class="btn" data-act="renombrarHorario" data-id="${cur.id}" data-nombre="${esc(cur.nombre || '')}">${cur.nombre ? 'Renombrar' : 'Poner nombre'}</button>`,
    `<button class="btn danger" data-act="deleteSchedule">Eliminar</button>`,
  ].join('');
  return `<p class="no-print" style="margin:0 0 8px"><a href="#/horarios">← Horarios</a></p>
  ${head(cur.nombre ? `${esc(cur.nombre)} <span class="muted small">${fmtRange(h.desde, h.hasta)}</span>` : fmtRange(h.desde, h.hasta), `<span class="badge ${cur.estado}">${cur.estado === 'publicado' ? 'Publicado' : 'Borrador'}</span>
    <span class="small muted">&nbsp;Actualizado ${fmtStamp(cur.actualizado)}${cur.publicado ? ` · publicado ${fmtStamp(cur.publicado)}` : ''}</span>`, '')}
  <div class="row no-print" style="margin:-6px 0 18px">${actions}</div>
  ${scheduleNotices(cur)}
  ${pend.length ? `<div class="notice warn no-print" style="margin-bottom:16px"><span>Has cambiado el horario de <b>${pend.map((p) => esc(nameIn(cfg, p))).join(', ')}</b> después de publicarlo.</span><span class="spacer"></span><button class="btn primary" data-act="notify">Avisar por Slack</button></div>` : ''}
  <div class="stats">
    <div class="stat"><b>${h.asignaciones.length}</b><span>turnos asignados</span></div>
    <div class="stat ${cur.huecos ? 'bad' : ''}"><b>${cur.huecos}</b><span>franjas sin cubrir</span></div>
    <div class="stat ${extra >= 0.5 ? 'warn' : ''}"><b>${fmtH(Math.round(extra * 10) / 10)} h</b><span>horas extra en total</span></div>
    <div class="stat ${errors.length ? 'bad' : ''}"><b>${errors.length}</b><span>reglas incumplidas</span></div>
  </div>
  ${state.vista === 'dia' ? '' : alertsPanel(cur)}
  <div class="section row" style="justify-content:space-between;align-items:flex-start">
    <div class="shift-legend">${cfg.turnos.map((s) => `<span><i style="background:${esc(s.color || 'var(--track)')}"></i><b>${esc(s.id)}</b> ${esc(s.nombre)} ${s.inicio}–${s.fin}</span>`).join('')}</div>
    <div class="cov-legend"><span><i class="ok"></i>Cubierto</span><span><i class="short"></i>Falta gente</span><span><i class="extra"></i>Sobra gente</span><span>${ICON.lock} Cambio manual</span></div>
  </div>
  ${viewSwitch()}
  ${state.vista === 'mes' ? `<p class="small muted no-print" style="margin:8px 0 0">Toca un día para verlo y editarlo hora a hora.</p>${monthOfSchedule(cur)}${summaryTable(h)}` : state.vista === 'dia' ? dayView(cur) : `<p class="small muted no-print" style="margin:8px 0 0">Toca una casilla para cambiar el turno, o el nombre de un día para verlo y editarlo hora a hora. Los cambios manuales quedan bloqueados y se respetan al regenerar.</p>
  ${weeksGrid(cur)}
  ${summaryTable(h)}`}`;
}

function viewSwitch() {
  const chip = (v, l) => `<button type="button" class="chip ${state.vista === v ? 'on' : ''}" data-act="setVista" data-v="${v}" aria-pressed="${state.vista === v}">${l}</button>`;
  return `<div class="row section no-print view-switch" role="group" aria-label="Vista">${chip('dia', 'Día')}${chip('semana', 'Semana')}${chip('mes', 'Mes')}<span class="spacer"></span><a class="small" href="#/calendario">Ver todos los horarios en el calendario</a></div>`;
}

// Avisos de cabecera: si no vale (alertas críticas), si es un arreglo pendiente o si tiene uno, y si se publicó con críticas.
function scheduleNotices(cur) {
  const out = [];
  const n = cur.alertas.critica;
  if (n) {
    const consejo = cur.estado === 'publicado'
      ? 'Ya está publicado: arréglalo cuanto antes o resuélvelo fuera de la app.'
      : 'Arréglalo antes de publicar; si lo vas a resolver fuera de la app, al publicar te pediremos confirmarlo.';
    out.push(`<div class="notice crit no-print"><span><b>Este horario no vale tal cual: tiene ${n} alerta${n > 1 ? 's' : ''} crítica${n > 1 ? 's' : ''}.</b>
      Hay momentos sin nadie en el local, o sin nadie que pueda abrir o cerrar (más abajo, en Alertas). ${consejo}</span></div>`);
  }
  if (cur.reemplaza) {
    out.push(`<div class="notice info no-print"><span>Es un <b>arreglo preparado</b> para el horario publicado. El equipo sigue viendo el publicado hasta que publiques este arreglo; al hacerlo, lo sustituye (mismo enlace) y te quedará avisar por Slack a quien cambie.</span>
      <span class="spacer"></span><a class="btn small" href="#/horarios/${cur.reemplaza}">Ver el publicado</a></div>`);
  }
  if (cur.arreglo_pendiente) {
    out.push(`<div class="notice warn no-print"><span>Hay un <b>arreglo preparado</b> para este horario (por una ausencia) pendiente de que lo revises y lo publiques.</span>
      <span class="spacer"></span><a class="btn small primary" href="#/horarios/${cur.arreglo_pendiente}">Ver el arreglo</a></div>`);
  }
  for (const r of (cur.registro || []).filter((x) => x.accion === 'publicado_con_criticas').slice(0, 1)) {
    out.push(`<div class="notice warn small no-print"><span>Publicado con ${r.detalle.criticas.length} alerta${r.detalle.criticas.length > 1 ? 's' : ''} crítica${r.detalle.criticas.length > 1 ? 's' : ''} por <b>${esc(r.usuario)}</b> el ${esc(fmtStamp(r.created_at))}.</span></div>`);
  }
  return out.length ? `<div class="stack section" style="gap:10px;margin-top:0">${out.join('')}</div>` : '';
}

export const nameIn = (cfg, id) => (cfg.empleados.find((e) => e.id === id) || {}).nombre || id;
// Horas de una persona antes y después de un cambio, en rojo si se alejan de su contrato (un comodín no tiene).
export function horasFila(cfg, x) {
  const comodin = (cfg.empleados.find((e) => e.id === x.empleado_id) || {}).comodin;
  const tag = (v) => `<span class="${!comodin && Math.abs(v - x.objetivo) > cfg.reglas.margen_periodo_horas ? 'fix-off' : ''}">${fmtH(v)}</span>`;
  return `<tr><td><b>${esc(nameIn(cfg, x.empleado_id))}</b></td><td class="num">${comodin ? '<span class="muted">Comodín</span>' : fmtH(x.objetivo)}</td><td class="num">${tag(x.antes)} → ${tag(x.despues)}</td></tr>`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
  cell: (el) => openCellMenu(el),
  setCell: async (el) => {
    closeMenu();
    try {
      const body = { empleado_id: el.dataset.emp, fecha: el.dataset.date, turno_id: el.dataset.shift || null, bloquear: true };
      if (el.dataset.puesto) Object.assign(body, { puesto: el.dataset.puesto, conservar_horas: true });
      if (el.dataset.funcion !== undefined) body.funcion = el.dataset.funcion; // '' = sin rol
      state.current = await api('PATCH', `/api/horarios/${state.current.id}/celda`, body);
      renderView();
      const errs = state.current.horario.incidencias.filter((i) => i.nivel === 'error' && i.empleado_id === el.dataset.emp && i.fecha === el.dataset.date);
      if (errs.length) toast(errs[0].mensaje, true);
    } catch (e) { toast(e.message, true); }
  },
  unlockCell: async (el) => {
    closeMenu();
    const a = state.current.horario.asignaciones.find((x) => x.empleado_id === el.dataset.emp && x.fecha === el.dataset.date);
    state.current = await api('PATCH', `/api/horarios/${state.current.id}/celda`, { empleado_id: el.dataset.emp, fecha: el.dataset.date, turno_id: a ? a.turno_id : null, puesto: a ? a.puesto : null, funcion: a ? a.funcion || '' : null, conservar_horas: true, bloquear: false });
    renderView();
  },
});
