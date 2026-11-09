// Revisión antes de publicar: qué cambia para el equipo respecto a lo que ya está publicado en esas fechas.
// Enseña las diferencias por día y persona, ofrece conservar las ediciones a mano y bloqueos del horario publicado
// que el borrador no respeta, y pide confirmar aparte si cambian días que ya han pasado. Ver app/revision.py.
import { $, esc, fmtLong, fmtRange } from '../nucleo/util.js';
import { api, confirmar, overlay, state, toast, withBusy } from '../nucleo/estado.js';
import { renderView } from '../nucleo/pintado.js';
import { actions } from '../nucleo/registro.js';
import { refreshList } from './horarios.js';

// ¿Hay algo que revisar? Si el borrador solo cubre días sin publicar, se publica sin más.
export const hayQueRevisar = (rev) => Boolean(rev.cambios.length || rev.conservables.length || rev.pasado.length);

function cambiosPorDia(cambios) {
  const dias = new Map();
  for (const c of cambios) {
    if (!dias.has(c.fecha)) dias.set(c.fecha, []);
    dias.get(c.fecha).push(c);
  }
  return [...dias.entries()].sort(([a], [b]) => a.localeCompare(b));
}

const turnoOLibre = (t) => (t ? esc(t) : '<i>libra</i>');

export function revisionDialog(rev) {
  const sustituye = rev.sustituye.map((s) => `${fmtRange(s.desde, s.hasta)} (${s.dias} día${s.dias === 1 ? '' : 's'})`).join(', ');
  const dias = cambiosPorDia(rev.cambios);
  const pasado = rev.pasado.length;
  return `<h2>Revisar antes de publicar</h2>
    <p class="small">${rev.dias_publicados
      ? `Sustituye lo que el equipo ve ahora en ${esc(sustituye)}.`
      : 'Ninguna de sus fechas tenía horario publicado.'}${rev.dias_nuevos ? ` Añade ${rev.dias_nuevos} día${rev.dias_nuevos === 1 ? '' : 's'} sin horario hasta ahora.` : ''}</p>
    ${pasado ? `<div class="notice warn small" data-revision-pasado><span>Cambia <b>${pasado} día${pasado === 1 ? '' : 's'} que ya ha${pasado === 1 ? '' : 'n'} pasado</b> (${rev.pasado.map((d) => esc(fmtLong(d))).join(', ')}). Lo que conste como trabajado esos días cambiará.</span></div>` : ''}
    ${rev.conservables.length ? `<h3>Ediciones a mano del horario publicado</h3>
      <p class="small muted">Estos cambios se hicieron a mano en lo publicado y el borrador no los respeta. Marca los que quieras conservar.</p>
      <ul class="revision-conservar">${rev.conservables.map((x, i) => `<li><label class="toggle"><input type="checkbox" data-conservar="${i}" checked>
        ${esc(x.nombre)}, ${esc(fmtLong(x.bloqueo.fecha))}: ${turnoOLibre(x.turno)}</label></li>`).join('')}</ul>` : ''}
    ${dias.length ? `<h3>Cambios para el equipo</h3>
      <div class="revision-cambios">${dias.map(([d, cs]) => `<div class="revision-dia${cs[0].pasado ? ' pasado' : ''}"><b>${esc(fmtLong(d))}</b>${cs[0].pasado ? ' <span class="badge warn">Ya pasado</span>' : ''}
        <ul>${cs.map((c) => `<li>${esc(c.nombre)}: ${turnoOLibre(c.antes)} → ${turnoOLibre(c.despues)}</li>`).join('')}</ul></div>`).join('')}</div>`
      : rev.dias_publicados ? '<p class="small muted">No cambia ningún turno de lo publicado.</p>' : ''}
    ${pasado ? '<label class="toggle" style="margin-top:12px"><input type="checkbox" data-act-change="toggleConfirm"> Quiero cambiar días que ya han pasado.</label>' : ''}
    <div class="row end" style="margin-top:16px"><button class="btn" data-act="closeOverlay">Cancelar</button>
      <button class="btn primary" id="confirm-publish" data-act="publish" data-revisado="1"${pasado ? ' disabled' : ''}>Publicar</button></div>`;
}

// Lo elegido en la revisión, para mandarlo al publicar (y repetirlo si luego hay que confirmar alertas críticas).
export function eleccion(rev) {
  const conservar = rev.conservables.filter((_, i) => { const c = $(`[data-conservar="${i}"]`); return c && c.checked; })
    .map((x) => x.bloqueo);
  return { conservar, confirmar_pasado: rev.pasado.length > 0 };
}

