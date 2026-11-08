import { $, clone, esc, fmtLong, fmtStamp } from './util.js';
import { pararDictado, render, renderSavebar, renderView, route, tabsHtml } from './pintado.js';
import { refreshList } from '../pantallas/horarios.js';
// ------------------------------------------------------------------ estado y API
export const state = {
  me: null, config: null, draft: null, version: null, dirty: false, saveError: null,
  schedules: [], current: null, gen: null, ajustes: null, showPast: false, loading: false,
  mi: {}, miH: {}, inf: {}, sol: {}, web: {}, alg: {}, calT: {}, alf: { sev: null, cat: null }, fix: null,
  vista: 'semana', diaFecha: null, dia: null, diaEval: null,
  cal: { modo: 'semana', ref: null, persona: '', agrupar: 'fecha', data: {}, inf: {} },
};

export async function api(method, url, body) {
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
export function arreglarPendientes() {
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
export async function showNotifications() {
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

export function toast(msg, bad = false) {
  document.querySelectorAll('.toast:not(.fijo)').forEach((t) => t.remove());
  const t = document.createElement('div');
  t.className = `toast${bad ? ' bad' : ''}`;
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), bad ? 6000 : 3000);
}

export function overlay(html) {
  closeOverlay();
  const o = document.createElement('div');
  o.className = 'overlay';
  o.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
  o.addEventListener('click', (e) => { if (e.target === o && !o.querySelector('.spinner')) closeOverlay(); });
  document.body.appendChild(o);
  return o;
}
export function closeOverlay() {
  pararDictado();
  const habia = document.querySelector('.overlay');
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
  if (habia && state.notifPending) setTimeout(showNotifications, 50);
}
function busy(text) { return overlay(`<div class="spinner"></div><h2 style="text-align:center">${esc(text)}</h2><p class="muted small" style="text-align:center;margin:0" data-espera>Puede tardar hasta un minuto.</p>`); }

// Si tarda más de esto, la ventana de espera lo dice y deja cancelar (el motor tiene un tope de un minuto).
const ESPERA_LARGA_MS = 90_000;
const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Cancelar una espera: sin servidor el cálculo corre en este dispositivo y solo se para reiniciando el motor
// (arranque.js recarga la página; lo guardado ya está a salvo). Con servidor, se deja de esperar la respuesta.
function cancelarEspera() {
  const offline = window.LOPITA_OFFLINE;
  if (offline && typeof offline.cancelar === 'function') offline.cancelar();
}

export async function withBusy(text, fn) {
  const o = busy(text);
  const inicio = Date.now();
  let cancelar;
  const cancelado = new Promise((_, mal) => { cancelar = mal; });
  const reloj = setInterval(() => {
    const p = o.querySelector('[data-espera]');
    if (!p) return;
    const pasados = Date.now() - inicio;
    if (pasados < ESPERA_LARGA_MS) { p.textContent = `Puede tardar hasta un minuto. Llevas ${mmss(Math.round(pasados / 1000))}.`; return; }
    if (o.querySelector('[data-cancelar]')) { p.firstChild.textContent = `Está tardando más de lo normal (${mmss(Math.round(pasados / 1000))}). `; return; }
    p.innerHTML = `<span>Está tardando más de lo normal (${mmss(Math.round(pasados / 1000))}). </span>`
      + '<span>Puedes cancelar y volver a intentarlo; lo que ya estaba guardado no se pierde.</span>'
      + '<span class="row" style="justify-content:center;margin-top:12px"><button class="btn ghost" data-cancelar>Cancelar</button></span>';
    p.querySelector('[data-cancelar]').addEventListener('click', () => {
      cancelar(new Error('Cancelado: no se ha cambiado nada.'));
      cancelarEspera();
    });
  }, 1000);
  try { return await Promise.race([fn(), cancelado]); } finally { clearInterval(reloj); closeOverlay(); }
}

export async function loadConfig() {
  const r = await api('GET', '/api/config');
  state.config = r.config; state.version = r.version; state.draft = clone(r.config);
  state.dirty = false; state.saveError = null;
}

export async function saveConfig() {
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

