import { addDays, daysBetween } from './util.js';
// Contador de vacaciones (Estatuto de los Trabajadores, art. 38). Es el mismo cálculo que lopita_horarios/vacaciones.py:
// 30 días naturales al año como mínimo; si la persona entró durante el año, la parte proporcional a los días de
// alta, redondeada al alza. Cada día de «vacaciones» cuenta una sola vez aunque dos apuntes se solapen.
export const MINIMO_LEGAL_DIAS = 30;

export function derechoAnual(emp, anio) {
  const anuales = Math.max(emp.dias_vacaciones || MINIMO_LEGAL_DIAS, MINIMO_LEGAL_DIAS);
  const ini = `${anio}-01-01`, fin = `${anio}-12-31`;
  const alta = emp.fecha_alta;
  if (!alta || alta <= ini) return anuales;
  if (alta > fin) return 0;
  return Math.ceil((anuales * (daysBetween(alta, fin) + 1)) / (daysBetween(ini, fin) + 1) - 1e-9);
}

export function saldoVacaciones(cfg, emp, anio, hoy) {
  const dias = new Set();
  const ini = `${anio}-01-01`, fin = `${anio}-12-31`;
  for (const a of cfg.ausencias) {
    if (a.empleado_id !== emp.id || a.motivo !== 'vacaciones') continue;
    for (let d = a.desde > ini ? a.desde : ini; d <= (a.hasta < fin ? a.hasta : fin); d = addDays(d, 1)) dias.add(d);
  }
  const disfrutadas = [...dias].filter((d) => d <= hoy).length;
  const programadas = dias.size - disfrutadas;
  const derecho = derechoAnual(emp, anio);
  return { derecho, disfrutadas, programadas, quedan: derecho - disfrutadas - programadas };
}

// «12 de 30» con aviso en rojo si se pasa del derecho.
export const textoQuedan = (s) => (s.quedan < 0 ? `${-s.quedan} de más` : `${s.quedan}`);
