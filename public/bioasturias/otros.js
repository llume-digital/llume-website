/* BioAsturias · Panel — Fuentes conectadas, Funcionalidades (qué hace cada módulo) y Comentarios sobre el prototipo. */
'use strict';
(() => {
  const BA = window.BA, U = BA.U, esc = U.esc;

  // =============================== FUENTES ===============================
  const MAS_FUENTES = [['Microsoft Teams', 'Mensajes y reuniones de los canales de trabajo', 'Microsoft'], ['SharePoint', 'Bibliotecas de documentos de la asociación', 'Microsoft'], ['Google Calendar', 'Calendarios de Google, si algún miembro del equipo los usa', 'Google'],
    ['Dropbox', 'Carpetas compartidas con proveedores o socios', 'Otras'], ['Slack', 'Conversaciones de canales de proyecto', 'Otras'], ['Otra fuente', 'Cualquier sistema con exportación o conexión disponible', 'Otras']];
  function proximaLectura() { const d = U.esLab(BA.hoy) && BA.ahora.getHours() < 6 ? BA.hoy : U.sigLab(BA.hoy); return `${U.fechaLarga(d)}, 06:00`; }
  function renderFuentes() {
    const l = BA.lista('fuentes'), ok = l.filter(f => f.estado === 'conectada');
    return `<div class="cab-pagina"><div><h1>Fuentes conectadas</h1><p>De dónde lee el cerebro. Funciona igual con Microsoft y con Google, y se pueden añadir más.</p></div>
      <button type="button" class="btn btn--primario" data-acc="fuente-anadir">${U.ic('mas2', 'ic--sm')} Añadir fuente</button></div>
      <div class="kpis"><div class="kpi"><b>${ok.length}</b><span>fuentes conectadas</span></div><div class="kpi"><b>${ok.reduce((n, f) => n + f.elementos, 0).toLocaleString('es-ES')}</b><span>elementos leídos</span></div><div class="kpi"><b>06:00</b><span>lectura diaria, de lunes a viernes</span></div><div class="kpi"><b style="font-size:1.05rem">${proximaLectura()}</b><span>próxima lectura</span></div></div>
      <div class="aviso aviso--info" role="note">Estado simulado: en este prototipo ninguna fuente está realmente conectada. Odoo se queda como sistema de facturación y contabilidad; el panel solo lo lee.</div>
      <div class="fuentes-rejilla">${l.map(f => { const x = BA.FUENTES[f.id], on = f.estado === 'conectada';
        return `<article class="tarjeta fuente-tarjeta fuente--${esc(f.id)}"><div class="fuente-tarjeta__cab">${U.ic(x[1])}<div style="flex:1"><h2 style="margin:0">${esc(f.nombre)}</h2><span class="peq suave">${esc(f.familia)}${f.cuenta ? ' · ' + esc(f.cuenta) : ''}</span></div><span class="estado ${on ? '' : 'estado--no'}">${on ? 'Conectada' : 'Disponible'}</span></div>
          ${on ? `<p class="peq" style="margin:0"><b>Última lectura:</b> ${esc(f.ultima)} · ${f.elementos.toLocaleString('es-ES')} elementos</p>` : '<p class="peq suave" style="margin:0">Sin conectar. Mismo funcionamiento que sus equivalentes.</p>'}
          <div><b class="peq">Qué lee</b><ul>${f.lee.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
          <div class="acciones" style="margin-top:auto">${on ? `<button type="button" class="btn btn--borde btn--sm" data-acc="fuente-sync" data-id="${esc(f.id)}">Leer ahora</button><button type="button" class="btn btn--borde btn--sm" data-acc="fuente-toggle" data-id="${esc(f.id)}">Desconectar</button>` : `<button type="button" class="btn btn--primario btn--sm" data-acc="fuente-toggle" data-id="${esc(f.id)}">Conectar</button>`}</div></article>`; }).join('')}
        <article class="tarjeta fuente-tarjeta fuente-tarjeta--añadir"><h2>Añadir fuente</h2><p class="suave peq">Teams, SharePoint, otro calendario o cualquier sistema que uses mañana.</p><button type="button" class="btn btn--borde" data-acc="fuente-anadir">${U.ic('mas2', 'ic--sm')} Ver opciones</button></article></div>`;
  }
  BA.rutas.fuentes = { titulo: 'Fuentes', render: renderFuentes };
  BA.acc['fuente-sync'] = el => { const f = BA.get('fuentes', el.dataset.id); BA.parchear('fuentes', f.id, { ultima: 'hoy ' + U.hora(new Date()) + ' (a petición)' }); BA.refrescar(); BA.toast(`${f.nombre}: lectura simulada terminada.`); };
  BA.acc['fuente-toggle'] = async el => {
    const f = BA.get('fuentes', el.dataset.id), on = f.estado === 'conectada';
    if (on && !(await BA.confirmar('Desconectar', `${esc(f.nombre)} dejará de leerse. Los elementos ya leídos desaparecerán del brief en el prototipo real. ¿Seguro?`, 'Desconectar'))) return;
    BA.parchear('fuentes', f.id, on ? { estado: 'disponible' } : { estado: 'conectada', cuenta: f.cuenta || 'mateo.bioasturias@gmail.example', ultima: 'hoy ' + U.hora(new Date()), elementos: f.elementos || 1180 });
    BA.refrescar(); BA.toast(on ? `${f.nombre} desconectada (simulado).` : `${f.nombre} conectada (simulado).`);
  };
  BA.acc['fuente-anadir'] = async () => {
    await BA.dialogo({ titulo: 'Añadir una fuente', ok: '', cancel: 'Cerrar', html: `<p class="suave">El panel es ampliable: cada fuente nueva aporta sus correos, documentos o eventos al mismo brief. Elige una y se anota la petición (simulado).</p>
      <ul class="lista-simple">${MAS_FUENTES.map(([n, d, fam]) => `<li><span><b>${esc(n)}</b> <span class="chip">${fam}</span><br><span class="peq suave">${esc(d)}</span></span><button type="button" class="btn btn--borde btn--sm" data-acc="fuente-pedir" data-n="${esc(n)}">Solicitar</button></li>`).join('')}</ul>` });
  };
  BA.acc['fuente-pedir'] = el => { el.disabled = true; el.textContent = 'Anotada'; BA.toast(`Petición anotada: ${el.dataset.n} (simulado).`); };

  // =============================== FUNCIONALIDADES ===============================
  const FUNC = [
    ['Brief diario', 'brief', 'Cada mañana de lunes a viernes te enseña, en una sola pantalla, todo lo que necesita tu atención: correos que llegaron y no has contestado (aunque los marcaras como leídos), correos que enviaste y siguen sin respuesta, cosas que vencen hoy o esta semana, y novedades en tus documentos, en Odoo y en el calendario. Sin límite: un día puede haber 0 elementos y otro 50. Los lunes incluye lo que llegó desde el viernes por la tarde. De cada elemento ves su origen y el extracto original, y lo resuelves con un clic: hecho, convertir en tarea, categorizar por área y proyecto, posponer o descartar. También puedes repasarlos uno a uno, como cuando te pones al día en un chat.',
      'Los elementos son de ejemplo y se calculan respecto a la fecha de hoy, para que parezcan recién llegados. Los botones de «día tranquilo / normal / cargado» sirven para ver cómo se comporta con 0, unos 25 o unos 50 elementos. Lo que haces (hecho, posponer…) se guarda solo en este navegador.', 'Se rellenará cada madrugada con tus correos, documentos, facturas y reuniones reales, y se renovará solo cada día.'],
    ['Tareas', 'tareas', 'Un tablero con tres columnas (Por hacer, En curso, Hecho) donde cae todo lo que conviertes en tarea desde el brief o apuntas a mano. Cada tarea tiene área (Socios, Proyectos, Eventos, Comunicación, Administración, Internacional), proyecto, fecha, prioridad y un enlace al correo o documento del que nació. Se filtra por área y por proyecto.',
      'Puedes arrastrar tarjetas, usar las flechas (pensado para el móvil), crear, editar y borrar tareas. Los datos son de ejemplo.', 'Las tareas que nazcan de tus correos llevarán su enlace al mensaje real, y el cerebro podrá avisarte de las que se retrasan.'],
    ['CRM', 'crm', 'Tu libro de contactos con cabeza: entidades (empresas, centros tecnológicos, universidad, administración) con varias personas cada una y uno o varios contactos principales. Cada persona o entidad puede tener las categorías que quieras (tipo de socio, temática y etiquetas propias) y se pueden combinar para filtrar: «pleno derecho o adherido» y «Healthtech». Cada ficha guarda el historial de correos, reuniones y envíos, y los pendientes asociados. Además propone como contactos nuevos a las personas que aparecen en tus correos.',
      'Hay unas 25 entidades y 60 contactos inventados. Puedes crear, editar y borrar contactos, entidades y etiquetas, aceptar o descartar los contactos detectados y probar los filtros. Los datos se guardan solo en este navegador.', 'Será la fuente de verdad de tus contactos: lo que cambies aquí será lo que usen los envíos y el cerebro, y el historial se alimentará solo de tu correo y tu calendario.'],
    ['Envíos personalizados', 'envios', 'Escribes un mensaje una vez y sale a las personas que elijas como un correo individual a cada una («Hola Francisco…»), desde tu propia cuenta, sin copia oculta ni newsletter. Eliges los destinatarios con los mismos filtros del CRM (y añades o quitas a mano), insertas variables como nombre, entidad o cargo, usas plantillas, ves la vista previa de cada destinatario con avisos si falta algún dato, te mandas una prueba y envías. Después ves quién ha hecho clic en los enlaces y quién ha respondido.',
      'Todo el asistente funciona, pero el envío es simulado: no sale ningún correo y los clics y respuestas son inventados. Los envíos nuevos quedan en el historial y en las fichas.', 'Los correos saldrán de tu Outlook, uno a uno y a un ritmo razonable, y quedarán en Enviados. Las respuestas se detectarán en tu bandeja.'],
    ['Cerebro', 'cerebro', 'Una conversación con todo lo que sabes: «¿qué me queda hoy?», «¿con quién hablé de la misión a México?», «¿qué socios no han recibido nada este mes?», «resúmeme el mentoring». Responde con tus datos y te muestra de dónde sale cada afirmación para que puedas abrir el correo o el documento. Además te hace preguntas cuando algo no queda claro («¿se envió ya la propuesta a Mirador?») para no dejar cabos sueltos.',
      'Entiende un conjunto limitado de preguntas (las sugeridas y variantes sobre proyectos, entidades, personas, pendientes y socios sin contacto) y responde con los datos de ejemplo. Las dudas se responden con Sí, No o «recordar mañana» y el panel reacciona.', 'Responderá a preguntas libres sobre tus fuentes reales, siempre citando el correo o documento de origen.'],
    ['Fuentes conectadas', 'fuentes', 'La lista de sistemas de los que lee el panel: Outlook, Gmail, OneDrive, Google Drive, Odoo y el calendario, con su estado y la última lectura. Funciona igual con Microsoft y con Google y se pueden añadir más. Odoo sigue siendo tu sistema de facturación y contabilidad; el panel solo lo consulta.',
      'El estado, las cuentas y las horas son simulados: conectar o desconectar solo cambia lo que ves aquí.', 'Cada fuente se leerá cada madrugada de lunes a viernes, a las 06:00, para que el brief esté listo al llegar.'],
    ['Comentarios', 'comentarios', 'Un botón fijo en el borde derecho («Comentar») para dejar cualquier idea, duda o cambio que quieras sobre el panel, y una sección donde ver lo que has escrito, el estado de cada cosa y lo que te respondemos.',
      'Esto sí es real: los comentarios se guardan y los vemos. Si estás en una vista previa sin conexión, se guardan en tu navegador y se envían solos más tarde.', 'Seguirá existiendo mientras ajustemos el panel contigo.'],
  ];
  function renderFunc() {
    return `<div class="cab-pagina"><div><h1>Funcionalidades</h1><p>Qué hace cada parte del panel, qué está simulado en este prototipo y qué hará cuando se conecte con tus cosas.</p></div></div>
      <div class="aviso aviso--info" role="note">Lo que ves es un prototipo con datos inventados. Sirve para decidir juntos cómo debe funcionar antes de conectarlo con tu correo, tus documentos y Odoo.</div>
      ${FUNC.map(([t, k, que, sim, real]) => `<section class="tarjeta func" aria-labelledby="fn-${k}"><div class="acciones" style="justify-content:space-between"><h2 id="fn-${k}">${t}</h2><a class="btn btn--borde btn--sm" href="#/${k}">Abrir</a></div>
        <div class="func__cols"><div class="que"><h4>Qué hace</h4><p>${esc(que)}</p></div><div class="sim"><h4>En este prototipo</h4><p>${esc(sim)}</p></div><div class="real"><h4>Cuando se conecte</h4><p>${esc(real)}</p></div></div></section>`).join('')}`;
  }
  BA.rutas.funcionalidades = { titulo: 'Funcionalidades', render: renderFunc };

  // =============================== COMENTARIOS ===============================
  const C = window.BAComentarios;
  const FILTROS = [['abiertos', 'Abiertos'], ['todos', 'Todos'], ['hecho', 'Hechos'], ['descartado', 'Descartados']];
  const BADGE_PRIO = { imprescindible: 'badge--prio-alta', me_gustaria: 'badge--prio-media', mas_adelante: 'badge--prio-baja' };
  let lista = null, error = false, filtro = 'abiertos';
  const fechaHora = iso => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
  async function cargar() {
    try { lista = await C.listar(); error = false; } catch { error = true; if (!lista) lista = []; }
    BA.comNuevos = (lista || []).filter(c => c.estado === 'nuevo').length;
    if (location.hash.startsWith('#/comentarios')) BA.refrescar(); else BA.pintarNav();
  }
  function renderCom() {
    const l = lista, locales = C.colaLocal();
    const abierto = c => ['nuevo', 'en_curso'].includes(c.estado);
    const ver = (l || []).filter(c => filtro === 'todos' || (filtro === 'abiertos' ? abierto(c) : c.estado === filtro));
    const cuantos = k => (l || []).filter(c => k === 'todos' || (k === 'abiertos' ? abierto(c) : c.estado === k)).length;
    return `<div class="cab-pagina"><div><h1>Comentarios</h1><p>Todo lo que quieras cambiar, añadir o quitar del panel. Lo vemos los dos y te contestamos aquí mismo.</p></div><button type="button" class="btn btn--primario" data-acc="com-nuevo">+ Nuevo comentario</button></div>
      ${error ? `<div class="aviso aviso--err" role="alert"><b>No se pueden cargar los comentarios enviados ahora.</b> Es normal en una vista previa sin conexión. Lo que escribas se guarda en este navegador y se enviará solo cuando haya conexión.</div>` : ''}
      ${locales.length ? `<section class="tarjeta" style="margin-bottom:14px"><h2>Guardados en este navegador (${locales.length})</h2><p class="peq suave">Pendientes de enviar; se enviarán solos en cuanto haya conexión.</p><ul class="lista-simple">${locales.map(c => `<li><span>${esc(c.texto)}<br><span class="peq suave">${esc(c.donde)} · ${esc(C.PRIORIDADES[c.prioridad] || c.prioridad)}</span></span></li>`).join('')}</ul></section>` : ''}
      <div class="acciones" role="group" aria-label="Filtrar comentarios" style="margin-bottom:12px">${FILTROS.map(([k, t]) => `<button type="button" class="btn btn--sm ${filtro === k ? 'btn--primario' : 'btn--borde'}" data-acc="com-filtro" data-k="${k}" aria-pressed="${filtro === k}">${t} (${cuantos(k)})</button>`).join('')}
        ${l && l.length ? '<button type="button" class="btn btn--borde btn--sm" data-acc="com-copiar">Copiar lista</button>' : ''}</div>
      ${l === null ? '<p class="vacio">Cargando comentarios…</p>' : ver.length ? ver.map(c => `<article class="com"><div class="acciones"><span class="badge ${BADGE_PRIO[c.prioridad] || ''}">${esc(C.PRIORIDADES[c.prioridad] || c.prioridad)}</span><span class="peq suave"><b>${esc(c.autor)}</b> · ${esc(fechaHora(c.creado))} · #${esc(c.id)} · Estado: <b>${esc(C.ESTADOS[c.estado] || c.estado)}</b></span></div>
        <p class="peq suave" style="margin:6px 0 0">${esc(c.donde)}</p><p style="margin:4px 0 0;white-space:pre-line">${esc(c.texto)}</p>
        ${c.respuesta ? `<div class="com__resp"><b>Respuesta</b><p style="margin:0;white-space:pre-line">${esc(c.respuesta)}</p></div>` : ''}
        <div class="acciones" style="margin-top:8px"><label class="peq" for="ce-${esc(c.id)}">Estado</label><select id="ce-${esc(c.id)}" data-chg="com-estado" data-id="${esc(c.id)}" style="width:auto;min-height:34px">${Object.entries(C.ESTADOS).map(([k, v]) => `<option value="${k}"${c.estado === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
          <button type="button" class="btn btn--borde btn--sm" data-acc="com-responder" data-id="${esc(c.id)}">${c.respuesta ? 'Editar respuesta' : 'Responder'}</button></div></article>`).join('')
        : `<div class="vacio"><b>${(l || []).length ? 'No hay comentarios con este filtro.' : 'Aún no hay comentarios.'}</b>Usa el botón «Comentar» del borde derecho desde cualquier sección del panel.</div>`}`;
  }
  BA.rutas.comentarios = { titulo: 'Comentarios', render: renderCom };
  BA.acc['com-nuevo'] = () => C.abrir();
  BA.acc['com-filtro'] = el => { filtro = el.dataset.k; BA.refrescar(); };
  BA.chg['com-estado'] = async el => { try { await C.cambiar(el.dataset.id, { estado: el.value }); BA.toast('Estado cambiado.'); cargar(); } catch { BA.toast('No se ha podido guardar. Prueba otra vez en un momento.'); } };
  BA.acc['com-responder'] = async el => {
    const c = lista.find(x => String(x.id) === el.dataset.id);
    const r = await BA.dialogo({ titulo: 'Responder al comentario', ok: 'Guardar respuesta', html: `<p class="citado" style="white-space:pre-line">${esc(c.texto)}</p><div class="campo"><label for="cr-t">Respuesta</label><textarea id="cr-t" name="respuesta" maxlength="4000">${esc(c.respuesta)}</textarea></div>` });
    if (!r) return; try { await C.cambiar(c.id, { respuesta: r.fd.get('respuesta') }); BA.toast('Respuesta guardada.'); cargar(); } catch { BA.toast('No se ha podido guardar. Prueba otra vez en un momento.'); }
  };
  BA.acc['com-copiar'] = async () => {
    const l = (lista || []).filter(c => ['nuevo', 'en_curso'].includes(c.estado));
    const txt = l.map(c => `#${c.id} [${C.PRIORIDADES[c.prioridad] || c.prioridad}] ${c.donde}\n${c.texto}${c.respuesta ? `\n→ ${c.respuesta}` : ''}`).join('\n\n');
    try { await navigator.clipboard.writeText(txt || 'Sin comentarios abiertos.'); BA.toast(`${l.length} comentarios abiertos copiados.`); } catch { BA.toast('No se ha podido copiar.'); }
  };
  window.addEventListener('ba-comentarios', () => cargar());
  BA.cargarComentarios = cargar;
})();
