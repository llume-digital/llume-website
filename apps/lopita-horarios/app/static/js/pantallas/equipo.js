import { DAYS, DAY_LABEL, ICON, addDays, daysBetween, esc, fmtLong, todayIso, uid, weekday } from '../nucleo/util.js';
import { overlay, state, toast } from '../nucleo/estado.js';
import { PUESTOS, TIPOS, dayChips, empById, esRol, funcById, funcionesCfg, head, horasField, puestosDe, renderView, rolesDe, slackField, toggle } from '../nucleo/pintado.js';
import { conDeshacer } from '../nucleo/borrador.js';
import { markDirty } from '../nucleo/enlace.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ EQUIPO
// #/equipo es la lista de la plantilla; #/equipo/<id> es la ficha de una persona, con todo lo que se le puede ajustar.
const equipoSeleccionado = () => decodeURIComponent(location.hash.replace(/^#\/?/, '').split('/')[1] || '');
const irAEquipo = (id) => { location.hash = id ? `#/equipo/${encodeURIComponent(id)}` : '#/equipo'; };

export function viewEquipo() {
  const emps = state.draft.empleados;
  const i = emps.findIndex((e) => e.id === equipoSeleccionado());
  return i >= 0 ? viewFicha(i) : viewLista(emps);
}

const AYUDA_EQUIPO = 'Quién trabaja en Lopita, sus horas de contrato, si es camarero/a o cocinero/a, sus funciones y qué días libra habitualmente. Los comodines no tienen horas de contrato: el generador solo les da turnos para cubrir lo que el resto no llega a cubrir.';
const botonesAlta = `<button class="btn" data-act="addComodin">${ICON.plus} Añadir comodín</button><button class="btn primary" data-act="addEmp">${ICON.plus} Añadir persona</button>`;

function viewLista(emps) {
  const fila = (e) => {
    const baja = e.activo && bajaDe(e);
    const etiquetas = [e.comodin ? 'Comodín' : '', baja ? 'De baja' : '', e.activo ? '' : 'Fuera de plantilla'].filter(Boolean);
    return `<a class="persona-fila${e.activo ? '' : ' inactiva'}" href="#/equipo/${encodeURIComponent(e.id)}">
      <span class="persona-nombre">${esc(e.nombre)}</span>
      <span class="persona-datos small muted">${esc(puestosDe(e).map((p) => TIPOS[p]).join(' y '))} · ${e.comodin ? 'sin horas fijas' : `${esc(String(e.horas_semanales))} h/semana`}</span>
      ${etiquetas.map((t) => `<span class="baja-tag">${t}</span>`).join('')}
      <span class="persona-ir" aria-hidden="true">›</span></a>`;
  };
  return `${head('Equipo', AYUDA_EQUIPO, botonesAlta)}
  ${emps.length ? `<div class="card lista-equipo">${emps.map(fila).join('')}</div>` : '<div class="card empty">No hay nadie en el equipo todavía.</div>'}`;
}

function viewFicha(i) {
  const e = state.draft.empleados[i];
  return `<p style="margin:0 0 8px"><a href="#/equipo" class="small">← Equipo</a></p>
  ${head(esc(e.nombre), e.comodin ? 'Comodín: sin horas de contrato.' : 'Ficha de la persona.', '')}
  <div class="card ficha" style="${e.activo ? '' : 'opacity:.6'}">
    <div class="row" style="flex-wrap:nowrap"><input class="title-input" type="text" value="${esc(e.nombre)}" data-bind="empleados.${i}.nombre" aria-label="Nombre"><button class="icon-btn" data-act="delEmp" data-i="${i}" title="Eliminar">${ICON.trash}</button></div>
    <label class="toggle" style="margin-top:10px"><input type="checkbox" data-act-change="comodin" data-i="${i}" ${e.comodin ? 'checked' : ''}> Comodín</label>
    ${e.comodin ? '<p class="small muted" style="margin:6px 0 0">Sin horas de contrato: el generador solo le da turnos cuando el resto no llega a cubrir la demanda.</p>' : ''}
    <div class="fields" style="margin-top:10px">
      ${horasField(i, e)}
      ${e.comodin ? '' : slackField(i, e)}
    </div>
    ${e.comodin ? `<div class="fields" style="margin-top:10px">${slackField(i, e)}</div>` : ''}
    <label class="field" style="margin-top:12px">Email<span class="hint">Si no hay usuario de Slack, se busca por email</span><input type="email" value="${esc(e.email || '')}" data-type="nullstr" data-bind="empleados.${i}.email"></label>
    ${puestosField(i, e)}
    <div class="stack" style="gap:8px;margin-top:14px">
      ${toggle(`empleados.${i}.activo`, e.activo, 'En plantilla')}
    </div>
    ${bajaField(e)}
    ${funcionesField(i, e)}
    <div style="margin-top:14px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Días que libra</div>${dayChips(`empleados.${i}.libranzas_fijas`, e.libranzas_fijas, 'El motor elige sus días libres')}</div>
    ${franjasField(i, e)}
  </div>`;
}

// Bajas: una ausencia con motivo «baja». Sin fecha de alta se guarda para un año (hasta que se dé el alta).
export const BAJA_SIN_FIN = 364;
export const bajaDe = (e) => state.draft.ausencias.find((a) => a.empleado_id === e.id && a.motivo === 'baja' && a.hasta >= todayIso());
export const bajaSinFin = (a) => daysBetween(a.desde, a.hasta) >= BAJA_SIN_FIN;
function bajaTexto(a) {
  const hoy = todayIso();
  return `${a.desde <= hoy ? 'De baja desde' : 'Baja a partir del'} ${fmtLong(a.desde)}${bajaSinFin(a) ? ', sin fecha de alta' : `, hasta el ${fmtLong(a.hasta)}`}`;
}
function bajaField(e) {
  if (!e.activo) return '';
  const b = bajaDe(e);
  return `<div class="baja-box${b ? ' on' : ''}">${b
    ? `<span class="baja-tag">Baja</span><span class="small">${esc(bajaTexto(b))}</span><span class="spacer"></span><button class="btn small" data-act="bajaAlta" data-emp="${esc(e.id)}">Dar el alta</button>`
    : `<span class="small muted">Si se va de baja, márcalo: verás qué turnos suyos no se van a hacer y se prepara un arreglo.</span><span class="spacer"></span><button class="btn small" data-act="bajaDialog" data-emp="${esc(e.id)}">Marcar baja</button>`}</div>`;
}

// Cocina, sala o ambos; con los dos, el primero es el principal (adonde va si la demanda no pide otro).
function puestosField(i, e) {
  const ps = puestosDe(e);
  return `<div style="margin-top:14px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Tipo de empleado</div>
    <div class="row" style="gap:10px"><div class="chips" role="group" aria-label="Tipo de empleado">${Object.keys(TIPOS).map((p) => `<button type="button" class="chip ${ps.includes(p) ? 'on' : ''}" data-act="togglePuesto" data-i="${i}" data-p="${p}" aria-pressed="${ps.includes(p)}" title="Trabaja en ${PUESTOS[p].toLowerCase()}">${TIPOS[p]}</button>`).join('')}</div>
    ${ps.length > 1 ? `<label class="field inline">Sobre todo<select data-act-change="puestoPrincipal" data-i="${i}">${ps.map((p) => `<option value="${p}" ${ps[0] === p ? 'selected' : ''}>${TIPOS[p]}</option>`).join('')}</select></label>` : ''}</div>
    <div class="hint small muted" style="margin-top:4px">${ps.length > 1 ? 'Hace las dos cosas: va a sala o a cocina según lo que pida la demanda.' : ps[0] === 'cocina' ? 'Solo trabaja en cocina.' : 'Solo trabaja en sala.'}</div></div>`;
}

// Funciones de la persona: las fijas (abrir, cerrar, encargado) y las que añade el encargado en Funciones.
// «Preparar pinchos» sale siempre junto a abrir y cerrar; si aún no existe la función, se crea al marcarla.
export const PINCHOS = { id: 'preparar-pinchos', nombre: 'Preparar pinchos', color: '#C9733B', reglas: [] };
// Restricciones horarias: «esos días solo puede trabajar de X a Y». Vacío = sin límite por ese lado.
export const aMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export function franjaDe(e, d) {
  let desde = 0, hasta = 24 * 60;
  for (const r of e.restricciones_horarias || []) {
    if (r.dias && r.dias.length && !r.dias.includes(DAYS[weekday(d)])) continue;
    if (r.desde) desde = Math.max(desde, aMin(r.desde));
    if (r.hasta) hasta = Math.min(hasta, aMin(r.hasta));
  }
  return [desde, hasta];
}
function franjaTexto(r) {
  if (r.desde && r.hasta) return `Solo de ${r.desde} a ${r.hasta}`;
  if (r.desde) return `No antes de las ${r.desde}`;
  if (r.hasta) return `No después de las ${r.hasta}`;
  return 'Pon al menos una hora';
}
function franjasField(i, e) {
  const rs = e.restricciones_horarias || [];
  return `<div style="margin-top:14px"><div class="row" style="margin-bottom:6px"><span class="small muted" style="font-weight:600">Horas en que puede trabajar</span><span class="spacer"></span><button class="btn small" data-act="addFranja" data-i="${i}">${ICON.plus} Añadir</button></div>
    ${rs.length ? rs.map((r, j) => `<div class="regla-funcion">
      <div class="fields">
        <label class="field">No antes de<input type="time" step="900" value="${esc(r.desde || '')}" data-type="nullstr" data-bind="empleados.${i}.restricciones_horarias.${j}.desde" data-rerender></label>
        <label class="field">No después de<input type="time" step="900" value="${r.hasta === '24:00' ? '23:59' : esc(r.hasta || '')}" data-type="nullstr" data-bind="empleados.${i}.restricciones_horarias.${j}.hasta" data-rerender></label>
        <button class="icon-btn" style="align-self:flex-end" data-act="delFranja" data-i="${i}" data-j="${j}" title="Quitar la restricción">${ICON.trash}</button>
      </div>
      <div style="margin-top:8px">${dayChips(`empleados.${i}.restricciones_horarias.${j}.dias`, r.dias, 'Todos los días')}</div>
      <p class="small muted" style="margin:6px 0 0">${esc(franjaTexto(r))}${r.dias && r.dias.length ? ` los ${r.dias.map((d) => DAY_LABEL[DAYS.indexOf(d)].toLowerCase().replace(/([^s])$/, '$1s')).join(', ')}` : ' todos los días'}. El generador solo le da turnos que caben enteros.</p></div>`).join('')
      : '<p class="small muted" style="margin:0">Sin límite: puede hacer cualquier turno. Añade una si, por ejemplo, no puede entrar antes de las 10:00 o salir después de las 18:00.</p>'}</div>`;
}
function funcionesField(i, e) {
  const cfg = state.draft;
  const cfgFs = funcionesCfg(cfg);
  const apoyo = cfgFs.filter((f) => !esRol(f));
  const propias = apoyo.some((f) => f.id === PINCHOS.id || /pincho/i.test(f.nombre)) ? apoyo : [PINCHOS, ...apoyo];
  const tiene = new Set(e.funciones || []);
  const check = (f) => `<label class="toggle"><input type="checkbox" data-act-change="funcCheck" data-i="${i}" data-f="${esc(f.id)}" ${tiene.has(f.id) ? 'checked' : ''}> ${esc(f.nombre)}</label>`;
  // Roles de cada puesto que hace: qué puede hacer y, si son varios, cuál hace normalmente.
  const roles = puestosDe(e).map((p) => {
    const delPuesto = cfgFs.filter((f) => f.puesto === p);
    if (!delPuesto.length) return '';
    const suyos = rolesDe(cfg, e, p);
    return `<div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Como ${TIPOS[p].toLowerCase()} puede hacer</div>
      <div class="chips" role="group" aria-label="Roles de ${TIPOS[p].toLowerCase()}">${delPuesto.map((f) => `<label class="toggle"><input type="checkbox" data-act-change="funcCheck" data-i="${i}" data-f="${esc(f.id)}" ${tiene.has(f.id) ? 'checked' : ''}> ${esc(f.nombre)}</label>`).join('')}</div>
      ${suyos.length > 1 ? `<label class="field inline" style="margin-top:6px">Normalmente<select data-act-change="rolPrincipal" data-i="${i}">${suyos.map((id) => `<option value="${esc(id)}" ${suyos[0] === id ? 'selected' : ''}>${esc(funcById(cfg, id).nombre)}</option>`).join('')}</select></label>` : ''}</div>`;
  }).join('');
  return `<div style="margin-top:14px"><div class="row" style="margin-bottom:6px"><span class="small muted" style="font-weight:600">Funciones</span><span class="spacer"></span><a class="small" href="#/funciones">Gestionar funciones</a></div>
    <div class="stack" style="gap:8px">
      ${toggle(`empleados.${i}.puede_abrir`, e.puede_abrir, 'Puede abrir')}
      ${toggle(`empleados.${i}.puede_cerrar`, e.puede_cerrar, 'Puede cerrar')}
      ${toggle(`empleados.${i}.es_encargado`, e.es_encargado, 'Es encargado/a')}
      ${propias.map(check).join('')}
    </div>${roles}</div>`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
  togglePuesto: (el) => {
    const e = state.draft.empleados[Number(el.dataset.i)];
    const ps = puestosDe(e), p = el.dataset.p;
    if (ps.includes(p) && ps.length === 1) { toast('Cada persona tiene que tener al menos un puesto', true); return; }
    e.puestos = ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p];
    markDirty(); renderView();
  },
  addEmp: () => {
    const ids = state.draft.empleados.map((e) => e.id);
    state.draft.empleados.push({ id: uid(`persona-${ids.length + 1}`, ids), nombre: 'Nueva persona', horas_semanales: 30, puede_abrir: false, puede_cerrar: false, es_encargado: false, puestos: ['sala', 'cocina'], funciones: [], libranzas_fijas: [], restricciones_horarias: [], slack_user_id: null, email: null, activo: true });
    markDirty(); irAEquipo(state.draft.empleados[state.draft.empleados.length - 1].id);
  },
  addComodin: () => {
    const emps = state.draft.empleados;
    const usados = new Set(emps.map((e) => e.nombre.trim().toUpperCase()));
    let n = 1;
    while (usados.has(`X${n}`)) n++;
    emps.push({ id: uid(`comodin-${n}`, emps.map((e) => e.id)), nombre: `X${n}`, horas_semanales: 0, comodin: true, horas_min_semana: null, horas_max_semana: null, puede_abrir: false, puede_cerrar: false, es_encargado: false, puestos: ['sala', 'cocina'], funciones: [], libranzas_fijas: [], restricciones_horarias: [], slack_user_id: null, email: null, activo: true });
    markDirty(); irAEquipo(emps[emps.length - 1].id);
  },
  delEmp: (el) => {
    const c = state.draft; const e = c.empleados[Number(el.dataset.i)];
    const avisar = conDeshacer(`${e.nombre} eliminada del equipo, con sus ausencias y preferencias`);
    c.empleados.splice(Number(el.dataset.i), 1);
    c.ausencias = c.ausencias.filter((a) => a.empleado_id !== e.id);
    c.excepciones_asignacion = c.excepciones_asignacion.filter((a) => a.empleado_id !== e.id);
    c.preferencias = c.preferencias.filter((a) => a.empleado_id !== e.id);
    markDirty(); irAEquipo(''); avisar();
  },
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
  addPref: () => {
    const e = state.draft.empleados.find((x) => x.activo);
    if (!e || !state.draft.turnos.length) { toast('Necesitas al menos una persona y un turno', true); return; }
    state.draft.preferencias.push({ empleado_id: e.id, tipo: 'prefiere', turnos: [state.draft.turnos[0].id], dias: null, peso: 3 }); markDirty(); renderView();
  },
  delRow: (el) => { state.draft[el.dataset.list].splice(Number(el.dataset.i), 1); markDirty(); renderView(); },
});
