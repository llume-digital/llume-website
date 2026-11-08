"""Recorrido en Chromium: poner a alguien una restricción horaria en Equipo, guardarla y que el generador la respete.

Necesita Playwright con Chromium (o la ruta de otro Chromium en LOPITA_CHROMIUM); si no está, se salta.
"""

import pytest

from tests.navegador import PW

sync_api = pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_restriccion_horaria_en_equipo(url, browser, movil):
    opciones = {"viewport": {"width": 390, "height": 844}, "has_touch": True, "is_mobile": True} if movil else \
        {"viewport": {"width": 1360, "height": 900}}
    ctx = browser.new_context(**opciones)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("[data-act=generate]")

    page.goto(f"{url}/#/equipo")
    page.wait_for_selector("[data-act=addFranja]")
    i = 1 if movil else 0  # una persona distinta en cada recorrido, para no pisarse
    page.click(f"[data-act=addFranja][data-i='{i}']")
    hasta = page.locator(f"input[data-bind='empleados.{i}.restricciones_horarias.0.hasta']")
    hasta.fill("16:00")
    hasta.dispatch_event("change")
    page.click(f"[data-act=toggleDay][data-path='empleados.{i}.restricciones_horarias.0.dias'][data-day=sabado]")
    page.wait_for_selector("text=Solo de 10:00 a 16:00 los sábados.")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.click("[data-act=save]")
    page.wait_for_function("!document.querySelector('[data-act=save]')")

    cfg = page.request.get(f"{url}/api/config").json()["config"]
    assert cfg["empleados"][i]["restricciones_horarias"] == [{"dias": ["sabado"], "desde": "10:00", "hasta": "16:00"}]

    # Quitarla deja la ficha como estaba.
    page.click(f"[data-act=delFranja][data-i='{i}'][data-j='0']")
    page.click("[data-act=save]")
    page.wait_for_function("!document.querySelector('[data-act=save]')")
    cfg = page.request.get(f"{url}/api/config").json()["config"]
    assert cfg["empleados"][i]["restricciones_horarias"] == []
    assert not errores
    ctx.close()
