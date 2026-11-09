"""La vista y el día de un horario van en la dirección: se pueden recargar, compartir y deshacer con «atrás»."""
import datetime as dt

import pytest

from tests.navegador import entrar

pytest.importorskip("playwright.sync_api")


def test_dia_y_vista_en_la_url(url, browser):  # noqa: F811
    ctx, page, errores = entrar(browser, url)
    lunes = dt.date.today() - dt.timedelta(days=dt.date.today().weekday()) + dt.timedelta(days=28)
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]
    martes = (lunes + dt.timedelta(days=1)).isoformat()

    # Un enlace directo al día abre la vista de día en esa fecha.
    page.goto(f"{url}/#/horarios/{sid}/dia/{martes}")
    page.wait_for_selector(".day-pick input")
    assert page.input_value(".day-pick input") == martes
    assert page.get_attribute("[data-act=setVista][data-v=dia]", "aria-pressed") == "true"

    # Recargar conserva la vista y el día.
    page.reload()
    page.wait_for_selector(".day-pick input")
    assert page.input_value(".day-pick input") == martes

    # Cambiar de vista añade una entrada de historial: «atrás» vuelve al día.
    page.click("[data-act=setVista][data-v=semana]")
    page.wait_for_selector("[data-act=setVista][data-v=semana][aria-pressed=true]")
    assert page.evaluate("location.hash") == f"#/horarios/{sid}"
    page.go_back()
    page.wait_for_selector(".day-pick input")
    assert page.evaluate("location.hash") == f"#/horarios/{sid}/dia/{martes}"

    # Avanzar un día cambia la dirección.
    page.click("[data-act=dayGo]:has-text('Siguiente'), [data-act=dayGo][aria-label*='iguiente']")
    page.wait_for_function("(m) => location.hash.endsWith('/dia/' + m)",
                           arg=(lunes + dt.timedelta(days=2)).isoformat())
    assert not errores
