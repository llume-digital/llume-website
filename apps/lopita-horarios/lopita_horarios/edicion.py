"""Edición manual de un día (vista diaria): aplicar los tramos que dibuja el encargado y evaluar el resultado.

El encargado mueve, alarga, acorta, quita o añade tramos (persona, hora de inicio, hora de fin, puesto, rol). Cada tramo
se guarda como un turno: el turno definido que mejor encaja con esas horas y, si no coinciden del todo, con horas
a medida. Las casillas que cambian quedan bloqueadas, como cualquier cambio manual, para que regenerar o
solucionar alertas las respete.

Evaluar no guarda nada: compara reglas incumplidas y alertas antes y después de los cambios, para que el
encargado decida si los guarda y publica.

Es dominio puro y determinista.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from .alertas import Alerta, es_critica, resumen
from .cambios import diferencias, firma
from .models import Assignment, Config, Employee, Lock, Puesto, Schedule, Shift, parse_hhmm
from .planning import role_posts
from .solucionador import CambioPropuesto, HorasPersona, Movimiento, comparar, gravedad, movimientos
from .validator import compute_stats, validate


class Tramo(BaseModel):
    """Lo que hace una persona un día, tal como lo deja el encargado en la vista diaria."""
    empleado_id: str
    inicio: str
    fin: str
    puesto: Optional[Puesto] = None
    funcion: Optional[str] = Field(default=None, description="Rol (caja, cafetera...); vacío = el que tenía, '' = sin rol")
    turno_id: Optional[str] = Field(default=None, description="Turno base que tenía, si se ha movido un tramo existente")

    @model_validator(mode="after")
    def _check(self) -> "Tramo":
        if parse_hhmm(self.fin) <= parse_hhmm(self.inicio):
            raise ValueError("Un tramo debe terminar después de empezar")
        return self


class EdicionInvalida(ValueError):
    """Los tramos no se pueden aplicar tal cual (persona desconocida, dos tramos, puesto que no tiene...)."""


class Evaluacion(BaseModel):
    fecha: dt.date
    cambios: list[CambioPropuesto] = Field(default_factory=list)
    movimientos: list[Movimiento] = Field(default_factory=list)
    horas: list[HorasPersona] = Field(default_factory=list)
    errores_antes: int = 0
    errores_despues: int = 0
    reglas_nuevas: list[str] = Field(default_factory=list, description="Reglas que los cambios dejan incumplidas")
    alertas_antes: dict[str, int] = Field(default_factory=dict)
    alertas_despues: dict[str, int] = Field(default_factory=dict)
    resueltas: list[Alerta] = Field(default_factory=list)
    mejoradas: list[Alerta] = Field(default_factory=list)
    nuevas: list[Alerta] = Field(default_factory=list)
    empeoradas: list[Alerta] = Field(default_factory=list)
    criticas: list[Alerta] = Field(default_factory=list, description="Alertas críticas que quedan tras los cambios")


def turno_base(config: Config, empleado_id: str, fecha: dt.date, inicio: str, fin: str,
               preferido: Optional[str] = None, puesto: Optional[Puesto] = None) -> Shift:
    """El turno definido que mejor encaja con esas horas: el que más se solapa y, a igualdad, el más parecido.

    Solo se eligen turnos que existen ese día y que la persona puede hacer (abrir o cerrar); si no hay ninguno,
    cualquiera que exista. A igualdad, se queda el que ya tenía (preferido).
    """
    emp = config.employee(empleado_id)
    a, b = parse_hhmm(inicio), parse_hhmm(fin)
    del_dia = [s for s in config.turnos if s.available_on(fecha)] or list(config.turnos)
    if not del_dia:
        raise EdicionInvalida("No hay ningún turno definido: crea alguno en Turnos")
    puesto_vale = lambda s: s.puesto is None or (s.puesto in emp.puestos and puesto in (None, s.puesto))  # noqa: E731
    puede = [s for s in del_dia if (s.tipo.value != "apertura" or emp.puede_abrir)
             and (s.tipo.value != "cierre" or emp.puede_cerrar) and puesto_vale(s)] or del_dia

    def encaje(s: Shift) -> tuple[int, int, bool]:
        solape = max(0, min(b, s.end_min) - max(a, s.start_min))
        return -solape, abs(s.start_min - a) + abs(s.end_min - b), s.id != preferido

    return min(puede, key=encaje)


def rol_manual(config: Config, emp: Employee, fecha: dt.date, puesto: Puesto, pedido: Optional[str],
               previa: Optional[Assignment]) -> Optional[str]:
    """Rol de un turno que pone el encargado a mano.

    pedido: el rol que elige; '' = sin rol; None = el que tenía si le sigue valiendo o, si ese día se reparten los
    roles de su puesto, su rol principal. Un rol que no es suyo o que no es de ese puesto no se admite.
    """
    if pedido == "":
        return None
    validos = config.roles_de(emp, puesto)
    if pedido is not None:
        f = next((f for f in config.funciones if f.id == pedido), None)
        if f is None or not f.es_rol:
            raise EdicionInvalida(f"«{pedido}» no es un rol de ningún puesto")
        if f.puesto != puesto:
            raise EdicionInvalida(f"«{f.nombre}» es un rol de {f.puesto.value}, no de {puesto.value}")
        if f.id not in validos:
            raise EdicionInvalida(f"{emp.nombre} no puede hacer «{f.nombre}»: dale ese rol en Funciones")
        return f.id
    if previa is not None and previa.funcion in validos:
        return previa.funcion
    return validos[0] if validos and puesto in role_posts(config, fecha) else None


NOMBRE_PUESTO = {Puesto.cocina: "cocina", Puesto.sala: "camarero"}
_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def verificar_libranza(config: Config, emp: Employee, fecha: dt.date) -> None:
    """Una libranza fija no se salta a mano: solo la excepción «trabaja ese día» de Ausencias la levanta."""
    o = config.override_for(emp.id, fecha)
    if fecha.weekday() in emp.fixed_off_indexes() and not (o and o.tipo == "trabaja"):
        raise EdicionInvalida(f"{emp.nombre} libra los {_DIAS[fecha.weekday()]} (libranza fija). Cámbiala en Equipo "
                              "si ya no es así, o apunta en Ausencias que ese día trabaja.")


def puesto_para_turno(config: Config, emp: Employee, turno: Shift, pedido: Optional[Puesto],
                      previa: Optional[Assignment]) -> Puesto:
    """Puesto de una asignación manual: un turno de cocina o de camarero solo se hace en su puesto."""
    if turno.puesto is not None:
        if pedido is not None and pedido != turno.puesto:
            raise EdicionInvalida(f"El turno {turno.nombre} es de {NOMBRE_PUESTO[turno.puesto]}: no se puede hacer "
                                  f"en {NOMBRE_PUESTO[pedido]}")
        if turno.puesto not in emp.puestos:
            raise EdicionInvalida(f"{emp.nombre} no trabaja en {NOMBRE_PUESTO[turno.puesto]}, y el turno "
                                  f"{turno.nombre} es de {NOMBRE_PUESTO[turno.puesto]}")
        return turno.puesto
    if pedido is not None and pedido not in emp.puestos:
        raise EdicionInvalida(f"{emp.nombre} no trabaja en {NOMBRE_PUESTO[pedido]}")
    return pedido or (previa.puesto if previa and previa.puesto in emp.puestos else emp.puesto_principal)


def _asignacion(config: Config, fecha: dt.date, t: Tramo, previa: Optional[Assignment]) -> Assignment:
    emp = config.employee(t.empleado_id)
    if previa is None:
        verificar_libranza(config, emp, fecha)
    base = turno_base(config, t.empleado_id, fecha, t.inicio, t.fin, t.turno_id or (previa.turno_id if previa else None), t.puesto)
    puesto = puesto_para_turno(config, emp, base, t.puesto, previa)
    a_medida = (t.inicio, t.fin) != (base.inicio, base.fin)
    funcion = rol_manual(config, emp, fecha, puesto, t.funcion, previa)
    return Assignment(empleado_id=t.empleado_id, fecha=fecha, turno_id=base.id, puesto=puesto, funcion=funcion,
                      inicio=t.inicio if a_medida else None, fin=t.fin if a_medida else None)


def aplicar_dia(config: Config, horario: Schedule, fecha: dt.date, tramos: list[Tramo]) -> Schedule:
    """Copia del horario con el día 'fecha' tal como lo describen los tramos (uno por persona que trabaja).

    Quien no aparece en los tramos libra ese día. Las casillas que cambian quedan bloqueadas; las demás
    conservan su bloqueo, si lo tenían.
    """
    if not horario.desde <= fecha <= horario.hasta:
        raise EdicionInvalida("La fecha está fuera del periodo del horario")
    ids = {e.id for e in config.empleados}
    vistos: set[str] = set()
    for t in tramos:
        if t.empleado_id not in ids:
            raise EdicionInvalida(f"Persona desconocida: {t.empleado_id}")
        if t.empleado_id in vistos:
            raise EdicionInvalida(f"{config.employee(t.empleado_id).nombre} tiene dos tramos el mismo día; "
                                  "de momento solo se admite un turno por persona y día")
        vistos.add(t.empleado_id)

    previas = {a.empleado_id: a for a in horario.asignaciones if a.fecha == fecha}
    nuevas = {t.empleado_id: _asignacion(config, fecha, t, previas.get(t.empleado_id)) for t in tramos}
    cambiadas = {e for e in set(previas) | set(nuevas)
                 if (firma(previas[e]) if e in previas else None) != (firma(nuevas[e]) if e in nuevas else None)}

    asignaciones = [a for a in horario.asignaciones if a.fecha != fecha] + [
        nuevas[e] if e in cambiadas else previas[e] for e in nuevas]
    asignaciones.sort(key=lambda a: (a.fecha, a.empleado_id))
    bloqueos = [b for b in horario.bloqueos if not (b.fecha == fecha and b.empleado_id in cambiadas)]
    bloqueos += [Lock.de(nuevas.get(e), e, fecha) for e in sorted(cambiadas)]
    return horario.model_copy(update={"asignaciones": asignaciones, "bloqueos": bloqueos}, deep=True)


def evaluar(config: Config, antes: Schedule, despues: Schedule, fecha: dt.date,
            previo: Optional[list[Assignment]] = None) -> Evaluacion:
    """Qué cambia, cómo quedan las horas de quien cambia y qué alertas y reglas aparecen o desaparecen."""
    cambios = [CambioPropuesto(empleado_id=c.empleado_id, fecha=c.fecha, antes=c.antes, despues=c.despues)
               for c in diferencias(antes.asignaciones, despues.asignaciones)]
    errores_antes, alertas_antes = gravedad(config, antes, previo)
    errores_despues, alertas_despues = gravedad(config, despues, previo)
    reglas = lambda h: {i.mensaje for i in validate(config, h.desde, h.hasta, h.asignaciones, previo=previo,  # noqa: E731
                                                     saldo_horas=h.saldo_anterior, bloqueos=h.bloqueos)
                        if i.nivel == "error"}
    stats = lambda h: {s.empleado_id: s for s in compute_stats(config, h.desde, h.hasta, h.asignaciones,  # noqa: E731
                                                               h.saldo_anterior)}
    st_antes, st_despues = stats(antes), stats(despues)
    tocados = {c.empleado_id for c in cambios}
    return Evaluacion(
        fecha=fecha, cambios=cambios, movimientos=movimientos(config, cambios),
        horas=[HorasPersona(empleado_id=e, objetivo=st_despues[e].horas_objetivo, antes=st_antes[e].horas,
                            despues=st_despues[e].horas) for e in sorted(tocados) if e in st_antes and e in st_despues],
        errores_antes=errores_antes, errores_despues=errores_despues,
        reglas_nuevas=sorted(reglas(despues) - reglas(antes)),
        alertas_antes=resumen(alertas_antes), alertas_despues=resumen(alertas_despues),
        **dict(comparar(alertas_antes, alertas_despues)),
        criticas=[a for a in alertas_despues if es_critica(a)],
    )
