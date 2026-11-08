"""Alertas del encargado: reglas del dominio con horarios construidos a mano (sin lanzar el motor)."""
import copy
import datetime as dt
import json
import pathlib

import pytest

from lopita_horarios import Config
from lopita_horarios.alertas import Severidad, evaluar, regenerar_desde, resumen, severidad_de
from lopita_horarios.cambios import diferencias
from lopita_horarios.models import Absence, Assignment, Lock, Schedule

DATA = json.loads((pathlib.Path(__file__).parent.parent / "datos" / "ejemplo.json").read_text(encoding="utf-8"))
LUN = dt.date(2026, 11, 9)  # lunes de una semana sin ausencias en los datos de ejemplo
DOM = LUN + dt.timedelta(days=6)


def cfg(**cambios) -> Config:
    data = copy.deepcopy(DATA)
    data.update(cambios)
    return Config.model_validate(data)


def horario(asignaciones, desde=LUN, hasta=DOM, estado="borrador", bloqueos=None) -> Schedule:
    return Schedule(desde=desde, hasta=hasta, estado=estado, bloqueos=bloqueos or [],
                    asignaciones=[Assignment(empleado_id=e, fecha=desde + dt.timedelta(days=d), turno_id=t) for e, d, t in asignaciones])


def por_codigo(alertas, codigo):
    return [a for a in alertas if a.codigo == codigo]


def test_severidad_por_importancia_nunca_llega_a_critica():
    # «Crítica» es solo para las alertas con las que el horario no vale (ver test_alertas_criticas.py)
    esperado = {100: "alta", 80: "alta", 79: "alta", 60: "alta", 59: "media", 35: "media", 34: "baja", 0: "baja"}
    for imp, sev in esperado.items():
        assert severidad_de(imp).value == sev


def test_horario_vacio_hay_franjas_sin_cubrir_y_no_vale_y_va_ordenado():
    alertas = evaluar(cfg(), horario([]))
    huecos = por_codigo(alertas, "falta_cobertura")
    assert huecos and all(a.severidad == Severidad.alta for a in huecos)
    assert all("no hay nadie" in a.detalle for a in huecos)
    assert len(por_codigo(alertas, "sin_turnos")) == 10  # nadie tiene turno
    assert len(por_codigo(alertas, "sin_nadie")) == 7  # un día entero sin nadie: crítico, cada día
    assert all(a.severidad == Severidad.critica for a in por_codigo(alertas, "sin_nadie"))
    assert [a.importancia for a in alertas] == sorted((a.importancia for a in alertas), reverse=True)
    assert sum(resumen(alertas).values()) == len(alertas)


def test_mas_hueco_mas_importancia():
    # Un día con una sola persona cubriendo solo parte vs un día totalmente vacío
    parcial = evaluar(cfg(), horario([("julia", 2, "AP"), ("ana", 2, "CI")]))
    vacio = evaluar(cfg(), horario([]))
    mie = LUN + dt.timedelta(days=2)
    imp = lambda al: next(a.importancia for a in por_codigo(al, "falta_cobertura") if a.fecha == mie)  # noqa: E731
    assert imp(parcial) < imp(vacio)


def test_ausencia_sin_reflejar_indica_desde_cuando_regenerar():
    config = cfg(ausencias=DATA["ausencias"] + [{"empleado_id": "ana", "desde": "2026-11-11", "hasta": "2026-11-12", "motivo": "vacaciones"}])
    turnos = [("ana", 2, "M"), ("ana", 3, "M"), ("ana", 4, "M")]  # miércoles, jueves y viernes; las ausencias cubren los dos primeros
    borrador = evaluar(config, horario(turnos))
    [a] = por_codigo(borrador, "ausencia_sin_reflejar")
    assert a.regenerar_desde == dt.date(2026, 11, 11) and a.fecha_fin == dt.date(2026, 11, 12)
    assert a.severidad == Severidad.alta and not a.silenciable
    assert "regenerarlo a partir del miércoles 11/11" in a.detalle
    assert regenerar_desde(borrador) == dt.date(2026, 11, 11)
    # El error crudo del validador no se duplica
    assert not [x for x in borrador if x.codigo == "regla_ausencia"]
    # Publicado es más grave (el equipo ya conoce esos turnos) y lo dice
    [p] = por_codigo(evaluar(config, horario(turnos, estado="publicado")), "ausencia_sin_reflejar")
    assert p.importancia > a.importancia and "ya conoce" in p.detalle


