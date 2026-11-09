"""Cabecera en dos barras: arriba la marca y la cuenta (Guía, Comentarios, Mi cuenta, Salir); debajo, las secciones.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("ancho", [1360, 390], ids=["escritorio", "movil"])
def test_secciones_en_segunda_barra(url, browser, ancho):  # noqa: F811
    ctx = browser.new_context(viewport={"width": ancho, "height": 800})
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("nav.tabs a[href='#/horarios']")

    caja = lambda sel: page.locator(sel).bounding_box()  # noqa: E731
    marca, cuenta, secciones = caja(".wordmark"), caja(".userbox"), caja(".tabsbar")
    # Marca y cuenta comparten la primera barra; las secciones van enteras debajo, a todo el ancho.
    assert abs((marca["y"] + marca["height"] / 2) - (cuenta["y"] + cuenta["height"] / 2)) < 4
    assert secciones["y"] >= max(marca["y"] + marca["height"], cuenta["y"] + cuenta["height"])
    assert secciones["width"] == pytest.approx(ancho, abs=1)
    assert page.locator(".topbar-inner nav.tabs").count() == 0

    # Las secciones son solo pantallas de trabajo: la guía y la cuenta están en la primera barra.
    hrefs = page.eval_on_selector_all("#tabs a", "as => as.map(a => a.getAttribute('href'))")
    # Cinco secciones (Horario, Pendiente, Equipo, Informes, Configuración); cada una lleva a su primera pantalla.
    assert hrefs == ["#/horarios", "#/alertas", "#/equipo", "#/informes", "#/funciones"]
    assert "#/guia" not in hrefs
    assert page.locator(".userbox [data-act=goGuia]").count() == 1
    assert page.locator("#tabs a.active[aria-current=page]").get_attribute("href") == "#/horarios"

    # Dentro de la sección, las pantallas van en una segunda fila.
    assert page.eval_on_selector_all("#subtabs a", "as => as.map(a => a.getAttribute('href'))") == ["#/horarios", "#/calendario"]

    # Navegar marca la sección; la guía marca su botón de la barra de cuenta.
    page.click("nav.tabs a[href='#/calendario']")
    page.wait_for_selector("nav.tabs a.active[href='#/calendario']")
    page.click(".userbox [data-act=goGuia]")
    page.wait_for_selector("#guia-btn.active")
    assert page.locator("nav.tabs a.active").count() == 0

    # Nada se sale de la pantalla por los lados (en móvil las secciones se desplazan dentro de su barra).
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert page.evaluate("[...document.querySelectorAll('.topbar-inner > *')]"
                         ".every(e => e.getBoundingClientRect().right <= window.innerWidth + 1)")
    assert errores == []
    ctx.close()
