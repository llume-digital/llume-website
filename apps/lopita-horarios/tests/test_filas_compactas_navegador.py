"""Recorrido en Chromium: en la vista del día las filas son bajas y las etiquetas de cada persona (abre, cierra,
encargado/a y funciones) van abreviadas dentro de la barra de su turno, con una leyenda debajo (petición del cliente:
«las filas son demasiado anchas y no se pueden ver muchas filas a la vez»).

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.test_vista_diaria_navegador import PW, browser, url  # noqa: F401  (fixtures)

pytest.importorskip("playwright.sync_api")

FUNCIONES = [
    {"id": "cuenta", "nombre": "Cuenta metálica", "color": "#4C8B5F", "reglas": []},
    {"id": "hcaja", "nombre": "HACE CAJA AL CIERRE O APERTURA", "color": "#3D6A9A", "reglas": []},
    {"id": "check", "nombre": "CONTROLA CHECK LIST SALIDA", "color": "#9A3D7A", "reglas": []},
    {"id": "copia", "nombre": "Cuenta monedas", "color": "#4C8B5F", "reglas": []},  # misma abreviatura que la 1.ª
]


@pytest.mark.parametrize("movil", [False, True], ids=["escritorio", "movil"])
def test_etiquetas_abreviadas_en_la_barra(url, browser, movil):  # noqa: F811
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

    # Todo el equipo con muchas etiquetas, como en el bar del cliente.
    c = page.request.get(f"{url}/api/config").json()
    cfg = c["config"]
    cfg["funciones"] = [f for f in cfg["funciones"] if f["id"] not in {x["id"] for x in FUNCIONES}] + FUNCIONES
    for e in cfg["empleados"]:
        e["funciones"] = sorted(set(e.get("funciones") or []) | {"cuenta", "hcaja", "check", "copia"})
        e["puede_abrir"] = e["puede_cerrar"] = e["es_encargado"] = True
    r = page.request.put(f"{url}/api/config", headers={"Origin": url}, data={"config": cfg, "base": c["version"]})
    assert r.ok, r.text()
    page.reload()  # la app tenía cargada la configuración anterior
    page.wait_for_selector("[data-act=generate]")

    lunes = dt.date.today() + dt.timedelta(days=7 - dt.date.today().weekday() + (77 if movil else 70))
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    page.goto(f"{url}/#/horarios/{r.json()['id']}")
    page.wait_for_selector("[data-act=setVista][data-v=dia]")
    page.click("[data-act=setVista][data-v=dia]")
    page.wait_for_selector(".gantt .g-bar")
    page.wait_for_load_state("networkidle")

    # La columna de nombres ya no lleva las etiquetas: solo nombre y tipo, en una línea cada uno.
    assert page.locator(".g-name .func-tags, .g-name .cap-tags").count() == 0
    alturas = page.locator(".g-row:not(.g-head):not(.g-cov)").evaluate_all("rs => rs.map((r) => r.offsetHeight)")
    assert alturas and max(alturas) <= 44, alturas

    # Dentro de la barra, abreviadas y sin repetirse.
    barra = page.locator(".g-bar").first
    abrevs = barra.locator(".cap-tag").all_inner_texts()
    assert {"Ab", "Ci", "Enc", "CM", "HCCA", "CCLS", "CM2"} <= set(abrevs), abrevs
    assert len(abrevs) == len(set(abrevs))
    assert "HACE CAJA AL CIERRE O APERTURA" in barra.get_attribute("aria-label")

    # La leyenda dice qué es cada abreviatura.
    leyenda = page.locator(".cap-legend").inner_text()
    for texto in ("Abre", "Cierra", "Encargado/a", "Cuenta metálica", "Cuenta monedas", "HACE CAJA AL CIERRE O APERTURA"):
        assert texto in leyenda

    # Sin scroll horizontal de página en el móvil.
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")

    # En la semana, las etiquetas también van abreviadas (la fila no crece con ellas).
    page.click("[data-act=setVista][data-v=semana]")
    page.wait_for_selector("table.sched .emp .cap-tag")
    assert page.locator("table.sched .func-tags").count() == 0
    assert not errores, errores
    ctx.close()
