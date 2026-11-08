"""Recorrido en Chromium de las bajas: marcar baja en Equipo, ver el aviso con los turnos perdidos y dar el alta.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.test_feedback_cliente_navegador import _entrar

pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_marcar_baja_avisa_de_los_turnos_y_dar_el_alta(url, browser, movil):  # noqa: F811
    ctx, page, errores = _entrar(browser, url, movil=movil)
    lunes = dt.date.today() - dt.timedelta(days=dt.date.today().weekday()) + dt.timedelta(days=7 if not movil else 21)
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]
    assert page.request.post(f"{url}/api/horarios/{sid}/publicar", headers={"Origin": url}).ok
    cfg = page.request.get(f"{url}/api/config").json()["config"]
    de_baja = {a["empleado_id"] for a in cfg["ausencias"] if a["motivo"] == "baja"}
    emp = next(a["empleado_id"] for a in r.json()["horario"]["asignaciones"] if a["empleado_id"] not in de_baja)
    nombre = next(e["nombre"] for e in cfg["empleados"] if e["id"] == emp)

    page.goto(f"{url}/#/equipo")
    page.wait_for_selector(f"[data-act=bajaDialog][data-emp='{emp}']")
    page.click(f"[data-act=bajaDialog][data-emp='{emp}']")
    page.fill("#baja-form input[name=desde]", lunes.isoformat())
    page.click("#baja-form button[type=submit]")

    # Aviso con los turnos que no va a hacer, del horario publicado, y acceso al arreglo.
    page.wait_for_selector(".notif.turnos_perdidos", timeout=60000)
    aviso = page.locator(".notif.turnos_perdidos")
    assert f"{nombre} está de baja" in aviso.inner_text()
    assert aviso.locator(".notif-turnos li").count() >= 1
    assert "publicado" in aviso.locator(".notif-turnos").inner_text()
    page.click("[data-act=readNotifications]")

    # La ficha dice que está de baja (sin fecha de alta) y se le da el alta.
    caja = page.locator(".baja-box.on", has=page.locator(f"[data-emp='{emp}']"))
    assert "sin fecha de alta" in caja.inner_text()
    caja.locator("[data-act=bajaAlta]").click()
    page.fill("#alta-form input[name=vuelve]", (lunes + dt.timedelta(days=3)).isoformat())
    page.click("#alta-form button[type=submit]")
    caja = page.locator(".baja-box.on", has=page.locator(f"[data-emp='{emp}']"))
    caja.filter(has_text="hasta el").wait_for()
    aus = page.request.get(f"{url}/api/config").json()["config"]["ausencias"]
    assert any(a["empleado_id"] == emp and a["motivo"] == "baja" and a["hasta"] == (lunes + dt.timedelta(days=2)).isoformat() for a in aus)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert not errores, errores
    ctx.close()
