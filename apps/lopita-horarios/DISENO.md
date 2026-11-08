# Diseño de la interfaz · Lopita Horarios

Guía para cualquier persona o agente que toque `app/static/`. Lopita Horarios es una herramienta interna: los encargados la usan en el ordenador para montar y retocar horarios, y el equipo la abre en el móvil para ver sus turnos. Cada pantalla tiene que parecer obvia, no vistosa.

Recoge lo más útil de los prompts y skills de diseño que comparte la comunidad (lista al final), adaptado a esta app. Si algo de aquí choca con una petición concreta, gana la petición y se señala el choque.

## 1. Identidad (no se cambia)

Los valores viven en las variables de `:root` de `app/static/styles.css`. Usa siempre la variable, nunca el valor suelto; si hace falta un valor nuevo, se crea como variable.

| Uso | Variable | Valor |
| --- | --- | --- |
| Acento (poco y con intención) | `--gold` / `--gold-soft` | `#B0904C` / `#F1E7D3` |
| Estados activos, títulos de sección | `--brown` / `--brown-dark` | `#764A09` / `#5C3906` |
| Texto | `--ink`, `--black`, `--muted` | `#2A2118`, `#17130F`, `#74685C` |
| Fondo de página y tarjetas | `--paper`, `--card` | `#FAF6F0`, `#FFFFFF` |
| Líneas | `--line`, `--line-strong` | `#E7DED1`, `#D6C9B6` |
| Estados | `--bad`, `--high`, `--warn`, `--ok` (+ `-soft`) | rojo, naranja, ámbar, verde |
| Puestos | `--cocina`, `--sala` (+ `-soft`) | `#8C4A2F`, `#3F5F7A` |
| Radio y sombra | `--radius`, `--shadow` | `12px`, sombra suave de dos capas |
| Texto de poco peso («libre», «libra») | `--faint` | `#786B5F` (4,6:1 sobre las tarjetas) |
| Anillo de foco | `--focus` | `--brown` sobre fondo claro; `--gold` en la barra negra |
| Movimiento | `--dur-fast`, `--dur`, `--ease` | `120ms`, `180ms`, sin rebote |

- **Tipografía**: `--display` (Oswald) en mayúsculas espaciadas solo para la marca, la navegación, los `h1`/`h2` y las cabeceras de días; `--text` (Raleway) para todo lo demás. No se añaden otras fuentes.
- El dorado es el único acento. Los colores de estado se reservan para estados reales (una alerta, un error, algo correcto), nunca para decorar.

## 2. Principios

1. **Claridad antes que decoración.** Si algo no ayuda a leer o a editar un horario, se quita. Ante la duda, se elimina en vez de añadir.
2. **Jerarquía con tamaño, peso y espacio**, no con color ni con bordes. Separadores o espacio entre elementos, no las dos cosas a la vez.
3. **Una acción principal por pantalla.** Las secundarias, discretas. Nada de varios botones compitiendo.
4. **Lo conocido gana a lo original.** Patrones que cualquiera reconoce (pestañas, listas, menú por casilla, hoja inferior en el móvil) antes que componentes inventados.
5. **La estructura es información.** Bordes, números, etiquetas y separadores solo cuando dicen algo del contenido (por ejemplo, numerar solo lo que de verdad es una secuencia).
6. **Espaciado en múltiplos de 4px** (4, 8, 12, 16, 24, 32, 48).
7. **Divulgación progresiva.** Lo de cada día a la vista; los ajustes avanzados, plegados o en su pestaña.

### Qué evitar

- Degradados, brillos, sombras fuertes, fondos con textura, desenfoques decorativos.
- Tarjetas dentro de tarjetas y el "kit SaaS": todo cortado en tarjetas iguales con la misma sombra.
- Iconos decorativos sobre cada título, etiquetas en mayúsculas encima de cada bloque (aparte de los títulos de la marca), flechas `→` añadidas a enlaces y botones.
- Animaciones de entrada en cada sección, efectos al pasar el ratón por todas las tarjetas.
- Colores nuevos sueltos o "parecidos" a los de la marca.

## 3. Movimiento

- Solo responde a una acción del usuario (abrir, desplegar, confirmar, guardar) y muestra qué ha cambiado.
- Dura menos de 200 ms, con curva suave y sin rebotes.
- Se animan `transform` y `opacity`; nunca propiedades de maquetación (`width`, `height`, `top`, `left`).
- Nunca `transition: all`: se listan las propiedades.
- Se respeta `prefers-reduced-motion` (sin animación o una versión reducida).

## 4. Funcionalidad y accesibilidad

