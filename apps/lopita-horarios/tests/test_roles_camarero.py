"""Roles de un puesto (caja, cafetera, sala, lava para los camareros): uno por turno, con reglas de mínimo y máximo."""
import copy
import datetime as dt
import json
import pathlib

import pytest
from pydantic import ValidationError

from lopita_horarios import Config
from lopita_horarios.alertas import evaluar
from lopita_horarios.cambios import describir, diferencias, firma, leer_firma
from lopita_horarios.edicion import EdicionInvalida, Tramo, aplicar_dia, rol_manual
from lopita_horarios.models import Assignment, Lock, Puesto, Schedule
from lopita_horarios.planning import function_presence, role_posts
from lopita_horarios.report import coverage, hours_csv
from lopita_horarios.solver import SolveOptions, generate
from lopita_horarios.validator import validate

DATA = json.loads((pathlib.Path(__file__).parent.parent / "datos" / "ejemplo.json").read_text(encoding="utf-8"))
LUN = dt.date(2026, 11, 9)
MIE = LUN + dt.timedelta(days=2)
DOM = LUN + dt.timedelta(days=6)

CAJA = {"id": "caja", "nombre": "Caja", "puesto": "sala",
        "reglas": [{"inicio": "09:00", "fin": "21:00", "personas": 1}]}
CAFETERA = {"id": "cafetera", "nombre": "Cafetera", "puesto": "sala", "reglas": []}
SALA = {"id": "mesas", "nombre": "Sala", "puesto": "sala", "reglas": []}
LAVA = {"id": "lava", "nombre": "Lava", "puesto": "sala", "reglas": [{"inicio": "08:00", "fin": "22:00", "personas": 0, "maximo": 1}]}
TODOS = ("caja", "cafetera", "mesas", "lava")


def cfg(roles: dict[str, tuple[str, ...]] | None = None, funciones=(CAJA, CAFETERA, SALA, LAVA)) -> Config:
    """Ejemplo con los roles de camarero. roles: persona -> sus roles; quien no sale, todos menos caja."""
    data = copy.deepcopy(DATA)
    data["funciones"] = [copy.deepcopy(f) for f in funciones]
    roles = roles or {}
    ids = {f["id"] for f in funciones}
    for e in data["empleados"]:
        e["funciones"] = [f for f in roles.get(e["id"], ("mesas", "cafetera", "lava")) if f in ids]
    return Config.model_validate(data)


CAJEROS = {"ana": ("caja", "mesas"), "bruno": ("caja", "mesas"), "julia": ("caja", "cafetera"), "elena": ("caja", "lava")}


# ---------------------------------------------------------------------------- modelo
def test_reglas_y_roles_validos():
    with pytest.raises(ValidationError, match="mínimo o un máximo"):
        cfg(funciones=({**CAJA, "reglas": [{"inicio": "09:00", "fin": "12:00", "personas": 0}]},))
    with pytest.raises(ValidationError, match="no puede ser menor"):
        cfg(funciones=({**CAJA, "reglas": [{"inicio": "09:00", "fin": "12:00", "personas": 2, "maximo": 1}]},))
    with pytest.raises(ValidationError, match="solo vale para los roles"):
        cfg(funciones=({**LAVA, "puesto": None},), roles={})
    c = cfg(CAJEROS)
    assert c.roles_de(c.employee("julia"), Puesto.sala) == ["caja", "cafetera"]
    assert c.roles_de(c.employee("julia"), Puesto.cocina) == []
    assert role_posts(c, LUN) == {Puesto.sala}


def test_sin_reglas_ese_dia_no_se_reparten_roles():
    c = cfg(CAJEROS, funciones=({**CAJA, "reglas": [{"inicio": "09:00", "fin": "21:00", "personas": 1,
                                                       "dias": ["lunes"]}]}, CAFETERA, SALA))
    assert role_posts(c, LUN) == {Puesto.sala} and role_posts(c, MIE) == set()


# ---------------------------------------------------------------------------- motor
@pytest.fixture(scope="module")
def semana():
    c = cfg(CAJEROS)
    return c, generate(c, LUN, DOM, SolveOptions(max_segundos=20))


