# Lopita & Co · Horarios

App web para crear el horario del equipo de Lopita en un clic. El encargado introduce la plantilla, los turnos, la demanda por franjas, las vacaciones y las preferencias. El motor genera la semana o el mes que cubre los picos y cumple las reglas. Después el encargado lo retoca a mano y lo publica: cada persona recibe sus turnos por Slack y un enlace para verlos en el móvil.

## Qué incluye

| Parte | Qué hace |
| --- | --- |
| **Motor** (`lopita_horarios/`) | OR-Tools CP-SAT. Reglas duras: un turno al día, ausencias, libranzas, horas del día en que puede trabajar cada persona (restricciones horarias en Equipo), apertura y cierre solo por personal habilitado, descanso entre jornadas, días libres por semana y topes de horas. Objetivo: cobertura > encargado (opcional) > horas extra > horas por debajo del contrato > personal de más > preferencias > reparto justo de fines de semana y cierres. Encadena periodos: tiene en cuenta el descanso con el día anterior, la semana partida y el saldo de horas del periodo anterior. |
| **API** (`app/main.py`) | FastAPI y SQLite. Configuración versionada (se puede restaurar cualquier versión), horarios en borrador o publicados, edición casilla a casilla con validación al momento, bloqueos que se respetan al regenerar, exportación a CSV, HTML y PDF, y gestión de usuarios. |
| **Interfaz** (`app/static/`) | Sin dependencias ni compilación. Pantallas: Horarios, Equipo, Turnos, Demanda, Ausencias, Preferencias, Reglas, Ajustes y Novedades (las últimas mejoras con su fecha; se añaden en `NOVEDADES`, en `app.js`). Funciona en el móvil. Identidad de lopita.es: dorado `#B0904C`, marrón `#764A09`, negro, Oswald y Raleway (servidas desde la propia app). Las reglas de diseño están en [DISENO.md](DISENO.md). |
| **Slack** (`app/slack.py`) | Al publicar: un mensaje en el canal y uno privado a cada persona con sus turnos y su enlace. Si se cambia algo después, avisa solo a quien le ha cambiado. Sin token funciona en modo simulación. |
| **Calendario de cada persona** (`app/calendario.py`) | Un enlace secreto `/cal/<token>.ics` por persona para suscribirse desde Google Calendar, el iPhone u Outlook: sus turnos publicados y sus ausencias aprobadas, que se actualizan solos. |
| **Vista del equipo** | `/ver/<enlace>`: horario publicado de solo lectura; `?e=<persona>` destaca sus turnos. No muestra horas ni avisos internos. Un enlace viejo enseña lo que vale hoy en sus fechas. |

## Probarlo en local

```bash
python -m pip install -r requirements-dev.txt
LOPITA_ADMIN_PASSWORD=una-contraseña uvicorn app.main:create_app --factory --reload
# abre http://localhost:8000 y entra como «admin»
```

La primera vez se cargan unos **datos de ejemplo** (10 personas inventadas). Para empezar con la configuración vacía, usa `LOPITA_SEED=vacio` antes del primer arranque. Para cargar una configuración preparada aparte: Ajustes → Cargar archivo, o `python -m app.cli importar mi_config.json`.

### En el móvil, con los cambios al momento

Con el Mac y el móvil en la misma wifi no hace falta ningún servidor en la nube:

```bash
LOPITA_ADMIN_PASSWORD=una-contraseña LOPITA_RECARGA=1 \
  uvicorn app.main:create_app --factory --reload --host 0.0.0.0
ipconfig getifaddr en0   # la IP del Mac, por ejemplo 192.168.1.40
```

1. En el móvil abre `http://<IP del Mac>:8000`. Si macOS pregunta si Python puede aceptar conexiones entrantes, permítelo.
2. Instálala como app: en iPhone, Safari → Compartir → *Añadir a pantalla de inicio*; en Android, Chrome → menú → *Añadir a pantalla de inicio*. Se abre a pantalla completa con su icono.
3. Con `LOPITA_RECARGA=1`, la página se recarga sola en cuanto guardas un cambio en el código (la interfaz o Python). No lo actives en producción.

Funciona mientras el Mac esté encendido y con el servidor arrancado. Para verla fuera de casa sin desplegar, un túnel como `cloudflared tunnel --url http://localhost:8000` da una dirección HTTPS temporal.

### App de demostración sin conexión (todo dentro del móvil)

