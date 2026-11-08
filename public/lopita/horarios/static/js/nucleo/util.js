// Lopita & Co · Horarios — interfaz web (sin dependencias)

// ------------------------------------------------------------------ utilidades
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const DAYS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
export const DAY_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const DAY_CHIP = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MOTIVOS = { vacaciones: 'Vacaciones', baja: 'Baja', permiso: 'Permiso', otro: 'Otro' };
export const TIPOS_TURNO = { apertura: 'Apertura', normal: 'Normal', cierre: 'Cierre' };

const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => iso(new Date(parseDate(s).getTime() + n * 864e5));
export const weekday = (s) => (parseDate(s).getUTCDay() + 6) % 7;
export const todayIso = () => { const t = new Date(); return iso(new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()))); };
export const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 864e5);
export const dayNum = (s) => Number(s.slice(8));
export const monthName = (s) => MONTHS[Number(s.slice(5, 7)) - 1];
export const fmtShort = (s) => `${DAY_SHORT[weekday(s)]} ${dayNum(s)}`;
export const fmtLong = (s) => `${DAY_LABEL[weekday(s)].toLowerCase()} ${dayNum(s)} de ${monthName(s)}`;
export const fmtRange = (a, b) => {
  const y = b.slice(0, 4);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${dayNum(a)}–${dayNum(b)} de ${monthName(b)} ${y}`;
  return `${dayNum(a)} de ${monthName(a)} – ${dayNum(b)} de ${monthName(b)} ${y}`;
};
export const toMin = (hhmm) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return h * 60 + m; };
export const fmtMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export const fmtH = (x) => `${Math.round(x * 100) / 100}`.replace('.', ',');
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';
export const uid = (base, taken) => { let id = slug(base), n = 2; const set = new Set(taken); while (set.has(id)) id = `${slug(base)}-${n++}`; return id; };
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const fmtStamp = (s) => { if (!s) return ''; const d = new Date(s); return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };

export const ICON = {
  lock: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17 9V7a5 5 0 0 0-10 0v2H5v13h14V9h-2Zm-8-2a3 3 0 0 1 6 0v2H9V7Z"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  // Iconos de la barra de cuenta: en el móvil sustituyen al texto para que la barra quepa en una línea.
  guia: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01"/></svg>',
  comentar: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 5h16v11H9l-5 4V5Z"/></svg>',
  cuenta: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  salir: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/></svg>',
  mic: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  plus: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
};

