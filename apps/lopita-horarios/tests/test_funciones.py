"""Funciones configurables (preparar pinchos...) con reglas de presencia mínima."""
import copy
import datetime as dt
import json
import pathlib

import pytest
from pydantic import ValidationError

from lopita_horarios import Config
from lopita_horarios.alertas import evaluar
from lopita_horarios.models import Assignment, Schedule
from lopita_horarios.planning import function_demand
from lopita_horarios.solver import SolveOptions, generate
from lopita_horarios.sugerencias import sugerir
from lopita_horarios.validator import validate

DATA = json.loads((pathlib.Path(__file__).parent.parent / "datos" / "ejemplo.json").read_text(encoding="utf-8"))
LUN = dt.date(2026, 11, 9)
DOM = LUN + dt.timedelta(days=6)
PINCHOS = {"id": "pinchos", "nombre": "Preparar pinchos",
           "reglas": [{"inicio": "10:00", "fin": "12:00", "personas": 1, "dias": ["lunes", "martes", "miercoles"]}]}


def cfg(quienes=("carla",), funciones=(PINCHOS,)) -> Config:
    data = copy.deepcopy(DATA)
    data["funciones"] = list(funciones)
    for e in data["empleados"]:
        e["funciones"] = ["pinchos"] if e["id"] in quienes else []
    return Config.model_validate(data)


def test_la_regla_solo_pide_sus_dias_y_su_tramo():
    c = cfg()
    lun = function_demand(c, LUN)
    assert set(lun) == {"pinchos"} and min(lun["pinchos"]) == 600 and max(lun["pinchos"]) == 690
    assert function_demand(c, LUN + dt.timedelta(days=3)) == {}


def test_funcion_desconocida_o_repetida_no_valida():
    data = copy.deepcopy(DATA)
    data["empleados"][0]["funciones"] = ["nada"]
    with pytest.raises(ValidationError):
        Config.model_validate(data)
    with pytest.raises(ValidationError):
        cfg(funciones=(PINCHOS, PINCHOS))


def test_el_motor_pone_a_alguien_con_la_funcion():
    c = cfg(quienes=("irene",))
    h = generate(c, LUN, DOM, SolveOptions(max_segundos=20))
    for i in range(3):
        d = LUN + dt.timedelta(days=i)
        irene = [a for a in h.asignaciones if a.empleado_id == "irene" and a.fecha == d]
        assert irene, f"Irene debería trabajar el {d} para preparar pinchos"
        s = c.turno_de(irene[0])
        assert s.start_min <= 600 and s.end_min >= 720
    assert not [i for i in h.incidencias if i.codigo == "falta_funcion"]


def test_alerta_validacion_y_sugerencia_si_falta():
    c = cfg(quienes=("irene",))
    h = Schedule(desde=LUN, hasta=LUN, asignaciones=[Assignment(empleado_id="ana", fecha=LUN, turno_id="AP")])
    assert any(i.codigo == "falta_funcion" for i in validate(c, LUN, LUN, h.asignaciones))
    alertas = [a for a in evaluar(c, h) if a.codigo == "falta_funcion"]
    assert alertas and "Preparar pinchos" in alertas[0].titulo and "10:00–12:00" in alertas[0].detalle
    sug = [s for s in sugerir(c, h, alertas) if s.clave == "funcion:pinchos"]
    assert sug and "Irene" in sug[0].detalle


# ---------------------------------------------------------------------------
# API: configuración con funciones, cobertura por función y calendario
# ---------------------------------------------------------------------------
from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from app.slack import Slack  # noqa: E402

PW = "contraseña-segura"


@pytest.fixture
def admin(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    c = TestClient(app)
    assert c.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return c


def test_api_funciones_y_calendario(admin):
    actual = admin.get("/api/config").json()
    config = actual["config"]
    config["funciones"] = [PINCHOS]
    for e in config["empleados"]:
        e["funciones"] = ["pinchos"] if e["id"] in ("irene", "carla") else []
    r = admin.put("/api/config", json={"config": config, "base": actual["version"]})
    assert r.status_code == 200, r.text
    h = admin.post("/api/horarios/generar", json={"desde": LUN.isoformat(), "hasta": DOM.isoformat()}).json()
    cob = h["cobertura"][LUN.isoformat()]["funciones"]["pinchos"]
    assert cob and all(presentes >= minimo for _, minimo, presentes, _ in cob)

    cal = admin.get("/api/calendario", params={"desde": (LUN - dt.timedelta(days=3)).isoformat(),
                                                "hasta": (DOM + dt.timedelta(days=3)).isoformat()}).json()
    assert set(cal["dias"]) == {(LUN + dt.timedelta(days=i)).isoformat() for i in range(7)}
    assert cal["dias"][LUN.isoformat()]["horario_id"] == h["id"]
    assert len(cal["asignaciones"]) == len(h["horario"]["asignaciones"])
    assert admin.get("/api/calendario", params={"desde": "2026-01-01", "hasta": "2026-06-01"}).status_code == 400
