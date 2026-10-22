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

"Nosotros" tiene página propia: `/nosotros`, `/en/about` y `/pt/sobre-nos`. Formación completa en `/formacion` (`/en/training`, `/pt/formacao`) y preguntas frecuentes en `/preguntas` (`/en/faq`, `/pt/perguntas`), generadas con `scripts/build_pages.py`.

### Casos de éxito

Cada caso es un `<article class="cx" data-case="…">` con su imagen (`.cx-media`), el resumen y un `<template class="cx-detail">` con la ficha completa. `ui.js` clona la imagen y la ficha en el diálogo. Cada caso tiene enlace directo: `llumedigital.com/#caso-clevercar`.

Variantes de imagen: `media-device` (captura real en navegador + móvil), `media-crm` (maqueta del CRM de Clevercar), `media-cam` (cajas de detección), `media-doc` (presupuesto generado) y `media-cloud` (diagrama de migración).

Cada caso incluye un bloque "Antes / Después" (`.ba`) al principio de la ficha.

Para añadir o cambiar un caso: editar el `<article class="cx">` en las tres portadas y ejecutar `python3 scripts/build_cases.py`, que regenera las páginas `/casos/<id>`, `/en/cases/<id>` y `/pt/casos/<id>`. Después, añadirlas a `sitemap.xml` si son nuevas.

## 4. Formulario

Debajo lleva la primera capa de información de protección de datos (responsable, finalidad, legitimación, destinatarios y derechos). Pide qué necesita y un teléfono para llamarle (empresa y email opcionales). Abre el programa de correo del visitante con el mensaje preparado para `info@llumedigital.com`. Los textos del asunto y del cuerpo salen de los `data-*` del `<form>`, así el mismo `ui.js` sirve para los dos idiomas. Exige aceptar la política de privacidad.

## 5. Cómo ejecutar en local

```bash
python3 -m http.server 8123 -d public
```

Abrir http://localhost:8123. Las rutas son absolutas (`/styles.css`), así que hay que servir `public/` como raíz.

## 6. Despliegue

Cloudflare Workers conectado a `llume26/llume-website`: cada push a `main` publica en llumedigital.com (`npx wrangler deploy`, que lee `wrangler.jsonc` y publica solo `public/`). Las rutas sin extensión (`/privacidad`) las resuelve Cloudflare con el `.html` correspondiente.

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
- Datos estructurados: en las portadas, un `@graph` con `WebSite`, `ProfessionalService` (con el catálogo de servicios sacado de las tarjetas de Soluciones) y `FAQPage` (sacado de las propias preguntas de la página). En casos, `Article` y `BreadcrumbList`.
- `sitemap.xml` con todas las URLs y sus alternativas por idioma; `llms.txt` para asistentes de IA.
- Enlazado interno entre portadas, servicios, preguntas frecuentes y páginas de casos.
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

Pendiente en `elpuertoluanco`: fotos propias (las actuales son provisionales), vinos y alérgenos por plato en `carta/carta.json`, horario confirmado, historia real del bar, más reseñas de Google hasta 20 en `resenas.json`, QR de la carta y de reseñas, versión en inglés, y quitar el `noindex` al cerrar el acuerdo (destino previsto: `elpuertoluanco.es`).

## 11. Auditoría de octubre de 2026

Ver `AUDITORIA.md` para el alcance, las mejoras aplicadas, resultados de pruebas y pendientes. En móvil (hasta 860 px), dispositivos con puntero táctil, ahorro de datos, conexión 2G o movimiento reducido se usa un fondo estático sin descargar Three.js. En escritorio, el fondo 3D limita el renderizado a 30 FPS y se pausa al ocultar la pestaña.

La CSP de `public/_headers` permite los recursos propios y los terceros utilizados. El hash autoriza exactamente el importmap de las tres portadas: si cambia su contenido, debe recalcularse. Los scripts del prototipo son archivos externos. El formulario prepara un correo; no confirma un envío ni dispone de backend.
