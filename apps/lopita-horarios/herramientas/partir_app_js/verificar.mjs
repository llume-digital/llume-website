// Comprueba que la unión de los módulos, quitando los `import` añadidos y el `export ` delante, es app.js original.
import fs from 'fs'; import path from 'path';
const [orig, mapaF, dir] = process.argv.slice(2);
const mapa = JSON.parse(fs.readFileSync(mapaF, 'utf8'));
const unido = mapa.map(([, n], k) => fs.readFileSync(path.join(dir, n), 'utf8').replace(k < mapa.length - 1 ? /\n$/ : /(?!)/, '').split('\n')
  .filter((l, i, arr) => !(/^import \{[^}]*\} from '[^']+';$/.test(l) && arr.slice(0, i).every((x) => x.startsWith('import {'))))
  .map((l) => l.replace(/^export (?=(async function|function|const|let|class) )/, '')).join('\n')).join('\n');
const original = fs.readFileSync(orig, 'utf8');
if (unido !== original) { const a = unido.split('\n'), b = original.split('\n'); const i = a.findIndex((x, k) => x !== b[k]); console.error('DISTINTO en la línea', i + 1, '\n', a[i], '\n', b[i]); process.exit(1); }
console.log('idéntico:', original.split('\n').length, 'líneas en', mapa.length, 'módulos');
