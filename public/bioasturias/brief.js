/* BioAsturias · Panel — Brief diario: cifras, agenda, pendientes agrupados, panel de detalle, acciones y modo «repasar uno a uno». */
'use strict';
(() => {
  const BA = window.BA, U = BA.U, esc = U.esc;
  const AREAS = BA.B.areas, PROYECTOS = Object.keys(BA.B.proyectos);
  const GRUPO_TXT = { sin_responder: 'Sin responder', esperando: 'Esperando respuesta', novedad: 'Novedad' };
  const modo = () => BA.ui('modo', 'normal');
  const nivelMax = () => ({ tranquilo: 0, normal: 2, cargado: 3 })[modo()];

  const visibles = () => BA.lista('items').filter(i => i.nivel <= nivelMax());
  const pospuesto = i => i.posponerHasta && i.posponerHasta > BA.hoyISO;
  const activos = () => visibles().filter(i => i.estado === 'abierto' && !pospuesto(i));
  const agendaHoy = () => BA.lista('agenda').filter(a => a.m <= ({ tranquilo: 1, normal: 2, cargado: 3 })[modo()]);

  // Sección del brief a la que pertenece un elemento
  function seccion(i) {
    if (i.vence) { const n = U.difDias(i.vence); if (n <= 0) return 'hoy'; if (n <= 7) return 'semana'; }
    return i.grupo;
  }
  const SECCIONES = [
    ['hoy', 'Vence hoy', 'Lo que no puede esperar a mañana', 'grupo--hoy'],
    ['sin_responder', 'Sin responder', 'Te escribieron y aún no has contestado (aunque lo marcaras como leído)', ''],
    ['semana', 'Vence esta semana', 'Plazos de los próximos días', ''],
    ['esperando', 'Esperando respuesta de otros', 'Escribiste tú y no ha contestado nadie', ''],
    ['novedad', 'Novedades en Outlook, Drive, Odoo y calendario', 'Cambios que conviene que veas', ''],
  ];
  const orden = (a, b) => (a.vence || '9') < (b.vence || '9') ? -1 : (a.vence || '9') > (b.vence || '9') ? 1 : b.llegada.localeCompare(a.llegada);

  // Prioridades del día: primero lo que vence, luego lo que lleva más tiempo sin respuesta
  const diasDesde = t => Math.max(0, Math.round((BA.hoy - U.dia(U.iso(new Date(t)))) / 864e5));
  function puntos(i) {
    const n = i.vence ? U.difDias(i.vence) : null, d = diasDesde(i.llegada);
    if (n !== null && n <= 0) return 100 - n;
    if (i.grupo === 'sin_responder') return 60 + Math.min(d, 10) * 3 + (n !== null && n <= 7 ? 8 - n : 0);
    if (n !== null && n <= 7) return 50 - n * 3;
    if (i.grupo === 'esperando') return 30 + Math.min(d, 10) * 2;
    return 10;
  }
  function motivo(i) {
    if (i.vence && U.difDias(i.vence) <= 1) return U.venceTxt(i.vence);
    if (i.grupo === 'sin_responder') return 'Sin responder · te escribió ' + U.hace(i.llegada);
    if (i.grupo === 'esperando') return 'Esperas respuesta · ' + U.hace(i.llegada);
    return i.vence ? U.venceTxt(i.vence) : GRUPO_TXT[i.grupo];
  }
  const prioridades = (n = 5) => activos().sort((a, b) => puntos(b) - puntos(a) || orden(a, b)).slice(0, n);

  BA.mod.brief = { pendientes: () => activos().length, activos, agendaHoy, seccion, orden, SECCIONES, GRUPO_TXT, prioridades, motivo };

  // ---------- matriz Hacer / Llamar / Ir / Contestar ----------
  // Cada tarea, aviso o reunión cae en una casilla según lo que hay que hacer. «Ir» = desplazarse (visitas, reuniones presenciales, eventos).
  const ACCIONES = [['hacer', 'Hacer', 'tarea'], ['llamar', 'Llamar', 'llamada'], ['ir', 'Ir', 'ir'], ['contestar', 'Contestar', 'enviado']];
  const accionItem = i => i.accion || (i.grupo === 'sin_responder' ? 'contestar' : 'hacer');
  const accionAgenda = a => /videollamada|online|teams|meet|zoom/i.test(a.lugar) ? null : /tel[eé]fono|llamada/i.test(a.lugar) ? 'llamar' : 'ir';
  // Urgente: tiene fecha límite hoy o ya vencida, o es una cita de hoy. Importante: prioridad alta o entre tus 5 prioridades.
  function elementosHoy() {
    const top = new Set(prioridades().map(i => i.id)), l = [];
    for (const t of BA.lista('tareas').filter(t => t.estado !== 'hecho' && t.fecha && t.fecha <= BA.hoyISO))
      l.push({ k: 'tarea', id: t.id, acc: t.accion || 'hacer', titulo: t.titulo, sub: [t.proyecto && t.proyecto + (t.sub ? ' › ' + t.sub : ''), U.difDias(t.fecha) < 0 ? 'Vencida ' + U.diaCorto(U.dia(t.fecha)) : 'Para hoy'].filter(Boolean).join(' · '), urg: true, imp: t.prioridad === 'alta', orden: '1' + t.fecha });
    for (const i of activos().filter(i => seccion(i) === 'hoy' || i.grupo === 'sin_responder'))
      l.push({ k: 'item', id: i.id, acc: accionItem(i), titulo: i.titulo, sub: [quien(i), motivo(i)].filter(Boolean).join(' · '), urg: !!(i.vence && U.difDias(i.vence) <= 0), imp: top.has(i.id), orden: '2' + (i.vence || '9') + i.llegada });
    for (const a of agendaHoy()) { const acc = accionAgenda(a); if (acc) l.push({ k: 'agenda', id: a.id, acc, titulo: a.titulo, sub: `${a.ini}–${a.fin} · ${a.lugar}`, urg: true, imp: false, orden: '0' + a.ini }); }
    const peso = x => (x.urg ? 0 : 2) + (x.imp ? 0 : 1);
    return l.sort((a, b) => peso(a) - peso(b) || a.orden.localeCompare(b.orden));
  }
  const marcas = x => `${x.urg ? '<span class="marca-u">Urgente</span>' : ''}${x.imp ? '<span class="marca-i">Importante</span>' : ''}`;
  function celdaFila(x) {
    const acc = x.k === 'tarea' ? `data-acc="tarea-editar" data-id="${esc(x.id)}"` : x.k === 'item' ? `data-acc="item-ver" data-id="${esc(x.id)}"` : 'data-acc="agenda-ver"';
    return `<li draggable="${x.k !== 'agenda'}" data-mk="${x.k}" data-mid="${esc(x.id)}"><button type="button" class="celda__fila" ${acc} data-foco="m-${esc(x.id)}"><span class="celda__t">${esc(x.titulo)}</span><small>${esc(x.sub)}</small>${x.urg || x.imp ? `<span class="celda__marcas">${marcas(x)}</span>` : ''}</button></li>`;
  }
  function matriz(l, titulo, sub) {
    return `<section class="matriz-bloque" aria-labelledby="mx-t"><div class="cab-seccion"><h2 id="mx-t">${titulo}</h2><span class="peq suave">${sub}</span></div>
      <div class="matriz">${ACCIONES.map(([k, t, ic]) => { const c = l.filter(x => x.acc === k);
        return `<section class="celda celda--${k}" data-acc-celda="${k}" aria-label="${t}"><div class="celda__cab">${U.ic(ic)}<h3>${t}</h3><span class="celda__n">${c.length}</span></div>
          ${c.length ? `<ul class="celda__lista">${c.map(celdaFila).join('')}</ul>` : '<p class="peq suave celda__vacia">Nada por aquí.</p>'}</section>`; }).join('')}</div>
      <p class="peq suave">Arrastra un elemento a otra casilla si no está donde toca.</p></section>`;
  }
  BA.matriz = { ACCIONES, html: matriz, marcas };
  BA.acc['agenda-ver'] = () => {};
  // arrastrar entre casillas (tareas y avisos)
  let mArr = null;
  document.addEventListener('dragstart', e => { const li = e.target.closest && e.target.closest('[data-mk]'); if (!li) return; mArr = { k: li.dataset.mk, id: li.dataset.mid }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', li.dataset.mid); li.classList.add('arrastrando'); });
  document.addEventListener('dragend', () => { mArr = null; U.$$('.celda.sobre, [data-mk].arrastrando').forEach(x => x.classList.remove('sobre', 'arrastrando')); });
  document.addEventListener('dragover', e => { const c = e.target.closest && e.target.closest('[data-acc-celda]'); if (c && mArr) { e.preventDefault(); U.$$('.celda.sobre').forEach(x => x !== c && x.classList.remove('sobre')); c.classList.add('sobre'); } });
  document.addEventListener('drop', e => { const c = e.target.closest && e.target.closest('[data-acc-celda]'); if (!c || !mArr) return; e.preventDefault();
    const { k, id } = mArr, acc = c.dataset.accCelda, txt = ACCIONES.find(a => a[0] === acc)[1]; mArr = null;
    BA.parchear(k === 'tarea' ? 'tareas' : 'items', id, { accion: acc }); BA.refrescar(); BA.toast(`Movido a «${txt}».`); });

  // ---------- lo que viene (a futuro): tareas, plazos y pendientes que recuerda el cerebro ----------
  function loQueViene(dias = 7) {
    const lim = U.iso(U.addD(BA.hoy, dias)), l = [];
    for (const t of BA.lista('tareas').filter(t => t.estado !== 'hecho' && t.fecha && t.fecha > BA.hoyISO && t.fecha <= lim)) l.push({ f: t.fecha, t: t.titulo, o: 'Tarea', acc: `data-acc="tarea-editar" data-id="${esc(t.id)}"`, imp: t.prioridad === 'alta' });
    for (const i of activos().filter(i => i.vence && i.vence > BA.hoyISO && i.vence <= lim)) l.push({ f: i.vence, t: i.titulo, o: 'Plazo', acc: `data-acc="item-ver" data-id="${esc(i.id)}"`, imp: false });
    for (const m of BA.mod.cerebro.pendientesMem().filter(m => m.vence && m.vence > BA.hoyISO && m.vence <= lim)) l.push({ f: m.vence, t: m.texto, o: 'Cerebro', acc: 'data-acc="ir-cerebro"', imp: false });
    l.sort((a, b) => a.f.localeCompare(b.f));
    const dias_ = [...new Set(l.map(x => x.f))];
    return `<section class="tarjeta viene" aria-labelledby="vi-t"><div class="cab-seccion"><h2 id="vi-t">Lo que viene</h2><span class="peq suave">Próximos 7 días: tareas, plazos y lo que el cerebro recuerda</span></div>
      ${l.length ? dias_.map(f => { const n = U.difDias(f); return `<div class="viene__dia"><b>${n === 1 ? 'Mañana' : U.diaCorto(U.dia(f))}</b><ul>${l.filter(x => x.f === f).map(x => `<li><button type="button" class="viene__fila" ${x.acc}><span class="chip ${x.o === 'Cerebro' ? 'chip--claude' : ''}">${x.o}</span><span>${esc(x.t)}</span>${x.imp ? '<span class="marca-i">Importante</span>' : ''}</button></li>`).join('')}</ul></div>`; }).join('')
        : '<p class="suave">Nada con fecha en los próximos 7 días.</p>'}</section>`;
  }
  BA.acc['ir-cerebro'] = () => BA.irA('#/cerebro');

  // ---------- agenda visual ----------
  const aMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  function agendaVisual(ag) {
    if (!ag.length) return `<p class="suave">${BA.hoy.getDay() % 6 === 0 ? 'Fin de semana: sin reuniones.' : 'Sin reuniones hoy.'}</p>`;
    const ini = Math.min(8 * 60, ...ag.map(a => aMin(a.ini))), fin = Math.max(19 * 60, ...ag.map(a => aMin(a.fin))), px = 1.05, horas = [];
    for (let h = Math.ceil(ini / 60); h * 60 <= fin; h++) horas.push(h);
    const ahora = BA.ahora.getHours() * 60 + BA.ahora.getMinutes();
    return `<div class="dia" style="height:${(fin - ini) * px}px">${horas.map(h => `<span class="dia__h" style="top:${(h * 60 - ini) * px}px">${String(h).padStart(2, '0')}:00</span>`).join('')}
      ${ahora > ini && ahora < fin ? `<span class="dia__ahora" style="top:${(ahora - ini) * px}px" aria-label="Ahora"></span>` : ''}
      ${ag.map((a, k) => { const acc = accionAgenda(a); return `<div class="dia__ev dia__ev--${acc || 'video'}" style="top:${(aMin(a.ini) - ini) * px}px;height:${Math.max(26, (aMin(a.fin) - aMin(a.ini)) * px - 3)}px"><b>${esc(a.titulo)}</b><small>${a.ini}–${a.fin} · ${esc(a.lugar)}</small></div>`; }).join('')}</div>
      <p class="peq suave dia__ley"><span class="dia__pt dia__pt--ir"></span>Presencial <span class="dia__pt dia__pt--llamar"></span>Teléfono <span class="dia__pt dia__pt--video"></span>Videollamada</p>`;
  }

  // ---------- respuesta sugerida y prompt para Claude ----------
  const nombreDe = i => { const c = i.contactoId && BA.contacto(i.contactoId); return c ? c.nombre : (i.externo || ''); };
  const asuntoLimpio = i => i.titulo.replace(/^Re:\s*/i, '');
  function borrador(i) {
    const cuando = i.vence ? `antes del ${U.fechaLarga(U.dia(i.vence))}` : 'en los próximos días';
    return `Hola${nombreDe(i) ? ' ' + nombreDe(i) : ''}:\n\nGracias por tu correo sobre «${asuntoLimpio(i)}». Lo reviso y te contesto con detalle ${cuando}.\n\nUn saludo,\nMateo`;
  }
  function fichaCorreo(i) {
    const c = i.contactoId && BA.contacto(i.contactoId), e = i.entidadId && BA.entidad(i.entidadId);
    return [`De: ${c ? BA.nombreC(c) + (c.cargo ? ', ' + c.cargo : '') : i.externo}${e ? ' (' + e.nombre + ')' : ''}`, `Asunto: ${i.titulo}`, `Recibido: ${U.fechaCompleta(i.llegada)}`,
      i.proyecto ? `Proyecto: ${i.proyecto}` : '', `Correo:\n\"\"\"\n${i.extracto}\n\"\"\"`].filter(Boolean).join('\n');
  }
  const promptUno = i => `Redacta una respuesta en español a este correo, en tono cordial, cercano y breve, y fírmala como Mateo (BioAsturias). Si te falta algún dato para contestar, pregúntamelo antes de redactar.\n\n${fichaCorreo(i)}`;
  const promptTodos = l => `Tengo ${l.length} correos sin responder. Redacta una respuesta para cada uno, en español, en tono cordial, cercano y breve, firmada como Mateo (BioAsturias). Numera las respuestas igual que los correos y, si te falta algún dato en alguno, dímelo en lugar de inventarlo.\n\n${l.map((i, k) => `--- Correo ${k + 1} ---\n${fichaCorreo(i)}`).join('\n\n')}`;
  async function copiar(txt, msg) {
    try { await navigator.clipboard.writeText(txt); }
    catch { const t = document.createElement('textarea'); t.value = txt; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.append(t); t.select(); try { document.execCommand('copy'); } catch { } t.remove(); }
    BA.toast(msg);
  }
  BA.copiar = copiar;
  const sinResponder = () => activos().filter(i => i.grupo === 'sin_responder').sort((a, b) => puntos(b) - puntos(a));
  BA.acc['copiar-borrador'] = el => { const t = document.getElementById('borr-' + el.dataset.id); copiar(t ? t.value : borrador(BA.get('items', el.dataset.id)), 'Respuesta copiada. Pégala en Outlook.'); };
  BA.acc['copiar-prompt'] = el => copiar(promptUno(BA.get('items', el.dataset.id)), 'Prompt copiado. Pégalo en Claude.');
  BA.acc['copiar-prompt-todos'] = () => { const l = sinResponder(); if (l.length) copiar(promptTodos(l), `Prompt con ${U.plural(l.length, 'correo', 'correos')} copiado. Pégalo en Claude.`); };

  // ---------- filas ----------
  function quien(i) {
    const c = i.contactoId && BA.contacto(i.contactoId), e = i.entidadId && BA.entidad(i.entidadId);
    return [c ? BA.nombreC(c) : '', e ? e.nombre : '', i.externo].filter(Boolean).join(' · ');
  }
  function icon(acc, ic, txt, i) { return `<button type="button" class="btn btn--icono" data-acc="${acc}" data-id="${esc(i.id)}" title="${txt}" aria-label="${txt}: ${esc(i.titulo)}">${U.ic(ic)}</button>`; }
  function fila(i, r = {}) {
    const venc = i.vence ? `<span class="badge ${U.difDias(i.vence) <= 0 ? 'badge--hoy' : 'badge--sem'}">${U.venceTxt(i.vence)}</span>` : '';
    const acc = r.resuelto ? `<button type="button" class="btn btn--borde btn--sm" data-acc="item-reabrir" data-id="${esc(i.id)}">${i.estado === 'tarea' ? 'Reabrir' : 'Volver al brief'}</button>`
      : `${icon('item-hecho', 'hecho', 'Marcar como hecho', i)}${icon('item-tarea', 'tarea', 'Convertir en tarea', i)}${icon('item-categorizar', 'etiqueta', 'Categorizar', i)}${icon('item-posponer', 'reloj', 'Posponer', i)}${icon('item-descartar', 'papelera', 'Descartar', i)}`;
    return `<div class="fila${r.resuelto ? ' fila--hecha' : ''}"><button type="button" class="fila__main" data-acc="item-ver" data-id="${esc(i.id)}" data-foco="v-${esc(i.id)}">
      <span class="fila__meta">${U.fuente(i.fuente)}<span>${U.cuando(i.llegada)}</span>${venc}<span class="chip">${GRUPO_TXT[i.grupo]}</span></span>
      <span class="fila__t">${esc(i.titulo)}</span><span class="fila__q">${esc(quien(i))}</span>
      ${i.proyecto || i.area ? `<span class="fila__tags">${i.proyecto ? `<span class="chip chip--etiqueta">${esc(i.proyecto)}</span>` : ''}${i.area ? `<span class="chip">${esc(i.area)}</span>` : ''}</span>` : ''}
    </button><div class="fila__acc">${acc}</div></div>`;
  }

  // ---------- página ----------
  const saludo = () => { const h = BA.ahora.getHours(); return h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches'; };
  function avisoDia() {
    const w = BA.hoy.getDay();
    if (w === 6 || w === 0) return `<div class="aviso" role="note"><b>Es fin de semana.</b> Hoy no hay jornada: esto es lo que se ha acumulado desde el viernes por la tarde. El lunes lo verás completo, junto con lo que llegue hasta entonces.</div>`;
    if (w === 1) return `<div class="aviso aviso--info" role="note"><b>Hoy es lunes.</b> El brief incluye todo lo que llegó desde el viernes por la tarde: viernes, sábado y domingo.</div>`;
    return '';
  }
  function render() {
    const act = activos(), ag = agendaHoy(), m = modo();
    const nuevos = act.filter(i => i.llegada >= BA.B.ventana.ini).length;
    const sinResp = act.filter(i => i.grupo === 'sin_responder').length;
    const vHoy = act.filter(i => i.vence && U.difDias(i.vence) <= 0).length;
    const cn = { tranquilo: 0, normal: BA.lista('items').filter(i => i.nivel <= 2 && i.estado === 'abierto' && !pospuesto(i)).length, cargado: BA.lista('items').filter(i => i.estado === 'abierto' && !pospuesto(i)).length };
    const secs = SECCIONES.map(([k, t, d, cl]) => [k, t, d, cl, act.filter(i => seccion(i) === k).sort(orden)]);
    const posp = visibles().filter(i => i.estado === 'abierto' && pospuesto(i));
    const resu = visibles().filter(i => ['hecho', 'descartado', 'tarea'].includes(i.estado));
    const dudas = BA.mod.cerebro.dudas(), det = BA.contadores().crm, top = prioridades(), hoyL = elementosHoy();
    return `
      <div class="cab-pagina"><div><p class="antetitulo">${U.fechaLarga(BA.hoy)}</p><h1>${saludo()}, Mateo.</h1>
        <p>Última lectura de tus fuentes: hoy a las 06:00 (Outlook, OneDrive, Google Drive, Odoo y calendario). <a href="#/fuentes">Ver fuentes</a></p></div>
        <div class="acciones"><div class="conmutador" role="group" aria-label="Día de demostración">
          ${[['tranquilo', 'Día tranquilo (0)'], ['normal', `Día normal (${cn.normal})`], ['cargado', `Día cargado (${cn.cargado})`]].map(([k, t]) => `<button type="button" data-acc="modo" data-modo="${k}" aria-pressed="${m === k}">${t}</button>`).join('')}</div></div></div>
      ${avisoDia()}
      <div class="kpis" role="group" aria-label="Resumen en cifras">
        <div class="kpi"><b>${nuevos}</b><span>nuevos desde ${BA.hoy.getDay() === 1 ? 'el viernes por la tarde' : 'ayer por la tarde'}</span></div>
        <div class="kpi${sinResp ? ' kpi--alerta' : ''}"><b>${sinResp}</b><span>pendientes de responder</span></div>
        <div class="kpi${vHoy ? ' kpi--alerta' : ''}"><b>${vHoy}</b><span>vencen hoy</span></div>
        <div class="kpi"><b>${ag.length}</b><span>${ag.length === 1 ? 'reunión hoy' : 'reuniones hoy'}</span></div>
      </div>
      <div class="brief-rejilla"><div>
        ${top.length ? `<section class="prioridades" aria-labelledby="prio-t"><div class="prioridades__cab"><h2 id="prio-t">${top.length === 1 ? 'Tu prioridad de hoy' : `Tus ${top.length} prioridades de hoy`}</h2><span class="peq">Primero lo que vence; después, lo que más tiempo lleva esperando</span></div>
          <ol class="prioridades__lista">${top.map((i, k) => `<li><button type="button" class="prio" data-acc="item-ver" data-id="${esc(i.id)}" data-foco="p-${esc(i.id)}"><span class="prio__n" aria-hidden="true">${k + 1}</span><span class="prio__t"><b>${esc(i.titulo)}</b><small>${esc([quien(i), motivo(i)].filter(Boolean).join(' · '))}</small></span>${U.fuente(i.fuente)}</button></li>`).join('')}</ol></section>` : ''}
        ${matriz(hoyL, 'Qué hacer hoy', 'Tareas, avisos y citas de hoy por tipo de acción')}
        ${loQueViene()}
        <h2 class="titulo-bloque">Todo lo pendiente del brief</h2>
        <div class="acciones" style="margin-bottom:12px"><button type="button" class="btn btn--primario" data-acc="repasar"${act.length ? '' : ' disabled'}>Repasar uno a uno${act.length ? ` (${act.length})` : ''}</button>
          ${sinResp ? `<button type="button" class="btn btn--borde" data-acc="copiar-prompt-todos" title="Copia un texto con todos los correos sin responder para pegarlo en Claude">Responder con Claude (${sinResp})</button>` : ''}</div>
        ${act.length ? secs.filter(s => s[4].length).map(([k, t, d, cl, l]) => `<details class="grupo ${cl}" open><summary><span>${t}</span><span class="cuenta">${l.length}</span><small>${d}</small></summary>${l.map(i => fila(i)).join('')}</details>`).join('')
          : `<div class="vacio"><b>Día tranquilo: no hay nada pendiente</b>Desde el viernes por la tarde no ha llegado nada que necesite tu atención y no esperas respuesta de nadie. Buen momento para avanzar en los proyectos.</div>`}
        ${posp.length ? `<details class="grupo"><summary><span>Pospuestos</span><span class="cuenta">${posp.length}</span><small>Volverán al brief en su fecha</small></summary>${posp.map(i => `<div class="fila fila--hecha"><button type="button" class="fila__main" data-acc="item-ver" data-id="${esc(i.id)}"><span class="fila__t">${esc(i.titulo)}</span><span class="fila__q">Vuelve el ${U.diaCorto(U.dia(i.posponerHasta))}</span></button><div class="fila__acc"><button type="button" class="btn btn--borde btn--sm" data-acc="item-reabrir" data-id="${esc(i.id)}">Traer a hoy</button></div></div>`).join('')}</details>` : ''}
        ${resu.length ? `<details class="grupo"><summary><span>Resueltos</span><span class="cuenta">${resu.length}</span><small>Hechos, descartados y convertidos en tarea</small></summary>${resu.map(i => fila(i, { resuelto: true })).join('')}</details>` : ''}
      </div>
      <aside aria-label="Agenda y avisos">
        <section class="tarjeta" style="margin-bottom:14px"><div class="cab-seccion" style="margin-bottom:10px"><h2>Agenda de hoy</h2><span class="peq suave">${U.plural(ag.length, 'cita', 'citas')}</span></div>${agendaVisual(ag)}</section>
        <section class="tarjeta" style="margin-bottom:14px"><h2>El cerebro te pregunta</h2><p class="peq suave">Lo que no ha podido deducir de tus fuentes. Tu respuesta se guarda en su memoria.</p>
          ${dudas.length ? dudas.map(BA.mod.cerebro.dudaHtml).join('') : '<p class="suave">No tiene ninguna duda abierta.</p>'}</section>
        <section class="tarjeta"><h2>Contactos nuevos</h2>
          <p>${det ? `Hay <b>${det}</b> ${det === 1 ? 'persona' : 'personas'} en tus correos que aún no están en el CRM.` : 'No hay contactos pendientes de revisar.'}</p><a class="btn btn--borde btn--sm" href="#/crm">Revisar en el CRM</a></section>
      </aside></div>`;
  }
  BA.rutas.brief = { titulo: 'Brief diario', render };

  BA.acc.modo = el => { BA.setUi('modo', el.dataset.modo); BA.refrescar(); };

  // ---------- detalle ----------
  const ETQ_EXTRACTO = { outlook: 'Extracto del correo original', gmail: 'Extracto del correo original', onedrive: 'Qué ha cambiado en el documento', gdrive: 'Qué ha cambiado en el documento', odoo: 'Registro en Odoo', calendario: 'Evento del calendario', envios: 'Envío' };
  function verItem(id) {
    const i = BA.get('items', id); if (!i) return;
    const c = i.contactoId && BA.contacto(i.contactoId), e = i.entidadId && BA.entidad(i.entidadId);
    const meta = [];
    if (i.fuente === 'outlook') {
      const mateo = 'mateo@bioasturias.example', otro = c ? c.email : (i.externo ? 'contacto@' + U.norm(i.externo).replace(/[^a-z]+/g, '') + '.example' : '');
      meta.push(['De', i.dir === 'out' ? mateo : otro], ['Para', i.dir === 'out' ? otro : mateo], ['Asunto', i.titulo]);
    }
    meta.push(...(i.meta || []));
    const resuelto = i.estado !== 'abierto';
    const html = `<p class="fila__meta">${U.fuente(i.fuente)}<span>${U.fechaCompleta(i.llegada)}</span>${i.vence ? `<span class="badge ${U.difDias(i.vence) <= 0 ? 'badge--hoy' : 'badge--sem'}">${U.venceTxt(i.vence)}</span>` : ''}</p>
      <h3>${esc(i.titulo)}</h3>
      <p class="suave">${c ? `<button type="button" class="enlace-nombre" data-acc="ir-contacto" data-id="${esc(c.id)}">${esc(BA.nombreC(c))}</button>${c.cargo ? ', ' + esc(c.cargo) : ''}` : ''}${c && e ? ' · ' : ''}${e ? `<button type="button" class="enlace-nombre" data-acc="ir-entidad" data-id="${esc(e.id)}">${esc(e.nombre)}</button>` : ''}${i.externo ? esc(i.externo) + ' <span class="chip">No está en el CRM</span>' : ''}</p>
      <dl class="meta-lista">${meta.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}${i.proyecto ? `<dt>Proyecto</dt><dd>${esc(i.proyecto)}</dd>` : ''}${i.area ? `<dt>Área</dt><dd>${esc(i.area)}</dd>` : ''}${i.tareaId ? `<dt>Tarea</dt><dd><a href="#/tareas" data-acc="drawer-cerrar">Ver en el tablero</a></dd>` : ''}</dl>
      <b class="peq">${ETQ_EXTRACTO[i.fuente] || 'Extracto'}</b><blockquote class="citado">${esc(i.extracto)}</blockquote>
      <p class="peq suave">En este prototipo el extracto es de ejemplo. Con la fuente conectada verías aquí el contenido real y un enlace para abrirlo en ${esc(BA.FUENTES[i.fuente] ? BA.FUENTES[i.fuente][0] : 'su origen')}.</p>
      ${i.grupo === 'sin_responder' && !resuelto ? `<div class="sugerida"><label class="peq" for="borr-${esc(i.id)}"><b>Respuesta sugerida</b></label><textarea id="borr-${esc(i.id)}" rows="7">${esc(borrador(i))}</textarea>
        <div class="acciones"><button type="button" class="btn btn--borde btn--sm" data-acc="copiar-borrador" data-id="${esc(i.id)}">Copiar respuesta</button><button type="button" class="btn btn--borde btn--sm" data-acc="copiar-prompt" data-id="${esc(i.id)}">Copiar prompt para Claude</button></div>
        <p class="peq suave">Prototipo: el borrador es una plantilla. El prompt sí lleva el correo, quién lo envía y el proyecto, para que Claude redacte la respuesta completa.</p></div>` : ''}
      <div class="acciones" style="margin-top:14px">${resuelto ? `<button type="button" class="btn btn--primario" data-acc="item-reabrir" data-id="${esc(i.id)}">Volver al brief</button>` : `
        <button type="button" class="btn btn--primario" data-acc="item-hecho" data-id="${esc(i.id)}">${U.ic('hecho', 'ic--sm')} Hecho</button>
        <button type="button" class="btn btn--borde" data-acc="item-tarea" data-id="${esc(i.id)}">${U.ic('tarea', 'ic--sm')} Convertir en tarea</button>
        <button type="button" class="btn btn--borde" data-acc="item-categorizar" data-id="${esc(i.id)}">${U.ic('etiqueta', 'ic--sm')} Categorizar</button>
        <button type="button" class="btn btn--borde" data-acc="item-posponer" data-id="${esc(i.id)}">${U.ic('reloj', 'ic--sm')} Posponer</button>
        <button type="button" class="btn btn--borde" data-acc="item-descartar" data-id="${esc(i.id)}">${U.ic('papelera', 'ic--sm')} Descartar</button>`}</div>`;
    BA.drawer.abrir(BA.FUENTES[i.fuente] ? BA.FUENTES[i.fuente][0] : 'Detalle', html);
  }
  function verComm(id) {
    const m = BA.get('comms', id); if (!m) return;
    const c = m.contactoId && BA.contacto(m.contactoId), e = BA.entidad(m.entidadId);
    const T = { 'correo-recibido': 'Correo recibido', 'correo-enviado': 'Correo enviado', reunion: 'Reunión', llamada: 'Llamada', 'envio-masivo': 'Envío personalizado' }[m.tipo];
    BA.drawer.abrir(T, `<p class="fila__meta">${U.fuente(m.fuente)}<span>${U.fechaCompleta(m.fecha)}</span></p><h3>${esc(m.asunto)}</h3>
      <p class="suave">${c ? `<button type="button" class="enlace-nombre" data-acc="ir-contacto" data-id="${esc(c.id)}">${esc(BA.nombreC(c))}</button> · ` : ''}${e ? `<button type="button" class="enlace-nombre" data-acc="ir-entidad" data-id="${esc(e.id)}">${esc(e.nombre)}</button>` : ''}</p>
      ${m.proyecto ? `<p><span class="chip chip--etiqueta">${esc(m.proyecto)}</span></p>` : ''}
      <b class="peq">Extracto</b><blockquote class="citado">${esc(m.resumen)}</blockquote>
      <p class="peq suave">Resumen de ejemplo. Con la fuente conectada se mostraría el mensaje o la nota original.</p>`);
  }
  BA.mod.brief.verItem = verItem; BA.mod.brief.verComm = verComm;
  BA.acc['item-ver'] = el => verItem(el.dataset.id);
  BA.acc['comm-ver'] = el => verComm(el.dataset.id);
  BA.acc['ir-contacto'] = el => { if (BA.drawer.abierto()) BA.drawer.cerrar(); BA.irA('#/crm/c/' + el.dataset.id); };
  BA.acc['ir-entidad'] = el => { if (BA.drawer.abierto()) BA.drawer.cerrar(); BA.irA('#/crm/e/' + el.dataset.id); };

  // ---------- acciones ----------
  const cerrarSiAbierto = () => { if (BA.drawer.abierto()) BA.drawer.cerrar(); };
  BA.acc['item-hecho'] = el => { cerrarSiAbierto(); BA.cambiar('items', el.dataset.id, { estado: 'hecho' }, 'Marcado como hecho.'); };
  BA.acc['item-descartar'] = el => { cerrarSiAbierto(); BA.cambiar('items', el.dataset.id, { estado: 'descartado' }, 'Descartado.'); };
  BA.acc['item-reabrir'] = el => { cerrarSiAbierto(); BA.cambiar('items', el.dataset.id, { estado: 'abierto', posponerHasta: null }, 'Vuelve a estar en el brief.'); };
  BA.acc['item-tarea'] = el => { cerrarSiAbierto(); const t = crearTarea(BA.get('items', el.dataset.id)); BA.refrescar(); BA.toast('Tarea creada en «Por hacer».', { accion: 'Ver tareas', fn: () => BA.irA('#/tareas') }); return t; };
  function crearTarea(i) {
    const n = i.vence ? U.difDias(i.vence) : 99;
    const verbo = { sin_responder: 'Responder: ', esperando: 'Reclamar respuesta: ', novedad: 'Revisar: ' }[i.grupo] || '';
    const t = BA.nuevo('tareas', { id: U.uid('t'), titulo: verbo + i.titulo.replace(/^Re:\s*/i, ''), proyecto: i.proyecto || '', area: i.area || 'Proyectos',
      fecha: i.vence || U.iso(U.sigLab(BA.hoy)), prioridad: n <= 1 ? 'alta' : n <= 7 ? 'media' : 'baja', estado: 'porhacer', origenId: i.id, notas: '', sub: '', accion: accionItem(i) });
    BA.parchear('items', i.id, { estado: 'tarea', tareaId: t.id });
    return t;
  }
  BA.mod.brief.crearTarea = crearTarea;

  function opcionesPosponer() {
    const man = U.iso(U.addD(BA.hoy, 1)), lab = U.iso(U.sigLab(BA.hoy));
    const l = d => U.fechaLarga(U.dia(d));
    return man === lab ? [[man, `Mañana (${l(man)}), siguiente día laborable`]] : [[man, `Mañana (${l(man)})`], [lab, `Siguiente día laborable (${l(lab)})`]];
  }
  BA.acc['item-posponer'] = async el => {
    const i = BA.get('items', el.dataset.id), ops = opcionesPosponer();
    const r = await BA.dialogo({ titulo: 'Posponer', ok: 'Posponer', html: `<p><b>${esc(i.titulo)}</b></p><fieldset class="campo" style="border:0;padding:0"><legend class="etq">¿Cuándo quieres volver a verlo?</legend>
      ${ops.map(([d, t], k) => `<label class="lab-check"><input type="radio" name="cuando" value="${d}"${k === 0 ? ' checked' : ''}> ${t}</label>`).join('')}</fieldset>` });
    if (!r) return;
    cerrarSiAbierto(); BA.cambiar('items', i.id, { posponerHasta: r.fd.get('cuando') }, `Pospuesto al ${U.diaCorto(U.dia(r.fd.get('cuando')))}.`);
  };
  BA.acc['item-categorizar'] = async el => {
    const i = BA.get('items', el.dataset.id);
    const r = await BA.dialogo({ titulo: 'Categorizar', html: `<p><b>${esc(i.titulo)}</b></p>
      <div class="campo"><label for="cz-proy">Proyecto</label><select id="cz-proy" name="proyecto" data-chg="cz-proy"><option value="">Sin proyecto</option>${PROYECTOS.map(p => `<option${i.proyecto === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
      <div class="campo"><label for="cz-area">Área</label><select id="cz-area" name="area"><option value="">Sin área</option>${AREAS.map(a => `<option${i.area === a ? ' selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="campo"><label for="cz-acc">Qué hay que hacer</label><select id="cz-acc" name="accion">${ACCIONES.map(([k, t]) => `<option value="${k}"${accionItem(i) === k ? ' selected' : ''}>${t}</option>`).join('')}</select></div>` });
    if (!r) return;
    BA.cambiar('items', i.id, { proyecto: r.fd.get('proyecto'), area: r.fd.get('area'), accion: r.fd.get('accion') }, 'Categoría guardada.');
  };
  BA.chg['cz-proy'] = el => { const a = BA.B.proyectos[el.value]; if (a) el.closest('dialog').querySelector('#cz-area').value = a; };

  // ---------- repasar uno a uno ----------
  BA.acc.repasar = () => {
    const cola = activos().sort((a, b) => SECCIONES.findIndex(s => s[0] === seccion(a)) - SECCIONES.findIndex(s => s[0] === seccion(b)) || orden(a, b)).map(i => i.id);
    if (!cola.length) return;
    let k = 0, hechos = 0; const dlg = document.createElement('dialog'); dlg.className = 'modal modal--ancho'; dlg.setAttribute('aria-labelledby', 'rp-t');
    document.body.append(dlg);
    const pintar = () => {
      if (k >= cola.length) {
        dlg.innerHTML = `<div class="modal__form"><div class="modal__cab"><h2 id="rp-t">Repaso terminado</h2></div><div class="modal__cuerpo"><div class="vacio"><b>¡Estás al día!</b>Has revisado ${cola.length} elementos. Lo que no has resuelto sigue en el brief.</div></div><div class="modal__pie"><button type="button" class="btn btn--primario" data-rp="cerrar">Volver al brief</button></div></div>`;
        dlg.querySelector('[data-rp="cerrar"]').focus(); return;
      }
      const i = BA.get('items', cola[k]), ops = opcionesPosponer();
      dlg.innerHTML = `<div class="modal__form"><div class="modal__cab"><h2 id="rp-t">Repasar · ${k + 1} de ${cola.length}</h2><button type="button" class="btn btn--icono" data-rp="cerrar" aria-label="Cerrar el repaso">${U.ic('x')}</button></div>
        <div class="modal__cuerpo"><div class="repaso__barra" role="progressbar" aria-valuemin="0" aria-valuemax="${cola.length}" aria-valuenow="${k}"><i style="width:${k / cola.length * 100}%"></i></div>
        <div class="repaso__tarjeta"><p class="fila__meta">${U.fuente(i.fuente)}<span>${U.cuando(i.llegada)}</span>${i.vence ? `<span class="badge ${U.difDias(i.vence) <= 0 ? 'badge--hoy' : 'badge--sem'}">${U.venceTxt(i.vence)}</span>` : ''}<span class="chip">${GRUPO_TXT[i.grupo]}</span></p>
          <h3>${esc(i.titulo)}</h3><p class="suave">${esc(quien(i))}${i.proyecto ? ' · ' + esc(i.proyecto) : ''}</p><blockquote class="citado">${esc(i.extracto)}</blockquote></div>
        <div class="repaso__acc">
          <button type="button" class="btn btn--primario" data-rp="hecho">Hecho <kbd>H</kbd></button>
          <button type="button" class="btn btn--borde" data-rp="tarea">Hacer tarea <kbd>T</kbd></button>
          ${ops.map(([d], q) => `<button type="button" class="btn btn--borde" data-rp="posponer" data-d="${d}">${q === 0 && ops.length === 1 ? 'Posponer' : q === 0 ? 'A mañana' : 'Al laborable'} <kbd>${q === 0 ? 'P' : 'L'}</kbd></button>`).join('')}
          <button type="button" class="btn btn--borde" data-rp="descartar">Descartar <kbd>D</kbd></button>
          <button type="button" class="btn btn--borde" data-rp="saltar">Saltar <kbd>→</kbd></button></div>
        <p class="peq suave" style="margin-top:10px">Atajos de teclado: H, T, P, L, D y la flecha derecha.</p></div></div>`;
      dlg.querySelector('[data-rp="hecho"]').focus();
    };
    const accion = (a, d) => {
      const i = BA.get('items', cola[k]); if (!i) return;
      if (a === 'hecho') BA.parchear('items', i.id, { estado: 'hecho' });
      else if (a === 'descartar') BA.parchear('items', i.id, { estado: 'descartado' });
      else if (a === 'tarea') crearTarea(i);
      else if (a === 'posponer') BA.parchear('items', i.id, { posponerHasta: d });
      if (a !== 'saltar') hechos++;
      k++; pintar();
    };
    const cerrar = () => { if (dlg.open) dlg.close(); dlg.remove(); document.removeEventListener('keydown', teclas, true); BA.refrescar(); if (hechos) BA.toast(`Has resuelto ${hechos} de ${cola.length}.`); };
    const teclas = e => {
      if (!dlg.open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
      const m = { h: 'hecho', t: 'tarea', d: 'descartar', p: 'posponer', l: 'posponer', ArrowRight: 'saltar' }[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!m || k >= cola.length) return;
      const ops = opcionesPosponer(); let d = null;
      if (m === 'posponer') { d = e.key.toLowerCase() === 'l' ? ops[ops.length - 1][0] : ops[0][0]; }
      e.preventDefault(); accion(m, d);
    };
    document.addEventListener('keydown', teclas, true);
    dlg.addEventListener('click', e => { const b = e.target.closest('[data-rp]'); if (!b) return; if (b.dataset.rp === 'cerrar') cerrar(); else accion(b.dataset.rp, b.dataset.d); });
    dlg.addEventListener('cancel', e => { e.preventDefault(); cerrar(); });
    pintar(); dlg.showModal();
  };
})();
