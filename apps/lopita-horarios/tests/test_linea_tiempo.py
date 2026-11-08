"""Línea de tiempo de lo publicado: cada fecha tiene un solo horario publicado que manda en ella."""
import datetime as dt
import json
import pathlib
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import horas, linea_tiempo
from app.db import Store
from app.main import create_app
from app.slack import Slack
from lopita_horarios.models import Assignment, Schedule

PW = "contraseña-segura"
D = dt.date(2026, 11, 2)  # lunes


def dia(n: int) -> dt.date:
    return D + dt.timedelta(days=n)


def horario(desde: int, hasta: int, empleado: str) -> Schedule:
    """Un horario de prueba: 'empleado' hace el turno M todos los días, así se ve qué horario manda en cada fecha."""
    return Schedule(desde=dia(desde), hasta=dia(hasta),
                    asignaciones=[Assignment(empleado_id=empleado, fecha=dia(i), turno_id="M")
                                  for i in range(desde, hasta + 1)])


def publicar(store: Store, h: Schedule) -> int:
    sid = store.create_schedule(h, "admin")
    h.estado = "publicado"
    store.publish_schedule(sid, h)
    return sid


def quien(store: Store, n: int) -> str | None:
    h = horas.best_schedules(store.list_schedules()).get(dia(n))
    return next((a.empleado_id for a in h.asignaciones if a.fecha == dia(n)), None) if h else None


@pytest.fixture()
def store(tmp_path):
    return Store(str(tmp_path / "t.db"))


def test_el_ultimo_publicado_manda_en_sus_fechas(store):
    a = publicar(store, horario(0, 13, "ana"))
    b = publicar(store, horario(7, 20, "bruno"))
    t = store.timeline()
    assert {t[dia(i)] for i in range(7)} == {a}
    assert {t[dia(i)] for i in range(7, 21)} == {b}
    assert [quien(store, i) for i in (6, 7, 13, 14)] == ["ana", "bruno", "bruno", "bruno"]
    # Lo que mandaba antes en los días pisados queda en el historial
    hist = store.day_history(dia(10))
    assert [(h["schedule_id"], h["sustituido_por"], h["motivo"]) for h in hist] == [(a, b, "publicacion")]


def test_tocar_el_viejo_no_hace_que_vuelva_a_mandar(store):
    """Antes mandaba el modificado más tarde: editar el viejo le devolvía todos sus días solapados."""
    a = publicar(store, horario(0, 13, "ana"))
    publicar(store, horario(7, 20, "bruno"))
    viejo = store.get_schedule(a)["horario"]
    store.update_schedule(a, viejo, ["ana"])
    assert quien(store, 10) == "bruno"
    # Y volver a publicar el viejo tampoco recupera las fechas que le ocupó el otro
    store.publish_schedule(a, viejo)
    assert quien(store, 10) == "bruno" and quien(store, 3) == "ana"


def test_vigentes_y_sustituido(store):
    a = publicar(store, horario(0, 6, "ana"))
    b = publicar(store, horario(3, 9, "bruno"))
    c = publicar(store, horario(0, 6, "carla"))
    filas = {r["id"]: r for r in store.list_schedules()}
    assert filas[a]["vigentes"] == frozenset() and linea_tiempo.sustituido(filas[a])
    assert filas[b]["vigentes"] == frozenset(dia(i) for i in (7, 8, 9)) and not linea_tiempo.sustituido(filas[b])
    assert store.get_schedule(c)["vigentes"] == frozenset(dia(i) for i in range(7))
    borrador = store.create_schedule(horario(0, 3, "diego"), "admin")
    assert "vigentes" not in store.get_schedule(borrador) and not linea_tiempo.sustituido(store.get_schedule(borrador))


def test_un_borrador_no_tapa_lo_publicado_y_cubre_lo_que_no_lo_esta(store):
    publicar(store, horario(0, 3, "ana"))
    store.create_schedule(horario(2, 5, "bruno"), "admin")
    con_borradores = horas.best_schedules(store.list_schedules(), solo_publicados=False)
    por = {d: next(a.empleado_id for a in h.asignaciones if a.fecha == d) for d, h in con_borradores.items()}
    assert [por[dia(i)] for i in range(6)] == ["ana", "ana", "ana", "ana", "bruno", "bruno"]
    assert dia(4) not in horas.best_schedules(store.list_schedules())


