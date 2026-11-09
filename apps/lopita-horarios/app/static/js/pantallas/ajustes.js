import { ICON, clone, esc, fmtStamp } from '../nucleo/util.js';
import { api, confirmar, loadConfig, state, toast } from '../nucleo/estado.js';
import { empName, head, renderView } from '../nucleo/pintado.js';
import { teamCalendarsCard } from './portal.js';
import { confirmLeave } from '../nucleo/borrador.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ AJUSTES
export function viewAjustes() {
  if (!state.ajustes) {
    Promise.all([api('GET', '/api/usuarios'), api('GET', '/api/config/historial'), api('GET', '/api/slack'), api('GET', '/api/accesos'), api('GET', '/api/ajustes/google')])
      .then(([users, history, slack, accesos, google]) => { state.ajustes = { users, history, slack, accesos, google }; renderView(); })
      .catch((e) => toast(e.message, true));
    return '<div class="empty">Cargando…</div>';
  }
  const { users, history, slack, accesos, google } = state.ajustes;
  const empsLibres = state.draft.empleados.filter((e) => e.activo && !users.some((u) => u.empleado_id === e.id));
  return `${head('Ajustes', '')}
  <div class="grid">
    <div class="card"><h2>Negocio</h2><label class="field">Nombre que aparece en los horarios<input type="text" value="${esc(state.draft.negocio)}" data-bind="negocio"></label></div>
    <div class="card"><h2>Slack</h2>
      ${slack.configurado ? (slack.ok ? `<div class="notice ok">Conectado a <b>${esc(slack.equipo || '')}</b> como ${esc(slack.bot || '')}. Canal: <b>${esc(slack.canal || 'sin canal')}</b>.</div>` : `<div class="notice warn">El token de Slack no funciona: ${esc(slack.error || 'error desconocido')}.</div>`)
      : '<div class="notice info">Slack no está conectado. Mientras tanto, al publicar verás los mensajes que se enviarían (modo simulación).</div>'}
      <p class="small muted">${slack.relevo ? 'En esta versión el token no se guarda en la app: se configura en Cloudflare (secreto <code>SLACK_BOT_TOKEN</code> y variable <code>SLACK_CHANNEL</code> del Worker).' : 'Se configura en el servidor con <code>SLACK_BOT_TOKEN</code> y <code>SLACK_CHANNEL</code>.'} Para los mensajes privados, rellena el usuario de Slack o el email de cada persona en Equipo.</p></div>
    ${teamCalendarsCard()}
    <div class="card"><h2>Entrar con Google</h2>
      ${google.client_id ? '<div class="notice ok small">Activado: en la pantalla de entrada sale el botón de Google.</div>' : '<div class="notice info small">Desactivado. Pega el ID de cliente de Google para activarlo.</div>'}
      <form id="google-form" class="stack" style="gap:10px;margin-top:10px">
        <label class="field">ID de cliente de Google<span class="hint">Acaba en .apps.googleusercontent.com (Google Cloud → Credenciales → ID de cliente de OAuth, tipo «Aplicación web»).</span><input type="text" name="client_id" value="${esc(google.client_id || '')}" ${google.desde_entorno ? 'disabled' : ''} placeholder="123456789-abc.apps.googleusercontent.com" autocomplete="off"></label>
        ${google.desde_entorno ? '<p class="small muted" style="margin:0">Viene de la configuración del servidor (LOPITA_GOOGLE_CLIENT_ID).</p>' : '<div class="row end"><button class="btn" type="submit">Guardar</button></div>'}
      </form>
      <p class="small muted">Quien entra con Google entra en la cuenta que tenga ese correo. Si no tiene cuenta, queda como registro pendiente aquí abajo hasta que le des acceso.</p></div>
  </div>
  <div class="grid section">
    <div class="card"><h2>Cuentas de acceso</h2>
      <table class="list"><tbody>${users.map((u) => `<tr><td><b>${esc(u.nombre || u.username)}</b>${u.google ? ' <span class="badge neutral">Google</span>' : ''}<div class="small muted">${esc(u.username)} · ${u.rol === 'admin' ? 'Encargado' : `Trabajador · ${esc(empName(u.empleado_id))}`}${u.cambiar_clave ? ' · contraseña temporal' : ''}</div><div class="small muted">${u.email ? esc(u.email) : 'sin correo'}</div>
        <div class="user-acts">${u.username !== state.me.username ? `<button class="btn small" data-act="emailUser" data-u="${esc(u.username)}">Correo</button><button class="btn small" data-act="resetUser" data-u="${esc(u.username)}">Contraseña</button><button class="icon-btn" data-act="delUser" data-u="${esc(u.username)}" title="Quitar acceso">${ICON.trash}</button>` : '<button class="btn small" data-act="cuentaDialog">Mi cuenta</button>'}</div></td></tr>`).join('')}</tbody></table>
      ${accesos.length ? `<div class="accesos"><h3 style="margin:16px 0 6px">Registros con Google pendientes</h3>${accesos.map((a) => `<form id="acceso-form" class="acceso card" data-id="${a.id}">
        <div><b>${esc(a.nombre || a.email)}</b><div class="small muted">${esc(a.email)} · ${fmtStamp(a.created_at)}</div></div>
        <div class="fields two"><label class="field">Usuario<input type="text" name="usuario" required value="${esc(a.email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, ''))}"></label><label class="field">Nombre<input type="text" name="nombre" value="${esc(a.nombre || '')}"></label></div>
        <label class="field">Tipo de cuenta<select name="rol" data-act-change="accesoRol"><option value="empleado">Trabajador</option><option value="admin">Encargado</option></select></label>
        <label class="field acceso-emp">Persona del equipo<select name="empleado_id">${empsLibres.map((e) => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</select></label>
        <div class="row end"><button type="button" class="btn" data-act="rechazarAcceso" data-id="${a.id}">Rechazar</button><button class="btn primary" type="submit">Dar acceso</button></div>
      </form>`).join('')}</div>` : ''}
      <form id="user-form" class="stack" style="gap:10px;margin-top:14px">
        <div class="small muted" style="font-weight:600">Crear cuenta</div>
        <div class="fields two"><label class="field">Usuario<input type="text" name="usuario" required autocomplete="off"></label><label class="field">Nombre<input type="text" name="nombre"></label></div>
        <label class="field">Tipo de cuenta<select name="rol" data-act-change="userRol"><option value="empleado">Trabajador (ve sus horas y hace solicitudes)</option><option value="admin">Encargado (control total)</option></select></label>
        <label class="field" id="user-emp">Persona del equipo<select name="empleado_id">${state.draft.empleados.filter((e) => e.activo).map((e) => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</select></label>
        <label class="field">Contraseña<span class="hint">Para un trabajador es temporal: la cambiará al entrar.</span><input type="password" name="password" minlength="8" required autocomplete="new-password"></label>
        <button class="btn" type="submit">Guardar cuenta</button>
      </form></div>
    <div class="card"><h2>Copia de la configuración</h2>
      <p class="small muted" style="margin-top:0">Descarga toda la configuración (equipo, turnos, demanda, ausencias…) o carga una guardada.</p>
      <div class="row"><button class="btn" data-act="exportConfig">Descargar</button><label class="btn">Cargar archivo…<input type="file" accept="application/json,.json" id="import-file" hidden></label></div>
      <h3 style="margin-top:20px">Versiones guardadas</h3>
      <table class="list"><tbody>${history.slice(0, 12).map((v) => `<tr><td><b>v${v.id}</b> · ${fmtStamp(v.created_at)}<div class="small muted">${esc(v.autor || '')}${v.nota ? ` · ${esc(v.nota)}` : ''}</div></td><td style="width:110px">${v.id === state.version ? '<span class="badge neutral">actual</span>' : `<button class="btn small" data-act="restore" data-v="${v.id}">Restaurar</button>`}</td></tr>`).join('')}</tbody></table>
    </div>
  </div>`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
  reloadConfig: async () => {
    if (!(await confirmLeave())) return;
    await loadConfig(); state.ajustes = null; renderView();
  },
  exportConfig: () => {
    const blob = new Blob([JSON.stringify(state.config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `lopita_config_v${state.version}.json`; a.click();
  },
  restore: async (el) => {
    if (!(await confirmLeave()) || !(await confirmar({ titulo: `¿Volver a la versión ${el.dataset.v}?`, texto: 'Se guardará como una versión nueva.', verbo: `Restaurar versión ${el.dataset.v}` }))) return;
    try {
      const r = await api('POST', `/api/config/restaurar/${el.dataset.v}`);
      state.config = r.config; state.version = r.version; state.draft = clone(r.config); state.dirty = false;
      state.ajustes = null; toast('Versión restaurada'); renderView();
    } catch (e) { toast(e.message, true); }
  },
});
