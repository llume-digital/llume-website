import { $, addDays, clone, todayIso } from './js/nucleo/util.js';
import { api, arreglarPendientes, closeOverlay, confirmar, loadConfig, saveConfig, showNotifications, state, toast } from './js/nucleo/estado.js';
import { markDirty, onBind } from './js/nucleo/enlace.js';
import { isWorker, pararDictado, render, renderView, route, tabsHtml } from './js/nucleo/pintado.js';
import { refreshList } from './js/pantallas/horarios.js';
import { closeMenu, diaCambios, menuOnScroll, seguirAnclas } from './js/pantallas/dia.js';
import { BAJA_SIN_FIN } from './js/pantallas/equipo.js';
import { signed } from './js/pantallas/portal.js';
import { pantallaActual, uploadWebDoc } from './js/pantallas/comentarios.js';
import { cuentaDialog } from './js/pantallas/cuenta.js';
import { actions, changeActions, renameRefs } from './js/acciones.js';
// ------------------------------------------------------------------ eventos globales
document.addEventListener('click', async (e) => {
  if (!e.target.closest('.popover') && !e.target.closest('[data-act="cell"]') && !e.target.closest('.g-bar')) closeMenu();
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'checkbox')) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); try { await fn(el, e); } catch (err) { toast(err.message, true); } }
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
document.addEventListener('submit', async (e) => {
  e.preventDefault();
  pararDictado();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));
  if (f.id === 'login-form') {
    try {
      state.me = await api('POST', '/api/login', data);
      await boot();
    } catch (err) { $('#login-err').textContent = err.message; }
  } else if (f.id === 'baja-form' || f.id === 'alta-form') {
    const c = state.draft, emp = f.dataset.emp;
    if (f.id === 'baja-form') {
      const hasta = data.hasta || addDays(data.desde, BAJA_SIN_FIN);
      if (hasta < data.desde) { toast('La baja no puede acabar antes de empezar', true); return; }
      c.ausencias.push({ empleado_id: emp, desde: data.desde, hasta, motivo: 'baja' });
    } else {
      const b = c.ausencias.find((a) => a.empleado_id === emp && a.motivo === 'baja' && a.hasta >= todayIso());
      const fin = addDays(data.vuelve, -1);
      if (b) { if (fin < b.desde) c.ausencias.splice(c.ausencias.indexOf(b), 1); else b.hasta = fin; }
    }
    markDirty(); closeOverlay();
    await saveConfig();
  } else if (f.id === 'user-form') {
    try { state.ajustes.users = await api('POST', '/api/usuarios', { usuario: data.usuario, password: data.password, nombre: data.nombre || null, rol: data.rol, empleado_id: data.rol === 'empleado' ? data.empleado_id : null }); toast('Cuenta guardada'); renderView(); } catch (err) { toast(err.message, true); }
  } else if (f.id === 'fb-form') {
    try {
      await api('POST', '/api/comentarios', { tipo: data.tipo || 'sugerencia', texto: data.texto, pantalla: pantallaActual() });
      closeOverlay(); toast('¡Gracias! Tu comentario ha quedado guardado');
      if (state.fb) state.fb.data = undefined;
      if (!isWorker()) { state.me.comentarios = (state.me.comentarios || 0) + 1; renderView(); }
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'cuenta-form') {
    try {
      state.me = { ...state.me, ...(await api('PUT', '/api/mi/cuenta', { email: data.email || null, nombre: data.nombre || null })) };
      toast('Cuenta guardada'); cuentaDialog();
      const nb = $('.userbox span'); if (nb) nb.textContent = state.me.nombre;
    } catch (err) { $('#cuenta-err').textContent = err.message; }
  } else if (f.id === 'reset-form') {
    try { state.ajustes.users = await api('POST', `/api/usuarios/${encodeURIComponent(f.dataset.u)}/clave`, { password: data.password }); closeOverlay(); toast(`Contraseña temporal guardada. Pásasela a ${f.dataset.u}.`); renderView(); } catch (err) { toast(err.message, true); }
  } else if (f.id === 'email-form') {
    try { state.ajustes.users = await api('PUT', `/api/usuarios/${encodeURIComponent(f.dataset.u)}/email`, { email: data.email || null }); closeOverlay(); toast('Correo guardado'); renderView(); } catch (err) { toast(err.message, true); }
  } else if (f.id === 'acceso-form') {
    try {
      const r = await api('POST', `/api/accesos/${f.dataset.id}/aprobar`, { usuario: data.usuario, nombre: data.nombre || null, rol: data.rol, empleado_id: data.rol === 'empleado' ? data.empleado_id : null });
      state.ajustes.accesos = r.accesos; state.ajustes.users = r.usuarios; state.me.accesos = r.accesos.length;
      toast(`Acceso dado a ${data.usuario}: ya puede entrar con Google`); renderView();
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'google-form') {
    try {
      state.ajustes.google = await api('PUT', '/api/ajustes/google', { client_id: data.client_id || null });
      state.me.google_client_id = state.ajustes.google.client_id;
      toast(state.ajustes.google.client_id ? 'Entrar con Google activado' : 'Entrar con Google desactivado'); renderView();
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'pw-form') {
    if (data.nueva !== data.repite) { $('#pw-err').textContent = 'Las contraseñas nuevas no coinciden'; return; }
    try {
      const forced = state.me.cambiar_clave;
      state.me = { ...state.me, ...(await api('POST', '/api/mi/clave', { actual: data.actual || '', nueva: data.nueva })) };
      closeOverlay(); toast('Contraseña cambiada');
      if (forced) await boot();
    } catch (err) { $('#pw-err').textContent = err.message; }
  } else if (f.id === 'abs-form') {
    try {
      state.mi.perfil = await api('POST', '/api/mi/ausencias', { desde: data.desde, hasta: data.hasta, motivo: data.motivo, nota: data.nota || null });
      toast('Solicitud enviada'); renderView();
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'corr-form') {
    const body = { fecha: data.fecha, clase: data.clase, motivo: data.motivo };
    if (data.clase === 'turno') body.turno_id = data.turno_id;
    if (data.clase === 'horas') { body.inicio = data.inicio; body.fin = data.fin; }
    if (data.clase === 'extra') { if (data.turno_id) body.turno_id = data.turno_id; else { body.inicio = data.inicio; body.fin = data.fin; } }
    try {
      state.mi.perfil = await api('POST', '/api/mi/correcciones', body);
      state.miH.data = undefined; closeOverlay(); toast('Solicitud enviada'); renderView();
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'resolve-form') {
    const { id, accion, tipo } = f.dataset;
    try {
      const r = await api('POST', `/api/solicitudes/${id}/resolver`, { accion, respuesta: data.respuesta || null });
      state.me.pendientes = r.pendientes; state.sol.data = undefined; state.inf.data = undefined;
      closeOverlay();
      if (accion === 'aprobar' && tipo === 'ausencia') {
        await loadConfig(); state.ajustes = null;
        // Los horarios afectados se arreglan solos (sin publicar nada) y el aviso sale en la ventana de avisos.
        if (r.impacto.arreglos && r.impacto.arreglos.length) { await refreshList(); showNotifications(); }
        else toast('Ausencia aprobada y añadida a la configuración');
      } else if (accion === 'aprobar') toast(`Corrección aprobada (${signed(r.impacto.diferencia_horas)})`);
      else toast('Solicitud rechazada');
      renderView();
    } catch (err) { toast(err.message, true); }
  }
});
window.addEventListener('scroll', menuOnScroll, true);
if (window.visualViewport) window.visualViewport.addEventListener('resize', seguirAnclas);  // p. ej. al abrirse el teclado
window.addEventListener('hashchange', () => { closeMenu(); if (route().name === 'calendario') { state.cal.data = {}; state.cal.inf = {}; } if (route().name !== 'horarios' || !route().arg) state.current = state.current; if (route().name === 'web') state.web.data = undefined; renderView(); if (!(route().name === 'guia' && route().arg)) window.scrollTo(0, 0); });
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
boot();
