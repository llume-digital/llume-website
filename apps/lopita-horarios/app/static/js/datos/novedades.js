// ------------------------------------------------------------------ NOVEDADES (lo que ve el cliente en la pestaña)
// Cada cambio que note quien usa la app lleva aquí su entrada, en el mismo PR que el cambio. Reglas:
// - Añádela ARRIBA del todo (de la más nueva a la más antigua). La fecha es la del día en que se fusiona el PR.
// - Escrita para el encargado, no para un programador: qué puede hacer ahora o qué ha mejorado, sin nombres de
//   archivos, funciones ni siglas. Dos o tres frases cortas como mucho. Los nombres de pantallas y botones en <b>.
// - `ir` (opcional) es la pantalla a la que lleva el botón «Ir a…»: una de NAV_ADMIN en nucleo/pintado.js.
// - Lo puramente interno (tests, refactors, CI, documentación) no lleva entrada: el PR lo dice con «Sin novedades: …».
// La comprobación de CI (herramientas/comprobar_novedades.py) falla si un PR toca la app sin pasar por aquí.
export const NOVEDADES = [
  { fecha: '2026-11-10', titulo: 'Vacaciones: un plano de 2026 y 2027', ir: 'vacaciones', texto: [
    'Nueva pantalla <b>Vacaciones</b> (dentro de Equipo): ves el año entero, una columna por semana, con quién está fuera y cuántas personas faltan cada semana. Debajo te marca las semanas más tranquilas que quedan.',
    'Al apuntar unas vacaciones, la pantalla te dice antes con quién coinciden y cuántas personas quedarían. Es la misma lista que <b>Ausencias</b>.',
  ] },
  { fecha: '2026-11-09', titulo: 'Ajustes y Reglas, más ordenados', ir: 'ajustes', texto: [
    '<b>Ajustes</b> va en una sola columna, con las <b>cuentas de acceso</b> primero y, arriba, los registros con Google que esperan aprobación (con su número).',
    'En <b>Reglas</b>, lo importante (descansos, jornada y bolsa de horas) se ve de entrada. <b>Alertas</b> queda plegado con un resumen («22 de 22 activas») y los tipos de alerta, en casillas de dos columnas.',
  ] },
  { fecha: '2026-11-09', titulo: 'Pendiente: todo lo que te espera, en una lista', ir: 'alertas', texto: [
    'Arriba de <b>Pendiente</b> hay ahora una lista de lo que espera: alertas críticas, solicitudes por resolver, arreglos listos para revisar, borradores sin publicar y accesos con Google por aprobar. Cada fila tiene un solo botón que te lleva al sitio exacto.',
  ] },
  { fecha: '2026-11-09', titulo: 'El cuadrante, más cómodo en el móvil', ir: 'horarios', texto: [
    'En el móvil, la columna de nombres del cuadrante es más estrecha (solo el nombre, en una línea), así que ves más días de cada vez. El contrato de cada persona sigue en su ficha de <b>Equipo</b>.',
  ] },
  { fecha: '2026-11-09', titulo: 'Los errores salen junto al campo que hay que corregir', ir: 'equipo', texto: [
    'Si un formulario no se puede enviar (por ejemplo, una baja que acaba antes de empezar o dos contraseñas que no coinciden), el aviso sale <b>justo debajo del campo</b> afectado, el campo se marca en rojo y el cursor se coloca en él.',
  ] },
  { fecha: '2026-11-09', titulo: 'Pantallas vacías con el siguiente paso a un toque', ir: 'equipo', texto: [
    'Cuando todavía no hay equipo, turnos o preferencias, la pantalla te ofrece directamente el botón para añadir el primero. En Ausencias, los botones dicen ahora <b>Añadir ausencia</b> y <b>Añadir petición</b>.',
  ] },
  { fecha: '2026-11-09', titulo: 'Equipo: una lista y una ficha por persona', ir: 'equipo', texto: [
    '<b>Equipo</b> ya no es una pared de formularios: ves la plantilla en una lista corta (puesto, horas y si alguien está de baja) y, al tocar a una persona, se abre su <b>ficha</b> con todo lo que puedes ajustar.',
    'Cada ficha tiene su propio enlace y un «← Equipo» para volver. Al añadir una persona o un comodín se abre directamente su ficha.',
  ] },
  { fecha: '2026-11-09', titulo: 'Botones con textos más claros', ir: 'horarios', texto: [
    'Varios botones dicen ahora exactamente lo que hacen: <b>Descartar cambios</b>, <b>Crear cuenta</b>, <b>Añadir tipo de día</b> y <b>Marcar como leídos</b>.',
  ] },
  { fecha: '2026-11-09', titulo: 'Las secciones de la trabajadora, abajo en el móvil', ir: 'inicio', texto: [
    'En el móvil, <b>Inicio, Mis horas, Vacaciones y Preferencias</b> están ahora en una barra fija en la parte de abajo, al alcance del pulgar, con el nombre de cada sección.',
    'La parte de arriba se queda con el nombre de la app y los botones de cuenta. El contenido ya no queda tapado por la barra.',
  ] },
  { fecha: '2026-11-09', titulo: 'Menos pestañas: el menú, en cinco secciones', ir: 'horarios', texto: [
    'El menú del encargado pasa de 16 pestañas a cinco: <b>Horario, Pendiente, Equipo, Informes y Configuración</b>. Debajo salen las pantallas de la sección en la que estás (por ejemplo, Horarios y Calendario dentro de Horario).',
    '<b>Web, Comentarios recibidos y Novedades</b> están en el botón <b>Más</b>, arriba a la derecha, con su contador. Todas las pantallas siguen en su sitio y los enlaces de siempre funcionan.',
  ] },
  { fecha: '2026-11-09', titulo: 'En el móvil, el menú de cada casilla sale desde abajo', ir: 'horarios', texto: [
    'Al tocar una casilla del horario en el móvil, las opciones aparecen en una hoja desde abajo de la pantalla, a todo el ancho y con botones grandes, fáciles de pulsar con el pulgar.',
    'Para cerrarla, desliza hacia abajo o toca fuera.',
  ] },
  { fecha: '2026-11-09', titulo: 'El enlace de un horario recuerda la vista y el día', ir: 'horarios', texto: [
    'Si estás mirando un horario por semana, por mes o un día concreto, al recargar la página, compartir el enlace o pulsar «atrás» vuelves exactamente a lo mismo que estabas viendo.',
  ] },
  { fecha: '2026-11-09', titulo: 'Un horario más despejado', ir: 'horarios', texto: [
    'Arriba de cada horario hay un solo botón principal: <b>Publicar horario</b> en un borrador y <b>Solucionar problemas</b> en uno publicado. Lo demás (regenerar, imprimir, PDF, copiar enlace, historial…) está en el botón <b>Más</b>.',
    'Las alertas se recogen en una línea con el resumen; tócala para verlas. Si hay alguna crítica, se abren solas.',
  ] },
  { fecha: '2026-11-09', titulo: 'Historial de versiones de cada horario', ir: 'horarios', texto: [
    'Desde <b>Más → Historial</b> ves qué versiones han mandado en esas fechas y cuál las sustituyó, y puedes comparar cualquiera con lo publicado hoy.',
    'Puedes ponerle nombre a una versión y recuperar una antigua: se copia como borrador nuevo y la revisas antes de publicarla.',
  ] },
  { fecha: '2026-11-09', titulo: 'Cada persona recibe aviso solo de lo que le cambia', ir: 'horarios', texto: [
    'Al volver a publicar un horario sobre días que ya estaban publicados, cada trabajador recibe un aviso solo si su turno cambia, con el turno de antes y el de ahora.',
    'Si el cambio toca un día que ya ha pasado, el aviso lo dice claramente.',
  ] },
  { fecha: '2026-11-09', titulo: 'Revisa los cambios antes de publicar', ir: 'horarios', texto: [
    'Si publicas un horario que sustituye días ya publicados, antes verás qué cambia para cada persona, día a día.',
    'Los cambios hechos a mano y los bloqueos del horario anterior salen marcados para que puedas conservarlos, y si cambia algún día que ya pasó te pedimos que lo confirmes aparte.',
  ] },
  { fecha: '2026-11-08', titulo: 'Avisos más claros cuando falla la conexión', texto: [
    'Si te quedas sin internet, una franja arriba te lo dice y la app avisa de que no se ha guardado nada, en lugar de un error confuso. Si falla algo al guardar un formulario, el mensaje sale dentro del propio formulario.',
    'Durante los partidos de fútbol algunas operadoras bloquean la conexión al servidor: en ese caso la app te lo explica y te sugiere usar otra red o una VPN.',
    'Pulsar dos veces seguidas un botón ya no duplica lo que hace, por ejemplo al generar un horario.',
  ] },
  { fecha: '2026-11-08', titulo: 'Confirmaciones más claras y botón Deshacer', texto: [
    'Antes de eliminar algo importante, la ventana de confirmación dice exactamente lo que va a pasar («Eliminar horario») y empieza seleccionado <b>Cancelar</b>.',
    'Al borrar una función, una persona o un turno, o al descartar cambios, ya no te pregunta: tienes unos segundos para pulsar <b>Deshacer</b>.',
  ] },
  { fecha: '2026-11-08', titulo: 'Más fácil de leer, sobre todo en el móvil', texto: [
    'Los campos de texto son más grandes en el móvil, así el iPhone ya no hace zoom al escribir. Los textos claros tienen más contraste y los tamaños de letra son más uniformes en toda la app.',
    'Si usas el teclado, siempre se ve dónde estás. Y si tienes activado reducir el movimiento en tu dispositivo, la app lo respeta.',
  ] },
  { fecha: '2026-11-08', titulo: 'Los horarios encajan con lo que ya está publicado después', ir: 'horarios', texto: [
    'Al generar un horario se tienen en cuenta también los días siguientes que ya estaban publicados: se respeta el descanso entre jornadas y las horas de la semana que queda partida entre los dos horarios.',
  ] },
  { fecha: '2026-11-08', titulo: 'Un solo horario publicado para cada día', ir: 'calendario', texto: [
    'Cada día lo manda un único horario publicado. Tocar un horario antiguo ya no hace que vuelva a mandar en los días que otro había sustituido.',
    'Si despublicas o borras un horario, cada día vuelve al horario publicado anterior que lo cubría.',
  ] },
  { fecha: '2026-11-08', titulo: '«Solucionar problemas» ya no se queda colgado', ir: 'horarios', texto: [
    'Arreglado: la segunda vez que se calculaba algo en la misma sesión, la ventana «Buscando cómo arreglar las alertas…» podía no terminar nunca. Ahora muestra el tiempo que lleva y, si tarda demasiado, te deja cancelar.',
    'También se ha arreglado un error que podía aparecer al usar la app en varios dispositivos a la vez y obligaba a recargar.',
  ] },
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
