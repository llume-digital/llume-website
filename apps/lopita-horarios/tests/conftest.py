"""Fixtures comunes de los tests de navegador.

- `url`: la app con datos de ejemplo en un puerto libre, una base nueva por módulo de tests.
- `browser`: un Chromium por módulo (o el de LOPITA_CHROMIUM). Sin Playwright o sin Chromium, el test se salta.
  No es de sesión a propósito: Playwright síncrono deja un bucle de asyncio abierto mientras vive, y los tests
  que usan asyncio.run (la app offline) fallarían si les tocara después.

Un módulo que necesite otra configuración define su propio `url` (y puede usar `tests.navegador.servir`).
"""
import os

import pytest

from tests.navegador import app_de_prueba, servir


@pytest.fixture(scope="module")
def url(tmp_path_factory):
    pytest.importorskip("uvicorn")
    direccion, server = servir(app_de_prueba(tmp_path_factory.mktemp("db") / "t.db"))
    yield direccion
    server.should_exit = True


@pytest.fixture(scope="module")
def browser():
    sync_api = pytest.importorskip("playwright.sync_api")
    with sync_api.sync_playwright() as p:
        try:
            b = p.chromium.launch(executable_path=os.environ.get("LOPITA_CHROMIUM") or None)
        except Exception as exc:  # sin Chromium instalado
            pytest.skip(f"Chromium no disponible: {exc}")
        yield b
        b.close()
