import { $, esc } from '../nucleo/util.js';
import { NAV_ADMIN, head, tabsHtml } from '../nucleo/pintado.js';
// ------------------------------------------------------------------ NOVEDADES (mejoras recientes de la app)
// Las últimas mejoras, de la más nueva a la más antigua, explicadas para quien usa la app. Para anunciar una
// mejora nueva, añádela arriba del todo: la pestaña muestra cuántas hay desde la última vez que se abrió.
const NOVEDADES = [
  { fecha: '2026-11-05', titulo: 'Más personas a la vista en el horario del día', ir: 'horarios', texto: [
    'Las filas de la vista de día son más bajas, así que ves a mucha más gente a la vez sin desplazarte.',
    'Junto al nombre solo sale si es camarero o cocinero. Las etiquetas (abre, cierra, encargado y las funciones) van abreviadas dentro de la barra del turno, con una leyenda debajo que explica cada abreviatura.',
  ] },
  { fecha: '2026-11-05', titulo: 'Roles de camarero: caja, cafetera, sala y lava', ir: 'funciones', texto: [
    'En <b>Funciones → Roles de camarero</b> puedes crear los roles (y renombrarlos, quitarlos o añadir más) y en <b>Equipo</b> marcar quién sabe hacer cada uno.',
    'Pon reglas como «de 9:00 a 21:00, al menos 1 en caja» o «como mucho 1 en lava». Al generar el horario, cada camarero hace uno de sus roles durante todo el turno y lo verás escrito en su turno.',
  ] },
  { fecha: '2026-11-05', titulo: 'El horario de cada persona, en detalle', ir: 'calendario', texto: [
    'En <b>Calendario → Por persona</b> sale una tarjeta por trabajador con sus horas frente al contrato y sus turnos de la semana o del mes.',
    'Tócala, o toca su nombre en el cuadrante, para ver su horario día a día: turnos, horas, días libres y ausencias.',
  ] },
  { fecha: '2026-11-04', titulo: 'Las horas a las que puede trabajar cada persona', ir: 'equipo', texto: [
    'Igual que ya podías marcar los días que libra alguien, ahora en <b>Equipo</b> puedes indicar a qué horas puede trabajar: por ejemplo, no entrar antes de las 10:00 o no salir después de las 18:00, todos los días o solo algunos.',
    'Al generar el horario solo se le dan turnos que caben en esas horas.',
  ] },
  { fecha: '2026-11-04', titulo: 'Trabajadores comodín para cubrir huecos', ir: 'equipo', texto: [
    'Con <b>Añadir comodín</b> en Equipo das de alta a alguien sin horas de contrato que solo trabaja cuando el resto del equipo no llega a cubrir el local.',
    'Si quieres, ponle un mínimo y un máximo de horas por semana. Si no hace falta, no tiene turnos.',
  ] },
];
const NOVEDADES_KEY = 'lopita-novedades-vistas';
const novedadesVistas = () => { try { return localStorage.getItem(NOVEDADES_KEY) || ''; } catch { return ''; } };
// Sin nada guardado (primera vez o sin almacenamiento) cuentan todas: así el cliente descubre la pestaña.
export const novedadesSinVer = () => { const v = novedadesVistas(); return NOVEDADES.filter((n) => n.fecha > v).length; };
const fmtFechaLarga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

export function viewNovedades() {
  const vistas = novedadesVistas();
  try { localStorage.setItem(NOVEDADES_KEY, NOVEDADES[0].fecha); } catch { /* sin almacenamiento */ }
  const t = $('#tabs'); if (t) t.innerHTML = tabsHtml('novedades');
  const nombreTab = (id) => (NAV_ADMIN.find(([k]) => k === id) || [])[1] || id;
  const items = NOVEDADES.map((n) => `<article class="card novedad">
      <div class="novedad-cab"><time datetime="${n.fecha}">${esc(fmtFechaLarga(n.fecha))}</time>${n.fecha > vistas ? '<span class="badge warn">Nuevo</span>' : ''}</div>
      <h2>${esc(n.titulo)}</h2>
      ${n.texto.map((p) => `<p>${p}</p>`).join('')}
      ${n.ir ? `<a class="btn small" href="#/${n.ir}">Ir a ${esc(nombreTab(n.ir))} →</a>` : ''}
    </article>`).join('');
  return `${head('Novedades', 'Las últimas mejoras de la app, de la más reciente a la más antigua.')}
  <div class="stack novedades">${items}</div>
  <p class="small muted section">¿Echas algo en falta? Pulsa <a href="#" data-act="feedback">Comentarios</a> y cuéntanoslo.</p>`;
}

