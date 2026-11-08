"""Generar (o rehacer) un horario que valga: sin problemas críticos, con un número limitado de reintentos.

Si el horario sale con problemas críticos (ver criticas.py), la generación cuenta como fallida y se
reintenta, pero solo mientras un nuevo intento pueda dar otro resultado:
- si ningún problema tiene arreglo moviendo turnos (no hay nadie disponible), reintentar no sirve;
- si el motor ya ha demostrado que su resultado es el óptimo, repetir daría lo mismo (los problemas
  críticos pesan más que todo lo demás, así que el óptimo ya es el que menos tiene).

Cada reintento prueba algo distinto: primero «solucionar» (parte del horario y toca lo mínimo) y después
regenerar con más tiempo para el motor. Se queda el mejor intento, aunque no sea perfecto: quien decide
qué hacer con él (publicarlo o no) es el encargado.

Es dominio puro: no sabe de base de datos ni usa el reloj (quien llama dice desde qué día se puede cambiar).
"""
from __future__ import annotations

import datetime as dt
from dataclasses import replace
from typing import Literal, Optional

from pydantic import BaseModel, Field

from .cambios import firma
from .criticas import Problema, problemas
from .models import Assignment, Config, Lock, Schedule
from .solver import SolveOptions, generate
from .validator import compute_stats, validate

REINTENTOS_MAXIMOS = 2
# Cuánto más tiempo se le da al motor en el último reintento (regenerar).
FACTOR_TIEMPO_REGENERAR = 2

Metodo = Literal["generar", "solucionar", "regenerar"]


class Intento(BaseModel):
    numero: int = Field(description="1 = el primer intento; 2 y siguientes, los reintentos")
    metodo: Metodo
    estado_solver: Optional[str] = None
    criticos: int = Field(description="Problemas críticos con los que quedó el horario de este intento")


class Resultado(BaseModel):
    horario: Schedule = Field(description="El mejor horario conseguido (sin asignaciones si no hay ninguno posible)")
    valido: bool = Field(description="Si no le queda ningún problema crítico")
    intentos: list[Intento] = Field(default_factory=list)
    problemas: list[Problema] = Field(default_factory=list, description="Problemas críticos que quedan")
    motivo: Optional[str] = Field(default=None, description="Por qué no se ha seguido reintentando, si queda alguno")



def _cerrar(config: Config, h: Schedule, bloqueos: list[Lock], previo: Optional[list[Assignment]]) -> Schedule:
    """Deja en el horario solo los bloqueos del encargado (no los días congelados) y recalcula incidencias y resumen."""
    h.bloqueos = list(bloqueos)
    h.incidencias = validate(config, h.desde, h.hasta, h.asignaciones, previo=previo,
                             saldo_horas=h.saldo_anterior, bloqueos=h.bloqueos)
    h.resumen = compute_stats(config, h.desde, h.hasta, h.asignaciones, h.saldo_anterior)
    return h


def _errores(h: Schedule) -> int:
    return sum(1 for i in h.incidencias if i.nivel == "error")


def _mismas(a: Schedule, b: Schedule) -> bool:
    clave = lambda h: sorted((x.empleado_id, x.fecha, firma(x)) for x in h.asignaciones)  # noqa: E731
    return clave(a) == clave(b)


def _motivo_para_parar(quedan: list[Problema], cambiable_desde: dt.date, optimo: bool, quedan_reintentos: bool,
                       reintentos: int) -> Optional[str]:
    """Por qué otro intento no daría un resultado mejor (None si merece la pena intentarlo)."""
    if not any(p.arreglable and p.fecha >= cambiable_desde for p in quedan):
        if all(p.fecha >= cambiable_desde for p in quedan):
            return "Ninguno de los problemas críticos se puede arreglar moviendo turnos: hay que cambiar algo fuera del horario."
        return "Los problemas críticos que quedan no se pueden arreglar moviendo turnos o están en días que ya no se pueden cambiar."
    if optimo:
        return ("El motor ya ha encontrado el mejor horario posible con las reglas actuales: repetir daría el mismo "
                "resultado. Hay que cambiar algo (libranzas, ausencias, quién puede abrir o cerrar, turnos o demanda).")
    if not quedan_reintentos:
        return (f"Se ha reintentado {reintentos} {'vez' if reintentos == 1 else 'veces'} sin conseguir quitar "
                "todos los problemas críticos.")
    return None


