"""Sistema de alertas para el encargado.

Evalúa un horario contra la configuración *actual* y devuelve una lista de alertas con una
importancia de 0 a 100 y una severidad derivada de ella. Es dominio puro: no sabe de bases de
datos, HTTP ni Slack, y es determinista (no usa el reloj).

Las alertas críticas son las que hacen que el horario no valga (ver criticas.py): un momento sin nadie en
el local, o sin nadie habilitado para abrir o para cerrar. Son las únicas con severidad «crítica»; el resto
se gradúa por importancia hasta «alta». No se pueden silenciar ni dar por vistas.

Familias de alertas:
- critica: el horario no vale tal cual (sin nadie, sin quien abra o sin quien cierre).
- reglas: reglas duras incumplidas (las mismas que impiden publicar).
- desfase: el horario ya no cuadra con la configuración (p. ej. se aprobó una ausencia después
  de generarlo). Indica desde qué día hay que regenerar.
- cobertura: franjas desatendidas, sin encargado, sin apertura o cierre, personal de más.
- horas: demasiadas o muy pocas horas respecto al contrato, semanas cortas, saldo que se desborda.
- reparto: desigualdad de horas, fines de semana y cierres entre personas.
- preferencias: personas que no están en su franja preferida.
- personal: rachas largas sin descanso.
- plantilla: en conjunto falta o sobra personal frente a la demanda (semanas o días concretos), aunque cada
  persona esté bien. No depende del horario: se arregla contratando, ajustando jornadas o la demanda.
"""
from __future__ import annotations

import datetime as dt
import hashlib
from collections import defaultdict
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from .models import Assignment, Config, Puesto, Schedule, fmt_hhmm
from . import criticas, plantilla
from .planning import (
    comodin_min_minutes,
    daterange,
    demand_for,
    function_presence,
    is_weekend,
    shift_steps,
    target_minutes,
    week_chunks,
    with_locks,
)
from .validator import compute_stats, validate


class Severidad(str, Enum):
    critica = "critica"
    alta = "alta"
    media = "media"
    baja = "baja"


class Categoria(str, Enum):
    critica = "critica"
    reglas = "reglas"
    desfase = "desfase"
    cobertura = "cobertura"
    horas = "horas"
    reparto = "reparto"
    preferencias = "preferencias"
    personal = "personal"
    contexto = "contexto"
    plantilla = "plantilla"


# Importancia mínima de cada severidad (de mayor a menor). «Crítica» no sale de la importancia: es solo para CRITICAS.
UMBRALES_SEVERIDAD = ((60, Severidad.alta), (35, Severidad.media), (0, Severidad.baja))

# Alertas con las que el horario no vale: no se pueden silenciar ni reconocer, y publicar con ellas pide confirmación.
CRITICAS: dict[str, str] = {
    criticas.TipoCritico.sin_nadie.value: "No hay nadie en el local",
    criticas.TipoCritico.apertura_sin_habilitado.value: "Nadie habilitado para abrir",
    criticas.TipoCritico.cierre_sin_habilitado.value: "Nadie habilitado para cerrar",
}

# Alertas que el encargado puede silenciar desde Reglas: código -> (categoría, descripción).
CATALOGO: dict[str, tuple[Categoria, str]] = {
    "falta_cobertura": (Categoria.cobertura, "Franjas sin cubrir"),
    "sin_encargado": (Categoria.cobertura, "Franjas sin encargado"),
    "falta_funcion": (Categoria.cobertura, "Franjas sin nadie con una función que se pide (p. ej. preparar pinchos o caja)"),
    "exceso_funcion": (Categoria.cobertura, "Más gente en un rol de la que permite su regla (p. ej. dos en lava)"),
    "exceso_personal": (Categoria.cobertura, "Personal de más en un día"),
    "sin_turnos": (Categoria.horas, "Persona sin ningún turno"),
    "horas_extra": (Categoria.horas, "Horas de más sobre el contrato"),
    "horas_por_debajo": (Categoria.horas, "Horas de menos sobre el contrato"),
    "semana_corta": (Categoria.horas, "Semana muy por debajo del contrato"),
    "saldo_desbordado": (Categoria.horas, "Saldo de horas que supera el máximo arrastrable"),
    "comodin_minimo": (Categoria.horas, "Comodín por debajo de su mínimo semanal"),
    "reparto_horas": (Categoria.reparto, "Horas mal repartidas entre personas"),
    "reparto_fines_semana": (Categoria.reparto, "Fines de semana mal repartidos"),
    "reparto_cierres": (Categoria.reparto, "Cierres mal repartidos"),
    "preferencias": (Categoria.preferencias, "Personas fuera de su franja preferida"),
    "racha_larga": (Categoria.personal, "Demasiados días seguidos trabajando"),
    "plantilla_insuficiente": (Categoria.plantilla, "Falta personal aunque todos hagan horas extra"),
    "plantilla_justa": (Categoria.plantilla, "Hace falta tirar de horas extra para cubrir la demanda"),
    "plantilla_sobrante": (Categoria.plantilla, "Sobra personal frente a la demanda"),
    "dia_sin_personal": (Categoria.plantilla, "Días sin bastantes personas disponibles"),
    "dia_sin_habilitados": (Categoria.plantilla, "Días sin nadie disponible que pueda abrir o cerrar"),
}

