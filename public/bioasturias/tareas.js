/* BioAsturias · Panel — Tareas, en simple: cada tarea está hecha o no. Dos vistas: la matriz Hacer / Llamar / Ir / Contestar y por proyecto. */
'use strict';
(() => {
  const BA = window.BA, U = BA.U, esc = U.esc;
  const PRIO = { alta: 'Alta', media: 'Media', baja: 'Baja' };
  const PROYECTOS = Object.keys(BA.B.proyectos), AREAS = BA.B.areas;
  const vista = () => BA.ui('tareasVista', 'matriz') === 'proyectos' ? 'proyectos' : 'matriz';
  const hecha = t => t.estado === 'hecho';
  // Subproyectos de un proyecto: los de ejemplo más los que Mateo haya escrito en sus tareas
  const subsDe = p => p ? [...new Set([...(BA.B.subproyectos[p] || []), ...BA.lista('tareas').filter(t => t.proyecto === p && t.sub).map(t => t.sub)])] : [];

  const tareasVis = () => BA.lista('tareas');
  const ordenar = (a, b) => (a.fecha || '9').localeCompare(b.fecha || '9') || ['alta', 'media', 'baja'].indexOf(a.prioridad) - ['alta', 'media', 'baja'].indexOf(b.prioridad);
  const fechaTxt = t => { if (!t.fecha) return 'Sin fecha'; const n = U.difDias(t.fecha); return !hecha(t) && n < 0 ? 'Vencida · ' + U.diaCorto(U.dia(t.fecha)) : n === 0 ? 'Hoy' : n === 1 ? 'Mañana' : U.diaCorto(U.dia(t.fecha)); };
  const chk = t => `<button type="button" class="chk" data-acc="tarea-check" data-id="${esc(t.id)}" aria-pressed="${hecha(t)}" aria-label="${hecha(t) ? 'Marcar como pendiente' : 'Marcar como hecha'}: ${esc(t.titulo)}">${U.ic('hecho')}</button>`;

  // ---------- vista matriz: Hacer / Llamar / Ir / Contestar ----------
  function porMatriz(l) {
    const els = l.filter(t => !hecha(t)).map(t => { const n = t.fecha ? U.difDias(t.fecha) : 99;
      return { k: 'tarea', id: t.id, acc: t.accion || 'hacer', titulo: t.titulo, chk: chk(t), sub: [t.proyecto && t.proyecto + (t.sub ? ' › ' + t.sub : ''), fechaTxt(t)].filter(Boolean).join(' · '), urg: n <= 1, imp: t.prioridad === 'alta', orden: t.fecha || '9' }; })
      .sort((a, b) => ((a.urg ? 0 : 2) + (a.imp ? 0 : 1)) - ((b.urg ? 0 : 2) + (b.imp ? 0 : 1)) || a.orden.localeCompare(b.orden));
    const hechas = l.filter(hecha).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    return BA.matriz.html(els, 'Qué tienes que hacer', 'Urgente: vence hoy, mañana o ya ha vencido. Importante: prioridad alta.')
      + (hechas.length ? `<details class="grupo hechas"><summary><span>Hechas</span><span class="cuenta">${hechas.length}</span></summary>${hechas.map(filaTarea).join('')}</details>` : '');
  }

  // ---------- vista por área › proyecto › subproyecto ----------
  function filaTarea(t) {
    const venc = !hecha(t) && t.fecha && U.difDias(t.fecha) < 0;
    return `<div class="fila fila--tarea${hecha(t) ? ' fila--hecha' : ''}">${chk(t)}
      <button type="button" class="fila__main" data-acc="tarea-editar" data-id="${esc(t.id)}" data-foco="tp-${esc(t.id)}"><span class="fila__t">${esc(t.titulo)}</span>
        <span class="fila__meta"><span class="${venc ? 'badge badge--hoy' : ''}">${fechaTxt(t)}</span>${t.prioridad === 'alta' && !hecha(t) ? '<span class="marca-i">Importante</span>' : ''}<span>${esc((BA.matriz.ACCIONES.find(a => a[0] === (t.accion || 'hacer')) || [])[1] || '')}</span></span></button></div>`;
  }
  function porProyecto(l) {
    const areas = [...AREAS, ...new Set(l.map(t => t.area).filter(a => !AREAS.includes(a)))].filter(a => l.some(t => t.area === a));
    if (!areas.length) return '<div class="vacio"><b>No hay tareas</b>Crea una con «Nueva tarea».</div>';
    return areas.map(a => {
      const la = l.filter(t => t.area === a), proys = [...new Set(la.map(t => t.proyecto || ''))].sort((x, y) => (x ? 0 : 1) - (y ? 0 : 1) || x.localeCompare(y));
      return `<section class="area" aria-labelledby="ar-${esc(U.norm(a))}"><h2 class="area__t" id="ar-${esc(U.norm(a))}">${esc(a)}</h2>${proys.map(p => {
        const lp = la.filter(t => (t.proyecto || '') === p).sort((x, y) => (hecha(x) ? 1 : 0) - (hecha(y) ? 1 : 0) || ordenar(x, y)), pend = lp.filter(t => !hecha(t)), hechas = lp.length - pend.length;
        const subs = [...new Set(lp.map(t => t.sub || ''))].sort((x, y) => (x ? 1 : 0) - (y ? 1 : 0) || x.localeCompare(y));
        return `<details class="grupo grupo--proy"${pend.length ? ' open' : ''}><summary><span>${p ? esc(p) : 'Sin proyecto'}</span><span class="cuenta">${pend.length}</span><small>${hechas} de ${lp.length} hechas</small></summary>
          ${subs.map(sb => { const ls = lp.filter(t => (t.sub || '') === sb); return (sb ? `<div class="sub-cab">${esc(sb)} <span>${ls.filter(hecha).length}/${ls.length}</span></div>` : '') + ls.map(filaTarea).join(''); }).join('')}</details>`; }).join('')}</section>`;
    }).join('');
  }
  BA.acc['tarea-check'] = el => { const t = BA.get('tareas', el.dataset.id); if (!t) return; const e = hecha(t) ? 'porhacer' : 'hecho'; BA.parchear('tareas', t.id, { estado: e }); BA.refrescar(); BA.toast(e === 'hecho' ? 'Tarea hecha.' : 'Tarea pendiente de nuevo.', { accion: 'Deshacer', fn: () => { BA.parchear('tareas', t.id, { estado: t.estado }); BA.refrescar(); } }); };
  BA.acc['tarea-vista'] = el => { BA.setUi('tareasVista', el.dataset.v); BA.refrescar(); };

  function render() {
    const l = tareasVis(), v = vista();
    return `<div class="cab-pagina"><div><h1>Tareas</h1><p>Lo que tienes que hacer, ordenado por lo que toca: hacer, llamar, ir o contestar.</p></div>
      <div class="acciones"><div class="conmutador" role="group" aria-label="Vista">${[['matriz', 'Por tipo'], ['proyectos', 'Por proyecto']].map(([k, t]) => `<button type="button" data-acc="tarea-vista" data-v="${k}" aria-pressed="${v === k}">${t}</button>`).join('')}</div>
      <button type="button" class="btn btn--primario" data-acc="tarea-nueva">${U.ic('mas2', 'ic--sm')} Nueva tarea</button></div></div>
      ${v === 'matriz' ? porMatriz(l) : porProyecto(l)}`;
  }
  BA.rutas.tareas = { titulo: 'Tareas', render };

  // alta y edición
  function formulario(t) {
    return `<div class="campo"><label for="tk-t">Título</label><input id="tk-t" name="titulo" type="text" required maxlength="160" value="${esc(t.titulo)}"></div>
      <div class="rejilla-2"><div class="campo"><label for="tk-ac">Qué hay que hacer</label><select id="tk-ac" name="accion">${BA.matriz.ACCIONES.map(([k, v]) => `<option value="${k}"${(t.accion || 'hacer') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="campo"><label for="tk-f">Fecha</label><input id="tk-f" name="fecha" type="date" value="${esc(t.fecha || '')}"></div></div>
      <div class="rejilla-2"><div class="campo"><label for="tk-p">Proyecto</label><select id="tk-p" name="proyecto" data-chg="cz-proy-tarea"><option value="">Sin proyecto</option>${PROYECTOS.map(p => `<option${t.proyecto === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      <div class="campo"><label for="tk-s">Subproyecto <span class="suave">(opcional)</span></label><input id="tk-s" name="sub" type="text" maxlength="80" list="tk-s-l" value="${esc(t.sub || '')}" placeholder="${t.proyecto ? 'p. ej. Entregable 1' : 'Elige antes un proyecto'}"><datalist id="tk-s-l">${subsDe(t.proyecto).map(x => `<option value="${esc(x)}">`).join('')}</datalist></div></div>
      <div class="rejilla-2"><div class="campo"><label for="tk-a">Área</label><select id="tk-a" name="area">${AREAS.map(a => `<option${t.area === a ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="campo"><span class="etq">Importancia</span><label class="lab-check"><input type="checkbox" name="importante"${t.prioridad === 'alta' ? ' checked' : ''}> Importante</label></div></div>
      <label class="lab-check"><input type="checkbox" name="hecha"${hecha(t) ? ' checked' : ''}> Hecha</label>
      <div class="campo"><label for="tk-n">Notas</label><textarea id="tk-n" name="notas" maxlength="1000">${esc(t.notas || '')}</textarea></div>`;
  }
  BA.chg['cz-proy-tarea'] = el => { const dl = el.closest('dialog'), a = BA.B.proyectos[el.value]; if (a) dl.querySelector('#tk-a').value = a;
    dl.querySelector('#tk-s-l').innerHTML = subsDe(el.value).map(x => `<option value="${esc(x)}">`).join(''); dl.querySelector('#tk-s').placeholder = el.value ? 'p. ej. Entregable 1' : 'Elige antes un proyecto'; };
  const valida = fd => fd.get('titulo').trim() ? null : 'Escribe un título para la tarea.';
  const leer = (fd, t = {}) => ({ titulo: fd.get('titulo').trim(), area: fd.get('area'), proyecto: fd.get('proyecto'), sub: fd.get('proyecto') ? fd.get('sub').trim() : '', accion: fd.get('accion'), fecha: fd.get('fecha'),
    prioridad: fd.get('importante') ? 'alta' : (t.prioridad === 'alta' ? 'media' : t.prioridad || 'media'), estado: fd.get('hecha') ? 'hecho' : 'porhacer', notas: fd.get('notas').trim() });
  BA.acc['tarea-nueva'] = async () => {
    const r = await BA.dialogo({ titulo: 'Nueva tarea', ok: 'Crear', validar: valida, html: formulario({ titulo: '', area: 'Proyectos', proyecto: '', fecha: U.iso(U.sigLab(BA.hoy)), prioridad: 'media', estado: 'porhacer', accion: 'hacer' }) });
    if (!r) return; BA.nuevo('tareas', { id: U.uid('t'), origenId: null, ...leer(r.fd) }); BA.refrescar(); BA.toast('Tarea creada.');
  };
  BA.acc['tarea-editar'] = async el => {
    const t = BA.get('tareas', el.dataset.id);
    const r = await BA.dialogo({ titulo: 'Editar tarea', ok: 'Guardar', validar: (fd, f, a) => a === 'borrar' ? null : valida(fd), botones: [{ t: 'Borrar', valor: 'borrar', clase: 'btn--peligro' }], html: formulario(t) });
    if (!r) return;
    if (r.accion === 'borrar') { BA.borrar('tareas', t.id); BA.refrescar(); BA.toast('Tarea borrada.'); return; }
    BA.parchear('tareas', t.id, leer(r.fd, t)); BA.refrescar(); BA.toast('Tarea guardada.');
  };
})();
