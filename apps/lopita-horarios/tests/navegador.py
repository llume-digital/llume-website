"""Utilidades comunes de los tests de navegador (Playwright + Chromium).

Los fixtures `url` y `browser` están en `tests/conftest.py`; aquí van las piezas que también usan los tests que
montan su propio servidor (con otra configuración) o su propio contexto de navegador.
"""
import socket
import threading
import time

PW = "contraseña-segura"

ESCRITORIO = {"viewport": {"width": 1360, "height": 900}}
MOVIL = {"viewport": {"width": 390, "height": 844}, "has_touch": True, "is_mobile": True}


def servir(app):
    """Arranca la app ASGI en un puerto libre y devuelve (url, server); para pararla, `server.should_exit = True`."""
    import uvicorn

    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(100):
        if server.started:
            break
        time.sleep(0.05)
    return f"http://127.0.0.1:{port}", server


def app_de_prueba(ruta_db, **kwargs):
    """La app con Slack desactivado, secreto fijo y la cuenta `admin` con la contraseña `PW`."""
    from app.main import create_app
    from app.slack import Slack

    opciones = {"slack": Slack(token="", channel="#h"), "secret": "test", "solve_seconds": 8} | kwargs
    app = create_app(str(ruta_db), **opciones)
    app.state.store.upsert_user("admin", PW, "Administrador")
    return app


def entrar(browser, url, movil=False, usuario="admin", clave=PW, espera="[data-act=generate]"):
    """Abre un contexto nuevo, entra con esa cuenta y devuelve (ctx, page, errores de JavaScript)."""
    ctx = browser.new_context(**(MOVIL if movil else ESCRITORIO))
    page = ctx.new_page()
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(url)
    page.fill("input[name=usuario]", usuario)
    page.fill("input[name=password]", clave)
    page.click("button[type=submit]")
    if espera:
        page.wait_for_selector(espera)
    return ctx, page, errores
