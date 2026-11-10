import { ICON, MOTIVOS, addDays, daysBetween, dayNum, esc, fmtRange, monthName, todayIso, weekday } from '../nucleo/util.js';
import { state, toast } from '../nucleo/estado.js';
import { markDirty } from '../nucleo/enlace.js';
import { empName, head, renderView } from '../nucleo/pintado.js';
import { actions } from '../nucleo/registro.js';
import { saldoVacaciones, textoQuedan } from '../nucleo/vacaciones.js';
// ------------------------------------------------------------------ PLANIFICAR VACACIONES (años 2026 y 2027)
export const ANIOS_VACACIONES = [2026, 2027];
const MARCA = { vacaciones: 'V', baja: 'B', permiso: 'P', otro: 'O' };

const vac = () => (state.vac ||= { anio: ANIOS_VACACIONES.includes(new Date().getFullYear()) ? new Date().getFullYear() : ANIOS_VACACIONES[0], emp: '', desde: '', hasta: '' });
const plantilla = () => state.draft.empleados.filter((e) => e.activo);
const lunesDe = (s) => addDays(s, -weekday(s));

// Semanas (de lunes a domingo) que tocan el año; la primera y la última pueden asomar al año de al lado.
function semanasDe(anio) {
  const out = [];
  for (let l = lunesDe(`${anio}-01-01`); l <= `${anio}-12-31`; l = addDays(l, 7)) out.push(l);
  return out;
}
// Días del año (dentro de las fechas pedidas) en los que una ausencia cae en esa semana.
const diasEnSemana = (a, lunes, anio) => {
  const d = a.desde > lunes ? a.desde : lunes;
  const domingo = addDays(lunes, 6);
  const h = a.hasta < domingo ? a.hasta : domingo;
  let n = 0;
  for (let x = d; x <= h; x = addDays(x, 1)) if (x.startsWith(String(anio))) n++;
  return n;
};

// Quién está de vacaciones (u otra ausencia) en esas fechas, para avisar antes de añadir.
function previsualizar(f) {
  if (!f.emp || !f.desde || !f.hasta) return '<p class="small muted" id="vac-aviso" role="status">Elige la persona y las fechas para ver con quién coincide.</p>';
  if (f.hasta < f.desde) return '<p class="small" id="vac-aviso" role="status" style="color:var(--bad)">La fecha de vuelta no puede ser anterior a la de salida.</p>';
  const otros = {};
  for (const a of state.draft.ausencias) {
    if (a.empleado_id === f.emp || a.hasta < f.desde || a.desde > f.hasta) continue;
    (otros[a.empleado_id] ||= []).push(`${MOTIVOS[a.motivo].toLowerCase()} ${fmtRange(a.desde, a.hasta)}`);
  }
  const propias = state.draft.ausencias.filter((a) => a.empleado_id === f.emp && a.hasta >= f.desde && a.desde <= f.hasta);
  const quien = Object.entries(otros).map(([id, l]) => `<b>${esc(empName(id))}</b> (${esc(l.join(', '))})`);
  const total = plantilla().filter((e) => !e.comodin).length;
  const fuera = new Set([f.emp, ...Object.keys(otros)].filter((id) => plantilla().some((e) => e.id === id && !e.comodin))).size;
  const dias = daysBetween(f.desde, f.hasta) + 1;
  const emp = plantilla().find((e) => e.id === f.emp);
  const sd = emp ? saldoVacaciones({ ...state.draft, ausencias: [...state.draft.ausencias, { empleado_id: f.emp, desde: f.desde, hasta: f.hasta, motivo: 'vacaciones' }] }, emp, Number(f.desde.slice(0, 4)), todayIso()) : null;
  const pasa = sd && sd.quedan < 0 ? ` <span style="color:var(--warn)">Con estos días se pasa ${-sd.quedan} de los ${sd.derecho} que le corresponden este año.</span>` : sd ? ` Le quedarían ${sd.quedan} de ${sd.derecho} días.` : '';
  return `<p class="small" id="vac-aviso" role="status">${dias} ${dias === 1 ? 'día' : 'días'}. ${quien.length ? `Coincide con ${quien.join(', ')}. ` : 'No coincide con nadie. '}${total ? `En el peor momento quedarían <b>${Math.max(total - fuera, 0)} de ${total}</b> personas de plantilla.` : ''}${propias.length ? ' <span style="color:var(--warn)">Ya tiene otra ausencia en esas fechas.</span>' : ''}${pasa}</p>`;
}

