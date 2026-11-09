"""Recorrido en Chromium: roles de camarero (petición del cliente: «caja, cafetera, sala, lava; hay personas que pueden
y que no pueden; en caja tiene que haber al menos uno en ciertos horarios»).

Funciones → «Roles de camarero» → quién puede hacer caja y una regla → guardar → el horario enseña el rol de cada
turno → se cambia desde el menú de la casilla y desde la vista del día.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.navegador import PW

pytest.importorskip("playwright.sync_api")


def entrar(page, url):  # noqa: F811
    page.goto(url)
    page.fill("input[name=usuario]", "admin")
    page.fill("input[name=password]", PW)
    page.click("button[type=submit]")
    page.wait_for_selector("[data-act=generate]")


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_roles_de_camarero(url, browser, movil):  # noqa: F811
    opciones = {"viewport": {"width": 390, "height": 844}, "has_touch": True, "is_mobile": True} if movil else \
        {"viewport": {"width": 1360, "height": 900}}
    ctx = browser.new_context(**opciones)
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    entrar(page, url)

    # Funciones: crear los cuatro roles de camarero (solo la primera vez; los dos recorridos comparten la base).
    page.goto(f"{url}/#/funciones")
    page.wait_for_selector("h2:has-text('Roles de camarero')")
    if page.locator("[data-act=addRolesCamarero]").count():
        page.click("[data-act=addRolesCamarero]")
    tarjetas = page.locator(".func-grid .card")
    nombres = [tarjetas.nth(i).locator(".title-input").input_value() for i in range(tarjetas.count())]
    assert {"Caja", "Cafetera", "Sala", "Lava"} <= set(nombres)
    caja = page.locator(".card:has(.title-input[value=Caja])")
    assert caja.locator("select").input_value() == "sala"  # clase: rol de camarero/a

    # Quién puede hacer caja: todos los camareros menos Irene; y una regla de 9:00 a 21:00 con al menos uno.
    for k in range(caja.locator("[data-act=toggleFuncion]").count()):
        chip = caja.locator("[data-act=toggleFuncion]").nth(k)
        quiere = chip.inner_text() != "Irene"
        if (chip.get_attribute("aria-pressed") == "true") != quiere:
            chip.click()
    if not caja.locator(".regla-funcion").count():
        caja.locator("[data-act=addReglaFuncion]").click()
    assert caja.locator(".regla-funcion input[placeholder='Sin máximo']").count() == 1
    assert "al menos 1 persona" in caja.inner_text()
    # Los demás roles, para todos los camareros.
    for nombre in ("Cafetera", "Sala", "Lava"):
        sin = page.locator(f".card:has(.title-input[value={nombre}]) [data-act=toggleFuncion][aria-pressed=false]")
        while sin.count():
            sin.first.click()
    if page.locator("[data-act=save]").count():  # en el segundo recorrido ya está todo guardado
        with page.expect_response(lambda r: r.url.endswith("/api/config") and r.request.method == "PUT") as resp:
            page.click("[data-act=save]")
        assert resp.value.ok, resp.value.text()
    cfg = page.request.get(f"{url}/api/config").json()["config"]
    roles = {f["nombre"]: f for f in cfg["funciones"] if f.get("puesto") == "sala"}
    assert roles["Caja"]["reglas"][0]["personas"] == 1
    assert roles["Caja"]["id"] not in next(e for e in cfg["empleados"] if e["nombre"] == "Irene")["funciones"]

    # Equipo: la ficha dice qué roles puede hacer y cuál hace normalmente.
    page.goto(f"{url}/#/equipo/{cfg['empleados'][0]['id']}")
    page.wait_for_selector("text=Como camarero/a puede hacer")

    # Horario: cada turno lleva su rol.
    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + (63 if movil else 56))
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]
    asign = r.json()["horario"]["asignaciones"]
    assert asign and all(a["funcion"] for a in asign)
    page.goto(f"{url}/#/horarios/{sid}")
    page.wait_for_selector("[data-act=setVista][data-v=semana]")
    page.click("[data-act=setVista][data-v=semana]")
    page.wait_for_selector("[data-act=cell] .rol-tag")
    page.wait_for_load_state("networkidle")

    # Menú de la casilla: cambiar a «Lava».
    a = next(x for x in asign if x["funcion"] != roles["Lava"]["id"])
    sel = f'[data-act=cell][data-emp="{a["empleado_id"]}"][data-date="{a["fecha"]}"]'
    page.locator(sel).scroll_into_view_if_needed()
    page.click(sel)
    page.click(f'.popover [data-act=setCell][data-funcion="{roles["Lava"]["id"]}"]')
    page.wait_for_selector(f"{sel} .rol-tag:has-text('Lava')")
    h = page.request.get(f"{url}/api/horarios/{sid}").json()["horario"]
    nueva = next(x for x in h["asignaciones"] if x["empleado_id"] == a["empleado_id"] and x["fecha"] == a["fecha"])
    assert nueva["funcion"] == roles["Lava"]["id"] and nueva["turno_id"] == a["turno_id"]

    # Vista del día: la barra enseña el rol y su menú lo cambia; la fila de «Caja» enseña la cobertura.
    page.wait_for_load_state("networkidle")
    page.click("[data-act=setVista][data-v=dia]")
    page.fill("input[data-act-change=dayPick]", a["fecha"])
    page.dispatch_event("input[data-act-change=dayPick]", "change")
    barra = page.locator(f'.g-bar[data-emp="{a["empleado_id"]}"]')
    barra.wait_for()
    assert "Lava" in barra.inner_text()
    assert page.locator(".g-cov .g-name:has-text('Caja')").count() == 1
    # La vista del día puede volver a pintarse al llegar las alertas del horario, y eso cierra el menú recién
    # abierto (igual que en test_calendario_navegador.py): se espera a que termine y, si aun así pasa, se reintenta.
    page.wait_for_load_state("networkidle")
    opcion = f'.popover [data-act=barRol][data-funcion="{roles["Cafetera"]["id"]}"]'
    for _ in range(3):
        barra.focus()
        page.keyboard.press("Enter")
        try:
            page.click(opcion, timeout=4000)
            break
        except Exception:
            continue
    assert "Cafetera" in barra.inner_text()
    page.click("[data-act=dayConfirm]")
    with page.expect_response(lambda r: r.url.endswith("/dia/aplicar")) as resp:
        page.click("[data-act=dayApply]:not([data-publicar])")
    assert resp.value.ok, resp.value.text()
    h = page.request.get(f"{url}/api/horarios/{sid}").json()["horario"]
    nueva = next(x for x in h["asignaciones"] if x["empleado_id"] == a["empleado_id"] and x["fecha"] == a["fecha"])
    assert nueva["funcion"] == roles["Cafetera"]["id"]
    assert not errores, errores
    ctx.close()
