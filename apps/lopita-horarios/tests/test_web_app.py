"""Web app: caché de alertas, interfaz versionada con service worker, compresión y SQLite en modo WAL."""
import copy
import datetime as dt
import json
import pathlib
import re
import sqlite3
from contextlib import closing

import pytest
from fastapi.testclient import TestClient

from app.alertas import CacheEvaluaciones
from app.db import Store
from app.main import create_app
from app.slack import Slack
from lopita_horarios import Config
from lopita_horarios.alertas import evaluar
from lopita_horarios.models import Assignment, Schedule

PW = "contraseña-segura"
DATA = json.loads((pathlib.Path(__file__).parent.parent / "datos" / "ejemplo.json").read_text(encoding="utf-8"))
LUN = dt.date(2026, 11, 9)


def cfg(**cambios) -> Config:
    return Config.model_validate({**copy.deepcopy(DATA), **cambios})


def horario(asignaciones, desde=LUN, hasta=LUN + dt.timedelta(days=6)) -> Schedule:
    return Schedule(desde=desde, hasta=hasta, asignaciones=[
        Assignment(empleado_id=e, fecha=desde + dt.timedelta(days=d), turno_id=t) for e, d, t in asignaciones])


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#horarios"), secret="test", solve_seconds=8)
    c = TestClient(app)
    assert c.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return c


# ------------------------------------------------------------------ caché de alertas
def test_la_cache_da_lo_mismo_que_evaluar_y_no_recalcula(monkeypatch):
    config, h = cfg(), horario([("ana", 0, "M")])
    cache = CacheEvaluaciones()
    primera = cache.evaluar(config, h, None)
    assert primera == evaluar(config, h, None)

    monkeypatch.setattr("app.alertas.evaluar", lambda *a: pytest.fail("debía salir de la caché"))
    assert cache.evaluar(config, horario([("ana", 0, "M")]), None) == primera


def test_la_cache_recalcula_si_cambia_el_horario_la_config_o_lo_previo():
    config, h = cfg(), horario([("ana", 0, "M")])
    cache = CacheEvaluaciones()
    base = cache.evaluar(config, h, None)

    otro = horario([("ana", 0, "M"), ("ana", 1, "M")])
    assert cache.evaluar(config, otro, None) == evaluar(config, otro, None)

    silenciada = base[0].codigo
    config2 = cfg(alertas={**config.alertas.model_dump(), "desactivadas": [silenciada]})
    assert all(a.codigo != silenciada for a in cache.evaluar(config2, h, None) if a.silenciable)

    previo = horario([("ana", 6, "T")], desde=LUN - dt.timedelta(days=7), hasta=LUN - dt.timedelta(days=1)).asignaciones
    assert cache.evaluar(config, h, previo) == evaluar(config, h, previo)


def test_la_cache_tiene_un_tope():
    config, cache = cfg(), CacheEvaluaciones(capacidad=2)
    for d in range(4):
        cache.evaluar(config, horario([("ana", d, "M")]), None)
    assert len(cache._datos) == 2


def test_editar_un_horario_actualiza_sus_alertas(client):
    h = client.post("/api/horarios/generar", json={"desde": "2026-11-09", "hasta": "2026-11-15"}).json()
    antes = client.get(f"/api/horarios/{h['id']}/alertas").json()
    a = h["horario"]["asignaciones"][0]
    r = client.patch(f"/api/horarios/{h['id']}/celda", json={"empleado_id": a["empleado_id"], "fecha": a["fecha"], "turno_id": None})
    assert r.status_code == 200, r.text
    despues = client.get(f"/api/horarios/{h['id']}/alertas").json()
    assert despues != antes


# ------------------------------------------------------------------ interfaz como web app instalable
def test_la_pagina_pide_los_archivos_con_su_version_y_registra_el_service_worker(client):
    html = client.get("/").text
    versiones = set(re.findall(r'"/(?:static/app\.js|static/styles\.css|fonts/fonts\.css)\?v=([0-9a-f]+)"', html))
    assert len(versiones) == 1
    assert "serviceWorker.register('/sw.js')" in html

    sw = client.get("/sw.js")
    assert sw.status_code == 200 and sw.headers["content-type"].startswith("text/javascript")
    assert sw.headers["cache-control"] == "no-cache"
    v = versiones.pop()
    assert f'"/static/app.js?v={v}"' in sw.text and "lopita-${VERSION}" in sw.text and f'"{v}"' in sw.text
    assert client.get(f"/static/app.js?v={v}").status_code == 200


def test_en_desarrollo_no_hay_service_worker(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_RECARGA", "1")
    html = TestClient(create_app(str(tmp_path / "d.db"), secret="t")).get("/").text
    assert "serviceWorker.register" not in html and "/static/recarga.js" in html


def test_las_respuestas_grandes_van_comprimidas(client):
    h = client.post("/api/horarios/generar", json={"desde": "2026-11-09", "hasta": "2026-11-15"}).json()
    r = client.get(f"/api/horarios/{h['id']}", headers={"Accept-Encoding": "gzip"})
    assert r.headers.get("content-encoding") == "gzip"


# ------------------------------------------------------------------ base de datos
def test_sqlite_en_modo_wal_y_copia_en_caliente(tmp_path):
    store = Store(str(tmp_path / "a.db"))
    store.upsert_user("ana", "contraseña-larga", "Ana")
    with closing(sqlite3.connect(tmp_path / "a.db")) as c:
        assert c.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    store.copia(str(tmp_path / "copias" / "b.db"))
    assert Store(str(tmp_path / "copias" / "b.db")).get_user("ana")["nombre"] == "Ana"
