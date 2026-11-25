/* BioAsturias · Panel — CRM: entidades con varios contactos, categorías libres, filtros Y/O, fichas con historial y contactos detectados. */
'use strict';
(() => {
  const BA = window.BA, U = BA.U, esc = U.esc;
  const crm = { vista: 'contactos', formato: 'tabla', q: '', f: BA.filtro.nuevo(), verTodasCom: false, filtroCom: '' };
  BA.filtros.crm = { f: crm.f, alCambiar: () => BA.refrescar() };
  const TIPOS_COM = { 'correo-recibido': ['Correo recibido', 'outlook', ''], 'correo-enviado': ['Correo enviado', 'enviado', 't-enviado'], reunion: ['Reunión', 'reunion', 't-reunion'], llamada: ['Llamada', 'llamada', 't-reunion'], 'envio-masivo': ['Envío personalizado', 'masivo', 't-masivo'] };
  const hechosDet = () => BA.S.ui.detectadosHechos || [];

  // última comunicación por contacto y por entidad
  function ultimas() {
    const c = {}, e = {};
    for (const m of BA.lista('comms')) { if (m.contactoId && (!c[m.contactoId] || m.fecha > c[m.contactoId])) c[m.contactoId] = m.fecha; if (m.entidadId && (!e[m.entidadId] || m.fecha > e[m.entidadId])) e[m.entidadId] = m.fecha; }
    return { c, e };
  }
  const fechaUlt = t => t ? U.cuando(t) : '—';
  const nombreLink = c => `<button type="button" class="enlace-nombre" data-acc="ir-contacto" data-id="${esc(c.id)}">${c.principal ? `<span class="estrella on" title="Contacto principal" aria-label="Principal">★</span> ` : ''}${esc(BA.nombreC(c))}</button>`;
  const entLink = e => e ? `<button type="button" class="enlace-nombre" data-acc="ir-entidad" data-id="${esc(e.id)}">${esc(e.nombre)}</button>` : '—';

  // ---------- listado ----------
  function resultados() {
    const q = crm.q.trim(), todos = BA.lista('contactos');
    const ok = todos.filter(c => BA.filtro.coincide(c, crm.f, q));
    const ult = ultimas();
    if (crm.vista === 'contactos') {
      if (!ok.length) return `<div class="vacio"><b>Ningún contacto cumple el filtro</b>Prueba a quitar alguna condición o a cambiar la búsqueda.</div>`;
      ok.sort((a, b) => BA.nombreC(a).localeCompare(BA.nombreC(b), 'es'));
      if (crm.formato === 'fichas') return `<div class="fichas">${ok.map(c => { const e = BA.entidad(c.entidadId); return `<article class="ficha-mini"><h3>${nombreLink(c)}</h3><span class="peq suave">${esc(c.cargo || 'Sin cargo indicado')}</span><span class="peq">${entLink(e)}</span>
        <span class="peq suave">${esc(c.email)}</span><div class="celda-cats">${BA.chipsCats(BA.catsDe(c))}</div><span class="peq suave">Última comunicación: ${fechaUlt(ult.c[c.id])}</span></article>`; }).join('')}</div>`;
      return `<div class="tabla-wrap"><table class="tabla"><thead><tr><th scope="col">Nombre</th><th scope="col">Entidad</th><th scope="col">Cargo</th><th scope="col">Correo</th><th scope="col">Categorías</th><th scope="col">Última com.</th></tr></thead><tbody>
        ${ok.map(c => `<tr><td>${nombreLink(c)}</td><td>${entLink(BA.entidad(c.entidadId))}</td><td>${esc(c.cargo || '—')}</td><td>${esc(c.email)}</td><td><div class="celda-cats">${BA.chipsCats(BA.catsDe(c))}</div></td><td>${fechaUlt(ult.c[c.id])}</td></tr>`).join('')}</tbody></table></div>`;
    }
    const porEnt = {}; ok.forEach(c => (porEnt[c.entidadId] = porEnt[c.entidadId] || []).push(c));
    const ents = BA.lista('entidades').filter(e => porEnt[e.id]).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!ents.length) return `<div class="vacio"><b>Ninguna entidad cumple el filtro</b>Prueba a quitar alguna condición o a cambiar la búsqueda.</div>`;
    const tot = e => BA.lista('contactos').filter(c => c.entidadId === e.id);
    if (crm.formato === 'fichas') return `<div class="fichas">${ents.map(e => `<article class="ficha-mini"><h3>${entLink(e)}</h3><span class="peq suave">${esc(e.tipo)} · ${esc(e.ciudad)}</span><div class="celda-cats">${BA.chipsCats(e.cats)}</div>
      <span class="peq">${U.plural(porEnt[e.id].length, 'contacto', 'contactos')} (de ${tot(e).length})</span><span class="peq suave">${porEnt[e.id].slice(0, 3).map(c => esc(BA.nombreC(c))).join(', ')}${porEnt[e.id].length > 3 ? '…' : ''}</span><span class="peq suave">Última comunicación: ${fechaUlt(ult.e[e.id])}</span></article>`).join('')}</div>`;
    return `<div class="tabla-wrap"><table class="tabla"><thead><tr><th scope="col">Entidad</th><th scope="col">Tipo</th><th scope="col">Ciudad</th><th scope="col">Categorías</th><th scope="col" class="num">Contactos</th><th scope="col">Principales</th><th scope="col">Última com.</th></tr></thead><tbody>
      ${ents.map(e => `<tr><td>${entLink(e)}</td><td>${esc(e.tipo)}</td><td>${esc(e.ciudad)}</td><td><div class="celda-cats">${BA.chipsCats(e.cats)}</div></td><td class="num">${porEnt[e.id].length}/${tot(e).length}</td><td>${tot(e).filter(c => c.principal).map(c => esc(BA.nombreC(c))).join(', ') || '—'}</td><td>${fechaUlt(ult.e[e.id])}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function cuentaTxt() {
    const ok = BA.lista('contactos').filter(c => BA.filtro.coincide(c, crm.f, crm.q.trim()));
    return `${U.plural(ok.length, 'contacto', 'contactos')} de ${BA.lista('contactos').length} · ${BA.filtro.resumen(crm.f)}`;
  }
  function detectadosHtml() {
    const l = BA.lista('detectados').filter(d => !hechosDet().includes(d.id));
    if (!l.length) return '';
    return `<details class="grupo" open><summary><span>Contactos detectados en tu correo</span><span class="cuenta">${l.length}</span><small>Personas que aparecen en tus mensajes y aún no están en el CRM</small></summary>
      <div class="plegable-pie">${l.map(d => { const e = d.entidadSugerida ? BA.entidad(d.entidadSugerida) : null; return `<div class="detectado"><div><b>${esc(d.nombre)} ${esc(d.apellidos)}</b> <span class="suave">· ${esc(d.cargo)}</span><br><span class="peq">${esc(d.email)}</span><br>
        <span class="peq">Entidad sugerida: ${e ? `<b>${esc(e.nombre)}</b>` : `<b>${esc(d.entidadNueva)}</b> <span class="chip">Entidad nueva</span>`}</span><div class="celda-cats" style="margin:4px 0">${BA.chipsCats(d.cats)}</div><span class="peq suave">${esc(d.origen)}</span></div>
        <div class="acciones" style="align-self:center"><button type="button" class="btn btn--primario btn--sm" data-acc="det-aceptar" data-id="${esc(d.id)}">Aceptar</button><button type="button" class="btn btn--borde btn--sm" data-acc="det-editar" data-id="${esc(d.id)}">Editar</button><button type="button" class="btn btn--borde btn--sm" data-acc="det-descartar" data-id="${esc(d.id)}" aria-label="Descartar a ${esc(d.nombre)} ${esc(d.apellidos)}">Descartar</button></div></div>`; }).join('')}</div></details>`;
  }
  function renderLista() {
    const sync = BA.ui('odooSync', '');
    return `<div class="cab-pagina"><div><h1>CRM</h1><p>Tus contactos: las <b>entidades</b> (empresas socias, universidades, instituciones) y las <b>personas</b> de cada una, con sus categorías y el historial de lo que habéis hablado. Es la base de datos de la que salen los envíos.</p></div>
      <div class="acciones"><button type="button" class="btn btn--primario" data-acc="contacto-nuevo">${U.ic('mas2', 'ic--sm')} Nuevo contacto</button><button type="button" class="btn btn--borde" data-acc="entidad-nueva">Nueva entidad</button><button type="button" class="btn btn--borde" data-acc="etiquetas">Gestionar etiquetas</button></div></div>
      <div class="odoo-sync" role="note">${U.ic('odoo')}<div><b>Importado de Odoo (Contactos)</b><span class="peq suave">Entidades y personas vienen de Odoo; el panel añade las categorías, el contacto principal y el historial. ${sync ? 'Última sincronización: ' + esc(sync) + '.' : 'Última sincronización: hoy a las 06:00.'} Prototipo: datos de ejemplo.</span></div><button type="button" class="btn btn--borde btn--sm" data-acc="odoo-sync">Sincronizar con Odoo</button></div>
      ${detectadosHtml()}
      <div class="barra-crm"><div class="buscador"><label class="solo-lectores" for="crm-q">Buscar contactos y entidades</label>${U.ic('buscar')}<input id="crm-q" type="search" placeholder="Buscar por nombre, cargo, correo o entidad" value="${esc(crm.q)}" data-inp="crm-q" autocomplete="off"></div>
        <div class="conmutador" role="group" aria-label="Qué mostrar">${[['contactos', 'Contactos'], ['entidades', 'Entidades']].map(([k, t]) => `<button type="button" data-acc="crm-vista" data-k="${k}" aria-pressed="${crm.vista === k}">${t}</button>`).join('')}</div>
        <div class="conmutador" role="group" aria-label="Formato">${[['tabla', 'Tabla'], ['fichas', 'Fichas']].map(([k, t]) => `<button type="button" data-acc="crm-formato" data-k="${k}" aria-pressed="${crm.formato === k}">${t}</button>`).join('')}</div></div>
      ${BA.filtro.html('crm')}
      <p class="peq suave" id="crm-cuenta" aria-live="polite">${cuentaTxt()}</p>
      <div id="crm-res">${resultados()}</div>
      <div class="acciones" style="margin-top:14px"><button type="button" class="btn btn--borde" data-acc="crm-enviar">${U.ic('envios', 'ic--sm')} Enviar un correo personalizado a este filtro</button></div>`;
  }
  BA.inp['crm-q'] = el => { crm.q = el.value; U.$('#crm-res').innerHTML = resultados(); U.$('#crm-cuenta').textContent = cuentaTxt(); };
  BA.acc['crm-vista'] = el => { crm.vista = el.dataset.k; BA.refrescar(); };
  BA.acc['crm-formato'] = el => { crm.formato = el.dataset.k; BA.refrescar(); };
  BA.acc['crm-enviar'] = () => { const ids = BA.lista('contactos').filter(c => BA.filtro.coincide(c, crm.f, crm.q.trim())).map(c => c.id); BA.mod.envios.preparar(ids, JSON.parse(JSON.stringify(crm.f))); BA.irA('#/envios'); };

  // ---------- fichas ----------
  function historial(coms) {
    const l = coms.slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    const f = crm.filtroCom ? l.filter(m => m.tipo === crm.filtroCom) : l, ver = crm.verTodasCom ? f : f.slice(0, 12);
    return `<div class="acciones" style="margin-bottom:10px"><label class="peq" for="hc-f">Mostrar</label><select id="hc-f" data-chg="crm-filtro-com" style="width:auto;min-height:34px"><option value="">Todo</option>${Object.entries(TIPOS_COM).map(([k, v]) => `<option value="${k}"${crm.filtroCom === k ? ' selected' : ''}>${v[0]}</option>`).join('')}</select></div>
      ${ver.length ? `<ol class="timeline">${ver.map(m => { const t = TIPOS_COM[m.tipo], c = m.contactoId && BA.contacto(m.contactoId);
        return `<li class="${t[2]}"><button type="button" data-acc="comm-ver" data-id="${esc(m.id)}"><span class="peq suave">${U.fuente(m.fuente)} · ${t[0]} · ${U.fechaCompleta(m.fecha)}</span><span class="t-t">${esc(m.asunto)}</span><span class="peq suave">${c ? esc(BA.nombreC(c)) + ' · ' : ''}${esc(m.resumen.length > 90 ? m.resumen.slice(0, 88) + '…' : m.resumen)}</span></button></li>`; }).join('')}</ol>
        ${f.length > 12 && !crm.verTodasCom ? `<button type="button" class="btn btn--borde btn--sm" data-acc="crm-ver-todas">Ver las ${f.length} comunicaciones</button>` : ''}` : '<p class="suave">Sin comunicaciones registradas.</p>'}`;
  }
  BA.chg['crm-filtro-com'] = el => { crm.filtroCom = el.value; BA.refrescar(); };
  BA.acc['crm-ver-todas'] = () => { crm.verTodasCom = true; BA.refrescar(); };
  function pendientes(ents, contacto) {
    const items = BA.mod.brief.activos().filter(i => contacto ? i.contactoId === contacto : ents.includes(i.entidadId));
    const its = BA.lista('items').filter(i => (contacto ? i.contactoId === contacto : ents.includes(i.entidadId)));
    const tareas = BA.lista('tareas').filter(t => t.estado !== 'hecho' && t.origenId && its.some(i => i.id === t.origenId));
    if (!items.length && !tareas.length) return '<p class="suave">Nada pendiente con esta ficha.</p>';
    return `<ul class="lista-simple">${items.map(i => `<li><button type="button" class="fila__main" data-acc="item-ver" data-id="${esc(i.id)}"><span class="fila__meta">${U.fuente(i.fuente)}<span>${U.cuando(i.llegada)}</span></span><span class="fila__t">${esc(i.titulo)}</span></button></li>`).join('')}
      ${tareas.map(t => `<li><a href="#/tareas"><b>Tarea:</b> ${esc(t.titulo)}</a><span class="peq suave">${t.fecha ? U.diaCorto(U.dia(t.fecha)) : ''}</span></li>`).join('')}</ul>`;
  }
  function catsEditables(obj, col) {
    const todas = BA.categorias().filter(c => !obj.cats.includes(c.nombre));
    return `<div class="celda-cats" style="margin:6px 0">${obj.cats.map(c => BA.chipCat(c, `<button type="button" data-acc="cat-quitar" data-col="${col}" data-id="${esc(obj.id)}" data-c="${esc(c)}" aria-label="Quitar la categoría ${esc(c)}">×</button>`)).join('') || '<span class="peq suave">Sin categorías propias</span>'}
      <select data-chg="cat-poner" data-col="${col}" data-id="${esc(obj.id)}" aria-label="Añadir categoría" style="width:auto;min-height:30px;font-size:.84rem"><option value="">+ categoría</option>${todas.map(c => `<option>${esc(c.nombre)}</option>`).join('')}</select></div>`;
  }
  BA.acc['cat-quitar'] = el => { const o = BA.get(el.dataset.col, el.dataset.id); BA.parchear(el.dataset.col, o.id, { cats: o.cats.filter(c => c !== el.dataset.c) }); BA.refrescar(); };
  BA.chg['cat-poner'] = el => { if (!el.value) return; const o = BA.get(el.dataset.col, el.dataset.id); BA.parchear(el.dataset.col, o.id, { cats: [...o.cats, el.value] }); BA.refrescar(); };

  function fichaEntidad(id) {
    const e = BA.entidad(id); if (!e) return noExiste();
    const cs = BA.lista('contactos').filter(c => c.entidadId === id), coms = BA.lista('comms').filter(m => m.entidadId === id);
    return `<p><a href="#/crm">← Volver al CRM</a></p>
      <div class="cab-pagina"><div><h1>${esc(e.nombre)}</h1><p>${esc(e.tipo)} · ${esc(e.ciudad)} · ${esc(e.web)}</p></div>
        <div class="acciones"><button type="button" class="btn btn--borde" data-acc="entidad-editar" data-id="${esc(id)}">Editar entidad</button><button type="button" class="btn btn--primario" data-acc="contacto-nuevo" data-ent="${esc(id)}">${U.ic('mas2', 'ic--sm')} Nuevo contacto</button>
          <button type="button" class="btn btn--borde" data-acc="enviar-a" data-ids="${cs.map(c => c.id).join(',')}">${U.ic('envios', 'ic--sm')} Escribirles</button></div></div>
      <div class="cuadro-ficha"><div>
        <section class="tarjeta" style="margin-bottom:14px"><h2>Categorías de la entidad</h2>${catsEditables(e, 'entidades')}<p class="peq suave">Los contactos heredan estas categorías y pueden tener las suyas.</p>${e.notas ? `<p>${esc(e.notas)}</p>` : ''}</section>
        <section class="tarjeta"><h2>Contactos (${cs.length})</h2><div class="tabla-wrap"><table class="tabla"><thead><tr><th scope="col">Principal</th><th scope="col">Nombre</th><th scope="col">Cargo</th><th scope="col">Correo</th><th scope="col">Categorías propias</th></tr></thead><tbody>
          ${cs.map(c => `<tr><td><button type="button" class="btn btn--icono" data-acc="principal" data-id="${esc(c.id)}" aria-pressed="${c.principal}" aria-label="${c.principal ? 'Quitar de principales a' : 'Marcar como principal a'} ${esc(BA.nombreC(c))}"><svg class="ic estrella ${c.principal ? 'on' : ''}"><use href="#i-estrella"/></svg></button></td><td>${nombreLink(c).replace('<span class="estrella on" title="Contacto principal" aria-label="Principal">★</span> ', '')}</td><td>${esc(c.cargo || '—')}</td><td>${esc(c.email)}</td><td><div class="celda-cats">${BA.chipsCats(c.cats) || '—'}</div></td></tr>`).join('')}</tbody></table></div></section>
      </div><div>
        <section class="tarjeta" style="margin-bottom:14px"><h2>Pendientes asociados</h2>${pendientes([id], null)}</section>
        <section class="tarjeta"><h2>Historial de comunicaciones</h2>${historial(coms)}</section></div></div>`;
  }
  function fichaContacto(id) {
    const c = BA.contacto(id); if (!c) return noExiste();
    const e = BA.entidad(c.entidadId), coms = BA.lista('comms').filter(m => m.contactoId === id);
    return `<p><a href="#/crm">← Volver al CRM</a> · <a href="#/crm/e/${esc(e.id)}">${esc(e.nombre)}</a></p>
      <div class="cab-pagina"><div><h1>${esc(BA.nombreC(c))}</h1><p>${esc(c.cargo || 'Sin cargo indicado')} · ${entLink(e)}</p></div>
        <div class="acciones"><button type="button" class="btn btn--borde" data-acc="contacto-editar" data-id="${esc(id)}">Editar contacto</button><button type="button" class="btn btn--primario" data-acc="enviar-a" data-ids="${esc(id)}">${U.ic('envios', 'ic--sm')} Escribirle</button></div></div>
      <div class="cuadro-ficha"><div>
        <section class="tarjeta" style="margin-bottom:14px"><h2>Datos</h2><dl class="meta-lista"><dt>Correo</dt><dd>${esc(c.email)}</dd><dt>Teléfono</dt><dd>${esc(c.tel || '—')}</dd><dt>Entidad</dt><dd>${entLink(e)}</dd>
          <dt>Principal</dt><dd><button type="button" class="btn btn--borde btn--sm" data-acc="principal" data-id="${esc(id)}" aria-pressed="${c.principal}">${c.principal ? '★ Es contacto principal (quitar)' : '☆ Marcar como principal'}</button></dd></dl></section>
        <section class="tarjeta"><h2>Categorías</h2><p class="peq suave" style="margin:0">Propias de la persona</p>${catsEditables(c, 'contactos')}<p class="peq suave" style="margin:8px 0 0">Heredadas de ${esc(e.nombre)}</p><div class="celda-cats">${BA.chipsCats(e.cats)}</div></section>
      </div><div>
        <section class="tarjeta" style="margin-bottom:14px"><h2>Pendientes asociados</h2>${pendientes([], id)}</section>
        <section class="tarjeta"><h2>Historial de comunicaciones</h2>${historial(coms)}</section></div></div>`;
  }
  const noExiste = () => `<div class="vacio"><b>No encontramos esa ficha</b><a href="#/crm">Volver al CRM</a></div>`;
  BA.acc['odoo-sync'] = () => { BA.setUi('odooSync', 'hoy a las ' + U.hora(new Date())); BA.refrescar(); BA.toast('Sincronización con Odoo simulada: sin cambios.'); };
  BA.rutas.crm = { titulo: 'CRM', render: a => { crm.verTodasCom = a[0] ? crm.verTodasCom : false; return a[0] === 'e' ? fichaEntidad(a[1]) : a[0] === 'c' ? fichaContacto(a[1]) : renderLista(); } };
  BA.acc.principal = el => { const c = BA.contacto(el.dataset.id); BA.parchear('contactos', c.id, { principal: !c.principal }); BA.refrescar(); BA.toast(c.principal ? `${c.nombre} ya no es contacto principal.` : `${c.nombre} es ahora contacto principal.`); };
  BA.acc['enviar-a'] = el => { BA.mod.envios.preparar(el.dataset.ids.split(','), BA.filtro.nuevo()); BA.irA('#/envios'); };

  // ---------- formularios ----------
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function formContacto(c, entId) {
    const ents = BA.lista('entidades').slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return `<div class="rejilla-2"><div class="campo"><label for="cf-n">Nombre</label><input id="cf-n" name="nombre" type="text" required value="${esc(c.nombre || '')}"></div><div class="campo"><label for="cf-a">Apellidos</label><input id="cf-a" name="apellidos" type="text" value="${esc(c.apellidos || '')}"></div></div>
      <div class="rejilla-2"><div class="campo"><label for="cf-c">Cargo</label><input id="cf-c" name="cargo" type="text" value="${esc(c.cargo || '')}"></div><div class="campo"><label for="cf-t">Teléfono</label><input id="cf-t" name="tel" type="tel" value="${esc(c.tel || '')}"></div></div>
      <div class="campo"><label for="cf-e">Correo</label><input id="cf-e" name="email" type="email" required value="${esc(c.email || '')}"></div>
      <div class="rejilla-2"><div class="campo"><label for="cf-ent">Entidad</label><select id="cf-ent" name="entidad"><option value="">— Entidad nueva —</option>${ents.map(e => `<option value="${esc(e.id)}"${(entId || c.entidadId) === e.id ? ' selected' : ''}>${esc(e.nombre)}</option>`).join('')}</select></div>
      <div class="campo"><label for="cf-en">Nombre de la entidad nueva</label><input id="cf-en" name="entidadNueva" type="text" value="${esc(c.entidadNueva || '')}" placeholder="Solo si eliges «Entidad nueva»"></div></div>
      <label class="lab-check"><input type="checkbox" name="principal"${c.principal ? ' checked' : ''}> Contacto principal de su entidad</label>
      <div class="campo" style="margin-top:8px"><span class="etq">Categorías propias</span>${BA.htmlCats(c.cats || [])}</div>`;
  }
  const validaContacto = fd => !fd.get('nombre').trim() ? 'Escribe el nombre.' : !EMAIL.test(fd.get('email').trim()) ? 'El correo no parece válido.' : (!fd.get('entidad') && !fd.get('entidadNueva').trim()) ? 'Elige una entidad o escribe el nombre de una nueva.' : null;
  function guardarContacto(fd, id) {
    let entId = fd.get('entidad');
    if (!entId) { const n = fd.get('entidadNueva').trim(); const ya = BA.lista('entidades').find(e => U.norm(e.nombre) === U.norm(n)); entId = ya ? ya.id : BA.nuevo('entidades', { id: U.uid('e-'), nombre: n, tipo: 'Empresa', ciudad: '', web: '', dominio: '', cats: fd.getAll('cats').filter(c => BA.grupoCat(c) === 'tipo'), notas: '' }).id; }
    const d = { nombre: fd.get('nombre').trim(), apellidos: fd.get('apellidos').trim(), cargo: fd.get('cargo').trim(), tel: fd.get('tel').trim(), email: fd.get('email').trim(), entidadId: entId, principal: !!fd.get('principal'), cats: fd.getAll('cats') };
    if (id) { BA.parchear('contactos', id, d); return id; }
    return BA.nuevo('contactos', { id: U.uid('c'), ...d }).id;
  }
  BA.acc['contacto-nuevo'] = async el => {
    const r = await BA.dialogo({ titulo: 'Nuevo contacto', ancho: true, ok: 'Crear contacto', validar: validaContacto, html: formContacto({}, el.dataset.ent) }); if (!r) return;
    const id = guardarContacto(r.fd); BA.toast('Contacto creado.'); BA.irA('#/crm/c/' + id);
  };
  BA.acc['contacto-editar'] = async el => {
    const c = BA.contacto(el.dataset.id);
    const r = await BA.dialogo({ titulo: 'Editar contacto', ancho: true, ok: 'Guardar', validar: validaContacto, botones: [{ t: 'Borrar contacto', valor: 'borrar', clase: 'btn--peligro' }], html: formContacto(c) }); if (!r) return;
    if (r.accion === 'borrar') { if (!(await BA.confirmar('Borrar contacto', `¿Borrar a ${esc(BA.nombreC(c))}? Su historial se conserva en la entidad.`, 'Borrar'))) return; BA.borrar('contactos', c.id); BA.toast('Contacto borrado.'); BA.irA('#/crm/e/' + c.entidadId); return; }
    guardarContacto(r.fd, c.id); BA.refrescar(); BA.toast('Contacto guardado.');
  };
  function formEntidad(e) {
    const tipos = [...new Set(BA.lista('entidades').map(x => x.tipo))];
    return `<div class="campo"><label for="ef-n">Nombre</label><input id="ef-n" name="nombre" type="text" required value="${esc(e.nombre || '')}"></div>
      <div class="rejilla-2"><div class="campo"><label for="ef-t">Tipo</label><input id="ef-t" name="tipo" type="text" list="ef-tipos" value="${esc(e.tipo || 'Empresa')}"><datalist id="ef-tipos">${tipos.map(t => `<option value="${esc(t)}">`).join('')}</datalist></div>
      <div class="campo"><label for="ef-c">Ciudad</label><input id="ef-c" name="ciudad" type="text" value="${esc(e.ciudad || '')}"></div></div>
      <div class="campo"><label for="ef-w">Web</label><input id="ef-w" name="web" type="text" value="${esc(e.web || '')}"></div>
      <div class="campo"><label for="ef-no">Notas</label><textarea id="ef-no" name="notas">${esc(e.notas || '')}</textarea></div>
      <div class="campo"><span class="etq">Categorías de la entidad</span>${BA.htmlCats(e.cats || [])}</div>`;
  }
  const leerEnt = fd => ({ nombre: fd.get('nombre').trim(), tipo: fd.get('tipo').trim() || 'Empresa', ciudad: fd.get('ciudad').trim(), web: fd.get('web').trim(), notas: fd.get('notas').trim(), cats: fd.getAll('cats') });
  BA.acc['entidad-nueva'] = async () => {
    const r = await BA.dialogo({ titulo: 'Nueva entidad', ancho: true, ok: 'Crear entidad', validar: fd => fd.get('nombre').trim() ? null : 'Escribe el nombre.', html: formEntidad({}) }); if (!r) return;
    const e = BA.nuevo('entidades', { id: U.uid('e-'), dominio: '', ...leerEnt(r.fd) }); BA.toast('Entidad creada.'); BA.irA('#/crm/e/' + e.id);
  };
  BA.acc['entidad-editar'] = async el => {
    const e = BA.entidad(el.dataset.id);
    const r = await BA.dialogo({ titulo: 'Editar entidad', ancho: true, ok: 'Guardar', validar: fd => fd.get('nombre').trim() ? null : 'Escribe el nombre.', html: formEntidad(e) }); if (!r) return;
    BA.parchear('entidades', e.id, leerEnt(r.fd)); BA.refrescar(); BA.toast('Entidad guardada.');
  };

  // ---------- etiquetas ----------
  BA.acc.etiquetas = async () => {
    const pintar = () => BA.categorias().filter(c => c.grupo === 'etiqueta').map(c => { const n = BA.lista('contactos').filter(x => x.cats.includes(c.nombre)).length + BA.lista('entidades').filter(x => x.cats.includes(c.nombre)).length;
      return `<li><span>${BA.chipCat(c.nombre)} <span class="peq suave">${U.plural(n, 'uso', 'usos')}</span></span><button type="button" class="btn btn--borde btn--sm" data-acc="etiqueta-borrar" data-id="${esc(c.id)}" aria-label="Borrar la etiqueta ${esc(c.nombre)}">Borrar</button></li>`; }).join('');
    await BA.dialogo({ titulo: 'Gestionar etiquetas', ok: '', cancel: 'Cerrar', html: `<p class="suave">Las etiquetas son categorías libres que puedes poner a cualquier persona o entidad. Los tipos de socio y las temáticas son fijos.</p>
      <ul class="lista-simple" id="et-lista">${pintar()}</ul>
      <div class="acciones" style="margin-top:12px"><label class="solo-lectores" for="et-n">Nombre de la etiqueta nueva</label><input id="et-n" type="text" maxlength="40" placeholder="Nueva etiqueta" style="flex:1;min-width:180px"><button class="btn btn--primario" type="button" data-acc="etiqueta-crear">Crear</button></div>` });
    BA.refrescar();
  };
  const repintarEt = () => { const ul = U.$('#et-lista'); if (!ul) return; ul.innerHTML = BA.categorias().filter(c => c.grupo === 'etiqueta').map(c => { const n = BA.lista('contactos').filter(x => x.cats.includes(c.nombre)).length + BA.lista('entidades').filter(x => x.cats.includes(c.nombre)).length;
    return `<li><span>${BA.chipCat(c.nombre)} <span class="peq suave">${U.plural(n, 'uso', 'usos')}</span></span><button type="button" class="btn btn--borde btn--sm" data-acc="etiqueta-borrar" data-id="${esc(c.id)}" aria-label="Borrar la etiqueta ${esc(c.nombre)}">Borrar</button></li>`; }).join(''); };
  BA.acc['etiqueta-crear'] = el => {
    const inp = U.$('#et-n', el.closest('dialog')), n = inp.value.trim(); if (!n) { inp.focus(); return; }
    if (!BA.categorias().some(c => U.norm(c.nombre) === U.norm(n))) BA.nuevo('categorias', { id: U.uid('cat'), nombre: n, grupo: 'etiqueta' });
    inp.value = ''; repintarEt(); BA.toast('Etiqueta creada.');
  };
  BA.acc['etiqueta-borrar'] = async el => {
    const c = BA.get('categorias', el.dataset.id);
    BA.borrar('categorias', c.id);
    for (const col of ['contactos', 'entidades']) for (const o of BA.lista(col)) if (o.cats.includes(c.nombre)) BA.parchear(col, o.id, { cats: o.cats.filter(x => x !== c.nombre) });
    crm.f.bloques = crm.f.bloques.map(b => b.filter(x => x !== c.nombre));
    repintarEt(); BA.toast(`Etiqueta «${c.nombre}» borrada.`);
  };

  // ---------- contactos detectados ----------
  function aceptarDet(d, datos) {
    const e = d.entidadSugerida && BA.entidad(d.entidadSugerida);
    const fd = datos || null; const base = { nombre: d.nombre, apellidos: d.apellidos, cargo: d.cargo, email: d.email, tel: '' };
    let entId = e ? e.id : null;
    if (!entId) { const ya = BA.lista('entidades').find(x => U.norm(x.nombre) === U.norm(d.entidadNueva)); entId = ya ? ya.id : BA.nuevo('entidades', { id: U.uid('e-'), nombre: d.entidadNueva, tipo: 'Empresa', ciudad: '', web: '', dominio: '', cats: d.cats.filter(c => BA.grupoCat(c) === 'tipo'), notas: '' }).id; }
    const eCats = BA.entidad(entId).cats;
    const c = BA.nuevo('contactos', { id: U.uid('c'), ...base, entidadId: entId, principal: false, cats: d.cats.filter(x => !eCats.includes(x)) });
    BA.S.ui.detectadosHechos = [...hechosDet(), d.id]; BA.guardar(); return c;
  }
  BA.acc['det-aceptar'] = el => { const d = BA.get('detectados', el.dataset.id), c = aceptarDet(d); BA.refrescar(); BA.toast(`${BA.nombreC(c)} añadido al CRM.`, { accion: 'Ver ficha', fn: () => BA.irA('#/crm/c/' + c.id) }); };
  BA.acc['det-descartar'] = el => { const d = BA.get('detectados', el.dataset.id); BA.S.ui.detectadosHechos = [...hechosDet(), d.id]; BA.guardar(); BA.refrescar(); BA.toast('Contacto descartado.'); };
  BA.acc['det-editar'] = async el => {
    const d = BA.get('detectados', el.dataset.id);
    const r = await BA.dialogo({ titulo: 'Revisar contacto detectado', ancho: true, ok: 'Añadir al CRM', validar: validaContacto, html: formContacto({ ...d, cats: d.cats, entidadId: d.entidadSugerida }) }); if (!r) return;
    const id = guardarContacto(r.fd); BA.S.ui.detectadosHechos = [...hechosDet(), d.id]; BA.guardar(); BA.refrescar(); BA.toast('Contacto añadido al CRM.', { accion: 'Ver ficha', fn: () => BA.irA('#/crm/c/' + id) });
  };
})();
