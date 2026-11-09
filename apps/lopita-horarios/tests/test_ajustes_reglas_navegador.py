"""Ajustes en una columna (cuentas primero) y Reglas con las alertas plegadas y en casillas."""
import pytest

from tests.test_feedback_cliente_navegador import _entrar

pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_ajustes_una_columna_y_reglas_plegadas(url, browser, movil):  # noqa: F811
    ctx, page, errores = _entrar(browser, url, movil=movil)

    page.goto(f"{url}/#/ajustes")
    page.wait_for_selector(".ajustes-col")
    tarjetas = page.locator(".ajustes-col > .card")
    titulos = [tarjetas.nth(i).locator("h2").first.text_content() for i in range(tarjetas.count())]
    assert titulos[0] == "Cuentas de acceso"
    assert {"Negocio", "Slack", "Entrar con Google"} <= set(titulos)
    # Una sola columna: todas las tarjetas empiezan en el mismo borde izquierdo y ninguna comparte fila.
    izquierdas = {round(tarjetas.nth(i).bounding_box()["x"]) for i in range(tarjetas.count())}
    assert len(izquierdas) == 1

    page.goto(f"{url}/#/reglas")
    page.wait_for_selector("text=Descansos y jornada")
    alertas = page.locator("details.card", has=page.locator("h2", has_text="Alertas"))
    assert alertas.get_attribute("open") is None
    assert "activas" in alertas.locator("summary").inner_text()
    alertas.locator("summary").click()
    casillas = alertas.locator(".alertas-casillas input[type=checkbox]")
    assert casillas.count() >= 5
    total = casillas.count()
    primera = casillas.first
    estaba = primera.is_checked()
    primera.click()
    # Tras repintar sigue abierto y la casilla refleja el cambio.
    page.wait_for_function("document.querySelector('details.card[open] .alertas-casillas')")
    assert page.locator(".alertas-casillas input[type=checkbox]").first.is_checked() != estaba
    assert page.locator(".alertas-casillas input[type=checkbox]").count() == total
    page.click("[data-act=discard]")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert errores == []
    ctx.close()
