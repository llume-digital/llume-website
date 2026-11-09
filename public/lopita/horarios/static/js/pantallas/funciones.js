import { DAYS, DAY_SHORT, ICON, esc, uid } from '../nucleo/util.js';
import { state, toast } from '../nucleo/estado.js';
import { dayChips, esRol, funcionesCfg, head, puestosDe, renderView } from '../nucleo/pintado.js';
import { conDeshacer } from '../nucleo/borrador.js';
import { markDirty } from '../nucleo/enlace.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ FUNCIONES (categorías de empleado con reglas)
const personasTxt = (n) => `${n} ${n === 1 ? 'persona' : 'personas'}`;
function funcionReglasTexto(f) {
  if (!f.reglas.length) return esRol(f) ? 'Sin reglas: el motor solo reparte los roles los días en que alguna regla de los roles de este puesto lo pide.' : 'Sin reglas: solo sirve para saber quién la tiene.';
  return f.reglas.map((r) => {
    const cuantos = [r.personas > 0 ? `al menos ${personasTxt(r.personas)}` : '', r.maximo != null ? `como mucho ${personasTxt(r.maximo)}` : ''].filter(Boolean).join(' y ') || 'indica un mínimo o un máximo';
    return `${r.dias && r.dias.length ? r.dias.map((d) => DAY_SHORT[DAYS.indexOf(d)]).join(', ') : 'Todos los días'} de ${r.inicio} a ${r.fin}: ${cuantos}`;
  }).join(' · ');
}
// Roles que propone la app para los camareros; el encargado los puede renombrar, quitar o añadir más.
export const ROLES_CAMARERO = [['Caja', '#2F6F4E'], ['Cafetera', '#7A4B2A'], ['Sala', '#B0904C'], ['Lava', '#3D6A8C']];
const CLASES_FUNCION = { '': 'Tarea de apoyo', sala: 'Rol de camarero/a', cocina: 'Rol de cocinero/a' };