def test_ausencia_con_turno_bloqueado_avisa_de_quitar_el_bloqueo():
    config = cfg(ausencias=DATA["ausencias"] + [{"empleado_id": "ana", "desde": "2026-11-11", "hasta": "2026-11-11", "motivo": "baja"}])
    h = horario([("ana", 2, "M")], bloqueos=[Lock(empleado_id="ana", fecha=dt.date(2026, 11, 11), turno_id="M")])
    [a] = por_codigo(evaluar(config, h), "ausencia_sin_reflejar")
    assert "bloqueo" in a.sugerencia


def test_sin_ausencias_vigentes_no_hay_desfase():
    assert not por_codigo(evaluar(cfg(), horario([("ana", 2, "M")])), "ausencia_sin_reflejar")


def test_horas_de_mas_y_de_menos():
    # Gema (20 h) hace 4 días de 6 h = 24 h; Irene (20 h) solo 1 día de 6 h
    turnos = [("gema", d, "M") for d in range(2, 6)] + [("irene", 2, "M")]
    alertas = evaluar(cfg(), horario(turnos))
    [extra] = [a for a in por_codigo(alertas, "horas_extra") if a.empleado_id == "gema"]
    assert "24 h" in extra.detalle and extra.importancia >= 40
    [falta] = [a for a in por_codigo(alertas, "horas_por_debajo") if a.empleado_id == "irene"]
    assert "6 h" in falta.detalle


def test_mas_exceso_mas_importancia():
    uno = evaluar(cfg(), horario([("gema", d, "M") for d in range(2, 6)]))                       # 24 h
    dos = evaluar(cfg(), horario([("gema", d, "M") for d in range(2, 5)] + [("gema", 5, "CI")]))  # 25,5 h
    imp = lambda al: next(a.importancia for a in por_codigo(al, "horas_extra") if a.empleado_id == "gema")  # noqa: E731
    assert imp(uno) < imp(dos)


def test_preferencias_no_respetadas():
    # Gema prefiere M, R y MI; la ponemos en tarde 3 días
    mal = por_codigo(evaluar(cfg(), horario([("gema", d, "T") for d in (2, 3, 4)])), "preferencias")
    [a] = [x for x in mal if x.empleado_id == "gema"]
    assert len(a.fechas) == 3 and "3 de 3" in a.detalle and a.categoria.value == "preferencias"
    bien = por_codigo(evaluar(cfg(), horario([("gema", d, "M") for d in (2, 3, 4)])), "preferencias")
    assert not [x for x in bien if x.empleado_id == "gema"]


def test_preferencias_umbral_configurable():
    # 1 de 3 días fuera de su franja = 33 %: no salta con el umbral por defecto (50 %) pero sí con 30 %
    turnos = [("gema", 2, "M"), ("gema", 3, "M"), ("gema", 4, "T")]
    assert not por_codigo(evaluar(cfg(), horario(turnos)), "preferencias")
    estricto = cfg(alertas={"preferencias_incumplidas_pct": 30})
    assert [x for x in por_codigo(evaluar(estricto, horario(turnos)), "preferencias") if x.empleado_id == "gema"]


def test_racha_de_dias_seguidos():
    siete = [("irene", d, "M") for d in range(7)]
    [a] = por_codigo(evaluar(cfg(), horario(siete)), "racha_larga")
    assert len(a.fechas) == 7 and a.empleado_id == "irene"
    assert not por_codigo(evaluar(cfg(alertas={"racha_dias_max": 7}), horario(siete)), "racha_larga")


