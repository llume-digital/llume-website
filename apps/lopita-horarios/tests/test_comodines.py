"""Trabajadores comodín: sin horas de contrato, solo cubren lo que el resto de la plantilla no llega a cubrir."""
import datetime as dt
import json

import pytest
from pydantic import ValidationError

from app.horas import saldo_arrastrado
from lopita_horarios import Config, SolveOptions, generate, validate
from lopita_horarios.alertas import evaluar
from lopita_horarios.models import Assignment, Employee, Schedule
from lopita_horarios.planning import comodin_min_minutes, target_minutes, upper_minutes
from lopita_horarios.plantilla import semanas
from lopita_horarios.validator import compute_stats

LUN = dt.date(2026, 11, 9)
DOM = LUN + dt.timedelta(days=6)
SEMANA = [LUN + dt.timedelta(days=i) for i in range(7)]
FAST = SolveOptions(max_segundos=10, hilos=1)
TODOS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


def config(empleados, **reglas) -> Config:
    """Un turno de 6 h (8:00–14:00) y una persona necesaria de 8:00 a 14:00 todos los días: 42 h por semana."""
    return Config.model_validate({
        "empleados": empleados,
        "turnos": [{"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "14:00"}],
        "tipos_dia": [{"nombre": "normal", "franjas": [{"inicio": "08:00", "fin": "14:00", "personas": 1}]}],
        "tipo_dia_por_semana": {d: "normal" for d in TODOS},
        "reglas": reglas,
    })


def emp(id_, horas, **extra):
    return {"id": id_, "nombre": id_.title(), "horas_semanales": horas, **extra}


def comodin(id_="x1", minimo=None, maximo=None):
    return {"id": id_, "nombre": id_.upper(), "comodin": True, "horas_min_semana": minimo, "horas_max_semana": maximo}


def horas(schedule, emp_id) -> float:
    return sum(6 for a in schedule.asignaciones if a.empleado_id == emp_id)


def turnos(emp_id, n) -> list[Assignment]:
    return [Assignment(empleado_id=emp_id, fecha=SEMANA[i], turno_id="M") for i in range(n)]


def codigos(issues_o_alertas, emp_id=None):
    return {i.codigo for i in issues_o_alertas if emp_id is None or i.empleado_id == emp_id}


# ---------------------------------------------------------------------------- modelo
def test_comodin_no_necesita_horas_de_contrato():
    e = Employee.model_validate(comodin(minimo=5, maximo=30))
    assert e.comodin and e.horas_semanales == 0
    c = config([emp("ana", 30), comodin(minimo=7, maximo=14)])
    x1 = c.employee("x1")
    assert target_minutes(c, x1, SEMANA) == 0
    assert comodin_min_minutes(c, x1, SEMANA) == 7 * 60
    assert upper_minutes(c, x1, SEMANA) == 14 * 60
    # Semana partida: prorrata más una jornada completa, sin pasar del máximo de una semana entera.
    assert upper_minutes(c, x1, SEMANA[:3]) == 14 * 60  # 6 h + 9 h, pero nunca más del máximo
    assert upper_minutes(c, x1, SEMANA[:1]) == 2 * 60 + 9 * 60
    assert upper_minutes(c, Employee.model_validate(comodin()), SEMANA) is None


@pytest.mark.parametrize("datos, error", [
    (emp("ana", 0), "horas de contrato"),
    ({"id": "ana", "nombre": "Ana"}, "horas de contrato"),
    (emp("ana", 30, horas_max_semana=10), "solo se usan en los comodines"),
    (comodin(minimo=20, maximo=10), "no puede pasar del máximo"),
    (comodin(maximo=0), "greater than 0"),
    (comodin(minimo=61), "less than or equal"),
])
def test_validacion_de_horas(datos, error):
    with pytest.raises(ValidationError, match=error):
        Employee.model_validate(datos)


def test_datos_antiguos_siguen_valiendo():
    e = Employee.model_validate(emp("ana", 30))
    assert not e.comodin and e.horas_min_semana is None and e.horas_max_semana is None


# ---------------------------------------------------------------------------- motor
def test_sin_deficit_el_comodin_no_trabaja():
    # Ana (30 h) y Bea (12 h) cubren justo las 42 h de la semana.
    s = generate(config([emp("ana", 30), emp("bea", 12), comodin()]), LUN, DOM, FAST)
    assert horas(s, "x1") == 0
    assert horas(s, "ana") == 30 and horas(s, "bea") == 12
    assert "falta_cobertura" not in codigos(s.incidencias)


def test_con_deficit_el_comodin_cubre_lo_que_falta():
    # Ana solo puede hacer 5 días (30 h): faltan 12 h y el comodín las cubre, sin quitarle horas a Ana.
    s = generate(config([emp("ana", 30), comodin()]), LUN, DOM, FAST)
    assert horas(s, "ana") == 30
    assert horas(s, "x1") == 12
    assert not [i for i in s.incidencias if i.nivel == "error"]
    assert "falta_cobertura" not in codigos(s.incidencias)


def test_el_comodin_va_antes_que_las_horas_extra():
    # Faltan 6 h: Bea (6 h de contrato) podría hacer un turno más como horas extra, pero lo hace el comodín.
    s = generate(config([emp("ana", 30), emp("bea", 6), comodin()]), LUN, DOM, FAST)
    assert (horas(s, "ana"), horas(s, "bea"), horas(s, "x1")) == (30, 6, 6)
    assert "horas_extra" not in codigos(s.incidencias)


def test_respeta_el_maximo_del_comodin():
    # Faltan 12 h, pero el comodín puede hacer como mucho 6: queda un día sin cubrir.
    c = config([emp("ana", 30), comodin(maximo=6)])
    s = generate(c, LUN, DOM, FAST)
    assert horas(s, "x1") == 6
    assert "falta_cobertura" in codigos(s.incidencias)
    assert "semana_excedida" not in codigos(s.incidencias)


def test_respeta_el_minimo_del_comodin_aunque_no_haya_deficit():
    s = generate(config([emp("ana", 30), emp("bea", 12), comodin(minimo=6)]), LUN, DOM, FAST)
    assert horas(s, "x1") == 6
    assert "comodin_minimo" not in codigos(s.incidencias)


def test_varios_comodines_se_reparten_el_deficit_dentro_de_sus_maximos():
    s = generate(config([emp("ana", 30), comodin("x1", maximo=6), comodin("x2", maximo=6)]), LUN, DOM, FAST)
    assert (horas(s, "x1"), horas(s, "x2")) == (6, 6)
    assert "falta_cobertura" not in codigos(s.incidencias)


def test_el_comodin_cumple_las_reglas_duras():
    # Solo con el comodín: aunque falte gente, libra lo que marca la ley (2 días por semana).
    s = generate(config([comodin()]), LUN, DOM, FAST)
    assert horas(s, "x1") == 30
    assert not [i for i in s.incidencias if i.nivel == "error"]


# ---------------------------------------------------------------------------- validador y resumen
def test_resumen_del_comodin_sin_objetivo_ni_horas_extra():
    c = config([emp("ana", 30), comodin()])
    st = {s.empleado_id: s for s in compute_stats(c, LUN, DOM, turnos("x1", 3))}
    assert st["x1"].comodin and st["x1"].horas == 18
    assert st["x1"].horas_objetivo == 0 and st["x1"].horas_extra == 0
    assert not st["ana"].comodin
    assert codigos(validate(c, LUN, DOM, turnos("x1", 3)), "x1") == set()


def test_validador_avisa_del_maximo_y_del_minimo():
    c = config([comodin("x1", maximo=12), comodin("x2", minimo=18)])
    issues = validate(c, LUN, DOM, turnos("x1", 3) + turnos("x2", 2))
    excedida = [i for i in issues if i.codigo == "semana_excedida"]
    assert [i.empleado_id for i in excedida] == ["x1"] and excedida[0].nivel == "error"
    minimo = [i for i in issues if i.codigo == "comodin_minimo"]
    assert [i.empleado_id for i in minimo] == ["x2"] and minimo[0].nivel == "aviso"


def test_minimo_prorrateado_con_ausencias():
    c = Config.model_validate({**config([comodin(minimo=14)]).model_dump(mode="json"),
                               "ausencias": [{"empleado_id": "x1", "desde": str(LUN), "hasta": str(LUN + dt.timedelta(days=3))}]})
    assert comodin_min_minutes(c, c.employee("x1"), SEMANA) == 6 * 60  # 14 h x 3/7
    assert "comodin_minimo" not in codigos(validate(c, LUN, DOM, [
        Assignment(empleado_id="x1", fecha=SEMANA[5], turno_id="M")]))


# ---------------------------------------------------------------------------- alertas
def test_alertas_no_tratan_al_comodin_como_un_contrato():
    c = config([emp("ana", 30), emp("bea", 30), comodin(minimo=12)], arrastrar_saldo=True, max_saldo_horas=1)
    h = Schedule(desde=LUN, hasta=DOM, asignaciones=turnos("ana", 5) + turnos("x1", 1))
    alertas = evaluar(c, h)
    del_comodin = codigos(alertas, "x1")
    assert not del_comodin & {"horas_extra", "horas_por_debajo", "sin_turnos", "semana_corta", "saldo_desbordado"}
    minimo = [a for a in alertas if a.codigo == "comodin_minimo"]
    assert len(minimo) == 1 and minimo[0].empleado_id == "x1" and "6 h" in minimo[0].detalle
    assert "sin_turnos" in codigos(alertas, "bea")  # los contratos siguen avisando


def test_reparto_no_cuenta_a_los_comodines():
    # El comodín hace todos los fines de semana y todos los cierres: no es un reparto injusto.
    c = Config.model_validate({
        **config([emp("ana", 30, puede_cerrar=True), emp("bea", 30, puede_cerrar=True),
                  {**comodin(), "puede_cerrar": True}]).model_dump(mode="json"),
        "turnos": [{"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "14:00", "tipo": "cierre"}],
    })
    sabados = [LUN + dt.timedelta(days=d) for d in (5, 6)]
    h = Schedule(desde=LUN, hasta=DOM, asignaciones=[
        *[Assignment(empleado_id="x1", fecha=d, turno_id="M") for d in sabados],
        *[Assignment(empleado_id=e, fecha=SEMANA[i], turno_id="M") for e, i in (("ana", 0), ("bea", 1))],
    ])
    assert not codigos(evaluar(c, h)) & {"reparto_fines_semana", "reparto_cierres"}


def test_plantilla_cuenta_la_capacidad_de_los_comodines():
    c = config([emp("ana", 30), comodin(minimo=6, maximo=12)])
    (sem,) = semanas(c, LUN, DOM)
    assert (sem.demanda, sem.contrato, sem.maximo, sem.comodines) == (42, 36, 42, 6)
    alertas = evaluar(c, Schedule(desde=LUN, hasta=DOM, asignaciones=[]))
    assert "plantilla_insuficiente" not in codigos(alertas)
    justa = [a for a in alertas if a.codigo == "plantilla_justa"]
    assert justa and "comodines pueden poner hasta 6 h" in justa[0].detalle


def test_plantilla_con_comodin_sin_maximo():
    c = config([emp("ana", 30), comodin()])
    (sem,) = semanas(c, LUN, DOM)
    assert sem.contrato == 30 and sem.maximo == 60 and sem.comodines == 30


# ---------------------------------------------------------------------------- saldo
def test_el_comodin_no_arrastra_saldo():
    c = config([emp("ana", 30), comodin()], arrastrar_saldo=True)
    prev = Schedule(desde=LUN, hasta=DOM, asignaciones=turnos("ana", 4) + turnos("x1", 3))
    prev.resumen = compute_stats(c, LUN, DOM, prev.asignaciones)
    assert saldo_arrastrado(c, prev, []) == {"ana": -6}
    # Alguien que antes tenía contrato y ahora es comodín tampoco arrastra lo de antes.
    ahora = config([emp("ana", 30), {**comodin(), "id": "ana"}][1:], arrastrar_saldo=True)
    assert saldo_arrastrado(ahora, prev, []) == {}


# ---------------------------------------------------------------------------- API
def test_api_guarda_comodines_y_genera(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from app.main import create_app
    from app.slack import Slack

    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", "contraseña-segura")
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    client = TestClient(create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="t", solve_seconds=8))
    assert client.post("/api/login", json={"usuario": "admin", "password": "contraseña-segura"}).status_code == 200
    cfg = client.get("/api/config").json()
    nueva = json.loads(json.dumps(cfg["config"]))
    nueva["empleados"].append({"id": "comodin-1", "nombre": "X1", "horas_semanales": 0, "comodin": True,
                               "horas_min_semana": None, "horas_max_semana": 20})
    r = client.put("/api/config", json={"config": nueva, "base": cfg["version"]})
    assert r.status_code == 200, r.text
    guardado = next(e for e in client.get("/api/config").json()["config"]["empleados"] if e["id"] == "comodin-1")
    assert guardado["comodin"] is True and guardado["horas_max_semana"] == 20

    r = client.post("/api/horarios/generar", json={"desde": str(LUN), "hasta": str(DOM)})
    assert r.status_code == 200, r.text
    h = r.json()
    horario = h.get("horario", h)
    resumen = next(s for s in horario["resumen"] if s["empleado_id"] == "comodin-1")
    assert resumen["comodin"] is True and resumen["horas_objetivo"] == 0 and resumen["horas"] <= 20

    mal = json.loads(json.dumps(nueva))
    mal["empleados"][-1]["horas_min_semana"] = 30
    v = client.get("/api/config").json()["version"]
    assert client.put("/api/config", json={"config": mal, "base": v}).status_code in (400, 422)
