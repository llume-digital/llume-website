"""La lista de la pestaña Novedades es válida (ver herramientas/comprobar_novedades.py)."""
import datetime as dt
import shutil

import pytest

from herramientas.comprobar_novedades import errores_de_formato, leer_novedades

pytestmark = pytest.mark.skipif(not shutil.which("node"), reason="hace falta node para leer el módulo")


def test_novedades_validas():
    assert errores_de_formato(leer_novedades()) == []


def test_detecta_desorden_y_pantalla_inexistente():
    base = {"titulo": "x", "texto": ["y"]}
    errores = errores_de_formato([
        {**base, "fecha": "2026-11-01"}, {**base, "fecha": "2026-11-02", "ir": "no-existe"},
    ], hoy=dt.date(2026, 11, 9))
    assert any("arriba del todo" in e for e in errores)
    assert any("no-existe" in e for e in errores)
