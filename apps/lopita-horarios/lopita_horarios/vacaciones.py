"""Contador de vacaciones de cada persona (Estatuto de los Trabajadores, art. 38).

Reglas que aplica:
- Mínimo legal: 30 días naturales de vacaciones al año (el convenio puede mejorarlo: ``Employee.dias_vacaciones``).
  Vale igual para jornada parcial.
- Quien entra durante el año tiene la parte proporcional a los días que está de alta; el resultado se redondea al
  alza a días enteros, a favor de la persona trabajadora.
- Se cuentan días naturales (festivos y fines de semana incluidos) apuntados como ausencia de tipo «vacaciones»;
  si dos apuntes se solapan, cada día cuenta una sola vez.

Lo que no cubre (se documenta, no se inventa): vacaciones de años anteriores sin disfrutar, bajas a mitad de año ni
convenios con calendario propio. Es dominio puro: el día de hoy se pasa como argumento.
"""
from __future__ import annotations

import datetime as dt
import math

from pydantic import BaseModel

from .models import Config, Employee

MINIMO_LEGAL_DIAS = 30


class SaldoVacaciones(BaseModel):
    empleado_id: str
    anio: int
    derecho: int  # días que le corresponden este año (prorrateados si entró durante el año)
    disfrutadas: int  # días de vacaciones hasta hoy (incluido)
    programadas: int  # días de vacaciones apuntados a partir de mañana
    quedan: int  # derecho - disfrutadas - programadas (negativo = se pasa)


def derecho_anual(emp: Employee, anio: int) -> int:
    """Días de vacaciones del año: los anuales o su parte proporcional si entró durante ese año."""
    anuales = max(emp.dias_vacaciones, MINIMO_LEGAL_DIAS)
    inicio, fin = dt.date(anio, 1, 1), dt.date(anio, 12, 31)
    alta = emp.fecha_alta
    if alta is None or alta <= inicio:
        return anuales
    if alta > fin:
        return 0
    dias_alta = (fin - alta).days + 1
    dias_anio = (fin - inicio).days + 1
    return math.ceil(anuales * dias_alta / dias_anio)


def _dias_de_vacaciones(config: Config, emp_id: str, anio: int) -> set[dt.date]:
    out: set[dt.date] = set()
    ini, fin = dt.date(anio, 1, 1), dt.date(anio, 12, 31)
    for a in config.ausencias:
        if a.empleado_id != emp_id or a.motivo != "vacaciones":
            continue
        d, h = max(a.desde, ini), min(a.hasta, fin)
        while d <= h:
            out.add(d)
            d += dt.timedelta(days=1)
    return out


def saldo(config: Config, emp: Employee, anio: int, hoy: dt.date) -> SaldoVacaciones:
    dias = _dias_de_vacaciones(config, emp.id, anio)
    disfrutadas = sum(1 for d in dias if d <= hoy)
    programadas = len(dias) - disfrutadas
    derecho = derecho_anual(emp, anio)
    return SaldoVacaciones(empleado_id=emp.id, anio=anio, derecho=derecho, disfrutadas=disfrutadas,
                           programadas=programadas, quedan=derecho - disfrutadas - programadas)
