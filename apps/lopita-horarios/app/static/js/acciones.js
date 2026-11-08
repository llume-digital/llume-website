import { $, DAYS, addDays, clone, esc, fmtH, fmtLong, fmtMin, fmtRange, fmtShort, toMin, todayIso, uid } from './nucleo/util.js';
import { api, closeOverlay, loadConfig, overlay, saveConfig, state, toast, withBusy } from './nucleo/estado.js';
import { getPath, markDirty, setPath } from './nucleo/enlace.js';
import { dictar, empById, esRol, funcById, isWorker, mic, puestosDe, render, renderView, shiftById } from './nucleo/pintado.js';
import { genPeriod, refreshList } from './pantallas/horarios.js';
import { fixDialog } from './pantallas/alertas.js';
import { calRango } from './pantallas/calendario.js';
import { personaHref } from './pantallas/persona.js';
import { ZOOMS, ajustarTramo, closeMenu, dayEvalDialog, diaDescartable, diaSoloLectura, ganttZoom, openBarMenu, openCellMenu } from './pantallas/dia.js';
import { PINCHOS, bajaDe, bajaSinFin } from './pantallas/equipo.js';
import { ROLES_CAMARERO } from './pantallas/funciones.js';
import { CLASES, monthBounds, pad2, shiftText } from './pantallas/portal.js';
import { feedbackDialog } from './pantallas/comentarios.js';
import { corrDetail, openCorrection } from './pantallas/informes.js';
import { claveTemporal, cuentaDialog, pwForm } from './pantallas/cuenta.js';
// ------------------------------------------------------------------ acciones
const confirmLeave = () => !state.dirty || window.confirm('Tienes cambios sin guardar. ¿Descartarlos?');

