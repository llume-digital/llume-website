"""Alertas del encargado y avisos al trabajador a través de la API."""
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


def worker_client(app, admin, emp, user=None):
    user = user or f"{emp}.lopita"
    r = admin.post("/api/usuarios", json={"usuario": user, "password": "temporal-123", "nombre": emp.title(), "rol": "empleado", "empleado_id": emp})
    assert r.status_code == 200, r.text
    c = TestClient(app)
    assert c.post("/api/login", json={"usuario": user, "password": "temporal-123"}).status_code == 200
    assert c.post("/api/mi/clave", json={"actual": "temporal-123", "nueva": "propia-123"}).status_code == 200
    return c


def next_monday():
    t = dt.date.today()
    return t + dt.timedelta(days=7 - t.weekday())


def make_week(admin, publish=False):
    d = next_monday()
    r = admin.post("/api/horarios/generar", json={"desde": d.isoformat(), "hasta": (d + dt.timedelta(days=6)).isoformat()})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    if publish:
        assert admin.post(f"/api/horarios/{sid}/publicar").status_code == 200
    return sid, d


def codes(report):
    return {a["codigo"] for a in report["activas"]}


def test_detalle_y_listado_incluyen_alertas(env):
    _, admin = env
    sid, _ = make_week(admin)
    d = admin.get(f"/api/horarios/{sid}").json()
    assert set(d["alertas"]) == {"critica", "alta", "media", "baja"}
    assert d["alertas_detalle"]["activas"] is not None and "reconocidas" in d["alertas_detalle"]
    lst = admin.get("/api/horarios").json()
    assert lst[0]["alertas"] == d["alertas"]
    assert admin.get(f"/api/horarios/{sid}/alertas").json()["resumen"] == d["alertas"]


def test_alertas_solo_para_encargados(env):
    app, admin = env
    sid, _ = make_week(admin)
    w = worker_client(app, admin, "ana")
    for url in ("/api/alertas", f"/api/horarios/{sid}/alertas"):
        assert w.get(url).status_code == 403
    assert w.post(f"/api/horarios/{sid}/alertas/reconocer", json={"clave": "x"}).status_code == 403


def test_ausencia_aprobada_tras_generar_pide_regenerar_desde_ese_dia(env):
    app, admin = env
    sid, lunes = make_week(admin, publish=True)
    horario = admin.get(f"/api/horarios/{sid}").json()["horario"]
    # Alguien con turno el miércoles pide vacaciones ese día y el jueves; el encargado las aprueba
    miercoles = (lunes + dt.timedelta(days=2)).isoformat()
    emp = next(a["empleado_id"] for a in horario["asignaciones"] if a["fecha"] == miercoles)
    w = worker_client(app, admin, emp)
    jueves = (lunes + dt.timedelta(days=3)).isoformat()
    r = w.post("/api/mi/ausencias", json={"desde": miercoles, "hasta": jueves, "motivo": "vacaciones"})
    assert r.status_code == 200, r.text

    # Mientras está pendiente ya avisa de que habrá que regenerar
    pend = [a for a in admin.get(f"/api/horarios/{sid}/alertas").json()["activas"] if a["codigo"] == "solicitud_pendiente"]
    assert len(pend) == 1 and "regenerarlo a partir del" in pend[0]["detalle"] and pend[0]["severidad"] == "media"

    rid = admin.get("/api/solicitudes?estado=pendiente").json()[0]["id"]
    assert admin.post(f"/api/solicitudes/{rid}/resolver", json={"accion": "aprobar"}).status_code == 200

    rep = admin.get(f"/api/horarios/{sid}/alertas").json()
    assert "solicitud_pendiente" not in codes(rep)
    [desfase] = [a for a in rep["activas"] if a["codigo"] == "ausencia_sin_reflejar" and a["empleado_id"] == emp]
    assert desfase["severidad"] == "alta" and desfase["regenerar_desde"] == miercoles
    assert rep["regenerar_desde"] <= miercoles
    glob = admin.get("/api/alertas").json()
    assert any(a["clave"] == desfase["clave"] and a["horario_id"] == sid for a in glob["alertas"])
    assert admin.get("/api/me").json()["alertas"] >= 1

    # Al regenerar, el horario vuelve a cuadrar con las ausencias
    assert admin.post(f"/api/horarios/{sid}/regenerar").status_code == 200
    assert "ausencia_sin_reflejar" not in codes(admin.get(f"/api/horarios/{sid}/alertas").json())


