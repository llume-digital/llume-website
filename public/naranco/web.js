/* Nar&Co · interacción de la landing: idioma, menú, cabecera, contacto y visitas. */
(() => {
  const $ = id => document.getElementById(id), t = (k, v) => I18N.t(k, v);

  // idioma
  $('idioma').addEventListener('click', () => I18N.toggle());

  // menú móvil
  const burger = $('burger'), cab = $('cab');
  const cerrar = () => { cab.classList.remove('abierto'); burger.setAttribute('aria-expanded', 'false'); };
  burger.addEventListener('click', () => { const a = cab.classList.toggle('abierto'); burger.setAttribute('aria-expanded', String(a)); });
  $('menu').addEventListener('click', e => { if (e.target.closest('a')) cerrar(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
  document.addEventListener('click', e => { if (!cab.contains(e.target)) cerrar(); });

  // sombra de la cabecera al bajar
  const sombra = () => cab.classList.toggle('con-sombra', window.scrollY > 8);
  window.addEventListener('scroll', sombra, { passive: true }); sombra();

  // selects del formulario de contacto (nombres según idioma)
  const selMotivo = $('c-motivo'), selTipo = $('c-tipo'), selTalla = $('c-talla');
  function rellenar() {
    const lang = I18N.lang, cfg = NC.config();
    const prev = [selMotivo.value, selTipo.value, selTalla.value];
    selMotivo.innerHTML = `<option value="">${NC.esc(t('con.sel'))}</option>` + NC.MOTIVOS.map(m => `<option value="${m.id}">${NC.esc(m[lang])}</option>`).join('');
    selTipo.innerHTML = `<option value="">${NC.esc(t('con.nose'))}</option>` + cfg.tipos.map(x => `<option value="${x.id}">${NC.esc(x.nombre[lang] || x.nombre.es)}</option>`).join('');
    selTalla.innerHTML = `<option value="">${NC.esc(t('con.nose'))}</option>` + cfg.tallas.map(x => `<option value="${x}">${x}</option>`).join('');
    selMotivo.value = prev[0]; selTipo.value = prev[1]; selTalla.value = prev[2];
  }

  // formulario de contacto
  const form = $('form-consulta'), err = $('c-error'), ok = $('c-ok');
  form.addEventListener('submit', e => {
    e.preventDefault(); err.hidden = true;
    const v = n => form.elements[n].value.trim();
    const falta = !v('motivo') || !v('mensaje') || !v('nombre') || !v('contacto');
    ['motivo', 'mensaje', 'nombre', 'contacto'].forEach(n => form.elements[n].toggleAttribute('aria-invalid', !v(n)));
    if (falta) { err.textContent = t('con.err'); err.hidden = false; const p = ['motivo', 'mensaje', 'nombre', 'contacto'].find(n => !v(n)); form.elements[p].focus(); return; }
    const d = v('desde'), h = v('hasta');
    NC.crearConsulta({ motivo: v('motivo'), tipo: v('tipo'), talla: v('talla'), fechas: d || h ? `${d || '?'} → ${h || '?'}` : '', mensaje: v('mensaje'), nombre: v('nombre'), contacto: v('contacto') });
    form.reset(); ok.hidden = false; ok.focus();
  });

  // visita (una por sesión de navegador)
  try { if (!sessionStorage.getItem('nc_visita')) { sessionStorage.setItem('nc_visita', '1'); NC.registrarVisita(); } } catch { }

  rellenar();
  I18N.apply();
  document.addEventListener('idioma', () => { rellenar(); ok.hidden = true; err.hidden = true; });
})();
