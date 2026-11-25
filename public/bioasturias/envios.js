/* BioAsturias · Panel — Envíos personalizados: asistente en 4 pasos (destinatarios, mensaje, vista previa, envío simulado) e historial con métricas simuladas. */
'use strict';
(() => {
  const BA = window.BA, U = BA.U, esc = U.esc;
  const CUENTA = 'mateo@bioasturias.example';
  const VARS = { nombre: c => c.nombre, entidad: (c, e) => e ? e.nombre : '', cargo: c => c.cargo };
  const PASOS = ['Destinatarios', 'Mensaje', 'Vista previa', 'Envío'];
  let tab = 'nuevo', detalle = null, campo = null, enCurso = null;

  const borrador = () => ({ paso: 1, f: BA.filtro.nuevo(), q: '', soloManual: false, extra: [], quitados: [], asunto: '', cuerpo: '', plantilla: '', idx: 0, estado: 'edicion', progreso: 0, pruebaOk: false, aviso: '' });
  let d = borrador();
  const enlazar = () => { BA.filtros.envios = { f: d.f, alCambiar: () => BA.refrescar() }; };
  enlazar();

  // ---------- destinatarios y variables ----------
  function destinatarios() {
    const todos = BA.lista('contactos');
    const base = d.soloManual ? [] : todos.filter(c => BA.filtro.coincide(c, d.f) && !d.quitados.includes(c.id));
    const extra = d.extra.map(id => todos.find(c => c.id === id)).filter(c => c && !base.includes(c));
    return [...base, ...extra];
  }
  const coincidentes = () => d.soloManual ? [] : BA.lista('contactos').filter(c => BA.filtro.coincide(c, d.f));
  const valor = (v, c) => VARS[v] ? VARS[v](c, BA.entidad(c.entidadId)) : null;
  const usadas = () => [...new Set([...(d.asunto + ' ' + d.cuerpo).matchAll(/\{(\w+)\}/g)].map(m => m[1]))];
  function rellenar(txt, c, marcar) {
    return txt.replace(/\{(\w+)\}/g, (m, v) => {
      const x = valor(v, c);
      if (x === null) return marcar ? `<mark class="vacia" title="Variable desconocida">${esc(m)}</mark>` : m;
      if (!x) return marcar ? `<mark class="vacia" title="Este contacto no tiene ${v}">[sin ${v}]</mark>` : '';
      return marcar ? esc(x) : x;
    });
  }
  function avisos() {
    const dest = destinatarios(), us = usadas(), res = [];
    for (const v of us) {
      if (!VARS[v]) { res.push({ v, desconocida: true, quienes: [] }); continue; }
      const q = dest.filter(c => !valor(v, c)); if (q.length) res.push({ v, quienes: q });
    }
    return res;
  }

  // ---------- pasos ----------
  const cabecera = () => `<ol class="pasos" aria-label="Pasos del envío">${PASOS.map((t, i) => `<li class="${d.paso === i + 1 ? 'act' : d.paso > i + 1 ? 'hecho' : ''}"${d.paso === i + 1 ? ' aria-current="step"' : ''}>${i + 1}. ${t}</li>`).join('')}</ol>`;
  function filaDest(c, extra) {
    const e = BA.entidad(c.entidadId);
    return `<label class="dest-fila"><input type="checkbox" checked data-chg="env-toggle" data-id="${esc(c.id)}" aria-label="Incluir a ${esc(BA.nombreC(c))}"><span class="t"><span class="nombre">${esc(BA.nombreC(c))}</span> <span class="suave peq">${esc(c.cargo || 'sin cargo')} · ${esc(e ? e.nombre : '')}</span>${extra ? ' <span class="chip">Añadido a mano</span>' : ''}</span><span class="peq suave">${esc(c.email)}</span></label>`;
  }
  function paso1() {
    const dest = destinatarios(), quit = d.quitados.map(id => BA.contacto(id)).filter(c => c && coincidentes().includes(c));
    return `${d.soloManual ? `<div class="aviso aviso--info">Has llegado desde una ficha: la lista parte solo de ${U.plural(d.extra.length, 'contacto', 'contactos')}. <button type="button" class="btn--link" data-acc="env-usar-filtro">Usar el filtro de categorías en su lugar</button></div>` : BA.filtro.html('envios')}
      <section class="tarjeta"><div class="cab-pagina" style="margin-bottom:8px"><h2 id="env-n">${U.plural(dest.length, 'destinatario', 'destinatarios')}</h2><span class="peq suave">${esc(BA.filtro.resumen(d.f))}</span></div>
        ${dest.length ? `<div class="dest-lista" role="group" aria-labelledby="env-n">${dest.map(c => filaDest(c, !coincidentes().includes(c))).join('')}</div>` : '<div class="vacio"><b>Aún no hay destinatarios</b>Elige categorías arriba o añade personas a mano.</div>'}
        ${quit.length ? `<p class="peq suave">Quitados a mano: ${quit.map(c => `${esc(BA.nombreC(c))} <button type="button" class="btn--link" data-acc="env-reponer" data-id="${esc(c.id)}">volver a incluir</button>`).join(' · ')}</p>` : ''}
        <div class="campo" style="margin-top:12px"><label for="env-add">Añadir a mano (quien no cumpla el filtro)</label><input id="env-add" type="search" placeholder="Busca por nombre, entidad o correo" data-inp="env-add" autocomplete="off" value="${esc(d.q)}"></div>
        <div id="env-add-res">${resBusqueda()}</div></section>
      <div class="acciones" style="justify-content:flex-end;margin-top:14px"><button type="button" class="btn btn--primario" data-acc="env-paso" data-p="2"${dest.length ? '' : ' disabled'}>Siguiente: escribir el mensaje</button></div>`;
  }
  function resBusqueda() {
    const q = d.q.trim(); if (q.length < 2) return '';
    const ya = new Set(destinatarios().map(c => c.id));
    const l = BA.lista('contactos').filter(c => !ya.has(c.id) && BA.filtro.coincide(c, BA.filtro.nuevo(), q)).slice(0, 6);
    return l.length ? `<ul class="lista-simple">${l.map(c => `<li><span>${esc(BA.nombreC(c))} <span class="peq suave">· ${esc(BA.entidad(c.entidadId).nombre)}</span></span><button type="button" class="btn btn--borde btn--sm" data-acc="env-anadir" data-id="${esc(c.id)}">Añadir</button></li>`).join('')}</ul>` : '<p class="peq suave">Nadie más coincide con esa búsqueda.</p>';
  }
  function paso2() {
    return `<section class="tarjeta"><div class="campo"><label for="env-pl">Plantilla</label><div class="acciones"><select id="env-pl" data-chg="env-plantilla" style="flex:1;min-width:200px"><option value="">Escribir desde cero</option>${BA.lista('plantillas').map(p => `<option value="${esc(p.id)}"${d.plantilla === p.id ? ' selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>
        <button type="button" class="btn btn--borde" data-acc="env-guardar-plantilla">Guardar como plantilla</button></div></div>
      <div class="campo"><label for="env-asunto">Asunto</label><input id="env-asunto" type="text" value="${esc(d.asunto)}" data-inp="env-asunto" maxlength="200"></div>
      <div class="vars" role="group" aria-label="Insertar variables"><span class="etq">Insertar:</span>${Object.keys(VARS).map(v => `<button type="button" class="btn btn--borde btn--sm var-btn" data-acc="env-var" data-v="${v}">{${v}}</button>`).join('')}<span class="peq suave">Se sustituyen por los datos de cada persona.</span></div>
      <div class="campo"><label for="env-cuerpo">Mensaje</label><textarea id="env-cuerpo" rows="12" data-inp="env-cuerpo" style="min-height:240px">${esc(d.cuerpo)}</textarea></div></section>
      <div class="acciones" style="justify-content:space-between;margin-top:14px"><button type="button" class="btn btn--borde" data-acc="env-paso" data-p="1">Atrás</button><button type="button" class="btn btn--primario" data-acc="env-paso" data-p="3">Siguiente: vista previa</button></div>`;
  }
  function paso3() {
    const dest = destinatarios(), av = avisos(); if (d.idx >= dest.length) d.idx = Math.max(0, dest.length - 1);
    const c = dest[d.idx], e = c && BA.entidad(c.entidadId);
    const conAviso = new Set(av.flatMap(a => a.quienes.map(q => q.id)));
    return `${av.length ? `<div class="aviso" role="alert"><b>Revisa antes de enviar:</b><ul style="margin:6px 0 0;padding-left:20px">${av.map(a => a.desconocida ? `<li>La variable <code>{${esc(a.v)}}</code> no existe: saldría tal cual. Variables válidas: ${Object.keys(VARS).map(v => `{${v}}`).join(', ')}.</li>`
        : `<li>${U.plural(a.quienes.length, 'destinatario no tiene', 'destinatarios no tienen')} <b>${a.v}</b>: ${a.quienes.slice(0, 5).map(q => esc(BA.nombreC(q))).join(', ')}${a.quienes.length > 5 ? '…' : ''}. <button type="button" class="btn--link" data-acc="env-quitar-vacios" data-v="${a.v}">Quitarlos del envío</button></li>`).join('')}</ul></div>` : '<div class="aviso aviso--info">Todas las variables tienen valor para todos los destinatarios.</div>'}
      <div class="cuadro-ficha" style="grid-template-columns:minmax(0,1fr) 280px"><section><div class="acciones" style="margin-bottom:8px"><button type="button" class="btn btn--borde btn--sm" data-acc="env-nav" data-n="-1"${d.idx === 0 ? ' disabled' : ''}>${U.ic('izq', 'ic--sm')} Anterior</button><b aria-live="polite">Destinatario ${d.idx + 1} de ${dest.length}</b><button type="button" class="btn btn--borde btn--sm" data-acc="env-nav" data-n="1"${d.idx >= dest.length - 1 ? ' disabled' : ''}>Siguiente ${U.ic('der', 'ic--sm')}</button></div>
        ${c ? `<div class="previa"><div class="previa__cab"><div><b>De:</b> Mateo &lt;${CUENTA}&gt;</div><div><b>Para:</b> ${esc(BA.nombreC(c))} &lt;${esc(c.email)}&gt;</div><div><b>Asunto:</b> ${rellenar(esc(d.asunto), c, true)}</div></div><div class="previa__cuerpo">${rellenar(esc(d.cuerpo), c, true)}</div></div>` : '<div class="vacio">No hay destinatarios.</div>'}</section>
        <section aria-label="Lista de destinatarios"><div class="dest-lista" style="max-height:420px">${dest.map((x, i) => `<button type="button" class="dest-fila" style="width:100%;border:0;border-bottom:1px solid var(--c-borde);background:${i === d.idx ? 'var(--c-primario-claro)' : '#fff'};text-align:left;cursor:pointer" data-acc="env-ir" data-i="${i}"${i === d.idx ? ' aria-current="true"' : ''}><span class="t"><span class="nombre">${esc(BA.nombreC(x))}</span><br><span class="peq suave">${esc(BA.entidad(x.entidadId).nombre)}</span></span>${conAviso.has(x.id) ? '<span title="Faltan datos" aria-label="Faltan datos">⚠</span>' : ''}</button>`).join('')}</div></section></div>
      <div class="acciones" style="justify-content:space-between;margin-top:14px"><button type="button" class="btn btn--borde" data-acc="env-paso" data-p="2">Atrás: editar mensaje</button><button type="button" class="btn btn--primario" data-acc="env-paso" data-p="4">Siguiente: enviar</button></div>`;
  }
  function paso4() {
    const dest = destinatarios(), av = avisos();
    if (d.estado === 'enviando') return `<section class="tarjeta" aria-live="polite"><h2>Enviando…</h2><p>Un correo cada vez, uno a uno desde <b>${CUENTA}</b> (Outlook). Cada destinatario recibe un mensaje con su nombre y solo con su nombre.</p>
      <div class="progreso" role="progressbar" aria-valuemin="0" aria-valuemax="${dest.length}" aria-valuenow="${d.progreso}"><i style="width:${dest.length ? d.progreso / dest.length * 100 : 0}%"></i></div>
      <p id="env-prog-txt"><b>${d.progreso} de ${dest.length}</b> · ${d.progreso < dest.length ? 'enviando a ' + esc(BA.nombreC(dest[d.progreso])) : 'terminando'}</p></section>`;
    if (d.estado === 'enviado') return `<section class="tarjeta"><h2>Envío terminado</h2><p><b>${U.plural(dest.length, 'correo enviado', 'correos enviados')}</b> uno a uno desde ${CUENTA}. Quedan también en tu carpeta Enviados de Outlook y en el historial de cada ficha del CRM.</p>
      <p class="peq suave">Prototipo: no se ha enviado ningún correo real.</p><div class="acciones"><button type="button" class="btn btn--primario" data-acc="env-ver-historial">Ver en el historial</button><button type="button" class="btn btn--borde" data-acc="env-nuevo">Preparar otro envío</button></div></section>`;
    return `<section class="tarjeta"><h2>Resumen</h2><dl class="meta-lista"><dt>Desde</dt><dd>${CUENTA} (tu cuenta de Outlook)</dd><dt>Destinatarios</dt><dd>${dest.length} · ${esc(d.soloManual ? 'elegidos a mano' : BA.filtro.resumen(d.f))}</dd><dt>Asunto</dt><dd>${esc(d.asunto)}</dd><dt>Forma de envío</dt><dd>Un correo individual por persona, sin copia oculta ni newsletter</dd></dl>
      ${av.length ? `<div class="aviso">Hay ${av.length === 1 ? 'un aviso' : av.length + ' avisos'} de datos que faltan. <button type="button" class="btn--link" data-acc="env-paso" data-p="3">Revisarlos</button></div>` : ''}
      <h3>1. Prueba</h3><p>Recibirás en tu correo el mensaje tal como lo vería ${dest[0] ? esc(BA.nombreC(dest[d.idx] || dest[0])) : 'el primer destinatario'}, para ver cómo queda en tu bandeja. No sale a nadie más.</p>
      <button type="button" class="btn btn--borde" data-acc="env-prueba">Enviarme una prueba solo a mí</button> ${d.pruebaOk ? `<span class="badge badge--ok" role="status">Prueba enviada a ${CUENTA}</span>` : ''}
      <h3 style="margin-top:18px">2. Envío</h3><p>Se enviará un correo por persona, con su nombre, desde tu propia cuenta. Aparecerán en Enviados.</p>
      <button type="button" class="btn btn--primario" data-acc="env-enviar"${dest.length ? '' : ' disabled'}>Enviar a ${U.plural(dest.length, 'persona', 'personas')}, uno a uno</button></section>
      <div class="acciones" style="margin-top:14px"><button type="button" class="btn btn--borde" data-acc="env-paso" data-p="3">Atrás</button></div>`;
  }
  function nuevo() {
    return `${cabecera()}${[paso1, paso2, paso3, paso4][d.paso - 1]()}`;
  }

  // ---------- historial ----------
  const tot = e => { const ok = e.destinatarios.filter(x => x.estado === 'enviado'); return { env: ok.length, reb: e.destinatarios.length - ok.length, clic: ok.filter(x => x.clics > 0).length, clics: ok.reduce((n, x) => n + x.clics, 0), resp: ok.filter(x => x.respondio).length }; };
  const pct = (a, b) => b ? Math.round(a / b * 100) + ' %' : '—';
  function historial() {
    if (detalle) return detalleEnvio(BA.get('envios', detalle));
    const l = BA.lista('envios').slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
    return `<div class="tabla-wrap"><table class="tabla"><thead><tr><th scope="col">Fecha</th><th scope="col">Asunto</th><th scope="col">Destinatarios</th><th scope="col" class="num">Enviados</th><th scope="col" class="num">Clics en enlaces</th><th scope="col" class="num">Respuestas</th><th></th></tr></thead><tbody>
      ${l.map(e => { const t = tot(e); return `<tr><td>${U.diaCorto(new Date(e.fecha))}</td><td><b>${esc(e.asunto)}</b></td><td>${esc(e.filtroTexto)}</td><td class="num">${t.env}</td><td class="num">${t.clic} (${pct(t.clic, t.env)})</td><td class="num">${t.resp} (${pct(t.resp, t.env)})</td><td><button type="button" class="btn btn--borde btn--sm" data-acc="env-detalle" data-id="${esc(e.id)}" aria-label="Ver detalle de ${esc(e.asunto)}">Detalle</button></td></tr>`; }).join('')}</tbody></table></div>
      <p class="peq suave" style="margin-top:8px">Métricas simuladas: en este prototipo los clics y las respuestas son de ejemplo.</p>`;
  }
  function detalleEnvio(e) {
    const t = tot(e);
    return `<p><button type="button" class="btn--link" data-acc="env-volver">← Volver al historial</button></p><h2>${esc(e.asunto)}</h2><p class="suave">${U.fechaCompleta(e.fecha)} · ${esc(e.filtroTexto)}</p>
      <div class="metricas"><div class="kpi"><b>${t.env}</b><span>enviados</span></div><div class="kpi"><b>${t.reb}</b><span>rebotados</span></div><div class="kpi"><b>${t.clics}</b><span>clics en enlaces</span></div><div class="kpi"><b>${pct(t.clic, t.env)}</b><span>han hecho clic</span></div><div class="kpi"><b>${pct(t.resp, t.env)}</b><span>han respondido</span></div></div>
      <p class="aviso aviso--info">Métricas simuladas. Con Outlook conectado, las respuestas se detectarían en tu bandeja; los clics se medirían en los enlaces del mensaje.</p>
      <div class="tabla-wrap"><table class="tabla"><thead><tr><th scope="col">Destinatario</th><th scope="col">Entidad</th><th scope="col">Estado</th><th scope="col" class="num">Clics</th><th scope="col">Respuesta</th><th></th></tr></thead><tbody>
      ${e.destinatarios.map(x => { const c = BA.contacto(x.contactoId); if (!c) return ''; return `<tr><td><button type="button" class="enlace-nombre" data-acc="ir-contacto" data-id="${esc(c.id)}">${esc(BA.nombreC(c))}</button></td><td>${esc(BA.entidad(c.entidadId).nombre)}</td><td>${x.estado === 'enviado' ? 'Enviado' : '<span class="badge badge--hoy">Rebotado</span>'}</td><td class="num">${x.clics}</td>
        <td>${x.respondio ? `<span class="badge badge--ok">Respondió</span> <span class="peq suave">${U.cuando(x.respuestaEn)}</span>` : '<span class="suave">Sin respuesta</span>'}</td><td><button type="button" class="btn btn--borde btn--sm" data-acc="env-ver-correo" data-e="${esc(e.id)}" data-id="${esc(c.id)}" aria-label="Ver el correo enviado a ${esc(BA.nombreC(c))}">Ver correo</button></td></tr>`; }).join('')}</tbody></table></div>`;
  }

  function render() {
    return `<div class="cab-pagina"><div><h1>Envíos personalizados</h1><p>Mensajes a medida para quien tú elijas, enviados uno a uno desde tu propia cuenta.</p></div></div>
      <div class="aviso aviso--info" role="note"><b>Cómo salen los correos:</b> desde tu propia cuenta (${CUENTA}, Outlook), como correos individuales: «Hola Francisco…». Sin copia oculta ni newsletter. Reemplaza a tu herramienta de envíos actual.</div>
      <div class="pestanas" role="tablist" aria-label="Envíos">${[['nuevo', 'Nuevo envío'], ['historial', `Historial (${BA.lista('envios').length})`]].map(([k, t]) => `<button type="button" role="tab" aria-selected="${tab === k}" data-acc="env-tab" data-k="${k}">${t}</button>`).join('')}</div>
      <div role="tabpanel">${tab === 'nuevo' ? nuevo() : historial()}</div>`;
  }
  BA.rutas.envios = { titulo: 'Envíos', render };
  BA.mod.envios = {
    preparar(ids, f) {
      d = borrador();
      const hayFiltro = f && (BA.filtro.limpio(f).length || f.tipo || f.principales);
      if (hayFiltro) { d.f = f; } else { d.soloManual = true; d.extra = ids; }
      enlazar(); tab = 'nuevo'; detalle = null;
    },
  };

  // ---------- acciones ----------
  const repintar = () => BA.refrescar();
  BA.acc['env-tab'] = el => { tab = el.dataset.k; detalle = null; repintar(); };
  BA.acc['env-usar-filtro'] = () => { d.soloManual = false; d.extra = []; repintar(); };
  BA.chg['env-toggle'] = el => {
    const id = el.dataset.id;
    if (d.extra.includes(id)) d.extra = d.extra.filter(x => x !== id); else d.quitados.push(id);
    repintar();
  };
  BA.acc['env-reponer'] = el => { d.quitados = d.quitados.filter(x => x !== el.dataset.id); repintar(); };
  BA.inp['env-add'] = el => { d.q = el.value; U.$('#env-add-res').innerHTML = resBusqueda(); };
  BA.acc['env-anadir'] = el => { d.extra.push(el.dataset.id); d.quitados = d.quitados.filter(x => x !== el.dataset.id); d.q = ''; repintar(); BA.toast('Añadido a la lista.'); };
  BA.acc['env-paso'] = el => {
    const p = +el.dataset.p;
    if (p >= 3 && (!d.asunto.trim() || !d.cuerpo.trim())) { BA.toast('Escribe el asunto y el mensaje antes de seguir.'); d.paso = 2; repintar(); return; }
    d.paso = p; repintar(); window.scrollTo(0, 0);
  };
  BA.inp['env-asunto'] = el => { d.asunto = el.value; };
  BA.inp['env-cuerpo'] = el => { d.cuerpo = el.value; };
  document.addEventListener('focusin', e => { if (e.target.id === 'env-asunto' || e.target.id === 'env-cuerpo') campo = e.target.id; });
  BA.acc['env-var'] = el => {
    const f = U.$('#' + (campo || 'env-cuerpo')); if (!f) return;
    const t = `{${el.dataset.v}}`, a = f.selectionStart ?? f.value.length, b = f.selectionEnd ?? a;
    f.value = f.value.slice(0, a) + t + f.value.slice(b); f.focus(); f.setSelectionRange(a + t.length, a + t.length);
    (f.id === 'env-asunto' ? BA.inp['env-asunto'] : BA.inp['env-cuerpo'])(f);
  };
  BA.chg['env-plantilla'] = el => { const p = BA.get('plantillas', el.value); d.plantilla = el.value; if (p) { d.asunto = p.asunto; d.cuerpo = p.cuerpo; } repintar(); };
  BA.acc['env-guardar-plantilla'] = async () => {
    if (!d.asunto.trim() || !d.cuerpo.trim()) { BA.toast('Escribe primero el asunto y el mensaje.'); return; }
    const r = await BA.dialogo({ titulo: 'Guardar como plantilla', ok: 'Guardar', validar: fd => fd.get('nombre').trim() ? null : 'Ponle un nombre.', html: '<div class="campo"><label for="pl-n">Nombre de la plantilla</label><input id="pl-n" name="nombre" type="text" maxlength="60"></div>' });
    if (!r) return; const p = BA.nuevo('plantillas', { id: U.uid('p'), nombre: r.fd.get('nombre').trim(), asunto: d.asunto, cuerpo: d.cuerpo }); d.plantilla = p.id; repintar(); BA.toast('Plantilla guardada.');
  };
  BA.acc['env-nav'] = el => { d.idx = Math.max(0, d.idx + +el.dataset.n); repintar(); };
  BA.acc['env-ir'] = el => { d.idx = +el.dataset.i; repintar(); };
  BA.acc['env-quitar-vacios'] = el => {
    const v = el.dataset.v, mal = destinatarios().filter(c => !valor(v, c)).map(c => c.id);
    for (const id of mal) { if (d.extra.includes(id)) d.extra = d.extra.filter(x => x !== id); else d.quitados.push(id); }
    repintar(); BA.toast(`Quitados ${mal.length} destinatarios sin ${v}.`);
  };
  BA.acc['env-prueba'] = () => { d.pruebaOk = true; repintar(); BA.toast(`Prueba enviada a ${CUENTA} (simulada).`); };
  BA.acc['env-enviar'] = async () => {
    const dest = destinatarios();
    if (!(await BA.confirmar('Enviar ahora', `Se enviarán <b>${dest.length}</b> correos individuales desde ${CUENTA}. En este prototipo no sale ningún correo real.`, 'Enviar'))) return;
    d.estado = 'enviando'; d.progreso = 0; repintar();
    const paso = Math.max(30, Math.min(140, 3800 / dest.length));
    clearInterval(enCurso);
    enCurso = setInterval(() => {
      d.progreso++;
      if (d.progreso >= dest.length) { clearInterval(enCurso); terminar(dest); return; }
      if (U.$('#env-prog-txt')) { U.$('#env-prog-txt').innerHTML = `<b>${d.progreso} de ${dest.length}</b> · enviando a ${esc(BA.nombreC(dest[d.progreso]))}`; U.$('.progreso i').style.width = d.progreso / dest.length * 100 + '%'; U.$('.progreso').setAttribute('aria-valuenow', d.progreso); }
    }, paso);
  };
  function terminar(dest) {
    const ahora = new Date(), id = U.uid('env-');
    const destinatarios = dest.map(c => { const clics = Math.random() < 0.5 ? 1 + Math.floor(Math.random() * 3) : 0, resp = Math.random() < 0.3;
      return { contactoId: c.id, estado: 'enviado', clics, respondio: resp, respuestaEn: resp ? new Date(ahora.getTime() + (1 + Math.floor(Math.random() * 20)) * 3600e3).toISOString() : null }; });
    BA.nuevo('envios', { id, fecha: ahora.toISOString(), asunto: d.asunto.trim(), plantillaId: d.plantilla, cuerpo: d.cuerpo, filtroTexto: d.soloManual ? 'Elegidos a mano' : BA.filtro.resumen(d.f) + (d.extra.length ? ` (+${d.extra.length} a mano)` : ''), destinatarios, simulado: true });
    for (const c of dest) BA.nuevo('comms', { id: U.uid('m'), fecha: ahora.toISOString(), tipo: 'envio-masivo', asunto: rellenar(d.asunto, c, false), resumen: 'Envío personalizado «' + d.asunto.trim() + '».', proyecto: '', contactoId: c.id, entidadId: c.entidadId, fuente: 'envios', envioId: id });
    d.estado = 'enviado'; d.enviadoId = id; if (BA.rutas && location.hash.startsWith('#/envios')) repintar(); BA.toast('Envío terminado.');
  }
  BA.acc['env-ver-historial'] = () => { tab = 'historial'; detalle = d.enviadoId; d = borrador(); enlazar(); repintar(); };
  BA.acc['env-nuevo'] = () => { d = borrador(); enlazar(); repintar(); };
  BA.acc['env-detalle'] = el => { detalle = el.dataset.id; repintar(); window.scrollTo(0, 0); };
  BA.acc['env-volver'] = () => { detalle = null; repintar(); };
  BA.acc['env-ver-correo'] = el => {
    const e = BA.get('envios', el.dataset.e), c = BA.contacto(el.dataset.id), den = e.destinatarios.find(x => x.contactoId === c.id);
    const cuerpo = e.cuerpo ? rellenar(e.cuerpo, c, false) : '';
    BA.drawer.abrir('Correo enviado', `<p class="fila__meta">${U.fuente('outlook')}<span>${U.fechaCompleta(e.fecha)}</span></p><dl class="meta-lista"><dt>De</dt><dd>${CUENTA}</dd><dt>Para</dt><dd>${esc(BA.nombreC(c))} &lt;${esc(c.email)}&gt;</dd><dt>Asunto</dt><dd>${esc(e.asunto)}</dd></dl>
      <blockquote class="citado">${esc(cuerpo)}</blockquote><p>${den.respondio ? '<span class="badge badge--ok">Respondió</span>' : 'Sin respuesta todavía'} · ${U.plural(den.clics, 'clic', 'clics')} en enlaces <span class="peq suave">(simulado)</span></p>`);
  };
})();
