"""Recorrido en Chromium: mover un turno arrastrándolo en el cuadrante (ratón) y con el menú «Mover» (también en
móvil), y que una libranza fija no admita turnos.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")


def abrir_semana(url, browser, movil):
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
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + (49 if movil else 42))
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]
    page.goto(f"{url}/#/horarios/{sid}")
    page.wait_for_selector("[data-act=setVista][data-v=semana]")
    page.click("[data-act=setVista][data-v=semana]")
    page.wait_for_load_state("networkidle")
    return ctx, page, errores, sid


def asignaciones(page, url, sid):
    h = page.request.get(f"{url}/api/horarios/{sid}").json()["horario"]
    return {(a["empleado_id"], a["fecha"]): (a["turno_id"], a["inicio"], a["fin"]) for a in h["asignaciones"]}


def pares_libres(page):
    """(origen, destino) de la misma persona: una casilla con turno y otra libre (no libranza ni ausencia)."""
    return page.evaluate("""() => {
      const out = [];
      document.querySelectorAll('tr').forEach((tr) => {
        const con = [...tr.querySelectorAll('[data-act=cell]')].filter((c) => c.querySelector('.pill'));
        const libres = [...tr.querySelectorAll('[data-act=cell]')].filter((c) => c.querySelector('.off') && c.querySelector('.off').textContent === 'libre');
        con.forEach((o) => libres.forEach((d) => out.push([[o.dataset.emp, o.dataset.date], [d.dataset.emp, d.dataset.date]])));
      });
      return out.slice(0, 40);
    }""")


def test_arrastrar_un_turno_con_el_raton(url, browser):  # noqa: F811
    ctx, page, errores, sid = abrir_semana(url, browser, movil=False)
    antes = asignaciones(page, url, sid)
    hecho = False
    for (oe, of), (de, df) in pares_libres(page):
        origen = page.locator(f'[data-act=cell][data-emp="{oe}"][data-date="{of}"]')
        destino = page.locator(f'[data-act=cell][data-emp="{de}"][data-date="{df}"]')
        page.wait_for_timeout(500)  # las alertas llegan después y vuelven a dibujar el cuadrante
        origen.scroll_into_view_if_needed()
        a, b = origen.bounding_box(), destino.bounding_box()
        vp = page.viewport_size
        if not (0 <= b["x"] and b["x"] + b["width"] <= vp["width"] and 0 <= b["y"] and b["y"] + b["height"] <= vp["height"]):
            continue  # el destino no se ve sin desplazar: solo se prueba lo que cabe en pantalla
        page.mouse.move(a["x"] + a["width"] / 2, a["y"] + a["height"] / 2)
        page.mouse.down()
        page.mouse.move(a["x"] + a["width"] / 2 + 20, a["y"] + a["height"] / 2 + 5, steps=4)
        page.mouse.move(b["x"] + b["width"] / 2, b["y"] + b["height"] / 2, steps=8)
        assert page.locator(".pill.fantasma").count() == 1
        assert page.locator(".cell.drop-ok, .cell.drop-no").count() == 1
        # El cuadrante puede moverse mientras se arrastra (llegan las alertas): vale la casilla que quedó marcada.
        bajo = page.evaluate("""() => { const c = document.querySelector('.cell.drop-ok, .cell.drop-no'); return [c.dataset.emp, c.dataset.date]; }""")
        page.mouse.up()
        page.wait_for_load_state("networkidle")
        assert page.locator(".popover").count() == 0  # soltar no abre el menú de la casilla de origen
        despues = asignaciones(page, url, sid)
        if despues != antes:
            assert despues[tuple(bajo)] == antes[(oe, of)]
            hecho = True
            break
        page.keyboard.press("Escape")
    assert hecho, "ningún destino libre admitió el turno"
    assert not errores, errores
    ctx.close()


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_mover_desde_el_menu_y_libranza_fija(url, browser, movil):  # noqa: F811
    ctx, page, errores, sid = abrir_semana(url, browser, movil)
    antes = asignaciones(page, url, sid)
    hecho = False
    # Se prueba con las casillas con turno que se ven; el destino se elige en el propio menú (da igual que se vea).
    visibles = page.evaluate("""() => [...document.querySelectorAll('[data-act=cell]')].filter((c) => c.querySelector('.pill'))
      .map((c) => [c.dataset.emp, c.dataset.date]).slice(0, 3)""")
    assert visibles
    for oe, of in visibles:
        n = None
        i = 0
        while not hecho and (n is None or i < n):
            page.wait_for_timeout(600)  # las alertas llegan después y vuelven a dibujar el cuadrante
            celda = page.locator(f'[data-act=cell][data-emp="{oe}"][data-date="{of}"]')
            celda.scroll_into_view_if_needed()
            celda.click()
            menu = page.locator(".popover")
            menu.locator(".mv-dia").wait_for()
            opciones = menu.locator(".mv-dia option").evaluate_all("els => els.map((e) => e.value)")
            n = len(opciones)
            if opciones[i] == of:
                i += 1
                page.keyboard.press("Escape")
                continue
            menu.locator(".mv-dia").select_option(opciones[i])
            menu.locator("[data-act=moveCell]").click()
            page.wait_for_load_state("networkidle")
            hecho = asignaciones(page, url, sid) != antes
            i += 1
        if hecho:
            break
    assert hecho
    # Una libranza fija no ofrece turnos.
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(600)
    libranza = page.locator("[data-act=cell].fixed-off").first
    if libranza.count() and libranza.is_visible():
        libranza.click()
        assert "Libranza fija" in page.locator(".popover").inner_text()
        assert page.locator(".popover [data-act=setCell]").count() == 0
    assert not errores, errores
    ctx.close()
