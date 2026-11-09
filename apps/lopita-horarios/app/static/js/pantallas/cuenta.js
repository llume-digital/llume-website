import { $, esc } from '../nucleo/util.js';
import { api, confirmar, overlay, state, toast } from '../nucleo/estado.js';
import { boot } from '../../app.js';
import { renderView } from '../nucleo/pintado.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ CUENTA y GOOGLE
export function claveTemporal() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  const r = new Uint32Array(10); crypto.getRandomValues(r);
  return Array.from(r, (x) => abc[x % abc.length]).join('');
}
// El botón de Google (Google Identity Services) se carga solo si hay ID de cliente configurado en Ajustes.
let gisCarga = null;
function cargarGoogle() {
  if (window.google && window.google.accounts && window.google.accounts.id) return Promise.resolve();
  if (!gisCarga) {
    gisCarga = new Promise((ok, ko) => {
      const sc = document.createElement('script');
      sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
      sc.onload = ok; sc.onerror = () => { gisCarga = null; ko(new Error('No se ha podido cargar el botón de Google.')); };
      document.head.appendChild(sc);
    });
  }
  return gisCarga;
}
export async function botonGoogle(el, alPulsar, texto = 'signin_with') {
  const cid = (state.acceso && state.acceso.google_client_id) || (state.me && state.me.google_client_id);
  if (!el || !cid) return;
  try { await cargarGoogle(); } catch (e) { el.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; return; }
  if (!el.isConnected) return;
  window.google.accounts.id.initialize({ client_id: cid, callback: (r) => alPulsar(r.credential), ux_mode: 'popup' });
  window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: texto, shape: 'pill', locale: 'es', width: Math.min(320, el.clientWidth || 320) });
}
export async function entrarConGoogle(credential) {
  const msg = $('#login-err');
  try {
    const r = await api('POST', '/api/login/google', { credential });
    if (r.pendiente) {
      msg.style.color = 'var(--ink)';
      msg.innerHTML = `<div class="notice info small">Registro recibido para <b>${esc(r.email)}</b>. Un encargado tiene que darte acceso; cuando lo haga, vuelve a entrar con Google.</div>`;
      return;
    }
    await boot();
  } catch (e) { msg.style.color = 'var(--bad)'; msg.textContent = e.message; }
}
export function cuentaDialog() {
  const m = state.me;
  const cid = m.google_client_id;
  overlay(`<h2>Mi cuenta</h2>
    <form id="cuenta-form" class="stack" style="gap:12px">
      <div class="fields two"><label class="field">Usuario<input type="text" value="${esc(m.username)}" disabled></label>
        <label class="field">Nombre<input type="text" name="nombre" value="${esc(m.nombre || '')}" maxlength="100"></label></div>
      <label class="field">Correo electrónico<span class="hint">Si es el de tu cuenta de Google, podrás entrar con Google.</span><input type="email" name="email" value="${esc(m.email || '')}" autocomplete="email" placeholder="nombre@gmail.com"></label>
      <div class="small" id="cuenta-err" style="color:var(--bad)" role="alert"></div>
      <div class="row end"><button class="btn primary" type="submit">Guardar</button></div>
    </form>
    <div class="section cuenta-google"><h3 style="margin:0 0 6px">Google</h3>
      ${m.google ? `<div class="row"><span class="badge publicado">Vinculada</span><span class="small muted">Puedes entrar con el botón de Google.</span><span class="spacer"></span><button class="btn small" data-act="desvincularGoogle">Desvincular</button></div>`
        : cid ? '<p class="small muted" style="margin:0 0 8px">Vincula tu cuenta de Google para entrar sin contraseña:</p><div id="g-vincular" class="g-btn"></div>'
          : '<p class="small muted" style="margin:0">Entrar con Google aún no está activado (lo activa un encargado en Ajustes).</p>'}</div>
    <div class="section">${pwForm(false, true)}</div>`);
  if (!m.google && cid) botonGoogle($('#g-vincular'), vincularGoogle, 'continue_with');
}
async function vincularGoogle(credential) {
  try { state.me = { ...state.me, ...(await api('POST', '/api/mi/google', { credential })) }; toast('Cuenta de Google vinculada'); cuentaDialog(); } catch (e) { toast(e.message, true); }
}

