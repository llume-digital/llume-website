# llume · documentación técnica de la web

Web corporativa estática, sin paso de compilación. En tres idiomas (español en `/`, inglés en `/en/`, portugués en `/pt/`), con una página por caso y páginas legales.

## 1. Stack

| Capa | Tecnología |
|---|---|
| Marcado | HTML5 semántico, una página por idioma con navegación por anclas |
| Estilos | CSS3 puro (variables, Grid, Flexbox, `@media`, `mask-image`, `backdrop-filter`) |
| Lógica | JavaScript ES modules, sin TypeScript ni bundler |
| 3D | **three.js 0.160** minificado (`public/vendor/three.module.min.js`), cargado cuando la página está inactiva para que el texto aparezca antes |
| Tipografía | Geist y Geist Mono variables, alojadas en `public/fonts/` (sin Google Fonts) |
| Hosting | Cloudflare Workers con recursos estáticos, despliegue automático desde GitHub |

No hay `package.json` ni paso de compilación. Los recursos principales se sirven desde el propio dominio. Las portadas cargan Cloudflare Web Analytics y envían estadísticas a Cloudflare; las páginas de privacidad y cookies describen esta conexión. El prototipo El Puerto también usa fuentes de Google y un mapa externo.

## 2. Estructura de archivos

```
llume-web/
├── CONTEXTO.md          Contexto de la empresa y decisiones de marca (no se publica)
├── TECNICO.md           Este documento (no se publica)
├── wrangler.jsonc       Configuración de despliegue en Cloudflare
├── scripts/build_cases.py  Genera las páginas de cada caso a partir de las portadas
├── scripts/build_legal.py  Genera las páginas legales en los tres idiomas (datos del titular arriba del todo)
├── scripts/build_pages.py  Genera Formación y Preguntas frecuentes en los tres idiomas
├── apps/lopita-horarios/   Código de la app de horarios de Lopita y de la web de lopita.es, con sus tests (no se publica)
├── .github/workflows/      CI de la app de horarios (solo corre cuando cambia apps/lopita-horarios/)
└── public/              Lo único que se publica
    ├── index.html       Página en español
    ├── en/index.html    Página en inglés (misma estructura)
    ├── pt/index.html    Página en portugués (misma estructura)
    ├── casos/, en/cases/, pt/casos/   Una página por caso (generadas, ver abajo)
    ├── nosotros.html, en/about.html, pt/sobre-nos.html
    ├── aviso-legal.html, privacidad.html, cookies.html (y sus versiones en /en/ y /pt/, generadas)
    ├── styles.css       Todo el diseño, incluidas las páginas legales
    ├── ui.js            Interfaz: menú, scroll, pestañas, contadores, casos, formulario
    ├── main.js          Solo la escena 3D (si no hay WebGL, se queda un fondo estático)
    ├── vendor/three.module.min.js
    ├── fonts/           geist.woff2, geist-mono.woff2
    ├── robots.txt, sitemap.xml, llms.txt
    ├── _headers         Cabeceras de seguridad y caché
    └── assets/
        ├── mark.svg, favicon.svg, og.png (imagen al compartir en redes)
        ├── cases/       Capturas y fotos de los casos (WebP)
        └── partners/    Logos de clientes y colaboradores
```

## 3. Secciones de la página

La portada tiene 9 bloques:

