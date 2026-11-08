"""Pone el icono y la pantalla de arranque de Lopita en el proyecto Android (Capacitor pone los suyos).

Parte de app/static/icono-512.png (fondo #17130F a sangre y la L dorada en el centro), así que sirve tal
cual como capa delantera del icono adaptable sobre un fondo del mismo color.

    python movil/iconos.py      # tras «npx cap add android»; necesita Pillow
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent
RES = RAIZ / "android" / "app" / "src" / "main" / "res"
ICONO = RAIZ.parent / "app" / "static" / "icono-512.png"
FONDO = "#17130F"
DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def _redondo(img: Image.Image) -> Image.Image:
    mascara = Image.new("L", img.size, 0)
    ImageDraw.Draw(mascara).ellipse((0, 0, img.size[0] - 1, img.size[1] - 1), fill=255)
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    out.paste(img, mask=mascara)
    return out


def main() -> None:
    icono = Image.open(ICONO).convert("RGBA")
    for nombre, escala in DENSIDADES.items():
        carpeta = RES / f"mipmap-{nombre}"
        lado = round(48 * escala)
        icono.resize((lado, lado), Image.LANCZOS).save(carpeta / "ic_launcher.png")
        _redondo(icono.resize((lado, lado), Image.LANCZOS)).save(carpeta / "ic_launcher_round.png")
        delantera = round(108 * escala)
        icono.resize((delantera, delantera), Image.LANCZOS).save(carpeta / "ic_launcher_foreground.png")
    (RES / "values" / "ic_launcher_background.xml").write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{FONDO}</color>\n</resources>\n', encoding="utf-8")

    for splash in RES.glob("drawable*/splash.png"):
        ancho, alto = Image.open(splash).size
        lienzo = Image.new("RGB", (ancho, alto), FONDO)
        lado = min(ancho, alto) // 3
        lienzo.paste(icono.resize((lado, lado), Image.LANCZOS), ((ancho - lado) // 2, (alto - lado) // 2))
        lienzo.save(splash)


if __name__ == "__main__":
    main()
