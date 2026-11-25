/* BioAsturias · Panel — arranque: pinta la primera pantalla y carga los comentarios. */
'use strict';
(() => {
  const BA = window.BA;
  window.addEventListener('hashchange', () => { document.body.dataset.donde = BA.rutas[(location.hash.replace(/^#\/?/, '').split('/')[0])]?.titulo || 'Brief diario'; });
  document.body.dataset.donde = (BA.rutas[location.hash.replace(/^#\/?/, '').split('/')[0]] || BA.rutas.brief).titulo;
  if (!BA.guardadoOk) console.warn('No se puede guardar en este navegador.');
  BA.refrescar(true);
  BA.cargarComentarios();
})();
