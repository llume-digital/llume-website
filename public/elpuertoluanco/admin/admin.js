const $ = id => document.getElementById(id), esc = EP.esc;
const SES = 'ep_admin';
const ok = () => { try { return sessionStorage.getItem(SES) === '1'; } catch { return false; } };
const fd = f => new Date(f + 'T12:00').toLocaleDateString('es-ES', { weekday:'short', day:'numeric', month:'short' });
const pct = (a, b) => b ? Math.round(a / b * 100) + '%' : '–';
const suma = (a, f) => a.reduce((t, x) => t + f(x), 0);
const vivas = r => r.estado === 'confirmada' || r.estado === 'completada';
const GOLD = '#b8975a', INK = '#0e1a24', TEAL = '#6f9a9a';

function barras(items, { w = 560, h = 190, color = GOLD, every = 1 } = {}) {
  const max = Math.max(1, ...items.map(i => i.v)), bw = (w - 30) / items.length;
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfico de barras">` + [0, .5, 1].map(t => `<line x1="30" x2="${w}" y1="${h-24-(h-44)*t}" y2="${h-24-(h-44)*t}" stroke="#ece6d9"/><text x="0" y="${h-20-(h-44)*t}">${Math.round(max*t)}</text>`).join('') +
    items.map((i, k) => { const bh = (h - 44) * i.v / max; return `<rect x="${30+k*bw+1}" y="${h-24-bh}" width="${Math.max(1,bw-2)}" height="${bh}" fill="${i.hl ? INK : color}"><title>${esc(i.t || i.l)}: ${i.v}</title></rect>${k % every === 0 ? `<text x="${30+k*bw+bw/2}" y="${h-8}" text-anchor="middle">${esc(i.l)}</text>` : ''}`; }).join('') + '</svg>';
}
function linea(pts, { w = 560, h = 190 } = {}) {
  const max = Math.max(1, ...pts.map(p => p.v)), st = (w - 30) / (pts.length - 1), y = v => h - 24 - (h - 44) * v / max;
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${30 + i * st},${y(p.v)}`).join('');
  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Gráfico de línea">` + [0, .5, 1].map(t => `<line x1="30" x2="${w}" y1="${y(max*t)}" y2="${y(max*t)}" stroke="#ece6d9"/><text x="0" y="${y(max*t)+4}">${Math.round(max*t)}</text>`).join('') +
    `<path d="${d}L${30+(pts.length-1)*st},${h-24}L30,${h-24}Z" fill="${GOLD}" opacity=".15"/><path d="${d}" fill="none" stroke="${GOLD}" stroke-width="2"/>` +
    pts.map((p, i) => i % 5 === 0 ? `<text x="${30+i*st}" y="${h-8}" text-anchor="middle">${esc(p.l)}</text>` : '').join('') + '</svg>';
}
function hbarras(items, color = GOLD) {
  const max = Math.max(1, ...items.map(i => i.v));
  return items.map(i => `<div style="display:grid;grid-template-columns:150px 1fr 56px;gap:10px;align-items:center;font-size:.86rem;margin:7px 0"><span>${esc(i.l)}</span><span style="background:#f1ece0;height:12px"><i style="display:block;height:12px;width:${i.v/max*100}%;background:${color}"></i></span><b style="font-weight:400;text-align:right">${esc(i.t ?? i.v)}</b></div>`).join('');
}
const dm = f => f.slice(8) + '/' + f.slice(5, 7);
const ult = (n, hasta = 0) => Array.from({ length: n }, (_, i) => EP.iso(EP.mas(hasta - n + 1 + i)));

function fila(r, acc) {
  const cls = r.estado === 'no presentada' ? 'no' : r.estado;
  return `<tr><td>${esc(fd(r.fecha))}</td><td>${esc(r.hora)}</td><td>${esc(r.nombre)}</td><td>${r.personas}</td><td>${esc(r.telefono)}</td><td>${esc(r.origen)}</td><td><span class="tag ${cls}">${esc(r.estado)}</span></td><td>${esc(r.notas)}</td>${acc ? `<td>${r.estado === 'confirmada' ? `<button class="btn sm" data-c="${esc(r.id)}">Cancelar</button>` : ''}</td>` : ''}</tr>`;
}
const tabla = (rs, acc) => `<div class="tw"><table><thead><tr><th>Fecha</th><th>Hora</th><th>Nombre</th><th>Pers.</th><th>Teléfono</th><th>Origen</th><th>Estado</th><th>Notas</th>${acc ? '<th></th>' : ''}</tr></thead><tbody>${rs.map(r => fila(r, acc)).join('') || '<tr><td colspan="9">Sin reservas.</td></tr>'}</tbody></table></div>`;

