"""Sin servidor (arreglos_aparte): guardar una baja responde al momento y el arreglo se hace con POST /api/arreglos.

Antes el arreglo de los horarios afectados iba dentro del guardado; en el navegador eso dejaba la app sin cargar
ni guardar varios minutos mientras se recalculaba un mes.
"""
import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.slack import Slack
from tests.test_alertas_api import PW, make_week
from tests.test_bajas import _baja


@pytest.fixture()
def aparte(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8,
                     arreglos_aparte=True, arreglo_seconds=4)
    admin = TestClient(app)
    assert admin.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return admin


def test_baja_deja_el_arreglo_pendiente_y_se_hace_aparte(aparte):
    admin = aparte
    sid, lunes = make_week(admin, publish=True)
    horario = admin.get(f"/api/horarios/{sid}").json()["horario"]
    emp = next(a["empleado_id"] for a in horario["asignaciones"] if a["fecha"] == (lunes + dt.timedelta(days=1)).isoformat())
    suyos = sorted(a["fecha"] for a in horario["asignaciones"] if a["empleado_id"] == emp)
    assert admin.post("/api/notificaciones/leer", json={}).status_code == 200
    assert admin.get("/api/me").json()["arreglos_pendientes"] is False

    r = _baja(admin, emp, lunes.isoformat(), (lunes + dt.timedelta(days=364)).isoformat())
    assert r["arreglos"] == [] and r["arreglos_pendientes"] is True
    assert admin.get("/api/me").json()["arreglos_pendientes"] is True
    assert len(admin.get("/api/horarios").json()) == 1, "el guardado no debe calcular nada"

    hechos = admin.post("/api/arreglos").json()["arreglos"]
    assert len(hechos) == 1
    assert admin.get("/api/me").json()["arreglos_pendientes"] is False
    arreglo = admin.get(f"/api/horarios/{hechos[0]}").json()
    assert not [a for a in arreglo["horario"]["asignaciones"] if a["empleado_id"] == emp]

    # Con la configuración de antes del cambio se avisa de los turnos que la baja deja sin hacer.
    avisos = [n for n in admin.get("/api/notificaciones").json() if n["tipo"] == "turnos_perdidos"]
    assert len(avisos) == 1 and [t["fecha"] for t in avisos[0]["detalle"]["turnos"]] == suyos

    assert admin.post("/api/arreglos").json() == {"arreglos": []}


def test_varios_cambios_seguidos_un_solo_arreglo_desde_la_primera_version(aparte):
    admin = aparte
    sid, lunes = make_week(admin, publish=True)
    horario = admin.get(f"/api/horarios/{sid}").json()["horario"]
    dia = (lunes + dt.timedelta(days=1)).isoformat()
    a, b = sorted({x["empleado_id"] for x in horario["asignaciones"] if x["fecha"] == dia})[:2]
    _baja(admin, a, dia, dia)
    _baja(admin, b, dia, dia)
    hechos = admin.post("/api/arreglos").json()["arreglos"]
    assert len(hechos) == 1
    nuevo = admin.get(f"/api/horarios/{hechos[0]}").json()["horario"]
    assert not [x for x in nuevo["asignaciones"] if x["fecha"] == dia and x["empleado_id"] in (a, b)]
    perdidos = {t["fecha"] for n in admin.get("/api/notificaciones").json() if n["tipo"] == "turnos_perdidos"
                for t in n["detalle"]["turnos"]}
    assert dia in perdidos


def test_con_servidor_el_arreglo_sigue_dentro_del_guardado(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    admin = TestClient(create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8))
    assert admin.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    sid, lunes = make_week(admin, publish=True)
    emp = admin.get(f"/api/horarios/{sid}").json()["horario"]["asignaciones"][0]["empleado_id"]
    r = _baja(admin, emp, lunes.isoformat(), (lunes + dt.timedelta(days=30)).isoformat())
    assert r["arreglos"] and r["arreglos_pendientes"] is False
