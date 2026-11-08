import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.slack import Slack

PW = "contraseña-segura"


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    admin = TestClient(app)
    assert admin.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return app, admin


def make_worker(app, admin, emp="ana", user="ana.lopita", pw="temporal-123", estrenar=True):
    """Crea la cuenta y entra. Con estrenar, cambia ya la contraseña temporal (sin eso solo puede cambiarla)."""
    r = admin.post("/api/usuarios", json={"usuario": user, "password": pw, "nombre": emp.title(), "rol": "empleado", "empleado_id": emp})
    assert r.status_code == 200, r.text
    c = TestClient(app)
    assert c.post("/api/login", json={"usuario": user, "password": pw}).status_code == 200
    if estrenar:
        assert c.post("/api/mi/clave", json={"actual": pw, "nueva": f"{pw}-propia"}).status_code == 200
    return c


def last_monday():
    t = dt.date.today()
    return t - dt.timedelta(days=t.weekday() + 7)


def published_past_week(admin):
    d = last_monday()
    r = admin.post("/api/horarios/generar", json={"desde": d.isoformat(), "hasta": (d + dt.timedelta(days=6)).isoformat()})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    assert admin.post(f"/api/horarios/{sid}/publicar").status_code == 200
    return sid, admin.get(f"/api/horarios/{sid}").json()["horario"]


def test_permisos_por_rol(env):
    app, admin = env
    w = make_worker(app, admin)
    for method, url in [("get", "/api/config"), ("get", "/api/horarios"), ("get", "/api/usuarios"),
                        ("get", "/api/solicitudes"), ("get", "/api/informes/horas"), ("post", "/api/horarios/generar")]:
        assert getattr(w, method)(url).status_code == 403, url
    assert admin.get("/api/mi/perfil").status_code == 403
    me = w.get("/api/me").json()
    assert me["rol"] == "empleado" and me["cambiar_clave"] is False and "slack" not in me
    perfil = w.get("/api/mi/perfil").json()
    assert perfil["empleado"]["id"] == "ana"


def test_cuentas_y_clave(env):
    app, admin = env
    assert admin.post("/api/usuarios", json={"usuario": "x", "password": "temporal-123", "rol": "empleado"}).status_code == 400
    w = make_worker(app, admin, estrenar=False)
    # con la contraseña temporal no se puede hacer nada más que cambiarla
    assert w.get("/api/me").json()["cambiar_clave"] is True
    assert w.get("/api/mi/perfil").status_code == 403
    # una persona, una cuenta
    r = admin.post("/api/usuarios", json={"usuario": "otra", "password": "temporal-123", "rol": "empleado", "empleado_id": "ana"})
    assert r.status_code == 400 and "ya tiene cuenta" in r.json()["detail"]
    assert w.post("/api/mi/clave", json={"actual": "mal", "nueva": "nueva-clave-1"}).status_code == 400
    assert w.post("/api/mi/clave", json={"actual": "temporal-123", "nueva": "corta"}).status_code == 400
    assert w.post("/api/mi/clave", json={"actual": "temporal-123", "nueva": "nueva-clave-1"}).status_code == 200
    assert w.get("/api/me").json()["cambiar_clave"] is False
    c2 = TestClient(app)
    assert c2.post("/api/login", json={"usuario": "ana.lopita", "password": "nueva-clave-1"}).status_code == 200
    # no se puede dejar la app sin encargados
    r = admin.post("/api/usuarios", json={"usuario": "admin", "password": "otra-clave-123", "rol": "empleado", "empleado_id": "bruno"})
    assert r.status_code == 400
    # borrar la cuenta corta el acceso en el acto
    admin.delete("/api/usuarios/ana.lopita")
    assert w.get("/api/me").status_code == 401


def test_preferencias_solo_las_propias(env):
    app, admin = env
    w = make_worker(app, admin)
    otras = [p for p in admin.get("/api/config").json()["config"]["preferencias"] if p["empleado_id"] != "ana"]
    r = w.put("/api/mi/preferencias", json={"preferencias": [{"tipo": "evita", "turnos": ["CI"], "dias": ["viernes"], "peso": 7}]})
    assert r.status_code == 200 and r.json()["preferencias"][0]["peso"] == 7
    cfg = admin.get("/api/config").json()["config"]
    assert [p for p in cfg["preferencias"] if p["empleado_id"] != "ana"] == otras
    assert [p["turnos"] for p in cfg["preferencias"] if p["empleado_id"] == "ana"] == [["CI"]]
    assert w.put("/api/mi/preferencias", json={"preferencias": [{"tipo": "evita", "turnos": ["NOPE"]}]}).status_code == 422


