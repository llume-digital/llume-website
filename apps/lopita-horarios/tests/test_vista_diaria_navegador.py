"""Recorrido de la vista diaria en Chromium: arrastrar un turno, confirmar viendo las alertas y guardar.

Necesita Playwright con Chromium (`python -m playwright install chromium`, o la ruta de otro Chromium en
LOPITA_CHROMIUM); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.navegador import PW

sync_api = pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_arrastrar_confirmar_y_guardar(url, browser, movil):
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
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + (7 if movil else 0))
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]
    page.goto(f"{url}/#/horarios/{sid}")
    page.wait_for_selector("[data-act=setVista][data-v=dia]")
    page.click("[data-act=setVista][data-v=dia]")
    page.wait_for_selector(".gantt")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")  # sin scroll horizontal de página

    bar = page.locator(".g-bar").nth(1)
    bar.evaluate("el => el.scrollIntoView({ block: 'center', inline: 'nearest' })")
    emp = bar.get_attribute("data-emp")
    caja = bar.bounding_box()
    pista = page.locator(f'.g-track[data-emp="{emp}"]').bounding_box()
    horas = page.evaluate("Number(getComputedStyle(document.querySelector('.gantt')).getPropertyValue('--hours'))")
    x, y = max(caja["x"] + 40, 160), caja["y"] + caja["height"] / 2
    paso = pista["width"] / horas  # una hora en píxeles
    if movil:
        cdp = ctx.new_cdp_session(page)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
        for i in range(1, 9):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x + paso * i / 8, "y": y}]})
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    else:
        page.mouse.move(x, y)
        page.mouse.down()
        page.mouse.move(x + paso, y, steps=8)
        page.mouse.up()
    page.wait_for_selector(".day-pending")
    antes = r.json()["horario"]["asignaciones"]
    page.click("[data-act=dayConfirm]")
    page.wait_for_selector("[data-act=dayApply]:not([data-publicar])", timeout=60000)
    assert "revisar los cambios" in page.inner_text(".overlay").lower()
    page.click("[data-act=dayApply]:not([data-publicar])")
    page.wait_for_selector(".toast")
    assert page.locator(".day-pending").count() == 0

    det = page.request.get(f"{url}/api/horarios/{sid}").json()
    dia = det["horario"]["desde"]
    previa = next(a for a in antes if a["empleado_id"] == emp and a["fecha"] == dia)
    nueva = next(a for a in det["horario"]["asignaciones"] if a["empleado_id"] == emp and a["fecha"] == dia)
    assert nueva != previa  # se ha movido una hora
    assert any(b["empleado_id"] == emp and b["fecha"] == dia for b in det["horario"]["bloqueos"])
    assert errores == []
    ctx.close()
