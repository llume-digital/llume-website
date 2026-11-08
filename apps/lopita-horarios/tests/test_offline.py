"""App offline: el puente que sirve la API dentro del navegador y la construcción del paquete.

El puente se prueba aquí con CPython; el recorrido en el navegador (Pyodide) está en
tests/test_offline_navegador.py y necesita el paquete ya construido.
"""
import asyncio
import hashlib
import importlib
import json
import sys
import zipfile
from pathlib import Path

import anyio.to_thread
import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "offline"))
sys.path.insert(0, str(RAIZ / "herramientas"))


@pytest.fixture
def puente(monkeypatch):
    """Importa el puente y deshace al terminar su cambio global en anyio (no afecta a otros tests)."""
    monkeypatch.setattr(anyio.to_thread, "run_sync", anyio.to_thread.run_sync)
    import lopita_offline
    return importlib.reload(lopita_offline)


def pedir(puente, metodo, ruta, cuerpo=None):
    datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
    r = asyncio.run(puente.peticion(metodo, ruta, {"content-type": "application/json"}, datos))
    return r["estado"], json.loads(r["cuerpo"]) if r["cuerpo"] else None


def test_pbkdf2_en_python_puro_da_lo_mismo_que_hashlib(puente):
    for clave, sal, n, largo in [(b"lopita", b"0123456789abcdef", 1000, None), (b"x" * 100, b"s", 3, 50)]:
        esperado = hashlib.pbkdf2_hmac("sha256", clave, sal, n, largo)
        assert puente._pbkdf2_hmac("sha256", clave, sal, n, largo) == esperado


def test_sesion_y_datos_sobreviven_a_cerrar_la_app(puente, tmp_path):
    demo = puente.iniciar(str(tmp_path), segundos_motor=20)
    assert pedir(puente, "GET", "/api/me")[0] == 401
    assert pedir(puente, "POST", "/api/login", {"usuario": demo["usuario"], "password": demo["clave"]})[0] == 200
    estado, h = pedir(puente, "POST", "/api/horarios/generar", {"desde": "2026-11-09", "hasta": "2026-11-15"})
    assert estado == 200 and h["horario"]["asignaciones"]

    # Se vuelve a abrir la app: misma carpeta de datos, proceso nuevo.
    puente = importlib.reload(puente)
    puente.iniciar(str(tmp_path))
    estado, me = pedir(puente, "GET", "/api/me")
    assert estado == 200 and me["username"] == "admin"
    assert [x["id"] for x in pedir(puente, "GET", "/api/horarios")[1]] == [h["id"]]

    assert pedir(puente, "POST", "/api/logout")[0] == 200
    assert puente._cookies == {}
    assert pedir(puente, "GET", "/api/me")[0] == 401


def test_reabrir_pone_al_dia_la_base_que_baja_de_la_nube(puente, tmp_path):
    """Con datos compartidos, la base se sustituye por la de la nube, que puede haber subido un dispositivo con la
    app anterior (sin las tablas nuevas). El worker llama a reabrir() y la app sigue funcionando sin recargar."""
    import sqlite3

    demo = puente.iniciar(str(tmp_path), segundos_motor=20)
    assert pedir(puente, "POST", "/api/login", {"usuario": demo["usuario"], "password": demo["clave"]})[0] == 200
    with sqlite3.connect(tmp_path / "lopita.db") as c:  # lo que baja: una base del esquema anterior
        c.execute("DROP TABLE dias_publicados")
        c.execute("DROP TABLE dias_historial")
        c.execute("PRAGMA user_version = 0")
    puente.reabrir()
    assert pedir(puente, "GET", "/api/horarios")[0] == 200
    assert pedir(puente, "GET", "/api/calendario?desde=2026-11-09&hasta=2026-11-15")[0] == 200


