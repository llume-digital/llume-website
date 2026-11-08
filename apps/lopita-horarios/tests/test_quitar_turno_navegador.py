"""Recorrido en Chromium: quitar a una persona de un turno desde el cuadrante semanal (pregunta del cliente
«¿cómo se borra una persona de un turno?»). La opción tiene que verse en el menú de la casilla y dejar el día libre.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.test_vista_diaria_navegador import PW, browser, url  # noqa: F401  (fixtures)

pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_quitar_turno_desde_el_cuadrante(url, browser, movil):  # noqa: F811
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
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + (35 if movil else 28))
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]
    page.goto(f"{url}/#/horarios/{sid}")
    page.wait_for_selector("[data-act=setVista][data-v=semana]")
    page.click("[data-act=setVista][data-v=semana]")

    # Una casilla con turno: el menú ofrece «Quitar el turno».
    celda = page.locator('[data-act=cell]:has(.pill)').first
    celda.scroll_into_view_if_needed()
    emp, fecha = celda.get_attribute("data-emp"), celda.get_attribute("data-date")
    celda.click()
    quitar = page.locator('.popover [data-act=setCell][data-shift=""]')
    assert "Quitar el turno" in quitar.inner_text()
    quitar.click()

    # Queda libre, con candado (cambio manual) y guardado en el servidor.
    sel = f'[data-act=cell][data-emp="{emp}"][data-date="{fecha}"]'
    page.wait_for_selector(f"{sel} .off")
    assert page.locator(f"{sel} .lock").count() == 1
    h = page.request.get(f"{url}/api/horarios/{sid}").json()["horario"]
    assert not any(a["empleado_id"] == emp and a["fecha"] == fecha for a in h["asignaciones"])
    assert any(b["empleado_id"] == emp and b["fecha"] == fecha and not b["turno_id"] for b in h["bloqueos"])

    # Sin turno, el menú ya no ofrece quitarlo: dice que está libre. Se espera a que termine de repintar
    # (las alertas llegan después y vuelven a dibujar el cuadrante, y pueden cerrar el menú recién abierto).
    page.wait_for_load_state("networkidle")
    page.click(sel)
    assert page.locator('.popover [data-act=setCell][data-shift=""]').count() == 0
    assert "Libre" in page.locator(".popover button[disabled]").inner_text()
    assert not errores, errores
    ctx.close()
