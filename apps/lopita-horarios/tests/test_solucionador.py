"""Solucionador de alertas: ajustar un horario ya hecho con los mínimos cambios."""
import copy
import datetime as dt
import json
import pathlib

import pytest

from lopita_horarios.alertas import evaluar
from lopita_horarios import Config, SolveOptions, generate, validate
from lopita_horarios.models import Assignment, Lock, Schedule
from lopita_horarios.plantilla import capacidad_minutos
from lopita_horarios.solucionador import (
    CambioPropuesto,
    HorarioCambiado,
    movimientos,
    aplicar,
    congelar_antes,
    solucionar,
)

DATA = json.loads((pathlib.Path(__file__).parent.parent / "datos" / "ejemplo.json").read_text(encoding="utf-8"))
LUN = dt.date(2026, 11, 9)  # lunes
DOM = LUN + dt.timedelta(days=6)
# Un solo hilo: el resultado de CP-SAT es reproducible.
FAST = SolveOptions(max_segundos=10, hilos=1)


def pequena(**reglas) -> Config:
    """Tres personas, un turno de mañana de 6 h y una persona necesaria de 8:00 a 14:00 todos los días."""
    return Config.model_validate({
        "empleados": [
            {"id": "ana", "nombre": "Ana", "horas_semanales": 18},
            {"id": "bea", "nombre": "Bea", "horas_semanales": 12},
            {"id": "cris", "nombre": "Cris", "horas_semanales": 12},
        ],
        "turnos": [{"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "14:00"}],
        "tipos_dia": [{"nombre": "normal", "franjas": [{"inicio": "08:00", "fin": "14:00", "personas": 1}]}],
        "tipo_dia_por_semana": {d: "normal" for d in ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]},
        "reglas": {"margen_periodo_horas": 2, **reglas},
    })


def horario(asignaciones, desde=LUN, hasta=DOM, bloqueos=None, estado="borrador") -> Schedule:
    return Schedule(desde=desde, hasta=hasta, estado=estado, bloqueos=bloqueos or [],
                    asignaciones=[Assignment(empleado_id=e, fecha=desde + dt.timedelta(days=d), turno_id=t)
                                  for e, d, t in asignaciones])


def codigos(alertas, empleado=None):
    return {a.codigo for a in alertas if empleado is None or a.empleado_id == empleado}


def errores(config, h):
    return [i for i in validate(config, h.desde, h.hasta, h.asignaciones, saldo_horas=h.saldo_anterior,
                                bloqueos=h.bloqueos) if i.nivel == "error"]


# Ana tiene 5 turnos (30 h de 18) y Cris solo 1 (6 h de 12): la cobertura está completa, pero las horas no.
DESEQUILIBRADO = [("ana", 0, "M"), ("ana", 1, "M"), ("ana", 2, "M"), ("ana", 3, "M"), ("ana", 4, "M"),
                  ("bea", 5, "M"), ("cris", 6, "M")]


def test_compensa_horas_de_mas_con_horas_de_menos_sin_tocar_la_cobertura():
    config = pequena()
    h = horario(DESEQUILIBRADO)
    p = solucionar(config, h, opciones=FAST)
    assert p.mejora and p.cambios
    resultado = aplicar(h, p.cambios)
    assert not errores(config, resultado)
    # Ana baja a su contrato, Cris sube: cada una cumple con su tolerancia
    horas = {x.empleado_id: x for x in p.horas}
    assert horas["ana"].antes == 30 and abs(horas["ana"].despues - 18) <= 2
    assert abs(horas["cris"].despues - 12) <= 2
    assert {"horas_extra", "horas_por_debajo"} & codigos(p.resueltas + p.mejoradas)
    assert "falta_cobertura" not in codigos(p.nuevas)
    # Los turnos pasan de una persona a otra el mismo día: lo mínimo, sin reordenar la semana
    assert all(c.fecha.weekday() < 5 for c in p.cambios)
    assert any("pasa de Ana a" in m.texto for m in p.movimientos)
    assert len(p.cambios) <= 4


def test_horario_sin_problemas_no_propone_nada():
    config = pequena()
    h = horario([("ana", 0, "M"), ("ana", 1, "M"), ("ana", 2, "M"), ("bea", 3, "M"), ("bea", 4, "M"),
                 ("cris", 5, "M"), ("cris", 6, "M")])
    p = solucionar(config, h, opciones=FAST)
    assert not p.mejora and p.cambios == []
    assert p.alertas_antes == p.alertas_despues
    assert "No hay cambios" in p.mensaje


def test_ausencia_aprobada_se_arregla_sin_regenerar_y_sin_tocar_el_resto():
    h = generate(Config.model_validate(copy.deepcopy(DATA)), LUN, DOM, FAST)
    miercoles = LUN + dt.timedelta(days=2)
    quien = next(a.empleado_id for a in h.asignaciones if a.fecha == miercoles)
    data = copy.deepcopy(DATA)
    data["ausencias"].append({"empleado_id": quien, "desde": miercoles.isoformat(), "hasta": miercoles.isoformat()})
    config = Config.model_validate(data)
    p = solucionar(config, h, opciones=FAST)
    assert p.mejora and p.errores_antes > 0 and p.errores_despues == 0
    assert "ausencia_sin_reflejar" in codigos(p.resueltas)
    nuevo = aplicar(h, p.cambios)
    assert not any(a.empleado_id == quien and a.fecha == miercoles for a in nuevo.asignaciones)
    # Ajuste local: la inmensa mayoría de casillas siguen igual
    assert len(p.cambios) <= len(h.asignaciones) // 4


def test_respeta_el_primer_dia_que_se_puede_cambiar():
    config = pequena()
    h = horario(DESEQUILIBRADO)
    jueves = LUN + dt.timedelta(days=3)
    p = solucionar(config, h, desde=jueves, opciones=FAST)
    assert p.desde == jueves
    assert all(c.fecha >= jueves for c in p.cambios)
    assert any("anteriores al jueves" in m for m in p.motivos)


def test_desde_posterior_al_periodo_no_cambia_nada():
    p = solucionar(pequena(), horario(DESEQUILIBRADO), desde=DOM + dt.timedelta(days=1), opciones=FAST)
    assert not p.mejora and "ningún día" in p.mensaje


def test_no_toca_los_cambios_manuales_bloqueados():
    config = pequena()
    bloqueos = [Lock(empleado_id="ana", fecha=LUN + dt.timedelta(days=d), turno_id="M") for d in range(4)]
    p = solucionar(config, horario(DESEQUILIBRADO, bloqueos=bloqueos), opciones=FAST)
    assert p.mejora  # el viernes de Ana sí se puede pasar a otra persona
    assert not any(c.empleado_id == "ana" and c.fecha.weekday() < 4 for c in p.cambios)
    assert any("4 cambios manuales bloqueados" in m for m in p.motivos)


def test_sin_solucion_con_los_bloqueos_lo_dice():
    config = pequena()
    # Bloquear 6 días seguidos a Ana rompe el descanso semanal: no hay horario válido que respete eso
    bloqueos = [Lock(empleado_id="ana", fecha=LUN + dt.timedelta(days=d), turno_id="M") for d in range(6)]
    h = horario([("ana", d, "M") for d in range(6)] + [("bea", 6, "M")], bloqueos=bloqueos)
    p = solucionar(config, h, opciones=FAST)
    assert not p.mejora and p.cambios == []
    assert "reglas duras" in p.mensaje
    assert any("bloqueado" in m for m in p.motivos)


def test_explica_por_que_alguien_no_puede_llegar_a_su_contrato():
    # Con 1 día libre a la semana como mínimo Cris podría hacer 6 turnos, pero el turno es de 6 h y la
    # demanda solo pide una persona; con 40 h de contrato no llega ni trabajando todos los días posibles.
    data = pequena().model_dump(mode="json")
    data["empleados"][2]["horas_semanales"] = 40
    config = Config.model_validate(data)
    assert capacidad_minutos(config, "cris", [LUN + dt.timedelta(days=i) for i in range(7)]) == 5 * 6 * 60
    p = solucionar(config, horario(DESEQUILIBRADO), opciones=FAST)
    assert any(m.startswith("Cris no puede llegar a las 40 h") for m in p.motivos)


def test_congelar_antes_mantiene_turnos_y_libres_salvo_ausencias_y_bloqueos():
    data = pequena().model_dump(mode="json")
    data["ausencias"] = [{"empleado_id": "bea", "desde": LUN.isoformat(), "hasta": LUN.isoformat()}]
    config = Config.model_validate(data)
    h = horario([("ana", 0, "M"), ("bea", 0, "M"), ("cris", 1, "M")],
                bloqueos=[Lock(empleado_id="cris", fecha=LUN, turno_id=None)])
    locks = {(b.empleado_id, b.fecha): b.turno_id for b in congelar_antes(config, h, LUN + dt.timedelta(days=2))}
    assert locks[("ana", LUN)] == "M" and locks[("cris", LUN + dt.timedelta(days=1))] == "M"
    assert locks[("ana", LUN + dt.timedelta(days=1))] is None  # día libre congelado
    assert ("bea", LUN) not in locks  # ausente: su turno tiene que poder desaparecer
    assert ("cris", LUN) not in locks  # ya tiene un bloqueo manual
    assert all(f < LUN + dt.timedelta(days=2) for _, f in locks)


def test_aplicar_cambia_solo_esas_casillas():
    h = horario(DESEQUILIBRADO)
    cambios = [CambioPropuesto(empleado_id="ana", fecha=LUN, antes="M", despues=None),
               CambioPropuesto(empleado_id="cris", fecha=LUN, antes=None, despues="M")]
    nuevo = aplicar(h, cambios)
    assert {(a.empleado_id, a.fecha) for a in nuevo.asignaciones if a.fecha == LUN} == {("cris", LUN)}
    assert len(nuevo.asignaciones) == len(h.asignaciones)
    assert h.asignaciones[0].empleado_id == "ana"  # el original no se modifica


@pytest.mark.parametrize("cambio", [
    CambioPropuesto(empleado_id="ana", fecha=LUN, antes=None, despues="M"),  # ya trabajaba
    CambioPropuesto(empleado_id="cris", fecha=LUN, antes="M", despues=None),  # no trabajaba
    CambioPropuesto(empleado_id="ana", fecha=DOM + dt.timedelta(days=1), antes=None, despues="M"),  # fuera
])
def test_aplicar_rechaza_propuestas_desfasadas(cambio):
    with pytest.raises(HorarioCambiado):
        aplicar(horario(DESEQUILIBRADO), [cambio])


def test_movimientos_juntan_traspasos_e_intercambios():
    data = pequena().model_dump(mode="json")
    data["turnos"].append({"id": "T", "nombre": "Tarde", "inicio": "14:00", "fin": "20:00"})
    config = Config.model_validate(data)
    mar = LUN + dt.timedelta(days=1)
    movs = movimientos(config, [
        CambioPropuesto(empleado_id="ana", fecha=LUN, antes="M", despues=None),
        CambioPropuesto(empleado_id="cris", fecha=LUN, antes=None, despues="M"),
        CambioPropuesto(empleado_id="ana", fecha=mar, antes="M", despues="T"),
        CambioPropuesto(empleado_id="bea", fecha=mar, antes="T", despues="M"),
        CambioPropuesto(empleado_id="cris", fecha=mar, antes=None, despues="T"),
    ])
    textos = [m.texto for m in movs]
    assert textos[0] == "lunes 09/11: el turno Mañana (08:00–14:00) pasa de Ana a Cris."
    assert textos[1] == ("martes 10/11: Ana y Bea se cambian el turno (Ana pasa a Tarde (14:00–20:00) "
                         "y Bea a Mañana (08:00–14:00)).")
    assert textos[2] == "martes 10/11: Cris trabaja de Tarde (14:00–20:00) (antes libraba)."
    assert movs[0].empleados == ["ana", "cris"]


def test_generar_con_referencia_parte_de_ella_y_cuanto_mas_cuesta_cambiar_menos_cambia():
    config = pequena()
    # Válido pero mejorable: Ana 24 h de 18 y Cris 6 h de 12
    h = horario([("ana", 0, "M"), ("ana", 1, "M"), ("ana", 2, "M"), ("ana", 3, "M"),
                 ("bea", 4, "M"), ("bea", 5, "M"), ("cris", 6, "M")])
    assert not errores(config, h)
    barato = config.model_copy(update={"pesos": config.pesos.model_copy(update={"cambio_turno": 0})})
    caro = config.model_copy(update={"pesos": config.pesos.model_copy(update={"cambio_turno": 10 ** 7})})
    sin_coste = generate(barato, LUN, DOM, FAST, referencia=h.asignaciones)
    inmovil = generate(caro, LUN, DOM, FAST, referencia=h.asignaciones)
    assert not errors_of(sin_coste)
    # Con un coste enorme por casilla no compensa mover nada
    assert {(a.empleado_id, a.fecha) for a in inmovil.asignaciones} == {(a.empleado_id, a.fecha) for a in h.asignaciones}


def errors_of(s):
    return [i for i in s.incidencias if i.nivel == "error"]


def test_bajar_del_tope_de_horas_extra_cuenta_como_mejora_no_como_alerta_nueva():
    # Ana con 30 h de 12: por encima del tope de horas extra (regla dura). Si baja a 2 h por encima de
    # la tolerancia, sigue siendo la misma alerta de horas (más leve), no una nueva.
    data = pequena(max_horas_extra_semana=5).model_dump(mode="json")
    data["empleados"][0]["horas_semanales"] = 12
    data["empleados"][1]["horas_semanales"] = 6
    data["empleados"][2]["horas_semanales"] = 6
    config = Config.model_validate(data)
    p = solucionar(config, horario(DESEQUILIBRADO), opciones=FAST)
    assert p.mejora
    assert not [a for a in p.nuevas if a.codigo in ("horas_extra", "regla_extra_excedida") and a.empleado_id == "ana"]


# ---------------------------------------------------------------------------
# Alertas que el motor también persigue: rachas, apertura y cierre, reparto de horas
# ---------------------------------------------------------------------------
def con(config: Config, **cambios) -> Config:
    data = config.model_dump(mode="json")
    for ruta, valor in cambios.items():
        destino = data
        *camino, ultima = ruta.split("__")
        for k in camino:
            destino = destino[k]
        destino[ultima] = valor
    return Config.model_validate(data)


def test_corta_una_racha_larga_dando_un_dia_libre():
    # Con un solo día libre por semana Ana puede trabajar 6 días seguidos sin romper reglas duras,
    # pero la alerta salta a partir de 4.
    config = con(pequena(dias_libres_por_semana=1), alertas__racha_dias_max=4,
                 empleados=[{"id": "ana", "nombre": "Ana", "horas_semanales": 36},
                            {"id": "bea", "nombre": "Bea", "horas_semanales": 6}])
    h = horario([("ana", d, "M") for d in range(6)] + [("bea", 6, "M")])
    assert not errores(config, h)
    p = solucionar(config, h, opciones=FAST)
    assert p.mejora
    assert "racha_larga" in codigos(p.resueltas)
    assert "racha_larga" not in codigos(p.nuevas + p.empeoradas)


def test_pone_a_alguien_habilitado_al_abrir_y_al_cerrar():
    data = pequena().model_dump(mode="json")
    data["turnos"] = [
        {"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "14:00"},
        {"id": "T", "nombre": "Tarde", "inicio": "14:00", "fin": "20:00"},
    ]
    data["tipos_dia"][0]["franjas"] = [{"inicio": "08:00", "fin": "20:00", "personas": 1}]
    habilitados = {"ana": (True, False), "bea": (True, True), "cris": (False, True)}
    for e in data["empleados"]:
        e.update(horas_semanales=30, puede_abrir=habilitados[e["id"]][0], puede_cerrar=habilitados[e["id"]][1])
    config = Config.model_validate(data)
    # Cobertura completa, pero el lunes abre Cris (no puede abrir) y cierra Ana (no puede cerrar)
    h = horario([("cris", 0, "M"), ("ana", 0, "T"), ("bea", 1, "M"), ("cris", 1, "T"), ("ana", 2, "M"), ("cris", 2, "T"),
                 ("bea", 3, "M"), ("cris", 3, "T"), ("ana", 4, "M"), ("bea", 4, "T"), ("ana", 5, "M"), ("bea", 5, "T"),
                 ("bea", 6, "M"), ("cris", 6, "T")])
    assert not errores(config, h)
    antes = {a.codigo for a in evaluar(config, h) if a.severidad.value == "critica"}
    assert antes == {"apertura_sin_habilitado", "cierre_sin_habilitado"}
    p = solucionar(config, h, opciones=FAST)
    assert p.mejora and p.alertas_despues["critica"] == 0
    assert {"apertura_sin_habilitado", "cierre_sin_habilitado"} <= codigos(p.resueltas)


def test_iguala_el_reparto_de_horas_entre_personas():
    # Con una tolerancia amplia nadie tiene alerta de horas propia, pero Ana cumple el 125 % y Bea el 75 %.
    config = con(pequena(margen_periodo_horas=10, margen_semanal_horas=10),
                 empleados=[{"id": "ana", "nombre": "Ana", "horas_semanales": 24},
                            {"id": "bea", "nombre": "Bea", "horas_semanales": 24}])
    h = horario([("ana", d, "M") for d in range(5)] + [("bea", d, "M") for d in range(4, 7)])
    p = solucionar(config, h, opciones=FAST)
    assert p.mejora and "reparto_horas" in codigos(p.resueltas)
    horas = {x.empleado_id: x.despues for x in p.horas}
    assert horas["ana"] == horas["bea"] == 24


def test_el_motor_ya_genera_sin_rachas_largas_si_puede():
    config = con(pequena(dias_libres_por_semana=0), alertas__racha_dias_max=3)
    h = generate(config, LUN, LUN + dt.timedelta(days=13), FAST)
    assert "racha_larga" not in codigos(evaluar(config, h))