export function confirmCriticalDialog(data) {
  return `<h2>¿Publicar un horario que no vale?</h2>
    <div class="notice crit small"><span>${esc(data.detail)}</span></div>
    <ul class="fix-alerts">${data.criticas.map((a) => `<li><span class="sev-badge critica">Crítica</span> ${esc(a.detalle)}</li>`).join('')}</ul>
    <label class="toggle" style="margin-top:12px"><input type="checkbox" data-act-change="toggleConfirm"> Lo publico sabiendo que tiene alertas críticas y que las resolveré fuera de la app.</label>
    <p class="small muted">Quedará registrado quién lo publicó y cuándo.</p>
    <div class="row end" style="margin-top:16px"><button class="btn" data-act="closeOverlay">Cancelar</button>
      <button class="btn danger" id="confirm-publish" data-act="publish" data-confirm="1" disabled>Publicar igualmente</button></div>`;
}

export function showSlack(res, title) {
  if (!res) return;
  const sent = res.mensajes.filter((m) => m.ok).length;
  overlay(`<h2>${esc(title)}</h2>
    ${res.simulado ? '<div class="notice info small">Slack aún no está conectado: estos son los mensajes que se enviarían. El enlace público ya funciona.</div>'
      : res.ok ? `<div class="notice ok small">Enviados ${sent} mensajes por Slack.</div>` : `<div class="notice warn small">Se enviaron ${sent} de ${res.mensajes.length} mensajes. Revisa los que fallaron.</div>`}
    ${res.mensajes.map((m) => `<div class="msg ${m.ok ? '' : 'bad'}"><b>${esc(m.destino)}</b>${m.ok ? '' : ` · ${esc(m.error || 'error')}`}\n${esc(m.texto)}</div>`).join('')}
    <div class="row end" style="margin-top:16px"><button class="btn primary" data-act="closeOverlay">Cerrar</button></div>`);
}

// ------------------------------------------------------------------ acciones de la pantalla
Object.assign(actions, {
  publish: async (el) => {
    const datos = (el && el.dataset) || {};
    const confirmar = Boolean(datos.confirm);
    const sid = state.current.id;
    // Primero la revisión (diferencias con lo publicado, ediciones a conservar, días pasados); al confirmar
    // alertas críticas se repite lo elegido en ella.
    if (datos.revisado) state.publicacion = { sid, ...eleccion(state.publicacion.rev) };
    else if (!confirmar || !state.publicacion || state.publicacion.sid !== sid) {
      state.publicacion = null;
      try {
        const rev = await api('GET', `/api/horarios/${sid}/revision`);
        if (hayQueRevisar(rev)) { state.publicacion = { sid, rev }; overlay(revisionDialog(rev)); return; }
      } catch (e) { toast(e.message, true); return; }
    }
    const elegido = state.publicacion && state.publicacion.sid === sid
      ? { conservar: state.publicacion.conservar || [], confirmar_pasado: Boolean(state.publicacion.confirmar_pasado) } : {};
    try {
      const d = await withBusy('Publicando…', () => api('POST', `/api/horarios/${sid}/publicar`, { ...elegido, ...(confirmar ? { confirmar_criticas: true } : {}) }));
      state.publicacion = null;
      const reemplazo = d.reemplazado;
      state.current = d; refreshList();
      if (reemplazo) { location.hash = `#/horarios/${reemplazo}`; renderView(); toast('Arreglo publicado. Avisa por Slack a quien le cambia el turno.'); }
      else { renderView(); showSlack(d.slack, 'Horario publicado'); }
    } catch (e) {
      if (e.data && e.data.codigo === 'criticas') overlay(confirmCriticalDialog(e.data));
      else toast(e.message, true);
    }
  },
  notify: async () => {
    try {
      const d = await withBusy('Avisando al equipo…', () => api('POST', `/api/horarios/${state.current.id}/notificar`));
      state.current = d; refreshList(); renderView(); showSlack(d.slack, 'Cambios enviados');
    } catch (e) { toast(e.message, true); }
  },
  unpublish: async () => {
    if (!(await confirmar({ titulo: '¿Volver a borrador?', texto: 'El horario dejará de verse en el enlace público hasta que lo vuelvas a publicar.', verbo: 'Volver a borrador', peligro: true }))) return;
    state.current = await api('POST', `/api/horarios/${state.current.id}/despublicar`); refreshList(); renderView();
  },
  copyLink: async () => {
    try { await navigator.clipboard.writeText(state.current.url_publica); toast('Enlace copiado'); } catch { window.prompt('Copia el enlace:', state.current.url_publica); }
  },
});
