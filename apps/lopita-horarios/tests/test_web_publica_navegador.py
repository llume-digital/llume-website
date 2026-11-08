"""Recorrido en Chromium: la web pública manda una candidatura y un catering, y el encargado los ve en la pestaña Web.

Necesita Playwright con Chromium (o la ruta de otro Chromium en LOPITA_CHROMIUM); si no está, se salta.
"""
import socket
import sys
import threading
import time
from pathlib import Path

import pytest

sync_api = pytest.importorskip("playwright.sync_api")
uvicorn = pytest.importorskip("uvicorn")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "herramientas"))
from servir_web import WebYApp  # noqa: E402

from tests.navegador import PW  # noqa: E402


def _servir(asgi):
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(asgi, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    return server, f"http://127.0.0.1:{port}"


@pytest.fixture(scope="module")
def urls(tmp_path_factory):
    from app.main import create_app
    from app.slack import Slack

    app = create_app(str(tmp_path_factory.mktemp("db") / "t.db"), slack=Slack(token="", channel="#h"),
                     secret="test", solve_seconds=8)
    app.state.store.upsert_user("admin", PW, "Administrador")
    web, url_web = _servir(WebYApp(app))
    intranet, url_app = _servir(app)
    yield url_web, url_app
    web.should_exit = intranet.should_exit = True


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_formularios_de_la_web_llegan_al_encargado(urls, browser, movil, tmp_path):
    url_web, url_app = urls
    opciones = {"viewport": {"width": 390, "height": 844}, "has_touch": True, "is_mobile": True} if movil else \
        {"viewport": {"width": 1360, "height": 900}}
    ctx = browser.new_context(**opciones)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))

    # Las páginas de la web existen con las mismas direcciones que lopita.es
    for ruta, titulo in [("/conocenos/", "Conócenos"), ("/catering/", "Catering"), ("/aviso-legal/", "Aviso Legal"),
                         ("/politica-de-privacidad/", "Política de Privacidad")]:
        assert page.goto(url_web + ruta).status == 200
        assert titulo in page.title()

    # Candidatura con CV desde la portada
    page.goto(url_web + "/")
    if movil:
        page.click(".abrir-menu")
        assert page.is_visible(".menu a[href='/conocenos/']")
    cv = tmp_path / "cv.pdf"
    cv.write_bytes(b"%PDF-1.4\n%cv de prueba\n")
    f = page.locator("form[data-formulario='candidatura']")
    f.locator("[name=nombre]").fill("Lucía Pérez")
    f.locator("[name=email]").fill("lucia@example.com")
    f.locator("[name=cv]").set_input_files(str(cv))
    f.locator("[type=submit]").click()
    assert f.locator(".estado").inner_text() == ""  # sin aceptar la privacidad, el navegador no deja enviar
    f.locator("[name=acepto_privacidad]").check()
    f.locator("[type=submit]").click()
    page.wait_for_function("document.querySelector(\"form[data-formulario='candidatura'] .estado\").textContent.includes('Gracias')")

    # Catering desde su página
    page.goto(url_web + "/catering/")
    f = page.locator("form[data-formulario='catering']")
    f.locator("[name=nombre]").fill("Marcos")
    f.locator("[name=email]").fill("marcos@example.com")
    f.locator("[name=personas]").fill("40")
    f.locator("[name=mensaje]").fill("Preboda en diciembre")
    f.locator("[name=acepto_privacidad]").check()
    f.locator("[type=submit]").click()
    page.wait_for_function("document.querySelector(\"form[data-formulario='catering'] .estado\").textContent.includes('Gracias')")

    # El encargado los ve en la app, pestaña Web, y descarga el CV
    page.goto(url_app + "/")
    page.fill("#login-form [name=usuario]", "admin")
    page.fill("#login-form [name=password]", PW)
    page.click("#login-form [type=submit]")
    page.wait_for_selector("#tabs a[href='#/web']")
    page.goto(url_app + "/#/web")
    page.wait_for_selector("text=Marcos")
    assert page.is_visible("text=Lucía Pérez") and page.is_visible("text=Preboda en diciembre")
    with page.expect_download() as d:
        page.click("a:has-text('Descargar CV')")
    assert d.value.suggested_filename == "cv.pdf"
    page.locator(".card", has_text="Marcos").locator("[data-act=webEstado]").click()
    page.wait_for_function("!document.querySelector('#view').textContent.includes('Marcos')")  # sale de «Nuevos»

    assert not errores, errores
    ctx.close()