| id / clase | Sección |
|---|---|
| `.hero` | Titular, frase rotatoria, llamada a la acción y franja de logos "Han confiado en nosotros" |
| `#servicios` | 4 soluciones en tarjetas clicables (icono, texto corto, etiquetas y "Ver más"); cada una abre su diálogo `#sol-1`…`#sol-4` con ejemplos, cómo lo hacemos, caso relacionado y contacto. Justo debajo, las filas de logos de integraciones |
| `#retos` | "¿Qué te frena?": pestañas por problema, cada una con el sector donde ya se resolvió y su caso |
| `#casos` | 3 destacados (Clevercar, visión artificial como "Experiencia del equipo", Proactive); "Ver los otros 4 casos" despliega el resto (`.cx-extra`). El caso de visión no nombra cliente a propósito |
| `#calculadora` | Calculadora del coste de las tareas repetitivas |
| `#proceso` | "Cuatro pasos, sin sorpresas": incluye la primera reunión gratis, el diagnóstico con garantía y el acompañamiento posterior; botón "Pedir diagnóstico", tabla comparativa, 3 compromisos y las dos filas de logos de integraciones |
| `#formacion` | Formación en IA en 3 sesiones (conocer la empresa + 2 talleres de 3 h) y guía final; independiente de la herramienta. Programa completo en `/formacion` |
| `#contacto` | "¿Qué pasa en la primera llamada?", formulario de llamada y primera capa de protección de datos |

"Nosotros" tiene página propia: `/nosotros`, `/en/about` y `/pt/sobre-nos`. Formación completa en `/formacion` (`/en/training`, `/pt/formacao`), generada con `scripts/build_pages.py`.

### Casos de éxito

Cada caso es un `<article class="cx" data-case="…">` con su imagen (`.cx-media`), el resumen y un `<template class="cx-detail">` con la ficha completa. `ui.js` clona la imagen y la ficha en el diálogo. Cada caso tiene enlace directo: `llumedigital.com/#caso-clevercar`.

Variantes de imagen: `media-device` (captura real en navegador + móvil), `media-crm` (maqueta del CRM de Clevercar), `media-cam` (cajas de detección), `media-doc` (presupuesto generado) y `media-cloud` (diagrama de migración).

Cada caso incluye un bloque "Antes / Después" (`.ba`) al principio de la ficha.

Para añadir o cambiar un caso: editar el `<article class="cx">` en las tres portadas y ejecutar `python3 scripts/build_cases.py`, que regenera las páginas `/casos/<id>`, `/en/cases/<id>` y `/pt/casos/<id>`. Después, añadirlas a `sitemap.xml` si son nuevas.

## 4. Formulario

Debajo lleva la primera capa de información de protección de datos (responsable, finalidad, legitimación, destinatarios y derechos). Pide qué necesita y un teléfono para llamarle (empresa y email opcionales). Abre el programa de correo del visitante con el mensaje preparado para `info@llumedigital.com`. Un segundo botón, «Enviar por WhatsApp», abre `wa.me` con el mismo mensaje (número en `data-wa` del `<form>`). El botón «Quiero recuperar ese tiempo» de la calculadora rellena el mensaje con la estimación si el campo está vacío (plantilla en `data-msg` de `#calc`). Los textos del asunto y del cuerpo salen de los `data-*` del `<form>`, así el mismo `ui.js` sirve para los dos idiomas. Exige aceptar la política de privacidad.

## 5. Cómo ejecutar en local

```bash
python3 -m http.server 8123 -d public
```

Abrir http://localhost:8123. Las rutas son absolutas (`/styles.css`), así que hay que servir `public/` como raíz.

## 6. Despliegue

Cloudflare Workers conectado a `llume-digital/llume-website` (Workers Builds, con la app «Cloudflare Workers and Pages» instalada en la organización llume-digital): cada push a `main` publica en llumedigital.com (`npx wrangler deploy`, que lee `wrangler.jsonc` y publica solo `public/`). Las rutas sin extensión (`/privacidad`) las resuelve Cloudflare con el `.html` correspondiente. Las rutas que no existen muestran `public/404.html` con estado 404 (`not_found_handling` en `wrangler.jsonc`). El Worker (`src/worker.js`) solo se ejecuta en las rutas de `assets.run_worker_first`; todo lo demás lo sirve Cloudflare directamente desde `public/`. Para cambiar la clave de Lopita, poner el sha256 de la nueva en `LOPITA_CLAVE_SHA256`; la de las demos privadas, en `NARANCO_CLAVE_SHA256` y `BIOASTURIAS_CLAVE_SHA256` (en `vars` y en `previews.vars`). Cada commit desplegado lleva en GitHub el check «Workers Builds: llume-website»: si un commit de `main` no lo tiene, el despliegue automático está desconectado (pasó al mover el repo de `llume26` a `llume-digital`) y hay que reconectarlo en Cloudflare → Workers & Pages → llume-website → Settings → Build.