// Las semanas más tranquilas que aún no han pasado: pocas personas fuera y sin solape con nadie.
function mejoresSemanas(anio, semanas, fuera) {
  const hoy = lunesDe(todayIso());
  return semanas.map((l, i) => ({ l, n: fuera[i] })).filter((s) => s.l >= hoy && s.l.startsWith(String(anio)))
    .sort((a, b) => a.n - b.n || a.l.localeCompare(b.l)).slice(0, 6).sort((a, b) => a.l.localeCompare(b.l));
}

export function viewVacaciones() {
  const f = vac();
  const anio = f.anio;
  const gente = plantilla();
  if (!f.emp || !gente.some((e) => e.id === f.emp)) f.emp = gente[0] ? gente[0].id : '';
  if (!f.desde) { f.desde = `${anio}-01-01` > todayIso() ? `${anio}-07-01` : todayIso(); f.hasta = addDays(f.desde, 13); }
  const semanas = semanasDe(anio);
  const ausDe = (id) => state.draft.ausencias.filter((a) => a.empleado_id === id);
  const reales = gente.filter((e) => !e.comodin);
  // Personas de la plantilla fuera cada semana (cualquier ausencia cuenta: quien está de baja tampoco cubre).
  const fuera = semanas.map((l) => reales.filter((e) => ausDe(e.id).some((a) => diasEnSemana(a, l, anio) > 0)).length);
  const maxFuera = Math.max(1, ...fuera);
  const meses = [];
  semanas.forEach((l, i) => {
    const jueves = addDays(l, 3);
    const m = jueves.slice(0, 7);
    if (!meses.length || meses[meses.length - 1].m !== m) meses.push({ m, n: 0, nombre: monthName(jueves) });
    meses[meses.length - 1].n++;
  });
  const nivel = (n) => (!n ? '' : reales.length && n / reales.length >= 0.34 ? ' alta' : ' media');
  const filas = gente.map((e) => {
    const cel = semanas.map((l) => {
      const mias = ausDe(e.id).map((a) => ({ a, n: diasEnSemana(a, l, anio) })).filter((x) => x.n > 0);
      if (!mias.length) return '<td class="vac-c"></td>';
      const top = mias.sort((x, y) => y.n - x.n)[0];
      const n = mias.reduce((s, x) => s + x.n, 0);
      return `<td class="vac-c ${top.a.motivo}${n >= 5 ? ' llena' : ''}" title="${esc(`${MOTIVOS[top.a.motivo]}: ${fmtRange(top.a.desde, top.a.hasta)}`)}">${MARCA[top.a.motivo]}</td>`;
    }).join('');
    const sd = saldoVacaciones(state.draft, e, anio, todayIso());
    return `<tr><th scope="row" class="vac-nom">${esc(e.nombre)}${e.comodin ? ' <span class="muted small">(comodín)</span>' : ''}</th><td class="num vac-dias" title="${sd.disfrutadas} disfrutados, ${sd.programadas} por disfrutar, de ${sd.derecho} que le corresponden">${sd.disfrutadas + sd.programadas}</td><td class="num vac-dias${sd.quedan < 0 ? ' pasa' : ''}">${textoQuedan(sd)}</td>${cel}</tr>`;
  }).join('');
  const lista = state.draft.ausencias.map((a, i) => ({ a, i })).filter(({ a }) => a.desde <= `${anio}-12-31` && a.hasta >= `${anio}-01-01`)
    .sort((x, y) => x.a.desde.localeCompare(y.a.desde));
  const mejores = mejoresSemanas(anio, semanas, fuera);
  return `${head('Vacaciones', 'Mira el año entero, apunta las vacaciones y comprueba cuántas personas quedan cada semana. Lo que apuntes aquí es lo mismo que en Ausencias.')}
  <div class="card"><div class="row"><h2 style="margin:0">Año</h2>
    <div class="chips" role="group" aria-label="Año a planificar">${ANIOS_VACACIONES.map((y) => `<button type="button" class="chip${y === anio ? ' on' : ''}" aria-pressed="${y === anio}" data-act="vacAnio" data-anio="${y}">${y}</button>`).join('')}</div></div>
    ${gente.length ? `<form id="vac-form" class="vac-form">
      <label class="field">Persona<select name="emp" data-act-change="vacCampo">${gente.map((e) => `<option value="${esc(e.id)}" ${e.id === f.emp ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></label>
      <label class="field">Salida<input type="date" name="desde" value="${f.desde}" data-act-change="vacCampo"></label>
      <label class="field">Vuelta (último día)<input type="date" name="hasta" value="${f.hasta}" data-act-change="vacCampo"></label>
      <button type="button" class="btn primary" data-act="vacAnadir">${ICON.plus} Añadir vacaciones</button></form>
      ${previsualizar(f)}` : '<p class="muted small">Primero añade a alguien en Equipo.</p>'}
  </div>
  <div class="card section"><h2 style="margin:0 0 4px">Plano de ${anio}</h2>
    <p class="small muted" style="margin-top:0">Cada columna es una semana (de lunes a domingo). <b>V</b> vacaciones, <b>B</b> baja, <b>P</b> permiso, <b>O</b> otro; más oscuro si faltan 5 días o más. Abajo, cuántas personas de la plantilla faltan esa semana. <b>Usados</b> son los días de vacaciones apuntados y <b>Quedan</b> los que le restan: la ley da 30 días naturales al año (o la parte proporcional si entró durante el año). Se cambian en la ficha de cada persona, en Equipo.</p>
    <div class="table-wrap vac-wrap" role="region" aria-label="Plano anual de vacaciones" tabindex="0">
    <table class="vac-tabla"><thead><tr><th rowspan="2" class="vac-nom">Persona</th><th rowspan="2" class="num vac-dias" title="Días de vacaciones apuntados este año (disfrutados y por disfrutar)">Usados</th><th rowspan="2" class="num vac-dias" title="Días que le quedan por apuntar, según los que le corresponden este año (mínimo 30 días naturales, y la parte proporcional si entró durante el año)">Quedan</th>${meses.map((m) => `<th colspan="${m.n}" class="vac-mes">${m.nombre.slice(0, 3)}</th>`).join('')}</tr>
      <tr>${semanas.map((l) => `<th class="vac-sem" title="Semana del ${dayNum(l)} de ${monthName(l)}">${dayNum(l)}</th>`).join('')}</tr></thead>
    <tbody>${filas}</tbody>
    <tfoot><tr><th scope="row" class="vac-nom">Personas fuera</th><td></td><td></td>${fuera.map((n, i) => `<td class="vac-c total${nivel(n)}" title="${n} de ${reales.length} fuera la semana del ${dayNum(semanas[i])} de ${monthName(semanas[i])}">${n || ''}</td>`).join('')}</tr></tfoot></table></div>
    ${maxFuera && mejores.length ? `<p class="small" style="margin-bottom:0"><b>Semanas más tranquilas que quedan:</b> ${mejores.map((s) => `${dayNum(s.l)} ${monthName(s.l).slice(0, 3)} (${s.n === 0 ? 'nadie fuera' : `${s.n} fuera`})`).join(' · ')}.</p>` : ''}
  </div>
  <div class="card section"><h2 style="margin:0">Ausencias de ${anio}</h2>
    ${lista.length ? `<div class="table-wrap"><table class="list" style="margin-top:10px"><thead><tr><th>Persona</th><th>Fechas</th><th>Motivo</th><th class="num">Días</th><th><span class="sr-only">Quitar</span></th></tr></thead><tbody>
    ${lista.map(({ a, i }) => `<tr><td>${esc(empName(a.empleado_id))}</td><td>${fmtRange(a.desde, a.hasta)}</td><td>${MOTIVOS[a.motivo]}</td><td class="num">${daysBetween(a.desde, a.hasta) + 1}</td>
      <td><button class="icon-btn" data-act="delRow" data-list="ausencias" data-i="${i}" title="Quitar" aria-label="Quitar ${esc(empName(a.empleado_id))} ${a.desde}">${ICON.trash}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Todavía no hay nada apuntado este año.</p>'}
    <p class="small muted" style="margin-bottom:0">Los cambios se guardan con el botón de abajo, igual que en Ausencias. Si ya hay horarios en esas fechas, la app los arregla sola al guardar.</p>
  </div>`;
}

Object.assign(actions, {
  vacAnio: (el) => { vac().anio = Number(el.dataset.anio); vac().desde = ''; renderView(); },
  vacCampo: (el) => {
    const f = vac(); f[el.name] = el.value;
    if (el.name === 'desde' && f.hasta < f.desde) f.hasta = addDays(f.desde, 6);
    renderView();
  },
  vacAnadir: () => {
    const f = vac();
    if (!f.emp || !f.desde || !f.hasta) { toast('Elige la persona y las fechas', true); return; }
    if (f.hasta < f.desde) { toast('La vuelta no puede ser anterior a la salida', true); return; }
    state.draft.ausencias.push({ empleado_id: f.emp, desde: f.desde, hasta: f.hasta, motivo: 'vacaciones' });
    markDirty(); toast('Vacaciones apuntadas. Guarda los cambios para que cuenten.'); renderView();
  },
});
