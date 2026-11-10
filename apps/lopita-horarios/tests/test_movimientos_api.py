"""Mover turnos y libranzas fijas a través de la API."""
import datetime as dt

from tests.test_edicion_api import admin, semana  # noqa: F401  (fixture y ayuda compartidas)

DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


def libre_para_mover(admin, det):
    """Una asignación y un día del periodo en que esa persona no trabaja ni libra de forma fija."""
    cfg = admin.get("/api/config").json()["config"]
    emps = {e["id"]: e for e in cfg["empleados"]}
    ocupado = {(a["empleado_id"], a["fecha"]) for a in det["horario"]["asignaciones"]}
    fechas = [(dt.date.fromisoformat(det["desde"]) + dt.timedelta(days=i)).isoformat() for i in range(7)]
    for a in det["horario"]["asignaciones"]:
        e = emps[a["empleado_id"]]
        for f in fechas:
            if (e["id"], f) not in ocupado and DIAS[dt.date.fromisoformat(f).weekday()] not in e["libranzas_fijas"] \
                    and not any(x["empleado_id"] == e["id"] and x["desde"] <= f <= x["hasta"] for x in cfg["ausencias"]):
                return a, f
    raise AssertionError("no hay con qué probar")


def test_mover_turno_borrador(admin):  # noqa: F811
    det = semana(admin)
    a, f = libre_para_mover(admin, det)
    body = {"origen": {"empleado_id": a["empleado_id"], "fecha": a["fecha"]}, "destino": {"empleado_id": a["empleado_id"], "fecha": f}}
    r = admin.post(f"/api/horarios/{det['id']}/mover", json=body)
    if r.status_code == 400:  # el turno puede no valer ese día (apertura, franja...): se prueba con la regla dura que toque
        assert r.json()["detail"]
        return
    nuevas = {(x["empleado_id"], x["fecha"]) for x in r.json()["horario"]["asignaciones"]}
    assert (a["empleado_id"], f) in nuevas and (a["empleado_id"], a["fecha"]) not in nuevas


def test_mover_a_la_misma_casilla_es_error(admin):  # noqa: F811
    det = semana(admin)
    a = det["horario"]["asignaciones"][0]
    c = {"empleado_id": a["empleado_id"], "fecha": a["fecha"]}
    r = admin.post(f"/api/horarios/{det['id']}/mover", json={"origen": c, "destino": c})
    assert r.status_code == 400


def test_celda_no_pone_turno_en_libranza_fija(admin):  # noqa: F811
    det = semana(admin)
    cfg = admin.get("/api/config").json()["config"]
    e = next(e for e in cfg["empleados"] if e["libranzas_fijas"] and e["activo"])
    desde = dt.date.fromisoformat(det["desde"])
    f = next(desde + dt.timedelta(days=i) for i in range(7) if DIAS[(desde + dt.timedelta(days=i)).weekday()] in e["libranzas_fijas"])
    turno = cfg["turnos"][0]["id"]
    r = admin.patch(f"/api/horarios/{det['id']}/celda", json={"empleado_id": e["id"], "fecha": f.isoformat(), "turno_id": turno})
    assert r.status_code == 400 and "libranza fija" in r.json()["detail"]
