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
└── public/              Lo único que se publica
    ├── index.html       Página en español
    ├── en/index.html    Página en inglés (misma estructura)
    ├── pt/index.html    Página en portugués (misma estructura)
    ├── casos/, en/cases/, pt/casos/   Una página por caso (generadas, ver abajo)
    ├── aviso-legal.html, privacidad.html, cookies.html
    ├── styles.css       Todo el diseño, incluidas las páginas legales
    ├── ui.js            Interfaz: menú, scroll, pestañas, contadores, casos, formulario
    ├── main.js          Solo la escena 3D (si no hay WebGL, se queda un fondo estático)
    ├── vendor/three.module.min.js
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
| `#retos` | "¿Qué te frena?": pestañas por problema (no por sector), cada una con el sector donde ya se resolvió y su caso |
| `#casos` | 6 casos con problema y solución; al pulsar se abre la ficha completa en un `<dialog>` |
| `.figures` | Cifras con contador animado |
| `#calculadora` | Calculadora del coste de las tareas repetitivas |
| `#proceso` | Método en 4 pasos con su compromiso de plazos |
| `.integrations` | Cinta con las herramientas con las que nos integramos |
| `#modelos` | Diagnóstico digital (primer paso con garantía y nota sobre ayudas) y tres modelos de colaboración |
| `.commitments` | Compromisos: código del cliente, NDA, RGPD, software libre, precio cerrado, soporte |
| `#nosotros` | Quiénes somos, principios y misión |
| `#faq` | Preguntas frecuentes (`<details>`), también como datos estructurados `FAQPage` |
| `#contacto` | Reunión de 30 minutos y formulario |

### Casos de éxito

Cada caso es un `<article class="cx" data-case="…">` con su imagen (`.cx-media`), el resumen y un `<template class="cx-detail">` con la ficha completa. `ui.js` clona la imagen y la ficha en el diálogo. Cada caso tiene enlace directo: `llumedigital.com/#caso-clevercar`.

Variantes de imagen: `media-device` (captura real en navegador + móvil), `media-crm` (maqueta del CRM de Clevercar), `media-cam` (cajas de detección), `media-doc` (presupuesto generado) y `media-cloud` (diagrama de migración).

Cada caso incluye un bloque "Antes / Después" (`.ba`) al principio de la ficha.

Para añadir o cambiar un caso: editar el `<article class="cx">` en las tres portadas y ejecutar `python3 scripts/build_cases.py`, que regenera las páginas `/casos/<id>`, `/en/cases/<id>` y `/pt/casos/<id>`. Después, añadirlas a `sitemap.xml` si son nuevas.

## 4. Formulario

Pide qué necesita y un teléfono para llamarle (empresa y email opcionales). Abre el programa de correo del visitante con el mensaje preparado para `info@llume.net`. Los textos del asunto y del cuerpo salen de los `data-*` del `<form>`, así el mismo `ui.js` sirve para los dos idiomas. Exige aceptar la política de privacidad.

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
- **Páginas legales en inglés y portugués** (ahora enlazan a las españolas).
- **Precio del diagnóstico digital** y confirmar que se puede ofrecer la garantía.
- **Alta como agente digitalizador / asesor** si se quiere afirmar que los proyectos se pueden pagar con el Kit Digital o el Kit Consulting (hoy la web solo ofrece ayudar a comprobarlo).
- **Logos en mejor calidad**: Universidad de Oviedo (175×125) y Proactive Future a color.

## 8. Configuración de Cloudflare

- **Always Use HTTPS** activado: `http://` redirige a `https://`.
- **Regla de redirección** `www.llumedigital.com/*` → `llumedigital.com/*` (301).
