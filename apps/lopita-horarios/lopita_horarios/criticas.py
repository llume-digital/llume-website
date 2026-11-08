"""Problemas críticos: los que hacen que un horario no valga tal cual.

Un horario no vale si, en algún momento del día con demanda (desde la media hora antes de abrir hasta
la media hora después de cerrar, tal como lo marca la demanda), no hay nadie en el local, o si al empezar
el día no hay nadie habilitado para abrir, o al terminar nadie habilitado para cerrar que se quede hasta
el final. Se cuenta a quien va a estar de verdad: un turno de alguien que ahora está ausente (o se ha dado
de baja en la plantilla) no cuenta.

Además de detectarlos, dice si cada problema tiene arreglo moviendo turnos: si nadie disponible podría
cubrir ese momento (libranzas, ausencias, cambios manuales, quién puede abrir o cerrar), reintentar no
sirve y hay que cambiar algo fuera del horario.

Es dominio puro y determinista.
"""
from __future__ import annotations

import datetime as dt
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from .models import Config, Employee, Schedule, fmt_hhmm
from .planning import allowed_shifts, daterange, demand_for, shift_steps, with_locks

_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


class TipoCritico(str, Enum):
    sin_nadie = "sin_nadie"
    apertura_sin_habilitado = "apertura_sin_habilitado"
    cierre_sin_habilitado = "cierre_sin_habilitado"


class Problema(BaseModel):
    tipo: TipoCritico
    fecha: dt.date
    tramos: list[tuple[int, int]] = Field(description="Minutos [inicio, fin) afectados")
    texto: str = Field(description="Qué pasa, en palabras")
    ausentes: list[str] = Field(default_factory=list, description="Personas con turno en ese momento que no van a venir")
    arreglable: bool = Field(description="Si moviendo turnos se puede mejorar (alguien disponible podría cubrir al menos una parte)")
    causa: Optional[str] = Field(default=None, description="Qué parte no tiene arreglo moviendo turnos, y por qué")


def _fecha(d: dt.date) -> str:
    return f"{_DIAS[d.weekday()]} {d.day:02d}/{d.month:02d}"


