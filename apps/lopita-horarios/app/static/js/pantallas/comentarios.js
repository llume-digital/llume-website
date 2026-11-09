import { $, esc, fmtStamp } from '../nucleo/util.js';
import { api, overlay, state, toast } from '../nucleo/estado.js';
import { NAV_ADMIN, NAV_WORKER, head, isWorker, mic, renderView, route } from '../nucleo/pintado.js';
import { ensure } from './portal.js';
import { actions } from '../nucleo/registro.js';
// ------------------------------------------------------------------ COMENTARIOS (feedback sobre la app)
const FB_TIPOS = { sugerencia: 'Sugerencia', error: 'Algo no funciona', duda: 'Duda' };
const FB_ESTADOS = { nuevo: ['warn', 'Nuevo'], en_curso: ['borrador', 'En curso'], hecho: ['publicado', 'Hecho'], descartado: ['neutral', 'Descartado'] };
const fbEstado = (e) => { const [c, l] = FB_ESTADOS[e] || ['neutral', e]; return `<span class="badge ${c}">${l}</span>`; };
export const pantallaActual = () => { const r = route(); const tab = [...NAV_ADMIN, ...NAV_WORKER, ['guia', 'Guía']].find(([k]) => k === r.name); return `${tab ? tab[1] : r.name}${r.arg ? ` ${r.arg}` : ''}${r.name === 'horarios' && r.arg ? ` · vista ${state.vista}` : ''}`; };

export function feedbackDialog(mios) {
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

export function viewComentarios() {
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

export async function uploadWebDoc(input) {
  const file = input.files[0]; if (!file) return;
  try {
    state.web.docs = await api('PUT', `/api/web/documentos/${input.dataset.webDoc}`, { nombre: file.name, datos: await fileToBase64(file) });
    toast('Carta subida'); renderView();
  } catch (e) { toast(e.message, true); }
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
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
});