def test_el_motor_da_un_rol_suyo_a_cada_camarero(semana):
    c, h = semana
    assert h.asignaciones
    for a in h.asignaciones:
        e = c.employee(a.empleado_id)
        assert a.funcion in c.roles_de(e, c.puesto_de(a)), a


def test_el_motor_cumple_caja_y_lava(semana):
    c, h = semana
    for i in range(7):
        d = LUN + dt.timedelta(days=i)
        pres = function_presence(c, d, h.asignaciones)
        assert all(n >= mn for _, mn, _, n in pres["caja"]), d
        assert all(n <= mx for _, _, mx, n in pres["lava"]), d
        for a in h.asignaciones:
            if a.fecha == d and a.funcion == "caja":
                assert a.empleado_id in CAJEROS
    assert not [i for i in h.incidencias if i.codigo in ("falta_funcion", "exceso_funcion", "rol_no_habilitado")]


def test_cada_persona_hace_un_solo_rol_a_la_vez():
    """Quien sabe hacer caja y cafetera no cuenta para las dos a la vez (como pasaría con una tarea de apoyo)."""
    regla = {"inicio": "09:00", "fin": "13:00", "personas": 1}
    c = cfg({"ana": ("caja", "cafetera")}, funciones=({**CAJA, "reglas": [regla]}, {**CAFETERA, "reglas": [regla]}))
    asign = [Assignment(empleado_id="ana", fecha=MIE, turno_id="M", puesto="sala", funcion="caja")]
    avisos = [i.mensaje for i in validate(c, MIE, MIE, asign) if i.codigo == "falta_funcion"]
    assert any("«Cafetera»" in m for m in avisos) and not any("«Caja»" in m for m in avisos)


def test_el_motor_respeta_un_rol_fijado_a_mano():
    c = cfg(CAJEROS)
    bloqueo = Lock(empleado_id="bruno", fecha=MIE + dt.timedelta(days=2), turno_id="M", puesto="sala", funcion="mesas")
    h = generate(c, LUN, DOM, SolveOptions(max_segundos=10), bloqueos=[bloqueo])
    a = next(a for a in h.asignaciones if a.empleado_id == "bruno" and a.fecha == bloqueo.fecha)
    assert (a.turno_id, a.funcion) == ("M", "mesas")


# ---------------------------------------------------------------------------- validador, alertas, informes
def test_rol_que_no_es_suyo_o_de_otro_puesto_es_un_error():
    c = cfg(CAJEROS)
    asign = [Assignment(empleado_id="fran", fecha=MIE, turno_id="M", puesto="sala", funcion="caja"),
             Assignment(empleado_id="bruno", fecha=MIE, turno_id="T", puesto="cocina", funcion="caja")]
    errores = [i.mensaje for i in validate(c, MIE, MIE, asign) if i.codigo == "rol_no_habilitado"]
    assert any("Fran" in m and "no es uno de sus roles" in m for m in errores)
    assert any("Bruno" in m and "es un rol de sala" in m for m in errores)


def test_alerta_si_sobra_gente_en_un_rol():
    c = cfg()
    asign = [Assignment(empleado_id=e, fecha=MIE, turno_id="M", puesto="sala", funcion="lava") for e in ("ana", "fran")]
    h = Schedule(desde=MIE, hasta=MIE, asignaciones=asign)
    assert any(i.codigo == "exceso_funcion" for i in validate(c, MIE, MIE, asign))
    alerta = next(a for a in evaluar(c, h) if a.codigo == "exceso_funcion")
    assert "«Lava»" in alerta.titulo and "08:00–14:00 (1)" in alerta.detalle
    cob = coverage(c, h)[MIE.isoformat()]["funciones"]["lava"]
    assert [8 * 60, 0, 2, 1] in cob
    assert "Ana;Mañana;sala;08:00;14:00;6;Lava" in hours_csv(c, h)


# ---------------------------------------------------------------------------- cambios y avisos
def test_cambiar_de_rol_cuenta_como_cambio():
    antes = Assignment(empleado_id="ana", fecha=MIE, turno_id="M", puesto="sala", funcion="caja")
    despues = antes.model_copy(update={"funcion": "lava"})
    assert firma(antes) == "M#sala/caja" and leer_firma("M#sala/caja").funcion == "caja"
    assert len(diferencias([antes], [despues])) == 1
    assert diferencias([antes], [antes.model_copy()]) == []
    c = cfg()
    texto = describir({s.id: s for s in c.turnos}, firma(antes), {"caja": "Caja"})
    assert texto == "Mañana (08:00–14:00, sala, Caja)"


