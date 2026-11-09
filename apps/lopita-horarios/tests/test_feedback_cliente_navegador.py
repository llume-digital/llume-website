"""Recorrido en Chromium de las mejoras pedidas por el cliente: el calendario salta al primer día con horario,
la vista de día ordena por hora de entrada y tiene zoom, «Preparar pinchos» sale junto a abrir y cerrar, y los
textos de las solicitudes se pueden dictar.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.navegador import entrar as _entrar  # otros tests lo importan con este nombre

pytest.importorskip("playwright.sync_api")




def test_dia_sin_horario_orden_y_zoom(url, browser):  # noqa: F811
    ctx, page, errores = _entrar(browser, url)
    lunes = dt.date.today() - dt.timedelta(days=dt.date.today().weekday()) + dt.timedelta(days=21)
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]
    page.reload()
    page.wait_for_selector("[data-act=generate]")

    # Hoy no hay horario: «Día» abre el primer día que sí tiene, con un aviso.
    page.goto(f"{url}/#/calendario")
    page.wait_for_selector("[data-act=calModo][data-v=dia]")
    page.click("[data-act=calModo][data-v=dia]")
    page.wait_for_selector(".gantt")
    assert f"#/horarios/{sid}/dia/" in page.url  # el día va en la dirección
    assert page.input_value(".day-pick input") == lunes.isoformat()
    assert "No hay horario" in page.locator("#toast, .toast").first.inner_text()

    # Las filas van por hora de entrada: primero quien entra antes; sin turno, al final.
    filas = page.evaluate("""() => [...document.querySelectorAll('.gantt .g-row:not(.g-head):not(.g-cov)')].map((r) => {
        const b = r.querySelector('.g-bar b'); return b ? b.textContent.split('–')[0] : null; })""")
    con = [f for f in filas if f]
    assert con == sorted(con) and len(con) >= 2
    assert all(f is None for f in filas[len(con):])

    # Zoom: + ensancha el diagrama, el porcentaje vuelve al 100 % y se recuerda al volver.
    ancho = lambda: page.evaluate("document.querySelector('.gantt').scrollWidth")  # noqa: E731
    base = ancho()
    page.click(".zoom-ctl [data-d='1']")
    page.click(".zoom-ctl [data-d='1']")
    assert page.inner_text(".zoom-val").strip().startswith("200")
    assert ancho() > base * 1.5
    page.reload()
    page.goto(f"{url}/#/calendario")
    page.click("[data-act=calModo][data-v=dia]")
    page.wait_for_selector(".gantt")
    assert page.inner_text(".zoom-val").strip().startswith("200")
    page.click(".zoom-val")
    assert ancho() == base
    assert not errores, errores
    ctx.close()


def test_pinchos_junto_a_abrir_y_dictado(url, browser):  # noqa: F811
    ctx, page, errores = _entrar(browser, url, movil=True)
    page.on("dialog", lambda d: d.accept())
    # En el ejemplo ya existe «Preparar pinchos»: sale como interruptor junto a «Puede abrir».
    page.goto(f"{url}/#/equipo")
    page.wait_for_selector("[data-act-change=funcCheck]")
    check = page.locator("label.toggle", has_text="Preparar pinchos").first.locator("input")
    antes = check.is_checked()
    check.click()
    assert check.is_checked() != antes
    page.wait_for_selector("#savebar [data-act=save]")

    # Si se borra la función, el interruptor sigue ahí y, al marcarlo, la vuelve a crear.
    page.click("#savebar [data-act=discard]")
    page.goto(f"{url}/#/funciones")
    page.wait_for_selector(".func-grid")
    page.locator(".func-grid > .card", has=page.locator("input[value='Preparar pinchos']")).locator("[data-act=delFuncion]").click()
    assert page.locator(".func-grid input[value='Preparar pinchos']").count() == 0
    page.goto(f"{url}/#/equipo")
    check = page.locator("label.toggle", has_text="Preparar pinchos").first.locator("input")
    assert not check.is_checked()
    check.click()
    page.goto(f"{url}/#/funciones")
    page.wait_for_selector(".func-grid input[value='Preparar pinchos']")

    # Dictado: el botón aparece en el formulario de comentarios (Chromium tiene reconocimiento de voz).
    if page.evaluate("!!(window.SpeechRecognition || window.webkitSpeechRecognition)"):
        page.click("[data-act=feedback]")
        page.wait_for_selector("#fb-form [data-act=dictar]")
    assert not errores, errores
    ctx.close()
