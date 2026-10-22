# llume · contexto de la empresa y de la web

> Nombre siempre en minúscula: **llume** (nunca "Llume" ni "LLUME"). Con punto en el logotipo: **llume.**

> Este documento conserva decisiones y descripciones de etapas anteriores. Para el estado técnico actual, consultar `TECNICO.md` y `AUDITORIA.md`.

## 1. Qué es llume

- Consultora que **soluciona problemas y automatiza procesos en otras empresas mediante agentes de IA**.
- Se adapta a cualquier tipo de trabajo que pueda interesar a una empresa, no solo a la automatización.
- Forma habitual de trabajar: **con Claude Code**.
- Está en fase de creación. Aún no hay casos de éxito reales publicados.
- Contacto: **info@llumedigital.com**.
- Ubicación que aparece en la web: Oviedo, Asturias (España). *Viene del mockup, pendiente de confirmar.*

## 2. El nombre y el concepto

- *llume* es una palabra asturiana: **la lumbre, la luz**.
- Idea de marca: la luz que guía, la estrella polar, una referencia fija cuando todo se mueve.
- Esto justifica mezclar la estética tecnológica/informática con una estética **estelar/espacial**.

## 3. Servicios (texto actual de la web)

1. **Automatización de procesos**: eliminar tareas repetitivas y optimizar flujos de trabajo.
2. **Agentes de IA personalizados**: agentes que trabajan 24/7 con los datos y reglas del cliente.
3. **Integración de herramientas**: conectar sistemas, datos y equipos.
4. **Consultoría estratégica**: identificar dónde la IA aporta valor real y dónde no.

Proceso en 4 pasos: **Entendemos → Diseñamos → Implementamos → Medimos**.

Tono de marca: **cercano, de tú a tú**, claro y sin jerga.

## 4. Colaboraciones (banner "Confían en nosotros:")

Logos en [assets/partners/](assets/partners/):

- Proactive Future (asociación) · `proactive-future.webp` (solo existe la versión blanca; en la web se muestra en negro)
- Injuve · `injuve.svg`
- Universidad de Oviedo · `uniovi.png` (versión pequeña, 175×125; convendría conseguir vectorial)
- Corradi · `corradi.svg` (viene de mapa.proactivefuture.eu)

El titular confirmó el 22 de octubre de 2026 que los logos, testimonios y resultados publicados están autorizados.

## 5. Identidad visual

- **Logo**: dos "l" en forma de hoja/ala, blanco sobre negro, con el texto `llume.` en minúscula. Redibujado en vectorial en `assets/mark.svg` (reconstrucción a ojo del PNG original; si hay SVG oficial, sustituirlo).
- **Favicon**: `assets/favicon.svg`, negro (blanco si el navegador está en modo oscuro).
- **Personalidad**: técnica, precisa, premium y minimalista.
- **Modo**: oscuro.
- **Color**: negro casi puro (`#07070a`), texto crema (`#f4f1ec`), acento **ámbar** (`#f2c08a`), toques azul pálido (`#bcc8ff`) para lo estelar.
- **Tipografía**: Geist (texto) y Geist Mono (etiquetas pequeñas). Provisional, se puede cambiar.
- **Movimiento**: inmersivo en 3D (WebGL con three.js).

### Referencias de diseño dadas

- Estructura y contenido: **secmotic.com** (hero → pilares → metodología → casos → productos → prueba social → CTA → footer).
- Estética: apple.com, stripe.com/es, vercel.com, figma.com, tesla.com, openai.com, anthropic.com, slack.com.
- Awwwards 2026 (Sites of the Month y Sites of the Day) como inspiración. Las más afines al sector: Cerebrium, Oryzo AI, Realevate.

## 6. La web: estado actual

Carpeta: `/Users/daniserra/Desktop/llume/llume claude`. Es una **web estática** (HTML + CSS + JS, three.js por CDN). No requiere instalar Node para verla.

