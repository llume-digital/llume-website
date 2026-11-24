/* Nar&Co · panel de Mateo (demo). Solo español. Usa la capa de datos global NC (../datos.js).
   Sin librerías: los gráficos son SVG hechos a mano que usan variables CSS (clases .b1/.b2... en panel.css). */
'use strict';
(() => {
  const e = NC.esc;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ACTIVAS = ['pendiente', 'confirmada'];
  const TABS = ['solicitudes', 'calendario', 'stock', 'precios', 'metricas', 'comentarios', 'guia'];
  const NOMBRES = { solicitudes: 'Solicitudes', calendario: 'Calendario', stock: 'Stock', precios: 'Precios', metricas: 'Métricas', comentarios: 'Comentarios', guia: 'Guía' };
  const S = { comFiltro: 'abiertos', comLista: null, comError: false, tab: 'solicitudes', hFiltro: 'todos', hBusca: '', hMax: 15, mes: null, dia: null, per: '30', consMax: 8, consNuevas: false, borrador: null };
  { const h = new Date(NC.hoy); h.setDate(1); S.mes = h; }

  // ---------- utilidades ----------
  const fmtF = iso => NC.parse(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '');
  const fmtFL = iso => NC.parse(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const rango = r => r.desde === r.hasta ? fmtF(r.desde) : `${fmtF(r.desde)} → ${fmtF(r.hasta)}`;
  const nTipo = id => (NC.tipo(id) || { nombre: { es: id } }).nombre.es;
  const nCol = c => `${e(c.nombre)} (${e(c.codigo)}, −${c.descuento} %)`;
  const num = n => Number(n || 0).toLocaleString('es-ES');
  const pct = (a, b, d = 0) => b ? (a / b * 100).toLocaleString('es-ES', { maximumFractionDigits: d }) + ' %' : '—';
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const bicisTxt = r => r.lineas.map(l => `${l.cantidad}× ${nTipo(l.tipo)} ${l.talla}`).join(', ');
  const nBicis = r => r.lineas.reduce((a, l) => a + l.cantidad, 0);
  const tallaSug = h => h < 165 ? 'S' : h <= 180 ? 'M' : 'L';
  const hace = iso => {
    const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 6e4));
    if (m < 60) return `hace ${m} min`;
    if (m < 1440) return `hace ${Math.round(m / 60)} h`;
    const d = Math.round(m / 1440); return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  };
  const BADGE = { pendiente: 'badge--pend', confirmada: 'badge--ok', completada: 'badge--ok', rechazada: 'badge--err', cancelada: 'badge--err', presupuesto: '' };
  const badge = r => `<span class="badge ${BADGE[r.estado] || ''}">${e(NC.ESTADOS[r.estado] || r.estado)}</span>`;
  const entregaTxt = r => r.entrega === 'oviedo' ? `Entrega y recogida en Oviedo${r.direccion ? ' · ' + e(r.direccion) : ''}` : r.entrega === 'fuera' ? `Entrega fuera de Oviedo (a presupuestar)${r.direccion ? ' · ' + e(r.direccion) : ''}` : 'Recogen en el local';
  const extrasTxt = r => {
    const l = Object.entries(r.extras || {}).filter(([, n]) => n > 0).map(([id, n]) => { const x = NC.extra(id); return `${n}× ${e(x ? x.nombre.es : id)}`; });
    return l.length ? l.join(', ') : 'Ninguno (casco, luz y soporte Garmin incluidos)';
  };
  const copia = o => JSON.parse(JSON.stringify(o));

  // ---------- avisos y confirmación no bloqueante ----------
  let tToast = 0;
  function aviso(txt, tipo = '') {
    const t = $('#toast'); t.textContent = txt; t.className = 'toast on' + (tipo ? ' toast--' + tipo : '');
    clearTimeout(tToast); tToast = setTimeout(() => { t.classList.remove('on'); }, 4200);
  }
  let hojaOk = null, hojaFoco = null;
  function preguntar({ titulo, texto, ok = 'Aceptar', peligro = false, foco = 'no', alOk }) {
    const h = $('#hoja'); hojaFoco = document.activeElement; hojaOk = alOk;
    $('#hoja-t').textContent = titulo; $('#hoja-d').textContent = texto;
    $('#hoja-si').textContent = ok; $('#hoja-si').className = 'btn ' + (peligro ? 'btn--peligro' : 'btn--primario');
    h.classList.toggle('hoja--peligro', peligro); h.hidden = false;
    (foco === 'si' ? $('#hoja-si') : $('#hoja-no')).focus();
  }
  function cerrarHoja(devolverFoco = true) {
    $('#hoja').hidden = true; hojaOk = null;
    if (devolverFoco && hojaFoco && document.contains(hojaFoco)) try { hojaFoco.focus(); } catch { }
  }

  // ---------- datos derivados ----------
  function usadasDia(f) {
    const m = {};
    for (const r of NC.reservas()) if (ACTIVAS.includes(r.estado) && r.desde <= f && r.hasta >= f) for (const l of r.lineas) { (m[l.tipo] = m[l.tipo] || {})[l.talla] = ((m[l.tipo] || {})[l.talla] || 0) + l.cantidad; }
    return m;
  }
  // máximo de bicis reservadas (hoy en adelante) por tipo y talla, y el día en que ocurre
  function reservadoFuturo() {
    const hoy = NC.iso(NC.hoy), res = NC.reservas().filter(r => ACTIVAS.includes(r.estado) && r.hasta >= hoy);
    const out = {}; let fin = hoy; res.forEach(r => { if (r.hasta > fin) fin = r.hasta; });
    for (let d = hoy; d <= fin; d = NC.sumaDias(d, 1)) {
      const u = usadasDia(d);
      for (const t in u) for (const z in u[t]) { const o = (out[t] = out[t] || {}); if (!o[z] || u[t][z] > o[z].n) o[z] = { n: u[t][z], dia: d }; }
    }
    return out;
  }

  // ---------- pestañas ----------
  function cuenta() {
    const n = NC.reservas().filter(r => r.estado === 'pendiente').length, c = $('#cuenta-pend');
    c.textContent = n; c.hidden = !n;
    $('#pest-solicitudes').setAttribute('aria-label', n ? `Solicitudes, ${n} pendientes de confirmar` : 'Solicitudes');
  }
  function mostrar(tab, foco) {
    if (!TABS.includes(tab)) tab = 'solicitudes';
    S.tab = tab;
    $$('[role=tab]').forEach(b => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; });
    TABS.forEach(t => { $('#tab-' + t).hidden = t !== tab; });
    document.body.dataset.donde = NOMBRES[tab];
    $$('.p-cab__links a[href^="#"]').forEach(l => l.classList.toggle('activo', l.getAttribute('href') === '#' + tab));
    if (tab === 'guia') try { localStorage.setItem('naranco_guia_vista', '1'); } catch { }
    try { history.replaceState(null, '', '#' + tab); } catch { }
    render();
    if (foco) $('#pest-' + tab).focus();
    window.scrollTo(0, 0);
  }
  function render() { cuenta(); ({ solicitudes: rSolicitudes, calendario: rCalendario, stock: rStock, precios: rPrecios, metricas: rMetricas, comentarios: rComentarios, guia: rGuia })[S.tab](); }

  // =====================================================================
  // 1. SOLICITUDES
  // =====================================================================
  function tarjeta(r, modo) {
    const pr = r.precio || {}, sug = r.cliente.altura ? tallaSug(+r.cliente.altura) : '';
    const unaBici = nBicis(r) === 1 && sug && r.lineas[0].talla !== sug;
    const tel = String(r.cliente.telefono || '').replace(/[^\d+]/g, '');
    const ppto = modo === 'ppto';
    return `<article class="sol ${ppto ? 'sol--ppto' : ''} ${r.respondido ? 'sol--resp' : ''}" aria-label="Solicitud ${e(r.id)} de ${e(r.cliente.nombre)}">
      <div class="sol__cab"><span><b>${e(r.id)}</b> · ${hace(r.creada)}</span>${ppto ? `<span class="badge">${r.respondido ? 'Respondido' : 'Presupuesto'}</span>` : '<span class="badge badge--pend">Pendiente de confirmar</span>'}</div>
      <p class="sol__fechas">${e(rango(r))}</p>
      <p class="sol__dias">${r.dias} ${r.dias === 1 ? 'día' : 'días'}${ppto ? ' · ' + (pr.motivo === 'dias' ? '5 días o más' : 'Entrega fuera de Oviedo') : ''}</p>
      <ul class="sol__bicis">${r.lineas.map(l => `<li>${l.cantidad}× ${e(nTipo(l.tipo))} · talla ${e(l.talla)}</li>`).join('')}</ul>
      <dl class="sol__dl">
        <div><dt>Cliente</dt><dd><b>${e(r.cliente.nombre)}</b><br><a href="tel:${e(tel)}">${e(r.cliente.telefono)}</a> · <a href="mailto:${e(r.cliente.email)}">${e(r.cliente.email)}</a></dd></div>
        <div><dt>Altura</dt><dd>${r.cliente.altura ? `${e(r.cliente.altura)} cm · talla sugerida ${sug}` : '—'}${unaBici ? ` <span class="alerta-t">· pide ${e(r.lineas[0].talla)}</span>` : ''}</dd></div>
        <div><dt>Extras</dt><dd>${extrasTxt(r)}</dd></div>
        <div><dt>Entrega</dt><dd>${entregaTxt(r)}</dd></div>
        ${r.colectivo ? `<div><dt>Colectivo</dt><dd>${nCol(r.colectivo)}${pr.descuentoColectivo ? ` · ahorra ${e(NC.eur(pr.descuentoColectivo))}` : ''}</dd></div>` : ''}
        <div><dt>Idioma</dt><dd>${r.idioma === 'en' ? 'Inglés' : 'Español'}</dd></div>
      </dl>
      ${ppto ? `<p class="sol__dias" style="margin:0 0 14px">${pr.motivo === 'dias' ? 'Hay que preparar una oferta personalizada para más de 4 días.' : 'Hay que presupuestar la entrega fuera de Oviedo.'}</p>
        <div class="sol__acc sol__acc--uno">${r.respondido ? `<button type="button" class="btn btn--borde" data-acc="no-respondido" data-id="${e(r.id)}">Deshacer «respondido»</button>` : `<button type="button" class="btn btn--primario btn--lg" data-acc="respondido" data-id="${e(r.id)}">Marcar como respondido</button>`}</div>`
      : `<div class="sol__din"><div><span>Total</span><b class="num">${e(NC.eur(r.total))}</b></div><div><span>Señal retenida</span><b class="num">${e(NC.eur(r.senal))}</b></div></div>
        <div class="sol__acc"><button type="button" class="btn btn--primario btn--lg" data-acc="confirmar" data-id="${e(r.id)}">Confirmar</button><button type="button" class="btn btn--borde btn--lg" data-acc="rechazar" data-id="${e(r.id)}">Rechazar</button></div>`}
    </article>`;
  }
  function filasHist() {
    const q = norm(S.hBusca);
    return NC.reservas().filter(r => (S.hFiltro === 'todos' || r.estado === S.hFiltro) && (!q || norm([r.id, r.cliente.nombre, r.cliente.email, r.cliente.telefono, bicisTxt(r), r.desde].join(' ')).includes(q)));
  }
  function htmlHist() {
    const f = filasHist(), ver = f.slice(0, S.hMax);
    if (!f.length) return '<p class="vacio"><b>Sin resultados.</b> Prueba con otro estado o con otra búsqueda.</p>';
    return `<table class="tabla tabla--apilada"><thead><tr><th>Reserva</th><th>Cliente</th><th>Fechas</th><th>Bicis</th><th class="r">Total</th><th>Estado</th></tr></thead><tbody>${ver.map(r => `<tr>
      <td>${e(r.id)}<small>${e(r.creada.slice(0, 10).split('-').reverse().join('/'))}</small></td>
      <td>${e(r.cliente.nombre)}</td><td>${e(rango(r))}<small>${r.dias} ${r.dias === 1 ? 'día' : 'días'}</small></td><td>${e(bicisTxt(r))}</td>
      <td class="r num">${r.estado === 'presupuesto' ? '—' : e(NC.eur(r.total))}</td>
      <td>${badge(r)}${r.estado === 'presupuesto' && r.respondido ? '<small>Respondido</small>' : ''}</td></tr>`).join('')}</tbody></table>
      <p class="nota-pie">Mostrando ${ver.length} de ${f.length}.</p>
      ${f.length > ver.length ? '<div class="hist-mas"><button type="button" class="btn btn--borde" data-acc="hist-mas">Ver más</button></div>' : ''}`;
  }
  function rSolicitudes() {
    const rs = NC.reservas(), hoy = NC.iso(NC.hoy);
    const pend = rs.filter(r => r.estado === 'pendiente').sort((a, b) => a.desde.localeCompare(b.desde) || a.creada.localeCompare(b.creada));
    const ppto = rs.filter(r => r.estado === 'presupuesto' && r.hasta >= hoy).sort((a, b) => (a.respondido ? 1 : 0) - (b.respondido ? 1 : 0) || b.creada.localeCompare(a.creada));
    const señal = pend.reduce((a, r) => a + r.senal, 0);
    $('#tab-solicitudes').innerHTML = `
      <div class="p-bloque">
        <h2>Pendientes de confirmar ${pend.length ? `<span class="badge badge--pend">${pend.length}</span>` : ''}</h2>
        <p class="p-sub">${pend.length ? `La señal de cada una está retenida (${e(NC.eur(señal))} en total) hasta que confirmes. Si rechazas, se libera.` : 'Todo al día.'}</p>
        ${pend.length ? `<div class="sols">${pend.map(r => tarjeta(r, 'pend')).join('')}</div>` : '<p class="vacio"><b>No hay solicitudes pendientes.</b> Cuando entre una reserva nueva aparecerá aquí.</p>'}
      </div>
      <div class="p-bloque">
        <h2>Presupuestos ${ppto.filter(r => !r.respondido).length ? `<span class="badge">${ppto.filter(r => !r.respondido).length}</span>` : ''}</h2>
        <p class="p-sub">Alquileres de 5 días o más, o con entrega fuera de Oviedo: hay que contestar con una oferta.</p>
        ${ppto.length ? `<div class="sols">${ppto.map(r => tarjeta(r, 'ppto')).join('')}</div>` : '<p class="vacio"><b>No hay presupuestos por responder.</b></p>'}
      </div>
      <div class="p-bloque">
        <h2>Historial</h2>
        <div class="filtros">
          <div class="campo"><label for="h-estado">Estado</label><select id="h-estado"><option value="todos">Todos</option>${Object.entries(NC.ESTADOS).map(([k, v]) => `<option value="${k}"${S.hFiltro === k ? ' selected' : ''}>${e(v)}</option>`).join('')}</select></div>
          <div class="campo"><label for="h-busca">Buscar</label><input id="h-busca" type="search" placeholder="Nombre, email, teléfono o nº de reserva" autocomplete="off" value="${e(S.hBusca)}"></div>
        </div>
        <div id="hist-lista" aria-live="polite">${htmlHist()}</div>
      </div>`;
  }
  function accionReserva(acc, id) {
    const r = NC.reserva(id); if (!r) return;
    if (acc === 'confirmar') preguntar({
      titulo: `¿Confirmar la reserva de ${r.cliente.nombre}?`, texto: `${rango(r)} · ${bicisTxt(r)}. Se cobrará la señal retenida de ${NC.eur(r.senal)}.`, ok: 'Sí, confirmar', foco: 'si',
      alOk: () => { NC.cambiarEstado(id, 'confirmada'); aviso(`Reserva ${id} confirmada. Señal de ${NC.eur(r.senal)} cobrada.`); render(); },
    });
    if (acc === 'rechazar') preguntar({
      titulo: `¿Rechazar la reserva de ${r.cliente.nombre}?`, texto: `Se liberará la retención de ${NC.eur(r.senal)} y las bicis quedarán libres para esas fechas.`, ok: 'Sí, rechazar', peligro: true,
      alOk: () => { NC.cambiarEstado(id, 'rechazada'); aviso(`Reserva ${id} rechazada. Retención liberada.`); render(); },
    });
    if (acc === 'respondido') { NC.marcarRespondido(id, true); aviso(`Presupuesto ${id} marcado como respondido.`); render(); }
    if (acc === 'no-respondido') { NC.marcarRespondido(id, false); render(); }
  }

  // =====================================================================
  // 2. CALENDARIO
  // =====================================================================
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nivel = o => { if (!o.total || !o.usadas) return 0; const x = o.usadas / o.total; return x < .34 ? 1 : x < .67 ? 2 : 3; };
  function rCalendario() {
    const y = S.mes.getFullYear(), m = S.mes.getMonth(), hoy = NC.iso(NC.hoy);
    const primero = new Date(y, m, 1), lead = (primero.getDay() + 6) % 7, n = new Date(y, m + 1, 0).getDate(), celdas = Math.ceil((lead + n) / 7) * 7;
    let cel = '';
    for (let i = 0; i < celdas; i++) {
      const d = new Date(y, m, 1 - lead + i), f = NC.iso(d), fuera = d.getMonth() !== m, o = NC.ocupacion(f), bl = NC.diaBloqueado(f);
      const nv = bl ? 'bloq' : nivel(o);
      const cls = `cdia cdia--${nv}${fuera ? ' cdia--fuera' : ''}${f < hoy ? ' cdia--pasado' : ''}${f === hoy ? ' cdia--hoy' : ''}`;
      cel += `<button type="button" class="${cls}" data-dia="${f}" aria-pressed="${S.dia === f}" aria-label="${e(fmtFL(f))}: ${bl ? 'bloqueado, no atiendes' : `${o.usadas} de ${o.total} bicis fuera`}"><b>${d.getDate()}</b><small>${bl ? 'cerrado' : `${o.usadas}/${o.total}`}</small></button>`;
    }
    $('#tab-calendario').innerHTML = `
      <h2>Calendario de ocupación</h2>
      <p class="p-sub">Cada día muestra las bicis fuera sobre el total. Toca un día para ver el detalle.</p>
      <div class="cal-wrap"><div>
        <div class="cal-p">
          <div class="cal-p__cab"><button type="button" class="cal-p__nav" data-acc="mes-ant" aria-label="Mes anterior">‹</button><h2 aria-live="polite">${MESES[m]} ${y}</h2><button type="button" class="cal-p__nav" data-acc="mes-sig" aria-label="Mes siguiente">›</button></div>
          <div class="cal-p__sem" aria-hidden="true">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => `<span>${x}</span>`).join('')}</div>
          <div class="cal-p__dias">${cel}</div>
          <ul class="leyenda"><li><i></i>Libre</li><li><i style="--c:var(--verde)"></i>Poca ocupación</li><li><i style="--c:var(--aviso)"></i>Media</li><li><i style="--c:var(--error)"></i>Casi lleno</li><li><i style="--c:var(--texto)"></i>Bloqueado</li></ul>
          <div class="cal-p__pie"><button type="button" class="btn btn--borde btn--sm" data-acc="mes-hoy">Ir a hoy</button></div>
        </div></div>
        <div id="dia-det">${S.dia ? htmlDia(S.dia) : '<div class="vacio"><b>Elige un día.</b> Verás las reservas, las bicis libres por tipo y talla, y podrás bloquearlo si no puedes atender.</div>'}</div>
      </div>`;
  }
  function htmlDia(f) {
    const cfg = NC.config(), st = NC.stock(), u = usadasDia(f), bl = NC.diaBloqueado(f), hoy = NC.iso(NC.hoy);
    const rs = NC.reservas().filter(r => r.desde <= f && r.hasta >= f && ACTIVAS.includes(r.estado));
    const o = NC.ocupacion(f);
    return `<div class="dia-det" id="dia-det-in" tabindex="-1">
      <div class="dia-det__cab"><div><h3>${e(fmtFL(f))}</h3><span>${o.usadas} de ${o.total} bicis fuera · ${rs.length} ${rs.length === 1 ? 'reserva' : 'reservas'}</span></div>${bl ? '<span class="badge badge--err">Día bloqueado</span>' : ''}</div>
      ${bl ? '<div class="aviso aviso--err" style="margin-top:0"><b>La web no ofrece este día.</b> Los clientes lo ven deshabilitado en el calendario de reserva.</div>' : ''}
      <h3>Reservas</h3>
      ${rs.length ? `<ul class="lista-res">${rs.map(r => `<li><div><b>${e(r.cliente.nombre)}</b> <span class="num">· ${e(r.id)}</span><small>${e(bicisTxt(r))} · ${e(rango(r))}</small></div><div>${badge(r)}</div></li>`).join('')}</ul>` : '<p class="p-sub">Ninguna reserva este día.</p>'}
      <h3>Bicis libres (libres / total)</h3>
      <table class="tabla tabla--libres"><thead><tr><th>Tipo</th>${cfg.tallas.map(t => `<th>${e(t)}</th>`).join('')}</tr></thead><tbody>${cfg.tipos.map(t => `<tr><td><b>${e(t.nombre.es)}</b></td>${cfg.tallas.map(z => { const tot = (st[t.id] || {})[z] || 0, lib = Math.max(0, tot - ((u[t.id] || {})[z] || 0)); return `<td class="num ${tot && !lib ? 'libre-0' : lib ? 'libre-ok' : ''}">${lib} / ${tot}</td>`; }).join('')}</tr>`).join('')}</tbody></table>
      <div style="margin-top:18px">${f < hoy ? '<p class="p-sub">Este día ya ha pasado.</p>' : bl
        ? `<button type="button" class="btn btn--primario btn--block btn--lg" data-acc="desbloquear" data-dia="${f}">Desbloquear este día</button>`
        : `<button type="button" class="btn btn--borde btn--block btn--lg" data-acc="bloquear" data-dia="${f}">No puedo atender este día</button><p class="ayuda">Al bloquearlo, los clientes no podrán reservarlo en la web.</p>`}</div>
    </div>`;
  }
  function accionDia(acc, f) {
    const cfg = NC.config(), set = new Set(cfg.diasBloqueados);
    if (acc === 'bloquear') {
      set.add(f); const n = NC.reservas().filter(r => r.desde <= f && r.hasta >= f && ACTIVAS.includes(r.estado)).length;
      aviso(n ? `Día bloqueado. Ojo: ya tiene ${n} ${n === 1 ? 'reserva' : 'reservas'}, no se cancelan solas.` : 'Día bloqueado: la web ya no lo ofrece.', n ? 'aviso' : '');
    } else { set.delete(f); aviso('Día desbloqueado.'); }
    cfg.diasBloqueados = [...set].sort(); NC.guardarConfig(cfg); rCalendario();
    const b = $(`[data-dia="${f}"]`); if (b) b.focus();
  }

  // =====================================================================
  // 3. STOCK
  // =====================================================================
  const MAXSTK = 20;
  function avisosStock() {
    const st = NC.stock(), rf = reservadoFuturo(), l = [];
    NC.config().tipos.forEach(t => NC.config().tallas.forEach(z => { const r = (rf[t.id] || {})[z], s = (st[t.id] || {})[z] || 0; if (r && r.n > s) l.push(`<li><b>${e(t.nombre.es)} ${e(z)}</b>: tienes ${s} y hay reservas futuras que necesitan ${r.n} (el ${e(fmtF(r.dia))}).</li>`); }));
    return l.length ? `<div class="aviso aviso--err" role="alert"><b>Stock por debajo de lo ya reservado</b><ul>${l.join('')}</ul><p>Las reservas siguen en pie: revisa si puedes cumplirlas o contacta con esos clientes.</p></div>` : '';
  }
  function rStock() {
    const cfg = NC.config(), st = NC.stock(), rf = reservadoFuturo();
    const total = cfg.tipos.reduce((a, t) => a + cfg.tallas.reduce((b, z) => b + ((st[t.id] || {})[z] || 0), 0), 0);
    $('#tab-stock').innerHTML = `
      <h2>Stock de bicis</h2>
      <p class="p-sub">Unidades que tienes de cada tipo y talla (${total} en total). Los cambios se guardan al momento y la web los usa en seguida.</p>
      <div id="stock-avisos">${avisosStock()}</div>
      <table class="tabla tabla--stock"><thead><tr><th scope="col">Tipo</th>${cfg.tallas.map(z => `<th scope="col">Talla ${e(z)}</th>`).join('')}</tr></thead><tbody>${cfg.tipos.map(t => `<tr><td>${e(t.nombre.es)}<small>${cfg.tallas.reduce((a, z) => a + ((st[t.id] || {})[z] || 0), 0)} uds</small></td>${cfg.tallas.map(z => {
        const n = (st[t.id] || {})[z] || 0, r = (rf[t.id] || {})[z], mal = r && r.n > n;
        return `<td><div class="stk" role="group" aria-label="${e(t.nombre.es)} talla ${e(z)}"><button type="button" data-acc="stock" data-t="${e(t.id)}" data-z="${e(z)}" data-d="-1" aria-label="Quitar una ${e(t.nombre.es)} talla ${e(z)}"${n <= 0 ? ' disabled' : ''}>−</button><output aria-live="polite">${n}</output><button type="button" data-acc="stock" data-t="${e(t.id)}" data-z="${e(z)}" data-d="1" aria-label="Añadir una ${e(t.nombre.es)} talla ${e(z)}"${n >= MAXSTK ? ' disabled' : ''}>+</button></div><span class="stk-res${mal ? ' mal' : ''}">${r ? `reservadas: ${r.n}` : 'sin reservas'}</span></td>`;
      }).join('')}</tr>`).join('')}</tbody></table>
      <p class="nota-pie">«Reservadas» es el máximo de bicis que coinciden el mismo día en reservas pendientes o confirmadas, de hoy en adelante.</p>`;
  }
  function accionStock(b) {
    const st = NC.stock(), t = b.dataset.t, z = b.dataset.z, d = +b.dataset.d;
    const nuevo = Math.max(0, Math.min(MAXSTK, ((st[t] || {})[z] || 0) + d));
    (st[t] = st[t] || {})[z] = nuevo; NC.guardarStock(st);
    const r = (reservadoFuturo()[t] || {})[z];
    if (d < 0 && r && r.n > nuevo) aviso(`Ojo: ${nTipo(t)} ${z} queda en ${nuevo} y hay reservas futuras que necesitan ${r.n}.`, 'aviso');
    else aviso(`${nTipo(t)} ${z}: ${nuevo} ${nuevo === 1 ? 'unidad' : 'unidades'}. Guardado.`);
    rStock(); cuenta();
    const nb = $(`[data-acc=stock][data-t="${t}"][data-z="${z}"][data-d="${d}"]`); (nb && !nb.disabled ? nb : $(`[data-acc=stock][data-t="${t}"][data-z="${z}"][data-d="${-d}"]`))?.focus();
  }

  // =====================================================================
  // 4. PRECIOS Y EXTRAS
  // =====================================================================
  const inp = (id, val, { u = '', min = 0, max = '', step = '0.5', dis = false, tipo = 'number', label = '' } = {}) => `<div class="campo"><label for="${id}">${label}</label><div class="inp-eur"${u ? ` data-u="${u}"` : ''}><input id="${id}" name="${id}" type="${tipo}" ${tipo === 'number' ? `inputmode="decimal" min="${min}" ${max !== '' ? `max="${max}"` : ''} step="${step}"` : ''} value="${e(val)}"${dis ? ' disabled' : ''}></div></div>`;
  function rPrecios() {
    if (!S.borrador) S.borrador = copia(NC.config());
    const c = S.borrador;
    $('#tab-precios').innerHTML = `
      <h2>Precios y extras</h2>
      <p class="nota-demo" role="note">En la demo los cambios se guardan solo en este navegador.</p>
      <form id="form-precios" novalidate>
        <fieldset class="fs"><legend>Precio por día de cada bici</legend><div class="grid-auto">${c.tipos.map((t, i) => inp(`p-tipo-${i}`, t.precio, { u: '€', label: e(t.nombre.es) })).join('')}</div></fieldset>
        <fieldset class="fs"><legend>Descuento por día (se resta al precio de ese día)</legend><div class="grid-auto">${[1, 2, 3].map(i => inp(`p-desc-${i}`, c.descuentos[i] ?? 0, { u: '€', label: `${i + 1}.º día` })).join('')}</div><p class="ayuda" style="margin-top:-4px;margin-bottom:12px">Con 5 días o más, el precio no se calcula y la reserva entra como presupuesto.</p></fieldset>
        <fieldset class="fs"><legend>Extras</legend>${c.extras.map((x, i) => `<div class="fila-x"><div class="nombre">${e(x.nombre.es)}<small>${x.tipo === 'por_bici' ? 'por bici' : x.tipo === 'por_reserva' ? 'por reserva' : 'a presupuestar'}</small></div>
          ${x.tipo === 'presupuesto' ? '<div class="ayuda" style="margin:0">Sin precio fijo: siempre se presupuesta.</div><span></span>' : `${inp(`p-ex-${i}`, x.incluido ? 0 : x.precio, { u: '€', dis: x.incluido, label: '<span class="sr">Precio de ' + e(x.nombre.es) + '</span>' })}`}
          ${x.tipo === 'presupuesto' ? '' : `<label class="chk"><input type="checkbox" id="p-inc-${i}"${x.incluido ? ' checked' : ''}> <span>Incluido</span></label>`}</div>`).join('')}</fieldset>
        <fieldset class="fs"><legend>Señal y cancelación</legend>
          <div class="grid2">${inp('p-senal', c.senalPct, { u: '%', max: 100, step: '1', label: 'Señal online' })}${inp('p-horas', c.cancelacion.horas, { u: 'h', step: '1', label: 'Cancelación gratis hasta' })}</div>
          <div class="campo"><label for="p-canc-es">Texto de cancelación (español)</label><textarea id="p-canc-es" rows="3">${e(c.cancelacion.texto.es)}</textarea></div>
          <div class="campo"><label for="p-canc-en">Texto de cancelación (inglés, para la web en inglés)</label><textarea id="p-canc-en" rows="3">${e(c.cancelacion.texto.en)}</textarea></div>
        </fieldset>
        <fieldset class="fs"><legend>Colectivos con descuento</legend>
          ${c.colectivos.length ? c.colectivos.map((k, i) => `<div class="col-fila"><div class="campo"><label for="p-col-cod-${i}">Código</label><input id="p-col-cod-${i}" value="${e(k.codigo)}" autocapitalize="characters" autocomplete="off" maxlength="24"></div>
            ${inp(`p-col-pct-${i}`, k.descuento, { u: '%', max: 100, step: '1', label: 'Descuento' })}
            <div class="campo" style="grid-column:1/-1"><label for="p-col-nom-${i}">Nombre del colectivo</label><input id="p-col-nom-${i}" value="${e(k.nombre)}" autocomplete="off" maxlength="60"></div>
            <div class="col-fila__acc"><label class="chk"><input type="checkbox" id="p-col-act-${i}"${k.activo ? ' checked' : ''}> <span>Activo</span></label><button type="button" class="btn btn--peligro btn--mini" data-acc="col-quitar" data-i="${i}" aria-label="Eliminar el colectivo ${e(k.nombre || k.codigo)}">Eliminar</button></div></div>`).join('') : '<p class="p-sub">No hay colectivos.</p>'}
          <p><button type="button" class="btn btn--borde btn--sm" data-acc="col-nuevo">+ Añadir colectivo</button></p>
        </fieldset>
        <div id="precios-err" role="alert"></div>
        <div class="barra-guardar"><button type="button" class="btn btn--borde" data-acc="precios-descartar">Descartar cambios</button><button type="submit" class="btn btn--primario btn--lg">Guardar cambios</button></div>
      </form>`;
  }
  function leerForm() {
    const c = S.borrador, v = id => { const el = document.getElementById(id); return el ? el.value : ''; }, n = id => parseFloat(String(v(id)).replace(',', '.'));
    c.tipos.forEach((t, i) => { t.precio = n(`p-tipo-${i}`); });
    [1, 2, 3].forEach(i => { c.descuentos[i] = n(`p-desc-${i}`); });
    c.extras.forEach((x, i) => { if (x.tipo === 'presupuesto') return; const inc = document.getElementById(`p-inc-${i}`); x.incluido = !!(inc && inc.checked); x.precio = x.incluido ? 0 : n(`p-ex-${i}`); });
    c.senalPct = n('p-senal'); c.cancelacion.horas = n('p-horas'); c.cancelacion.texto.es = v('p-canc-es').trim(); c.cancelacion.texto.en = v('p-canc-en').trim();
    c.colectivos.forEach((k, i) => { k.codigo = v(`p-col-cod-${i}`).trim().toUpperCase().replace(/\s+/g, ''); k.nombre = v(`p-col-nom-${i}`).trim(); k.descuento = n(`p-col-pct-${i}`); k.activo = !!document.getElementById(`p-col-act-${i}`)?.checked; });
  }
  function guardarPrecios() {
    leerForm(); const c = S.borrador, err = [], ok = x => Number.isFinite(x) && x >= 0;
    c.tipos.forEach(t => { if (!ok(t.precio)) err.push(`Precio no válido en ${t.nombre.es}.`); });
    [1, 2, 3].forEach(i => { if (!ok(c.descuentos[i])) err.push(`Descuento del ${i + 1}.º día no válido.`); });
    c.extras.forEach(x => { if (x.tipo !== 'presupuesto' && !ok(x.precio)) err.push(`Precio no válido en «${x.nombre.es}».`); });
    if (!(c.senalPct >= 0 && c.senalPct <= 100)) err.push('La señal debe estar entre 0 y 100 %.');
    if (!ok(c.cancelacion.horas)) err.push('Las horas de cancelación no son válidas.');
    const cods = new Set();
    c.colectivos.forEach((k, i) => {
      if (!k.codigo) err.push(`Colectivo ${i + 1}: falta el código.`); else if (cods.has(k.codigo)) err.push(`El código ${k.codigo} está repetido.`); cods.add(k.codigo);
      if (!k.nombre) err.push(`Colectivo ${i + 1}: falta el nombre.`);
      if (!(k.descuento >= 0 && k.descuento <= 100)) err.push(`Colectivo ${i + 1}: el descuento debe estar entre 0 y 100 %.`);
    });
    const box = $('#precios-err');
    if (err.length) { box.innerHTML = `<div class="aviso aviso--err"><b>Revisa estos datos</b><ul>${err.map(x => `<li>${e(x)}</li>`).join('')}</ul></div>`; box.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const nuevo = copia(NC.config());
    Object.assign(nuevo, { tipos: c.tipos, descuentos: c.descuentos, extras: c.extras, senalPct: c.senalPct, colectivos: c.colectivos, cancelacion: { ...nuevo.cancelacion, horas: c.cancelacion.horas, texto: c.cancelacion.texto } });
    NC.guardarConfig(nuevo); S.borrador = null; rPrecios(); aviso('Cambios guardados. La web ya usa los nuevos precios.');
  }

  // =====================================================================
  // 5. MÉTRICAS
  // =====================================================================
  const PERIODOS = [['30', '30 días'], ['90', '90 días'], ['temp', 'Temporada']];
  const desdeIso = () => S.per === '30' ? NC.isoMas(-29) : S.per === '90' ? NC.isoMas(-89) : NC.hoy.getFullYear() + '-04-01';
  const hastaIso = () => NC.iso(NC.hoy);
  const OK = r => r.estado === 'confirmada' || r.estado === 'completada';
  function calc(desde, hasta) {
    const vis = NC.visitas.filter(v => v.fecha >= desde && v.fecha <= hasta);
    const rs = NC.reservas().filter(r => { const f = r.creada.slice(0, 10); return f >= desde && f <= hasta; });
    const conf = rs.filter(OK), ing = conf.reduce((a, r) => a + r.total, 0);
    const visitas = vis.reduce((a, v) => a + v.total, 0);
    return { vis, rs, conf, ing, visitas, solic: rs.length, conv: visitas ? rs.length / visitas * 100 : 0, ticket: conf.length ? ing / conf.length : 0 };
  }
  const delta = (a, b, txt) => {
    if (!b) return '';
    const p = Math.round((a - b) / b * 100); if (!p) return `<small>= igual que ${txt}</small>`;
    return `<small><span class="${p > 0 ? 'sube' : 'baja'}">${p > 0 ? '▲ +' : '▼ '}${p} %</span> vs ${txt}</small>`;
  };
  // demanda: una entrada por sesión del embudo (su último paso), incluidas las abandonadas
  function demanda(desde) {
    const ses = {};
    NC.eventos().forEach(ev => { if (ev.fecha.slice(0, 10) < desde) return; const o = ses[ev.sesion]; if (!o || ev.paso >= o.paso) ses[ev.sesion] = ev; });
    const l = Object.values(ses), tipo = {}, talla = {}, dur = {}, dsem = [0, 0, 0, 0, 0, 0, 0], mes = {}; let abandonadas = 0;
    l.forEach(ev => {
      const d = ev.datos || {}; if (ev.paso < 5) abandonadas++;
      (d.lineas && d.lineas.length ? d.lineas : [{ tipo: d.tipo, talla: d.talla, cantidad: 1 }]).forEach(x => { if (x.tipo) tipo[x.tipo] = (tipo[x.tipo] || 0) + (x.cantidad || 1); if (x.talla) talla[x.talla] = (talla[x.talla] || 0) + (x.cantidad || 1); });
      if (d.dias) { const k = d.dias >= 5 ? '5+' : String(d.dias); dur[k] = (dur[k] || 0) + 1; }
      if (d.desde) { const f = NC.parse(d.desde); dsem[(f.getDay() + 6) % 7]++; const k = d.desde.slice(0, 7); mes[k] = (mes[k] || 0) + 1; }
    });
    return { sesiones: l.length, abandonadas, tipo, talla, dur, dsem, mes };
  }

  // --- gráficos SVG (clases con variables CSS: b1 verde, b2 verde oscuro, b3 gris) ---
  const SV = (w, h, aria, cuerpo) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${e(aria)}" focusable="false">${cuerpo}</svg>`;
  function hbar(w, items, { fmt = x => num(x.valor), cls = 'b1', dest = false } = {}) {
    const max = Math.max(1, ...items.map(i => i.valor)), top = items.reduce((m, i) => i.valor > m.valor ? i : m, items[0] || { valor: 0 }), H = 46;
    const cu = items.map((it, k) => {
      const y = k * H, bw = Math.max(it.valor ? 3 : 0, (w) * it.valor / max), c = dest && it === top && it.valor ? 'b2' : cls;
      return `<g><title>${e(it.label)}: ${e(fmt(it))}</title><text x="0" y="${y + 14}">${e(it.label)}</text><text class="t-val" x="${w}" y="${y + 14}" text-anchor="end">${e(fmt(it))}</text><rect class="pista" x="0" y="${y + 21}" width="${w}" height="14"/><rect class="${c}" x="0" y="${y + 21}" width="${bw}" height="14"/></g>`;
    }).join('');
    return SV(w, items.length * H, items.map(i => `${i.label}: ${fmt(i)}`).join('; '), cu);
  }
  function columnas(w, items, { h = 170, cls = 'b1', dest = false, valores = true, minEt = 34, fmt = num } = {}) {
    const L = 30, T = 16, B = 24, iw = w - L, ih = h - T - B, n = items.length, max = Math.max(1, ...items.map(i => i.valor));
    const paso = Math.pow(10, Math.floor(Math.log10(max))), tope = [1, 2, 2.5, 5, 10].map(x => x * paso).find(x => x >= max) || max;
    const cw = iw / n, bw = Math.max(2, cw * (cw > 14 ? .7 : .8)), cadaEt = Math.max(1, Math.ceil(minEt / cw)), mx = items.reduce((m, i) => i.valor > m.valor ? i : m, items[0] || { valor: 0 });
    let cu = [0, .5, 1].map(f => { const y = T + ih - ih * f; return `<line class="rej" x1="${L}" x2="${w}" y1="${y}" y2="${y}"/><text class="t-eje" x="${L - 6}" y="${y + 4}" text-anchor="end">${fmt(Math.round(tope * f * 10) / 10)}</text>`; }).join('');
    items.forEach((it, k) => {
      const x = L + k * cw + (cw - bw) / 2, bh = ih * it.valor / tope, y = T + ih - bh, c = dest && it === mx && it.valor ? 'b2' : cls;
      cu += `<g><title>${e(it.titulo || it.label)}: ${e(fmt(it.valor))}</title><rect class="${c}" x="${x}" y="${y}" width="${bw}" height="${Math.max(0, bh)}"/>${valores && cw >= 26 && it.valor ? `<text class="t-val" x="${x + bw / 2}" y="${y - 4}" text-anchor="middle">${fmt(it.valor)}</text>` : ''}${k % cadaEt === 0 ? `<text class="t-eje" x="${L + k * cw + cw / 2}" y="${h - 6}" text-anchor="middle">${e(it.label)}</text>` : ''}</g>`;
    });
    cu += `<line class="base" x1="${L}" x2="${w}" y1="${T + ih}" y2="${T + ih}"/>`;
    return SV(w, h, items.map(i => `${i.titulo || i.label}: ${fmt(i.valor)}`).join('; '), cu);
  }
  const PASOS = ['Fechas y bici', 'Extras', 'Tus datos', 'Pago', 'Reserva enviada'];
  function embudoSvg(w, fun) {
    const t = fun[0].sesiones || 0, H = 48, D = 24; let y = 0, cu = '', aria = [];
    fun.forEach((f, k) => {
      const bw = t ? Math.max(f.sesiones ? 3 : 0, w * f.sesiones / t) : 0, txt = `${num(f.sesiones)} · ${pct(f.sesiones, t)}`;
      aria.push(`Paso ${k + 1} ${PASOS[k]}: ${f.sesiones} sesiones (${pct(f.sesiones, t)})`);
      cu += `<g><title>Paso ${k + 1}, ${PASOS[k]}: ${e(txt)}</title><text x="0" y="${y + 14}">${k + 1}. ${PASOS[k]}</text><text class="t-val" x="${w}" y="${y + 14}" text-anchor="end">${e(txt)}</text><rect class="pista" x="0" y="${y + 22}" width="${w}" height="18"/><rect class="${k === 4 ? 'b2' : 'b1'}" x="0" y="${y + 22}" width="${bw}" height="18"/></g>`;
      y += H;
      if (k < 4) { const ab = f.sesiones - fun[k + 1].sesiones; cu += `<text class="t-drop" x="0" y="${y + 6}">↓ ${pct(ab, f.sesiones)} abandona aquí (${num(ab)} ${ab === 1 ? 'sesión' : 'sesiones'})</text>`; aria.push(`abandono ${pct(ab, f.sesiones)}`); y += D; }
    });
    return SV(w, y, 'Embudo de la reserva. ' + aria.join('; '), cu);
  }
  // series temporales por día, semana o mes
  function serie(desde, hasta) {
    const dias = NC.dias(desde, hasta), modo = dias <= 31 ? 'dia' : dias <= 100 ? 'sem' : 'mes';
    const mon = f => { const d = NC.parse(f); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return NC.iso(d); };
    const clave = f => modo === 'dia' ? f : modo === 'sem' ? mon(f) : f.slice(0, 7);
    const cubos = [], idx = {};
    for (let f = desde; f <= hasta; f = NC.sumaDias(f, 1)) { const k = clave(f); if (!(k in idx)) { idx[k] = cubos.length; cubos.push({ k, vis: 0, sol: 0 }); } }
    NC.visitas.forEach(v => { if (v.fecha >= desde && v.fecha <= hasta) cubos[idx[clave(v.fecha)]].vis += v.total; });
    NC.reservas().forEach(r => { const f = r.creada.slice(0, 10); if (f >= desde && f <= hasta) cubos[idx[clave(f)]].sol++; });
    const et = c => modo === 'dia' ? String(+c.k.slice(8)) : modo === 'sem' ? `${+c.k.slice(8)}/${+c.k.slice(5, 7)}` : MESES[+c.k.slice(5) - 1].slice(0, 3);
    const ti = c => modo === 'dia' ? fmtF(c.k) : modo === 'sem' ? `Semana del ${fmtF(c.k)}` : `${MESES[+c.k.slice(5) - 1]} ${c.k.slice(0, 4)}`;
    return { modo, cubos: cubos.map(c => ({ ...c, label: et(c), titulo: ti(c) })) };
  }

  let graficos = [];
  const g = (id, fn) => { graficos.push([id, fn]); return `<div class="graf" data-g="${id}"></div>`; };
  function pintar() { graficos.forEach(([id, fn]) => { const el = $(`[data-g="${id}"]`); if (el && el.clientWidth) el.innerHTML = fn(Math.floor(el.clientWidth)); }); }

  function rMetricas() {
    graficos = [];
    const desde = desdeIso(), hasta = hastaIso(), k = calc(desde, hasta), dm = demanda(desde), fun = NC.embudo(desde);
    const prev = S.per === '30' && NC.visitas[0] && NC.isoMas(-59) >= NC.visitas[0].fecha ? calc(NC.isoMas(-59), NC.isoMas(-30)) : null;
    const pend = NC.reservas().filter(r => r.estado === 'pendiente'), sPend = pend.reduce((a, r) => a + r.senal, 0);
    const etPer = S.per === '30' ? 'los 30 días anteriores' : '';
    const dias = NC.dias(desde, hasta), sr = serie(desde, hasta);
    const cfg = NC.config(), nom = tid => nTipo(tid);

    // colectivos
    const uso = {}; cfg.colectivos.forEach(c => { uso[c.codigo] = { c, n: 0, desc: 0 }; });
    k.rs.forEach(r => { if (r.colectivo) { const u = uso[r.colectivo.codigo] || (uso[r.colectivo.codigo] = { c: { codigo: r.colectivo.codigo, nombre: r.colectivo.nombre, activo: false }, n: 0, desc: 0 }); u.n++; u.desc += (r.precio && r.precio.descuentoColectivo) || 0; } });
    const usoL = Object.values(uso).sort((a, b) => b.n - a.n), totUso = usoL.reduce((a, u) => a + u.n, 0);
    // origen
    const orig = NC.ORIGENES.map(o => ({ label: o.nombre, valor: k.vis.reduce((a, v) => a + (v.origen[o.id] || 0), 0) })).sort((a, b) => b.valor - a.valor);
    // consultas
    const cons = NC.consultas(), consP = cons.filter(c => c.fecha.slice(0, 10) >= desde);
    const mot = NC.MOTIVOS.map(m => ({ label: m.es, valor: consP.filter(c => c.motivo === m.id).length })).sort((a, b) => b.valor - a.valor);
    const nuevas = cons.filter(c => c.estado === 'nueva').length;
    const lista = cons.filter(c => !S.consNuevas || c.estado === 'nueva');

    const tipoL = cfg.tipos.map(t => ({ label: t.nombre.es, valor: dm.tipo[t.id] || 0 })), totT = tipoL.reduce((a, x) => a + x.valor, 0);
    const tallaL = cfg.tallas.map(z => ({ label: 'Talla ' + z, valor: dm.talla[z] || 0 })), totZ = tallaL.reduce((a, x) => a + x.valor, 0);
    const durL = ['1', '2', '3', '4', '5+'].map(x => ({ label: x === '1' ? '1 día' : x + ' días', valor: dm.dur[x] || 0 }));
    const DS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], dsL = dm.dsem.map((v, i) => ({ label: DS[i], valor: v }));
    const meses = Object.keys(dm.mes).sort().map(m => ({ label: MESES[+m.slice(5) - 1].slice(0, 3), titulo: MESES[+m.slice(5) - 1] + ' ' + m.slice(0, 4), valor: dm.mes[m] }));

    $('#tab-metricas').innerHTML = `
      <h2>Métricas</h2>
      <div class="periodo" role="group" aria-label="Periodo">${PERIODOS.map(([id, t]) => `<button type="button" data-per="${id}" aria-pressed="${S.per === id}">${t}</button>`).join('')}</div>
      <p class="p-sub" style="margin-top:-6px">Del ${e(fmtF(desde))} al ${e(fmtF(hasta))} (${dias} días). ${S.per === 'temp' ? 'Temporada: desde el 1 de abril.' : ''}</p>
      <div class="kpis">
        <div class="kpi"><span>Visitas a la web</span><b>${num(k.visitas)}</b>${prev ? delta(k.visitas, prev.visitas, etPer) : `<small>${num(Math.round(k.visitas / dias))} al día de media</small>`}</div>
        <div class="kpi"><span>Solicitudes</span><b>${num(k.solic)}</b>${prev ? delta(k.solic, prev.solic, etPer) : `<small>${num(k.conf.length)} confirmadas o completadas</small>`}</div>
        <div class="kpi kpi--clave"><span>Tasa de conversión</span><b>${k.conv.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</b><small>Visitas que acaban en solicitud</small></div>
        <div class="kpi kpi--clave"><span>Ingresos confirmados</span><b>${e(NC.eur(Math.round(k.ing)))}</b>${prev ? delta(k.ing, prev.ing, etPer) : `<small>${num(k.conf.length)} reservas</small>`}</div>
        <div class="kpi"><span>Ticket medio</span><b>${e(NC.eur(Math.round(k.ticket)))}</b><small>Por reserva confirmada</small></div>
        <div class="kpi"><span>Señal pendiente</span><b>${e(NC.eur(sPend))}</b><small>${pend.length} ${pend.length === 1 ? 'solicitud retenida' : 'solicitudes retenidas'}</small></div>
      </div>

      <div class="mgrid mgrid--2">
        <div class="mcard"><h3>Visitas</h3><p class="p-sub">${sr.modo === 'dia' ? 'Por día' : sr.modo === 'sem' ? 'Por semana' : 'Por mes'}</p>${g('vis', w => columnas(w, sr.cubos.map(c => ({ label: c.label, titulo: c.titulo, valor: c.vis })), { valores: false, dest: true }))}</div>
        <div class="mcard"><h3>Solicitudes</h3><p class="p-sub">${sr.modo === 'dia' ? 'Por día' : sr.modo === 'sem' ? 'Por semana' : 'Por mes'}</p>${g('sol', w => columnas(w, sr.cubos.map(c => ({ label: c.label, titulo: c.titulo, valor: c.sol })), { cls: 'b2', valores: false }))}</div>
      </div>

      <div class="mcard mcard--ancha" style="margin-bottom:16px"><h3>Embudo de la reserva</h3><p class="p-sub">Sesiones que llegan a cada paso (incluye a quien lo deja a medias).${fun[0].sesiones ? ` Conversión total: ${pct(fun[4].sesiones, fun[0].sesiones, 1)}.` : ''}</p>${fun[0].sesiones ? g('emb', w => embudoSvg(w, fun)) : '<p class="vacio">Aún no hay sesiones en este periodo.</p>'}</div>

      <h2 style="margin-top:28px">Qué se pide</h2>
      <p class="p-sub">${num(dm.sesiones)} sesiones, de ellas ${num(dm.abandonadas)} sin terminar la reserva: también cuentan, porque muestran lo que la gente busca.</p>
      <div class="mgrid mgrid--2">
        <div class="mcard"><h3>Tipos de bici</h3><p class="p-sub">Bicis solicitadas por tipo</p>${g('tipo', w => hbar(w, tipoL, { fmt: x => `${num(x.valor)} · ${pct(x.valor, totT)}`, dest: true }))}</div>
        <div class="mcard"><h3>Tallas</h3><p class="p-sub">Bicis solicitadas por talla</p>${g('talla', w => hbar(w, tallaL, { fmt: x => `${num(x.valor)} · ${pct(x.valor, totZ)}`, dest: true }))}</div>
        <div class="mcard"><h3>Duración del alquiler</h3><p class="p-sub">Sesiones por número de días</p>${g('dur', w => columnas(w, durL, { dest: true }))}</div>
        <div class="mcard"><h3>Días de la semana</h3><p class="p-sub">Día en que empieza el alquiler</p>${g('dsem', w => columnas(w, dsL, { dest: true }))}</div>
        <div class="mcard mcard--ancha"><h3>Meses más pedidos</h3><p class="p-sub">Mes en que se quiere alquilar</p>${meses.length ? g('mes', w => columnas(w, meses, { dest: true, h: 190 })) : '<p class="vacio">Sin datos.</p>'}</div>
      </div>

      <div class="mgrid mgrid--2" style="margin-top:28px">
        <div class="mcard"><h3>De dónde vienen las visitas</h3><p class="p-sub">${num(k.visitas)} visitas</p>${g('orig', w => hbar(w, orig, { fmt: x => `${num(x.valor)} · ${pct(x.valor, k.visitas)}`, dest: true }))}</div>
        <div class="mcard"><h3>Uso de colectivos</h3><p class="p-sub">${totUso ? `${totUso} de ${k.solic} solicitudes (${pct(totUso, k.solic)}) usaron un código` : 'Ninguna solicitud usó un código en este periodo'}</p>
          ${usoL.length ? `<table class="tabla cols-uso"><thead><tr><th>Colectivo</th><th>Solicitudes</th><th>Descuento dado</th></tr></thead><tbody>${usoL.map(u => `<tr><td><b>${e(u.c.nombre)}</b><br><small>${e(u.c.codigo)}${u.c.activo === false ? ' · desactivado' : ''}</small></td><td class="num">${u.n}</td><td class="num">${e(NC.eur(u.desc))}</td></tr>`).join('')}</tbody></table>` : '<p class="vacio">No hay colectivos configurados.</p>'}</div>
      </div>

      <div class="mgrid mgrid--2" style="margin-top:0">
        <div class="mcard"><h3>Consultas de contacto por motivo</h3><p class="p-sub">${consP.length} consultas en el periodo</p>${consP.length ? g('mot', w => hbar(w, mot, { fmt: x => `${num(x.valor)} · ${pct(x.valor, consP.length)}`, dest: true })) : '<p class="vacio">Sin consultas en este periodo.</p>'}</div>
        <div class="mcard"><h3>Últimas consultas ${nuevas ? `<span class="badge badge--pend">${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'}</span>` : ''}</h3>
          <label class="chk chk-sm"><input type="checkbox" id="cons-nuevas"${S.consNuevas ? ' checked' : ''}> <span>Solo las nuevas</span></label>
          ${lista.length ? `<ul class="cons-lista">${lista.slice(0, S.consMax).map(c => `<li class="cons"><div class="cons__cab"><b>${e(c.nombre)}</b><span>${e(c.fecha.slice(0, 10).split('-').reverse().join('/'))} · ${e((NC.MOTIVOS.find(m => m.id === c.motivo) || {}).es || c.motivo)}</span></div>
            <p>${e(c.mensaje)}</p><div class="cons__pie"><span>${e(c.contacto)}${c.tipo ? ' · ' + e(nom(c.tipo)) : ''}${c.talla ? ' ' + e(c.talla) : ''}</span>${c.estado === 'nueva' ? `<button type="button" class="btn btn--borde btn--mini" data-acc="atendida" data-id="${e(c.id)}">Marcar atendida</button>` : '<span class="badge badge--ok">Atendida</span>'}</div></li>`).join('')}</ul>
            ${lista.length > S.consMax ? '<p class="hist-mas"><button type="button" class="btn btn--borde btn--sm" data-acc="cons-mas">Ver más</button></p>' : ''}` : '<p class="vacio">No hay consultas.</p>'}</div>
      </div>`;
    pintar();
  }

  // =====================================================================
  // 6. COMENTARIOS (se guardan en el servidor: los ve también Miguel)
  // =====================================================================
  const C = window.NCComentarios;
  const FILTROS_COM = [['abiertos', 'Abiertos'], ['todos', 'Todos'], ['hecho', 'Hechos'], ['descartado', 'Descartados']];
  const BADGE_COM = { nuevo: 'badge--pend', en_curso: '', hecho: 'badge--ok', descartado: 'badge--err' };
  const BADGE_PRIO = { imprescindible: 'prio--alta', me_gustaria: 'prio--media', mas_adelante: 'prio--baja' };
  const fechaHora = iso => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '');
  async function cargarComentarios() {
    try { S.comLista = await C.listar(); S.comError = false; } catch { S.comError = true; if (!S.comLista) S.comLista = []; }
    cuentaCom(); if (S.tab === 'comentarios') rComentarios();
  }
  function cuentaCom() {
    const n = (S.comLista || []).filter(c => c.estado === 'nuevo').length, b = $('#cuenta-com');
    b.textContent = n; b.hidden = !n;
    const bc = $('#cuenta-com-cab'); bc.textContent = n; bc.hidden = !n;
  }
  function rComentarios() {
    const l = S.comLista, pend = C.pendientesLocales();
    const ver = (l || []).filter(c => S.comFiltro === 'todos' ? true : S.comFiltro === 'abiertos' ? ['nuevo', 'en_curso'].includes(c.estado) : c.estado === S.comFiltro);
    const cuantos = k => (l || []).filter(c => k === 'todos' || (k === 'abiertos' ? ['nuevo', 'en_curso'].includes(c.estado) : c.estado === k)).length;
    $('#tab-comentarios').innerHTML = `
      <div class="p-bloque__cab"><h2>Comentarios sobre la web</h2><button type="button" class="btn btn--primario btn--sm" data-acc="comentar">+ Nuevo comentario</button></div>
      <p class="p-sub">Todo lo que quieras cambiar, añadir o quitar, en la web o en este panel. Lo vemos los dos y te contestamos aquí mismo.</p>
      ${S.comError ? `<div class="aviso aviso--err" role="alert"><b>No se pueden cargar los comentarios ahora.</b> ${pend ? `Tienes ${pend} guardado${pend === 1 ? '' : 's'} en este navegador que se enviará${pend === 1 ? '' : 'n'} solo en cuanto haya conexión.` : 'Prueba a recargar en un momento.'}</div>` : ''}
      <div class="com-filtros" role="group" aria-label="Filtrar comentarios">${FILTROS_COM.map(([k, t]) => `<button type="button" class="btn btn--sm ${S.comFiltro === k ? 'btn--primario' : 'btn--borde'}" data-comf="${k}" aria-pressed="${S.comFiltro === k}">${t} <span class="num">${cuantos(k)}</span></button>`).join('')}
        ${l && l.length ? '<button type="button" class="btn btn--borde btn--sm" data-acc="com-copiar">Copiar lista</button>' : ''}</div>
      ${l === null ? '<p class="vacio">Cargando comentarios…</p>' : ver.length ? `<ul class="com-lista">${ver.map(c => `<li class="com com--${e(c.estado)}">
        <div class="com__cab"><span class="badge ${BADGE_PRIO[c.prioridad] || ''}">${e(C.PRIORIDADES[c.prioridad] || c.prioridad)}</span><span class="com__meta"><b>${e(c.autor)}</b> · ${e(fechaHora(c.creado))} · #${e(c.id)}</span></div>
        <p class="com__donde">${e(c.donde)}</p>
        <p class="com__texto">${e(c.texto)}</p>
        ${c.respuesta ? `<div class="com__resp"><b>Respuesta</b><p>${e(c.respuesta)}</p></div>` : ''}
        <div class="com__pie">
          <div class="campo"><label for="com-est-${e(c.id)}">Estado</label><select id="com-est-${e(c.id)}" data-com-estado="${e(c.id)}">${Object.entries(C.ESTADOS).map(([k, v]) => `<option value="${k}"${c.estado === k ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
          <button type="button" class="btn btn--borde btn--sm" data-acc="com-responder" data-id="${e(c.id)}">${c.respuesta ? 'Editar respuesta' : 'Responder'}</button>
        </div>
        <div class="com__form" id="com-form-${e(c.id)}" hidden><div class="campo"><label for="com-resp-${e(c.id)}">Respuesta</label><textarea id="com-resp-${e(c.id)}" rows="3" maxlength="4000">${e(c.respuesta)}</textarea></div>
          <div class="com__acc"><button type="button" class="btn btn--borde btn--sm" data-acc="com-cancelar" data-id="${e(c.id)}">Cancelar</button><button type="button" class="btn btn--primario btn--sm" data-acc="com-guardar" data-id="${e(c.id)}">Guardar respuesta</button></div></div>
      </li>`).join('')}</ul>` : `<div class="vacio"><b>${(l || []).length ? 'No hay comentarios con este filtro.' : 'Aún no hay comentarios.'}</b> Usa el botón «Comentar» del borde derecho desde cualquier página de la web o del panel.</div>`}`;
  }
  async function accionCom(id, cambios, txt) {
    try { await C.cambiar(id, cambios); aviso(txt); await cargarComentarios(); }
    catch { aviso('No se ha podido guardar. Prueba otra vez en un momento.', 'aviso'); }
  }
  async function copiarCom() {
    const l = (S.comLista || []).filter(c => ['nuevo', 'en_curso'].includes(c.estado));
    const txt = l.map(c => `#${c.id} [${C.PRIORIDADES[c.prioridad] || c.prioridad}] ${c.donde}\n${c.texto}${c.respuesta ? `\n→ ${c.respuesta}` : ''}`).join('\n\n');
    try { await navigator.clipboard.writeText(txt || 'Sin comentarios abiertos.'); aviso(`${l.length} comentarios abiertos copiados.`); } catch { aviso('No se ha podido copiar.', 'aviso'); }
  }

  // =====================================================================
  // 7. GUÍA
  // =====================================================================
  function rGuia() { $('#tab-guia').innerHTML = NCGuia.html(); }

  // =====================================================================
  // eventos
  // =====================================================================
  document.addEventListener('click', ev => {
    const tab = ev.target.closest('[role=tab]'); if (tab) return mostrar(tab.dataset.tab);
    const per = ev.target.closest('[data-per]'); if (per) { S.per = per.dataset.per; rMetricas(); $(`[data-per="${S.per}"]`).focus(); return; }
    const dia = ev.target.closest('[data-dia]:not([data-acc])');
    if (dia) {
      S.dia = dia.dataset.dia; const d = NC.parse(S.dia); if (d.getMonth() !== S.mes.getMonth()) S.mes = new Date(d.getFullYear(), d.getMonth(), 1);
      rCalendario(); const bt = $(`[data-dia="${S.dia}"]`); if (bt) bt.focus({ preventScroll: true });
      if (innerWidth < 900) $('#dia-det').scrollIntoView({ behavior: 'smooth', block: 'start' }); return;
    }
    const ir = ev.target.closest('[data-ir]'); if (ir) return mostrar(ir.dataset.ir);
    const cf = ev.target.closest('[data-comf]'); if (cf) { S.comFiltro = cf.dataset.comf; rComentarios(); $(`[data-comf="${S.comFiltro}"]`).focus(); return; }
    const b = ev.target.closest('[data-acc]'); if (!b) return;
    const a = b.dataset.acc;
    if (['confirmar', 'rechazar', 'respondido', 'no-respondido'].includes(a)) accionReserva(a, b.dataset.id);
    else if (a === 'hist-mas') { S.hMax += 15; $('#hist-lista').innerHTML = htmlHist(); }
    else if (a === 'mes-ant' || a === 'mes-sig') { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth() + (a === 'mes-sig' ? 1 : -1), 1); rCalendario(); $(`[data-acc=${a}]`).focus(); }
    else if (a === 'mes-hoy') { S.mes = new Date(NC.hoy.getFullYear(), NC.hoy.getMonth(), 1); S.dia = NC.iso(NC.hoy); rCalendario(); }
    else if (a === 'bloquear' || a === 'desbloquear') accionDia(a, b.dataset.dia);
    else if (a === 'stock') accionStock(b);
    else if (a === 'col-nuevo') { leerForm(); S.borrador.colectivos.push({ codigo: '', nombre: '', descuento: 10, activo: true }); rPrecios(); const i = S.borrador.colectivos.length - 1; $(`#p-col-cod-${i}`).focus(); }
    else if (a === 'col-quitar') { leerForm(); const i = +b.dataset.i, k = S.borrador.colectivos[i]; S.borrador.colectivos.splice(i, 1); rPrecios(); aviso(`Colectivo ${k.nombre || k.codigo || ''} quitado. Guarda para aplicarlo.`, 'aviso'); }
    else if (a === 'precios-descartar') { S.borrador = null; rPrecios(); aviso('Cambios descartados.'); }
    else if (a === 'atendida') { NC.cambiarConsulta(b.dataset.id, 'atendida'); rMetricas(); aviso('Consulta marcada como atendida.'); }
    else if (a === 'cons-mas') { S.consMax += 8; rMetricas(); }
    else if (a === 'comentar') C.abrir();
    else if (a === 'com-copiar') copiarCom();
    else if (a === 'com-responder' || a === 'com-cancelar') { const fm = $('#com-form-' + b.dataset.id); fm.hidden = a === 'com-cancelar'; if (!fm.hidden) $('#com-resp-' + b.dataset.id).focus(); }
    else if (a === 'com-guardar') accionCom(b.dataset.id, { respuesta: $('#com-resp-' + b.dataset.id).value.trim() }, 'Respuesta guardada.');
  });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'h-estado') { S.hFiltro = ev.target.value; S.hMax = 15; $('#hist-lista').innerHTML = htmlHist(); }
    else if (ev.target.id === 'cons-nuevas') { S.consNuevas = ev.target.checked; S.consMax = 8; rMetricas(); $('#cons-nuevas').focus(); }
    else if (ev.target.dataset.comEstado) accionCom(ev.target.dataset.comEstado, { estado: ev.target.value }, `Comentario #${ev.target.dataset.comEstado}: ${C.ESTADOS[ev.target.value]}.`);
    else if (ev.target.dataset.paso) { NCGuia.marcar(ev.target.dataset.paso, ev.target.checked); rGuia(); $(`[data-paso="${ev.target.dataset.paso}"]`).focus(); }
    else if (/^p-inc-\d+$/.test(ev.target.id)) { const i = ev.target.id.slice(6), pr = document.getElementById('p-ex-' + i); if (pr) { pr.disabled = ev.target.checked; if (ev.target.checked) pr.value = 0; } }
  });
  document.addEventListener('input', ev => { if (ev.target.id === 'h-busca') { S.hBusca = ev.target.value; S.hMax = 15; $('#hist-lista').innerHTML = htmlHist(); } });
  document.addEventListener('submit', ev => { if (ev.target.id === 'form-precios') { ev.preventDefault(); guardarPrecios(); } });
  $('#hoja-no').addEventListener('click', () => cerrarHoja());
  $('#hoja-si').addEventListener('click', () => { const f = hojaOk; cerrarHoja(false); if (f) f(); });
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && !$('#hoja').hidden) cerrarHoja();
    const tab = ev.target.closest && ev.target.closest('[role=tab]');
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(ev.key)) {
      ev.preventDefault(); const i = TABS.indexOf(tab.dataset.tab), n = ev.key === 'Home' ? 0 : ev.key === 'End' ? TABS.length - 1 : (i + (ev.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      mostrar(TABS[n], true);
    }
  });
  $('#btn-reset').addEventListener('click', () => preguntar({
    titulo: '¿Restablecer los datos de ejemplo?', texto: 'Se borrarán los cambios hechos en este navegador (reservas, stock, precios, bloqueos) y volverán los datos de ejemplo.', ok: 'Sí, restablecer', peligro: true,
    alOk: () => { NC.reset(); S.borrador = null; S.dia = null; mostrar(S.tab); aviso('Datos de ejemplo restablecidos.'); },
  }));
  window.addEventListener('storage', () => { if (S.tab !== 'precios') render(); else cuenta(); });
  let anchoPrev = innerWidth, tR = 0;
  window.addEventListener('resize', () => { clearTimeout(tR); tR = setTimeout(() => { if (innerWidth !== anchoPrev) { anchoPrev = innerWidth; if (S.tab === 'metricas') pintar(); } }, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S.tab === 'metricas') pintar(); });

  window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS.includes(t) && t !== S.tab) mostrar(t); });
  window.addEventListener('nc-comentarios', () => { cargarComentarios(); });
  let vista = false; try { vista = !!localStorage.getItem('naranco_guia_vista'); } catch { }
  mostrar((location.hash || '').slice(1) || (vista ? 'solicitudes' : 'guia'));
  cargarComentarios();
})();
