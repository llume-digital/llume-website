"""Errores de red y envíos repetidos: sin conexión la interfaz lo dice con claridad, y un doble clic no duplica nada."""
import pytest

from tests.navegador import entrar

pytest.importorskip("playwright.sync_api")


def test_sin_red_avisa_y_no_deja_la_pantalla_rota(url, browser):  # noqa: F811
    ctx, page, errores = entrar(browser, url)
    page.goto(f"{url}/#/horarios")
    page.wait_for_selector("[data-act=generate]")
    assert page.locator("#sin-red").is_hidden()
    ctx.set_offline(True)
    page.wait_for_selector("#sin-red", state="visible")
    page.click("[data-act=generate]")
    page.wait_for_selector(".toast.bad:has-text('Sin conexión')")
    ctx.set_offline(False)
    page.wait_for_selector("#sin-red", state="hidden")
    assert not [e for e in errores if "Failed to fetch" not in e]


def test_doble_envio_calcula_una_sola_vez(url, browser):  # noqa: F811
    ctx, page, _ = entrar(browser, url)
    cuerpo = {"desde": "2031-03-03", "hasta": "2031-03-09"}
    cabecera = {"Origin": url}
    antes = len(page.request.get(f"{url}/api/horarios").json())
    respuestas = page.evaluate(
        """async ([u, c]) => { const f = () => fetch(u + '/api/horarios/generar', {method: 'POST', credentials: 'same-origin',
            headers: {'Content-Type': 'application/json'}, body: JSON.stringify(c)}).then((r) => r.status);
           return Promise.all([f(), f()]); }""", [url, cuerpo])
    assert sorted(respuestas)[0] == 200
    despues = len(page.request.get(f"{url}/api/horarios", headers=cabecera).json())
    assert despues - antes == respuestas.count(200)
