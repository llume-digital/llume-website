import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.slack import Slack

PW = "contraseña-segura"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#horarios"), secret="test", solve_seconds=8)
    c = TestClient(app)
    assert c.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return c


def week(c, desde="2026-11-09", hasta="2026-11-15"):
    r = c.post("/api/horarios/generar", json={"desde": desde, "hasta": hasta})
    assert r.status_code == 200, r.text
    return r.json()


def test_requiere_sesion(tmp_path):
    c = TestClient(create_app(str(tmp_path / "x.db"), secret="t"))
    assert c.get("/api/config").status_code == 401
    assert c.post("/api/login", json={"usuario": "admin", "password": "mal"}).status_code == 401
    assert c.get("/").status_code == 200  # la página de acceso sí se sirve


def test_config_valida_y_versiona(client):
    cfg = client.get("/api/config").json()
    v1 = cfg["version"]
    bad = json.loads(json.dumps(cfg["config"]))
    bad["turnos"][0]["fin"] = "05:00"
    r = client.put("/api/config", json={"config": bad, "base": v1})
    assert r.status_code == 422 and "turno" in r.json()["detail"].lower()
    good = cfg["config"]
    good["empleados"][0]["horas_semanales"] = 38
    r = client.put("/api/config", json={"config": good, "base": v1})
    assert r.status_code == 200 and r.json()["version"] > v1
    r = client.post(f"/api/config/restaurar/{v1}")
    assert r.json()["config"]["empleados"][0]["horas_semanales"] == 40


def test_generar_editar_y_publicar(client):
    d = week(client)
    sid = d["id"]
    assert d["estado"] == "borrador" and d["cobertura"]
    # Edición que rompe una regla: Gema no puede abrir
    r = client.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": "gema", "fecha": "2026-11-11", "turno_id": "AP"}).json()
    assert any(i["codigo"] == "no_puede_abrir" for i in r["horario"]["incidencias"])
    assert r["horario"]["bloqueos"][0]["turno_id"] == "AP"
    assert client.post(f"/api/horarios/{sid}/publicar").status_code == 409
    # Se corrige y se publica (Slack en simulación)
    client.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": "gema", "fecha": "2026-11-11", "turno_id": None})
    r = client.post(f"/api/horarios/{sid}/publicar")
    assert r.status_code == 200
    j = r.json()
    assert j["estado"] == "publicado" and j["slack"]["simulado"]
    assert len(j["slack"]["mensajes"]) == 1 + 10
    # Vista pública
    path = j["url_publica"].split("testserver")[1]
    html = client.get(path + "?e=ana").text
    assert "Tus turnos, Ana" in html and "Avisos" not in html
    # Un cambio tras publicar queda pendiente de avisar
    r = client.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": "fran", "fecha": "2026-11-12", "turno_id": None}).json()
    assert r["cambios_pendientes"] == ["fran"]
    r = client.post(f"/api/horarios/{sid}/notificar").json()
    assert r["cambios_pendientes"] == [] and len(r["slack"]["mensajes"]) == 2


def test_regenerar_respeta_bloqueos(client):
    sid = week(client)["id"]
    client.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": "irene", "fecha": "2026-11-13", "turno_id": "T"})
    r = client.post(f"/api/horarios/{sid}/regenerar").json()
    got = {(a["empleado_id"], a["fecha"]): a["turno_id"] for a in r["horario"]["asignaciones"]}
    assert got[("irene", "2026-11-13")] == "T"


def test_encadena_semanas(client):
    week(client, "2026-11-02", "2026-11-08")
    d = week(client, "2026-11-09", "2026-11-15")
    assert not [i for i in d["horario"]["incidencias"] if i["nivel"] == "error"]
    assert isinstance(d["horario"]["saldo_anterior"], dict)


def test_exportaciones(client):
    sid = week(client)["id"]
    csv = client.get(f"/api/horarios/{sid}/csv")
    assert csv.status_code == 200 and "empleado;horas" in csv.text
    assert "Resumen por empleado" in client.get(f"/api/horarios/{sid}/html").text


def test_usuarios(client):
    assert client.post("/api/usuarios", json={"usuario": "bea", "password": "corta"}).status_code == 400
    assert any(u["username"] == "bea" for u in client.post("/api/usuarios", json={"usuario": "bea", "password": "12345678"}).json())
    assert client.delete("/api/usuarios/admin").status_code == 400


def test_slack_real_con_transporte_simulado(tmp_path):
    from lopita_horarios import load_config
    from lopita_horarios.models import Assignment, Schedule
    import datetime as dt
    calls = []

    def handler(request: httpx.Request):
        body = json.loads(request.content or b"{}")
        calls.append((request.url.path, body))
        return httpx.Response(200, json={"ok": body.get("channel") != "U_FALLA", "error": "channel_not_found"})

    cfg = load_config("datos/ejemplo.json")
    cfg.empleados[0].slack_user_id = "U_ANA"
    cfg.empleados[1].slack_user_id = "U_FALLA"
    s = Slack(token="xoxb-test", channel="C123", transport=httpx.MockTransport(handler))
    h = Schedule(desde=dt.date(2026, 11, 9), hasta=dt.date(2026, 11, 15),
                 asignaciones=[Assignment(empleado_id="ana", fecha=dt.date(2026, 11, 11), turno_id="AP")])
    res = s.publish(cfg, h, "https://x/ver/t", solo=["ana", "bruno", "carla"])
    assert [c[1]["channel"] for c in calls] == ["C123", "U_ANA", "U_FALLA"]
    assert not res.ok
    assert res.mensajes[3]["error"].startswith("sin destino")  # Carla no tiene usuario ni email
    assert "Miércoles 11 de noviembre: Apertura de 07:00 a 15:00" in calls[1][1]["text"]


def test_movil_manifest_y_sin_cache(client):
    html = client.get("/").text
    assert 'rel="manifest"' in html and "recarga.js" not in html
    r = client.get("/static/app.js")
    assert r.status_code == 200 and r.headers["cache-control"] == "no-cache"
    assert client.get("/static/manifest.webmanifest").json()["display"] == "standalone"
    assert client.get("/dev/recarga").status_code in (401, 404)


def test_recarga_en_desarrollo(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_RECARGA", "1")
    c = TestClient(create_app(str(tmp_path / "r.db"), secret="t"))
    assert "/static/recarga.js" in c.get("/").text
    v = c.get("/dev/recarga").json()["version"]
    assert v == c.get("/dev/recarga").json()["version"]
