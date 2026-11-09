"""Historial explorable: versiones que mandaron en unas fechas, compararlas con hoy, renombrarlas y restaurarlas."""
import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.slack import Slack

PW = "contraseña-segura"


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


def _publicar(c, sid: int):
    r = c.post(f"/api/horarios/{sid}/publicar", json={"confirmar_criticas": True})
    assert r.status_code == 200, r.text


def test_historial_comparar_renombrar_y_restaurar(api):
    c = api
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + 7)
    a = _generar(c, lunes, lunes + dt.timedelta(days=6))
    _publicar(c, a)
    b = _generar(c, lunes + dt.timedelta(days=3), lunes + dt.timedelta(days=9))
    # Un cambio que se nota: quien trabaja el jueves en el primero libra en el segundo
    pub = c.get(f"/api/horarios/{a}").json()["horario"]
    jueves = (lunes + dt.timedelta(days=3)).isoformat()
    x = next(x for x in pub["asignaciones"] if x["fecha"] == jueves)
    assert c.patch(f"/api/horarios/{b}/celda", json={"empleado_id": x["empleado_id"], "fecha": jueves, "turno_id": None}).status_code == 200
    _publicar(c, b)

    # Historial: las dos versiones; la primera manda en 3 días y mandó en otros 4 hasta que la sustituyó la segunda
    hist = c.get(f"/api/horarios/{a}/historial").json()
    vs = {v["id"]: v for v in hist["versiones"]}
    assert set(vs) == {a, b}
    assert vs[a]["dias_ahora"] == 3 and vs[a]["dias_antes"] == 4 and vs[a]["sustituido_por"] == [b]
    assert vs[b]["dias_ahora"] == 4 and vs[b]["dias_antes"] == 0
    assert [v["id"] for v in hist["versiones"]] == [b, a]  # de la más reciente a la más antigua

    # Comparar la vieja con hoy: solo los días que ahora manda la otra, con el cambio del jueves
    comp = c.get(f"/api/horarios/{a}/comparar").json()
    assert comp["dias_publicados"] == 4 and comp["sustituye"][0]["id"] == b
    assert any(ch["fecha"] == jueves and ch["empleado_id"] == x["empleado_id"] and ch["antes"] is None and ch["despues"]
               for ch in comp["cambios"])

    # Renombrar
    r = c.patch(f"/api/horarios/{a}/nombre", json={"nombre": "  Semana buena  "})
    assert r.status_code == 200 and r.json()["nombre"] == "Semana buena"
    assert next(h for h in c.get("/api/horarios").json() if h["id"] == a)["nombre"] == "Semana buena"

    # Restaurar crea un borrador; lo publicado no cambia hasta publicarlo, y su revisión enseña lo que cambia
    r = c.post(f"/api/horarios/{a}/restaurar")
    assert r.status_code == 200, r.text
    nuevo = r.json()
    assert nuevo["estado"] == "borrador" and nuevo["nombre"] == "Restaurado de Semana buena" and nuevo["id"] not in (a, b)
    dia = c.get("/api/calendario", params={"desde": jueves, "hasta": jueves}).json()["dias"][jueves]
    assert dia["horario_id"] == b
    rev = c.get(f"/api/horarios/{nuevo['id']}/revision").json()
    assert any(ch["fecha"] == jueves and ch["empleado_id"] == x["empleado_id"] for ch in rev["cambios"])

    # Quitar el nombre
    assert c.patch(f"/api/horarios/{a}/nombre", json={"nombre": ""}).json()["nombre"] is None
