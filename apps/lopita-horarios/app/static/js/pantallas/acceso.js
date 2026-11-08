import { state } from '../nucleo/estado.js';
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

