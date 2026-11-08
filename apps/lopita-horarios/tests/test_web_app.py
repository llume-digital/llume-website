"""Web app: caché de alertas, interfaz versionada con service worker, compresión y SQLite en modo WAL."""
import copy
import datetime as dt
import json
import pathlib
import posixpath
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

RAIZ = pathlib.Path(__file__).resolve().parent.parent

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
    versiones = set(re.findall(r'"/i/([0-9a-f]+)/(?:app\.js|styles\.css)"', html))
    versiones |= set(re.findall(r'"/fonts/fonts\.css\?v=([0-9a-f]+)"', html))
    assert len(versiones) == 1 and '"/static/app.js"' not in html
    assert "serviceWorker.register('/sw.js')" in html

    sw = client.get("/sw.js")
    assert sw.status_code == 200 and sw.headers["content-type"].startswith("text/javascript")
    assert sw.headers["cache-control"] == "no-cache"
    v = versiones.pop()
    assert f'"/i/{v}/app.js"' in sw.text and "lopita-${VERSION}" in sw.text and f'"{v}"' in sw.text
    r = client.get(f"/i/{v}/app.js")
    assert r.status_code == 200 and "immutable" in r.headers["cache-control"]
    assert r.headers["content-type"].startswith(("text/javascript", "application/javascript"))
    # Una pestaña con una huella vieja recibe el archivo actual, pero sin guardarlo para siempre
    assert client.get("/i/000000000000/app.js").headers["cache-control"] == "no-cache"


@pytest.mark.parametrize("ruta", ["/i/x/../main.py", "/i/x/%2e%2e/main.py", "/i/x/index.html", "/i/x/sw.js", "/i/x/nada.js"])
def test_la_ruta_de_la_interfaz_no_sirve_nada_fuera_de_static(client, ruta):
    assert client.get(ruta).status_code == 404


def _imports_relativos(js: str) -> set[str]:
    return set(re.findall(r"""(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.{1,2}/[^'"]+)['"]""", js))


def test_cada_modulo_que_se_importa_se_sirve_se_precachea_y_va_en_la_app_offline(client):
    """Partiendo de app.js, cada `import './…'` existe, está en la lista del service worker y en la salida offline."""
    import sys
    sys.path.insert(0, str(RAIZ / "herramientas"))
    import construir_offline as co

    static = RAIZ / "app" / "static"
    v = re.search(r'"/i/([0-9a-f]+)/app\.js"', client.get("/").text).group(1)
    sw, offline = client.get("/sw.js").text, set(co.estaticos())
    pendientes, vistos = ["app.js"], set()
    while pendientes:
        modulo = pendientes.pop()
        if modulo in vistos:
            continue
        vistos.add(modulo)
        assert (static / modulo).is_file(), modulo
        assert f'"/i/{v}/{modulo}"' in sw, modulo
        assert modulo in offline, modulo
        assert client.get(f"/i/{v}/{modulo}").status_code == 200, modulo
        carpeta = pathlib.PurePosixPath(modulo).parent
        for imp in _imports_relativos((static / modulo).read_text(encoding="utf-8")):
            pendientes.append(posixpath.normpath(str(carpeta / imp)))
    assert {"app.js", "styles.css"} <= offline


def test_imports_relativos_detecta_las_tres_formas():
    js = "import { a } from './nucleo/util.js';\nimport './efectos.js';\nconst m = await import('../x/y.js');"
    assert _imports_relativos(js) == {"./nucleo/util.js", "./efectos.js", "../x/y.js"}


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
