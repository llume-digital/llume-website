"""Validador independiente del motor.

Comprueba cualquier horario (generado o retocado a mano) contra la configuración
y devuelve errores (reglas duras rotas) y avisos (cobertura corta, horas extra...).
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict

from .models import WEEKDAYS, Assignment, Config, EmployeeStats, Issue, Puesto, fmt_hhmm
from .planning import (
    daterange,
    demand_for,
    function_presence,
    is_weekend,
    max_worked_days,
    rest_minutes_between,
    shift_steps,
    comodin_min_minutes,
    target_minutes,
    upper_minutes,
    week_chunks,
    carry_after,
    carry_from,
    marco_semana,
    with_locks,
)


_DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
PUESTO = {Puesto.cocina: "cocina", Puesto.sala: "sala"}


def _fmt_date(d: dt.date) -> str:
    return f"{_DIAS[d.weekday()]} {d.day:02d}/{d.month:02d}"


def _ranges(steps: list[tuple[int, int]], res: int) -> list[tuple[int, int, int]]:
    """[(minuto, faltan)] ordenados -> [(inicio, fin, faltan)] agrupando pasos contiguos con el mismo hueco."""
    out: list[list[int]] = []
    for t, n in steps:
        if out and out[-1][1] == t and out[-1][2] == n:
            out[-1][1] = t + res
        else:
            out.append([t, t + res, n])
    return [tuple(r) for r in out]


def compute_stats(config: Config, desde: dt.date, hasta: dt.date, assignments: list[Assignment],
                  saldo_horas: dict[str, float] | None = None) -> list[EmployeeStats]:
    days = daterange(desde, hasta)
    saldo_horas = saldo_horas or {}
    shift_ids = {s.id for s in config.turnos}
    stats = []
    for e in config.active_employees():
        mine = [a for a in assignments if a.empleado_id == e.id and a.turno_id in shift_ids]
        minutes = sum(config.turno_de(a).minutes for a in mine)
        saldo = saldo_horas.get(e.id, 0)
        target = max(0, target_minutes(config, e, days) - saldo * 60)
        tol = config.reglas.margen_periodo_horas * 60
        stats.append(EmployeeStats(
            empleado_id=e.id,
            comodin=e.comodin,
            horas=round(minutes / 60, 2),
            horas_objetivo=round(target / 60, 2),
            saldo_anterior=round(saldo, 2),
            horas_extra=0 if e.comodin else round(max(0, minutes - target - tol) / 60, 2),
            dias_trabajados=len(mine),
            fines_de_semana=sum(1 for a in mine if is_weekend(a.fecha)),
            cierres=sum(1 for a in mine if config.shift(a.turno_id).tipo.value == "cierre"),
            aperturas=sum(1 for a in mine if config.shift(a.turno_id).tipo.value == "apertura"),
        ))
    return stats


def validate(config: Config, desde: dt.date, hasta: dt.date, assignments: list[Assignment],
             previo: list[Assignment] | None = None, saldo_horas: dict[str, float] | None = None,
             bloqueos=None) -> list[Issue]:
    config = with_locks(config, bloqueos)
    carry = carry_from(config, desde, previo)
    despues = carry_after(config, hasta, previo)
    rules = config.reglas
    res = rules.resolucion_minutos
    days = daterange(desde, hasta)
    issues: list[Issue] = []
    emp_ids = {e.id for e in config.empleados}
    shift_ids = {s.id for s in config.turnos}

    def err(code, msg, d=None, e=None):
        issues.append(Issue(nivel="error", codigo=code, mensaje=msg, fecha=d, empleado_id=e))

    def warn(code, msg, d=None, e=None):
        issues.append(Issue(nivel="aviso", codigo=code, mensaje=msg, fecha=d, empleado_id=e))

    by_emp_day: dict[tuple[str, dt.date], list[Assignment]] = defaultdict(list)
    for a in assignments:
        if a.empleado_id not in emp_ids:
            err("empleado_desconocido", f"Empleado desconocido: {a.empleado_id}", a.fecha)
            continue
        if a.turno_id not in shift_ids:
            err("turno_desconocido", f"Turno desconocido: {a.turno_id}", a.fecha, a.empleado_id)
            continue
        if not desde <= a.fecha <= hasta:
            err("fuera_de_periodo", f"Asignación fuera del periodo el {a.fecha}", a.fecha, a.empleado_id)
            continue
        by_emp_day[a.empleado_id, a.fecha].append(a)

    for e in config.empleados:
        name = e.nombre
        for d in days:
            todays = by_emp_day.get((e.id, d), [])
            override = config.override_for(e.id, d)
            if len(todays) > 1:
                err("doble_turno", f"{name} tiene {len(todays)} turnos el {_fmt_date(d)}", d, e.id)
            if override and override.tipo == "turno" and not any(a.turno_id == override.turno_id for a in todays):
                warn("excepcion_no_respetada", f"{name} debía hacer {override.turno_id} el {_fmt_date(d)}", d, e.id)
            if override and override.tipo == "trabaja" and not todays:
                warn("excepcion_no_respetada", f"{name} debía trabajar el {_fmt_date(d)}", d, e.id)
            if not todays:
                continue
            if not e.activo:
                err("empleado_inactivo", f"{name} está de baja en la plantilla y tiene turno el {_fmt_date(d)}", d, e.id)
            absence = config.is_absent(e.id, d)
            if absence:
                err("ausencia", f"{name} tiene turno el {_fmt_date(d)} pero está de {absence.motivo}", d, e.id)
            if override and override.tipo == "libre":
                err("dia_libre_pedido", f"{name} pidió librar el {_fmt_date(d)}", d, e.id)
            if d.weekday() in e.fixed_off_indexes() and not override:
                err("libranza_fija", f"{name} trabaja el {_fmt_date(d)}, que es su libranza fija", d, e.id)
            if config.day_type_for(d).cerrado:
                err("local_cerrado", f"El local está cerrado el {_fmt_date(d)}", d, e.id)
            for a in todays:
                s = config.turno_de(a)
                if a.puesto and a.puesto not in e.puestos:
                    err("puesto_no_habilitado",
                        f"{name} hace {PUESTO[a.puesto]} el {_fmt_date(d)}, pero no es uno de sus puestos", d, e.id)
                if s.puesto and config.puesto_de(a) != s.puesto:
                    err("puesto_turno", f"El turno {s.nombre} es de {PUESTO[s.puesto]} y {name} lo hace en "
                        f"{PUESTO[config.puesto_de(a)]} ({_fmt_date(d)})", d, e.id)
                _check_rol(config, e, a, err)
                if not s.available_on(d):
                    err("turno_no_disponible", f"El turno {s.nombre} no existe el {_fmt_date(d)}", d, e.id)
                if s.tipo.value == "apertura" and not e.puede_abrir:
                    err("no_puede_abrir", f"{name} no está habilitado para abrir ({_fmt_date(d)})", d, e.id)
                if s.tipo.value == "cierre" and not e.puede_cerrar:
                    err("no_puede_cerrar", f"{name} no está habilitado para cerrar ({_fmt_date(d)})", d, e.id)
                if s.hours > rules.max_horas_dia:
                    err("jornada_larga", f"{s.nombre} dura {s.hours:g} h, más de {rules.max_horas_dia:g} h", d, e.id)
                if not e.cabe_en_franja(s.start_min, s.end_min, d):
                    puede_desde, puede_hasta = e.franja(d)
                    texto = (f"{name} hace {s.inicio}–{s.fin} el {_fmt_date(d)}, pero ese día solo puede trabajar "
                             f"de {fmt_hhmm(puede_desde)} a {fmt_hhmm(puede_hasta)}")
                    # Como con las libranzas: si lo ha fijado el encargado a mano, se respeta y solo se avisa.
                    if override and override.tipo == "turno":
                        warn("fuera_de_franja", texto + " (fijado a mano)", d, e.id)
                    else:
                        err("fuera_de_franja", texto, d, e.id)

        # Descanso entre jornadas
        min_rest = rules.descanso_minimo_horas * 60
        if carry and e.id in carry.last_day:
            for b in by_emp_day.get((e.id, desde), []):
                rest = rest_minutes_between(carry.last_day[e.id], config.turno_de(b))
                if rest < min_rest:
                    err("descanso_corto",
                        f"{name} descansa solo {rest / 60:g} h entre el periodo anterior y el {_fmt_date(desde)}",
                        desde, e.id)
        if despues and e.id in despues.first_day:
            for a in by_emp_day.get((e.id, hasta), []):
                rest = rest_minutes_between(config.turno_de(a), despues.first_day[e.id])
                if rest < min_rest:
                    err("descanso_corto",
                        f"{name} descansa solo {rest / 60:g} h entre el {_fmt_date(hasta)} y el horario publicado "
                        f"que sigue", hasta, e.id)
        for d in days[:-1]:
            nxt = d + dt.timedelta(days=1)
            for a in by_emp_day.get((e.id, d), []):
                for b in by_emp_day.get((e.id, nxt), []):
                    rest = rest_minutes_between(config.turno_de(a), config.turno_de(b))
                    if rest < min_rest:
                        err("descanso_corto",
                            f"{name} descansa solo {rest / 60:g} h entre el {_fmt_date(d)} y el {_fmt_date(nxt)}",
                            nxt, e.id)

        # Semana: días libres y horas
        semanas = week_chunks(days)
        for i, chunk in enumerate(semanas):
            frame, ya_dias, ya_minutos = marco_semana(i, semanas, carry, despues)
            worked_days = sum(1 for d in chunk if by_emp_day.get((e.id, d))) + ya_dias.get(e.id, 0)
            limit = max_worked_days(config, len(frame))
            if worked_days > limit:
                err("descanso_semanal",
                    f"{name} trabaja {worked_days} días la semana del {_fmt_date(chunk[0])} (máximo {limit})",
                    chunk[0], e.id)
            minutes = sum(config.turno_de(a).minutes for d in chunk for a in by_emp_day.get((e.id, d), []))
            minutes += ya_minutos.get(e.id, 0)
            upper = upper_minutes(config, e, frame)
            if e.activo and upper is not None and minutes > upper + 0.5:
                err("semana_excedida",
                    f"{name} suma {minutes / 60:g} h la semana del {_fmt_date(chunk[0])} (tope {upper / 60:g} h)",
                    chunk[0], e.id)
            minimo = comodin_min_minutes(config, e, frame)
            if e.activo and len(frame) >= 7 and minutes < minimo - 0.5:
                warn("comodin_minimo",
                     f"{name} suma {minutes / 60:g} h la semana del {_fmt_date(chunk[0])}, por debajo de su mínimo "
                     f"de {minimo / 60:g} h", chunk[0], e.id)

    # Horas del periodo
    for st in compute_stats(config, desde, hasta, assignments, saldo_horas):
        if st.comodin:
            continue  # sin contrato: sus límites son los semanales de arriba
        e = config.employee(st.empleado_id)
        tol = rules.margen_periodo_horas
        max_extra = rules.max_horas_extra_semana * len(days) / 7
        if st.horas_extra > max_extra + 1e-6:
            err("extra_excedida", f"{e.nombre}: {st.horas_extra:g} h extra, por encima del tope de {max_extra:g} h", None, e.id)
        elif st.horas_extra >= 0.5:
            warn("horas_extra", f"{e.nombre}: {st.horas_extra:g} h extra ({st.horas:g} de {st.horas_objetivo:g} h)", None, e.id)
        if st.horas < st.horas_objetivo - tol - 1e-6:
            warn("horas_por_debajo",
                 f"{e.nombre}: {st.horas:g} h, por debajo de su contrato ({st.horas_objetivo:g} h)", None, e.id)

    # Cobertura y presencia de encargado
    for d in days:
        dem = demand_for(config, d)
        if not dem.required:
            continue
        working = [(config.employee(a.empleado_id), shift_steps(config.turno_de(a), res), config.puesto_de(a))
                   for a in assignments if a.fecha == d and a.empleado_id in emp_ids and a.turno_id in shift_ids]
        gaps, no_mgr = [], []
        for t in sorted(dem.required):
            here = [(e, p) for e, steps, p in working if t in steps]
            missing = dem.required[t] - len(here)
            if missing > 0:
                gaps.append((t, missing))
            if rules.encargado_siempre and not any(e.es_encargado for e, _ in here):
                no_mgr.append((t, 1))
        for start, end, n in _ranges(gaps, res):
            warn("falta_cobertura",
                 f"{_fmt_date(d)} {fmt_hhmm(start)}–{fmt_hhmm(end)}: falta{'n' if n > 1 else ''} {n} persona{'s' if n > 1 else ''}", d)
        for post, needed in dem.by_post.items():
            post_gaps = []
            for t, req in sorted(needed.items()):
                missing = req - sum(1 for _, steps, p in working if p == post and t in steps)
                if missing > 0:
                    post_gaps.append((t, missing))
            for start, end, n in _ranges(post_gaps, res):
                warn("falta_cobertura",
                     f"{_fmt_date(d)} {fmt_hhmm(start)}–{fmt_hhmm(end)}: falta{'n' if n > 1 else ''} {n} en {PUESTO[post]}", d)
        for start, end, _ in _ranges(no_mgr, res):
            warn("sin_encargado", f"{_fmt_date(d)} {fmt_hhmm(start)}–{fmt_hhmm(end)}: no hay encargado", d)
        for fid, pasos in function_presence(config, d, assignments).items():
            nombre = config.funcion(fid).nombre
            f_gaps = [(t, mn - n) for t, mn, _, n in pasos if n < mn]
            for start, end, n in _ranges(f_gaps, res):
                warn("falta_funcion",
                     f"{_fmt_date(d)} {fmt_hhmm(start)}–{fmt_hhmm(end)}: falta{'n' if n > 1 else ''} {n} para «{nombre}»", d)
            f_over = [(t, n - mx) for t, _, mx, n in pasos if mx is not None and n > mx]
            for start, end, n in _ranges(f_over, res):
                warn("exceso_funcion",
                     f"{_fmt_date(d)} {fmt_hhmm(start)}–{fmt_hhmm(end)}: sobra{'n' if n > 1 else ''} {n} en «{nombre}»", d)

    return issues


def _check_rol(config: Config, e, a: Assignment, err) -> None:
    """El rol de una asignación tiene que ser uno de los de la persona y de su puesto ese día.

    Un rol que ya no existe (se borró la función) no cuenta para nada y no se señala.
    """
    f = next((f for f in config.funciones if f.id == a.funcion), None) if a.funcion else None
    if f is None:
        return
    d = a.fecha
    if f.puesto is None:
        err("rol_no_habilitado", f"«{f.nombre}» es una tarea de apoyo, no un rol que se asigne a un turno "
                                 f"({e.nombre}, {_fmt_date(d)})", d, e.id)
    elif f.id not in e.funciones:
        err("rol_no_habilitado", f"{e.nombre} hace «{f.nombre}» el {_fmt_date(d)}, pero no es uno de sus roles", d, e.id)
    elif config.puesto_de(a) != f.puesto:
        err("rol_no_habilitado", f"{e.nombre} hace «{f.nombre}» el {_fmt_date(d)} trabajando en "
                                 f"{PUESTO[config.puesto_de(a)]}, pero es un rol de {PUESTO[f.puesto]}", d, e.id)