_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


class Alerta(BaseModel):
    clave: str = Field(description="Identificador estable: la misma incidencia conserva la clave entre evaluaciones")
    huella: str = Field(description="Resumen del contenido; si cambia, una alerta reconocida vuelve a avisar")
    codigo: str
    categoria: Categoria
    severidad: Severidad
    importancia: int = Field(ge=0, le=100)
    titulo: str
    detalle: str
    sugerencia: Optional[str] = None
    fecha: Optional[dt.date] = None
    fecha_fin: Optional[dt.date] = None
    fechas: list[dt.date] = Field(default_factory=list)
    empleado_id: Optional[str] = None
    regenerar_desde: Optional[dt.date] = Field(default=None, description="Si la alerta se arregla regenerando, desde qué día")
    silenciable: bool = True


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def severidad_de(importancia: int) -> Severidad:
    return next(s for minimo, s in UMBRALES_SEVERIDAD if importancia >= minimo)


def _escala(x: float, x0: float, x1: float, y0: float, y1: float) -> int:
    """Interpolación lineal de x en [x0, x1] a [y0, y1], saturada en los extremos."""
    if x1 == x0:
        return round(y1)
    t = min(1.0, max(0.0, (x - x0) / (x1 - x0)))
    return round(y0 + t * (y1 - y0))


def _fecha(d: dt.date) -> str:
    return f"{_DIAS[d.weekday()]} {d.day:02d}/{d.month:02d}"


def _horas(x: float) -> str:
    return f"{round(x, 1):g}".replace(".", ",")


