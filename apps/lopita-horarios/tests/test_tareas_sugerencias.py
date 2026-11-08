"""Tareas fijas (demanda que no depende de la clientela) y sugerencias de configuración."""
import copy
import datetime as dt
import json
import pathlib

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.slack import Slack
from lopita_horarios import Config
from lopita_horarios.alertas import evaluar
from lopita_horarios.models import Assignment, Schedule
from lopita_horarios.planning import demand_for
from lopita_horarios.solver import SolveOptions, generate
from lopita_horarios.sugerencias import sugerir

DATA = json.loads((pathlib.Path(__file__).parent.parent / "datos" / "ejemplo.json").read_text(encoding="utf-8"))
LUN = dt.date(2026, 11, 9)  # lunes de una semana sin ausencias en los datos de ejemplo
DOM = LUN + dt.timedelta(days=6)
PW = "contraseña-segura"


def cfg(**cambios) -> Config:
    data = copy.deepcopy(DATA)
    data.update(cambios)
    return Config.model_validate(data)


def horario(asignaciones, desde=LUN, hasta=DOM) -> Schedule:
    return Schedule(desde=desde, hasta=hasta, asignaciones=[
        Assignment(empleado_id=e, fecha=desde + dt.timedelta(days=d), turno_id=t) for e, d, t in asignaciones])


# ---------------------------------------------------------------------------
# Tareas fijas
# ---------------------------------------------------------------------------
def test_las_tareas_se_suman_a_la_demanda_solo_sus_dias():
    limpiar = {"nombre": "Limpiar", "inicio": "21:00", "fin": "22:30", "personas": 1}
    pedido = {"nombre": "Recibir pedido", "inicio": "09:00", "fin": "10:00", "personas": 2, "dias": ["martes"]}
    sin, con = cfg(), cfg(tareas=[limpiar, pedido])
    lunes, martes = demand_for(sin, LUN), demand_for(con, LUN + dt.timedelta(days=1))
    for t in range(21 * 60, 22 * 60 + 30, 30):
        assert demand_for(con, LUN).required[t] == lunes.required.get(t, 0) + 1
        assert demand_for(con, LUN).tasks[t] == 1
    nueve = 9 * 60
    assert demand_for(con, LUN).required.get(nueve, 0) == lunes.required.get(nueve, 0)  # el pedido es solo los martes
    assert martes.required[nueve] == demand_for(sin, LUN + dt.timedelta(days=1)).required[nueve] + 2


def test_las_tareas_no_cuentan_los_dias_cerrados():
    data = copy.deepcopy(DATA)
    data["excepciones_fecha"] = [{"fecha": LUN.isoformat(), "cerrado": True}]
    data["tareas"] = [{"nombre": "Limpiar", "inicio": "21:00", "fin": "22:30"}]
    dem = demand_for(Config.model_validate(data), LUN)
    assert dem.closed and not dem.required and not dem.tasks


def test_una_tarea_tiene_que_terminar_despues_de_empezar():
    with pytest.raises(ValidationError):
        cfg(tareas=[{"nombre": "Mal", "inicio": "10:00", "fin": "09:00"}])
    with pytest.raises(ValidationError):
        cfg(tareas=[{"nombre": "Mal", "inicio": "09:00", "fin": "10:00", "dias": ["lunesdia"]}])


def test_el_motor_pone_gente_para_las_tareas():
    # Inventario el domingo antes de abrir: hace falta alguien de 07:00 a 08:00 más la demanda habitual.
    tarea = {"nombre": "Inventario", "inicio": "07:00", "fin": "08:00", "personas": 3, "dias": ["domingo"]}
    config = cfg(tareas=[tarea])
    h = generate(config, LUN, DOM, SolveOptions(max_segundos=10))
    alertas = evaluar(config, h)
    sin_cubrir = [a for a in alertas if a.codigo == "falta_cobertura" and a.fecha == DOM]
    base = demand_for(cfg(), DOM).required.get(7 * 60, 0)
    presentes = sum(1 for a in h.asignaciones if a.fecha == DOM and config.shift(a.turno_id).start_min <= 7 * 60
                    and config.shift(a.turno_id).end_min >= 8 * 60)
    assert presentes >= base + 3 and not sin_cubrir


# ---------------------------------------------------------------------------
# Sugerencias
# ---------------------------------------------------------------------------
def test_sin_alertas_no_hay_sugerencias():
    assert sugerir(cfg(), horario([]), []) == []


def test_personal_de_mas_sugiere_tareas_y_revisar_turnos():
    # Todo el mundo de tarde el miércoles: sobra mucha gente a primera y última hora.
    config = cfg()
    gente = [e.id for e in config.empleados if 2 not in e.fixed_off_indexes()]
    h = horario([(e, 2, "T") for e in gente])
    s = {x.clave: x for x in sugerir(config, h, evaluar(config, h))}
    assert "tareas" in s and s["tareas"].pantalla == "demanda"
    assert "turnos_largos" in s and "Tarde (16:00–22:00)" in s["turnos_largos"].detalle


def test_huecos_en_dias_con_libranzas_sugiere_moverlas():
    # Semana vacía: faltan personas todos los días; los más cortos son los que tienen más libranzas.
    config = cfg()
    h = horario([])
    s = {x.clave.split(":")[0]: x for x in sugerir(config, h, evaluar(config, h))}
    assert "libranzas" in s and s["libranzas"].pantalla == "equipo"
    assert "libranza" in s["libranzas"].detalle


def test_cierres_desiguales_sugiere_habilitar_a_alguien():
    config = cfg()
    h = horario([("carla", d, "CI") for d in range(1, 6)])
    s = {x.clave: x for x in sugerir(config, h, evaluar(config, h))}
    assert "habilitar:cerrar" in s
    sin_permiso = [e.nombre for e in config.active_employees() if not e.puede_cerrar]
    assert any(n in s["habilitar:cerrar"].detalle for n in sin_permiso)


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------
@pytest.fixture()
def admin(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    c = TestClient(app)
    assert c.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return c


def test_api_guarda_tareas_y_devuelve_sugerencias(admin):
    actual = admin.get("/api/config").json()
    config = actual["config"]
    config["tareas"] = [{"nombre": "Limpiar al cerrar", "inicio": "22:00", "fin": "22:30", "personas": 1, "dias": None}]
    r = admin.put("/api/config", json={"config": config, "base": actual["version"]})
    assert r.status_code == 200, r.text
    assert admin.get("/api/config").json()["config"]["tareas"][0]["nombre"] == "Limpiar al cerrar"

    t = dt.date.today()
    lunes = t + dt.timedelta(days=7 - t.weekday())
    r = admin.post("/api/horarios/generar", json={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.status_code == 200, r.text
    detalle = r.json()
    assert isinstance(detalle["sugerencias"], list)
    assert all({"clave", "pantalla", "titulo", "detalle"} <= set(s) for s in detalle["sugerencias"])
    # la cobertura del horario ya cuenta la tarea de cierre
    dia = detalle["cobertura"][lunes.isoformat()]
    assert any(t == 22 * 60 and req >= 1 for t, req, _ in dia["pasos"])
    p = admin.post(f"/api/horarios/{detalle['id']}/solucionar", json={}).json()
    assert "sugerencias" in p
