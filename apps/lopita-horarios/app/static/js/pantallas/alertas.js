import { DAYS, DAY_SHORT, ICON, MOTIVOS, addDays, dayNum, esc, fmtH, fmtLong, fmtMin, fmtRange, monthName, toMin, weekday } from '../nucleo/util.js';
import { api, overlay, saveConfig, state, toast, withBusy } from '../nucleo/estado.js';
import { PUESTOS, abreviaturas, capTags, funcionesDe, head, horasDe, horasPersona, puestoDe, puestoTag, renderView, rolDe, rolTag, shiftById, tipoDe, usaPuestos } from '../nucleo/pintado.js';
import { horasFila } from './cuadrante.js';
import { personaHref } from './persona.js';
import { ensure } from './portal.js';
import { markDirty } from '../nucleo/enlace.js';
import { actions } from '../nucleo/registro.js';
import { refreshList } from './horarios.js';
// ------------------------------------------------------------------ ALERTAS DEL ENCARGADO
export const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };
export const SEV_ORDER = ['critica', 'alta', 'media', 'baja'];
const CAT = { critica: 'No vale', reglas: 'Reglas', desfase: 'Desfase', cobertura: 'Cobertura', horas: 'Horas', reparto: 'Reparto', preferencias: 'Preferencias', personal: 'Personal', contexto: 'Aviso', plantilla: 'Plantilla' };

export function sevBadges(res) {
  const parts = SEV_ORDER.filter((k) => res && res[k]).map((k) => `<span class="sev-badge ${k}" title="${SEV[k]}">${res[k]}</span>`);
  return parts.length ? `<span class="sev-badges">${parts.join('')}</span>` : '<span class="muted">—</span>';
}

export function alertCard(a, { global = false, sid = null } = {}) {
  const id = sid ?? a.horario_id;
  const rec = a.reconocida;
  return `<article class="alert ${a.severidad}${rec ? ' done' : ''}">
    <header><span class="sev-badge ${a.severidad}">${SEV[a.severidad]}</span><b>${esc(a.titulo)}</b><span class="cat">${CAT[a.categoria] || ''}</span><span class="imp" title="Importancia de 0 a 100">${a.importancia}</span></header>
    <p>${esc(a.detalle)}</p>
    ${a.sugerencia ? `<p class="small muted">${esc(a.sugerencia)}</p>` : ''}
    ${a.cambiada ? '<p class="small" style="color:var(--warn)"><b>Había sido reconocida, pero ha cambiado.</b></p>' : ''}
    ${a.regenerar_desde ? `<p class="regen">Regenerar a partir del ${esc(fmtLong(a.regenerar_desde))}</p>` : ''}
    ${rec ? `<p class="small muted">Reconocida por ${esc(rec.usuario)}${rec.nota ? `: «${esc(rec.nota)}»` : ''}</p>` : ''}
    <footer class="no-print">
      ${global ? `<a class="btn small" href="#/horarios/${id}">Abrir horario · ${esc(fmtRange(a.horario_desde, a.horario_hasta))}</a>` : ''}
      ${a.regenerar_desde && !global ? `<button class="btn small primary" data-act="regenerate" data-desde="${esc(a.regenerar_desde)}">Regenerar desde esa fecha</button>` : ''}
      ${rec ? `<button class="btn small" data-act="reopenAlert" data-sid="${id}" data-clave="${esc(a.clave)}">Reabrir</button>`
        : a.severidad === 'critica' ? '' : `<button class="btn small" data-act="ackAlert" data-sid="${id}" data-clave="${esc(a.clave)}">Reconocer</button>`}
    </footer>
  </article>`;
}