def test_reconocer_y_reabrir_una_alerta(env):
    _, admin = env
    sid, lunes = make_week(admin)
    # Se fuerza una alerta: vaciar un día entero
    base = admin.get(f"/api/horarios/{sid}").json()
    dia = (lunes + dt.timedelta(days=2)).isoformat()
    for a in [a for a in base["horario"]["asignaciones"] if a["fecha"] == dia]:
        admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": a["empleado_id"], "fecha": dia, "turno_id": None})
    rep = admin.get(f"/api/horarios/{sid}/alertas").json()
    alerta = next(a for a in rep["activas"] if a["codigo"] == "falta_cobertura" and a["fecha"] == dia)

    assert admin.post(f"/api/horarios/{sid}/alertas/reconocer", json={"clave": "no-existe"}).status_code == 404
    r = admin.post(f"/api/horarios/{sid}/alertas/reconocer", json={"clave": alerta["clave"], "nota": "Cerramos ese día"})
    assert r.status_code == 200
    rep = r.json()["alertas_detalle"]
    assert alerta["clave"] not in {a["clave"] for a in rep["activas"]}
    rec = next(a for a in rep["reconocidas"] if a["clave"] == alerta["clave"])
    assert rec["reconocida"]["nota"] == "Cerramos ese día" and rec["reconocida"]["usuario"] == "admin"
    assert admin.post(f"/api/horarios/{sid}/alertas/reconocer", json={"clave": alerta["clave"]}).status_code == 404  # ya reconocida

    r = admin.delete(f"/api/horarios/{sid}/alertas/reconocer", params={"clave": alerta["clave"]})
    assert alerta["clave"] in {a["clave"] for a in r.json()["alertas_detalle"]["activas"]}


def test_alerta_reconocida_vuelve_si_empeora(env):
    _, admin = env
    sid, lunes = make_week(admin)
    dia = (lunes + dt.timedelta(days=2)).isoformat()
    asignados = [a["empleado_id"] for a in admin.get(f"/api/horarios/{sid}").json()["horario"]["asignaciones"] if a["fecha"] == dia]
    quitar = lambda e: admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": e, "fecha": dia, "turno_id": None})  # noqa: E731
    for e in asignados[:-1]:
        quitar(e)
    rep = admin.get(f"/api/horarios/{sid}/alertas").json()
    alerta = next(a for a in rep["activas"] if a["codigo"] == "falta_cobertura" and a["fecha"] == dia)
    admin.post(f"/api/horarios/{sid}/alertas/reconocer", json={"clave": alerta["clave"]})
    quitar(asignados[-1])  # ahora el día queda vacío: peor que cuando se reconoció
    rep = admin.get(f"/api/horarios/{sid}/alertas").json()
    de_nuevo = next(a for a in rep["activas"] if a["clave"] == alerta["clave"])
    assert de_nuevo["cambiada"] is True


def test_cambios_publicados_sin_avisar_y_alerta_global(env):
    _, admin = env
    sid, lunes = make_week(admin, publish=True)
    base = admin.get(f"/api/horarios/{sid}").json()
    a = base["horario"]["asignaciones"][0]
    admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": a["empleado_id"], "fecha": a["fecha"], "turno_id": None})
    rep = admin.get(f"/api/horarios/{sid}/alertas").json()
    assert "cambios_sin_avisar" in codes(rep)
    assert admin.get("/api/alertas").json()["horarios"][0]["id"] == sid


def test_horarios_pasados_no_estan_en_las_alertas_globales(env):
    _, admin = env
    d = dt.date.today() - dt.timedelta(days=dt.date.today().weekday() + 14)
    r = admin.post("/api/horarios/generar", json={"desde": d.isoformat(), "hasta": (d + dt.timedelta(days=6)).isoformat()})
    assert r.status_code == 200
    assert admin.get("/api/alertas").json()["horarios"] == []


def test_config_con_umbrales_de_alertas_se_guarda(env):
    _, admin = env
    cfg = admin.get("/api/config").json()
    assert cfg["config"]["alertas"]["racha_dias_max"] == 6
    cfg["config"]["alertas"]["racha_dias_max"] = 5
    cfg["config"]["alertas"]["desactivadas"] = ["exceso_personal"]
    r = admin.put("/api/config", json={"config": cfg["config"], "base": cfg["version"]})
    assert r.status_code == 200
    assert admin.get("/api/config").json()["config"]["alertas"]["desactivadas"] == ["exceso_personal"]
    cfg["config"]["alertas"]["racha_dias_max"] = 0
    assert admin.put("/api/config", json={"config": cfg["config"], "base": r.json()["version"]}).status_code == 422


