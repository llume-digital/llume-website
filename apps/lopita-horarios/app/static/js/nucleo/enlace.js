import { state } from './estado.js';
import { renderSavebar, renderView } from './pintado.js';
// ------------------------------------------------------------------ enlace de datos (data-bind)
export function getPath(root, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), root); }
export function setPath(root, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const obj = keys.reduce((o, k) => o[k], root);
  obj[last] = value;
}
function rootFor(path) {
  if (path.startsWith('@gen.')) return [state.gen, path.slice(5), false];
  if (path.startsWith('@mi.')) return [state.mi, path.slice(4), false];
  return [state.draft, path, true];
}
function coerce(el) {
  const t = el.dataset.type || (el.type === 'checkbox' ? 'bool' : el.type === 'number' ? 'num' : 'str');
  if (t === 'bool') return el.checked;
  if (t === 'num') { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? v : 0; }
  if (t === 'int') { const v = parseInt(el.value, 10); return Number.isFinite(v) ? v : 0; }
  if (t === 'nullstr') return el.value.trim() === '' ? null : el.value.trim();
  if (t === 'nullnum') { const v = parseFloat(String(el.value).replace(',', '.')); return Number.isFinite(v) ? v : null; }
  return el.value;
}
export function markDirty() { state.dirty = true; state.saveError = null; renderSavebar(); }

export function onBind(e) {
  const el = e.target.closest('[data-bind]');
  if (!el) return;
  if (e.type === 'input' && (el.tagName === 'SELECT' || el.type === 'checkbox' || el.type === 'date' || el.type === 'time' || el.type === 'month' || el.type === 'color')) return;
  const [root, path, dirty] = rootFor(el.dataset.bind);
  setPath(root, path, coerce(el));
  if (dirty) markDirty();
  if (el.dataset.bind.startsWith('@mi.')) state.mi.prefsDirty = true;
  if (e.type === 'change' && el.hasAttribute('data-rerender')) renderView();
}

