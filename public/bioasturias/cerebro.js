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

  // ---------- página: notas agrupadas, con buscador y filtro por categoría ----------
  const CATS = [['correo', 'Correos', 'outlook'], ['documento', 'Documentos', 'onedrive'], ['factura', 'Facturas', 'odoo'], ['reunion', 'Reuniones y llamadas', 'reunion']];
  const catDe = m => m.cat === 'llamada' ? 'reunion' : m.cat;
  const fm = { q: '', cat: '', cumplidas: false };
  function grupos() {
    const fichas = BA.lista('fichas'), q = U.norm(fm.q.trim());
    const l = BA.lista('memoria').filter(m => (fm.cumplidas || m.estado === 'abierta') && (!fm.cat || catDe(m) === fm.cat)
      && (!q || q.split(/\s+/).every(w => U.norm(m.texto + ' ' + (m.sobre ? sobreTxt(m.sobre) : '')).includes(w))));
    const g = new Map();
    for (const m of l.sort((a, b) => b.fecha.localeCompare(a.fecha))) { const k = m.sobre ? sobreTxt(m.sobre) : 'General'; if (!g.has(k)) g.set(k, { nombre: k, tipo: m.sobre ? m.sobre.tipo : '', l: [] }); g.get(k).l.push(m); }
    return [...g.values()].map(x => ({ ...x, ficha: fichas.find(f => f.proyecto === x.nombre) }));
  }
  function filaMem(m) {
    const f = FUENTE_MEM[m.fuente] || [m.fuente, ''], venc = m.vence && m.estado === 'abierta' ? U.difDias(m.vence) : null, c = CATS.find(x => x[0] === catDe(m));
    return `<li class="mem${m.estado !== 'abierta' ? ' mem--cerrada' : ''}"><span class="mem__ic" title="${c ? c[1] : ''}">${U.ic(c ? c[2] : 'otra', 'ic--sm')}</span><div class="mem__c">
      <p>${esc(m.texto)}</p><span class="fila__meta">${m.tipo === 'pendiente' ? '<span class="chip chip--pend">Pendiente</span>' : ''}${venc !== null ? `<span class="badge ${venc <= 0 ? 'badge--hoy' : 'badge--sem'}">${U.venceTxt(m.vence)}</span>` : ''}
      <span>${U.cuando(m.fecha)} · ${esc(f[0])}</span>${m.estado === 'cerrada' ? '<span class="chip">Cumplido</span>' : m.estado === 'sustituida' ? '<span class="chip">Sustituida</span>' : ''}</span></div></li>`;
  }
  const resultados = () => { const gs = grupos(); return gs.length ? gs.map(g => `<section class="mem-grupo"><div class="mem-grupo__cab"><h2>${esc(g.nombre)}</h2><span class="peq suave">${g.tipo === 'entidad' ? 'Entidad' : g.tipo === 'proyecto' ? 'Proyecto' : ''} · ${U.plural(g.l.length, 'nota', 'notas')}</span></div>
      ${g.ficha ? `<p class="mem-grupo__estado"><b>Estado actual:</b> ${esc(g.ficha.texto)}</p>` : ''}<ul class="mem-lista">${g.l.map(filaMem).join('')}</ul></section>`).join('')
    : '<div class="vacio"><b>No hay notas con ese filtro</b>Prueba con otra palabra o quita la categoría.</div>'; };
  function render() {
    const ab = BA.lista('memoria').filter(m => m.estado === 'abierta');
    return `<div class="cab-pagina"><div><h1>Cerebro</h1><p>Lo que el panel sabe: notas y pendientes que guarda de tus correos, documentos, facturas y reuniones. Se llena solo; aquí solo lo consultas.</p></div></div>
      <div class="mem-barra"><div class="buscador"><label class="solo-lectores" for="mem-q">Buscar en el cerebro</label>${U.ic('buscar')}<input id="mem-q" type="search" placeholder="Buscar: Mirador, cuota, México…" value="${esc(fm.q)}" data-inp="mem-q" autocomplete="off"></div>
        <div class="mem-cats" role="group" aria-label="Filtrar por categoría">${[['', 'Todo', ab.length], ...CATS.map(([k, t]) => [k, t, ab.filter(m => catDe(m) === k).length]).filter(x => x[2])].map(([k, t, n]) => `<button type="button" class="filtro-chip" data-acc="mem-cat" data-k="${k}" aria-pressed="${fm.cat === k}">${t} <span>${n}</span></button>`).join('')}</div>
        <label class="lab-check peq"><input type="checkbox" data-chg="mem-cumplidas"${fm.cumplidas ? ' checked' : ''}> Ver también cumplidas y sustituidas</label></div>
      <div id="mem-res">${resultados()}</div>
      <p class="peq suave">Nada se borra: lo corregido queda como «sustituida» y lo cumplido como «cumplido». El conector con Claude está en <a href="#/fuentes">Fuentes</a>.</p>`;
  }
  BA.rutas.cerebro = { titulo: 'Cerebro', render };
  BA.inp['mem-q'] = el => { fm.q = el.value; const r = U.$('#mem-res'); if (r) r.innerHTML = resultados(); };
  BA.acc['mem-cat'] = el => { fm.cat = el.dataset.k; BA.refrescar(); };
  BA.chg['mem-cumplidas'] = el => { fm.cumplidas = el.checked; BA.refrescar(); };
})();
