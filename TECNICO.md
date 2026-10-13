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

No hay `package.json` ni dependencias externas en tiempo de ejecución: todo se sirve desde el propio dominio, así que la web no instala cookies ni conecta con terceros.

## 2. Estructura de archivos

```
llume-web/
├── CONTEXTO.md          Contexto de la empresa y decisiones de marca (no se publica)
├── TECNICO.md           Este documento (no se publica)
├── wrangler.jsonc       Configuración de despliegue en Cloudflare
├── scripts/build_cases.py  Genera las páginas de cada caso a partir de las portadas
├── scripts/build_legal.py  Genera las páginas legales en los tres idiomas (datos del titular arriba del todo)
├── scripts/build_blog.py   Genera el blog (español): artículos en la lista POSTS
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
    ├── blog/            Blog en español (generado)
    ├── robots.txt, sitemap.xml, llms.txt
    ├── _headers         Cabeceras de seguridad y caché
    └── assets/
        ├── mark.svg, favicon.svg, og.png (imagen al compartir en redes)
        ├── cases/       Capturas y fotos de los casos (WebP)
        └── partners/    Logos de clientes y colaboradores
```

## 3. Secciones de la página

La portada se ha recortado a 9 bloques:

| id / clase | Sección |
|---|---|
| `.hero` | Titular, frase rotatoria, llamada a la acción y franja de logos "Han confiado en nosotros" |
| `#servicios` | 4 soluciones en tarjetas compactas, con las frases de presentación de llume |
| `#retos` | "¿Qué te frena?": pestañas por problema, cada una con el sector donde ya se resolvió y su caso |
| `#casos` | 3 casos destacados; el botón "Ver los otros 3 casos" despliega el resto (`.cx-extra`) |
| `#calculadora` | Calculadora del coste de las tareas repetitivas |
| `#proceso` | Método en 4 pasos, tabla comparativa (llume vs software genérico vs agencia), compromisos (`.badges.compact`) y las dos filas de logos de integraciones |
| `#modelos` | Camino en 3 pasos (`.journey`): 1 diagnóstico (siempre), 2 proyecto cerrado o acompañamiento continuo, 3 mantenimiento opcional; cada tarjeta dice cómo se paga. Debajo, la nota de ayudas |
| `#faq` | Preguntas frecuentes (`<details>`), también como datos estructurados `FAQPage` |
| `#contacto` | "¿Qué pasa en la primera llamada?", formulario de llamada y primera capa de protección de datos |

"Nosotros" tiene página propia: `/nosotros`, `/en/about` y `/pt/sobre-nos`.

### Casos de éxito

Cada caso es un `<article class="cx" data-case="…">` con su imagen (`.cx-media`), el resumen y un `<template class="cx-detail">` con la ficha completa. `ui.js` clona la imagen y la ficha en el diálogo. Cada caso tiene enlace directo: `llumedigital.com/#caso-clevercar`.

Variantes de imagen: `media-device` (captura real en navegador + móvil), `media-crm` (maqueta del CRM de Clevercar), `media-cam` (cajas de detección), `media-doc` (presupuesto generado) y `media-cloud` (diagrama de migración).

Cada caso incluye un bloque "Antes / Después" (`.ba`) al principio de la ficha.

Para añadir o cambiar un caso: editar el `<article class="cx">` en las tres portadas y ejecutar `python3 scripts/build_cases.py`, que regenera las páginas `/casos/<id>`, `/en/cases/<id>` y `/pt/casos/<id>`. Después, añadirlas a `sitemap.xml` si son nuevas.

## 4. Formulario

Debajo lleva la primera capa de información de protección de datos (responsable, finalidad, legitimación, destinatarios y derechos). Pide qué necesita y un teléfono para llamarle (empresa y email opcionales). Abre el programa de correo del visitante con el mensaje preparado para `info@llume.net`. Los textos del asunto y del cuerpo salen de los `data-*` del `<form>`, así el mismo `ui.js` sirve para los dos idiomas. Exige aceptar la política de privacidad.

## 5. Cómo ejecutar en local

```bash
python3 -m http.server 8123 -d public
```

Abrir http://localhost:8123. Las rutas son absolutas (`/styles.css`), así que hay que servir `public/` como raíz.

## 6. Despliegue

Cloudflare Workers conectado a `llume26/llume-website`: cada push a `main` publica en llumedigital.com (`npx wrangler deploy`, que lee `wrangler.jsonc` y publica solo `public/`). Las rutas sin extensión (`/privacidad`) las resuelve Cloudflare con el `.html` correspondiente.

## 7. Pendiente

- **Datos legales**: cuando la empresa esté constituida, rellenar `OWNER` en `scripts/build_legal.py` (NIF, domicilio, registro) y ejecutarlo. Hoy solo figura el nombre y el email.
- **Envío real del formulario** sin abrir el correo (un Worker con envío de email) y **agenda** para reservar la reunión.
- **Correo @llumedigital.com** y cambiarlo en la web cuando funcione.
- **Equipo con fotos, testimonios reales y cifras de resultados** de cada caso, cuando existan.
- **Teléfono, LinkedIn y perfil de Google Business**.
- **Precio del diagnóstico digital** y confirmar que se puede ofrecer la garantía.
- **Alta como agente digitalizador / asesor** si se quiere afirmar que los proyectos se pueden pagar con el Kit Digital o el Kit Consulting (hoy la web solo ofrece ayudar a comprobarlo).
- **Logos en mejor calidad**: Universidad de Oviedo (175×125) y Proactive Future a color.

## 8. Configuración de Cloudflare

- **Always Use HTTPS** activado: `http://` redirige a `https://`.
- **Regla de redirección** `www.llumedigital.com/*` → `llumedigital.com/*` (301).
- **Web Analytics** (sin cookies) con instalación automática; los datos se ven en Cloudflare → Web analytics.

## 9. SEO

- Títulos con la palabra clave al principio, `meta robots` con vista previa grande de imágenes, `canonical` y `hreflang` en todas las páginas.
- Datos estructurados: en las portadas, un `@graph` con `WebSite`, `ProfessionalService` (con el catálogo de servicios sacado de las tarjetas de Soluciones) y `FAQPage` (sacado de las propias preguntas de la página). En casos y blog, `Article`/`BlogPosting` y `BreadcrumbList`.
- `sitemap.xml` con todas las URLs y sus alternativas por idioma; `llms.txt` para asistentes de IA.
- Enlazado interno: casos ↔ artículos del blog relacionados.
- Pendiente (necesita la cuenta de Google): dar de alta el dominio en Google Search Console y enviar el sitemap.
