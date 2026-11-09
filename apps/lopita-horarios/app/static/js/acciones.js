import { $, DAYS, clone, todayIso } from './nucleo/util.js';
import { api, closeOverlay, deshacer, saveConfig, state, toast } from './nucleo/estado.js';
import { markDirty } from './nucleo/enlace.js';
import { dictar, esRol, funcById, puestosDe, render, renderView } from './nucleo/pintado.js';
import { personaHref } from './pantallas/persona.js';
import { diaDescartable } from './pantallas/dia.js';
import { PINCHOS } from './pantallas/equipo.js';
import { corrDetail } from './pantallas/informes.js';
import { actions } from './nucleo/registro.js';
import { empujarUrl, urlDetalle } from './nucleo/rutas.js';
import './pantallas/acceso.js';
import './pantallas/ajustes.js';
import './pantallas/alertas.js';
import './pantallas/calendario.js';
import './pantallas/comentarios.js';
import './pantallas/cuadrante.js';
import './pantallas/cuenta.js';
import './pantallas/demanda.js';
import './pantallas/dia.js';
import './pantallas/equipo.js';
import './pantallas/funciones.js';
import './pantallas/historial.js';
import './pantallas/horarios.js';
import './pantallas/informes.js';
import './pantallas/novedades.js';
import './pantallas/portal.js';
import './pantallas/publicar.js';
import './pantallas/solicitudes.js';
import './pantallas/turnos.js';
import './pantallas/web.js';

export { actions };
// ------------------------------------------------------------------ acciones
Object.assign(actions, {
  logout: async () => { await api('POST', '/api/logout'); state.me = null; state.config = state.draft = null; state.dirty = false; state.mi = {}; state.miH = {}; state.inf = {}; state.sol = {}; state.web = {}; state.ajustes = null; state.calT = {}; state.current = null; try { state.acceso = await api('GET', '/api/acceso'); } catch { state.acceso = {}; } render(); },
  save: () => saveConfig(),
  discard: () => {
    const antes = state.draft;
    state.draft = clone(state.config); state.dirty = false; state.saveError = null; renderView();
    deshacer('Cambios descartados', () => { state.draft = antes; markDirty(); renderView(); });
  },
  goGuia: () => { location.hash = '#/guia'; },
  closeOverlay: () => closeOverlay(),
  dictar: (el) => dictar(el),
  goTo: (el) => { closeOverlay(); location.hash = `#/${el.dataset.to}`; },
  addRequest: () => {
    const e = state.draft.empleados.find((x) => x.activo);
    if (!e) { toast('Primero añade a alguien al equipo', true); return; }
    state.draft.excepciones_asignacion.push({ empleado_id: e.id, fecha: todayIso(), tipo: 'libre', turno_id: null }); markDirty(); renderView();
  },
});

