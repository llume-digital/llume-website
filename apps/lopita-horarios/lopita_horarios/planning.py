"""Cálculos compartidos por el motor y el validador (calendario, objetivos de horas, cobertura)."""
from __future__ import annotations

import datetime as dt
import math
from dataclasses import dataclass, field
from functools import cache
from typing import Optional

from .models import Assignment, Config, Employee, Puesto, Shift, parse_hhmm


def daterange(start: dt.date, end: dt.date) -> list[dt.date]:
    return [start + dt.timedelta(days=i) for i in range((end - start).days + 1)]


def week_chunks(days: list[dt.date]) -> list[list[dt.date]]:
    """Agrupa los días del periodo por semana natural (lunes-domingo)."""
    chunks: dict[tuple[int, int], list[dt.date]] = {}
    for d in days:
        iso = d.isocalendar()
        chunks.setdefault((iso[0], iso[1]), []).append(d)
    return list(chunks.values())


def is_weekend(d: dt.date) -> bool:
    return d.weekday() >= 5


@dataclass
class DayDemand:
    date: dt.date
    closed: bool
    # minuto de inicio de cada paso -> personas requeridas (clientela + tareas)
    required: dict[int, int]
    # minuto de inicio de cada paso -> personas que piden solo las tareas fijas
    tasks: dict[int, int] = field(default_factory=dict)
    # puesto -> minuto -> mínimo de personas en ese puesto (incluidas sus tareas). Vacío si no se pide ningún puesto.
    by_post: dict[Puesto, dict[int, int]] = field(default_factory=dict)


def _steps_of(inicio: str, fin: str, res: int):
    start, end = parse_hhmm(inicio), parse_hhmm(fin)
    t = start - start % res
    while t < end:
        yield t
        t += res


def demand_for(config: Config, date: dt.date) -> DayDemand:
    dtype = config.day_type_for(date)
    res = config.reglas.resolucion_minutos
    required: dict[int, int] = {}
    by_post: dict[Puesto, dict[int, int]] = {}

    def need_post(p: Puesto, t: int, n: int, add: bool) -> None:
        if n <= 0:
            return
        steps = by_post.setdefault(p, {})
        steps[t] = steps.get(t, 0) + n if add else max(steps.get(t, 0), n)

    if not dtype.cerrado:
        for slot in dtype.franjas:
            for t in _steps_of(slot.inicio, slot.fin, res):
                required[t] = max(required.get(t, 0), slot.personas)
                need_post(Puesto.cocina, t, slot.cocina, add=False)
                need_post(Puesto.sala, t, slot.sala, add=False)
    tasks: dict[int, int] = {}
    if not dtype.cerrado:
        for task in config.tareas:
            if not task.applies_on(date):
                continue
            for t in _steps_of(task.inicio, task.fin, res):
                tasks[t] = tasks.get(t, 0) + task.personas
                if task.puesto:
                    need_post(task.puesto, t, task.personas, add=True)
        for t, n in tasks.items():
            required[t] = required.get(t, 0) + n
    return DayDemand(date=date, closed=dtype.cerrado, required=required, tasks=tasks, by_post=by_post)


def shift_steps(shift: Shift, res: int) -> frozenset[int]:
    """Pasos de 'res' minutos que cubre un turno (un paso cuenta si el turno lo cubre entero)."""
    return _steps(shift.start_min, shift.end_min, res)


@cache  # el validador y las alertas lo piden decenas de miles de veces por horario para los mismos pocos turnos
def _steps(start: int, end: int, res: int) -> frozenset[int]:
    first = math.ceil(start / res) * res
    return frozenset(range(first, end - res + 1, res))


def available_days(config: Config, emp: Employee, days: list[dt.date]) -> int:
    return sum(1 for d in days if not config.is_absent(emp.id, d))


def target_minutes(config: Config, emp: Employee, days: list[dt.date]) -> int:
    """Horas de contrato que tocan en esos días, descontando ausencias (prorrata semanal). Un comodín no tiene."""
    if emp.comodin:
        return 0
    return round(emp.horas_semanales * 60 * available_days(config, emp, days) / 7)


def comodin_min_minutes(config: Config, emp: Employee, days: list[dt.date]) -> int:
    """Mínimo de un comodín en esos días (prorrata semanal, descontando ausencias); 0 si no tiene mínimo."""
    if not emp.comodin or not emp.horas_min_semana:
        return 0
    return round(emp.horas_min_semana * 60 * available_days(config, emp, days) / 7)