## 7. Pendiente

- **Datos legales**: por decisión del titular, los campos de NIF, domicilio y registro en `OWNER` (`scripts/build_legal.py`) quedan sin publicar por ahora. Hoy solo figuran el nombre y el email.
- **Formulario**: se mantiene el envío mediante la aplicación de correo del visitante. El envío directo y una agenda quedan como posibles mejoras posteriores.
- **Equipo y casos**: faltan identidad y fotos del equipo, y verificación documental de las cifras. El titular confirmó la autorización para mostrar los logos, testimonios y resultados publicados.
- **Teléfono y perfil de Google Business**.
- **Precio del diagnóstico digital** y confirmar que se puede ofrecer la garantía.
- **Alta como agente digitalizador / asesor** si se quiere afirmar que los proyectos se pueden pagar con el Kit Digital o el Kit Consulting (hoy la web solo ofrece ayudar a comprobarlo).
- **Logos en mejor calidad**: Universidad de Oviedo (175×125) y Proactive Future a color.

## 8. Configuración de Cloudflare

LinkedIn: el pie de las tres portadas enlaza a la página de empresa y el `ProfessionalService` incluye esa URL en `sameAs`.


- **Always Use HTTPS** activado: `http://` redirige a `https://`.
- **Regla de redirección** `www.llumedigital.com/*` → `llumedigital.com/*` (301).
- **Web Analytics** (sin cookies) con instalación automática; los datos se ven en Cloudflare → Web analytics.

## 9. SEO

- Títulos con la palabra clave al principio, `meta robots` con vista previa grande de imágenes, `canonical` y `hreflang` en todas las páginas.
- Datos estructurados: en las portadas, un `@graph` con `WebSite` y `ProfessionalService` (con el catálogo de servicios sacado de las tarjetas de Soluciones). En casos, `Article` y `BreadcrumbList`.
- `sitemap.xml` con todas las URLs y sus alternativas por idioma; `llms.txt` para asistentes de IA.
- Enlazado interno entre portadas, servicios y páginas de casos.
- Pendiente (necesita la cuenta de Google): dar de alta el dominio en Google Search Console y enviar el sitemap.

## 10. Prototipos para clientes

Los prototipos de webs para empresas (que enseñamos antes de cerrar trato) no tienen repositorio propio: viven en este mismo repo, **una carpeta por prototipo dentro de `public/`**, y se publican en `llumedigital.com/<nombre>/`. Así el equipo trabaja sobre un único repositorio y no hay carpetas sueltas en el ordenador de nadie.

**Reglas**

- Una carpeta por prototipo, con el nombre en minúsculas y sin espacios (`public/elpuertoluanco/`). HTML, CSS y JS estáticos, sin compilar.
- **Rutas relativas** (`img/hero.webp`, `carta/`), no absolutas como las de la web de llume. Así la carpeta se puede mover al dominio del cliente sin tocar nada.
- **`<meta name="robots" content="noindex, nofollow">` en todas las páginas** del prototipo.
- No enlazarlo desde la web de llume y no añadirlo a `sitemap.xml` ni a `llms.txt`. Solo lo ve quien reciba la dirección.
- No tocar archivos de la raíz de `public/` ni otras carpetas. Los scripts de `scripts/` no recorren carpetas de prototipos.
- El repo es público y el historial conserva lo que se borra: no subir datos personales, claves ni material de terceros que no podamos mostrar.

**Cómo trabajar**

