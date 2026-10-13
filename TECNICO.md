# llume · documentación técnica de la web

Web corporativa estática, sin paso de compilación. Bilingüe (español en `/`, inglés en `/en/`) y con páginas legales.

## 1. Stack

| Capa | Tecnología |
|---|---|
| Marcado | HTML5 semántico, una página por idioma con navegación por anclas |
| Estilos | CSS3 puro (variables, Grid, Flexbox, `@media`, `mask-image`, `backdrop-filter`) |
| Lógica | JavaScript ES modules, sin TypeScript ni bundler |
| 3D | **three.js 0.160** (alojado en `public/vendor/`) con shaders GLSL propios |
| Tipografía | Geist y Geist Mono variables, alojadas en `public/fonts/` (sin Google Fonts) |
| Hosting | Cloudflare Workers con recursos estáticos, despliegue automático desde GitHub |

No hay `package.json` ni dependencias externas en tiempo de ejecución: todo se sirve desde el propio dominio, así que la web no instala cookies ni conecta con terceros.

## 2. Estructura de archivos

```
llume-web/
├── CONTEXTO.md          Contexto de la empresa y decisiones de marca (no se publica)
├── TECNICO.md           Este documento (no se publica)
├── wrangler.jsonc       Configuración de despliegue en Cloudflare
└── public/              Lo único que se publica
    ├── index.html       Página en español
    ├── en/index.html    Página en inglés (misma estructura)
    ├── aviso-legal.html, privacidad.html, cookies.html
    ├── styles.css       Todo el diseño, incluidas las páginas legales
    ├── ui.js            Interfaz: menú, scroll, pestañas, contadores, casos, formulario
    ├── main.js          Solo la escena 3D (si no hay WebGL, se queda un fondo estático)
    ├── vendor/three.module.js
    ├── fonts/           geist.woff2, geist-mono.woff2
    ├── robots.txt, sitemap.xml
    ├── _headers         Cabeceras de seguridad y caché
    └── assets/
        ├── mark.svg, favicon.svg, og.png (imagen al compartir en redes)
        ├── cases/       Capturas y fotos de los casos (WebP)
        └── partners/    Logos de clientes y colaboradores
```

## 3. Secciones de la página

| id / clase | Sección |
|---|---|
| `.hero` | Titular, frase rotatoria, llamada a la acción y franja de logos "Han confiado en nosotros" |
| `.problem` | "Tu empresa ha cambiado. Tus herramientas, no.": 3 problemas y declaración de llume |
| `#servicios` | 4 soluciones, cada una con ejemplos y enlace a su caso |
| `#sectores` | Pestañas por sector (accesibles con teclado), cada una enlazada a un caso |
| `#casos` | 6 casos con problema y solución; al pulsar se abre la ficha completa en un `<dialog>` |
| `.figures` | Cifras con contador animado |
| `#proceso` | Método en 4 pasos con su compromiso de plazos |
| `.integrations` | Cinta con las herramientas con las que nos integramos |
| `#modelos` | Tres modelos de colaboración |
| `.commitments` | Compromisos: código del cliente, NDA, RGPD, software libre, precio cerrado, soporte |
| `#nosotros` | Quiénes somos, principios y misión |
| `#faq` | Preguntas frecuentes (`<details>`), también como datos estructurados `FAQPage` |
| `#contacto` | Reunión de 30 minutos y formulario |

### Casos de éxito

Cada caso es un `<article class="cx" data-case="…">` con su imagen (`.cx-media`), el resumen y un `<template class="cx-detail">` con la ficha completa. `ui.js` clona la imagen y la ficha en el diálogo. Cada caso tiene enlace directo: `llumedigital.com/#caso-clevercar`.

Variantes de imagen: `media-device` (captura real en navegador + móvil), `media-crm` (maqueta del CRM de Clevercar), `media-cam` (cajas de detección), `media-doc` (presupuesto generado) y `media-cloud` (diagrama de migración).

Para añadir un caso: copiar un `<article class="cx">`, cambiar `id`, `data-case` y contenidos, y repetirlo en `/en/`.

## 4. Formulario

Abre el programa de correo del visitante con el mensaje preparado para `info@llume.net`. Los textos del asunto y del cuerpo salen de los `data-*` del `<form>`, así el mismo `ui.js` sirve para los dos idiomas. Exige aceptar la política de privacidad.

## 5. Cómo ejecutar en local

```bash
python3 -m http.server 8123 -d public
```

Abrir http://localhost:8123. Las rutas son absolutas (`/styles.css`), así que hay que servir `public/` como raíz.

## 6. Despliegue

Cloudflare Workers conectado a `llume26/llume-website`: cada push a `main` publica en llumedigital.com (`npx wrangler deploy`, que lee `wrangler.jsonc` y publica solo `public/`). Las rutas sin extensión (`/privacidad`) las resuelve Cloudflare con el `.html` correspondiente.

## 7. Pendiente

- **Datos legales**: NIF y datos registrales en el aviso legal (ahora "en tramitación").
- **Envío real del formulario** sin abrir el correo (un Worker con envío de email) y **agenda** para reservar la reunión.
- **Correo @llumedigital.com** y cambiarlo en la web cuando funcione.
- **Equipo con fotos, testimonios reales y cifras de resultados** de cada caso, cuando existan.
- **Teléfono, LinkedIn y perfil de Google Business**.
- **Páginas legales en inglés** (ahora el inglés enlaza a las españolas).
- **Redirección de www a la raíz** (regla en Cloudflare).
- **Logos en mejor calidad**: Universidad de Oviedo (175×125) y Proactive Future a color.