# ---------------------------------------------------------------- avisos al trabajador
def turno_de(admin, sid, emp):
    h = admin.get(f"/api/horarios/{sid}").json()["horario"]
    return next(a for a in h["asignaciones"] if a["empleado_id"] == emp)


def test_trabajador_recibe_aviso_al_publicar_y_al_cambiar_su_turno(env):
    app, admin = env
    sid, _ = make_week(admin)
    emp = admin.get(f"/api/horarios/{sid}").json()["horario"]["asignaciones"][0]["empleado_id"]
    w = worker_client(app, admin, emp)
    assert w.get("/api/mi/perfil").json()["avisos"] == []  # un borrador no avisa a nadie
    assert admin.post(f"/api/horarios/{sid}/publicar").status_code == 200

    perfil = w.get("/api/mi/perfil").json()
    [nuevo] = perfil["avisos"]
    assert nuevo["tipo"] == "nuevo_horario" and "Se ha publicado tu horario" in nuevo["texto"] and not nuevo["leido"]
    assert w.get("/api/me").json()["avisos"] == 1

    # El encargado cambia un turno suyo
    t = turno_de(admin, sid, emp)
    otro = "T" if t["turno_id"] != "T" else "M"
    admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": emp, "fecha": t["fecha"], "turno_id": otro})
    avisos = w.get("/api/mi/perfil").json()["avisos"]
    cambio = next(a for a in avisos if a["tipo"] == "turno")
    assert "ha cambiado" in cambio["texto"] and cambio["fecha"] == t["fecha"]
    assert w.get("/api/me").json()["avisos"] == 2

    # Marcar como leído
    r = w.post("/api/mi/avisos/leer", json={}).json()
    assert all(a["leido"] for a in r["avisos"]) and w.get("/api/me").json()["avisos"] == 0


def test_cambio_revertido_no_deja_aviso(env):
    app, admin = env
    sid, _ = make_week(admin, publish=True)
    a = admin.get(f"/api/horarios/{sid}").json()["horario"]["asignaciones"][0]
    emp, fecha, original = a["empleado_id"], a["fecha"], a["turno_id"]
    w = worker_client(app, admin, emp)
    w.post("/api/mi/avisos/leer", json={})
    otro = "T" if original != "T" else "M"
    admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": emp, "fecha": fecha, "turno_id": otro})
    admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": emp, "fecha": fecha, "turno_id": original})
    assert [x for x in w.get("/api/mi/perfil").json()["avisos"] if x["tipo"] == "turno" and not x["leido"]] == []


def test_dos_cambios_seguidos_se_funden_en_un_aviso(env):
    app, admin = env
    sid, _ = make_week(admin, publish=True)
    a = admin.get(f"/api/horarios/{sid}").json()["horario"]["asignaciones"][0]
    emp, fecha = a["empleado_id"], a["fecha"]
    w = worker_client(app, admin, emp)
    w.post("/api/mi/avisos/leer", json={})
    destino = "T" if a["turno_id"] != "T" else "M"
    admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": emp, "fecha": fecha, "turno_id": None})  # libra
    admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": emp, "fecha": fecha, "turno_id": destino})
    sin_leer = [x for x in w.get("/api/mi/perfil").json()["avisos"] if x["tipo"] == "turno" and not x["leido"]]
    assert len(sin_leer) == 1 and "ha cambiado" in sin_leer[0]["texto"]  # de su turno original al nuevo, sin pasar por «ya no trabajas»


def test_retirar_el_horario_avisa_y_los_borradores_no(env):
    app, admin = env
    sid, _ = make_week(admin, publish=True)
    emp = admin.get(f"/api/horarios/{sid}").json()["horario"]["asignaciones"][0]["empleado_id"]
    w = worker_client(app, admin, emp)
    assert admin.post(f"/api/horarios/{sid}/despublicar").status_code == 200
    avisos = w.get("/api/mi/perfil").json()["avisos"]
    assert [a["tipo"] for a in avisos if not a["leido"]] == ["retirado"]
    # Editar un borrador no genera avisos nuevos
    t = turno_de(admin, sid, emp)
    admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": emp, "fecha": t["fecha"], "turno_id": None})
    assert [a["tipo"] for a in w.get("/api/mi/perfil").json()["avisos"] if not a["leido"]] == ["retirado"]


