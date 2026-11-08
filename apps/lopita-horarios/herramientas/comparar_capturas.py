"""Compara las pantallas de la interfaz entre dos versiones: la de esta carpeta y la de otra (normalmente `main`).

    python herramientas/comparar_capturas.py --base /ruta/al/main/apps/lopita-horarios --salida salida/capturas

Arranca un único servidor con datos de ejemplo y un horario publicado, y recorre las mismas pantallas que
`tests/test_pantallas_navegador.py` (encargado y trabajadora, a 390 y 1280 px) dos veces: una sirviendo `app/static`
de la base y otra la de esta carpeta. Como el servidor, los datos y el reloj del navegador son los mismos, cualquier
diferencia entre las dos capturas la ha causado el cambio de la interfaz. No compara con imágenes guardadas en el
repositorio: así no depende del sistema en que se generaron ni hay que regenerarlas.

En la salida deja, por cada pantalla que cambia, `antes`, `despues` y `diferencias` (en rojo), y un `resumen.md`
para el resumen del job de CI. Solo avisa: termina con 0 aunque haya diferencias, salvo que se pase `--estricto`.
"""
import argparse
import datetime as dt
import io
import mimetypes
import os
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

UMBRAL_DELTA = 8  # diferencia de color por canal (0-255) por debajo de la cual un píxel cuenta como igual (suavizado)
UMBRAL_PIXELES = 40  # píxeles distintos por debajo de los cuales la pantalla cuenta como igual


def _servidor():
    """Servidor con datos de ejemplo, un horario publicado y una cuenta de trabajadora (el fixture `datos`)."""
    from tests import test_pantallas_navegador as T

    class Carpetas:
        def mktemp(self, nombre):
            return Path(tempfile.mkdtemp(prefix=f"capturas-{nombre}-"))

    gen = T.datos.__wrapped__(Carpetas())
    return T, next(gen), gen


def _servir_base(ctx, estaticos: Path):
    """Sirve /static/* desde la carpeta de la base (si el archivo existe allí) y bloquea el service worker."""
    def responder(route):
        nombre = route.request.url.split("/static/", 1)[1].split("?", 1)[0]
        archivo = estaticos / nombre
        if not archivo.is_file():
            return route.continue_()
        tipo = mimetypes.guess_type(archivo.name)[0] or "application/octet-stream"
        route.fulfill(body=archivo.read_bytes(), content_type=tipo)
    ctx.route("**/static/**", responder)


def _capturar(browser, T, datos, tamaño, usuario, clave, rutas, base, reloj):
    ctx = browser.new_context(**T.TAMAÑOS[tamaño], reduced_motion="reduce", service_workers="block")
    if base:
        _servir_base(ctx, base)
    page = ctx.new_page()
    page.clock.set_fixed_time(reloj)
    errores = []
    page.on("pageerror", lambda e: errores.append(str(e)))
    page.goto(datos["url"])
    fotos = {"entrada": page.screenshot(full_page=True)} if usuario == "admin" else {}
    page.fill("input[name=usuario]", usuario)
    page.fill("input[name=password]", clave)
    page.click("button[type=submit]")
    page.wait_for_selector("#view")
    for ruta in rutas:
        try:
            T._visitar(page, datos, ruta)
        except Exception as exc:  # una pantalla que no carga en una de las versiones también es una diferencia
            errores.append(f"#/{ruta}: {exc.__class__.__name__}")
        page.wait_for_timeout(150)
        fotos[ruta] = page.screenshot(full_page=True)
    ctx.close()
    return fotos, errores


def _comparar(a_png, d_png):
    from PIL import Image, ImageChops

    a, d = (Image.open(io.BytesIO(x)).convert("RGB") for x in (a_png, d_png))
    ancho, alto = max(a.width, d.width), max(a.height, d.height)
    lienzo_a, lienzo_d = Image.new("RGB", (ancho, alto), "white"), Image.new("RGB", (ancho, alto), "white")
    lienzo_a.paste(a)
    lienzo_d.paste(d)
    mascara = ImageChops.difference(lienzo_a, lienzo_d).convert("L").point(lambda v: 255 if v > UMBRAL_DELTA else 0)
    distintos = mascara.histogram()[255]
    marca = Image.blend(lienzo_d, Image.new("RGB", (ancho, alto), "white"), 0.6)
    marca.paste(Image.new("RGB", (ancho, alto), (220, 30, 30)), mask=mascara)
    return distintos, a.size != d.size, (a, d, marca)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", required=True, type=Path, help="carpeta apps/lopita-horarios de la versión de referencia")
    ap.add_argument("--salida", type=Path, default=RAIZ / "salida" / "capturas")
    ap.add_argument("--estricto", action="store_true", help="termina con 1 si alguna pantalla cambia")
    args = ap.parse_args()
    base = (args.base / "app" / "static").resolve()
    if not base.is_dir():
        sys.exit(f"No encuentro {base}")
    args.salida.mkdir(parents=True, exist_ok=True)

    from playwright.sync_api import sync_playwright

    T, datos, gen = _servidor()
    reloj = dt.datetime.now().replace(second=0, microsecond=0)
    cambios, errores = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.environ.get("LOPITA_CHROMIUM") or None)
        for tamaño in T.TAMAÑOS:
            for usuario, clave, rutas in (("admin", T.PW, T.RUTAS_ENCARGADO),
                                          ("trabajadora", T.CLAVE_TRABAJADOR, T.RUTAS_TRABAJADOR)):
                antes, err_a = _capturar(browser, T, datos, tamaño, usuario, clave, rutas, base, reloj)
                despues, err_d = _capturar(browser, T, datos, tamaño, usuario, clave, rutas, None, reloj)
                errores += [f"{tamaño} {usuario} (base): {e}" for e in err_a]
                errores += [f"{tamaño} {usuario} (cambio): {e}" for e in err_d]
                for ruta in despues:
                    distintos, otro_alto, imagenes = _comparar(antes[ruta], despues[ruta])
                    if distintos < UMBRAL_PIXELES and not otro_alto:
                        continue
                    nombre = f"{tamaño}-{usuario}-{ruta.replace('/', '_').replace('{', '').replace('}', '')}"
                    for sufijo, img in zip(("antes", "despues", "diferencias"), imagenes):
                        img.save(args.salida / f"{nombre}-{sufijo}.png")
                    alto = f"{imagenes[0].height} → {imagenes[1].height} px" if otro_alto else "igual"
                    cambios.append((tamaño, usuario, ruta, distintos, alto, nombre))
        browser.close()
    next(gen, None)

    lineas = ["## Capturas: diferencias con la base", ""]
    if cambios:
        lineas += [f"{len(cambios)} pantallas cambian. Las imágenes están en el artefacto `capturas`.", "",
                   "| Ancho | Cuenta | Pantalla | Píxeles distintos | Alto |", "| --- | --- | --- | ---: | --- |"]
        lineas += [f"| {t} | {u} | `#/{r}` | {n} | {a} |" for t, u, r, n, a, _ in cambios]
    else:
        lineas.append("Ninguna pantalla cambia.")
    if errores:
        lineas += ["", "Errores al recorrer las pantallas:", ""] + [f"- {e}" for e in errores]
    resumen = "\n".join(lineas) + "\n"
    (args.salida / "resumen.md").write_text(resumen, encoding="utf-8")
    print(resumen)
    return 1 if args.estricto and cambios else 0


if __name__ == "__main__":
    sys.exit(main())
