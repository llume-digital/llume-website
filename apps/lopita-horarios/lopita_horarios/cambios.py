"""Diferencias entre dos versiones de un horario, por persona y día (base de los avisos al equipo).

Cada casilla se describe con una firma de texto: el id del turno, sus horas si es un turno a medida, el puesto y
el rol si lo tiene (`tarde@16:00-21:30#sala/caja`). Así un cambio de horas, de puesto o de rol también cuenta.
"""
from __future__ import annotations

import datetime as dt
from typing import NamedTuple, Optional

from .models import Assignment, Puesto


class Cambio(NamedTuple):
    empleado_id: str
    fecha: dt.date
    antes: Optional[str]  # firmas de lo que tenía, separadas por comas (None = libraba)
    despues: Optional[str]  # firmas de lo que tiene ahora (None = libra)


class Firma(NamedTuple):
    turno_id: str
    inicio: Optional[str]
    fin: Optional[str]
    puesto: Optional[Puesto]
    funcion: Optional[str] = None


def firma(a: Assignment, con_puesto: bool = True) -> str:
    out = a.turno_id
    if a.inicio is not None:
        out += f"@{a.inicio}-{a.fin}"
    if con_puesto and (a.puesto is not None or a.funcion is not None):
        out += f"#{a.puesto.value if a.puesto else ''}"
        if a.funcion is not None:
            out += f"/{a.funcion}"
    return out


def leer_firma(texto: str) -> Firma:
    resto, _, cola = texto.partition("#")
    puesto, _, funcion = cola.partition("/")
    turno, _, horas = resto.partition("@")
    inicio, _, fin = horas.partition("-")
    return Firma(turno, inicio or None, fin or None, Puesto(puesto) if puesto else None, funcion or None)


def sin_puesto(firmas: Optional[str]) -> Optional[str]:
    """Las mismas firmas sin el puesto: para saber si es el mismo turno aunque se haga en otro puesto."""
    if firmas is None:
        return None
    return ",".join(x.partition("#")[0] for x in firmas.split(","))


def describir(turnos: dict, texto: str, funciones: Optional[dict] = None) -> str:
    """Firma en palabras: «Tarde (16:00–21:30, sala, Caja)». turnos: id -> Shift; funciones: id -> nombre."""
    f = leer_firma(texto)
    s = turnos.get(f.turno_id)
    if not s:
        return f.turno_id
    horas = f"{f.inicio or s.inicio}–{f.fin or s.fin}"
    rol = (funciones or {}).get(f.funcion, f.funcion) if f.funcion else None
    return f"{s.nombre} ({horas}{', ' + f.puesto.value if f.puesto else ''}{', ' + rol if rol else ''})"


def asignacion(empleado_id: str, fecha: dt.date, texto: str) -> Assignment:
    f = leer_firma(texto)
    return Assignment(empleado_id=empleado_id, fecha=fecha, turno_id=f.turno_id, inicio=f.inicio, fin=f.fin,
                      puesto=f.puesto, funcion=f.funcion)


def _iguales(a: list[Assignment], b: list[Assignment]) -> bool:
    """Mismos turnos, horas y roles; el puesto solo se compara si las dos versiones lo dicen.

    Los horarios hechos antes de que hubiera puestos no lo guardan: no se considera un cambio que ahora sí lo digan.
    El rol sí se compara siempre: pasar a tener rol (o cambiarlo) es algo que la persona tiene que saber.
    """
    if sorted(firma(x, con_puesto=False) for x in a) != sorted(firma(x, con_puesto=False) for x in b):
        return False
    if sorted(x.funcion or "" for x in a) != sorted(x.funcion or "" for x in b):
        return False
    if any(x.puesto is None for x in a + b):
        return True
    return sorted(firma(x) for x in a) == sorted(firma(x) for x in b)


def diferencias(antes: list[Assignment], despues: list[Assignment]) -> list[Cambio]:
    """Casillas (persona, día) cuyo turno, horas o puesto son distintos, ordenadas por fecha y persona.

    Si alguien tuviera dos turnos el mismo día (error que el validador señala), se compara el conjunto.
    """
    def indexar(items: list[Assignment]) -> dict[tuple[str, dt.date], list[Assignment]]:
        out: dict[tuple[str, dt.date], list[Assignment]] = {}
        for a in items:
            out.setdefault((a.empleado_id, a.fecha), []).append(a)
        return out

    a, b = indexar(antes), indexar(despues)
    cambios = []
    for clave in sorted(set(a) | set(b), key=lambda k: (k[1], k[0])):
        ta, tb = a.get(clave, []), b.get(clave, [])
        if not _iguales(ta, tb):
            cambios.append(Cambio(clave[0], clave[1], ",".join(sorted(firma(x) for x in ta)) or None,
                                  ",".join(sorted(firma(x) for x in tb)) or None))
    return cambios