export function alertsPanel(cur) {
  const rep = cur.alertas_detalle;
  const act = rep.activas, rec = rep.reconocidas;
  const regen = rep.regenerar_desde
    ? `<div class="notice warn no-print" style="margin-bottom:12px"><span>El horario ya no coincide con la configuración actual (ausencias aprobadas, saldo de horas…). <b>Hay que regenerarlo a partir del ${esc(fmtLong(rep.regenerar_desde))}.</b> Los días anteriores se mantienen tal cual.</span><span class="spacer"></span><button class="btn primary" data-act="regenerate" data-desde="${esc(rep.regenerar_desde)}">Regenerar desde esa fecha</button></div>` : '';
  if (!act.length && !rec.length) return '<div class="notice ok section">Todo en orden: sin alertas. El horario cubre la demanda y cumple todas las reglas.</div>';
  const cards = (list) => list.map((a) => alertCard(a, { sid: cur.id })).join('');
  const top = act.slice(0, 5), more = act.slice(5);
  const solve = act.length ? '<div class="notice info no-print" style="margin-bottom:12px"><span class="small">El solucionador busca los mínimos cambios en este horario para arreglar sus alertas (por ejemplo, pasar turnos de quien va sobrado de horas a quien va corto) y te los enseña antes de aplicarlos.</span><span class="spacer"></span><button class="btn primary" data-act="solve">Solucionar problemas</button></div>' : '';
  const criticas = (rep.resumen && rep.resumen.critica) || cur.alertas.critica;
  return `<div class="section alerts-panel"><details class="alerts-fold"${criticas ? ' open' : ''}><summary><h2>Alertas ${sevBadges(rep.resumen)}</h2><span class="small muted fold-hint">Revisar</span></summary>${regen}${solve}
    ${act.length ? `<div class="alert-list">${cards(top)}</div>` : '<div class="notice ok">No quedan alertas por revisar.</div>'}
    ${more.length ? `<details class="alert-more"><summary>Ver ${more.length} más</summary><div class="alert-list">${cards(more)}</div></details>` : ''}
    ${rec.length ? `<details class="alert-more"><summary>Reconocidas (${rec.length})</summary><div class="alert-list">${cards(rec)}</div></details>` : ''}
    ${(cur.sugerencias || []).length ? `<details class="alert-more no-print"><summary>Qué cambiar en la configuración (${cur.sugerencias.length})</summary><p class="small muted">Las alertas que no se arreglan moviendo turnos suelen venir de la configuración. Estos cambios ayudarían; después, regenera el horario.</p>${suggestionsHtml(cur.sugerencias)}</details>` : ''}
  </details></div>`;
}

// Cambios de configuración que ayudarían con las alertas que no se arreglan moviendo turnos.
const PANTALLA = { equipo: 'Equipo', turnos: 'Turnos', demanda: 'Demanda', reglas: 'Reglas' };
function suggestionsHtml(list) {
  if (!list || !list.length) return '';
  return `<div class="suggestions">${list.map((s) => `<article class="card suggestion">
    <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><b style="flex:1">${esc(s.titulo)}</b>
      <button class="btn small no-print" data-act="goTo" data-to="${esc(s.pantalla)}">Ir a ${PANTALLA[s.pantalla] || s.pantalla}</button></div>
    <p class="small" style="margin:6px 0 0">${esc(s.detalle)}</p></article>`).join('')}</div>`;
}