- `git pull` antes de empezar, commits pequeños y `git push` al terminar. Cada push a `main` publica (ver apartado 6), así que se revisa antes de subir.
- No editar el mismo prototipo dos personas a la vez.
- El clon no debe estar dentro de iCloud Drive: la carpeta `.git` puede corromperse o duplicarse.
- En local: `python3 -m http.server 8123 -d public` y abrir `http://localhost:8123/<nombre>/`.

**Si el cliente compra**: copiar la carpeta a su propio repositorio y dominio, quitar el `noindex`, borrarla de aquí (con commit) y avisar al equipo.

**Prototipos actuales**

| Carpeta | Cliente | Qué es |
|---|---|---|
| `public/elpuertoluanco/` | Cafetería El Puerto (Luanco, Asturias) | Web de una página y carta digital para QR en `carta/` |
| `public/demo/acaldeira/` | Restaurante A Caldeira (Gijón) | Concepto no oficial en `llumedigital.com/demo/acaldeira/`: portada, espacios, carta ilustrativa, opciones para grupos, servicios, horarios, ubicación y preguntas frecuentes. No inventa platos ni precios: enlaza la carta vigente de la web del restaurante. Fotos generadas e identificadas como ilustrativas, sin imágenes reales del negocio. Reserva por llamada al teléfono que publica A Caldeira. Ruta accesible a quien conozca la URL, con `noindex` en HTML y `_headers`; **no está protegida con clave**. Datos públicos consultados el 24/11/2026, pendientes de confirmar con el restaurante antes de convertirlo en web oficial. |
| `public/lopita/` | Lopita & Co (Oviedo) | Web nueva de lopita.es. Se genera desde el código de `apps/lopita-horarios/` con `python apps/lopita-horarios/herramientas/exportar_vista_previa.py public/lopita`: no se edita a mano. Formularios en modo vista previa (no envían) y carta enlazada a los PDF de lopita.es |
| `public/lopita/horarios/` | Lopita & Co | App de horarios sin servidor para que el cliente la pruebe: Python en el navegador (Pyodide) calcula el horario y la base de datos SQLite se comparte en un Durable Object (`src/worker.js`, ruta `nube/db`, con versión para no pisar cambios). Se entra con un enlace que lleva la clave (`#clave=…`, solo está su sha256 en `wrangler.jsonc`); dentro, usuario `admin` / `lopita` la primera vez. Se construye con `python apps/lopita-horarios/herramientas/construir_offline.py --nube nube/db --noindex` y no se edita a mano: cada vez que cambia la app en `main`, el workflow «Lopita · Demo en la web» (`.github/workflows/demo-web.yml`) la reconstruye y abre o actualiza el PR `demo/lopita-horarios`, que solo toca `public/` y se fusiona con bypass. Sin fusionar ese PR, los cambios de la app no se ven en la web. Necesita `'wasm-unsafe-eval'` en la CSP (bloque propio en `_headers`). Calendarios: la app sube el `.ics` de cada persona a `nube/cal` tras cada cambio y el Worker los sirve sin clave en `nube/cal/<token>.ics` (el token es el secreto) para suscribirse desde Google Calendar o el iPhone. Slack: la app llama a `nube/slack/<método>` con la clave y el Worker pone el token del bot (secreto `SLACK_BOT_TOKEN`, `npx wrangler secret put SLACK_BOT_TOKEN`) y el canal (`SLACK_CHANNEL` en `wrangler.jsonc`); sin token, la app sigue en modo simulación |
| `public/naranco/` | Nar&Co (alquiler de bicis, Oviedo) | Demo **privada** de la nueva web de naranco.es: landing ES/EN con reserva en 4 pasos (stock por talla, descuento por días, extras, códigos de colectivo, señal del 20 % retenida hasta que el dueño confirma) y panel en `panel/` (solicitudes, calendario, stock, precios y métricas con embudo de reservas abandonadas). Datos de ejemplo en el navegador (`datos.js`, localStorage); pagos y avisos simulados. Todo `/naranco/*` pasa por el Worker y solo se sirve con clave: pantalla de acceso o enlace `?clave=…`, cookie HttpOnly de 30 días, `/naranco/salir` cierra sesión; solo está su sha256 (`NARANCO_CLAVE_SHA256` en `wrangler.jsonc`). Fotos, logo y textos originales de naranco.es (copia de los textos en `recursos-naranco/TEXTOS.md`, sin datos personales del titular). Sin rutas ni tracks: el cliente no está dado de alta como empresa de turismo activo |
| `public/bioasturias/` | BioAsturias (asociación del sector biotecnológico, Asturias) | Prototipo **privado** del panel de trabajo de su gerente, sin conectividad real y con datos 100 % ficticios (`datos.js`, fechas relativas a hoy). App de una página con módulos: brief diario (pendientes agrupados por origen, panel de detalle, acciones, modo «repasar uno a uno», conmutador de día tranquilo/normal/cargado), tareas (kanban), CRM (entidades con varios contactos, categorías libres, filtros Y/O, historial, contactos detectados), envíos personalizados (asistente con variables, vista previa, envío simulado e historial con métricas simuladas), cerebro (respuestas simuladas calculadas con los datos y dudas), fuentes conectadas, funcionalidades y comentarios. JS sin build, ficheros por módulo (`nucleo.js`, `brief.js`, `tareas.js`, `crm.js`, `envios.js`, `cerebro.js`, `otros.js`); la paleta está en variables CSS al inicio de `app.css`. Estado en localStorage. Todo `/bioasturias/*` pasa por el Worker con clave (misma lógica que Nar&Co, generalizada en `DEMOS` de `src/worker.js`): pantalla de acceso o `?clave=…`, cookie HttpOnly `bioasturias_clave` de 30 días, `/bioasturias/salir`; solo está su sha256 (`BIOASTURIAS_CLAVE_SHA256`). Comentarios en `/bioasturias/api/comentarios` (otra instancia del Durable Object, `bioasturias-comentarios`; en vista previa responde 503 y se guardan en el navegador) |