def upper_minutes(config: Config, emp: Employee, frame: list[dt.date]) -> int | None:
    """Tope duro de minutos de una persona en un tramo de semana; None si no tiene (comodín sin máximo).

    Para un comodín es su máximo semanal; en semanas partidas, la prorrata más una jornada completa
    (como en los contratos), sin pasar nunca de su máximo de una semana entera.
    """
    if not emp.comodin:
        return weekly_upper_minutes(config, target_minutes(config, emp, frame), len(frame))
    if emp.horas_max_semana is None:
        return None
    full = round(emp.horas_max_semana * 60)
    if len(frame) >= 7:
        return full
    return min(full, round(full * len(frame) / 7) + int(config.reglas.max_horas_dia * 60))


def max_worked_days(config: Config, n_days: int) -> int:
    """Días trabajables en un tramo de semana respetando el descanso semanal mínimo."""
    min_off = math.floor(config.reglas.dias_libres_por_semana * n_days / 7)
    return n_days - min_off


def weekly_upper_minutes(config: Config, week_target: int, n_days: int) -> int:
    """Tope duro de minutos en un tramo de semana.

    En semanas completas: contrato + margen semanal + horas extra máximas.
    En semanas partidas (inicio o fin de mes) la prorrata sería demasiado estricta
    para turnos de 7-8 h, así que se permite además una jornada completa.
    """
    r = config.reglas
    upper = week_target + int((r.margen_semanal_horas + r.max_horas_extra_semana) * 60 * n_days / 7)
    if n_days < 7:
        upper += int(r.max_horas_dia * 60)
    return upper


def with_locks(config: Config, locks) -> Config:
    """Devuelve una copia de la configuración con los bloqueos manuales convertidos en excepciones."""
    if not locks:
        return config
    from .models import AssignmentOverride

    locked = {(l.empleado_id, l.fecha) for l in locks}
    overrides = [o for o in config.excepciones_asignacion if (o.empleado_id, o.fecha) not in locked]
    for l in locks:
        if l.turno_id:
            overrides.append(AssignmentOverride(empleado_id=l.empleado_id, fecha=l.fecha, tipo="turno", turno_id=l.turno_id,
                                                inicio=l.inicio, fin=l.fin, puesto=l.puesto, funcion=l.funcion))
        else:
            overrides.append(AssignmentOverride(empleado_id=l.empleado_id, fecha=l.fecha, tipo="libre"))
    return config.model_copy(update={"excepciones_asignacion": overrides})


@dataclass
class Carry:
    """Lo que arrastra un periodo del anterior: último día y días ya trabajados en la semana de inicio."""
    last_day: dict  # empleado -> Shift trabajado el día anterior a 'desde'
    week_days: dict  # empleado -> días trabajados en la semana de 'desde' antes de 'desde'
    week_minutes: dict  # empleado -> minutos trabajados en esa semana antes de 'desde'
    week_prev_dates: list  # fechas de esa semana anteriores a 'desde'


def carry_from(config: Config, desde: dt.date, previo) -> Carry | None:
    if previo is None:
        return None
    monday = desde - dt.timedelta(days=desde.weekday())
    prev_dates = [monday + dt.timedelta(days=i) for i in range(desde.weekday())]
    shift_ids = {s.id for s in config.turnos}
    last_day, wd, wm = {}, {}, {}
    for a in previo:
        if a.turno_id not in shift_ids:
            continue
        s = config.turno_de(a)
        if a.fecha == desde - dt.timedelta(days=1):
            last_day[a.empleado_id] = s
        if monday <= a.fecha < desde:
            wd[a.empleado_id] = wd.get(a.empleado_id, 0) + 1
            wm[a.empleado_id] = wm.get(a.empleado_id, 0) + s.minutes
    return Carry(last_day, wd, wm, prev_dates)


@dataclass
class Siguiente:
    """Lo que ya está publicado justo después del periodo: primer día y días trabajados en la semana de 'hasta'.

    Sirve para no romper el descanso entre jornadas ni los límites semanales con lo que ya manda después."""
    first_day: dict  # empleado -> Shift trabajado el día siguiente a 'hasta'
    week_days: dict  # empleado -> días trabajados en la semana de 'hasta' después de 'hasta'
    week_minutes: dict  # empleado -> minutos trabajados en esa semana después de 'hasta'
    week_next_dates: list  # fechas de esa semana posteriores a 'hasta' que tienen horario


