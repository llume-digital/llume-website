"""Avisos al trabajador: qué ha cambiado en sus turnos desde la última vez que miró.

Se anotan al modificar un horario publicado (edición, regeneración, publicación, retirada) y se
muestran en el portal del trabajador hasta que los marca como leídos.
"""
from __future__ import annotations

import datetime as dt

from lopita_horarios.cambios import describir, diferencias
from lopita_horarios.models import Config, Schedule

from .db import Store

_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
_MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
          "noviembre", "diciembre"]
URGENTE_DIAS = 2  # un cambio en los próximos días se destaca


def fecha_larga(d: dt.date) -> str:
    return f"{_DIAS[d.weekday()]} {d.day} de {_MESES[d.month - 1]}"


def registrar_cambios(store: Store, sid: int, antes: Schedule, despues: Schedule) -> None:
    """Anota los cambios de turno entre dos versiones de un horario que está publicado."""
    for c in diferencias(antes.asignaciones, despues.asignaciones):
        store.record_shift_change(c.empleado_id, sid, c.fecha, c.antes, c.despues)


def registrar_publicacion(store: Store, sid: int, h: Schedule) -> None:
    por_persona: dict[str, int] = {}
    for a in h.asignaciones:
        por_persona[a.empleado_id] = por_persona.get(a.empleado_id, 0) + 1
    for emp, n in por_persona.items():
        store.record_notice(emp, sid, "nuevo_horario", h.desde, h.hasta, n)


def registrar_retirada(store: Store, sid: int, h: Schedule) -> None:
    for emp in {a.empleado_id for a in h.asignaciones}:
        store.record_notice(emp, sid, "retirado", h.desde, h.hasta)


def _turno(config: Config, firmas: str | None) -> str:
    turnos = {s.id: s for s in config.turnos}
    roles = {f.id: f.nombre for f in config.funciones}
    return " + ".join(describir(turnos, x, roles) for x in (firmas or "").split(","))


def texto(config: Config, a: dict) -> str:
    if a["tipo"] == "turno":
        f = fecha_larga(dt.date.fromisoformat(a["fecha"]))
        if not a["antes"]:
            return f"Nuevo turno el {f}: {_turno(config, a['despues'])}."
        if not a["despues"]:
            return f"Ya no trabajas el {f} (antes tenías {_turno(config, a['antes'])})."
        return f"Tu turno del {f} ha cambiado: de {_turno(config, a['antes'])} a {_turno(config, a['despues'])}."
    rango = f"{fecha_larga(dt.date.fromisoformat(a['fecha']))} al {fecha_larga(dt.date.fromisoformat(a['fecha_fin']))}"
    if a["tipo"] == "nuevo_horario":
        n = a["cantidad"] or 0
        return f"Se ha publicado tu horario del {rango}: {n} turno{'s' if n != 1 else ''}."
    return f"El horario del {rango} se ha retirado para revisarlo. Te avisaremos cuando se publique de nuevo."


def vista(config: Config, avisos: list[dict], hoy: dt.date) -> list[dict]:
    """Avisos listos para mostrar. Los cambios de días ya pasados dejan de ser relevantes y no se muestran."""
    out = []
    for a in avisos:
        fecha = dt.date.fromisoformat(a["fecha"]) if a["fecha"] else None
        if a["tipo"] == "turno" and fecha and fecha < hoy:
            continue
        if a["tipo"] != "turno" and a["fecha_fin"] and dt.date.fromisoformat(a["fecha_fin"]) < hoy:
            continue
        out.append({
            "id": a["id"], "tipo": a["tipo"], "texto": texto(config, a), "fecha": a["fecha"],
            "creado": a["created_at"], "leido": a["leido_at"] is not None,
            "urgente": a["tipo"] == "turno" and a["leido_at"] is None and fecha is not None
                       and (fecha - hoy).days <= URGENTE_DIAS,
        })
    return out