def asegurar(config: Config, horario: Optional[Schedule], *, desde: dt.date, hasta: dt.date,
             opciones: Optional[SolveOptions] = None, previo: Optional[list[Assignment]] = None,
             bloqueos: Optional[list[Lock]] = None, saldo_horas: Optional[dict[str, float]] = None,
             congelados: Optional[list[Lock]] = None, cambiable_desde: Optional[dt.date] = None,
             reintentos: int = REINTENTOS_MAXIMOS) -> Resultado:
    """Genera un horario (si 'horario' es None) o arregla uno existente, reintentando si queda algún problema crítico.

    horario: el horario del que partir (p. ej. uno publicado que una ausencia ha dejado sin nadie); sin él,
        el primer intento es generar desde cero y no cuenta como reintento.
    congelados: bloqueos que mantienen igual lo que no se puede cambiar (ver solucionador.congelar_antes); solo
        valen para estos intentos y no quedan en el horario.
    cambiable_desde: primer día que se puede cambiar (los problemas de antes no cuentan para seguir reintentando).
    reintentos: cuántas veces más se intenta tras el primer intento (o tras el horario de partida).
    """
    opciones = opciones or SolveOptions()
    bloqueos = list(bloqueos if bloqueos is not None else (horario.bloqueos if horario else []))
    saldo = saldo_horas if saldo_horas is not None else (horario.saldo_anterior if horario else {})
    cambiable_desde = max(cambiable_desde or desde, desde)
    congelados = list(congelados or [])

    intentos: list[Intento] = []

    def ejecutar(metodo: Metodo, segundos: float, referencia: Optional[Schedule]) -> Schedule:
        h = generate(config, desde, hasta, replace(opciones, max_segundos=segundos), previo=previo,
                     bloqueos=bloqueos + congelados, saldo_horas=saldo,
                     referencia=referencia.asignaciones if referencia else None)
        if h.asignaciones:
            _cerrar(config, h, bloqueos, previo)
        intentos.append(Intento(numero=len(intentos) + 1, metodo=metodo, estado_solver=h.estado_solver,
                                criticos=len(problemas(config, h)) if h.asignaciones else 0))
        return h

    if horario is None:
        mejor = ejecutar("generar", opciones.max_segundos, None)
        if not mejor.asignaciones:
            return Resultado(horario=mejor, valido=False, intentos=intentos,
                             motivo="No existe ningún horario que cumpla las reglas duras.")
    else:
        mejor = _cerrar(config, horario.model_copy(deep=True), bloqueos, previo)

    pendientes: list[Metodo] = ["solucionar", "regenerar"][:reintentos]
    optimo = bool(intentos) and intentos[-1].estado_solver == "OPTIMAL"
    # Un horario de partida no lo ha hecho el motor con la configuración de ahora (p. ej. antes de aprobar una
    # ausencia): el primer reintento se hace siempre, porque puede mejorarlo aunque no le quede nada crítico.
    forzar = horario is not None
    motivo = None
    while True:
        quedan = problemas(config, mejor)
        if forzar and pendientes:
            forzar = False
        elif not quedan:
            break
        else:
            motivo = _motivo_para_parar(quedan, cambiable_desde, optimo, bool(pendientes), reintentos)
            if motivo:
                break
        metodo = pendientes.pop(0)
        if metodo == "solucionar":
            nuevo = ejecutar("solucionar", opciones.max_segundos, mejor)
        else:
            nuevo = ejecutar("regenerar", opciones.max_segundos * FACTOR_TIEMPO_REGENERAR, None)
        if not nuevo.asignaciones:
            continue
        optimo = nuevo.estado_solver == "OPTIMAL"
        if _mismas(nuevo, mejor):
            continue
        if (len(problemas(config, nuevo)), _errores(nuevo)) < (len(quedan), _errores(mejor)):
            mejor = nuevo

    quedan = problemas(config, mejor)
    return Resultado(horario=mejor, valido=not quedan, intentos=intentos, problemas=quedan,
                     motivo=motivo if quedan else None)