// Propuesta del solucionador: qué cambia, cómo quedan las horas y qué alertas se resuelven.
export function fixDialog(p) {
  const cfg = state.config;
  const lista = (titulo, items, cls = '') => (items.length ? `<details class="alert-more"${cls ? ` open` : ''}><summary>${titulo} (${items.length})</summary>
    <ul class="fix-alerts ${cls}">${items.map((a) => `<li><span class="sev-badge ${a.severidad}">${SEV[a.severidad]}</span> ${esc(a.detalle)}</li>`).join('')}</ul></details>` : '');
  const motivos = (p.motivos.length ? `<h3 style="margin-top:16px">Lo que no se puede arreglar así</h3><ul class="fix-list muted small">${p.motivos.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : '')
    + ((p.sugerencias || []).length ? `<h3 style="margin-top:16px">Qué cambiar en la configuración</h3><p class="small muted" style="margin-top:-4px">Esto no lo arregla mover turnos, pero sí estos cambios. Después, regenera el horario.</p>${suggestionsHtml(p.sugerencias)}` : '');
  const plantilla = p.plantilla.length ? `<h3 style="margin-top:16px">Plantilla frente a demanda</h3>
    <div class="table-wrap"><table class="list"><thead><tr><th>Semana</th><th class="num">Demanda</th><th class="num">Contratos</th><th class="num">Máximo con extra</th></tr></thead>
    <tbody>${p.plantilla.map((w) => {
      const cls = w.demanda > w.maximo + 0.5 ? 'fix-off' : w.demanda > w.contrato + 1 ? 'fix-off' : '';
      return `<tr><td>${esc(fmtRange(w.desde, w.hasta))}</td><td class="num"><span class="${cls}">${fmtH(w.demanda)} h</span></td><td class="num">${fmtH(w.contrato)} h</td><td class="num">${fmtH(w.maximo)} h</td></tr>`;
    }).join('')}</tbody></table></div>
    <p class="small muted" style="margin:6px 0 0">Horas-persona que pide la demanda, horas de contrato sin las ausencias y lo máximo que podría hacer la plantilla con las horas extra permitidas.</p>` : '';
  if (!p.mejora) {
    return `<h2>Solucionar problemas</h2><div class="notice info small">${esc(p.mensaje)}</div>${motivos}${plantilla}
      <div class="row end" style="margin-top:16px"><button class="btn primary" data-act="closeOverlay">Entendido</button></div>`;
  }
  const n = p.cambios.length;
  const horas = p.horas.map((x) => horasFila(cfg, x)).join('');
  const errores = p.errores_antes || p.errores_despues
    ? `<p class="small" style="margin:6px 0 0">Reglas incumplidas: <b>${p.errores_antes}</b> → <b>${p.errores_despues}</b></p>` : '';
  return `<h2>Solucionar problemas</h2>
    <p style="margin-top:-6px">${esc(p.mensaje)}</p>
    <div class="notice ok small"><span>Alertas ${sevBadges(p.alertas_antes)} → ${sevBadges(p.alertas_despues)}</span>${errores}</div>
    <h3 style="margin-top:16px">Cambios</h3>
    <ul class="fix-list">${p.movimientos.map((m) => `<li>${esc(m.texto)}</li>`).join('')}</ul>
    ${horas ? `<h3 style="margin-top:16px">Horas de quien cambia</h3><div class="table-wrap"><table class="list"><thead><tr><th>Persona</th><th class="num">Le tocan</th><th class="num">Antes → después</th></tr></thead><tbody>${horas}</tbody></table></div>` : ''}
    <div style="margin-top:12px">${lista('Alertas que se resuelven', p.resueltas)}${lista('Alertas que mejoran', p.mejoradas)}
    ${lista('Alertas nuevas', p.nuevas, 'warn')}${lista('Alertas que empeoran', p.empeoradas, 'warn')}</div>
    ${motivos}${plantilla}
    ${p.estado === 'publicado' ? '<div class="notice warn small" style="margin-top:12px">El horario está publicado: quien cambie lo verá en su portal y te quedará pendiente avisar por Slack.</div>' : ''}
    <p class="small muted">Los cambios manuales bloqueados no se tocan, y los cambios que apliques no quedan bloqueados.</p>
    <div class="row end" style="margin-top:16px"><button class="btn" data-act="closeOverlay">Cancelar</button><button class="btn primary" data-act="applyFix">Aplicar ${n} cambio${n > 1 ? 's' : ''}</button></div>`;
}

// Qué espera al encargado, de lo más urgente a lo menos, cada cosa con un solo enlace al sitio exacto.
export function pendientes(d) {
  const me = state.me || {};
  const filas = [];
  const critica = d.horarios.find((h) => h.resumen && h.resumen.critica);
  if (d.resumen.critica) filas.push({ nivel: 'crit', texto: `${d.resumen.critica} ${d.resumen.critica === 1 ? 'alerta crítica' : 'alertas críticas'}: el horario no vale hasta arreglarlas`, href: critica ? `#/horarios/${critica.id}` : '#/alertas', accion: 'Arreglar' });
  if (me.pendientes) filas.push({ nivel: 'alta', texto: `${me.pendientes} ${me.pendientes === 1 ? 'solicitud' : 'solicitudes'} por resolver`, href: '#/solicitudes', accion: 'Resolver' });
  if (me.arreglos_pendientes) filas.push({ nivel: 'alta', texto: 'Hay un arreglo listo para revisar antes de publicar', href: '#/horarios', accion: 'Revisar' });
  for (const h of d.horarios.filter((x) => x.estado === 'borrador').slice(0, 5)) {
    filas.push({ nivel: 'media', texto: `Borrador del ${fmtRange(h.desde, h.hasta)} sin publicar`, href: `#/horarios/${h.id}`, accion: 'Abrir' });
  }
  if (me.accesos) filas.push({ nivel: 'media', texto: `${me.accesos} ${me.accesos === 1 ? 'acceso' : 'accesos'} con Google por aprobar`, href: '#/ajustes', accion: 'Revisar' });
  return filas;
}

function pendienteHtml(d) {
  const filas = pendientes(d);
  return `<section class="section pendiente" aria-labelledby="pendiente-t"><h2 id="pendiente-t">Qué hay pendiente</h2>
    ${filas.length ? `<ul class="pendiente-lista">${filas.map((f) => `<li class="pendiente-fila ${f.nivel}"><span>${esc(f.texto)}</span><a class="btn small" href="${f.href}">${f.accion}</a></li>`).join('')}</ul>`
      : '<div class="card empty">Nada pendiente. Los horarios están en orden y no hay solicitudes por resolver.</div>'}</section>`;
}

export function viewAlertas() {
  const e0 = ensure(state.alg, 'data', '/api/alertas'); if (e0) return e0;
  const d = state.alg.data, f = state.alf;
  const lista = d.alertas.filter((a) => (!f.sev || a.severidad === f.sev) && (!f.cat || a.categoria === f.cat));
  const cats = [...new Set(d.alertas.map((a) => a.categoria))];
  const chip = (kind, k, label, n) => `<button type="button" class="chip ${f[kind] === k ? 'on' : ''}" data-act="alFiltro" data-kind="${kind}" data-k="${k ?? ''}">${label}${n != null ? ` <b>${n}</b>` : ''}</button>`;
  const regen = d.horarios.filter((h) => h.regenerar_desde);
  return `${head('Alertas', 'Todo lo que conviene revisar de los horarios que aún no han terminado, de más a menos importante. Cada alerta tiene una importancia de 0 a 100.')}
  ${pendienteHtml(d)}
  ${regen.length ? `<div class="stack section" style="gap:10px">${regen.map((h) => `<div class="notice warn"><span>El horario del <b>${esc(fmtRange(h.desde, h.hasta))}</b> hay que regenerarlo a partir del <b>${esc(fmtLong(h.regenerar_desde))}</b>.</span><span class="spacer"></span><a class="btn small primary" href="#/horarios/${h.id}">Abrir horario</a></div>`).join('')}</div>` : ''}
  <div class="row section" style="gap:8px">
    ${chip('sev', null, 'Todas', d.alertas.length)}${SEV_ORDER.map((k) => chip('sev', k, SEV[k], d.resumen[k])).join('')}
  </div>
  <div class="row" style="gap:8px;margin-top:8px">${chip('cat', null, 'Cualquier tipo')}${cats.map((c) => chip('cat', c, CAT[c] || c)).join('')}</div>
  <div class="section">${lista.length ? `<div class="alert-list">${lista.map((a) => alertCard(a, { global: true })).join('')}</div>`
    : `<div class="card empty">${d.alertas.length ? 'Ninguna alerta con ese filtro.' : 'No hay alertas. Los horarios próximos cubren la demanda y cumplen las reglas.'}</div>`}</div>`;
}

function covRanges(pasos, res, pred) {
  const out = [];
  for (const [t, req, cov] of pasos) {
    if (!pred(req, cov)) continue;
    const last = out[out.length - 1];
    if (last && last[1] === t && last[2] === req - cov) last[1] = t + res; else out.push([t, t + res, req - cov]);
  }
  return out;
}

export function coverageBar(day) {
  if (!day) return '';
  if (day.cerrado) return '<div class="small muted" style="margin-top:6px">Cerrado</div>';
  const res = state.config.reglas.resolucion_minutos;
  const pasos = day.pasos;
  if (!pasos.length) return '';
  const gaps = covRanges(pasos, res, (r, c) => c < r);
  const title = gaps.length ? `Falta gente: ${gaps.map(([a, b, n]) => `${fmtMin(a)}–${fmtMin(b)} (${n})`).join(', ')}` : 'Demanda cubierta todo el día';
  return `<div class="covbar" title="${esc(title)}" aria-label="${esc(title)}">${pasos.map(([t, req, cov]) => `<i class="${cov < req ? 'short' : cov > req ? 'extra' : req ? 'ok' : 'none'}"></i>`).join('')}</div>`;
}

export function weeksGrid(cur) {
  const cfg = state.config;
  const h = cur.horario;
  const conPuestos = usaPuestos(cfg);
  const by = new Map(h.asignaciones.map((a) => [`${a.empleado_id}|${a.fecha}`, a]));
  const locks = new Map(h.bloqueos.map((l) => [`${l.empleado_id}|${l.fecha}`, l]));
  const errCells = new Set(h.incidencias.filter((i) => i.nivel === 'error' && i.fecha && i.empleado_id).map((i) => `${i.empleado_id}|${i.fecha}`));
  const emps = cfg.empleados.filter((e) => e.activo || h.asignaciones.some((a) => a.empleado_id === e.id));
  let start = addDays(h.desde, -weekday(h.desde));
  let html = '';
  while (start <= h.hasta) {
    const inP = (d) => d >= h.desde && d <= h.hasta;
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).filter(inP);
    html += `<div class="week"><div class="week-head"><h2 style="margin:0">Semana del ${dayNum(start)} de ${monthName(start)}</h2>${days.length < 7 ? `<span class="small muted">${days.length === 1 ? 'solo 1 día' : `solo ${days.length} días`} de esta semana entran en el periodo</span>` : ''}</div>
    <div class="sched-wrap" style="${days.length < 7 ? `max-width:${236 + days.length * 150}px` : ''}"><table class="sched" style="min-width:${220 + days.length * 105}px"><thead><tr><th class="emp">Equipo</th>
    ${days.map((d) => inP(d) ? `<th><button class="dname dlink" data-act="openDay" data-date="${d}" title="Ver el día ${esc(fmtLong(d))}">${DAY_SHORT[weekday(d)]} ${dayNum(d)}</button><div class="dtype">${esc(cur.cobertura[d]?.tipo || '')}</div>${coverageBar(cur.cobertura[d])}</th>` : `<th class="out"><div class="dname muted">${DAY_SHORT[weekday(d)]} ${dayNum(d)}</div></th>`).join('')}
    <th class="tot">Horas</th></tr></thead><tbody>
    ${emps.map((e) => {
      let mins = 0;
      const cells = days.map((d) => {
        if (!inP(d)) return '<td class="out"></td>';
        const key = `${e.id}|${d}`;
        const a = by.get(key);
        const sid = a && a.turno_id;
        const s = sid && shiftById(cfg, sid);
        const hs = s && horasDe(cfg, a);
        const lock = locks.get(key);
        const absence = cfg.ausencias.find((a) => a.empleado_id === e.id && a.desde <= d && d <= a.hasta);
        const fixedOff = (e.libranzas_fijas || []).includes(DAYS[weekday(d)]);
        let inner;
        if (s) {
          mins += toMin(hs.fin) - toMin(hs.inicio);
          inner = `<span class="pill${a.inicio ? ' custom' : ''}" style="background:${esc(s.color || 'var(--track)')}">${esc(s.id)}${conPuestos ? puestoTag(puestoDe(cfg, a)) : ''}<small>${hs.inicio}–${hs.fin}</small>${rolTag(rolDe(cfg, a))}</span>`;
        }
        else if (sid) inner = `<span class="abs">${esc(sid)}?</span>`;
        else if (absence) inner = `<span class="abs">${esc(MOTIVOS[absence.motivo] || absence.motivo)}</span>`;
        else inner = `<span class="off">${fixedOff ? 'libra' : 'libre'}</span>`;
        const label = `${e.nombre}, ${fmtLong(d)}: ${s ? `${s.nombre} ${hs.inicio}–${hs.fin}${conPuestos ? `, ${PUESTOS[puestoDe(cfg, a)]}` : ''}${rolDe(cfg, a) ? `, ${rolDe(cfg, a).nombre}` : ''}` : 'libre'}${lock ? ' (cambio manual)' : ''}`;
        return `<td><button class="cell ${errCells.has(key) ? 'has-error' : ''} ${fixedOff && !s ? 'fixed-off' : ''}" data-act="cell" data-emp="${esc(e.id)}" data-date="${d}" aria-label="${esc(label)}">${inner}${lock ? `<span class="lock">${ICON.lock}</span>` : ''}</button></td>`;
      }).join('');
      return `<tr><td class="emp"><a class="emp-link" href="${personaHref(e.id, start)}" title="Ver el horario de ${esc(e.nombre)}">${esc(e.nombre)}</a><small>${esc(horasPersona(e))} · ${esc(tipoDe(e))}</small>${capTags(funcionesDe(cfg, e), abreviaturas(cfg))}</td>${cells}<td class="tot">${fmtH(mins / 60)} h</td></tr>`;
    }).join('')}
    </tbody></table></div></div>`;
    start = addDays(start, 7);
  }
  return html;
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
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
});
