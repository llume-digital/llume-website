// Envío de formularios: un manejador por formulario (por su id). Si el manejador falla, el error sale dentro del
// propio formulario, junto a los botones y avisado a los lectores de pantalla, no en un aviso que desaparece.
import { $, addDays, todayIso } from './nucleo/util.js';
import { api, closeOverlay, loadConfig, saveConfig, showNotifications, state, toast } from './nucleo/estado.js';
import { markDirty } from './nucleo/enlace.js';
import { isWorker, pararDictado, renderView } from './nucleo/pintado.js';
import { boot } from '../app.js';
import { refreshList } from './pantallas/horarios.js';
import { BAJA_SIN_FIN } from './pantallas/equipo.js';
import { signed } from './pantallas/portal.js';
import { pantallaActual } from './pantallas/comentarios.js';
import { cuentaDialog } from './pantallas/cuenta.js';

const campoUsuario = (data) => ({ usuario: data.usuario, nombre: data.nombre || null, rol: data.rol, empleado_id: data.rol === 'empleado' ? data.empleado_id : null });

const formularios = {
  'login-form': async (f, data) => {
    state.me = await api('POST', '/api/login', data);
    await boot();
  },
  'baja-form': async (f, data) => {
    const hasta = data.hasta || addDays(data.desde, BAJA_SIN_FIN);
    if (hasta < data.desde) throw new Error('La baja no puede acabar antes de empezar');
    state.draft.ausencias.push({ empleado_id: f.dataset.emp, desde: data.desde, hasta, motivo: 'baja' });
    markDirty(); closeOverlay();
    await saveConfig();
  },
  'alta-form': async (f, data) => {
    const c = state.draft, emp = f.dataset.emp;
    const b = c.ausencias.find((a) => a.empleado_id === emp && a.motivo === 'baja' && a.hasta >= todayIso());
    const fin = addDays(data.vuelve, -1);
    if (b) { if (fin < b.desde) c.ausencias.splice(c.ausencias.indexOf(b), 1); else b.hasta = fin; }
    markDirty(); closeOverlay();
    await saveConfig();
  },
  'user-form': async (f, data) => {
    state.ajustes.users = await api('POST', '/api/usuarios', { ...campoUsuario(data), password: data.password });
    toast('Cuenta guardada'); renderView();
  },
  'fb-form': async (f, data) => {
    await api('POST', '/api/comentarios', { tipo: data.tipo || 'sugerencia', texto: data.texto, pantalla: pantallaActual() });
    closeOverlay(); toast('¡Gracias! Tu comentario ha quedado guardado');
    if (state.fb) state.fb.data = undefined;
    if (!isWorker()) { state.me.comentarios = (state.me.comentarios || 0) + 1; renderView(); }
  },
  'cuenta-form': async (f, data) => {
    state.me = { ...state.me, ...(await api('PUT', '/api/mi/cuenta', { email: data.email || null, nombre: data.nombre || null })) };
    toast('Cuenta guardada'); cuentaDialog();
    const nb = $('.userbox span'); if (nb) nb.textContent = state.me.nombre;
  },
  'reset-form': async (f, data) => {
    state.ajustes.users = await api('POST', `/api/usuarios/${encodeURIComponent(f.dataset.u)}/clave`, { password: data.password });
    closeOverlay(); toast(`Contraseña temporal guardada. Pásasela a ${f.dataset.u}.`); renderView();
  },
  'email-form': async (f, data) => {
    state.ajustes.users = await api('PUT', `/api/usuarios/${encodeURIComponent(f.dataset.u)}/email`, { email: data.email || null });
    closeOverlay(); toast('Correo guardado'); renderView();
  },
  'acceso-form': async (f, data) => {
    const r = await api('POST', `/api/accesos/${f.dataset.id}/aprobar`, campoUsuario(data));
    state.ajustes.accesos = r.accesos; state.ajustes.users = r.usuarios; state.me.accesos = r.accesos.length;
    toast(`Acceso dado a ${data.usuario}: ya puede entrar con Google`); renderView();
  },
  'google-form': async (f, data) => {
    state.ajustes.google = await api('PUT', '/api/ajustes/google', { client_id: data.client_id || null });
    state.me.google_client_id = state.ajustes.google.client_id;
    toast(state.ajustes.google.client_id ? 'Entrar con Google activado' : 'Entrar con Google desactivado'); renderView();
  },
  'pw-form': async (f, data) => {
    if (data.nueva !== data.repite) throw new Error('Las contraseñas nuevas no coinciden');
    const forced = state.me.cambiar_clave;
    state.me = { ...state.me, ...(await api('POST', '/api/mi/clave', { actual: data.actual || '', nueva: data.nueva })) };
    closeOverlay(); toast('Contraseña cambiada');
    if (forced) await boot();
  },
  'abs-form': async (f, data) => {
    state.mi.perfil = await api('POST', '/api/mi/ausencias', { desde: data.desde, hasta: data.hasta, motivo: data.motivo, nota: data.nota || null });
    toast('Solicitud enviada'); renderView();
  },
  'corr-form': async (f, data) => {
    const body = { fecha: data.fecha, clase: data.clase, motivo: data.motivo };
    if (data.clase === 'turno') body.turno_id = data.turno_id;
    if (data.clase === 'horas') { body.inicio = data.inicio; body.fin = data.fin; }
    if (data.clase === 'extra') { if (data.turno_id) body.turno_id = data.turno_id; else { body.inicio = data.inicio; body.fin = data.fin; } }
    state.mi.perfil = await api('POST', '/api/mi/correcciones', body);
    state.miH.data = undefined; closeOverlay(); toast('Solicitud enviada'); renderView();
  },
  'resolve-form': async (f, data) => {
    const { id, accion, tipo } = f.dataset;
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
  },
};

