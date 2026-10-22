const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
// Cabecera con dos capas: blanca (base) y oscura (clonada). La oscura solo se ve
  // en los píxeles que coinciden con una sección clara (.light), vía clip-path.
  const cab = document.getElementById('top');
  const alt = document.createElement('div');
  alt.className = 'alt';
  alt.setAttribute('aria-hidden', 'true');
  alt.inert = true;
  alt.innerHTML = cab.innerHTML;
  alt.querySelectorAll('a').forEach(a => a.tabIndex = -1);
  cab.appendChild(alt);
  const claras = [...document.querySelectorAll('.light')];
  let pendiente = false;
  function pintarCabecera() {
    pendiente = false;
    const H = cab.offsetHeight, W = innerWidth;
    let d = '';
    for (const s of claras) {
      const r = s.getBoundingClientRect();
      const y1 = Math.max(0, r.top), y2 = Math.min(H, r.bottom);
      if (y2 > y1) d += `M0 ${y1}H${W}V${y2}H0Z`;
    }
    alt.style.clipPath = d ? `path('${d}')` : 'inset(100% 0 0 0)';
  }
  const pedir = () => { if (!pendiente) { pendiente = true; requestAnimationFrame(pintarCabecera); } };
  addEventListener('scroll', pedir, { passive: true });
  addEventListener('resize', pedir);
  pintarCabecera();

  // Reseñas (resenas.json), desplazamiento manual accesible.
  fetch('resenas.json').then(r => { if (!r.ok) throw new Error('Reseñas no disponibles'); return r.json(); }).then(d => {
    document.getElementById('r-media').textContent = d.puntuacion_media;
    document.getElementById('r-total').textContent = '/5 · ' + d.total + ' opiniones en Google';
    const card = r => `<article class="rev"><div class="stars" aria-label="${r.puntuacion/2} de 5">${'★'.repeat(Math.round(r.puntuacion/2))}${'☆'.repeat(5-Math.round(r.puntuacion/2))}</div><p>“${escapeHTML(r.texto)}”</p><footer><b>${escapeHTML(r.nombre)}</b><span>Google · ${escapeHTML(r.fecha)}</span></footer></article>`;
    const html = d.resenas.map(r => ({...r, puntuacion: Math.max(0, Math.min(10, Number(r.puntuacion) || 0))})).map(card).join('');
    document.getElementById('track').innerHTML = html;
  }).catch(() => document.getElementById('opiniones').hidden = true);

  // Índice de la carta, alimentado por carta.json
  fetch('carta/carta.json').then(r => { if (!r.ok) throw new Error('Carta no disponible'); return r.json(); }).then(d => {
    document.getElementById('indice').innerHTML = d.categorias.map(c =>
      `<a href="carta/#${encodeURIComponent(c.id)}"><span>${escapeHTML(c.nombre.split(' (')[0].replace('Raciones para compartir y disfrutar','Raciones'))}</span><small>${c.platos.length} platos</small></a>`).join('');
  }).catch(() => { document.getElementById('indice').textContent = 'Consulta la carta completa o pregunta al personal.'; });
