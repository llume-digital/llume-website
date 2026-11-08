"""Restricciones horarias por persona: «esos días solo puede trabajar de X a Y», igual que las libranzas fijas."""
import datetime as dt

import pytest
from pydantic import ValidationError

from lopita_horarios import Config, SolveOptions, generate, validate
from lopita_horarios.criticas import problemas
from lopita_horarios.models import Assignment, Employee, Lock, RestriccionHoraria
from lopita_horarios.planning import allowed_shifts

LUN = dt.date(2026, 11, 9)
MAR = LUN + dt.timedelta(days=1)
DOM = LUN + dt.timedelta(days=6)
SEMANA = [LUN + dt.timedelta(days=i) for i in range(7)]
FAST = SolveOptions(max_segundos=10, hilos=1)
TODOS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
TURNOS = [
    {"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "15:00"},
    {"id": "T", "nombre": "Tarde", "inicio": "15:00", "fin": "22:00"},
]


def config(empleados) -> Config:
    """Un turno de mañana y uno de tarde de 7 h; una persona de 8:00 a 22:00 todos los días."""
    return Config.model_validate({
        "empleados": empleados,
        "turnos": TURNOS,
        "tipos_dia": [{"nombre": "normal", "franjas": [{"inicio": "08:00", "fin": "22:00", "personas": 1}]}],
        "tipo_dia_por_semana": {d: "normal" for d in TODOS},
    })


def emp(id_, horas=35, **extra):
    return {"id": id_, "nombre": id_.title(), "horas_semanales": horas, **extra}


def codigos(issues, emp_id=None, nivel=None):
    return {i.codigo for i in issues if (emp_id is None or i.empleado_id == emp_id) and (nivel is None or i.nivel == nivel)}


# ---------------------------------------------------------------------------- modelo
def test_hace_falta_al_menos_una_hora():
    with pytest.raises(ValidationError, match="indica desde qué hora o hasta qué hora"):
        RestriccionHoraria()


def test_la_hora_final_va_despues_de_la_inicial():
    with pytest.raises(ValidationError, match="posterior"):
        RestriccionHoraria(desde="18:00", hasta="10:00")
    with pytest.raises(ValidationError, match="posterior"):
        RestriccionHoraria(desde="10:00", hasta="10:00")


def test_dia_desconocido():
    with pytest.raises(ValidationError):
        RestriccionHoraria(dias=["lunz"], hasta="18:00")


def test_sin_restricciones_puede_todo_el_dia_y_datos_antiguos_cargan():
    e = Employee.model_validate(emp("ana"))
    assert e.restricciones_horarias == []
    assert e.franja(LUN) == (0, 24 * 60)


def test_franja_combina_las_que_se_aplican_ese_dia():
    e = Employee.model_validate(emp("ana", restricciones_horarias=[
        {"desde": "09:00"},                                   # todos los días
        {"dias": ["martes"], "hasta": "16:00"},
        {"dias": ["martes", "jueves"], "desde": "10:00", "hasta": "20:00"},
    ]))
    assert e.franja(LUN) == (9 * 60, 24 * 60)
    assert e.franja(MAR) == (10 * 60, 16 * 60)               # la más estrecha
    assert e.franja(LUN + dt.timedelta(days=3)) == (10 * 60, 20 * 60)
    assert e.cabe_en_franja(10 * 60, 16 * 60, MAR)
    assert not e.cabe_en_franja(10 * 60, 16 * 60 + 15, MAR)  # el límite es inclusivo, un minuto más no


# ---------------------------------------------------------------------------- turnos posibles
def test_solo_turnos_que_caben_enteros():
    c = config([emp("ana", restricciones_horarias=[{"hasta": "18:00"}]),
                emp("bea", restricciones_horarias=[{"dias": ["domingo"], "desde": "10:00"}])])
    assert [s.id for s in allowed_shifts(c, c.employee("ana"), LUN)] == ["M"]
    assert [s.id for s in allowed_shifts(c, c.employee("bea"), LUN)] == ["M", "T"]
    assert [s.id for s in allowed_shifts(c, c.employee("bea"), DOM)] == ["T"]  # la mañana empieza a las 8:00


def test_un_turno_fijado_a_mano_se_respeta():
    datos = config([emp("ana", restricciones_horarias=[{"hasta": "18:00"}])]).model_dump()
    datos["excepciones_asignacion"] = [{"empleado_id": "ana", "fecha": LUN, "tipo": "turno", "turno_id": "T"}]
    c = Config.model_validate(datos)
    assert [s.id for s in allowed_shifts(c, c.employee("ana"), LUN)] == ["T"]


# ---------------------------------------------------------------------------- generador
def test_el_generador_respeta_las_restricciones():
    c = config([
        emp("ana", restricciones_horarias=[{"hasta": "15:00"}]),                       # solo mañanas
        emp("bea", restricciones_horarias=[{"desde": "15:00"}]),                       # solo tardes
        emp("cris", restricciones_horarias=[{"dias": ["sabado", "domingo"], "hasta": "15:00"}]),
        emp("dani"),
    ])
    h = generate(c, LUN, DOM, FAST)
    assert h.asignaciones
    for a in h.asignaciones:
        s = c.turno_de(a)
        assert c.employee(a.empleado_id).cabe_en_franja(s.start_min, s.end_min, a.fecha), a
    assert {a.turno_id for a in h.asignaciones if a.empleado_id == "ana"} == {"M"}
    assert {a.turno_id for a in h.asignaciones if a.empleado_id == "bea"} == {"T"}
    assert "fuera_de_franja" not in codigos(h.incidencias)


def test_con_un_bloqueo_fuera_de_franja_el_generador_obedece_y_avisa():
    c = config([emp("ana", restricciones_horarias=[{"hasta": "15:00"}]), emp("bea"), emp("cris")])
    h = generate(c, LUN, DOM, FAST, bloqueos=[Lock(empleado_id="ana", fecha=LUN, turno_id="T")])
    assert any(a.empleado_id == "ana" and a.fecha == LUN and a.turno_id == "T" for a in h.asignaciones)
    assert "fuera_de_franja" in codigos(h.incidencias, "ana", "aviso")
    assert "fuera_de_franja" not in codigos(h.incidencias, "ana", "error")


# ---------------------------------------------------------------------------- validador
def test_validador_marca_error_si_no_cabe():
    c = config([emp("ana", restricciones_horarias=[{"dias": ["lunes"], "desde": "10:00"}])])
    issues = validate(c, LUN, MAR, [Assignment(empleado_id="ana", fecha=LUN, turno_id="M"),
                                    Assignment(empleado_id="ana", fecha=MAR, turno_id="M")])
    malos = [i for i in issues if i.codigo == "fuera_de_franja"]
    assert len(malos) == 1 and malos[0].nivel == "error" and malos[0].fecha == LUN
    assert "de 10:00 a 24:00" in malos[0].mensaje


def test_validador_tiene_en_cuenta_las_horas_a_medida():
    c = config([emp("ana", restricciones_horarias=[{"hasta": "14:00"}])])
    dentro = Assignment(empleado_id="ana", fecha=LUN, turno_id="M", inicio="08:00", fin="14:00")
    fuera = Assignment(empleado_id="ana", fecha=MAR, turno_id="M", inicio="08:00", fin="14:30")
    issues = validate(c, LUN, MAR, [dentro, fuera])
    assert [i.fecha for i in issues if i.codigo == "fuera_de_franja"] == [MAR]


# ---------------------------------------------------------------------------- explicaciones
def test_la_alerta_critica_explica_la_restriccion():
    # Nadie puede hacer la tarde: la crítica «sin nadie» debe decir por qué.
    c = config([emp("ana", restricciones_horarias=[{"hasta": "15:00"}])])
    h = generate(c, LUN, LUN, FAST)
    textos = " ".join(f"{p.texto} {p.causa or ''}" for p in problemas(c, h))
    assert "solo puede trabajar de 00:00 a 15:00" in textos
