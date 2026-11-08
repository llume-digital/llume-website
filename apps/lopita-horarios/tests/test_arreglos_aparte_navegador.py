"""Recorrido en Chromium con arreglos_aparte (como la app sin servidor): marcar una baja guarda al momento, sale
el aviso fijo «Ajustando los horarios…» y, al terminar el arreglo, el aviso de los turnos perdidos.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import datetime as dt
import socket
import threading
import time

import pytest

from tests.test_feedback_cliente_navegador import _entrar
from tests.navegador import PW

pytest.importorskip("playwright.sync_api")
uvicorn = pytest.importorskip("uvicorn")


@pytest.fixture(scope="module")
def url(tmp_path_factory):
    from app.main import create_app
    from app.slack import Slack

    app = create_app(str(tmp_path_factory.mktemp("db") / "t.db"), slack=Slack(token="", channel="#h"),
                     secret="test", solve_seconds=8, arreglos_aparte=True, arreglo_seconds=4)
    app.state.store.upsert_user("admin", PW, "Administrador")
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True


def test_baja_guarda_al_momento_y_arregla_aparte(url, browser):  # noqa: F811
    ctx, page, errores = _entrar(browser, url, movil=True)
    lunes = dt.date.today() - dt.timedelta(days=dt.date.today().weekday()) + dt.timedelta(days=7)
    r = page.request.post(f"{url}/api/horarios/generar", headers={"Origin": url},
                          data={"desde": lunes.isoformat(), "hasta": (lunes + dt.timedelta(days=6)).isoformat()})
    assert r.ok, r.text()
    sid = r.json()["id"]
    assert page.request.post(f"{url}/api/horarios/{sid}/publicar", headers={"Origin": url}).ok
    emp = r.json()["horario"]["asignaciones"][0]["empleado_id"]

    peticiones = []
    page.on("request", lambda q: peticiones.append((q.method, q.url)))
    page.goto(f"{url}/#/equipo")
    page.wait_for_selector(f"[data-act=bajaDialog][data-emp='{emp}']")
    page.click(f"[data-act=bajaDialog][data-emp='{emp}']")
    page.fill("#baja-form input[name=desde]", lunes.isoformat())
    # Con servidor el arreglo de una semana tarda poco: se apunta el aviso fijo en cuanto aparece.
    page.evaluate("""() => { window.__avisos = []; new MutationObserver(() => document.querySelectorAll('.toast.fijo')
        .forEach((t) => window.__avisos.push(t.textContent))).observe(document.body, { childList: true }); }""")
    page.click("#baja-form button[type=submit]")

    page.wait_for_selector(".notif.turnos_perdidos", timeout=60000)
    assert any("Ajustando los horarios" in t for t in page.evaluate("window.__avisos"))
    page.wait_for_selector(".toast.fijo", state="detached", timeout=10000)
    assert sum(1 for m, u in peticiones if m == "POST" and u.endswith("/api/arreglos")) == 1
    assert page.request.get(f"{url}/api/me").json()["arreglos_pendientes"] is False
    assert len(page.request.get(f"{url}/api/horarios").json()) == 2  # el publicado y su arreglo
    assert not errores, errores
    ctx.close()