def test_cuerpo_como_uint8array_de_javascript(puente, tmp_path):
    """Desde el worker el cuerpo llega como JsProxy de un Uint8Array, que se convierte con to_bytes()."""
    class Uint8Array:
        def __init__(self, datos):
            self.datos = datos

        def to_bytes(self):
            return self.datos

    puente.iniciar(str(tmp_path))
    cuerpo = Uint8Array(json.dumps({"usuario": "admin", "password": "lopita"}).encode())
    r = asyncio.run(puente.peticion("POST", "/api/login", {"content-type": "application/json"}, cuerpo))
    assert r["estado"] == 200


def test_construir_paquete(monkeypatch, tmp_path):
    import construir_offline as co

    pyodide = tmp_path / "pyodide"
    pyodide.mkdir()
    nucleo = {}
    for nombre in co.NUCLEO:
        datos = b"{}" if nombre == "pyodide-lock.json" else nombre.encode()
        nucleo[nombre] = datos
    rueda = b"rueda"
    lock = {"info": {}, "packages": {
        "uno": {"depends": ["dos"], "file_name": "uno.whl", "sha256": hashlib.sha256(rueda).hexdigest()},
        "dos": {"depends": [], "file_name": "dos.whl", "sha256": hashlib.sha256(rueda).hexdigest()},
        "otro": {"depends": [], "file_name": "otro.whl", "sha256": "x"},
    }}
    nucleo["pyodide-lock.json"] = json.dumps(lock).encode()
    for nombre, datos in nucleo.items():
        (pyodide / nombre).write_bytes(datos)
    for nombre in ("uno.whl", "dos.whl"):
        (pyodide / nombre).write_bytes(rueda)
    monkeypatch.setattr(co, "NUCLEO", {n: hashlib.sha256(d).hexdigest() for n, d in nucleo.items()})
    monkeypatch.setattr(co, "PAQUETES", ["uno"])
    monkeypatch.setattr(co, "EXTRA", [])

    salida = tmp_path / "dist"
    archivos = co.construir(salida, pyodide)

    assert {"./", "index.html", "arranque.js", "motor.worker.js", "manifest.webmanifest", "config.js",
            "lopita.zip", "static/app.js", "fonts/fonts.css", "pyodide/uno.whl", "pyodide/dos.whl"} <= set(archivos)
    assert "pyodide/otro.whl" not in archivos and "sw.js" not in archivos
    sw = (salida / "sw.js").read_text(encoding="utf-8")
    assert "__ARCHIVOS__" not in sw and "__VERSION__" not in sw and '"pyodide/uno.whl"' in sw
    config = (salida / "config.js").read_text(encoding="utf-8")
    assert '"paquetes": ["dos", "uno"]' in config
    with zipfile.ZipFile(salida / "lopita.zip") as z:
        nombres = set(z.namelist())
    assert {"lopita_offline.py", "app/main.py", "app/static/index.html", "lopita_horarios/solver.py",
            "lopita_horarios/cp_highs.py", "datos/ejemplo.json"} <= nombres
    assert not [n for n in nombres if "__pycache__" in n]


def test_construir_rechaza_archivos_alterados(monkeypatch, tmp_path):
    import construir_offline as co

    pyodide = tmp_path / "pyodide"
    pyodide.mkdir()
    for nombre in co.NUCLEO:
        (pyodide / nombre).write_bytes(b"no es pyodide")
    with pytest.raises(SystemExit, match="sha256"):
        co.construir(tmp_path / "dist", pyodide)


def test_sin_red_las_respuestas_no_se_comprimen(puente, tmp_path):
    demo = puente.iniciar(str(tmp_path), segundos_motor=20)
    pedir(puente, "POST", "/api/login", {"usuario": demo["usuario"], "password": demo["clave"]})
    r = asyncio.run(puente.peticion("GET", "/api/config", {"accept-encoding": "gzip"}))
    assert r["estado"] == 200 and len(r["cuerpo"]) > 1024
    assert "content-encoding" not in dict(r["cabeceras"])