def carry_after(config: Config, hasta: dt.date, contexto) -> Siguiente | None:
    """Como `carry_from`, pero con las asignaciones de después de 'hasta' (las de antes se ignoran).

    Solo cuentan las fechas que aparecen en 'contexto': un día sin horario después del periodo no es un día libre."""
    if not contexto:
        return None
    domingo = hasta + dt.timedelta(days=6 - hasta.weekday())
    siguiente = hasta + dt.timedelta(days=1)
    shift_ids = {s.id for s in config.turnos}
    first_day, wd, wm, fechas = {}, {}, {}, set()
    hay = False
    for a in contexto:
        if not hasta < a.fecha <= max(domingo, siguiente):
            continue
        hay = True
        if a.fecha <= domingo:
            fechas.add(a.fecha)
        if a.turno_id not in shift_ids:
            continue
        s = config.turno_de(a)
        if a.fecha == siguiente:
            first_day[a.empleado_id] = s
        if a.fecha <= domingo:
            wd[a.empleado_id] = wd.get(a.empleado_id, 0) + 1
            wm[a.empleado_id] = wm.get(a.empleado_id, 0) + s.minutes
    if not hay:
        return None
    return Siguiente(first_day, wd, wm, sorted(fechas))


def marco_semana(i: int, weeks: list[list[dt.date]], carry: Carry | None, despues: Siguiente | None):
    """Fechas que cuentan para los límites de la semana i y lo ya trabajado en ellas fuera del periodo.

    La primera semana suma los días de antes de 'desde' y la última los de después de 'hasta'.
    Devuelve (fechas, {empleado: días}, {empleado: minutos})."""
    frame = list(weeks[i])
    dias: dict = {}
    minutos: dict = {}

    def sumar(d: dict, m: dict) -> None:
        for k, v in d.items():
            dias[k] = dias.get(k, 0) + v
        for k, v in m.items():
            minutos[k] = minutos.get(k, 0) + v

    if i == 0 and carry and carry.week_prev_dates:
        frame = carry.week_prev_dates + frame
        sumar(carry.week_days, carry.week_minutes)
    if i == len(weeks) - 1 and despues and despues.week_next_dates:
        frame = frame + despues.week_next_dates
        sumar(despues.week_days, despues.week_minutes)
    return frame, dias, minutos


def rest_minutes_between(a: Shift, b: Shift) -> int:
    """Descanso entre el fin del turno 'a' (día D) y el inicio del turno 'b' (día D+1)."""
    return 24 * 60 - a.end_min + b.start_min


def allowed_shifts(config: Config, emp: Employee, date: dt.date) -> list[Shift]:
    """Turnos que un empleado puede hacer ese día según las reglas duras y las excepciones manuales."""
    if not emp.activo or config.is_absent(emp.id, date):
        return []
    if config.day_type_for(date).cerrado:
        return []
    override = config.override_for(emp.id, date)
    if override and override.tipo == "libre":
        return []
    if override and override.tipo == "turno":
        return [config.turno_de(override)]
    if date.weekday() in emp.fixed_off_indexes() and not (override and override.tipo == "trabaja"):
        return []
    result = []
    for s in config.turnos:
        if not s.available_on(date):
            continue
        if s.hours > config.reglas.max_horas_dia:
            continue
        if s.tipo.value == "apertura" and not emp.puede_abrir:
            continue
        if s.tipo.value == "cierre" and not emp.puede_cerrar:
            continue
        if not emp.cabe_en_franja(s.start_min, s.end_min, date):
            continue
        result.append(s)
    return result


def allowed_posts(config: Config, emp: Employee, date: dt.date) -> list[Puesto]:
    """Puestos que puede hacer ese día: los suyos, o el que se haya fijado a mano (también con un rol fijado)."""
    override = config.override_for(emp.id, date)
    if override and override.tipo == "turno" and override.puesto:
        return [override.puesto]
    if override and override.tipo == "turno" and override.funcion:
        f = next((f for f in config.funciones if f.id == override.funcion), None)
        if f is not None and f.puesto in emp.puestos:
            return [f.puesto]
    return list(emp.puestos)


