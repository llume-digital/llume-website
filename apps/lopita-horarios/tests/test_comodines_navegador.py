"""Recorrido en Chromium: añadir un comodín en Equipo, ponerle un máximo, guardar y verlo en el cuadrante.

Necesita Playwright con Chromium (o la ruta de otro Chromium en LOPITA_CHROMIUM); si no está, se salta.
"""
import datetime as dt
import os

import pytest

from tests.navegador import PW

sync_api = pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_anadir_comodin_y_verlo_en_el_horario(url, browser, movil):
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
    page.wait_for_selector("[data-act=addComodin]")
    antes = page.locator("[data-act-change=comodin]").count()
    page.click("[data-act=addComodin]")
    page.wait_for_function(f"document.querySelectorAll('[data-act-change=comodin]').length === {antes + 1}")
    nombre = page.locator(".title-input").last.input_value()
    assert nombre.startswith("X")
    assert page.locator("[data-act-change=comodin]").last.is_checked()
    tarjeta = page.locator(".card", has=page.locator(f'.title-input[value="{nombre}"]'))
    maximo = tarjeta.locator("input[data-bind$='horas_max_semana']")
    maximo.fill("12")
    maximo.dispatch_event("change")
    assert tarjeta.locator("input[data-bind$='horas_semanales']").count() == 0  # sin horas de contrato
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.click("[data-act=save]")
    page.wait_for_function("!document.querySelector('[data-act=save]')")

    cfg = page.request.get(f"{url}/api/config").json()["config"]
    x = next(e for e in cfg["empleados"] if e["nombre"] == nombre)
    assert x["comodin"] is True and x["horas_max_semana"] == 12 and x["horas_min_semana"] is None

    # Quitar «Comodín» a otra ficha y volver a ponerlo deja sus horas de contrato como estaban.
    primera = page.locator("[data-act-change=comodin]").first
    contrato = page.locator("input[data-bind='empleados.0.horas_semanales']").input_value()
    primera.check()
    page.wait_for_selector("input[data-bind='empleados.0.horas_max_semana']")
    primera.uncheck()
    page.wait_for_selector("input[data-bind='empleados.0.horas_semanales']")
    assert page.locator("input[data-bind='empleados.0.horas_semanales']").input_value() == contrato
    page.click("[data-act=discard]")

    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + (7 if movil else 0))
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    page.goto(f"{url}/#/horarios/{r.json()['id']}")
    page.wait_for_selector("td.emp")
    fila = page.locator("td.emp", has_text=nombre).first
    assert "Comodín · hasta 12 h/sem" in fila.inner_text()
    assert page.locator("tr", has_text=nombre).locator(".badge", has_text="Comodín").count() >= 1
    if os.environ.get("LOPITA_CAPTURAS"):
        page.goto(f"{url}/#/equipo")
        page.wait_for_selector("[data-act=addComodin]")
        page.locator(f'.title-input[value="{nombre}"]').evaluate("el => el.scrollIntoView({ block: 'start' })")
        page.evaluate("window.scrollBy(0, -140)")
        page.screenshot(path=os.path.join(os.environ["LOPITA_CAPTURAS"], f"equipo-{'movil' if movil else 'escritorio'}.png"))
    assert not errores, errores
    ctx.close()