def test_un_trabajador_solo_ve_sus_avisos(env):
    app, admin = env
    sid, _ = make_week(admin, publish=True)
    emps = sorted({a["empleado_id"] for a in admin.get(f"/api/horarios/{sid}").json()["horario"]["asignaciones"]})[:2]
    w1, w2 = worker_client(app, admin, emps[0]), worker_client(app, admin, emps[1])
    ids1 = {a["id"] for a in w1.get("/api/mi/perfil").json()["avisos"]}
    ids2 = {a["id"] for a in w2.get("/api/mi/perfil").json()["avisos"]}
    assert ids1 and ids2 and not ids1 & ids2
    # Marcar los de otro no tiene efecto
    w1.post("/api/mi/avisos/leer", json={"ids": list(ids2)})
    assert not any(a["leido"] for a in w2.get("/api/mi/perfil").json()["avisos"])


def test_alerta_de_encargado_por_cambios_que_el_equipo_no_ha_visto(env):
    app, admin = env
    sid, _ = make_week(admin, publish=True)
    a = admin.get(f"/api/horarios/{sid}").json()["horario"]["asignaciones"][0]
    admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": a["empleado_id"], "fecha": a["fecha"], "turno_id": None})
    rep = admin.get(f"/api/horarios/{sid}/alertas").json()
    sin_ver = [x for x in rep["activas"] if x["codigo"] == "cambios_sin_leer"]
    assert len(sin_ver) == 1
    # Cuando el trabajador lo marca como visto, la alerta desaparece
    w = worker_client(app, admin, a["empleado_id"])
    w.post("/api/mi/avisos/leer", json={})
    assert "cambios_sin_leer" not in codes(admin.get(f"/api/horarios/{sid}/alertas").json())


# ---------------------------------------------------------------- regenerar a partir de un día
def asignaciones(admin, sid):
    h = admin.get(f"/api/horarios/{sid}").json()["horario"]
    return {(a["empleado_id"], a["fecha"]): a["turno_id"] for a in h["asignaciones"]}, h


def test_regenerar_desde_mantiene_los_dias_anteriores(env):
    _, admin = env
    sid, lunes = make_week(admin)
    antes, _ = asignaciones(admin, sid)
    desde = lunes + dt.timedelta(days=3)
    # Una ausencia a partir del jueves: el borrador se arregla solo (ver test_alertas_criticas_api.py) y
    # además el encargado puede regenerar a partir de ese día sin tocar lo anterior
    emp = next(e for (e, f) in antes if f == desde.isoformat())
    cfg = admin.get("/api/config").json()
    cfg["config"]["ausencias"].append({"empleado_id": emp, "desde": desde.isoformat(), "hasta": desde.isoformat(), "motivo": "baja"})
    r = admin.put("/api/config", json={"config": cfg["config"], "base": cfg["version"]})
    assert r.status_code == 200 and r.json()["arreglos"] == [sid]
    arreglado, _ = asignaciones(admin, sid)

    r = admin.post(f"/api/horarios/{sid}/regenerar", json={"desde": desde.isoformat()})
    assert r.status_code == 200, r.text
    despues, h = asignaciones(admin, sid)
    anteriores = lambda m: {k: v for k, v in m.items() if k[1] < desde.isoformat()}  # noqa: E731
    assert anteriores(despues) == anteriores(arreglado)       # lo anterior no se toca
    assert (emp, desde.isoformat()) not in despues            # y la ausencia se respeta
    assert h["bloqueos"] == []                                # los días congelados no quedan como bloqueos manuales
    assert r.json()["alertas_detalle"]["regenerar_desde"] is None
    assert r.json()["generacion"]["valido"]


def test_regenerar_desde_fuera_del_periodo_falla(env):
    _, admin = env
    sid, lunes = make_week(admin)
    r = admin.post(f"/api/horarios/{sid}/regenerar", json={"desde": (lunes + dt.timedelta(days=30)).isoformat()})
    assert r.status_code == 400


def test_regenerar_sin_cuerpo_sigue_funcionando(env):
    _, admin = env
    sid, _ = make_week(admin)
    assert admin.post(f"/api/horarios/{sid}/regenerar").status_code == 200
