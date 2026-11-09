import { DAYS, DAY_CHIP, DAY_LABEL, ICON, MOTIVOS, addDays, clone, daysBetween, esc, fmtH, fmtLong, fmtRange, fmtStamp, iso, toMin, todayIso } from '../nucleo/util.js';
import { api, state } from '../nucleo/estado.js';
import { head, mic, renderView } from '../nucleo/pintado.js';
// ------------------------------------------------------------------ utilidades del portal
export const CLASES = { horas: 'Horas distintas', turno: 'Turno distinto', no_trabajado: 'No trabajé', extra: 'Día extra' };
const ESTADO_BADGE = { pendiente: ['warn', 'Pendiente'], aprobada: ['publicado', 'Aprobada'], rechazada: ['bad', 'Rechazada'] };
export const pad2 = (n) => String(n).padStart(2, '0');
export function monthBounds(offset = 0) {
  const t = todayIso(); let y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) + offset;
  while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
  return [`${y}-${pad2(m)}-01`, iso(new Date(Date.UTC(y, m, 0)))];
}
export const shiftText = (turnos, id) => { const s = turnos.find((t) => t.id === id); return s ? `${s.nombre} · ${s.inicio}–${s.fin}` : '—'; };
export const shiftHours = (turnos, id) => { const s = turnos.find((t) => t.id === id); return s ? (toMin(s.fin) - toMin(s.inicio)) / 60 : 0; };
export const signed = (x) => `${x > 0 ? '+' : ''}${fmtH(x)} h`;
export const reqBadge = (e) => { const [c, l] = ESTADO_BADGE[e] || ['neutral', e]; return `<span class="badge ${c}">${l}</span>`; };

// Carga una vez un dato del servidor; devuelve HTML si aún no se puede pintar la vista (cargando o error).
export function ensure(holder, key, url) {
  if (holder[key] === undefined) {
    holder[key] = null;
    api('GET', url).then((v) => { holder[key] = v; renderView(); }).catch((e) => { holder[key] = { error: e.message }; renderView(); });
  }
  const v = holder[key];
  if (!v) return '<div class="empty">Cargando…</div>';
  if (v.error) return `<div class="card"><div class="notice warn">${esc(v.error)}</div></div>`;
  return null;
}

function periodBar(h, holder) {
  return `<div class="card"><div class="row" style="align-items:flex-end;gap:12px">
    <label class="field">Desde<input type="date" value="${h.desde}" data-act-change="periodo" data-h="${holder}" data-k="desde"></label>
    <label class="field">Hasta<input type="date" value="${h.hasta}" data-act-change="periodo" data-h="${holder}" data-k="hasta"></label>
    <button class="chip" data-act="periodoRapido" data-h="${holder}" data-off="0">Este mes</button>
    <button class="chip" data-act="periodoRapido" data-h="${holder}" data-off="-1">Mes anterior</button>
  </div></div>`;
}

export function reqSummary(r, turnos) {
  const d = r.datos;
  if (r.tipo === 'ausencia') return `<b>${MOTIVOS[d.motivo] || 'Ausencia'}</b> · ${fmtRange(d.desde, d.hasta)}<div class="small muted">${daysBetween(d.desde, d.hasta) + 1} días</div>`;
  const real = d.clase === 'no_trabajado' ? 'no trabajó' : d.turno_id ? shiftText(turnos, d.turno_id) : `${d.inicio}–${d.fin}`;
  const prev = d.turno_previsto ? shiftText(turnos, d.turno_previsto) : 'sin turno';
  return `<b>${CLASES[d.clase]}</b> · ${fmtLong(d.fecha)}<div class="small muted">Previsto: ${esc(prev)} → Real: ${esc(real)} (${fmtH(d.minutos / 60)} h)</div>`;
}

