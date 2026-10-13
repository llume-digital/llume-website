# llume · documentación técnica de la web

Web corporativa de una sola página, estática y sin paso de compilación. Todo el código vive en tres archivos.

## 1. Stack

| Capa | Tecnología |
|---|---|
| Marcado | HTML5 semántico, una sola página con navegación por anclas |
| Estilos | CSS3 puro (variables CSS, Grid, Flexbox, `@media`, `mask-image`, `backdrop-filter`) |
| Lógica | JavaScript ES modules, sin TypeScript ni bundler |
| 3D | **three.js 0.160** sobre WebGL, con shaders GLSL propios |
| Tipografía | Geist y Geist Mono (Google Fonts) |
| Servidor local | `python3 -m http.server` (solo para desarrollo) |
| Hosting | Cloudflare Workers con recursos estáticos (despliegue automático desde GitHub) |

No hay `package.json`, ni Node, ni framework, ni preprocesadores. Three.js se carga desde un CDN con un `importmap`:

```html
<script type="importmap">
  { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }
</script>
<script type="module" src="main.js"></script>
```

## 2. Estructura de archivos

```
llume-web/
├── CONTEXTO.md         Contexto de la empresa y decisiones de marca (no se publica)
├── TECNICO.md          Este documento (no se publica)
├── wrangler.jsonc      Configuración de despliegue en Cloudflare
└── public/             Lo único que se publica
    ├── index.html      Contenido y estructura (238 líneas)
    ├── styles.css      Todo el diseño (216 líneas)
    ├── main.js         Escena 3D, scroll, formulario (257 líneas)
    └── assets/         ≈ 660 KB
        ├── mark.svg    Logo (blanco), usado en cabecera y pie
        ├── favicon.svg Logo negro (blanco en modo oscuro del navegador)
        ├── cases/      5 JPG de los casos de éxito
        └── partners/   Logos de colaboradores (svg, png, webp)
```

## 3. HTML (`index.html`)

- Idioma `es`, `viewport` móvil, `theme-color` y favicon SVG.
- Orden de secciones dentro de `<main>`:

| id / clase | Sección |
|---|---|
| `.hero` | Portada: titular, llamada a la acción, 3 datos |
| `#servicios` | Soluciones: 4 tarjetas |
| `#casos` | Casos de éxito (problema / solución) |
| `#proceso` | Método en 4 pasos |
| `#nosotros` | Quiénes somos y 4 principios |
| `.partners` | Banner de logos "Confían en nosotros" |
| `#contacto` | Datos de contacto y formulario |

- `<canvas id="bg">` fijo detrás de todo y `.vignette` encima (oscurece los bordes).
- Los elementos con clase `.reveal` aparecen al hacer scroll.
- El banner duplica la lista de logos (`<ul class="track">` ×2); la copia lleva `aria-hidden` y `alt=""` para que los lectores de pantalla no la lean dos veces.

## 4. CSS (`styles.css`)

### Variables (`:root`)

```css
--bg: #07070a;   --text: #f4f1ec;   --muted: #9a958d;
--amber: #f2c08a;  --amber-deep: #b9753a;
--line: rgba(255,255,255,.09);  --panel: rgba(255,255,255,.035);
--radius: 16px;  --font: "Geist";  --mono: "Geist Mono";
```

### Bloques principales

- **Cabecera** fija; al pasar de 20 px de scroll gana fondo con `backdrop-filter: blur`.
- **Tarjetas** (`.card`, `.mini`, `.cx`) con borde sutil y brillo ámbar al pasar el ratón.
- **Casos** (`.cx`): rejilla de dos columnas (imagen 340 px + contenido). La imagen usa `contain: size` para no forzar la altura de la tarjeta.
- **Proceso** (`.steps`): lista con línea vertical en degradado y números como "estrellas" con halo.
- **Banner** (`.partners`): fondo negro, logos blancos con `filter: brightness(0) invert(1)`. Dos pistas idénticas animadas con `@keyframes marquee-right` (de `-100%` a `0`, 90 s, lineal e infinito). Se pausa con `:hover`.
- **Revelado**: `.reveal` empieza con `opacity:0; translateY(24px)` y `.in` la anima.

### Responsive

- `max-width: 1000px`: la rejilla de principios pasa a 2 columnas.
- `max-width: 860px`: todo a una columna, menú oculto, casos apilados, viñeta distinta.
- `prefers-reduced-motion`: desactiva animaciones, transiciones y el movimiento del banner.

## 5. JavaScript (`main.js`)

### 5.1 Interfaz

- `scroll` (pasivo) añade `.scrolled` a la cabecera.
- `IntersectionObserver` (umbral 0,12) añade `.in` a cada `.reveal` una sola vez.
- `isMobile = innerWidth < 860` reduce partículas y tamaño en móviles.

### 5.2 Escena 3D

Un solo `WebGLRenderer` (`alpha: true`, `antialias: false`, pixel ratio máximo 2) y una cámara en perspectiva (45°, z = 7; z = 9,5 en móvil).

| Objeto | Tipo | Cantidad | Qué hace |
|---|---|---|---|
| Estela ámbar | `Points` + `ShaderMaterial` | 55.000 (18.000 en móvil) | 7 hebras que fluyen por una curva; la posición se calcula **íntegramente en el vertex shader** |
| Cielo estrellado | `Points` + `ShaderMaterial` | 1.800 (700 en móvil) | Estrellas con parpadeo, azuladas y alguna cálida |
| Constelación | `LineSegments` + `Points` | 8 nodos, 7 líneas | Silueta tipo Osa Menor |
| Anillos orbitales | 3 × `Line` | 129 puntos cada uno | Círculos tenues alrededor de Polaris |
| Polaris | `Mesh` (`PlaneGeometry` 4×4) + shader | 1 | Núcleo, halo, cruz de rayos y rayos diagonales con pulso |