def test_racha_continua_con_el_periodo_anterior():
    previo = [Assignment(empleado_id="irene", fecha=LUN - dt.timedelta(days=i), turno_id="M") for i in range(1, 6)]
    h = horario([("irene", 0, "M"), ("irene", 1, "M")])
    [a] = por_codigo(evaluar(cfg(), h, previo), "racha_larga")
    assert len(a.fechas) == 7 and a.fecha == LUN - dt.timedelta(days=5)


def test_fines_de_semana_mal_repartidos():
    desde, hasta = LUN, LUN + dt.timedelta(days=13)
    fines = [("ana", d, "M") for d in (5, 6, 12, 13)]  # Ana hace los 4 días de fin de semana
    h = horario(fines, desde=desde, hasta=hasta)
    [a] = por_codigo(evaluar(cfg(), h), "reparto_fines_semana")
    assert "4" in a.detalle and a.categoria.value == "reparto"


def test_personal_de_mas():
    muchos = [(e["id"], 4, "M") for e in DATA["empleados"] if e["id"] not in ("diego", "fran")]
    alertas = por_codigo(evaluar(cfg(), horario(muchos)), "exceso_personal")
    assert alertas and all(a.severidad == Severidad.baja for a in alertas)  # es coste, no riesgo: nunca pasa de baja


def test_silenciar_codigos_solo_afecta_a_los_silenciables():
    config = cfg(alertas={"desactivadas": ["falta_cobertura", "ausencia_sin_reflejar", "regla_doble_turno"]})
    config.ausencias.append(Absence(empleado_id="ana", desde=dt.date(2026, 11, 11), hasta=dt.date(2026, 11, 11)))
    alertas = evaluar(config, horario([("ana", 2, "M"), ("ana", 2, "T")]))
    assert not por_codigo(alertas, "falta_cobertura")           # silenciada
    assert por_codigo(alertas, "ausencia_sin_reflejar")          # nunca se silencia
    assert por_codigo(alertas, "regla_doble_turno")              # tampoco las reglas duras


def test_reglas_duras_son_altas_y_no_se_silencian():
    # Ya impiden publicar por sí mismas; «crítica» queda para las alertas con las que el horario no vale
    alertas = evaluar(cfg(), horario([("gema", 2, "AP")]))  # Gema no puede abrir
    [a] = por_codigo(alertas, "regla_no_puede_abrir")
    assert a.severidad == Severidad.alta and a.categoria.value == "reglas" and not a.silenciable


def test_claves_estables_y_huella_cambia_con_el_contenido():
    a1 = evaluar(cfg(), horario([("gema", d, "M") for d in range(2, 6)]))
    a2 = evaluar(cfg(), horario([("gema", d, "M") for d in range(2, 5)] + [("gema", 5, "CI")]))
    k = lambda al: next(a for a in por_codigo(al, "horas_extra") if a.empleado_id == "gema")  # noqa: E731
    assert k(a1).clave == k(a2).clave and k(a1).huella != k(a2).huella
    assert len({a.clave for a in a2}) == len(a2)  # sin claves repetidas


def test_diferencias_entre_horarios():
    antes = [Assignment(empleado_id="ana", fecha=LUN, turno_id="M"), Assignment(empleado_id="bruno", fecha=LUN, turno_id="T")]
    despues = [Assignment(empleado_id="ana", fecha=LUN, turno_id="T"), Assignment(empleado_id="carla", fecha=LUN, turno_id="M")]
    cambios = {(c.empleado_id, c.antes, c.despues) for c in diferencias(antes, despues)}
    assert cambios == {("ana", "M", "T"), ("bruno", "T", None), ("carla", None, "M")}
    assert diferencias(antes, list(antes)) == []


def test_horas_extra_no_se_duplican_si_ya_salta_la_regla_dura():
    # Gema (20 h) con 6 días de 6 h = 36 h: supera el tope duro de extra y ya sale como regla incumplida
    alertas = evaluar(cfg(), horario([("gema", d, "M") for d in range(7)]))
    assert por_codigo(alertas, "regla_extra_excedida")
    assert not [a for a in por_codigo(alertas, "horas_extra") if a.empleado_id == "gema"]
