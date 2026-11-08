import datetime as dt

import httpx
import pytest
from fastapi.testclient import TestClient

from app import calendario
from app.main import create_app
from app.slack import Slack
from tests.test_roles import PW, make_worker


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    admin = TestClient(app)
    assert admin.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return app, admin


def publish_week(admin, start):
    r = admin.post("/api/horarios/generar", json={"desde": start.isoformat(), "hasta": (start + dt.timedelta(days=6)).isoformat()})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    r = admin.post(f"/api/horarios/{sid}/publicar", json={"confirmar_criticas": True})
    assert r.status_code == 200, r.text
    return sid, r.json()


def next_monday():
    t = dt.date.today()
    return t + dt.timedelta(days=7 - t.weekday())


def eventos(texto):
    return [b for b in texto.split("BEGIN:VEVENT")[1:]]


def test_trabajador_se_suscribe_y_el_calendario_trae_sus_turnos(env):
    app, admin = env
    w = make_worker(app, admin)
    assert w.get("/api/mi/calendario").json() == {"disponible": True, "enlaces": None}
    en = w.post("/api/mi/calendario", json={}).json()["enlaces"]
    assert en["url"].endswith(".ics") and "/cal/" in en["url"]
    assert en["webcal"].startswith("webcal://") and en["google"].startswith("https://calendar.google.com/")
    # Sin horario publicado: calendario válido y vacío
    anon = TestClient(app)
    ruta = "/cal/" + en["url"].rsplit("/", 1)[1]
    r = anon.get(ruta)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    assert r.text.startswith("BEGIN:VCALENDAR\r\n") and r.text.endswith("END:VCALENDAR\r\n") and not eventos(r.text)
    # Un borrador no sale; al publicarlo, sí
    lunes = next_monday()
    r0 = admin.post("/api/horarios/generar", json={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert not eventos(anon.get(ruta).text)
    sid = r0.json()["id"]
    assert admin.post(f"/api/horarios/{sid}/publicar", json={"confirmar_criticas": True}).status_code == 200
    h = admin.get(f"/api/horarios/{sid}").json()["horario"]
    mios = [a for a in h["asignaciones"] if a["empleado_id"] == "ana"]
    texto = anon.get(ruta).text
    assert len(eventos(texto)) == len(mios) > 0
    a = mios[0]
    assert f"UID:turno-ana-{a['fecha']}@lopita-horarios" in texto
    assert "DTSTART;TZID=Europe/Madrid:" + a["fecha"].replace("-", "") + "T" in texto
    assert all(len(l.encode()) <= 75 for l in texto.split("\r\n"))
    # Cambiar el enlace invalida el anterior
    nuevo = w.post("/api/mi/calendario", json={"renovar": True}).json()["enlaces"]["url"]
    assert nuevo != en["url"] and anon.get(ruta).status_code == 404
    assert anon.get("/cal/" + nuevo.rsplit("/", 1)[1]).status_code == 200
    assert anon.get("/cal/inventado.ics").status_code == 404


def test_ausencias_y_permisos(env):
    app, admin = env
    w = make_worker(app, admin)
    # solo encargados ven y crean enlaces de otros
    assert w.get("/api/calendarios").status_code == 403
    assert w.post("/api/calendarios/bruno", json={}).status_code == 403
    assert admin.get("/api/mi/calendario").status_code == 403
    assert admin.post("/api/calendarios/nadie", json={}).status_code == 404
    url = admin.post("/api/calendarios/ana", json={}).json()["enlaces"]["url"]
    personas = {p["empleado_id"]: p for p in admin.get("/api/calendarios").json()["personas"]}
    assert personas["ana"]["enlaces"]["url"] == url and personas["bruno"]["enlaces"] is None
    # el trabajador ve el mismo enlace que creó el encargado
    assert w.get("/api/mi/calendario").json()["enlaces"]["url"] == url
    cfg = admin.get("/api/config").json()
    d = next_monday() + dt.timedelta(days=14)
    cfg["config"]["ausencias"].append({"empleado_id": "ana", "desde": d.isoformat(), "hasta": (d + dt.timedelta(days=2)).isoformat(), "motivo": "vacaciones"})
    assert admin.put("/api/config", json={"config": cfg["config"], "base": cfg["version"]}).status_code == 200
    texto = TestClient(app).get("/cal/" + url.rsplit("/", 1)[1]).text
    assert f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}" in texto
    assert f"DTEND;VALUE=DATE:{(d + dt.timedelta(days=3)).strftime('%Y%m%d')}" in texto and "SUMMARY:Vacaciones" in texto


def test_slack_incluye_el_enlace_del_calendario(env):
    app, admin = env
    _, res = publish_week(admin, next_monday())
    privados = [m for m in res["slack"]["mensajes"] if not m["destino"].startswith("#")]
    assert privados and all("calendar.google.com" in m["texto"] and "webcal://" in m["texto"] for m in privados)
    # publicar crea los enlaces de todos, y son los que luego ve cada persona
    personas = admin.get("/api/calendarios").json()["personas"]
    assert all(p["enlaces"] for p in personas)
    assert app.state.calendarios()  # lo que la app sin servidor sube al Worker


def test_texto_escapado_y_plegado():
    assert calendario._texto("a,b;c\\d\ne") == "a\\,b\\;c\\\\d\\ne"
    largo = "SUMMARY:" + "ñ" * 80
    plegado = calendario._plegar(largo)
    assert all(len(p.encode()) <= 75 for p in plegado.split("\r\n"))
    assert plegado.replace("\r\n ", "") == largo
    assert calendario._local(dt.date(2026, 1, 5), "24:00") == "20260106T000000"


def test_slack_por_relevo():
    """Sin servidor, Slack va por el Worker: si no tiene token, simulación; si lo tiene, envía y trae el canal."""
    llamadas = []

    def manejador(con_token):
        def h(request: httpx.Request):
            llamadas.append((request.url.path, request.headers.get("authorization")))
            if request.url.path.endswith("auth.test"):
                return httpx.Response(200, json={"ok": True, "team": "Lopita", "user": "horarios", "canal": "#turnos"}
                                      if con_token else {"ok": False, "error": "sin_token"})
            if request.url.path.endswith("users.lookupByEmail"):
                return httpx.Response(200, json={"ok": True, "user": {"id": "U1"}})
            return httpx.Response(200, json={"ok": True})
        return h

    s = Slack(relay="https://x.test/nube/slack", relay_key="clave", transport=httpx.MockTransport(manejador(False)))
    assert s.status()["configurado"] is False and s.configured is False
    s = Slack(relay="https://x.test/nube/slack", relay_key="clave", transport=httpx.MockTransport(manejador(True)))
    st = s.status()
    assert st["configurado"] and st["ok"] and st["canal"] == "#turnos" and st["relevo"]
    assert llamadas[-1] == ("/nube/slack/auth.test", "Bearer clave")
