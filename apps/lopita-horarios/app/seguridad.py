"""Protecciones de la web app: límite de intentos de inicio de sesión y rechazo de peticiones de otros sitios (CSRF)."""
from __future__ import annotations

import threading
import time
from collections.abc import Callable, Iterable
from urllib.parse import urlsplit

from starlette.types import ASGIApp, Receive, Scope, Send


class LimiteIntentos:
    """Tras `maximo` fallos seguidos de un mismo usuario o desde una misma IP, obliga a esperar.

    La espera empieza en `espera` segundos y se duplica con cada fallo más, hasta `espera_maxima`. Un acierto borra
    los fallos. Vive en memoria: la app se ejecuta en un solo proceso y, si se reinicia, solo se pierden esperas.
    """

    def __init__(self, maximo: int = 5, espera: float = 30, espera_maxima: float = 15 * 60,
                 reloj: Callable[[], float] = time.monotonic):
        self.maximo, self.espera, self.espera_maxima, self.reloj = maximo, espera, espera_maxima, reloj
        self._fallos: dict[str, tuple[int, float]] = {}  # clave -> (fallos seguidos, bloqueada hasta)
        self._candado = threading.Lock()

    def segundos_de_espera(self, claves: Iterable[str]) -> float:
        ahora = self.reloj()
        with self._candado:
            return max([0.0, *(self._fallos.get(c, (0, 0.0))[1] - ahora for c in claves)])

    def fallo(self, claves: Iterable[str]) -> None:
        ahora = self.reloj()
        with self._candado:
            for c in claves:
                n = self._fallos.get(c, (0, 0.0))[0] + 1
                hasta = ahora + min(self.espera * 2 ** (n - self.maximo), self.espera_maxima) if n >= self.maximo else 0.0
                self._fallos[c] = (n, hasta)
            if len(self._fallos) > 10_000:  # no crecer sin límite si alguien prueba miles de usuarios o IP
                viejas = sorted(self._fallos, key=lambda k: self._fallos[k][1])[:5_000]
                for c in viejas:
                    del self._fallos[c]

    def acierto(self, claves: Iterable[str]) -> None:
        with self._candado:
            for c in claves:
                self._fallos.pop(c, None)


class LimiteEnvios:
    """Deja hacer como mucho `maximo` envíos por clave (una IP) en cada ventana de `ventana` segundos.

    Frena el spam de los formularios públicos de la web. Como `LimiteIntentos`, vive en memoria.
    """

    def __init__(self, maximo: int = 5, ventana: float = 60 * 60, reloj: Callable[[], float] = time.monotonic):
        self.maximo, self.ventana, self.reloj = maximo, ventana, reloj
        self._envios: dict[str, list[float]] = {}
        self._candado = threading.Lock()

    def permitir(self, clave: str) -> bool:
        """Anota el envío y dice si cabe; si no cabe, no lo anota."""
        ahora = self.reloj()
        with self._candado:
            recientes = [t for t in self._envios.get(clave, []) if ahora - t < self.ventana]
            if len(recientes) >= self.maximo:
                self._envios[clave] = recientes
                return False
            self._envios[clave] = [*recientes, ahora]
            if len(self._envios) > 10_000:
                self._envios = {k: v for k, v in self._envios.items() if v and ahora - v[-1] < self.ventana}
            return True


_METODOS_SEGUROS = {"GET", "HEAD", "OPTIONS"}


class MismoOrigen:
    """Rechaza (403) las peticiones que cambian datos si el navegador dice que vienen de otro sitio (CSRF).

    Los navegadores mandan `Origin` (o al menos `Referer`) en los POST, PUT, PATCH y DELETE; si no coincide con el host
    al que va la petición, una página ajena está intentando actuar con la sesión del usuario. Las peticiones sin ninguna
    de las dos cabeceras no vienen de un formulario o script de otra web (las hacen la app offline o los tests).
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] not in _METODOS_SEGUROS:
            cabeceras = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope["headers"]}
            origen = cabeceras.get("origin") or cabeceras.get("referer")
            host = cabeceras.get("host", "")
            if origen and (origen == "null" or urlsplit(origen).netloc.lower() != host.lower()):
                await send({"type": "http.response.start", "status": 403,
                            "headers": [(b"content-type", b"application/json")]})
                await send({"type": "http.response.body",
                            "body": '{"detail":"Petición rechazada: no viene de esta web"}'.encode()})
                return
        await self.app(scope, receive, send)
