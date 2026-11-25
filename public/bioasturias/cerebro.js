/* BioAsturias · Panel — Cerebro: la memoria del panel. Una base de datos (notas, pendientes y fichas de estado) que llenan la lectura diaria de las fuentes y Claude,
   y un conector MCP para que Claude u otro asistente la lean y la escriban. Mateo apenas toca nada aquí. Las dudas del cerebro se responden desde el Brief. */
'use strict';
(() => {
  const BA = window.BA, U = BA.U, esc = U.esc;
  const recorta = (t, n = 38) => t.length > n ? t.slice(0, n - 1) + '…' : t;
  const abierta = d => !d.respuesta || (d.respuesta === 'recordar' && d.recordarHasta && d.recordarHasta <= BA.hoyISO);
  const FUENTE_MEM = { claude: ['Claude', 'chip--claude'], lectura: ['Lectura de las 06:00', 'chip--lectura'], panel: ['Panel', ''] };
  const sobreTxt = x => x.tipo === 'entidad' ? ((BA.entidad(x.id) || {}).nombre || '') : x.tipo === 'contacto' ? (BA.contacto(x.id) ? BA.nombreC(BA.contacto(x.id)) : '') : x.id;
  // Pendientes con fecha que el cerebro recuerda (para «Lo que viene» del Brief)
  const pendientesMem = () => BA.lista('memoria').filter(m => m.tipo === 'pendiente' && m.estado === 'abierta');
  let filtroMem = 'abiertas';

  // ---------- dudas ----------
  function dudaHtml(d) {
    const i = d.itemId && BA.get('items', d.itemId);
    if (!abierta(d)) return `<div class="duda duda--resuelta"><p><b>${esc(d.pregunta)}</b></p><p class="peq">Tu respuesta: <b>${d.respuesta === 'si' ? 'Sí' : d.respuesta === 'no' ? 'No' : 'Te lo recordaré mañana'}</b>${d.respuesta === 'si' && i ? ' · el elemento se ha marcado como hecho' : d.respuesta === 'no' && i ? ' · se ha creado una tarea' : ''}. <button type="button" class="btn--link" data-acc="duda-deshacer" data-id="${esc(d.id)}">Deshacer</button></p></div>`;
    return `<div class="duda"><p><b>${esc(d.pregunta)}</b></p><p class="peq suave">${esc(d.contexto)}</p>${i ? `<p><button type="button" class="cita" data-acc="item-ver" data-id="${esc(i.id)}">${U.ic(BA.FUENTES[i.fuente][1], 'ic--sm')} ${esc(BA.FUENTES[i.fuente][0])} · ${esc(recorta(i.titulo))}</button></p>` : ''}
      <div class="acciones"><button type="button" class="btn btn--primario btn--sm" data-acc="duda" data-r="si" data-id="${esc(d.id)}">Sí</button><button type="button" class="btn btn--borde btn--sm" data-acc="duda" data-r="no" data-id="${esc(d.id)}">No</button><button type="button" class="btn btn--borde btn--sm" data-acc="duda" data-r="recordar" data-id="${esc(d.id)}">Recordar mañana</button></div></div>`;
  }
  BA.acc.duda = el => {
    const d = BA.get('dudas', el.dataset.id), r = el.dataset.r, i = d.itemId && BA.get('items', d.itemId);
    const p = { respuesta: r, recordarHasta: r === 'recordar' ? U.iso(U.addD(BA.hoy, 1)) : null };
    if (i && i.estado === 'abierto') {
      if (r === 'si') BA.parchear('items', i.id, { estado: 'hecho' });
      else if (r === 'no') BA.mod.brief.crearTarea(i);
    }
    BA.parchear('dudas', d.id, p); BA.refrescar(); BA.toast(r === 'recordar' ? 'Te lo recordaré mañana.' : 'Anotado, gracias.');
  };
  BA.acc['duda-deshacer'] = el => {
    const d = BA.get('dudas', el.dataset.id), i = d.itemId && BA.get('items', d.itemId);
    if (i && i.estado !== 'abierto') { if (i.tareaId) BA.borrar('tareas', i.tareaId); BA.parchear('items', i.id, { estado: 'abierto', tareaId: null }); }
    BA.parchear('dudas', d.id, { respuesta: '', recordarHasta: null }); BA.refrescar();
  };


  BA.mod.cerebro = { dudasAbiertas: () => BA.lista('dudas').filter(abierta).length, dudas: () => BA.lista('dudas').filter(abierta), dudaHtml, pendientesMem, sobreTxt };

  // ---------- página ----------
  const HERRAMIENTAS = [
    ['brief_de_hoy', 'Lo que tienes hoy: matriz, agenda, urgentes y pendientes'], ['contexto_entidad', 'Todo sobre una empresa o institución: contactos, historial, cuotas y notas'],
    ['contexto_proyecto', 'Estado de un proyecto: ficha, tareas, avisos y personas implicadas'], ['buscar', 'Busca en correos, documentos, notas y pendientes'],
    ['apuntar', 'Guarda una nota o un pendiente (con fecha si la tiene)'], ['corregir', 'Sustituye una entrada que ya no es cierta; la vieja queda en el historial'],
    ['cerrar', 'Da por cumplido un pendiente, sin borrarlo'], ['reescribir_estado', 'Reescribe la ficha «estado actual» de un proyecto'],
  ];
  function filaMem(m) {
    const f = FUENTE_MEM[m.fuente] || [m.fuente, ''], venc = m.vence && m.estado === 'abierta' ? U.difDias(m.vence) : null;
    return `<li class="mem${m.estado !== 'abierta' ? ' mem--cerrada' : ''}"><span class="mem__tipo mem__tipo--${m.tipo}" aria-hidden="true"></span><div class="mem__c">
      <p>${esc(m.texto)}</p><span class="fila__meta"><span class="chip ${f[1]}">${esc(f[0])}</span><span>${U.cuando(m.fecha)}</span>${m.sobre ? `<span class="chip chip--etiqueta">${esc(sobreTxt(m.sobre))}</span>` : ''}
      ${venc !== null ? `<span class="badge ${venc <= 0 ? 'badge--hoy' : 'badge--sem'}">${U.venceTxt(m.vence)}</span>` : ''}${m.estado === 'cerrada' ? '<span class="chip">Cumplido</span>' : m.estado === 'sustituida' ? '<span class="chip">Sustituida</span>' : ''}</span></div></li>`;
  }
  function render() {
    const mem = BA.lista('memoria').slice().sort((a, b) => b.fecha.localeCompare(a.fecha)), fichas = BA.lista('fichas'), reg = BA.B.registro, con = BA.B.conector;
    const ab = mem.filter(m => m.estado === 'abierta'), pend = ab.filter(m => m.tipo === 'pendiente');
    const vis = filtroMem === 'abiertas' ? ab : filtroMem === 'pendientes' ? pend : filtroMem === 'notas' ? ab.filter(m => m.tipo === 'nota') : mem.filter(m => m.estado !== 'abierta');
    const fuentesOk = BA.lista('fuentes').filter(f => f.estado === 'conectada');
    return `<div class="cab-pagina"><div><h1>Cerebro</h1><p>La memoria del panel: una base de datos propia donde se guarda lo que llega de tus fuentes y lo que Claude apunta. No tienes que hacer nada aquí: Claude la consulta y la actualiza a través del conector.</p></div></div>
      <div class="flujo" role="img" aria-label="Las fuentes alimentan el cerebro; Claude lo lee y lo escribe a través del conector MCP">
        <div class="flujo__paso"><b>${fuentesOk.length} fuentes</b><small>${esc(fuentesOk.map(f => f.nombre).join(', '))}</small></div><span class="flujo__flecha" aria-hidden="true">→</span>
        <div class="flujo__paso flujo__paso--cerebro"><b>Cerebro</b><small>Base de datos: ${U.plural(ab.length, 'entrada abierta', 'entradas abiertas')} y ${U.plural(fichas.length, 'ficha', 'fichas')}</small></div><span class="flujo__flecha" aria-hidden="true">⇄</span>
        <div class="flujo__paso"><b>Conector MCP</b><small>Acceso con tu cuenta; cada uso queda registrado</small></div><span class="flujo__flecha" aria-hidden="true">⇄</span>
        <div class="flujo__paso flujo__paso--llm"><b>Claude</b><small>El asistente que lee, razona y escribe</small></div></div>
      <div class="kpis"><div class="kpi"><b>${ab.length}</b><span>entradas abiertas</span></div><div class="kpi"><b>${pend.length}</b><span>pendientes que recuerda</span></div><div class="kpi"><b>${fichas.length}</b><span>fichas de estado</span></div><div class="kpi"><b>${U.hora(reg[0].fecha)}</b><span>última escritura (${esc(reg[0].quien)})</span></div></div>
      <div class="cuadro-ficha"><section aria-labelledby="mem-t"><div class="cab-seccion"><h2 id="mem-t">Memoria</h2>
          <div class="conmutador" role="group" aria-label="Filtrar la memoria">${[['abiertas', 'Abiertas'], ['pendientes', 'Pendientes'], ['notas', 'Notas'], ['historial', 'Historial']].map(([k, t]) => `<button type="button" data-acc="mem-filtro" data-k="${k}" aria-pressed="${filtroMem === k}">${t}</button>`).join('')}</div></div>
        <ul class="mem-lista">${vis.map(filaMem).join('') || '<li class="vacio">Nada por aquí.</li>'}</ul>
        <p class="peq suave">Nada se borra ni se edita en silencio: corregir crea una entrada nueva y la anterior queda como sustituida; cumplir un pendiente lo cierra.</p>
        <div class="cab-seccion" style="margin-top:28px"><h2>Fichas de estado</h2><span class="peq suave">Cómo está cada proyecto ahora; Claude las reescribe enteras</span></div>
        <div class="fichas">${fichas.map(f => `<article class="tarjeta ficha-estado"><h3>${esc(f.proyecto)}</h3><p>${esc(f.texto)}</p><span class="peq suave">${esc(f.autor)} · ${U.cuando(f.fecha)} · ${U.plural(f.versiones, 'versión guardada', 'versiones guardadas')}</span></article>`).join('')}</div></section>
      <aside aria-label="Conector"><section class="tarjeta" style="margin-bottom:14px"><h2>Conector MCP</h2><p class="peq suave">La dirección que se añade en Claude (o en otro asistente) para que use el cerebro. Cada persona entra con su cuenta.</p>
          <div class="conector-url"><code>${esc(con.url)}</code><button type="button" class="btn btn--borde btn--sm" data-acc="mcp-copiar">Copiar</button></div>
          <ul class="lista-simple">${con.asistentes.map(a => `<li><span><b>${esc(a.nombre)}</b>${a.quien ? ` <span class="peq suave">· ${esc(a.quien)}</span>` : ''}<br><span class="peq suave">${a.ultimo ? 'Último uso ' + U.cuando(a.ultimo) : 'Sin conectar'}</span></span><span class="estado ${a.estado === 'conectado' ? '' : 'estado--no'}">${a.estado === 'conectado' ? 'Conectado' : 'Disponible'}</span></li>`).join('')}</ul>
          <p class="peq suave">Prototipo: la dirección es de ejemplo y no hay ningún asistente conectado de verdad.</p></section>
        <section class="tarjeta" style="margin-bottom:14px"><h2>Qué puede hacer Claude</h2><ul class="herramientas">${HERRAMIENTAS.map(([k, t]) => `<li><code>${k}</code><span>${t}</span></li>`).join('')}</ul></section>
        <section class="tarjeta"><h2>Registro de accesos</h2><ul class="registro">${reg.map(r => `<li><span class="peq suave">${U.cuando(r.fecha)}</span><span><b>${esc(r.quien)}</b> · <code>${esc(r.herramienta)}</code>${r.detalle ? ` <span class="suave">${esc(r.detalle)}</span>` : ''}</span></li>`).join('')}</ul></section></aside></div>`;
  }
  BA.rutas.cerebro = { titulo: 'Cerebro', render };
  BA.acc['mem-filtro'] = el => { filtroMem = el.dataset.k; BA.refrescar(); };
  BA.acc['mcp-copiar'] = () => BA.copiar(BA.B.conector.url, 'Dirección del conector copiada.');
})();