export function pwForm(forced, enCuenta = false) {
  const sinActual = !forced && state.me && state.me.via_google;
  const h = enCuenta ? 3 : forced ? 1 : 2;
  return `<form id="pw-form" class="${forced ? '' : 'stack'}" style="display:grid;gap:12px">
    <h${h}${enCuenta ? ' style="margin:0"' : ''}>${forced ? 'Elige tu contraseña' : 'Cambiar contraseña'}</h${h}>
    ${forced ? '<p class="muted" style="margin:0">Es tu primer acceso: cambia la contraseña temporal por una tuya (mínimo 8 caracteres).</p>' : ''}
    ${sinActual ? '<p class="small muted" style="margin:0">Has entrado con Google: no hace falta la contraseña anterior.</p>' : `<label class="field">Contraseña ${forced ? 'temporal' : 'actual'}<input type="password" name="actual" autocomplete="current-password" required></label>`}
    <label class="field">Nueva contraseña<input type="password" name="nueva" minlength="8" autocomplete="new-password" required></label>
    <label class="field">Repite la nueva contraseña<input type="password" name="repite" minlength="8" autocomplete="new-password" required></label>
    <div class="small" id="pw-err" style="color:var(--bad)" role="alert"></div>
    <div class="row ${forced ? '' : 'end'}">${forced ? '' : '<button type="button" class="btn" data-act="closeOverlay">Cancelar</button>'}<button class="btn primary" type="submit">Guardar contraseña</button>${forced ? '<button type="button" class="btn" data-act="logout">Salir</button>' : ''}</div>
  </form>`;
}
export function viewForcePw() {
  return `<div class="login"><div class="login-art"><div class="mark">LOPITA &amp; CO</div><div class="rule"></div><div class="tag">Horarios del equipo</div></div><div class="login-form">${pwForm(true)}</div></div>`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
  pwDialog: () => overlay(pwForm(false)),
  cuentaDialog: () => cuentaDialog(),
  desvincularGoogle: async () => {
    try { state.me = { ...state.me, ...(await api('DELETE', '/api/mi/google')) }; toast('Cuenta de Google desvinculada'); cuentaDialog(); } catch (e) { toast(e.message, true); }
  },
  resetUser: (el) => {
    const u = el.dataset.u;
    overlay(`<h2>Nueva contraseña para ${esc(u)}</h2>
      <form id="reset-form" class="stack" style="gap:12px" data-u="${esc(u)}">
        <p class="small muted" style="margin:0">Es temporal: al entrar con ella tendrá que cambiarla por una suya. Si tiene Google vinculado, también puede entrar con Google.</p>
        <label class="field">Contraseña temporal<input type="text" name="password" minlength="8" required autocomplete="off" value="${esc(claveTemporal())}"></label>
        <div class="row end"><button type="button" class="btn" data-act="closeOverlay">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
      </form>`);
  },
  emailUser: (el) => {
    const u = state.ajustes.users.find((x) => x.username === el.dataset.u);
    overlay(`<h2>Correo de ${esc(u.nombre || u.username)}</h2>
      <form id="email-form" class="stack" style="gap:12px" data-u="${esc(u.username)}">
        <p class="small muted" style="margin:0">Con su correo de Google podrá entrar con Google.</p>
        <label class="field">Correo electrónico<input type="email" name="email" value="${esc(u.email || '')}" placeholder="nombre@gmail.com"></label>
        <div class="row end"><button type="button" class="btn" data-act="closeOverlay">Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
      </form>`);
  },

  delUser: async (el) => {
    if (!(await confirmar({ titulo: `¿Quitar el acceso a ${el.dataset.u}?`, verbo: 'Quitar acceso', peligro: true }))) return;
    try { state.ajustes.users = await api('DELETE', `/api/usuarios/${encodeURIComponent(el.dataset.u)}`); renderView(); } catch (e) { toast(e.message, true); }
  },
});
