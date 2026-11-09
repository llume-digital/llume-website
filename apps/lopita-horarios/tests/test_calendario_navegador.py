"""Recorrido en Chromium del calendario (semana y mes), los ajustes rápidos de un turno, las funciones y los comentarios.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_calendario_ajustes_funciones_y_comentarios(url, browser, movil):  # noqa: F811
    opciones = {"viewport": {"width": 390, "height": 844}, "has_touch": True, "is_mobile": True} if movil else \
        {"viewport": {"width": 1360, "height": 900}}
    ctx = browser.new_context(**opciones)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.on("dialog", lambda d: d.accept("Hacer caja") if d.type == "prompt" else d.accept())
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("[data-act=generate]")
    lunes = dt.date.today() - dt.timedelta(days=dt.date.today().weekday()) + dt.timedelta(days=28 if movil else 0)
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]

    # Calendario: semana con el horario y mes con su rejilla; sin scroll horizontal de página.
    page.goto(f"{url}/#/calendario")
    if movil:
        page.click("[data-act=calMover][data-dir='1']")
        for _ in range(3):
            page.click("[data-act=calMover][data-dir='1']")
    page.wait_for_selector("table.sched .cell")
    page.click("[data-act=calModo][data-v=mes]")
    page.wait_for_selector(".mgrid .mday")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

    # Tocar un día del mes abre su vista de día en el horario, y un ajuste rápido alarga el turno 1 h.
    # El día del calendario al que se ha llegado (hoy, o 4 semanas después en el móvil): está en la semana generada y,
    # a diferencia del lunes, siempre cae en el mes que se enseña (el lunes puede ser del mes anterior).
    dia = dt.date.today() + dt.timedelta(days=28 if movil else 0)
    page.click(f".mday[data-date='{dia.isoformat()}']")
    page.wait_for_selector(".gantt")
    assert f"#/horarios/{sid}/dia/" in page.url  # el día va en la dirección
    page.wait_for_load_state("networkidle")
    bar = page.locator(".g-bar").first
    bar.evaluate("el => el.scrollIntoView({ block: 'center', inline: 'center' })")
    emp = bar.get_attribute("data-emp")
    # La vista del día puede volver a pintarse justo después de cargar (llegan las alertas del horario) y el foco
    # se queda en un elemento que ya no está; se vuelve a buscar la barra de esa persona y se reintenta.
    abierto = False
    for _ in range(3):
        barra = page.locator(f'.g-bar[data-emp="{emp}"]').first
        barra.focus()
        page.keyboard.press("Enter")
        try:
            page.wait_for_selector(".bar-menu", timeout=4000)
            abierto = True
            break
        except Exception:
            continue
    if not abierto:
        diag = page.evaluate("""() => ({ activo: document.activeElement && document.activeElement.outerHTML.slice(0, 300),
            overlay: !!document.querySelector('.overlay'), overlayTxt: (document.querySelector('.overlay') || {}).innerText,
            popovers: document.querySelectorAll('.popover').length, toast: (document.querySelector('.toast') || {}).innerText,
            hash: location.hash, barras: document.querySelectorAll('.g-bar').length })""")
        raise AssertionError(f"No se abrió el menú del turno. Estado: {diag}. Errores: {errores}")
    antes = page.locator(f'.g-bar[data-emp="{emp}"] .g-txt b').inner_text()
    page.click(".bar-menu [data-act=barAdj][data-k=fin][data-dm='60']")
    page.wait_for_selector(".day-pending")
    despues = page.locator(f'.g-bar[data-emp="{emp}"] .g-txt b').inner_text()
    fin = lambda t: int(t.split("–")[1][:2]) * 60 + int(t.split("–")[1][3:5])  # noqa: E731
    assert fin(despues) == fin(antes) + 60
    page.click("[data-act=dayDiscard]")

    # Funciones: crear una con una regla y dársela a alguien.
    page.goto(f"{url}/#/funciones")
    page.click("[data-act=addFuncion]")
    page.wait_for_selector("[data-act=addReglaFuncion]")
    nueva = page.locator(".func-grid > .card").last  # la que se acaba de crear
    nueva.locator("[data-act=addReglaFuncion]").click()
    page.locator(".func-grid > .card").last.locator("[data-act=toggleFuncion]").first.click()
    page.click("[data-act=save]")
    page.wait_for_function("!document.querySelector('.savebar')")
    cfg = page.request.get(f"{url}/api/config").json()["config"]
    caja = next(f for f in cfg["funciones"] if f["nombre"] == "Hacer caja")
    assert caja["reglas"] and any(caja["id"] in e.get("funciones", []) for e in cfg["empleados"])

    # Comentarios: se envían desde la cabecera y salen en su pestaña.
    page.click("[data-act=feedback]")
    page.fill("#fb-form textarea", "Me gustaría ver las horas en el mes")
    page.click("#fb-form button[type=submit]")
    page.wait_for_selector(".toast")
    page.goto(f"{url}/#/comentarios")
    page.wait_for_selector(".fb-card")
    assert "Me gustaría ver las horas en el mes" in page.inner_text("#view")
    assert errores == []
    ctx.close()