Pendiente en `elpuertoluanco`: fotos propias (las actuales son provisionales), vinos y alérgenos por plato en `carta/carta.json`, horario confirmado, historia real del bar, más reseñas de Google hasta 20 en `resenas.json`, QR de la carta y de reseñas, versión en inglés, y quitar el `noindex` al cerrar el acuerdo (destino previsto: `elpuertoluanco.es`).

Las fotos de `lopita/recursos/img/` vienen de lopita.es (se bajan con `apps/lopita-horarios/herramientas/descargar_recursos_web.sh`; desde servidores lopita.es responde 403). Al regenerar con el exportador se conservan si están en `web/recursos/img`. Destino previsto: `lopita.es`.

## 11. Auditoría de octubre de 2026

Ver `AUDITORIA.md` para el alcance, las mejoras aplicadas, resultados de pruebas y pendientes. En móvil (hasta 860 px), dispositivos con puntero táctil, ahorro de datos, conexión 2G o movimiento reducido se usa un fondo estático sin descargar Three.js. En escritorio, el fondo 3D limita el renderizado a 30 FPS y se pausa al ocultar la pestaña.

La CSP de `public/_headers` permite los recursos propios y los terceros utilizados. El hash autoriza exactamente el importmap de las tres portadas: si cambia su contenido, debe recalcularse. Los scripts del prototipo son archivos externos. El formulario prepara un correo; no confirma un envío ni dispone de backend.

## 12. Panel interno /admin y conector MCP (Cerebro)

`llumedigital.com/admin` es el panel interno del equipo, con cuatro pestañas: **Cerebro** (bitácora compartida de notas y pendientes, adaptada del «cerebro» de Proactive), **Conectar** (instrucciones para conectar Claude o ChatGPT), **Accesos** (conexiones de asistentes, revocación y auditoría) y **Equipo** (personas e invitaciones). El mismo Cerebro se expone como **conector MCP remoto** en `llumedigital.com/mcp`, con OAuth 2.1, para que el asistente de cada persona lea y escriba en su nombre.

