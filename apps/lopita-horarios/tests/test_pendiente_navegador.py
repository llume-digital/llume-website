"""Pendiente: la bandeja de lo que espera al encargado, cada cosa con su enlace al sitio exacto."""
import datetime as dt

import pytest

from tests.test_feedback_cliente_navegador import _entrar

pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_bandeja_pendiente(url, browser, movil):  # noqa: F811
    ctx, page, errores = _entrar(browser, url, movil=movil)
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + (91 if movil else 98))
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]

    page.goto(f"{url}/#/alertas")
    page.wait_for_selector(".pendiente-lista")
    fila = page.locator(".pendiente-fila", has=page.locator(f"a[href='#/horarios/{sid}']"))
    assert "sin publicar" in fila.inner_text()
    # Cada fila lleva un solo enlace y este abre el sitio exacto.
    assert all(page.locator(".pendiente-fila").nth(i).locator("a").count() == 1 for i in range(page.locator(".pendiente-fila").count()))
    fila.locator("a").click()
    page.wait_for_selector("[data-act=publish], .page-head h1")
    assert page.url.endswith(f"#/horarios/{sid}")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert errores == []
    ctx.close()