export const actions = {
  logout: async () => { await api('POST', '/api/logout'); state.me = null; state.config = state.draft = null; state.dirty = false; state.mi = {}; state.miH = {}; state.inf = {}; state.sol = {}; state.web = {}; state.ajustes = null; state.calT = {}; state.current = null; try { state.acceso = await api('GET', '/api/acceso'); } catch { state.acceso = {}; } render(); },
  save: () => saveConfig(),
  discard: () => { state.draft = clone(state.config); state.dirty = false; state.saveError = null; renderView(); },

  genMode: (el) => { state.gen.modo = el.dataset.mode; renderView(); },
  open: (el) => { location.hash = `#/horarios/${el.dataset.id}`; },
  generate: async () => {
    if (state.dirty && !(await saveConfig())) { toast('Corrige la configuración antes de generar', true); return; }
    const [desde, hasta] = genPeriod();
    try {
      const d = await withBusy('Calculando el mejor horario…', () => api('POST', '/api/horarios/generar', { desde, hasta }));
      state.current = d; await refreshList();
      location.hash = `#/horarios/${d.id}`;
      generationToast(d.generacion);
    } catch (e) { toast(e.message, true); }
  },
  regenerate: async (el) => {
    const n = state.current.horario.bloqueos.length;
    const desde = el && el.dataset ? el.dataset.desde : null;
    const alcance = desde ? `a partir del ${fmtLong(desde)} (los días anteriores no cambian)` : 'entero';
    if (!window.confirm(`Se recalculará el horario ${alcance} con la configuración actual${n ? `, respetando tus ${n} cambios manuales` : ''}. ¿Seguir?`)) return;
    if (state.dirty && !(await saveConfig())) return;
    try {
      state.current = await withBusy('Recalculando…', () => api('POST', `/api/horarios/${state.current.id}/regenerar`, desde ? { desde } : {}));
      refreshList(); renderView(); generationToast(state.current.generacion);
    } catch (e) { toast(e.message, true); }
  },
  solve: async () => {
    if (state.dirty && !(await saveConfig())) return;
    const sid = state.current.id;
    try {
      state.fix = { sid, p: await withBusy('Buscando cómo arreglar las alertas…', () => api('POST', `/api/horarios/${sid}/solucionar`, {})) };
      overlay(fixDialog(state.fix.p));
    } catch (e) { toast(e.message, true); }
  },
  applyFix: async () => {
    const { sid, p } = state.fix || {};
    if (!p) return;
    try {
      state.current = await withBusy('Aplicando cambios…', () => api('POST', `/api/horarios/${sid}/solucionar/aplicar`, { cambios: p.cambios }));
      state.fix = null;
      toast(`${p.cambios.length === 1 ? 'Cambio aplicado' : `${p.cambios.length} cambios aplicados`}`);
      refreshList(); renderView();
    } catch (e) { toast(e.message, true); }
  },
  alFiltro: (el) => { state.alf[el.dataset.kind] = el.dataset.k || null; renderView(); },
  ackAlert: async (el) => {
    const nota = window.prompt('Nota opcional (por qué lo das por revisado):', '');
    if (nota === null) return;
    const d = await api('POST', `/api/horarios/${el.dataset.sid}/alertas/reconocer`, { clave: el.dataset.clave, nota: nota.trim() || null });
    if (state.current && state.current.id === d.id) state.current = d;
    refreshList(); renderView();
  },
  reopenAlert: async (el) => {
    const d = await api('DELETE', `/api/horarios/${el.dataset.sid}/alertas/reconocer?clave=${encodeURIComponent(el.dataset.clave)}`);
    if (state.current && state.current.id === d.id) state.current = d;
    refreshList(); renderView();
  },
  toggleAlertCode: (el) => {
    const a = state.draft.alertas, c = el.dataset.code;
    a.desactivadas = a.desactivadas.includes(c) ? a.desactivadas.filter((x) => x !== c) : [...a.desactivadas, c];
    markDirty(); renderView();
  },
  createCal: async () => { state.mi.cal = await api('POST', '/api/mi/calendario', {}); renderView(); toast('Enlace creado'); },
  renewCal: async () => {
    if (!window.confirm('El enlace actual dejará de funcionar y tendrás que volver a suscribirte. ¿Cambiarlo?')) return;
    state.mi.cal = await api('POST', '/api/mi/calendario', { renovar: true }); renderView(); toast('Enlace cambiado');
  },
  createTeamCal: async (el) => { await api('POST', `/api/calendarios/${encodeURIComponent(el.dataset.id)}`, {}); state.calT.data = undefined; renderView(); toast('Enlace creado'); },
  copyCal: async (el) => {
    try { await navigator.clipboard.writeText(el.dataset.url); toast('Enlace copiado'); } catch { window.prompt('Copia el enlace:', el.dataset.url); }
  },
  readNotices: async () => {
    state.mi.perfil = await api('POST', '/api/mi/avisos/leer', {});
    state.me.avisos = 0; renderView();
  },
  clearLocks: async () => {
    if (!window.confirm('Se quitarán los bloqueos; los turnos actuales se mantienen hasta que regeneres. ¿Seguir?')) return;
    state.current = await api('DELETE', `/api/horarios/${state.current.id}/bloqueos`); renderView();
  },
  cell: (el) => openCellMenu(el),
  goGuia: () => { location.hash = '#/guia'; },
  feedback: async () => {
    overlay(feedbackDialog([]));
    try { const mios = await api('GET', '/api/comentarios'); if ($('#fb-form')) { const t = $('#fb-form textarea').value; overlay(feedbackDialog(isWorker() ? mios : mios.filter((c) => c.autor === state.me.username))); $('#fb-form textarea').value = t; } } catch { /* sin lista no pasa nada */ }
    const ta = $('#fb-form textarea'); if (ta) ta.focus();
  },
  fbFiltro: (el) => { state.fb.filtro = el.dataset.f; renderView(); },
  fbResponder: async (el) => {
    const id = Number(el.dataset.id);
    try {
      const c = await api('PATCH', `/api/comentarios/${id}`, { respuesta: $(`#fb-resp-${id}`).value });
      Object.assign(state.fb.data.find((x) => x.id === id), c); toast('Respuesta guardada'); renderView();
    } catch (e) { toast(e.message, true); }
  },
  calModo: (el) => {
    if (el.dataset.v === 'dia') { actions.calDia({ dataset: { date: state.cal.ref || todayIso() } }); return; }
    state.cal.modo = el.dataset.v; renderView();
  },
  calMover: (el) => {
    const c = state.cal; const dir = Number(el.dataset.dir);
    if (c.modo === 'mes') {
      let y = Number(c.ref.slice(0, 4)), m = Number(c.ref.slice(5, 7)) + dir;
      if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; }
      c.ref = `${y}-${pad2(m)}-01`;
    } else c.ref = addDays(c.ref, 7 * dir);
    renderView();
  },
  calHoy: () => { state.cal.ref = todayIso(); renderView(); },
  calAgrupar: (el) => { state.cal.agrupar = el.dataset.v; renderView(); },
  calVolverPersonas: () => { state.cal.agrupar = 'persona'; location.hash = '#/calendario'; },
  calDia: (el) => {
    let f = el.dataset.date;
    const [desde, hasta] = calRango();
    const data = state.cal.data[`${desde}|${hasta}`];
    let info = data && data.dias && data.dias[f];
    if (!info) {
      const pub = (x) => (x.estado === 'publicado' ? 0 : 1);
      const s = state.schedules.filter((x) => x.desde <= f && f <= x.hasta).sort((a, b) => pub(a) - pub(b))[0];
      if (s) info = { horario_id: s.id };
      else {
        // Sin horario ese día: se abre el primer día posterior que tenga uno (o, si no hay, el último anterior).
        const despues = state.schedules.filter((x) => x.desde > f).sort((a, b) => a.desde.localeCompare(b.desde) || pub(a) - pub(b))[0];
        const antes = state.schedules.filter((x) => x.hasta < f).sort((a, b) => b.hasta.localeCompare(a.hasta) || pub(a) - pub(b))[0];
        const alt = despues || antes;
        if (alt) {
          const nf = despues ? alt.desde : alt.hasta;
          toast(`No hay horario el ${fmtLong(f)}; te enseño el ${fmtLong(nf)}, el ${despues ? 'siguiente' : 'último'} día que tiene.`);
          f = nf; info = { horario_id: alt.id };
        }
      }
    }
    if (!info) { toast('Aún no hay ningún horario. Créalo en Horarios.', true); return; }
    state.cal.ref = f;
    state.vista = 'dia'; state.diaFecha = f; state.dia = null;
    if (!state.current || state.current.id !== info.horario_id) state.current = null;
    location.hash = `#/horarios/${info.horario_id}`;
    renderView();
  },
  setVista: (el) => {
    if (el.dataset.v === state.vista) return;
    if (state.vista === 'dia' && !diaDescartable()) return;
    if (state.vista === 'dia') state.dia = null;
    state.vista = el.dataset.v; renderView();
  },
  openDay: (el) => { state.diaFecha = el.dataset.date; state.vista = 'dia'; state.dia = null; renderView(); window.scrollTo(0, 0); },
  dayGo: (el) => {
    if (!diaDescartable()) return;
    state.dia = null; state.diaFecha = el.dataset.date;
    if (el.dataset.sid) { state.current = null; location.hash = `#/horarios/${el.dataset.sid}`; } else renderView();
  },
  dayDiscard: () => { if (!window.confirm('¿Descartar los cambios de este día?')) return; state.dia = null; renderView(); },
  barTimes: (el) => {
    const t = state.dia.tramos.find((x) => x.empleado_id === el.dataset.emp);
    const ini = $('#bar-ini').value, fin = $('#bar-fin').value === '23:59' ? '24:00' : $('#bar-fin').value;
    if (!ini || !fin || toMin(fin) <= toMin(ini)) { toast('La salida tiene que ser después de la entrada', true); return; }
    t.inicio = ini; t.fin = fin; closeMenu(); renderView();
  },
  barAdj: (el) => {
    const emp = el.dataset.emp;
    const t = state.dia.tramos.find((x) => x.empleado_id === emp);
    if (!ajustarTramo(t, el.dataset.k, Number(el.dataset.dm))) { toast('Así no cabe en el día', true); return; }
    const desplazado = el.closest('.popover').scrollTop;
    closeMenu(); renderView();
    const bar = document.querySelector(`.g-bar[data-emp="${CSS.escape(emp)}"]`);
    const m = bar && openBarMenu(emp, bar);  // sigue abierto, en el mismo sitio, para encadenar ajustes
    if (m) m.scrollTop = desplazado;
  },
  cellAdj: (el) => {
    closeMenu();
    const cur = state.current;
    if (diaSoloLectura(cur)) { toast('Este horario tiene un arreglo pendiente: haz los cambios en él', true); return; }
    if (state.vista === 'dia' && !diaDescartable()) return;
    state.vista = 'dia'; state.diaFecha = el.dataset.date; state.dia = null;
    renderView();
    const t = state.dia.tramos.find((x) => x.empleado_id === el.dataset.emp);
    if (!t || !ajustarTramo(t, el.dataset.k, Number(el.dataset.dm))) { toast('Así no cabe en el día', true); renderView(); return; }
    renderView(); window.scrollTo(0, 0);
    toast('Ajuste preparado en la vista del día: revisa y pulsa «Confirmar cambios»');
  },
  barPuesto: (el) => {
    const t = state.dia.tramos.find((x) => x.empleado_id === el.dataset.emp);
    if (t.puesto !== el.dataset.p) Object.assign(t, { puesto: el.dataset.p, funcion: null }); // la app le da su rol de ese puesto
    closeMenu(); renderView();
  },
  barRol: (el) => { state.dia.tramos.find((x) => x.empleado_id === el.dataset.emp).funcion = el.dataset.funcion || ''; closeMenu(); renderView(); },
  barShift: (el) => {
    const t = state.dia.tramos.find((x) => x.empleado_id === el.dataset.emp);
    const sh = shiftById(state.config, el.dataset.shift);
    Object.assign(t, { inicio: sh.inicio, fin: sh.fin, turno_id: sh.id }); closeMenu(); renderView();
  },
  barRemove: (el) => { state.dia.tramos = state.dia.tramos.filter((x) => x.empleado_id !== el.dataset.emp); closeMenu(); renderView(); },
  dayConfirm: async () => {
    const d = state.dia;
    if (state.dirty && !(await saveConfig())) return;
    try {
      const ev = await withBusy('Evaluando las alertas…', () => api('POST', `/api/horarios/${d.sid}/dia/evaluar`, { fecha: d.fecha, tramos: d.tramos, base: d.base }));
      state.diaEval = ev;
      overlay(dayEvalDialog(ev));
    } catch (e) { toast(e.message, true); }
  },
  dayApply: async (el) => {
    const d = state.dia;
    const publicar = Boolean(el.dataset.publicar);
    try {
      const r = await withBusy('Guardando…', () => api('POST', `/api/horarios/${d.sid}/dia/aplicar`, { fecha: d.fecha, tramos: d.tramos, base: d.base }));
      state.dia = null; state.diaEval = null; state.current = r; refreshList();
      if (r.guardado_en !== d.sid) location.hash = `#/horarios/${r.guardado_en}`;
      if (publicar) { await actions.publish(); return; }
      renderView();
      toast(r.reemplaza && r.guardado_en !== d.sid ? 'Guardado como arreglo: el equipo lo verá cuando lo publiques' : 'Cambios guardados');
    } catch (e) { closeOverlay(); toast(e.message, true); }
  },
  setCell: async (el) => {
    closeMenu();
    try {
      const body = { empleado_id: el.dataset.emp, fecha: el.dataset.date, turno_id: el.dataset.shift || null, bloquear: true };
      if (el.dataset.puesto) Object.assign(body, { puesto: el.dataset.puesto, conservar_horas: true });
      if (el.dataset.funcion !== undefined) body.funcion = el.dataset.funcion; // '' = sin rol
      state.current = await api('PATCH', `/api/horarios/${state.current.id}/celda`, body);
      renderView();
      const errs = state.current.horario.incidencias.filter((i) => i.nivel === 'error' && i.empleado_id === el.dataset.emp && i.fecha === el.dataset.date);
      if (errs.length) toast(errs[0].mensaje, true);
    } catch (e) { toast(e.message, true); }
  },
  unlockCell: async (el) => {
    closeMenu();
    const a = state.current.horario.asignaciones.find((x) => x.empleado_id === el.dataset.emp && x.fecha === el.dataset.date);
    state.current = await api('PATCH', `/api/horarios/${state.current.id}/celda`, { empleado_id: el.dataset.emp, fecha: el.dataset.date, turno_id: a ? a.turno_id : null, puesto: a ? a.puesto : null, funcion: a ? a.funcion || '' : null, conservar_horas: true, bloquear: false });
    renderView();
  },
  publish: async (el) => {
    const confirmar = Boolean(el && el.dataset && el.dataset.confirm);
    try {
      const d = await withBusy('Publicando…', () => api('POST', `/api/horarios/${state.current.id}/publicar`, confirmar ? { confirmar_criticas: true } : {}));
      const reemplazo = d.reemplazado;
      state.current = d; refreshList();
      if (reemplazo) { location.hash = `#/horarios/${reemplazo}`; renderView(); toast('Arreglo publicado. Avisa por Slack a quien le cambia el turno.'); }
      else { renderView(); showSlack(d.slack, 'Horario publicado'); }
    } catch (e) {
      if (e.data && e.data.codigo === 'criticas') overlay(confirmCriticalDialog(e.data));
      else toast(e.message, true);
    }
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
  notify: async () => {
    try {
      const d = await withBusy('Avisando al equipo…', () => api('POST', `/api/horarios/${state.current.id}/notificar`));
      state.current = d; refreshList(); renderView(); showSlack(d.slack, 'Cambios enviados');
    } catch (e) { toast(e.message, true); }
  },
  unpublish: async () => {
    if (!window.confirm('El horario dejará de verse en el enlace público hasta que lo vuelvas a publicar. ¿Seguir?')) return;
    state.current = await api('POST', `/api/horarios/${state.current.id}/despublicar`); refreshList(); renderView();
  },
  print: () => window.open(`/api/horarios/${state.current.id}/html`, '_blank'),
  pdf: async () => {
    try {
      const r = await fetch(`/api/horarios/${state.current.id}/pdf`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error((await r.json()).detail);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `horario_${state.current.desde}_${state.current.hasta}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch (e) { toast(e.message, true); }
  },
  copyLink: async () => {
    try { await navigator.clipboard.writeText(state.current.url_publica); toast('Enlace copiado'); } catch { window.prompt('Copia el enlace:', state.current.url_publica); }
  },
  deleteSchedule: async () => {
    if (!window.confirm('¿Eliminar este horario? No se puede deshacer.')) return;
    await api('DELETE', `/api/horarios/${state.current.id}`);
    state.current = null; await refreshList(); location.hash = '#/horarios';
  },
  closeOverlay: () => closeOverlay(),

  // ---- portal del trabajador
  miDay: (el) => {
    const p = state.mi.prefs[Number(el.dataset.i)]; const arr = p.dias || [];
    const set = new Set(arr); set.has(el.dataset.day) ? set.delete(el.dataset.day) : set.add(el.dataset.day);
    p.dias = DAYS.filter((d) => set.has(d)); if (!p.dias.length) p.dias = null;
    state.mi.prefsDirty = true; renderView();
  },
  miShift: (el) => {
    const p = state.mi.prefs[Number(el.dataset.i)];
    p.turnos = p.turnos.includes(el.dataset.shift) ? p.turnos.filter((t) => t !== el.dataset.shift) : [...p.turnos, el.dataset.shift];
    state.mi.prefsDirty = true; renderView();
  },
  miAddPref: () => {
    const t = state.mi.perfil.turnos[0]; if (!t) return;
    state.mi.prefs.push({ tipo: 'prefiere', turnos: [t.id], dias: null, peso: 3 }); state.mi.prefsDirty = true; renderView();
  },
  miDelPref: (el) => { state.mi.prefs.splice(Number(el.dataset.i), 1); state.mi.prefsDirty = true; renderView(); },
  miSavePrefs: async () => {
    const body = { preferencias: state.mi.prefs.map(({ tipo, turnos, dias, peso }) => ({ tipo, turnos, dias, peso })) };
    state.mi.perfil = await api('PUT', '/api/mi/preferencias', body);
    state.mi.prefs = clone(state.mi.perfil.preferencias); state.mi.prefsDirty = false;
    toast('Preferencias guardadas'); renderView();
  },
  newCorr: () => openCorrection({}),
  corrRow: (el) => openCorrection({ fecha: el.dataset.date, turno_id: el.dataset.shift || '', clase: el.dataset.shift ? 'horas' : 'extra' }),
  cancelReq: async (el) => {
    if (!window.confirm('¿Retirar esta solicitud?')) return;
    state.mi.perfil = await api('DELETE', `/api/mi/solicitudes/${el.dataset.id}`);
    state.miH.data = undefined; renderView();
  },
  periodoRango: (el) => { const h = state.inf; h.desde = el.dataset.desde; h.hasta = el.dataset.hasta; h.data = undefined; renderView(); },
  periodoRapido: (el) => {
    const h = state[el.dataset.h]; [h.desde, h.hasta] = monthBounds(Number(el.dataset.off)); h.data = undefined; renderView();
  },
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
  rechazarAcceso: async (el) => {
    try { const r = await api('POST', `/api/accesos/${el.dataset.id}/rechazar`); state.ajustes.accesos = r.accesos; state.me.accesos = r.accesos.length; toast('Registro rechazado'); renderView(); } catch (e) { toast(e.message, true); }
  },
  verAccesos: async (el) => {
    try { await api('POST', '/api/notificaciones/leer', { ids: [Number(el.dataset.id)] }); } catch { /* se verá otra vez, sin más */ }
    state.notifPending = false; closeOverlay(); state.ajustes = null; location.hash = '#/ajustes';
  },

  // ---- solicitudes e informes (encargados)
  solFiltro: (el) => { state.sol.filtro = el.dataset.f; renderView(); },
  webFiltro: (el) => { state.web.filtro = el.dataset.f; renderView(); },
  webEstado: async (el) => {
    const m = await api('POST', `/api/web/mensajes/${el.dataset.id}/estado`, { estado: el.dataset.estado });
    state.web.data = state.web.data.map((x) => (x.id === m.id ? m : x)); renderView();
  },
  webBorrar: async (el) => {
    if (!window.confirm('¿Borrar este mensaje y su archivo? No se puede deshacer.')) return;
    await api('DELETE', `/api/web/mensajes/${el.dataset.id}`);
    state.web.data = state.web.data.filter((x) => x.id !== Number(el.dataset.id)); renderView();
  },
  resolve: (el) => {
    if (state.dirty) { toast('Guarda o descarta antes los cambios de configuración sin guardar', true); return; }
    const ap = el.dataset.accion === 'aprobar';
    const nota = !ap ? 'La persona verá que se ha rechazado y tu respuesta.'
      : el.dataset.tipo === 'ausencia' ? 'La ausencia se añadirá a la configuración y el motor la respetará al generar o regenerar horarios.'
        : 'Se ajustarán las horas de ese día en su informe y el saldo que se arrastra al siguiente horario.';
    overlay(`<h2>${ap ? 'Aprobar' : 'Rechazar'} solicitud</h2>
      <form id="resolve-form" class="stack" style="gap:12px" data-id="${el.dataset.id}" data-accion="${el.dataset.accion}" data-tipo="${el.dataset.tipo}">
        <p class="small muted" style="margin:0">${nota}</p>
        <label class="field">Respuesta para la persona (opcional)<textarea name="respuesta" rows="3"></textarea></label>${mic("respuesta")}
        <div class="row end"><button type="button" class="btn" data-act="closeOverlay">Cancelar</button><button class="btn ${ap ? 'primary' : 'danger'}" type="submit">${ap ? 'Aprobar' : 'Rechazar'}</button></div>
      </form>`);
  },
  infDetalle: (el) => {
    const e = state.inf.data.empleados.find((x) => x.empleado_id === el.dataset.e); const turnos = state.config.turnos;
    overlay(`<h2>${esc(e.nombre)}</h2><p class="small muted" style="margin-top:-6px">${fmtRange(e.desde, e.hasta)} · previstas ${fmtH(e.previstas)} h · ajustadas ${fmtH(e.ajustadas)} h</p>
      ${e.dias.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Día</th><th>Turno</th><th class="num">Prev.</th><th class="num">Ajust.</th><th>Corrección</th></tr></thead><tbody>
      ${e.dias.map((x) => `<tr><td>${esc(fmtShort(x.fecha))}</td><td>${x.turno_id ? esc(shiftText(turnos, x.turno_id)) : '—'}</td><td class="num">${fmtH(x.previstas)}</td><td class="num"><b>${fmtH(x.ajustadas)}</b></td>
        <td class="small">${x.correccion ? `${CLASES[x.correccion.clase]}${x.correccion.motivo ? `<div class="muted">${esc(x.correccion.motivo)}</div>` : ''}` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Sin turnos en este periodo.</p>'}
      <div class="row end" style="margin-top:16px"><button class="btn primary" data-act="closeOverlay">Cerrar</button></div>`);
  },
  reloadConfig: async () => {
    if (state.dirty && !window.confirm('Se descartarán tus cambios sin guardar. ¿Seguir?')) return;
    await loadConfig(); state.ajustes = null; renderView();
  },

  toggleDay: (el) => {
    const path = el.dataset.path; let arr = getPath(state.draft, path) || [];
    arr = arr.includes(el.dataset.day) ? arr.filter((d) => d !== el.dataset.day) : DAYS.filter((d) => d === el.dataset.day || arr.includes(d));
    setPath(state.draft, path, path.startsWith('turnos') || path.startsWith('preferencias') || path.startsWith('tareas') || path.startsWith('funciones') ? (arr.length ? arr : null) : arr);
    markDirty(); renderView();
  },
  toggleShift: (el) => {
    const path = el.dataset.path; let arr = getPath(state.draft, path) || [];
    arr = arr.includes(el.dataset.shift) ? arr.filter((d) => d !== el.dataset.shift) : [...arr, el.dataset.shift];
    setPath(state.draft, path, arr); markDirty(); renderView();
  },
  togglePuesto: (el) => {
    const e = state.draft.empleados[Number(el.dataset.i)];
    const ps = puestosDe(e), p = el.dataset.p;
    if (ps.includes(p) && ps.length === 1) { toast('Cada persona tiene que tener al menos un puesto', true); return; }
    e.puestos = ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p];
    markDirty(); renderView();
  },
  dictar: (el) => dictar(el),
  zoom: (el) => {
    const d = Number(el.dataset.d), k = ZOOMS.indexOf(ganttZoom());
    state.zoom = d === 0 ? 1 : ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, k + d))];
    try { localStorage.setItem('lopita-zoom', String(state.zoom)); } catch { /* sin almacenamiento */ }
    const w = $('.gantt-wrap'), centro = w ? (w.scrollLeft + w.clientWidth / 2) / w.scrollWidth : 0;
    renderView();
    const w2 = $('.gantt-wrap'); if (w2) w2.scrollLeft = centro * w2.scrollWidth - w2.clientWidth / 2;
  },
  toggleFuncion: (el) => {
    const e = state.draft.empleados[Number(el.dataset.i)];
    const fs = e.funciones || [], f = el.dataset.f;
    e.funciones = fs.includes(f) ? fs.filter((x) => x !== f) : [...fs, f];
    markDirty(); renderView();
  },
  addFuncion: () => {
    const c = state.draft; c.funciones = c.funciones || [];
    const nombre = window.prompt('Nombre de la función (por ejemplo, Preparar pinchos):', '');
    if (!nombre || !nombre.trim()) return;
    const colores = ['#C9733B', '#4F7A5A', '#3E6A8A', '#8A4F7D', '#A88B2C', '#5E5E8F'];
    c.funciones.push({ id: uid(nombre, c.funciones.map((f) => f.id)), nombre: nombre.trim(), color: colores[c.funciones.length % colores.length], reglas: [] });
    markDirty(); renderView();
  },
  delFuncion: (el) => {
    const c = state.draft; const f = c.funciones[Number(el.dataset.i)];
    if (!window.confirm(`¿Eliminar la función «${f.nombre}»? Se quitará a todas las personas que la tienen.`)) return;
    c.funciones.splice(Number(el.dataset.i), 1);
    c.empleados.forEach((e) => { e.funciones = (e.funciones || []).filter((x) => x !== f.id); });
    markDirty(); renderView();
  },
  addReglaFuncion: (el) => {
    const f = state.draft.funciones[Number(el.dataset.i)];
    f.reglas.push(esRol(f) ? { inicio: '09:00', fin: '21:00', personas: 1, maximo: null, dias: null } : { inicio: '10:00', fin: '12:00', personas: 1, dias: null });
    markDirty(); renderView();
  },
  addRolesCamarero: () => {
    const c = state.draft; c.funciones = c.funciones || [];
    for (const [nombre, color] of ROLES_CAMARERO) {
      c.funciones.push({ id: uid(nombre, c.funciones.map((f) => f.id)), nombre, color, puesto: 'sala', reglas: [] });
    }
    markDirty(); renderView();
    toast('Roles creados: marca quién puede hacer cada uno y añade sus reglas, y guarda');
  },
  addFranja: (el) => { const e = state.draft.empleados[Number(el.dataset.i)]; (e.restricciones_horarias ||= []).push({ dias: [], desde: '10:00', hasta: null }); markDirty(); renderView(); },
  delFranja: (el) => { state.draft.empleados[Number(el.dataset.i)].restricciones_horarias.splice(Number(el.dataset.j), 1); markDirty(); renderView(); },
  delReglaFuncion: (el) => { state.draft.funciones[Number(el.dataset.i)].reglas.splice(Number(el.dataset.j), 1); markDirty(); renderView(); },
  addEmp: () => {
    const ids = state.draft.empleados.map((e) => e.id);
    state.draft.empleados.push({ id: uid(`persona-${ids.length + 1}`, ids), nombre: 'Nueva persona', horas_semanales: 30, puede_abrir: false, puede_cerrar: false, es_encargado: false, puestos: ['sala', 'cocina'], funciones: [], libranzas_fijas: [], restricciones_horarias: [], slack_user_id: null, email: null, activo: true });
    markDirty(); renderView(); window.scrollTo(0, document.body.scrollHeight);
  },
  addComodin: () => {
    const emps = state.draft.empleados;
    const usados = new Set(emps.map((e) => e.nombre.trim().toUpperCase()));
    let n = 1;
    while (usados.has(`X${n}`)) n++;
    emps.push({ id: uid(`comodin-${n}`, emps.map((e) => e.id)), nombre: `X${n}`, horas_semanales: 0, comodin: true, horas_min_semana: null, horas_max_semana: null, puede_abrir: false, puede_cerrar: false, es_encargado: false, puestos: ['sala', 'cocina'], funciones: [], libranzas_fijas: [], restricciones_horarias: [], slack_user_id: null, email: null, activo: true });
    markDirty(); renderView(); window.scrollTo(0, document.body.scrollHeight);
  },
  delEmp: (el) => {
    const c = state.draft; const e = c.empleados[Number(el.dataset.i)];
    if (!window.confirm(`¿Eliminar a ${e.nombre}? También se borrarán sus ausencias, peticiones y preferencias.\nSi solo deja la plantilla, mejor desactiva «En plantilla».`)) return;
    c.empleados.splice(Number(el.dataset.i), 1);
    c.ausencias = c.ausencias.filter((a) => a.empleado_id !== e.id);
    c.excepciones_asignacion = c.excepciones_asignacion.filter((a) => a.empleado_id !== e.id);
    c.preferencias = c.preferencias.filter((a) => a.empleado_id !== e.id);
    markDirty(); renderView();
  },
  addShift: () => {
    const ids = state.draft.turnos.map((s) => s.id);
    let n = 1; while (ids.includes(`T${n}`)) n++;
    state.draft.turnos.push({ id: `T${n}`, nombre: 'Nuevo turno', inicio: '09:00', fin: '15:00', tipo: 'normal', dias: null, color: '#E8D5B0' });
    markDirty(); renderView();
  },
  delShift: (el) => {
    const c = state.draft; const s = c.turnos[Number(el.dataset.i)];
    if (!window.confirm(`¿Eliminar el turno ${s.nombre}? Se quitará de preferencias y peticiones. Los horarios ya creados con este turno dejarán de mostrarlo.`)) return;
    c.turnos.splice(Number(el.dataset.i), 1);
    c.preferencias.forEach((p) => { p.turnos = p.turnos.filter((t) => t !== s.id); });
    c.preferencias = c.preferencias.filter((p) => p.turnos.length);
    c.excepciones_asignacion = c.excepciones_asignacion.filter((o) => o.turno_id !== s.id);
    markDirty(); renderView();
  },
  addDayType: () => {
    const names = state.draft.tipos_dia.map((t) => t.nombre);
    let n = 1; while (names.includes(`nuevo ${n}`)) n++;
    state.draft.tipos_dia.push({ nombre: `nuevo ${n}`, cerrado: false, franjas: [{ inicio: '08:00', fin: '20:00', personas: 2 }] });
    markDirty(); renderView();
  },
  delDayType: (el) => {
    const c = state.draft; const t = c.tipos_dia[Number(el.dataset.i)];
    const used = Object.values(c.tipo_dia_por_semana).includes(t.nombre) || c.tipo_dia_festivo === t.nombre || c.excepciones_fecha.some((o) => o.tipo_dia === t.nombre);
    if (used) { toast(`«${t.nombre}» está en uso. Cámbialo antes en los días de la semana, festivos o días especiales.`, true); return; }
    c.tipos_dia.splice(Number(el.dataset.i), 1); markDirty(); renderView();
  },
  addSlot: (el) => {
    const arr = getPath(state.draft, el.dataset.path);
    const last = arr[arr.length - 1];
    const start = last ? last.fin : '08:00';
    arr.push({ inicio: start, fin: fmtMin(Math.min(toMin(start) + 120, 23 * 60 + 59)), personas: last ? last.personas : 2, cocina: last ? last.cocina || 0 : 0, sala: last ? last.sala || 0 : 0 });
    markDirty(); renderView();
  },
  delSlot: (el) => { getPath(state.draft, el.dataset.path).splice(Number(el.dataset.j), 1); markDirty(); renderView(); },
  addHoliday: () => {
    const v = $('#new-holiday').value;
    if (!v) { toast('Elige una fecha', true); return; }
    if (!state.draft.festivos.includes(v)) state.draft.festivos.push(v);
    markDirty(); renderView();
  },
  delHoliday: (el) => { state.draft.festivos = state.draft.festivos.filter((f) => f !== el.dataset.date); markDirty(); renderView(); },
  addSpecial: () => { state.draft.excepciones_fecha.push({ fecha: todayIso(), tipo_dia: null, franjas: null, cerrado: true, nota: null }); markDirty(); renderView(); },
  addTask: () => {
    if (!state.draft.tareas) state.draft.tareas = [];
    state.draft.tareas.push({ nombre: 'Nueva tarea', inicio: '07:00', fin: '08:00', personas: 1, dias: null, puesto: null });
    markDirty(); renderView();
  },
  delTask: (el) => { state.draft.tareas.splice(Number(el.dataset.i), 1); markDirty(); renderView(); },
  goTo: (el) => { closeOverlay(); location.hash = `#/${el.dataset.to}`; },
  delSpecial: (el) => { state.draft.excepciones_fecha.splice(Number(el.dataset.i), 1); markDirty(); renderView(); },
  bajaDialog: (el) => {
    const e = empById(state.draft, el.dataset.emp);
    overlay(`<h2>Baja de ${esc(e.nombre)}</h2>
      <form id="baja-form" class="stack" style="gap:12px" data-emp="${esc(e.id)}">
        <div class="fields two"><label class="field">Desde<input type="date" name="desde" value="${todayIso()}" required></label>
          <label class="field">Hasta (si se sabe)<input type="date" name="hasta"><span class="hint">Vacío: hasta que le des el alta.</span></label></div>
        <p class="small muted" style="margin:0">Al guardar, el motor deja de darle turnos esos días. Si ya tenía turnos asignados, te aviso de cuáles no se van a hacer y preparo un arreglo como borrador para que lo revises y lo publiques.${state.dirty ? ' También se guardarán los demás cambios que tienes sin guardar.' : ''}</p>
        <div class="row end"><button type="button" class="btn" data-act="closeOverlay">Cancelar</button><button class="btn primary" type="submit">Guardar la baja</button></div>
      </form>`);
  },
  bajaAlta: (el) => {
    const e = empById(state.draft, el.dataset.emp);
    const b = bajaDe(e);
    const min = b.desde > todayIso() ? b.desde : todayIso();
    overlay(`<h2>Alta de ${esc(e.nombre)}</h2>
      <form id="alta-form" class="stack" style="gap:12px" data-emp="${esc(e.id)}">
        <label class="field">Vuelve a trabajar el<input type="date" name="vuelve" value="${addDays(min, 1) > b.hasta && !bajaSinFin(b) ? b.hasta : addDays(min, 1)}" min="${b.desde}" required></label>
        <p class="small muted" style="margin:0">Desde ese día el motor vuelve a contar con ${esc(e.nombre)}. Los horarios ya hechos no cambian solos: regenéralos si quieres que trabaje en ellos.</p>
        <div class="row end"><button type="button" class="btn" data-act="closeOverlay">Cancelar</button><button class="btn primary" type="submit">Dar el alta</button></div>
      </form>`);
  },
  addAbsence: () => {
    const e = state.draft.empleados.find((x) => x.activo);
    if (!e) { toast('Primero añade a alguien al equipo', true); return; }
    state.draft.ausencias.push({ empleado_id: e.id, desde: todayIso(), hasta: addDays(todayIso(), 6), motivo: 'vacaciones' }); markDirty(); renderView();
  },
  addRequest: () => {
    const e = state.draft.empleados.find((x) => x.activo);
    if (!e) { toast('Primero añade a alguien al equipo', true); return; }
    state.draft.excepciones_asignacion.push({ empleado_id: e.id, fecha: todayIso(), tipo: 'libre', turno_id: null }); markDirty(); renderView();
  },
  addPref: () => {
    const e = state.draft.empleados.find((x) => x.activo);
    if (!e || !state.draft.turnos.length) { toast('Necesitas al menos una persona y un turno', true); return; }
    state.draft.preferencias.push({ empleado_id: e.id, tipo: 'prefiere', turnos: [state.draft.turnos[0].id], dias: null, peso: 3 }); markDirty(); renderView();
  },
  delRow: (el) => { state.draft[el.dataset.list].splice(Number(el.dataset.i), 1); markDirty(); renderView(); },

  delUser: async (el) => {
    if (!window.confirm(`¿Quitar el acceso a ${el.dataset.u}?`)) return;
    try { state.ajustes.users = await api('DELETE', `/api/usuarios/${encodeURIComponent(el.dataset.u)}`); renderView(); } catch (e) { toast(e.message, true); }
  },
  exportConfig: () => {
    const blob = new Blob([JSON.stringify(state.config, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `lopita_config_v${state.version}.json`; a.click();
  },
  restore: async (el) => {
    if (!confirmLeave() || !window.confirm(`¿Volver a la versión ${el.dataset.v}? Se guardará como una versión nueva.`)) return;
    try {
      const r = await api('POST', `/api/config/restaurar/${el.dataset.v}`);
      state.config = r.config; state.version = r.version; state.draft = clone(r.config); state.dirty = false;
      state.ajustes = null; toast('Versión restaurada'); renderView();
    } catch (e) { toast(e.message, true); }
  },
};

// cambios de <select> que no son un simple data-bind
export const changeActions = {
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
  dayPick: (el) => {
    if (!el.value) return;
    if (!diaDescartable()) { el.value = state.dia.fecha; return; }
    state.dia = null; state.diaFecha = el.value; renderView();
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

function generationToast(g) {
  if (!g || !g.valido || !g.reintentos) return;
  toast(`El primer intento tenía alertas críticas; se ${g.reintentos === 1 ? 'ha arreglado en el reintento' : `han arreglado en ${g.reintentos} reintentos`}.`);
}

function confirmCriticalDialog(data) {
  return `<h2>¿Publicar un horario que no vale?</h2>
    <div class="notice crit small"><span>${esc(data.detail)}</span></div>
    <ul class="fix-alerts">${data.criticas.map((a) => `<li><span class="sev-badge critica">Crítica</span> ${esc(a.detalle)}</li>`).join('')}</ul>
    <label class="toggle" style="margin-top:12px"><input type="checkbox" data-act-change="toggleConfirm"> Lo publico sabiendo que tiene alertas críticas y que las resolveré fuera de la app.</label>
    <p class="small muted">Quedará registrado quién lo publicó y cuándo.</p>
    <div class="row end" style="margin-top:16px"><button class="btn" data-act="closeOverlay">Cancelar</button>
      <button class="btn danger" id="confirm-publish" data-act="publish" data-confirm="1" disabled>Publicar igualmente</button></div>`;
}

function showSlack(res, title) {
  if (!res) return;
  const sent = res.mensajes.filter((m) => m.ok).length;
  overlay(`<h2>${esc(title)}</h2>
    ${res.simulado ? '<div class="notice info small">Slack aún no está conectado: estos son los mensajes que se enviarían. El enlace público ya funciona.</div>'
      : res.ok ? `<div class="notice ok small">Enviados ${sent} mensajes por Slack.</div>` : `<div class="notice warn small">Se enviaron ${sent} de ${res.mensajes.length} mensajes. Revisa los que fallaron.</div>`}
    ${res.mensajes.map((m) => `<div class="msg ${m.ok ? '' : 'bad'}"><b>${esc(m.destino)}</b>${m.ok ? '' : ` · ${esc(m.error || 'error')}`}\n${esc(m.texto)}</div>`).join('')}
    <div class="row end" style="margin-top:16px"><button class="btn primary" data-act="closeOverlay">Cerrar</button></div>`);
}

