import { $, DAYS, DAY_CHIP, DAY_LABEL, ICON, esc, fmtH } from './util.js';
import { state } from './estado.js';
import { route, vistaDe } from './rutas.js';
import { viewLogin } from '../pantallas/acceso.js';
import { seguirAnclas } from '../pantallas/dia.js';
import { guiaSecciones } from '../pantallas/guia.js';
import { novedadesSinVer } from '../pantallas/novedades.js';
import { botonGoogle, entrarConGoogle, viewForcePw } from '../pantallas/cuenta.js';
// ------------------------------------------------------------------ pintado general
// Botón de la barra de cuenta: icono y texto; en el móvil solo el icono, así que el nombre va en aria-label.
const botonCuenta = (act, icono, texto, titulo, extra = '') =>
  `<button data-act="${act}"${extra} title="${titulo}" aria-label="${texto}">${ICON[icono]}<span class="ub-txt">${texto}</span></button>`;

export function render() {
  const app = $('#app');
  if (!state.me) { app.innerHTML = viewLogin(); botonGoogle($('#g-login'), entrarConGoogle); return; }
  if (state.me.cambiar_clave) { app.innerHTML = viewForcePw(); return; }
  if (!$('.topbar')) {
    app.innerHTML = `
      <header class="topbar">
        <div class="topbar-inner">
          <a class="wordmark" href="#/" aria-label="Lopita & Co · Horarios"><b>LOPITA &amp; CO</b><span>Horarios</span></a>
          <div class="userbox"><span>${esc(state.me.nombre)}</span>${menuCuenta()}${botonCuenta('goGuia', 'guia', 'Guía', 'Cómo funciona la app', ' id="guia-btn"')}${botonCuenta('feedback', 'comentar', 'Comentarios', 'Deja una sugerencia, un fallo o una duda', ' class="fb-btn"')}${botonCuenta('cuentaDialog', 'cuenta', 'Mi cuenta', 'Tu correo, Google y tu contraseña')}${botonCuenta('logout', 'salir', 'Salir', 'Cerrar la sesión')}</div>
        </div>
        <div class="tabsbar"><nav class="tabs" id="tabs" aria-label="Secciones"></nav><nav class="tabs subtabs" id="subtabs" aria-label="Pantallas de la sección" hidden></nav></div>
      </header>
      <main id="view"></main>
      <div id="savebar"></div>`;
  }
  renderView();
}

export const NAV_ADMIN = [
  ['horarios', 'Horarios'], ['calendario', 'Calendario'], ['alertas', 'Alertas'], ['solicitudes', 'Solicitudes'], ['informes', 'Informes'], ['equipo', 'Equipo'], ['funciones', 'Funciones'], ['turnos', 'Turnos'], ['demanda', 'Demanda'],
  ['ausencias', 'Ausencias'], ['preferencias', 'Preferencias'], ['reglas', 'Reglas'], ['web', 'Web'], ['comentarios', 'Comentarios'], ['ajustes', 'Ajustes'], ['novedades', 'Novedades'],
];
// El encargado ve cinco secciones; cada una agrupa pantallas (la dirección de cada pantalla no cambia). Web,
// Comentarios y Novedades no son de la semana a semana y viven en el menú «Más» de la cuenta.
export const SECCIONES_ADMIN = [
  ['horario', 'Horario', ['horarios', 'calendario']],
  ['pendiente', 'Pendiente', ['alertas', 'solicitudes']],
  ['equipo', 'Equipo', ['equipo', 'ausencias', 'preferencias']],
  ['informes', 'Informes', ['informes']],
  ['configuracion', 'Configuración', ['funciones', 'turnos', 'demanda', 'reglas', 'ajustes']],
];
const MENU_CUENTA = ['web', 'comentarios', 'novedades'];
export const NAV_WORKER = [['inicio', 'Inicio'], ['horas', 'Mis horas'], ['vacaciones', 'Vacaciones'], ['preferencias', 'Preferencias']];
export const isWorker = () => state.me && state.me.rol === 'empleado';