Para enseñar la app o probarla a fondo sin servidor: es la misma app (interfaz, API, base de datos, alertas, solucionador y motor) funcionando **dentro del navegador del móvil**, con Python para el navegador ([Pyodide](https://pyodide.org)). Se abre una vez con conexión, se instala en la pantalla de inicio y a partir de ahí funciona en modo avión. Los cambios se guardan solo en ese móvil.

1. **Conseguir la carpeta.** Cada cambio en `main` (y cada PR que toque la app) la construye en GitHub: pestaña *Actions* → *App offline* → la última ejecución → artefacto `lopita-offline`. También en local: `python herramientas/construir_offline.py` la deja en `salida/offline` (unos 21 MB; descarga Pyodide y comprueba cada archivo con su sha256).
2. **Servirla con HTTPS** (el modo sin conexión lo exige). Lo más sencillo es arrastrar la carpeta descomprimida a [Netlify Drop](https://app.netlify.com/drop), que da una dirección `https://…netlify.app`. Vale cualquier alojamiento estático (Cloudflare Pages, GitHub Pages…) o, desde el Mac, `python -m http.server -d salida/offline 8080` con `cloudflared tunnel --url http://localhost:8080`.
3. **Instalarla en el móvil.** Abre la dirección y espera a que salga la pantalla de entrada (la primera vez tarda unos segundos en preparar Python). En iPhone, Safari → Compartir → *Añadir a pantalla de inicio*; en Android, Chrome → menú → *Instalar aplicación*. Desde ese momento ya no necesita conexión.
4. **Entrar** con usuario `admin` y contraseña `lopita`. Empieza con los datos de ejemplo y se puede probar todo: equipo, turnos, demanda, ausencias, preferencias, reglas, generar y retocar horarios, alertas y *Solucionar problemas*, publicar, cuentas de trabajador (creadas en Ajustes) con sus vacaciones y correcciones, informes y CSV. El botón *Demo sin conexión* (abajo a la izquierda) recuerda el acceso y permite **volver a los datos de ejemplo**.

**En Android, como archivo .apk.** El mismo workflow empaqueta la app en un `.apk` con [Capacitor](https://capacitorjs.com), lo prueba en un emulador de Android y, en `main`, lo publica en la release `demo` del repositorio para descargarlo directamente desde el móvil (también queda como artefacto `lopita-horarios-demo-apk`). Se abre el `.apk` y Android pide permiso para instalar apps de esa fuente. No hace falta conexión ni servidor en ningún momento. Es un `.apk` de release (no depurable) firmado siempre con la misma clave de demo (`movil/android/app/demo.keystore`, sin valor fuera de esta app de pruebas), así que cada versión nueva se instala encima de la anterior y conserva los datos. El proyecto Android está en `movil/` (`movil/iconos.py` pone el icono y la pantalla de arranque de Lopita).

**En iPhone** no se puede instalar un archivo descargado: Apple solo deja instalar apps desde la App Store o TestFlight (cuenta de desarrollador, 99 € al año) o desde Xcode en un Mac (gratis, pero caduca a los 7 días). Lo práctico es la versión web de arriba: Safari → *Añadir a pantalla de inicio* y funciona igual, sin conexión. Si más adelante hace falta en la App Store o TestFlight, `movil/` admite añadir iOS con `npx cap add ios` desde un Mac.

**Con datos compartidos, sin servidor** (`--nube nube/db`): la misma app, pero la base de datos se guarda en Cloudflare (la sirve `src/worker.js` de la web de llume, en `llumedigital.com/lopita/horarios/`). Al arrancar baja la última versión, cada 15 s mira si hay cambios y sube cada cambio con la versión de la que parte; si otra persona guardó antes, avisa y recarga sus datos. Se entra con un enlace que lleva la clave (`…/horarios/#clave=…`); el navegador la recuerda.

Diferencias con la versión de servidor:

- El motor usa **HiGHS** en lugar de OR-Tools (que no existe para el navegador). El modelo y las reglas son exactamente los mismos (`lopita_horarios/cp_highs.py` imita la parte de CP-SAT que usa el motor) y con los datos de ejemplo llega al mismo óptimo; los 103 tests del motor y la API pasan con los dos (`LOPITA_RESOLUTOR=highs python -m pytest`). En el móvil una semana sale en unos 10 s y un mes tarda más.
- Sin datos compartidos, Slack funciona en modo simulación (no envía nada) y no hay calendarios para suscribirse; con `--nube`, los dos van a través del Worker de Cloudflare. No hay exportación a PDF desde el servidor: *Imprimir* → *Guardar como PDF* da lo mismo.
- El enlace público del horario (`/ver/…`) solo se abre dentro de la propia app.
- Los datos viven en el almacenamiento del navegador de ese móvil. Si se borran los datos de la web o se desinstala la app, se vuelve a los de ejemplo.

Cómo está hecho: `offline/` tiene la página de arranque, el *service worker* que guarda todos los archivos en el móvil, el *Web Worker* que ejecuta Python sin congelar la interfaz y `lopita_offline.py`, que sirve la API de `app.main` sin red (httpx sobre ASGI) y guarda la base SQLite en IndexedDB tras cada cambio. La interfaz (`app/static/app.js`) no cambia: sus llamadas a `/api/…` se desvían al worker.

## Tareas fijas

La demanda por franjas cuenta a la clientela, pero hay trabajo que no depende de ella: preparar la cafetería al abrir, limpiar al cerrar, recibir un pedido… En **Demanda → Tareas fijas** se define cada tarea con su horario, las personas que hacen falta y los días (vacío = todos los que abre el local). En esas horas se necesitan las personas de la franja **más** las de la tarea, aunque el local esté vacío. El motor, la cobertura de cada día, las alertas y el cálculo de plantilla lo tienen en cuenta, así que quien la hace deja de contar como «personal de más». Los días cerrados no cuentan.

## Cocina y sala

Cada persona tiene uno o dos **puestos** (Equipo → Puestos): cocina, sala o ambos; con los dos, el principal es al que va si la demanda no pide otra cosa. En **Demanda**, cada franja puede pedir un mínimo de personas en cocina y en sala dentro de su total (0 = da igual), y cada tarea fija puede ser de cocina o de sala. El motor asigna el puesto de cada turno: cubre primero los mínimos y, a igualdad, deja a cada uno en su principal. Los días sin mínimos por puesto el cálculo es igual que antes. La cobertura, las alertas («en cocina faltan…»), el cuadrante, el CSV, el horario impreso y los mensajes de Slack muestran el puesto. Hacer un puesto que la persona no tiene es una regla incumplida.

## Funciones del equipo

Además de abrir, cerrar y ser encargado/a, el encargado puede crear **funciones** propias en la pestaña **Funciones** (por ejemplo, *Preparar pinchos*, *Hacer caja* o *Recibir pedidos*), marcar quién las tiene (allí o en la ficha de cada persona en Equipo) y ponerles **reglas**: «de 10:00 a 12:00, al menos 1 persona con esta función», todos los días que abre o solo algunos. El motor intenta cumplirlas (peso *Falta de alguien con una función* en Reglas → Ajuste fino) y, si no puede, salta la alerta *Falta gente para «…»*, la vista de día enseña una fila de cobertura para esa función y las sugerencias proponen dar la función a más gente. Las funciones de cada persona se ven como etiquetas en el cuadrante, el calendario y la vista de día.

**Roles de camarero (caja, cafetera, sala, lava).** Una función puede ser una *tarea de apoyo* (como preparar pinchos: cuenta cualquiera que sepa hacerla y esté trabajando) o un *rol de un puesto*. El botón **Roles de camarero** crea caja, cafetera, sala y lava como roles de sala; se pueden renombrar, quitar o añadir más (también roles de cocina). En cada uno se marca quién puede hacerlo y, en Equipo, cuál hace normalmente cada persona. Los días en que alguna regla de los roles de un puesto se aplica, cada persona que trabaja en ese puesto hace **uno** de sus roles durante todo el turno: lo elige el motor (nunca uno que la persona no sabe hacer) y el encargado lo cambia desde el menú de la casilla o en la vista de día. Las reglas de un rol admiten un mínimo («de 9:00 a 21:00, al menos 1 en caja») y un máximo («como mucho 1 en lava»; alerta *Demasiada gente en «…»*, peso *Gente de más en un rol*). El rol sale en el cuadrante, la vista de día, el PDF/HTML, el CSV de horas, Slack y el calendario, y cambiar de rol a alguien cuenta como cambio de su horario. Sin reglas para los roles de un puesto ese día, no se reparten.

**Comodines.** En Equipo, *Añadir comodín* crea una persona sin horas de contrato (X1, X2…); también se puede marcar «Comodín» en cualquier ficha. El generador solo le da turnos para cubrir lo que el resto de la plantilla no llega a cubrir: si faltan 30 horas, se le pueden dar esas 30, y si no falta nadie, ninguna. Opcionalmente tiene un **mínimo** de horas por semana (se le dan aunque no haga falta; si no se llega, alerta *Comodín por debajo de su mínimo*) y un **máximo** (tope duro, como el de los contratos). Cumple las mismas reglas duras que los demás (descansos, días libres, abrir o cerrar solo si está habilitado). Cada minuto de comodín cuesta en el motor (peso *Cada minuto de un comodín*, 20): más que dejar a alguien con contrato por debajo de sus horas y menos que las horas extra, así que primero se completan los contratos, después entran los comodines y solo al final las horas extra. Los comodines no tienen horas de más ni de menos, no arrastran saldo y no cuentan en el reparto de horas, fines de semana y cierres; en *Plantilla*, su mínimo cuenta como contrato y su máximo como capacidad.

**Camareros y cocineros.** En Equipo, el *tipo de empleado* es Camarero/a (trabaja en sala), Cocinero/a (en cocina) o los dos; con los dos se elige a qué se dedica sobre todo. Es lo mismo que los puestos de abajo.

## Bajas

En **Equipo**, cada persona tiene «Marcar baja» (desde cuándo y, si se sabe, hasta cuándo; sin fecha de fin dura
hasta que se le da el alta). Se guarda como una ausencia con motivo «baja». Si ya tenía turnos asignados de hoy en
adelante, el encargado recibe un aviso con esos turnos (y si están en un horario publicado), el horario publicado
muestra la alerta de que ya no cuadra y se prepara un arreglo como borrador sin publicar nada. «Dar el alta» fija el
día en que vuelve. Lo mismo pasa con cualquier ausencia nueva que deje turnos sin hacer (vacaciones aprobadas, etc.).

## Turnos en el calendario del móvil (Google Calendar, iPhone)

Cada persona puede suscribirse a sus turnos desde su **Inicio** (*Tus turnos en tu calendario*): *Añadir a Google Calendar* abre Google con la suscripción preparada y *Añadir a iPhone o Mac* abre el calendario de Apple (`webcal://`). Para Outlook u otros vale *Copiar enlace* y «Añadir calendario desde Internet».

- Es una suscripción, no un archivo: cuando se publica o se cambia un horario, el calendario se actualiza solo. El iPhone lo mira cada hora más o menos; Google, cada pocas horas (no se puede forzar).
- Entran los turnos de los horarios **publicados** (los borradores y los arreglos sin publicar no) desde hace 120 días, con su puesto, y las ausencias aprobadas como días completos.
- El enlace es secreto: quien lo tenga ve los turnos de esa persona. *Cambiar el enlace* invalida el anterior al momento.
- Al publicar, el mensaje privado de Slack de cada persona lleva sus enlaces. El encargado también puede crearlos y copiarlos en **Ajustes → Calendarios del equipo**, para mandarlos por otra vía.
- Con servidor, los sirve la propia app en `/cal/<token>.ics` (sin sesión: Google y Apple los leen desde fuera). En la versión sin servidor con datos en Cloudflare, la app sube los calendarios al Worker tras cada cambio y el Worker los sirve en `…/nube/cal/<token>.ics`.

## Slack

Al publicar, la app manda un mensaje al canal y uno privado a cada persona con sus turnos, el enlace al horario y los de su calendario. Si se cambia un horario publicado, *Avisar por Slack* escribe solo a quien le cambia. Sin token, todo funciona en **modo simulación** (se ven los mensajes que se mandarían).

1. En <https://api.slack.com/apps> → *Create New App* → *From an app manifest*, elige el espacio de trabajo y pega `slack-manifest.yml`.
2. *Install to Workspace* y copia el *Bot User OAuth Token* (`xoxb-…`).
3. Con servidor: ponlo en `SLACK_BOT_TOKEN` y el canal en `SLACK_CHANNEL` (`.env`). En la versión de llumedigital.com (sin servidor): `npx wrangler secret put SLACK_BOT_TOKEN` en el repo de la web y el canal en la variable `SLACK_CHANNEL` de `wrangler.jsonc`; la app llama a Slack a través del Worker (`…/nube/slack/<método>`), así que el token nunca está en el navegador.
4. Invita al bot al canal (`/invite @Horarios Lopita`) y, en **Equipo**, pon el email de Slack (o el usuario `U…`) de cada persona para los mensajes privados.

En **Ajustes → Slack** se ve si la conexión funciona.

## Cuentas: correo, Google y contraseñas

- **Mi cuenta** (arriba a la derecha): nombre, correo, vincular la cuenta de Google y cambiar la contraseña (si se ha
  entrado con Google no pide la anterior).
- **Entrar con Google**: se activa pegando el ID de cliente de OAuth (tipo «Aplicación web») en Ajustes, o con
  `LOPITA_GOOGLE_CLIENT_ID`. El token se verifica en la app (firma RS256 con las claves públicas de Google, audiencia,
  caducidad y correo verificado), sin librerías, también en la app offline. Se entra en la cuenta vinculada o en la
  que tenga ese correo. Si no hay ninguna, queda un **registro pendiente** que un encargado aprueba (encargado o
  trabajador, y quién es del equipo) o rechaza en Ajustes; nadie entra solo por tener cuenta de Google.
- **Recuperar el acceso**: entrando con Google, o un encargado pone una contraseña temporal desde Ajustes.

## Calendario: día, semana y mes

La pestaña **Calendario** junta todos los horarios (cada día manda el publicado y, si no hay, el borrador más reciente; ver *Línea de tiempo de lo publicado*) y se recorre **semana a semana** o **mes a mes**, con un filtro por persona. Tocar un día o un turno abre ese día en su horario para editarlo hora a hora (**Día**). Cada horario tiene también su vista **Mes**, además de Semana y Día.

**Línea de tiempo de lo publicado** (`app/linea_tiempo.py`). Cada fecha tiene como mucho un horario publicado que manda en ella (tabla `dias_publicados`). Al publicar un horario por primera vez se queda con todas sus fechas, también las que ya tenía otro publicado, y lo que había pasa al historial (`dias_historial`). Tocar o volver a publicar el viejo no le devuelve esas fechas. Despublicar o borrar uno devuelve cada fecha al último publicado anterior que la cubra, o la deja sin horario. Calendario, portal del trabajador, informes de horas, calendarios `.ics`, alertas, arreglos por ausencias, los días previos que usa el motor y los enlaces de Slack leen de ella. La lista de horarios marca los publicados que solo valen en parte de sus días (*Vale N de M días*) o en ninguno (*Sustituido*). Las bases de datos de antes se migran solas la primera vez que se abren (`PRAGMA user_version` 1): manda el último publicado y, si había solapes, el encargado recibe una notificación con las fechas, marcando las que cambian respecto a lo que se veía (antes mandaba el modificado más tarde).

**Ajustes rápidos.** En el menú de un turno (en la vista de día, o en el cuadrante tocando la casilla) hay botones para alargarlo o acortarlo 30 min o 1 h por el principio o por el final, y para desplazarlo 30 min o 1 h. Desde el cuadrante, el ajuste se prepara en la vista de día y se revisa con *Confirmar cambios*, como cualquier edición.

## Informes de horas

**Informes** enseña, para el periodo que se elija (este mes, el anterior, los últimos 3 meses, el año o fechas a mano), cuánto ha trabajado cada persona: horas trabajadas (con las correcciones aprobadas), horas de contrato en esas fechas, horas extra o de menos, días, fines de semana, festivos, aperturas y cierres, y una tabla **mes a mes**. Por defecto cuenta los horarios publicados; se pueden incluir los borradores. El CSV trae una fila por persona y mes.

## Guía de uso

La pestaña **Guía** (y el botón *Guía* de la cabecera) explica cada pantalla en pocos pasos, con un botón para ir a ella; empieza con unos *primeros pasos* para dejar la app lista. Cada pantalla tiene arriba un enlace **¿Cómo funciona esta pantalla?** que lleva a su apartado (`#/guia/<pantalla>`). Los trabajadores ven una versión corta con lo suyo.

## Comentarios

El botón **Comentarios** (arriba, en todas las pantallas) abre una ventana para dejar una sugerencia, un fallo o una duda. Se guarda en la propia app con quién lo envió y desde qué pantalla. Los encargados los ven en la pestaña **Comentarios**, les cambian el estado (nuevo, en curso, hecho, descartado) y responden; quien lo envió ve la respuesta en la misma ventana. Se pueden descargar en CSV.

## Vista diaria

En cada horario, **Semana / Día** cambia de vista (o toca el nombre de un día en el cuadrante). La vista de día es un diagrama de Gantt: una fila por persona, las horas en columnas y arriba la cobertura (personas, y cocina y sala si se piden) recalculada al momento. Con el ratón o el dedo:

- **Arrastrar** un turno lo mueve; **tirar de un borde** lo alarga o lo acorta (en pasos de media hora, o de 15 min si la resolución es de 15).
- **Tocar** un turno abre su menú: horas exactas, puesto, poner las horas de un turno definido o quitarlo. Con el teclado: flechas para moverlo, Mayús + flechas para cambiar la salida, Intro para el menú.
- **Tocar un hueco** en la fila de alguien le añade el turno definido que mejor encaja con esa hora.

Nada se guarda hasta pulsar **Confirmar cambios**: la app evalúa el horario resultante y enseña qué cambia, cómo quedan las horas de cada persona, las reglas que se incumplirían, las alertas críticas que quedan y las alertas nuevas, resueltas, que mejoran o empeoran. Desde ahí, *Seguir editando*, *Guardar* o *Guardar y publicar* (no se puede publicar con reglas incumplidas; con alertas críticas pide la confirmación de siempre). Si el horario ya está publicado, los cambios se guardan como **arreglo**: el equipo sigue viendo el horario actual hasta que se publica el arreglo.

Cada turno se guarda como el turno definido que más se solapa con esas horas (respetando quién puede abrir o cerrar) y, si las horas no coinciden, como **turno a medida**. Los cambios quedan bloqueados, como los del cuadrante, y *Regenerar* y *Solucionar problemas* los respetan con sus horas y su puesto. De momento hay un turno por persona y día (no turnos partidos).

## Cuentas, solicitudes e informes de horas

Hay dos tipos de cuenta. El **encargado** lo controla todo. El **trabajador** solo ve lo suyo: sus próximos turnos, sus horas, sus preferencias y sus solicitudes.

- **Crear cuentas**: Ajustes → Cuentas de acceso. Se elige «Trabajador», la persona del equipo y una contraseña temporal; al entrar por primera vez tendrá que cambiarla. Cada persona tiene una sola cuenta, y al borrarla pierde el acceso al instante.
- **Preferencias**: el trabajador edita las suyas y se guardan directamente (cuentan como una versión de la configuración).
- **Vacaciones y permisos**: el trabajador los solicita (solo fechas futuras). El encargado los aprueba o rechaza en **Solicitudes**; al aprobar se añaden a las ausencias y el motor los respeta. Si ya había horarios para esas fechas, hay que regenerarlos.
- **Correcciones de horas**: el trabajador puede avisar de que un día ya trabajado fue distinto al cuadrante (horas distintas, otro turno, no trabajó o día extra), con su motivo. Solo sobre horarios publicados y hasta dos meses atrás. Al aprobarla, el informe de horas se ajusta y la diferencia entra en el saldo que se arrastra al siguiente horario (si «arrastrar saldo» está activo en Reglas).
- **Informes**: horas previstas (horarios publicados) y ajustadas (con las correcciones aprobadas) por persona y periodo, con detalle por día y CSV. Cada trabajador ve el suyo en «Mis horas».
- Si el encargado edita la configuración mientras alguien cambia sus preferencias o se aprueba una solicitud, al guardar verá un aviso de que la configuración ha cambiado y podrá recargarla.

## Alertas

**Para el encargado.** La pestaña **Alertas** reúne, de más a menos importante, todo lo que conviene revisar de los horarios que aún no han terminado; cada horario las muestra también arriba. Cada alerta lleva una importancia de 0 a 100 y una severidad: alta (60+), media (35+) y baja; **crítica** se reserva para las alertas con las que el horario no vale (abajo). Familias:

- **Críticas (el horario no vale)**: un momento sin nadie en el local, desde la media hora antes de abrir hasta la media hora después de cerrar (lo que marca la demanda); al empezar el día, nadie habilitado para abrir; o al terminar, nadie habilitado para cerrar que se quede hasta el final (con varias personas, las demás pueden ayudar aunque no estén habilitadas). Cuenta quien va a venir de verdad: un turno de alguien con una ausencia aprobada o que ya no está en la plantilla es como si no hubiera nadie. Cada una dice si tiene arreglo moviendo turnos y, si no, por qué («Nadie habilitado para abrir puede estar ese día: Ana está de vacaciones y Bea libra los miércoles»). No se pueden silenciar ni reconocer, y el motor las evita por encima de todo lo demás (peso *Alertas críticas*). Que falte gente en el pico es grave (alta), pero no invalida el horario.
- **Reglas**: las reglas duras incumplidas (impiden publicar).
- **Desfase**: el horario ya no cuadra con la configuración, por ejemplo tras aprobar una ausencia o correcciones de horas. Indica **desde qué día hay que regenerar** y el botón *Regenerar desde esa fecha* mantiene intactos los días anteriores. Si el horario está publicado es más grave.
- **Cobertura**: franjas desatendidas (más grave si no hay nadie o es el pico), sin encargado, personal de más.
- **Horas**: demasiadas o muy pocas respecto al contrato, semanas cortas, saldo que supera lo que se arrastra.
- **Reparto**: horas, fines de semana y cierres desiguales entre personas.
- **Preferencias**: quién no está en su franja preferida (pesa según la importancia que dio cada persona).
- **Personal**: demasiados días seguidos trabajando.
- **Plantilla** (nivel macro): en conjunto falta o sobra personal frente a la demanda, aunque cada persona esté bien. Por semana compara las horas-persona que pide la demanda con las horas de contrato (sin ausencias) y con lo máximo que podría hacer la plantilla con horas extra: *falta personal aunque todos hagan extra* (alta), *hay que tirar de horas extra* o *sobra personal* (por encima de un % configurable). Por día avisa si no hay bastantes personas disponibles para el pico o nadie disponible que pueda abrir o cerrar.
- **Avisos de contexto**: solicitudes pendientes que afectan al horario, cambios sin avisar por Slack y cambios que el equipo aún no ha visto.

*Reconocer* una alerta la aparta de la lista (con nota opcional); si cambia su contenido, vuelve a salir. Los umbrales y las alertas que no quieres recibir se ajustan en **Reglas → Alertas**. Las críticas, las reglas incumplidas, el desfase y los avisos de contexto no se pueden silenciar. Las alertas se calculan al vuelo contra la configuración actual: no hay nada que migrar.

**Horarios que no valen.** Si al generar (o regenerar) sale alguna alerta crítica, la generación cuenta como fallida y se reintenta como mucho **2 veces**: primero solucionando sobre lo generado y después regenerando con el doble de tiempo para el motor; se queda el mejor intento. No reintenta cuando otro intento no puede dar un resultado distinto: si ninguna crítica tiene arreglo moviendo turnos (no hay nadie disponible) o si el motor ya ha demostrado que su horario es el óptimo. Si sigue sin valer, el encargado recibe un **aviso dentro de la app** (una ventana que sale al momento o al volver a entrar, con las alertas y su causa) y el horario queda como borrador.

Cuando se aprueba una ausencia (o se añade en Ausencias, o alguien sale de la plantilla) y deja turnos que nadie va a hacer, la app **arregla sola** los horarios en curso o futuros, sin publicar nada: un borrador se ajusta tal cual; de uno publicado prepara un **arreglo** (un borrador que lo sustituye) y avisa al encargado. El equipo sigue viendo el horario publicado hasta que el encargado publica el arreglo: entonces sus turnos pasan al horario publicado (mismo enlace), cada persona afectada lo ve en su Inicio y queda pendiente avisar por Slack. Hoy y los días pasados de un publicado no se tocan.

La última palabra es del encargado: puede publicar un horario con alertas críticas (por ejemplo, si lo va a resolver fuera de la app), pero la app le pide una **confirmación expresa** y queda registrado quién lo publicó y cuándo.

**Solucionar problemas.** El botón *Solucionar problemas* (en cada horario) arregla las alertas tocando lo mínimo, sin regenerar: parte del horario actual y solo mueve una casilla si compensa, por ejemplo pasar un turno de quien va sobrado de horas a quien va corto, cubrir un hueco con alguien que tiene horas de menos o quitar un turno que cae en una ausencia aprobada. Antes de aplicar enseña los cambios en palabras («el turno Tarde pasa de Irene a Carla»), cómo quedan las horas de cada persona afectada, qué alertas se resuelven, mejoran o aparecen, y por qué queda lo que no se puede arreglar (por ejemplo, alguien que no puede llegar a su contrato con sus libranzas, o que falta plantilla). También muestra, por semana, la demanda frente a los contratos y al máximo con horas extra. Se cumplen siempre las reglas duras, se respetan los cambios manuales bloqueados y no se tocan los días ya pasados (ni hoy, si está publicado). Solo propone algo si el horario mejora de verdad: primero menos reglas incumplidas, luego menos alertas críticas y altas. Además de cubrir la demanda y las horas de contrato, el motor (al generar y al solucionar) intenta que no salten las alertas críticas (por encima de todo) y las de rachas de días seguidos, reparto desigual de horas, fines de semana y cierres, y saldo que no se podría arrastrar, con los umbrales de **Reglas → Alertas**. El peso *Cada casilla que cambia* (Reglas → Ajuste fino del motor) decide cuánto tiene que ganarse para mover una casilla. Si el horario está publicado, los cambios aplicados avisan al equipo como cualquier otra edición.

**Qué cambiar en la configuración.** Muchas alertas no se arreglan moviendo turnos, sino cambiando la configuración. Cada horario (y la ventana de *Solucionar problemas*) muestra sugerencias concretas, con nombres, días y horas, y un botón para ir a la pantalla donde se hace el cambio: repartir mejor las libranzas fijas cuando los huecos caen siempre los mismos días, habilitar a más gente para abrir o cerrar, acortar los turnos que dejan gente de sobra o añadir uno corto para el pico, ajustar contratos que no encajan con las libranzas, rotar los fines de semana o añadir las tareas fijas que la demanda no recoge (`lopita_horarios/sugerencias.py`). Son pistas: después hay que regenerar el horario para comprobarlo.

**Para el trabajador.** Al publicar un horario, modificar o regenerar uno publicado, o retirarlo, cada persona afectada ve en su **Inicio** un aviso con lo que ha cambiado («Tu turno del lunes 16 ha cambiado: de Mañana a Tarde»), con insignia en el menú, hasta que lo marca como visto. Los cambios sucesivos de una misma casilla se funden y, si vuelve a como estaba, el aviso desaparece. Los cambios de días pasados no se muestran.

## Web pública de Lopita

`web/` es la web de lopita.es rehecha como web estática (mismas páginas y direcciones: `/conocenos/`, `/catering/`,
textos legales), sin WordPress. Sus dos formularios (candidaturas con CV y catering) y la carta en PDF los sirve la app:

- `POST /api/web/candidatura` y `POST /api/web/catering`: sin sesión, validados en el servidor, 5 envíos por hora e
  IP y un campo trampa contra robots. Lo enviado aparece en la pestaña **Web** de la app (encargados).
- `GET /api/web/documentos/carta-cafeteria|carta-comidas`: el último PDF que subió el encargado (pestaña Web o
  `python -m app.cli documento <clave> <pdf>`).
- Fotos, logos y cartas actuales: `sh herramientas/descargar_recursos_web.sh` (van a `web/recursos/`).
- En local, web y app juntas como en el servidor: `python herramientas/servir_web.py` → http://localhost:8001.

La vista de solo lectura `/ver/<token>` pide sesión (enseña nombres y turnos); `LOPITA_VISTA_PUBLICA=1` la abre.

**Vista previa en la web de Yume** (`llumedigital.com/lopita/`, oculta y sin indexar, sin servidor): `python herramientas/exportar_vista_previa.py ../../public/lopita` desde esta carpeta (la web está en este mismo repositorio, `llume-website`). Los formularios no envían nada y la carta abre los PDF de lopita.es.

**Demo privada** (web con contraseña + app, en un dominio propio): `docker-compose.demo.yml` y
[deploy/demo/README.md](deploy/demo/README.md).

## Ponerlo en producción (web app)

La forma prevista de usarla es como **web app**: un servidor con la app y, en cada móvil, la página instalada en la pantalla de inicio. No hace falta tienda de apps ni `.apk`. El *service worker* (`app/static/sw.js`) guarda la interfaz en el móvil, así que abre al instante y se puede abrir sin conexión; los datos siempre vienen del servidor.

En un VPS (o cualquier máquina con Docker y los puertos 80 y 443 abiertos):

1. Haz que un dominio apunte a la máquina (por ejemplo `horarios.lopita.es`).
2. Copia `.env.example` como `.env` y rellénalo: `LOPITA_DOMINIO`, contraseña inicial, `LOPITA_SECRET`, `LOPITA_PUBLIC_URL` y Slack.
3. `docker compose up -d --build`. Arranca tres servicios:
   - `lopita`: la app (FastAPI), sin puerto público.
   - `caddy`: HTTPS con certificado automático de Let's Encrypt, compresión y cabeceras de seguridad (`Caddyfile`).
   - `copias`: una copia diaria de la base de datos en `/data/copias` (se guardan 30 días). Para tenerlas fuera de la máquina, sincroniza esa carpeta con otro sitio. A mano: `docker compose exec lopita python -m app.cli copia /data/copias/ahora.db`.

Elige una región de la UE, porque hay datos personales del equipo. Con 2 vCPU y 2 GB de memoria va sobrado. Si el proveedor ya pone el HTTPS (Render, Railway, Fly.io con un volumen), basta con el servicio `lopita` y `LOPITA_HTTPS=1`. Para exportar PDF desde el servidor, construye con `WITH_PDF=1`; sin ello, «Imprimir → Guardar como PDF» del navegador da el mismo resultado.

**Rendimiento.** Las alertas de cada horario se recuerdan en memoria y solo se recalculan cuando cambia el horario, el anterior o la configuración (`app/alertas.py`, `CacheEvaluaciones`); con un año de horarios, abrir la app pasa de ~1 s a ~25 ms. Por eso se ejecuta un único proceso de uvicorn. SQLite va en modo WAL, las respuestas grandes van comprimidas y el motor calcula un horario a la vez (CP-SAT ya usa todos los núcleos en cada cálculo).

**Versiones.** Python 3.14 en todas partes (imagen Docker, CI y Pyodide 314). `requirements.in` tiene los rangos aceptados y `requirements.txt` las versiones exactas, generadas con `uv pip compile requirements.in -o requirements.txt --python-version 3.14`; el CI comprueba que no se han desincronizado.

## Conectar Slack

1. En <https://api.slack.com/apps>: **Create New App → From an app manifest**, y pega `slack-manifest.yml`.
2. **Install to Workspace** y copia el *Bot User OAuth Token* (`xoxb-…`) en `SLACK_BOT_TOKEN`.
3. Pon el canal en `SLACK_CHANNEL` e invita al bot: `/invite @Horarios Lopita`.
4. En **Equipo**, rellena el usuario de Slack (`U0…`) o el email de cada persona.

Ajustes → Slack muestra si la conexión funciona.

## Uso diario

1. **Horarios → Nuevo horario**: elige semana, mes o fechas y pulsa *Generar*.
2. Revisa los avisos (franjas sin cubrir, horas extra…) y la barra de cobertura de cada día. *Solucionar problemas* propone los mínimos cambios para arreglarlos.
3. Toca cualquier casilla para cambiar el turno, o abre la vista **Día** para mover, alargar o añadir turnos hora a hora y confirmar viendo las alertas. Los cambios quedan bloqueados (candado) y *Regenerar* los respeta.
4. **Publicar y enviar a Slack**. Si cambias algo después, aparece *Avisar por Slack* para notificar solo a quien le afecta.
5. **Horas (CSV)** para la gestoría; **Imprimir** o **PDF** para el corcho.

Cuando cambie la plantilla, los turnos o la demanda, edítalos en su pantalla y pulsa *Guardar cambios*. Cada guardado crea una versión que se puede restaurar desde Ajustes.

## Línea de comandos (sin la app)

```bash
python -m lopita_horarios generar --config datos/ejemplo.json --mes 2026-11 --pdf
python -m lopita_horarios validar --config datos/ejemplo.json --horario salida/horario_….json
python -m app.cli usuario ana --nombre "Ana"   # crea un usuario o cambia su contraseña
```

## Tests

```bash
python -m pytest -q
```

## Pendiente de decidir con datos reales

- Validar con la gestoría las reglas del convenio de hostelería de Asturias (Reglas).
- Afinar la demanda tras un mes de piloto en paralelo con el método actual.
- Posible v2: importar los tickets por hora del TPV para estimar la demanda.

Las fuentes Oswald y Raleway se distribuyen con licencia SIL Open Font License (ver `lopita_horarios/assets/fonts/`).
