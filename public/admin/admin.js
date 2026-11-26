// Panel interno de llume · pestañas Cerebro, Conectar, Accesos y Equipo. Habla con la API de src/admin.js (/admin/api/...).
// Todo el texto de usuario se pinta con textContent (nunca innerHTML).
const API = '/admin/api/';
const $ = (s) => document.querySelector(s);

const estado = { yo: null, personas: [], clientes: [], vista: 'mios', editando: null };

async function llamar(ruta, opciones = {}) {
  const r = await fetch(API + ruta, {
    ...opciones,
    headers: opciones.body ? { 'Content-Type': 'application/json' } : {},
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  if (r.status === 401) { location.href = '/admin/'; throw new Error('Sesión caducada'); }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}

function el(etiqueta, atributos = {}, ...hijos) {
  const n = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const h of hijos.flat()) if (h !== null && h !== undefined && h !== false) n.append(h);
  return n;
}

const nombrePersona = (id) => estado.personas.find((p) => p.id === id)?.nombre ?? '—';
const nombreCliente = (id) => estado.clientes.find((c) => c.id === id)?.nombre ?? '—';
const hoy = () => new Date().toISOString().slice(0, 10);
const fechaCorta = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fechaDia = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

function opciones(select, lista, { vacio, ninguno, soloActivos = false } = {}) {
  const actual = select.value;
  select.replaceChildren(
    el('option', { value: '' }, vacio),
    ninguno ? el('option', { value: 'ninguno' }, ninguno) : null,
    ...lista.filter((x) => !soloActivos || (x.activo ?? x.activa) === 1).map((x) => el('option', { value: x.id }, x.nombre)),
  );
  select.value = actual;
  if (select.value !== actual) select.value = '';
}

function rellenarSelects() {
  const f = $('#filtros');
  opciones(f.cliente, estado.clientes, { vacio: 'Todos los clientes', ninguno: 'Sin cliente' });
  opciones(f.responsable, estado.personas, { vacio: 'Cualquier responsable', ninguno: 'Sin responsable' });
  const fe = $('#form-entrada');
  opciones(fe.cliente_id, estado.clientes, { vacio: '— Ninguno —', soloActivos: true });
  opciones(fe.persona_id, estado.personas, { vacio: '— Ninguna —', soloActivos: true });
  opciones(fe.responsable_id, estado.personas, { vacio: '— Sin asignar —', soloActivos: true });
  const sujeto = $('#estado-sujeto');
  const actual = sujeto.value;
  sujeto.replaceChildren(
    el('option', { value: 'general:0' }, 'General (llume)'),
    el('optgroup', { label: 'Clientes' }, estado.clientes.filter((c) => c.activo).map((c) => el('option', { value: `cliente:${c.id}` }, c.nombre))),
    el('optgroup', { label: 'Equipo' }, estado.personas.filter((p) => p.activa).map((p) => el('option', { value: `persona:${p.id}` }, p.nombre))),
  );
  if (actual) sujeto.value = actual;
}

async function cargarEtiquetas() {
  const { etiquetas } = await llamar('etiquetas');
  const sel = $('#filtros').etiqueta;
  const actual = sel.value;
  sel.replaceChildren(el('option', { value: '' }, 'Todas las etiquetas'), ...etiquetas.map((e) => el('option', { value: e.etiqueta }, `${e.etiqueta} (${e.n})`)));
  sel.value = etiquetas.some((e) => e.etiqueta === actual) ? actual : '';
  $('#lista-etiquetas').replaceChildren(...etiquetas.map((e) => el('option', { value: e.etiqueta })));
}

// ── Lista de entradas ─────────────────────────────────────────────────────────────────────────────────────────────
function tarjeta(e, { conAcciones = true } = {}) {
  const vencido = e.estado === 'open' && e.vence && e.vence < hoy();
  const meta = [
    e.cliente_id ? el('span', {}, `Cliente: ${nombreCliente(e.cliente_id)}`) : null,
    e.persona_id ? el('span', {}, `Sobre: ${nombrePersona(e.persona_id)}`) : null,
    e.tipo === 'pendiente' ? el('span', {}, `Responsable: ${e.responsable_id ? nombrePersona(e.responsable_id) : 'sin asignar'}`) : null,
    e.vence ? el('span', { class: vencido ? 'vencido' : '' }, `${vencido ? 'Venció' : 'Hasta'} el ${fechaDia(e.vence)}`) : null,
    e.motivo === 'sin_tocar' ? el('span', { class: 'vencido' }, 'Sin tocar desde hace más de 14 días') : null,
  ];
  const firma = [
    el('span', {}, `${e.sustituye_id ? 'Corregida' : 'Apuntada'} por ${nombrePersona(e.autor_id)} · ${fechaCorta(e.creada)}`),
    e.estado === 'closed' ? el('span', {}, `Cerrada por ${nombrePersona(e.cerrada_por)} · ${fechaCorta(e.cerrada)}`) : null,
  ];
  const etiquetaEstado = { open: null, closed: el('span', { class: 'chip hecha' }, 'Hecha'), superseded: el('span', { class: 'chip' }, 'Sustituida') }[e.estado];
  return el('li', { class: `entrada ${e.estado === 'closed' ? 'cerrada' : ''} ${e.estado === 'superseded' ? 'sustituida' : ''}` },
    el('div', { class: 'meta' },
      el('span', { class: `chip ${e.tipo}` }, e.tipo === 'pendiente' ? 'Pendiente' : 'Nota'),
      etiquetaEstado,
      e.etiquetas.map((t) => el('button', { type: 'button', class: 'chip etq', title: 'Filtrar por esta etiqueta', onclick: () => filtrarEtiqueta(t) }, t)),
    ),
    el('p', { class: 'texto' }, e.texto),
    e.enlaces.length ? el('ul', { class: 'enlaces' }, e.enlaces.map((u) => el('li', {}, el('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }, u)))) : null,
    el('div', { class: 'meta' }, meta),
    el('div', { class: 'meta' }, firma),
    conAcciones && e.estado !== 'superseded' ? el('div', { class: 'acciones' },
      e.estado === 'open' ? el('button', { type: 'button', class: 'mini', onclick: () => cerrar(e) }, e.tipo === 'pendiente' ? 'Hecho, cerrar' : 'Cerrar') : null,
      e.estado === 'closed' ? el('button', { type: 'button', class: 'mini', onclick: () => reabrir(e) }, 'Reabrir') : null,
      el('button', { type: 'button', class: 'mini', onclick: () => abrirFormulario(e) }, 'Corregir'),
      e.sustituye_id ? el('button', { type: 'button', class: 'mini', onclick: () => verVersiones(e) }, 'Versiones') : null,
    ) : null,
  );
}

function filtrarEtiqueta(t) {
  const f = $('#filtros');
  if (![...f.etiqueta.options].some((o) => o.value === t)) f.etiqueta.append(el('option', { value: t }, t));
  f.etiqueta.value = t;
  if (estado.vista === 'revision' || estado.vista === 'mios') return cambiarVista('activas');
  cargarLista();
}

async function cargarLista() {
  const lista = $('#lista');
  let entradas;
  try {
    if (estado.vista === 'revision') {
      ({ entradas } = await llamar('revision'));
    } else {
      const p = new URLSearchParams({ vista: estado.vista === 'mios' ? 'activas' : estado.vista });
      for (const [k, v] of new FormData($('#filtros'))) if (v) p.set(k, v);
      // «Mis pendientes»: pendientes abiertos de los que soy responsable (manda sobre los filtros de tipo y responsable)
      if (estado.vista === 'mios') { p.set('tipo', 'pendiente'); p.set('responsable', estado.yo.id); }
      ({ entradas } = await llamar(`entradas?${p}`));
    }
  } catch (err) {
    lista.replaceChildren(el('li', { class: 'error' }, err.message));
    return;
  }
  lista.replaceChildren(...entradas.map((e) => tarjeta(e)));
  $('#vacio').hidden = entradas.length > 0;
}

async function contarContadores() {
  try {
    const c = await llamar('contadores');
    for (const k of ['mios', 'activas', 'hechas', 'revision']) $(`#n-${k}`).textContent = c[k] || '';
  } catch { /* los contadores son secundarios */ }
}

async function reabrir(e) {
  try { await llamar(`entradas/${e.id}/reabrir`, { method: 'POST' }); } catch (err) { alert(err.message); }
  await Promise.all([cargarLista(), contarContadores()]);
}

async function cerrar(e) {
  if (!confirm('¿Cerrar esta entrada? Saldrá de las activas, pero no se borra.')) return;
  try { await llamar(`entradas/${e.id}/cerrar`, { method: 'POST' }); } catch (err) { alert(err.message); }
  await Promise.all([cargarLista(), contarContadores()]);
}

async function verVersiones(e) {
  const { versiones } = await llamar(`entradas/${e.id}/versiones`);
  $('#versiones').replaceChildren(...versiones.map((v) => tarjeta(v, { conAcciones: false })));
  $('#dlg-versiones').showModal();
}

// ── Formulario de nueva entrada / corrección ──────────────────────────────────────────────────────────────────────
function actualizarTipo() {
  const f = $('#form-entrada');
  f.querySelector('.solo-pendiente').hidden = f.tipo.value !== 'pendiente';
}

function abrirFormulario(e = null) {
  const f = $('#form-entrada');
  estado.editando = e;
  f.reset();
  $('#form-error').textContent = '';
  $('#form-titulo').textContent = e ? 'Corregir (se guarda como versión nueva; la anterior queda en el historial)' : 'Nueva entrada';
  if (e) {
    f.tipo.value = e.tipo;
    f.texto.value = e.texto;
    f.cliente_id.value = e.cliente_id ?? '';
    f.persona_id.value = e.persona_id ?? '';
    f.responsable_id.value = e.responsable_id ?? '';
    f.vence.value = e.vence ?? '';
    f.etiquetas.value = e.etiquetas.join(', ');
    f.enlaces.value = e.enlaces.join('\n');
  } else {
    f.responsable_id.value = String(estado.yo.id);
  }
  $('#cuenta').textContent = f.texto.value.length;
  actualizarTipo();
  f.hidden = false;
  f.texto.focus();
  f.scrollIntoView({ block: 'nearest' });
}

async function guardarEntrada(ev) {
  ev.preventDefault();
  const f = ev.target;
  const tipo = f.tipo.value;
  const cuerpo = {
    tipo,
    texto: f.texto.value,
    cliente_id: f.cliente_id.value || null,
    persona_id: f.persona_id.value || null,
    responsable_id: tipo === 'pendiente' ? f.responsable_id.value || null : null,
    vence: f.vence.value || null,
    etiquetas: f.etiquetas.value.split(',').map((t) => t.trim()).filter(Boolean),
    enlaces: f.enlaces.value.split('\n').map((t) => t.trim()).filter(Boolean),
  };
  try {
    if (estado.editando) await llamar(`entradas/${estado.editando.id}/corregir`, { method: 'POST', body: cuerpo });
    else await llamar('entradas', { method: 'POST', body: cuerpo });
  } catch (err) {
    $('#form-error').textContent = err.message;
    return;
  }
  f.hidden = true;
  estado.editando = null;
  await Promise.all([cargarLista(), cargarEtiquetas(), contarContadores()]);
}

// ── Estado actual ─────────────────────────────────────────────────────────────────────────────────────────────────
async function cargarEstado() {
  const [tipo, id] = $('#estado-sujeto').value.split(':');
  $('#estado-error').textContent = '';
  const { historial } = await llamar(`estados?sujeto_tipo=${tipo}&sujeto_id=${id}`);
  const vigente = historial[0];
  $('#estado-texto').value = vigente?.texto ?? '';
  $('#estado-cuenta').textContent = $('#estado-texto').value.length;
  $('#estado-meta').textContent = vigente ? `Último cambio: ${nombrePersona(vigente.autor_id)}, ${fechaCorta(vigente.creado)}` : 'Sin estado todavía';
  $('#estado-historial').replaceChildren(...historial.slice(1).map((h) => el('li', { class: 'entrada' },
    el('p', { class: 'texto' }, h.texto || '(vacío)'),
    el('div', { class: 'meta' }, el('span', {}, `${nombrePersona(h.autor_id)} · ${fechaCorta(h.creado)}`)),
  )));
  if (historial.length <= 1) $('#estado-historial').append(el('li', { class: 'vacio' }, 'Sin versiones anteriores.'));
}

async function guardarEstado() {
  const [tipo, id] = $('#estado-sujeto').value.split(':');
  try {
    await llamar('estados', { method: 'POST', body: { sujeto_tipo: tipo, sujeto_id: Number(id), texto: $('#estado-texto').value } });
  } catch (err) {
    $('#estado-error').textContent = err.message;
    return;
  }
  await cargarEstado();
}

// ── Clientes ──────────────────────────────────────────────────────────────────────────────────────────────────────
function pintarClientes() {
  $('#lista-clientes').replaceChildren(...estado.clientes.map((c) => el('li', { class: `entrada ${c.activo ? '' : 'cerrada'}` },
    el('div', { class: 'fila' },
      el('strong', { class: 'crece' }, c.nombre, c.activo ? '' : ' (archivado)'),
      el('button', { type: 'button', class: 'mini', onclick: () => renombrarCliente(c) }, 'Renombrar'),
      el('button', { type: 'button', class: 'mini', onclick: () => cambiarCliente(c, { activo: !c.activo }) }, c.activo ? 'Archivar' : 'Reactivar'),
    ),
  )));
}

async function recargarSesion() {
  const s = await llamar('sesion');
  Object.assign(estado, { yo: s.yo, personas: s.personas, clientes: s.clientes, mcp: s.mcp });
  rellenarSelects();
  pintarClientes();
}

async function cambiarCliente(c, cambios) {
  $('#cliente-error').textContent = '';
  try { await llamar(`clientes/${c.id}`, { method: 'PATCH', body: cambios }); } catch (err) { $('#cliente-error').textContent = err.message; return; }
  await recargarSesion();
}

function renombrarCliente(c) {
  const nombre = prompt('Nuevo nombre', c.nombre);
  if (nombre && nombre.trim() !== c.nombre) cambiarCliente(c, { nombre });
}

async function crearCliente(ev) {
  ev.preventDefault();
  $('#cliente-error').textContent = '';
  try { await llamar('clientes', { method: 'POST', body: { nombre: ev.target.nombre.value } }); } catch (err) { $('#cliente-error').textContent = err.message; return; }
  ev.target.reset();
  await recargarSesion();
}

// ── Vistas ────────────────────────────────────────────────────────────────────────────────────────────────────────
function cambiarVista(vista) {
  estado.vista = vista;
  for (const b of document.querySelectorAll('.vistas button')) b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
  const esLista = ['mios', 'activas', 'hechas', 'todo', 'revision'].includes(vista);
  $('#sec-lista').hidden = !esLista;
  $('#sec-estado').hidden = vista !== 'estado';
  $('#sec-clientes').hidden = vista !== 'clientes';
  $('#filtros').hidden = vista === 'revision';
  $('#filtros').tipo.disabled = $('#filtros').responsable.disabled = vista === 'mios';
  const aviso = $('#aviso-revision');
  aviso.hidden = vista !== 'revision';
  aviso.textContent = 'Pendientes abiertos que ya vencieron o que nadie ha tocado en más de 14 días. Repásalos cada semana: ciérralos, corrígelos o reasígnalos.';
  if (esLista) cargarLista();
  if (vista === 'estado') cargarEstado();
}

// ── Conectar ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function copiar(input, boton) {
  try { await navigator.clipboard.writeText(input.value); } catch { input.select(); return; }
  const antes = boton.textContent;
  boton.textContent = 'Copiado';
  setTimeout(() => { boton.textContent = antes; }, 1500);
}

function pintarConectar() {
  $('#url-mcp').value = estado.mcp;
  $('#cmd-claude-code').textContent = `claude mcp add --transport http cerebro-llume ${estado.mcp}`;
}

// ── Accesos ───────────────────────────────────────────────────────────────────────────────────────────────────────
const fechaSeg = (s) => (s ? fechaCorta(new Date(s * 1000).toISOString()) : '—');

async function cargarAccesos() {
  $('#accesos-error').textContent = '';
  let conexiones;
  let ahoraSeg;
  try { ({ conexiones, ahora: ahoraSeg } = await llamar('conexiones')); } catch (err) { $('#accesos-error').textContent = err.message; return; }
  const filas = conexiones.map((c) => {
    const caducada = !c.revocada && c.refresh_caduca < ahoraSeg;
    const estadoTxt = c.revocada ? `Revocada por ${nombrePersona(c.revocada_por)} · ${fechaSeg(c.revocada)}` : caducada ? 'Caducada (60 días sin renovar)' : 'Activa';
    return el('li', { class: `entrada ${c.revocada || caducada ? 'cerrada' : ''}` },
      el('div', { class: 'fila' },
        el('div', { class: 'crece' },
          el('strong', {}, `${nombrePersona(c.persona_id)} · ${c.cliente}`),
          el('div', { class: 'meta' },
            el('span', {}, estadoTxt),
            el('span', {}, `Conectada: ${fechaSeg(c.creada)}`),
            el('span', {}, `Último uso: ${fechaSeg(c.ultimo_uso)}`),
          ),
        ),
        !c.revocada && !caducada ? el('button', { type: 'button', class: 'mini', onclick: () => revocar(c) }, 'Revocar') : null,
      ));
  });
  $('#lista-conexiones').replaceChildren(...(filas.length ? filas : [el('li', { class: 'vacio' }, 'Nadie ha conectado todavía un asistente.')]));
  await cargarAuditoria();
}

async function revocar(c) {
  if (!confirm(`¿Revocar el acceso de ${c.cliente} (${nombrePersona(c.persona_id)})? Dejará de funcionar al momento.`)) return;
  try { await llamar(`conexiones/${c.id}/revocar`, { method: 'POST' }); } catch (err) { $('#accesos-error').textContent = err.message; }
  await cargarAccesos();
}

async function cargarAuditoria() {
  const persona = $('#auditoria-persona').value;
  const { auditoria } = await llamar(`auditoria${persona ? `?persona=${persona}` : ''}`);
  const filas = auditoria.map((a) => el('li', { class: 'entrada' },
    el('div', { class: 'meta' },
      el('span', {}, fechaSeg(a.creado)),
      el('span', {}, nombrePersona(a.persona_id)),
      el('span', {}, a.cliente || ''),
      el('strong', {}, a.herramienta),
      a.ok ? null : el('span', { class: 'mal' }, `Error: ${a.error}`),
    ),
    a.argumentos !== '{}' ? el('code', {}, a.argumentos) : null,
  ));
  $('#lista-auditoria').replaceChildren(...(filas.length ? filas : [el('li', { class: 'vacio' }, 'Sin actividad.')]));
}

// ── Equipo ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function cargarEquipo() {
  $('#equipo-error').textContent = '';
  let equipo;
  try { ({ equipo } = await llamar('equipo')); } catch (err) { $('#equipo-error').textContent = err.message; return; }
  $('#lista-equipo').replaceChildren(...equipo.map((p) => el('li', { class: `entrada ${p.activa ? '' : 'cerrada'}` },
    el('div', { class: 'fila' },
      el('div', { class: 'crece' },
        el('strong', {}, p.nombre, p.id === estado.yo.id ? ' (tú)' : ''),
        el('div', { class: 'meta' },
          el('span', {}, !p.activa ? 'Desactivada' : p.tiene_clave ? 'Cuenta activa' : 'Sin contraseña todavía'),
          p.invitacion_caduca ? el('span', {}, `Invitación pendiente hasta ${fechaSeg(p.invitacion_caduca)}`) : null,
        ),
      ),
      p.activa ? el('button', { type: 'button', class: 'mini', onclick: () => invitar(p) }, p.tiene_clave ? 'Enlace para restablecer contraseña' : 'Enlace de invitación') : null,
      p.id !== estado.yo.id ? el('button', { type: 'button', class: 'mini', onclick: () => activarPersona(p, !p.activa) }, p.activa ? 'Desactivar' : 'Reactivar') : null,
    ))));
}

async function invitar(p) {
  if (p.tiene_clave && !confirm(`${p.nombre} ya tiene contraseña. Si usa este enlace, la cambiará y se cerrarán sus sesiones en el panel. ¿Generar el enlace?`)) return;
  $('#equipo-error').textContent = '';
  let r;
  try { r = await llamar(`equipo/${p.id}/invitacion`, { method: 'POST' }); } catch (err) { $('#equipo-error').textContent = err.message; return; }
  $('#invitacion-nombre').textContent = p.nombre;
  $('#invitacion-enlace').value = r.enlace;
  $('#invitacion-generada').hidden = false;
  await cargarEquipo();
}

async function activarPersona(p, activa) {
  if (!activa && !confirm(`¿Desactivar a ${p.nombre}? Se cerrarán sus sesiones y se revocarán sus asistentes conectados. Sus notas se conservan.`)) return;
  $('#equipo-error').textContent = '';
  try { await llamar(`equipo/${p.id}`, { method: 'PATCH', body: { activa } }); } catch (err) { $('#equipo-error').textContent = err.message; return; }
  await Promise.all([cargarEquipo(), recargarSesion()]);
}

async function crearPersona(ev) {
  ev.preventDefault();
  $('#equipo-error').textContent = '';
  try { await llamar('equipo', { method: 'POST', body: { nombre: ev.target.nombre.value } }); } catch (err) { $('#equipo-error').textContent = err.message; return; }
  ev.target.reset();
  await Promise.all([cargarEquipo(), recargarSesion()]);
}

// ── Pestañas ──────────────────────────────────────────────────────────────────────────────────────────────────────
const PESTANAS = ['cerebro', 'conectar', 'accesos', 'equipo'];

function cambiarPestana(nombre) {
  if (!PESTANAS.includes(nombre)) nombre = 'cerebro';
  for (const a of document.querySelectorAll('.pestanas a')) {
    if (a.dataset.pestana === nombre) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  for (const id of PESTANAS) $(`#${id}`).hidden = id !== nombre;
  if (nombre === 'conectar') pintarConectar();
  if (nombre === 'accesos') {
    opciones($('#auditoria-persona'), estado.personas, { vacio: 'Todas' });
    cargarAccesos();
  }
  if (nombre === 'equipo') { $('#invitacion-generada').hidden = true; cargarEquipo(); }
}

async function iniciar() {
  await recargarSesion();
  $('#yo').textContent = `Hola, ${estado.yo.nombre}`;
  for (const b of document.querySelectorAll('.vistas button')) b.addEventListener('click', () => cambiarVista(b.dataset.vista));
  let espera;
  $('#filtros').addEventListener('input', () => { clearTimeout(espera); espera = setTimeout(cargarLista, 250); });
  $('#filtros').addEventListener('submit', (ev) => ev.preventDefault());
  $('#btn-nueva').addEventListener('click', () => abrirFormulario());
  $('#form-entrada').addEventListener('submit', guardarEntrada);
  $('#form-entrada').addEventListener('change', (ev) => { if (ev.target.name === 'tipo') actualizarTipo(); });
  $('#form-entrada').texto.addEventListener('input', (ev) => { $('#cuenta').textContent = ev.target.value.length; });
  $('#form-cancelar').addEventListener('click', () => { $('#form-entrada').hidden = true; estado.editando = null; });
  $('#estado-sujeto').addEventListener('change', cargarEstado);
  $('#estado-texto').addEventListener('input', (ev) => { $('#estado-cuenta').textContent = ev.target.value.length; });
  $('#estado-guardar').addEventListener('click', guardarEstado);
  $('#form-cliente').addEventListener('submit', crearCliente);
  $('#copiar-mcp').addEventListener('click', () => copiar($('#url-mcp'), $('#copiar-mcp')));
  $('#copiar-invitacion').addEventListener('click', () => copiar($('#invitacion-enlace'), $('#copiar-invitacion')));
  $('#auditoria-persona').addEventListener('change', cargarAuditoria);
  $('#form-persona').addEventListener('submit', crearPersona);
  addEventListener('hashchange', () => cambiarPestana(location.hash.slice(1)));
  cambiarPestana(location.hash.slice(1));
  cambiarVista(estado.vista);
  await Promise.all([cargarEtiquetas(), contarContadores()]);
}

iniciar().catch((err) => { document.body.prepend(el('p', { class: 'error' }, `No se pudo cargar el panel: ${err.message}`)); });
