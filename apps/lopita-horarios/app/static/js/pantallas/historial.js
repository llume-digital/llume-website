// Historial de un horario: qué versiones mandan o mandaron en sus fechas (ver app/historial.py). Cada versión se puede
// abrir, comparar con lo que el equipo ve hoy, renombrar y restaurar como borrador nuevo (que al publicarse pasa por
// la revisión de siempre, así que nada cambia sin ver antes qué cambia).
import { daysBetween, esc, fmtLong, fmtRange, fmtStamp } from '../nucleo/util.js';
import { api, overlay, state, toast, withBusy } from '../nucleo/estado.js';
import { head, renderView } from '../nucleo/pintado.js';

export const nombreHorario = (h) => h.nombre || fmtRange(h.desde, h.hasta);

const dias = (n) => `${n} día${n === 1 ? '' : 's'}`;

export function viewHistorial(id) {
  const hist = state.historial;
  if (!hist || hist.id !== id) {
    if (!state.loading) {
      state.loading = true;
      api('GET', `/api/horarios/${id}/historial`).then((d) => { state.historial = { id, ...d }; })
        .catch((e) => { toast(e.message, true); location.hash = `#/horarios/${id}`; })
        .finally(() => { state.loading = false; renderView(); });
    }
    return '<div class="empty">Cargando historial…</div>';
  }
  const filas = hist.versiones.map((v) => {
    // La que manda en todas sus fechas es lo que el equipo ve hoy: no hay nada con qué compararla ni que restaurar.
    const vigente = v.dias_ahora === daysBetween(v.desde, v.hasta) + 1;
    const estado = vigente ? '<span class="badge publicado">Es lo publicado hoy</span>' : v.dias_ahora
      ? `<span class="badge publicado">Manda en ${dias(v.dias_ahora)}</span>`
      : v.estado === 'publicado' ? '<span class="badge">Sustituido</span>' : '<span class="badge borrador">Borrador</span>';
    const antes = v.dias_antes ? `<span class="small muted">Mandó en ${dias(v.dias_antes)}${v.sustituido_at ? ` hasta ${esc(fmtStamp(v.sustituido_at))}` : ''}</span>` : '';
    return `<li class="historial-version${v.id === id ? ' actual' : ''}" data-version="${v.id}">
      <div class="stack" style="gap:2px"><b>${esc(nombreHorario(v))}</b>
        <span class="small muted">${esc(fmtRange(v.desde, v.hasta))} · ${v.publicado ? `publicado ${esc(fmtStamp(v.publicado))}` : `creado ${esc(fmtStamp(v.creado))}`}</span>
        <div class="row" style="gap:8px">${estado}${antes}</div></div>
      <span class="spacer"></span>
      <div class="row" style="gap:6px"><a class="btn" href="#/horarios/${v.id}">Ver</a>
        ${vigente ? '' : `<button class="btn" data-act="compararVersion" data-id="${v.id}">Comparar con hoy</button>`}
        <button class="btn" data-act="renombrarHorario" data-id="${v.id}" data-nombre="${esc(v.nombre || '')}">Renombrar</button>
        ${vigente ? '' : `<button class="btn" data-act="restaurarVersion" data-id="${v.id}">Restaurar</button>`}</div></li>`;
  }).join('');
  return `<p class="no-print" style="margin:0 0 8px"><a href="#/horarios/${id}">← Volver al horario</a></p>
    ${head('Historial', `<span class="small muted">${esc(fmtRange(hist.desde, hist.hasta))}</span>`, '')}
    <p class="small muted">Versiones publicadas en estas fechas, de la más reciente a la más antigua. Restaurar una crea un borrador nuevo: no cambia nada hasta que lo publiques, y antes verás qué cambia para el equipo.</p>
    ${filas ? `<ul class="historial-lista">${filas}</ul>` : '<div class="empty">Aún no se ha publicado nada en estas fechas.</div>'}`;
}

function comparacionDialog(v, rev) {
  const porDia = new Map();
  for (const c of rev.cambios) { if (!porDia.has(c.fecha)) porDia.set(c.fecha, []); porDia.get(c.fecha).push(c); }
  const t = (x) => (x ? esc(x) : '<i>libra</i>');
  const sust = rev.sustituye.map((s) => `${fmtRange(s.desde, s.hasta)} (${dias(s.dias)})`).join(', ');
  return `<h2>${esc(nombreHorario(v))} frente a hoy</h2>
    <p class="small">${rev.dias_publicados ? `Restaurarla cambiaría lo que el equipo ve ahora en ${esc(sust)}.` : 'Ninguna de sus fechas tiene otro horario publicado mandando.'}</p>
    ${porDia.size ? `<div class="revision-cambios">${[...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, cs]) => `<div class="revision-dia"><b>${esc(fmtLong(d))}</b>
      <ul>${cs.map((c) => `<li>${esc(c.nombre)}: hoy ${t(c.antes)}, en esta versión ${t(c.despues)}</li>`).join('')}</ul></div>`).join('')}</div>`
      : rev.dias_publicados ? '<p class="small muted">Coincide con lo publicado hoy: no cambia ningún turno.</p>' : ''}
    <div class="row end" style="margin-top:16px"><button class="btn" data-act="closeOverlay">Cerrar</button>
      <button class="btn primary" data-act="restaurarVersion" data-id="${v.id}">Restaurar como borrador</button></div>`;
}

const version = (id) => (state.historial?.versiones || []).find((v) => v.id === id)
  || (state.current && state.current.id === id ? { id, nombre: state.current.nombre, ...state.current.horario } : { id });

// Acciones del historial (se añaden a las de acciones.js).
export const accionesHistorial = {
  compararVersion: async (el) => {
    const id = Number(el.dataset.id);
    const rev = await api('GET', `/api/horarios/${id}/comparar`);
    overlay(comparacionDialog(version(id), rev));
  },
  renombrarHorario: async (el) => {
    const id = Number(el.dataset.id ?? state.current.id);
    const actual = el.dataset.nombre ?? (state.current?.nombre || '');
    const nombre = window.prompt('Nombre de esta versión (vacío para quitarlo):', actual);
    if (nombre === null) return;
    const d = await api('PATCH', `/api/horarios/${id}/nombre`, { nombre });
    if (state.current && state.current.id === id) state.current = d;
    if (state.historial) {
      const v = state.historial.versiones.find((x) => x.id === id);
      if (v) v.nombre = d.nombre;
    }
    toast(d.nombre ? 'Nombre guardado' : 'Nombre quitado');
    renderView();
  },
  restaurarVersion: async (el) => {
    const id = Number(el.dataset.id);
    const d = await withBusy('Creando el borrador…', () => api('POST', `/api/horarios/${id}/restaurar`));
    state.current = d;
    state.historial = null;
    toast('Borrador creado: revísalo y publícalo cuando quieras');
    location.hash = `#/horarios/${d.id}`;
  },
};