def _lista(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " y " + items[-1]


def _rangos(pasos: list[int], res: int) -> list[tuple[int, int]]:
    out: list[list[int]] = []
    for t in sorted(pasos):
        if out and out[-1][1] == t:
            out[-1][1] = t + res
        else:
            out.append([t, t + res])
    return [(a, b) for a, b in out]


def _tramo(a: int, b: int) -> str:
    return f"de {fmt_hhmm(a)} a {fmt_hhmm(b)}"


def _habilitado(e: Employee, tipo: TipoCritico) -> bool:
    return e.puede_abrir if tipo == TipoCritico.apertura_sin_habilitado else e.puede_cerrar


def _por_que_no(config: Config, e: Employee, d: dt.date) -> str:
    """Por qué una persona no puede cubrir ese momento del día."""
    ausencia = config.is_absent(e.id, d)
    if ausencia:
        return f"{e.nombre} está de {ausencia.motivo}"
    override = config.override_for(e.id, d)
    if override and override.tipo == "libre":
        return f"{e.nombre} libra por un cambio manual"
    if override and override.tipo == "turno":
        return f"{e.nombre} tiene fijado a mano otro turno"
    if d.weekday() in e.fixed_off_indexes() and not (override and override.tipo == "trabaja"):
        return f"{e.nombre} libra los {_DIAS[d.weekday()]}"
    desde, hasta = e.franja(d)
    if (desde, hasta) != (0, 24 * 60):
        return (f"ninguno de los turnos que puede hacer {e.nombre} cubre esa hora (ese día solo puede trabajar de "
                f"{fmt_hhmm(desde)} a {fmt_hhmm(hasta)})")
    return f"ninguno de los turnos que puede hacer {e.nombre} cubre esa hora"


class _Dia:
    """Quién está de verdad en cada momento de un día y quién podría estar."""

    def __init__(self, config: Config, config_bloqueos: Config, h: Schedule, d: dt.date):
        self.config, self.d = config, d
        res = config.reglas.resolucion_minutos
        self.res = res
        self.pasos = sorted(t for t, n in demand_for(config, d).required.items() if n > 0)
        turnos = {s.id: s for s in config.turnos}
        empleados = {e.id: e for e in config.empleados}
        self.presentes: dict[int, list[Employee]] = {t: [] for t in self.pasos}
        self.ausentes: dict[int, list[Employee]] = {t: [] for t in self.pasos}
        for a in h.asignaciones:
            if a.fecha != d or a.turno_id not in turnos or a.empleado_id not in empleados:
                continue
            e = empleados[a.empleado_id]
            va = e.activo and not config.is_absent(e.id, d)
            for t in shift_steps(config.turno_de(a), res) & set(self.pasos):
                (self.presentes if va else self.ausentes)[t].append(e)
        # Quién podría cubrir cada paso: turnos permitidos ese día respetando los cambios manuales del horario.
        self.posibles: dict[int, list[Employee]] = {t: [] for t in self.pasos}
        for e in config_bloqueos.active_employees():
            cubre: set[int] = set()
            for s in allowed_shifts(config_bloqueos, e, d):
                cubre |= shift_steps(s, res)
            for t in cubre & set(self.pasos):
                self.posibles[t].append(e)

    def sin_nadie(self) -> list[int]:
        return [t for t in self.pasos if not self.presentes[t]]

    def ausentes_en(self, pasos: list[int]) -> list[str]:
        return sorted({e.nombre for t in pasos for e in self.ausentes[t]})


def _causa_habilitados(dia: _Dia, tipo: TipoCritico, paso: int) -> str:
    verbo = "abrir" if tipo == TipoCritico.apertura_sin_habilitado else "cerrar"
    habilitados = [e for e in dia.config.active_employees() if _habilitado(e, tipo)]
    if not habilitados:
        return f"No hay nadie en la plantilla habilitado para {verbo}."
    return (f"Nadie habilitado para {verbo} puede estar ese día a esa hora: "
            f"{_lista([_por_que_no(dia.config, e, dia.d) for e in habilitados])}.")


def _sin_nadie(dia: _Dia) -> Optional[Problema]:
    huecos = dia.sin_nadie()
    if not huecos:
        return None
    tramos = _rangos(huecos, dia.res)
    ausentes = dia.ausentes_en(huecos)
    texto = f"{_fecha(dia.d)}: no hay nadie en el local {_lista([_tramo(a, b) for a, b in tramos])}."
    if ausentes:
        texto += f" {_lista(ausentes)} tenía{'n' if len(ausentes) > 1 else ''} turno, pero no va{'n' if len(ausentes) > 1 else ''} a venir."
    causas = []
    imposibles = [t for t in huecos if not dia.posibles[t]]
    if imposibles:
        tramos_imp = _rangos(imposibles, dia.res)
        motivos = [_por_que_no(dia.config, e, dia.d) for e in dia.config.active_employees()]
        causas.append(f"No hay personal suficiente: {_lista([_tramo(a, b) for a, b in tramos_imp])} no hay nadie "
                      f"disponible ({_lista(motivos)}).")
    # Si el hueco incluye la apertura o el cierre, no basta con cualquiera: tiene que poder estar alguien habilitado.
    for tipo, paso in ((TipoCritico.apertura_sin_habilitado, dia.pasos[0]), (TipoCritico.cierre_sin_habilitado, dia.pasos[-1])):
        if paso in huecos and paso not in imposibles and not any(_habilitado(e, tipo) for e in dia.posibles[paso]):
            causas.append(_causa_habilitados(dia, tipo, paso))
    return Problema(tipo=TipoCritico.sin_nadie, fecha=dia.d, tramos=tramos, texto=texto, ausentes=ausentes,
                    arreglable=len(imposibles) < len(huecos), causa=" ".join(causas) or None)


def _extremo(dia: _Dia, tipo: TipoCritico) -> Optional[Problema]:
    apertura = tipo == TipoCritico.apertura_sin_habilitado
    paso = dia.pasos[0] if apertura else dia.pasos[-1]
    if not dia.presentes[paso]:
        return None  # ya lo cuenta «no hay nadie», que lo dice
    if any(_habilitado(e, tipo) for e in dia.presentes[paso]):
        return None
    verbo = "abrir" if apertura else "cerrar"
    momento = (f"a las {fmt_hhmm(paso)}, al empezar el día" if apertura
               else f"hasta las {fmt_hhmm(paso + dia.res)}, al terminar el día")
    quien = sorted(e.nombre for e in dia.presentes[paso])
    texto = (f"{_fecha(dia.d)}: {momento}, no hay nadie habilitado para {verbo} "
             f"({_lista(quien)} est{'án' if len(quien) > 1 else 'á'}, pero no puede{'n' if len(quien) > 1 else ''}).")
    ausentes = sorted({e.nombre for e in dia.ausentes[paso] if _habilitado(e, tipo)})
    if ausentes:
        texto += f" {_lista(ausentes)} tenía{'n' if len(ausentes) > 1 else ''} que hacerlo, pero no va{'n' if len(ausentes) > 1 else ''} a venir."
    posibles = [e for e in dia.posibles[paso] if _habilitado(e, tipo)]
    causa = None if posibles else _causa_habilitados(dia, tipo, paso)
    return Problema(tipo=tipo, fecha=dia.d, tramos=[(paso, paso + dia.res)], texto=texto, ausentes=ausentes,
                    arreglable=bool(posibles), causa=causa)


def problemas(config: Config, horario: Schedule, desde: Optional[dt.date] = None) -> list[Problema]:
    """Problemas críticos del horario, por día (desde 'desde', si se indica)."""
    config_bloqueos = with_locks(config, horario.bloqueos)
    out: list[Problema] = []
    for d in daterange(max(horario.desde, desde or horario.desde), horario.hasta):
        dia = _Dia(config, config_bloqueos, horario, d)
        if not dia.pasos:
            continue
        for p in (_sin_nadie(dia), _extremo(dia, TipoCritico.apertura_sin_habilitado),
                  _extremo(dia, TipoCritico.cierre_sin_habilitado)):
            if p:
                out.append(p)
    return out
