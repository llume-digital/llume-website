"""Los colores de la interfaz salen de los tokens de `:root` (DISENO.md §1 y §2, propuesta E1-2 del plan).

- styles.css tiene un único `:root` y ningún `#hex` fuera de él: cada color nuevo se añade como token.
- En el JavaScript de la interfaz (app.js y js/) no hay `#hex` dentro de los `style="…"`. Los colores que elige el encargado (turnos, funciones) son datos
  y siguen siendo hex en el código que los crea, nunca en el estilo que los pinta.
- Toda `var(--…)` que se usa está definida, para que un token mal escrito no deje un color transparente sin avisar.
"""
import re
from pathlib import Path

STATIC = Path(__file__).resolve().parent.parent / "app" / "static"
HEX = re.compile(r"#[0-9A-Fa-f]{3,8}\b")


def _css():
    return re.sub(r"/\*.*?\*/", "", (STATIC / "styles.css").read_text(), flags=re.S)


def _js():
    """Todo el JavaScript de la interfaz: app.js y sus módulos de js/."""
    return "\n".join(p.read_text() for p in sorted(STATIC.rglob("*.js")) if p.name not in ("sw.js", "recarga.js"))


def _root(css):
    inicio = css.index(":root {")
    return css[inicio:css.index("}", inicio)]


def test_un_solo_root_y_ningun_hex_fuera():
    css = _css()
    assert css.count(":root") == 1
    fuera = css.replace(_root(css), "")
    assert HEX.findall(fuera) == []


def test_ningun_hex_en_los_estilos_de_app_js():
    js = _js()
    sueltos = [m.group(0) for m in re.finditer(r'style="[^"]*"', js) if HEX.search(m.group(0))]
    assert sueltos == []


def test_cada_var_usada_esta_definida():
    css, js = _css(), _js()
    definidas = set(re.findall(r"(--[\w-]+)\s*:", css + js))
    usadas = set(re.findall(r"var\((--[\w-]+)", css + js))
    assert usadas - definidas == set()


def test_tamaños_y_pesos_de_la_escala():
    """Tamaños solo con `--text-*` (los campos del móvil, a 16 px, son la excepción) y pesos 300, 400, 600 y 700."""
    css = _css().replace(_root(_css()), "")
    js = _js()
    tamaños = re.findall(r"font-size:\s*([^;}\"]+)", css + js)
    assert [t for t in tamaños if not t.strip().startswith("var(--text-") and t.strip() != "max(16px, 1em)"] == []
    pesos = set(re.findall(r"font-weight:\s*(\d+)", css + js))
    assert pesos <= {"300", "400", "600", "700"}
