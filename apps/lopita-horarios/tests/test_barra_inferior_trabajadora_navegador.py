"""La trabajadora, en el móvil, tiene sus cuatro secciones en una barra inferior fija y el contenido no queda tapado."""
import os

import pytest

from tests.navegador import MOVIL
from tests.test_pantallas_navegador import CLAVE_TRABAJADOR, datos  # noqa: F401

pytest.importorskip("playwright.sync_api")


def test_barra_inferior_de_la_trabajadora(datos, browser):  # noqa: F811
    ctx = browser.new_context(**MOVIL)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(datos["url"])
    page.fill("input[name=usuario]", "trabajadora")
    page.fill("input[name=password]", CLAVE_TRABAJADOR)
    page.click("button[type=submit]")
    page.wait_for_selector("#tabs a")
    alto = page.viewport_size["height"]
    barra = page.locator(".tabsbar").bounding_box()
    assert abs(barra["y"] + barra["height"] - alto) <= 1, "la barra de secciones debe quedar pegada abajo"
    enlaces = page.locator("#tabs a")
    assert enlaces.count() == 4
    assert all(enlaces.nth(i).bounding_box()["height"] >= 44 for i in range(4))
    # Al bajar del todo, el final del contenido queda por encima de la barra.
    page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    fin = page.evaluate("document.querySelector('#view').lastElementChild.getBoundingClientRect().bottom")
    assert fin <= barra["y"] + 1
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    if os.environ.get("LOPITA_CAPTURAS"):
        page.screenshot(path=os.path.join(os.environ["LOPITA_CAPTURAS"], "trabajadora-barra-inferior.png"))
    # El encargado no cambia: su barra sigue arriba.
    assert not errores
    ctx.close()
