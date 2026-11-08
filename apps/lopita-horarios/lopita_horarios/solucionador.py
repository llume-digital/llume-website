"""Solucionador de alertas: ajusta un horario ya hecho tocando lo mínimo para arreglar sus problemas.

A diferencia de regenerar, parte del horario actual y cada casilla que cambia tiene un coste
(`pesos.cambio_turno`), así que solo se mueve lo que compensa: pasar un turno de quien va sobrado
de horas a quien va corto, cubrir un hueco, quitar un turno que cae en una ausencia aprobada...
Las reglas duras se siguen cumpliendo y los cambios manuales del encargado (bloqueos) no se tocan.

El resultado es una propuesta: qué casillas cambian, explicadas en palabras, cómo quedan las horas
de cada persona y qué alertas se resuelven o aparecen. Solo se propone si el horario mejora de
verdad (menos reglas incumplidas, menos alertas graves o menos importancia total). Aplicarla es un
paso aparte (`aplicar`), que comprueba que el horario no ha cambiado desde que se calculó.

Es dominio puro y no usa el reloj: quien llama decide desde qué día se puede cambiar.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

from pydantic import BaseModel, Field

from .alertas import Alerta, evaluar, resumen
from .cambios import asignacion, describir, diferencias, firma, sin_puesto
from .models import Assignment, Config, Lock, Schedule
from .plantilla import SemanaPlantilla, capacidad_minutos, semanas
from .planning import daterange, target_minutes, with_locks
from .solver import SolveOptions, generate
from .sugerencias import Sugerencia, sugerir
from .validator import compute_stats, validate

_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


class CambioPropuesto(BaseModel):
    """Una casilla que cambia. antes/despues son firmas de turno (ver cambios.py); None = libra."""
    empleado_id: str
    fecha: dt.date
    antes: Optional[str] = None
    despues: Optional[str] = None


class Movimiento(BaseModel):
    """Uno o varios cambios del mismo día explicados juntos (p. ej. un turno que pasa de una persona a otra)."""
    fecha: dt.date
    texto: str
    empleados: list[str]


class HorasPersona(BaseModel):
    empleado_id: str
    objetivo: float
    antes: float
    despues: float


class Propuesta(BaseModel):
    desde: dt.date = Field(description="Primer día que se ha permitido cambiar")
    estado_solver: Optional[str] = None
    mejora: bool = Field(description="Si hay cambios que dejan el horario mejor que antes")
    mensaje: str
    cambios: list[CambioPropuesto] = Field(default_factory=list)
    movimientos: list[Movimiento] = Field(default_factory=list)
    horas: list[HorasPersona] = Field(default_factory=list)
    errores_antes: int = 0
    errores_despues: int = 0
    alertas_antes: dict[str, int] = Field(default_factory=dict)
    alertas_despues: dict[str, int] = Field(default_factory=dict)
    resueltas: list[Alerta] = Field(default_factory=list)
    mejoradas: list[Alerta] = Field(default_factory=list, description="Siguen, pero con menos importancia (versión nueva)")
    nuevas: list[Alerta] = Field(default_factory=list)
    empeoradas: list[Alerta] = Field(default_factory=list, description="Siguen, pero con más importancia (versión nueva)")
    motivos: list[str] = Field(default_factory=list, description="Por qué quedan problemas que no se pueden arreglar así")
    plantilla: list[SemanaPlantilla] = Field(default_factory=list, description="Demanda frente a plantilla, por semana")
    sugerencias: list[Sugerencia] = Field(default_factory=list, description="Cambios de configuración para lo que queda")


class HorarioCambiado(Exception):
    """El horario ya no es el que se usó para calcular la propuesta."""


# ---------------------------------------------------------------------------
# Utilidades compartidas con la regeneración
# ---------------------------------------------------------------------------
def congelar_antes(config: Config, horario: Schedule, desde: dt.date) -> list[Lock]:
    """Bloqueos que mantienen igual todo lo anterior a 'desde' (turnos y días libres), salvo donde ya no cuadra.

    No se congelan las casillas con un bloqueo manual (ya se respetan) ni las de una persona ausente
    (si tenía turno, ese turno ya no es válido y tiene que poder desaparecer).
    """
    bloqueadas = {(b.empleado_id, b.fecha) for b in horario.bloqueos}
    trabaja = {(a.empleado_id, a.fecha): a for a in horario.asignaciones}
    out = []
    for e in config.active_employees():
        for d in daterange(horario.desde, min(desde - dt.timedelta(days=1), horario.hasta)):
            if (e.id, d) not in bloqueadas and not config.is_absent(e.id, d):
                out.append(Lock.de(trabaja.get((e.id, d)), e.id, d))
    return out


def _fecha(d: dt.date) -> str:
    return f"{_DIAS[d.weekday()]} {d.day:02d}/{d.month:02d}"


def _horas(x: float) -> str:
    return f"{round(x, 1):g}".replace(".", ",")


def gravedad(config: Config, h: Schedule, previo: Optional[list[Assignment]]) -> tuple[int, list[Alerta]]:
    errores = sum(1 for i in validate(config, h.desde, h.hasta, h.asignaciones, previo=previo,
                                      saldo_horas=h.saldo_anterior, bloqueos=h.bloqueos) if i.nivel == "error")
    return errores, evaluar(config, h, previo)


# Alertas que el motor también intenta evitar (además de cobertura y horas), para explicar por qué quedan.
_BUSCADAS_POR_EL_MOTOR = {"racha_larga", "reparto_horas", "reparto_fines_semana",
                          "reparto_cierres", "saldo_desbordado"}
_HORAS_PERIODO = {"horas_extra", "regla_extra_excedida", "horas_por_debajo", "sin_turnos"}


def _tema(a: Alerta) -> str:
    """Qué problema describe una alerta, para emparejarla antes y después de los cambios.

    Las horas de una persona en el periodo son un solo problema aunque cambie de nombre: pasar de horas
    extra por encima del tope (regla dura) a horas extra dentro de él, o de pocas horas a un poco de más,
    cuenta como una mejora de su alerta de horas y no como una alerta nueva.
    """
    if a.codigo in _HORAS_PERIODO and a.empleado_id:
        return f"horas:{a.empleado_id}"
    return a.clave


def _peor(a: Alerta, b: Alerta) -> bool:
    """Si a es más grave que b (versiones de la misma alerta)."""
    return (a.categoria == "reglas", a.importancia) > (b.categoria == "reglas", b.importancia)


class Comparacion(BaseModel):
    """Cómo cambian las alertas de un horario de una versión a otra."""
    resueltas: list[Alerta] = Field(default_factory=list)
    mejoradas: list[Alerta] = Field(default_factory=list, description="Siguen, pero con menos importancia (versión nueva)")
    nuevas: list[Alerta] = Field(default_factory=list)
    empeoradas: list[Alerta] = Field(default_factory=list, description="Siguen, pero con más importancia (versión nueva)")


def comparar(antes: list[Alerta], despues: list[Alerta]) -> Comparacion:
    por_tema = {_tema(a): a for a in antes}
    temas_despues = {_tema(a) for a in despues}
    return Comparacion(
        resueltas=[a for a in antes if _tema(a) not in temas_despues],
        mejoradas=[a for a in despues if _tema(a) in por_tema and _peor(por_tema[_tema(a)], a)],
        nuevas=[a for a in despues if _tema(a) not in por_tema],
        empeoradas=[a for a in despues if _tema(a) in por_tema and _peor(a, por_tema[_tema(a)])],
    )


def _puntuacion(errores: int, alertas: list[Alerta]) -> tuple[int, int, int, int]:
    """Cuanto menor, mejor: primero las reglas incumplidas, luego las alertas críticas y altas, luego el total."""
    r = resumen(alertas)
    return errores, r["critica"], r["alta"], sum(a.importancia for a in alertas)


# ---------------------------------------------------------------------------
# Explicaciones
# ---------------------------------------------------------------------------
def movimientos(config: Config, cambios: list[CambioPropuesto]) -> list[Movimiento]:
    """Explica los cambios en palabras, juntando el mismo turno que una persona deja y otra coge el mismo día."""
    nombre = {e.id: e.nombre for e in config.empleados}
    turnos = {s.id: s for s in config.turnos}
    roles = {f.id: f.nombre for f in config.funciones}
    t = lambda firmas: " + ".join(describir(turnos, x, roles) for x in firmas.split(","))  # noqa: E731
    out = []
    for fecha in sorted({c.fecha for c in cambios}):
        del_dia = [c for c in cambios if c.fecha == fecha]
        quedan = list(del_dia)
        for deja in [c for c in del_dia if c.antes and not c.despues]:
            coge = next((c for c in quedan if not c.antes and sin_puesto(c.despues) == sin_puesto(deja.antes)), None)
            if coge and deja in quedan:
                quedan.remove(deja)
                quedan.remove(coge)
                out.append(Movimiento(
                    fecha=fecha, empleados=[deja.empleado_id, coge.empleado_id],
                    texto=f"{_fecha(fecha)}: el turno {t(deja.antes)} pasa de {nombre[deja.empleado_id]} "
                          f"a {nombre[coge.empleado_id]}."))
        for a in [c for c in quedan if c.antes and c.despues]:
            b = next((c for c in quedan if c is not a and sin_puesto(c.antes) == sin_puesto(a.despues)
                      and sin_puesto(c.despues) == sin_puesto(a.antes)), None)
            if b and a in quedan:
                quedan.remove(a)
                quedan.remove(b)
                out.append(Movimiento(
                    fecha=fecha, empleados=[a.empleado_id, b.empleado_id],
                    texto=f"{_fecha(fecha)}: {nombre[a.empleado_id]} y {nombre[b.empleado_id]} se cambian el turno "
                          f"({nombre[a.empleado_id]} pasa a {t(a.despues)} y {nombre[b.empleado_id]} a {t(b.despues)})."))
        for c in quedan:
            quien = nombre.get(c.empleado_id, c.empleado_id)
            if c.antes and c.despues:
                texto = f"{_fecha(fecha)}: {quien} cambia de {t(c.antes)} a {t(c.despues)}."
            elif c.antes:
                texto = f"{_fecha(fecha)}: {quien} libra (tenía {t(c.antes)})."
            else:
                texto = f"{_fecha(fecha)}: {quien} trabaja de {t(c.despues)} (antes libraba)."
            out.append(Movimiento(fecha=fecha, empleados=[c.empleado_id], texto=texto))
    return out


def _motivos(config: Config, h: Schedule, despues: list[Alerta], cambiable_desde: dt.date) -> list[str]:
    out = []
    dias = daterange(h.desde, h.hasta)
    config_bloq = with_locks(config, h.bloqueos)
    for a in despues:
        if a.codigo not in ("horas_por_debajo", "sin_turnos") or not a.empleado_id:
            continue
        e = config.employee(a.empleado_id)
        objetivo = max(0, target_minutes(config, e, dias) - h.saldo_anterior.get(e.id, 0) * 60)
        tope = capacidad_minutos(config_bloq, e.id, dias)
        if tope < objetivo - config.reglas.margen_periodo_horas * 60:
            out.append(f"{e.nombre} no puede llegar a las {_horas(objetivo / 60)} h que le tocan: con sus libranzas, "
                       f"el descanso semanal y los turnos que puede hacer, como mucho suma unas {_horas(tope / 60)} h.")
    extra = [config.employee(a.empleado_id).nombre for a in despues
             if a.codigo in ("horas_extra", "regla_extra_excedida") and a.empleado_id]
    if extra:
        quien = extra[0] if len(extra) == 1 else ", ".join(extra[:-1]) + " y " + extra[-1]
        out.append(f"Las horas de más de {quien} no se pueden pasar a otra persona sin dejar franjas sin cubrir "
                   f"o crear un problema mayor (libranzas, descansos, quién puede abrir o cerrar).")
    otras = list(dict.fromkeys(a.titulo.lower() for a in despues if a.codigo in _BUSCADAS_POR_EL_MOTOR))
    if otras:
        quedan = otras[0] if len(otras) == 1 else ", ".join(otras[:-1]) + " y " + otras[-1]
        out.append(f"Quedan alertas de {quedan} porque arreglarlas dejaría franjas sin cubrir u otro problema mayor.")
    macro = [a for a in despues if a.categoria == "plantilla"]
    if macro:
        n = len(macro)
        out.append(f"Hay {n} alerta{'s' if n > 1 else ''} de plantilla (falta o sobra de personal frente a la demanda): "
                   f"no se arregla{'n' if n > 1 else ''} moviendo turnos, sino contratando, ajustando jornadas, "
                   f"moviendo libranzas o vacaciones, o revisando la demanda.")
    if any(a.codigo == "plantilla_sobrante" for a in despues) and any(a.codigo == "falta_cobertura" for a in despues):
        out.append("En conjunto sobran horas de contrato y aun así quedan franjas sin cubrir: el problema no es cuánta "
                   "gente hay, sino cuándo puede trabajar cada uno (libranzas fijas, quién puede abrir o cerrar, "
                   "horario de los turnos).")
    manuales = [b for b in h.bloqueos if b.fecha >= cambiable_desde]
    if manuales:
        n = len(manuales)
        out.append(f"Hay {n} cambio{'s' if n > 1 else ''} manual{'es' if n > 1 else ''} bloqueado{'s' if n > 1 else ''} "
                   f"que no se toca{'n' if n > 1 else ''}; si alguno causa una alerta, quita el bloqueo y vuelve a probar.")
    if cambiable_desde > h.desde:
        out.append(f"Los días anteriores al {_fecha(cambiable_desde)} no se cambian.")
    return out


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------
def solucionar(config: Config, horario: Schedule, previo: Optional[list[Assignment]] = None,
               desde: Optional[dt.date] = None, opciones: Optional[SolveOptions] = None) -> Propuesta:
    """Propone el menor conjunto de cambios que deja el horario mejor (o dice por qué no lo hay).

    desde: primer día que se puede cambiar (los anteriores se mantienen); por defecto, todo el periodo.
    """
    desde = max(desde or horario.desde, horario.desde)
    errores_antes, antes = gravedad(config, horario, previo)
    base = dict(desde=desde, errores_antes=errores_antes, errores_despues=errores_antes,
                alertas_antes=resumen(antes), alertas_despues=resumen(antes),
                plantilla=semanas(with_locks(config, horario.bloqueos), horario.desde, horario.hasta))
    if desde > horario.hasta:
        return Propuesta(mejora=False, mensaje="No queda ningún día del horario que se pueda cambiar.", **base)

    nuevo = generate(config, horario.desde, horario.hasta, opciones, previo=previo,
                     bloqueos=horario.bloqueos + congelar_antes(config, horario, desde),
                     saldo_horas=horario.saldo_anterior, referencia=horario.asignaciones)
    if not nuevo.asignaciones and horario.asignaciones:
        return Propuesta(mejora=False, estado_solver=nuevo.estado_solver, **base,
                         motivos=_motivos(config, horario, [], desde),
                         mensaje="No hay forma de cumplir las reglas duras sin tocar los cambios manuales bloqueados "
                                 "o los días que no se pueden cambiar. Revisa los bloqueos o regenera el horario.")

    propuesto = horario.model_copy(update={"asignaciones": nuevo.asignaciones})
    cambios = [CambioPropuesto(empleado_id=c.empleado_id, fecha=c.fecha, antes=c.antes, despues=c.despues)
               for c in diferencias(horario.asignaciones, nuevo.asignaciones)]
    errores_despues, despues = gravedad(config, propuesto, previo)
    if not cambios or _puntuacion(errores_despues, despues) >= _puntuacion(errores_antes, antes):
        return Propuesta(mejora=False, estado_solver=nuevo.estado_solver, **base,
                         motivos=_motivos(config, horario, antes, desde), sugerencias=sugerir(config, horario, antes),
                         mensaje="No hay cambios que mejoren el horario sin empeorar otra cosa (cobertura, reglas u horas).")

    tocados = {c.empleado_id for c in cambios}
    stats = lambda h: {s.empleado_id: s for s in compute_stats(config, h.desde, h.hasta, h.asignaciones, h.saldo_anterior)}  # noqa: E731
    st_antes, st_despues = stats(horario), stats(propuesto)
    n = len(cambios)
    return Propuesta(
        desde=desde, estado_solver=nuevo.estado_solver, mejora=True, plantilla=base["plantilla"],
        mensaje=f"Propongo {n} cambio{'s' if n > 1 else ''} que mejora{'n' if n > 1 else ''} el horario.",
        cambios=cambios, movimientos=movimientos(config, cambios),
        horas=[HorasPersona(empleado_id=e.id, objetivo=st_despues[e.id].horas_objetivo,
                            antes=st_antes[e.id].horas, despues=st_despues[e.id].horas)
               for e in config.active_employees() if e.id in tocados and e.id in st_antes],
        errores_antes=errores_antes, errores_despues=errores_despues,
        alertas_antes=resumen(antes), alertas_despues=resumen(despues),
        **dict(comparar(antes, despues)),
        motivos=_motivos(config, propuesto, despues, desde), sugerencias=sugerir(config, propuesto, despues),
    )


def aplicar(horario: Schedule, cambios: list[CambioPropuesto]) -> Schedule:
    """Devuelve una copia del horario con los cambios aplicados.

    Lanza HorarioCambiado si alguna casilla ya no tiene el turno de 'antes' (alguien lo ha editado
    después de calcular la propuesta) o si un cambio cae fuera del periodo.
    """
    actual: dict[tuple[str, dt.date], set[str]] = {}
    for a in horario.asignaciones:
        actual.setdefault((a.empleado_id, a.fecha), set()).add(firma(a))
    for c in cambios:
        if not horario.desde <= c.fecha <= horario.hasta:
            raise HorarioCambiado(f"El cambio del {c.fecha} está fuera del periodo del horario")
        if actual.get((c.empleado_id, c.fecha), set()) != set((c.antes or "").split(",")) - {""}:
            raise HorarioCambiado("El horario ha cambiado desde que se calculó la propuesta")
    tocadas = {(c.empleado_id, c.fecha) for c in cambios}
    nuevas = [a for a in horario.asignaciones if (a.empleado_id, a.fecha) not in tocadas]
    nuevas += [asignacion(c.empleado_id, c.fecha, t) for c in cambios if c.despues for t in c.despues.split(",")]
    nuevas.sort(key=lambda a: (a.fecha, a.empleado_id))
    return horario.model_copy(update={"asignaciones": nuevas}, deep=True)
