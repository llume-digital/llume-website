# Revisión técnica y puntos de mejora · Gestor de horarios de Lopita

Revisión del 15/10/2026 sobre la rama `feat/alertas` (commit 6def961). Se ejecutaron los 66 tests (todos en verde), se leyó `app/main.py` y `app/db.py` completos y se hizo un recorrido dinámico de la API con un script (login, roles, celdas, publicación, vista pública, concurrencia).
Los puntos marcados con ✅ están resueltos (18/10/2026; WAL y copias en el PR #10, el resto en el de seguridad).
Prioridad: **P1** antes de salir a producción · **P2** pronto · **P3** deseable.

## Seguridad

- ✅ **P1 · Sin límite de intentos de login.** 10 contraseñas erróneas seguidas devuelven 401 siempre, sin bloqueo ni espera. Añadir limitación por usuario e IP (p. ej. 5 fallos → espera creciente) y registro de intentos.
- ✅ **P1 · `cambiar_clave` no se aplica en el servidor.** Una trabajadora con contraseña temporal puede usar toda la API (`/api/mi/perfil` devuelve 200) sin cambiarla; solo el frontend lo pide. Bloquear en `user()` todas las rutas salvo `/api/me`, `/api/mi/clave` y `/api/logout` mientras el flag esté activo.
- ✅ **P1 · Sin protección CSRF explícita.** La cookie es `SameSite=lax`, lo que cubre la mayoría de casos, pero un POST con `Origin` ajeno (`despublicar`) se acepta (200). Rechazar peticiones mutantes cuyo `Origin`/`Referer` no coincida con el host, o exigir una cabecera propia (`X-Requested-With`).
- **P1 · Cookie sin `Secure` por defecto.** `https_only` depende de `LOPITA_HTTPS=1`; si se olvida en producción las sesiones viajan sin cifrar. Activarlo por defecto salvo en desarrollo, y documentarlo en `.env.example`.
- ✅ **P1 · Secreto de sesión efímero.** Sin `LOPITA_SECRET` se genera uno aleatorio en cada arranque: todas las sesiones caducan al reiniciar y, con varios procesos, cada uno firma distinto. Fallar al arrancar en producción si falta.
- **P2 · La sesión no se invalida al cambiar o restablecer la contraseña** ni se rota al iniciar sesión. Guardar una versión de sesión (contador en `users`) y comprobarla en cada petición.
- ✅ **P2 · Enumeración de usuarios por tiempo.** Un usuario inexistente responde en ~1 ms y uno existente en ~37 ms (PBKDF2). Hacer un hash falso cuando el usuario no existe.
- **P2 · Contraseña mínima de 8 caracteres sin más criterios**, y el admin elige la temporal de cada trabajador. Generar la temporal de forma aleatoria y mostrarla una sola vez.
- **P2 · Token de la vista pública permanente.** `/ver/<token>` no caduca ni se puede rotar; quien reciba el enlace lo conserva aunque deje la empresa, y expone nombres de todo el equipo. Añadir «regenerar enlace» y, si se prefiere, caducidad.
- **P2 · Sin límites de tamaño en textos** (`nota`, `motivo`, `respuesta`): una nota de 200 KB se acepta. Limitar a unos cientos de caracteres en los modelos Pydantic.
- ✅ **P2 · Documentación interactiva expuesta** (`/api/docs`, `/api/openapi.json`) sin login. Desactivar en producción.
- **P3 · Cabeceras de seguridad** (CSP, `X-Frame-Options`, `Referrer-Policy`) y revisión de los 13 usos de `innerHTML` en `app.js` (hoy todos pasan por `esc()`; confirmar que ninguno la omite).
- **P3 · Auditoría.** No se registra quién borra un horario, restaura una configuración o crea/borra cuentas.

## Fiabilidad y datos

- ✅ **P1 · Copias de seguridad.** Todo vive en un SQLite (`datos/lopita.db`). Falta una copia automática (`sqlite3 .backup`) y probar la restauración; además activar `PRAGMA journal_mode=WAL` y `foreign_keys`.
- ✅ **P1 · `PUT /api/config` sin `base` pisa cambios.** El control de concurrencia solo funciona si el cliente manda `base`; sin él (probado: 200) se sobrescribe la última versión. Hacerlo obligatorio.
- **P2 · Lecturas-modificaciones-escrituras no atómicas.** `edit_cell`, `regenerate` o las aprobaciones leen el horario, lo cambian en memoria y lo guardan sin comprobar `updated_at`; dos encargados editando a la vez se pisan. Añadir comparación de versión (como en la configuración) o transacción.
- **P2 · Aprobar una solicitud no es atómico.** En `resolve_request` se guarda la configuración y después se marca la solicitud; un fallo en medio deja la ausencia aprobada con la solicitud aún «pendiente» (y aprobable dos veces). Envolver en una sola transacción.
- **P2 · Cada petición carga todos los horarios.** `list_schedules()` parsea todos los JSON en `assignments_before`, `previous_contiguous`, `best_schedules` y en `/api/me` (que calcula las alertas de todo). Hoy tarda 5 ms con un horario; con un año de histórico se notará. Consultar por rango de fechas, cachear y no calcular alertas en `/api/me`.
- **P2 · Tabla `schedules` guarda todo en un JSON** sin índices por fecha; mover las asignaciones a una tabla propia facilitaría informes y consultas.
- **P2 · Borrar un trabajador de la configuración** puede dejar solicitudes, avisos, cuentas y asignaciones apuntando a un id que ya no existe (hay un `StopIteration` capturado como 400 genérico). Validar referencias al guardar la configuración.
- **P3 · Zona horaria.** `dt.date.today()` usa la del servidor (UTC en Docker); en España, entre 00:00 y 02:00 «hoy» es el día anterior. Fijar `Europe/Madrid`.
- **P3 · Migraciones** con `ALTER TABLE` a mano; usar una tabla de versiones de esquema.

## Funcionalidad y reglas

- **P1 · Se permite generar horarios en el pasado** (`desde=2020-01-01` devuelve 200) y con solapes con otros horarios del mismo periodo. Avisar o impedir solapes entre horarios no descartados.
- **P2 · Las solicitudes de ausencia aprobadas no regeneran ni avisan** de los horarios ya creados que afectan (solo se devuelve `horarios_afectados`). Mostrar una alerta persistente y ofrecer «regenerar desde esa fecha».
- **P2 · Pendiente heredado:** al aprobar correcciones de un periodo cuyo siguiente horario ya existe, el saldo arrastrado queda desfasado (ya existe la alerta de saldo; falta el botón de regeneración en un clic).
- **P2 · Slack:** avisar al admin de solicitudes nuevas y al trabajador de la respuesta (hoy solo se ve dentro de la app); reintentos y cola si Slack falla, porque `notificar` solo limpia cambios si `res.ok`.
- **P2 · Validar el convenio** (descansos, máximo semanal, festivos locales, nocturnidad) con la gestoría y reflejarlo en los tests.
- **P2 · Festivos:** no hay calendario de festivos nacionales/autonómicos/locales; la demanda y los tipos de día se asignan a mano.
- **P3 · Intercambio de turnos** entre compañeros, con aprobación del encargado.
- **P3 · Importación de ventas del TPV** para calibrar la demanda (ya hay herramienta desde Maps).
- **P3 · PDF:** responde 501 si no hay Playwright; ofrecer la imagen con `WITH_PDF=1` o generar el PDF con una librería ligera.

## Calidad de código y pruebas

- **P2 · `app/main.py` tiene 800 líneas** con modelos, reglas y rutas juntos. Separar en routers (`horarios`, `portal`, `solicitudes`, `usuarios`) y mover la lógica a servicios.
- **P2 · ~~`app/static/app.js` en un solo archivo~~** (partido en módulos ES en noviembre de 2026). Queda añadir comprobación automática de que toda cadena dinámica pasa por `esc()`.
- **P2 · Cubrir con tests lo que falta:** límites de tamaño, `cambiar_clave`, CSRF/Origin, concurrencia entre dos encargados, reinicio de sesión tras cambio de clave, borrado de empleados con datos asociados, y horarios de 9 semanas (rendimiento del solver).
- **P2 · Tiempo del solver:** el límite por defecto es 30 s en un hilo de petición; con varias generaciones simultáneas se bloquea el servidor. Ejecutarlo en segundo plano con estado «generando…».
- **P3 · CI** (GitHub Actions: tests + linter `ruff`) y fijado de versiones en `requirements.txt` (hoy `>=`).
- **P3 · Aviso de depreciación** de `httpx` con `starlette.testclient` en los tests.
- **P3 · Higiene del repositorio:** quedan `_to_delete/_proj_tmp.tgz` (236 KB) y la carpeta vacía `_stage/` sin versionar; borrarlos o añadirlos a `.gitignore`. `.env`, `.venv` y `.pytest_cache` ya están fuera del repo.

## Despliegue

- **P1 · Sin desplegar:** la imagen Docker no se ha construido nunca. Construirla, probar `docker-compose up` con volumen `/data` y HTTPS (proxy inverso) antes del piloto.
- **P2 · `--forwarded-allow-ips "*"`** en el `CMD` confía en cualquier cabecera `X-Forwarded-*`; restringir a la IP del proxy.
- **P2 · Monitorización:** `/healthz` no comprueba la base de datos; añadir comprobación y registros estructurados.
- **P3 · Piloto de un mes** en paralelo con el método actual y recogida de incidencias.
