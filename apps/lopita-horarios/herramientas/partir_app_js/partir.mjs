// Parte app.js en módulos según mapa.json: solo añade líneas `import` arriba y `export ` delante de las declaraciones
// que usan otros módulos. No cambia nada más (lo comprueba verificar.mjs).
import fs from 'fs'; import path from 'path'; import * as acorn from 'acorn';
const [src, mapaF, analisisF, dest] = process.argv.slice(2);
const code = fs.readFileSync(src, 'utf8'); const mapa = JSON.parse(fs.readFileSync(mapaF, 'utf8'));
const { vars, uses } = JSON.parse(fs.readFileSync(analisisF, 'utf8'));
const lines = code.split('\n');
const ast = acorn.parse(code, { ecmaVersion: 2024, sourceType: 'module', locations: true });
const exportados = new Set(); for (const b of Object.values(uses)) for (const [to, names] of Object.entries(b)) names.forEach((n) => exportados.add(n));
const owner = (line) => { let m = mapa[0][1]; for (const [l, n] of mapa) if (line >= l) m = n; return m; };
const declara = (st) => st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name]
  : st.type === 'VariableDeclaration' ? st.declarations.flatMap((d) => (d.id.type === 'Identifier' ? [d.id.name] : [])) : [];
const exportLines = new Set();
for (const st of ast.body) {
  const ns = declara(st);
  if (st.type === 'VariableDeclaration' && st.declarations.some((d) => d.id.type !== 'Identifier')) throw new Error('desestructuración en ' + st.loc.start.line);
  if (ns.some((n) => exportados.has(n))) exportLines.add(st.loc.start.line);
}
const orden = mapa.map(([, n]) => n);
for (let i = 0; i < mapa.length; i++) {
  const [ini, nombre] = mapa[i]; const fin = i + 1 < mapa.length ? mapa[i + 1][0] - 1 : lines.length;
  const cuerpo = [];
  for (let l = ini; l <= fin; l++) cuerpo.push(exportLines.has(l) ? `export ${lines[l - 1]}` : lines[l - 1]);
  const imps = Object.entries(uses[nombre] || {}).sort((a, b) => orden.indexOf(a[0]) - orden.indexOf(b[0])).map(([to, names]) => {
    let rel = path.posix.relative(path.posix.dirname(nombre), to); if (!rel.startsWith('.')) rel = './' + rel;
    return `import { ${names.join(', ')} } from '${rel}';`;
  });
  const salida = (imps.length ? imps.join('\n') + '\n' : '') + cuerpo.join('\n') + (i + 1 < mapa.length ? '\n' : '');
  fs.mkdirSync(path.join(dest, path.dirname(nombre)), { recursive: true });
  fs.writeFileSync(path.join(dest, nombre), salida);
}
