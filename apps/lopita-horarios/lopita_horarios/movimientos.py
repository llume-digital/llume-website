"""Mover un turno a otra persona y/u otro día (arrastrar y soltar en el cuadrante).

Se mueve la asignación entera (turno, horas a medida, puesto y rol si sigue valiendo). Si la casilla de destino ya
tiene turno, los dos se intercambian. Las reglas duras de la casilla de destino se comprueban aquí: ausencias,
libranzas fijas, días libres pedidos, puesto del turno, quién abre o cierra y las horas en que puede trabajar cada
persona. Las dos casillas que cambian quedan bloqueadas, como cualquier cambio manual.

Es dominio puro y determinista.
"""
from __future__ import annotations

import datetime as dt
from typing import NamedTuple, Optional

from .edicion import EdicionInvalida, NOMBRE_PUESTO, _DIAS, rol_manual, verificar_libranza
from .models import Assignment, Config, Lock, Schedule


class Casilla(NamedTuple):
    empleado_id: str
    fecha: dt.date


def _fecha(f: dt.date) -> str:
    return f"{_DIAS[f.weekday()]} {f.day}/{f.month}"


def comprobar_destino(config: Config, desde: dt.date, hasta: dt.date, a: Assignment) -> None:
    """Lanza EdicionInvalida si esa asignación no se puede hacer en su persona y día."""
    emp = config.employee(a.empleado_id)
    d = a.fecha
    if not desde <= d <= hasta:
        raise EdicionInvalida(f"El {_fecha(d)} está fuera del periodo del horario")
    if not emp.activo:
        raise EdicionInvalida(f"{emp.nombre} ya no está en la plantilla")
    ausencia = config.is_absent(emp.id, d)
    if ausencia:
        raise EdicionInvalida(f"{emp.nombre} está de {ausencia.motivo} el {_fecha(d)}")
    o = config.override_for(emp.id, d)
    if o and o.tipo == "libre":
        raise EdicionInvalida(f"{emp.nombre} pidió librar el {_fecha(d)}")
    verificar_libranza(config, emp, d)
    if config.day_type_for(d).cerrado:
        raise EdicionInvalida(f"El local está cerrado el {_fecha(d)}")
    s = config.turno_de(a)
    if not s.available_on(d):
        raise EdicionInvalida(f"El turno {s.nombre} no existe el {_DIAS[d.weekday()]}")
    if s.tipo.value == "apertura" and not emp.puede_abrir:
        raise EdicionInvalida(f"{emp.nombre} no está habilitado para abrir")
    if s.tipo.value == "cierre" and not emp.puede_cerrar:
        raise EdicionInvalida(f"{emp.nombre} no está habilitado para cerrar")
    if s.puesto is not None and s.puesto not in emp.puestos:
        raise EdicionInvalida(f"{emp.nombre} no trabaja en {NOMBRE_PUESTO[s.puesto]}, y ese turno es de "
                              f"{NOMBRE_PUESTO[s.puesto]}")
    if a.puesto is not None and a.puesto not in emp.puestos:
        raise EdicionInvalida(f"{emp.nombre} no trabaja en {NOMBRE_PUESTO[a.puesto]}")
    if not emp.cabe_en_franja(s.start_min, s.end_min, d):
        raise EdicionInvalida(f"{emp.nombre} no puede hacer {s.inicio}–{s.fin} el {_DIAS[d.weekday()]}: "
                              "fuera de las horas en que puede trabajar")


def _trasladar(config: Config, a: Assignment, destino: Casilla) -> Assignment:
    """La misma asignación, en otra persona y día; el rol se conserva si la nueva persona puede hacerlo."""
    emp = config.employee(destino.empleado_id)
    puesto = a.puesto if a.puesto in emp.puestos else None
    nuevo = a.model_copy(update={"empleado_id": destino.empleado_id, "fecha": destino.fecha, "puesto": puesto})
    if puesto is None:
        puesto = config.puesto_de(a) if config.puesto_de(a) in emp.puestos else emp.puesto_principal
        nuevo.puesto = puesto
    try:
        nuevo.funcion = rol_manual(config, emp, destino.fecha, puesto, a.funcion, None)
    except EdicionInvalida:
        nuevo.funcion = rol_manual(config, emp, destino.fecha, puesto, None, None)
    return nuevo


def mover_turno(config: Config, horario: Schedule, origen: Casilla, destino: Casilla) -> Schedule:
    """Copia del horario con el turno de 'origen' en 'destino' (y el que hubiera allí, en 'origen')."""
    if origen == destino:
        raise EdicionInvalida("El turno ya está ahí")
    ids = {e.id for e in config.empleados}
    for c in (origen, destino):
        if c.empleado_id not in ids:
            raise EdicionInvalida(f"Persona desconocida: {c.empleado_id}")
    en = {(a.empleado_id, a.fecha): a for a in horario.asignaciones}
    a = en.get(origen)
    if a is None:
        raise EdicionInvalida("No hay ningún turno en la casilla de origen")
    b = en.get(destino)
    nueva_a = _trasladar(config, a, destino)
    comprobar_destino(config, horario.desde, horario.hasta, nueva_a)
    nueva_b: Optional[Assignment] = None
    if b is not None:
        nueva_b = _trasladar(config, b, origen)
        comprobar_destino(config, horario.desde, horario.hasta, nueva_b)

    quitar = {origen, destino}
    asignaciones = [x for x in horario.asignaciones if (x.empleado_id, x.fecha) not in quitar] + [nueva_a]
    if nueva_b is not None:
        asignaciones.append(nueva_b)
    asignaciones.sort(key=lambda x: (x.fecha, x.empleado_id))
    bloqueos = [l for l in horario.bloqueos if (l.empleado_id, l.fecha) not in quitar]
    bloqueos.append(Lock.de(nueva_a, destino.empleado_id, destino.fecha))
    bloqueos.append(Lock.de(nueva_b, origen.empleado_id, origen.fecha))
    return horario.model_copy(update={"asignaciones": asignaciones, "bloqueos": bloqueos}, deep=True)
