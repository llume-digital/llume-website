"""Recorrido de humo por todas las pantallas, como encargado y como trabajador, a 390 y 1280 px.

Es la red de seguridad de la reestructuración de la interfaz: cada pantalla abre sin errores de JavaScript, termina
de cargar y no provoca scroll horizontal de la página (DISENO.md §4). Los campos de 16 px en el móvil se comprueban
aparte, marcados como fallo conocido hasta que llegue el arreglo de la base visual.

Necesita Playwright con Chromium (o la ruta de otro Chromium en LOPITA_CHROMIUM); si no está, se salta.
"""
import datetime as dt

import pytest

from tests.navegador import ESCRITORIO, MOVIL, PW, app_de_prueba, servir

pytest.importorskip("playwright.sync_api")
pytest.importorskip("uvicorn")

TAMAÑOS = {"390": MOVIL, "1280": ESCRITORIO | {"viewport": {"width": 1280, "height": 800}}}
CLAVE_TRABAJADOR = "clave-de-trabajadora"

# Rutas del encargado. `{sid}` es un horario publicado, `{emp}` una persona del equipo y `{lunes}` su semana.
RUTAS_ENCARGADO = [
    "horarios", "horarios/{sid}", "calendario", "calendario/persona/{emp}/{lunes}", "alertas", "solicitudes",
    "informes", "equipo", "funciones", "turnos", "demanda", "ausencias", "preferencias", "reglas", "web",
    "comentarios", "ajustes", "novedades", "guia",
]
RUTAS_TRABAJADOR = ["inicio", "horas", "vacaciones", "preferencias", "guia"]


@pytest.fixture(scope="module")
def datos(tmp_path_factory):
    """Servidor con un horario publicado la semana que viene y una cuenta de trabajadora para la primera persona."""
    app = app_de_prueba(tmp_path_factory.mktemp("db") / "t.db")
    store = app.state.store
    emp = store.current_config()[0].empleados[0].id
    store.upsert_user("trabajadora", CLAVE_TRABAJADOR, "Trabajadora", rol="empleado", empleado_id=emp)
    url, server = servir(app)

    from starlette.testclient import TestClient
    with TestClient(app, base_url=url) as c:
        h = {"Origin": url}
        assert c.post("/api/login", json={"usuario": "admin", "password": PW}, headers=h).status_code == 200
        hoy = dt.date.today()
        lunes = hoy + dt.timedelta(days=7 - hoy.weekday())
        r = c.post("/api/horarios/generar", headers=h,
                   json={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
        assert r.status_code == 200, r.text
        sid = r.json()["id"]
        r = c.post(f"/api/horarios/{sid}/publicar", headers=h, json={"confirmar_criticas": True})
        assert r.status_code == 200, r.text
    yield {"url": url, "sid": sid, "emp": emp, "lunes": lunes.isoformat()}
    server.should_exit = True


def _abrir(browser, datos, tamaño, usuario, clave):
    ctx = browser.new_context(**TAMAÑOS[tamaño])
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(f"JS: {e}"))
    page.on("console", lambda m: errores.append(f"consola: {m.text}") if m.type == "error" else None)
    page.goto(datos["url"])
    page.fill("input[name=usuario]", usuario)
    page.fill("input[name=password]", clave)
    page.click("button[type=submit]")
    page.wait_for_selector("#view")
    return ctx, page, errores


def _visitar(page, datos, ruta):
    page.goto(f"{datos['url']}/#/{ruta.format(**datos)}")
    page.wait_for_load_state("networkidle")
    page.wait_for_function("() => { const v = document.querySelector('#view');"
                           " return v && v.textContent.trim() && !/Cargando/.test(v.textContent); }", timeout=15000)


def _recorrer(browser, datos, tamaño, usuario, clave, rutas):
    ctx, page, errores = _abrir(browser, datos, tamaño, usuario, clave)
    problemas = []
    for ruta in rutas:
        antes = len(errores)
        _visitar(page, datos, ruta)
        ancho = page.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
        if ancho[0] > ancho[1]:
            problemas.append(f"#/{ruta}: scroll horizontal de página ({ancho[0]} px en {ancho[1]})")
        problemas += [f"#/{ruta}: {e}" for e in errores[antes:]]
    ctx.close()
    return problemas


@pytest.mark.parametrize("tamaño", TAMAÑOS)
def test_pantallas_del_encargado(browser, datos, tamaño):
    assert _recorrer(browser, datos, tamaño, "admin", PW, RUTAS_ENCARGADO) == []


@pytest.mark.parametrize("tamaño", TAMAÑOS)
def test_pantallas_del_trabajador(browser, datos, tamaño):
    assert _recorrer(browser, datos, tamaño, "trabajadora", CLAVE_TRABAJADOR, RUTAS_TRABAJADOR) == []


@pytest.mark.xfail(strict=True, raises=AssertionError, reason="Fallo conocido (plan E1-1): los campos salen a 13 px y el iPhone hace zoom. "
                                       "Al arreglarlo, este test pasa y hay que quitar el xfail.")
def test_campos_de_16px_en_el_movil(browser, datos):
    pequeños = []
    for usuario, clave, rutas in (("admin", PW, RUTAS_ENCARGADO), ("trabajadora", CLAVE_TRABAJADOR, RUTAS_TRABAJADOR)):
        ctx, page, _ = _abrir(browser, datos, "390", usuario, clave)
        for ruta in rutas:
            _visitar(page, datos, ruta)
            tamaños = page.eval_on_selector_all(
                "input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea",
                "els => els.filter(e => e.offsetParent).map(e => parseFloat(getComputedStyle(e).fontSize))")
            if any(t < 16 for t in tamaños):
                pequeños.append(f"#/{ruta} ({usuario}): {min(tamaños):g} px")
        ctx.close()
    assert pequeños == []
