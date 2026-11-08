"""Pestaña Novedades: las últimas mejoras con su fecha y un contador de las que aún no se han visto.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import pytest

from tests.test_vista_diaria_navegador import PW, browser, url  # noqa: F401  (fixtures)

pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("ancho", [1360, 390], ids=["escritorio", "movil"])
def test_novedades(url, browser, ancho):  # noqa: F811
    ctx = browser.new_context(viewport={"width": ancho, "height": 800})
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    tab = "nav.tabs a[href='#/novedades']"
    page.wait_for_selector(tab)

    # La primera vez todas cuentan como nuevas.
    total = int(page.locator(f"{tab} .tab-count").inner_text())
    assert 4 <= total <= 6

    page.click(tab)
    page.wait_for_selector("article.novedad")
    assert page.locator("article.novedad").count() == total
    assert page.locator("article.novedad .badge", has_text="Nuevo").count() == total
    # Cada una con su fecha legible, de la más nueva a la más antigua.
    fechas = page.eval_on_selector_all("article.novedad time", "ts => ts.map(t => t.getAttribute('datetime'))")
    assert fechas == sorted(fechas, reverse=True)
    assert "noviembre de 2026" in page.locator("article.novedad time").first.inner_text()
    # Al abrirla, el contador desaparece y no vuelve tras recargar.
    assert page.locator(f"{tab} .tab-count").count() == 0
    page.reload()
    page.wait_for_selector("article.novedad")
    assert page.locator(f"{tab} .tab-count").count() == 0
    assert page.locator("article.novedad .badge", has_text="Nuevo").count() == 0

    # Cada novedad lleva a su pantalla.
    page.locator("article.novedad a.btn").first.click()
    page.wait_for_selector("nav.tabs a.active[href='#/horarios']")

    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert errores == []
    ctx.close()