def test_despublicar_o_borrar_devuelve_los_dias_al_anterior(store):
    a = publicar(store, horario(0, 13, "ana"))
    b = publicar(store, horario(7, 20, "bruno"))
    h = store.get_schedule(b)["horario"]
    h.estado = "borrador"
    store.update_schedule(b, h, [])
    t = store.timeline()
    assert {t[dia(i)] for i in range(14)} == {a} and dia(14) not in t
    # Al volver a publicarlo, vuelve a ocupar todas sus fechas
    h.estado = "publicado"
    store.publish_schedule(b, h)
    assert store.timeline()[dia(10)] == b
    store.delete_schedule(b)
    t = store.timeline()
    assert {t[dia(i)] for i in range(14)} == {a} and dia(14) not in t
    store.delete_schedule(a)
    assert store.timeline() == {}


def test_borrar_no_devuelve_los_dias_a_un_horario_ya_despublicado(store):
    a = publicar(store, horario(0, 6, "ana"))
    b = publicar(store, horario(0, 6, "bruno"))
    h = store.get_schedule(a)["horario"]
    h.estado = "borrador"
    store.update_schedule(a, h, [])
    store.delete_schedule(b)
    assert store.timeline() == {}


def test_dias_previos_del_motor_salen_de_la_linea_de_tiempo(store):
    publicar(store, horario(0, 13, "ana"))
    publicar(store, horario(7, 13, "bruno"))
    previo = store.assignments_before(dia(14), days=7)
    assert {a.empleado_id for a in previo} == {"bruno"} and len(previo) == 7
    # El horario que acaba justo antes es el que manda ese día
    assert store.previous_contiguous(dia(14)).asignaciones[0].empleado_id == "bruno"


def test_enlace_viejo_ensena_lo_que_vale_hoy(store):
    a = publicar(store, horario(0, 6, "ana"))
    publicar(store, horario(3, 9, "bruno"))
    publicar(store, horario(5, 5, "carla"))
    store.delete_schedule(publicar(store, horario(6, 6, "diego")))
    v = linea_tiempo.vigente(store.list_schedules(), store.get_schedule(a)["horario"])
    assert (v.desde, v.hasta) == (dia(0), dia(6))
    assert [(x.fecha, x.empleado_id) for x in v.asignaciones] == \
        [(dia(0), "ana"), (dia(1), "ana"), (dia(2), "ana"), (dia(3), "bruno"), (dia(4), "bruno"), (dia(5), "carla"),
         (dia(6), "bruno")]


def _base_antigua(path, filas):
    """Una base de datos como las de antes de la línea de tiempo: horarios publicados y sin dias_publicados."""
    s = Store(path)
    for desde, hasta, emp, published_at, updated_at in filas:
        sid = s.create_schedule(horario(desde, hasta, emp), "admin")
        h = horario(desde, hasta, emp)
        h.estado = "publicado"
        s.publish_schedule(sid, h)
        with sqlite3.connect(path) as c:
            c.execute("UPDATE schedules SET published_at=?, updated_at=? WHERE id=?", (published_at, updated_at, sid))
    with sqlite3.connect(path) as c:
        c.execute("DELETE FROM dias_publicados")
        c.execute("DELETE FROM dias_historial")
        c.execute("PRAGMA user_version = 0")


def test_migracion_crea_la_linea_de_tiempo_y_avisa_de_los_solapes(tmp_path):
    path = str(tmp_path / "vieja.db")
    # Bruno se publicó después, pero Ana se modificó más tarde: hasta ahora el equipo veía a Ana en los días solapados
    _base_antigua(path, [(0, 13, "ana", "2026-10-20T10:00:00+00:00", "2026-10-25T10:00:00+00:00"),
                         (7, 20, "bruno", "2026-10-21T10:00:00+00:00", "2026-10-21T10:00:00+00:00")])
    s = Store(path)
    assert [quien(s, i) for i in (6, 7, 13, 14)] == ["ana", "bruno", "bruno", "bruno"]
    [n] = [n for n in s.notifications() if n["tipo"] == "linea_tiempo_migrada"]
    assert "7 días" in n["texto"] and "En 7 de ellos" in n["texto"]
    detalle = n["detalle"] if isinstance(n["detalle"], dict) else json.loads(n["detalle"])
    assert detalle["cambian"] == [dia(i).isoformat() for i in range(7, 14)]
    # Solo una vez: volver a abrir la base no repite la migración ni la notificación
    s2 = Store(path)
    assert len([n for n in s2.notifications() if n["tipo"] == "linea_tiempo_migrada"]) == 1


def test_migracion_sin_solapes_no_notifica(tmp_path):
    path = str(tmp_path / "vieja.db")
    _base_antigua(path, [(0, 6, "ana", "2026-10-20T10:00:00+00:00", "2026-10-20T10:00:00+00:00"),
                         (7, 13, "bruno", "2026-10-21T10:00:00+00:00", "2026-10-21T10:00:00+00:00")])
    s = Store(path)
    assert len(s.timeline()) == 14
    assert not [n for n in s.notifications() if n["tipo"] == "linea_tiempo_migrada"]