- Todo se mezcla con `AdditiveBlending` y `depthWrite: false` para que las luces se sumen.
- Las partículas se crean con atributos aleatorios (`aT`, `aS`, `aR`) y **posiciones vacías**; por eso `frustumCulled = false` (si no, three.js las descarta porque cree que están en el origen).
- `uTime` es un único uniform compartido por los tres shaders.

### 5.3 Animación (`frame`)

Cada fotograma:
1. Calcula el progreso de scroll (0 a 1) y lo suaviza (`+= (objetivo − actual) × 0.05`).
2. Suaviza la posición del ratón (`lerp 0.04`).
3. Actualiza uniforms (`uTime`, `uScroll`, `uMouse`).
4. Gira el grupo `sky` alrededor de Polaris (`t × 0.012 + scroll × 0.8`).
5. Mueve la cámara unos centímetros con el ratón (paralaje) y renderiza.

La estela cambia de lado y gira según el scroll: a la derecha en la portada, a la izquierda a mitad de página y de nuevo a la derecha al final.

### 5.4 Rendimiento y accesibilidad

- El bucle se detiene si la pestaña está oculta (`visibilitychange`) y se reanuda al volver.
- Con `prefers-reduced-motion` no hay bucle continuo: se dibuja un fotograma fijo y se repinta solo al hacer scroll.
- En `resize` se recalcula el tamaño del renderer, la cámara y la posición de Polaris.

### 5.5 Formulario

El `submit` se intercepta, se leen los campos con `FormData` y se abre `mailto:info@llume.net` con asunto y cuerpo ya redactados (`encodeURIComponent`). **No envía nada por sí solo**: el visitante tiene que enviar el correo desde su cliente.

## 6. Recursos

| Recurso | Formato | Notas |
|---|---|---|
| Logo | SVG | Redibujado a mano; dos paths `<path>` + `<use>` |
| Favicon | SVG | Negro, blanco con `prefers-color-scheme: dark` |
| Logos de colaboradores | SVG, PNG, WebP | Proactive Future es solo la versión blanca; el de Injuve es un SVG que contiene un PNG incrustado |
| Fotos de casos | JPG | De archivo (Pexels) o capturas de las webs reales (800×500) |

## 7. Cómo ejecutar

```bash
python3 -m http.server 8123 -d public
```

Abrir http://localhost:8123. Hace falta servidor HTTP: los módulos ES no cargan abriendo el `.html` directamente con `file://`. Si el navegador no refleja cambios, recargar a fondo (caché).

## 8. Despliegue

Cloudflare Workers (recursos estáticos) conectado al repo `llume26/llume-website`: cada push a `main` publica la web en llumedigital.com. Sin comando de build; el despliegue es `npx wrangler deploy`, que lee `wrangler.jsonc` y publica solo `public/`. Los `.md` de la raíz quedan en el repo pero no en la web.

## 9. Límites conocidos y deuda técnica

- **Dependencia de CDN:** three.js y las fuentes vienen de internet. Para producción, conviene alojar three.js en el propio dominio y fuentes en local (más rápido y sin avisos de privacidad por Google Fonts).
- **Formulario:** solo abre el correo. Para recibir mensajes directos hace falta un servicio de formularios o una función de servidor (por ejemplo, un Worker de Cloudflare). Implica enviar datos de visitantes a un tercero: decidir antes.
- **Newsletter del pie:** es solo visual, no guarda ningún email.
- **Legal:** los enlaces de Aviso legal, Privacidad y Cookies apuntan a `#`. Además, al usar Google Fonts, convendría banner de cookies o alojarlas en local.
- **CSS sobrante:** quedan reglas de versiones anteriores sin uso (`.cases`, `.case`, `.case-img`, `.img-a`/`.img-b`/`.img-c`, `.stack`, `.stack-label`). Se pueden borrar.
- **Imágenes sin optimizar:** los JPG de casos pesan 80–225 KB y no hay formatos modernos (WebP/AVIF) ni `srcset`. Las capturas son de 800×500 y se verán blandas en pantallas de alta densidad.
- **Logo de la Universidad de Oviedo:** 175×125 px, poca resolución.
- **SEO:** hay `title` y `description`, pero faltan Open Graph, `sitemap.xml`, `robots.txt` y datos estructurados.
- **Un solo idioma:** solo español, sin `hreflang`.
- **Sin pruebas automáticas:** se ha verificado a mano en el navegador integrado.
- **Compatibilidad:** requiere WebGL y navegadores con soporte de módulos ES e `importmap` (versiones recientes de Chrome, Edge, Safari y Firefox). Sin WebGL, la web se ve, pero sin fondo 3D (no hay mensaje de aviso; conviene manejarlo).

## 10. Si se migra a un framework

Con Node instalado, el camino natural es **Astro** (contenido estático) o **Next.js** (si habrá formularios con servidor, blog o varios idiomas), desplegado en Cloudflare. Piezas a conservar tal cual: `styles.css` (como CSS global), `main.js` (como módulo en el cliente) y los `assets/`. Habría que sustituir el `importmap` por `npm install three`.
