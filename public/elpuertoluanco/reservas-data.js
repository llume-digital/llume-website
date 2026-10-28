// DEMO: sin servidor. Las reservas nuevas se guardan en este navegador (localStorage)
// y los datos históricos y de visitas son inventados (generados con semilla fija).
const EP = (() => {
  const AFORO = 36, HORAS = ['13:00','13:30','14:00','14:30','15:00','20:00','20:30','21:00','21:30','22:00'];
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const mas = n => { const d = new Date(hoy); d.setDate(d.getDate()+n); return d; };
  let s = 20261027;
  const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd()*a.length)];
  const NOMBRES = ['Lucía','Carlos','Marta','Javier','Elena','Pablo','Sofía','Álvaro','Paula','Diego','Carmen','Hugo','Laura','Sergio','Noelia','Iván','Claudia','Rubén','Andrea','Mario','Cristina','Adrián','Irene','Óscar','Beatriz','Nacho','Raquel','Dani'];
  const APELLIDOS = ['García','Fernández','González','Rodríguez','López','Martínez','Sánchez','Pérez','Álvarez','Suárez','Menéndez','Díaz','Alonso','Cuesta','Valdés','Rionda'];
  const seed = [];
  for (let off = -150; off <= 14; off++) {
    const d = mas(off), dow = d.getDay(), mes = d.getMonth();
    const base = (dow === 5 || dow === 6 ? 9 : dow === 0 ? 7 : dow === 1 ? 2 : 4) * (mes === 6 || mes === 7 ? 1.7 : mes === 8 ? 1.2 : mes >= 9 || mes < 5 ? .7 : 1);
    const n = Math.round(base * (.7 + rnd()*.6));
    for (let i = 0; i < n; i++) {
      const cena = rnd() < .45, hora = cena ? pick(HORAS.slice(5)) : pick(HORAS.slice(0,5));
      const r = rnd(), personas = r < .08 ? 1 : r < .5 ? 2 : r < .65 ? 3 : r < .85 ? 4 : r < .93 ? 5 + Math.floor(rnd()*2) : 7 + Math.floor(rnd()*4);
      const o = rnd(), origen = o < .58 ? 'web' : o < .88 ? 'teléfono' : 'presencial';
      let estado = off < 0 ? (rnd() < .06 ? 'no presentada' : rnd() < .07 ? 'cancelada' : 'completada') : (rnd() < .06 ? 'cancelada' : 'confirmada');
      seed.push({ id: `s${off+150}-${i}`, nombre: `${pick(NOMBRES)} ${pick(APELLIDOS)}`, personas, fecha: iso(d), hora, telefono: `6${Math.floor(rnd()*90+10)} ${String(Math.floor(rnd()*900+100))} ${String(Math.floor(rnd()*900+100))}`, notas: rnd() < .12 ? pick(['Terraza, por favor','Cumpleaños','Trona para bebé','Alergia a frutos secos','Celíaca','Mesa tranquila']) : '', origen, estado });
    }
  }
  const FUENTES = [['Google Maps / ficha',.34],['Búsqueda en Google',.26],['Instagram',.16],['Directo / QR carta',.14],['TripAdvisor',.06],['Otros',.04]];
  const visitas = [];
  for (let off = -150; off <= 0; off++) {
    const d = mas(off), dow = d.getDay(), mes = d.getMonth();
    const v = Math.round((dow === 5 || dow === 6 ? 150 : dow === 0 ? 120 : 85) * (mes === 6 || mes === 7 ? 1.8 : mes === 8 ? 1.2 : .8) * (.75 + rnd()*.5));
    const carta = Math.round(v * (.38 + rnd()*.1)), reservar = Math.round(v * (.12 + rnd()*.05));
    visitas.push({ fecha: iso(d), visitas: v, carta, reservar, movil: Math.round(v*(.74+rnd()*.08)) });
  }
  const KEY = 'ep_reservas_extra', KE = 'ep_estados';
  const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const todas = () => { const est = leer(KE, {}); return [...seed, ...leer(KEY, [])].map(r => est[r.id] ? { ...r, estado: est[r.id] } : r).sort((a,b) => (a.fecha+a.hora).localeCompare(b.fecha+b.hora)); };
  const ocupadas = (fecha, hora) => todas().filter(r => r.fecha === fecha && r.hora === hora && (r.estado === 'confirmada' || r.estado === 'completada')).reduce((t, r) => t + r.personas, 0);
  const anadir = r => { const e = leer(KEY, []); r.id = 'n' + Date.now(); r.estado = 'confirmada'; e.push(r); guardar(KEY, e); return r; };
  const estado = (id, v) => { const e = leer(KE, {}); e[id] = v; guardar(KE, e); };
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return { AFORO, HORAS, iso, hoy, mas, todas, ocupadas, anadir, estado, visitas, FUENTES, esc };
})();
