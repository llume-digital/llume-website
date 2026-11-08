"""Revisión automática de accesibilidad (axe-core, WCAG 2.2 AA) de todas las pantallas a 390 y 1280 px.

El objetivo es WCAG 2.2 AA. Lo que hoy falla está en EXCEPCIONES, por pantalla y regla, con la propuesta del plan
que lo arregla: una regla nueva en cualquier pantalla hace fallar el test. Cuando se arregla una excepción, se
borra de la lista. axe va copiado en tests/vendor (sin CDN).
"""
from pathlib import Path

import pytest

from tests.navegador import PW
from tests.test_pantallas_navegador import (  # noqa: F401  (datos es un fixture)
    CLAVE_TRABAJADOR, RUTAS_ENCARGADO, RUTAS_TRABAJADOR, TAMAÑOS, _abrir, _visitar, datos,
)

AXE = Path(__file__).parent / "vendor" / "axe-4.10.2.min.js"
NORMAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]

# Fallos conocidos el 08/11/2026, con la propuesta del plan de reestructuración que los arregla.
EXCEPCIONES = {
    "horarios/{sid}": {
        "aria-prohibited-attr": "F3-4: la barra de cobertura lleva aria-label sin rol",
        "scrollable-region-focusable": "F3-3: el cuadrante con scroll lateral no se alcanza con el teclado",
    },
    "ausencias": {
        "label": "F3-9: campos de la tabla de ausencias sin etiqueta",
        "select-name": "F3-9: desplegables de la tabla de ausencias sin nombre",
    },
    "horas": {"scrollable-region-focusable": "E3-2: la tabla de Mis horas se desplaza de lado en el móvil"},
}


def _revisar(browser, datos, tamaño, usuario, clave, rutas):  # noqa: F811
    ctx, page, _ = _abrir(browser, datos, tamaño, usuario, clave)
    nuevos = []
    for ruta in rutas:
        _visitar(page, datos, ruta)
        page.add_script_tag(path=str(AXE))
        fallos = page.evaluate(
            "async normas => (await axe.run(document, {runOnly: normas})).violations"
            ".map(v => ({id: v.id, nodos: v.nodes.length, ej: v.nodes[0].target.join(' ')}))", NORMAS)
        permitidas = EXCEPCIONES.get(ruta, {})
        nuevos += [f"#/{ruta}: {f['id']} ({f['nodos']}, p. ej. {f['ej']})" for f in fallos if f["id"] not in permitidas]
    ctx.close()
    return nuevos


@pytest.mark.parametrize("tamaño", TAMAÑOS)
def test_axe_encargado(browser, datos, tamaño):  # noqa: F811
    assert _revisar(browser, datos, tamaño, "admin", PW, RUTAS_ENCARGADO) == []


@pytest.mark.parametrize("tamaño", TAMAÑOS)
def test_axe_trabajador(browser, datos, tamaño):  # noqa: F811
    assert _revisar(browser, datos, tamaño, "trabajadora", CLAVE_TRABAJADOR, RUTAS_TRABAJADOR) == []
