import { ICON, esc, fmtH, fmtLong, fmtStamp } from '../nucleo/util.js';
import { state } from '../nucleo/estado.js';
import { head } from '../nucleo/pintado.js';
import { ensure } from './portal.js';
// ------------------------------------------------------------------ WEB (encargados): formularios y carta
const WEB_TIPOS = { candidatura: 'Candidatura', catering: 'Catering' };
const WEB_ESTADOS = { nuevo: 'Nuevo', atendido: 'Atendido', archivado: 'Archivado' };
const fmtBytes = (n) => (n >= 1048576 ? `${fmtH(Math.round(n / 104857.6) / 10)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function viewWeb() {
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
      <div class="row" style="flex-wrap:nowrap"><b style="font-size:var(--text-lg)">${esc(m.nombre)}</b><span class="spacer"></span><span class="badge neutral">${WEB_TIPOS[m.tipo] || esc(m.tipo)}</span>${m.estado === 'nuevo' ? '<span class="badge warn">Nuevo</span>' : ''}</div>
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