def assignment_steps(config: Config, a: Assignment, res: int) -> frozenset[int]:
    """Pasos que cubre una asignación, con sus horas a medida si las tiene."""
    return shift_steps(config.turno_de(a), res)


def function_rules(config: Config, date: dt.date) -> dict[str, dict[int, tuple[int, Optional[int]]]]:
    """Lo que piden las reglas de las funciones un día: función -> minuto -> (mínimo, máximo o None).

    Los días cerrados no piden nada. Si dos reglas de la misma función se solapan, vale el mínimo mayor y el
    máximo menor.
    """
    if not config.funciones or config.day_type_for(date).cerrado:
        return {}
    res = config.reglas.resolucion_minutos
    out: dict[str, dict[int, tuple[int, Optional[int]]]] = {}
    for f in config.funciones:
        for r in f.reglas:
            if not r.applies_on(date):
                continue
            steps = out.setdefault(f.id, {})
            for t in _steps_of(r.inicio, r.fin, res):
                mn, mx = steps.get(t, (0, None))
                mn = max(mn, r.personas)
                if r.maximo is not None:
                    mx = r.maximo if mx is None else min(mx, r.maximo)
                steps[t] = (mn, mx)
    return {k: v for k, v in out.items() if v}


def function_demand(config: Config, date: dt.date) -> dict[str, dict[int, int]]:
    """Presencia mínima que piden las reglas de las funciones un día: función -> minuto -> personas."""
    out = {fid: {t: mn for t, (mn, _) in steps.items() if mn > 0} for fid, steps in function_rules(config, date).items()}
    return {k: v for k, v in out.items() if v}


def function_caps(config: Config, date: dt.date) -> dict[str, dict[int, int]]:
    """Máximos que piden las reglas de los roles un día: función -> minuto -> personas como mucho."""
    out = {fid: {t: mx for t, (_, mx) in steps.items() if mx is not None}
           for fid, steps in function_rules(config, date).items()}
    return {k: v for k, v in out.items() if v}


def role_posts(config: Config, date: dt.date) -> set[Puesto]:
    """Puestos cuyos roles hay que repartir ese día: los que tienen algún rol con una regla que se aplica."""
    con_reglas = function_rules(config, date)
    return {f.puesto for f in config.funciones if f.puesto is not None and f.id in con_reglas}


def allowed_roles(config: Config, emp: Employee, date: dt.date, post: Puesto, repartir: bool) -> list[Optional[str]]:
    """Roles entre los que elegir para alguien que trabaja ese día en ese puesto (None = sin rol).

    Si se ha fijado a mano, ese. Si no, sus roles de ese puesto, pero solo los días en que hay que repartirlos
    (repartir); quien no tiene ninguno trabaja en el puesto sin rol.
    """
    override = config.override_for(emp.id, date)
    if override and override.tipo == "turno" and override.funcion:
        f = next((f for f in config.funciones if f.id == override.funcion), None)
        if f is not None and f.puesto == post:
            return [f.id]
    if not repartir:
        return [None]
    return list(config.roles_de(emp, post)) or [None]


def function_presence(config: Config, date: dt.date,
                      assignments: list[Assignment]) -> dict[str, list[tuple[int, int, Optional[int], int]]]:
    """Cómo quedan las reglas de las funciones un día: función -> [(minuto, mínimo, máximo, personas que cuentan)].

    assignments: las de ese día (las de personas o turnos que ya no existen se ignoran). Ver Config.hace_funcion.
    """
    reglas = function_rules(config, date)
    if not reglas:
        return {}
    emp_ids = {e.id for e in config.empleados}
    shift_ids = {s.id for s in config.turnos}
    res = config.reglas.resolucion_minutos
    hoy = [(a, config.employee(a.empleado_id), shift_steps(config.turno_de(a), res)) for a in assignments
           if a.fecha == date and a.empleado_id in emp_ids and a.turno_id in shift_ids]
    out = {}
    for fid, steps in reglas.items():
        f = config.funcion(fid)
        quienes = [pasos for a, e, pasos in hoy if config.hace_funcion(f, a, e)]
        out[fid] = [(t, mn, mx, sum(1 for pasos in quienes if t in pasos)) for t, (mn, mx) in sorted(steps.items())]
    return out
