const $ = id => document.getElementById(id);
const fmt = f => new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' });
$('personas').innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i+1}"${i === 1 ? ' selected' : ''}>${i+1} ${i ? 'personas' : 'persona'}</option>`).join('');
$('fecha').min = EP.iso(EP.hoy); $('fecha').max = EP.iso(EP.mas(120)); $('fecha').value = EP.iso(EP.mas(1));
function horas() {
  const p = +$('personas').value, f = $('fecha').value, prev = $('hora').value;
  $('hora').innerHTML = EP.HORAS.map(h => { const libre = EP.AFORO - EP.ocupadas(f, h) >= p; return `<option value="${h}"${libre ? '' : ' disabled'}>${h}${libre ? '' : ' · completo'}</option>`; }).join('');
  if ([...$('hora').options].some(o => o.value === prev && !o.disabled)) $('hora').value = prev; else { const o = [...$('hora').options].find(x => !x.disabled); if (o) $('hora').value = o.value; }
}
$('personas').onchange = $('fecha').onchange = horas; horas();
const error = m => { $('err').textContent = m; $('err').hidden = !m; };
$('f').addEventListener('submit', e => {
  e.preventDefault(); error('');
  if ($('web').value) return;
  const nombre = $('nombre').value.trim(), tel = $('tel').value.replace(/[\s.-]/g, '');
  if (!$('fecha').value || $('fecha').value < $('fecha').min) return error('Elige una fecha válida.');
  if (!$('hora').value || $('hora').selectedOptions[0].disabled) return error('Elige una hora disponible.');
  if (nombre.length < 2) return error('Escribe tu nombre.');
  if (!/^(\+34)?[6-9]\d{8}$/.test(tel)) return error('Escribe un teléfono español válido (9 cifras).');
  if (!$('ok').checked) return error('Debes aceptar el uso de tus datos para reservar.');
  const r = EP.anadir({ nombre, personas: +$('personas').value, fecha: $('fecha').value, hora: $('hora').value, telefono: $('tel').value.trim(), notas: $('notas').value.trim(), origen: 'web' });
  $('f').hidden = true;
  $('ok-box').hidden = false;
  $('ok-box').innerHTML = `<h2>¡Reserva <em>confirmada</em>!</h2><p><strong>${EP.esc(r.nombre)}</strong>, te esperamos el <strong>${EP.esc(fmt(r.fecha))}</strong> a las <strong>${EP.esc(r.hora)}</strong> para <strong>${r.personas}</strong> ${r.personas === 1 ? 'persona' : 'personas'}.</p><p>Si necesitas cambiar algo, llama al 985 88 00 01 (tel. de contacto: ${EP.esc(r.telefono)}).</p><a class="btn primary" href="../">Volver a la web</a>`;
});
