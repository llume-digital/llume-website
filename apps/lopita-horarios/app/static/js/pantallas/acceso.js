import { api, closeOverlay, state, toast } from '../nucleo/estado.js';
import { renderView } from '../nucleo/pintado.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ acceso
export function viewLogin() {
  return `<div class="login">
    <div class="login-art"><div class="mark">LOPITA &amp; CO</div><div class="rule"></div><div class="tag">Horarios del equipo</div></div>
    <div class="login-form"><form id="login-form">
      <h1>Entrar</h1>
      <p class="muted" style="margin:0">Acceso para el equipo de Lopita.</p>
      <label class="field">Usuario<input type="text" name="usuario" autocomplete="username" required></label>
      <label class="field">Contraseña<input type="password" name="password" autocomplete="current-password" required></label>
      <div class="err small" id="login-err" style="color:var(--bad)" role="alert"></div>
      <button class="btn primary" type="submit" style="justify-content:center">Entrar</button>
      ${state.acceso && state.acceso.google_client_id ? `<div class="g-sep"><span>o</span></div><div id="g-login" class="g-btn"></div>
      <p class="small muted" style="margin:0">Con Google entras si tu correo está en tu cuenta. Si aún no tienes cuenta, te registras y un encargado te da acceso.</p>` : ''}
    </form></div>
  </div>`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
  rechazarAcceso: async (el) => {
    try { const r = await api('POST', `/api/accesos/${el.dataset.id}/rechazar`); state.ajustes.accesos = r.accesos; state.me.accesos = r.accesos.length; toast('Registro rechazado'); renderView(); } catch (e) { toast(e.message, true); }
  },
  verAccesos: async (el) => {
    try { await api('POST', '/api/notificaciones/leer', { ids: [Number(el.dataset.id)] }); } catch { /* se verá otra vez, sin más */ }
    state.notifPending = false; closeOverlay(); state.ajustes = null; location.hash = '#/ajustes';
  },
});
