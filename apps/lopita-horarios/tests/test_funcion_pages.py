"""La función de Cloudflare Pages (functions/api/web) se prueba con Node y un fetch simulado; sin Node, se salta."""
import shutil
import subprocess
from pathlib import Path

import pytest


@pytest.mark.skipif(not shutil.which("node"), reason="Node no está instalado")
def test_funcion_de_pages_solo_reenvia_formularios_y_carta(tmp_path):
    # Copias .mjs: así cualquier versión de Node la trata como módulo, sin package.json dentro de functions/
    raiz = Path(__file__).resolve().parent.parent
    (tmp_path / "funcion.mjs").write_text((raiz / "functions/api/web/[[ruta]].js").read_text(encoding="utf-8"), encoding="utf-8")
    prueba = Path(__file__).with_name("funcion_pages.mjs").read_text(encoding="utf-8")
    (tmp_path / "prueba.mjs").write_text(prueba.replace("../functions/api/web/[[ruta]].js", "./funcion.mjs"), encoding="utf-8")
    r = subprocess.run(["node", str(tmp_path / "prueba.mjs")], capture_output=True, text=True, timeout=60)
    assert r.returncode == 0, r.stderr
    assert r.stdout.strip() == "ok"
