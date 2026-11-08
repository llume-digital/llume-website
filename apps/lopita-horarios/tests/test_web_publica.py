"""Formularios y carta de la web pública, y vista de solo lectura cerrada a quien no ha entrado."""
import base64

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.seguridad import LimiteEnvios
from app.slack import Slack

PW = "contraseña-segura"
PDF = b"%PDF-1.4\n%prueba\n"


def b64(datos: bytes) -> str:
    return base64.b64encode(datos).decode()


@pytest.fixture()
def c(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    return TestClient(app)


def entrar(c):
    assert c.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200


def candidatura(**cambios):
    body = {"nombre": "Lucía Pérez", "email": "lucia@example.com", "telefono": "600 000 000", "mensaje": "Tengo experiencia en barra",
            "acepto_privacidad": True, "cv": {"nombre": "cv lucía.pdf", "tipo": "application/pdf", "datos": b64(PDF)}}
    return {**body, **cambios}


def catering(**cambios):
    body = {"nombre": "Marcos", "email": "marcos@example.com", "mensaje": "Preboda para 40 personas",
            "fecha": "2026-12-12", "personas": 40, "acepto_privacidad": True}
    return {**body, **cambios}


# ------------------------------------------------------------------ formularios
def test_candidatura_llega_al_encargado_con_su_cv(c):
    assert c.post("/api/web/candidatura", json=candidatura()).json() == {"ok": True}
    assert c.get("/api/web/mensajes").status_code == 401  # sin sesión no se ven
    entrar(c)
    [m] = c.get("/api/web/mensajes").json()
    assert (m["tipo"], m["nombre"], m["estado"], m["adjunto_nombre"]) == ("candidatura", "Lucía Pérez", "nuevo", "cv lucía.pdf")
    assert "adjunto" not in m and m["datos"]["mensaje"] == "Tengo experiencia en barra"
    r = c.get(f"/api/web/mensajes/{m['id']}/adjunto")
    assert r.status_code == 200 and r.content == PDF and r.headers["content-disposition"].startswith("attachment")
    assert c.get("/api/me").json()["mensajes_web"] == 1


def test_catering_atender_y_borrar(c):
    c.post("/api/web/catering", json=catering())
    entrar(c)
    [m] = c.get("/api/web/mensajes?tipo=catering").json()
    assert m["datos"] == {"mensaje": "Preboda para 40 personas", "fecha": "2026-12-12", "personas": 40}
    hecho = c.post(f"/api/web/mensajes/{m['id']}/estado", json={"estado": "atendido"}).json()
    assert hecho["estado"] == "atendido" and hecho["atendido_por"] == "admin" and hecho["atendido_at"]
    assert c.get("/api/me").json()["mensajes_web"] == 0
    assert c.post(f"/api/web/mensajes/{m['id']}/estado", json={"estado": "nuevo"}).json()["atendido_por"] is None
    c.delete(f"/api/web/mensajes/{m['id']}")
    assert c.get("/api/web/mensajes").json() == []


@pytest.mark.parametrize("cambios, mensaje", [
    ({"acepto_privacidad": False}, "política de privacidad"),
    ({"email": "no-es-un-correo"}, "correo"),
    ({"cv": {"nombre": "cv.exe", "tipo": "application/x-msdownload", "datos": b64(b"MZ")}}, "PDF o un documento de Word"),
    ({"cv": {"nombre": "cv.pdf", "tipo": "application/pdf", "datos": b64(b"MZ no soy un pdf")}}, "PDF o un documento de Word"),
    ({"cv": {"nombre": "cv.pdf", "tipo": "application/pdf", "datos": "@@@"}}, "no ha llegado bien"),
])
def test_candidatura_invalida_se_rechaza(c, cambios, mensaje):
    r = c.post("/api/web/candidatura", json=candidatura(**cambios))
    assert r.status_code == 400 and mensaje in r.json()["detail"]


def test_cv_demasiado_grande(c):
    grande = PDF + b"0" * (5 * 1024 * 1024)
    r = c.post("/api/web/candidatura", json=candidatura(cv={"nombre": "cv.pdf", "tipo": "application/pdf", "datos": b64(grande)}))
    assert r.status_code in (413, 422)


def test_campo_trampa_no_guarda_nada(c):
    assert c.post("/api/web/catering", json=catering(web="http://spam")).json() == {"ok": True}
    entrar(c)
    assert c.get("/api/web/mensajes").json() == []


def test_limite_de_envios_por_ip(c):
    for _ in range(5):
        assert c.post("/api/web/catering", json=catering()).status_code == 200
    assert c.post("/api/web/catering", json=catering()).status_code == 429


def test_limite_envios_ventana():
    t = [0.0]
    lim = LimiteEnvios(maximo=2, ventana=60, reloj=lambda: t[0])
    assert lim.permitir("a") and lim.permitir("a") and not lim.permitir("a")
    assert lim.permitir("b")
    t[0] = 61
    assert lim.permitir("a")


def test_formulario_desde_otra_web_se_rechaza(c):
    r = c.post("/api/web/catering", json=catering(), headers={"Origin": "https://otra.example"})
    assert r.status_code == 403


# ------------------------------------------------------------------ carta
def test_carta_la_sube_el_encargado_y_la_ve_cualquiera(c):
    assert c.get("/api/web/documentos/carta-comidas").status_code == 404
    assert c.put("/api/web/documentos/carta-comidas", json={"nombre": "carta.pdf", "datos": b64(PDF)}).status_code == 401
    entrar(c)
    assert c.put("/api/web/documentos/carta-comidas", json={"nombre": "x.pdf", "datos": b64(b"hola")}).status_code == 400
    assert c.put("/api/web/documentos/otra", json={"nombre": "x.pdf", "datos": b64(PDF)}).status_code == 404
    docs = c.put("/api/web/documentos/carta-comidas", json={"nombre": "Carta octubre.pdf", "datos": b64(PDF)}).json()
    assert {d["clave"]: d.get("nombre") for d in docs} == {"carta-cafeteria": None, "carta-comidas": "Carta octubre.pdf"}
    c.post("/api/logout")
    r = c.get("/api/web/documentos/carta-comidas")
    assert r.status_code == 200 and r.content == PDF and r.headers["content-type"] == "application/pdf"
    assert r.headers["content-disposition"].startswith("inline")


# ------------------------------------------------------------------ vista de solo lectura
def _publicar(c) -> str:
    entrar(c)
    h = c.post("/api/horarios/generar", json={"desde": "2030-01-07", "hasta": "2030-01-13", "segundos": 5}).json()
    assert c.post(f"/api/horarios/{h['id']}/publicar", json={"confirmar_criticas": True}).status_code == 200
    return c.get(f"/api/horarios/{h['id']}").json()["url_publica"].split("/ver/")[1]


def test_vista_de_horario_solo_con_sesion(c):
    token = _publicar(c)
    assert c.get(f"/ver/{token}").status_code == 200
    c.post("/api/logout")
    r = c.get(f"/ver/{token}")
    assert r.status_code == 401 and "Inicia sesión" in r.text and "noindex" in r.text


def test_vista_publica_se_puede_abrir_a_proposito(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_VISTA_PUBLICA", "1")
    c = TestClient(create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8))
    token = _publicar(c)
    c.post("/api/logout")
    assert c.get(f"/ver/{token}").status_code == 200


def test_la_app_no_se_indexa(c):
    assert 'name="robots" content="noindex' in c.get("/").text


def test_cli_sube_la_carta(tmp_path, monkeypatch):
    from app import cli
    from app.db import Store

    db = tmp_path / "t.db"
    monkeypatch.setenv("LOPITA_DB", str(db))
    (tmp_path / "carta.pdf").write_bytes(PDF)
    (tmp_path / "foto.jpg").write_bytes(b"\xff\xd8")
    cli.main(["documento", "carta-cafeteria", str(tmp_path / "carta.pdf")])
    assert Store(str(db)).web_document("carta-cafeteria") == ("carta.pdf", "application/pdf", PDF)
    with pytest.raises(SystemExit):
        cli.main(["documento", "carta-cafeteria", str(tmp_path / "foto.jpg")])


def test_ip_del_visitante_tras_la_funcion_de_pages(tmp_path, monkeypatch):
    """Con el secreto, cada visitante cuenta aparte aunque todo llegue desde la función; sin él, la cabecera no vale."""
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_PROXY_SECRETO", "secreto-de-prueba")
    c = TestClient(create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8))
    proxy = {"X-Lopita-Proxy": "secreto-de-prueba"}
    for _ in range(5):
        assert c.post("/api/web/catering", json=catering(), headers={**proxy, "X-Lopita-IP": "1.1.1.1"}).status_code == 200
    assert c.post("/api/web/catering", json=catering(), headers={**proxy, "X-Lopita-IP": "1.1.1.1"}).status_code == 429
    assert c.post("/api/web/catering", json=catering(), headers={**proxy, "X-Lopita-IP": "2.2.2.2"}).status_code == 200
    # Sin el secreto bueno, X-Lopita-IP se ignora y cuenta la IP real de la conexión
    malo = {"X-Lopita-Proxy": "otro", "X-Lopita-IP": "3.3.3.3"}
    for _ in range(5):
        assert c.post("/api/web/catering", json=catering(), headers={**malo, "X-Lopita-IP": f"9.9.9.{_}"}).status_code == 200
    assert c.post("/api/web/catering", json=catering(), headers=malo).status_code == 429


def test_vista_previa_sin_rutas_absolutas_y_sin_indexar(tmp_path):
    import importlib.util
    from pathlib import Path
    ruta = Path(__file__).resolve().parent.parent / "herramientas" / "exportar_vista_previa.py"
    spec = importlib.util.spec_from_file_location("exportar_vista_previa", ruta)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    destino = tmp_path / "lopita"
    mod.exportar(destino)
    paginas = list(destino.rglob("index.html"))
    assert len(paginas) >= 5 and (destino / "fonts" / "fonts.css").exists()
    for p in paginas:
        html = p.read_text(encoding="utf-8")
        assert '<meta name="robots" content="noindex, nofollow">' in html
        assert "data-vista-previa" in html and "/api/web/" not in html
        assert 'href="/' not in html.replace('href="//', "") and 'src="/' not in html
    assert 'href="../"' in (destino / "catering" / "index.html").read_text(encoding="utf-8")