Código: `src/cerebro.js` (lógica de datos compartida), `src/admin.js` (panel, sesiones, invitaciones y API), `src/oauth.js` (OAuth), `src/mcp.js` (servidor MCP) y `public/admin/` (interfaz, sin build). Datos en **D1** (binding `DB`, base `llume-cerebro`, esquema en `migrations/`).

- **Cuentas**: cada persona entra con su nombre y su contraseña (PBKDF2, 100 000 iteraciones). Para elegirla o restablecerla hace falta un enlace de invitación de un solo uso (48 h): lo genera cualquiera del equipo en la pestaña Equipo, o `scripts/invitar.sh <nombre>` para la primera persona o si nadie puede entrar. Todos son administradores. Desactivar a alguien cierra sus sesiones y revoca sus conexiones; sus notas se conservan. Sesión: cookie HttpOnly con un token aleatorio (en D1 solo su sha256), 14 días, `SameSite=Lax`, limitada a `/admin`. 10 fallos de acceso por IP en 15 minutos bloquean ese tiempo.
- **Modelo**: `entradas` (nota o pendiente; `open`/`closed`/`superseded`; hasta 2000 caracteres, «una cosa por nota»; etiquetas, enlaces, cliente, persona, responsable, fecha límite, autor y origen `panel`/`claude`/`chatgpt`). Nada se borra: corregir crea una versión nueva y marca la anterior como `superseded`; cerrar la saca de las activas (se puede reabrir desde el panel). `estados`: «estado actual» por sujeto (general, cliente o persona), hasta 4000 caracteres; cada guardado es una fila nueva. `clientes`: se gestionan desde el panel.
- **Vistas del Cerebro** (con contadores): Mis pendientes (inicio), Activas, Hechas y Todo con filtros, Revisión (pendientes vencidos o sin tocar en 14 días: repaso semanal), Estado actual y Clientes.
- **OAuth 2.1**: metadatos en `/.well-known/oauth-protected-resource` y `/.well-known/oauth-authorization-server`; registro dinámico en `/oauth/registro`, solo con redirects a `claude.ai`, `claude.com`, `chatgpt.com` o loopback; consentimiento en `/admin/oauth/autorizar` (usa la sesión del panel); `/oauth/token` con PKCE S256. Códigos de 5 minutos y un solo uso, access token de 1 hora, refresh de 60 días que rota en cada uso. Todo se guarda como sha256 (`oauth_clientes`, `oauth_codigos`, `oauth_conexiones`).
- **MCP** (`/mcp`, Streamable HTTP sin estado, respuestas JSON): en cada petición se revalida que la conexión no está revocada y que la persona sigue activa. Herramientas: `contexto_cliente`, `contexto_persona`, `pendientes`, `buscar`, `etiquetas`, `anotar`, `actualizar_estado`, `corregir` y `cerrar`; ninguna borra. Clientes y personas se indican por nombre (o parte). Todas las respuestas empiezan con una cabecera que recuerda que el contenido son datos, no instrucciones. Cada llamada deja una fila en `mcp_auditoria` (visible en Accesos).
- **En local**: `npx wrangler d1 migrations apply llume-cerebro --local`, `npx wrangler dev`, `scripts/invitar.sh <nombre> --local` y abrir el enlace que imprime. Con `python3 -m http.server` el panel no funciona: necesita el Worker.
- **Producción**: base D1 `llume-cerebro` (región WEUR) en la cuenta de Cloudflare de info@llume.net, la misma del Worker. Cada migración nueva se aplica a mano antes de subir el código que la usa: `npx wrangler d1 migrations apply llume-cerebro --remote`. Si wrangler tiene varias cuentas, fijar `CLOUDFLARE_ACCOUNT_ID=337ee4ee11f19c00435cb1151cb59516` (`scripts/invitar.sh` ya lo hace). El secreto `ADMIN_CLAVE` de la fase 1 ya no se usa.