function myRequests(p) {
  if (!p.solicitudes.length) return '<p class="muted small">Todavía no has hecho ninguna solicitud.</p>';
  return `<div class="table-wrap"><table class="list"><thead><tr><th>Solicitud</th><th>Motivo</th><th>Estado</th><th></th></tr></thead><tbody>
    ${p.solicitudes.map((r) => `<tr>
      <td>${reqSummary(r, p.turnos)}</td>
      <td class="small">${esc(r.motivo || '—')}</td>
      <td>${reqBadge(r.estado)}${r.respuesta ? `<div class="small muted" style="margin-top:4px">«${esc(r.respuesta)}»</div>` : ''}</td>
      <td>${r.estado === 'pendiente' ? `<button class="btn small" data-act="cancelReq" data-id="${r.id}">Retirar</button>` : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}

// ------------------------------------------------------------------ PORTAL DEL TRABAJADOR
function myNotices(p) {
  const nuevos = (p.avisos || []).filter((a) => !a.leido), vistos = (p.avisos || []).filter((a) => a.leido);
  const item = (a) => `<li class="${a.urgente ? 'urgent' : ''}">${a.urgente ? '<span class="badge bad">Pronto</span> ' : ''}${a.pasado ? '<span class="badge warn">Día pasado</span> ' : ''}${esc(a.texto)} <span class="small muted">· ${esc(fmtStamp(a.creado))}</span></li>`;
  return `${nuevos.length ? `<div class="notice-board section" role="alert"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Tu horario ha cambiado</h2><button class="btn primary small" data-act="readNotices">Entendido</button></div><ul>${nuevos.map(item).join('')}</ul></div>` : ''}
  ${vistos.length ? `<details class="section"><summary class="small muted" style="cursor:pointer">Avisos anteriores (${vistos.length})</summary><ul class="old-notices">${vistos.map(item).join('')}</ul></details>` : ''}`;
}

export function viewMiInicio() {
  const err = ensure(state.mi, 'perfil', '/api/mi/perfil'); if (err) return err;
  const p = state.mi.perfil, today = todayIso();
  const prox = p.proximos.filter((x) => x.fecha >= today).slice(0, 14);
  const links = p.horarios.filter((h) => h.hasta >= addDays(today, -7)).slice(0, 4);
  const pend = p.solicitudes.filter((r) => r.estado === 'pendiente').length;
  return `${head(`Hola, ${esc(p.empleado.nombre)}`, 'Aquí ves tus turnos y tus horas, y puedes pedir vacaciones o avisar de que lo trabajado fue distinto a lo previsto.')}
  ${myNotices(p)}
  <div class="grid">
    <div class="card"><h2>Tus próximos turnos</h2>
      ${prox.length ? `<table class="list"><tbody>${prox.map((x) => `<tr><td><b>${esc(fmtLong(x.fecha))}</b>${x.fecha === today ? ' <span class="badge borrador">Hoy</span>' : ''}</td><td>${esc(x.turno)}</td><td class="num">${x.inicio}–${x.fin}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted small">Todavía no hay turnos publicados para los próximos días.</p>'}
    </div>
    <div class="card"><h2>Horario del equipo</h2>
      ${links.length ? `<table class="list"><tbody>${links.map((h) => `<tr><td><b>${fmtRange(h.desde, h.hasta)}</b></td><td style="text-align:right"><a class="btn small" href="${esc(h.url)}" target="_blank" rel="noopener">Ver</a></td></tr>`).join('')}</tbody></table>`
      : '<p class="muted small">Aún no se ha publicado ningún horario.</p>'}
      <p class="small muted" style="margin-bottom:0">Tus turnos aparecen resaltados.</p>
    </div>
  </div>
  ${myCalendarCard()}
  <div class="card section"><h2>Mis solicitudes${pend ? ` <span class="badge warn">${pend} pendiente${pend > 1 ? 's' : ''}</span>` : ''}</h2>${myRequests(p)}</div>`;
}

// Suscripción al calendario: el enlace es fijo y Google o el iPhone lo vuelven a leer solos.
function calButtons(en, copyAct) {
  return `<div class="row" style="gap:8px;flex-wrap:wrap">
    <a class="btn primary small" href="${esc(en.google)}" target="_blank" rel="noopener">Añadir a Google Calendar</a>
    <a class="btn small" href="${esc(en.webcal)}">Añadir a iPhone o Mac</a>
    <button class="btn small" data-act="${copyAct}" data-url="${esc(en.url)}">Copiar enlace</button>
  </div>`;
}

function myCalendarCard() {
  if (state.mi.cal === undefined) {
    state.mi.cal = null;
    api('GET', '/api/mi/calendario').then((v) => { state.mi.cal = v; renderView(); }).catch(() => { state.mi.cal = { disponible: false }; });
  }
  const c = state.mi.cal;
  if (!c || !c.disponible) return '';
  return `<div class="card section" id="mi-calendario"><h2>Tus turnos en tu calendario</h2>
    <p class="small muted">Suscríbete una vez y tus turnos aparecerán en Google Calendar o en el calendario del iPhone, junto a tus otras citas. Cuando se publique o cambie un horario, se actualiza solo (Google puede tardar unas horas en refrescarlo).</p>
    ${c.enlaces ? `${calButtons(c.enlaces, 'copyCal')}
      <details class="small" style="margin-top:12px"><summary class="muted" style="cursor:pointer">Otros calendarios y privacidad</summary>
        <p>En Outlook u otras apps, usa «Suscribirse desde la web» o «Añadir calendario por URL» y pega el enlace. En Android, añádelo desde Google Calendar en el ordenador y activa la sincronización de ese calendario en el móvil.</p>
        <p>Quien tenga el enlace puede ver tus turnos. Si lo has compartido sin querer, cámbialo: el anterior deja de funcionar y tendrás que suscribirte de nuevo.</p>
        <button class="btn small" data-act="renewCal">Cambiar el enlace</button></details>`
    : '<button class="btn primary" data-act="createCal">Crear mi enlace de calendario</button>'}
  </div>`;
}

export function teamCalendarsCard() {
  const err = ensure(state.calT, 'data', '/api/calendarios'); if (err) return '';
  const d = state.calT.data;
  if (!d.disponible) return '';
  return `<div class="card"><h2>Calendarios del equipo</h2>
    <p class="small muted">Cada persona puede suscribirse a sus turnos desde Google Calendar o el iPhone (lo hace sola desde su Inicio, y el enlace también va en su mensaje de Slack). Desde aquí puedes crear o copiar el enlace para mandárselo por otra vía.</p>
    <table class="list"><tbody>${d.personas.map((p) => `<tr><td><b>${esc(p.nombre)}</b></td><td style="text-align:right">${p.enlaces
      ? `<button class="btn small" data-act="copyCal" data-url="${esc(p.enlaces.url)}">Copiar enlace</button>`
      : `<button class="btn small" data-act="createTeamCal" data-id="${esc(p.empleado_id)}">Crear enlace</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}

export function viewMisHoras() {
  const e0 = ensure(state.mi, 'perfil', '/api/mi/perfil'); if (e0) return e0;
  const h = state.miH; if (!h.desde) [h.desde, h.hasta] = monthBounds(0);
  const title = head('Mis horas', 'Las horas previstas son las de los horarios publicados. Si lo que hiciste fue distinto, solicita una corrección: tu encargado la revisará y, si la aprueba, se ajustarán tus horas.', '<button class="btn primary" data-act="newCorr">Solicitar corrección</button>');
  const err = ensure(h, 'data', `/api/mi/horas?desde=${h.desde}&hasta=${h.hasta}`);
  if (err) return title + periodBar(h, 'miH') + err;
  const d = h.data, p = state.mi.perfil, today = todayIso();
  const pending = new Set(p.solicitudes.filter((r) => r.tipo === 'correccion' && r.estado === 'pendiente').map((r) => r.datos.fecha));
  return `${title}${periodBar(h, 'miH')}
  <div class="tiles section">
    <div class="tile"><span>Previstas</span><b>${fmtH(d.previstas)} h</b></div>
    <div class="tile"><span>Con correcciones aprobadas</span><b>${fmtH(d.ajustadas)} h</b></div>
    <div class="tile ${d.diferencia ? 'warn' : ''}"><span>Diferencia</span><b>${signed(d.diferencia)}</b></div>
    ${d.pendientes ? `<div class="tile"><span>Pendientes de aprobar</span><b>${d.pendientes}</b></div>` : ''}
  </div>
  <div class="card section" style="padding:0">${d.dias.length ? `<div class="table-wrap"><table class="list">
    <thead><tr><th>Día</th><th>Turno previsto</th><th class="num">Previstas</th><th class="num">Ajustadas</th><th>Corrección</th><th></th></tr></thead><tbody>
    ${d.dias.map((x) => `<tr>
      <td><b>${esc(fmtLong(x.fecha))}</b></td>
      <td>${x.turno_id ? esc(shiftText(p.turnos, x.turno_id)) : '<span class="muted">Sin turno</span>'}</td>
      <td class="num">${fmtH(x.previstas)}</td><td class="num"><b>${fmtH(x.ajustadas)}</b></td>
      <td>${x.correccion ? `<span class="badge publicado">${CLASES[x.correccion.clase]}</span>` : ''}${pending.has(x.fecha) ? ' <span class="badge warn">Pendiente</span>' : ''}</td>
      <td style="text-align:right">${x.fecha <= today && !pending.has(x.fecha) ? `<button class="btn small" data-act="corrRow" data-date="${x.fecha}" data-shift="${esc(x.turno_id || '')}">Corregir</button>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="empty">No hay turnos publicados en estas fechas.</div>'}</div>`;
}

export function viewMisVacaciones() {
  const err = ensure(state.mi, 'perfil', '/api/mi/perfil'); if (err) return err;
  const p = state.mi.perfil, today = todayIso();
  const ab = p.ausencias.filter((a) => a.hasta >= today).sort((a, b) => a.desde.localeCompare(b.desde));
  return `${head('Vacaciones y permisos', 'Pide las fechas en las que no puedes trabajar. Tu encargado las aprobará o te dirá si no es posible; hasta entonces el horario las trata como días normales.')}
  <div class="grid">
    <div class="card"><h2>Nueva solicitud</h2>
      <form id="abs-form" class="stack" style="gap:12px">
        <div class="fields two"><label class="field">Desde<input type="date" name="desde" min="${today}" required></label><label class="field">Hasta<input type="date" name="hasta" min="${today}" required></label></div>
        <label class="field">Tipo<select name="motivo"><option value="vacaciones">Vacaciones</option><option value="permiso">Permiso</option><option value="otro">Otro</option></select></label>
        <label class="field">Nota para tu encargado (opcional)<textarea name="nota" rows="2"></textarea></label>${mic("nota")}
        <button class="btn primary" type="submit" style="justify-content:center">Enviar solicitud</button>
      </form></div>
    <div class="card"><h2>Ausencias aprobadas</h2>
      ${ab.length ? `<table class="list"><tbody>${ab.map((a) => `<tr><td><b>${fmtRange(a.desde, a.hasta)}</b></td><td>${MOTIVOS[a.motivo] || ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No tienes ausencias próximas.</p>'}
    </div>
  </div>
  <div class="card section"><h2>Mis solicitudes</h2>${myRequests({ ...p, solicitudes: p.solicitudes.filter((r) => r.tipo === 'ausencia') })}</div>`;
}

export function viewMisPrefs() {
  const err = ensure(state.mi, 'perfil', '/api/mi/perfil'); if (err) return err;
  const p = state.mi.perfil;
  if (!state.mi.prefs) state.mi.prefs = clone(p.preferencias);
  const pr = state.mi.prefs;
  const chipsS = (i, sel) => `<div class="chips">${p.turnos.map((s) => `<button type="button" class="chip ${sel.includes(s.id) ? 'on' : ''}" data-act="miShift" data-i="${i}" data-shift="${esc(s.id)}" aria-pressed="${sel.includes(s.id)}" title="${esc(s.nombre)} ${s.inicio}–${s.fin}">${esc(s.nombre)}</button>`).join('')}</div>`;
  const chipsD = (i, sel) => { const set = new Set(sel || []); return `<div class="chips" role="group">${DAYS.map((d, k) => `<button type="button" class="chip ${set.has(d) ? 'on' : ''}" data-act="miDay" data-i="${i}" data-day="${d}" aria-pressed="${set.has(d)}" title="${DAY_LABEL[k]}">${DAY_CHIP[k]}</button>`).join('')}${!set.size ? '<span class="small muted" style="align-self:center">Todos los días</span>' : ''}</div>`; };
  return `${head('Mis preferencias', 'Dinos qué turnos te vienen mejor o prefieres evitar. Se tienen en cuenta al generar el horario siempre que no deje sin cubrir un pico de trabajo; la importancia indica cuánto te importa.',
    `<button class="btn" data-act="miAddPref">${ICON.plus} Añadir</button><button class="btn primary" data-act="miSavePrefs">Guardar preferencias</button>`)}
  ${state.mi.prefsDirty ? '<div class="notice warn small" style="margin-bottom:12px">Tienes cambios sin guardar.</div>' : ''}
  ${pr.length ? `<div class="grid">${pr.map((x, i) => `<div class="card">
    <label class="field">Preferencia<select data-bind="@mi.prefs.${i}.tipo"><option value="prefiere" ${x.tipo === 'prefiere' ? 'selected' : ''}>Prefiero estos turnos</option><option value="evita" ${x.tipo === 'evita' ? 'selected' : ''}>Prefiero evitar estos turnos</option></select></label>
    <div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Turnos</div>${chipsS(i, x.turnos)}</div>
    <div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Qué días</div>${chipsD(i, x.dias)}</div>
    <div class="row" style="margin-top:12px;align-items:flex-end">
      <label class="field" style="flex:1">Importancia: <b style="color:var(--ink)">${x.peso}</b> de 10<input type="range" min="1" max="10" value="${x.peso}" data-type="int" data-bind="@mi.prefs.${i}.peso" data-rerender></label>
      <button class="icon-btn" data-act="miDelPref" data-i="${i}" title="Quitar">${ICON.trash}</button>
    </div></div>`).join('')}</div>` : '<div class="card empty">Sin preferencias. El horario se hará solo según la demanda y las reglas.</div>'}`;
}