| Archivo | Qué contiene |
|---|---|
| `index.html` | Página única con todas las secciones |
| `styles.css` | Estilos, tema oscuro, banner de logos, responsive |
| `main.js` | Escena 3D, animaciones al hacer scroll, formulario |
| `assets/` | Logo, favicon, logos de colaboradores |

**Secciones (en orden):** hero · banner de colaboraciones · servicios · casos · proceso · nosotros · contacto · footer.
Menú: Servicios, Casos, Proceso, Nosotros + botón "Hablemos".

**Escena 3D:** estela de partículas ámbar que sigue el scroll y el ratón; cielo estrellado con parpadeo; **Polaris** como estrella brillante fija arriba a la derecha; constelación tipo Osa Menor y anillos orbitales que giran despacio alrededor de ella. Respeta "reducir movimiento" y usa menos partículas en móvil.

**Banner de colaboraciones:** franja crema clara, logos en sus colores originales, se desplaza hacia la **derecha** y muy lento (90 s por vuelta), con la etiqueta "Confían en nosotros:". Se pausa al pasar el ratón.

**Formulario de contacto:** al enviar abre el cliente de correo del visitante con un mensaje ya redactado para **info@llumedigital.com**. No envía nada por sí solo.

### Para verla en local

```bash
cd "/Users/daniserra/Desktop/llume/llume claude" && python3 -m http.server 8123
```

Luego abrir http://localhost:8123.

## 7. Decisiones tomadas

- Sin sección de **blog** (se eliminó por no hacer falta).
- Nada de cifras o logos de clientes inventados: los casos están marcados como "ilustrativos".
- La palabra *llume* siempre en minúscula en cualquier texto de la web.

## 8. Pendientes

- [ ] Casos de éxito reales (ahora son ilustrativos) e imágenes reales o generadas.
- [ ] Páginas legales: aviso legal, privacidad, cookies (los enlaces del footer están vacíos).
- [ ] Envío directo del formulario a info@llumedigital.com: aplazado por decisión del titular; se mantiene el correo preparado en la aplicación del visitante.
- [ ] Confirmar ubicación (Oviedo). Los permisos de logos, testimonios y resultados publicados ya fueron confirmados.
- [ ] Logo oficial en vectorial y logos de mejor calidad (Universidad de Oviedo, Proactive Future a color).
- [ ] Newsletter del footer: ahora solo es visual, no guarda emails.
- [ ] Decidir idioma(s): ahora solo español. Se planteó español/inglés.
- [ ] Instalar Node y valorar migrar a Astro o Next.js.
- [ ] Publicar en Vercel con el dominio llume.net.
- [ ] Revisar tipografía, intensidad del 3D y textos con el equipo.

## 9. Línea de comunicación (feedback de amigos, oct 2026)

- **No decir "IA"** (o lo mínimo): el término está quemado y se asocia a vender humo. Alternativas: "transformación digital", "automatización", "tecnología de vanguardia", "solucionamos problemas". Hoy la web no contiene la palabra IA. Tampoco "Claude" ni "agentes".
- **Vender soluciones, no "un poco de todo"**: cuatro tipos de solución con un mismo método (automatización de procesos; integración y migración a la nube; plataformas y aplicaciones a medida; videoanálisis y seguridad laboral).
- **Casos de éxito con "El problema" / "La solución"** claros. Casos actuales: seguridad laboral con cámaras (PRL), presupuestos automáticos, base de datos de un banco a la nube, plataforma web de Proactive Future, Corradi. Textos redactados por claude a partir de lo contado: confirmar detalles. Las fotos de los tres primeros son de archivo (Pexels).
- **Referente de contenido: secmotic.com** (llume es su "secuela" en servicios, sin decirlo). Describimos igual que ellos: especialistas en digitalización, soluciones de extremo a extremo, metodología ágil y transparente, principios (innovación, tecnología de vanguardia, agilidad, cercanía). Textos propios, no copiados.
- **Banner de logos ("Confían en nosotros")**: abajo del todo (antes de Contacto), sobre fondo negro y con logos en blanco.
