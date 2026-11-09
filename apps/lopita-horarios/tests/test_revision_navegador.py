"""Recorrido en Chromium: al publicar un borrador que pisa días ya publicados, sale la revisión con las diferencias
y las ediciones a mano de lo publicado para conservarlas; al publicar, la edición conservada sigue ahí.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt
import os

import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")
CAPTURA = os.environ.get("LOPITA_CAPTURA_REVISION")  # para enseñar la ventana: ruta del .png


def test_revisar_y_conservar_al_publicar(url, browser):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 1360, "height": 900})
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("[data-act=generate]")
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + 42)
    rango = {"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()}
    cab = {"Origin": url}

    # Publicado, con una persona que libra a mano un día que trabajaba
    a = page.request.post(f"{url}/api/horarios/generar", headers=cab, data=rango).json()["id"]
    h = page.request.get(f"{url}/api/horarios/{a}").json()["horario"]
    x = h["asignaciones"][0]
    r = page.request.patch(f"{url}/api/horarios/{a}/celda", headers=cab,
                           data={"empleado_id": x["empleado_id"], "fecha": x["fecha"], "turno_id": None})
    assert r.ok, r.text()
    r = page.request.post(f"{url}/api/horarios/{a}/publicar", headers=cab, data={"confirmar_criticas": True})
    assert r.ok, r.text()

    # Un borrador nuevo para las mismas fechas no respeta esa edición
    b = page.request.post(f"{url}/api/horarios/generar", headers=cab, data=rango).json()["id"]
    page.goto(f"{url}/#/horarios/{b}")
    page.click("[data-act=publish]")
    page.wait_for_selector("text=Revisar antes de publicar")
    assert "Sustituye lo que el equipo ve ahora" in page.inner_text(".overlay")
    conservar = page.locator("[data-conservar]")
    assert conservar.count() == 1 and conservar.first.is_checked()
    assert page.locator(".revision-dia").count() >= 1
    page.screenshot(path=str(CAPTURA)) if CAPTURA else None
    page.click("#confirm-publish")
    alerta = page.locator("text=¿Publicar un horario que no vale?")
    try:
        alerta.wait_for(timeout=4000)
        page.check("[data-act-change=toggleConfirm]")
        page.click("#confirm-publish")
    except Exception:
        pass
    page.wait_for_selector("text=Horario publicado")
    h = page.request.get(f"{url}/api/horarios/{b}").json()["horario"]
    assert h["estado"] == "publicado"
    assert not any(y["empleado_id"] == x["empleado_id"] and y["fecha"] == x["fecha"] for y in h["asignaciones"])
    assert not errores, errores


def test_historial_comparar_y_restaurar(url, browser):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 1360, "height": 900})
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("[data-act=generate]")
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + 63)
    cab = {"Origin": url}
    rango = {"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()}
    a = page.request.post(f"{url}/api/horarios/generar", headers=cab, data=rango).json()["id"]
    assert page.request.post(f"{url}/api/horarios/{a}/publicar", headers=cab, data={"confirmar_criticas": True}).ok
    b = page.request.post(f"{url}/api/horarios/generar", headers=cab, data=rango).json()["id"]
    h = page.request.get(f"{url}/api/horarios/{b}").json()["horario"]
    x = h["asignaciones"][0]
    assert page.request.patch(f"{url}/api/horarios/{b}/celda", headers=cab,
                              data={"empleado_id": x["empleado_id"], "fecha": x["fecha"], "turno_id": None}).ok
    assert page.request.post(f"{url}/api/horarios/{b}/publicar", headers=cab, data={"confirmar_criticas": True}).ok

    page.goto(f"{url}/#/horarios/{b}")
    page.click("text=Historial")
    page.wait_for_selector(".historial-version")
    assert page.locator(".historial-version").count() == 2
    vieja = page.locator(f'.historial-version[data-version="{a}"]')
    assert "Sustituido" in vieja.inner_text()
    vieja.locator("[data-act=compararVersion]").click()
    page.wait_for_selector("text=frente a hoy")
    assert page.locator(".overlay .revision-dia").count() >= 1
    page.click(".overlay [data-act=restaurarVersion]")
    page.wait_for_selector("text=Restaurado de")
    nuevo = int(page.evaluate("location.hash").split("/")[2])
    assert page.request.get(f"{url}/api/horarios/{nuevo}").json()["estado"] == "borrador"
    assert not errores, errores
