"""Revisión antes de publicar: diferencias con lo publicado, ediciones a mano que conservar y días pasados."""
import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app import revision
from app.db import Store
from app.main import create_app
from app.slack import Slack
from lopita_horarios.models import Assignment, Lock, Schedule

PW = "contraseña-segura"
D = dt.date(2026, 11, 2)  # lunes


def dia(n: int) -> dt.date:
    return D + dt.timedelta(days=n)


def horario(desde: int, hasta: int, turno: str = "M", bloqueos=()) -> Schedule:
    return Schedule(desde=dia(desde), hasta=dia(hasta), bloqueos=list(bloqueos),
                    asignaciones=[Assignment(empleado_id="ana", fecha=dia(i), turno_id=turno) for i in range(desde, hasta + 1)])


def publicar(store: Store, h: Schedule) -> int:
    sid = store.create_schedule(h, "admin")
    h.estado = "publicado"
    store.publish_schedule(sid, h)
    return sid


@pytest.fixture()
def store(tmp_path):
    return Store(str(tmp_path / "t.db"))


def test_diferencias_con_lo_publicado_y_dias_nuevos(store):
    a = publicar(store, horario(0, 6))
    b = store.create_schedule(horario(4, 9, "T"), "admin")
    rev = revision.revisar(store.list_schedules(), store.get_schedule(b), hoy=dia(0))
    assert [(c.fecha, c.antes, c.despues) for c in rev["cambios"]] == [(dia(i), "M", "T") for i in (4, 5, 6)]
    assert rev["dias_publicados"] == 3 and rev["dias_nuevos"] == 3
    assert rev["sustituye"] == [{"id": a, "desde": dia(4), "hasta": dia(6), "dias": 3}]
    assert rev["pasado"] == [] and rev["conservables"] == []


def test_ediciones_a_mano_de_lo_publicado_se_pueden_conservar(store):
    libre = Lock(empleado_id="ana", fecha=dia(5))  # en lo publicado, Ana libra el sábado a mano
    h = horario(0, 6, bloqueos=[libre])
    h.asignaciones = [x for x in h.asignaciones if x.fecha != dia(5)]
    publicar(store, h)
    b = store.create_schedule(horario(4, 9, "T"), "admin")
    row = store.get_schedule(b)
    rev = revision.revisar(store.list_schedules(), row, hoy=dia(0))
    assert [x["bloqueo"] for x in rev["conservables"]] == [libre]
    conservado = revision.conservar(row["horario"], [libre])
    assert dia(5) not in {x.fecha for x in conservado.asignaciones} and libre in conservado.bloqueos
    # Con la edición conservada ya no se ofrece
    rev = revision.revisar(store.list_schedules(), {**row, "horario": conservado}, hoy=dia(0))
    assert rev["conservables"] == []


def test_dias_pasados_que_cambian(store):
    publicar(store, horario(0, 6))
    b = store.create_schedule(horario(0, 6, "T"), "admin")
    rev = revision.revisar(store.list_schedules(), store.get_schedule(b), hoy=dia(3))
    assert rev["pasado"] == [dia(0), dia(1), dia(2)]


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    c = TestClient(app)
    assert c.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return c


def _generar(c, desde: dt.date, hasta: dt.date) -> int:
    r = c.post("/api/horarios/generar", json={"desde": desde.isoformat(), "hasta": hasta.isoformat()})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def test_api_revision_y_publicar_cambiando_el_pasado(api):
    c = api
    hoy = dt.date.today()
    desde, hasta = hoy - dt.timedelta(days=3), hoy + dt.timedelta(days=3)
    a = _generar(c, desde, hasta)
    assert c.post(f"/api/horarios/{a}/publicar", json={"confirmar_criticas": True}).status_code == 200
    b = _generar(c, desde, hasta)
    # Fuerza un cambio en un día pasado: quien trabaja ese día en el publicado libra en el borrador
    pub = c.get(f"/api/horarios/{a}").json()["horario"]
    x = next(x for x in pub["asignaciones"] if x["fecha"] == (hoy - dt.timedelta(days=2)).isoformat())
    r = c.patch(f"/api/horarios/{b}/celda", json={"empleado_id": x["empleado_id"], "fecha": x["fecha"], "turno_id": None})
    assert r.status_code == 200, r.text
    rev = c.get(f"/api/horarios/{b}/revision").json()
    assert x["fecha"] in rev["pasado"]
    assert any(ch["fecha"] == x["fecha"] and ch["pasado"] and ch["nombre"] for ch in rev["cambios"])
    r = c.post(f"/api/horarios/{b}/publicar", json={"confirmar_criticas": True})
    assert r.status_code == 409 and r.json()["codigo"] == "pasado"
    r = c.post(f"/api/horarios/{b}/publicar", json={"confirmar_criticas": True, "confirmar_pasado": True})
    assert r.status_code == 200, r.text
    assert c.get("/api/calendario", params={"desde": x["fecha"], "hasta": x["fecha"]}).json()["dias"][x["fecha"]]["horario_id"] == b
