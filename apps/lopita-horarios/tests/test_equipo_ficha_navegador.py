"""Equipo: una lista de la plantilla y, al tocar a alguien, su ficha en #/equipo/<id> (con botón atrás y enlace propio)."""
import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("ancho", [1360, 390], ids=["escritorio", "movil"])
def test_lista_y_ficha(url, browser, ancho):  # noqa: F811
    ctx = browser.new_context(viewport={"width": ancho, "height": 800})
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("[data-act=generate]")
    empleados = page.request.get(f"{url}/api/config").json()["config"]["empleados"]

    page.goto(f"{url}/#/equipo")
    page.wait_for_selector(".lista-equipo")
    # La lista es compacta: una fila por persona, sin formularios.
    assert page.locator("a.persona-fila").count() == len(empleados)
    assert page.locator(".title-input").count() == 0

    # Tocar una fila abre su ficha, con su propia dirección.
    page.locator("a.persona-fila").nth(1).click()
    page.wait_for_selector(".ficha")
    assert page.url.endswith(f"#/equipo/{empleados[1]['id']}")
    assert page.locator(".title-input").input_value() == empleados[1]["nombre"]
    assert page.locator(".title-input").count() == 1

    # Recargar conserva la ficha; «← Equipo» y el botón atrás vuelven a la lista.
    page.reload()
    page.wait_for_selector(".ficha")
    page.click("text=← Equipo")
    page.wait_for_selector(".lista-equipo")
    page.go_back()
    page.wait_for_selector(".ficha")

    # Una persona que no existe cae en la lista.
    page.goto(f"{url}/#/equipo/no-existe")
    page.wait_for_selector(".lista-equipo")

    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert errores == []
    ctx.close()
