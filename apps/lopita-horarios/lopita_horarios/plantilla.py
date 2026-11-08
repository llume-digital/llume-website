"""Plantilla frente a demanda: si en conjunto hay gente suficiente, aunque cada persona esté bien.

Compara por semana las horas-persona que pide la demanda con las horas de contrato disponibles
(descontando ausencias) y con lo máximo que podría hacer la plantilla (horas extra permitidas, libranzas,
descanso semanal y turnos que puede hacer cada uno). Por día, mira si hay bastantes personas disponibles
para el momento de más demanda y alguien que pueda abrir y cerrar. No depende de cómo esté hecho el
horario: estos problemas no se arreglan moviendo turnos, sino con contrataciones, jornadas o demanda.
"""
from __future__ import annotations

import datetime as dt

from pydantic import BaseModel

from .models import Config
from .planning import (
    allowed_shifts,
    comodin_min_minutes,
    daterange,
    demand_for,
    max_worked_days,
    target_minutes,
    upper_minutes,
    week_chunks,
)


class SemanaPlantilla(BaseModel):
    desde: dt.date
    hasta: dt.date
    demanda: float  # horas-persona que pide la demanda
    contrato: float  # horas de contrato de la plantilla activa, sin las ausencias (más el mínimo de los comodines)
    maximo: float  # lo máximo que podría trabajar la plantilla (con horas extra y comodines)
    comodines: float = 0  # de ese máximo, lo que pueden poner los comodines por encima de su mínimo


class DiaPlantilla(BaseModel):
    fecha: dt.date
    necesarias: int  # personas a la vez en el momento de más demanda
    disponibles: int  # personas que pueden trabajar ese día
    sin_apertura: bool  # hay turno de apertura pero nadie disponible puede hacerlo
    sin_cierre: bool


def capacidad_minutos(config: Config, empleado_id: str, dias: list[dt.date]) -> int:
    """Máximo aproximado de minutos que una persona puede trabajar en esos días.

    Por cada semana: sus mejores días (los turnos más largos que puede hacer) hasta el máximo de días
    trabajables, sin pasar del tope semanal. No tiene en cuenta el descanso entre jornadas ni la semana
    del periodo anterior, así que es una cota por arriba: si ni así llega, no hay forma.
    """
    e = config.employee(empleado_id)
    total = 0
    for semana in week_chunks(dias):
        largos = sorted((max((s.minutes for s in allowed_shifts(config, e, d)), default=0) for d in semana), reverse=True)
        mejor = sum(largos[:max_worked_days(config, len(semana))])
        tope = upper_minutes(config, e, semana)
        total += mejor if tope is None else min(mejor, tope)
    return total


def _contrato_minutos(config: Config, e, semana: list[dt.date]) -> int:
    """Horas con las que se cuenta seguro: el contrato o, en un comodín, su mínimo."""
    return comodin_min_minutes(config, e, semana) if e.comodin else target_minutes(config, e, semana)


def demanda_minutos(config: Config, d: dt.date) -> int:
    return sum(demand_for(config, d).required.values()) * config.reglas.resolucion_minutos


def semanas(config: Config, desde: dt.date, hasta: dt.date) -> list[SemanaPlantilla]:
    out = []
    for semana in week_chunks(daterange(desde, hasta)):
        empleados = config.active_employees()
        out.append(SemanaPlantilla(
            desde=semana[0], hasta=semana[-1],
            demanda=round(sum(demanda_minutos(config, d) for d in semana) / 60, 2),
            contrato=round(sum(_contrato_minutos(config, e, semana) for e in empleados) / 60, 2),
            maximo=round(sum(capacidad_minutos(config, e.id, semana) for e in empleados) / 60, 2),
            comodines=round(sum(max(0, capacidad_minutos(config, e.id, semana) - _contrato_minutos(config, e, semana))
                                for e in empleados if e.comodin) / 60, 2),
        ))
    return out


def dias(config: Config, desde: dt.date, hasta: dt.date) -> list[DiaPlantilla]:
    """Días con demanda en los que la plantilla disponible no da para lo que se pide."""
    out = []
    for d in daterange(desde, hasta):
        dem = demand_for(config, d)
        if not dem.required:
            continue
        opciones = {e.id: allowed_shifts(config, e, d) for e in config.active_employees()}
        disponibles = sum(1 for turnos in opciones.values() if turnos)

        def nadie(tipo: str) -> bool:
            existe = any(s.tipo.value == tipo and s.available_on(d) for s in config.turnos)
            return existe and not any(s.tipo.value == tipo for turnos in opciones.values() for s in turnos)

        dia = DiaPlantilla(fecha=d, necesarias=max(dem.required.values()), disponibles=disponibles,
                           sin_apertura=nadie("apertura"), sin_cierre=nadie("cierre"))
        if dia.disponibles < dia.necesarias or dia.sin_apertura or dia.sin_cierre:
            out.append(dia)
    return out
