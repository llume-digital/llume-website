# Auditoría de llume — 17 de octubre de 2026

Auditoría realizada con tres agentes especializados (contenido/SEO, usabilidad/diseño y rendimiento/seguridad) y revisión integrada con navegador. Cambios aplicados al repositorio local; no se ha publicado ni hecho push.

## Diagnóstico

La identidad visual es consistente: tipografía, fondo oscuro y acento ámbar funcionan bien y las páginas tienen una estructura coherente. Los mayores problemas estaban en la interacción por teclado, el coste del fondo decorativo, la claridad del formulario y la credibilidad de algunas afirmaciones. Se ha conservado la identidad y corregido esas fricciones.

No debe confundirse esta revisión con una certificación de accesibilidad, una auditoría jurídica o un pentest de la infraestructura. Se revisa el código disponible y su ejecución local; no se dispone de la cuenta de hosting, datos de conversión ni evidencia documental de resultados comerciales.

## Cambios aplicados

| Área | Problema | Mejora |
|---|---|---|
| Móvil y carga | El fondo descargaba Three.js y consumía GPU incluso en experiencias limitadas | Fondo estático ámbar/lavanda en pantallas hasta 860 px, puntero táctil, movimiento reducido, ahorro de datos o conexión 2G; evita descargar el motor de unos 670 KB sin comprimir |
| Escritorio | Renderizado continuo al ritmo de pantallas de alta frecuencia | Límite de 30 FPS, menor resolución del canvas, preferencia de bajo consumo y pausa al ocultar la pestaña |
| Resiliencia | Fallo de WebGL lanzaba una excepción | Fondo alternativo y tratamiento de pérdida/restauración de contexto |
| Navegación | Enlaces del menú cerrado y CTA invisible recibían foco | Ocultación accesible, foco al abrir, Escape, devolución del foco y cierre al salir |
| Accesibilidad | Páginas secundarias sin salto al contenido | Enlace de salto y destino enfocable en las 43 páginas secundarias corporativas |
| Formularios | Foco poco visible, texto pequeño y apariencia de envío real | Foco visible, entradas de 16 px, mejor contraste y mensaje explícito de preparación de correo |
| Contacto | No existe envío al servidor | Botón, explicación y estado describen el funcionamiento real, con correo alternativo visible |
| Diseño adaptable | Controles pequeños, diálogo limitado por altura y frases estrechas | Objetivos táctiles mayores, altura dinámica del diálogo, bloqueo de fondo y ajuste del texto |
| JavaScript | Animaciones de entrada ocultaban contenido si fallaba JS | Contenido visible por defecto; navegación básica disponible sin JS |
| SEO y semántica | Breadcrumbs ingleses en otros idiomas; metadatos incompletos | Localización de 21 casos, metadatos de Nosotros, títulos semánticos del footer y enlaces descriptivos |
| Texto | Comparativa generalizaba sobre competidores | Redacción que reconoce que condiciones y soporte dependen del proveedor y contrato |
| Privacidad | Documentación sugería que no había conexiones externas | Explicación de carga y envío de estadísticas de Cloudflare en privacidad/cookies y documentación |
| Seguridad | Ausencia de CSP | Política que restringe scripts y recursos, bloquea handlers inline/eval y permite únicamente los terceros usados; hash para importmap |
| Prototipo | Contenido JSON del repositorio insertado sin escapar (endurecimiento preventivo, sin explotación remota demostrada) | Escape del contenido antes de construir HTML y scripts externos compatibles con CSP |
| Carta | Los platos sin datos podían pasar filtros de alérgenos | Exclusión de platos con información desconocida de los resultados filtrados; mensajes de error de carga |
| Prototipo | Carrusel duplicaba reseñas y WhatsApp no confirmado | Lista horizontal manual, selección/fecha transparentes y enlace de llamada |

Los cambios en páginas generadas también se han aplicado a sus scripts fuente.

## Revisión por sección y tipo de página

| Sección | Evaluación y siguiente mejora |
|---|---|
| Cabecera/idiomas | Menú, foco y cierre corregidos. Mantiene acceso a formación, equipo, FAQ y contacto |
| Hero | Jerarquía visual clara; conserva titular y propuesta. Fondo ligero móvil mejora legibilidad y consumo |
| Soluciones | Tarjetas y diálogos permiten ampliar sin sobrecargar. Las etiquetas técnicas deben apoyar ejemplos comprensibles para compradores no técnicos |
| Retos | Pestañas con teclado completo. Mantener relación directa entre problema y caso verificable |
| Casos | Páginas propias e idiomas consistentes. Prioridad editorial: distinguir experiencia del equipo de trabajos contratados a llume y acreditar cifras/resultados |
| Calculadora | Modelo orientativo basado en 46 semanas; no representa ahorro garantizado ni descuenta implantación/mantenimiento. Conviene contrastarlo con cada cliente |
| Proceso y comparativa | Comparativa matizada. Falta confirmar precio, alcance y condiciones de la garantía del diagnóstico |
| Formación | Programa específico y páginas en tres idiomas. Para convertir mejor, añadir quién imparte, destinatario y ejemplo de entregable reales |
| Nosotros | Metadatos e inglés mejorados. Sigue faltando identidad de personas, funciones, trayectoria y fotografías autorizadas |
| FAQ | Páginas enlazadas y generadas. Las respuestas comerciales deben mantenerse alineadas con contratos reales |
| Blog | Eliminado por petición: se retiraron páginas, enlaces, estilos, generador y URLs del sitemap |
| Contacto | Ahora explica fielmente el mailto. Un backend de envío y una agenda reducirían abandono; requieren elegir y configurar servicio y destinatario |
| Footer y legales | Semántica, saltos y textos de estadísticas corregidos. Faltan datos reales del titular en OWNER |
| El Puerto | Se mantiene como prototipo no indexable. Fotos, horario, carta/alérgenos e historia necesitan validación del negocio antes de considerarlo definitivo |

