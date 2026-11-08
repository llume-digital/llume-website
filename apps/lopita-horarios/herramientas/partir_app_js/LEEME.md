# Partición de app.js en módulos (noviembre de 2026)

Scripts con los que se partió el antiguo `app/static/app.js` (3.642 líneas) en módulos ES, sin cambiar ni una línea de código: solo se añadieron `import` arriba de cada módulo y `export ` delante de lo que usan los demás. Se guardan por si hay que rehacer la partición sobre una rama que aún tenga el archivo entero.

- `mapa.json`: línea de inicio de cada sección del archivo original y el módulo al que va.
- `analizar.mjs`: con eslint-scope, saca qué usa cada módulo de los demás y avisa si alguno escribe una variable de otro o la lee al cargar (con ciclos, podría no estar lista).
- `partir.mjs`: escribe los módulos.
- `verificar.mjs`: comprueba que la unión de los módulos, quitando esos `import` y `export `, es idéntica al original.

```sh
npm i --no-save acorn@8 eslint-scope@8   # en una carpeta temporal
node analizar.mjs app.original.js mapa.json analisis.json
node partir.mjs app.original.js mapa.json analisis.json ../../app/static
node verificar.mjs app.original.js mapa.json ../../app/static
```
