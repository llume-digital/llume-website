"""Cuadrante en el móvil: la columna de nombres es estrecha y deja ver unos tres días."""
import datetime as dt

import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")


def test_cuadrante_estrecho_en_movil(url, browser):  # noqa: F811
    ctx = browser.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("[data-act=generate]")
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + 70)
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    page.goto(f"{url}/#/horarios/{r.json()['id']}")
    page.wait_for_selector("table.sched td.emp")

    if __import__('os').environ.get('LOPITA_CAPTURAS'):
        page.locator('.sched-wrap').first.screenshot(path=__import__('os').path.join(__import__('os').environ['LOPITA_CAPTURAS'], 'cuadrante-movil.png'))
    emp = page.locator("table.sched td.emp").first
    assert emp.bounding_box()["width"] <= 100
    assert not emp.locator("small").first.is_visible()
    # Con la columna estrecha caben dos días enteros y el tercero asoma.
    visibles = page.evaluate("""() => {
      const t = document.querySelector('table.sched'), w = t.closest('.sched-wrap').getBoundingClientRect();
      const emp = t.querySelector('th.emp').getBoundingClientRect();
      return [...t.querySelectorAll('thead th')].filter(th => !th.classList.contains('emp') && !th.classList.contains('tot'))
        .filter(th => { const b = th.getBoundingClientRect(); return b.left >= emp.right - 1 && b.right <= w.right + 1; }).length;
    }""")
    assert visibles >= 2  # y el tercero asoma, para que se vea que se puede deslizar
    # Ninguna casilla se sale de su columna.
    assert page.evaluate("[...document.querySelectorAll('table.sched td:not(.emp):not(.tot)')].every(td => td.scrollWidth <= td.clientWidth + 1)")
    assert errores == []
    ctx.close()