## Pendientes que requieren información real

1. Completar identidad del titular, domicilio e identificación fiscal en `scripts/build_legal.py` y regenerar. No se han inventado datos.
2. Confirmar permiso de logos, testimonios, resultados cuantificados, alcance de la garantía y condiciones de propiedad del código.
3. Identificar equipo y responsables, con material autorizado.
4. Configurar envío real y, si interesa, agenda: el formulario actual necesita que el visitante envíe el correo desde su aplicación.
5. Validar con El Puerto carta, alérgenos, fotografías y horario. El filtro no sustituye información confirmada por el establecimiento.
6. Revisar producción tras publicar: cabeceras efectivas de Cloudflare, HTTPS, compresión, caché y mediciones de usuarios reales. La conexión HTTPS externa desde este entorno encontró un certificado no verificable; esto por sí solo no demuestra un defecto del dominio.

## Evidencia y límites

- 46 páginas corporativas y 2 páginas del prototipo incluidas en el alcance.
- Revisión estática de 1.523 referencias internas, incluidos href/src/srcset: sin rutas/anclas rotas. 34 bloques JSON-LD válidos, un H1 y canonical por página corporativa, sin IDs duplicados. Sitemap concordante con las 46 páginas corporativas.
- Cuatro generadores ejecutados correctamente; comprobaciones de sintaxis JS y diferencias sin errores de formato.
- Chrome/Playwright: menú, foco, Escape, selector de idioma, Home/End en pestañas, contenido sin JavaScript y ausencia de descarga 3D con movimiento reducido comprobados.
- CSP servida localmente como cabecera: sin eventos de infracción en las tres portadas y las dos páginas del prototipo. No equivale a comprobar la cabecera de producción.
- Las pruebas de tamaños usan emulación de navegador; no sustituyen dispositivos físicos, VoiceOver/TalkBack ni Safari real.
- Los números Lighthouse locales son orientativos: servidor sin compresión/CDN y máquina con otras aplicaciones activas. No se atribuyen a producción ni se presentan como Core Web Vitals de usuarios reales.

## Resultados finales de navegador

- 144 visitas: 48 páginas a 390, 768 y 1440 px, todas con HTTP 200, sin desbordamiento horizontal ni excepciones JavaScript. Las imágenes diferidas que no han entrado en pantalla no se contabilizan como enlaces rotos.
- Axe a 390 px detectó inicialmente nombre ARIA del rotador y tres colores de contraste insuficiente en las maquetas. Corregidos y repetidos los siete tipos de página afectados: cero infracciones detectadas. Esto no certifica WCAG; algunas comprobaciones necesitan revisión humana.
- Prototipo adicional a 320, 390, 768 y 1440 px: sin desbordamiento ni errores JS. 17 reseñas y 39 platos cargados. Pruebas con contenido JSON hostil y alérgenos desconocidos superadas. Iframe externo excluido del análisis Axe del prototipo.
- Lighthouse móvil local final: **rendimiento 86, accesibilidad 100, buenas prácticas 96 y SEO 100**. FCP 2,4 s; LCP 3,4 s; bloqueo total 180 ms; CLS 0. La puntuación de buenas prácticas se ve afectada por errores CORS de Cloudflare Analytics sobre localhost. No se ha desactivado Analytics para mejorar artificialmente la puntuación.
- La medición inicial se tomó durante el arranque de cambios y con más navegadores activos: no se usa como comparación controlada antes/después.

Evidencia resumida en `audit/2026-10-17/`: `results.json` es el barrido inicial, `recheck.json` comprueba las correcciones posteriores; los demás JSON recogen CSP, prototipo y Lighthouse. Las pruebas se ejecutaron con Chrome instalado, Playwright y axe-core en un directorio temporal, sin añadir dependencias de ejecución a la web.

## Cambios posteriores

Se eliminó el blog por petición posterior. Las páginas «Nosotros» y «Preguntas frecuentes» se reescribieron en español, inglés y portugués para explicar mejor los servicios y el proceso, y para precisar alcance, plazos, titularidad, licencias y gestión de datos sin presentar condiciones como garantizadas. Se regeneraron los casos y las páginas de preguntas desde sus fuentes.
