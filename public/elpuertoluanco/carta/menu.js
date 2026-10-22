const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
const eur = n => Number(n).toLocaleString('es-ES', { style:'currency', currency:'EUR' });
let data, evitar = new Set();

function pintar() {
  const cont = document.getElementById('carta');
  cont.innerHTML = '';
  for (const c of data.categorias) {
    const platos = c.platos.filter(p => !evitar.size || (Array.isArray(p.alergenos) && !p.alergenos.some(a => evitar.has(a))));
    if (!platos.length) continue;
    const sec = document.createElement('section');
    sec.id = c.id;
    sec.innerHTML = `<h2>${escapeHTML(c.nombre)}</h2>` + platos.map(p => `
      <div class="plato">
        <div>
          <h3>${escapeHTML(p.nombre)}</h3>
          ${p.desc ? `<p>${escapeHTML(p.desc)}</p>` : ''}
          ${(p.alergenos || []).length ? `<div class="al">${p.alergenos.map(a => `<span>${escapeHTML(data.alergenos[a])}</span>`).join('')}</div>` : ''}
        </div>
        <div class="precio">${eur(p.precio)}${p.nota ? ` <small>(${escapeHTML(p.nota)})</small>` : ''}</div>
      </div>`).join('');
    cont.appendChild(sec);
  }
  if (!cont.children.length) cont.textContent = 'No hay platos con información confirmada para esta selección. Consulta al personal.';
  document.querySelectorAll('#nav a').forEach(a => { a.hidden = !document.getElementById(decodeURIComponent(a.hash.slice(1))); });
}

fetch('carta.json').then(r => { if (!r.ok) throw new Error('Carta no disponible'); return r.json(); }).then(d => {
  data = d;
  document.querySelector('.filtro').hidden = !d.categorias.some(c => c.platos.some(p => Array.isArray(p.alergenos)));
  document.getElementById('nav').innerHTML = d.categorias.map(c => `<a href="#${encodeURIComponent(c.id)}">${escapeHTML(c.nombre.split(' (')[0].replace('Raciones para compartir y disfrutar','Raciones'))}</a>`).join('');
  document.getElementById('chips').innerHTML = Object.entries(d.alergenos).map(([k, v]) => `<label><input type="checkbox" value="${escapeHTML(k)}">${escapeHTML(v)}</label>`).join('');
  document.getElementById('chips').addEventListener('change', e => {
    e.target.checked ? evitar.add(e.target.value) : evitar.delete(e.target.value);
    pintar();
  });
  pintar();
}).catch(() => { document.getElementById('carta').textContent = 'No se pudo cargar la carta. Recarga la página o solicita una carta al personal.'; });
