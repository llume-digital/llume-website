// Lopita & Co · web pública: menú en el móvil, imágenes que faltan y envío de los formularios a la app.
(() => {
  const cab = document.querySelector('.cabecera');
  const boton = document.querySelector('.abrir-menu');
  if (cab && boton) boton.addEventListener('click', () => boton.setAttribute('aria-expanded', String(cab.classList.toggle('abierta'))));

  // Si una foto no está, se quita en vez de dejar el icono de imagen rota; el logo pasa a texto.
  document.querySelectorAll('img').forEach((img) => {
    const quitar = () => {
      if (img.closest('.marca')) img.replaceWith(document.createTextNode('LOPITA & CO'));
      else img.remove();
    };
    if (img.complete && img.naturalWidth === 0) quitar(); else img.addEventListener('error', quitar);
  });

  const MAX_CV = 5 * 1024 * 1024;
  const leer = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });

  document.querySelectorAll('form[data-formulario]').forEach((form) => {
    const estado = form.querySelector('.estado');
    const decir = (texto, ok) => { estado.textContent = texto; estado.className = `estado ${ok ? 'ok' : 'mal'}`; };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Vista previa en otra web (herramientas/exportar_vista_previa.py): no hay intranet detrás, no se envía nada.
      if ('vistaPrevia' in document.documentElement.dataset) {
        decir('Vista previa: este formulario aún no envía nada.', true);
        return;
      }
      const enviar = form.querySelector('[type="submit"]');
      const d = Object.fromEntries(new FormData(form));
      const body = { nombre: d.nombre, email: d.email, telefono: d.telefono || null, web: d.web || '', acepto_privacidad: d.acepto_privacidad === 'on' };
      try {
        if (form.dataset.formulario === 'candidatura') {
          const cv = form.querySelector('[name="cv"]').files[0];
          if (!cv) { decir('Adjunta tu CV.', false); return; }
          if (cv.size > MAX_CV) { decir('El CV pesa más de 5 MB.', false); return; }
          body.mensaje = d.mensaje || null;
          body.cv = { nombre: cv.name, tipo: cv.type || 'application/pdf', datos: await leer(cv) };
        } else {
          body.mensaje = d.mensaje;
          body.fecha = d.fecha || null;
          body.personas = d.personas ? Number(d.personas) : null;
        }
        enviar.disabled = true; decir('Enviando…', true);
        const r = await fetch(`/api/web/${form.dataset.formulario}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof j.detail === 'string' ? j.detail : 'No se ha podido enviar. Revisa los datos.');
        form.reset();
        decir(form.dataset.formulario === 'candidatura' ? '¡Gracias! Hemos recibido tu CV.' : '¡Gracias! Te contestaremos lo antes posible.', true);
      } catch (err) {
        decir(err.message || 'No se ha podido enviar. Prueba otra vez.', false);
      } finally { enviar.disabled = false; }
    });
  });
})();
