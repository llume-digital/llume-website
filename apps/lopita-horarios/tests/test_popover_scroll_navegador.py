"""Recorrido en Chromium: el menú de un turno se puede desplazar hasta abajo sin que se cierre (petición del
cliente: «si haces click sobre un slot no deja deslizar hacia abajo para ver las que no se muestran y el pop-up
desaparece»). Se comprueba en el cuadrante semanal y en la vista del día, en móvil y en escritorio, con una
pantalla baja para que el menú no quepa entero.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")

MOVIL = {"viewport": {"width": 390, "height": 560}, "has_touch": True, "is_mobile": True}
ESCRITORIO = {"viewport": {"width": 1280, "height": 520}}


def _abrir_horario(page, url, semanas):
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("[data-act=generate]")
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + 7 * semanas)
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    page.goto(f"{url}/#/horarios/{r.json()['id']}")
    page.wait_for_load_state("networkidle")


def _comprobar_desplazable(page):
    """El menú cabe en la pantalla, se desplaza por dentro sin cerrarse y su última opción se puede pulsar."""
    pop = page.locator(".popover")
    assert pop.count() == 1
    caja = pop.bounding_box()
    alto = page.viewport_size["height"]
    assert caja["y"] >= 0 and caja["y"] + caja["height"] <= alto + 0.5, (caja, alto)  # no se sale de la pantalla
    assert pop.evaluate("el => el.scrollHeight > el.clientHeight"), "el menú debería necesitar desplazamiento"

    if page.evaluate("matchMedia('(pointer: coarse)').matches"):
        pop.evaluate("el => { el.scrollTop = el.scrollHeight; }")
    else:  # con la rueda del ratón o el trackpad, como en el escritorio del cliente
        y_pagina = page.evaluate("scrollY")
        page.mouse.move(caja["x"] + caja["width"] / 2, caja["y"] + caja["height"] / 2)
        for _ in range(6):
            page.mouse.wheel(0, 400)
            page.wait_for_timeout(60)
        assert page.evaluate("scrollY") == y_pagina, "la rueda sobre el menú no debe mover la página"
        assert pop.evaluate("el => el.scrollTop + el.clientHeight >= el.scrollHeight - 1"), "la rueda no baja el menú"
    page.wait_for_timeout(100)  # deja pasar el evento de scroll
    assert page.locator(".popover").count() == 1, "el menú se ha cerrado al desplazarlo"
    ultimo = page.locator(".popover button:not([disabled])").last
    ultimo_caja = ultimo.bounding_box()
    assert ultimo_caja["y"] + ultimo_caja["height"] <= caja["y"] + caja["height"] + 0.5  # ya se ve
    assert pop.evaluate("el => getComputedStyle(el).overscrollBehaviorY") == "contain"  # no arrastra la página

    if pop.get_attribute("data-hoja"):  # hoja inferior: pegada abajo, a todo el ancho, no a la casilla
        assert abs(caja["y"] + caja["height"] - alto) <= 1 and caja["width"] == page.viewport_size["width"]
        return
    _comprobar_anclado(page)


def _pegado_a_su_casilla(page):
    """El menú está a 4 px de su casilla, o lo más cerca que deja el borde de la pantalla."""
    return page.evaluate("""() => { const m = document.querySelector('.popover');
      const a = document.querySelector(m.dataset.ancla).getBoundingClientRect(), r = m.getBoundingClientRect();
      const top = m.dataset.lado === 'abajo' ? a.bottom + 4 : a.top - 4 - r.height;
      const esperado = Math.max(8, Math.min(top, innerHeight - 8 - r.height));
      return Math.abs(r.top - esperado) <= 1; }""")


def _comprobar_anclado(page):
    """Al desplazar la página o redibujar la vista, el menú sigue pegado a su casilla; si esta sale de la
    pantalla, se cierra."""
    assert _pegado_a_su_casilla(page)
    page.evaluate("window.scrollBy(0, 12)")
    page.wait_for_timeout(100)
    assert page.locator(".popover").count() == 1, "un desplazamiento pequeño de la página no debe cerrar el menú"
    assert _pegado_a_su_casilla(page)

    # La vista se vuelve a pintar por detrás (como al llegar las alertas o al volver a la pestaña).
    with page.expect_response(lambda r: r.url.endswith("/api/me")):
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_load_state("networkidle")
    assert page.locator(".popover").count() == 1, "redibujar la vista no debe cerrar el menú"
    assert _pegado_a_su_casilla(page)

    page.evaluate("window.scrollBy(0, 5000)")
    page.wait_for_timeout(100)
    assert page.locator(".popover").count() == 0, "si la casilla sale de la pantalla, el menú se cierra"


@pytest.mark.parametrize("opciones", [ESCRITORIO, MOVIL], ids=["escritorio", "movil"])
def test_menu_de_casilla_se_desplaza(url, browser, opciones):  # noqa: F811
    ctx = browser.new_context(**opciones)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    _abrir_horario(page, url, 42 if opciones is MOVIL else 41)
    page.click("[data-act=setVista][data-v=semana]")
    page.wait_for_load_state("networkidle")
    celda = page.locator('[data-act=cell]:has(.pill)').first
    celda.scroll_into_view_if_needed()
    celda.click()
    _comprobar_desplazable(page)
    assert not errores, errores
    ctx.close()


@pytest.mark.parametrize("opciones", [ESCRITORIO, MOVIL], ids=["escritorio", "movil"])
def test_menu_de_barra_se_desplaza(url, browser, opciones):  # noqa: F811
    ctx = browser.new_context(**opciones)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    _abrir_horario(page, url, 44 if opciones is MOVIL else 43)
    page.click("[data-act=setVista][data-v=dia]")
    page.wait_for_selector(".gantt")
    page.wait_for_load_state("networkidle")
    bar = page.locator(".g-bar").first
    bar.evaluate("el => el.scrollIntoView({ block: 'center', inline: 'nearest' })")
    bar.tap() if opciones is MOVIL else bar.click()
    page.wait_for_selector(".popover")
    if opciones is MOVIL:  # en táctil no se abre el teclado solo (al abrirse desplaza la página y cerraba el menú)
        assert page.evaluate("document.activeElement.tagName") != "INPUT"
    _comprobar_desplazable(page)

    # Un ajuste rápido rehace el menú; tiene que seguir donde estaba, no volver arriba.
    bar.tap() if opciones is MOVIL else bar.click()
    page.wait_for_selector(".popover")
    boton = page.locator(".popover .quick-adj button").last
    boton.evaluate("el => el.scrollIntoView({ block: 'end' })")
    antes = page.locator(".popover").evaluate("el => el.scrollTop")
    assert antes > 0
    boton.click()
    page.wait_for_selector(".popover")
    assert abs(page.locator(".popover").evaluate("el => el.scrollTop") - antes) <= 2
    assert not errores, errores
    ctx.close()


def test_menu_de_barra_no_se_cierra_al_cambiar_de_dia(url, browser):  # noqa: F811
    """El caso del móvil que se veía: cambiar una casilla, ir a ese día y tocar su barra. El menú se cerraba solo
    un instante después: la página se movía unos píxeles y cualquier desplazamiento lo cerraba."""
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    _abrir_horario(page, url, 45)
    page.click("[data-act=setVista][data-v=semana]")
    page.wait_for_load_state("networkidle")
    celda = page.locator('[data-act=cell]:has(.pill)').nth(3)
    emp, fecha = celda.get_attribute("data-emp"), celda.get_attribute("data-date")
    celda.scroll_into_view_if_needed()
    celda.click()  # se le cambia el turno desde el cuadrante, como haría el encargado antes de ir al día
    page.locator(".popover [data-act=setCell]").nth(1).click()
    page.wait_for_load_state("networkidle")
    page.click("[data-act=setVista][data-v=dia]")
    page.fill("input[data-act-change=dayPick]", fecha)
    page.dispatch_event("input[data-act-change=dayPick]", "change")
    barra = page.locator(f'.g-bar[data-emp="{emp}"]')
    barra.wait_for()
    barra.tap()
    page.wait_for_selector(".popover")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    assert page.locator(".popover").count() == 1, "el menú se ha cerrado solo"
    if not page.locator(".popover").get_attribute("data-hoja"):
        _comprobar_anclado(page)
    assert not errores, errores
    ctx.close()
