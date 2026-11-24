/* Nar&Co · pestaña «Guía» del panel: cómo usar el panel y sacarle partido (texto para Mateo).
   Primeros pasos con casillas que se recuerdan en este navegador. panel.js llama a NCGuia.html() y NCGuia.marcar(). */
'use strict';
window.NCGuia = (() => {
  const K = 'naranco_guia_pasos';
  const leer = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } };
  const guardar = o => { try { localStorage.setItem(K, JSON.stringify(o)); } catch { } };

  // [id, texto, acción: pestaña del panel («ir») o enlace a la web («web»)]
  const PASOS = [
    ['reserva', 'Haz una reserva de prueba desde el móvil, como si fueras un cliente.', { web: '../#reservar', txt: 'Abrir la reserva' }],
    ['confirmar', 'Confírmala (o recházala) en Solicitudes. Fíjate en la señal retenida.', { ir: 'solicitudes', txt: 'Ir a Solicitudes' }],
    ['calendario', 'Mira en el Calendario cómo ese día ya cuenta las bicis que salen.', { ir: 'calendario', txt: 'Ir al Calendario' }],
    ['stock', 'Quita una bici de una talla en Stock y comprueba que la web ya no la ofrece.', { ir: 'stock', txt: 'Ir a Stock' }],
    ['bloquear', 'Bloquea un día que no puedas atender y mira que la web lo desactiva.', { ir: 'calendario', txt: 'Ir al Calendario' }],
    ['precios', 'Cambia un precio o crea un código de colectivo en Precios.', { ir: 'precios', txt: 'Ir a Precios' }],
    ['metricas', 'Echa un vistazo a Métricas: en qué paso se van los que no terminan la reserva.', { ir: 'metricas', txt: 'Ir a Métricas' }],
    ['comentario', 'Deja tu primer comentario con el botón verde «Comentar» del borde derecho.', { com: true, txt: 'Dejar un comentario' }],
  ];

  const SECCIONES = [
    ['Solicitudes', 'Aquí entra cada reserva. Mientras no la confirmes, la señal del 20 % está retenida en la tarjeta del cliente, no cobrada. Al confirmar se cobra; al rechazar se libera y las bicis quedan libres. Los alquileres de 5 días o más y las entregas fuera de Oviedo llegan como «Presupuesto» para que contestes con una oferta.',
      'Confirma o rechaza en menos de 24 horas: es lo que más tranquiliza al cliente. Si la altura del cliente no cuadra con la talla que pide, te lo señala.'],
    ['Calendario', 'Cada día muestra cuántas bicis están fuera sobre el total, con colores de menos a más ocupación. Al tocar un día ves sus reservas y las bicis libres por tipo y talla.',
      'Usa «No puedo atender este día» en cuanto sepas que vas a estar fuera: la web deja de ofrecerlo al momento. Bloquear no cancela las reservas que ya hubiera ese día.'],
    ['Stock', 'Las bicis que tienes de cada tipo y talla. La web solo deja reservar lo que queda libre, así que nunca vendes una bici que no tienes.',
      'Si una bici entra al taller, quítala aquí y vuelve a sumarla cuando esté lista. Si bajas por debajo de lo ya reservado, el panel te avisa.'],
    ['Precios', 'Precio por día de cada bici, descuento del 2.º, 3.º y 4.º día, extras, señal, política de cancelación y códigos de colectivo (MIR, Centro Asturiano…). Nada cambia hasta que pulsas «Guardar cambios».',
      'Crea un código distinto para cada acuerdo: luego, en Métricas, verás cuántas reservas trae cada colectivo.'],
    ['Métricas', 'Visitas, solicitudes, conversión, ingresos, bicis y tallas más pedidas, días de la semana con más demanda y el embudo de la reserva, con las reservas abandonadas en cada paso. Abajo están las consultas del formulario de contacto.',
      'Una vez a la semana, mira en qué paso se va más gente: ahí es donde merece la pena mejorar la web.'],
    ['Comentarios', 'La lista de cambios que nos pides para la web y el panel, con su prioridad y en qué estado están (nuevo, en curso, hecho o descartado). Nosotros te contestamos en cada uno.',
      'Puedes comentar desde cualquier página con el botón «Comentar»: ya rellena solo dónde estabas.'],
  ];

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function html() {
    const hechos = leer(), n = PASOS.filter(p => hechos[p[0]]).length;
    return `
      <div class="guia">
        <div class="guia__intro">
          <h2>Bienvenido a tu panel, Mateo</h2>
          <p>Desde aquí controlas las reservas de la nueva web: confirmas, ajustas stock y precios, bloqueas días y ves qué funciona. Está pensado para usarlo desde el móvil en un par de minutos al día.</p>
          <p class="guia__nota"><b>Esto es una demo.</b> Los pagos, los emails y los WhatsApp son simulados, y las reservas, el stock y los precios se guardan solo en este navegador. Puedes tocar todo sin miedo: con «Restablecer datos de ejemplo», abajo del todo, vuelve a estar como al principio. Lo único que sí nos llega son tus comentarios.</p>
        </div>

        <div class="guia__bloque">
          <div class="guia__cab"><h2>Primeros pasos</h2><span class="badge${n === PASOS.length ? ' badge--ok' : ''}">${n} de ${PASOS.length}</span></div>
          <p class="p-sub">Diez minutos para ver todo el circuito, de la reserva del cliente a tu confirmación.</p>
          <div class="guia__barra" role="progressbar" aria-label="Primeros pasos completados" aria-valuemin="0" aria-valuemax="${PASOS.length}" aria-valuenow="${n}"><i style="width:${n / PASOS.length * 100}%"></i></div>
          <ol class="guia__pasos">${PASOS.map(([id, txt, acc], i) => `<li class="${hechos[id] ? 'hecho' : ''}">
            <label class="chk"><input type="checkbox" data-paso="${id}"${hechos[id] ? ' checked' : ''}> <span><b>${i + 1}.</b> ${esc(txt)}</span></label>
            ${acc.web ? `<a class="btn btn--borde btn--mini" href="${acc.web}">${acc.txt}</a>` : acc.com ? `<button type="button" class="btn btn--borde btn--mini" data-acc="comentar">${acc.txt}</button>` : `<button type="button" class="btn btn--borde btn--mini" data-ir="${acc.ir}">${acc.txt}</button>`}</li>`).join('')}</ol>
        </div>

        <div class="guia__bloque">
          <h2>Qué hace cada pestaña</h2>
          <div class="guia__secs">${SECCIONES.map(([t, d, truco]) => `<details class="guia__sec"><summary>${t}</summary><p>${esc(d)}</p><p class="guia__truco"><b>Truco:</b> ${esc(truco)}</p></details>`).join('')}</div>
        </div>

        <div class="guia__bloque">
          <h2>Una rutina que funciona</h2>
          <ul class="guia__lista">
            <li><b>Cada día, 2 minutos:</b> abre Solicitudes y confirma o rechaza lo pendiente.</li>
            <li><b>Cuando cambie algo:</b> bici al taller, en Stock; día que no estás, en Calendario.</li>
            <li><b>Cada semana:</b> mira Métricas, sobre todo el embudo y las consultas sin atender.</li>
            <li><b>Antes de temporada:</b> revisa precios, extras y códigos de colectivo.</li>
          </ul>
          <p class="p-sub">Consejo: en el móvil, abre el panel y usa «Añadir a pantalla de inicio». Así lo tienes como una app más.</p>
        </div>

        <div class="guia__bloque">
          <h2>Cómo dejar un buen comentario</h2>
          <ul class="guia__lista">
            <li><b>Uno por comentario.</b> Así podemos marcar cada cambio como hecho por separado.</li>
            <li><b>Di qué ves y qué esperabas.</b> «El botón dice X; pondría Y» ayuda más que «no me convence».</li>
            <li><b>Elige la prioridad:</b> «Imprescindible» es lo que necesitas para lanzar; «Me gustaría», lo que mejora; «Idea para más adelante», lo que puede esperar.</li>
            <li><b>Si es de algo que te falta</b> (un dato, una pantalla, un aviso), cuéntanos para qué lo usarías.</li>
          </ul>
          <p><button type="button" class="btn btn--primario" data-acc="comentar">Dejar un comentario</button></p>
        </div>
      </div>`;
  }

  function marcar(id, si) { const o = leer(); if (si) o[id] = true; else delete o[id]; guardar(o); }
  return { html, marcar };
})();