export function tabsHtml(name) {
  const w = isWorker();
  const count = (n, label) => (n ? `<span class="tab-count" aria-label="${n} ${label}">${n}</span>` : '');
  const crit = !w && state.me.criticas ? `<span class="tab-count crit" aria-label="${state.me.criticas} alertas críticas">${state.me.criticas}</span>` : '';
  const badge = { solicitudes: w ? '' : count(state.me.pendientes, 'pendientes'), alertas: w ? '' : crit + count(state.me.alertas - (state.me.criticas || 0), 'alertas importantes'), inicio: w ? count(state.me.avisos, 'avisos nuevos') : '', web: w ? '' : count(state.me.mensajes_web, 'mensajes nuevos'), comentarios: w ? '' : count(state.me.comentarios, 'comentarios nuevos'), novedades: w ? '' : count(novedadesSinVer(), 'novedades sin ver'), ajustes: w ? '' : count(state.me.accesos, 'registros pendientes') };
  const enlace = ([k, label]) => `<a href="#/${k}" class="${name === k ? 'active' : ''}"${name === k ? ' aria-current="page"' : ''}>${label}${badge[k] || ''}</a>`;
  if (w) return NAV_WORKER.map(enlace).join('');
  const activa = seccionDe(name);
  // Cada sección lleva a su primera pantalla; el contador de la sección es el de sus pantallas.
  return SECCIONES_ADMIN.map(([id, label, pantallas]) => {
    const n = (id === 'pendiente' ? (state.me.criticas || 0) + (state.me.alertas - (state.me.criticas || 0)) + (state.me.pendientes || 0)
      : id === 'configuracion' ? (state.me.accesos || 0) : 0);
    const marca = n ? `<span class="tab-count${id === 'pendiente' && state.me.criticas ? ' crit' : ''}" aria-label="${n} por revisar">${n}</span>` : '';
    return `<a href="#/${pantallas[0]}" class="${activa === id ? 'active' : ''}"${activa === id ? ' aria-current="page"' : ''}>${label}${marca}</a>`;
  }).join('');
}

// Las pantallas de la sección activa, en una segunda fila; vacía si la sección tiene una sola.
export function subtabsHtml(name) {
  if (isWorker()) return '';
  const sec = SECCIONES_ADMIN.find(([id]) => id === seccionDe(name));
  if (!sec || sec[2].length < 2) return '';
  const etiqueta = Object.fromEntries(NAV_ADMIN);
  const cuenta = (n, label) => (n ? `<span class="tab-count" aria-label="${n} ${label}">${n}</span>` : '');
  const marca = { alertas: (state.me.criticas ? `<span class="tab-count crit" aria-label="${state.me.criticas} alertas críticas">${state.me.criticas}</span>` : '') + cuenta(state.me.alertas - (state.me.criticas || 0), 'alertas importantes'), solicitudes: cuenta(state.me.pendientes, 'pendientes'), ajustes: cuenta(state.me.accesos, 'registros pendientes') };
  return sec[2].map((k) => `<a href="#/${k}" class="${name === k ? 'active' : ''}"${name === k ? ' aria-current="page"' : ''}>${etiqueta[k]}${marca[k] || ''}</a>`).join('');
}

// A qué sección pertenece una pantalla; las del menú de la cuenta y la guía no son de ninguna.
export const seccionDe = (name) => { const s = SECCIONES_ADMIN.find(([, , pantallas]) => pantallas.includes(name)); return s ? s[0] : null; };

// Pinta las dos filas de pestañas (secciones y pantallas de la sección).
export function pintarTabs(name) {
  const t = $('#tabs'); if (t) t.innerHTML = tabsHtml(name);
  const sub = $('#subtabs');
  if (sub) { const h = subtabsHtml(name); sub.innerHTML = h; sub.hidden = !h; }
  const mas = $('#mas-cuenta');
  if (mas) {
    const abierto = mas.open;
    mas.outerHTML = menuCuenta();
    const nuevo = $('#mas-cuenta');
    if (nuevo) { nuevo.open = abierto; nuevo.querySelectorAll('a').forEach((a) => { if (a.getAttribute('href') === `#/${name}`) { a.classList.add('active'); a.setAttribute('aria-current', 'page'); } }); }
  }
}

