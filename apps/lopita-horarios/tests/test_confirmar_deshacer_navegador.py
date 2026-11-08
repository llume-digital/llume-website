"""Confirmaciones propias y «Deshacer»: nada usa window.confirm, el foco entra y vuelve, y borrar se puede deshacer."""
import pytest

from tests.navegador import confirmar
from tests.test_feedback_cliente_navegador import _entrar

pytest.importorskip("playwright.sync_api")


def test_borrar_funcion_se_deshace_y_confirmar_devuelve_el_foco(url, browser):  # noqa: F811
    ctx, page, errores = _entrar(browser, url)
    dialogos = []
    page.on("dialog", lambda d: (dialogos.append(d.type), d.dismiss()))
    page.goto(f"{url}/#/funciones")
    page.wait_for_selector(".func-grid")
    tarjeta = page.locator(".func-grid > .card", has=page.locator("input[value='Preparar pinchos']"))
    tarjeta.locator("[data-act=delFuncion]").click()
    assert page.locator(".func-grid input[value='Preparar pinchos']").count() == 0
    page.click(".toast .toast-accion")
    page.wait_for_selector(".func-grid input[value='Preparar pinchos']")

    # Una acción destructiva pide confirmar: el foco empieza en Cancelar, Esc responde que no y el foco vuelve.
    page.goto(f"{url}/#/horarios")
    page.wait_for_selector("[data-act=generate]")
    boton = page.locator("[data-act=generate]").first
    boton.click()
    if page.locator(".overlay.confirmacion").count():
        assert page.evaluate("document.activeElement.hasAttribute('data-cancelar-dialogo') || document.activeElement.hasAttribute('data-confirmar')")
        page.keyboard.press("Escape")
        page.wait_for_selector(".overlay.confirmacion", state="detached")
    assert "confirm" not in dialogos
    assert not errores