def _lista(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " y " + items[-1]


def _hash(texto: str, n: int = 8) -> str:
    return hashlib.sha1(texto.encode("utf-8")).hexdigest()[:n]


def _alerta(codigo: str, categoria: Categoria, importancia: int, titulo: str, detalle: str, *,
            clave: Optional[str] = None, sugerencia: Optional[str] = None, fecha: Optional[dt.date] = None,
            fecha_fin: Optional[dt.date] = None, fechas: Optional[list[dt.date]] = None,
            empleado_id: Optional[str] = None, regenerar_desde: Optional[dt.date] = None,
            silenciable: Optional[bool] = None) -> Alerta:
    if codigo in CRITICAS:
        silenciable = False
    importancia = max(0, min(100, int(importancia)))
    return Alerta(
        clave=clave or ":".join([codigo, empleado_id or "", fecha.isoformat() if fecha else ""]),
        huella=_hash(detalle), codigo=codigo, categoria=categoria,
        severidad=Severidad.critica if codigo in CRITICAS else severidad_de(importancia),
        importancia=importancia, titulo=titulo, detalle=detalle, sugerencia=sugerencia, fecha=fecha,
        fecha_fin=fecha_fin, fechas=fechas or [], empleado_id=empleado_id, regenerar_desde=regenerar_desde,
        silenciable=codigo in CATALOGO if silenciable is None else silenciable,
    )


def _runs(fechas: list[dt.date]) -> list[list[dt.date]]:
    """Agrupa fechas ordenadas en tramos de días consecutivos."""
    out: list[list[dt.date]] = []
    for d in sorted(set(fechas)):
        if out and (d - out[-1][-1]).days == 1:
            out[-1].append(d)
        else:
            out.append([d])
    return out


def _rangos(pasos: list[tuple[int, int]], res: int) -> list[tuple[int, int, int]]:
    """[(minuto, n)] -> [(inicio, fin, n)] uniendo pasos contiguos con el mismo valor."""
    out: list[list[int]] = []
    for t, n in pasos:
        if out and out[-1][1] == t and out[-1][2] == n:
            out[-1][1] = t + res
        else:
            out.append([t, t + res, n])
    return [(a, b, n) for a, b, n in out]


def _personas(n: int) -> str:
    return f"{n} persona{'s' if n != 1 else ''}"


# ---------------------------------------------------------------------------
# Familias de alertas
# ---------------------------------------------------------------------------
def _criticas(config: Config, h: Schedule) -> list[Alerta]:
    """El horario no vale: momentos sin nadie, o sin nadie habilitado para abrir o cerrar."""
    out = []
    for p in criticas.problemas(config, h):
        detalle = p.texto + (f" {p.causa}" if p.causa else "")
        if p.arreglable:
            sugerencia = "Pulsa «Solucionar problemas» o cambia a mano un turno de ese día."
        else:
            sugerencia = ("No se arregla moviendo turnos: cambia una libranza o una ausencia, habilita a alguien en "
                          "Equipo o busca un refuerzo para ese día.")
        out.append(_alerta(
            p.tipo.value, Categoria.critica, 100, CRITICAS[p.tipo.value], detalle, fecha=p.fecha,
            clave=f"{p.tipo.value}::{p.fecha.isoformat()}", sugerencia=sugerencia))
    return out


def _reglas(config: Config, h: Schedule, previo: Optional[list[Assignment]]) -> list[Alerta]:
    """Reglas duras incumplidas. La ausencia se trata aparte (desfase), con más contexto."""
    issues = validate(config, h.desde, h.hasta, h.asignaciones, previo=previo,
                      saldo_horas=h.saldo_anterior, bloqueos=h.bloqueos)
    out = []
    for i in issues:
        if i.nivel != "error" or i.codigo == "ausencia":
            continue
        codigo = f"regla_{i.codigo}"
        grave = i.codigo == "sin_solucion"
        out.append(_alerta(
            codigo, Categoria.reglas, 98 if grave else 90, "Regla incumplida", i.mensaje, fecha=i.fecha,
            empleado_id=i.empleado_id, clave=f"{codigo}:{i.empleado_id or ''}:{i.fecha or ''}:{_hash(i.mensaje, 6)}",
            sugerencia="Corrígelo antes de publicar el horario.", silenciable=False))
    return out


def _desfase(config: Config, h: Schedule) -> list[Alerta]:
    """Turnos en días en que la persona está ahora de ausencia: el horario hay que regenerarlo."""
    publicado = h.estado == "publicado"
    bloqueados = {(b.empleado_id, b.fecha) for b in h.bloqueos if b.turno_id}
    out = []
    for e in config.empleados:
        fechas = [a.fecha for a in h.asignaciones if a.empleado_id == e.id and config.is_absent(e.id, a.fecha)]
        for tramo in _runs(fechas):
            primero, ultimo = tramo[0], tramo[-1]
            ausencia = config.is_absent(e.id, primero)
            rango = _fecha(primero) if primero == ultimo else f"del {_fecha(primero)} al {_fecha(ultimo)}"
            detalle = (f"{e.nombre} tiene turno {rango}, pero ahora figura de {ausencia.motivo}. "
                       f"El horario ya no coincide con las ausencias: hay que regenerarlo a partir del {_fecha(primero)}.")
            if publicado:
                detalle += " Está publicado, así que el equipo ya conoce estos turnos."
            sugerencia = "Regenera el horario"
            if any((e.id, d) in bloqueados for d in tramo):
                sugerencia += " (antes quita el bloqueo manual de esos turnos, si no el motor no encontrará solución)"
            sugerencia += " y avisa por Slack a quien cambie." if publicado else "."
            out.append(_alerta(
                "ausencia_sin_reflejar", Categoria.desfase, 95 if publicado else 85,
                "Ausencia aprobada que no se refleja en el horario", detalle, fecha=primero, fecha_fin=ultimo,
                fechas=tramo, empleado_id=e.id, regenerar_desde=primero, sugerencia=sugerencia,
                clave=f"ausencia_sin_reflejar:{e.id}:{primero.isoformat()}", silenciable=False))
    return out


_PUESTO = {Puesto.cocina: "cocina", Puesto.sala: "sala"}


def _cobertura(config: Config, h: Schedule) -> list[Alerta]:
    res = config.reglas.resolucion_minutos
    umbral_exceso = config.alertas.exceso_personal_horas_dia
    emp_ids = {e.id for e in config.empleados}
    turnos = {s.id for s in config.turnos}
    por_dia: dict[dt.date, list] = defaultdict(list)  # día -> [(persona, pasos, puesto)]
    del_dia: dict[dt.date, list[Assignment]] = defaultdict(list)
    for a in h.asignaciones:
        del_dia[a.fecha].append(a)
        if a.empleado_id in emp_ids and a.turno_id in turnos:
            por_dia[a.fecha].append((config.employee(a.empleado_id), shift_steps(config.turno_de(a), res),
                                     config.puesto_de(a)))

    out = []
    for d in daterange(h.desde, h.hasta):
        dem = demand_for(config, d)
        if not dem.required:
            continue
        trabajando = por_dia.get(d, [])
        huecos, sin_enc, sobra = [], [], 0
        sin_nadie = pico = False
        maximo = max(dem.required.values())
        for t in sorted(set(dem.required) | {t for _, pasos, _ in trabajando for t in pasos}):
            aqui = [(e, p) for e, pasos, p in trabajando if t in pasos]
            req = dem.required.get(t, 0)
            if req - len(aqui) > 0:
                huecos.append((t, req - len(aqui)))
                sin_nadie |= not aqui
                pico |= req == maximo and maximo >= 2
            sobra += max(0, len(aqui) - req)
            if config.reglas.encargado_siempre and req > 0 and not any(e.es_encargado for e, _ in aqui):
                sin_enc.append((t, 1))

        # Mínimos por puesto: se cuentan aparte (puede sobrar gente en sala y faltar en cocina).
        por_puesto: dict[Puesto, list[tuple[int, int]]] = {}
        for post, minimos in dem.by_post.items():
            faltan = [(t, n - sum(1 for _, pasos, p in trabajando if p == post and t in pasos))
                      for t, n in sorted(minimos.items())]
            if any(n > 0 for _, n in faltan):
                por_puesto[post] = [(t, n) for t, n in faltan if n > 0]

        if huecos or por_puesto:
            falta_h = (sum(n for _, n in huecos) + sum(n for v in por_puesto.values() for _, n in v) / 2) * res / 60
            partes = []
            if huecos:
                tramos = [f"{fmt_hhmm(a)}–{fmt_hhmm(b)} ({_personas(n)})" for a, b, n in _rangos(huecos, res)]
                partes.append(f"faltan {_lista(tramos)}" + (" y en algún momento no hay nadie" if sin_nadie else ""))
            for post, faltan in por_puesto.items():
                tramos = [f"{fmt_hhmm(a)}–{fmt_hhmm(b)} ({n})" for a, b, n in _rangos(faltan, res)]
                partes.append(f"en {_PUESTO[post]} faltan {_lista(tramos)}")
            imp = 40 + _escala(falta_h, 0, 8, 0, 40) + (15 if sin_nadie else 0) + (5 if pico else 0)
            out.append(_alerta(
                "falta_cobertura", Categoria.cobertura, min(imp, 98), "Franjas desatendidas",
                f"{_fecha(d)}: {'; '.join(partes)}.", fecha=d,
                sugerencia="Cambia a mano un turno ese día (o el puesto de alguien que haga los dos) o revisa "
                           "ausencias, libranzas y la demanda."))
        if sin_enc:
            tramos = [f"{fmt_hhmm(a)}–{fmt_hhmm(b)}" for a, b, _ in _rangos(sin_enc, res)]
            out.append(_alerta(
                "sin_encargado", Categoria.cobertura, 55 + _escala(len(sin_enc) * res / 60, 0, 8, 0, 20),
                "Franjas sin encargado", f"{_fecha(d)}: no hay encargado de {_lista(tramos)}.", fecha=d))
        for fid, pasos in function_presence(config, d, del_dia.get(d, [])).items():
            f = config.funcion(fid)
            nombre = f.nombre
            faltan = [(t, mn - n) for t, mn, _, n in pasos if n < mn]
            if faltan:
                tramos = [f"{fmt_hhmm(a)}–{fmt_hhmm(b)}" + (f" ({n})" if n > 1 else "") for a, b, n in _rangos(faltan, res)]
                sugerencia = (f"En la vista de día, pon en «{nombre}» a alguien que lo sepa hacer o, en Funciones, "
                              "da ese rol a más personas." if f.es_rol else
                              f"Pon ese día a alguien con «{nombre}» (en la vista de día) o, en Equipo, da esa función a "
                              "más personas.")
                out.append(_alerta(
                    "falta_funcion", Categoria.cobertura, 50 + _escala(len(faltan) * res / 60, 0, 6, 0, 25),
                    f"Falta gente para «{nombre}»", f"{_fecha(d)}: no hay nadie para «{nombre}» de {_lista(tramos)}.",
                    fecha=d, clave=f"falta_funcion:{fid}:{d.isoformat()}", sugerencia=sugerencia))
            sobran = [(t, n - mx) for t, _, mx, n in pasos if mx is not None and n > mx]
            if sobran:
                tramos = [f"{fmt_hhmm(a)}–{fmt_hhmm(b)} ({n})" for a, b, n in _rangos(sobran, res)]
                out.append(_alerta(
                    "exceso_funcion", Categoria.cobertura, 35 + _escala(len(sobran) * res / 60, 0, 6, 0, 15),
                    f"Demasiada gente en «{nombre}»", f"{_fecha(d)}: hay más gente en «{nombre}» de la que permite "
                    f"su regla de {_lista(tramos)}.", fecha=d, clave=f"exceso_funcion:{fid}:{d.isoformat()}",
                    sugerencia=f"En la vista de día, pasa a alguien de «{nombre}» a otro rol."))
        sobra_h = sobra * res / 60
        if sobra_h > umbral_exceso:
            out.append(_alerta(
                "exceso_personal", Categoria.cobertura, _escala(sobra_h, umbral_exceso, umbral_exceso * 3, 15, 34),
                "Personal de más", f"{_fecha(d)}: sobran {_horas(sobra_h)} horas-persona sobre la demanda.", fecha=d,
                sugerencia="Si se repite, revisa en Turnos si duran más de lo que pide la demanda, o añade en Demanda "
                           "las tareas fijas que hace esa gente (limpiar, preparar, reponer)."))
    return out


def _contrato(config: Config, h: Schedule) -> list[Alerta]:
    rules = config.reglas
    days = daterange(h.desde, h.hasta)
    tol = rules.margen_periodo_horas
    max_extra = rules.max_horas_extra_semana * len(days) / 7
    avisados: set[str] = set()
    out = []
    for st in compute_stats(config, h.desde, h.hasta, h.asignaciones, h.saldo_anterior):
        if st.comodin:
            continue  # sin contrato: ni horas de más o de menos, ni saldo (su mínimo va por semanas, abajo)
        e = config.employee(st.empleado_id)
        diff = st.horas - st.horas_objetivo
        if st.horas_objetivo > 0 and st.horas == 0:
            out.append(_alerta("sin_turnos", Categoria.horas, 80, "Persona sin turnos",
                               f"{e.nombre} no tiene ningún turno en el periodo (le tocarían {_horas(st.horas_objetivo)} h).",
                               empleado_id=e.id, sugerencia="Revisa sus libranzas, ausencias y qué turnos puede hacer."))
            avisados.add(e.id)
        elif diff > tol:
            exceso = diff - tol
            out.append(_alerta(
                "horas_extra", Categoria.horas, _escala(exceso, 0, max(max_extra, 1), 40, 85), "Demasiadas horas",
                f"{e.nombre} suma {_horas(st.horas)} h frente a las {_horas(st.horas_objetivo)} h que le tocan "
                f"({_horas(exceso)} h de más sobre la tolerancia).", empleado_id=e.id,
                sugerencia="Pasa algún turno a quien vaya corto de horas."))
            avisados.add(e.id)
        elif diff < -tol:
            falta = -diff - tol
            out.append(_alerta(
                "horas_por_debajo", Categoria.horas, _escala(falta, 0, 20, 25, 70), "Pocas horas",
                f"{e.nombre} suma {_horas(st.horas)} h frente a las {_horas(st.horas_objetivo)} h que le tocan "
                f"({_horas(falta)} h de menos sobre la tolerancia).", empleado_id=e.id,
                sugerencia="Dale más turnos si la demanda lo permite; si no, quedarán como saldo a su favor."))
            avisados.add(e.id)

        if rules.arrastrar_saldo:
            bruto = st.horas - target_minutes(config, e, days) / 60
            if abs(bruto) > rules.max_saldo_horas:
                pasa = abs(bruto) - rules.max_saldo_horas
                signo = "de más" if bruto > 0 else "de menos"
                out.append(_alerta(
                    "saldo_desbordado", Categoria.horas, _escala(pasa, 0, 10, 45, 65), "Saldo de horas desbordado",
                    f"{e.nombre} acaba con {_horas(abs(bruto))} h {signo}, pero solo se arrastran {_horas(rules.max_saldo_horas)} h "
                    f"al siguiente periodo: {_horas(pasa)} h quedarían sin compensar.", empleado_id=e.id,
                    sugerencia="Equilibra sus horas o regularízalas con la gestoría."))

    margen = rules.margen_semanal_horas
    turnos = {s.id for s in config.turnos}
    for e in config.active_employees():
        if e.id in avisados:
            continue
        for chunk in week_chunks(days):
            if len(chunk) < 7:
                continue
            if e.comodin:
                out += _comodin_minimo(config, h, e, chunk, turnos)
                continue
            objetivo = target_minutes(config, e, chunk)
            if objetivo <= 0:
                continue
            minutos = sum(config.turno_de(a).minutes for a in h.asignaciones
                          if a.empleado_id == e.id and a.fecha in set(chunk) and a.turno_id in {s.id for s in config.turnos})
            falta = (objetivo - margen * 60 - minutos) / 60
            if falta > 0.01:
                out.append(_alerta(
                    "semana_corta", Categoria.horas, _escala(falta, 0, 15, 25, 55), "Semana corta de horas",
                    f"{e.nombre} hace {_horas(minutos / 60)} h la semana del {_fecha(chunk[0])}; su contrato pide "
                    f"{_horas(objetivo / 60)} h con un margen de {_horas(margen)} h.", fecha=chunk[0], fecha_fin=chunk[-1],
                    empleado_id=e.id))
    return out


def _comodin_minimo(config: Config, h: Schedule, e, chunk: list[dt.date], turnos: set[str]) -> list[Alerta]:
    minimo = comodin_min_minutes(config, e, chunk)
    if minimo <= 0:
        return []
    dias = set(chunk)
    minutos = sum(config.turno_de(a).minutes for a in h.asignaciones
                  if a.empleado_id == e.id and a.fecha in dias and a.turno_id in turnos)
    falta = (minimo - minutos) / 60
    if falta <= 0.01:
        return []
    return [_alerta(
        "comodin_minimo", Categoria.horas, _escala(falta, 0, 15, 25, 55), "Comodín por debajo de su mínimo",
        f"{e.nombre} hace {_horas(minutos / 60)} h la semana del {_fecha(chunk[0])}; su mínimo es de "
        f"{_horas(minimo / 60)} h.", fecha=chunk[0], fecha_fin=chunk[-1], empleado_id=e.id,
        sugerencia="Dale algún turno si hay hueco, o baja su mínimo en Equipo.")]


def _reparto(config: Config, h: Schedule) -> list[Alerta]:
    ajustes = config.alertas
    stats = compute_stats(config, h.desde, h.hasta, h.asignaciones, h.saldo_anterior)
    days = daterange(h.desde, h.hasta)
    nombre = lambda st: config.employee(st.empleado_id).nombre  # noqa: E731
    out = []

    con_contrato = [st for st in stats if st.horas_objetivo >= 10]
    if len(con_contrato) >= 2:
        ratio = {st.empleado_id: st.horas / st.horas_objetivo for st in con_contrato}
        alto = max(con_contrato, key=lambda s: ratio[s.empleado_id])
        bajo = min(con_contrato, key=lambda s: ratio[s.empleado_id])
        distancia = (ratio[alto.empleado_id] - ratio[bajo.empleado_id]) * 100
        if distancia > ajustes.reparto_horas_pct:
            out.append(_alerta(
                "reparto_horas", Categoria.reparto,
                _escala(distancia, ajustes.reparto_horas_pct, ajustes.reparto_horas_pct * 3, 35, 70),
                "Horas mal repartidas",
                f"{nombre(alto)} cumple el {ratio[alto.empleado_id] * 100:.0f} % de su contrato y {nombre(bajo)} "
                f"el {ratio[bajo.empleado_id] * 100:.0f} %: {distancia:.0f} puntos de diferencia "
                f"(máximo aceptado {ajustes.reparto_horas_pct:g}).",
                sugerencia="Mueve algún turno de quien va sobrado a quien va justo."))

    def desigualdad(codigo: str, titulo: str, elegibles: list, valor, maximo: int, unidad: str) -> None:
        if len(elegibles) < 2:
            return
        alto = max(elegibles, key=valor)
        bajo = min(elegibles, key=valor)
        dif = valor(alto) - valor(bajo)
        if dif > maximo:
            out.append(_alerta(
                codigo, Categoria.reparto, _escala(dif, maximo, maximo + 4, 30, 60), titulo,
                f"{nombre(alto)} tiene {valor(alto)} {unidad} y {nombre(bajo)} {valor(bajo)}: "
                f"{dif} de diferencia (máximo aceptado {maximo}).", sugerencia="Reparte mejor entre quienes pueden hacerlo."))

    stats = [st for st in stats if not st.comodin]  # los comodines cubren huecos: no entran en el reparto
    fines = [d for d in days if is_weekend(d)]
    elegibles_fin = [st for st in stats if any(not config.is_absent(st.empleado_id, d) and d.weekday() not in
                                               config.employee(st.empleado_id).fixed_off_indexes() for d in fines)]
    desigualdad("reparto_fines_semana", "Fines de semana mal repartidos", elegibles_fin,
                lambda s: s.fines_de_semana, ajustes.reparto_fines_semana, "días de fin de semana")
    elegibles_cierre = [st for st in stats if config.employee(st.empleado_id).puede_cerrar]
    desigualdad("reparto_cierres", "Cierres mal repartidos", elegibles_cierre,
                lambda s: s.cierres, ajustes.reparto_cierres, "cierres")
    return out


def _preferencias(config: Config, h: Schedule) -> list[Alerta]:
    minimo = config.alertas.preferencias_incumplidas_pct
    turnos = {s.id for s in config.turnos}
    out = []
    for e in config.active_employees():
        prefs = [p for p in config.preferencias if p.empleado_id == e.id]
        if not prefs:
            continue
        aplicables, fallos, pesos = 0, [], []
        for a in sorted(h.asignaciones, key=lambda a: a.fecha):
            if a.empleado_id != e.id or a.turno_id not in turnos:
                continue
            hoy = [p for p in prefs if p.applies_on(a.fecha)]
            if not hoy:
                continue
            aplicables += 1
            prefiere = [p for p in hoy if p.tipo == "prefiere"]
            evita = [p for p in hoy if p.tipo == "evita" and a.turno_id in p.turnos]
            incumple = ([max(prefiere, key=lambda p: p.peso)] if prefiere and not any(a.turno_id in p.turnos for p in prefiere) else []) + evita
            if incumple:
                fallos.append(a.fecha)
                pesos.append(max(p.peso for p in incumple))
        if aplicables < 2 or not fallos:
            continue
        ratio = len(fallos) / aplicables
        if ratio * 100 < minimo:
            continue
        peso = sum(pesos) / len(pesos)
        out.append(_alerta(
            "preferencias", Categoria.preferencias, min(70, round(15 + 4 * peso + 30 * ratio)), "Fuera de su franja preferida",
            f"{e.nombre} no está en su franja preferida {len(fallos)} de {aplicables} días que trabaja "
            f"({ratio * 100:.0f} %; importancia media de sus preferencias {peso:.1f} sobre 10): "
            f"{_lista([_fecha(d) for d in fallos[:6]])}{'…' if len(fallos) > 6 else ''}.",
            fecha=fallos[0], fecha_fin=fallos[-1], fechas=fallos, empleado_id=e.id,
            sugerencia="Solo conviene cambiarlo si no compromete la cobertura."))
    return out


def _rachas(config: Config, h: Schedule, previo: Optional[list[Assignment]]) -> list[Alerta]:
    maximo = config.alertas.racha_dias_max
    out = []
    for e in config.active_employees():
        fechas = [a.fecha for a in h.asignaciones if a.empleado_id == e.id]
        fechas += [a.fecha for a in (previo or []) if a.empleado_id == e.id and a.fecha < h.desde]
        for tramo in _runs(fechas):
            if len(tramo) <= maximo or tramo[-1] < h.desde or tramo[0] > h.hasta:
                continue
            out.append(_alerta(
                "racha_larga", Categoria.personal, _escala(len(tramo) - maximo, 0, 3, 50, 80), "Demasiados días seguidos",
                f"{e.nombre} trabaja {len(tramo)} días seguidos, del {_fecha(tramo[0])} al {_fecha(tramo[-1])} "
                f"(aviso a partir de {maximo}).", fecha=tramo[0], fecha_fin=tramo[-1], fechas=tramo, empleado_id=e.id,
                sugerencia="Intercala un día libre."))
    return out


def _plantilla(config: Config, h: Schedule) -> list[Alerta]:
    """Falta o sobra de personal en conjunto, por semana y por día (con los bloqueos del horario)."""
    config = with_locks(config, h.bloqueos)
    sobra_pct = config.alertas.plantilla_sobra_pct
    out = []
    for sem in plantilla.semanas(config, h.desde, h.hasta):
        if sem.demanda <= 0:
            continue
        rango = f"la semana del {_fecha(sem.desde)} al {_fecha(sem.hasta)}"
        clave = sem.desde.isoformat()
        faltan = sem.demanda - sem.contrato
        if sem.demanda > sem.maximo + 0.5:
            hueco = sem.demanda - sem.maximo
            out.append(_alerta(
                "plantilla_insuficiente", Categoria.plantilla, _escala(hueco / sem.demanda * 100, 0, 15, 80, 95),
                "Falta personal aunque todos hagan horas extra",
                f"{rango.capitalize()} la demanda pide {_horas(sem.demanda)} horas-persona y, aun con las horas extra "
                f"permitidas, la plantilla da como mucho {_horas(sem.maximo)} h: faltan {_horas(hueco)} h "
                f"(los contratos suman {_horas(sem.contrato)} h).", fecha=sem.desde, fecha_fin=sem.hasta,
                clave=f"plantilla_insuficiente::{clave}",
                sugerencia="Contrata o amplía jornadas, mueve vacaciones o rebaja la demanda de esa semana."))
        elif faltan > 1:
            con_comodines = (f" Los comodines pueden poner hasta {_horas(sem.comodines)} h de ellas."
                             if sem.comodines > 0 else "")
            out.append(_alerta(
                "plantilla_justa", Categoria.plantilla, _escala(faltan / sem.demanda * 100, 0, 15, 45, 75),
                "Hace falta tirar de horas extra o de comodines" if sem.comodines > 0 else "Hace falta tirar de horas extra",
                f"{rango.capitalize()} la demanda pide {_horas(sem.demanda)} horas-persona y los contratos suman "
                f"{_horas(sem.contrato)} h: hacen falta unas {_horas(faltan)} h extra entre todos.{con_comodines}",
                fecha=sem.desde, fecha_fin=sem.hasta, clave=f"plantilla_justa::{clave}",
                sugerencia="Si se repite, plantéate ampliar alguna jornada o contratar refuerzo."))
        elif sem.contrato > sem.demanda * (1 + sobra_pct / 100):
            pct = (sem.contrato / sem.demanda - 1) * 100
            out.append(_alerta(
                "plantilla_sobrante", Categoria.plantilla, _escala(pct, sobra_pct, sobra_pct * 3, 30, 55),
                "Sobra personal",
                f"{rango.capitalize()} los contratos suman {_horas(sem.contrato)} h y la demanda pide "
                f"{_horas(sem.demanda)} horas-persona ({pct:.0f} % más). Alguien quedará por debajo de su contrato "
                f"o habrá gente de más en el local.", fecha=sem.desde, fecha_fin=sem.hasta,
                clave=f"plantilla_sobrante::{clave}",
                sugerencia="Buen momento para vacaciones o para reducir jornadas; si se repite, revisa la plantilla. Si hay "
                           "trabajo que no depende de la clientela, añádelo en Demanda como tarea fija."))
    for dia in plantilla.dias(config, h.desde, h.hasta):
        if dia.disponibles < dia.necesarias:
            out.append(_alerta(
                "dia_sin_personal", Categoria.plantilla, 82, "No hay bastante gente disponible",
                f"{_fecha(dia.fecha)}: hacen falta {_personas(dia.necesarias)} a la vez y solo hay "
                f"{_personas(dia.disponibles)} disponible"
                f"{'s' if dia.disponibles != 1 else ''} (libranzas, ausencias y cambios manuales).", fecha=dia.fecha,
                sugerencia="Mueve una libranza o una ausencia, o busca un refuerzo para ese día."))
        faltan = [v for v, falta in (("abrir", dia.sin_apertura), ("cerrar", dia.sin_cierre)) if falta]
        if faltan:
            out.append(_alerta(
                "dia_sin_habilitados", Categoria.plantilla, 75, "Nadie disponible puede abrir o cerrar",
                f"{_fecha(dia.fecha)}: no hay nadie disponible que pueda {' ni '.join(faltan)} el local.", fecha=dia.fecha,
                sugerencia="Mueve la libranza de alguien habilitado o habilita a otra persona en Equipo."))
    return out


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------
def evaluar(config: Config, horario: Schedule, previo: Optional[list[Assignment]] = None) -> list[Alerta]:
    """Todas las alertas de un horario, de más a menos importante. Las silenciadas en la configuración no salen."""
    alertas = (_criticas(config, horario) + _reglas(config, horario, previo) + _desfase(config, horario) + _cobertura(config, horario)
               + _contrato(config, horario) + _reparto(config, horario) + _preferencias(config, horario)
               + _rachas(config, horario, previo) + _plantilla(config, horario))
    # La regla dura de horas extra ya lo dice con más fuerza: no se repite como alerta blanda.
    topadas = {a.empleado_id for a in alertas if a.codigo == "regla_extra_excedida"}
    alertas = [a for a in alertas if not (a.codigo == "horas_extra" and a.empleado_id in topadas)]
    silenciadas = set(config.alertas.desactivadas)
    alertas = [a for a in alertas if not (a.silenciable and a.codigo in silenciadas)]
    return ordenar(alertas)


def ordenar(alertas: list[Alerta]) -> list[Alerta]:
    return sorted(alertas, key=lambda a: (-a.importancia, a.fecha or dt.date.max, a.titulo, a.clave))


def es_critica(a: Alerta) -> bool:
    return a.severidad == Severidad.critica


def resumen(alertas: list[Alerta]) -> dict[str, int]:
    return {s.value: sum(1 for a in alertas if a.severidad == s) for s in Severidad}


def regenerar_desde(alertas: list[Alerta]) -> Optional[dt.date]:
    """Primer día a partir del cual hay que regenerar para dejar el horario al día."""
    fechas = [a.regenerar_desde for a in alertas if a.regenerar_desde]
    return min(fechas) if fechas else None


def catalogo() -> list[dict]:
    return [{"codigo": c, "categoria": cat.value, "descripcion": desc} for c, (cat, desc) in CATALOGO.items()]
