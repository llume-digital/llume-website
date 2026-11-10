import { DAYS, weekday } from '../nucleo/util.js';
import { api, state, toast } from '../nucleo/estado.js';
import { renderView } from '../nucleo/pintado.js';
// ------------------------------------------------------------------ ARRASTRAR UN TURNO A OTRA CASILLA DEL CUADRANTE
// Arrastras la pastilla de un turno a otra casilla (otro día, otra persona o las dos). Si la casilla de destino
// ya tiene turno, se intercambian. Con ratón empieza a los pocos píxeles; con el dedo, tras una pulsación larga
// (así el cuadrante se sigue desplazando con normalidad). El servidor decide si vale; aquí solo se marca de
// antemano lo evidente (ausencias, libranzas fijas). El menú de la casilla tiene «Mover» para quien no arrastre.
const LARGA_MS = 350;
const UMBRAL_PX = 6;
let g = null;
let sinClic = false;

export const motivoNoVale = (emp, fecha) => {
  const cfg = state.config;
  if (!emp.activo) return 'ya no está en la plantilla';
  const aus = cfg.ausencias.find((a) => a.empleado_id === emp.id && a.desde <= fecha && fecha <= a.hasta);
  if (aus) return 'está ausente ese día';
  const trabaja = cfg.excepciones_asignacion.some((o) => o.empleado_id === emp.id && o.fecha === fecha && o.tipo === 'trabaja');
  if ((emp.libranzas_fijas || []).includes(DAYS[weekday(fecha)]) && !trabaja) return 'es su libranza fija';
  return '';
};

const celdaBajo = (x, y) => {
  const el = document.elementFromPoint(x, y);
  return el ? el.closest('.cell[data-act="cell"]') : null;
};

function marcar(celda) {
  if (g.destino === celda) return;
  if (g.destino) g.destino.classList.remove('drop-ok', 'drop-no');
  g.destino = celda;
  if (!celda || celda === g.celda) return;
  const emp = state.config.empleados.find((e) => e.id === celda.dataset.emp);
  const mal = emp ? motivoNoVale(emp, celda.dataset.date) : 'no se puede';
  celda.classList.add(mal ? 'drop-no' : 'drop-ok');
  celda.title = mal ? `${emp ? emp.nombre : ''}: ${mal}` : '';
}

function empezar() {
  g.activo = true;
  g.celda.classList.add('arrastrando');
  const pill = g.celda.querySelector('.pill');
  g.fantasma = pill.cloneNode(true);
  g.fantasma.className = `${pill.className} fantasma`;
  g.fantasma.style.width = `${pill.getBoundingClientRect().width}px`;
  g.fantasma.style.background = pill.style.background;
  document.body.appendChild(g.fantasma);
  document.body.classList.add('arrastrando-turno');
  mover(g.x, g.y);
}

function mover(x, y) {
  g.x = x; g.y = y;
  g.fantasma.style.transform = `translate(${x + 8}px, ${y + 8}px)`;
  marcar(celdaBajo(x, y));
}

function limpiar() {
  if (!g) return;
  clearTimeout(g.timer);
  if (g.destino) { g.destino.classList.remove('drop-ok', 'drop-no'); g.destino.removeAttribute('title'); }
  g.celda.classList.remove('arrastrando');
  if (g.fantasma) g.fantasma.remove();
  document.body.classList.remove('arrastrando-turno');
  g = null;
}

async function soltar(o, destino) {
  const body = { origen: { empleado_id: o.dataset.emp, fecha: o.dataset.date }, destino: { empleado_id: destino.dataset.emp, fecha: destino.dataset.date } };
  const id = state.current.id;
  try {
    state.current = await api('POST', `/api/horarios/${id}/mover`, body);
    renderView();
    const errs = state.current.horario.incidencias.filter((i) => i.nivel === 'error' && i.empleado_id === body.destino.empleado_id && i.fecha === body.destino.fecha);
    if (errs.length) toast(errs[0].mensaje, true);
  } catch (e) { toast(e.message, true); }
}

document.addEventListener('pointerdown', (e) => {
  if (g || e.button > 0 || !state.current) return;
  const celda = e.target.closest ? e.target.closest('.cell[data-act="cell"]') : null;
  if (!celda || !celda.querySelector('.pill') || !state.current.horario) return;
  g = { celda, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, activo: false, tactil: e.pointerType !== 'mouse', destino: null };
  if (g.tactil) g.timer = setTimeout(() => { if (g) empezar(); }, LARGA_MS);
});

document.addEventListener('pointermove', (e) => {
  if (!g || e.pointerId !== g.id) return;
  const lejos = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > UMBRAL_PX;
  if (!g.activo) {
    if (!lejos) return;
    if (g.tactil) { limpiar(); return; } // el dedo se mueve antes de la pulsación larga: es un desplazamiento
    g.x = e.clientX; g.y = e.clientY;
    empezar();
  }
  e.preventDefault();
  mover(e.clientX, e.clientY);
});

function terminar(e) {
  if (!g || e.pointerId !== g.id) return;
  const activo = g.activo;
  const destino = e.type === 'pointerup' ? celdaBajo(e.clientX, e.clientY) : null;
  const origen = g.celda;
  if (!activo) { limpiar(); return; }
  sinClic = true;
  setTimeout(() => { sinClic = false; }, 0);
  limpiar();
  if (destino && destino !== origen) soltar(origen, destino);
}
document.addEventListener('pointerup', terminar);
document.addEventListener('pointercancel', terminar);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && g && g.activo) { sinClic = true; setTimeout(() => { sinClic = false; }, 0); limpiar(); } });
// Mientras se arrastra con el dedo la página no debe desplazarse.
document.addEventListener('touchmove', (e) => { if (g && g.activo && e.cancelable) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => { if (g) e.preventDefault(); });
// Tras soltar, el navegador lanza un clic en la casilla de origen: no debe abrir el menú.
document.addEventListener('click', (e) => { if (sinClic) { e.stopPropagation(); e.preventDefault(); } }, true);
