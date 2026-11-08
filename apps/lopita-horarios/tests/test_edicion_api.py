"""Vista diaria a través de la API: evaluar sin guardar, guardar en borrador o en un arreglo y publicar."""
import datetime as dt

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.slack import Slack

PW = "contraseña-segura"


@pytest.fixture()
def admin(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    client = TestClient(app)
    assert client.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return client


def semana(admin, publicar=False):
    t = dt.date.today()
    lunes = t + dt.timedelta(days=7 - t.weekday())
    r = admin.post("/api/horarios/generar", json={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    if publicar:
        r = admin.post(f"/api/horarios/{sid}/publicar", json={"confirmar_criticas": True})
        assert r.status_code == 200, r.text
    return admin.get(f"/api/horarios/{sid}").json()


def tramos(admin, det, fecha):
    """Los tramos que mostraría la vista diaria para ese día, sin tocar nada."""
    turnos = {s["id"]: s for s in admin.get("/api/config").json()["config"]["turnos"]}
    out = []
    for a in det["horario"]["asignaciones"]:
        if a["fecha"] == fecha:
            s = turnos[a["turno_id"]]
            out.append({"empleado_id": a["empleado_id"], "inicio": a["inicio"] or s["inicio"], "fin": a["fin"] or s["fin"],
                        "puesto": a["puesto"], "turno_id": a["turno_id"]})
    return out


def estirar(ts, quien=None):
    """Alarga una hora el primer tramo (o el de 'quien') que acabe antes de las 21:00."""
    t = next(t for t in ts if (quien is None or t["empleado_id"] == quien) and t["fin"] < "21:00")
    h, m = map(int, t["fin"].split(":"))
    t["fin"] = f"{h + 1:02d}:{m:02d}"
    return t


def test_evaluar_no_guarda_y_dice_que_cambia(admin):
    det = semana(admin)
    sid, dia = det["id"], det["desde"]
    ts = tramos(admin, det, dia)
    t = estirar(ts)
    r = admin.post(f"/api/horarios/{sid}/dia/evaluar", json={"fecha": dia, "tramos": ts, "base": det["version"]})
    assert r.status_code == 200, r.text
    ev = r.json()
    assert ev["destino"] == "borrador" and [c["empleado_id"] for c in ev["cambios"]] == [t["empleado_id"]]
    assert {"resueltas", "nuevas", "mejoradas", "empeoradas", "criticas", "reglas_nuevas", "alertas_despues"} <= set(ev)
    assert admin.get(f"/api/horarios/{sid}").json()["horario"] == det["horario"]


def test_aplicar_en_borrador_guarda_un_turno_a_medida_bloqueado(admin):
    det = semana(admin)
    sid, dia = det["id"], det["desde"]
    ts = tramos(admin, det, dia)
    t = estirar(ts)
    r = admin.post(f"/api/horarios/{sid}/dia/aplicar", json={"fecha": dia, "tramos": ts, "base": det["version"]})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["guardado_en"] == sid and out["estado"] == "borrador"
    a = next(x for x in out["horario"]["asignaciones"] if x["empleado_id"] == t["empleado_id"] and x["fecha"] == dia)
    assert (a["inicio"], a["fin"]) == (t["inicio"], t["fin"])
    assert any(b["empleado_id"] == t["empleado_id"] and b["fecha"] == dia and b["fin"] == t["fin"]
               for b in out["horario"]["bloqueos"])
    # La versión con la que se empezó a editar ya no vale
    r = admin.post(f"/api/horarios/{sid}/dia/aplicar", json={"fecha": dia, "tramos": ts, "base": det["version"]})
    assert r.status_code == 409
    # Regenerar respeta el turno a medida
    r = admin.post(f"/api/horarios/{sid}/regenerar")
    assert r.status_code == 200, r.text
    a = next(x for x in r.json()["horario"]["asignaciones"] if x["empleado_id"] == t["empleado_id"] and x["fecha"] == dia)
    assert (a["inicio"], a["fin"]) == (t["inicio"], t["fin"])


def test_en_un_publicado_se_guarda_un_arreglo_que_el_equipo_no_ve_hasta_publicarlo(admin):
    det = semana(admin, publicar=True)
    sid, dia = det["id"], det["desde"]
    ts = tramos(admin, det, dia)
    t = estirar(ts)
    ev = admin.post(f"/api/horarios/{sid}/dia/evaluar", json={"fecha": dia, "tramos": ts}).json()
    assert ev["destino"] == "arreglo"
    r = admin.post(f"/api/horarios/{sid}/dia/aplicar", json={"fecha": dia, "tramos": ts, "base": det["version"]})
    assert r.status_code == 200, r.text
    arreglo = r.json()
    assert arreglo["guardado_en"] != sid and arreglo["reemplaza"] == sid and arreglo["estado"] == "borrador"
    publicado = admin.get(f"/api/horarios/{sid}").json()
    assert publicado["horario"]["asignaciones"] == det["horario"]["asignaciones"]
    assert publicado["arreglo_pendiente"] == arreglo["id"]
    # Mientras haya un arreglo pendiente, el publicado no se edita: se edita el arreglo
    assert admin.post(f"/api/horarios/{sid}/dia/evaluar", json={"fecha": dia, "tramos": ts}).status_code == 409
    r = admin.post(f"/api/horarios/{arreglo['id']}/publicar", json={"confirmar_criticas": True})
    assert r.status_code == 200, r.text
    assert r.json()["reemplazado"] == sid
    final = admin.get(f"/api/horarios/{sid}").json()
    a = next(x for x in final["horario"]["asignaciones"] if x["empleado_id"] == t["empleado_id"] and x["fecha"] == dia)
    assert a["fin"] == t["fin"] and t["empleado_id"] in final["cambios_pendientes"]


def test_errores_de_entrada(admin):
    det = semana(admin)
    sid, dia = det["id"], det["desde"]
    ts = tramos(admin, det, dia)
    doble = ts + [dict(ts[0], inicio="21:00", fin="22:00")]
    r = admin.post(f"/api/horarios/{sid}/dia/evaluar", json={"fecha": dia, "tramos": doble})
    assert r.status_code == 400 and "dos tramos" in r.json()["detail"]
    r = admin.post(f"/api/horarios/{sid}/dia/evaluar", json={"fecha": "2001-01-01", "tramos": ts})
    assert r.status_code == 400
    r = admin.post(f"/api/horarios/{sid}/dia/evaluar", json={"fecha": dia, "tramos": [dict(ts[0], inicio="10:00", fin="09:00")]})
    assert r.status_code == 422


def test_celda_semanal_con_puesto(admin):
    det = semana(admin)
    sid = det["id"]
    a = det["horario"]["asignaciones"][0]
    r = admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": a["empleado_id"], "fecha": a["fecha"],
                                                         "turno_id": a["turno_id"], "puesto": "cocina"})
    assert r.status_code == 200, r.text
    nueva = next(x for x in r.json()["horario"]["asignaciones"]
                 if x["empleado_id"] == a["empleado_id"] and x["fecha"] == a["fecha"])
    assert nueva["puesto"] == "cocina"


def test_cambiar_el_puesto_en_la_semana_conserva_las_horas_a_medida(admin):
    det = semana(admin)
    sid, dia = det["id"], det["desde"]
    ts = tramos(admin, det, dia)
    t = estirar(ts)
    det = admin.post(f"/api/horarios/{sid}/dia/aplicar", json={"fecha": dia, "tramos": ts}).json()
    otro = "cocina" if t["puesto"] == "sala" else "sala"
    r = admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": t["empleado_id"], "fecha": dia, "turno_id": t["turno_id"],
                                                         "puesto": otro, "conservar_horas": True})
    a = next(x for x in r.json()["horario"]["asignaciones"] if x["empleado_id"] == t["empleado_id"] and x["fecha"] == dia)
    assert (a["puesto"], a["fin"]) == (otro, t["fin"])
    r = admin.patch(f"/api/horarios/{sid}/celda", json={"empleado_id": t["empleado_id"], "fecha": dia, "turno_id": t["turno_id"]})
    a = next(x for x in r.json()["horario"]["asignaciones"] if x["empleado_id"] == t["empleado_id"] and x["fecha"] == dia)
    assert (a["puesto"], a["inicio"], a["fin"]) == (otro, None, None)
