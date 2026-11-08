"""Recorrido en Chromium de la suscripción al calendario: el encargado crea el enlace de una persona en Ajustes y
el trabajador ve en su Inicio los botones para añadirlo a Google Calendar o al iPhone, y puede cambiar el enlace.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import os

import pytest

from tests.navegador import confirmar
from tests.test_feedback_cliente_navegador import _entrar

pytest.importorskip("playwright.sync_api")


def test_suscribirse_al_calendario(url, browser):  # noqa: F811
    ctx, page, errores = _entrar(browser, url)
    page.on("dialog", lambda d: d.accept())
    page.goto(f"{url}/#/ajustes")
    page.wait_for_selector("text=Calendarios del equipo")
    page.click("[data-act=createTeamCal][data-id=bruno]")
    page.wait_for_selector("tr:has-text('Bruno') [data-act=copyCal]")
    r = ctx.request.post(f"{url}/api/usuarios", headers={"Origin": url}, data={
        "usuario": "ana.cal", "password": "temporal-123", "nombre": "Ana", "rol": "empleado", "empleado_id": "ana"})
    assert r.ok, r.text()

    w = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    p = w.new_page()
    p.on("pageerror", lambda e: errores.append(str(e)))
    p.on("dialog", lambda d: d.accept())
    o = {"Origin": url}
    assert w.request.post(f"{url}/api/login", headers=o, data={"usuario": "ana.cal", "password": "temporal-123"}).ok
    assert w.request.post(f"{url}/api/mi/clave", headers=o, data={"actual": "temporal-123", "nueva": "otra-clave-123"}).ok
    p.goto(f"{url}/#/inicio")
    p.wait_for_selector("#mi-calendario [data-act=createCal]")
    p.click("#mi-calendario [data-act=createCal]")
    google = p.locator("#mi-calendario a:has-text('Google Calendar')")
    google.wait_for()
    assert google.get_attribute("href").startswith("https://calendar.google.com/calendar/render?cid=webcal%3A%2F%2F")
    webcal = p.locator("#mi-calendario a:has-text('iPhone')").get_attribute("href")
    assert webcal.startswith("webcal://") and webcal.endswith(".ics")
    ics = w.request.get(webcal.replace("webcal://", "http://"))
    assert ics.ok and ics.text().startswith("BEGIN:VCALENDAR")
    if os.environ.get("LOPITA_CAPTURAS"):
        p.locator("#mi-calendario").screenshot(path=os.path.join(os.environ["LOPITA_CAPTURAS"], "calendario-trabajador.png"))
    p.click("#mi-calendario summary")
    p.click("[data-act=renewCal]")
    confirmar(p)
    p.wait_for_function(f"!document.querySelector('#mi-calendario a[href=\"{webcal}\"]')")
    assert w.request.get(webcal.replace("webcal://", "http://")).status == 404
    assert not errores
