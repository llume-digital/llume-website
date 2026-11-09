"""Recorrido en Chromium del calendario por persona (petición del cliente: «vista de horario no por fecha sino por
trabajador; al hacer click en un trabajador, una vista de ese trabajador con sus horarios en detalle»).

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_calendario_por_persona(url, browser, movil):  # noqa: F811
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
    # Una semana propia de cada variante, lejos de las de otros tests del módulo.
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + (63 if movil else 56))
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]
    h = page.request.get(f"{url}/api/horarios/{sid}").json()["horario"]
    asig = h["asignaciones"][0]
    emp, fecha = asig["empleado_id"], asig["fecha"]
    suyos = [a for a in h["asignaciones"] if a["empleado_id"] == emp]

    # Desde el cuadrante del horario, el nombre de la persona lleva a su vista, en la semana de ese horario.
    page.goto(f"{url}/#/horarios/{sid}")
    page.wait_for_selector("[data-act=setVista][data-v=semana]")
    page.click("[data-act=setVista][data-v=semana]")
    page.click(f'a.emp-link[href^="#/calendario/persona/{emp}/"]')
    page.wait_for_selector(".persona-dias .pd-row.pd-turno")
    assert f"#/calendario/persona/{emp}/" in page.url
    assert page.locator(".pd-row.pd-turno").count() == len(suyos)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    # Las horas previstas cuadran con las del servidor (turnos a medida incluidos).
    turnos = {t["id"]: t for t in page.request.get(f"{url}/api/config").json()["config"]["turnos"]}

    def minutos(a):
        t = turnos[a["turno_id"]]
        ini, fin = a.get("inicio") or t["inicio"], a.get("fin") or t["fin"]
        return (int(fin[:2]) * 60 + int(fin[3:])) - (int(ini[:2]) * 60 + int(ini[3:]))

    horas = sum(minutos(a) for a in suyos) / 60
    previstas = page.locator(".stats .stat").first.locator("b").inner_text()
    assert previstas == f"{round(horas, 1):g} h".replace(".", ","), previstas
    # El contrato llega del informe de horas.
    page.wait_for_function("!document.querySelector('.stats').innerText.includes('…')")

    # «Todo el equipo» vuelve a la vista por persona: una tarjeta por persona en plantilla.
    page.click("[data-act=calVolverPersonas]")
    page.wait_for_selector("a.persona-card")
    activos = [e for e in page.request.get(f"{url}/api/config").json()["config"]["empleados"] if e["activo"]]
    assert page.locator("a.persona-card").count() >= len(activos)
    assert page.locator(".tira i.tira-turno").count() == len(h["asignaciones"])
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

    # El mes también se puede ver por persona.
    page.click("[data-act=calModo][data-v=mes]")
    page.wait_for_selector(".tira.mes")
    page.click("[data-act=calModo][data-v=semana]")

    # Tocar la tarjeta abre a la persona; tocar un día con turno lo abre en la vista de día de su horario.
    page.click(f'a.persona-card[href="#/calendario/persona/{emp}"]')
    page.wait_for_selector(".pd-row.pd-turno")
    page.click(f'.pd-row[data-date="{fecha}"]')
    page.wait_for_selector(".gantt")
    assert f"#/horarios/{sid}/dia/" in page.url  # el día va en la dirección

    # Desde el calendario por fecha, el nombre de la fila también lleva a la persona.
    page.goto(f"{url}/#/calendario/persona/{emp}/{lunes.isoformat()}")
    page.wait_for_selector(".pd-row.pd-turno")
    page.click("[data-act=calVolverPersonas]")
    page.click("[data-act=calAgrupar][data-v=fecha]")
    page.wait_for_selector("table.sched a.emp-link")
    page.click(f'table.sched a.emp-link[href="#/calendario/persona/{emp}"]')
    page.wait_for_selector(".pd-row.pd-turno")

    # Cambiar de persona con el selector.
    otro = next(e["id"] for e in activos if e["id"] != emp)
    page.select_option("[data-act-change=calIrPersona]", otro)
    page.wait_for_function(f"location.hash === '#/calendario/persona/{otro}'")
    page.wait_for_selector(".persona-dias")
    assert not errores, errores
    ctx.close()