// Menú «Más» de la cuenta del encargado: Web, Comentarios recibidos y Novedades, con sus contadores.
function menuCuenta() {
  if (isWorker()) return '';
  const etiqueta = { web: 'Web', comentarios: 'Comentarios recibidos', novedades: 'Novedades' };
  const n = { web: state.me.mensajes_web, comentarios: state.me.comentarios, novedades: novedadesSinVer() };
  const total = MENU_CUENTA.reduce((t, k) => t + (n[k] || 0), 0);
  return `<details class="mas-cuenta" id="mas-cuenta"><summary title="Web, comentarios recibidos y novedades" aria-label="Más${total ? `, ${total} sin ver` : ''}">Más${total ? `<span class="tab-count">${total}</span>` : ''}</summary>
    <div class="mas-cuenta-lista">${MENU_CUENTA.map((k) => `<a href="#/${k}">${etiqueta[k]}${n[k] ? `<span class="tab-count">${n[k]}</span>` : ''}</a>`).join('')}</div></details>`;
}

// La guía vive en la barra de cuenta (no es una sección): su botón se marca cuando estás en ella.
function marcarGuia(name) {
  const b = $('#guia-btn');
  if (!b) return;
  b.classList.toggle('active', name === 'guia');
  if (name === 'guia') b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
}

