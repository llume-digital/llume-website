"""Informes: cobertura por franja (para la interfaz) y resumen de horas en CSV (para la gestoría)."""
from __future__ import annotations

import csv
import io

from .models import Config, Schedule
from .planning import daterange, demand_for, function_presence, shift_steps


def coverage(config: Config, schedule: Schedule) -> dict[str, dict]:
    """{fecha: {tipo, cerrado, pasos: [[minuto, requeridas, presentes], ...], puestos}} con la resolución configurada.

    puestos: {cocina|sala: [[minuto, mínimo, presentes], ...]}, solo para los puestos que pide la demanda ese día.
    funciones: {id de función: [[minuto, mínimo, presentes que cuentan, máximo o None], ...]}, solo en los tramos de
    sus reglas (ver Config.hace_funcion).
    """
    res = config.reglas.resolucion_minutos
    shift_ids = {s.id for s in config.turnos}
    emp_ids = {e.id for e in config.empleados}
    out = {}
    for d in daterange(schedule.desde, schedule.hasta):
        dem = demand_for(config, d)
        todays = [(shift_steps(config.turno_de(a), res), config.puesto_de(a)) for a in schedule.asignaciones
                  if a.fecha == d and a.turno_id in shift_ids and a.empleado_id in emp_ids]
        ts = set(dem.required)
        for steps, _ in todays:
            ts |= steps
        out[d.isoformat()] = {
            "tipo": config.day_type_for(d).nombre,
            "cerrado": dem.closed,
            "pasos": [[t, dem.required.get(t, 0), sum(1 for steps, _ in todays if t in steps)] for t in sorted(ts)],
            "puestos": {post.value: [[t, needed.get(t, 0), sum(1 for steps, p in todays if p == post and t in steps)]
                                     for t in sorted(ts)]
                        for post, needed in dem.by_post.items()},
            "funciones": {fid: [[t, mn, n, mx] for t, mn, mx, n in pasos]
                          for fid, pasos in function_presence(config, d, schedule.asignaciones).items()},
        }
    return out


def hours_csv(config: Config, schedule: Schedule) -> str:
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["empleado", "horas", "horas_objetivo", "saldo_anterior", "horas_extra", "dias_trabajados",
                "fines_de_semana", "aperturas", "cierres"])
    names = {e.id: e.nombre for e in config.empleados}
    for st in schedule.resumen:
        w.writerow([names.get(st.empleado_id, st.empleado_id), _n(st.horas), _n(st.horas_objetivo),
                    _n(st.saldo_anterior), _n(st.horas_extra), st.dias_trabajados, st.fines_de_semana,
                    st.aperturas, st.cierres])
    w.writerow([])
    w.writerow(["fecha", "empleado", "turno", "puesto", "inicio", "fin", "horas", "rol"])
    shift_ids = {s.id for s in config.turnos}
    emp_ids = {e.id for e in config.empleados}
    for a in sorted(schedule.asignaciones, key=lambda a: (a.fecha, a.empleado_id)):
        if a.turno_id not in shift_ids:
            continue
        s = config.turno_de(a)
        puesto = config.puesto_de(a).value if a.empleado_id in emp_ids else (a.puesto.value if a.puesto else "")
        rol = next((f.nombre for f in config.funciones if f.id == a.funcion), "")
        w.writerow([a.fecha.isoformat(), names.get(a.empleado_id, a.empleado_id), s.nombre, puesto, s.inicio, s.fin,
                    _n(s.hours), rol])
    return "﻿" + buf.getvalue()  # BOM para que Excel lea bien las tildes


def _n(x: float) -> str:
    return f"{x:g}".replace(".", ",")
