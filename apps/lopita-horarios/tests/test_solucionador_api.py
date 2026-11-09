"""Solucionador de alertas a través de la API: proponer, aplicar y conflictos."""
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


HUECOS = {"falta_cobertura", "sin_nadie"}


def huecos(admin, sid):
    """Alertas de franjas sin cubrir (o sin nadie), por día."""
    return {(a["codigo"], a.get("fecha")) for a in admin.get(f"/api/horarios/{sid}/alertas").json()["activas"]
            if a["codigo"] in HUECOS}


def week_with_gaps(admin, publish=False, base=None):
    """Una semana generada a la que se le quitan dos turnos sin bloquearlos: quedan huecos y horas de menos.

    Si se pasa 'base' (un set), se llena con los huecos que ya tenía la semana generada antes de quitar nada: según
    la semana, la plantilla no llega a todas las franjas y el solucionador no puede arreglar esos."""
    t = dt.date.today()
    lunes = t + dt.timedelta(days=7 - t.weekday())
    r = admin.post("/api/horarios/generar", json={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    if base is not None:
        base |= huecos(admin, sid)
    if publish:
        assert admin.post(f"/api/horarios/{sid}/publicar").status_code == 200
    asign = r.json()["horario"]["asignaciones"]
    quitados = [a for a in asign if a["fecha"] in {(lunes + dt.timedelta(days=d)).isoformat() for d in (2, 3)}][:2]
    for a in quitados:
        r = admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": a["empleado_id"], "fecha": a["fecha"],
                                                             "turno_id": None, "bloquear": False})
        assert r.status_code == 200
    return sid, quitados


def active_codes(admin, sid):
    return [a["codigo"] for a in admin.get(f"/api/horarios/{sid}/alertas").json()["activas"]]


def test_proponer_no_cambia_el_horario_y_aplicar_arregla_los_huecos(env):
    _, admin = env
    base = set()
    sid, quitados = week_with_gaps(admin, base=base)
    dia = quitados[0]["fecha"]
    nuevos = huecos(admin, sid) - base
    assert {f for _, f in nuevos} == {dia}  # quitar los turnos deja huecos ese día
    antes = admin.get(f"/api/horarios/{sid}").json()

    r = admin.post(f"/api/horarios/{sid}/solucionar", json={})
    assert r.status_code == 200, r.text
    p = r.json()
    assert p["mejora"] and p["cambios"] and p["movimientos"] and p["estado"] == "borrador"
    arregladas = {(a["codigo"], a.get("fecha")) for a in p["resueltas"] + p["mejoradas"]}
    assert any(c in HUECOS and f == dia for c, f in arregladas)
    assert admin.get(f"/api/horarios/{sid}").json()["horario"] == antes["horario"]  # solo es una propuesta

    r = admin.post(f"/api/horarios/{sid}/solucionar/aplicar", json={"cambios": p["cambios"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert huecos(admin, sid) <= base  # quedan, como mucho, los huecos que ya tenía la semana generada
    assert d["horario"]["bloqueos"] == antes["horario"]["bloqueos"]  # lo aplicado no queda como cambio manual
    assert not [i for i in d["horario"]["incidencias"] if i["nivel"] == "error"]
    # Una segunda vez ya no hay nada que mejorar en esos huecos
    segunda = admin.post(f"/api/horarios/{sid}/solucionar").json()["resueltas"]
    assert not {(a["codigo"], a.get("fecha")) for a in segunda} & nuevos


def test_aplicar_una_propuesta_desfasada_da_conflicto(env):
    _, admin = env
    sid, _ = week_with_gaps(admin)
    p = admin.post(f"/api/horarios/{sid}/solucionar").json()
    c = p["cambios"][0]
    # Alguien toca esa misma casilla antes de aplicar
    turno = admin.get("/api/config").json()["config"]["turnos"][0]["id"]
    admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": c["empleado_id"], "fecha": c["fecha"],
                                                    "turno_id": None if c["antes"] else turno, "bloquear": False})
    r = admin.post(f"/api/horarios/{sid}/solucionar/aplicar", json={"cambios": p["cambios"]})
    assert r.status_code == 409
    assert "vuelve a calcularla" in r.json()["detail"]


def test_aplicar_valida_la_peticion(env):
    _, admin = env
    sid, _ = week_with_gaps(admin)
    assert admin.post(f"/api/horarios/{sid}/solucionar/aplicar", json={"cambios": []}).status_code == 422
    assert admin.post("/api/horarios/999/solucionar").status_code == 404


def test_en_un_horario_publicado_avisa_al_equipo_y_queda_pendiente_slack(env):
    _, admin = env
    sid, _ = week_with_gaps(admin, publish=True)
    p = admin.post(f"/api/horarios/{sid}/solucionar").json()
    assert p["mejora"] and p["estado"] == "publicado"
    d = admin.post(f"/api/horarios/{sid}/solucionar/aplicar", json={"cambios": p["cambios"]}).json()
    assert {c["empleado_id"] for c in p["cambios"]} <= set(d["cambios_pendientes"])
    assert "cambios_sin_avisar" in active_codes(admin, sid)


def test_no_se_cambian_dias_ya_pasados(env):
    _, admin = env
    hoy = dt.date.today()
    desde = hoy - dt.timedelta(days=3)
    r = admin.post("/api/horarios/generar", json={"desde": desde.isoformat(), "hasta": (hoy + dt.timedelta(days=3)).isoformat()})
    sid = r.json()["id"]
    p = admin.post(f"/api/horarios/{sid}/solucionar", json={"desde": desde.isoformat()}).json()
    assert p["desde"] == hoy.isoformat()  # en un borrador, desde hoy
    falso = [{"empleado_id": "ana", "fecha": desde.isoformat(), "antes": None, "despues": "M"}]
    r = admin.post(f"/api/horarios/{sid}/solucionar/aplicar", json={"cambios": falso})
    assert r.status_code == 409


def test_solucionador_solo_para_encargados(env):
    app, admin = env
    sid, _ = week_with_gaps(admin)
    r = admin.post("/api/usuarios", json={"usuario": "ana.l", "password": "temporal-123", "nombre": "Ana",
                                          "rol": "empleado", "empleado_id": "ana"})
    assert r.status_code == 200
    w = TestClient(app)
    assert w.post("/api/login", json={"usuario": "ana.l", "password": "temporal-123"}).status_code == 200
    assert w.post("/api/mi/clave", json={"actual": "temporal-123", "nueva": "propia-123"}).status_code == 200
    assert w.post(f"/api/horarios/{sid}/solucionar").status_code == 403
    assert w.post(f"/api/horarios/{sid}/solucionar/aplicar", json={"cambios": [
        {"empleado_id": "ana", "fecha": dt.date.today().isoformat(), "antes": None, "despues": "M"}]}).status_code == 403