export function renderView() {
  pararDictado();
  const view = $('#view');
  if (!view) return render();
  const r = route();
  const w = isWorker();
  const { name, vista } = vistaDe(r, w);
  // Si había un turno enfocado (teclado), sigue enfocado tras redibujar aunque la vista se recargue por detrás.
  const foco = document.activeElement && document.activeElement.closest && document.activeElement.closest('.g-bar');
  const focoEmp = foco && foco.dataset.emp;
  pintarTabs(name);
  marcarGuia(name);
  view.innerHTML = vista();
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

export function renderSavebar() {
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

export function head(title, lead, actions = '') {
  const r = route();
  const ayuda = r.name !== 'guia' && guiaSecciones().some((g) => g.id === r.name)
    ? `<a class="guia-link no-print" href="#/guia/${r.name}">¿Cómo funciona esta pantalla?</a>` : '';
  return `<div class="page-head"><div><h1>${title}</h1>${lead ? `<p class="lead">${lead}</p>` : ''}${ayuda}</div>${actions ? `<div class="row">${actions}</div>` : ''}</div>`;
}

// helpers de formulario
export const empName = (id) => (state.draft.empleados.find((e) => e.id === id) || {}).nombre || id;
export const shiftById = (cfg, id) => cfg.turnos.find((s) => s.id === id);
export const PUESTOS = { sala: 'Sala', cocina: 'Cocina' };
// Tipo de empleado: quien trabaja en sala es camarero/a y quien trabaja en cocina, cocinero/a.
export const TIPOS = { sala: 'Camarero/a', cocina: 'Cocinero/a' };
export const funcionesCfg = (cfg) => cfg.funciones || [];
export const funcById = (cfg, id) => funcionesCfg(cfg).find((f) => f.id === id);
// Funciones de una persona: las fijas (abrir, cerrar, encargado) y las que define el encargado.
export function funcionesDe(cfg, e) {
  const out = [];
  if (e.puede_abrir) out.push({ nombre: 'Abre', color: 'var(--gold)' });
  if (e.puede_cerrar) out.push({ nombre: 'Cierra', color: 'var(--brown)' });
  if (e.es_encargado) out.push({ nombre: 'Encargado/a', color: 'var(--black)' });
  for (const id of e.funciones || []) { const f = funcById(cfg, id); if (f) out.push(f); }
  return out;
}
export const funcTags = (cfg, e) => funcionesDe(cfg, e).map((f) => `<span class="func-tag" style="--fc:${esc(f.color || 'var(--brown)')}">${esc(f.nombre)}</span>`).join('');
// Abreviatura de una etiqueta para que quepa dentro de la barra de un turno: «Abre» → Ab, «Preparar pinchos» → PP,
// «Hace caja al cierre o apertura» → HCCA. Si dos coinciden, la segunda lleva un número.
const ABREV_FIJAS = { Abre: 'Ab', Cierra: 'Ci', 'Encargado/a': 'Enc' };
const ABREV_VACIAS = new Set(['a', 'al', 'con', 'de', 'del', 'el', 'en', 'la', 'las', 'lo', 'los', 'o', 'para', 'por', 'y']);
function abreviar(nombre) {
  if (ABREV_FIJAS[nombre]) return ABREV_FIJAS[nombre];
  const palabras = nombre.split(/[\s/·-]+/).filter((w) => w && !ABREV_VACIAS.has(w.toLowerCase()));
  if (!palabras.length) return nombre.slice(0, 3);
  if (palabras.length === 1) { const w = palabras[0]; return w[0].toUpperCase() + w.slice(1, 3).toLowerCase(); }
  return palabras.slice(0, 4).map((w) => w[0].toUpperCase()).join('');
}
export function abreviaturas(cfg) {
  const out = new Map(), usadas = new Set();
  const todas = [{ nombre: 'Abre' }, { nombre: 'Cierra' }, { nombre: 'Encargado/a' }, ...funcionesCfg(cfg)];
  for (const f of todas) {
    if (out.has(f.nombre)) continue;
    let a = abreviar(f.nombre);
    for (let k = 2; usadas.has(a); k++) a = `${abreviar(f.nombre)}${k}`;
    usadas.add(a); out.set(f.nombre, a);
  }
  return out;
}
// Etiquetas de una persona en abreviatura, para dentro de la barra del turno (el nombre completo, al pasar por encima).
export const capTags = (lista, abrev) => (lista.length ? `<span class="cap-tags">${lista.map((f) => `<abbr class="cap-tag" style="--fc:${esc(f.color || 'var(--brown)')}" title="${esc(f.nombre)}">${esc(abrev.get(f.nombre) || abreviar(f.nombre))}</abbr>`).join('')}</span>` : '');
export const tipoDe = (e) => (puestosDe(e).length > 1 ? 'Camarero/a y cocinero/a' : TIPOS[puestosDe(e)[0]]);
// Un comodín no tiene contrato: solo cubre huecos, con un mínimo y un máximo semanales opcionales.
export function horasPersona(e) {
  if (!e.comodin) return `${fmtH(e.horas_semanales)} h/sem`;
  const min = e.horas_min_semana, max = e.horas_max_semana;
  if (min && max != null) return `Comodín · ${fmtH(min)}–${fmtH(max)} h/sem`;
  if (max != null) return `Comodín · hasta ${fmtH(max)} h/sem`;
  if (min) return `Comodín · mínimo ${fmtH(min)} h/sem`;
  return 'Comodín';
}
export const slackField = (i, e) => `<label class="field">Usuario de Slack<input type="text" placeholder="U01ABC…" value="${esc(e.slack_user_id || '')}" data-type="nullstr" data-bind="empleados.${i}.slack_user_id"></label>`;
export function horasField(i, e) {
  if (!e.comodin) return `<label class="field">Horas por semana<input type="number" min="1" max="60" step="0.5" value="${e.horas_semanales}" data-bind="empleados.${i}.horas_semanales"></label>`;
  const num = (campo, label, hint) => `<label class="field">${label}<span class="hint">${hint}</span><input type="number" min="0" max="60" step="0.5" placeholder="Sin ${label.toLowerCase().split(' ')[0]}" value="${e[campo] ?? ''}" data-type="nullnum" data-bind="empleados.${i}.${campo}"></label>`;
  return `${num('horas_min_semana', 'Mínimo por semana', 'Vacío: solo si hace falta')}${num('horas_max_semana', 'Máximo por semana', 'Vacío: sin tope')}`;
}
export const empById = (cfg, id) => cfg.empleados.find((e) => e.id === id);
export const puestosDe = (e) => (e && e.puestos && e.puestos.length ? e.puestos : ['sala', 'cocina']);
export const puestoDe = (cfg, a) => a.puesto || puestosDe(empById(cfg, a.empleado_id))[0];
// Solo se enseñan los puestos si el negocio los usa: alguien hace solo uno, o la demanda pide cocina o sala.
export const usaPuestos = (cfg) => cfg.empleados.some((e) => puestosDe(e).length === 1)
  || cfg.tipos_dia.some((t) => t.franjas.some((f) => f.cocina || f.sala))
  || (cfg.excepciones_fecha || []).some((o) => (o.franjas || []).some((f) => f.cocina || f.sala))
  || (cfg.tareas || []).some((t) => t.puesto);
export const puestoTag = (p) => `<span class="puesto-tag ${p}" title="${PUESTOS[p]}">${PUESTOS[p][0]}</span>`;
// Roles de un puesto (caja, cafetera, sala, lava para los camareros): cada persona hace uno en su turno.
export const esRol = (f) => Boolean(f && f.puesto);
export const rolesDe = (cfg, e, p) => (e.funciones || []).filter((id) => { const f = funcById(cfg, id); return f && f.puesto === p; });
export const rolDe = (cfg, a) => { const f = a && a.funcion && funcById(cfg, a.funcion); return esRol(f) ? f : null; };
export const rolTag = (f) => (f ? `<span class="rol-tag" style="--fc:${esc(f.color || 'var(--brown)')}" title="${esc(f.nombre)}">${esc(f.nombre)}</span>` : '');
// Horas reales de una asignación: las del turno o, si es un turno a medida, las suyas.
export const horasDe = (cfg, a) => { const s = shiftById(cfg, a.turno_id); return s ? { inicio: a.inicio || s.inicio, fin: a.fin || s.fin } : null; };
export const empOptions = (sel) => state.draft.empleados.map((e) => `<option value="${esc(e.id)}" ${e.id === sel ? 'selected' : ''}>${esc(e.nombre)}${e.activo ? '' : ' (inactivo)'}</option>`).join('');
export const shiftOptions = (sel, blank) => (blank ? '<option value="">—</option>' : '') + state.draft.turnos.map((s) => `<option value="${esc(s.id)}" ${s.id === sel ? 'selected' : ''}>${esc(s.nombre)} (${s.inicio}–${s.fin})</option>`).join('');
export const dayTypeOptions = (sel, blank) => (blank ? `<option value="" ${!sel ? 'selected' : ''}>${esc(blank)}</option>` : '') + state.draft.tipos_dia.map((t) => `<option value="${esc(t.nombre)}" ${t.nombre === sel ? 'selected' : ''}>${esc(t.nombre)}</option>`).join('');
export function dayChips(path, selected, allLabel) {
  const set = new Set(selected || []);
  return `<div class="chips" role="group">${DAYS.map((d, i) => `<button type="button" class="chip ${set.has(d) ? 'on' : ''}" data-act="toggleDay" data-path="${path}" data-day="${d}" aria-pressed="${set.has(d)}" title="${DAY_LABEL[i]}">${DAY_CHIP[i]}</button>`).join('')}${allLabel && !set.size ? `<span class="small muted" style="align-self:center">${allLabel}</span>` : ''}</div>`;
}
// Dictado por voz para los textos (solicitudes, comentarios…). Usa el reconocimiento de voz del navegador
// (Chrome, Edge, Safari); donde no existe, el botón no aparece y se escribe como siempre.
const Reconocimiento = window.SpeechRecognition || window.webkitSpeechRecognition;
let dictando = null;
export function mic(name) {
  if (!Reconocimiento) return '';
  return `<div class="mic-row"><button type="button" class="btn small mic" data-act="dictar" data-for="${name}" aria-pressed="false">${ICON.mic} Dictar</button><span class="small muted mic-estado" aria-live="polite"></span></div>`;
}
export function pararDictado() { if (dictando) { try { dictando.rec.stop(); } catch { /* ya parado */ } } }
export function dictar(btn) {
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

export function toggle(path, checked, label) {
  return `<label class="toggle"><input type="checkbox" data-bind="${path}" ${checked ? 'checked' : ''}> ${label}</label>`;
}

