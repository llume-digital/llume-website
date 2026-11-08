"""Alertas críticas a través de la API: generar con reintentos, arreglos tras una ausencia, avisos y publicar."""
import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.slack import Slack

PW = "contraseña-segura"
ABREN = ("ana", "bruno", "diego", "julia")  # quién puede abrir en los datos de ejemplo


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    admin = TestClient(app)
    assert admin.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return app, admin


def next_monday():
    t = dt.date.today()
    return t + dt.timedelta(days=7 - t.weekday())


def generar(admin, lunes):
    r = admin.post("/api/horarios/generar", json={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.status_code == 200, r.text
    return r.json()


def ausentes(admin, dia, empleados, motivo="vacaciones"):
    actual = admin.get("/api/config").json()
    cfg = actual["config"]
    cfg["ausencias"] += [{"empleado_id": e, "desde": dia.isoformat(), "hasta": dia.isoformat(), "motivo": motivo} for e in empleados]
    r = admin.put("/api/config", json={"config": cfg, "base": actual["version"]})
    assert r.status_code == 200, r.text
    return r.json()


def criticas(detalle):
    return [a for a in detalle["alertas_detalle"]["activas"] if a["severidad"] == "critica"]


def test_generar_sin_problemas_no_avisa(env):
    _, admin = env
    d = generar(admin, next_monday())
    assert d["generacion"]["valido"] and d["generacion"]["reintentos"] == 0
    assert d["alertas"]["critica"] == 0
    me = admin.get("/api/me").json()
    assert me["criticas"] == 0 and me["notificaciones"] == 0


def test_generacion_que_no_vale_avisa_al_encargado(env):
    _, admin = env
    lunes = next_monday()
    miercoles = lunes + dt.timedelta(days=2)
    ausentes(admin, miercoles, ABREN)  # el miércoles nadie que pueda abrir está disponible
    d = generar(admin, lunes)
    gen = d["generacion"]
    assert not gen["valido"] and gen["reintentos"] == 0  # no tiene arreglo moviendo turnos: no reintenta
    assert "hay que cambiar algo fuera del horario" in gen["motivo"]
    [c] = criticas(d)
    assert c["codigo"] == "apertura_sin_habilitado" and c["fecha"] == miercoles.isoformat()
    assert "Ana está de vacaciones" in c["detalle"]
    # Queda guardado como borrador y el encargado tiene un aviso sin leer
    assert d["estado"] == "borrador"
    me = admin.get("/api/me").json()
    assert me["criticas"] == 1 and me["notificaciones"] == 1
    [n] = admin.get("/api/notificaciones").json()
    assert n["tipo"] == "generacion_fallida" and n["schedule_id"] == d["id"] and n["leida_at"] is None
    assert "no se ha generado correctamente" in n["titulo"] and "hay que cambiar algo" in n["texto"]
    assert any("nadie habilitado para abrir" in p for p in n["detalle"]["problemas"])
    # Marcarlo como leído
    assert admin.post("/api/notificaciones/leer", json={}).json()[0]["leida_por"] == "admin"
    assert admin.get("/api/me").json()["notificaciones"] == 0


def test_las_criticas_no_se_pueden_dar_por_vistas(env):
    _, admin = env
    lunes = next_monday()
    ausentes(admin, lunes + dt.timedelta(days=2), ABREN)
    d = generar(admin, lunes)
    [c] = criticas(d)
    r = admin.post(f"/api/horarios/{d['id']}/alertas/reconocer", json={"clave": c["clave"]})
    assert r.status_code == 400 and "no se pueden dar por vistas" in r.json()["detail"]


def test_publicar_con_criticas_pide_confirmacion_y_queda_registrado(env):
    _, admin = env
    lunes = next_monday()
    ausentes(admin, lunes + dt.timedelta(days=2), ABREN)
    sid = generar(admin, lunes)["id"]
    r = admin.post(f"/api/horarios/{sid}/publicar")
    assert r.status_code == 409
    body = r.json()
    assert body["codigo"] == "criticas" and len(body["criticas"]) == 1 and "confirma" in body["detail"]
    assert admin.get(f"/api/horarios/{sid}").json()["estado"] == "borrador"
    r = admin.post(f"/api/horarios/{sid}/publicar", json={"confirmar_criticas": True})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["estado"] == "publicado"
    [reg] = d["registro"]
    assert reg["accion"] == "publicado_con_criticas" and reg["usuario"] == "admin"
    assert "nadie habilitado para abrir" in reg["detalle"]["criticas"][0]


def test_ausencia_en_horario_publicado_prepara_un_arreglo_sin_publicarlo(env):
    app, admin = env
    lunes = next_monday()
    d = generar(admin, lunes)
    sid = d["id"]
    assert admin.post(f"/api/horarios/{sid}/publicar").status_code == 200
    publicado = {(a["empleado_id"], a["fecha"], a["turno_id"]) for a in d["horario"]["asignaciones"]}
    # Quien abre el jueves se da de baja
    jueves = (lunes + dt.timedelta(days=3)).isoformat()
    abre = next(a["empleado_id"] for a in d["horario"]["asignaciones"] if a["fecha"] == jueves and a["turno_id"] == "AP")
    r = ausentes(admin, lunes + dt.timedelta(days=3), [abre], motivo="baja")
    [arreglo] = r["arreglos"]
    assert arreglo != sid

    # El publicado no cambia: el equipo sigue viendo el mismo horario
    pub = admin.get(f"/api/horarios/{sid}").json()
    assert {(a["empleado_id"], a["fecha"], a["turno_id"]) for a in pub["horario"]["asignaciones"]} == publicado
    assert pub["estado"] == "publicado" and pub["arreglo_pendiente"] == arreglo
    # El arreglo es un borrador que lo sustituye, ya sin la persona de baja y sin alertas críticas
    b = admin.get(f"/api/horarios/{arreglo}").json()
    assert b["estado"] == "borrador" and b["reemplaza"] == sid and b["alertas"]["critica"] == 0
    assert not any(a["empleado_id"] == abre and a["fecha"] == jueves for a in b["horario"]["asignaciones"])
    [n] = admin.get("/api/notificaciones").json()
    # Un solo aviso: los turnos que no se van a hacer y el arreglo preparado.
    assert n["tipo"] == "turnos_perdidos" and n["schedule_id"] == arreglo and "publícalo" in n["texto"]
    assert n["detalle"]["arreglo"] == arreglo and any(t["fecha"] == jueves for t in n["detalle"]["turnos"])

    # Al publicarlo, sus turnos pasan al horario publicado (mismo enlace) y el borrador desaparece
    r = admin.post(f"/api/horarios/{arreglo}/publicar")
    assert r.status_code == 200, r.text
    assert r.json()["id"] == sid and r.json()["reemplazado"] == sid
    assert admin.get(f"/api/horarios/{arreglo}").status_code == 404
    final = admin.get(f"/api/horarios/{sid}").json()
    assert final["estado"] == "publicado" and final["token"] == pub["token"] and final["arreglo_pendiente"] is None
    assert final["cambios_pendientes"]  # queda pendiente avisar por Slack a quien cambia
    assert not any(a["empleado_id"] == abre and a["fecha"] == jueves for a in final["horario"]["asignaciones"])


def test_una_segunda_ausencia_rehace_el_mismo_arreglo(env):
    _, admin = env
    lunes = next_monday()
    d = generar(admin, lunes)
    sid = d["id"]
    admin.post(f"/api/horarios/{sid}/publicar")
    trabajan = lambda dia: [a["empleado_id"] for a in d["horario"]["asignaciones"] if a["fecha"] == dia.isoformat()]  # noqa: E731
    [a1] = ausentes(admin, lunes + dt.timedelta(days=2), trabajan(lunes + dt.timedelta(days=2))[:1])["arreglos"]
    [a2] = ausentes(admin, lunes + dt.timedelta(days=4), trabajan(lunes + dt.timedelta(days=4))[:1])["arreglos"]
    assert a1 == a2 and len([h for h in admin.get("/api/horarios").json() if h["reemplaza"] == sid]) == 1


def test_ausencia_que_no_afecta_a_ningun_turno_no_toca_nada(env):
    _, admin = env
    lunes = next_monday()
    d = generar(admin, lunes)
    libra = next(e for e in ("ana", "bruno", "carla", "diego") if not any(
        a["empleado_id"] == e and a["fecha"] == lunes.isoformat() for a in d["horario"]["asignaciones"]))
    assert ausentes(admin, lunes, [libra])["arreglos"] == []
    assert admin.get("/api/notificaciones").json() == []


def test_aprobar_una_solicitud_de_ausencia_arregla_el_borrador(env):
    app, admin = env
    lunes = next_monday()
    d = generar(admin, lunes)
    martes = (lunes + dt.timedelta(days=1)).isoformat()
    emp = next(a["empleado_id"] for a in d["horario"]["asignaciones"] if a["fecha"] == martes)
    admin.post("/api/usuarios", json={"usuario": "w", "password": "temporal-123", "nombre": "W", "rol": "empleado", "empleado_id": emp})
    w = TestClient(app)
    w.post("/api/login", json={"usuario": "w", "password": "temporal-123"})
    w.post("/api/mi/clave", json={"actual": "temporal-123", "nueva": "propia-123"})
    assert w.post("/api/mi/ausencias", json={"desde": martes, "hasta": martes, "motivo": "permiso"}).status_code == 200
    rid = admin.get("/api/solicitudes?estado=pendiente").json()[0]["id"]
    r = admin.post(f"/api/solicitudes/{rid}/resolver", json={"accion": "aprobar"})
    assert r.status_code == 200 and r.json()["impacto"]["arreglos"] == [d["id"]]
    b = admin.get(f"/api/horarios/{d['id']}").json()
    assert not any(a["empleado_id"] == emp and a["fecha"] == martes for a in b["horario"]["asignaciones"])
    [n] = admin.get("/api/notificaciones").json()
    assert n["tipo"] == "turnos_perdidos" and n["detalle"]["arreglo"] == d["id"]
    assert [t["fecha"] for t in n["detalle"]["turnos"] if t["estado"] == "borrador"] == [martes]


def test_el_arreglo_pendiente_no_duplica_las_alertas_del_publicado(env):
    _, admin = env
    lunes = next_monday()
    ausentes(admin, lunes + dt.timedelta(days=2), ABREN)  # una crítica sin arreglo el miércoles
    d = generar(admin, lunes)
    admin.post(f"/api/horarios/{d['id']}/publicar", json={"confirmar_criticas": True})
    jueves = lunes + dt.timedelta(days=3)
    otro = next(a["empleado_id"] for a in d["horario"]["asignaciones"] if a["fecha"] == jueves.isoformat())
    assert ausentes(admin, jueves, [otro])["arreglos"]
    glob = admin.get("/api/alertas").json()
    assert [h["id"] for h in glob["horarios"]] == [d["id"]]
    assert admin.get("/api/me").json()["criticas"] == admin.get(f"/api/horarios/{d['id']}").json()["alertas"]["critica"]