def test_vacaciones_solicitud_y_aprobacion(env):
    app, admin = env
    w = make_worker(app, admin)
    ini = dt.date.today() + dt.timedelta(days=30)
    ini -= dt.timedelta(days=ini.weekday())
    body = {"desde": ini.isoformat(), "hasta": (ini + dt.timedelta(days=6)).isoformat(), "motivo": "vacaciones", "nota": "Boda"}
    assert w.post("/api/mi/ausencias", json={**body, "desde": "2020-01-01", "hasta": "2020-01-03"}).status_code == 400
    assert w.post("/api/mi/ausencias", json=body).status_code == 200
    assert w.post("/api/mi/ausencias", json=body).status_code == 400  # solapa con la pendiente
    assert admin.get("/api/me").json()["pendientes"] == 1
    sid = admin.get("/api/solicitudes", params={"estado": "pendiente"}).json()[0]["id"]
    # aún no está en la configuración
    assert not [a for a in admin.get("/api/config").json()["config"]["ausencias"] if a["empleado_id"] == "ana" and a["desde"] == body["desde"]]
    r = admin.post(f"/api/solicitudes/{sid}/resolver", json={"accion": "aprobar", "respuesta": "Disfruta"})
    assert r.status_code == 200 and r.json()["pendientes"] == 0
    assert any(a["empleado_id"] == "ana" and a["desde"] == body["desde"] for a in admin.get("/api/config").json()["config"]["ausencias"])
    assert admin.post(f"/api/solicitudes/{sid}/resolver", json={"accion": "rechazar"}).status_code == 409
    # el motor respeta la ausencia aprobada
    h = admin.post("/api/horarios/generar", json={"desde": body["desde"], "hasta": body["hasta"]}).json()["horario"]
    assert not [a for a in h["asignaciones"] if a["empleado_id"] == "ana"]
    mine = w.get("/api/mi/perfil").json()["solicitudes"][0]
    assert mine["estado"] == "aprobada" and mine["respuesta"] == "Disfruta"


def test_rechazo_no_toca_la_config(env):
    app, admin = env
    w = make_worker(app, admin)
    ini = (dt.date.today() + dt.timedelta(days=20)).isoformat()
    w.post("/api/mi/ausencias", json={"desde": ini, "hasta": ini})
    v = admin.get("/api/config").json()["version"]
    sid = admin.get("/api/solicitudes").json()[0]["id"]
    admin.post(f"/api/solicitudes/{sid}/resolver", json={"accion": "rechazar", "respuesta": "Esa semana no"})
    assert admin.get("/api/config").json()["version"] == v


def test_correcciones_validacion(env):
    app, admin = env
    w = make_worker(app, admin)
    _, h = published_past_week(admin)
    dias_ana = sorted(a["fecha"] for a in h["asignaciones"] if a["empleado_id"] == "ana")
    libre = next(d for d in (last_monday() + dt.timedelta(days=i) for i in range(7)) if d.isoformat() not in dias_ana).isoformat()
    futuro = (dt.date.today() + dt.timedelta(days=2)).isoformat()
    base = {"clase": "horas", "inicio": "08:00", "fin": "16:00", "motivo": "Me quedé a ayudar"}
    assert w.post("/api/mi/correcciones", json={**base, "fecha": futuro}).status_code == 400
    r = w.post("/api/mi/correcciones", json={**base, "fecha": libre})
    assert r.status_code == 400 and "Día extra" in r.json()["detail"]
    r = w.post("/api/mi/correcciones", json={**base, "clase": "extra", "fecha": dias_ana[0]})
    assert r.status_code == 400 and "turno asignado" in r.json()["detail"]
    assert w.post("/api/mi/correcciones", json={**base, "fecha": dias_ana[0], "motivo": " "}).status_code == 400
    assert w.post("/api/mi/correcciones", json={**base, "fecha": dias_ana[0], "inicio": "16:00", "fin": "08:00"}).status_code == 400
    assert w.post("/api/mi/correcciones", json={**base, "fecha": dias_ana[0]}).status_code == 200
    assert w.post("/api/mi/correcciones", json={**base, "fecha": dias_ana[0]}).status_code == 400  # duplicada
    # retirar una pendiente
    rid = w.get("/api/mi/perfil").json()["solicitudes"][0]["id"]
    assert w.delete(f"/api/mi/solicitudes/{rid}").status_code == 200
    assert w.get("/api/mi/perfil").json()["solicitudes"] == []