// cambios de <select> que no son un simple data-bind
export const changeActions = {
  toggleAlertCode: (el) => actions.toggleAlertCode(el),
  comodin: (el) => {
    const e = state.draft.empleados[Number(el.dataset.i)];
    e.comodin = el.checked;
    if (!e.comodin) {
      // El mínimo y el máximo solo valen para los comodines; sin contrato no se puede guardar a alguien normal.
      e.horas_min_semana = null; e.horas_max_semana = null;
      if (!(e.horas_semanales > 0)) e.horas_semanales = 30;
    }
    markDirty(); renderView();
  },
  // Función propia marcada o desmarcada en la ficha de la persona (igual que «Puede abrir»).
  funcCheck: (el) => {
    const c = state.draft;
    if (el.dataset.f === PINCHOS.id && !(c.funciones || []).some((f) => f.id === PINCHOS.id)) c.funciones = [...(c.funciones || []), { ...PINCHOS, reglas: [] }];
    const e = c.empleados[Number(el.dataset.i)];
    const fs = (e.funciones || []).filter((x) => x !== el.dataset.f);
    e.funciones = el.checked ? [...fs, el.dataset.f] : fs;
    markDirty();
    if (esRol(funcById(c, el.dataset.f))) renderView(); // para el selector «Normalmente»
  },
  toggleConfirm: (el) => { const b = $('#confirm-publish'); if (b) b.disabled = !el.checked; },
  specialMode: (el) => {
    const o = state.draft.excepciones_fecha[Number(el.dataset.i)];
    if (el.value === 'cerrado') Object.assign(o, { cerrado: true, franjas: null, tipo_dia: null });
    else if (el.value === 'propias') Object.assign(o, { cerrado: null, tipo_dia: null, franjas: [{ inicio: '08:00', fin: '14:00', personas: 2 }] });
    else Object.assign(o, { cerrado: null, franjas: null, tipo_dia: state.draft.tipos_dia[0]?.nombre || null });
    markDirty(); renderView();
  },
  requestType: (el) => {
    const o = state.draft.excepciones_asignacion[Number(el.dataset.i)];
    o.tipo = el.value; o.turno_id = el.value === 'turno' ? (o.turno_id || state.draft.turnos[0]?.id || null) : null;
    markDirty(); renderView();
  },
  togglePast: (el) => { state.showPast = el.checked; renderView(); },
  puestoPrincipal: (el) => {
    const e = state.draft.empleados[Number(el.dataset.i)];
    e.puestos = [el.value, ...puestosDe(e).filter((p) => p !== el.value)];
    markDirty(); renderView();
  },
  // Rol que hace normalmente: va el primero de sus funciones (el motor lo prefiere cuando da igual).
  rolPrincipal: (el) => {
    const e = state.draft.empleados[Number(el.dataset.i)];
    e.funciones = [el.value, ...(e.funciones || []).filter((x) => x !== el.value)];
    markDirty(); renderView();
  },
  funcionClase: (el) => {
    const f = state.draft.funciones[Number(el.dataset.i)];
    f.puesto = el.value || null;
    // En una tarea de apoyo no hay máximo, y el mínimo es de al menos una persona.
    if (!f.puesto) f.reglas = f.reglas.map((r) => ({ ...r, maximo: null, personas: Math.max(1, r.personas || 0) }));
    markDirty(); renderView();
  },
  dayPick: async (el) => {
    if (!el.value) return;
    if (!(await diaDescartable())) { el.value = state.dia.fecha; return; }
    state.dia = null; state.diaFecha = el.value;
    empujarUrl(urlDetalle(state.current.id, 'dia', state.diaFecha)); renderView();
  },
  corrClase: (el) => { $('#corr-detail').innerHTML = corrDetail(el.value, state.mi.perfil.turnos); },
  infBorradores: (el) => { state.inf.borradores = el.checked; state.inf.data = undefined; renderView(); },
  fbEstado: async (el) => {
    const id = Number(el.dataset.id);
    try {
      const c = await api('PATCH', `/api/comentarios/${id}`, { estado: el.value });
      Object.assign(state.fb.data.find((x) => x.id === id), c);
      state.me.comentarios = state.fb.data.filter((x) => x.estado === 'nuevo').length;
      renderView(); toast('Estado cambiado');
    } catch (e) { toast(e.message, true); }
  },
  calPersona: (el) => { state.cal.persona = el.value; renderView(); },
  calIrPersona: (el) => { location.hash = personaHref(el.value); },
  periodo: (el) => { const h = state[el.dataset.h]; h[el.dataset.k] = el.value; if (h.hasta && h.desde && h.hasta >= h.desde) { h.data = undefined; } renderView(); },
  userRol: (el) => { $('#user-emp').hidden = el.value !== 'empleado'; },
  accesoRol: (el) => { el.closest('form').querySelector('.acceso-emp').hidden = el.value !== 'empleado'; },
};

export function renameRefs(kind, i, value) {
  const c = state.draft;
  value = value.trim();
  if (!value) { toast('El nombre no puede quedar vacío', true); renderView(); return; }
  if (kind === 'shift') {
    const old = c.turnos[i].id;
    if (value === old) return;
    if (c.turnos.some((s, k) => k !== i && s.id === value)) { toast('Ya hay un turno con ese código', true); renderView(); return; }
    c.turnos[i].id = value;
    c.preferencias.forEach((p) => { p.turnos = p.turnos.map((t) => (t === old ? value : t)); });
    c.excepciones_asignacion.forEach((o) => { if (o.turno_id === old) o.turno_id = value; });
  } else {
    const old = c.tipos_dia[i].nombre;
    if (value === old) return;
    if (c.tipos_dia.some((t, k) => k !== i && t.nombre === value)) { toast('Ya hay un tipo de día con ese nombre', true); renderView(); return; }
    c.tipos_dia[i].nombre = value;
    for (const d of DAYS) if (c.tipo_dia_por_semana[d] === old) c.tipo_dia_por_semana[d] = value;
    if (c.tipo_dia_festivo === old) c.tipo_dia_festivo = value;
    c.excepciones_fecha.forEach((o) => { if (o.tipo_dia === old) o.tipo_dia = value; });
  }
  markDirty(); renderView();
}







