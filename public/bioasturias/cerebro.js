/* BioAsturias · Panel — Cerebro: conversación simulada (las respuestas se calculan con los datos de ejemplo y citan sus fuentes) y dudas que el cerebro plantea a Mateo. */
'use strict';
(() => {
  const BA = window.BA, U = BA.U, esc = U.esc;
  const SUGERIDAS = ['¿Qué me queda por hacer hoy?', '¿Con quién hablé de la misión a México?', '¿Qué socios no han recibido nada este mes?', 'Resúmeme el mentoring'];
  const hist = [];
  let pensando = false;
  const PROY = [['Misión México', /m[eé]xico|misi[oó]n/], ['Mentoring científicos', /mentor/], ['Plan estratégico', /plan estrat|estrat[eé]gic/], ['Bioincubadora', /incubadora/], ['Rediseño web y marca', /redise|\bweb\b|marca|logo|branding/], ['Talento Bio', /talento/], ['Healthtech Madrid', /healthtech|madrid/], ['Facturación y cuotas', /factura|cuota|cobr|impag/], ['Asamblea', /asamblea/], ['Captación de socios', /captaci|nuevos socios|posible/]];

  const abierta = d => !d.respuesta || (d.respuesta === 'recordar' && d.recordarHasta && d.recordarHasta <= BA.hoyISO);
  BA.mod.cerebro = { dudasAbiertas: () => BA.lista('dudas').filter(abierta).length };

  // ---------- piezas de respuesta ----------
  const recorta = (t, n = 38) => t.length > n ? t.slice(0, n - 1) + '…' : t;
  const citaHtml = f => f.tipo === 'agenda' ? `<span class="cita">${U.ic('calendario', 'ic--sm')} Calendario · ${esc(recorta(f.txt))}</span>` : f.tipo === 'tareas' ? `<a class="cita" href="#/tareas">${U.ic('tareas', 'ic--sm')} Tareas · ${esc(recorta(f.txt))}</a>`
    : `<button type="button" class="cita" data-acc="${f.tipo === 'item' ? 'item-ver' : 'comm-ver'}" data-id="${esc(f.id)}">${U.ic(BA.FUENTES[f.fuente] ? BA.FUENTES[f.fuente][1] : 'otra', 'ic--sm')} ${esc(BA.FUENTES[f.fuente] ? BA.FUENTES[f.fuente][0] : f.fuente)} · ${esc(recorta(f.txt))}</button>`;
  const fItem = i => ({ tipo: 'item', id: i.id, fuente: i.fuente, txt: i.titulo });
  const fComm = m => ({ tipo: 'comm', id: m.id, fuente: m.fuente, txt: m.asunto });
  const nom = id => { const c = BA.contacto(id); return c ? BA.nombreC(c) : ''; };
  const ent = id => { const e = BA.entidad(id); return e ? e.nombre : ''; };
  const TIPO_COM = { 'correo-recibido': 'te escribió', 'correo-enviado': 'le escribiste', reunion: 'os reunisteis', llamada: 'hablasteis por teléfono', 'envio-masivo': 'le llegó un envío tuyo' };
  const diasDesde = t => Math.round((BA.hoy - U.dia(U.iso(new Date(t)))) / 864e5);

  function respHoy() {
    const act = BA.mod.brief.activos(), ag = BA.mod.brief.agendaHoy(), f = [];
    const vence = act.filter(i => i.vence && U.difDias(i.vence) <= 0).sort(BA.mod.brief.orden);
    const sr = act.filter(i => i.grupo === 'sin_responder' && !vence.includes(i)).sort(BA.mod.brief.orden);
    const tareas = BA.lista('tareas').filter(t => t.estado !== 'hecho' && t.fecha && t.fecha <= BA.hoyISO);
    if (!vence.length && !sr.length && !ag.length && !tareas.length) return { html: '<p>Hoy no te queda nada pendiente: ni plazos, ni correos sin contestar, ni reuniones. Buen día para avanzar en lo importante.</p>', f };
    let h = `<p>Esto es lo que veo para hoy, ${U.fechaLarga(BA.hoy)}:</p><ul>`;
    if (ag.length) { h += `<li><b>${U.plural(ag.length, 'reunión', 'reuniones')}</b>: ${ag.map(a => `${a.ini} ${esc(a.titulo)}`).join('; ')}.</li>`; ag.forEach(a => f.push({ tipo: 'agenda', txt: a.titulo })); }
    if (vence.length) { h += `<li><b>${vence.length} ${vence.length === 1 ? 'cosa vence' : 'cosas vencen'} hoy</b>: ${vence.map(i => esc(i.titulo)).join('; ')}.</li>`; vence.forEach(i => f.push(fItem(i))); }
    if (sr.length) { h += `<li><b>${U.plural(sr.length, 'correo sin responder', 'correos sin responder')}</b>: ${sr.slice(0, 4).map(i => `${esc(nom(i.contactoId) || i.externo)} (${esc(i.titulo.replace(/^Re:\s*/i, ''))})`).join('; ')}${sr.length > 4 ? ` y ${sr.length - 4} más` : ''}.</li>`; sr.slice(0, 4).forEach(i => f.push(fItem(i))); }
    if (tareas.length) { h += `<li><b>${U.plural(tareas.length, 'tarea con fecha de hoy o vencida', 'tareas con fecha de hoy o vencidas')}</b>: ${tareas.slice(0, 4).map(t => esc(t.titulo)).join('; ')}.</li>`; tareas.slice(0, 3).forEach(t => f.push({ tipo: 'tareas', txt: t.titulo })); }
    return { html: h + '</ul>', f };
  }
  function respQuien(proy) {
    const comms = BA.lista('comms').filter(m => m.proyecto === proy), items = BA.lista('items').filter(i => i.proyecto === proy && (i.contactoId || i.externo));
    const g = {};
    for (const m of comms) { const k = m.contactoId || m.entidadId; (g[k] = g[k] || { c: m.contactoId, e: m.entidadId, l: [] }).l.push({ t: m.fecha, m, tx: `${TIPO_COM[m.tipo]}: «${m.asunto}»` }); }
    for (const i of items) { const k = i.contactoId || i.externo; (g[k] = g[k] || { c: i.contactoId, e: i.entidadId, ex: i.externo, l: [] }).l.push({ t: i.llegada, i, tx: `${i.fuente === 'outlook' ? (i.dir === 'out' ? 'le escribiste' : 'te escribió') : 'novedad en ' + BA.FUENTES[i.fuente][0]}: «${i.titulo}»` }); }
    const l = Object.values(g).map(x => ({ ...x, l: x.l.sort((a, b) => b.t.localeCompare(a.t)) })).sort((a, b) => b.l[0].t.localeCompare(a.l[0].t));
    if (!l.length) return { html: `<p>No encuentro comunicaciones sobre «${esc(proy)}» en tus fuentes.</p>`, f: [] };
    const f = [];
    return { html: `<p>Sobre <b>${esc(proy)}</b> has tenido contacto con ${U.plural(l.length, 'persona', 'personas')}, de la más reciente a la más antigua:</p><ul>${l.map(x => { const u = x.l[0]; f.push(u.m ? fComm(u.m) : fItem(u.i));
      return `<li><b>${esc(x.c ? nom(x.c) : x.ex)}</b>${x.e ? ` (${esc(ent(x.e))})` : ''} · ${U.cuando(u.t)}: ${esc(u.tx)}${x.l.length > 1 ? ` <span class="suave">· ${x.l.length} mensajes en total</span>` : ''}</li>`; }).join('')}</ul>`, f };
  }
  function respResumen(proy) {
    const tareas = BA.lista('tareas').filter(t => t.proyecto === proy), items = BA.lista('items').filter(i => i.proyecto === proy && i.estado === 'abierto'), comms = BA.lista('comms').filter(m => m.proyecto === proy).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const cnt = k => tareas.filter(t => t.estado === k).length, f = [];
    const prox = items.filter(i => i.vence).sort((a, b) => a.vence.localeCompare(b.vence))[0];
    let h = `<p><b>${esc(proy)}</b>: ${U.plural(tareas.length, 'tarea', 'tareas')} (${cnt('porhacer')} por hacer, ${cnt('encurso')} en curso, ${cnt('hecho')} hechas) y ${U.plural(items.length, 'elemento abierto', 'elementos abiertos')} en tu brief.</p><ul>`;
    for (const t of tareas.filter(t => t.estado !== 'hecho').sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9')).slice(0, 4)) { h += `<li>Tarea: ${esc(t.titulo)}${t.fecha ? ` <span class="suave">(${U.diaCorto(U.dia(t.fecha))})</span>` : ''}</li>`; f.push({ tipo: 'tareas', txt: t.titulo }); }
    for (const i of items.slice(0, 4)) { h += `<li>${esc(i.titulo)} <span class="suave">· ${esc(nom(i.contactoId) || i.externo || ent(i.entidadId))}${i.vence ? ' · ' + U.venceTxt(i.vence).toLowerCase() : ''}</span></li>`; f.push(fItem(i)); }
    h += '</ul>';
    if (comms.length) { h += `<p>Lo último que consta: ${esc(comms[0].resumen)} <span class="suave">(${nom(comms[0].contactoId) || ent(comms[0].entidadId)}, ${U.cuando(comms[0].fecha)})</span></p>`; f.push(fComm(comms[0])); }
    if (prox) h += `<p><b>Lo más próximo:</b> ${esc(prox.titulo)} (${U.venceTxt(prox.vence).toLowerCase()}).</p>`;
    const gente = new Set([...comms.map(m => m.contactoId), ...items.map(i => i.contactoId)].filter(Boolean));
    if (gente.size) h += `<p class="suave">Personas implicadas: ${[...gente].map(nom).join(', ')}.</p>`;
    return { html: h, f };
  }
  function respSociosSin() {
    const socias = BA.lista('entidades').filter(e => e.cats.includes('Pleno derecho') || e.cats.includes('Adherido'));
    const salida = ['correo-enviado', 'envio-masivo', 'reunion', 'llamada'];
    const comms = BA.lista('comms').filter(m => salida.includes(m.tipo));
    const ultima = e => comms.filter(m => m.entidadId === e.id).sort((a, b) => b.fecha.localeCompare(a.fecha))[0];
    const sin = socias.map(e => ({ e, m: ultima(e) })).filter(x => !x.m || diasDesde(x.m.fecha) > 30).sort((a, b) => (a.m ? a.m.fecha : '').localeCompare(b.m ? b.m.fecha : ''));
    if (!sin.length) return { html: '<p>Todos los socios han recibido algo tuyo en los últimos 30 días.</p>', f: [] };
    const ids = sin.flatMap(x => BA.lista('contactos').filter(c => c.entidadId === x.e.id && c.principal).map(c => c.id));
    return { html: `<p>De ${socias.length} socios, <b>${sin.length}</b> no han recibido nada tuyo en los últimos 30 días (correo, envío, reunión o llamada):</p><ul>${sin.map(x => `<li><b>${esc(x.e.nombre)}</b> <span class="suave">(${x.e.cats.includes('Pleno derecho') ? 'pleno derecho' : 'adherido'}) · ${x.m ? `último contacto ${U.hace(x.m.fecha)}` : 'sin contacto registrado'}</span></li>`).join('')}</ul>
      <p><button type="button" class="btn btn--borde btn--sm" data-acc="cerebro-preparar" data-ids="${ids.join(',')}">Preparar un envío a sus contactos principales</button></p>`, f: sin.filter(x => x.m).slice(0, 5).map(x => fComm(x.m)) };
  }
  function respEsperando() {
    const l = BA.mod.brief.activos().filter(i => i.grupo === 'esperando').sort(BA.mod.brief.orden);
    if (!l.length) return { html: '<p>No estás esperando respuesta de nadie ahora mismo.</p>', f: [] };
    return { html: `<p>Esperas respuesta de ${U.plural(l.length, 'persona', 'personas')}:</p><ul>${l.map(i => `<li><b>${esc(nom(i.contactoId) || i.externo)}</b> · ${esc(i.titulo)} <span class="suave">(${U.hace(i.llegada)})</span></li>`).join('')}</ul>`, f: l.slice(0, 6).map(fItem) };
  }
  function respSinResponder() {
    const l = BA.mod.brief.activos().filter(i => i.grupo === 'sin_responder').sort(BA.mod.brief.orden);
    if (!l.length) return { html: '<p>No tienes correos pendientes de contestar.</p>', f: [] };
    return { html: `<p>Tienes ${U.plural(l.length, 'correo sin responder', 'correos sin responder')}, aunque algunos los marcaras como leídos:</p><ul>${l.map(i => `<li><b>${esc(nom(i.contactoId) || i.externo)}</b> · ${esc(i.titulo)} <span class="suave">(${U.hace(i.llegada)})</span></li>`).join('')}</ul>`, f: l.slice(0, 6).map(fItem) };
  }
  function respFacturas() {
    const l = BA.lista('items').filter(i => i.fuente === 'odoo' && i.estado === 'abierto' && i.nivel <= ({ tranquilo: 0, normal: 2, cargado: 3 })[BA.ui('modo', 'normal')]);
    if (!l.length) return { html: '<p>No veo novedades de facturación ahora mismo en Odoo.</p>', f: [] };
    return { html: `<p>Novedades de facturación en Odoo:</p><ul>${l.map(i => `<li>${esc(i.titulo)} <span class="suave">· ${i.meta.filter(m => ['Importe', 'Estado'].includes(m[0])).map(m => m[1]).join(' · ')}</span></li>`).join('')}</ul>`, f: l.map(fItem) };
  }
  function respEntidad(e) {
    const cs = BA.lista('contactos').filter(c => c.entidadId === e.id), comms = BA.lista('comms').filter(m => m.entidadId === e.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
    const its = BA.mod.brief.activos().filter(i => i.entidadId === e.id);
    const f = [...comms.slice(0, 2).map(fComm), ...its.map(fItem)];
    return { html: `<p><b>${esc(e.nombre)}</b> (${esc(e.tipo)}, ${esc(e.ciudad)}) · ${e.cats.map(esc).join(', ')}. Tiene ${U.plural(cs.length, 'contacto', 'contactos')}: ${cs.map(c => esc(BA.nombreC(c)) + (c.principal ? ' ★' : '')).join(', ')}.</p>
      ${comms.length ? `<p>Última comunicación: ${U.cuando(comms[0].fecha)}, «${esc(comms[0].asunto)}». En total ${comms.length} registros en el historial.</p>` : '<p>No hay comunicaciones registradas.</p>'}
      ${its.length ? `<p><b>Pendiente:</b> ${its.map(i => esc(i.titulo)).join('; ')}.</p>` : '<p>Nada pendiente con esta entidad.</p>'}<p><a href="#/crm/e/${esc(e.id)}">Abrir su ficha en el CRM</a></p>`, f };
  }
  function respContacto(c) {
    const comms = BA.lista('comms').filter(m => m.contactoId === c.id).sort((a, b) => b.fecha.localeCompare(a.fecha)), its = BA.mod.brief.activos().filter(i => i.contactoId === c.id);
    return { html: `<p><b>${esc(BA.nombreC(c))}</b>${c.cargo ? ', ' + esc(c.cargo) : ''}, ${esc(ent(c.entidadId))}. ${comms.length ? `Último contacto: ${U.cuando(comms[0].fecha)} («${esc(comms[0].asunto)}»); ${comms.length} registros en total.` : 'Sin comunicaciones registradas.'}</p>
      ${its.length ? `<p><b>Pendiente:</b> ${its.map(i => esc(i.titulo)).join('; ')}.</p>` : ''}<p><a href="#/crm/c/${esc(c.id)}">Abrir su ficha</a></p>`, f: [...comms.slice(0, 2).map(fComm), ...its.map(fItem)] };
  }
  function busqueda(q) {
    const pal = U.norm(q).split(/\W+/).filter(w => w.length > 3 && !['sobre', 'tengo', 'quien', 'cuando', 'donde', 'tiene', 'hablamos', 'sido'].includes(w));
    if (!pal.length) return null;
    const pt = o => pal.filter(w => U.norm(o).includes(w)).length;
    const r = [...BA.lista('items').map(i => ({ s: pt(i.titulo + ' ' + i.extracto), f: fItem(i), t: i.titulo, w: i.llegada })), ...BA.lista('comms').map(m => ({ s: pt(m.asunto + ' ' + m.resumen), f: fComm(m), t: m.asunto, w: m.fecha }))].filter(x => x.s > 0).sort((a, b) => b.s - a.s || b.w.localeCompare(a.w)).slice(0, 5);
    return r.length ? { html: `<p>No sé responderte exactamente a eso, pero esto es lo más relacionado que encuentro:</p><ul>${r.map(x => `<li>${esc(x.t)} <span class="suave">· ${U.cuando(x.w)}</span></li>`).join('')}</ul>`, f: r.map(x => x.f) } : null;
  }
  function responder(q) {
    const n = U.norm(q);
    if (/no han recibido|sin recibir|sin contacto|no les he escrito|no hemos escrito|descuidad/.test(n) && /socio/.test(n)) return respSociosSin();
    if (/\bhoy\b|queda|por hacer|pendiente.*(hoy|dia)/.test(n) && !/mentor|mexico|plan|incubadora/.test(n)) return respHoy();
    if (/esperando|no (me )?han (contestado|respondido)|sin respuesta/.test(n)) return respEsperando();
    if (/sin responder|sin contestar|olvid|no (he )?(contestado|respondido)/.test(n)) return respSinResponder();
    const p = PROY.find(([, re]) => re.test(n));
    if (p && /factura|cuota|cobr|impag/.test(n) && p[0] === 'Facturación y cuotas') return respFacturas();
    if (p) return /(con )?qui[eé]n|hable|hablado|hablamos|contacto|personas|participa/.test(n) ? respQuien(p[0]) : respResumen(p[0]);
    const e = BA.lista('entidades').find(e => U.norm(e.nombre).split(/[^a-z0-9ñ]+/).filter(w => w.length > 4 && !['universidad', 'fundacion', 'agencia', 'centro', 'instituto', 'ayuntamiento'].includes(w)).some(w => n.includes(w)));
    if (e) return respEntidad(e);
    const c = BA.lista('contactos').find(c => { const nn = U.norm(c.nombre + ' ' + c.apellidos.split(' ')[0]); return n.includes(U.norm(c.nombre)) && n.includes(U.norm(c.apellidos.split(' ')[0])) || nn.length > 12 && n.includes(nn); });
    if (c) return respContacto(c);
    return busqueda(q) || { html: '<p>No he encontrado nada sobre eso en tus fuentes de ejemplo. Prueba con un proyecto (mentoring, México, plan estratégico), una entidad o con «¿qué me queda hoy?».</p>', f: [] };
  }

  // ---------- chat ----------
  const pintaChat = () => hist.map(m => m.rol === 'yo' ? `<div class="burbuja burbuja--yo">${esc(m.txt)}</div>`
    : `<div class="burbuja burbuja--ia"><div>${m.html}</div>${m.f && m.f.length ? `<div class="fuentes-cita"><span class="peq suave">Fuentes:</span>${m.f.filter((x, i, a) => a.findIndex(y => y.id === x.id && y.txt === x.txt) === i).slice(0, 8).map(citaHtml).join('')}</div>` : ''}</div>`).join('')
    + (pensando ? '<div class="burbuja burbuja--ia" role="status"><span class="pensando">Buscando en tus fuentes</span></div>' : '');
  function repintaChat() { const c = U.$('#chat'); if (!c) return; c.innerHTML = pintaChat(); const u = c.lastElementChild; if (u) u.scrollIntoView({ block: 'nearest' }); }
  function preguntar(q) {
    q = q.trim(); if (!q || pensando) return;
    hist.push({ rol: 'yo', txt: q }); pensando = true; repintaChat();
    setTimeout(() => { let r; try { r = responder(q); } catch (e) { r = { html: '<p>Algo ha fallado al buscar. Prueba de nuevo.</p>', f: [] }; } hist.push({ rol: 'ia', ...r }); pensando = false; repintaChat(); }, 650);
  }
  BA.acc['cerebro-sugerida'] = el => preguntar(el.dataset.q);
  BA.acc['cerebro-enviar'] = f => { const i = U.$('#cerebro-q'); preguntar(i.value); i.value = ''; i.focus(); };
  BA.acc['cerebro-limpiar'] = () => { hist.length = 0; BA.refrescar(); };
  BA.acc['cerebro-preparar'] = el => { BA.mod.envios.preparar(el.dataset.ids.split(','), BA.filtro.nuevo()); BA.irA('#/envios'); };

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

  function render() {
    const dudas = BA.lista('dudas');
    return `<div class="cab-pagina"><div><h1>Cerebro</h1><p>Pregúntale lo que quieras sobre tus correos, documentos, facturas y reuniones. Responde con tus datos y te dice de dónde sale cada cosa.</p></div>
      ${hist.length ? '<button type="button" class="btn btn--borde btn--sm" data-acc="cerebro-limpiar">Empezar de nuevo</button>' : ''}</div>
      <div class="aviso aviso--info" role="note">En este prototipo las respuestas se calculan con datos de ejemplo y un conjunto de preguntas que ya entiende; con tus fuentes conectadas respondería a preguntas libres.</div>
      <div class="cuadro-ficha" style="grid-template-columns:minmax(0,1fr) 360px"><section aria-label="Conversación">
        <div class="sugeridas" role="group" aria-label="Preguntas sugeridas">${SUGERIDAS.map(q => `<button type="button" class="btn btn--borde btn--sm" data-acc="cerebro-sugerida" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <div class="chat" id="chat" aria-live="polite">${pintaChat() || '<div class="vacio"><b>Empieza con una pregunta</b>Prueba con una de las sugeridas o escribe la tuya.</div>'}</div>
        <form class="entrada-chat" data-sub="cerebro-enviar"><label class="solo-lectores" for="cerebro-q">Tu pregunta</label><input id="cerebro-q" type="text" placeholder="Pregunta algo… (p. ej. «¿Qué hay pendiente con Vitalia?»)" autocomplete="off"><button type="submit" class="btn btn--primario">Preguntar</button></form></section>
      <section aria-label="Dudas del cerebro"><h2>Dudas del cerebro</h2><p class="peq suave">Cosas que el cerebro no ha podido deducir y te pregunta para no dejar nada al aire.</p>
        ${dudas.map(dudaHtml).join('') || '<div class="vacio">Sin dudas por ahora.</div>'}</section></div>`;
  }
  BA.rutas.cerebro = { titulo: 'Cerebro', render };
})();
