/* BioAsturias · Panel — Tareas: tablero Por hacer / En curso / Hecho (arrastrable y con botones), con filtros y edición. */
'use strict';
(() => {
  const BA = window.BA, U = BA.U, esc = U.esc;
  const ESTADOS = [['porhacer', 'Por hacer'], ['encurso', 'En curso'], ['hecho', 'Hecho']];
  const PRIO = { alta: 'Alta', media: 'Media', baja: 'Baja' };
  const filtro = { area: '', proyecto: '' };
  const PROYECTOS = Object.keys(BA.B.proyectos), AREAS = BA.B.areas;
  const vista = () => BA.ui('tareasVista', 'matriz');
  // Subproyectos de un proyecto: los de ejemplo más los que Mateo haya escrito en sus tareas
  const subsDe = p => p ? [...new Set([...(BA.B.subproyectos[p] || []), ...BA.lista('tareas').filter(t => t.proyecto === p && t.sub).map(t => t.sub)])] : [];
  const ruta = t => t.proyecto ? esc(t.proyecto) + (t.sub ? ' › ' + esc(t.sub) : '') : '';

  const tareasVis = () => BA.lista('tareas').filter(t => (!filtro.area || t.area === filtro.area) && (!filtro.proyecto || t.proyecto === filtro.proyecto));
  const ordenar = (a, b) => (a.fecha || '9').localeCompare(b.fecha || '9') || ['alta', 'media', 'baja'].indexOf(a.prioridad) - ['alta', 'media', 'baja'].indexOf(b.prioridad);

  function tarjeta(t) {
    const i = t.origenId && BA.get('items', t.origenId);
    const venc = t.estado !== 'hecho' && t.fecha && U.difDias(t.fecha) < 0;
    const idx = ESTADOS.findIndex(e => e[0] === t.estado);
    return `<article class="tarea" draggable="true" data-id="${esc(t.id)}">
      <h4><button type="button" class="btn--link" data-acc="tarea-editar" data-id="${esc(t.id)}" data-foco="t-${esc(t.id)}">${esc(t.titulo)}</button></h4>
      <div class="tarea__pie"><span class="badge badge--prio-${t.prioridad}">${PRIO[t.prioridad]}</span><span class="chip">${esc(t.area)}</span>${t.proyecto ? `<span class="chip chip--etiqueta">${ruta(t)}</span>` : ''}</div>
      <div class="tarea__pie"><span class="peq ${venc ? 'badge badge--hoy' : 'suave'}">${t.fecha ? (venc ? 'Vencida · ' : '') + U.diaCorto(U.dia(t.fecha)) : 'Sin fecha'}</span>
        ${i ? `<button type="button" class="cita" data-acc="item-ver" data-id="${esc(i.id)}" title="Ver el elemento de origen">${U.fuente(i.fuente)} <span>Origen</span></button>` : '<span class="peq suave">Creada a mano</span>'}
        <span class="tarea__mover">
          <button type="button" class="btn btn--icono" data-acc="tarea-mover" data-id="${esc(t.id)}" data-dir="-1" aria-label="Mover a ${idx > 0 ? ESTADOS[idx - 1][1] : '—'}: ${esc(t.titulo)}"${idx === 0 ? ' disabled' : ''}>${U.ic('izq')}</button>
          <button type="button" class="btn btn--icono" data-acc="tarea-mover" data-id="${esc(t.id)}" data-dir="1" aria-label="Mover a ${idx < 2 ? ESTADOS[idx + 1][1] : '—'}: ${esc(t.titulo)}"${idx === 2 ? ' disabled' : ''}>${U.ic('der')}</button></span></div>
    </article>`;
  }
  // ---------- vista por área › proyecto › subproyecto ----------
  function filaTarea(t) {
    const hecha = t.estado === 'hecho', venc = !hecha && t.fecha && U.difDias(t.fecha) < 0;
    return `<div class="fila fila--tarea${hecha ? ' fila--hecha' : ''}"><button type="button" class="chk" data-acc="tarea-check" data-id="${esc(t.id)}" aria-pressed="${hecha}" aria-label="${hecha ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${esc(t.titulo)}">${U.ic('hecho')}</button>
      <button type="button" class="fila__main" data-acc="tarea-editar" data-id="${esc(t.id)}" data-foco="tp-${esc(t.id)}"><span class="fila__t">${esc(t.titulo)}</span>
        <span class="fila__meta"><span class="${venc ? 'badge badge--hoy' : ''}">${t.fecha ? (venc ? 'Vencida · ' : '') + U.diaCorto(U.dia(t.fecha)) : 'Sin fecha'}</span><span class="badge badge--prio-${t.prioridad}">${PRIO[t.prioridad]}</span>${t.estado === 'encurso' ? '<span class="chip">En curso</span>' : ''}</span></button></div>`;
  }
  function porProyecto(l) {
    const areas = [...AREAS, ...new Set(l.map(t => t.area).filter(a => !AREAS.includes(a)))].filter(a => l.some(t => t.area === a));
    if (!areas.length) return '<div class="vacio"><b>No hay tareas con estos filtros</b>Quita algún filtro o crea una tarea nueva.</div>';
    return areas.map(a => {
      const la = l.filter(t => t.area === a), proys = [...new Set(la.map(t => t.proyecto || ''))].sort((x, y) => (x ? 0 : 1) - (y ? 0 : 1) || x.localeCompare(y));
      return `<section class="area" aria-labelledby="ar-${esc(U.norm(a))}"><h2 class="area__t" id="ar-${esc(U.norm(a))}">${esc(a)}</h2>${proys.map(p => {
        const lp = la.filter(t => (t.proyecto || '') === p).sort(ordenar), pend = lp.filter(t => t.estado !== 'hecho'), hechas = lp.length - pend.length;
        const subs = [...new Set(lp.map(t => t.sub || ''))].sort((x, y) => (x ? 1 : 0) - (y ? 1 : 0) || x.localeCompare(y));
        return `<details class="grupo grupo--proy"${pend.length ? ' open' : ''}><summary><span>${p ? esc(p) : 'Sin proyecto'}</span><span class="cuenta">${pend.length}</span><small>${hechas} de ${lp.length} hechas</small></summary>
          ${subs.map(sb => { const ls = lp.filter(t => (t.sub || '') === sb); return (sb ? `<div class="sub-cab">${esc(sb)} <span>${ls.filter(t => t.estado === 'hecho').length}/${ls.length}</span></div>` : '') + ls.map(filaTarea).join(''); }).join('')}</details>`; }).join('')}</section>`;
    }).join('');
  }
  BA.acc['tarea-check'] = el => { const t = BA.get('tareas', el.dataset.id); if (!t) return; const e = t.estado === 'hecho' ? 'porhacer' : 'hecho'; BA.parchear('tareas', t.id, { estado: e }); BA.refrescar(); BA.toast(e === 'hecho' ? 'Tarea hecha.' : 'Tarea pendiente de nuevo.', { accion: 'Deshacer', fn: () => { BA.parchear('tareas', t.id, { estado: t.estado }); BA.refrescar(); } }); };
  BA.acc['tarea-vista'] = el => { BA.setUi('tareasVista', el.dataset.v); BA.refrescar(); };

  // ---------- vista matriz: Hacer / Llamar / Ir / Contestar ----------
  function porMatriz(l) {
    const els = l.filter(t => t.estado !== 'hecho').map(t => { const n = t.fecha ? U.difDias(t.fecha) : 99;
      return { k: 'tarea', id: t.id, acc: t.accion || 'hacer', titulo: t.titulo, sub: [t.proyecto && t.proyecto + (t.sub ? ' › ' + t.sub : ''), t.fecha ? (n < 0 ? 'Vencida ' : '') + U.diaCorto(U.dia(t.fecha)) : 'Sin fecha'].filter(Boolean).join(' · '), urg: n <= 1, imp: t.prioridad === 'alta', orden: t.fecha || '9' }; })
      .sort((a, b) => ((a.urg ? 0 : 2) + (a.imp ? 0 : 1)) - ((b.urg ? 0 : 2) + (b.imp ? 0 : 1)) || a.orden.localeCompare(b.orden));
    return BA.matriz.html(els, 'Todas tus tareas por tipo de acción', 'Urgente: vence hoy, mañana o ya ha vencido. Importante: prioridad alta.');
  }

  function render() {
    const l = tareasVis(), v = vista();
    return `<div class="cab-pagina"><div><h1>Tareas</h1><p>Lo que sale del brief, de las reuniones y de tu cabeza, ordenado por tus áreas, proyectos y subproyectos.</p></div>
      <div class="acciones"><div class="conmutador" role="group" aria-label="Vista">${[['matriz', 'Matriz'], ['proyectos', 'Por proyecto'], ['tablero', 'Tablero']].map(([k, t]) => `<button type="button" data-acc="tarea-vista" data-v="${k}" aria-pressed="${v === k}">${t}</button>`).join('')}</div>
      <button type="button" class="btn btn--primario" data-acc="tarea-nueva">${U.ic('mas2', 'ic--sm')} Nueva tarea</button></div></div>
      <div class="filtros" role="group" aria-label="Filtrar tareas">
        <div class="campo"><label for="tf-area">Área</label><select id="tf-area" data-chg="tarea-filtro" data-k="area"><option value="">Todas</option>${AREAS.map(a => `<option${filtro.area === a ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="campo"><label for="tf-proy">Proyecto</label><select id="tf-proy" data-chg="tarea-filtro" data-k="proyecto"><option value="">Todos</option>${PROYECTOS.map(p => `<option${filtro.proyecto === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
        ${filtro.area || filtro.proyecto ? '<button type="button" class="btn btn--borde btn--sm" data-acc="tarea-limpiar">Quitar filtros</button>' : ''}</div>
      ${v === 'matriz' ? porMatriz(l) : v === 'proyectos' ? porProyecto(l) : `<div class="kanban">${ESTADOS.map(([k, t]) => { const c = l.filter(x => x.estado === k).sort(ordenar);
        return `<section class="col" data-estado="${k}" aria-label="${t}"><div class="col__cab"><h2>${t}</h2><span class="cuenta" style="background:var(--c-primario)">${c.length}</span></div>${c.map(tarjeta).join('') || '<p class="peq suave" style="padding:6px">Nada por aquí.</p>'}</section>`; }).join('')}</div>
      <p class="peq suave" style="margin-top:12px">Arrastra las tarjetas entre columnas o usa las flechas (en el móvil, las flechas).</p>`}`;
  }
  BA.rutas.tareas = { titulo: 'Tareas', render };
  BA.chg['tarea-filtro'] = el => { filtro[el.dataset.k] = el.value; BA.refrescar(); };
  BA.acc['tarea-limpiar'] = () => { filtro.area = ''; filtro.proyecto = ''; BA.refrescar(); };
  BA.acc['tarea-mover'] = el => { const t = BA.get('tareas', el.dataset.id), i = ESTADOS.findIndex(e => e[0] === t.estado) + +el.dataset.dir; if (i < 0 || i > 2) return; mover(t.id, ESTADOS[i][0]); };
  function mover(id, estado) { const t = BA.get('tareas', id); if (!t || t.estado === estado) return; BA.parchear('tareas', id, { estado }); BA.refrescar(); BA.toast(`«${t.titulo.length > 40 ? t.titulo.slice(0, 38) + '…' : t.titulo}» → ${ESTADOS.find(e => e[0] === estado)[1]}`); }

  // arrastrar y soltar
  let arrastrada = null;
  document.addEventListener('dragstart', e => { const t = e.target.closest && e.target.closest('.tarea'); if (!t) return; arrastrada = t.dataset.id; t.classList.add('arrastrando'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', arrastrada); });
  document.addEventListener('dragend', () => { arrastrada = null; U.$$('.arrastrando').forEach(x => x.classList.remove('arrastrando')); U.$$('.col.sobre').forEach(x => x.classList.remove('sobre')); });
  document.addEventListener('dragover', e => { const c = e.target.closest && e.target.closest('.col'); if (c && arrastrada) { e.preventDefault(); U.$$('.col.sobre').forEach(x => x !== c && x.classList.remove('sobre')); c.classList.add('sobre'); } });
  document.addEventListener('drop', e => { const c = e.target.closest && e.target.closest('.col'); if (c && arrastrada) { e.preventDefault(); const id = arrastrada; arrastrada = null; mover(id, c.dataset.estado); } });

  // alta y edición
  function formulario(t) {
    return `<div class="campo"><label for="tk-t">Título</label><input id="tk-t" name="titulo" type="text" required maxlength="160" value="${esc(t.titulo)}"></div>
      <div class="rejilla-2"><div class="campo"><label for="tk-a">Área</label><select id="tk-a" name="area">${AREAS.map(a => `<option${t.area === a ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="campo"><label for="tk-p">Proyecto</label><select id="tk-p" name="proyecto" data-chg="cz-proy-tarea"><option value="">Sin proyecto</option>${PROYECTOS.map(p => `<option${t.proyecto === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div></div>
      <div class="campo"><label for="tk-s">Subproyecto <span class="suave">(opcional; elige uno o escribe uno nuevo)</span></label><input id="tk-s" name="sub" type="text" maxlength="80" list="tk-s-l" value="${esc(t.sub || '')}" placeholder="${t.proyecto ? 'p. ej. Entregable 1' : 'Elige antes un proyecto'}"><datalist id="tk-s-l">${subsDe(t.proyecto).map(x => `<option value="${esc(x)}">`).join('')}</datalist></div>
      <div class="rejilla-2"><div class="campo"><label for="tk-f">Fecha</label><input id="tk-f" name="fecha" type="date" value="${esc(t.fecha || '')}"></div>
      <div class="campo"><label for="tk-pr">Prioridad</label><select id="tk-pr" name="prioridad">${Object.entries(PRIO).map(([k, v]) => `<option value="${k}"${t.prioridad === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div class="rejilla-2"><div class="campo"><label for="tk-ac">Qué hay que hacer</label><select id="tk-ac" name="accion">${BA.matriz.ACCIONES.map(([k, v]) => `<option value="${k}"${(t.accion || 'hacer') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="tk-e">Estado</label><select id="tk-e" name="estado">${ESTADOS.map(([k, v]) => `<option value="${k}"${t.estado === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div class="campo"><label for="tk-n">Notas</label><textarea id="tk-n" name="notas" maxlength="1000">${esc(t.notas || '')}</textarea></div>`;
  }
  BA.chg['cz-proy-tarea'] = el => { const dl = el.closest('dialog'), a = BA.B.proyectos[el.value]; if (a) dl.querySelector('#tk-a').value = a;
    dl.querySelector('#tk-s-l').innerHTML = subsDe(el.value).map(x => `<option value="${esc(x)}">`).join(''); dl.querySelector('#tk-s').placeholder = el.value ? 'p. ej. Entregable 1' : 'Elige antes un proyecto'; };
  const valida = fd => fd.get('titulo').trim() ? null : 'Escribe un título para la tarea.';
  const leer = fd => ({ titulo: fd.get('titulo').trim(), area: fd.get('area'), proyecto: fd.get('proyecto'), sub: fd.get('proyecto') ? fd.get('sub').trim() : '', accion: fd.get('accion'), fecha: fd.get('fecha'), prioridad: fd.get('prioridad'), estado: fd.get('estado'), notas: fd.get('notas').trim() });
  BA.acc['tarea-nueva'] = async () => {
    const r = await BA.dialogo({ titulo: 'Nueva tarea', ok: 'Crear', validar: valida, html: formulario({ titulo: '', area: filtro.area || 'Proyectos', proyecto: filtro.proyecto, fecha: U.iso(U.sigLab(BA.hoy)), prioridad: 'media', estado: 'porhacer', accion: 'hacer' }) });
    if (!r) return; BA.nuevo('tareas', { id: U.uid('t'), origenId: null, ...leer(r.fd) }); BA.refrescar(); BA.toast('Tarea creada.');
  };
  BA.acc['tarea-editar'] = async el => {
    const t = BA.get('tareas', el.dataset.id);
    const r = await BA.dialogo({ titulo: 'Editar tarea', ok: 'Guardar', validar: (fd, f, a) => a === 'borrar' ? null : valida(fd), botones: [{ t: 'Borrar', valor: 'borrar', clase: 'btn--peligro' }], html: formulario(t) });
    if (!r) return;
    if (r.accion === 'borrar') { BA.borrar('tareas', t.id); BA.refrescar(); BA.toast('Tarea borrada.'); return; }
    BA.parchear('tareas', t.id, leer(r.fd)); BA.refrescar(); BA.toast('Tarea guardada.');
  };
})();
