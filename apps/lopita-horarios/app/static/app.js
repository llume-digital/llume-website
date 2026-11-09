import { $, clone } from './js/nucleo/util.js';
import { api, arreglarPendientes, closeOverlay, confirmar, loadConfig, showNotifications, state, toast, vigilarRed } from './js/nucleo/estado.js';
import { onBind } from './js/nucleo/enlace.js';
import { isWorker, render, renderView, tabsHtml } from './js/nucleo/pintado.js';
import { alNavegar, route } from './js/nucleo/rutas.js';
import { refreshList } from './js/pantallas/horarios.js';
import { closeMenu, diaCambios, menuOnScroll, seguirAnclas } from './js/pantallas/dia.js';
import { uploadWebDoc } from './js/pantallas/comentarios.js';
import { actions, changeActions, renameRefs } from './js/acciones.js';
import { enviarFormulario } from './js/formularios.js';
// ------------------------------------------------------------------ eventos globales
document.addEventListener('click', async (e) => {
  if (!e.target.closest('.popover') && !e.target.closest('[data-act="cell"]') && !e.target.closest('.g-bar')) closeMenu();
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'checkbox')) return;
  const fn = actions[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  if (el.dataset.ocupado) return; // la acción anterior de este mismo botón aún no ha terminado (doble clic)
  el.dataset.ocupado = '1';
  try { await fn(el, e); } catch (err) { toast(err.message, true); } finally { delete el.dataset.ocupado; }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeMenu(); if (!$('.overlay .spinner')) closeOverlay(); }
  if (e.key === 'Enter' && e.target.matches('tr.click')) e.target.click();
});
document.addEventListener('input', onBind);
document.addEventListener('change', (e) => {
  const ca = e.target.closest('[data-act-change]');
  if (ca) { changeActions[ca.dataset.actChange](ca); return; }
  const rn = e.target.closest('[data-rename]');
  if (rn) { renameRefs(rn.dataset.rename, Number(rn.dataset.i), rn.value); return; }
  if (e.target.id === 'import-file') { importConfig(e.target.files[0]); return; }
  if (e.target.dataset.webDoc) { uploadWebDoc(e.target); return; }
  onBind(e);
});
document.addEventListener('submit', enviarFormulario);
window.addEventListener('scroll', menuOnScroll, true);
if (window.visualViewport) window.visualViewport.addEventListener('resize', seguirAnclas);  // p. ej. al abrirse el teclado
window.addEventListener('hashchange', () => { const arriba = alNavegar(); renderView(); if (arriba) window.scrollTo(0, 0); });
window.addEventListener('beforeunload', (e) => { if (state.dirty || (state.dia && diaCambios(state.dia).length)) { e.preventDefault(); e.returnValue = ''; } });

async function importConfig(file) {
  if (!file) return;
  try {
    const cfg = JSON.parse(await file.text());
    if (!(await confirmar({ titulo: '¿Cargar la configuración del archivo?', texto: 'Se sustituirá toda la configuración por la del archivo (se guarda como una versión nueva).', verbo: 'Cargar configuración', peligro: true }))) return;
    const r = await api('PUT', '/api/config', { config: cfg.config || cfg, base: state.version, nota: `Importado de ${file.name}` });
    state.config = r.config; state.version = r.version; state.draft = clone(r.config); state.dirty = false; state.ajustes = null;
    toast('Configuración cargada'); renderView();
  } catch (e) { toast(`No se pudo cargar: ${e.message}`, true); }
}

export async function boot() {
  try { state.me = await api('GET', '/api/me'); } catch { state.me = null; }
  if (!state.me) { try { state.acceso = await api('GET', '/api/acceso'); } catch { state.acceso = {}; } }
  state.mi = {}; state.miH = {}; state.inf = {}; state.sol = {};
  if (state.me && !state.me.cambiar_clave && state.me.rol === 'admin') { await loadConfig(); await refreshList(); }
  $('#app').innerHTML = '';
  render();
  if (state.me && state.me.rol === 'admin' && state.me.notificaciones) showNotifications();
  if (state.me && state.me.rol === 'admin' && state.me.arreglos_pendientes) arreglarPendientes();
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !state.me || state.me.cambiar_clave) return;
  try {
    const me = await api('GET', '/api/me');
    if (isWorker()) { state.me.avisos = me.avisos; state.mi.perfil = undefined; }
    else {
      state.me.alertas = me.alertas; state.me.pendientes = me.pendientes; state.me.criticas = me.criticas; state.alg = {};
      if (me.notificaciones) showNotifications();
    }
    if (!state.dirty) renderView(); else { const t = $('#tabs'); if (t) t.innerHTML = tabsHtml(route().name); }
  } catch { /* sin conexión: se reintenta la próxima vez */ }
});
vigilarRed();
boot();
