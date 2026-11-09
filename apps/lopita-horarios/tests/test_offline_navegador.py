"""Recorrido de la app offline en Chromium, como en un móvil: Python dentro del navegador y sin red.

Necesita el paquete construido y Playwright; si no, se salta:

    python herramientas/construir_offline.py
    LOPITA_OFFLINE_DIST=salida/offline python -m pytest tests/test_offline_navegador.py
"""
import functools
import http.server
import os
import threading
from pathlib import Path

import pytest

DIST = os.environ.get("LOPITA_OFFLINE_DIST")
pytestmark = pytest.mark.skipif(not DIST, reason="sin paquete offline (LOPITA_OFFLINE_DIST)")

API = """async ([metodo, ruta, cuerpo]) => {
  const r = await fetch(ruta, { method: metodo, headers: { 'Content-Type': 'application/json' },
                               body: cuerpo === null ? undefined : JSON.stringify(cuerpo) });
  return [r.status, await r.json()];
}"""


@pytest.fixture(scope="module")
def url():
    class Silencioso(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    manejador = functools.partial(Silencioso, directory=str(Path(DIST).resolve()))
    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", 0), manejador)
    threading.Thread(target=servidor.serve_forever, daemon=True).start()
    yield f"http://localhost:{servidor.server_address[1]}/"
    servidor.shutdown()


@pytest.fixture
def movil():
    sync_api = pytest.importorskip("playwright.sync_api")
    ejecutable = "/opt/pw-browsers/chromium" if Path("/opt/pw-browsers/chromium").exists() else None
    with sync_api.sync_playwright() as p:
        navegador = p.chromium.launch(executable_path=ejecutable)
        ctx = navegador.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                                    accept_downloads=True)
        pagina = ctx.new_page()
        pagina.set_default_timeout(180_000)
        errores: list[str] = []
        pagina.on("pageerror", lambda e: errores.append(str(e)))
        pagina.on("console", lambda m: m.type == "error" and errores.append(m.text))
        pagina.on("dialog", lambda d: d.accept())
        yield ctx, pagina, errores
        navegador.close()


def test_demo_completa_sin_conexion(url, movil):
    ctx, pg, errores = movil
    api = lambda metodo, ruta, cuerpo=None: pg.evaluate(API, [metodo, ruta, cuerpo])  # noqa: E731

    pg.goto(url)
    pg.fill("input[name=usuario]", "admin")
    pg.fill("input[name=password]", "lopita")
    pg.click("button[type=submit]")
    pg.click("[data-act=generate]")
    pg.wait_for_selector("[data-act=publish]")
    # Un segundo cálculo en la misma sesión (solucionar justo después de generar): con highspy.Highs, Python
    # abortaba dentro del navegador y la ventana «Buscando cómo arreglar las alertas…» se quedaba para siempre.
    pg.click("text=Solucionar problemas")
    pg.wait_for_selector(".overlay h2:has-text('Solucionar problemas')")
    pg.keyboard.press("Escape")
    pg.evaluate("document.querySelectorAll('.overlay').forEach((o) => o.remove())")
    assert pg.evaluate("navigator.serviceWorker.ready.then((r) => !!r.active)")
    with pg.expect_download() as descarga:
        pg.click(".mas-menu > summary")
        pg.click("text=Horas (CSV)")
    assert descarga.value.suggested_filename.startswith("horas_")

    # Sin red: se recarga, la sesión y el horario siguen, y el motor sigue funcionando.
    ctx.set_offline(True)
    pg.goto(url + "#/horarios")
    pg.reload()
    pg.wait_for_selector("tr[data-act=open]")
    pg.locator("tr[data-act=open]").first.click()
    pg.click("text=Solucionar problemas")
    pg.wait_for_selector(".overlay h2:has-text('Solucionar problemas')")

    # El trabajador pide vacaciones y el encargado las aprueba.
    estado, cfg = api("GET", "/api/config")
    emp = cfg["config"]["empleados"][0]["id"]
    assert api("POST", "/api/usuarios", {"usuario": "prueba", "password": "temporal1", "rol": "empleado",
                                         "empleado_id": emp})[0] == 200
    api("POST", "/api/logout")
    assert api("POST", "/api/login", {"usuario": "prueba", "password": "temporal1"})[0] == 200
    assert api("POST", "/api/mi/clave", {"actual": "temporal1", "nueva": "propia-123"})[0] == 200
    vacaciones = {"desde": "2026-12-01", "hasta": "2026-12-05", "motivo": "vacaciones"}
    assert api("POST", "/api/mi/ausencias", vacaciones)[0] == 200
    api("POST", "/api/logout")
    api("POST", "/api/login", {"usuario": "admin", "password": "lopita"})
    pendientes = api("GET", "/api/solicitudes?estado=pendiente")[1]
    assert api("POST", f"/api/solicitudes/{pendientes[0]['id']}/resolver", {"accion": "aprobar"})[0] == 200

    # Volver a los datos de ejemplo borra todo lo hecho en el móvil.
    pg.reload()
    pg.click("#demo summary")
    pg.click("#demo-reiniciar")
    pg.wait_for_selector("input[name=usuario]")
    api("POST", "/api/login", {"usuario": "admin", "password": "lopita"})
    assert api("GET", "/api/horarios")[1] == []
    assert [u["username"] for u in api("GET", "/api/usuarios")[1]] == ["admin"]
    assert errores == []
