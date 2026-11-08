"""Copia la web de Lopita (web/) como vista previa oculta dentro de otra web, en una subcarpeta.

    python herramientas/exportar_vista_previa.py ../../public/lopita

Pensado para la web de Yume (llumedigital.com/lopita/): rutas relativas para que funcione en cualquier subcarpeta,
noindex en todas las páginas, la carta enlazada a los PDF de lopita.es y los formularios en modo demostración
(no envían nada: en la vista previa no hay intranet detrás). Copia también las fuentes y las fotos que haya en
web/recursos/img (se bajan con herramientas/descargar_recursos_web.sh; si falta alguna, la web la quita sola).
"""
import re
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
WEB = RAIZ / "web"
FUENTES = RAIZ / "lopita_horarios" / "assets" / "fonts"
UPLOADS = "https://lopita.es/wp-content/uploads"
CARTAS = {
    "carta-cafeteria": f"{UPLOADS}/2026/09/Carta-Lopita-Co.-Octubre-2026-1.pdf",
    "carta-comidas": f"{UPLOADS}/2026/09/Carta-de-comidas-Lopita-Co.-Sept.-2026.pdf",
}
NOINDEX = '<meta name="robots" content="noindex, nofollow">'


def convertir(html: str, prefijo: str) -> str:
    for clave, url in CARTAS.items():
        html = html.replace(f'"/api/web/documentos/{clave}"', f'"{url}"')
    html = html.replace('href="/"', f'href="{prefijo or "./"}"')
    html = re.sub(r'((?:href|src|content)=")/(?!/)', rf"\g<1>{prefijo}", html)
    html = re.sub(r"url\('/(?!/)", f"url('{prefijo}", html)
    html = re.sub(r'<meta name="robots" content="[^"]*">', NOINDEX, html)
    if NOINDEX not in html:
        html = html.replace("<meta charset=\"utf-8\">", f'<meta charset="utf-8">\n  {NOINDEX}', 1)
    return html.replace('<html lang="es">', '<html lang="es" data-vista-previa>', 1)


def exportar(destino: Path) -> None:
    if destino.exists():
        shutil.rmtree(destino)
    shutil.copytree(WEB, destino, ignore=shutil.ignore_patterns("cartas", ".DS_Store"))
    (destino / "fonts").mkdir()
    for f in [FUENTES / "fonts.css", *FUENTES.glob("*.woff2"), *FUENTES.glob("OFL-*.txt")]:
        shutil.copy2(f, destino / "fonts" / f.name)
    for pagina in destino.rglob("index.html"):
        profundidad = len(pagina.relative_to(destino).parts) - 1
        pagina.write_text(convertir(pagina.read_text(encoding="utf-8"), "../" * profundidad), encoding="utf-8")
    sueltas = [str(p.relative_to(destino)) for p in destino.rglob("*.html")
               if re.search(r'(?:href|src|content)="/(?!/)|url\(\'/(?!/)', p.read_text(encoding="utf-8"))]
    if sueltas:
        sys.exit(f"Quedan rutas absolutas en: {', '.join(sueltas)}")
    fotos = len(list((destino / "recursos" / "img").glob("*"))) if (destino / "recursos" / "img").exists() else 0
    print(f"Vista previa lista en {destino} ({fotos} fotos)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    exportar(Path(sys.argv[1]).resolve())