const VISTAS = {
  panel() {
    const all = EP.todas(), hoy = EP.iso(EP.hoy), mes = hoy.slice(0, 7);
    const deHoy = all.filter(r => r.fecha === hoy && r.estado !== 'cancelada'), delMes = all.filter(r => r.fecha.startsWith(mes) && vivas(r));
    const pas = all.filter(r => r.fecha < hoy), noshow = pas.filter(r => r.estado === 'no presentada').length;
    const vis30 = EP.visitas.slice(-30), v30 = suma(vis30, x => x.visitas), res30 = suma(vis30, x => x.reservar);
    const d30 = ult(30), por = f => suma(all.filter(r => r.fecha === f && vivas(r)), r => r.personas);
    const horas = EP.HORAS.map(h => ({ l: h, v: all.filter(r => r.hora === h && vivas(r)).length }));
    return `<p class="eyebrow">Resumen</p><h1>Buenas, <em>Puerto</em></h1>
    <div class="kpis"><div class="kpi"><span>Reservas hoy</span><b>${deHoy.length}</b><small>${suma(deHoy, r => r.personas)} comensales</small></div>
    <div class="kpi"><span>Reservas del mes</span><b>${delMes.length}</b><small>${suma(delMes, r => r.personas)} comensales</small></div>
    <div class="kpi"><span>Visitas web (30 d)</span><b>${v30.toLocaleString('es-ES')}</b><small>${pct(res30, v30)} entran a reservar</small></div>
    <div class="kpi"><span>No presentadas</span><b>${pct(noshow, pas.length)}</b><small>histórico 5 meses</small></div>
    <div class="kpi"><span>Reservas por web</span><b>${pct(all.filter(r => r.origen === 'web').length, all.length)}</b><small>del total</small></div></div>
    <div class="panels"><div class="panel"><h3>Comensales por día · últimos 30 días</h3>${barras(d30.map(f => ({ l: dm(f), v: por(f), t: fd(f) })), { every: 5 })}</div>
    <div class="panel"><h3>Visitas web · últimos 30 días</h3>${linea(vis30.map(x => ({ l: dm(x.fecha), v: x.visitas })))}</div></div>
    <div class="panels"><div class="panel"><h3>Reservas por hora de llegada</h3>${barras(horas, { color: TEAL })}</div>
    <div class="panel"><h3>Tamaño del grupo</h3>${hbarras([['1–2', r => r.personas <= 2], ['3–4', r => r.personas > 2 && r.personas <= 4], ['5–6', r => r.personas > 4 && r.personas <= 6], ['7+', r => r.personas > 6]].map(([l, f]) => ({ l: l + ' personas', v: all.filter(r => vivas(r) && f(r)).length })))}<h3 style="margin-top:18px">Origen de las reservas</h3>${hbarras(['web', 'teléfono', 'presencial'].map(o => ({ l: o, v: all.filter(r => r.origen === o && vivas(r)).length })), INK)}</div></div>
    <h2>Hoy · ${esc(fd(hoy))}</h2>${tabla(deHoy)}`;
  },
  reservas() {
    const hoy = EP.iso(EP.hoy), prox = EP.todas().filter(r => r.fecha >= hoy && r.estado !== 'cancelada' || r.fecha >= hoy && r.estado === 'cancelada');
    return `<p class="eyebrow">Reservas</p><h1>Próximas <em>reservas</em></h1>
    <details class="panel" style="margin-bottom:16px" open><summary style="cursor:pointer;font-family:var(--serif);font-size:1.3rem">+ Añadir reserva manual</summary>
    <form id="af" class="addf"><label>Nombre<input id="an" required></label><label>Personas<input id="ap" type="number" min="1" max="40" value="2" required></label><label>Fecha<input id="ad" type="date" value="${hoy}" required></label>
    <label>Hora<select id="ah">${EP.HORAS.map(h => `<option>${h}</option>`).join('')}</select></label><label>Teléfono<input id="at" required></label><label>Origen<select id="ao"><option>teléfono</option><option>presencial</option></select></label>
    <label class="full">Notas<input id="ano"></label><div class="full"><button class="btn primary">Guardar reserva</button> <span id="am" class="note"></span></div></form></details>
    ${tabla(prox, true)}`;
  },
  historico() {
    return `<p class="eyebrow">Histórico</p><h1>Reservas <em>pasadas</em></h1><div class="tools"><label>Buscar<input id="q" placeholder="Nombre o teléfono"></label><label>Estado<select id="es"><option value="">Todos</option><option>completada</option><option>cancelada</option><option>no presentada</option></select></label><label>Desde<input type="date" id="dd"></label></div><div id="ht"></div>`;
  },
  visitas() {
    const v = EP.visitas, v90 = v.slice(-90), tot = suma(v90, x => x.visitas), meses = {};
    v.forEach(x => { const m = x.fecha.slice(0, 7); meses[m] = (meses[m] || 0) + x.visitas; });
    const dev = suma(v90, x => x.movil);
    return `<p class="eyebrow">Visitas web</p><h1>Entradas a la <em>web</em></h1>
    <div class="kpis"><div class="kpi"><span>Visitas (90 d)</span><b>${tot.toLocaleString('es-ES')}</b></div><div class="kpi"><span>Vieron la carta</span><b>${pct(suma(v90, x => x.carta), tot)}</b></div><div class="kpi"><span>Entraron a reservar</span><b>${pct(suma(v90, x => x.reservar), tot)}</b></div><div class="kpi"><span>Desde móvil</span><b>${pct(dev, tot)}</b></div></div>
    <div class="panels"><div class="panel"><h3>Visitas diarias · 90 días</h3>${linea(v90.map(x => ({ l: dm(x.fecha), v: x.visitas })))}</div>
    <div class="panel"><h3>Visitas por mes</h3>${barras(Object.entries(meses).map(([m, n]) => ({ l: m.slice(5), v: n, t: m })), { color: TEAL })}</div></div>
    <div class="panel"><h3>De dónde llegan</h3>${hbarras(EP.FUENTES.map(([l, p]) => ({ l, v: p, t: Math.round(p * 100) + '%' })))}</div><p class="note">Datos de ejemplo.</p>`;
  }
};
function montar(t) {
  document.querySelectorAll('.side [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  $('cont').innerHTML = VISTAS[t]();
  if (t === 'historico') { const f = () => { const hoy = EP.iso(EP.hoy), q = $('q').value.toLowerCase(); $('ht').innerHTML = tabla(EP.todas().filter(r => r.fecha < hoy && (!$('es').value || r.estado === $('es').value) && (!$('dd').value || r.fecha >= $('dd').value) && (r.nombre.toLowerCase().includes(q) || r.telefono.includes(q))).reverse().slice(0, 300)); }; ['q', 'es', 'dd'].forEach(i => $(i).oninput = f); f(); }
  if (t === 'reservas') {
    $('af').onsubmit = e => { e.preventDefault(); EP.anadir({ nombre: $('an').value.trim(), personas: +$('ap').value, fecha: $('ad').value, hora: $('ah').value, telefono: $('at').value.trim(), notas: $('ano').value.trim(), origen: $('ao').value }); montar('reservas'); $('am').textContent = ''; };
    $('cont').onclick = e => { const id = e.target.dataset?.c; if (id) { EP.estado(id, 'cancelada'); montar('reservas'); } };
  }
}
function entrar() { $('login').hidden = true; $('app').hidden = false; montar('panel'); }
$('lf').onsubmit = e => { e.preventDefault(); if ($('u').value === 'puerto' && $('p').value === 'puerto') { try { sessionStorage.setItem(SES, '1'); } catch {} entrar(); } else $('lerr').hidden = false; };
document.querySelectorAll('.side [data-t]').forEach(b => b.onclick = () => montar(b.dataset.t));
$('out').onclick = () => { try { sessionStorage.removeItem(SES); } catch {} location.reload(); };
if (ok()) entrar();
