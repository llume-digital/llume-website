// Lopita & Co · Horarios — interfaz web (sin dependencias)

// ------------------------------------------------------------------ utilidades
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const DAY_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAY_CHIP = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MOTIVOS = { vacaciones: 'Vacaciones', baja: 'Baja', permiso: 'Permiso', otro: 'Otro' };
const TIPOS_TURNO = { apertura: 'Apertura', normal: 'Normal', cierre: 'Cierre' };

const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(parseDate(s).getTime() + n * 864e5));
const weekday = (s) => (parseDate(s).getUTCDay() + 6) % 7;
const todayIso = () => { const t = new Date(); return iso(new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()))); };
const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 864e5);
const dayNum = (s) => Number(s.slice(8));
const monthName = (s) => MONTHS[Number(s.slice(5, 7)) - 1];
const fmtShort = (s) => `${DAY_SHORT[weekday(s)]} ${dayNum(s)}`;
const fmtLong = (s) => `${DAY_LABEL[weekday(s)].toLowerCase()} ${dayNum(s)} de ${monthName(s)}`;
const fmtRange = (a, b) => {
  const y = b.slice(0, 4);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${dayNum(a)}–${dayNum(b)} de ${monthName(b)} ${y}`;
  return `${dayNum(a)} de ${monthName(a)} – ${dayNum(b)} de ${monthName(b)} ${y}`;
};
const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const fmtH = (x) => `${Math.round(x * 100) / 100}`.replace('.', ',');
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
const uid = (base, taken) => { let id = slug(base), n = 2; const set = new Set(taken); while (set.has(id)) id = `${slug(base)}-${n++}`; return id; };
const clone = (o) => JSON.parse(JSON.stringify(o));
const fmtStamp = (s) => { if (!s) return ''; const d = new Date(s); return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

const ICON = {
  lock: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 9V7a5 5 0 0 0-10 0v2H5v13h14V9h-2Zm-8-2a3 3 0 0 1 6 0v2H9V7Z"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  // Iconos de la barra de cuenta: en el móvil sustituyen al texto para que la barra quepa en una línea.
  guia: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>',
  comentar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>',
  cuenta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  salir: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/></svg>',
  mic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

// ------------------------------------------------------------------ estado y API
const state = {
  me: null, config: null, draft: null, version: null, dirty: false, saveError: null,
  schedules: [], current: null, gen: null, ajustes: null, showPast: false, loading: false,
  mi: {}, miH: {}, inf: {}, sol: {}, web: {}, alg: {}, calT: {}, alf: { sev: null, cat: null }, fix: null,
  vista: 'semana', diaFecha: null, dia: null, diaEval: null,
  cal: { modo: 'semana', ref: null, persona: '', data: {} },
};

async function api(method, url, body) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  const isJson = (r.headers.get('content-type') || '').includes('json');
  const data = isJson ? await r.json() : await r.text();
  if (r.status === 401 && !url.endsWith('/login')) { state.me = null; render(); throw new Error('Tu sesión ha caducado'); }
  if (!r.ok) {
    const d = isJson ? data.detail : data;
    const err = new Error(typeof d === 'string' ? d : JSON.stringify(d));
    err.status = r.status; err.data = isJson ? data : null;
    throw err;
  }
  if (method !== 'GET' && !url.includes('/api/login') && !url.includes('/api/logout') && state.me && state.me.rol === 'admin') { state.alg = {}; queueBadges(); }
  return data;
}

// Las insignias de la barra (alertas, solicitudes) se actualizan tras cualquier cambio del encargado.
let badgeTimer = null;
function queueBadges() {
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(async () => {
    try {
      const me = await api('GET', '/api/me');
      if (!state.me) return;
      state.me.alertas = me.alertas; state.me.pendientes = me.pendientes; state.me.criticas = me.criticas;
      state.me.notificaciones = me.notificaciones; state.me.mensajes_web = me.mensajes_web;
      const tabs = $('#tabs'); if (tabs) tabs.innerHTML = tabsHtml(route().name);
      if (me.notificaciones) showNotifications();
      if (me.arreglos_pendientes) arreglarPendientes();
    } catch { /* la insignia es informativa: si falla no pasa nada */ }
  }, 400);
}

// Sin servidor, guardar una ausencia o una baja responde al momento y el arreglo de los horarios afectados
// (que en el móvil puede tardar un rato) se pide aparte, con un aviso fijo mientras dura.
let arreglando = null;
function arreglarPendientes() {
  if (arreglando) return arreglando;
  const aviso = document.createElement('div');
  aviso.className = 'toast fijo';
  aviso.setAttribute('role', 'status');
  aviso.textContent = 'Ajustando los horarios afectados por el cambio… Puede tardar un poco; lo guardado ya está a salvo.';
  document.body.appendChild(aviso);
  arreglando = (async () => {
    try {
      const r = await api('POST', '/api/arreglos');
      if (state.me) state.me.arreglos_pendientes = false;
      if (r.arreglos.length) {
        state.current = null;
        await refreshList();
        if (!state.dirty) renderView();
        showNotifications();
      }
    } catch (e) {
      toast(`No se pudieron ajustar los horarios: ${e.message}`, true);
    } finally {
      aviso.remove();
      arreglando = null;
    }
  })();
  return arreglando;
}

// Avisos al encargado (generación que no vale, arreglo preparado tras una ausencia): salen en una ventana
// en cuanto hay alguno sin leer, sin tapar otra ventana abierta (se enseñan al cerrarla).
async function showNotifications() {
  if (document.querySelector('.overlay [data-act="readNotifications"]')) return;  // ya se están viendo
  if (document.querySelector('.overlay')) { state.notifPending = true; return; }
  let list;
  try { list = (await api('GET', '/api/notificaciones')).filter((n) => !n.leida_at); } catch { return; }
  if (!list.length || document.querySelector('.overlay')) return;
  state.notifPending = false;
  const item = (n) => `<article class="notif ${n.tipo}">
      <h3>${esc(n.titulo)}</h3><p>${esc(n.texto)}</p>
      ${n.detalle.problemas && n.detalle.problemas.length ? `<ul class="small">${n.detalle.problemas.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
      ${n.detalle.turnos && n.detalle.turnos.length ? `<ul class="small notif-turnos">${n.detalle.turnos.map((t) => `<li><b>${esc(fmtLong(t.fecha))}</b> · ${esc(t.turno)} ${esc(t.inicio)}–${esc(t.fin)} <span class="muted">(horario ${esc(t.periodo)}${t.estado === 'publicado' ? ', publicado' : ', borrador'})</span></li>`).join('')}</ul>` : ''}
      <p class="small muted">${esc(fmtStamp(n.created_at))}</p>
      ${n.schedule_id ? `<div class="row end"><button class="btn small primary" data-act="openNotification" data-id="${n.id}" data-sid="${n.schedule_id}">Abrir horario</button></div>` : ''}
      ${n.tipo === 'acceso_pedido' ? `<div class="row end"><button class="btn small primary" data-act="verAccesos" data-id="${n.id}">Ver registros</button></div>` : ''}
    </article>`;
  overlay(`<h2>${list.some((n) => n.detalle && n.detalle.valido === false) ? 'Hay alertas críticas' : 'Avisos'}</h2>
    <div class="stack" style="gap:12px">${list.map(item).join('')}</div>
    <div class="row end" style="margin-top:16px"><button class="btn" data-act="readNotifications">Entendido</button></div>`);
}

function toast(msg, bad = false) {
  document.querySelectorAll('.toast:not(.fijo)').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = `toast${bad ? ' bad' : ''}`;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

function overlay(html) {
  closeOverlay();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
  o.addEventListener('click', (e) => { if (e.target === o && !o.querySelector('.spinner')) closeOverlay(); });
  document.body.appendChild(o);
  return o;
}
function closeOverlay() {
  pararDictado();
  const habia = document.querySelector('.overlay');
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
  if (habia && state.notifPending) setTimeout(showNotifications, 50);
}
function busy(text) { return overlay(`<div class="spinner"></div><h2 style="text-align:center">${esc(text)}</h2><p class="muted small" style="text-align:center;margin:0">Puede tardar hasta medio minuto.</p>`); }

async function withBusy(text, fn) {
  busy(text);
  try { return await fn(); } finally { closeOverlay(); }
}

async function loadConfig() {
  const r = await api('GET', '/api/config');
  state.config = r.config; state.version = r.version; state.draft = clone(r.config);
  state.dirty = false; state.saveError = null;
}

async function saveConfig() {
  try {
    const r = await api('PUT', '/api/config', { config: state.draft, base: state.version });
    state.config = r.config; state.version = r.version; state.draft = clone(r.config);
    state.dirty = false; state.saveError = null;
    toast('Cambios guardados');
    if (r.arreglos && r.arreglos.length) { state.current = null; await refreshList(); }
    renderView();
    showNotifications();
    return true;
  } catch (e) {
    state.saveError = e.message;
    renderSavebar();
    return false;
  }
}

// ------------------------------------------------------------------ enlace de datos (data-bind)
function getPath(root, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), root); }
function setPath(root, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const obj = keys.reduce((o, k) => o[k], root);
  obj[last] = value;
}
function rootFor(path) {
  if (path.startsWith('@gen.')) return [state.gen, path.slice(5), false];
  if (path.startsWith('@mi.')) return [state.mi, path.slice(4), false];
  return [state.draft, path, true];
}
function coerce(el) {
  const t = el.dataset.type || (el.type === 'checkbox' ? 'bool' : el.type === 'number' ? 'num' : 'str');
  if (t === 'bool') return el.checked;
  if (t === 'num') { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? v : 0; }
  if (t === 'int') { const v = parseInt(el.value, 10); return Number.isFinite(v) ? v : 0; }
  if (t === 'nullstr') return el.value.trim() === '' ? null : el.value.trim();
  if (t === 'nullnum') { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? v : null; }
  return el.value;
}
function markDirty() { state.dirty = true; state.saveError = null; renderSavebar(); }

