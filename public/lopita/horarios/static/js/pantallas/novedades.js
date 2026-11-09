import { esc } from '../nucleo/util.js';
import { NAV_ADMIN, head, renderView, pintarTabs } from '../nucleo/pintado.js';
import { api, closeOverlay, state } from '../nucleo/estado.js';
import { actions } from '../nucleo/registro.js';
import { refreshList } from './horarios.js';
import { NOVEDADES } from '../datos/novedades.js';
// ------------------------------------------------------------------ NOVEDADES (mejoras recientes de la app)
// La lista está en js/datos/novedades.js, junto con las reglas para escribir una entrada nueva.
// Lo visto se guarda como cuántas novedades había al abrir la pestaña: las nuevas siempre se añaden arriba, así que
// una entrada del mismo día que la última vista también cuenta como nueva.
const VISTAS_KEY = 'lopita-novedades-vistas-n';
const VISTAS_KEY_ANTIGUA = 'lopita-novedades-vistas';  // antes: la fecha de la última novedad vista
const novedadesVistas = () => {
  try {
    const n = localStorage.getItem(VISTAS_KEY);
    if (n !== null) return Math.min(Number(n) || 0, NOVEDADES.length);
    const fecha = localStorage.getItem(VISTAS_KEY_ANTIGUA);
    return fecha ? NOVEDADES.filter((x) => x.fecha <= fecha).length : 0;
  } catch { return 0; }
};
// Sin nada guardado (primera vez o sin almacenamiento) cuentan todas: así el cliente descubre la pestaña.
export const novedadesSinVer = () => NOVEDADES.length - novedadesVistas();
const fmtFechaLarga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

export function viewNovedades() {
  const nuevas = novedadesSinVer();
  try { localStorage.setItem(VISTAS_KEY, String(NOVEDADES.length)); } catch { /* sin almacenamiento */ }
  pintarTabs('novedades');
  const nombreTab = (id) => (NAV_ADMIN.find(([k]) => k === id) || [])[1] || id;
  const items = NOVEDADES.map((n, i) => `<article class="card novedad">
      <div class="novedad-cab"><time datetime="${n.fecha}">${esc(fmtFechaLarga(n.fecha))}</time>${i < nuevas ? '<span class="badge warn">Nuevo</span>' : ''}</div>
      <h2>${esc(n.titulo)}</h2>
      ${n.texto.map((p) => `<p>${p}</p>`).join('')}
      ${n.ir ? `<a class="btn small" href="#/${n.ir}">Ir a ${esc(nombreTab(n.ir))} →</a>` : ''}
    </article>`).join('');
  return `${head('Novedades', 'Las últimas mejoras de la app, de la más reciente a la más antigua.')}
  <div class="stack novedades">${items}</div>
  <p class="small muted section">¿Echas algo en falta? Pulsa <a href="#" data-act="feedback">Comentarios</a> y cuéntanoslo.</p>`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
  readNotices: async () => {
    state.mi.perfil = await api('POST', '/api/mi/avisos/leer', {});
    state.me.avisos = 0; renderView();
  },
  openNotification: async (el) => {
    try { await api('POST', '/api/notificaciones/leer', { ids: [Number(el.dataset.id)] }); } catch { /* se puede volver a leer luego */ }
    state.notifPending = false; closeOverlay();
    state.current = null; await refreshList(); location.hash = `#/horarios/${el.dataset.sid}`;
  },
  readNotifications: async () => {
    try { await api('POST', '/api/notificaciones/leer', {}); } catch { /* se volverá a mostrar */ }
    state.notifPending = false; closeOverlay();
  },
});
