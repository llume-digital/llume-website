import fs from 'fs'; import * as acorn from 'acorn'; import * as scope from 'eslint-scope';
const [src, mapaF] = process.argv.slice(2);
const code = fs.readFileSync(src, 'utf8'); const mapa = JSON.parse(fs.readFileSync(mapaF, 'utf8'));
const ast = acorn.parse(code, { ecmaVersion: 2024, sourceType: 'module', locations: true, ranges: true });
const sm = scope.analyze(ast, { ecmaVersion: 2024, sourceType: 'module' });
const mod = sm.scopes.find((s) => s.type === 'module');
const owner = (line) => { let m = mapa[0][1]; for (const [l, n] of mapa) if (line >= l) m = n; return m; };
const vars = {}; const writes = []; const loadtime = []; const uses = {};
for (const v of mod.variables) { const d = v.defs[0]; vars[v.name] = { mod: owner(d.name.loc.start.line), kind: d.type === 'FunctionName' ? 'function' : d.kind || d.type }; }
for (const v of mod.variables) {
  for (const r of v.references) {
    const from = owner(r.identifier.loc.start.line); const to = vars[v.name].mod;
    if (from === to) continue;
    (uses[from] ||= {}); (uses[from][to] ||= new Set()).add(v.name);
    if (r.isWrite()) writes.push(`${v.name} (${to}) escrito en ${from}:${r.identifier.loc.start.line}`);
    if (r.from.variableScope === mod && vars[v.name].kind !== 'function') loadtime.push(`${v.name} (${to}, ${vars[v.name].kind}) leído al cargar en ${from}:${r.identifier.loc.start.line}`);
  }
}
const out = { vars, uses: Object.fromEntries(Object.entries(uses).map(([a, b]) => [a, Object.fromEntries(Object.entries(b).map(([k, s]) => [k, [...s].sort()]))])), writes, loadtime, through: [...new Set(mod.through.map((r) => r.identifier.name))] };
fs.writeFileSync(process.argv[4], JSON.stringify(out, null, 1));
console.log('writes', writes.length, '\n' + writes.join('\n')); console.log('loadtime', loadtime.length, '\n' + loadtime.join('\n'));
