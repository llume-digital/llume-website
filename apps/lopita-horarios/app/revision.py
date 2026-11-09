"""Revisión antes de publicar: qué cambia para el equipo respecto a lo que ya está publicado.

Al publicar, un borrador se queda con todas sus fechas en la línea de tiempo (o, si es un arreglo, cambia los turnos
del publicado). Antes de hacerlo, el encargado ve:

- las diferencias, día a día y por persona, con lo que el equipo ve hoy en esas fechas;
- las ediciones a mano y bloqueos del horario publicado que el borrador no respeta, para poder conservarlos;
- los días pasados que cambian, que hay que confirmar aparte (puede que alguien no hiciera su turno o hiciera horas
  extra, y el registro tiene que quedar bien, pero no es un cambio normal).
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Iterable, Optional

from lopita_horarios.cambios import diferencias, firma
from lopita_horarios.models import Assignment, Lock, Schedule

from . import linea_tiempo


def como_asignacion(lock: Lock) -> Optional[Assignment]:
    """El turno que deja fijado un bloqueo (None si es un día libre)."""
    if not lock.turno_id:
        return None
    return Assignment(empleado_id=lock.empleado_id, fecha=lock.fecha, turno_id=lock.turno_id, puesto=lock.puesto,
                      inicio=lock.inicio, fin=lock.fin, funcion=lock.funcion)


def _firmas(asignaciones: Iterable[Assignment]) -> dict[tuple[str, dt.date], tuple[str, ...]]:
    por = defaultdict(list)
    for a in asignaciones:
        por[a.empleado_id, a.fecha].append(firma(a))
    return {k: tuple(sorted(v)) for k, v in por.items()}


def revisar(rows: list[dict], row: dict, hoy: dt.date) -> dict:
    """Lo que cambiaría al publicar el borrador 'row'. 'rows' son todos los horarios (`Store.list_schedules`)."""
    h: Schedule = row["horario"]
    mandan = linea_tiempo.por_dia(rows, h.desde, h.hasta, solo_publicados=True, excluir=row["id"])
    publicadas = set(mandan)
    actual = [a for d, r in mandan.items() for a in r["horario"].asignaciones if a.fecha == d]
    nuevo = [a for a in h.asignaciones if a.fecha in publicadas]
    cambios = diferencias(actual, nuevo)

    propias = {(b.empleado_id, b.fecha) for b in h.bloqueos}
    firmas = _firmas(h.asignaciones)
    conservables = []
    for d, r in mandan.items():
        for b in r["horario"].bloqueos:
            if b.fecha != d or (b.empleado_id, d) in propias:
                continue
            a = como_asignacion(b)
            if firmas.get((b.empleado_id, d), ()) != ((firma(a),) if a else ()):
                conservables.append({"horario": r["id"], "bloqueo": b})

    sustituye = defaultdict(list)
    for d, r in mandan.items():
        sustituye[r["id"]].append(d)
    return {
        "cambios": cambios,
        "dias_publicados": len(publicadas),
        "dias_nuevos": (h.hasta - h.desde).days + 1 - len(publicadas),
        "sustituye": [{"id": sid, "desde": min(ds), "hasta": max(ds), "dias": len(ds)} for sid, ds in sustituye.items()],
        "conservables": conservables,
        "pasado": sorted({c.fecha for c in cambios if c.fecha < hoy}),
    }


def conservar(h: Schedule, bloqueos: list[Lock]) -> Schedule:
    """El borrador con esos bloqueos aplicados: cada casilla queda como la fijó el bloqueo y el bloqueo pasa al borrador."""
    if not bloqueos:
        return h
    fuera = {(b.empleado_id, b.fecha) for b in bloqueos}
    asignaciones = [a for a in h.asignaciones if (a.empleado_id, a.fecha) not in fuera]
    asignaciones += [a for b in bloqueos if (a := como_asignacion(b))]
    asignaciones.sort(key=lambda a: (a.fecha, a.empleado_id))
    propios = [b for b in h.bloqueos if (b.empleado_id, b.fecha) not in fuera]
    return h.model_copy(update={"asignaciones": asignaciones, "bloqueos": propios + list(bloqueos)}, deep=True)


def comparar(rows: list[dict], row: dict) -> dict:
    """Diferencias entre un horario (por ejemplo, una versión antigua) y lo que manda hoy en sus fechas.

    Solo cuentan las fechas que tienen otro horario publicado mandando: restaurar esta versión cambiaría eso."""
    h: Schedule = row["horario"]
    mandan = {d: r for d, r in linea_tiempo.por_dia(rows, h.desde, h.hasta, solo_publicados=True).items()
              if r["id"] != row["id"]}
    actual = [a for d, r in mandan.items() for a in r["horario"].asignaciones if a.fecha == d]
    version = [a for a in h.asignaciones if a.fecha in mandan]
    sustituye = defaultdict(list)
    for d, r in mandan.items():
        sustituye[r["id"]].append(d)
    return {
        "cambios": diferencias(actual, version),
        "dias_publicados": len(mandan),
        "dias_nuevos": 0,
        "sustituye": [{"id": sid, "desde": min(ds), "hasta": max(ds), "dias": len(ds)} for sid, ds in sustituye.items()],
        "conservables": [],
        "pasado": [],
    }
