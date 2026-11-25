/* BioAsturias · Panel — Fuentes conectadas, Funcionalidades (qué hace cada módulo) y Comentarios sobre el prototipo. */
'use strict';
(() => {
  const BA = window.BA, U = BA.U, esc = U.esc;

  // =============================== FUENTES ===============================
  const HERRAMIENTAS = [
    ['brief_de_hoy', 'Lo que tienes hoy: urgentes, agenda y pendientes'], ['contexto_entidad', 'Todo sobre una empresa o institución: contactos, historial, cuotas y notas'],
    ['contexto_proyecto', 'Estado de un proyecto: ficha, tareas, avisos y personas'], ['buscar', 'Busca en correos, documentos, notas y pendientes'],
    ['apuntar', 'Guarda una nota o un pendiente (con fecha si la tiene)'], ['corregir', 'Sustituye una nota que ya no es cierta; la vieja queda en el historial'],
    ['cerrar', 'Da por cumplido un pendiente, sin borrarlo'], ['reescribir_estado', 'Reescribe el «estado actual» de un proyecto'],
  ];
  const MAS_FUENTES = [['Microsoft Teams', 'Mensajes y reuniones de los canales de trabajo', 'Microsoft'], ['SharePoint', 'Bibliotecas de documentos de la asociación', 'Microsoft'], ['Google Calendar', 'Calendarios de Google, si algún miembro del equipo los usa', 'Google'],
    ['Dropbox', 'Carpetas compartidas con proveedores o socios', 'Otras'], ['Slack', 'Conversaciones de canales de proyecto', 'Otras'], ['Otra fuente', 'Cualquier sistema con exportación o conexión disponible', 'Otras']];
  function proximaLectura() { const d = U.esLab(BA.hoy) && BA.ahora.getHours() < 6 ? BA.hoy : U.sigLab(BA.hoy); return `${U.fechaLarga(d)}, 06:00`; }
  function renderFuentes() {
    const l = BA.lista('fuentes'), ok = l.filter(f => f.estado === 'conectada');
    const asis = BA.B.conector.asistentes;
    return `<div class="cab-pagina"><div><h1>Fuentes conectadas</h1><p>De dónde lee el cerebro. Funciona igual con Microsoft y con Google, y se pueden añadir más.</p></div>
      <button type="button" class="btn btn--primario" data-acc="fuente-anadir">${U.ic('mas2', 'ic--sm')} Añadir fuente</button></div>
      <div class="kpis"><div class="kpi"><b>${ok.length}</b><span>fuentes conectadas</span></div><div class="kpi"><b>${ok.reduce((n, f) => n + f.elementos, 0).toLocaleString('es-ES')}</b><span>elementos leídos</span></div><div class="kpi"><b>06:00</b><span>lectura diaria, de lunes a viernes</span></div><div class="kpi"><b style="font-size:1.05rem">${proximaLectura()}</b><span>próxima lectura</span></div></div>
      <section class="tarjeta por-que" aria-labelledby="pq-t"><h2 id="pq-t">Para qué se conectan</h2>
        <ol class="por-que__pasos"><li><b>Tus fuentes</b><span>Cada madrugada se leen tus correos, documentos, facturas y reuniones.</span></li>
          <li><b>El cerebro</b><span>Lo importante se guarda en su base de datos: pendientes, notas, plazos y el estado de cada proyecto.</span></li>
          <li><b>El asistente de IA (LLM)</b><span>Claude lee el cerebro a través del conector y es quien hace funcionar el panel: prepara el brief, ordena tus tareas en la matriz, redacta respuestas y te avisa de lo que se te puede olvidar.</span></li></ol>
        <p class="peq suave">Sin fuentes conectadas, el cerebro está vacío y el asistente no tiene con qué trabajar.</p></section>
      <div class="cab-seccion" style="margin-top:26px"><h2>Asistentes de IA</h2><span class="peq suave">Los LLM que usan el cerebro a través del conector</span></div>
      <div class="fuentes-rejilla" style="margin-bottom:26px">${asis.map(a => { const on = a.estado === 'conectado';
        return `<article class="tarjeta fuente-tarjeta"><div class="fuente-tarjeta__cab"><span class="llm-sello" aria-hidden="true">${esc(a.nombre[0])}</span><div style="flex:1"><h2 style="margin:0">${esc(a.nombre)}</h2><span class="peq suave">${on ? 'Conectado por ' + esc(a.quien) + ' · último uso ' + U.cuando(a.ultimo) : 'Sin conectar'}</span></div><span class="estado ${on ? '' : 'estado--no'}">${on ? 'Conectado' : 'Disponible'}</span></div>
          <p class="peq" style="margin:0">${on ? 'Lee y escribe en el cerebro con la cuenta de quien lo conectó. Cada uso queda en el registro.' : 'Se conecta con la misma dirección del conector MCP.'}</p>
          </article>`; }).join('')}</div>
      <details class="tarjeta conector" style="margin-bottom:26px"><summary><b>Conector MCP</b> <span class="peq suave">· la dirección que se añade en Claude, qué puede hacer y quién lo ha usado</span></summary>
        <div class="conector__cuerpo"><div><p class="peq suave">Cada persona entra con su cuenta. Prototipo: la dirección es de ejemplo.</p>
          <div class="conector-url"><code>${esc(BA.B.conector.url)}</code><button type="button" class="btn btn--borde btn--sm" data-acc="mcp-copiar">Copiar</button></div>
          <b class="peq">Qué puede hacer Claude con el cerebro</b><ul class="herramientas">${HERRAMIENTAS.map(([k, t]) => `<li><code>${k}</code><span>${t}</span></li>`).join('')}</ul></div>
          <div><b class="peq">Registro de accesos</b><ul class="registro">${BA.B.registro.map(r => `<li><span class="peq suave">${U.cuando(r.fecha)}</span><span><b>${esc(r.quien)}</b> · <code>${esc(r.herramienta)}</code>${r.detalle ? ` <span class="suave">${esc(r.detalle)}</span>` : ''}</span></li>`).join('')}</ul></div></div></details>
      <div class="cab-seccion"><h2>Fuentes de datos</h2><span class="peq suave">Estado simulado: en este prototipo ninguna fuente está conectada de verdad</span></div>
      <p class="peq suave" style="margin:-6px 0 14px">Odoo se queda como sistema de facturación y contabilidad, y también es de donde se importan los contactos del CRM; el panel solo lo lee.</p>
      <div class="fuentes-rejilla">${l.map(f => { const x = BA.FUENTES[f.id], on = f.estado === 'conectada';
        return `<article class="tarjeta fuente-tarjeta fuente--${esc(f.id)}"><div class="fuente-tarjeta__cab">${U.ic(x[1])}<div style="flex:1"><h2 style="margin:0">${esc(f.nombre)}</h2><span class="peq suave">${esc(f.familia)}${f.cuenta ? ' · ' + esc(f.cuenta) : ''}</span></div><span class="estado ${on ? '' : 'estado--no'}">${on ? 'Conectada' : 'Disponible'}</span></div>
          ${on ? `<p class="peq" style="margin:0"><b>Última lectura:</b> ${esc(f.ultima)} · ${f.elementos.toLocaleString('es-ES')} elementos</p>` : '<p class="peq suave" style="margin:0">Sin conectar. Mismo funcionamiento que sus equivalentes.</p>'}
          <div><b class="peq">Qué lee</b><ul>${f.lee.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
          <div class="acciones" style="margin-top:auto">${on ? `<button type="button" class="btn btn--borde btn--sm" data-acc="fuente-sync" data-id="${esc(f.id)}">Leer ahora</button><button type="button" class="btn btn--borde btn--sm" data-acc="fuente-toggle" data-id="${esc(f.id)}">Desconectar</button>` : `<button type="button" class="btn btn--primario btn--sm" data-acc="fuente-toggle" data-id="${esc(f.id)}">Conectar</button>`}</div></article>`; }).join('')}
        <article class="tarjeta fuente-tarjeta fuente-tarjeta--añadir"><h2>Añadir fuente</h2><p class="suave peq">Teams, SharePoint, otro calendario o cualquier sistema que uses mañana.</p><button type="button" class="btn btn--borde" data-acc="fuente-anadir">${U.ic('mas2', 'ic--sm')} Ver opciones</button></article></div>`;
  }
  BA.rutas.fuentes = { titulo: 'Fuentes', render: renderFuentes };
  BA.acc['mcp-copiar'] = () => BA.copiar(BA.B.conector.url, 'Dirección del conector copiada.');
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
    ['Brief diario', 'brief', 'Lo primero que abres cada mañana. Arriba, «Urgente hoy»: las cosas que no pueden esperar (lo que vence y lo que más tiempo lleva sin respuesta), más lo que tú marques como urgente con la banderita. Cada una se despliega y te dice cómo hacerla con Claude y si es 100 % automatizable o necesita tu decisión; si es automatizable, Claude la hace y la deja marcada como lista. Debajo, lo que viene en los próximos días, lo que vence hoy, los correos sin responder (aunque los marcaras como leídos) y el resto de avisos de tu correo, documentos, Odoo y calendario. A la derecha, la agenda de hoy en formato calendario y las dudas del cerebro. Cada aviso se resuelve con un clic: hecho, tarea, categorizar, posponer o descartar.',
      'Los avisos son de ejemplo y se calculan respecto a la fecha de hoy. El selector «Demo: tranquilo / normal / cargado» simula un día con 0, unos 25 o unos 50 avisos. «Que lo haga Claude» y «Copiar prompt» funcionan, pero lo que hace Claude es simulado. Lo que haces se guarda solo en este navegador.', 'Se rellenará cada madrugada con tus correos, documentos, facturas y reuniones reales, y Claude, conectado al panel, hará lo automatizable y lo dejará marcado como listo.'],
    ['Tareas', 'tareas', 'Lo que tienes que hacer, sin complicaciones: cada tarea está hecha o no. Se ven por tipo, en cuatro casillas (Hacer, Llamar, Ir y Contestar), o por proyecto (área › proyecto › subproyecto, por ejemplo Bioincubadora › Entregable 1). Las urgentes e importantes van primero. Se arrastran de una casilla a otra y se marcan como hechas con un clic.',
      'Puedes crear, editar, marcar y borrar tareas. Los datos son de ejemplo.', 'Las tareas que nazcan de tus correos llevarán su enlace al mensaje real, y Claude podrá crearlas, moverlas y cerrarlas por ti.'],
    ['CRM', 'crm', 'Tus contactos: las entidades (empresas socias, universidades, instituciones) y las personas de cada una, con uno o varios contactos principales. Cada una tiene categorías (tipo de socio, temática y etiquetas propias) que se combinan para filtrar. Cada ficha guarda el historial de correos, reuniones y envíos. Las personas nuevas que aparecen en tus correos se proponen para añadirlas: aceptar, editar o descartar.',
      'Hay unas 25 entidades y 60 contactos inventados. Puedes crear, editar y borrar contactos, entidades y etiquetas. «Sincronizar con Odoo» está simulado.', 'Se importará de Odoo (Contactos); el panel añade las categorías y el historial, que se alimentará solo de tu correo y tu calendario.'],
    ['Envíos personalizados', 'envios', 'Escribes un mensaje una vez y sale a cada persona como un correo individual («Hola Francisco…»), desde tu propia cuenta, sin copia oculta ni newsletter. Eliges los destinatarios en una tabla tipo base de datos con condiciones (por ejemplo, «Pleno derecho»), escribes con formato como en Gmail (negrita, listas, enlaces y variables como nombre o entidad), ves la vista previa de cada persona, te mandas una prueba y lo envías ya o lo programas para una fecha y hora. Después ves clics, respuestas y qué asunto funciona mejor.',
      'Todo el asistente funciona, pero el envío es simulado: no sale ningún correo y los clics y respuestas son inventados. Los programados se pueden cancelar.', 'Los correos saldrán de tu Outlook, uno a uno, y quedarán en Enviados. Las respuestas se detectarán en tu bandeja.'],
    ['Cerebro', 'cerebro', 'La memoria del panel: notas y pendientes que se guardan solos de tus correos, documentos, facturas y reuniones, agrupados por entidad o proyecto, con el «estado actual» de cada proyecto. Se busca por palabra y se filtra por categoría. Aquí casi no tienes que hacer nada: lo llenan la lectura diaria de tus fuentes y Claude, y es lo que Claude consulta para saber de qué va cada cosa.',
      'Las notas son de ejemplo. Nada se borra: lo corregido queda como «sustituida» y lo cumplido como «cumplido».', 'Será una base de datos propia a la que Claude accede a través de un conector (MCP) con tu cuenta, y cada acceso quedará registrado.'],
    ['Fuentes', 'fuentes', 'De dónde saca el panel la información (Outlook, Gmail, OneDrive, Google Drive, Odoo y el calendario) y para qué: las fuentes llenan el cerebro y Claude usa el cerebro para hacer funcionar el panel. También muestra qué asistentes de IA están conectados y, plegado, el conector MCP con lo que Claude puede hacer y quién lo ha usado. Odoo sigue siendo tu sistema de facturación y contabilidad; el panel solo lo lee.',
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
