// Revisión antes de publicar: qué cambia para el equipo respecto a lo que ya está publicado en esas fechas.
// Enseña las diferencias por día y persona, ofrece conservar las ediciones a mano y bloqueos del horario publicado
// que el borrador no respeta, y pide confirmar aparte si cambian días que ya han pasado. Ver app/revision.py.
import { $, esc, fmtLong, fmtRange } from '../nucleo/util.js';

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