function onBind(e) {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  if (e.type === 'input' && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' || el.type === 'time' || el.type === 'month' || el.type === 'color')) return;
  const [root, path, dirty] = rootFor(el.dataset.bind);
  setPath(root, path, coerce(el));
  if (dirty) markDirty();
  if (el.dataset.bind.startsWith('@mi.')) state.mi.prefsDirty = true;
  if (e.type === 'change' && el.hasAttribute('data-rerender')) renderView();
}

// ------------------------------------------------------------------ pintado general
// Botón de la barra de cuenta: icono y texto; en el móvil solo el icono, así que el nombre va en aria-label.
const botonCuenta = (act, icono, texto, titulo, extra = '') =>
  `<button data-act="${act}"${extra} title="${titulo}" aria-label="${texto}">${ICON[icono]}<span class="ub-txt">${texto}</span></button>`;

function render() {
  const app = $('#app');
  if (!state.me) { app.innerHTML = viewLogin(); botonGoogle($('#g-login'), entrarConGoogle); return; }
  if (state.me.cambiar_clave) { app.innerHTML = viewForcePw(); return; }
  if (!$('.topbar')) {
    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <a class="wordmark" href="#/" aria-label="Lopita & Co · Horarios"><b>LOPITA &amp; CO</b><span>Horarios</span></a>
          <div class="userbox"><span>${esc(state.me.nombre)}</span>${botonCuenta('goGuia', 'guia', 'Guía', 'Cómo funciona la app', ' id="guia-btn"')}${botonCuenta('feedback', 'comentar', 'Comentarios', 'Deja una sugerencia, un fallo o una duda', ' class="fb-btn"')}${botonCuenta('cuentaDialog', 'cuenta', 'Mi cuenta', 'Tu correo, Google y tu contraseña')}${botonCuenta('logout', 'salir', 'Salir', 'Cerrar la sesión')}</div>
        </div>
        <div class="tabsbar"><nav class="tabs" id="tabs" aria-label="Secciones"></nav></div>
      </header>
      <main id="view"></main>
      <div id="savebar"></div>`;
  }
  renderView();
}

const NAV_ADMIN = [
  ['horarios', 'Horarios'], ['calendario', 'Calendario'], ['alertas', 'Alertas'], ['solicitudes', 'Solicitudes'], ['informes', 'Informes'], ['equipo', 'Equipo'], ['funciones', 'Funciones'], ['turnos', 'Turnos'], ['demanda', 'Demanda'],
  ['ausencias', 'Ausencias'], ['preferencias', 'Preferencias'], ['reglas', 'Reglas'], ['web', 'Web'], ['comentarios', 'Comentarios'], ['ajustes', 'Ajustes'],
];
const NAV_WORKER = [['inicio', 'Inicio'], ['horas', 'Mis horas'], ['vacaciones', 'Vacaciones'], ['preferencias', 'Preferencias']];
const isWorker = () => state.me && state.me.rol === 'empleado';

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || (isWorker() ? 'inicio' : 'horarios')).split('/');
  return { name: parts[0], arg: parts[1] };
}

function tabsHtml(name) {
  const w = isWorker();
  const count = (n, label) => (n ? `<span class="tab-count" aria-label="${n} ${label}">${n}</span>` : '');
  const crit = !w && state.me.criticas ? `<span class="tab-count crit" aria-label="${state.me.criticas} alertas críticas">${state.me.criticas}</span>` : '';
  const badge = { solicitudes: w ? '' : count(state.me.pendientes, 'pendientes'), alertas: w ? '' : crit + count(state.me.alertas - (state.me.criticas || 0), 'alertas importantes'), inicio: w ? count(state.me.avisos, 'avisos nuevos') : '', web: w ? '' : count(state.me.mensajes_web, 'mensajes nuevos'), comentarios: w ? '' : count(state.me.comentarios, 'comentarios nuevos'), ajustes: w ? '' : count(state.me.accesos, 'registros pendientes') };
  return (w ? NAV_WORKER : NAV_ADMIN).map(([k, label]) => `<a href="#/${k}" class="${name === k ? 'active' : ''}"${name === k ? ' aria-current="page"' : ''}>${label}${badge[k] || ''}</a>`).join('');
}

// La guía vive en la barra de cuenta (no es una sección): su botón se marca cuando estás en ella.
function marcarGuia(name) {
  const b = $('#guia-btn');
  if (!b) return;
  b.classList.toggle('active', name === 'guia');
  if (name === 'guia') b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
}

function renderView() {
  pararDictado();
  const view = $('#view');
  if (!view) return render();
  const r = route();
  const w = isWorker();
  const views = w
    ? { inicio: viewMiInicio, horas: viewMisHoras, vacaciones: viewMisVacaciones, preferencias: viewMisPrefs, guia: viewGuia }
    : { horarios: r.arg ? () => viewDetalle(Number(r.arg)) : viewHorarios, calendario: viewCalendario, alertas: viewAlertas, solicitudes: viewSolicitudes, informes: viewInformes, equipo: viewEquipo, funciones: viewFunciones, turnos: viewTurnos, demanda: viewDemanda, ausencias: viewAusencias, preferencias: viewPreferencias, reglas: viewReglas, web: viewWeb, comentarios: viewComentarios, ajustes: viewAjustes, guia: viewGuia };
  const name = views[r.name] ? r.name : (w ? 'inicio' : 'horarios');
  // Si había un turno enfocado (teclado), sigue enfocado tras redibujar aunque la vista se recargue por detrás.
  const foco = document.activeElement && document.activeElement.closest && document.activeElement.closest('.g-bar');
  const focoEmp = foco && foco.dataset.emp;
  $('#tabs').innerHTML = tabsHtml(name);
  marcarGuia(name);
  view.innerHTML = views[name]();
  renderSavebar();
  seguirAnclas();  // un menú abierto sigue abierto si su casilla sigue en la vista
  if (focoEmp) { const b = view.querySelector(`.g-bar[data-emp="${CSS.escape(focoEmp)}"]`); if (b) b.focus({ preventScroll: true }); }
  if (name === 'guia' && r.arg && state.guiaVista !== r.arg) {
    state.guiaVista = r.arg;
    const sec = document.getElementById(`guia-${r.arg}`);
    if (sec) { sec.scrollIntoView({ block: 'start' }); sec.classList.add('flash'); }
  }
  if (name !== 'guia') state.guiaVista = null;
}

function renderSavebar() {
  const bar = $('#savebar');
  if (!bar) return;
  if (!state.dirty) { bar.innerHTML = ''; bar.dataset.html = ''; return; }
  const html = `<div class="savebar"><div class="savebar-inner">
    <span>Tienes cambios sin guardar en la configuración.</span><span class="spacer"></span>
    <button class="btn" data-act="discard">Descartar</button>
    <button class="btn primary" data-act="save">Guardar cambios</button>
    ${state.saveError ? `<div class="err" role="alert">No se ha guardado: ${esc(state.saveError)}${state.saveError.includes('ha cambiado') ? ' <button class="btn small" data-act="reloadConfig">Recargar configuración</button>' : ''}</div>` : ''}
  </div></div>`;
  // Sin cambios no se repinta: al salir de un campo para pulsar «Guardar» salta su «change», y rehacer la barra
  // entre el mousedown y el mouseup del botón se comía el clic.
  if (bar.dataset.html === html && bar.firstChild) return;
  bar.dataset.html = html;
  bar.innerHTML = html;
}

function head(title, lead, actions = '') {
  const r = route();
  const ayuda = r.name !== 'guia' && guiaSecciones().some((g) => g.id === r.name)
    ? `<a class="guia-link no-print" href="#/guia/${r.name}">¿Cómo funciona esta pantalla?</a>` : '';
  return `<div class="page-head"><div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}${ayuda}</div>${actions ? `<div class="row">${actions}</div>` : ''}</div>`;
}

// helpers de formulario
const empName = (id) => (state.draft.empleados.find((e) => e.id === id) || {}).nombre || id;
const shiftById = (cfg, id) => cfg.turnos.find((s) => s.id === id);
const PUESTOS = { sala: 'Sala', cocina: 'Cocina' };
// Tipo de empleado: quien trabaja en sala es camarero/a y quien trabaja en cocina, cocinero/a.
const TIPOS = { sala: 'Camarero/a', cocina: 'Cocinero/a' };
const funcionesCfg = (cfg) => cfg.funciones || [];
const funcById = (cfg, id) => funcionesCfg(cfg).find((f) => f.id === id);
// Funciones de una persona: las fijas (abrir, cerrar, encargado) y las que define el encargado.
function funcionesDe(cfg, e) {
  const out = [];
  if (e.puede_abrir) out.push({ nombre: 'Abre', color: '#B0904C' });
  if (e.puede_cerrar) out.push({ nombre: 'Cierra', color: '#764A09' });
  if (e.es_encargado) out.push({ nombre: 'Encargado/a', color: '#17130F' });
  for (const id of e.funciones || []) { const f = funcById(cfg, id); if (f) out.push(f); }
  return out;
}
const funcTags = (cfg, e) => funcionesDe(cfg, e).map((f) => `<span class="func-tag" style="--fc:${esc(f.color || '#764A09')}">${esc(f.nombre)}</span>`).join('');
const tipoDe = (e) => (puestosDe(e).length > 1 ? 'Camarero/a y cocinero/a' : TIPOS[puestosDe(e)[0]]);
// Un comodín no tiene contrato: solo cubre huecos, con un mínimo y un máximo semanales opcionales.
function horasPersona(e) {
  if (!e.comodin) return `${fmtH(e.horas_semanales)} h/sem`;
  const min = e.horas_min_semana, max = e.horas_max_semana;
  if (min && max != null) return `Comodín · ${fmtH(min)}–${fmtH(max)} h/sem`;
  if (max != null) return `Comodín · hasta ${fmtH(max)} h/sem`;
  if (min) return `Comodín · mínimo ${fmtH(min)} h/sem`;
  return 'Comodín';
}
const slackField = (i, e) => `<label class="field">Usuario de Slack<input type="text" placeholder="U01ABC…" value="${esc(e.slack_user_id || '')}" data-type="nullstr" data-bind="empleados.${i}.slack_user_id"></label>`;
function horasField(i, e) {
  if (!e.comodin) return `<label class="field">Horas por semana<input type="number" min="1" max="60" step="0.5" value="${e.horas_semanales}" data-bind="empleados.${i}.horas_semanales"></label>`;
  const num = (campo, label, hint) => `<label class="field">${label}<span class="hint">${hint}</span><input type="number" min="0" max="60" step="0.5" placeholder="Sin ${label.toLowerCase().split(' ')[0]}" value="${e[campo] ?? ''}" data-type="nullnum" data-bind="empleados.${i}.${campo}"></label>`;
  return `${num('horas_min_semana', 'Mínimo por semana', 'Vacío: solo si hace falta')}${num('horas_max_semana', 'Máximo por semana', 'Vacío: sin tope')}`;
}
const empById = (cfg, id) => cfg.empleados.find((e) => e.id === id);
const puestosDe = (e) => (e && e.puestos && e.puestos.length ? e.puestos : ['sala', 'cocina']);
const puestoDe = (cfg, a) => a.puesto || puestosDe(empById(cfg, a.empleado_id))[0];
// Solo se enseñan los puestos si el negocio los usa: alguien hace solo uno, o la demanda pide cocina o sala.
const usaPuestos = (cfg) => cfg.empleados.some((e) => puestosDe(e).length === 1)
  || cfg.tipos_dia.some((t) => t.franjas.some((f) => f.cocina || f.sala))
  || (cfg.excepciones_fecha || []).some((o) => (o.franjas || []).some((f) => f.cocina || f.sala))
  || (cfg.tareas || []).some((t) => t.puesto);
const puestoTag = (p) => `<span class="puesto-tag ${p}" title="${PUESTOS[p]}">${PUESTOS[p][0]}</span>`;
// Roles de un puesto (caja, cafetera, sala, lava para los camareros): cada persona hace uno en su turno.
const esRol = (f) => Boolean(f && f.puesto);
const rolesDe = (cfg, e, p) => (e.funciones || []).filter((id) => { const f = funcById(cfg, id); return f && f.puesto === p; });
const rolDe = (cfg, a) => { const f = a && a.funcion && funcById(cfg, a.funcion); return esRol(f) ? f : null; };
const rolTag = (f) => (f ? `<span class="rol-tag" style="--fc:${esc(f.color || '#764A09')}" title="${esc(f.nombre)}">${esc(f.nombre)}</span>` : '');
// Horas reales de una asignación: las del turno o, si es un turno a medida, las suyas.
const horasDe = (cfg, a) => { const s = shiftById(cfg, a.turno_id); return s ? { inicio: a.inicio || s.inicio, fin: a.fin || s.fin } : null; };
const empOptions = (sel) => state.draft.empleados.map((e) => `<option value="${esc(e.id)}" ${e.id === sel ? 'selected' : ''}>${esc(e.nombre)}${e.activo ? '' : ' (inactivo)'}</option>`).join('');
const shiftOptions = (sel, blank) => (blank ? '<option value="">—</option>' : '') + state.draft.turnos.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.nombre)} (${s.inicio}–${s.fin})</option>`).join('');
const dayTypeOptions = (sel, blank) => (blank ? `<option value="" ${!sel ? 'selected' : ''}>${esc(blank)}</option>` : '') + state.draft.tipos_dia.map((t) => `<option value="${esc(t.nombre)}" ${t.nombre === sel ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('');
function dayChips(path, selected, allLabel) {
  const set = new Set(selected || []);
  return `<div class="chips" role="group">${DAYS.map((d, i) => `<button type="button" class="chip ${set.has(d) ? 'on' : ''}" data-act="toggleDay" data-path="${path}" data-day="${d}" aria-pressed="${set.has(d)}" title="${DAY_LABEL[i]}">${DAY_CHIP[i]}</button>`).join('')}${allLabel && !set.size ? `<span class="small muted" style="align-self:center">${allLabel}</span>` : ''}</div>`;
}
// Dictado por voz para los textos (solicitudes, comentarios…). Usa el reconocimiento de voz del navegador
// (Chrome, Edge, Safari); donde no existe, el botón no aparece y se escribe como siempre.
const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
let dictando = null;
function mic(name) {
  if (!Reconocimiento) return '';
  return `<div class="mic-row"><button type="button" class="btn small mic" data-act="dictar" data-for="${name}" aria-pressed="false">${ICON.mic} Dictar</button><span class="small muted mic-estado" aria-live="polite"></span></div>`;
}
function pararDictado() { if (dictando) { try { dictando.rec.stop(); } catch { /* ya parado */ } } }
function dictar(btn) {
  if (dictando) { const mismo = dictando.btn === btn; pararDictado(); if (mismo) return; }
  const ta = btn.closest('form').querySelector(`textarea[name="${btn.dataset.for}"]`);
  const estado = btn.parentElement.querySelector('.mic-estado');
  const rec = new Reconocimiento();
  rec.lang = 'es-ES'; rec.interimResults = true; rec.continuous = true;
  const base = ta.value.trim();
  let final = '';
  rec.onresult = (ev) => {
    let parcial = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) final += (final ? ' ' : '') + t.trim(); else parcial += t;
    }
    const txt = [final, parcial.trim()].filter(Boolean).join(' ');
    ta.value = [base, txt ? txt.charAt(0).toUpperCase() + txt.slice(1) : ''].filter(Boolean).join(' ');
  };
  rec.onerror = (ev) => {
    estado.textContent = ev.error === 'not-allowed' || ev.error === 'service-not-allowed' ? 'El navegador no deja usar el micrófono: pulsa el candado junto a la dirección, permite el micrófono y vuelve a intentarlo.' : ev.error === 'no-speech' ? 'No se oye nada.' : 'No se pudo dictar.';
  };
  rec.onend = () => { btn.classList.remove('on'); btn.setAttribute('aria-pressed', 'false'); btn.innerHTML = `${ICON.mic} Dictar`; if (estado.textContent === 'Escuchando… habla y pulsa «Parar» al acabar.') estado.textContent = ''; dictando = null; };
  dictando = { rec, btn };
  btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true'); btn.innerHTML = `${ICON.mic} Parar`;
  estado.textContent = 'Escuchando… habla y pulsa «Parar» al acabar.';
  try { rec.start(); } catch { rec.onend(); estado.textContent = 'No se pudo usar el micrófono.'; }
}

function toggle(path, checked, label) {
  return `<label class="toggle"><input type="checkbox" data-bind="${path}" ${checked ? 'checked' : ''}> ${label}</label>`;
}

// ------------------------------------------------------------------ acceso
function viewLogin() {
  return `<div class="login">
    <div class="login-art"><div class="mark">LOPITA &amp; CO</div><div class="rule"></div><div class="tag">Horarios del equipo</div></div>
    <div class="login-form"><form id="login-form">
      <h1>Entrar</h1>
      <p class="muted" style="margin:0">Acceso para el equipo de Lopita.</p>
      <label class="field">Usuario<input type="text" name="usuario" autocomplete="username" required></label>
      <label class="field">Contraseña<input type="password" name="password" autocomplete="current-password" required></label>
      <div class="err small" id="login-err" style="color:var(--bad)" role="alert"></div>
      <button class="btn primary" type="submit" style="justify-content:center">Entrar</button>
      ${state.acceso && state.acceso.google_client_id ? `<div class="g-sep"><span>o</span></div><div id="g-login" class="g-btn"></div>
      <p class="small muted" style="margin:0">Con Google entras si tu correo está en tu cuenta. Si aún no tienes cuenta, te registras y un encargado te da acceso.</p>` : ''}
    </form></div>
  </div>`;
}

// ------------------------------------------------------------------ HORARIOS: lista y generador
function nextMonday() { const t = todayIso(); return addDays(t, 7 - weekday(t)); }
function nextMonth() { const t = todayIso(); let y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) + 1; if (m > 12) { m = 1; y++; } return `${y}-${String(m).padStart(2, '0')}`; }
function genPeriod() {
  const g = state.gen;
  if (g.modo === 'semana') { const d = g.semana || nextMonday(); const mon = addDays(d, -weekday(d)); return [mon, addDays(mon, 6)]; }
  if (g.modo === 'mes') { const [y, m] = (g.mes || nextMonth()).split('-').map(Number); const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); return [`${y}-${String(m).padStart(2, '0')}-01`, `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`]; }
  return [g.desde, g.hasta];
}

function viewHorarios() {
  if (!state.gen) { const mon = nextMonday(); state.gen = { modo: 'semana', semana: mon, mes: nextMonth(), desde: mon, hasta: addDays(mon, 6) }; }
  const g = state.gen;
  const [a, b] = genPeriod();
  const valid = a && b && a <= b && daysBetween(a, b) <= 62;
  const overlaps = valid ? state.schedules.filter((s) => s.desde <= b && s.hasta >= a) : [];
  const list = state.schedules;
  const modeChip = (m, l) => `<button type="button" class="chip ${g.modo === m ? 'on' : ''}" data-act="genMode" data-mode="${m}">${l}</button>`;
  return `${head('Horarios', 'Genera el horario de una semana o un mes. El motor reparte los turnos para cubrir la demanda y cumplir las reglas; luego puedes retocarlo a mano y publicarlo en Slack.')}
  <div class="card">
    <h2>Nuevo horario</h2>
    <div class="row" style="align-items:flex-end;gap:16px">
      <div class="chips">${modeChip('semana', 'Semana')}${modeChip('mes', 'Mes')}${modeChip('fechas', 'Fechas')}</div>
      ${g.modo === 'semana' ? `<label class="field">Cualquier día de la semana<input type="date" data-bind="@gen.semana" data-rerender value="${esc(g.semana)}"></label>` : ''}
      ${g.modo === 'mes' ? `<label class="field">Mes<input type="month" data-bind="@gen.mes" data-rerender value="${esc(g.mes)}"></label>` : ''}
      ${g.modo === 'fechas' ? `<label class="field">Desde<input type="date" data-bind="@gen.desde" data-rerender value="${esc(g.desde)}"></label><label class="field">Hasta<input type="date" data-bind="@gen.hasta" data-rerender value="${esc(g.hasta)}"></label>` : ''}
      <button class="btn primary" data-act="generate" ${valid ? '' : 'disabled'}>Generar horario</button>
    </div>
    <p class="small muted" style="margin:12px 0 0">${valid ? `Del ${fmtLong(a)} al ${fmtLong(b)} (${daysBetween(a, b) + 1} días).` : 'Elige un periodo válido (máximo 9 semanas).'}
    ${overlaps.length ? ` <span style="color:var(--warn)">Ya hay ${overlaps.length === 1 ? 'un horario que se solapa' : `${overlaps.length} horarios que se solapan`} con estas fechas; se creará otro borrador aparte.</span>` : ''}
    ${state.dirty ? ' <span style="color:var(--warn)">Antes de generar se guardarán tus cambios de configuración.</span>' : ''}</p>
  </div>
  <div class="section">
    <h2>Horarios creados</h2>
    ${list.length ? `<div class="card" style="padding:0"><div class="table-wrap"><table class="list">
      <thead><tr><th>Periodo</th><th>Estado</th><th class="num">Huecos</th><th>Alertas</th><th class="num">Errores</th><th>Actualizado</th></tr></thead>
      <tbody>${list.map((s) => `<tr class="click" data-act="open" data-id="${s.id}" tabindex="0">
        <td><b>${fmtRange(s.desde, s.hasta)}</b><div class="small muted">${daysBetween(s.desde, s.hasta) + 1} días · ${s.turnos} turnos${s.bloqueos ? ` · ${s.bloqueos} cambios manuales` : ''}</div></td>
        <td><span class="badge ${s.estado}">${s.estado === 'publicado' ? 'Publicado' : 'Borrador'}</span>${s.reemplaza ? ' <span class="badge warn">Arreglo sin publicar</span>' : ''}${s.cambios_pendientes.length ? ' <span class="badge warn">Cambios sin avisar</span>' : ''}</td>
        <td class="num">${s.huecos ? `<span class="badge bad">${s.huecos}</span>` : '0'}</td>
        <td>${sevBadges(s.alertas)}</td>
        <td class="num">${s.errores ? `<span class="badge bad">${s.errores}</span>` : '0'}</td>
        <td class="small muted">${fmtStamp(s.actualizado)}</td></tr>`).join('')}</tbody></table></div></div>`
    : '<div class="card empty">Aún no hay horarios. Genera el primero arriba.</div>'}
  </div>`;
}

async function refreshList() { state.schedules = await api('GET', '/api/horarios'); }

// ------------------------------------------------------------------ HORARIOS: detalle y cuadrante
function viewDetalle(id) {
  const cur = state.current;
  if (!cur || cur.id !== id) {
    if (!state.loading) {
      state.loading = true;
      api('GET', `/api/horarios/${id}`).then((d) => { state.current = d; }).catch((e) => { toast(e.message, true); location.hash = '#/horarios'; })
        .finally(() => { state.loading = false; renderView(); });
    }
    return '<div class="empty">Cargando horario…</div>';
  }
  const cfg = state.config;
  const h = cur.horario;
  const errors = h.incidencias.filter((i) => i.nivel === 'error');
  const extra = h.resumen.reduce((s, r) => s + r.horas_extra, 0);
  const pend = cur.cambios_pendientes;
  const actions = [
    `<button class="btn" data-act="solve">Solucionar problemas</button>`,
    `<button class="btn" data-act="regenerate">Regenerar</button>`,
    h.bloqueos.length ? `<button class="btn" data-act="clearLocks">Quitar ${h.bloqueos.length === 1 ? 'el bloqueo' : `${h.bloqueos.length} bloqueos`}</button>` : '',
    `<button class="btn" data-act="print">Imprimir</button>`,
    `<button class="btn" data-act="pdf">PDF</button>`,
    `<a class="btn" href="/api/horarios/${cur.id}/csv">Horas (CSV)</a>`,
    cur.url_publica ? `<button class="btn" data-act="copyLink">Copiar enlace</button>` : '',
    cur.estado === 'publicado' ? `<button class="btn" data-act="unpublish">Volver a borrador</button>` : '',
    cur.estado === 'borrador' ? `<button class="btn primary" data-act="publish">${cur.reemplaza ? 'Publicar el arreglo' : 'Publicar y enviar a Slack'}</button>` : '',
    `<button class="btn danger" data-act="deleteSchedule">Eliminar</button>`,
  ].join('');
  return `<p class="no-print" style="margin:0 0 8px"><a href="#/horarios">← Horarios</a></p>
  ${head(`${fmtRange(h.desde, h.hasta)}`, `<span class="badge ${cur.estado}">${cur.estado === 'publicado' ? 'Publicado' : 'Borrador'}</span>
    <span class="small muted">&nbsp;Actualizado ${fmtStamp(cur.actualizado)}${cur.publicado ? ` · publicado ${fmtStamp(cur.publicado)}` : ''}</span>`, '')}
  <div class="row no-print" style="margin:-6px 0 18px">${actions}</div>
  ${scheduleNotices(cur)}
  ${pend.length ? `<div class="notice warn no-print" style="margin-bottom:16px"><span>Has cambiado el horario de <b>${pend.map((p) => esc(nameIn(cfg, p))).join(', ')}</b> después de publicarlo.</span><span class="spacer"></span><button class="btn primary" data-act="notify">Avisar por Slack</button></div>` : ''}
  <div class="stats">
    <div class="stat"><b>${h.asignaciones.length}</b><span>turnos asignados</span></div>
    <div class="stat ${cur.huecos ? 'bad' : ''}"><b>${cur.huecos}</b><span>franjas sin cubrir</span></div>
    <div class="stat ${extra >= 0.5 ? 'warn' : ''}"><b>${fmtH(Math.round(extra * 10) / 10)} h</b><span>horas extra en total</span></div>
    <div class="stat ${errors.length ? 'bad' : ''}"><b>${errors.length}</b><span>reglas incumplidas</span></div>
  </div>
  ${state.vista === 'dia' ? '' : alertsPanel(cur)}
  <div class="section row" style="justify-content:space-between;align-items:flex-start">
    <div class="shift-legend">${cfg.turnos.map((s) => `<span><i style="background:${esc(s.color || '#eee')}"></i><b>${esc(s.id)}</b> ${esc(s.nombre)} ${s.inicio}–${s.fin}</span>`).join('')}</div>
    <div class="cov-legend"><span><i class="ok"></i>Cubierto</span><span><i class="short"></i>Falta gente</span><span><i class="extra"></i>Sobra gente</span><span>${ICON.lock} Cambio manual</span></div>
  </div>
  ${viewSwitch()}
  ${state.vista === 'mes' ? `<p class="small muted no-print" style="margin:8px 0 0">Toca un día para verlo y editarlo hora a hora.</p>${monthOfSchedule(cur)}${summaryTable(h)}` : state.vista === 'dia' ? dayView(cur) : `<p class="small muted no-print" style="margin:8px 0 0">Toca una casilla para cambiar el turno, o el nombre de un día para verlo y editarlo hora a hora. Los cambios manuales quedan bloqueados y se respetan al regenerar.</p>
  ${weeksGrid(cur)}
  ${summaryTable(h)}`}`;
}

function viewSwitch() {
  const chip = (v, l) => `<button type="button" class="chip ${state.vista === v ? 'on' : ''}" data-act="setVista" data-v="${v}" aria-pressed="${state.vista === v}">${l}</button>`;
  return `<div class="row section no-print view-switch" role="group" aria-label="Vista">${chip('dia', 'Día')}${chip('semana', 'Semana')}${chip('mes', 'Mes')}<span class="spacer"></span><a class="small" href="#/calendario">Ver todos los horarios en el calendario</a></div>`;
}

// Avisos de cabecera: si no vale (alertas críticas), si es un arreglo pendiente o si tiene uno, y si se publicó con críticas.
function scheduleNotices(cur) {
  const out = [];
  const n = cur.alertas.critica;
  if (n) {
    const consejo = cur.estado === 'publicado'
      ? 'Ya está publicado: arréglalo cuanto antes o resuélvelo fuera de la app.'
      : 'Arréglalo antes de publicar; si lo vas a resolver fuera de la app, al publicar te pediremos confirmarlo.';
    out.push(`<div class="notice crit no-print"><span><b>Este horario no vale tal cual: tiene ${n} alerta${n > 1 ? 's' : ''} crítica${n > 1 ? 's' : ''}.</b>
      Hay momentos sin nadie en el local, o sin nadie que pueda abrir o cerrar (más abajo, en Alertas). ${consejo}</span></div>`);
  }
  if (cur.reemplaza) {
    out.push(`<div class="notice info no-print"><span>Es un <b>arreglo preparado</b> para el horario publicado. El equipo sigue viendo el publicado hasta que publiques este arreglo; al hacerlo, lo sustituye (mismo enlace) y te quedará avisar por Slack a quien cambie.</span>
      <span class="spacer"></span><a class="btn small" href="#/horarios/${cur.reemplaza}">Ver el publicado</a></div>`);
  }
  if (cur.arreglo_pendiente) {
    out.push(`<div class="notice warn no-print"><span>Hay un <b>arreglo preparado</b> para este horario (por una ausencia) pendiente de que lo revises y lo publiques.</span>
      <span class="spacer"></span><a class="btn small primary" href="#/horarios/${cur.arreglo_pendiente}">Ver el arreglo</a></div>`);
  }
  for (const r of (cur.registro || []).filter((x) => x.accion === 'publicado_con_criticas').slice(0, 1)) {
    out.push(`<div class="notice warn small no-print"><span>Publicado con ${r.detalle.criticas.length} alerta${r.detalle.criticas.length > 1 ? 's' : ''} crítica${r.detalle.criticas.length > 1 ? 's' : ''} por <b>${esc(r.usuario)}</b> el ${esc(fmtStamp(r.created_at))}.</span></div>`);
  }
  return out.length ? `<div class="stack section" style="gap:10px;margin-top:0">${out.join('')}</div>` : '';
}

const nameIn = (cfg, id) => (cfg.empleados.find((e) => e.id === id) || {}).nombre || id;
// Horas de una persona antes y después de un cambio, en rojo si se alejan de su contrato (un comodín no tiene).
function horasFila(cfg, x) {
  const comodin = (cfg.empleados.find((e) => e.id === x.empleado_id) || {}).comodin;
  const tag = (v) => `<span class="${!comodin && Math.abs(v - x.objetivo) > cfg.reglas.margen_periodo_horas ? 'fix-off' : ''}">${fmtH(v)}</span>`;
  return `<tr><td><b>${esc(nameIn(cfg, x.empleado_id))}</b></td><td class="num">${comodin ? '<span class="muted">Comodín</span>' : fmtH(x.objetivo)}</td><td class="num">${tag(x.antes)} → ${tag(x.despues)}</td></tr>`;
}

// ------------------------------------------------------------------ ALERTAS DEL ENCARGADO
const SEV = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };
const SEV_ORDER = ['critica', 'alta', 'media', 'baja'];
const CAT = { critica: 'No vale', reglas: 'Reglas', desfase: 'Desfase', cobertura: 'Cobertura', horas: 'Horas', reparto: 'Reparto', preferencias: 'Preferencias', personal: 'Personal', contexto: 'Aviso', plantilla: 'Plantilla' };

function sevBadges(res) {
  const parts = SEV_ORDER.filter((k) => res && res[k]).map((k) => `<span class="sev-badge ${k}" title="${SEV[k]}">${res[k]}</span>`);
  return parts.length ? `<span class="sev-badges">${parts.join('')}</span>` : '<span class="muted">—</span>';
}

function alertCard(a, { global = false, sid = null } = {}) {
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

function alertsPanel(cur) {
  const rep = cur.alertas_detalle;
  const act = rep.activas, rec = rep.reconocidas;
  const regen = rep.regenerar_desde
    ? `<div class="notice warn no-print" style="margin-bottom:12px"><span>El horario ya no coincide con la configuración actual (ausencias aprobadas, saldo de horas…). <b>Hay que regenerarlo a partir del ${esc(fmtLong(rep.regenerar_desde))}.</b> Los días anteriores se mantienen tal cual.</span><span class="spacer"></span><button class="btn primary" data-act="regenerate" data-desde="${esc(rep.regenerar_desde)}">Regenerar desde esa fecha</button></div>` : '';
  if (!act.length && !rec.length) return '<div class="notice ok section">Todo en orden: sin alertas. El horario cubre la demanda y cumple todas las reglas.</div>';
  const cards = (list) => list.map((a) => alertCard(a, { sid: cur.id })).join('');
  const top = act.slice(0, 5), more = act.slice(5);
  const solve = act.length ? '<div class="notice info no-print" style="margin-bottom:12px"><span class="small">El solucionador busca los mínimos cambios en este horario para arreglar sus alertas (por ejemplo, pasar turnos de quien va sobrado de horas a quien va corto) y te los enseña antes de aplicarlos.</span><span class="spacer"></span><button class="btn primary" data-act="solve">Solucionar problemas</button></div>' : '';
  return `<div class="section alerts-panel"><h2>Alertas ${sevBadges(rep.resumen)}</h2>${regen}${solve}
    ${act.length ? `<div class="alert-list">${cards(top)}</div>` : '<div class="notice ok">No quedan alertas por revisar.</div>'}
    ${more.length ? `<details class="alert-more"><summary>Ver ${more.length} más</summary><div class="alert-list">${cards(more)}</div></details>` : ''}
    ${rec.length ? `<details class="alert-more"><summary>Reconocidas (${rec.length})</summary><div class="alert-list">${cards(rec)}</div></details>` : ''}
    ${(cur.sugerencias || []).length ? `<details class="alert-more no-print" open><summary>Qué cambiar en la configuración (${cur.sugerencias.length})</summary><p class="small muted">Las alertas que no se arreglan moviendo turnos suelen venir de la configuración. Estos cambios ayudarían; después, regenera el horario.</p>${suggestionsHtml(cur.sugerencias)}</details>` : ''}
  </div>`;
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
function fixDialog(p) {
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

function viewAlertas() {
  const e0 = ensure(state.alg, 'data', '/api/alertas'); if (e0) return e0;
  const d = state.alg.data, f = state.alf;
  const lista = d.alertas.filter((a) => (!f.sev || a.severidad === f.sev) && (!f.cat || a.categoria === f.cat));
  const cats = [...new Set(d.alertas.map((a) => a.categoria))];
  const chip = (kind, k, label, n) => `<button type="button" class="chip ${f[kind] === k ? 'on' : ''}" data-act="alFiltro" data-kind="${kind}" data-k="${k ?? ''}">${label}${n != null ? ` <b>${n}</b>` : ''}</button>`;
  const regen = d.horarios.filter((h) => h.regenerar_desde);
  return `${head('Alertas', 'Todo lo que conviene revisar de los horarios que aún no han terminado, de más a menos importante. Cada alerta tiene una importancia de 0 a 100.')}
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

function coverageBar(day) {
  if (!day) return '';
  if (day.cerrado) return '<div class="small muted" style="margin-top:6px">Cerrado</div>';
  const res = state.config.reglas.resolucion_minutos;
  const pasos = day.pasos;
  if (!pasos.length) return '';
  const gaps = covRanges(pasos, res, (r, c) => c < r);
  const title = gaps.length ? `Falta gente: ${gaps.map(([a, b, n]) => `${fmtMin(a)}–${fmtMin(b)} (${n})`).join(', ')}` : 'Demanda cubierta todo el día';
  return `<div class="covbar" title="${esc(title)}" aria-label="${esc(title)}">${pasos.map(([t, req, cov]) => `<i class="${cov < req ? 'short' : cov > req ? 'extra' : req ? 'ok' : 'none'}"></i>`).join('')}</div>`;
}

function weeksGrid(cur) {
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
          inner = `<span class="pill${a.inicio ? ' custom' : ''}" style="background:${esc(s.color || '#eee')}">${esc(s.id)}${conPuestos ? puestoTag(puestoDe(cfg, a)) : ''}<small>${hs.inicio}–${hs.fin}</small>${rolTag(rolDe(cfg, a))}</span>`;
        }
        else if (sid) inner = `<span class="abs">${esc(sid)}?</span>`;
        else if (absence) inner = `<span class="abs">${esc(MOTIVOS[absence.motivo] || absence.motivo)}</span>`;
        else inner = `<span class="off">${fixedOff ? 'libra' : 'libre'}</span>`;
        const label = `${e.nombre}, ${fmtLong(d)}: ${s ? `${s.nombre} ${hs.inicio}–${hs.fin}${conPuestos ? `, ${PUESTOS[puestoDe(cfg, a)]}` : ''}${rolDe(cfg, a) ? `, ${rolDe(cfg, a).nombre}` : ''}` : 'libre'}${lock ? ' (cambio manual)' : ''}`;
        return `<td><button class="cell ${errCells.has(key) ? 'has-error' : ''} ${fixedOff && !s ? 'fixed-off' : ''}" data-act="cell" data-emp="${esc(e.id)}" data-date="${d}" aria-label="${esc(label)}">${inner}${lock ? `<span class="lock">${ICON.lock}</span>` : ''}</button></td>`;
      }).join('');
      return `<tr><td class="emp">${esc(e.nombre)}<small>${esc(horasPersona(e))} · ${esc(tipoDe(e))}</small><span class="func-tags">${funcTags(cfg, e)}</span></td>${cells}<td class="tot">${fmtH(mins / 60)} h</td></tr>`;
    }).join('')}
    </tbody></table></div></div>`;
    start = addDays(start, 7);
  }
  return html;
}

// ------------------------------------------------------------------ VISTA MENSUAL
// Rejilla de calendario (lunes a domingo) de cada mes entre desde y hasta. celda(fecha) devuelve el contenido de
// los días con horario o null para los que no tiene.
function monthGrid(desde, hasta, celda, { titulo = true } = {}) {
  let html = '';
  let m = `${desde.slice(0, 7)}-01`;
  while (m <= hasta) {
    const y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7));
    const ultimo = iso(new Date(Date.UTC(y, mo, 0)));
    let d = addDays(m, -weekday(m));
    const fin = addDays(ultimo, 6 - weekday(ultimo));
    const cells = [];
    while (d <= fin) {
      const enMes = d.slice(0, 7) === m.slice(0, 7);
      const c = enMes ? celda(d) : null;
      cells.push(`<div class="mcell${enMes ? '' : ' other'}${c === null ? ' empty' : ''}${d === todayIso() ? ' today' : ''}">${enMes ? `<div class="mnum">${dayNum(d)}</div>${c || ''}` : ''}</div>`);
      d = addDays(d, 1);
    }
    html += `<div class="month section">${titulo ? `<h2 style="text-transform:capitalize">${monthName(m)} ${y}</h2>` : ''}
      <div class="mgrid">${DAY_SHORT.map((x) => `<div class="mhead">${x}</div>`).join('')}${cells.join('')}</div></div>`;
    m = addDays(ultimo, 1);
  }
  return html;
}

// Contenido de un día en la vista de mes: cobertura, quién trabaja (o el turno de una persona) y un aviso.
function monthDayHtml(cfg, fecha, asigs, cob, { act, attrs = '', persona = '', alertas = 0, borrador = false }) {
  const horasDe2 = (a) => horasDe(cfg, a);
  const lista = asigs.filter((a) => shiftById(cfg, a.turno_id)).sort((a, b) => toMin(horasDe2(a).inicio) - toMin(horasDe2(b).inicio));
  let body;
  if (cob && cob.cerrado) body = '<div class="small muted">Cerrado</div>';
  else if (persona) {
    const a = lista.find((x) => x.empleado_id === persona);
    const e = empById(cfg, persona);
    const aus = cfg.ausencias.find((x) => x.empleado_id === persona && x.desde <= fecha && fecha <= x.hasta);
    body = a ? `<span class="mchip big" style="background:${esc(shiftById(cfg, a.turno_id).color || '#eee')}">${esc(shiftById(cfg, a.turno_id).nombre)}<small>${horasDe2(a).inicio}–${horasDe2(a).fin}</small></span>`
      : `<span class="small muted">${aus ? esc(MOTIVOS[aus.motivo] || 'Ausencia') : e && (e.libranzas_fijas || []).includes(DAYS[weekday(fecha)]) ? 'Libra' : 'Libre'}</span>`;
  } else {
    const max = 6;
    body = lista.slice(0, max).map((a) => `<span class="mchip" style="background:${esc(shiftById(cfg, a.turno_id).color || '#eee')}" title="${esc(`${nameIn(cfg, a.empleado_id)} ${horasDe2(a).inicio}–${horasDe2(a).fin}`)}">${esc(nameIn(cfg, a.empleado_id))} <small>${horasDe2(a).inicio.slice(0, 5).replace(':00', '')}–${horasDe2(a).fin.replace(':00', '')}</small></span>`).join('')
      + (lista.length > max ? `<span class="small muted">+${lista.length - max} más</span>` : '')
      || '<span class="small muted">Nadie</span>';
  }
  const label = `${fmtLong(fecha)}: ${lista.length} ${lista.length === 1 ? 'persona' : 'personas'}${alertas ? `, ${alertas} alertas` : ''}. Abrir el día`;
  return `<button type="button" class="mday" data-act="${act}" data-date="${fecha}" ${attrs} aria-label="${esc(label)}">
    ${alertas || borrador ? `<span class="mflags">${borrador ? '<span class="badge borrador">Borrador</span>' : ''}${alertas ? `<span class="badge warn" title="Alertas de este día">${alertas}</span>` : ''}</span>` : ''}
    <span class="mlist">${body}</span>${cob ? coverageBar(cob) : ''}</button>`;
}

function monthOfSchedule(cur) {
  const cfg = state.config;
  const h = cur.horario;
  const porDia = new Map();
  for (const a of h.asignaciones) { if (!porDia.has(a.fecha)) porDia.set(a.fecha, []); porDia.get(a.fecha).push(a); }
  const alertasDe = (f) => cur.alertas_detalle.activas.filter((a) => a.fecha === f).length;
  return monthGrid(h.desde, h.hasta, (f) => (f < h.desde || f > h.hasta ? null
    : monthDayHtml(cfg, f, porDia.get(f) || [], cur.cobertura[f], { act: 'openDay', alertas: alertasDe(f) })));
}

// ------------------------------------------------------------------ CALENDARIO (todos los horarios juntos)
// Semana a semana o mes a mes, con lo que manda cada día (el horario publicado o, si no hay, el borrador más
// reciente). Tocar un día o un turno abre ese día en su horario para editarlo hora a hora.
function calRango() {
  const c = state.cal;
  if (!c.ref) c.ref = todayIso();
  if (c.modo === 'mes') {
    const y = Number(c.ref.slice(0, 4)), m = Number(c.ref.slice(5, 7));
    return [`${c.ref.slice(0, 7)}-01`, iso(new Date(Date.UTC(y, m, 0)))];
  }
  const lunes = addDays(c.ref, -weekday(c.ref));
  return [lunes, addDays(lunes, 6)];
}

function viewCalendario() {
  const c = state.cal;
  const cfg = state.config;
  const [desde, hasta] = calRango();
  const chip = (v, l) => `<button type="button" class="chip ${c.modo === v ? 'on' : ''}" data-act="calModo" data-v="${v}" aria-pressed="${c.modo === v}">${l}</button>`;
  const titulo = c.modo === 'mes' ? `<span style="text-transform:capitalize">${monthName(desde)}</span> ${desde.slice(0, 4)}` : `Semana del ${fmtRange(desde, hasta)}`;
  const barra = `<div class="card cal-bar no-print"><div class="row" style="gap:10px;align-items:center">
    <div class="chips" role="group" aria-label="Vista">${chip('dia', 'Día')}${chip('semana', 'Semana')}${chip('mes', 'Mes')}</div>
    <div class="row" style="gap:6px"><button class="btn small" data-act="calMover" data-dir="-1" aria-label="Anterior">‹</button>
      <button class="btn small" data-act="calHoy">Hoy</button>
      <button class="btn small" data-act="calMover" data-dir="1" aria-label="Siguiente">›</button></div>
    <h2 style="margin:0">${titulo}</h2><span class="spacer"></span>
    <label class="field inline">Persona<select data-act-change="calPersona"><option value="">Todo el equipo</option>${cfg.empleados.filter((e) => e.activo).map((e) => `<option value="${esc(e.id)}" ${c.persona === e.id ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></label>
  </div></div>`;
  const head0 = head('Calendario', 'Todos los horarios juntos, día a día, semana a semana o mes a mes. Toca un día o un turno para abrirlo y cambiarlo.');
  const key = `${desde}|${hasta}`;
  const err = ensure(c.data, key, `/api/calendario?desde=${desde}&hasta=${hasta}`);
  if (err) return head0 + barra + err;
  const data = c.data[key];
  const porDia = new Map();
  for (const a of data.asignaciones) { if (!porDia.has(a.fecha)) porDia.set(a.fecha, []); porDia.get(a.fecha).push(a); }
  const sinHorario = Object.keys(data.dias).length === 0;
  const aviso = sinHorario ? '<div class="notice info section"><span>No hay ningún horario en estas fechas.</span><span class="spacer"></span><a class="btn small primary" href="#/horarios">Crear un horario</a></div>' : '';
  const leyenda = `<div class="shift-legend section">${cfg.turnos.map((s) => `<span><i style="background:${esc(s.color || '#eee')}"></i>${esc(s.nombre)} ${s.inicio}–${s.fin}</span>`).join('')}</div>`;
  if (c.modo === 'mes') {
    return head0 + barra + aviso + leyenda + monthGrid(desde, hasta, (f) => {
      const info = data.dias[f];
      if (!info) return '<div class="small muted mnone">Sin horario</div>';
      return monthDayHtml(cfg, f, porDia.get(f) || [], info, { act: 'calDia', persona: c.persona, borrador: info.estado !== 'publicado' });
    }, { titulo: false });
  }
  return head0 + barra + aviso + leyenda + calSemana(desde, data, porDia);
}

function calSemana(lunes, data, porDia) {
  const cfg = state.config;
  const c = state.cal;
  const dias = Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  const emps = cfg.empleados.filter((e) => (c.persona ? e.id === c.persona : e.activo || data.asignaciones.some((a) => a.empleado_id === e.id)));
  const filas = emps.map((e) => {
    let mins = 0;
    const cells = dias.map((d) => {
      const info = data.dias[d];
      if (!info) return '<td class="out"></td>';
      const a = (porDia.get(d) || []).find((x) => x.empleado_id === e.id);
      const s = a && shiftById(cfg, a.turno_id);
      const aus = cfg.ausencias.find((x) => x.empleado_id === e.id && x.desde <= d && d <= x.hasta);
      const libra = (e.libranzas_fijas || []).includes(DAYS[weekday(d)]);
      let inner;
      if (s) {
        const hs = horasDe(cfg, a);
        mins += toMin(hs.fin) - toMin(hs.inicio);
        inner = `<span class="pill${a.inicio ? ' custom' : ''}" style="background:${esc(s.color || '#eee')}">${esc(s.id)}${usaPuestos(cfg) ? puestoTag(puestoDe(cfg, a)) : ''}<small>${hs.inicio}–${hs.fin}</small>${rolTag(rolDe(cfg, a))}</span>`;
      } else inner = `<span class="${aus ? 'abs' : 'off'}">${aus ? esc(MOTIVOS[aus.motivo] || 'Ausencia') : libra ? 'libra' : 'libre'}</span>`;
      const lock = info.bloqueos.includes(e.id);
      return `<td><button class="cell" data-act="calDia" data-date="${d}" aria-label="${esc(`${e.nombre}, ${fmtLong(d)}: ${s ? `${s.nombre}` : 'libre'}. Abrir el día`)}">${inner}${lock ? `<span class="lock">${ICON.lock}</span>` : ''}</button></td>`;
    }).join('');
    return `<tr><td class="emp">${esc(e.nombre)}<small>${esc(tipoDe(e))}</small><span class="func-tags">${funcTags(cfg, e)}</span></td>${cells}<td class="tot">${fmtH(mins / 60)} h</td></tr>`;
  }).join('');
  return `<div class="sched-wrap section"><table class="sched"><thead><tr><th class="emp">Equipo</th>
    ${dias.map((d) => {
      const info = data.dias[d];
      return info ? `<th><button class="dname dlink" data-act="calDia" data-date="${d}" title="Abrir el día">${DAY_SHORT[weekday(d)]} ${dayNum(d)}</button><div class="dtype">${esc(info.tipo || '')}${info.estado !== 'publicado' ? ' · borrador' : ''}</div>${coverageBar(info)}</th>`
        : `<th class="out"><div class="dname muted">${DAY_SHORT[weekday(d)]} ${dayNum(d)}</div><div class="dtype">sin horario</div></th>`;
    }).join('')}<th class="tot">Horas</th></tr></thead><tbody>${filas}</tbody></table></div>`;
}

// ------------------------------------------------------------------ VISTA DIARIA (diagrama de Gantt editable)
// Filas: personas; columnas: horas. Cada barra es el turno de una persona ese día. Se mueve arrastrándola,
// se alarga o acorta por los bordes y se añade tocando un hueco de la fila. Los cambios se quedan en el
// navegador hasta «Confirmar»: entonces se evalúan las alertas del horario resultante y se decide si se
// guarda (y publica). En un horario publicado se guardan como arreglo, que el equipo no ve hasta publicarlo.

const DIA_PASO = () => Math.min(30, state.config.reglas.resolucion_minutos);

function tramosDe(cfg, h, fecha) {
  return h.asignaciones.filter((a) => a.fecha === fecha && shiftById(cfg, a.turno_id)).map((a) => {
    const hs = horasDe(cfg, a);
    return { empleado_id: a.empleado_id, inicio: hs.inicio, fin: hs.fin, puesto: puestoDe(cfg, a), funcion: a.funcion || null, turno_id: a.turno_id };
  });
}

function diaFechaPara(h) {
  const f = state.diaFecha;
  if (f && f >= h.desde && f <= h.hasta) return f;
  const hoy = todayIso();
  return hoy >= h.desde && hoy <= h.hasta ? hoy : h.desde;
}

// Estado de edición del día. Se rehace si cambia el horario o el día, salvo que haya cambios sin confirmar.
function diaEstado(cur) {
  const fecha = diaFechaPara(cur.horario);
  state.diaFecha = fecha;
  const d = state.dia;
  if (d && d.sid === cur.id && d.fecha === fecha && (d.base === cur.version || diaCambios(d).length)) return d;
  const orig = tramosDe(state.config, cur.horario, fecha);
  state.dia = { sid: cur.id, fecha, base: cur.version, orig, tramos: clone(orig) };
  return state.dia;
}

const tramoClave = (t) => (t ? `${t.inicio}|${t.fin}|${t.puesto}|${t.funcion || ''}` : '');
function diaCambios(d) {
  const a = new Map(d.orig.map((t) => [t.empleado_id, t]));
  const b = new Map(d.tramos.map((t) => [t.empleado_id, t]));
  return [...new Set([...a.keys(), ...b.keys()])].filter((e) => tramoClave(a.get(e)) !== tramoClave(b.get(e)));
}

function diaSoloLectura(cur) {
  return cur.estado === 'publicado' && cur.arreglo_pendiente;
}

// Ventana de horas que se dibuja: de la primera a la última demanda o turno, con margen, en horas enteras.
function diaVentana(cur, d) {
  const day = cur.cobertura[d.fecha];
  const mins = [];
  for (const [t, req] of (day && day.pasos) || []) if (req > 0) mins.push(t, t + state.config.reglas.resolucion_minutos);
  for (const t of d.tramos) mins.push(toMin(t.inicio), toMin(t.fin));
  if (!mins.length) return [7 * 60, 23 * 60];
  let from = Math.max(0, Math.floor((Math.min(...mins) - 30) / 60) * 60);
  let to = Math.min(24 * 60, Math.ceil((Math.max(...mins) + 30) / 60) * 60);
  if (to - from < 6 * 60) to = Math.min(24 * 60, from + 6 * 60);
  return [from, to];
}

// Cobertura con los cambios sin confirmar: personas en cada paso frente a las que pide la demanda.
function diaCobertura(cur, d) {
  const res = state.config.reglas.resolucion_minutos;
  const day = cur.cobertura[d.fecha] || { pasos: [], puestos: {} };
  const cubre = (t, paso) => toMin(t.inicio) <= paso && paso + res <= toMin(t.fin);
  const filas = [{ clave: 'total', nombre: 'Personas', req: new Map(day.pasos.map(([t, r]) => [t, r])), cuenta: (paso) => d.tramos.filter((t) => cubre(t, paso)).length }];
  for (const [p, arr] of Object.entries(day.puestos || {})) {
    filas.push({ clave: p, nombre: PUESTOS[p], req: new Map(arr.map(([t, r]) => [t, r])), cuenta: (paso) => d.tramos.filter((t) => t.puesto === p && cubre(t, paso)).length });
  }
  for (const [fid, arr] of Object.entries(day.funciones || {})) {
    const f = funcById(state.config, fid);
    if (!f) continue;
    // Un rol solo lo cubre quien lo tiene asignado ese día; una tarea de apoyo, cualquiera que sepa hacerla.
    const con = new Set(state.config.empleados.filter((e) => (e.funciones || []).includes(fid)).map((e) => e.id));
    const cuenta = esRol(f) ? (paso) => d.tramos.filter((t) => t.funcion === fid && cubre(t, paso)).length
      : (paso) => d.tramos.filter((t) => con.has(t.empleado_id) && cubre(t, paso)).length;
    filas.push({ clave: `f:${fid}`, nombre: f.nombre, req: new Map(arr.map(([t, r]) => [t, r])), tope: new Map(arr.filter((x) => x[3] != null).map(([t, , , m]) => [t, m])), cuenta, soloRegla: true });
  }
  return { res, filas, cerrado: day.cerrado };
}

function dayNav(cur, fecha) {
  const h = cur.horario;
  const vecino = (f) => state.schedules.filter((s) => s.id !== cur.id && s.desde <= f && f <= s.hasta)
    .sort((a, b) => (a.estado === 'publicado' ? 0 : 1) - (b.estado === 'publicado' ? 0 : 1))[0];
  const nav = (f, label, dir) => {
    if (f >= h.desde && f <= h.hasta) return `<button class="btn small" data-act="dayGo" data-date="${f}" aria-label="${dir}">${label}</button>`;
    const v = vecino(f);
    return v ? `<button class="btn small" data-act="dayGo" data-date="${f}" data-sid="${v.id}" title="Está en otro horario (${esc(fmtRange(v.desde, v.hasta))})">${label}</button>`
      : `<button class="btn small" disabled aria-label="${dir}">${label}</button>`;
  };
  return `<div class="day-nav row">
    ${nav(addDays(fecha, -1), '‹ Anterior', 'Día anterior')}
    <label class="field day-pick"><span class="sr-only">Día</span><input type="date" value="${fecha}" min="${h.desde}" max="${h.hasta}" data-act-change="dayPick"></label>
    ${nav(addDays(fecha, 1), 'Siguiente ›', 'Día siguiente')}
    <h2 class="day-title">${esc(DAY_LABEL[weekday(fecha)])} ${dayNum(fecha)} de ${monthName(fecha)} <span class="small muted">${esc(cur.cobertura[fecha]?.tipo || '')}</span></h2>
  </div>`;
}

// Zoom horizontal del diagrama del día: más ancho para afinar al arrastrar, más estrecho para verlo entero.
const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3];
function ganttZoom() {
  if (state.zoom == null) { let z = 1; try { z = Number(localStorage.getItem('lopita-zoom')) || 1; } catch { /* sin almacenamiento */ } state.zoom = ZOOMS.includes(z) ? z : 1; }
  return state.zoom;
}
function zoomCtl() {
  const z = ganttZoom(), k = ZOOMS.indexOf(z);
  return `<div class="zoom-ctl" role="group" aria-label="Zoom del horario">
    <button class="btn small" data-act="zoom" data-d="-1" ${k === 0 ? 'disabled' : ''} aria-label="Alejar" title="Alejar">−</button>
    <button class="btn small zoom-val" data-act="zoom" data-d="0" title="Volver al 100 %">${Math.round(z * 100)} %</button>
    <button class="btn small" data-act="zoom" data-d="1" ${k === ZOOMS.length - 1 ? 'disabled' : ''} aria-label="Acercar" title="Acercar">+</button></div>`;
}

