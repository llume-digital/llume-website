"""Semanas tipo y rotaciones: una persona sigue una lista de semanas en orden y el motor lo respeta."""
import datetime as dt

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.slack import Slack
from lopita_horarios import Config, SolveOptions, generate, validate
from lopita_horarios.planning import allowed_shifts

LUN = dt.date(2026, 11, 9)
TODOS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]
FAST = SolveOptions(max_segundos=10, hilos=1)
TURNOS = [
    {"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "15:00"},
    {"id": "T", "nombre": "Tarde", "inicio": "15:00", "fin": "22:00"},
]
SEMANAS = [
    {"id": "a", "nombre": "A", "dias": {"lunes": "M", "martes": "M", "miercoles": "M", "jueves": "M", "viernes": "M"}},
    {"id": "b", "nombre": "B", "dias": {"lunes": "T", "martes": "T", "miercoles": "T", "jueves": "T", "viernes": "T"}},
    {"id": "c", "nombre": "C", "dias": {"sabado": "M"}},
    {"id": "d", "nombre": "D", "dias": {"domingo": "T"}},
]


def config(**extra) -> Config:
    return Config.model_validate({
        "empleados": [
            {"id": "ana", "nombre": "Ana", "horas_semanales": 35},
            {"id": "bea", "nombre": "Bea", "horas_semanales": 35},
        ],
        "turnos": TURNOS,
        "tipos_dia": [{"nombre": "normal", "franjas": [{"inicio": "08:00", "fin": "22:00", "personas": 1}]}],
        "tipo_dia_por_semana": {d: "normal" for d in TODOS},
        "semanas_tipo": SEMANAS,
        **extra,
    })


def rot(semanas, desde=LUN, hasta=None, emp="ana"):
    return {"empleado_id": emp, "semanas": semanas, "desde": desde.isoformat(), "hasta": hasta.isoformat() if hasta else None}


def dia(n, base=LUN):
    return base + dt.timedelta(days=n)


# ---------------------------------------------------------------------------- dominio
def test_sin_rotaciones_todo_sigue_igual():
    c = config()
    assert c.rotaciones == [] and c.override_for("ana", LUN) is None
    assert Config.model_validate({k: v for k, v in c.model_dump(mode="json").items() if k not in ("semanas_tipo", "rotaciones")}).semanas_tipo == []


def test_semanas_alternas():
    c = config(rotaciones=[rot(["a", "b"])])
    assert c.override_for("ana", LUN).turno_id == "M"
    assert c.override_for("ana", dia(4)).turno_id == "M"           # viernes de la semana 1
    assert c.override_for("ana", dia(5)).tipo == "libre"            # sábado: no está en la semana A
    assert c.override_for("ana", dia(7)).turno_id == "T"            # semana 2
    assert c.override_for("ana", dia(14)).turno_id == "M"           # vuelve a empezar
    assert c.override_for("bea", LUN) is None                       # otras personas, sin rotación


def test_ciclo_de_cuatro_semanas():
    c = config(rotaciones=[rot(["a", "b", "c", "d"])])
    assert c.override_for("ana", LUN).turno_id == "M"
    assert c.override_for("ana", dia(7)).turno_id == "T"
    assert c.override_for("ana", dia(7 * 2 + 5)).turno_id == "M"    # semana C, sábado
    assert c.override_for("ana", dia(7 * 3 + 6)).turno_id == "T"    # semana D, domingo
    assert c.override_for("ana", dia(7 * 4)).turno_id == "M"        # semana 5 = A


def test_las_semanas_se_cuentan_desde_el_lunes_de_desde():
    c = config(rotaciones=[rot(["a", "b"], desde=dia(2))])         # miércoles de la semana A
    assert c.override_for("ana", dia(2)).turno_id == "M"
    assert c.override_for("ana", dia(6)).tipo == "libre"            # domingo de la semana A
    assert c.override_for("ana", dia(7)).turno_id == "T"           # el lunes siguiente ya es la B


def test_desde_y_hasta():
    c = config(rotaciones=[rot(["a"], desde=dia(7), hasta=dia(10))])
    assert c.override_for("ana", dia(6)) is None
    assert c.override_for("ana", dia(7)).turno_id == "M"
    assert c.override_for("ana", dia(10)).turno_id == "M"
    assert c.override_for("ana", dia(11)) is None


def test_la_peticion_manual_gana_a_la_rotacion():
    manual = {"empleado_id": "ana", "fecha": LUN.isoformat(), "tipo": "libre"}
    c = config(rotaciones=[rot(["a"])], excepciones_asignacion=[manual])
    assert c.override_for("ana", LUN).tipo == "libre"
    assert c.override_for("ana", dia(1)).turno_id == "M"


def test_la_ausencia_gana_a_la_rotacion():
    c = config(rotaciones=[rot(["a"])], ausencias=[{"empleado_id": "ana", "desde": LUN.isoformat(), "hasta": LUN.isoformat()}])
    assert allowed_shifts(c, c.employee("ana"), LUN) == []
    assert [s.id for s in allowed_shifts(c, c.employee("ana"), dia(1))] == ["M"]
    assert allowed_shifts(c, c.employee("ana"), dia(5)) == []       # libra por la rotación


def test_un_dia_cerrado_no_tiene_turno():
    c = config(rotaciones=[rot(["a"])], excepciones_fecha=[{"fecha": LUN.isoformat(), "cerrado": True}])
    assert allowed_shifts(c, c.employee("ana"), LUN) == []


def test_horas_de_una_semana_tipo():
    c = config()
    assert c.horas_semana_tipo(c.semanas_tipo[0]) == 35
    assert c.horas_semana_tipo(c.semanas_tipo[2]) == 7


@pytest.mark.parametrize("cambio,texto", [
    ({"semanas_tipo": SEMANAS + [SEMANAS[0]]}, "semana tipo repetidos"),
    ({"semanas_tipo": [{"id": "x", "nombre": "X", "dias": {"lunes": "Z"}}]}, "turno desconocido"),
    ({"semanas_tipo": [{"id": "x", "nombre": "X", "dias": {"luns": "M"}}]}, "desconocido"),
    ({"rotaciones": [rot(["a"], emp="nadie")]}, "Empleado desconocido"),
    ({"rotaciones": [rot(["zzz"])]}, "Semana tipo desconocida"),
    ({"rotaciones": [rot([])]}, "al menos una semana"),
    ({"rotaciones": [rot(["a"], desde=dia(5), hasta=dia(1))]}, "termina antes"),
    ({"rotaciones": [rot(["a"], hasta=dia(10)), rot(["b"], desde=dia(8))]}, "se solapan"),
])
def test_validaciones(cambio, texto):
    with pytest.raises(ValidationError, match=texto):
        config(**cambio)


def test_rotaciones_seguidas_de_la_misma_persona_no_se_solapan():
    c = config(rotaciones=[rot(["a"], hasta=dia(6)), rot(["b"], desde=dia(7))])
    assert c.override_for("ana", dia(4)).turno_id == "M" and c.override_for("ana", dia(7)).turno_id == "T"


# ---------------------------------------------------------------------------- motor
def test_el_motor_respeta_la_rotacion():
    c = config(rotaciones=[rot(["a"])])
    desde, hasta = LUN, dia(6)
    s = generate(c, desde, hasta, FAST)
    ana = {a.fecha: a.turno_id for a in s.asignaciones if a.empleado_id == "ana"}
    assert ana == {dia(i): "M" for i in range(5)}                   # lunes a viernes de mañana, fines de semana libre
    assert not [i for i in validate(c, desde, hasta, s.asignaciones) if i.nivel == "error"]


def test_el_motor_respeta_la_segunda_semana_de_la_rotacion():
    c = config(rotaciones=[rot(["a", "b"])])
    s = generate(c, dia(7), dia(13), FAST)
    ana = {a.fecha: a.turno_id for a in s.asignaciones if a.empleado_id == "ana"}
    assert ana == {dia(7 + i): "T" for i in range(5)}


# ---------------------------------------------------------------------------- API
def test_ida_y_vuelta_por_la_api(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", "contraseña-segura")
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    c = TestClient(create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#horarios"), secret="test", solve_seconds=8))
    assert c.post("/api/login", json={"usuario": "admin", "password": "contraseña-segura"}).status_code == 200
    r = c.get("/api/config").json()
    cfg, v = r["config"], r["version"]
    assert cfg["semanas_tipo"] == [] and cfg["rotaciones"] == []
    turno, emp = cfg["turnos"][0]["id"], cfg["empleados"][0]["id"]
    cfg["semanas_tipo"] = [{"id": "s1", "nombre": "Semana 1", "dias": {"lunes": turno}}, {"id": "s2", "nombre": "Semana 2", "dias": {}}]
    cfg["rotaciones"] = [{"empleado_id": emp, "semanas": ["s1", "s2"], "desde": "2026-11-09", "hasta": None}]
    r = c.put("/api/config", json={"config": cfg, "base": v})
    assert r.status_code == 200, r.text
    guardada = c.get("/api/config").json()["config"]
    assert guardada["semanas_tipo"] == cfg["semanas_tipo"]
    assert guardada["rotaciones"] == cfg["rotaciones"]
    # Una rotación con una semana inexistente se rechaza con un mensaje claro
    guardada["rotaciones"][0]["semanas"] = ["nada"]
    r = c.put("/api/config", json={"config": guardada, "base": r.json()["version"]})
    assert r.status_code == 422 and "Semana tipo desconocida" in r.json()["detail"]