**Móvil**
- Zonas táctiles de 44px como mínimo; si el elemento visible es más pequeño, se amplía su área.
- Los `input`, `select` y `textarea` necesitan 16px o más en el móvil para que el iPhone no haga zoom al enfocarlos.
- Nunca se desactiva el zoom del navegador.
- Se respetan las zonas seguras (`env(safe-area-inset-*)`) en barras fijas.
- Comprobar siempre a 390px (iPhone), 768px y 1280px.

**Datos**
- Horas, contadores y saldos con `font-variant-numeric: tabular-nums` para que las columnas no bailen.
- Fechas y horas con `Intl.DateTimeFormat` o `toLocale…` en `es-ES`, como hacen ya `fmtStamp` y `fmtFechaLarga` en `app.js`.
- Los textos largos (nombres, notas, motivos) no rompen la maquetación: se recortan con elipsis o pasan de línea.

**Estados**
- Las alertas y estados no dependen solo del color: llevan texto o un icono con etiqueta.
- Cada pantalla tiene estado vacío, de carga y de error, y siempre el siguiente paso claro. Una pantalla vacía es una invitación a actuar ("Añade la primera persona del equipo").
- Acciones destructivas (borrar, despublicar, restaurar versión): confirmación o una ventana para deshacer.
- Un botón que envía muestra que está trabajando y no se queda muerto.
- Errores de formulario junto al campo; al enviar, el foco va al primer error.
- Avisar antes de salir con cambios sin guardar.

**Teclado**
- Foco visible siempre (`:focus-visible`), nunca `outline: none` sin sustituto.
- Si algo parece pulsable, se puede pulsar; y se usan `button` y `a` de verdad, no `div` con `onclick`.
- Los botones solo con icono llevan `aria-label`.
- Contraste mínimo 4.5:1 para el texto; más contraste al pasar, pulsar o enfocar, no menos.

## 5. Textos

- Español llano, desde el punto de vista de quien lo usa: "Tu horario ha cambiado", no "Se ha actualizado la asignación".
- El botón dice exactamente lo que hace ("Publicar horario", no "Enviar") y el aviso usa la misma palabra ("Horario publicado").
- Los errores dicen qué ha pasado y cómo arreglarlo, sin disculpas ni vaguedades.
- Frases en minúscula salvo los títulos de la marca, sin relleno.

## 6. Cómo trabajar un cambio de interfaz

1. **Criticar antes de tocar.** Lista los 5 problemas de más impacto de la pantalla para la persona que la usa (encargado o trabajador) y para qué la usa. No cambies código hasta acordar cuáles se arreglan.
2. **Una capa cada vez**: jerarquía y maquetación, después tipografía, después color, después componentes y, por último, movimiento.
3. **Si la maquetación no convence**, propone dos alternativas con sus pros y contras en vez de retocar al azar.
4. **Mirar el resultado.** Haz capturas con Playwright a 390px y a 1280px y revísalas antes de dar el trabajo por terminado. `tests/test_pantallas_navegador.py` recorre todas las pantallas a esos dos anchos y `tests/test_accesibilidad_navegador.py` las pasa por axe (WCAG 2.2 AA): una pantalla nueva se añade a sus listas de rutas. Antes de cerrar, quita un elemento que sobre.

## 7. Pendiente conocido

Cosas de esta guía que la interfaz aún no cumple (revisado el 08/11/2026):

- Lo que axe encuentra todavía está en `EXCEPCIONES` de `tests/test_accesibilidad_navegador.py`, con la propuesta que lo arregla.

## Fuentes

Resumen y texto original de cada una en el documento *Prompts para un diseño web sencillo y funcional* del proyecto.

- [anthropics/skills · frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md): contención, tics de diseño generado, textos y autocrítica con capturas.
- [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines): reglas de móvil, formularios, estados, movimiento y accesibilidad.
- [heyman333/atelier-ui · apple-ui-designer](https://github.com/heyman333/atelier-ui): "nativo, sutil, que parezca obvio"; jerarquía por tamaño y peso; quitar antes que añadir.
- [aiskillstore/marketplace · apple-ui-design](https://github.com/aiskillstore/marketplace): ritmo de espaciado, una acción principal, divulgación progresiva.
- [ChatPRD · refinar una interfaz con principios de diseño](https://www.chatprd.ai/how-i-ai/workflows/how-to-iteratively-refine-an-ai-generated-ui-using-design-principles-in-cursor): criticar primero y cambiar una capa cada vez.
- Hilos de r/ClaudeAI sobre diseño con Claude Code: revisar con capturas, colores en hexadecimal y un sistema de diseño fijo.