function dayView(cur) {
  const cfg = state.config;
  const d = diaEstado(cur);
  const ro = diaSoloLectura(cur);
  const [from, to] = diaVentana(cur, d);
  const span = to - from;
  const pct = (m) => `${((m - from) / span) * 100}%`;
  const conPuestos = usaPuestos(cfg);
  const cambiados = new Set(diaCambios(d));
  const horas = [];
  for (let m = from; m <= to; m += 60) horas.push(m);
  const cob = diaCobertura(cur, d);
  const cobFila = (f) => {
    const cells = [];
    const faltan = [];
    const sobran = [];
    for (let t = from; t < to; t += cob.res) {
      const req = f.req.get(t) || 0, n = f.cuenta(t);
      const tope = f.tope ? f.tope.get(t) : undefined;
      const conRegla = req > 0 || tope !== undefined;
      const cls = n < req || (tope !== undefined && n > tope) ? 'short' : f.soloRegla ? (conRegla ? 'ok' : 'none') : n > req ? 'extra' : req ? 'ok' : 'none';
      if (f.soloRegla && !conRegla) { cells.push(''); continue; }
      if (n < req) faltan.push(`${fmtMin(t)} (${req - n})`);
      if (tope !== undefined && n > tope) sobran.push(`${fmtMin(t)} (${n - tope})`);
      const regla = tope === undefined ? `${n} de ${req}` : `${n}, ${req ? `mínimo ${req}, ` : ''}máximo ${tope}`;
      cells.push(`<i class="${cls}" style="left:${pct(t)};width:${(cob.res / span) * 100}%" title="${fmtMin(t)}–${fmtMin(t + cob.res)}: ${regla}">${req || n ? `<b>${n}</b>` : ''}</i>`);
    }
    const lista = (l) => `${l.slice(0, 4).join(', ')}${l.length > 4 ? '…' : ''}`;
    const resumen = faltan.length || sobran.length
      ? [faltan.length ? `Falta gente: ${lista(faltan)}` : '', sobran.length ? `Sobra gente: ${lista(sobran)}` : ''].filter(Boolean).join(' · ')
      : 'Cubierto';
    return `<div class="g-row g-cov"><div class="g-name">${esc(f.nombre)}<small class="${faltan.length || sobran.length ? 'bad-text' : ''}">${esc(resumen)}</small></div>
      <div class="g-track" aria-label="${esc(`${f.nombre}: ${resumen}`)}">${cells.join('')}</div></div>`;
  };
  // Ordenadas por hora de entrada: primero quien entra antes; después, quien no trabaja ese día.
  const entrada = (e) => { const t = d.tramos.find((x) => x.empleado_id === e.id); return t ? toMin(t.inicio) * 2000 + toMin(t.fin) : Infinity; };
  const emps = cfg.empleados.filter((e) => e.activo || d.tramos.some((t) => t.empleado_id === e.id))
    .map((e, k) => [e, entrada(e), k]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map((x) => x[0]);
  const filas = emps.map((e) => {
    const t = d.tramos.find((x) => x.empleado_id === e.id);
    const ausencia = cfg.ausencias.find((a) => a.empleado_id === e.id && a.desde <= d.fecha && d.fecha <= a.hasta);
    const libra = (e.libranzas_fijas || []).includes(DAYS[weekday(d.fecha)]);
    const nota = ausencia ? MOTIVOS[ausencia.motivo] || ausencia.motivo : libra ? 'Libra (fijo)' : '';
    let bar = '';
    if (t) {
      const s = shiftById(cfg, t.turno_id);
      const durH = (toMin(t.fin) - toMin(t.inicio)) / 60;
      const rol = t.funcion ? funcById(cfg, t.funcion) : null;
      bar = `<div class="g-bar${conPuestos ? ` ${t.puesto}` : ''}${cambiados.has(e.id) ? ' changed' : ''}" data-emp="${esc(e.id)}" tabindex="0" role="button"
        style="left:${pct(toMin(t.inicio))};width:${((toMin(t.fin) - toMin(t.inicio)) / span) * 100}%;--c:${esc((s && s.color) || '#E8D5B0')}"
        aria-label="${esc(`${e.nombre}: de ${t.inicio} a ${t.fin}${conPuestos ? `, ${PUESTOS[t.puesto]}` : ''}${esRol(rol) ? `, ${rol.nombre}` : ''}. Arrastra para mover; bordes para alargar o acortar; Intro para más opciones.`)}">
        ${ro ? '' : '<span class="g-h l" data-h="l" aria-hidden="true"></span>'}
        <span class="g-txt">${conPuestos ? puestoTag(t.puesto) : ''}<b>${t.inicio}–${t.fin}</b><small>${fmtH(durH)} h</small>${rolTag(esRol(rol) ? rol : null)}</span>
        ${ro ? '' : '<span class="g-h r" data-h="r" aria-hidden="true"></span>'}</div>`;
    }
    return `<div class="g-row${nota ? ' unavailable' : ''}"><div class="g-name">${esc(e.nombre)}<small>${esc(tipoDe(e))}${nota ? ` · <span class="warn-text">${esc(nota)}</span>` : ''}</small><span class="func-tags">${funcTags(cfg, e)}</span></div>
      <div class="g-track${ro ? '' : ' editable'}" data-emp="${esc(e.id)}" ${t || ro ? '' : `title="Toca para añadir un turno a ${esc(e.nombre)}"`}>${bar}</div></div>`;
  }).join('');
  const n = cambiados.size;
  const alertasDia = cur.alertas_detalle.activas.filter((a) => a.fecha === d.fecha || (a.fechas || []).includes(d.fecha) || (a.fecha && a.fecha_fin && a.fecha <= d.fecha && d.fecha <= a.fecha_fin));
  return `${dayNav(cur, d.fecha)}
    ${ro ? `<div class="notice warn no-print"><span>Este horario tiene un <b>arreglo pendiente de publicar</b>: los cambios se hacen en él.</span><span class="spacer"></span><a class="btn small primary" href="#/horarios/${cur.arreglo_pendiente}">Editar el arreglo</a></div>` : ''}
    ${cob.cerrado ? '<div class="notice info">El local está cerrado este día.</div>' : ''}
    <div class="row no-print" style="margin:8px 0;gap:10px;align-items:center;flex-wrap:nowrap"><p class="small muted" style="margin:0;flex:1">${ro ? 'Solo lectura.' : 'Arrastra un turno para moverlo, tira de sus bordes para alargarlo o acortarlo, tócalo para cambiar el puesto, las horas o quitarlo, y toca un hueco en la fila de alguien para añadirle un turno. Nada se guarda hasta que confirmes.'}</p>${zoomCtl()}</div>
    <div class="gantt-wrap"><div class="gantt" style="--hours:${span / 60};--zoom:${ganttZoom()}">
      <div class="g-row g-head"><div class="g-name"></div><div class="g-track">${horas.map((m) => `<span style="left:${pct(m)}">${String(Math.floor(m / 60)).padStart(2, '0')}</span>`).join('')}</div></div>
      ${cob.filas.map(cobFila).join('')}
      ${filas}
    </div></div>
    ${conPuestos ? `<div class="row small muted" style="margin-top:8px;gap:14px">${Object.keys(PUESTOS).map((p) => `<span>${puestoTag(p)} ${PUESTOS[p]}</span>`).join('')}<span><i class="legend-changed"></i> Cambio sin confirmar</span></div>` : ''}
    ${alertasDia.length ? `<div class="section"><h2>Alertas de este día ${sevBadges(Object.fromEntries(SEV_ORDER.map((k) => [k, alertasDia.filter((a) => a.severidad === k).length])))}</h2>
      <div class="alert-list">${alertasDia.slice(0, 6).map((a) => alertCard(a, { sid: cur.id })).join('')}</div>
      <p class="small muted">Son las del horario guardado; al confirmar tus cambios verás cómo quedan.</p></div>` : ''}
    ${n ? `<div class="day-pending no-print" role="status"><span><b>${n} cambio${n > 1 ? 's' : ''}</b> sin confirmar</span><span class="spacer"></span>
      <button class="btn" data-act="dayDiscard">Descartar</button><button class="btn primary" data-act="dayConfirm">Confirmar cambios</button></div>` : ''}`;
}

// --- interacción con las barras (ratón y dedo)
let gDrag = null;

function gDragStart(e) {
  const track = e.target.closest('.g-track.editable');
  if (!track || e.button > 0 || !state.dia) return;
  const bar = e.target.closest('.g-bar');
  const rect = track.getBoundingClientRect();
  const [from, to] = diaVentana(state.current, state.dia);
  const base = { track, rect, from, to, x0: e.clientX, moved: false, emp: track.dataset.emp, id: e.pointerId };
  if (!bar) { gDrag = { ...base, modo: 'nuevo' }; return; }
  const t = state.dia.tramos.find((x) => x.empleado_id === bar.dataset.emp);
  const h = e.target.dataset.h;
  gDrag = { ...base, bar, modo: h === 'l' ? 'inicio' : h === 'r' ? 'fin' : 'mover', a0: toMin(t.inicio), b0: toMin(t.fin), a: toMin(t.inicio), b: toMin(t.fin) };
  bar.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function gDragMove(e) {
  const g = gDrag;
  if (!g || e.pointerId !== g.id) return;
  if (Math.abs(e.clientX - g.x0) > 5) g.moved = true;
  if (!g.bar || !g.moved) return;
  const paso = DIA_PASO();
  const dm = Math.round(((e.clientX - g.x0) / g.rect.width) * (g.to - g.from) / paso) * paso;
  let a = g.a0, b = g.b0;
  if (g.modo === 'mover') { const len = b - a; a = Math.min(Math.max(g.from, a + dm), g.to - len); b = a + len; }
  if (g.modo === 'inicio') a = Math.min(Math.max(g.from, a + dm), b - paso);
  if (g.modo === 'fin') b = Math.max(Math.min(g.to, b + dm), a + paso);
  a = Math.max(0, a); b = Math.min(24 * 60, b);
  g.a = a; g.b = b;
  const span = g.to - g.from;
  g.bar.style.left = `${((a - g.from) / span) * 100}%`;
  g.bar.style.width = `${((b - a) / span) * 100}%`;
  g.bar.classList.add('dragging', 'changed');
  const txt = g.bar.querySelector('.g-txt b');
  if (txt) txt.textContent = `${fmtMin(a)}–${fmtMin(b)}`;
  const dur = g.bar.querySelector('.g-txt small');
  if (dur) dur.textContent = `${fmtH((b - a) / 60)} h`;
}

function gDragEnd(e) {
  const g = gDrag;
  if (!g || e.pointerId !== g.id) return;
  gDrag = null;
  if (e.type === 'pointercancel') { if (g.bar) renderView(); return; }
  if (g.modo === 'nuevo') {
    if (g.moved) return;  // era un desplazamiento de la rejilla, no un toque
    const minuto = g.from + ((e.clientX - g.rect.left) / g.rect.width) * (g.to - g.from);
    diaAnadir(g.emp, minuto);
    return;
  }
  if (!g.moved) { openBarMenu(g.emp, g.bar); return; }
  const t = state.dia.tramos.find((x) => x.empleado_id === g.emp);
  t.inicio = fmtMin(g.a); t.fin = fmtMin(g.b);
  renderView();
}

document.addEventListener('pointerdown', gDragStart);
document.addEventListener('pointermove', gDragMove);
document.addEventListener('pointerup', gDragEnd);
document.addEventListener('pointercancel', gDragEnd);

// Turnos que existen ese día y que la persona puede hacer (abrir y cerrar solo quien está habilitado).
function turnosPosibles(e, fecha) {
  const cfg = state.config;
  const dia = DAYS[weekday(fecha)];
  const existen = cfg.turnos.filter((s) => !s.dias || !s.dias.length || s.dias.includes(dia));
  const puede = existen.filter((s) => (s.tipo !== 'apertura' || e.puede_abrir) && (s.tipo !== 'cierre' || e.puede_cerrar));
  return puede.length ? puede : existen;
}

function diaAnadir(empId, minuto) {
  const d = state.dia;
  const e = empById(state.config, empId);
  if (d.tramos.some((t) => t.empleado_id === empId)) return;
  const opciones = turnosPosibles(e, d.fecha);
  if (!opciones.length) { toast('No hay turnos definidos para este día', true); return; }
  // El turno que contiene la hora tocada y empieza más cerca de ella; si ninguno la contiene, el que empieza más cerca.
  const dist = (s) => Math.abs(toMin(s.inicio) - minuto) + (toMin(s.inicio) <= minuto && minuto < toMin(s.fin) ? 0 : 24 * 60);
  const s = opciones.reduce((m, x) => (dist(x) < dist(m) ? x : m));
  d.tramos.push({ empleado_id: empId, inicio: s.inicio, fin: s.fin, puesto: puestosDe(e)[0], funcion: null, turno_id: s.id });
  renderView();
}

// Ajustes rápidos de un turno: alargar o acortar por un extremo, o desplazarlo entero.
const AJUSTES = [
  ['Alargar', [['fin', 30, '+30 min al final'], ['fin', 60, '+1 h al final'], ['ini', -30, '+30 min al principio'], ['ini', -60, '+1 h al principio']]],
  ['Acortar', [['fin', -30, '−30 min al final'], ['fin', -60, '−1 h al final'], ['ini', 30, '−30 min al principio'], ['ini', 60, '−1 h al principio']]],
  ['Desplazar', [['mover', -60, '← 1 h antes'], ['mover', -30, '← 30 min'], ['mover', 30, '30 min →'], ['mover', 60, '1 h después →']]],
];
function quickAdjustHtml(act, attrs) {
  return `<div class="quick-adj">${AJUSTES.map(([titulo, ops]) => `<div class="qa-row"><span>${titulo}</span>${ops.map(([k, dm, l]) => `<button type="button" data-act="${act}" ${attrs} data-k="${k}" data-dm="${dm}">${l}</button>`).join('')}</div>`).join('')}</div>`;
}
// Aplica un ajuste a un tramo {inicio, fin}; devuelve false si no cabe (antes de las 00:00, después de las 24:00 o sin duración).
function ajustarTramo(t, k, dm) {
  let a = toMin(t.inicio), b = toMin(t.fin);
  if (k === 'ini') a += dm; else if (k === 'fin') b += dm; else { a += dm; b += dm; }
  if (a < 0 || b > 24 * 60 || b - a < 30) return false;
  t.inicio = fmtMin(a); t.fin = fmtMin(b);
  return true;
}

// Botones para elegir el rol (caja, cafetera...) de un turno: los roles de su puesto que sabe hacer y «sin rol».
function rolesMenu(cfg, e, puesto, actual, act, attrs) {
  const roles = rolesDe(cfg, e, puesto).map((id) => funcById(cfg, id));
  if (!roles.length) return '';
  const boton = (f) => `<button type="button" role="menuitemradio" aria-checked="${(actual || null) === (f ? f.id : null)}" class="rol-opt${(actual || null) === (f ? f.id : null) ? ' current' : ''}" data-act="${act}" ${attrs} data-funcion="${f ? esc(f.id) : ''}">${f ? `<i style="background:${esc(f.color || '#764A09')}"></i>${esc(f.nombre)}` : 'Sin rol'}</button>`;
  return `<hr><div class="ph" style="border:none;margin:0;padding-bottom:2px">Qué hace en el turno</div><div class="rol-opts">${roles.map(boton).join('')}${boton(null)}</div>`;
}

function openBarMenu(empId, anchor) {
  closeMenu();
  const cfg = state.config;
  const d = state.dia;
  const t = d.tramos.find((x) => x.empleado_id === empId);
  const e = empById(cfg, empId);
  if (!t || !e) return;
  const m = document.createElement('div');
  m.className = 'popover bar-menu';
  m.tabIndex = -1;
  m.setAttribute('role', 'dialog');
  m.setAttribute('aria-label', `Turno de ${e.nombre}`);
  m.innerHTML = `<div class="ph"><b>${esc(e.nombre)}</b> · ${esc(fmtLong(d.fecha))}</div>
    <div class="bar-times"><label class="field">Entra<input type="time" step="900" id="bar-ini" value="${t.inicio}"></label>
      <label class="field">Sale<input type="time" step="900" id="bar-fin" value="${t.fin === '24:00' ? '23:59' : t.fin}"></label>
      <button class="btn small primary" data-act="barTimes" data-emp="${esc(empId)}">Aplicar</button></div>
    ${quickAdjustHtml('barAdj', `data-emp="${esc(empId)}"`)}
    ${puestosDe(e).length > 1 ? `<hr>${puestosDe(e).map((p) => `<button class="${t.puesto === p ? 'current' : ''}" data-act="barPuesto" data-emp="${esc(empId)}" data-p="${p}">${puestoTag(p)} En ${PUESTOS[p].toLowerCase()}</button>`).join('')}` : ''}
    ${rolesMenu(cfg, e, t.puesto, t.funcion, 'barRol', `data-emp="${esc(empId)}"`)}
    <hr><div class="ph" style="border:none;margin:0;padding-bottom:2px">Poner las horas de un turno</div>
    ${turnosPosibles(e, d.fecha).map((s) => `<button data-act="barShift" data-emp="${esc(empId)}" data-shift="${esc(s.id)}"><i style="background:${esc(s.color || '#eee')}"></i>${esc(s.nombre)} <small>${s.inicio}–${s.fin}</small></button>`).join('')}
    <hr><button data-act="barRemove" data-emp="${esc(empId)}" class="danger-text">${ICON.trash} Quitar el turno (libra)</button>`;
  document.body.appendChild(m);
  placePopover(m, `.g-bar[data-emp="${CSS.escape(empId)}"]`);
  // En pantallas táctiles no se enfoca la hora: abriría el teclado, que tapa el menú y desplaza la página.
  enfocar(esTactil() ? m : m.querySelector('#bar-ini'));
  return m;
}

const esTactil = () => window.matchMedia('(pointer: coarse)').matches;
const enfocar = (el) => el.focus({ preventScroll: true });

// Un menú flotante se ancla a su casilla o barra por un selector, no por el elemento: la vista se vuelve a
// pintar por detrás (p. ej. al llegar las alertas) y el elemento cambia, pero la casilla sigue siendo la misma.
const MENU_MARGEN = 8, MENU_HUECO = 4;
const altoVisible = () => (window.visualViewport ? window.visualViewport.height : window.innerHeight);

// Coloca el menú junto a su ancla, en el lado (abajo o arriba) con más sitio, y limita su alto a ese sitio para
// que nunca se salga de la pantalla: lo que no quepa se ve desplazando el propio menú.
function placePopover(m, ancla) {
  m.dataset.ancla = ancla;
  const r = document.querySelector(ancla).getBoundingClientRect();
  const abajo = altoVisible() - r.bottom - MENU_HUECO - MENU_MARGEN;
  const arriba = r.top - MENU_HUECO - MENU_MARGEN;
  const mh = m.scrollHeight;
  m.dataset.lado = mh <= abajo || abajo >= arriba ? 'abajo' : 'arriba';
  m.style.maxHeight = `${Math.max(120, Math.min(mh, m.dataset.lado === 'abajo' ? abajo : arriba))}px`;
  seguirAncla(m);
}

// Vuelve a pegar el menú a su ancla (tras desplazar la página o redibujar la vista). Si el ancla ya no existe
// o ha salido de la pantalla, el menú se cierra: ya no se sabría a qué casilla se refiere.
function seguirAncla(m) {
  const ancla = document.querySelector(m.dataset.ancla);
  const r = ancla && ancla.getBoundingClientRect();
  const alto = altoVisible();
  if (!r || r.bottom < 0 || r.top > alto || r.right < 0 || r.left > window.innerWidth) { m.remove(); return; }
  const mh = m.offsetHeight;
  const top = m.dataset.lado === 'abajo' ? r.bottom + MENU_HUECO : r.top - MENU_HUECO - mh;
  m.style.top = `${Math.max(MENU_MARGEN, Math.min(top, alto - MENU_MARGEN - mh))}px`;
  m.style.left = `${Math.max(MENU_MARGEN, Math.min(r.left, window.innerWidth - m.offsetWidth - MENU_MARGEN))}px`;
}
const seguirAnclas = () => document.querySelectorAll('.popover[data-ancla]').forEach(seguirAncla);

// Teclado: con una barra enfocada, flechas para moverla (Mayús + flechas, para alargarla o acortarla) e Intro para el menú.
document.addEventListener('keydown', (e) => {
  const bar = e.target.closest && e.target.closest('.g-bar');
  if (!bar || !state.dia || diaSoloLectura(state.current)) return;
  const t = state.dia.tramos.find((x) => x.empleado_id === bar.dataset.emp);
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBarMenu(bar.dataset.emp, bar); return; }
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const paso = (e.key === 'ArrowLeft' ? -1 : 1) * DIA_PASO();
  const a = toMin(t.inicio), b = toMin(t.fin);
  if (e.shiftKey) { if (b + paso > a && b + paso <= 24 * 60) t.fin = fmtMin(b + paso); }
  else if (a + paso >= 0 && b + paso <= 24 * 60) { t.inicio = fmtMin(a + paso); t.fin = fmtMin(b + paso); }
  renderView();
  const again = document.querySelector(`.g-bar[data-emp="${CSS.escape(t.empleado_id)}"]`);
  if (again) again.focus();
});

const diaDescartable = () => !state.dia || !diaCambios(state.dia).length
  || window.confirm('Tienes cambios del día sin confirmar. ¿Descartarlos?');

// Lo que cambian los cambios del día: reglas, horas y alertas, antes de guardarlos.
function dayEvalDialog(ev) {
  const cfg = state.config;
  const lista = (titulo, items, cls = '') => (items.length ? `<details class="alert-more"${cls ? ' open' : ''}><summary>${titulo} (${items.length})</summary>
    <ul class="fix-alerts ${cls}">${items.map((a) => `<li><span class="sev-badge ${a.severidad}">${SEV[a.severidad]}</span> ${esc(a.detalle)}</li>`).join('')}</ul></details>` : '');
  const horas = ev.horas.map((x) => horasFila(cfg, x)).join('');
  const bloquea = ev.errores_despues > 0;
  const sinReglas = (list) => list.filter((a) => a.categoria !== 'reglas' && a.severidad !== 'critica');  // ya salen arriba
  const arreglo = ev.destino === 'arreglo';
  return `<h2>Revisar los cambios</h2>
    <p style="margin-top:-6px">${esc(DAY_LABEL[weekday(ev.fecha)])} ${dayNum(ev.fecha)} de ${monthName(ev.fecha)}</p>
    <ul class="fix-list">${ev.movimientos.map((m) => `<li>${esc(m.texto)}</li>`).join('') || '<li>Sin cambios.</li>'}</ul>
    <div class="notice ${ev.criticas.length || bloquea ? 'crit' : 'ok'} small"><span>Alertas ${sevBadges(ev.alertas_antes)} → ${sevBadges(ev.alertas_despues)}${ev.errores_antes || ev.errores_despues ? ` · Reglas incumplidas: <b>${ev.errores_antes}</b> → <b>${ev.errores_despues}</b>` : ''}</span></div>
    ${ev.reglas_nuevas.length ? `<h3 style="margin-top:14px">Reglas que se incumplen</h3><ul class="fix-alerts warn">${ev.reglas_nuevas.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${ev.criticas.length ? `<h3 style="margin-top:14px">El horario no vale tal cual</h3><ul class="fix-alerts warn">${ev.criticas.map((a) => `<li><span class="sev-badge critica">Crítica</span> ${esc(a.detalle)}</li>`).join('')}</ul>` : ''}
    ${horas ? `<h3 style="margin-top:14px">Horas de quien cambia</h3><div class="table-wrap"><table class="list"><thead><tr><th>Persona</th><th class="num">Le tocan</th><th class="num">Antes → después</th></tr></thead><tbody>${horas}</tbody></table></div>` : ''}
    <div style="margin-top:12px">${lista('Alertas nuevas', sinReglas(ev.nuevas), 'warn')}${lista('Alertas que empeoran', sinReglas(ev.empeoradas), 'warn')}
      ${lista('Alertas que se resuelven', ev.resueltas)}${lista('Alertas que mejoran', ev.mejoradas)}</div>
    ${arreglo ? '<div class="notice info small" style="margin-top:12px">El horario está publicado. Al guardar, los cambios quedan en un <b>arreglo</b>: el equipo sigue viendo el horario actual hasta que lo publiques.</div>' : ''}
    ${bloquea ? '<p class="small" style="color:var(--bad)">Con reglas incumplidas se puede guardar, pero no publicar.</p>' : ''}
    <div class="row end" style="margin-top:16px">
      <button class="btn" data-act="closeOverlay">Seguir editando</button>
      <button class="btn" data-act="dayApply">${arreglo ? 'Guardar como arreglo' : 'Guardar'}</button>
      <button class="btn primary" data-act="dayApply" data-publicar="1" ${bloquea ? 'disabled' : ''}>Guardar y publicar</button>
    </div>`;
}

function summaryTable(h) {
  const cfg = state.config;
  return `<div class="section"><h2>Horas por persona</h2><div class="card" style="padding:0"><div class="table-wrap"><table class="list">
    <thead><tr><th>Persona</th><th class="num">Horas</th><th class="num">Objetivo</th><th class="num">Arrastra</th><th class="num">Extra</th><th class="num">Días</th><th class="num">Fines de semana</th><th class="num">Aperturas</th><th class="num">Cierres</th></tr></thead>
    <tbody>${h.resumen.map((r) => {
      const diff = r.horas - r.horas_objetivo;
      if (r.comodin) {
        return `<tr><td><b>${esc(nameIn(cfg, r.empleado_id))}</b> <span class="badge neutral">Comodín</span></td><td class="num">${fmtH(r.horas)}</td><td class="num muted">—</td><td class="num muted">—</td><td class="num">—</td>
        <td class="num">${r.dias_trabajados}</td><td class="num">${r.fines_de_semana}</td><td class="num">${r.aperturas}</td><td class="num">${r.cierres}</td></tr>`;
      }
      return `<tr><td><b>${esc(nameIn(cfg, r.empleado_id))}</b></td><td class="num">${fmtH(r.horas)}</td><td class="num">${fmtH(r.horas_objetivo)}</td>
      <td class="num muted">${r.saldo_anterior ? (r.saldo_anterior > 0 ? '+' : '') + fmtH(r.saldo_anterior) : '—'}</td>
      <td class="num">${r.horas_extra >= 0.5 ? `<span class="badge warn">${fmtH(r.horas_extra)}</span>` : diff < -cfg.reglas.margen_periodo_horas ? `<span class="badge neutral">${fmtH(diff)}</span>` : '—'}</td>
      <td class="num">${r.dias_trabajados}</td><td class="num">${r.fines_de_semana}</td><td class="num">${r.aperturas}</td><td class="num">${r.cierres}</td></tr>`;
    }).join('')}</tbody></table></div></div>
    <p class="small muted">«Arrastra» son las horas de más (+) o de menos (−) del periodo anterior que se compensan en este. Objetivo = contrato prorrateado sin contar ausencias, menos lo arrastrado. Los comodines no tienen objetivo: solo cubren lo que falta.</p></div>`;
}

// menú de una casilla
function openCellMenu(btn) {
  closeMenu();
  const cfg = state.config;
  const h = state.current.horario;
  const emp = cfg.empleados.find((e) => e.id === btn.dataset.emp);
  const d = btn.dataset.date;
  const cur = h.asignaciones.find((a) => a.empleado_id === emp.id && a.fecha === d);
  const lock = h.bloqueos.find((l) => l.empleado_id === emp.id && l.fecha === d);
  const absence = cfg.ausencias.find((a) => a.empleado_id === emp.id && a.desde <= d && d <= a.hasta);
  const fixedOff = (emp.libranzas_fijas || []).includes(DAYS[weekday(d)]);
  const note = (s) => {
    if (s.tipo === 'apertura' && !emp.puede_abrir) return 'no abre';
    if (s.tipo === 'cierre' && !emp.puede_cerrar) return 'no cierra';
    if (s.dias && s.dias.length && !s.dias.includes(DAYS[weekday(d)])) return 'no ese día';
    const [desde, hasta] = franjaDe(emp, d);
    if (aMin(s.inicio) < desde || aMin(s.fin) > hasta) return 'fuera de su horario';
    return '';
  };
  const m = document.createElement('div');
  m.className = 'popover';
  m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="ph"><b>${esc(emp.nombre)}</b> · ${fmtLong(d)}${absence ? `<br><span style="color:var(--warn)">${esc(MOTIVOS[absence.motivo])}</span>` : fixedOff ? '<br>Es su día de libranza' : ''}</div>
    ${cfg.turnos.map((s) => `<button role="menuitem" class="${cur && cur.turno_id === s.id ? 'current' : ''}" data-act="setCell" data-emp="${esc(emp.id)}" data-date="${d}" data-shift="${esc(s.id)}"><i style="background:${esc(s.color || '#eee')}"></i>${esc(s.nombre)} <small>${s.inicio}–${s.fin}${note(s) ? ` · <span class="warn-note">${note(s)}</span>` : ''}</small></button>`).join('')}
    <hr>${cur
      ? `<button role="menuitem" class="danger-text" data-act="setCell" data-emp="${esc(emp.id)}" data-date="${d}" data-shift="">${ICON.trash} Quitar el turno <small>ese día libra</small></button>`
      : '<button role="menuitem" class="current" disabled>Libre <small>no tiene turno</small></button>'}
    ${cur && puestosDe(emp).length > 1 ? `<hr>${puestosDe(emp).map((p) => `<button role="menuitem" class="${puestoDe(cfg, cur) === p ? 'current' : ''}" data-act="setCell" data-emp="${esc(emp.id)}" data-date="${d}" data-shift="${esc(cur.turno_id)}" data-puesto="${p}">${puestoTag(p)} En ${PUESTOS[p].toLowerCase()} <small>mismo turno</small></button>`).join('')}` : ''}
    ${cur && shiftById(cfg, cur.turno_id) ? rolesMenu(cfg, emp, puestoDe(cfg, cur), cur.funcion, 'setCell', `data-emp="${esc(emp.id)}" data-date="${d}" data-shift="${esc(cur.turno_id)}" data-puesto="${puestoDe(cfg, cur)}"`) : ''}
    ${cur && shiftById(cfg, cur.turno_id) ? `<hr><div class="ph" style="border:none;margin:0;padding-bottom:2px">Ajustar las horas <small class="muted">(se revisa en la vista del día)</small></div>${quickAdjustHtml('cellAdj', `data-emp="${esc(emp.id)}" data-date="${d}"`)}` : ''}
    ${lock ? `<button role="menuitem" data-act="unlockCell" data-emp="${esc(emp.id)}" data-date="${d}">Quitar bloqueo <small>que decida el motor</small></button>` : ''}`;
  document.body.appendChild(m);
  placePopover(m, `[data-act="cell"][data-emp="${CSS.escape(emp.id)}"][data-date="${d}"]`);
  enfocar(m.querySelector('button.current') || m.querySelector('button'));
}
function closeMenu() { document.querySelectorAll('.popover').forEach((p) => p.remove()); }
// Al desplazar la página o una tabla, el menú acompaña a su casilla (y se cierra si sale de la pantalla); al
// desplazar el propio menú para ver las opciones que no caben, no se toca.
function menuOnScroll(e) {
  if (e.target instanceof Element && e.target.closest('.popover')) return;
  seguirAnclas();
}

// ------------------------------------------------------------------ EQUIPO
function viewEquipo() {
  const emps = state.draft.empleados;
  return `${head('Equipo', 'Quién trabaja en Lopita, sus horas de contrato, si es camarero/a o cocinero/a, sus funciones y qué días libra habitualmente. Los comodines no tienen horas de contrato: el generador solo les da turnos para cubrir lo que el resto no llega a cubrir.', `<button class="btn" data-act="addComodin">${ICON.plus} Añadir comodín</button><button class="btn primary" data-act="addEmp">${ICON.plus} Añadir persona</button>`)}
  ${emps.length ? `<div class="grid">${emps.map((e, i) => `<div class="card" style="${e.activo ? '' : 'opacity:.6'}">
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
  </div>`).join('')}</div>` : '<div class="card empty">No hay nadie en el equipo todavía.</div>'}`;
}

// Bajas: una ausencia con motivo «baja». Sin fecha de alta se guarda para un año (hasta que se dé el alta).
const BAJA_SIN_FIN = 364;
const bajaDe = (e) => state.draft.ausencias.find((a) => a.empleado_id === e.id && a.motivo === 'baja' && a.hasta >= todayIso());
const bajaSinFin = (a) => daysBetween(a.desde, a.hasta) >= BAJA_SIN_FIN;
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
const PINCHOS = { id: 'preparar-pinchos', nombre: 'Preparar pinchos', color: '#C9733B', reglas: [] };
// Restricciones horarias: «esos días solo puede trabajar de X a Y». Vacío = sin límite por ese lado.
const aMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
function franjaDe(e, d) {
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
const ROLES_CAMARERO = [['Caja', '#2F6F4E'], ['Cafetera', '#7A4B2A'], ['Sala', '#B0904C'], ['Lava', '#3D6A8C']];
const CLASES_FUNCION = { '': 'Tarea de apoyo', sala: 'Rol de camarero/a', cocina: 'Rol de cocinero/a' };

function viewFunciones() {
  const c = state.draft;
  const fs = funcionesCfg(c);
  const activos = c.empleados.filter((e) => e.activo);
  const quien = (pred) => { const l = activos.filter(pred).map((e) => esc(e.nombre)); return l.length ? l.join(', ') : '<span class="bad-text">nadie</span>'; };
  const fijas = [
    ['Abrir', 'puede_abrir', 'Solo estas personas hacen los turnos de apertura, y al abrir tiene que haber al menos una (si no, el horario no vale).'],
    ['Cerrar', 'puede_cerrar', 'Solo estas personas hacen los turnos de cierre, y al cerrar tiene que quedarse al menos una (si no, el horario no vale).'],
    ['Encargado/a', 'es_encargado', c.reglas.encargado_siempre ? 'El motor intenta que siempre haya un encargado en el local (Reglas → Cobertura).' : 'Ahora no se exige un encargado siempre; se activa en Reglas → Cobertura.'],
  ];
  const fila = (f, i) => `<div class="card" style="--fc:${esc(f.color || '#764A09')}">
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

// ------------------------------------------------------------------ TURNOS
function timeline(items, from = 6 * 60, to = 24 * 60) {
  const pct = (m) => `${((Math.min(Math.max(m, from), to) - from) / (to - from)) * 100}%`;
  return `<div class="timeline">${items.map((s) => `<i style="left:${pct(toMin(s.inicio))};width:calc(${pct(toMin(s.fin))} - ${pct(toMin(s.inicio))});background:${esc(s.color || '#B0904C')}"></i>`).join('')}</div>
  <div class="timeline-axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>`;
}

function viewTurnos() {
  const t = state.draft.turnos;
  return `${head('Turnos', 'El catálogo de turnos entre los que elige el motor. Solo quien esté habilitado hará los de apertura y cierre.', `<button class="btn primary" data-act="addShift">${ICON.plus} Añadir turno</button>`)}
  ${t.length ? `<div class="grid">${t.map((s, i) => {
    const hrs = (toMin(s.fin) - toMin(s.inicio)) / 60;
    return `<div class="card">
    <div class="row" style="flex-wrap:nowrap"><input class="title-input" type="text" value="${esc(s.nombre)}" data-bind="turnos.${i}.nombre" aria-label="Nombre del turno"><button class="icon-btn" data-act="delShift" data-i="${i}" title="Eliminar">${ICON.trash}</button></div>
    ${timeline([s])}
    <div class="fields" style="margin-top:12px">
      <label class="field">Código<input type="text" maxlength="6" value="${esc(s.id)}" data-rename="shift" data-i="${i}"></label>
      <label class="field">Entrada<input type="time" step="900" value="${s.inicio}" data-bind="turnos.${i}.inicio" data-rerender></label>
      <label class="field">Salida<input type="time" step="900" value="${s.fin === '24:00' ? '23:59' : s.fin}" data-bind="turnos.${i}.fin" data-rerender></label>
      <label class="field">Tipo<select data-bind="turnos.${i}.tipo">${Object.entries(TIPOS_TURNO).map(([k, v]) => `<option value="${k}" ${s.tipo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field">Color<input class="swatch-input" type="color" value="${esc(s.color || '#E8D5B0')}" data-bind="turnos.${i}.color" data-rerender></label>
      <div class="field">Duración<b style="color:var(--ink);padding-top:8px">${hrs > 0 ? `${fmtH(hrs)} h` : '<span style="color:var(--bad)">revisa las horas</span>'}</b></div>
    </div>
    <div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Días en que existe</div>${dayChips(`turnos.${i}.dias`, s.dias, 'Todos los días')}</div>
  </div>`;
  }).join('')}</div>
  <div class="card section"><h2>Así cubren el día</h2>${t.map((s) => `<div class="row" style="flex-wrap:nowrap;margin-bottom:6px"><b style="width:120px;flex:none" class="small">${esc(s.nombre)}</b><div style="flex:1">${timeline([s]).split('<div class="timeline-axis">')[0]}</div></div>`).join('')}
  <div class="row" style="flex-wrap:nowrap"><span style="width:120px;flex:none"></span><div style="flex:1" class="timeline-axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div></div></div>`
    : '<div class="card empty">No hay turnos. Añade al menos uno.</div>'}`;
}

// ------------------------------------------------------------------ DEMANDA
function slotsEditor(path, slots) {
  const mal = (f) => (f.cocina || 0) + (f.sala || 0) > f.personas;
  return `<div class="table-wrap"><table class="list edit slots"><thead><tr><th>Desde</th><th>Hasta</th><th class="num" style="width:76px">Personas</th>
    <th class="num" style="width:62px" title="De ellas, mínimo en cocina">Cocina</th><th class="num" style="width:62px" title="De ellas, mínimo en sala">Sala</th><th style="width:40px"></th></tr></thead><tbody>
    ${slots.map((f, j) => `<tr${mal(f) ? ' class="bad-row"' : ''}>
      <td><input type="time" step="900" value="${f.inicio}" data-bind="${path}.${j}.inicio" data-rerender aria-label="Desde"></td>
      <td><input type="time" step="900" value="${f.fin === '24:00' ? '23:59' : f.fin}" data-bind="${path}.${j}.fin" data-rerender aria-label="Hasta"></td>
      <td><input type="number" min="0" max="20" value="${f.personas}" data-type="int" data-bind="${path}.${j}.personas" data-rerender aria-label="Personas"></td>
      <td><input type="number" min="0" max="20" value="${f.cocina || 0}" data-type="int" data-bind="${path}.${j}.cocina" data-rerender aria-label="Mínimo en cocina"></td>
      <td><input type="number" min="0" max="20" value="${f.sala || 0}" data-type="int" data-bind="${path}.${j}.sala" data-rerender aria-label="Mínimo en sala"></td>
      <td><button class="icon-btn" data-act="delSlot" data-path="${path}" data-j="${j}" title="Quitar franja">${ICON.trash}</button></td></tr>`).join('')}
  </tbody></table></div>
  ${slots.some(mal) ? '<p class="small" style="color:var(--bad);margin:4px 0">Cocina y sala no pueden sumar más que el total de personas de la franja.</p>' : ''}
  <p class="small muted" style="margin:4px 0">Cocina y sala son mínimos dentro del total (0 = da igual el puesto).</p>
  <button class="btn small ghost" data-act="addSlot" data-path="${path}">${ICON.plus} Añadir franja</button>`;
}

function profile(slots) {
  const from = 6 * 60, to = 24 * 60, step = 30;
  const n = (to - from) / step;
  const req = Array(n).fill(0);
  for (const f of slots) for (let k = 0; k < n; k++) { const t = from + k * step; if (t >= toMin(f.inicio) && t < toMin(f.fin)) req[k] = Math.max(req[k], f.personas); }
  const max = Math.max(1, ...req);
  const peak = Math.max(...req);
  return `<div class="profile" role="img" aria-label="Personas necesarias por hora; máximo ${peak}">${req.map((v, k) => `<i style="height:${(v / max) * 100}%" title="${fmtMin(from + k * step)}: ${v} personas"></i>`).join('')}</div>
  <div class="profile-axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>24</span></div>
  <p class="small muted" style="margin:6px 0 0">Pico: ${peak} personas · ${fmtH(slots.reduce((s, f) => s + Math.max(0, toMin(f.fin) - toMin(f.inicio)) * f.personas, 0) / 60)} horas-persona al día</p>`;
}

// Tareas fijas: trabajo que no depende de la clientela y se suma a la demanda (preparar, limpiar, reponer…).
function tasksCard(tareas) {
  const rows = tareas.map((t, i) => `<div style="border-top:1px solid var(--line);padding:12px 0">
    <div class="row" style="flex-wrap:nowrap"><input class="title-input" type="text" value="${esc(t.nombre)}" data-bind="tareas.${i}.nombre" aria-label="Nombre de la tarea"><button class="icon-btn" data-act="delTask" data-i="${i}" title="Quitar tarea">${ICON.trash}</button></div>
    <div class="fields" style="margin-top:8px">
      <label class="field">Desde<input type="time" step="900" value="${t.inicio}" data-bind="tareas.${i}.inicio" data-rerender></label>
      <label class="field">Hasta<input type="time" step="900" value="${t.fin === '24:00' ? '23:59' : t.fin}" data-bind="tareas.${i}.fin" data-rerender></label>
      <label class="field">Personas<input type="number" min="1" max="20" value="${t.personas}" data-type="int" data-bind="tareas.${i}.personas" data-rerender></label>
      <label class="field">Puesto<select data-bind="tareas.${i}.puesto" data-type="nullstr"><option value="" ${!t.puesto ? 'selected' : ''}>Cualquiera</option>${Object.entries(PUESTOS).map(([k, v]) => `<option value="${k}" ${t.puesto === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    </div>
    <div style="margin-top:10px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Qué días</div>${dayChips(`tareas.${i}.dias`, t.dias, 'Todos los días que abre')}</div>
  </div>`).join('');
  return `<div class="card section"><div class="row"><h2 style="margin:0">Tareas fijas</h2><span class="spacer"></span><button class="btn small" data-act="addTask">${ICON.plus} Añadir tarea</button></div>
    <p class="small muted">Trabajo que no depende de la clientela: preparar la cafetería al abrir, limpiar al cerrar, recibir pedidos… En esas horas hacen falta las personas de la franja <b>más</b> las de la tarea, aunque el local esté vacío. Si alguien sale como «personal de más» pero en realidad está haciendo esto, añádelo aquí.</p>
    ${tareas.length ? `${timeline(tareas.map((t) => ({ ...t, color: '#764A09' })))}${rows}` : '<p class="muted small">Ninguna. La demanda solo cuenta la clientela.</p>'}
  </div>`;
}

function viewDemanda() {
  const c = state.draft;
  const ex = c.excepciones_fecha;
  return `${head('Demanda', 'Cuántas personas hacen falta en cada franja. Defines unos pocos tipos de día y asignas uno a cada día de la semana; los festivos y los días especiales pueden tener el suyo.', `<button class="btn primary" data-act="addDayType">${ICON.plus} Tipo de día</button>`)}
  <div class="card"><h2>Cada día de la semana</h2><div class="fields">
    ${DAYS.map((d, i) => `<label class="field">${DAY_LABEL[i]}<select data-bind="tipo_dia_por_semana.${d}">${dayTypeOptions(c.tipo_dia_por_semana[d])}</select></label>`).join('')}
  </div></div>
  <div class="grid wide section">${c.tipos_dia.map((t, i) => `<div class="card">
    <div class="row" style="flex-wrap:nowrap"><input class="title-input" type="text" value="${esc(t.nombre)}" data-rename="daytype" data-i="${i}" aria-label="Nombre del tipo de día"><button class="icon-btn" data-act="delDayType" data-i="${i}" title="Eliminar">${ICON.trash}</button></div>
    <div style="margin:6px 0 10px">${toggle(`tipos_dia.${i}.cerrado`, t.cerrado, 'Local cerrado')}</div>
    ${t.cerrado ? '<p class="muted small">Los días de este tipo no se asigna a nadie.</p>' : `${profile(t.franjas)}<div style="margin-top:10px">${slotsEditor(`tipos_dia.${i}.franjas`, t.franjas)}</div>`}
  </div>`).join('')}</div>
  ${tasksCard(c.tareas || [])}
  <div class="card section"><h2>Festivos</h2>
    <div class="row" style="align-items:flex-end">
      <label class="field" style="max-width:260px">Los festivos funcionan como<select data-bind="tipo_dia_festivo" data-type="nullstr">${dayTypeOptions(c.tipo_dia_festivo, 'un día normal de la semana')}</select></label>
      <label class="field" style="max-width:200px">Añadir festivo<input type="date" id="new-holiday"></label>
      <button class="btn" data-act="addHoliday">${ICON.plus} Añadir</button>
    </div>
    <div class="chips" style="margin-top:12px">${[...c.festivos].sort().map((f) => `<span class="chip on" style="cursor:default">${fmtShort(f)} ${monthName(f)} ${f.slice(0, 4)} <button class="icon-btn" style="padding:0 0 0 6px;color:#fff" data-act="delHoliday" data-date="${f}" aria-label="Quitar">×</button></span>`).join('') || '<span class="muted small">Sin festivos.</span>'}</div>
  </div>
  <div class="card section"><div class="row"><h2 style="margin:0">Días especiales</h2><span class="spacer"></span><button class="btn small" data-act="addSpecial">${ICON.plus} Añadir día</button></div>
    <p class="small muted">Para una fecha concreta: otro tipo de día, cerrar o unas franjas propias (Nochebuena, una reforma, un evento…).</p>
    ${ex.length ? ex.map((o, i) => {
      const mode = o.cerrado ? 'cerrado' : o.franjas ? 'propias' : 'tipo';
      return `<div style="border-top:1px solid var(--line);padding:12px 0">
      <div class="fields two">
        <label class="field">Fecha<input type="date" value="${o.fecha}" data-bind="excepciones_fecha.${i}.fecha"></label>
        <label class="field">Qué pasa ese día<select data-act-change="specialMode" data-i="${i}">
          <option value="tipo" ${mode === 'tipo' ? 'selected' : ''}>Usa otro tipo de día</option>
          <option value="cerrado" ${mode === 'cerrado' ? 'selected' : ''}>Cerrado</option>
          <option value="propias" ${mode === 'propias' ? 'selected' : ''}>Franjas propias</option></select></label>
        ${mode === 'tipo' ? `<label class="field">Tipo de día<select data-bind="excepciones_fecha.${i}.tipo_dia" data-type="nullstr">${dayTypeOptions(o.tipo_dia, 'el habitual')}</select></label>` : ''}
        <label class="field">Nota<input type="text" value="${esc(o.nota || '')}" data-type="nullstr" data-bind="excepciones_fecha.${i}.nota"></label>
      </div>
      ${mode === 'propias' ? `<div style="margin-top:10px">${slotsEditor(`excepciones_fecha.${i}.franjas`, o.franjas)}</div>` : ''}
      <button class="btn small danger" style="margin-top:8px" data-act="delSpecial" data-i="${i}">Quitar este día</button></div>`;
    }).join('') : '<p class="muted small">Ninguno.</p>'}
  </div>`;
}

// ------------------------------------------------------------------ AUSENCIAS Y PETICIONES
function viewAusencias() {
  const c = state.draft;
  const today = todayIso();
  const rows = c.ausencias.map((a, i) => ({ a, i })).filter(({ a }) => state.showPast || a.hasta >= today).sort((x, y) => x.a.desde.localeCompare(y.a.desde));
  const hidden = c.ausencias.length - rows.length;
  const reqs = c.excepciones_asignacion.map((o, i) => ({ o, i })).filter(({ o }) => state.showPast || o.fecha >= today).sort((x, y) => x.o.fecha.localeCompare(y.o.fecha));
  return `${head('Ausencias', 'Vacaciones, bajas y peticiones puntuales. El motor no asigna turnos a quien está ausente y respeta lo que fijes aquí.')}
  <div class="card"><div class="row"><h2 style="margin:0">Vacaciones, bajas y permisos</h2><span class="spacer"></span>
    <label class="toggle small"><input type="checkbox" data-act-change="togglePast" ${state.showPast ? 'checked' : ''}> Ver pasadas</label>
    <button class="btn small primary" data-act="addAbsence">${ICON.plus} Añadir</button></div>
    ${rows.length ? `<div class="table-wrap"><table class="list edit" style="margin-top:10px"><thead><tr><th>Persona</th><th>Desde</th><th>Hasta</th><th>Motivo</th><th class="num">Días</th><th></th></tr></thead><tbody>
    ${rows.map(({ a, i }) => `<tr>
      <td style="min-width:150px"><select data-bind="ausencias.${i}.empleado_id">${empOptions(a.empleado_id)}</select></td>
      <td><input type="date" value="${a.desde}" data-bind="ausencias.${i}.desde" data-rerender></td>
      <td><input type="date" value="${a.hasta}" data-bind="ausencias.${i}.hasta" data-rerender></td>
      <td style="min-width:130px"><select data-bind="ausencias.${i}.motivo">${Object.entries(MOTIVOS).map(([k, v]) => `<option value="${k}" ${a.motivo === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
      <td class="num">${a.hasta >= a.desde ? daysBetween(a.desde, a.hasta) + 1 : '<span style="color:var(--bad)">!</span>'}</td>
      <td><button class="icon-btn" data-act="delRow" data-list="ausencias" data-i="${i}" title="Quitar">${ICON.trash}</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted small">No hay ausencias próximas.</p>'}
    ${hidden ? `<p class="small muted">${hidden} ausencias pasadas ocultas.</p>` : ''}
  </div>
  <div class="card section"><div class="row"><h2 style="margin:0">Peticiones puntuales</h2><span class="spacer"></span><button class="btn small primary" data-act="addRequest">${ICON.plus} Añadir</button></div>
    <p class="small muted">Un día libre que alguien pide, que trabaje en su día de libranza o que haga un turno concreto.</p>
    ${reqs.length ? `<div class="table-wrap"><table class="list edit"><thead><tr><th>Persona</th><th>Fecha</th><th>Petición</th><th>Turno</th><th></th></tr></thead><tbody>
    ${reqs.map(({ o, i }) => `<tr>
      <td style="min-width:150px"><select data-bind="excepciones_asignacion.${i}.empleado_id">${empOptions(o.empleado_id)}</select></td>
      <td><input type="date" value="${o.fecha}" data-bind="excepciones_asignacion.${i}.fecha"></td>
      <td style="min-width:170px"><select data-act-change="requestType" data-i="${i}">
        <option value="libre" ${o.tipo === 'libre' ? 'selected' : ''}>Librar ese día</option>
        <option value="trabaja" ${o.tipo === 'trabaja' ? 'selected' : ''}>Trabajar (aunque libre)</option>
        <option value="turno" ${o.tipo === 'turno' ? 'selected' : ''}>Hacer un turno concreto</option></select></td>
      <td style="min-width:170px">${o.tipo === 'turno' ? `<select data-bind="excepciones_asignacion.${i}.turno_id">${shiftOptions(o.turno_id)}</select>` : '<span class="muted">—</span>'}</td>
      <td><button class="icon-btn" data-act="delRow" data-list="excepciones_asignacion" data-i="${i}" title="Quitar">${ICON.trash}</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted small">Ninguna.</p>'}
  </div>`;
}

// ------------------------------------------------------------------ PREFERENCIAS
function shiftChips(path, selected) {
  const set = new Set(selected || []);
  return `<div class="chips">${state.draft.turnos.map((s) => `<button type="button" class="chip ${set.has(s.id) ? 'on' : ''}" data-act="toggleShift" data-path="${path}" data-shift="${esc(s.id)}" aria-pressed="${set.has(s.id)}" title="${esc(s.nombre)} ${s.inicio}–${s.fin}">${esc(s.nombre)}</button>`).join('')}</div>`;
}
function viewPreferencias() {
  const p = state.draft.preferencias;
  return `${head('Preferencias', 'Lo que a cada persona le gusta o prefiere evitar. Se respeta siempre que no deje sin cubrir un pico; el peso indica cuánto importa.', `<button class="btn primary" data-act="addPref">${ICON.plus} Añadir preferencia</button>`)}
  ${p.length ? `<div class="grid">${p.map((x, i) => `<div class="card">
    <div class="fields two">
      <label class="field">Persona<select data-bind="preferencias.${i}.empleado_id">${empOptions(x.empleado_id)}</select></label>
      <label class="field">Preferencia<select data-bind="preferencias.${i}.tipo"><option value="prefiere" ${x.tipo === 'prefiere' ? 'selected' : ''}>Prefiere estos turnos</option><option value="evita" ${x.tipo === 'evita' ? 'selected' : ''}>Prefiere evitar estos turnos</option></select></label>
    </div>
    <div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Turnos</div>${shiftChips(`preferencias.${i}.turnos`, x.turnos)}</div>
    <div style="margin-top:12px"><div class="small muted" style="font-weight:600;margin-bottom:6px">Qué días</div>${dayChips(`preferencias.${i}.dias`, x.dias, 'Todos los días')}</div>
    <div class="row" style="margin-top:12px;align-items:flex-end">
      <label class="field" style="flex:1">Importancia: <b style="color:var(--ink)" id="w${i}">${x.peso}</b> de 10<input type="range" min="1" max="10" value="${x.peso}" data-type="int" data-bind="preferencias.${i}.peso" data-rerender></label>
      <button class="icon-btn" data-act="delRow" data-list="preferencias" data-i="${i}" title="Quitar">${ICON.trash}</button>
    </div></div>`).join('')}</div>` : '<div class="card empty">Sin preferencias. El motor solo atenderá a la demanda y a las reglas.</div>'}`;
}

// ------------------------------------------------------------------ REGLAS
function numField(path, label, hint, val, step = 0.5, min = 0) {
  return `<label class="field">${label}${hint ? `<span class="hint">${hint}</span>` : ''}<input type="number" step="${step}" min="${min}" value="${val}" data-bind="${path}"></label>`;
}
function alertSettingsCard() {
  const a = state.draft.alertas;
  const cat = (state.me && state.me.alertas_catalogo) || [];
  return `<div class="card section"><h2>Alertas</h2>
    <p class="small muted">Cuándo te avisa el sistema. El motor también intenta no pasarse de los umbrales de reparto y de días seguidos.</p>
    <div class="fields two">
      ${numField('alertas.reparto_horas_pct', 'Reparto de horas (puntos %)', 'Diferencia máxima entre quien más y quien menos cumple su contrato', a.reparto_horas_pct, 1)}
      ${numField('alertas.reparto_fines_semana', 'Fines de semana (diferencia)', 'Entre quien más y quien menos trabaja', a.reparto_fines_semana, 1)}
      ${numField('alertas.reparto_cierres', 'Cierres (diferencia)', 'Entre quien más y quien menos cierra', a.reparto_cierres, 1)}
      ${numField('alertas.preferencias_incumplidas_pct', 'Preferencias incumplidas (%)', 'Días fuera de su franja a partir de los cuales se avisa', a.preferencias_incumplidas_pct, 5)}
      ${numField('alertas.racha_dias_max', 'Días seguidos máximos', 'A partir de ahí se avisa', a.racha_dias_max, 1, 1)}
      ${numField('alertas.exceso_personal_horas_dia', 'Personal de más (horas-persona al día)', '', a.exceso_personal_horas_dia, 0.5)}
      ${numField('alertas.plantilla_sobra_pct', 'Plantilla sobrante (%)', 'Cuánto pueden superar los contratos a la demanda de una semana antes de avisar', a.plantilla_sobra_pct, 1)}
    </div>
    <h3 style="margin:18px 0 6px;font-size:15px">Qué alertas recibir</h3>
    <div class="chips">${cat.map((c) => `<button type="button" class="chip ${a.desactivadas.includes(c.codigo) ? '' : 'on'}" data-act="toggleAlertCode" data-code="${esc(c.codigo)}" aria-pressed="${!a.desactivadas.includes(c.codigo)}">${esc(c.descripcion)}</button>`).join('')}</div>
    <p class="small muted" style="margin-bottom:0">Las reglas incumplidas, las ausencias que no se reflejan en el horario y los avisos de contexto no se pueden silenciar.</p>
  </div>`;
}

function viewReglas() {
  const r = state.draft.reglas, w = state.draft.pesos;
  return `${head('Reglas', 'Lo que un horario debe cumplir. Revisa estos valores con la gestoría y el convenio de hostelería de Asturias.')}
  <div class="card"><h2>Descansos y jornada</h2><div class="fields two">
    ${numField('reglas.descanso_minimo_horas', 'Descanso entre jornadas (h)', 'Mínimo entre el fin de un turno y el siguiente', r.descanso_minimo_horas)}
    ${numField('reglas.dias_libres_por_semana', 'Días libres por semana', 'Mínimo por semana natural', r.dias_libres_por_semana)}
    ${numField('reglas.max_horas_dia', 'Máximo de horas al día', '', r.max_horas_dia)}
  </div></div>
  <div class="card section"><h2>Bolsa de horas</h2><div class="fields two">
    ${numField('reglas.margen_semanal_horas', 'Margen semanal (h)', 'Cuánto puede variar una semana respecto al contrato', r.margen_semanal_horas)}
    ${numField('reglas.margen_periodo_horas', 'Tolerancia del periodo (h)', 'Diferencia que no cuenta como extra ni como falta', r.margen_periodo_horas)}
    ${numField('reglas.max_horas_extra_semana', 'Horas extra máximas por semana', 'Solo se usan si no hay otra forma de cubrir', r.max_horas_extra_semana)}
    ${numField('reglas.max_saldo_horas', 'Saldo máximo que se arrastra (h)', '', r.max_saldo_horas)}
  </div>
  <div class="stack" style="gap:10px;margin-top:14px">${toggle('reglas.arrastrar_saldo', r.arrastrar_saldo, 'Compensar en cada periodo las horas de más o de menos del anterior')}</div></div>
  <div class="card section"><h2>Cobertura</h2>
    <div class="stack" style="gap:10px">${toggle('reglas.encargado_siempre', r.encargado_siempre, 'Intentar que siempre haya un encargado en el local')}</div>
    <div class="fields two" style="margin-top:14px"><label class="field">Precisión de la cobertura<select data-bind="reglas.resolucion_minutos" data-type="int">${[15, 30, 60].map((v) => `<option value="${v}" ${r.resolucion_minutos === v ? 'selected' : ''}>${v} minutos</option>`).join('')}</select></label></div>
  </div>
  ${alertSettingsCard()}
  <details class="card section"><summary style="cursor:pointer"><h2 style="display:inline">Ajuste fino del motor</h2> <span class="small muted">· para usuarios avanzados</span></summary>
    <p class="small muted">Cuánto penaliza el motor cada cosa. Cubrir la demanda debe ser siempre lo más importante.</p>
    <div class="fields two">
      ${numField('pesos.falta_cobertura', 'Falta de cobertura', '', w.falta_cobertura, 1, 1)}
      ${numField('pesos.falta_encargado', 'Falta de encargado', '', w.falta_encargado, 1, 1)}
      ${numField('pesos.falta_funcion', 'Falta de alguien con una función', 'Por cada tramo sin nadie en caja, sin quien prepare pinchos (o la función que sea)', w.falta_funcion ?? 800, 1, 0)}
      ${numField('pesos.exceso_funcion', 'Gente de más en un rol', 'Por cada tramo con más gente en un rol de la que permite su regla (p. ej. dos en lava)', w.exceso_funcion ?? 400, 1, 0)}
      ${numField('pesos.horas_extra', 'Horas extra', '', w.horas_extra, 1, 0)}
      ${numField('pesos.horas_por_debajo_contrato', 'Horas por debajo del contrato', '', w.horas_por_debajo_contrato, 1, 0)}
      ${numField('pesos.uso_comodin', 'Cada minuto de un comodín', 'Menos que las horas extra: el comodín cubre los huecos antes de que alguien haga horas de más', w.uso_comodin, 1, 0)}
      ${numField('pesos.exceso_cobertura', 'Personal de más', '', w.exceso_cobertura, 1, 0)}
      ${numField('pesos.preferencia', 'Preferencias', '', w.preferencia, 1, 0)}
      ${numField('pesos.reparto_desigual', 'Reparto desigual de fines de semana y cierres', '', w.reparto_desigual, 1, 0)}
      ${numField('pesos.reparto_turnos', 'Fines de semana o cierres por encima del umbral de alertas', 'Por cada uno de diferencia entre personas', w.reparto_turnos, 1, 0)}
      ${numField('pesos.reparto_horas', 'Reparto de horas por encima del umbral de alertas', 'Por cada milésima de diferencia en el % de contrato', w.reparto_horas, 1, 0)}
      ${numField('pesos.racha_larga', 'Rachas de días seguidos', 'Por cada día por encima del aviso de rachas', w.racha_larga, 1, 0)}
      ${numField('pesos.critica', 'Alertas críticas (el horario no vale)', 'Cada media hora sin nadie y cada día sin quien abra o cierre; muy por encima de todo lo demás', w.critica, 1, 0)}
      ${numField('pesos.saldo_desbordado', 'Saldo de horas que no se podría arrastrar', '', w.saldo_desbordado, 1, 0)}
      ${numField('pesos.cambio_turno', 'Cada casilla que cambia al solucionar problemas', 'Cuanto mayor, menos cambios propone el solucionador', w.cambio_turno, 1, 0)}
    </div>
  </details>`;
}

// ------------------------------------------------------------------ AJUSTES
function viewAjustes() {
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

// ------------------------------------------------------------------ utilidades del portal
const CLASES = { horas: 'Horas distintas', turno: 'Turno distinto', no_trabajado: 'No trabajé', extra: 'Día extra' };
const ESTADO_BADGE = { pendiente: ['warn', 'Pendiente'], aprobada: ['publicado', 'Aprobada'], rechazada: ['bad', 'Rechazada'] };
const pad2 = (n) => String(n).padStart(2, '0');
function monthBounds(offset = 0) {
  const t = todayIso(); let y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) + offset;
  while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
  return [`${y}-${pad2(m)}-01`, iso(new Date(Date.UTC(y, m, 0)))];
}
const shiftText = (turnos, id) => { const s = turnos.find((t) => t.id === id); return s ? `${s.nombre} · ${s.inicio}–${s.fin}` : '—'; };
const shiftHours = (turnos, id) => { const s = turnos.find((t) => t.id === id); return s ? (toMin(s.fin) - toMin(s.inicio)) / 60 : 0; };
const signed = (x) => `${x > 0 ? '+' : ''}${fmtH(x)} h`;
const reqBadge = (e) => { const [c, l] = ESTADO_BADGE[e] || ['neutral', e]; return `<span class="badge ${c}">${l}</span>`; };

// Carga una vez un dato del servidor; devuelve HTML si aún no se puede pintar la vista (cargando o error).
function ensure(holder, key, url) {
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

function reqSummary(r, turnos) {
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
  const item = (a) => `<li class="${a.urgente ? 'urgent' : ''}">${a.urgente ? '<span class="badge bad">Pronto</span> ' : ''}${esc(a.texto)} <span class="small muted">· ${esc(fmtStamp(a.creado))}</span></li>`;
  return `${nuevos.length ? `<div class="notice-board section" role="alert"><div class="row" style="justify-content:space-between;align-items:center"><h2 style="margin:0">Tu horario ha cambiado</h2><button class="btn primary small" data-act="readNotices">Entendido</button></div><ul>${nuevos.map(item).join('')}</ul></div>` : ''}
  ${vistos.length ? `<details class="section"><summary class="small muted" style="cursor:pointer">Avisos anteriores (${vistos.length})</summary><ul class="old-notices">${vistos.map(item).join('')}</ul></details>` : ''}`;
}

function viewMiInicio() {
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

function teamCalendarsCard() {
  const err = ensure(state.calT, 'data', '/api/calendarios'); if (err) return '';
  const d = state.calT.data;
  if (!d.disponible) return '';
  return `<div class="card"><h2>Calendarios del equipo</h2>
    <p class="small muted">Cada persona puede suscribirse a sus turnos desde Google Calendar o el iPhone (lo hace sola desde su Inicio, y el enlace también va en su mensaje de Slack). Desde aquí puedes crear o copiar el enlace para mandárselo por otra vía.</p>
    <table class="list"><tbody>${d.personas.map((p) => `<tr><td><b>${esc(p.nombre)}</b></td><td style="text-align:right">${p.enlaces
      ? `<button class="btn small" data-act="copyCal" data-url="${esc(p.enlaces.url)}">Copiar enlace</button>`
      : `<button class="btn small" data-act="createTeamCal" data-id="${esc(p.empleado_id)}">Crear enlace</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}

function viewMisHoras() {
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

function viewMisVacaciones() {
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

function viewMisPrefs() {
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

// ------------------------------------------------------------------ SOLICITUDES (encargados)
function viewSolicitudes() {
  const s = state.sol; if (!s.filtro) s.filtro = 'pendiente';
  const url = `/api/solicitudes${s.filtro === 'pendiente' ? '?estado=pendiente' : ''}`;
  if (s.url !== url) { s.url = url; s.data = undefined; }
  const chip = (k, l) => `<button type="button" class="chip ${s.filtro === k ? 'on' : ''}" data-act="solFiltro" data-f="${k}">${l}</button>`;
  const top = `${head('Solicitudes', 'Vacaciones y correcciones de horas que piden los trabajadores. Al aprobar unas vacaciones se añaden a las ausencias; al aprobar una corrección se ajustan sus horas y el saldo que se arrastra al siguiente horario.')}<div class="chips" style="margin-bottom:14px">${chip('pendiente', 'Pendientes')}${chip('todas', 'Todas')}</div>`;
  const err = ensure(s, 'data', url);
  if (err) return top + err;
  if (!s.data.length) return top + `<div class="card empty">${s.filtro === 'pendiente' ? 'No hay solicitudes pendientes.' : 'Todavía no hay solicitudes.'}</div>`;
  const turnos = state.config.turnos;
  return `${top}<div class="grid">${s.data.map((r) => {
    const d = r.datos;
    let impact = '';
    if (r.tipo === 'correccion') { const diff = d.minutos / 60 - shiftHours(turnos, d.turno_previsto); impact = `<span class="badge ${diff ? 'warn' : 'neutral'}">${signed(diff)}</span>`; }
    return `<div class="card">
      <div class="row" style="flex-wrap:nowrap"><b style="font-size:16px">${esc(r.nombre)}</b><span class="spacer"></span>${r.estado === 'pendiente' ? '' : reqBadge(r.estado)}</div>
      <div style="margin-top:8px">${reqSummary(r, turnos)} ${impact}</div>
      ${r.motivo ? `<p class="small" style="margin:10px 0 0">«${esc(r.motivo)}»</p>` : ''}
      <div class="small muted" style="margin-top:8px">Enviada ${fmtStamp(r.created_at)}</div>
      ${r.estado === 'pendiente' ? `<div class="row" style="margin-top:14px"><button class="btn primary" data-act="resolve" data-id="${r.id}" data-accion="aprobar" data-tipo="${r.tipo}">Aprobar</button><button class="btn danger" data-act="resolve" data-id="${r.id}" data-accion="rechazar" data-tipo="${r.tipo}">Rechazar</button></div>`
      : `<div class="small muted" style="margin-top:6px">${esc(r.resuelto_por || '')} · ${fmtStamp(r.resuelto_at)}${r.respuesta ? `<br>«${esc(r.respuesta)}»` : ''}</div>`}
    </div>`;
  }).join('')}</div>`;
}

// ------------------------------------------------------------------ WEB (encargados): formularios y carta
const WEB_TIPOS = { candidatura: 'Candidatura', catering: 'Catering' };
const WEB_ESTADOS = { nuevo: 'Nuevo', atendido: 'Atendido', archivado: 'Archivado' };
const fmtBytes = (n) => (n >= 1048576 ? `${fmtH(Math.round(n / 104857.6) / 10)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function viewWeb() {
  const s = state.web; if (!s.filtro) s.filtro = 'nuevo';
  const chip = (k, l) => `<button type="button" class="chip ${s.filtro === k ? 'on' : ''}" data-act="webFiltro" data-f="${k}">${l}</button>`;
  const top = `${head('Web', 'Lo que llega desde los formularios de la web (candidaturas con su CV y peticiones de catering) y la carta que se ve en la web.')}`;
  const err = ensure(s, 'data', '/api/web/mensajes') || ensure(s, 'docs', '/api/web/documentos');
  if (err) return top + err;
  const lista = s.data.filter((m) => (s.filtro === 'todos' ? true : s.filtro === 'nuevo' ? m.estado === 'nuevo' : m.tipo === s.filtro));
  const mensajes = lista.length ? `<div class="grid">${lista.map((m) => {
    const d = m.datos || {};
    const extra = m.tipo === 'catering' ? [d.fecha ? `Para el ${fmtLong(d.fecha)}` : '', d.personas ? `${d.personas} personas` : ''].filter(Boolean).join(' · ') : '';
    return `<div class="card">
      <div class="row" style="flex-wrap:nowrap"><b style="font-size:16px">${esc(m.nombre)}</b><span class="spacer"></span><span class="badge neutral">${WEB_TIPOS[m.tipo] || esc(m.tipo)}</span>${m.estado === 'nuevo' ? '<span class="badge warn">Nuevo</span>' : ''}</div>
      <div class="small" style="margin-top:6px"><a href="mailto:${esc(m.email)}">${esc(m.email)}</a>${m.telefono ? ` · <a href="tel:${esc(m.telefono.replace(/\s+/g, ''))}">${esc(m.telefono)}</a>` : ''}</div>
      ${extra ? `<div class="small" style="margin-top:6px">${esc(extra)}</div>` : ''}
      ${d.mensaje ? `<p class="small" style="margin:10px 0 0;white-space:pre-wrap">${esc(d.mensaje)}</p>` : ''}
      <div class="small muted" style="margin-top:8px">Recibido ${fmtStamp(m.created_at)}${m.estado !== 'nuevo' ? ` · ${WEB_ESTADOS[m.estado]} por ${esc(m.atendido_por || '')}` : ''}</div>
      <div class="row" style="margin-top:14px">
        ${m.adjunto_nombre ? `<a class="btn small" href="/api/web/mensajes/${m.id}/adjunto">Descargar CV</a>` : ''}
        ${m.estado === 'nuevo' ? `<button class="btn small primary" data-act="webEstado" data-id="${m.id}" data-estado="atendido">Marcar atendido</button>` : `<button class="btn small" data-act="webEstado" data-id="${m.id}" data-estado="nuevo">Volver a nuevo</button>`}
        <span class="spacer"></span><button class="icon-btn" data-act="webBorrar" data-id="${m.id}" title="Borrar">${ICON.trash}</button>
      </div>
    </div>`;
  }).join('')}</div>`
    : `<div class="card empty">${s.filtro === 'nuevo' ? 'No hay mensajes nuevos.' : 'No hay mensajes.'}</div>`;
  const docs = `<div class="card section"><h2>Carta en la web</h2>
    <p class="small muted">Sube el PDF de cada carta; la web enlaza siempre al último que subas.</p>
    <table class="list"><tbody>${s.docs.map((d) => `<tr><td><b>${esc(d.titulo)}</b><div class="small muted">${d.nombre ? `${esc(d.nombre)} · ${fmtBytes(d.bytes)} · ${fmtStamp(d.updated_at)}` : 'Sin subir'}</div></td>
      <td style="text-align:right;white-space:nowrap">${d.nombre ? `<a class="btn small" href="/api/web/documentos/${d.clave}" target="_blank" rel="noopener">Ver</a> ` : ''}<label class="btn small">Subir PDF<input type="file" accept="application/pdf" hidden data-web-doc="${d.clave}"></label></td></tr>`).join('')}</tbody></table>
  </div>`;
  return `${top}<div class="chips" style="margin-bottom:14px">${chip('nuevo', 'Nuevos')}${chip('candidatura', 'Candidaturas')}${chip('catering', 'Catering')}${chip('todos', 'Todos')}</div>${mensajes}${docs}
  <p class="small muted section">Los CV y mensajes son datos personales: bórralos cuando ya no hagan falta.</p>`;
}

// ------------------------------------------------------------------ GUÍA DE USO
// Una sección por pantalla: para qué sirve, cómo se usa en pocos pasos y un botón que lleva a ella.
// Cada pantalla enlaza a su sección con «¿Cómo funciona esta pantalla?» (#/guia/<pantalla>).
const GUIA_ADMIN = [
  { id: 'horarios', titulo: 'Horarios', para: 'Crear, revisar y publicar el horario de una semana, un mes o unas fechas.', pasos: [
    'Elige el periodo (semana, mes o fechas) y pulsa <b>Generar</b>. El motor reparte los turnos cumpliendo las reglas y cubriendo la demanda.',
    'Abre el horario. Arriba ves los avisos y la cobertura de cada día; abajo, el cuadrante y las horas de cada persona.',
    'Toca una casilla para cambiar un turno o, con <b>Quitar el turno</b>, dejar a esa persona libre ese día. Los cambios a mano quedan bloqueados (candado) y se respetan si regeneras.',
    'Con <b>Día · Semana · Mes</b> cambias de vista. En la de día puedes arrastrar los turnos hora a hora.',
    '<b>Solucionar problemas</b> propone los mínimos cambios para quitar alertas. <b>Publicar y enviar a Slack</b> lo hace visible al equipo.',
  ] },
  { id: 'calendario', titulo: 'Calendario', para: 'Ver todos los horarios juntos, día a día, semana a semana o mes a mes.', pasos: [
    'Elige <b>Semana</b> o <b>Mes</b> y muévete con ‹ › u <b>Hoy</b>.',
    'Con <b>Persona</b> ves solo los turnos de alguien (útil para revisar su mes).',
    'Toca un día o un turno para abrirlo en la vista de día y editarlo. Con <b>Día</b> se abre el día que estás viendo; si no tiene horario, se abre el siguiente día que sí lo tiene.',
    'Los días sin horario salen en gris: créalo en Horarios.',
  ] },
  { id: 'dia', ir: 'calendario', titulo: 'Retocar un día (vista de día)', para: 'Mover, alargar, acortar, añadir o quitar turnos hora a hora viendo la cobertura al momento.', pasos: [
    '<b>Arrastra</b> un turno para moverlo y <b>tira de sus bordes</b> para alargarlo o acortarlo.',
    '<b>Toca</b> un turno para el menú: horas exactas, botones de <b>±30 min</b>, <b>±1 h</b> y <b>desplazar</b>, puesto (sala o cocina) o quitarlo.',
    'Toca un hueco en la fila de alguien para añadirle un turno.',
    'Las personas salen <b>por hora de entrada</b>: arriba quien entra antes; abajo quien no trabaja ese día.',
    'Con <b>− / +</b> (arriba a la derecha del diagrama) acercas para afinar al arrastrar o alejas para ver el día entero. Pulsa el porcentaje para volver al 100 %.',
    'Nada se guarda hasta <b>Confirmar cambios</b>: verás qué alertas aparecen o se resuelven antes de guardar o publicar.',
    'Desde el cuadrante también puedes usar los ajustes rápidos: te llevan a la vista de día para confirmarlos.',
  ] },
  { id: 'alertas', titulo: 'Alertas', para: 'Saber qué revisar en los horarios en curso, de lo más a lo menos importante.', pasos: [
    '<b>Críticas</b>: el horario no vale (momentos sin nadie, nadie que pueda abrir o cerrar). Arréglalas antes de publicar.',
    'Cada alerta explica el problema y sugiere qué hacer; muchas traen botón para ir a arreglarlo.',
    '<b>Reconocer</b> aparta una alerta que ya conoces. Si cambia, vuelve a salir.',
    'Qué se avisa y con qué umbrales se ajusta en Reglas → Alertas.',
  ] },
  { id: 'solicitudes', titulo: 'Solicitudes', para: 'Aprobar o rechazar vacaciones, permisos y correcciones de horas que pide el equipo.', pasos: [
    'Las pendientes salen arriba, con un número en la pestaña.',
    'Al aprobar unas vacaciones se añaden a Ausencias y la app arregla los horarios afectados (sin publicar nada).',
    'Las correcciones aprobadas ajustan el informe de horas y el saldo del siguiente horario.',
  ] },
  { id: 'informes', titulo: 'Informes de horas', para: 'Ver de un vistazo cuánto ha trabajado cada persona en el periodo que elijas.', pasos: [
    'Elige las fechas o usa <b>Este mes</b>, <b>Mes anterior</b>, <b>Últimos 3 meses</b> o <b>Este año</b>.',
    'Por persona: horas trabajadas, contrato, horas extra o de menos, días, fines de semana, festivos, aperturas y cierres.',
    'Si el periodo abarca varios meses, abajo sale la tabla <b>mes a mes</b>.',
    'Activa <b>Contar también los borradores</b> para incluir horarios aún no publicados. <b>Descargar CSV</b> para la gestoría.',
  ] },
  { id: 'equipo', titulo: 'Equipo', para: 'Las personas: horas de contrato, si son camareros o cocineros, sus funciones y qué días libran.', pasos: [
    '<b>Añadir persona</b> y rellena su nombre y horas por semana.',
    '<b>Añadir comodín</b> (o marca «Comodín» en una ficha) para alguien sin horas de contrato que solo trabaja cuando falta gente: si al resto le faltan 30 horas para cubrir la demanda, se le pueden dar esas 30; si no falta nadie, no tiene turnos. Puedes ponerle un <b>mínimo</b> y un <b>máximo</b> de horas por semana, o dejarlos vacíos.',
    '<b>Tipo de empleado</b>: Camarero/a (sala), Cocinero/a (cocina) o los dos.',
    '<b>Funciones</b>: puede abrir, puede cerrar, encargado/a y las que hayas creado (p. ej. preparar pinchos).',
    'Marca sus <b>días que libra</b> fijos. Si deja la empresa, desactiva «En plantilla» en vez de borrarla.',
    'Pulsa <b>Guardar cambios</b> abajo.',
    '<b>Marcar baja</b> (en la ficha de cada persona): desde cuándo y, si se sabe, hasta cuándo. Si ya tenía turnos asignados, te sale un aviso con los que no va a hacer, una alerta en el horario y un arreglo preparado como borrador. Con <b>Dar el alta</b> indicas el día que vuelve.',
  ] },
  { id: 'funciones', titulo: 'Funciones', para: 'Lo que solo hacen algunas personas (abrir, cerrar, encargado, los roles de camarero o lo que añadas) y las reglas que deben cumplirse.', pasos: [
    '<b>Roles de camarero</b> crea caja, cafetera, sala y lava (los puedes renombrar, quitar o añadir más). Marca quién puede hacer cada uno.',
    'Cada camarero hace <b>uno</b> de sus roles en todo el turno. Las reglas dicen cuántos hacen falta: «de 9:00 a 21:00, al menos 1 en caja» o «como mucho 1 en lava».',
    'El rol de cada turno sale en el horario; para cambiarlo, toca la casilla o el turno en la vista del día.',
    'Las <b>tareas de apoyo</b> (p. ej. «Preparar pinchos») las cubre cualquiera que sepa hacerlas y esté trabajando.',
    'El motor cumple las reglas si puede y, si no, salta una alerta con sugerencias.',
    'Pulsa <b>Guardar cambios</b> y regenera los horarios que quieras actualizar.',
  ] },
  { id: 'turnos', titulo: 'Turnos', para: 'Los turnos posibles (apertura, mañana, tarde, cierre…) con sus horas.', pasos: [
    'Cada turno tiene un código, un nombre, horas, tipo (apertura, normal o cierre) y color.',
    'Los de apertura y cierre solo los hace quien puede abrir o cerrar.',
    'Si un turno solo existe algunos días (p. ej. refuerzo de fin de semana), márcalos.',
  ] },
  { id: 'demanda', titulo: 'Demanda', para: 'Cuántas personas hacen falta en cada franja del día y las tareas fijas.', pasos: [
    'Define los <b>tipos de día</b> (laborable, viernes, sábado…) con sus franjas y personas, y cuál toca cada día de la semana.',
    'En cada franja puedes pedir un mínimo en <b>cocina</b> y en <b>sala</b>.',
    '<b>Tareas fijas</b>: trabajo que no depende de la clientela (preparar, limpiar, recibir pedidos).',
    'Festivos y días especiales (cerrado, otra demanda) también se ponen aquí.',
  ] },
  { id: 'ausencias', titulo: 'Ausencias', para: 'Vacaciones, bajas y permisos, y cambios fijos para un día concreto.', pasos: [
    'Añade la persona, las fechas y el motivo. El motor no le pondrá turnos esos días.',
    'Si ya había horarios en esas fechas, la app los arregla sola y te avisa.',
  ] },
  { id: 'preferencias', titulo: 'Preferencias', para: 'Turnos que alguien prefiere o evita, y cuánto le importa.', pasos: [
    'Elige la persona, si prefiere o evita, los turnos y (opcional) los días.',
    'Se respetan si no comprometen la cobertura. Cada trabajador puede editar las suyas.',
  ] },
  { id: 'reglas', titulo: 'Reglas', para: 'Lo que todo horario debe cumplir y los avisos que quieres recibir.', pasos: [
    'Descanso entre jornadas, días libres por semana, horas máximas al día y bolsa de horas.',
    '<b>Cobertura</b>: si debe haber siempre un encargado.',
    '<b>Alertas</b>: umbrales y avisos que quieres silenciar.',
    '<b>Ajuste fino del motor</b> (avanzado): cuánto pesa cada cosa.',
  ] },
  { id: 'web', titulo: 'Web', para: 'Lo que llega desde la web pública (candidaturas y catering) y la carta en PDF.', pasos: [
    'Marca los mensajes como atendidos y borra los CV cuando ya no hagan falta.',
    'Sube el PDF de cada carta: la web enlaza siempre al último.',
  ] },
  { id: 'comentarios', titulo: 'Comentarios', para: 'Sugerencias, fallos y dudas sobre la app, para que quede todo apuntado.', pasos: [
    'Desde cualquier pantalla, pulsa <b>Comentarios</b> arriba a la derecha y escribe. Se guarda con la pantalla en la que estabas.',
    'En esta pestaña se ven todos: cambia su estado (nuevo, en curso, hecho, descartado) y responde.',
    'Quien lo envió ve la respuesta en su ventana de comentarios.',
  ] },
  { id: 'ajustes', titulo: 'Ajustes', para: 'Cuentas de acceso, Slack, copias e historial de la configuración.', pasos: [
    '<b>Cuentas de acceso</b>: crea una cuenta de trabajador para cada persona (con contraseña temporal) o de encargado. En cada cuenta, <b>Correo</b> le asocia su correo y <b>Contraseña</b> le pone una temporal si la ha olvidado.',
    '<b>Entrar con Google</b>: pega el ID de cliente de Google y en la entrada saldrá el botón. Quien entra con Google entra en la cuenta con su correo; si no tiene cuenta, aparece en <b>Registros con Google pendientes</b> y tú le das acceso (encargado o trabajador) o lo rechazas.',
    '<b>Mi cuenta</b> (arriba a la derecha): tu nombre, tu correo, vincular Google y cambiar tu contraseña.',
    '<b>Versiones</b>: cada guardado crea una versión; puedes restaurar cualquiera.',
    '<b>Exportar</b> o <b>Cargar archivo</b> la configuración completa.',
  ] },
];
const GUIA_WORKER = [
  { id: 'cuenta', ir: null, titulo: 'Mi cuenta', para: 'Tu correo, entrar con Google y tu contraseña.', pasos: [
    'Pulsa <b>Mi cuenta</b> arriba a la derecha.',
    'Pon tu correo: si es el de tu cuenta de Google, podrás entrar con el botón de Google sin contraseña (o pulsa el botón de Google para vincularla).',
    'Si olvidas la contraseña, entra con Google o pide a tu encargado una temporal.',
  ] },
  { id: 'inicio', titulo: 'Inicio', para: 'Tus próximos turnos y los avisos de cambios.', pasos: [
    'Arriba ves tus turnos de los próximos días.',
    'Si tu horario cambia, sale un aviso con lo que ha cambiado; márcalo como visto.',
    'En <b>Tus turnos en tu calendario</b>, suscríbete desde Google Calendar o el iPhone: tus turnos salen en tu calendario y se actualizan solos.',
  ] },
  { id: 'horas', titulo: 'Mis horas', para: 'Las horas que has trabajado y corregir un día que fue distinto.', pasos: [
    'Elige el periodo para ver tus horas previstas y ajustadas.',
    'Si un día trabajaste otras horas (o no trabajaste), pulsa <b>Corregir</b> y explica el motivo. Tu encargado lo revisará.',
    'Si no quieres escribir, pulsa <b>Dictar</b>, habla y pulsa <b>Parar</b>: el texto se escribe solo (en Chrome, Edge y Safari).',
  ] },
  { id: 'vacaciones', titulo: 'Vacaciones', para: 'Pedir vacaciones o permisos.', pasos: [
    'Elige las fechas y el motivo y envía la solicitud. La nota la puedes <b>dictar</b> con el botón del micrófono.',
    'Verás si está pendiente, aprobada o rechazada.',
  ] },
  { id: 'preferencias', titulo: 'Preferencias', para: 'Decir qué turnos prefieres o prefieres evitar.', pasos: [
    'Añade una preferencia, elige los turnos, los días y cuánto te importa, y guarda.',
    'Se tienen en cuenta siempre que no dejen el local sin cubrir.',
  ] },
  { id: 'comentarios', ir: null, titulo: 'Comentarios', para: 'Contarnos qué mejorarías o qué no funciona.', pasos: [
    'Pulsa <b>Comentarios</b> arriba a la derecha, escribe y envía.',
    'En la misma ventana verás la respuesta.',
  ] },
];
const guiaSecciones = () => (isWorker() ? GUIA_WORKER : GUIA_ADMIN);

function viewGuia() {
  const w = isWorker();
  const secs = guiaSecciones();
  const nombreTab = (id) => ((w ? NAV_WORKER : NAV_ADMIN).find(([k]) => k === id) || [])[1];
  const primeros = w ? '' : `<div class="card guia-pasos"><h2>Primeros pasos</h2><ol>
    <li>Da de alta al <a href="#/equipo">equipo</a>: horas de contrato, camarero o cocinero, funciones y días que libra.</li>
    <li>Crea las <a href="#/funciones">funciones</a> especiales (p. ej. preparar pinchos) y sus reglas.</li>
    <li>Revisa los <a href="#/turnos">turnos</a> y la <a href="#/demanda">demanda</a> de cada tipo de día.</li>
    <li>Apunta las <a href="#/ausencias">ausencias</a> conocidas y repasa las <a href="#/reglas">reglas</a>.</li>
    <li>Genera el primer <a href="#/horarios">horario</a>, revisa las <a href="#/alertas">alertas</a>, retócalo si hace falta y publícalo.</li>
    <li>Cada mes, mira los <a href="#/informes">informes de horas</a>.</li>
  </ol></div>`;
  const indice = `<nav class="guia-indice chips" aria-label="Secciones de la guía">${secs.map((g) => `<a class="chip" href="#/guia/${g.id}">${esc(g.titulo)}</a>`).join('')}</nav>`;
  const tarjetas = secs.map((g) => {
    const ir = g.ir === undefined ? g.id : g.ir;
    return `<section class="card guia-sec" id="guia-${g.id}">
      <div class="row" style="align-items:baseline"><h2 style="margin:0">${esc(g.titulo)}</h2><span class="spacer"></span>
        ${ir ? `<a class="btn small primary" href="#/${ir}">Ir a ${esc(nombreTab(ir) || g.titulo)} →</a>` : g.id === 'cuenta' ? '<button class="btn small primary" data-act="cuentaDialog">Abrir Mi cuenta</button>' : `<button class="btn small primary" data-act="feedback">Abrir comentarios</button>`}</div>
      <p class="lead" style="margin:6px 0 10px">${esc(g.para)}</p>
      <ol class="guia-lista">${g.pasos.map((p) => `<li>${p}</li>`).join('')}</ol>
    </section>`;
  }).join('');
  return `${head('Guía de uso', w ? 'Cómo usar la app en tu día a día. Cada apartado tiene un botón para ir a esa pantalla.' : 'Cómo funciona cada pantalla, en pocos pasos. Cada apartado tiene un botón para ir directamente a ella, y cada pantalla tiene arriba un enlace «¿Cómo funciona esta pantalla?» que trae aquí.')}
  ${primeros}${indice}<div class="stack guia">${tarjetas}</div>
  <p class="small muted section">¿Algo no queda claro? Pulsa <a href="#" data-act="feedback">Comentarios</a> y cuéntanoslo.</p>`;
}

// ------------------------------------------------------------------ COMENTARIOS (feedback sobre la app)
const FB_TIPOS = { sugerencia: 'Sugerencia', error: 'Algo no funciona', duda: 'Duda' };
const FB_ESTADOS = { nuevo: ['warn', 'Nuevo'], en_curso: ['borrador', 'En curso'], hecho: ['publicado', 'Hecho'], descartado: ['neutral', 'Descartado'] };
const fbEstado = (e) => { const [c, l] = FB_ESTADOS[e] || ['neutral', e]; return `<span class="badge ${c}">${l}</span>`; };
const pantallaActual = () => { const r = route(); const tab = [...NAV_ADMIN, ...NAV_WORKER, ['guia', 'Guía']].find(([k]) => k === r.name); return `${tab ? tab[1] : r.name}${r.arg ? ` ${r.arg}` : ''}${r.name === 'horarios' && r.arg ? ` · vista ${state.vista}` : ''}`; };

function feedbackDialog(mios) {
  const lista = (mios || []).slice(0, 5);
  return `<form id="fb-form" style="display:grid;gap:12px">
    <h2 style="margin:0">Comentarios sobre la app</h2>
    <p class="small muted" style="margin:0">Cuéntanos qué cambiarías, qué falla o qué no entiendes. Se guarda en la app con la pantalla en la que estás (<b>${esc(pantallaActual())}</b>) y te responderemos aquí mismo.</p>
    <div class="chips" role="radiogroup" aria-label="Tipo">${Object.entries(FB_TIPOS).map(([k, l], i) => `<label class="chip radio-chip"><input type="radio" name="tipo" value="${k}" ${i === 0 ? 'checked' : ''}> ${l}</label>`).join('')}</div>
    <label class="field">Comentario<textarea name="texto" rows="5" maxlength="4000" required placeholder="Por ejemplo: en la vista de mes me gustaría ver también las horas de cada persona"></textarea></label>${mic("texto")}
    <div class="row end"><button type="button" class="btn" data-act="closeOverlay">Cancelar</button><button class="btn primary" type="submit">Enviar comentario</button></div>
    ${lista.length ? `<div><h3 style="margin:6px 0">Tus últimos comentarios</h3><ul class="fb-mios">${lista.map((c) => `<li><div class="row" style="gap:6px">${fbEstado(c.estado)}<span class="small muted">${fmtStamp(c.created_at)}</span></div><div class="small fb-texto">${esc(c.texto)}</div>${c.respuesta ? `<div class="small fb-resp"><b>Respuesta:</b> ${esc(c.respuesta)}</div>` : ''}</li>`).join('')}</ul></div>` : ''}
  </form>`;
}

function viewComentarios() {
  const s = state.fb || (state.fb = { filtro: 'abiertos' });
  const top = head('Comentarios', 'Lo que deja el equipo con el botón «Comentarios» (arriba a la derecha): sugerencias, fallos y dudas, con la pantalla desde la que se enviaron. Cambia el estado según avances y responde: quien lo envió verá la respuesta.', '<a class="btn" href="/api/comentarios.csv">Descargar CSV</a>');
  const err = ensure(s, 'data', '/api/comentarios');
  if (err) return top + err;
  const chip = (k, l) => `<button type="button" class="chip ${s.filtro === k ? 'on' : ''}" data-act="fbFiltro" data-f="${k}">${l}</button>`;
  const abiertos = (c) => c.estado === 'nuevo' || c.estado === 'en_curso';
  const lista = s.data.filter((c) => (s.filtro === 'todos' ? true : s.filtro === 'abiertos' ? abiertos(c) : c.estado === s.filtro));
  const n = (f) => s.data.filter(f).length;
  const tarjetas = lista.length ? `<div class="stack" style="gap:12px">${lista.map((c) => `<div class="card fb-card">
      <div class="row" style="gap:8px"><b>#${c.id} · ${esc(c.nombre)}</b><span class="badge neutral">${FB_TIPOS[c.tipo] || esc(c.tipo)}</span>${fbEstado(c.estado)}<span class="spacer"></span><span class="small muted">${fmtStamp(c.created_at)}${c.pantalla ? ` · en ${esc(c.pantalla)}` : ''}</span></div>
      <p style="margin:10px 0;white-space:pre-wrap">${esc(c.texto)}</p>
      <div class="fields" style="grid-template-columns:180px 1fr auto;align-items:end">
        <label class="field">Estado<select data-act-change="fbEstado" data-id="${c.id}">${Object.entries(FB_ESTADOS).map(([k, [, l]]) => `<option value="${k}" ${c.estado === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field">Respuesta o nota de lo que se ha hecho<input type="text" maxlength="4000" value="${esc(c.respuesta || '')}" id="fb-resp-${c.id}" placeholder="Por ejemplo: hecho en la versión del 3 de noviembre"></label>
        <button class="btn small" data-act="fbResponder" data-id="${c.id}">Guardar</button>
      </div>
      ${c.respondido_por ? `<div class="small muted" style="margin-top:6px">Respondido por ${esc(c.respondido_por)} · ${fmtStamp(c.updated_at)}</div>` : ''}
    </div>`).join('')}</div>`
    : `<div class="card empty">${s.filtro === 'abiertos' ? 'No hay comentarios pendientes.' : 'No hay comentarios.'}</div>`;
  return `${top}<div class="chips" style="margin-bottom:14px">${chip('abiertos', `Pendientes (${n(abiertos)})`)}${chip('hecho', `Hechos (${n((c) => c.estado === 'hecho')})`)}${chip('descartado', 'Descartados')}${chip('todos', `Todos (${s.data.length})`)}</div>${tarjetas}`;
}

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1] || '');
  r.onerror = () => reject(new Error('No se pudo leer el archivo'));
  r.readAsDataURL(file);
});

async function uploadWebDoc(input) {
  const file = input.files[0]; if (!file) return;
  try {
    state.web.docs = await api('PUT', `/api/web/documentos/${input.dataset.webDoc}`, { nombre: file.name, datos: await fileToBase64(file) });
    toast('Carta subida'); renderView();
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ INFORMES DE HORAS (encargados)
function viewInformes() {
  const h = state.inf; if (!h.desde) [h.desde, h.hasta] = monthBounds(0);
  const q = `desde=${h.desde}&hasta=${h.hasta}${h.borradores ? '&borradores=true' : ''}`;
  const title = head('Informes de horas', 'Cuánto ha trabajado cada persona en el periodo que elijas: horas, objetivo de contrato, horas extra, días, fines de semana, aperturas y cierres. Las horas ajustadas incluyen las correcciones aprobadas.', `<a class="btn" href="/api/informes/horas.csv?${q}">Descargar CSV</a>`);
  const anio = todayIso().slice(0, 4);
  const barra = `<div class="card"><div class="row" style="align-items:flex-end;gap:12px">
    <label class="field">Desde<input type="date" value="${h.desde}" data-act-change="periodo" data-h="inf" data-k="desde"></label>
    <label class="field">Hasta<input type="date" value="${h.hasta}" data-act-change="periodo" data-h="inf" data-k="hasta"></label>
    <button class="chip" data-act="periodoRapido" data-h="inf" data-off="0">Este mes</button>
    <button class="chip" data-act="periodoRapido" data-h="inf" data-off="-1">Mes anterior</button>
    <button class="chip" data-act="periodoRango" data-desde="${monthBounds(-2)[0]}" data-hasta="${monthBounds(0)[1]}">Últimos 3 meses</button>
    <button class="chip" data-act="periodoRango" data-desde="${anio}-01-01" data-hasta="${anio}-12-31">Este año</button>
    <label class="toggle" style="margin-left:auto"><input type="checkbox" data-act-change="infBorradores" ${h.borradores ? 'checked' : ''}> Contar también los borradores</label>
  </div></div>`;
  const err = ensure(h, 'data', `/api/informes/horas?${q}`);
  if (err) return title + barra + err;
  const rows = h.data.empleados;
  const sum = (k) => rows.reduce((t, e) => t + (e[k] || 0), 0);
  const meses = rows.length ? rows[0].meses.map((m) => m.mes) : [];
  const mesTxt = (m) => `${monthName(`${m}-01`).slice(0, 3)} ${m.slice(2, 4)}`;
  const extraBadge = (x) => (x >= 0.5 ? `<span class="badge warn">${fmtH(x)}</span>` : '—');
  const menosBadge = (x) => (x >= 0.5 ? `<span class="badge neutral">${fmtH(x)}</span>` : '—');
  const maxH = Math.max(1, ...rows.map((e) => Math.max(e.ajustadas, e.objetivo)));
  const barraH = (e) => `<div class="hbar" title="${fmtH(e.ajustadas)} h de ${fmtH(e.objetivo)} h"><i style="width:${(e.ajustadas / maxH) * 100}%" class="${e.extra >= 0.5 ? 'over' : e.de_menos >= 0.5 ? 'under' : ''}"></i><b style="left:${(e.objetivo / maxH) * 100}%"></b></div>`;
  const totales = `<div class="stats">
    <div class="stat"><b>${fmtH(Math.round(sum('ajustadas') * 10) / 10)} h</b><span>trabajadas en total</span></div>
    <div class="stat"><b>${fmtH(Math.round(sum('objetivo') * 10) / 10)} h</b><span>de contrato en esas fechas</span></div>
    <div class="stat ${sum('extra') >= 0.5 ? 'warn' : ''}"><b>${fmtH(Math.round(sum('extra') * 10) / 10)} h</b><span>horas extra</span></div>
    <div class="stat"><b>${sum('dias_trabajados')}</b><span>jornadas</span></div>
  </div>`;
  const tabla = `<div class="card section" style="padding:0"><div class="table-wrap"><table class="list">
    <thead><tr><th>Persona</th><th style="min-width:140px">Horas frente al contrato</th><th class="num">Trabajadas</th><th class="num">Contrato</th><th class="num">Extra</th><th class="num">De menos</th><th class="num">Días</th><th class="num">Fines de semana</th><th class="num">Festivos</th><th class="num">Aperturas</th><th class="num">Cierres</th><th class="num">Correcciones</th><th></th></tr></thead><tbody>
    ${rows.map((e) => `<tr><td><b>${esc(e.nombre)}</b></td><td>${barraH(e)}</td>
      <td class="num"><b>${fmtH(e.ajustadas)}</b>${e.diferencia ? `<div class="small muted">previstas ${fmtH(e.previstas)}</div>` : ''}</td><td class="num">${fmtH(e.objetivo)}</td>
      <td class="num">${extraBadge(e.extra)}</td><td class="num">${menosBadge(e.de_menos)}</td>
      <td class="num">${e.dias_trabajados}</td><td class="num">${e.fines_de_semana}</td><td class="num">${e.festivos}</td><td class="num">${e.aperturas}</td><td class="num">${e.cierres}</td>
      <td class="num">${e.pendientes ? `<span class="badge bad" title="Pendientes de aprobar">${e.pendientes}</span>` : e.diferencia ? signed(e.diferencia) : '—'}</td>
      <td style="text-align:right"><button class="btn small" data-act="infDetalle" data-e="${esc(e.empleado_id)}">Detalle</button></td></tr>`).join('')}
    </tbody></table></div></div>`;
  const porMes = meses.length > 1 ? `<div class="section"><h2>Mes a mes</h2><div class="card" style="padding:0"><div class="table-wrap"><table class="list">
    <thead><tr><th>Persona</th>${meses.map((m) => `<th class="num">${mesTxt(m)}</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>
    ${rows.map((e) => `<tr><td><b>${esc(e.nombre)}</b></td>${e.meses.map((m) => `<td class="num">${m.objetivo || m.ajustadas ? `<b>${fmtH(m.ajustadas)}</b><div class="small ${m.extra >= 0.5 ? 'warn-text' : 'muted'}">${m.extra >= 0.5 ? `+${fmtH(m.extra)} extra` : m.de_menos >= 0.5 ? `−${fmtH(m.de_menos)}` : m.objetivo ? `de ${fmtH(m.objetivo)}` : ''}</div>` : '<span class="muted">—</span>'}</td>`).join('')}<td class="num"><b>${fmtH(e.ajustadas)}</b></td></tr>`).join('')}
    </tbody></table></div></div><p class="small muted">Cada casilla: horas trabajadas y, debajo, las horas extra o las que faltan frente al contrato de ese mes.</p></div>` : '';
  return `${title}${barra}${totales}${tabla}${porMes}
  <p class="small muted">«Contrato» son las horas de contrato prorrateadas en los días que tienen horario${h.borradores ? '' : ' publicado'}, sin contar ausencias. Las correcciones pendientes no cuentan hasta que las apruebes en Solicitudes.</p>`;
}

function corrDetail(clase, turnos, pre = {}) {
  const opts = (sel, blank) => `<option value="">${blank}</option>` + turnos.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.nombre)} (${s.inicio}–${s.fin})</option>`).join('');
  if (clase === 'no_trabajado') return '<p class="small muted" style="margin:0">Se contará que ese día no trabajaste ninguna hora.</p>';
  if (clase === 'turno') return `<label class="field">Turno que hiciste<select name="turno_id" required>${opts(pre.turno_id, '— Elige —')}</select></label>`;
  const req = clase === 'horas' ? 'required' : '';
  const hours = `<div class="fields two"><label class="field">Entrada<input type="time" name="inicio" value="${pre.inicio || ''}" ${req}></label><label class="field">Salida<input type="time" name="fin" value="${pre.fin || ''}" ${req}></label></div>`;
  if (clase === 'extra') return `<label class="field">Turno que hiciste<select name="turno_id">${opts('', '— Indicar horas —')}</select></label>${hours}<p class="small muted" style="margin:0">Elige un turno o indica la entrada y la salida.</p>`;
  return hours;
}

function openCorrection(pre = {}) {
  const turnos = state.mi.perfil.turnos, today = todayIso();
  const clase = pre.clase || 'horas';
  const sh = turnos.find((s) => s.id === pre.turno_id);
  overlay(`<h2>Solicitar corrección</h2>
    <form id="corr-form" class="stack" style="gap:12px">
      <label class="field">Día<input type="date" name="fecha" max="${today}" value="${esc(pre.fecha || '')}" required></label>
      <label class="field">¿Qué ocurrió?<select name="clase" data-act-change="corrClase">
        ${Object.entries({ horas: 'Hice más o menos horas de las previstas', turno: 'Hice otro turno distinto', no_trabajado: 'No trabajé ese día', extra: 'Trabajé un día que tenía libre' }).map(([k, v]) => `<option value="${k}" ${k === clase ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div id="corr-detail" class="stack" style="gap:12px">${corrDetail(clase, turnos, { inicio: sh && clase === 'horas' ? sh.inicio : '', fin: sh && clase === 'horas' ? sh.fin : '' })}</div>
      <label class="field">Motivo<textarea name="motivo" rows="3" required placeholder="Por ejemplo: me pidieron quedarme hasta el cierre"></textarea></label>${mic("motivo")}
      <div class="row end"><button type="button" class="btn" data-act="closeOverlay">Cancelar</button><button class="btn primary" type="submit">Enviar solicitud</button></div>
    </form>`);
}

// ------------------------------------------------------------------ CUENTA y GOOGLE
function claveTemporal() {
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
async function botonGoogle(el, alPulsar, texto = 'signin_with') {
  const cid = (state.acceso && state.acceso.google_client_id) || (state.me && state.me.google_client_id);
  if (!el || !cid) return;
  try { await cargarGoogle(); } catch (e) { el.innerHTML = `<p class="small muted">${esc(e.message)}</p>`; return; }
  if (!el.isConnected) return;
  window.google.accounts.id.initialize({ client_id: cid, callback: (r) => alPulsar(r.credential), ux_mode: 'popup' });
  window.google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: texto, shape: 'pill', locale: 'es', width: Math.min(320, el.clientWidth || 320) });
}
async function entrarConGoogle(credential) {
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
function cuentaDialog() {
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

function pwForm(forced, enCuenta = false) {
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
function viewForcePw() {
  return `<div class="login"><div class="login-art"><div class="mark">LOPITA &amp; CO</div><div class="rule"></div><div class="tag">Horarios del equipo</div></div><div class="login-form">${pwForm(true)}</div></div>`;
}

// ------------------------------------------------------------------ acciones
const confirmLeave = () => !state.dirty || window.confirm('Tienes cambios sin guardar. ¿Descartarlos?');

const actions = {
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
const changeActions = {
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
  periodo: (el) => { const h = state[el.dataset.h]; h[el.dataset.k] = el.value; if (h.hasta && h.desde && h.hasta >= h.desde) { h.data = undefined; } renderView(); },
  userRol: (el) => { $('#user-emp').hidden = el.value !== 'empleado'; },
  accesoRol: (el) => { el.closest('form').querySelector('.acceso-emp').hidden = el.value !== 'empleado'; },
};

function renameRefs(kind, i, value) {
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

// ------------------------------------------------------------------ eventos globales
document.addEventListener('click', async (e) => {
  if (!e.target.closest('.popover') && !e.target.closest('[data-act="cell"]') && !e.target.closest('.g-bar')) closeMenu();
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'checkbox')) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); try { await fn(el, e); } catch (err) { toast(err.message, true); } }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeMenu(); if (!$('.overlay .spinner')) closeOverlay(); }
  if (e.key === 'Enter' && e.target.matches('tr.click')) e.target.click();
});
document.addEventListener('input', onBind);
document.addEventListener('change', (e) => {
  const ca = e.target.closest('[data-act-change]');
  if (ca) { changeActions[ca.dataset.actChange](ca); return; }
  const rn = e.target.closest('[data-rename]');
  if (rn) { renameRefs(rn.dataset.rename, Number(rn.dataset.i), rn.value); return; }
  if (e.target.id === 'import-file') { importConfig(e.target.files[0]); return; }
  if (e.target.dataset.webDoc) { uploadWebDoc(e.target); return; }
  onBind(e);
});
document.addEventListener('submit', async (e) => {
  e.preventDefault();
  pararDictado();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));
  if (f.id === 'login-form') {
    try {
      state.me = await api('POST', '/api/login', data);
      await boot();
    } catch (err) { $('#login-err').textContent = err.message; }
  } else if (f.id === 'baja-form' || f.id === 'alta-form') {
    const c = state.draft, emp = f.dataset.emp;
    if (f.id === 'baja-form') {
      const hasta = data.hasta || addDays(data.desde, BAJA_SIN_FIN);
      if (hasta < data.desde) { toast('La baja no puede acabar antes de empezar', true); return; }
      c.ausencias.push({ empleado_id: emp, desde: data.desde, hasta, motivo: 'baja' });
    } else {
      const b = c.ausencias.find((a) => a.empleado_id === emp && a.motivo === 'baja' && a.hasta >= todayIso());
      const fin = addDays(data.vuelve, -1);
      if (b) { if (fin < b.desde) c.ausencias.splice(c.ausencias.indexOf(b), 1); else b.hasta = fin; }
    }
    markDirty(); closeOverlay();
    await saveConfig();
  } else if (f.id === 'user-form') {
    try { state.ajustes.users = await api('POST', '/api/usuarios', { usuario: data.usuario, password: data.password, nombre: data.nombre || null, rol: data.rol, empleado_id: data.rol === 'empleado' ? data.empleado_id : null }); toast('Cuenta guardada'); renderView(); } catch (err) { toast(err.message, true); }
  } else if (f.id === 'fb-form') {
    try {
      await api('POST', '/api/comentarios', { tipo: data.tipo || 'sugerencia', texto: data.texto, pantalla: pantallaActual() });
      closeOverlay(); toast('¡Gracias! Tu comentario ha quedado guardado');
      if (state.fb) state.fb.data = undefined;
      if (!isWorker()) { state.me.comentarios = (state.me.comentarios || 0) + 1; renderView(); }
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'cuenta-form') {
    try {
      state.me = { ...state.me, ...(await api('PUT', '/api/mi/cuenta', { email: data.email || null, nombre: data.nombre || null })) };
      toast('Cuenta guardada'); cuentaDialog();
      const nb = $('.userbox span'); if (nb) nb.textContent = state.me.nombre;
    } catch (err) { $('#cuenta-err').textContent = err.message; }
  } else if (f.id === 'reset-form') {
    try { state.ajustes.users = await api('POST', `/api/usuarios/${encodeURIComponent(f.dataset.u)}/clave`, { password: data.password }); closeOverlay(); toast(`Contraseña temporal guardada. Pásasela a ${f.dataset.u}.`); renderView(); } catch (err) { toast(err.message, true); }
  } else if (f.id === 'email-form') {
    try { state.ajustes.users = await api('PUT', `/api/usuarios/${encodeURIComponent(f.dataset.u)}/email`, { email: data.email || null }); closeOverlay(); toast('Correo guardado'); renderView(); } catch (err) { toast(err.message, true); }
  } else if (f.id === 'acceso-form') {
    try {
      const r = await api('POST', `/api/accesos/${f.dataset.id}/aprobar`, { usuario: data.usuario, nombre: data.nombre || null, rol: data.rol, empleado_id: data.rol === 'empleado' ? data.empleado_id : null });
      state.ajustes.accesos = r.accesos; state.ajustes.users = r.usuarios; state.me.accesos = r.accesos.length;
      toast(`Acceso dado a ${data.usuario}: ya puede entrar con Google`); renderView();
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'google-form') {
    try {
      state.ajustes.google = await api('PUT', '/api/ajustes/google', { client_id: data.client_id || null });
      state.me.google_client_id = state.ajustes.google.client_id;
      toast(state.ajustes.google.client_id ? 'Entrar con Google activado' : 'Entrar con Google desactivado'); renderView();
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'pw-form') {
    if (data.nueva !== data.repite) { $('#pw-err').textContent = 'Las contraseñas nuevas no coinciden'; return; }
    try {
      const forced = state.me.cambiar_clave;
      state.me = { ...state.me, ...(await api('POST', '/api/mi/clave', { actual: data.actual || '', nueva: data.nueva })) };
      closeOverlay(); toast('Contraseña cambiada');
      if (forced) await boot();
    } catch (err) { $('#pw-err').textContent = err.message; }
  } else if (f.id === 'abs-form') {
    try {
      state.mi.perfil = await api('POST', '/api/mi/ausencias', { desde: data.desde, hasta: data.hasta, motivo: data.motivo, nota: data.nota || null });
      toast('Solicitud enviada'); renderView();
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'corr-form') {
    const body = { fecha: data.fecha, clase: data.clase, motivo: data.motivo };
    if (data.clase === 'turno') body.turno_id = data.turno_id;
    if (data.clase === 'horas') { body.inicio = data.inicio; body.fin = data.fin; }
    if (data.clase === 'extra') { if (data.turno_id) body.turno_id = data.turno_id; else { body.inicio = data.inicio; body.fin = data.fin; } }
    try {
      state.mi.perfil = await api('POST', '/api/mi/correcciones', body);
      state.miH.data = undefined; closeOverlay(); toast('Solicitud enviada'); renderView();
    } catch (err) { toast(err.message, true); }
  } else if (f.id === 'resolve-form') {
    const { id, accion, tipo } = f.dataset;
    try {
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
    } catch (err) { toast(err.message, true); }
  }
});
window.addEventListener('scroll', menuOnScroll, true);
if (window.visualViewport) window.visualViewport.addEventListener('resize', seguirAnclas);  // p. ej. al abrirse el teclado
window.addEventListener('hashchange', () => { closeMenu(); if (route().name === 'calendario') state.cal.data = {}; if (route().name !== 'horarios' || !route().arg) state.current = state.current; if (route().name === 'web') state.web.data = undefined; renderView(); if (!(route().name === 'guia' && route().arg)) window.scrollTo(0, 0); });
window.addEventListener('beforeunload', (e) => { if (state.dirty || (state.dia && diaCambios(state.dia).length)) { e.preventDefault(); e.returnValue = ''; } });

async function importConfig(file) {
  if (!file) return;
  try {
    const cfg = JSON.parse(await file.text());
    if (!window.confirm('Se sustituirá toda la configuración por la del archivo (se guarda como una versión nueva). ¿Seguir?')) return;
    const r = await api('PUT', '/api/config', { config: cfg.config || cfg, base: state.version, nota: `Importado de ${file.name}` });
    state.config = r.config; state.version = r.version; state.draft = clone(r.config); state.dirty = false; state.ajustes = null;
    toast('Configuración cargada'); renderView();
  } catch (e) { toast(`No se pudo cargar: ${e.message}`, true); }
}

async function boot() {
  try { state.me = await api('GET', '/api/me'); } catch { state.me = null; }
  if (!state.me) { try { state.acceso = await api('GET', '/api/acceso'); } catch { state.acceso = {}; } }
  state.mi = {}; state.miH = {}; state.inf = {}; state.sol = {};
  if (state.me && !state.me.cambiar_clave && state.me.rol === 'admin') { await loadConfig(); await refreshList(); }
  $('#app').innerHTML = '';
  render();
  if (state.me && state.me.rol === 'admin' && state.me.notificaciones) showNotifications();
  if (state.me && state.me.rol === 'admin' && state.me.arreglos_pendientes) arreglarPendientes();
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !state.me || state.me.cambiar_clave) return;
  try {
    const me = await api('GET', '/api/me');
    if (isWorker()) { state.me.avisos = me.avisos; state.mi.perfil = undefined; }
    else {
      state.me.alertas = me.alertas; state.me.pendientes = me.pendientes; state.me.criticas = me.criticas; state.alg = {};
      if (me.notificaciones) showNotifications();
    }
    if (!state.dirty) renderView(); else { const t = $('#tabs'); if (t) t.innerHTML = tabsHtml(route().name); }
  } catch { /* sin conexión: se reintenta la próxima vez */ }
});
boot();
