"""Sirve la web pública (web/) y la app juntas en local, como lo hace Caddy en el servidor.

  python herramientas/servir_web.py            # http://localhost:8001

La web va en la raíz; /api/web/* y /fonts/* van a la app, igual que en deploy/demo/Caddyfile. Usa la misma base de
datos que la app (LOPITA_DB), así que lo que se envía desde la web se ve en la pestaña Web de la app.
"""
from __future__ import annotations

import sys
from pathlib import Path

from starlette.applications import Starlette
from starlette.routing import Mount
from starlette.staticfiles import StaticFiles
from starlette.types import ASGIApp, Receive, Scope, Send

RAIZ = Path(__file__).resolve().parent.parent
WEB = RAIZ / "web"
A_LA_APP = ("/api/web/", "/fonts/")


class WebYApp:
    """Reparte las peticiones entre los ficheros de la web y la app, por ruta."""

    def __init__(self, app: ASGIApp, web: Path = WEB):
        # Dentro de una app de Starlette para que un fichero que no está dé 404 y no un error
        self.app, self.web = app, Starlette(routes=[Mount("/", StaticFiles(directory=web, html=True))])

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["path"].startswith(A_LA_APP):
            await self.app(scope, receive, send)
        elif scope["type"] == "http":
            await self.web(scope, receive, send)
        else:
            await self.app(scope, receive, send)


if __name__ == "__main__":
    import uvicorn

    sys.path.insert(0, str(RAIZ))
    from app.main import create_app

    uvicorn.run(WebYApp(create_app()), host="127.0.0.1", port=8001)
