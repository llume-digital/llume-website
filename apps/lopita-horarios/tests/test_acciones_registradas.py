"""Cada botón con data-act="x" tiene su acción registrada, y cada acción vive en el módulo de su pantalla."""
import re
from pathlib import Path

JS = Path(__file__).resolve().parent.parent / "app" / "static" / "js"


def _registradas():
    nombres = {}
    for f in JS.rglob("*.js"):
        txt = f.read_text(encoding="utf-8")
        for bloque in re.finditer(r"Object\.assign\(actions, \{\n(.*?)\n\}\);", txt, re.S):
            for m in re.finditer(r"^  ([A-Za-z0-9_]+):", bloque.group(1), re.M):
                assert m.group(1) not in nombres, f"{m.group(1)} está registrada en {nombres[m.group(1)]} y en {f.name}"
                nombres[m.group(1)] = f.name
    return nombres


def test_cada_data_act_tiene_su_accion():
    registradas = _registradas()
    assert len(registradas) > 100
    usadas = set()
    for f in JS.rglob("*.js"):
        usadas |= set(re.findall(r'data-act=\\?"?([A-Za-z0-9_]+)', f.read_text(encoding="utf-8")))
    usadas |= set(re.findall(r'data-act="([A-Za-z0-9_]+)"', (JS.parent / "index.html").read_text(encoding="utf-8")))
    cambios = set()
    for f in JS.rglob("*.js"):
        txt = f.read_text(encoding="utf-8")
        for m in re.finditer(r"export const changeActions = \{(.*?)\n\};", txt, re.S):
            cambios |= set(re.findall(r"^  ([A-Za-z0-9_]+):", m.group(1), re.M))
    faltan = sorted(n for n in usadas if n not in registradas and n not in cambios)
    assert not faltan, f"data-act sin acción registrada: {faltan}"
