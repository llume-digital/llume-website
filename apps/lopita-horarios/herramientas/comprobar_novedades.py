"""Comprueba que la pestaña Novedades se mantiene al día.

Dos comprobaciones:

1. ``--base <rama>``: si el cambio respecto a esa rama toca la app (lo que ve quien la usa), tiene que añadir una
   entrada nueva en ``app/static/js/datos/novedades.js``. Si el cambio es puramente interno (tests, refactor sin
   efectos visibles, CI…), el PR lo declara con una línea «Sin novedades: <motivo>» en su descripción (variable de
   entorno ``CUERPO_PR``) o con la etiqueta «sin novedades» (``ETIQUETAS_PR``, separadas por comas).
2. Siempre: la lista es válida (fechas ISO de la más nueva a la más antigua, título y texto, ``ir`` a una pantalla
   que existe). Necesita ``node``.

Uso: ``python herramientas/comprobar_novedades.py [--base origin/main]`` desde ``apps/lopita-horarios``.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DATOS = RAIZ / "app/static/js/datos/novedades.js"
PINTADO = RAIZ / "app/static/js/nucleo/pintado.js"
# Lo que llega a quien usa la app: servidor, interfaz, motor de horarios y versión offline.
VISIBLES = ("app/", "lopita_horarios/", "offline/")
MARCA = re.compile(r"^\s*(?:[-*]\s*)?\**sin novedades\**\s*:\s*\S", re.IGNORECASE | re.MULTILINE)
FECHA = re.compile(r"^\+.*\bfecha:\s*'(\d{4}-\d{2}-\d{2})'")


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=RAIZ, check=True, capture_output=True, text=True).stdout


def leer_novedades() -> list[dict]:
    codigo = DATOS.read_text(encoding="utf-8")
    script = ("const src = require('fs').readFileSync(0, 'utf8');"
              "import('data:text/javascript,' + encodeURIComponent(src))"
              ".then((m) => process.stdout.write(JSON.stringify(m.NOVEDADES)));")
    salida = subprocess.run(["node", "-e", script], input=codigo, check=True, capture_output=True, text=True).stdout
    return json.loads(salida)


def errores_de_formato(novedades: list[dict], hoy: dt.date | None = None) -> list[str]:
    hoy = hoy or dt.date.today()
    pantallas = set(re.findall(r"\['([a-z]+)',\s*'", PINTADO.read_text(encoding="utf-8")))
    errores = []
    if not novedades:
        return ["La lista de novedades está vacía."]
    anterior = None
    for i, n in enumerate(novedades, 1):
        donde = f"Novedad {i} («{n.get('titulo', '?')}»)"
        try:
            fecha = dt.date.fromisoformat(n.get("fecha", ""))
        except ValueError:
            errores.append(f"{donde}: la fecha tiene que ser AAAA-MM-DD.")
            continue
        if fecha > hoy + dt.timedelta(days=1):
            errores.append(f"{donde}: la fecha {fecha} es futura.")
        if anterior and fecha > anterior:
            errores.append(f"{donde}: va después de una más antigua; añade las nuevas arriba del todo.")
        anterior = fecha
        if not str(n.get("titulo", "")).strip():
            errores.append(f"{donde}: falta el título.")
        texto = n.get("texto")
        if not isinstance(texto, list) or not texto or not all(isinstance(p, str) and p.strip() for p in texto):
            errores.append(f"{donde}: `texto` tiene que ser una lista de párrafos.")
        if n.get("ir") and n["ir"] not in pantallas:
            errores.append(f"{donde}: `ir: '{n['ir']}'` no es una pantalla de NAV_ADMIN.")
    return errores


def comprobar_cambio(base: str, cuerpo: str, etiquetas: list[str]) -> list[str]:
    prefijo = git("rev-parse", "--show-prefix").strip()
    cambiados = [f[len(prefijo):] for f in git("diff", "--name-only", f"{base}...HEAD", "--", ".").splitlines()]
    visibles = [f for f in cambiados if f.startswith(VISIBLES)]
    if not visibles:
        print("No cambia nada de la app: no hace falta novedad.")
        return []
    diff = git("diff", "-U0", f"{base}...HEAD", "--", str(DATOS.relative_to(RAIZ)))
    nuevas = sorted({m.group(1) for linea in diff.splitlines() if (m := FECHA.match(linea))})
    if nuevas:
        print(f"Novedad añadida ({', '.join(nuevas)}).")
        return []
    if MARCA.search(cuerpo or "") or any(e.strip().lower() == "sin novedades" for e in etiquetas):
        print("El PR declara que no tiene cambios visibles para el cliente («Sin novedades»).")
        return []
    lista = "\n".join(f"  - {f}" for f in visibles[:15]) + ("\n  - …" if len(visibles) > 15 else "")
    return [
        "Este PR cambia la app y no añade ninguna entrada a la pestaña Novedades:\n" + lista + "\n\n"
        "Si el cliente va a notar el cambio, añade arriba de NOVEDADES en app/static/js/datos/novedades.js una "
        "entrada con la fecha de hoy, en lenguaje sencillo (las reglas están al principio de ese archivo).\n"
        "Si es puramente interno, escribe en la descripción del PR una línea «Sin novedades: <motivo>» "
        "o ponle la etiqueta «sin novedades»."
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--base", help="rama o commit con el que comparar (p. ej. origin/main)")
    args = ap.parse_args()
    errores = []
    if args.base:
        etiquetas = [e for e in os.environ.get("ETIQUETAS_PR", "").split(",") if e.strip()]
        errores += comprobar_cambio(args.base, os.environ.get("CUERPO_PR", ""), etiquetas)
    if shutil.which("node"):
        errores += errores_de_formato(leer_novedades())
    else:
        print("Sin node: no se comprueba el formato de la lista.")
    for e in errores:
        print(f"::error::{e.replace(chr(10), '%0A')}" if os.environ.get("GITHUB_ACTIONS") else e, file=sys.stderr)
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