# ------------------------------------------------------------------ API


@pytest.fixture()
def api(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    c = TestClient(app)
    assert c.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return app, c


def _generar_y_publicar(c, desde: dt.date, hasta: dt.date) -> dict:
    r = c.post("/api/horarios/generar", json={"desde": desde.isoformat(), "hasta": hasta.isoformat()})
    assert r.status_code == 200, r.text
    r = c.post(f"/api/horarios/{r.json()['id']}/publicar", json={"confirmar_criticas": True})
    assert r.status_code == 200, r.text
    return r.json()


def test_api_calendario_lista_y_enlace_viejo(api):
    _, c = api
    hoy = dt.date.today()
    lunes = hoy + dt.timedelta(days=7 - hoy.weekday())
    a = _generar_y_publicar(c, lunes, lunes + dt.timedelta(days=6))
    b = _generar_y_publicar(c, lunes + dt.timedelta(days=3), lunes + dt.timedelta(days=9))
    cal = c.get("/api/calendario", params={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=9)).isoformat()}).json()
    assert [cal["dias"][(lunes + dt.timedelta(days=i)).isoformat()]["horario_id"] for i in range(10)] == \
        [a["id"]] * 3 + [b["id"]] * 7
    lista = {s["id"]: s for s in c.get("/api/horarios").json()}
    assert lista[a["id"]]["dias_vigentes"] == 3 and not lista[a["id"]]["sustituido"]
    assert lista[b["id"]]["dias_vigentes"] == 7
    assert c.get(f"/ver/{a['token']}").status_code == 200
    # Si se publica un tercero que tapa del todo al primero, sale como sustituido y no se cuentan sus alertas
    _generar_y_publicar(c, lunes, lunes + dt.timedelta(days=2))
    lista = {s["id"]: s for s in c.get("/api/horarios").json()}
    assert lista[a["id"]]["sustituido"] and lista[a["id"]]["dias_vigentes"] == 0
    assert a["id"] not in {h["id"] for h in c.get("/api/alertas").json()["horarios"]}


def test_preparar_pone_al_dia_una_base_sustituida_por_otra_antigua(tmp_path):
    """App offline con datos compartidos: la base se sustituye por la que sube otro dispositivo con la app anterior,
    sin la línea de tiempo. Sin volver a prepararla, cada lectura de horarios fallaba con «no such table»."""
    path = str(tmp_path / "t.db")
    s = Store(path)
    vieja = str(tmp_path / "vieja.db")
    _base_antigua(vieja, [(0, 6, "ana", "2026-10-20T10:00:00+00:00", "2026-10-20T10:00:00+00:00")])
    plano = str(tmp_path / "bajada.db")  # la base entera en un solo fichero, como la que baja de la nube
    c = sqlite3.connect(vieja)
    c.execute("DROP TABLE dias_publicados")
    c.execute("DROP TABLE dias_historial")
    c.commit()
    c.execute("VACUUM INTO ?", (plano,))
    c.close()
    for resto in ("-wal", "-shm"):  # en el navegador no hay WAL: el fichero bajado sustituye a toda la base
        pathlib.Path(path + resto).unlink(missing_ok=True)
    pathlib.Path(path).write_bytes(pathlib.Path(plano).read_bytes())
    with pytest.raises(sqlite3.OperationalError):
        s.list_schedules()
    s.preparar()
    assert len(s.timeline()) == 7 and quien(s, 3) == "ana"


def test_el_motor_lee_lo_publicado_despues_pero_no_los_borradores(store):
    publicar(store, horario(7, 13, "ana"))
    store.create_schedule(horario(14, 20, "bruno"), "admin")  # borrador después: no ata
    publicar(store, horario(0, 1, "carla"))
    ctx = store.assignments_around(dia(2), dia(6))
    assert sorted({(a.empleado_id, a.fecha) for a in ctx}) == \
        [("ana", dia(i)) for i in range(7, 14)] + [("carla", dia(0)), ("carla", dia(1))]
    # Un periodo que pisa lo publicado (se regenera excluyéndose a sí mismo) lee lo que manda después de su rango
    ctx = store.assignments_around(dia(0), dia(9), exclude=None)
    assert {a.fecha for a in ctx if a.fecha > dia(9)} == {dia(i) for i in range(10, 14)}
    assert store.assignments_around(dia(30), dia(31)) is None