export function viewFunciones() {
  const c = state.draft;
  const fs = funcionesCfg(c);
  const activos = c.empleados.filter((e) => e.activo);
  const quien = (pred) => { const l = activos.filter(pred).map((e) => esc(e.nombre)); return l.length ? l.join(', ') : '<span class="bad-text">nadie</span>'; };
  const fijas = [
    ['Abrir', 'puede_abrir', 'Solo estas personas hacen los turnos de apertura, y al abrir tiene que haber al menos una (si no, el horario no vale).'],
    ['Cerrar', 'puede_cerrar', 'Solo estas personas hacen los turnos de cierre, y al cerrar tiene que quedarse al menos una (si no, el horario no vale).'],
    ['Encargado/a', 'es_encargado', c.reglas.encargado_siempre ? 'El motor intenta que siempre haya un encargado en el local (Reglas → Cobertura).' : 'Ahora no se exige un encargado siempre; se activa en Reglas → Cobertura.'],
  ];
  const fila = (f, i) => `<div class="card" style="--fc:${esc(f.color || 'var(--brown)')}">
    <div class="row" style="flex-wrap:nowrap;gap:8px"><input type="color" value="${esc(f.color || '#764A09')}" data-bind="funciones.${i}.color" aria-label="Color" class="color-input" data-rerender>
      <input class="title-input" type="text" value="${esc(f.nombre)}" data-bind="funciones.${i}.nombre" aria-label="Nombre de la función" data-rerender>
      <button class="icon-btn" data-act="delFuncion" data-i="${i}" title="Eliminar la función">${ICON.trash}</button></div>
    <label class="field" style="margin-top:10px;max-width:280px">Clase<select data-act-change="funcionClase" data-i="${i}">${Object.entries(CLASES_FUNCION).map(([k, v]) => `<option value="${k}" ${(f.puesto || '') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <span class="hint">${esRol(f) ? `Cada ${f.puesto === 'sala' ? 'camarero/a' : 'cocinero/a'} hace uno de sus roles durante todo el turno; solo cuenta quien lo tiene asignado.` : 'Cuenta cualquiera que sepa hacerla y esté trabajando.'}</span></label>
    <div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">${esRol(f) ? 'Quién puede hacerlo' : 'Quién la tiene'}</div>
      <div class="chips" role="group" aria-label="Personas con ${esc(f.nombre)}">${c.empleados.filter((e) => !esRol(f) || puestosDe(e).includes(f.puesto)).map((e) => { const k = c.empleados.indexOf(e); return `<button type="button" class="chip ${(e.funciones || []).includes(f.id) ? 'on' : ''}" data-act="toggleFuncion" data-i="${k}" data-f="${esc(f.id)}" aria-pressed="${(e.funciones || []).includes(f.id)}" style="${e.activo ? '' : 'opacity:.55'}">${esc(e.nombre)}</button>`; }).join('')}</div></div>
    <div style="margin-top:14px"><div class="row"><span class="small muted" style="font-weight:600">Reglas</span><span class="spacer"></span><button class="btn small" data-act="addReglaFuncion" data-i="${i}">${ICON.plus} Añadir regla</button></div>
      ${f.reglas.length ? f.reglas.map((r, j) => `<div class="regla-funcion">
        <div class="fields">
          <label class="field">Desde<input type="time" step="900" value="${r.inicio}" data-bind="funciones.${i}.reglas.${j}.inicio" data-rerender></label>
          <label class="field">Hasta<input type="time" step="900" value="${r.fin === '24:00' ? '23:59' : r.fin}" data-bind="funciones.${i}.reglas.${j}.fin" data-rerender></label>
          <label class="field">${esRol(f) ? 'Al menos' : 'Mínimo de personas'}<input type="number" min="${esRol(f) ? 0 : 1}" max="20" value="${r.personas}" data-type="int" data-bind="funciones.${i}.reglas.${j}.personas" data-rerender></label>
          ${esRol(f) ? `<label class="field">Como mucho<input type="number" min="0" max="20" placeholder="Sin máximo" value="${r.maximo ?? ''}" data-type="nullnum" data-bind="funciones.${i}.reglas.${j}.maximo" data-rerender></label>` : ''}
          <button class="icon-btn" style="align-self:flex-end" data-act="delReglaFuncion" data-i="${i}" data-j="${j}" title="Quitar la regla">${ICON.trash}</button>
        </div>
        <div style="margin-top:8px">${dayChips(`funciones.${i}.reglas.${j}.dias`, r.dias, 'Todos los días que abre')}</div></div>`).join('')
        : `<p class="small muted" style="margin:6px 0 0">${esRol(f) ? 'Sin reglas. Por ejemplo: «de 9:00 a 21:00, al menos 1 en caja» o «como mucho 1 en lava». Los roles solo se reparten los días en que alguna regla de los roles de este puesto se aplica.' : 'Sin reglas: solo sirve para saber quién la tiene. Añade una para que el motor ponga a alguien con esta función en un tramo.'}</p>`}
      ${f.reglas.length ? `<p class="small muted" style="margin:8px 0 0">${esc(funcionReglasTexto(f))}</p>` : ''}
    </div></div>`;
  const grupo = (titulo, intro, pred, vacio) => {
    const lista = fs.map((f, i) => [f, i]).filter(([f]) => pred(f));
    return `<div class="section"><h2>${titulo}</h2><p class="small muted" style="margin-top:-4px">${intro}</p>
      ${lista.length ? `<div class="func-grid">${lista.map(([f, i]) => fila(f, i)).join('')}</div>` : `<div class="card empty">${vacio}</div>`}</div>`;
  };
  const hayRolesCamarero = fs.some((f) => f.puesto === 'sala');
  return `${head('Funciones', 'Lo que solo hacen algunas personas. Los roles de camarero (caja, cafetera, sala, lava…) se reparten en cada turno: cada camarero hace uno, solo quien sepa hacerlo, y las reglas dicen cuántos hacen falta («de 9:00 a 21:00, al menos 1 en caja»). Las tareas de apoyo (preparar pinchos…) las cubre cualquiera que sepa hacerlas. El motor cumple las reglas si puede y, si no, avisa.', `${hayRolesCamarero ? '' : `<button class="btn" data-act="addRolesCamarero">${ICON.plus} Roles de camarero</button>`}<button class="btn primary" data-act="addFuncion">${ICON.plus} Añadir función</button>`)}
  <div class="card"><h2>Funciones fijas</h2><div class="table-wrap"><table class="list"><thead><tr><th>Función</th><th>Quién la tiene</th><th>Regla</th></tr></thead><tbody>
    ${fijas.map(([n, campo, regla]) => `<tr><td><b>${n}</b></td><td>${quien((e) => e[campo])}</td><td class="small">${regla}</td></tr>`).join('')}
  </tbody></table></div><p class="small muted" style="margin-bottom:0">Se cambian en Equipo, en la ficha de cada persona.</p></div>
  ${grupo('Roles de camarero', 'Cada camarero/a hace uno de sus roles durante el turno; lo elige el motor según las reglas y lo puedes cambiar en el horario.', (f) => f.puesto === 'sala',
    `Aún no hay roles. Pulsa «Roles de camarero» para crear caja, cafetera, sala y lava, o añade una función y elige «Rol de camarero/a».`)}
  ${fs.some((f) => f.puesto === 'cocina') ? grupo('Roles de cocinero', 'Igual que los de camarero, para quien trabaja en cocina.', (f) => f.puesto === 'cocina', '') : ''}
  ${grupo('Tareas de apoyo', 'Las cubre cualquiera que sepa hacerlas y esté trabajando en ese momento.', (f) => !esRol(f),
    'Aún no hay ninguna. Por ejemplo, «Preparar pinchos»: añádela, marca quién sabe hacerlo y pon de qué hora a qué hora hace falta.')}`;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
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
    const avisar = conDeshacer(`Función «${f.nombre}» eliminada`);
    c.funciones.splice(Number(el.dataset.i), 1);
    c.empleados.forEach((e) => { e.funciones = (e.funciones || []).filter((x) => x !== f.id); });
    markDirty(); renderView(); avisar();
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
});