# ---------------------------------------------------------------------------- edición a mano
def test_rol_manual():
    c = cfg(CAJEROS)
    julia = c.employee("julia")
    assert rol_manual(c, julia, MIE, Puesto.sala, None, None) == "caja"  # su rol principal
    assert rol_manual(c, julia, MIE, Puesto.sala, "cafetera", None) == "cafetera"
    assert rol_manual(c, julia, MIE, Puesto.sala, "", None) is None
    previa = Assignment(empleado_id="julia", fecha=MIE, turno_id="M", puesto="sala", funcion="cafetera")
    assert rol_manual(c, julia, MIE, Puesto.sala, None, previa) == "cafetera"
    assert rol_manual(c, julia, MIE, Puesto.cocina, None, previa) is None
    with pytest.raises(EdicionInvalida, match="no puede hacer «Lava»"):
        rol_manual(c, julia, MIE, Puesto.sala, "lava", None)
    with pytest.raises(EdicionInvalida, match="no de cocina"):
        rol_manual(c, julia, MIE, Puesto.cocina, "caja", None)


def test_la_vista_de_dia_guarda_y_bloquea_el_rol():
    c = cfg(CAJEROS)
    h = Schedule(desde=MIE, hasta=MIE, asignaciones=[
        Assignment(empleado_id="julia", fecha=MIE, turno_id="M", puesto="sala", funcion="caja")])
    nuevo = aplicar_dia(c, h, MIE, [Tramo(empleado_id="julia", inicio="08:00", fin="14:00", puesto="sala",
                                          funcion="cafetera")])
    assert nuevo.asignaciones[0].funcion == "cafetera"
    assert nuevo.bloqueos[0].funcion == "cafetera"
    igual = aplicar_dia(c, h, MIE, [Tramo(empleado_id="julia", inicio="08:00", fin="14:00", puesto="sala")])
    assert igual.asignaciones[0].funcion == "caja" and not igual.bloqueos


# ---------------------------------------------------------------------------- API
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


def test_api_roles_en_la_configuracion_y_en_la_casilla(admin):
    actual = admin.get("/api/config").json()
    config = actual["config"]
    config["funciones"] = [CAJA, CAFETERA, SALA, LAVA]
    for e in config["empleados"]:
        e["funciones"] = list(CAJEROS.get(e["id"], ("mesas", "cafetera", "lava")))
    r = admin.put("/api/config", json={"config": config, "base": actual["version"]})
    assert r.status_code == 200, r.text
    h = admin.post("/api/horarios/generar", json={"desde": LUN.isoformat(), "hasta": DOM.isoformat()}).json()
    a = next(a for a in h["horario"]["asignaciones"] if a["empleado_id"] == "julia")
    assert a["funcion"] in ("caja", "cafetera")

    celda = {"empleado_id": "julia", "fecha": a["fecha"], "turno_id": a["turno_id"], "puesto": "sala"}
    r = admin.patch(f"/api/horarios/{h['id']}/celda", json={**celda, "funcion": "lava"})
    assert r.status_code == 400 and "no puede hacer «Lava»" in r.json()["detail"]
    r = admin.patch(f"/api/horarios/{h['id']}/celda", json={**celda, "funcion": "cafetera", "conservar_horas": True})
    assert r.status_code == 200, r.text
    nueva = next(x for x in r.json()["horario"]["asignaciones"] if x["empleado_id"] == "julia" and x["fecha"] == a["fecha"])
    assert nueva["funcion"] == "cafetera"
    bloqueo = next(b for b in r.json()["horario"]["bloqueos"] if b["empleado_id"] == "julia")
    assert bloqueo["funcion"] == "cafetera"


def test_partiendo_de_un_horario_no_cambia_roles_sin_motivo(semana):
    """Al solucionar alertas se parte del horario: cambiar de rol también cuesta, así que se queda como estaba."""
    c, h = semana
    otra = generate(c, LUN, DOM, SolveOptions(max_segundos=10), referencia=h.asignaciones)
    assert diferencias(h.asignaciones, otra.asignaciones) == []
