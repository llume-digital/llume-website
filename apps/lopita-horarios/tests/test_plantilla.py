"""Alertas de plantilla: falta o sobra de personal en conjunto frente a la demanda."""
import copy
import datetime as dt
import json
import pathlib

from lopita_horarios import Config, SolveOptions
from lopita_horarios.alertas import Categoria, evaluar
from lopita_horarios.models import Assignment, Schedule
from lopita_horarios.plantilla import capacidad_minutos, dias, semanas
from lopita_horarios.solucionador import solucionar

DATA = json.loads((pathlib.Path(__file__).parent.parent / "datos" / "ejemplo.json").read_text(encoding="utf-8"))
LUN = dt.date(2026, 11, 9)
DOM = LUN + dt.timedelta(days=6)
SEMANA = [LUN + dt.timedelta(days=i) for i in range(7)]
FAST = SolveOptions(max_segundos=10, hilos=1)
TODOS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


def config(empleados, personas=1, turnos=None, ausencias=None, **alertas) -> Config:
    """Un turno de 6 h (8:00–14:00) y `personas` necesarias de 8:00 a 14:00 todos los días."""
    return Config.model_validate({
        "empleados": empleados,
        "turnos": turnos or [{"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "14:00"}],
        "tipos_dia": [{"nombre": "normal", "franjas": [{"inicio": "08:00", "fin": "14:00", "personas": personas}]}],
        "tipo_dia_por_semana": {d: "normal" for d in TODOS},
        "ausencias": ausencias or [],
        "alertas": alertas,
    })


def emp(id_, horas, **extra):
    return {"id": id_, "nombre": id_.title(), "horas_semanales": horas, **extra}


def vacio(desde=LUN, hasta=DOM) -> Schedule:
    return Schedule(desde=desde, hasta=hasta, asignaciones=[])


def de(alertas, codigo):
    return [a for a in alertas if a.codigo == codigo]


def test_semana_cuenta_demanda_contratos_y_maximo():
    # Demanda: 7 días x 6 h = 42 h. Contratos: 30 + 6 = 36 h.
    c = config([emp("ana", 30), emp("bea", 6)])
    s = semanas(c, LUN, DOM)
    assert len(s) == 1
    assert (s[0].demanda, s[0].contrato) == (42, 36)
    # Ana: 5 días de 6 h = 30 h (tope semanal 40 h). Bea: 5 días posibles, tope 6 + 10 = 16 h.
    assert capacidad_minutos(c, "ana", SEMANA) == 30 * 60
    assert s[0].maximo == 30 + 16


def test_falta_tirar_de_horas_extra():
    alertas = evaluar(config([emp("ana", 30), emp("bea", 6)]), vacio())
    justa = de(alertas, "plantilla_justa")
    assert len(justa) == 1 and justa[0].categoria == Categoria.plantilla
    assert "6 h extra" in justa[0].detalle and justa[0].fecha == LUN and justa[0].fecha_fin == DOM
    assert not de(alertas, "plantilla_insuficiente") and not de(alertas, "plantilla_sobrante")


def test_falta_personal_aunque_todos_hagan_extra_es_alta():
    # Dos personas a la vez todo el día: 84 h; con dos personas no hay forma (máximo 60 h).
    alertas = evaluar(config([emp("ana", 30), emp("bea", 30)], personas=2), vacio())
    falta = de(alertas, "plantilla_insuficiente")
    assert len(falta) == 1 and falta[0].severidad.value == "alta"
    assert "faltan 24 h" in falta[0].detalle


def test_sobra_personal_por_encima_del_umbral():
    c = config([emp("ana", 30), emp("bea", 30)])  # 60 h de contrato para 42 h de demanda: 43 % más
    sobra = de(evaluar(c, vacio()), "plantilla_sobrante")
    assert len(sobra) == 1 and "43 % más" in sobra[0].detalle
    assert sobra[0].severidad.value in ("baja", "media")
    # Con un umbral más alto no se avisa
    assert not de(evaluar(config([emp("ana", 30), emp("bea", 30)], plantilla_sobra_pct=50), vacio()), "plantilla_sobrante")


def test_las_ausencias_restan_horas_de_contrato():
    ausencia = [{"empleado_id": "bea", "desde": LUN.isoformat(), "hasta": DOM.isoformat()}]
    c = config([emp("ana", 30), emp("bea", 30)], ausencias=ausencia)
    assert semanas(c, LUN, DOM)[0].contrato == 30
    # Ana sola no llega a las 42 h ni con horas extra (5 días de 6 h)
    assert de(evaluar(c, vacio()), "plantilla_insuficiente")


def test_dia_sin_bastante_gente_disponible():
    # Dos personas a la vez, pero el lunes Bea libra siempre
    c = config([emp("ana", 30), emp("bea", 30, libranzas_fijas=["lunes"]), emp("cris", 30, libranzas_fijas=["lunes"])],
               personas=2)
    d = dias(c, LUN, DOM)
    assert [x.fecha for x in d] == [LUN] and (d[0].necesarias, d[0].disponibles) == (2, 1)
    alerta = de(evaluar(c, vacio()), "dia_sin_personal")
    assert len(alerta) == 1 and "solo hay 1 persona disponible" in alerta[0].detalle


def test_dia_sin_nadie_que_pueda_abrir():
    turnos = [{"id": "AP", "nombre": "Apertura", "inicio": "08:00", "fin": "14:00", "tipo": "apertura"},
              {"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "14:00"}]
    c = config([emp("ana", 30, puede_abrir=True, libranzas_fijas=["martes"]), emp("bea", 30)], turnos=turnos)
    alerta = de(evaluar(c, vacio()), "dia_sin_habilitados")
    assert [a.fecha for a in alerta] == [LUN + dt.timedelta(days=1)]
    assert "pueda abrir el local" in alerta[0].detalle


def test_alertas_de_plantilla_se_pueden_silenciar():
    c = config([emp("ana", 30), emp("bea", 6)], desactivadas=["plantilla_justa"])
    assert not de(evaluar(c, vacio()), "plantilla_justa")


def test_ejemplo_tiene_mas_contrato_que_demanda():
    c = Config.model_validate(copy.deepcopy(DATA))
    s = semanas(c, LUN, DOM)[0]
    assert s.contrato > s.demanda
    assert de(evaluar(c, vacio()), "plantilla_sobrante")


def test_el_solucionador_explica_la_plantilla_y_da_las_cifras():
    c = config([emp("ana", 30), emp("bea", 30)], personas=2)
    h = Schedule(desde=LUN, hasta=DOM, asignaciones=[
        Assignment(empleado_id=e, fecha=LUN + dt.timedelta(days=i), turno_id="M") for e in ("ana", "bea") for i in range(5)])
    p = solucionar(c, h, opciones=FAST)
    assert p.plantilla and p.plantilla[0].demanda == 84
    assert any("alerta de plantilla" in m for m in p.motivos)


def test_sobran_horas_pero_faltan_franjas_se_explica():
    # Contratos de sobra, pero el domingo libran todos: la falta es de cuándo, no de cuántos
    c = config([emp(n, 30, libranzas_fijas=["domingo"]) for n in ("ana", "bea", "cris")])
    h = Schedule(desde=LUN, hasta=DOM, asignaciones=[
        Assignment(empleado_id=e, fecha=LUN + dt.timedelta(days=i), turno_id="M")
        for i, e in enumerate(["ana", "bea", "cris", "ana", "bea", "cris"])])
    p = solucionar(c, h, opciones=FAST)
    assert any("no es cuánta gente hay" in m for m in p.motivos)
