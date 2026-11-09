import { esc } from '../nucleo/util.js';
import { NAV_ADMIN, NAV_WORKER, head, isWorker } from '../nucleo/pintado.js';
// ------------------------------------------------------------------ GUÍA DE USO
// Una sección por pantalla: para qué sirve, cómo se usa en pocos pasos y un botón que lleva a ella.
// Cada pantalla enlaza a su sección con «¿Cómo funciona esta pantalla?» (#/guia/<pantalla>).
const GUIA_ADMIN = [
  { id: 'horarios', titulo: 'Horarios', para: 'Crear, revisar y publicar el horario de una semana, un mes o unas fechas.', pasos: [
    'Elige el periodo (semana, mes o fechas) y pulsa <b>Generar</b>. El motor reparte los turnos cumpliendo las reglas y cubriendo la demanda.',
    'Abre el horario. Arriba ves los avisos y la cobertura de cada día; abajo, el cuadrante y las horas de cada persona.',
    'Toca una casilla para cambiar un turno o, con <b>Quitar el turno</b>, dejar a esa persona libre ese día. Los cambios a mano quedan bloqueados (candado) y se respetan si regeneras.',
    'Con <b>Día · Semana · Mes</b> cambias de vista. En la de día puedes arrastrar los turnos hora a hora.',
    '<b>Solucionar problemas</b> propone los mínimos cambios para quitar alertas. <b>Publicar horario</b> lo hace visible al equipo.',
  ] },
  { id: 'calendario', titulo: 'Calendario', para: 'Ver todos los horarios juntos, día a día, semana a semana o mes a mes.', pasos: [
    'Elige <b>Semana</b> o <b>Mes</b> y muévete con ‹ › u <b>Hoy</b>.',
    'Con <b>Persona</b> ves solo los turnos de alguien (útil para revisar su mes).',
    'Con <b>Por persona</b> ves una tarjeta por persona con sus horas frente al contrato y sus turnos de la semana o del mes. Tócala (o toca su nombre en el cuadrante) para ver su horario en detalle, día a día: turno, horas, libranzas y ausencias.',
    'Toca un día o un turno para abrirlo en la vista de día y editarlo. Con <b>Día</b> se abre el día que estás viendo; si no tiene horario, se abre el siguiente día que sí lo tiene.',
    'Los días sin horario salen en gris: créalo en Horarios.',
  ] },
  { id: 'dia', ir: 'calendario', titulo: 'Retocar un día (vista de día)', para: 'Mover, alargar, acortar, añadir o quitar turnos hora a hora viendo la cobertura al momento.', pasos: [
    '<b>Arrastra</b> un turno para moverlo y <b>tira de sus bordes</b> para alargarlo o acortarlo.',
    '<b>Toca</b> un turno para el menú: horas exactas, botones de <b>±30 min</b>, <b>±1 h</b> y <b>desplazar</b>, puesto (sala o cocina) o quitarlo.',
    'Toca un hueco en la fila de alguien para añadirle un turno.',
    'Las personas salen <b>por hora de entrada</b>: arriba quien entra antes; abajo quien no trabaja ese día.',
    'Con <b>− / +</b> (arriba a la derecha del diagrama) acercas para afinar al arrastrar o alejas para ver el día entero. Pulsa el porcentaje para volver al 100 %.',
    'Nada se guarda hasta <b>Confirmar cambios</b>: verás qué alertas aparecen o se resuelven antes de guardar o publicar.',
    'Desde el cuadrante también puedes usar los ajustes rápidos: te llevan a la vista de día para confirmarlos.',
  ] },
  { id: 'alertas', titulo: 'Alertas', para: 'Saber qué revisar en los horarios en curso, de lo más a lo menos importante.', pasos: [
    '<b>Críticas</b>: el horario no vale (momentos sin nadie, nadie que pueda abrir o cerrar). Arréglalas antes de publicar.',
    'Cada alerta explica el problema y sugiere qué hacer; muchas traen botón para ir a arreglarlo.',
    '<b>Reconocer</b> aparta una alerta que ya conoces. Si cambia, vuelve a salir.',
    'Qué se avisa y con qué umbrales se ajusta en Reglas → Alertas.',
  ] },
  { id: 'solicitudes', titulo: 'Solicitudes', para: 'Aprobar o rechazar vacaciones, permisos y correcciones de horas que pide el equipo.', pasos: [
    'Las pendientes salen arriba, con un número en la pestaña.',
    'Al aprobar unas vacaciones se añaden a Ausencias y la app arregla los horarios afectados (sin publicar nada).',
    'Las correcciones aprobadas ajustan el informe de horas y el saldo del siguiente horario.',
  ] },
  { id: 'informes', titulo: 'Informes de horas', para: 'Ver de un vistazo cuánto ha trabajado cada persona en el periodo que elijas.', pasos: [
    'Elige las fechas o usa <b>Este mes</b>, <b>Mes anterior</b>, <b>Últimos 3 meses</b> o <b>Este año</b>.',
    'Por persona: horas trabajadas, contrato, horas extra o de menos, días, fines de semana, festivos, aperturas y cierres.',
    'Si el periodo abarca varios meses, abajo sale la tabla <b>mes a mes</b>.',
    'Activa <b>Contar también los borradores</b> para incluir horarios aún no publicados. <b>Descargar CSV</b> para la gestoría.',
  ] },
  { id: 'equipo', titulo: 'Equipo', para: 'Las personas: horas de contrato, si son camareros o cocineros, sus funciones y qué días libran.', pasos: [
    '<b>Añadir persona</b> y rellena su nombre y horas por semana.',
    '<b>Añadir comodín</b> (o marca «Comodín» en una ficha) para alguien sin horas de contrato que solo trabaja cuando falta gente: si al resto le faltan 30 horas para cubrir la demanda, se le pueden dar esas 30; si no falta nadie, no tiene turnos. Puedes ponerle un <b>mínimo</b> y un <b>máximo</b> de horas por semana, o dejarlos vacíos.',
    '<b>Tipo de empleado</b>: Camarero/a (sala), Cocinero/a (cocina) o los dos.',
    '<b>Funciones</b>: puede abrir, puede cerrar, encargado/a y las que hayas creado (p. ej. preparar pinchos).',
    'Marca sus <b>días que libra</b> fijos. Si deja la empresa, desactiva «En plantilla» en vez de borrarla.',
    'Pulsa <b>Guardar cambios</b> abajo.',
    '<b>Marcar baja</b> (en la ficha de cada persona): desde cuándo y, si se sabe, hasta cuándo. Si ya tenía turnos asignados, te sale un aviso con los que no va a hacer, una alerta en el horario y un arreglo preparado como borrador. Con <b>Dar el alta</b> indicas el día que vuelve.',
  ] },
  { id: 'funciones', titulo: 'Funciones', para: 'Lo que solo hacen algunas personas (abrir, cerrar, encargado, los roles de camarero o lo que añadas) y las reglas que deben cumplirse.', pasos: [
    '<b>Roles de camarero</b> crea caja, cafetera, sala y lava (los puedes renombrar, quitar o añadir más). Marca quién puede hacer cada uno.',
    'Cada camarero hace <b>uno</b> de sus roles en todo el turno. Las reglas dicen cuántos hacen falta: «de 9:00 a 21:00, al menos 1 en caja» o «como mucho 1 en lava».',
    'El rol de cada turno sale en el horario; para cambiarlo, toca la casilla o el turno en la vista del día.',
    'Las <b>tareas de apoyo</b> (p. ej. «Preparar pinchos») las cubre cualquiera que sepa hacerlas y esté trabajando.',
    'El motor cumple las reglas si puede y, si no, salta una alerta con sugerencias.',
    'Pulsa <b>Guardar cambios</b> y regenera los horarios que quieras actualizar.',
  ] },
  { id: 'turnos', titulo: 'Turnos', para: 'Los turnos posibles (apertura, mañana, tarde, cierre…) con sus horas.', pasos: [
    'Cada turno tiene un código, un nombre, horas, tipo (apertura, normal o cierre) y color.',
    'Los de apertura y cierre solo los hace quien puede abrir o cerrar.',
    'Si un turno solo existe algunos días (p. ej. refuerzo de fin de semana), márcalos.',
  ] },
  { id: 'demanda', titulo: 'Demanda', para: 'Cuántas personas hacen falta en cada franja del día y las tareas fijas.', pasos: [
    'Define los <b>tipos de día</b> (laborable, viernes, sábado…) con sus franjas y personas, y cuál toca cada día de la semana.',
    'En cada franja puedes pedir un mínimo en <b>cocina</b> y en <b>sala</b>.',
    '<b>Tareas fijas</b>: trabajo que no depende de la clientela (preparar, limpiar, recibir pedidos).',
    'Festivos y días especiales (cerrado, otra demanda) también se ponen aquí.',
  ] },
  { id: 'ausencias', titulo: 'Ausencias', para: 'Vacaciones, bajas y permisos, y cambios fijos para un día concreto.', pasos: [
    'Añade la persona, las fechas y el motivo. El motor no le pondrá turnos esos días.',
    'Si ya había horarios en esas fechas, la app los arregla sola y te avisa.',
  ] },
  { id: 'preferencias', titulo: 'Preferencias', para: 'Turnos que alguien prefiere o evita, y cuánto le importa.', pasos: [
    'Elige la persona, si prefiere o evita, los turnos y (opcional) los días.',
    'Se respetan si no comprometen la cobertura. Cada trabajador puede editar las suyas.',
  ] },
  { id: 'reglas', titulo: 'Reglas', para: 'Lo que todo horario debe cumplir y los avisos que quieres recibir.', pasos: [
    'Descanso entre jornadas, días libres por semana, horas máximas al día y bolsa de horas.',
    '<b>Cobertura</b>: si debe haber siempre un encargado.',
    '<b>Alertas</b>: umbrales y avisos que quieres silenciar.',
    '<b>Ajuste fino del motor</b> (avanzado): cuánto pesa cada cosa.',
  ] },
  { id: 'web', titulo: 'Web', para: 'Lo que llega desde la web pública (candidaturas y catering) y la carta en PDF.', pasos: [
    'Marca los mensajes como atendidos y borra los CV cuando ya no hagan falta.',
    'Sube el PDF de cada carta: la web enlaza siempre al último.',
  ] },
  { id: 'comentarios', titulo: 'Comentarios', para: 'Sugerencias, fallos y dudas sobre la app, para que quede todo apuntado.', pasos: [
    'Desde cualquier pantalla, pulsa <b>Comentarios</b> arriba a la derecha y escribe. Se guarda con la pantalla en la que estabas.',
    'En esta pestaña se ven todos: cambia su estado (nuevo, en curso, hecho, descartado) y responde.',
    'Quien lo envió ve la respuesta en su ventana de comentarios.',
  ] },
  { id: 'ajustes', titulo: 'Ajustes', para: 'Cuentas de acceso, Slack, copias e historial de la configuración.', pasos: [
    '<b>Cuentas de acceso</b>: crea una cuenta de trabajador para cada persona (con contraseña temporal) o de encargado. En cada cuenta, <b>Correo</b> le asocia su correo y <b>Contraseña</b> le pone una temporal si la ha olvidado.',
    '<b>Entrar con Google</b>: pega el ID de cliente de Google y en la entrada saldrá el botón. Quien entra con Google entra en la cuenta con su correo; si no tiene cuenta, aparece en <b>Registros con Google pendientes</b> y tú le das acceso (encargado o trabajador) o lo rechazas.',
    '<b>Mi cuenta</b> (arriba a la derecha): tu nombre, tu correo, vincular Google y cambiar tu contraseña.',
    '<b>Versiones</b>: cada guardado crea una versión; puedes restaurar cualquiera.',
    '<b>Exportar</b> o <b>Cargar archivo</b> la configuración completa.',
  ] },
];
const GUIA_WORKER = [
  { id: 'cuenta', ir: null, titulo: 'Mi cuenta', para: 'Tu correo, entrar con Google y tu contraseña.', pasos: [
    'Pulsa <b>Mi cuenta</b> arriba a la derecha.',
    'Pon tu correo: si es el de tu cuenta de Google, podrás entrar con el botón de Google sin contraseña (o pulsa el botón de Google para vincularla).',
    'Si olvidas la contraseña, entra con Google o pide a tu encargado una temporal.',
  ] },
  { id: 'inicio', titulo: 'Inicio', para: 'Tus próximos turnos y los avisos de cambios.', pasos: [
    'Arriba ves tus turnos de los próximos días.',
    'Si tu horario cambia, sale un aviso con lo que ha cambiado; márcalo como visto.',
    'En <b>Tus turnos en tu calendario</b>, suscríbete desde Google Calendar o el iPhone: tus turnos salen en tu calendario y se actualizan solos.',
  ] },
  { id: 'horas', titulo: 'Mis horas', para: 'Las horas que has trabajado y corregir un día que fue distinto.', pasos: [
    'Elige el periodo para ver tus horas previstas y ajustadas.',
    'Si un día trabajaste otras horas (o no trabajaste), pulsa <b>Corregir</b> y explica el motivo. Tu encargado lo revisará.',
    'Si no quieres escribir, pulsa <b>Dictar</b>, habla y pulsa <b>Parar</b>: el texto se escribe solo (en Chrome, Edge y Safari).',
  ] },
  { id: 'vacaciones', titulo: 'Vacaciones', para: 'Pedir vacaciones o permisos.', pasos: [
    'Elige las fechas y el motivo y envía la solicitud. La nota la puedes <b>dictar</b> con el botón del micrófono.',
    'Verás si está pendiente, aprobada o rechazada.',
  ] },
  { id: 'preferencias', titulo: 'Preferencias', para: 'Decir qué turnos prefieres o prefieres evitar.', pasos: [
    'Añade una preferencia, elige los turnos, los días y cuánto te importa, y guarda.',
    'Se tienen en cuenta siempre que no dejen el local sin cubrir.',
  ] },
  { id: 'comentarios', ir: null, titulo: 'Comentarios', para: 'Contarnos qué mejorarías o qué no funciona.', pasos: [
    'Pulsa <b>Comentarios</b> arriba a la derecha, escribe y envía.',
    'En la misma ventana verás la respuesta.',
  ] },
];
export const guiaSecciones = () => (isWorker() ? GUIA_WORKER : GUIA_ADMIN);

