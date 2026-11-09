"""La guía de uso en Chromium: cada sección lleva a su pantalla y cada pantalla enlaza a su sección."""
import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")


def test_guia_con_enlaces(url, browser):  # noqa: F811
    page = browser.new_context(viewport={"width": 1360, "height": 900}).new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("[data-act=generate]")

    page.click(".userbox [data-act=goGuia]")
    page.wait_for_selector(".guia-sec")
    assert page.locator("#guia-btn.active[aria-current=page]").count() == 1
    secciones = page.locator(".guia-sec").count()
    assert secciones >= 15
    # Todos los botones «Ir a…» llevan a una pestaña que existe.
    pestañas = {f"#/{k}" for k in ("horarios", "calendario", "alertas", "solicitudes", "informes", "equipo", "ausencias", "preferencias",
                                    "funciones", "turnos", "demanda", "reglas", "ajustes", "web", "comentarios", "novedades")}
    destinos = page.eval_on_selector_all(".guia-sec a.btn", "as => as.map(a => a.getAttribute('href'))")
    assert destinos and set(destinos) <= pestañas

    page.click("#guia-alertas a.btn")
    page.wait_for_selector("text=¿Cómo funciona esta pantalla?")
    assert page.url.endswith("#/alertas")
    page.click(".guia-link")
    page.wait_for_selector("#guia-alertas.flash")
    assert page.url.endswith("#/guia/alertas")
    assert page.evaluate("document.getElementById('guia-alertas').getBoundingClientRect().top < 300")
    assert errores == []
