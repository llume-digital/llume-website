"""Construye la app offline de demostración: una web instalable (PWA) que funciona sin conexión.

Junta en una carpeta la interfaz de siempre (app/static), el código Python de la app y del motor, y Python
para el navegador (Pyodide) con los paquetes que necesita. Esa carpeta se sirve desde cualquier sitio
estático con HTTPS; el móvil la abre una vez, la instala y a partir de ahí funciona en modo avión.

    python herramientas/construir_offline.py                       # descarga Pyodide del CDN
    python herramientas/construir_offline.py --pyodide ruta/pyodide  # o usa una copia local
    python herramientas/construir_offline.py --zip                   # y además deja un .zip

Cada archivo descargado se comprueba con su sha256: el núcleo de Pyodide con los fijados aquí y los
paquetes con los de su lista oficial (pyodide-lock.json).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
PYODIDE_VERSION = "314.0.7"
CDN = f"https://cdn.jsdelivr.net/pyodide/v{PYODIDE_VERSION}/full/"
# sha256 del núcleo de la release oficial (coinciden la de GitHub y el paquete npm `pyodide`).
NUCLEO = {
    "pyodide.mjs": "6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109",
    "pyodide.asm.mjs": "f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635",
    "pyodide.asm.wasm": "cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6",
    "python_stdlib.zip": "fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a",
    "pyodide-lock.json": "5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010",
}
# Lo que importa la app (app/ y lopita_horarios/). loadPackage añade sus dependencias según la lista de Pyodide,
# pero esa lista no las recoge todas (p. ej. httpx), así que se nombran explícitamente.
PAQUETES = ["fastapi", "starlette", "pydantic", "pydantic_core", "annotated-types", "typing-extensions",
            "typing-inspection", "annotated-doc", "anyio", "sniffio", "idna", "httpx", "httpcore", "h11",
            "certifi", "numpy", "highspy"]
# Paquetes puros que no trae Pyodide: se toman de PyPI, fijados por versión y sha256.
EXTRA = [("itsdangerous-2.2.0-py3-none-any.whl",
          "https://files.pythonhosted.org/packages/04/96/92447566d16df59b2a776c0fb82dbc4d9e07cd95062562af01e408583fc4/"
          "itsdangerous-2.2.0-py3-none-any.whl",
          "c6242fc49e35958c8b15141343aa660db5fc54d4f13a1db01a3f5891b98700ef")]
ESTATICOS = ["app.js", "styles.css", "favicon.svg", "icono-192.png", "icono-512.png", "apple-touch-icon.png"]
SHELL = ["index.html", "arranque.js", "motor.worker.js", "manifest.webmanifest"]


def _sha256(datos: bytes) -> str:
    return hashlib.sha256(datos).hexdigest()


def _obtener(nombre: str, local: Path | None, url: str) -> bytes:
    if local is not None and (local / nombre).exists():
        return (local / nombre).read_bytes()
    print(f"  descargando {nombre}", file=sys.stderr)
    with urllib.request.urlopen(url, timeout=120) as r:
        return r.read()


def _dependencias(lock: dict, nombres: list[str]) -> list[str]:
    paquetes = lock["packages"]
    clave = {k.lower().replace("_", "-"): k for k in paquetes}
    vistos: list[str] = []
    pendientes = list(nombres)
    while pendientes:
        n = clave[pendientes.pop().lower().replace("_", "-")]
        if n in vistos:
            continue
        vistos.append(n)
        pendientes.extend(paquetes[n]["depends"])
    return sorted(vistos)


def _codigo_python() -> bytes:
    """Zip con lo que Python necesita en el navegador: app/ (también static/, que la app monta al arrancar),
    lopita_horarios/, los datos de ejemplo y el puente."""
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for carpeta in ("app", "lopita_horarios"):
            for f in sorted((RAIZ / carpeta).rglob("*")):
                rel = f.relative_to(RAIZ)
                if f.is_dir() or "__pycache__" in rel.parts:
                    continue
                z.write(f, rel.as_posix())
        z.write(RAIZ / "datos" / "ejemplo.json", "datos/ejemplo.json")
        z.write(RAIZ / "offline" / "lopita_offline.py", "lopita_offline.py")
    return buf.getvalue()


def construir(salida: Path, pyodide_local: Path | None, nube: str | None = None) -> list[str]:
    if salida.exists():
        shutil.rmtree(salida)
    (salida / "pyodide").mkdir(parents=True)

    for nombre, sha in NUCLEO.items():
        datos = _obtener(nombre, pyodide_local, CDN + nombre)
        if _sha256(datos) != sha:
            raise SystemExit(f"sha256 incorrecto para {nombre}: ¿es Pyodide {PYODIDE_VERSION}?")
        (salida / "pyodide" / nombre).write_bytes(datos)
    lock = json.loads((salida / "pyodide" / "pyodide-lock.json").read_text(encoding="utf-8"))

    paquetes = _dependencias(lock, PAQUETES)
    for n in paquetes:
        meta = lock["packages"][n]
        datos = _obtener(meta["file_name"], pyodide_local, CDN + meta["file_name"])
        if _sha256(datos) != meta["sha256"]:
            raise SystemExit(f"sha256 incorrecto para {meta['file_name']}")
        (salida / "pyodide" / meta["file_name"]).write_bytes(datos)
    extra = []
    for nombre, url, sha in EXTRA:
        datos = _obtener(nombre, None, url)
        if _sha256(datos) != sha:
            raise SystemExit(f"sha256 incorrecto para {nombre}")
        (salida / "pyodide" / nombre).write_bytes(datos)
        extra.append(f"pyodide/{nombre}")

    (salida / "static").mkdir()
    for nombre in ESTATICOS:
        shutil.copy2(RAIZ / "app" / "static" / nombre, salida / "static" / nombre)
    fuentes = RAIZ / "lopita_horarios" / "assets" / "fonts"
    shutil.copytree(fuentes, salida / "fonts")
    for nombre in SHELL:
        shutil.copy2(RAIZ / "offline" / nombre, salida / nombre)
    (salida / "lopita.zip").write_bytes(_codigo_python())

    archivos = sorted(p.relative_to(salida).as_posix() for p in salida.rglob("*") if p.is_file())
    huella = hashlib.sha256()
    for a in archivos:
        huella.update(a.encode())
        huella.update((salida / a).read_bytes())
    version = huella.hexdigest()[:12]
    config = {"version": version, "paquetes": paquetes + extra}
    if nube:
        config["nube"] = nube
    (salida / "config.js").write_text(f"window.LOPITA_OFFLINE = {json.dumps(config)};\n", encoding="utf-8")
    archivos = ["./"] + sorted(archivos + ["config.js"])
    sw = (RAIZ / "offline" / "sw.js").read_text(encoding="utf-8")
    sw = sw.replace("'__VERSION__'", json.dumps(version)).replace("__ARCHIVOS__", json.dumps(archivos))
    (salida / "sw.js").write_text(sw, encoding="utf-8")
    return archivos


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--salida", type=Path, default=RAIZ / "salida" / "offline")
    ap.add_argument("--pyodide", type=Path, help="carpeta con Pyodide ya descargado (la «full» de la release)")
    ap.add_argument("--zip", action="store_true", help="deja también salida/lopita-offline.zip")
    ap.add_argument("--nube", help="ruta (relativa a la app) de la base de datos compartida, p. ej. nube/db "
                    "(la sirve src/worker.js de la web de llume); sin ella, los datos se quedan en el móvil")
    args = ap.parse_args()
    archivos = construir(args.salida, args.pyodide, args.nube)
    total = sum((args.salida / a).stat().st_size for a in archivos if a != "./")
    print(f"App offline en {args.salida}: {len(archivos) - 1} archivos, {total / 1e6:.1f} MB")
    if args.zip:
        destino = shutil.make_archive(str(args.salida.parent / "lopita-offline"), "zip", args.salida)
        print(f"Zip: {destino}")


if __name__ == "__main__":
    main()