export function viewGuia() {
  const w = isWorker();
  const secs = guiaSecciones();
  const nombreTab = (id) => ((w ? NAV_WORKER : NAV_ADMIN).find(([k]) => k === id) || [])[1];
  const primeros = w ? '' : `<div class="card guia-pasos"><h2>Primeros pasos</h2><ol>
    <li>Da de alta al <a href="#/equipo">equipo</a>: horas de contrato, camarero o cocinero, funciones y días que libra.</li>
    <li>Crea las <a href="#/funciones">funciones</a> especiales (p. ej. preparar pinchos) y sus reglas.</li>
    <li>Revisa los <a href="#/turnos">turnos</a> y la <a href="#/demanda">demanda</a> de cada tipo de día.</li>
    <li>Apunta las <a href="#/ausencias">ausencias</a> conocidas y repasa las <a href="#/reglas">reglas</a>.</li>
    <li>Genera el primer <a href="#/horarios">horario</a>, revisa las <a href="#/alertas">alertas</a>, retócalo si hace falta y publícalo.</li>
    <li>Cada mes, mira los <a href="#/informes">informes de horas</a>.</li>
  </ol></div>`;
  const indice = `<nav class="guia-indice chips" aria-label="Secciones de la guía">${secs.map((g) => `<a class="chip" href="#/guia/${g.id}">${esc(g.titulo)}</a>`).join('')}</nav>`;
  const tarjetas = secs.map((g) => {
    const ir = g.ir === undefined ? g.id : g.ir;
    return `<section class="card guia-sec" id="guia-${g.id}">
      <div class="row" style="align-items:baseline"><h2 style="margin:0">${esc(g.titulo)}</h2><span class="spacer"></span>
        ${ir ? `<a class="btn small primary" href="#/${ir}">Ir a ${esc(nombreTab(ir) || g.titulo)} →</a>` : g.id === 'cuenta' ? '<button class="btn small primary" data-act="cuentaDialog">Abrir Mi cuenta</button>' : `<button class="btn small primary" data-act="feedback">Abrir comentarios</button>`}</div>
      <p class="lead" style="margin:6px 0 10px">${esc(g.para)}</p>
      <ol class="guia-lista">${g.pasos.map((p) => `<li>${p}</li>`).join('')}</ol>
    </section>`;
  }).join('');
  return `${head('Guía de uso', w ? 'Cómo usar la app en tu día a día. Cada apartado tiene un botón para ir a esa pantalla.' : 'Cómo funciona cada pantalla, en pocos pasos. Cada apartado tiene un botón para ir directamente a ella, y cada pantalla tiene arriba un enlace «¿Cómo funciona esta pantalla?» que trae aquí.')}
  ${primeros}${indice}<div class="stack guia">${tarjetas}</div>
  <p class="small muted section">¿Algo no queda claro? Pulsa <a href="#" data-act="feedback">Comentarios</a> y cuéntanoslo.</p>`;
}

