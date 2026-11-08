# Lopita Horarios · notas para Claude Code

## Interfaz

Antes de cambiar cualquier cosa de `app/static/` (HTML, CSS o JS de la interfaz), lee [DISENO.md](DISENO.md) y síguelo. Resumen:

- Herramienta interna: cada pantalla debe parecer obvia, no vistosa. Ante la duda, quita en vez de añadir.
- Identidad fija: usa las variables de `:root` en `styles.css` (dorado `--gold` como único acento, Oswald solo para títulos de la marca, Raleway para el resto). No añadas colores ni fuentes.
- Sin degradados, tarjetas dentro de tarjetas, iconos decorativos ni animaciones de entrada. El movimiento solo responde a una acción, dura menos de 200 ms y respeta `prefers-reduced-motion`; nunca `transition: all`.
- Móvil: zonas táctiles de 44px, campos de 16px o más, cifras con `tabular-nums`, estados que no dependen solo del color.
- Proceso: critica la pantalla y lista los 5 problemas principales antes de tocar código, cambia una capa cada vez y revisa capturas a 390px y 1280px antes de terminar.

Skills recomendadas para este trabajo (opcionales, se instalan en local porque `.claude/` no se sube al repositorio):

- `npx skills add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines`
- `npx skills add https://github.com/heyman333/atelier-ui --skill apple-ui-designer` (ignora sus indicaciones de SF Pro e iOS: aquí mandan las fuentes y colores de Lopita)
- El plugin oficial `frontend-design` de Anthropic.

Si una skill contradice DISENO.md, gana DISENO.md.