// Qué campo causa cada error conocido, por el texto del mensaje: así el aviso sale junto a ese campo.
const CAMPO_DEL_ERROR = {
  'pw-form': [[/no coinciden/, 'repite'], [/actual/, 'actual'], [/8 caracteres|distinta/, 'nueva']],
  'user-form': [[/contraseña/, 'password'], [/usuario/i, 'usuario']],
  'baja-form': [[/baja no puede/, 'hasta']],
  'reset-form': [[/contraseña/, 'password']],
  'email-form': [[/correo|email/i, 'email']],
};
const clave = (f) => f.dataset.form || f.id; // un formulario que se repite lleva ids distintos y la misma clave
const campoDe = (f, mensaje) => {
  const par = (CAMPO_DEL_ERROR[clave(f)] || []).find(([re]) => re.test(mensaje));
  return par ? f.elements[par[1]] : null;
};

// Con campo, el error sale justo debajo de él (y se anuncia); sin campo, en el hueco que el formulario ya tenga
// (id acabado en -err) o en uno que se crea sobre los botones.
function mostrarError(f, mensaje) {
  const campo = campoDe(f, mensaje);
  if (campo && campo.closest('label')) {
    const aviso = document.createElement('span');
    aviso.className = 'field-error';
    aviso.id = `${f.id}-${campo.name}-error`;
    aviso.setAttribute('role', 'alert');
    aviso.textContent = mensaje;
    campo.closest('label').append(aviso);
    campo.setAttribute('aria-invalid', 'true');
    campo.setAttribute('aria-describedby', aviso.id);
    campo.focus();
    return;
  }
  let hueco = f.querySelector('[id$="-err"], .form-error');
  if (!hueco) {
    hueco = document.createElement('div');
    hueco.className = 'notice crit small form-error';
    hueco.setAttribute('role', 'alert');
    const fila = f.querySelector('.row.end, .actions');
    if (fila) fila.before(hueco); else f.append(hueco);
  }
  hueco.textContent = mensaje;
}
function limpiarError(f) {
  f.querySelectorAll('.field-error').forEach((x) => x.remove());
  f.querySelectorAll('[aria-invalid]').forEach((x) => { x.removeAttribute('aria-invalid'); x.removeAttribute('aria-describedby'); });
  const hueco = f.querySelector('[id$="-err"], .form-error');
  if (!hueco) return;
  if (hueco.classList.contains('form-error')) hueco.remove(); else hueco.textContent = '';
}

// Un formulario se envía una sola vez a la vez: mientras responde el servidor, sus botones quedan desactivados.
export async function enviarFormulario(e) {
  e.preventDefault();
  pararDictado();
  const f = e.target;
  const manejador = formularios[clave(f)];
  if (!manejador || f.dataset.enviando) return;
  f.dataset.enviando = '1';
  const botones = [...f.querySelectorAll('button[type=submit]')];
  botones.forEach((b) => { b.disabled = true; });
  limpiarError(f);
  try { await manejador(f, Object.fromEntries(new FormData(f))); } catch (err) {
    if (f.isConnected) mostrarError(f, err.message); else toast(err.message, true);
  } finally {
    delete f.dataset.enviando;
    botones.forEach((b) => { if (b.isConnected) b.disabled = false; });
  }
}
