/* Nar&Co · asistente de reserva en 4 pasos (dentro de #reservar).
   Paso 1 fechas y bicis · 2 extras, entrega y colectivo (aquí aparece el precio) · 3 datos · 4 pago simulado / solicitud de presupuesto.
   Cada paso se registra con NC.evento(sesion, paso, datos) aunque el cliente no termine. */
(() => {
  const root = document.getElementById('reserva-app');
  if (!root || typeof NC === 'undefined' || typeof I18N === 'undefined') return;
  const t = (k, v) => I18N.t(k, v), esc = NC.esc;
  const loc = () => (I18N.lang === 'en' ? 'en-GB' : 'es-ES');
  const num = n => (Math.round(n * 100) / 100).toLocaleString(loc(), { minimumFractionDigits: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2, maximumFractionDigits: 2 });
  const eur = n => num(n) + ' €';
  const fFecha = f => NC.parse(f).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' });
  const fFechaL = f => NC.parse(f).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const nomTipo = id => { const x = NC.tipo(id); return x ? x.nombre[I18N.lang] || x.nombre.es : id; };
  const nomExtra = e => e.nombre[I18N.lang] || e.nombre.es;
  const HOY = NC.iso(NC.hoy);
  const PASOS = 4;

  const nuevoEstado = () => {
    const m = new Date(NC.hoy); m.setDate(1);
    return { paso: 1, mes: m, desde: null, hasta: null, lineas: [], extras: {}, entrega: 'local', direccion: '', codigoTxt: '', colectivo: null, codigoMsg: '',
      cliente: { nombre: '', email: '', telefono: '', altura: '', documento: '' }, acepto: false, novedades: false,
      tarjeta: { titular: '', numero: '', cad: '', cvc: '' }, errores: {}, aviso: '', resultado: null, enviando: false, sesion: NC.ID_SESION() };
  };
  let S = nuevoEstado();

  // ---------- cálculo ----------
  const dias = () => (S.desde && S.hasta ? NC.dias(S.desde, S.hasta) : 0);
  const nBicis = () => S.lineas.reduce((a, l) => a + l.cantidad, 0);
  const libre = (tipo, talla, salvo = -1) => {
    if (!S.desde || !S.hasta) return 0;
    const otros = S.lineas.reduce((a, l, i) => a + (i !== salvo && l.tipo === tipo && l.talla === talla ? l.cantidad : 0), 0);
    return Math.max(0, NC.disponibles(tipo, talla, S.desde, S.hasta) - otros);
  };
  const primeraLibre = (prefTipo, prefTalla) => {
    const cfg = NC.config(), tipos = prefTipo ? [prefTipo] : cfg.tipos.map(x => x.id), tallas = prefTalla ? [prefTalla, ...['M', 'S', 'L'].filter(x => x !== prefTalla)] : ['M', 'S', 'L'];
    for (const ti of tipos) for (const ta of tallas) if (libre(ti, ta) > 0) return { tipo: ti, talla: ta };
    return null;
  };
  const precio = () => NC.precio({ lineas: S.lineas, dias: dias(), extras: S.extras, entrega: S.entrega, codigo: S.colectivo ? S.colectivo.codigo : '' });
  const esPresupuesto = () => dias() > NC.config().diasMaxPrecio || S.entrega === 'fuera';
  const tallaSug = h => (h < 165 ? 'S' : h <= 180 ? 'M' : 'L');

  function ajustarLineas(avisar) {
    let cambio = false;
    const out = [];
    S.lineas.forEach(l => out.push(l));
    S.lineas = [];
    out.forEach(l => {
      const max = libre(l.tipo, l.talla);
      if (max > 0) { const c = Math.min(l.cantidad, max); if (c !== l.cantidad) cambio = true; S.lineas.push({ ...l, cantidad: c }); }
      else { cambio = true; const alt = primeraLibre(); if (alt && !S.lineas.length) S.lineas.push({ ...alt, cantidad: 1 }); }
    });
    if (!S.lineas.length && S.desde && S.hasta) { const alt = primeraLibre(); if (alt) S.lineas.push({ ...alt, cantidad: 1 }); }
    S.aviso = avisar && cambio ? t('r.p1.ajustado') : '';
  }
  const limpiarExtras = () => { const n = nBicis(); Object.keys(S.extras).forEach(k => { S.extras[k] = Math.min(S.extras[k], n); if (!S.extras[k]) delete S.extras[k]; }); };

  const datosEvento = () => ({ tipo: S.lineas[0] && S.lineas[0].tipo, talla: S.lineas[0] && S.lineas[0].talla, dias: dias(), desde: S.desde, hasta: S.hasta, idioma: I18N.lang, lineas: S.lineas.map(l => ({ ...l })), extras: { ...S.extras }, entrega: S.entrega, codigo: S.colectivo ? S.colectivo.codigo : '', total: S.paso >= 2 ? precio().total : undefined });
  const registrar = p => { try { NC.evento(S.sesion, p, datosEvento()); } catch { } };

  // ---------- calendario ----------
  function calendario() {
    const y = S.mes.getFullYear(), m = S.mes.getMonth(), off = (new Date(y, m, 1).getDay() + 6) % 7, nd = new Date(y, m + 1, 0).getDate();
    let mesTxt = S.mes.toLocaleDateString(loc(), { month: 'long', year: 'numeric' }); mesTxt = mesTxt.charAt(0).toUpperCase() + mesTxt.slice(1);
    const primero = new Date(NC.hoy); primero.setDate(1);
    const antes = S.mes <= primero;
    let h = `<div class="cal" role="group" aria-label="${esc(t('r.p1.cal'))}"><div class="cal__cab"><button type="button" class="cal__nav" data-act="mes" data-d="-1" aria-label="${esc(t('r.p1.mesant'))}"${antes ? ' disabled' : ''}>‹</button><strong class="cal__mes">${esc(mesTxt)}</strong><button type="button" class="cal__nav" data-act="mes" data-d="1" aria-label="${esc(t('r.p1.messig'))}">›</button></div><div class="cal__sem" aria-hidden="true">`;
    for (let i = 0; i < 7; i++) h += `<span>${esc(new Date(2024, 0, 1 + i).toLocaleDateString(loc(), { weekday: 'narrow' }))}</span>`;
    h += '</div><div class="cal__dias">';
    for (let i = 0; i < off; i++) h += '<span></span>';
    for (let d = 1; d <= nd; d++) {
      const f = NC.iso(new Date(y, m, d)), pasado = f < HOY, bloq = NC.diaBloqueado(f);
      const oc = !pasado && !bloq && (() => { const o = NC.ocupacion(f); return o.total > 0 && o.usadas >= o.total; })();
      const dis = pasado || bloq || oc;
      const ini = f === S.desde, fin = f === S.hasta, rango = S.desde && S.hasta && f > S.desde && f < S.hasta;
      const cls = ['cal__dia', ini || fin ? 'sel' : '', rango ? 'rango' : '', ini && S.hasta && S.hasta !== S.desde ? 'cal-ini' : '', fin && S.hasta !== S.desde ? 'cal-fin' : '', bloq || oc ? 'bloq' : '', f === HOY ? 'hoy' : ''].filter(Boolean).join(' ');
      const etiqueta = fFechaL(f) + (bloq ? ' · ' + t('r.p1.nodisp') : oc ? ' · ' + t('r.p1.completo') : '');
      h += `<button type="button" class="${cls}" data-act="dia" data-f="${f}" aria-label="${esc(etiqueta)}" aria-pressed="${ini || fin || rango ? 'true' : 'false'}"${dis ? ' disabled' : ''}${bloq || oc ? ` title="${esc(bloq ? t('r.p1.nodisp') : t('r.p1.completo'))}"` : ''}>${d}</button>`;
    }
    return h + '</div></div>';
  }
  function clickDia(f) {
    S.errores = {};
    if (!S.desde || S.hasta) { S.desde = f; S.hasta = null; S.lineas = []; S.aviso = ''; }
    else if (f < S.desde) { S.desde = f; }
    else {
      let ok = true;
      for (let d = S.desde; d <= f; d = NC.sumaDias(d, 1)) if (NC.diaBloqueado(d)) ok = false;
      if (!ok) { S.desde = f; S.hasta = null; S.aviso = t('r.p1.bloqueoenmedio'); return render('cal'); }
      S.hasta = f; S.aviso = '';
      ajustarLineas(false);
      limpiarExtras();
    }
    render('cal');
  }

  // ---------- líneas de bici ----------
  function lineasHtml() {
    const cfg = NC.config();
    if (!S.desde || !S.hasta) return `<p class="ayuda">${esc(t('r.p1.elige'))}</p>`;
    if (!primeraLibre() && !S.lineas.length) return `<div class="aviso aviso--err" role="alert"><b>${esc(t('r.p1.sinstock'))}</b> ${esc(t('r.p1.sinstock2'))}</div>`;
    let h = '';
    S.lineas.forEach((l, i) => {
      const tipos = cfg.tipos.map(x => `<option value="${x.id}"${x.id === l.tipo ? ' selected' : ''}${cfg.tallas.every(ta => libre(x.id, ta, i) <= 0) ? ' disabled' : ''}>${esc(nomTipo(x.id))}${cfg.tallas.every(ta => libre(x.id, ta, i) <= 0) ? ' · ' + esc(t('r.p1.agotada')) : ''}</option>`).join('');
      const tallas = cfg.tallas.map(ta => { const n = libre(l.tipo, ta, i); return `<option value="${ta}"${ta === l.talla ? ' selected' : ''}${n <= 0 ? ' disabled' : ''}>${ta} · ${n <= 0 ? esc(t('r.p1.agotada')) : esc(t('r.p1.libres', { n }))}</option>`; }).join('');
      const max = libre(l.tipo, l.talla, i);
      h += `<div class="linea" role="group" aria-label="${esc(t('r.p1.bici'))} ${i + 1}"><div class="campo"><label for="lt${i}">${esc(t('r.p1.tipo'))}</label><select id="lt${i}" data-act="tipo" data-i="${i}">${tipos}</select></div>
        <div class="campo"><label for="ls${i}">${esc(t('r.p1.talla'))}</label><select id="ls${i}" data-act="talla" data-i="${i}">${tallas}</select></div>
        <div class="campo"><span class="lbl" id="lq${i}">${esc(t('r.p1.cant'))}</span><div class="paso" role="group" aria-labelledby="lq${i}"><button type="button" data-act="qty" data-i="${i}" data-d="-1" aria-label="${esc(t('r.menos'))}"${l.cantidad <= 1 ? ' disabled' : ''}>−</button><output>${l.cantidad}</output><button type="button" data-act="qty" data-i="${i}" data-d="1" aria-label="${esc(t('r.mas'))}"${l.cantidad >= max ? ' disabled' : ''}>+</button></div></div>
        ${S.lineas.length > 1 ? `<button type="button" class="quitar" data-act="quitar" data-i="${i}" aria-label="${esc(t('r.p1.quitar'))}">×</button>` : ''}</div>`;
    });
    const hay = primeraLibre();
    h += `<button type="button" class="btn btn--borde btn--sm" data-act="anadir"${hay ? '' : ' disabled'}>+ ${esc(t('r.p1.anadir'))}</button>`;
    if (!hay) h += `<p class="ayuda">${esc(t('r.p1.nomas'))}</p>`;
    return h;
  }

  // ---------- campos de formulario ----------
  const campo = (id, label, o = {}) => {
    const err = S.errores[id];
    return `<div class="campo${err ? ' campo--err' : ''}"><label for="f-${id}">${esc(label)}${o.opc ? ` <span class="opc">(${esc(t('r.opcional'))})</span>` : ''}</label>
      <input id="f-${id}" name="${id}" data-f="${o.grupo || 'cliente'}" type="${o.tipo || 'text'}" value="${esc(o.valor || '')}"${o.aut ? ` autocomplete="${o.aut}"` : ''}${o.im ? ` inputmode="${o.im}"` : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.max ? ` maxlength="${o.max}"` : ''}${err ? ` aria-invalid="true" aria-describedby="e-${id}"` : ''}>
      ${o.ayuda ? `<p class="ayuda" id="h-${id}">${o.ayuda}</p>` : ''}${err ? `<p class="campo__err" id="e-${id}" role="alert">${esc(err)}</p>` : ''}</div>`;
  };
  const errorGlobal = () => { const k = Object.keys(S.errores); return k.length ? `<div class="aviso aviso--err" role="alert" id="rs-errores"><b>${esc(t('r.revisa'))}</b><ul>${k.map(x => `<li><a href="#f-${x}" data-act="irerror" data-id="${x}">${esc(S.errores[x])}</a></li>`).join('')}</ul></div>` : ''; };

  // ---------- pasos ----------
  function paso1() {
    const nd = dias();
    return `<h3 class="rs__t">${esc(t('r.p1.t'))}</h3>
      <p class="rs__d">${esc(t('r.p1.d'))}</p>
      ${calendario()}
      <p class="rango-txt" id="rango-txt" aria-live="polite">${S.desde ? (S.hasta ? `<b>${esc(fFecha(S.desde))} → ${esc(fFecha(S.hasta))}</b> · ${esc(t(nd === 1 ? 'r.dia1' : 'r.dias', { n: nd }))}` : esc(t('r.p1.ultimo'))) : esc(t('r.p1.primero'))}</p>
      ${nd > NC.config().diasMaxPrecio ? `<div class="aviso"><b>${esc(t('r.consulta'))}</b> ${esc(t('r.p1.largo'))}</div>` : ''}
      ${S.aviso ? `<div class="aviso" role="status">${esc(S.aviso)}</div>` : ''}
      <h4 class="rs__st">${esc(t('r.p1.tusbicis'))}</h4>
      <div id="lineas">${lineasHtml()}</div>
      ${errorGlobal()}`;
  }
  function paso2() {
    const cfg = NC.config(), n = nBicis();
    const inc = cfg.extras.filter(e => e.incluido), pago = cfg.extras.filter(e => !e.incluido && e.tipo === 'por_bici');
    const ent = [['local', t('r.p2.local'), t('r.gratis'), t('r.p2.local2')], ['oviedo', t('r.p2.oviedo'), eur(cfg.extras.find(e => e.id === 'entrega_oviedo').precio), t('r.p2.oviedo2')], ['fuera', t('r.p2.fuera'), t('r.apresup'), t('r.p2.fuera2')]];
    return `<h3 class="rs__t">${esc(t('r.p2.t'))}</h3>
      <h4 class="rs__st">${esc(t('r.p2.incl'))}</h4>
      <ul class="extras extras--inc">${inc.map(e => `<li><label class="chk"><input type="checkbox" checked disabled><span>${esc(nomExtra(e))}</span></label><span class="extra__p">${esc(t('r.incluido'))}</span></li>`).join('')}</ul>
      <h4 class="rs__st">${esc(t('r.p2.extras'))}</h4>
      <p class="ayuda">${esc(t('r.p2.nota'))}</p>
      <ul class="extras">${pago.map(e => { const q = S.extras[e.id] || 0; return `<li><span class="extra__n">${esc(nomExtra(e))}<small>${esc(eur(e.precio))} · ${esc(t('r.p2.porbici'))}</small></span><div class="paso" role="group" aria-label="${esc(nomExtra(e))}"><button type="button" data-act="extra" data-id="${e.id}" data-d="-1" aria-label="${esc(t('r.menos'))}"${q <= 0 ? ' disabled' : ''}>−</button><output>${q}</output><button type="button" data-act="extra" data-id="${e.id}" data-d="1" aria-label="${esc(t('r.mas'))}"${q >= n ? ' disabled' : ''}>+</button></div></li>`; }).join('')}</ul>
      <h4 class="rs__st">${esc(t('r.p2.entrega'))}</h4>
      <div class="radios" role="radiogroup" aria-label="${esc(t('r.p2.entrega'))}">${ent.map(([v, a, p, d]) => `<label class="radio${S.entrega === v ? ' on' : ''}"><input type="radio" name="entrega" value="${v}" data-act="entrega"${S.entrega === v ? ' checked' : ''}><span class="radio__t"><b>${esc(a)}</b><small>${esc(d)}</small></span><span class="radio__p">${esc(p)}</span></label>`).join('')}</div>
      ${S.entrega === 'fuera' ? `<div class="aviso">${esc(t('r.p2.fuera3'))}</div>` : ''}
      <h4 class="rs__st">${esc(t('r.p2.cod'))} <span class="opc">(${esc(t('r.opcional'))})</span></h4>
      <div class="cod"><div class="campo${S.errores.codigo ? ' campo--err' : ''}"><label for="f-codigo" class="sr">${esc(t('r.p2.cod'))}</label><input id="f-codigo" name="codigo" data-f="codigo" value="${esc(S.codigoTxt)}" placeholder="${esc(t('r.p2.codph'))}" autocapitalize="characters" autocomplete="off"${S.errores.codigo ? ' aria-invalid="true" aria-describedby="e-codigo"' : ''}></div><button type="button" class="btn btn--borde" data-act="aplicar">${esc(t('r.p2.aplicar'))}</button></div>
      ${S.colectivo ? `<p class="cod__ok" role="status">✓ ${esc(t('r.p2.codok', { nombre: S.colectivo.nombre, n: S.colectivo.descuento }))}</p>` : S.errores.codigo ? `<p class="campo__err" id="e-codigo" role="alert">${esc(S.errores.codigo)}</p>` : `<p class="ayuda">${esc(t('r.p2.codayuda'))}</p>`}`;
  }
  function paso3() {
    const c = S.cliente, h = +c.altura, sug = c.altura && h >= 100 && h <= 230 ? tallaSug(h) : null;
    const tallas = [...new Set(S.lineas.map(l => l.talla))];
    const sugTxt = sug ? (tallas.length === 1 && tallas[0] === sug ? t('r.p3.sugok', { talla: sug }) : t('r.p3.sug', { talla: sug, tallas: tallas.join(', ') })) : t('r.p3.alturaayuda');
    return `<h3 class="rs__t">${esc(t('r.p3.t'))}</h3>
      ${errorGlobal()}
      <div class="fila2">${campo('nombre', t('r.p3.nombre'), { valor: c.nombre, aut: 'name' })}${campo('telefono', t('r.p3.tel'), { valor: c.telefono, aut: 'tel', tipo: 'tel', im: 'tel' })}</div>
      ${campo('email', t('r.p3.email'), { valor: c.email, aut: 'email', tipo: 'email', im: 'email' })}
      <div class="fila2">${campo('altura', t('r.p3.altura'), { valor: c.altura, tipo: 'number', im: 'numeric', ph: '175', opc: true, ayuda: `<span id="sug">${esc(sugTxt)}</span>` })}${campo('documento', t('r.p3.doc'), { valor: c.documento, aut: 'off', ayuda: esc(t('r.p3.docayuda')), max: 15 })}</div>
      ${S.entrega !== 'local' ? campo('direccion', t('r.p3.dir'), { valor: S.direccion, grupo: 'direccion', aut: 'street-address', ayuda: esc(t(S.entrega === 'oviedo' ? 'r.p3.dirayuda' : 'r.p3.dirayuda2')) }) : ''}
      <div class="condiciones"><b>${esc(t('r.p3.cancel'))}</b><p>${esc(NC.config().cancelacion.texto[I18N.lang] || NC.config().cancelacion.texto.es)}</p></div>
      <label class="chk${S.errores.acepto ? ' chk--err' : ''}"><input type="checkbox" id="f-acepto" data-f="acepto"${S.acepto ? ' checked' : ''}${S.errores.acepto ? ' aria-invalid="true" aria-describedby="e-acepto"' : ''}><span>${esc(t('r.p3.acepto'))}</span></label>
      ${S.errores.acepto ? `<p class="campo__err" id="e-acepto" role="alert">${esc(S.errores.acepto)}</p>` : ''}
      <label class="chk"><input type="checkbox" id="f-novedades" data-f="novedades"${S.novedades ? ' checked' : ''}><span>${esc(t('r.p3.novedades'))}</span></label>`;
  }
  function paso4() {
    const p = precio(), q = esPresupuesto(), tj = S.tarjeta;
    if (q) {
      return `<h3 class="rs__t">${esc(t('r.p4q.t'))}</h3>
        <div class="aviso"><b>${esc(S.entrega === 'fuera' && dias() <= NC.config().diasMaxPrecio ? t('r.p4q.fuera') : t('r.consulta'))}</b><p>${esc(t('r.p4q.d'))}</p></div>
        <ul class="pasos-q"><li>${esc(t('r.p4q.1'))}</li><li>${esc(t('r.p4q.2'))}</li><li>${esc(t('r.p4q.3'))}</li></ul>
        ${S.errores.envio ? `<div class="aviso aviso--err" role="alert">${esc(S.errores.envio)}</div>` : ''}`;
    }
    return `<h3 class="rs__t">${esc(t('r.p4.t'))}</h3>
      <div class="senal"><div><span>${esc(t('r.p4.senal', { n: NC.config().senalPct }))}</span><strong>${esc(eur(p.senal))}</strong><small>${esc(t('r.p4.retenida'))}</small></div><div><span>${esc(t('r.p4.resto'))}</span><strong>${esc(eur(p.resto))}</strong><small>${esc(t('r.p4.restod'))}</small></div></div>
      <div class="aviso aviso--ok"><b>${esc(t('r.p4.garantia'))}</b><p>${esc(t('r.p4.garantia2'))}</p></div>
      <h4 class="rs__st">${esc(t('r.p4.tarjeta'))}</h4>
      <div class="demo-tarjeta" role="note">${esc(t('r.p4.demo'))}</div>
      ${errorGlobal()}
      ${campo('titular', t('r.p4.titular'), { valor: tj.titular, grupo: 'tarjeta', aut: 'cc-name' })}
      ${campo('numero', t('r.p4.numero'), { valor: tj.numero, grupo: 'tarjeta', aut: 'cc-number', im: 'numeric', ph: '4242 4242 4242 4242', max: 23 })}
      <div class="fila2">${campo('cad', t('r.p4.cad'), { valor: tj.cad, grupo: 'tarjeta', aut: 'cc-exp', im: 'numeric', ph: 'MM/AA', max: 5 })}${campo('cvc', 'CVC', { valor: tj.cvc, grupo: 'tarjeta', aut: 'cc-csc', im: 'numeric', ph: '123', max: 4 })}</div>
      ${S.errores.envio ? `<div class="aviso aviso--err" role="alert">${esc(S.errores.envio)}</div>` : ''}`;
  }

  // ---------- resumen ----------
  function resumen() {
    const nd = dias(), p = S.paso >= 2 && S.lineas.length && nd ? precio() : null;
    let h = `<h3 class="res__t">${esc(t('r.res.t'))}</h3>`;
    if (!S.desde || !S.hasta) return h + `<p class="ayuda">${esc(t('r.res.vacio'))}</p>`;
    h += `<p class="res__f"><b>${esc(fFecha(S.desde))} → ${esc(fFecha(S.hasta))}</b><br>${esc(t(nd === 1 ? 'r.dia1' : 'r.dias', { n: nd }))}</p><ul class="res__l">`;
    if (!p) {
      S.lineas.forEach(l => { h += `<li><span>${esc(nomTipo(l.tipo))} · ${l.talla} × ${l.cantidad}</span></li>`; });
      return h + `</ul><p class="ayuda">${esc(t('r.res.precio2'))}</p>`;
    }
    if (p.motivo === 'dias') {
      S.lineas.forEach(l => { h += `<li><span>${esc(nomTipo(l.tipo))} · ${l.talla} × ${l.cantidad}</span></li>`; });
      return h + `</ul><div class="aviso"><b>${esc(t('r.consulta'))}</b></div>`;
    }
    p.lineas.forEach(l => {
      h += `<li><span>${esc(nomTipo(l.tipo))} · ${l.talla} × ${l.cantidad}<small>${esc(t('r.res.dias'))}: ${l.detalle.map(d => num(d.precio)).join(' + ')} = ${esc(eur(l.porBici))} ${esc(t('r.res.porbici'))}</small></span><b>${esc(eur(l.importe))}</b></li>`;
    });
    if (p.descuentoDias > 0) h += `<li class="res__desc"><span>${esc(t('r.res.descdias'))}<small>${esc(t('r.res.descdias2'))}</small></span><b>−${esc(eur(p.descuentoDias))}</b></li>`;
    p.extras.filter(e => !e.incluido).forEach(e => { h += `<li><span>${esc(nomExtra(NC.extra(e.id)))} × ${e.cantidad}</span><b>${esc(eur(e.importe))}</b></li>`; });
    h += `<li><span>${esc(t('r.p2.' + S.entrega))}</span><b>${S.entrega === 'fuera' ? esc(t('r.apresup')) : p.entrega.importe ? esc(eur(p.entrega.importe)) : esc(t('r.gratis'))}</b></li>`;
    if (p.colectivo) h += `<li class="res__desc"><span>${esc(p.colectivo.nombre)} (−${p.colectivo.descuento} %)<small>${esc(t('r.res.colnota'))}</small></span><b>−${esc(eur(p.descuentoColectivo))}</b></li>`;
    h += '</ul>';
    if (S.entrega === 'fuera') return h + `<div class="res__tot"><span>${esc(t('r.res.totsin'))}</span><b>${esc(eur(p.total))}</b></div><div class="aviso">${esc(t('r.p2.fuera3'))}</div>`;
    h += `<div class="res__tot"><span>${esc(t('r.res.total'))}</span><b>${esc(eur(p.total))}</b></div>
      <dl class="res__pago"><div><dt>${esc(t('r.res.senal', { n: NC.config().senalPct }))}</dt><dd>${esc(eur(p.senal))}</dd></div><div><dt>${esc(t('r.res.resto'))}</dt><dd>${esc(eur(p.resto))}</dd></div></dl>`;
    return h;
  }
  function textoBarra() {
    const nd = dias();
    if (S.paso >= 2 && S.lineas.length && nd) { const p = precio(); if (p.consultar) return `<span>${esc(t('r.barra.presup'))}</span><b>—</b>`; return `<span>${esc(t('r.res.total'))}</span><b>${esc(eur(p.total))}</b>`; }
    if (S.lineas.length && nd) return `<span>${esc(t(nd === 1 ? 'r.dia1' : 'r.dias', { n: nd }))}</span><b>${esc(t('r.barra.bicis', { n: nBicis() }))}</b>`;
    return `<span>${esc(t('r.barra.elige'))}</span><b>—</b>`;
  }
  const etiquetaSig = () => (S.paso === 4 ? (esPresupuesto() ? t('r.p4q.enviar') : t('r.p4.reservar')) : t('r.sig'));

  // ---------- final ----------
  function final() {
    const r = S.resultado, q = r.estado === 'presupuesto';
    return `<div class="fin" tabindex="-1" id="rs-fin"><div class="fin__ico" aria-hidden="true">✓</div>
      <p class="fin__lema">${esc(t('r.fin.lema'))}</p>
      <h3>${esc(t(q ? 'r.fin.tq' : 'r.fin.t'))}</h3>
      <p class="fin__num">${esc(t('r.fin.num'))} <b>${esc(r.id)}</b></p>
      <p><span class="badge badge--pend">${esc(t(q ? 'r.fin.estq' : 'r.fin.est'))}</span></p>
      <div class="fin__cols"><div><h4>${esc(t('r.fin.ahora'))}</h4><ol><li>${esc(t(q ? 'r.fin.q1' : 'r.fin.1'))}</li><li>${esc(t(q ? 'r.fin.q2' : 'r.fin.2'))}</li><li>${esc(t(q ? 'r.fin.q3' : 'r.fin.3'))}</li></ol></div>
      <div class="fin__res"><h4>${esc(t('r.fin.tureserva'))}</h4>${resumenFinal(r)}</div></div>
      <p class="ayuda">${esc(t('r.fin.demo'))}</p>
      <button type="button" class="btn btn--borde" data-act="nueva">${esc(t('r.fin.nueva'))}</button></div>`;
  }
  function resumenFinal(r) {
    const nd = r.dias;
    let h = `<p>${esc(fFecha(r.desde))} → ${esc(fFecha(r.hasta))} · ${esc(t(nd === 1 ? 'r.dia1' : 'r.dias', { n: nd }))}</p><ul>`;
    r.lineas.forEach(l => { h += `<li>${esc(nomTipo(l.tipo))} · ${l.talla} × ${l.cantidad}</li>`; });
    h += '</ul>';
    if (r.estado === 'presupuesto') return h + `<p><b>${esc(t('r.res.presup'))}</b></p>`;
    return h + `<p><b>${esc(t('r.res.total'))}: ${esc(eur(r.total))}</b><br>${esc(t('r.res.senal', { n: NC.config().senalPct }))}: ${esc(eur(r.senal))} · ${esc(t('r.res.resto'))}: ${esc(eur(r.resto))}</p>`;
  }

  // ---------- render ----------
  function progreso() {
    const q = esPresupuesto();
    const nombres = [t('r.pr1'), t('r.pr2'), t('r.pr3'), t(q ? 'r.pr4q' : 'r.pr4')];
    return `<ol class="prog" aria-label="${esc(t('r.progreso'))}">${nombres.map((n, i) => `<li class="${i + 1 === S.paso ? 'act' : i + 1 < S.paso ? 'hecho' : ''}"${i + 1 === S.paso ? ' aria-current="step"' : ''}><span class="prog__n">${i + 1 < S.paso ? '✓' : i + 1}</span><span class="prog__t">${esc(n)}</span></li>`).join('')}</ol>`;
  }
  function render(parte, opts = {}) {
    if (S.resultado) { root.innerHTML = final(); const f = document.getElementById('rs-fin'); if (opts.foco !== false && f) f.focus({ preventScroll: true }); return; }
    if (parte === 'cal') { // solo calendario, rango y líneas (mantiene el foco del calendario)
      const act = document.activeElement, teclado = act && act.matches && act.matches(':focus-visible'), f = teclado && act.dataset && act.dataset.f;
      document.getElementById('rs-paso').innerHTML = paso1();
      document.getElementById('rs-res').innerHTML = resumen();
      document.getElementById('rs-barra-txt').innerHTML = textoBarra();
      const b = f && root.querySelector(`.cal__dia[data-f="${f}"]`) || (teclado && act.dataset && act.dataset.act === 'mes' && root.querySelector(`.cal__nav[data-d="${act.dataset.d}"]:not([disabled])`));
      if (b) b.focus({ preventScroll: true });
      return;
    }
    const pasoFn = [paso1, paso2, paso3, paso4][S.paso - 1];
    root.innerHTML = `${progreso()}<div class="rs__grid"><div class="rs__main" id="rs-main">${S.paso > 1 ? `<button type="button" class="atras" data-act="atras">← ${esc(t('r.atras'))}</button>` : ''}<div id="rs-paso">${pasoFn()}</div>
      <div class="rs__nav"><button type="button" class="btn btn--primario btn--lg" data-act="siguiente"${S.enviando ? ' disabled' : ''}>${esc(S.enviando ? t('r.procesando') : etiquetaSig())}</button></div></div>
      <aside class="rs__res" id="rs-res" aria-label="${esc(t('r.res.t'))}">${resumen()}</aside></div>
      <div class="rs__barra" id="rs-barra"><div class="rs__barra-t" id="rs-barra-txt">${textoBarra()}</div><button type="button" class="btn btn--primario" data-act="siguiente"${S.enviando ? ' disabled' : ''}>${esc(S.enviando ? t('r.procesando') : etiquetaSig())}</button></div>`;
    if (opts.foco) { const el = root.querySelector('#rs-errores a, .campo--err input, .chk--err input'); if (el) el.focus({ preventScroll: false }); }
  }
  const irArriba = () => { const r = root.getBoundingClientRect(); const top = window.scrollY + r.top - 76; window.scrollTo({ top: Math.max(0, top), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); };

  // ---------- validación y navegación ----------
  function validar1() {
    const e = {};
    if (!S.desde || !S.hasta) e.fechas = t('r.v.fechas');
    else if (!S.lineas.length) e.bici = t('r.v.bici');
    return e;
  }
  function validar3() {
    const e = {}, c = S.cliente;
    if (c.nombre.trim().length < 2) e.nombre = t('r.v.nombre');
    if (c.telefono.replace(/\D/g, '').length < 9) e.telefono = t('r.v.tel');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email.trim())) e.email = t('r.v.email');
    if (c.altura && (+c.altura < 120 || +c.altura > 220)) e.altura = t('r.v.altura');
    if (!/^[A-Za-z0-9-]{5,15}$/.test(c.documento.trim())) e.documento = t('r.v.doc');
    if (S.entrega !== 'local' && S.direccion.trim().length < 4) e.direccion = t('r.v.dir');
    if (!S.acepto) e.acepto = t('r.v.acepto');
    return e;
  }
  function validar4() {
    const e = {}, tj = S.tarjeta, dig = tj.numero.replace(/\D/g, '');
    if (tj.titular.trim().length < 3) e.titular = t('r.v.titular');
    if (dig.length < 13 || dig.length > 19) e.numero = t('r.v.numero');
    const m = tj.cad.match(/^(\d{2})\/(\d{2})$/);
    const ahora = new Date(), yy = ahora.getFullYear() % 100, mm = ahora.getMonth() + 1;
    if (!m || +m[1] < 1 || +m[1] > 12 || +m[2] < yy || (+m[2] === yy && +m[1] < mm)) e.cad = t('r.v.cad');
    if (!/^\d{3,4}$/.test(tj.cvc)) e.cvc = t('r.v.cvc');
    return e;
  }
  function aplicarCodigo(silencioso) {
    const txt = S.codigoTxt.trim();
    S.errores = {}; S.colectivo = null;
    if (!txt) { S.codigoMsg = ''; return true; }
    const c = NC.validarCodigo(txt);
    if (c) { S.colectivo = { codigo: c.codigo, nombre: c.nombre, descuento: c.descuento }; S.codigoTxt = c.codigo; return true; }
    S.errores.codigo = t('r.v.codigo'); return false;
  }
  function siguiente() {
    if (S.enviando) return;
    S.errores = {};
    if (S.paso === 1) {
      const e = validar1();
      if (Object.keys(e).length) { S.errores = {}; S.aviso = e.fechas || e.bici; render('cal'); const r = document.getElementById('rango-txt'); return r && r.scrollIntoView({ block: 'center' }); }
      S.aviso = ''; registrar(1); S.paso = 2;
    } else if (S.paso === 2) {
      if (!aplicarCodigo()) { render(null, { foco: true }); return; }
      registrar(2); S.paso = 3;
    } else if (S.paso === 3) {
      const e = validar3();
      if (Object.keys(e).length) { S.errores = e; render(null, { foco: true }); return; }
      registrar(3); S.paso = 4;
    } else if (S.paso === 4) { return enviar(); }
    render(); irArriba();
  }
  function enviar() {
    const q = esPresupuesto();
    if (!q) { const e = validar4(); if (Object.keys(e).length) { S.errores = e; render(null, { foco: true }); return; } }
    // comprobar que sigue habiendo stock
    if (S.lineas.some(l => libre(l.tipo, l.talla) < 0 || NC.disponibles(l.tipo, l.talla, S.desde, S.hasta) < S.lineas.filter(x => x.tipo === l.tipo && x.talla === l.talla).reduce((a, x) => a + x.cantidad, 0))) {
      S.paso = 1; ajustarLineas(true); S.aviso = t('r.v.stock'); render(); irArriba(); return;
    }
    registrar(4);
    S.enviando = true; render();
    setTimeout(() => {
      const c = { ...S.cliente, nombre: S.cliente.nombre.trim(), email: S.cliente.email.trim(), telefono: S.cliente.telefono.trim(), documento: S.cliente.documento.trim().toUpperCase(), altura: S.cliente.altura ? +S.cliente.altura : null };
      const r = NC.crearReserva({ desde: S.desde, hasta: S.hasta, lineas: S.lineas, extras: S.extras, entrega: S.entrega, direccion: S.direccion.trim(), codigo: S.colectivo ? S.colectivo.codigo : '', cliente: c, novedades: S.novedades, idioma: I18N.lang, sesion: S.sesion, origen: 'web' });
      NC.evento(S.sesion, 5, { ...datosEvento(), reserva: r.id });
      S.resultado = r; S.enviando = false; S.tarjeta = { titular: '', numero: '', cad: '', cvc: '' };
      render(); irArriba();
    }, 800);
  }

  // ---------- eventos ----------
  root.addEventListener('click', ev => {
    const el = ev.target.closest('[data-act]'); if (!el || el.disabled) return;
    const a = el.dataset.act, i = +el.dataset.i, d = +el.dataset.d;
    if (a === 'dia') clickDia(el.dataset.f);
    else if (a === 'mes') { S.mes = new Date(S.mes.getFullYear(), S.mes.getMonth() + d, 1); render('cal'); }
    else if (a === 'qty') { const l = S.lineas[i]; l.cantidad = Math.max(1, Math.min(l.cantidad + d, libre(l.tipo, l.talla, i))); limpiarExtras(); render('cal'); }
    else if (a === 'quitar') { S.lineas.splice(i, 1); limpiarExtras(); render('cal'); }
    else if (a === 'anadir') { const n = primeraLibre(); if (n) S.lineas.push({ ...n, cantidad: 1 }); render('cal'); }
    else if (a === 'extra') { const id = el.dataset.id, v = Math.max(0, Math.min((S.extras[id] || 0) + d, nBicis())); if (v) S.extras[id] = v; else delete S.extras[id]; render(); }
    else if (a === 'aplicar') { const ok = aplicarCodigo(); render(null, { foco: !ok }); }
    else if (a === 'siguiente') siguiente();
    else if (a === 'atras') { S.errores = {}; S.paso = Math.max(1, S.paso - 1); render(); irArriba(); }
    else if (a === 'nueva') { S = nuevoEstado(); render(); irArriba(); }
    else if (a === 'irerror') { ev.preventDefault(); const x = document.getElementById('f-' + el.dataset.id); if (x) x.focus(); }
  });
  root.addEventListener('change', ev => {
    const el = ev.target, a = el.dataset.act;
    if (a === 'tipo') { const l = S.lineas[+el.dataset.i], ta = ['M', 'S', 'L'].find(x => libre(el.value, x, +el.dataset.i) > 0) || l.talla; const pref = libre(el.value, l.talla, +el.dataset.i) > 0 ? l.talla : ta; l.tipo = el.value; l.talla = pref; l.cantidad = Math.max(1, Math.min(l.cantidad, libre(l.tipo, l.talla, +el.dataset.i))); render('cal'); document.getElementById('lt' + el.dataset.i)?.focus(); }
    else if (a === 'talla') { const l = S.lineas[+el.dataset.i]; l.talla = el.value; l.cantidad = Math.max(1, Math.min(l.cantidad, libre(l.tipo, l.talla, +el.dataset.i))); render('cal'); document.getElementById('ls' + el.dataset.i)?.focus(); }
    else if (a === 'entrega') { S.entrega = el.value; render(); root.querySelector('input[name="entrega"]:checked')?.focus(); }
    else if (el.dataset.f === 'acepto') { S.acepto = el.checked; limpiarError(el); }
    else if (el.dataset.f === 'novedades') S.novedades = el.checked;
  });
  const limpiarError = el => { const k = el.name || el.id.replace('f-', ''); if (!S.errores[k]) return; delete S.errores[k]; const c = el.closest('.campo, .chk'); if (c) { c.classList.remove('campo--err', 'chk--err'); } el.removeAttribute('aria-invalid'); const m = document.getElementById('e-' + k); if (m) m.remove(); const l = document.querySelector('#rs-errores a[data-id="' + k + '"]'); if (l) { l.parentElement.remove(); } };
  root.addEventListener('input', ev => {
    const el = ev.target, g = el.dataset.f; if (!g) return;
    limpiarError(el);
    if (g === 'cliente') { S.cliente[el.name] = el.value; if (el.name === 'altura') { const h = +el.value, s = document.getElementById('sug'); if (s) { const tallas = [...new Set(S.lineas.map(l => l.talla))]; s.textContent = h >= 100 && h <= 230 ? (tallas.length === 1 && tallas[0] === tallaSug(h) ? t('r.p3.sugok', { talla: tallaSug(h) }) : t('r.p3.sug', { talla: tallaSug(h), tallas: tallas.join(', ') })) : t('r.p3.alturaayuda'); } } }
    else if (g === 'direccion') S.direccion = el.value;
    else if (g === 'codigo') { S.codigoTxt = el.value; }
    else if (g === 'tarjeta') {
      let v = el.value;
      if (el.name === 'numero') { v = v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim(); el.value = v; }
      if (el.name === 'cad') { v = v.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); el.value = v; }
      if (el.name === 'cvc') { v = v.replace(/\D/g, '').slice(0, 4); el.value = v; }
      S.tarjeta[el.name] = v;
    }
  });
  root.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.dataset.f === 'codigo') { ev.preventDefault(); const ok = aplicarCodigo(); render(null, { foco: !ok }); } });

  // barra fija móvil: solo visible mientras la sección de reserva está en pantalla
  const secc = document.getElementById('reservar');
  if ('IntersectionObserver' in window && secc) {
    new IntersectionObserver(en => root.classList.toggle('rs--visible', en[0].isIntersecting), { threshold: 0, rootMargin: '-80px 0px -20% 0px' }).observe(secc);
  }
  document.addEventListener('idioma', () => { if (S.aviso && S.paso === 1) S.aviso = ''; render(null, { foco: false }); });
  render();
})();
