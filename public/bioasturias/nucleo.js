/* BioAsturias · Panel — núcleo: utilidades, estado guardado, rutas, panel lateral, diálogos y filtros de categorías.
   Cada módulo (brief.js, tareas.js, crm.js, envios.js, cerebro.js, otros.js) cuelga de window.BA. */
'use strict';
(() => {
  const BA = window.BA = { acc: {}, chg: {}, inp: {}, rutas: {}, filtros: {} };
  const CLAVE = 'bioasturias_estado_v1';

  // ============================== utilidades ==============================
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const p2 = n => String(n).padStart(2, '0');
  const U = BA.U = {
    p2,
    esc: s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    norm: s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
    $: (s, r = document) => r.querySelector(s),
    $$: (s, r = document) => [...r.querySelectorAll(s)],
    iso: d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`,
    dia: t => { const [y, m, d] = t.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); },
    addD: (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
    esLab: d => d.getDay() !== 0 && d.getDay() !== 6,
    sigLab: d => { let x = U.addD(d, 1); while (!U.esLab(x)) x = U.addD(x, 1); return x; },
    difDias: t => Math.round((U.dia(t) - BA.hoy) / 864e5),
    fechaLarga: d => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`,
    diaCorto: d => `${DIAS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`,
    hora: t => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; },
    cuando(t) {
      const d = new Date(t), n = U.difDias(U.iso(d));
      if (n === 0) return 'hoy ' + U.hora(t);
      if (n === -1) return 'ayer ' + U.hora(t);
      if (n > -7 && n < 0) return `${DIAS[d.getDay()].slice(0, 3)} ${U.hora(t)}`;
      return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
    },
    fechaCompleta: t => { const d = new Date(t); return `${U.diaCorto(d)} ${d.getFullYear()}, ${U.hora(t)}`; },
    hace(t) { const n = Math.round((BA.hoy - U.dia(U.iso(new Date(t)))) / 864e5); return n <= 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`; },
    venceTxt(f) {
      const n = U.difDias(f);
      if (n === 0) return 'Vence hoy'; if (n === 1) return 'Vence mañana'; if (n < 0) return `Vencido hace ${-n} d.`;
      return 'Vence ' + U.diaCorto(U.dia(f));
    },
    plural: (n, s, p) => `${n} ${n === 1 ? s : p}`,
    uid: pre => pre + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
    ic: (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`,
  };
  const FUENTES = BA.FUENTES = { outlook: ['Outlook', 'outlook'], gmail: ['Gmail', 'gmail'], onedrive: ['OneDrive', 'onedrive'], gdrive: ['Google Drive', 'gdrive'], odoo: ['Odoo', 'odoo'], calendario: ['Calendario', 'calendario'], envios: ['Envíos', 'envios'] };
  U.fuente = f => { const x = FUENTES[f] || [f, 'otra']; return `<span class="fuente fuente--${U.esc(f)}">${U.ic(x[1])}${U.esc(x[0])}</span>`; };

  // ============================== estado ==============================
  BA.ahora = new Date();
  BA.hoy = new Date(BA.ahora.getFullYear(), BA.ahora.getMonth(), BA.ahora.getDate());
  BA.hoyISO = U.iso(BA.hoy);
  BA.B = window.BA_DATOS.base(BA.hoy, BA.ahora);
  let S = { u: {}, n: {}, ui: {}, dia: BA.hoyISO };
  BA.guardadoOk = true;
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE));
    if (g && typeof g === 'object') S = { u: g.u || {}, n: g.n || {}, ui: g.ui || {}, dia: g.dia || BA.hoyISO };
  } catch { }
  // El brief es diario: al cambiar de día se olvidan los «hecho/descartado» de ayer (lo pospuesto se conserva hasta su fecha)
  if (S.dia !== BA.hoyISO) {
    const viejos = S.u.items || {}, nuevos = {};
    for (const [id, p] of Object.entries(viejos)) if (p.posponerHasta && p.posponerHasta > BA.hoyISO) nuevos[id] = p;
    S.u.items = nuevos; S.u.dudas = {}; S.dia = BA.hoyISO;
  }
  BA.S = S;
  let cache = {};
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(S)); BA.guardadoOk = true; } catch { BA.guardadoOk = false; }
  }
  BA.guardar = guardar;
  BA.lista = col => {
    if (cache[col]) return cache[col];
    const base = (BA.B[col] || []).map(o => { const p = S.u[col] && S.u[col][o.id]; return p ? (p._borrado ? null : { ...o, ...p }) : o; }).filter(Boolean);
    return cache[col] = base.concat((S.n[col] || []));
  };
  BA.get = (col, id) => BA.lista(col).find(o => o.id === id) || null;
  BA.parchear = (col, id, p) => {
    const nuevo = (S.n[col] || []).find(o => o.id === id);
    if (nuevo) Object.assign(nuevo, p);
    else { S.u[col] = S.u[col] || {}; S.u[col][id] = { ...(S.u[col][id] || {}), ...p }; }
    cache = {}; guardar();
  };
  BA.nuevo = (col, o) => { (S.n[col] = S.n[col] || []).push(o); cache = {}; guardar(); return o; };
  BA.borrar = (col, id) => {
    const i = (S.n[col] || []).findIndex(o => o.id === id);
    if (i >= 0) S.n[col].splice(i, 1); else { S.u[col] = S.u[col] || {}; S.u[col][id] = { _borrado: true }; }
    cache = {}; guardar();
  };
  BA.reiniciarCache = () => { cache = {}; };
  // Cambia campos de un elemento, avisa y permite deshacer
  BA.cambiar = (col, id, patch, msg) => {
    const o = BA.get(col, id); if (!o) return;
    const previo = {}; for (const k of Object.keys(patch)) previo[k] = o[k];
    BA.parchear(col, id, patch); BA.refrescar();
    if (msg) BA.toast(msg, { accion: 'Deshacer', fn: () => { BA.parchear(col, id, previo); BA.refrescar(); } });
  };
  BA.ui = (k, def) => S.ui[k] ?? def;
  BA.setUi = (k, v) => { S.ui[k] = v; guardar(); };

  // Accesores de uso frecuente
  BA.entidad = id => BA.get('entidades', id);
  BA.contacto = id => BA.get('contactos', id);
  BA.nombreC = c => c ? `${c.nombre} ${c.apellidos}`.trim() : '';
  BA.B.categorias.forEach(c => { c.id = 'cat-' + U.norm(c.nombre).replace(/\W+/g, '-'); });
  BA.categorias = () => BA.lista('categorias');
  BA.grupoCat = n => (BA.categorias().find(c => c.nombre === n) || { grupo: 'etiqueta' }).grupo;
  BA.catsDe = c => { const e = BA.entidad(c.entidadId); return [...new Set([...(c.cats || []), ...(e ? e.cats || [] : [])])]; };
  BA.chipCat = (n, quitar = '') => {
    const g = BA.grupoCat(n);
    const cl = g === 'tipo' ? ({ 'Adherido': 'chip--tipo-adherido', 'No socio': 'chip--tipo-no', 'Posible socio': 'chip--tipo-posible' }[n] || '') + ' chip--tipo' : g === 'tema' ? 'chip--tema' : 'chip--etiqueta';
    return `<span class="chip ${cl}">${U.esc(n)}${quitar}</span>`;
  };
  BA.chipsCats = cats => cats.map(c => BA.chipCat(c)).join('');

  // ============================== avisos ==============================
  let tTimer;
  BA.toast = (msg, o = {}) => {
    const t = U.$('#toast');
    t.innerHTML = `<span>${U.esc(msg)}</span>${o.accion ? `<button type="button">${U.esc(o.accion)}</button>` : ''}`;
    if (o.accion) t.querySelector('button').onclick = () => { t.classList.remove('on'); o.fn(); };
    t.classList.add('on'); clearTimeout(tTimer);
    tTimer = setTimeout(() => t.classList.remove('on'), o.ms || (o.accion ? 6500 : 3200));
  };

  // ============================== diálogos ==============================
  // Devuelve una promesa con {fd: FormData, accion} al enviar, o null si se cancela.
  BA.dialogo = ({ titulo, html, ok = 'Guardar', cancel = 'Cancelar', ancho = false, validar, botones = [], alAbrir }) => new Promise(res => {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal' + (ancho ? ' modal--ancho' : '');
    dlg.setAttribute('aria-labelledby', 'dlg-t');
    dlg.innerHTML = `<form method="dialog" class="modal__form" novalidate>
      <div class="modal__cab"><h2 id="dlg-t">${U.esc(titulo)}</h2><button type="button" class="btn btn--icono" data-cerrar aria-label="Cerrar">${U.ic('x')}</button></div>
      <div class="modal__cuerpo">${html}<p class="modal__err" role="alert" hidden></p></div>
      <div class="modal__pie">${cancel ? `<button type="button" class="btn btn--borde" data-cerrar>${U.esc(cancel)}</button>` : ''}
        ${botones.map(b => `<button type="submit" class="btn ${b.clase || 'btn--borde'}" value="${U.esc(b.valor)}">${U.esc(b.t)}</button>`).join('')}
        ${ok ? `<button type="submit" class="btn btn--primario" value="ok">${U.esc(ok)}</button>` : ''}</div></form>`;
    document.body.append(dlg);
    const f = dlg.querySelector('form'); let resuelto = false;
    const fin = v => { if (resuelto) return; resuelto = true; if (dlg.open) dlg.close(); dlg.remove(); res(v); };
    dlg.addEventListener('click', e => { if (e.target.closest('[data-cerrar]') || e.target === dlg) fin(null); });
    dlg.addEventListener('cancel', e => { e.preventDefault(); fin(null); });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(f), accion = e.submitter ? e.submitter.value : 'ok';
      const err = validar ? validar(fd, f, accion) : null;
      const p = U.$('.modal__err', dlg);
      if (err) { p.textContent = err; p.hidden = false; return; }
      fin({ fd, accion });
    });
    if (alAbrir) alAbrir(dlg, f);
    dlg.showModal();
    const primero = U.$('input:not([type=hidden]), select, textarea', dlg); if (primero) primero.focus();
  });
  BA.confirmar = async (titulo, texto, ok = 'Aceptar') => !!(await BA.dialogo({ titulo, html: `<p>${texto}</p>`, ok }));

  // ============================== panel lateral (drawer) ==============================
  let foco = null;
  const drawer = BA.drawer = {
    abrir(titulo, html) {
      const d = U.$('#drawer'); foco = document.activeElement;
      U.$('#drawer-t').textContent = titulo; U.$('#drawer-cuerpo').innerHTML = html;
      d.hidden = false; U.$('#velo').hidden = false; U.$('.app').inert = true;
      U.$('#drawer-cuerpo').scrollTop = 0; U.$('[data-acc="drawer-cerrar"]', d).focus();
    },
    cerrar() {
      U.$('#drawer').hidden = true; U.$('#velo').hidden = true; U.$('.app').inert = false;
      if (foco && document.contains(foco)) foco.focus(); else U.$('#contenido').focus();
    },
    abierto: () => !U.$('#drawer').hidden,
  };
  BA.acc['drawer-cerrar'] = () => drawer.cerrar();
  document.addEventListener('keydown', e => {
    if (!drawer.abierto()) return;
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) { drawer.cerrar(); return; }
    if (e.key === 'Tab') {
      const fo = U.$$('button, a[href], input, select, textarea', U.$('#drawer')).filter(x => !x.disabled && x.offsetParent !== null);
      if (!fo.length) return;
      if (e.shiftKey && document.activeElement === fo[0]) { e.preventDefault(); fo[fo.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === fo[fo.length - 1]) { e.preventDefault(); fo[0].focus(); }
    }
  });

  // ============================== rutas y navegación ==============================
  const MODULOS = [
    ['brief', 'Brief diario', 'brief'], ['tareas', 'Tareas', 'tareas'], ['crm', 'CRM', 'crm'], ['envios', 'Envíos', 'envios'],
    ['cerebro', 'Cerebro', 'cerebro'], ['fuentes', 'Fuentes', 'fuentes'], ['funcionalidades', 'Funcionalidades', 'func'], ['comentarios', 'Comentarios', 'coment'],
  ];
  BA.contadores = () => ({ brief: BA.mod.brief ? BA.mod.brief.pendientes() : 0, crm: BA.lista('detectados').filter(d => !(BA.S.ui.detectadosHechos || []).includes(d.id)).length,
    comentarios: BA.comNuevos || 0 });
  BA.mod = {};
  function pintarNav(actual) {
    const c = BA.contadores();
    const cu = k => c[k] ? `<span class="cuenta" aria-label="${c[k]} pendientes">${c[k]}</span>` : '';
    U.$('#nav-lateral').innerHTML = MODULOS.map(([k, t, ic]) => `<a href="#/${k}"${k === actual ? ' aria-current="page"' : ''}>${U.ic(ic)}<span>${t}</span>${cu(k)}</a>`).join('');
    const principales = MODULOS.slice(0, 5);
    U.$('#nav-movil').innerHTML = principales.map(([k, t, ic]) => `<a href="#/${k}"${k === actual ? ' aria-current="page"' : ''}>${U.ic(ic)}<span>${t === 'Brief diario' ? 'Brief' : t}</span>${cu(k)}</a>`).join('')
      + `<button type="button" data-acc="menu-mas">${U.ic('mas')}<span>Más</span></button>`;
  }
  BA.acc['menu-mas'] = async () => {
    const resto = MODULOS.slice(5);
    const r = await BA.dialogo({ titulo: 'Más secciones', ok: '', cancel: 'Cerrar', html: `<nav aria-label="Más secciones"><ul class="lista-simple">${resto.map(([k, t, ic]) => `<li><a href="#/${k}" data-cerrar class="btn btn--borde" style="width:100%;justify-content:flex-start">${U.ic(ic)} ${t}</a></li>`).join('')}
      <li><button type="button" class="btn btn--borde" style="width:100%;justify-content:flex-start" data-acc="restablecer" data-cerrar>Restablecer datos de ejemplo</button></li>
      <li><a class="btn btn--borde" style="width:100%;justify-content:flex-start" href="salir">Salir</a></li></ul></nav>` });
    return r;
  };

  function parsearRuta() {
    const h = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
    const mod = BA.rutas[h[0]] ? h[0] : 'brief';
    return { mod, args: h.slice(1) };
  }
  let rutaActual = null;
  BA.refrescar = (moverFoco = false) => {
    const { mod, args } = parsearRuta(); rutaActual = mod;
    const main = U.$('#contenido'), y = window.scrollY;
    const act = document.activeElement, marca = act && act.dataset ? act.dataset.foco : null;
    const r = BA.rutas[mod];
    try { main.innerHTML = r.render(args); if (r.tras) r.tras(args); }
    catch (e) { console.error(e); main.innerHTML = '<div class="aviso aviso--err" role="alert"><b>Algo ha fallado al mostrar esta sección.</b> Prueba a recargar o a restablecer los datos de ejemplo.</div>'; }
    pintarNav(mod);
    document.title = `${r.titulo} · BioAsturias Panel`;
    if (moverFoco) { main.focus(); window.scrollTo(0, 0); }
    else {
      window.scrollTo(0, y);
      if (marca) { const n = main.querySelector(`[data-foco="${CSS.escape(marca)}"]`); if (n) n.focus(); }
    }
  };
  BA.pintarNav = () => pintarNav(rutaActual);
  BA.irA = h => { if (location.hash === h) BA.refrescar(true); else location.hash = h; };
  window.addEventListener('hashchange', () => BA.refrescar(true));

  // ============================== eventos delegados ==============================
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-acc]');
    if (el && BA.acc[el.dataset.acc]) { const dlgPadre = el.closest('dialog'); if (el.hasAttribute('data-cerrar') && dlgPadre) { /* se cierra desde su propio diálogo */ } BA.acc[el.dataset.acc](el, e); }
  });
  document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && BA.chg[el.dataset.chg]) BA.chg[el.dataset.chg](el, e); });
  document.addEventListener('input', e => { const el = e.target.closest('[data-inp]'); if (el && BA.inp[el.dataset.inp]) BA.inp[el.dataset.inp](el, e); });
  // Intro dentro de los campos de «crear etiqueta» no envía el formulario del diálogo: crea la etiqueta
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('#cat-nueva, #et-n')) { e.preventDefault(); const b = e.target.parentElement.querySelector('button[data-acc]'); if (b) b.click(); } });
  document.addEventListener('submit', e => { const f = e.target.closest('[data-sub]'); if (f && BA.acc[f.dataset.sub]) { e.preventDefault(); BA.acc[f.dataset.sub](f, e); } });

  BA.acc.restablecer = async () => {
    if (!(await BA.confirmar('Restablecer datos de ejemplo', 'Se borrarán todos los cambios que hayas hecho (tareas, contactos, envíos…) y volverán los datos de ejemplo. Los comentarios enviados se conservan.', 'Restablecer'))) return;
    try { localStorage.removeItem(CLAVE); } catch { }
    location.hash = '#/brief'; location.reload();
  };

  // ============================== filtros de categorías (CRM y Envíos) ==============================
  // f = { bloques: [[cat, cat], …], tipo: '', principales: false }. Dentro de cada bloque basta cumplir una (O); entre bloques se exigen todos (Y).
  const F = BA.filtro = {
    nuevo: () => ({ bloques: [], tipo: '', principales: false }),
    limpio: f => f.bloques.filter(b => b.length),
    catsDe: c => BA.catsDe(c),
    resumen(f) {
      const bs = F.limpio(f).map(b => b.length > 1 ? `(${b.join(' O ')})` : b[0]);
      return bs.length ? bs.join(' Y ') : 'Todos los contactos';
    },
    coincide(c, f, q = '') {
      const cats = BA.catsDe(c), e = BA.entidad(c.entidadId);
      if (!F.limpio(f).every(b => b.some(x => cats.includes(x)))) return false;
      if (f.tipo && (!e || e.tipo !== f.tipo)) return false;
      if (f.principales && !c.principal) return false;
      if (q) { const t = U.norm([BA.nombreC(c), c.cargo, c.email, e ? e.nombre : ''].join(' ')); if (!q.split(/\s+/).every(w => t.includes(U.norm(w)))) return false; }
      return true;
    },
    // Dibuja el editor de filtro. `id` identifica el filtro en BA.filtros (lo registra el módulo con su f y su alCambiar).
    html(id) {
      const f = BA.filtros[id].f, cats = BA.categorias();
      const opciones = bloque => `<option value="">+ añadir categoría (O)</option>${[['tipo', 'Tipo de socio'], ['tema', 'Temática'], ['etiqueta', 'Etiquetas']].map(([g, t]) =>
        `<optgroup label="${t}">${cats.filter(c => c.grupo === g && !bloque.includes(c.nombre)).map(c => `<option>${U.esc(c.nombre)}</option>`).join('')}</optgroup>`).join('')}`;
      const tipos = [...new Set(BA.lista('entidades').map(e => e.tipo))];
      return `<div class="filtro-cats" data-fid="${id}">
        <div class="filtro-cats__t"><b>Filtrar por categorías</b><span class="suave peq">Dentro de cada bloque basta una (O); entre bloques deben cumplirse todos (Y).</span></div>
        ${f.bloques.map((b, i) => `<div class="fbloque">${i ? '<span class="fbloque__y" title="Y">Y</span>' : '<span class="fbloque__y suave">Si</span>'}
          ${b.map((c, j) => `${j ? '<span class="fbloque__o">O</span>' : ''}${BA.chipCat(c, `<button type="button" data-acc="f-quitar-cat" data-fid="${id}" data-i="${i}" data-c="${U.esc(c)}" aria-label="Quitar ${U.esc(c)}">×</button>`)}`).join('')}
          <select data-chg="f-add-cat" data-fid="${id}" data-i="${i}" aria-label="Añadir categoría al bloque ${i + 1}">${opciones(b)}</select>
          <button type="button" class="btn btn--icono" data-acc="f-quitar-bloque" data-fid="${id}" data-i="${i}" aria-label="Quitar el bloque ${i + 1}">${U.ic('x', 'ic--sm')}</button></div>`).join('')}
        <div class="acciones"><button type="button" class="btn btn--borde btn--sm" data-acc="f-bloque" data-fid="${id}">${U.ic('mas2', 'ic--sm')} ${f.bloques.length ? 'Y otra condición' : 'Añadir condición'}</button>
          <label class="lab-check peq"><input type="checkbox" data-chg="f-princ" data-fid="${id}"${f.principales ? ' checked' : ''}> Solo contactos principales</label>
          <label class="peq acciones">Tipo de entidad <select data-chg="f-tipo" data-fid="${id}" style="width:auto;min-height:32px"><option value="">Todas</option>${tipos.map(t => `<option${f.tipo === t ? ' selected' : ''}>${U.esc(t)}</option>`).join('')}</select></label>
          ${F.limpio(f).length || f.tipo || f.principales ? `<button type="button" class="btn btn--link peq" data-acc="f-limpiar" data-fid="${id}">Quitar filtros</button>` : ''}</div></div>`;
    },
  };
  const fReg = el => BA.filtros[el.dataset.fid];
  BA.acc['f-bloque'] = el => { const r = fReg(el); r.f.bloques.push([]); r.alCambiar(); };
  BA.acc['f-quitar-bloque'] = el => { const r = fReg(el); r.f.bloques.splice(+el.dataset.i, 1); r.alCambiar(); };
  BA.acc['f-quitar-cat'] = el => { const r = fReg(el), b = r.f.bloques[+el.dataset.i]; b.splice(b.indexOf(el.dataset.c), 1); r.alCambiar(); };
  BA.acc['f-limpiar'] = el => { const r = fReg(el); r.f.bloques = []; r.f.tipo = ''; r.f.principales = false; r.alCambiar(); };
  BA.chg['f-add-cat'] = el => { const r = fReg(el); if (el.value) { r.f.bloques[+el.dataset.i].push(el.value); r.alCambiar(); } };
  BA.chg['f-tipo'] = el => { const r = fReg(el); r.f.tipo = el.value; r.alCambiar(); };
  BA.chg['f-princ'] = el => { const r = fReg(el); r.f.principales = el.checked; r.alCambiar(); };

  // Edición de categorías (casillas agrupadas + etiqueta nueva) reutilizada por los formularios del CRM
  BA.htmlCats = (marcadas, nombre = 'cats') => {
    const cats = BA.categorias();
    return `<div class="cats-edit">${[['tipo', 'Tipo de socio'], ['tema', 'Temática'], ['etiqueta', 'Etiquetas personalizadas']].map(([g, t]) =>
      `<fieldset data-grupo="${g}"><legend>${t}</legend>${cats.filter(c => c.grupo === g).map(c => `<label class="lab-check"><input type="checkbox" name="${nombre}" value="${U.esc(c.nombre)}"${marcadas.includes(c.nombre) ? ' checked' : ''}> ${U.esc(c.nombre)}</label>`).join('')}</fieldset>`).join('')}
      <div class="campo" style="width:100%"><label for="cat-nueva">Crear etiqueta nueva</label><div class="acciones"><input id="cat-nueva" type="text" placeholder="Ej.: Patrocinador feria" style="flex:1;min-width:180px"><button type="button" class="btn btn--borde btn--sm" data-acc="cat-crear" data-nombre="${nombre}">Crear y marcar</button></div></div></div>`;
  };
  BA.acc['cat-crear'] = el => {
    const dlg = el.closest('dialog'), inp = U.$('#cat-nueva', dlg), n = inp.value.trim().slice(0, 40);
    if (!n) { inp.focus(); return; }
    let ya = BA.categorias().find(c => U.norm(c.nombre) === U.norm(n));
    if (!ya) { ya = BA.nuevo('categorias', { id: U.uid('cat'), nombre: n, grupo: 'etiqueta' }); }
    const fs = U.$('fieldset[data-grupo="' + ya.grupo + '"]', dlg);
    let cb = U.$$('input', fs).find(i => i.value === ya.nombre);
    if (!cb) { const l = document.createElement('label'); l.className = 'lab-check'; l.innerHTML = `<input type="checkbox" name="${U.esc(el.dataset.nombre)}" value="${U.esc(ya.nombre)}"> ${U.esc(ya.nombre)}`; fs.append(l); cb = l.querySelector('input'); }
    cb.checked = true; inp.value = ''; BA.toast(`Etiqueta «${ya.nombre}» lista.`);
  };
})();
