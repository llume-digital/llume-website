"""Bajas: al marcar a alguien de baja con turnos ya asignados, aviso con los turnos que no se van a hacer,
alerta en el horario y arreglo preparado (sin tocar el horario publicado)."""
import datetime as dt

from tests.test_alertas_api import codes, env, make_week  # noqa: F401  (fixture)


def _baja(admin, emp, desde, hasta):
    cfg = admin.get("/api/config").json()
    c = cfg["config"]
    c["ausencias"].append({"empleado_id": emp, "desde": desde, "hasta": hasta, "motivo": "baja"})
    r = admin.put("/api/config", json={"config": c, "base": cfg["version"]})
    assert r.status_code == 200, r.text
    return r.json()


def test_baja_con_turnos_publicados_avisa_alerta_y_prepara_arreglo(env):  # noqa: F811
    _, admin = env
    sid, lunes = make_week(admin, publish=True)
    horario = admin.get(f"/api/horarios/{sid}").json()["horario"]
    emp = next(a["empleado_id"] for a in horario["asignaciones"] if a["fecha"] == (lunes + dt.timedelta(days=1)).isoformat())
    suyos = sorted(a["fecha"] for a in horario["asignaciones"] if a["empleado_id"] == emp)
    assert admin.post("/api/notificaciones/leer", json={}).status_code == 200

    r = _baja(admin, emp, lunes.isoformat(), (lunes + dt.timedelta(days=364)).isoformat())
    assert r["arreglos"], "debe preparar un arreglo del publicado"

    avisos = [n for n in admin.get("/api/notificaciones").json() if n["tipo"] == "turnos_perdidos"]
    assert len(avisos) == 1
    n = avisos[0]
    assert "de baja" in n["titulo"] and f"{len(suyos)} turno" in n["titulo"]
    assert [t["fecha"] for t in n["detalle"]["turnos"]] == suyos
    assert all(t["estado"] == "publicado" for t in n["detalle"]["turnos"])
    assert n["detalle"]["arreglo"] == r["arreglos"][0] and n["schedule_id"] == r["arreglos"][0]
    assert "no se va a cumplir" in n["texto"]
    # Un solo aviso: el del arreglo ya va dentro del de la baja.
    assert not [x for x in admin.get("/api/notificaciones").json() if x["tipo"] == "arreglo_preparado" and not x["leida_at"]]

    # El publicado sigue igual (el equipo lo ve) pero con su alerta; el arreglo ya no le da turnos.
    pub = admin.get(f"/api/horarios/{sid}").json()
    assert sorted(a["fecha"] for a in pub["horario"]["asignaciones"] if a["empleado_id"] == emp) == suyos
    assert "ausencia_sin_reflejar" in codes(pub["alertas_detalle"])
    arreglo = admin.get(f"/api/horarios/{r['arreglos'][0]}").json()["horario"]
    assert not [a for a in arreglo["asignaciones"] if a["empleado_id"] == emp]

    # Guardar otra vez sin cambios en las ausencias no repite el aviso.
    assert admin.post("/api/notificaciones/leer", json={}).status_code == 200
    cfg = admin.get("/api/config").json()
    assert admin.put("/api/config", json={"config": cfg["config"], "base": cfg["version"]}).status_code == 200
    assert not [n for n in admin.get("/api/notificaciones").json() if n["tipo"] == "turnos_perdidos" and not n["leida_at"]]


def test_baja_sin_turnos_asignados_no_avisa(env):  # noqa: F811
    _, admin = env
    make_week(admin)
    lejos = dt.date.today() + dt.timedelta(days=200)
    _baja(admin, "ana", lejos.isoformat(), (lejos + dt.timedelta(days=3)).isoformat())
    assert not [n for n in admin.get("/api/notificaciones").json() if n["tipo"] == "turnos_perdidos"]