def test_informe_y_saldo_con_correcciones(env):
    app, admin = env
    w = make_worker(app, admin)
    sid, h = published_past_week(admin)
    prev_stats = {s["empleado_id"]: s for s in h["resumen"]}
    d0 = last_monday()
    informe = lambda c, url: c.get(url, params={"desde": d0.isoformat(), "hasta": (d0 + dt.timedelta(days=6)).isoformat()}).json()
    antes = informe(w, "/api/mi/horas")
    assert antes["previstas"] == antes["ajustadas"] == pytest.approx(prev_stats["ana"]["horas"])
    dia = antes["dias"][0]
    # un día de 'horas distintas': salió 2 h más tarde
    ini = {"AP": "07:00", "M": "08:00", "MI": "11:00", "T": "16:00", "CI": "15:00", "R": "09:00"}[dia["turno_id"]]
    fin_h = int(ini[:2]) * 60 + int(ini[3:]) + int(dia["previstas"] * 60) + 120
    fin = f"{fin_h // 60:02d}:{fin_h % 60:02d}"
    w.post("/api/mi/correcciones", json={"fecha": dia["fecha"], "clase": "horas", "inicio": ini, "fin": fin, "motivo": "Había mucha gente"})
    # pendiente: todavía no cuenta
    assert informe(w, "/api/mi/horas")["diferencia"] == 0 and informe(w, "/api/mi/horas")["pendientes"] == 1
    rid = admin.get("/api/solicitudes", params={"estado": "pendiente"}).json()[0]["id"]
    r = admin.post(f"/api/solicitudes/{rid}/resolver", json={"accion": "aprobar"})
    assert r.json()["impacto"]["diferencia_horas"] == pytest.approx(2.0)
    despues = informe(w, "/api/mi/horas")
    assert despues["diferencia"] == pytest.approx(2.0) and despues["pendientes"] == 0
    assert despues["dias"][0]["correccion"]["clase"] == "horas"
    # el informe del encargado y su CSV
    rep = informe(admin, "/api/informes/horas")
    ana = next(e for e in rep["empleados"] if e["empleado_id"] == "ana")
    assert ana["ajustadas"] == pytest.approx(ana["previstas"] + 2)
    # objetivo de contrato, horas extra y días, en total y mes a mes
    assert ana["objetivo"] == pytest.approx(prev_stats["ana"]["horas_objetivo"], abs=0.05)
    assert ana["extra"] == pytest.approx(max(0, ana["ajustadas"] - ana["objetivo"]), abs=0.05)
    assert ana["dias_trabajados"] == prev_stats["ana"]["dias_trabajados"]
    assert sum(m["ajustadas"] for m in ana["meses"]) == pytest.approx(ana["ajustadas"])
    csv = admin.get("/api/informes/horas.csv", params={"desde": d0.isoformat(), "hasta": (d0 + dt.timedelta(days=6)).isoformat()})
    assert csv.status_code == 200 and "Ana;" in csv.text and "Horas extra" in csv.text
    # la semana siguiente arrastra las 2 horas extra al saldo
    sig = d0 + dt.timedelta(days=7)
    nuevo = admin.post("/api/horarios/generar", json={"desde": sig.isoformat(), "hasta": (sig + dt.timedelta(days=6)).isoformat()}).json()
    esperado = prev_stats["ana"]["horas"] - prev_stats["ana"]["horas_objetivo"] + 2
    assert nuevo["horario"]["saldo_anterior"].get("ana", 0) == pytest.approx(round(esperado, 2))


def test_config_con_version_obsoleta(env):
    app, admin = env
    cur = admin.get("/api/config").json()
    w = make_worker(app, admin)
    w.put("/api/mi/preferencias", json={"preferencias": [{"tipo": "prefiere", "turnos": ["M"], "peso": 2}]})
    r = admin.put("/api/config", json={"config": cur["config"], "base": cur["version"]})
    assert r.status_code == 409
    nuevo = admin.get("/api/config").json()
    assert admin.put("/api/config", json={"config": nuevo["config"], "base": nuevo["version"]}).status_code == 200
