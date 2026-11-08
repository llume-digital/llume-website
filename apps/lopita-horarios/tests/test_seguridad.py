"""Protecciones antes de abrir la app a internet: intentos de login, CSRF, clave temporal, secreto y documentación."""
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.db as db
from app.main import create_app
from app.seguridad import LimiteIntentos
from app.slack import Slack

PW = "contraseña-segura"


@pytest.fixture()
def app_(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    return create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#horarios"), secret="test", solve_seconds=8)


def entrar(c, usuario="admin", password=PW):
    return c.post("/api/login", json={"usuario": usuario, "password": password})


# ------------------------------------------------------------------ límite de intentos
class Reloj:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def test_limite_espera_creciente_y_se_borra_al_acertar():
    reloj = Reloj()
    lim = LimiteIntentos(maximo=3, espera=30, espera_maxima=100, reloj=reloj)
    for _ in range(2):
        lim.fallo(["u:ana"])
    assert lim.segundos_de_espera(["u:ana"]) == 0
    lim.fallo(["u:ana"])
    assert lim.segundos_de_espera(["u:ana"]) == 30
    lim.fallo(["u:ana"])
    assert lim.segundos_de_espera(["u:ana"]) == 60
    lim.fallo(["u:ana"])
    assert lim.segundos_de_espera(["u:ana", "ip:1"]) == 100  # con tope
    reloj.t += 100
    assert lim.segundos_de_espera(["u:ana"]) == 0
    lim.acierto(["u:ana"])
    lim.fallo(["u:ana"])
    assert lim.segundos_de_espera(["u:ana"]) == 0  # vuelve a empezar la cuenta


def test_tras_cinco_fallos_ni_la_contraseña_buena_entra(app_):
    c = TestClient(app_)
    for _ in range(5):
        assert entrar(c, password="mala").status_code == 401
    r = entrar(c)
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0
    assert "Demasiados intentos" in r.json()["detail"]
    # la IP también queda frenada: probar otros usuarios no sirve
    assert entrar(c, usuario="otro", password="x").status_code == 429


def test_un_acierto_borra_los_fallos(app_):
    c = TestClient(app_)
    for _ in range(4):
        entrar(c, password="mala")
    assert entrar(c).status_code == 200
    for _ in range(4):
        assert entrar(c, password="mala").status_code == 401


def test_usuario_inexistente_cuesta_lo_mismo_que_contraseña_mala(tmp_path, monkeypatch):
    store = db.Store(str(tmp_path / "a.db"))
    llamadas = []
    original = db.check_password
    monkeypatch.setattr(db, "check_password", lambda pw, h: llamadas.append(h) or original(pw, h))
    assert store.authenticate("nadie", "x") is None
    assert llamadas == [db._hash_falso()]


# ------------------------------------------------------------------ CSRF
def test_se_rechazan_peticiones_de_otra_web(app_):
    c = TestClient(app_)
    assert entrar(c).status_code == 200
    assert c.post("/api/logout", headers={"Origin": "https://malo.example"}).status_code == 403
    assert c.post("/api/logout", headers={"Referer": "https://malo.example/pagina"}).status_code == 403
    assert c.post("/api/logout", headers={"Origin": "null"}).status_code == 403
    assert c.get("/api/me", headers={"Origin": "https://malo.example"}).status_code == 200  # leer no cambia nada
    assert c.post("/api/logout", headers={"Origin": "http://testserver"}).status_code == 200


def test_login_desde_otra_web_rechazado(app_):
    c = TestClient(app_)
    r = c.post("/api/login", json={"usuario": "admin", "password": PW}, headers={"Origin": "https://malo.example"})
    assert r.status_code == 403


# ------------------------------------------------------------------ configuración y despliegue
def test_guardar_la_configuracion_exige_la_version_de_partida(app_):
    c = TestClient(app_)
    entrar(c)
    cfg = c.get("/api/config").json()
    r = c.put("/api/config", json={"config": cfg["config"]})
    assert r.status_code == 400 and "base" in r.json()["detail"]
    assert c.put("/api/config", json={"config": cfg["config"], "base": cfg["version"]}).status_code == 200


def test_en_produccion_falta_el_secreto(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_HTTPS", "1")
    monkeypatch.delenv("LOPITA_SECRET", raising=False)
    with pytest.raises(RuntimeError, match="LOPITA_SECRET"):
        create_app(str(tmp_path / "p.db"))
    monkeypatch.setenv("LOPITA_SECRET", "s" * 64)
    create_app(str(tmp_path / "p.db"))


def test_documentacion_de_la_api_solo_si_se_pide(tmp_path, monkeypatch):
    assert TestClient(create_app(str(tmp_path / "a.db"), secret="t")).get("/api/docs").status_code == 404
    assert TestClient(create_app(str(tmp_path / "a.db"), secret="t")).get("/api/openapi.json").status_code == 404
    monkeypatch.setenv("LOPITA_DOCS", "1")
    assert TestClient(create_app(str(tmp_path / "b.db"), secret="t")).get("/api/docs").status_code == 200


def test_importar_la_app_no_calcula_hashes():
    """La app offline (Pyodide, sin OpenSSL) pone su pbkdf2_hmac después de importar la app."""
    codigo = "import hashlib; del hashlib.pbkdf2_hmac; import app.main"
    subprocess.run([sys.executable, "-c", codigo], check=True, cwd=Path(__file__).resolve().parent.parent)
