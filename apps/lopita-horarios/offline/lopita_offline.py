"""Servidor de la app dentro del navegador (Pyodide), para la versión offline de demostración.

Es la misma API FastAPI de `app.main`, pero en lugar de escuchar en un puerto recibe las peticiones
que la página le pasa desde el Web Worker y las resuelve con un cliente httpx sobre ASGI (sin red).
Las cookies (la de sesión) se guardan aquí como lo haría el navegador y se copian en disco para que la
sesión sobreviva a cerrar la app.

Diferencias del navegador que se cubren aquí, sin tocar la app:
- No hay hilos: FastAPI ejecuta los endpoints síncronos con `anyio.to_thread.run_sync`, que se sustituye
  por una llamada directa.
- Python no trae OpenSSL, así que falta `hashlib.pbkdf2_hmac` (contraseñas); se pone una versión en Python
  puro con el mismo resultado.
- El motor usa HiGHS porque OR-Tools no existe para Pyodide.
- Con datos compartidos («nube»), Slack va por el relevo del Worker (`<nube>/slack/…`, con XMLHttpRequest
  síncrono: estamos en un Web Worker y la petición es corta) y los calendarios .ics los sirve el Worker en
  `<nube>/cal/<token>.ics`; el worker de la página se los sube con `calendarios()` tras cada cambio.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
from http.cookies import SimpleCookie
from pathlib import Path

import anyio.to_thread
import httpx

from app.main import create_app
from app.slack import Slack

BASE = "http://lopita.offline"
USUARIO_DEMO = "admin"
CLAVE_DEMO = "lopita"


async def _en_el_mismo_hilo(func, *args, **_kwargs):
    return func(*args)


anyio.to_thread.run_sync = _en_el_mismo_hilo


def _pbkdf2_hmac(hash_name: str, password: bytes, salt: bytes, iterations: int, dklen: int | None = None) -> bytes:
    """PBKDF2-HMAC (RFC 8018) en Python puro; es la que traía hashlib antes de exigir OpenSSL."""
    interior, exterior = hashlib.new(hash_name), hashlib.new(hash_name)
    bloque = interior.block_size
    if len(password) > bloque:
        password = hashlib.new(hash_name, password).digest()
    password = password + b"\x00" * (bloque - len(password))
    interior.update(password.translate(bytes(x ^ 0x36 for x in range(256))))
    exterior.update(password.translate(bytes(x ^ 0x5C for x in range(256))))

    def prf(msg: bytes) -> bytes:
        i, o = interior.copy(), exterior.copy()
        i.update(msg)
        o.update(i.digest())
        return o.digest()

    dklen = dklen or exterior.digest_size
    clave, n = b"", 1
    while len(clave) < dklen:
        u = prf(salt + n.to_bytes(4, "big"))
        acumulado = int.from_bytes(u, "big")
        for _ in range(iterations - 1):
            u = prf(u)
            acumulado ^= int.from_bytes(u, "big")
        clave += acumulado.to_bytes(exterior.digest_size, "big")
        n += 1
    return clave[:dklen]


if not hasattr(hashlib, "pbkdf2_hmac"):
    hashlib.pbkdf2_hmac = _pbkdf2_hmac

_cliente: httpx.AsyncClient | None = None
_datos: Path | None = None
_cookies: dict[str, str] = {}


class _TransporteXHR(httpx.BaseTransport):
    """httpx sobre XMLHttpRequest síncrono (solo vale dentro de un Web Worker, que es donde corre esto)."""

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        from js import XMLHttpRequest  # solo existe en Pyodide

        x = XMLHttpRequest.new()
        x.open(request.method, str(request.url), False)
        for k, v in request.headers.items():
            if k.lower() not in ("host", "content-length", "accept-encoding", "connection", "user-agent"):
                x.setRequestHeader(k, v)
        cuerpo = request.read()
        try:
            x.send(cuerpo.decode("utf-8") if cuerpo else None)
        except Exception as exc:  # sin red: XMLHttpRequest lanza NetworkError
            raise httpx.ConnectError(str(exc), request=request) from None
        cabeceras = [tuple(l.split(":", 1)) for l in str(x.getAllResponseHeaders()).strip().split("\r\n") if ":" in l]
        return httpx.Response(x.status, headers=[(k.strip(), v.strip()) for k, v in cabeceras
                                                 if k.strip().lower() != "content-encoding"],
                              content=str(x.responseText).encode("utf-8"), request=request)


_app = None


def iniciar(datos: str, segundos_motor: float = 60.0, nube: str | None = None, clave: str | None = None) -> dict:
    """Crea (o abre) la base de datos de la demo en `datos` y prepara la app.

    `nube` es la dirección base de los datos compartidos (…/nube/), si los hay, y `clave` la de acceso.
    """
    global _cliente, _datos, _app
    _datos = Path(datos)
    _datos.mkdir(parents=True, exist_ok=True)
    secreto = _datos / "secreto"
    if not secreto.exists():
        secreto.write_text(secrets.token_hex(32), encoding="utf-8")

    slack = None
    if nube:
        nube = nube.rstrip("/")
        os.environ["LOPITA_CAL_URL"] = f"{nube}/cal"
        slack = Slack(relay=f"{nube}/slack", relay_key=clave, transport=_TransporteXHR())
    app = create_app(db_path=str(_datos / "lopita.db"), secret=secreto.read_text(encoding="utf-8"),
                     solve_seconds=segundos_motor, slack=slack,
                     # El motor corre en el dispositivo y atiende las peticiones de una en una: el arreglo tras una
                     # ausencia va aparte (POST /api/arreglos) y con menos tiempo, para no bloquear la app minutos.
                     arreglos_aparte=True, arreglo_seconds=min(segundos_motor, 20))
    _app = app
    store = app.state.store
    if not store.users():
        store.upsert_user(USUARIO_DEMO, CLAVE_DEMO, "Administrador")
    _cliente = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url=BASE)
    _cargar_cookies()
    return {"usuario": USUARIO_DEMO, "clave": CLAVE_DEMO}


def calendarios() -> str:
    """JSON {token: contenido .ics} de los calendarios creados, para subirlos al Worker."""
    if _app is None:
        raise RuntimeError("La app no se ha iniciado")
    return json.dumps(_app.state.calendarios(), ensure_ascii=False, sort_keys=True)


async def peticion(metodo: str, ruta: str, cabeceras: dict, cuerpo=None) -> dict:
    """Atiende una petición de la página y devuelve estado, cabeceras y cuerpo.

    `cuerpo` llega como bytes o, desde el worker, como un Uint8Array de JavaScript (JsProxy).
    """
    if _cliente is None:
        raise RuntimeError("La app no se ha iniciado")
    if cuerpo is not None and not isinstance(cuerpo, (bytes, bytearray)):
        cuerpo = cuerpo.to_bytes()
    cabeceras = {k: v for k, v in cabeceras.items() if k.lower() not in ("cookie", "accept-encoding")}
    cabeceras["accept-encoding"] = "identity"  # sin red de por medio, comprimir solo gastaría tiempo del móvil
    if _cookies:
        cabeceras["cookie"] = "; ".join(f"{k}={v}" for k, v in _cookies.items())
    r = await _cliente.request(metodo, ruta, headers=cabeceras, content=cuerpo or None)
    _cliente.cookies.clear()  # las cookies se llevan aquí, no en el tarro de httpx
    nuevas = r.headers.get_list("set-cookie")
    if nuevas:
        _recibir_cookies(nuevas)
    return {"estado": r.status_code, "cabeceras": [[k, v] for k, v in r.headers.items() if k != "set-cookie"],
            "cuerpo": r.content}


def _recibir_cookies(cabeceras: list[str]) -> None:
    for cabecera in cabeceras:
        for nombre, morsel in SimpleCookie(cabecera).items():
            caducada = morsel["max-age"] in ("0", "-1") or "1970" in morsel["expires"]
            if caducada:
                _cookies.pop(nombre, None)
            else:
                _cookies[nombre] = morsel.value
    _fichero_cookies().write_text(json.dumps(_cookies), encoding="utf-8")


def _fichero_cookies() -> Path:
    assert _datos is not None
    return _datos / "cookies.json"


def _cargar_cookies() -> None:
    f = _fichero_cookies()
    _cookies.clear()
    if f.exists():
        _cookies.update(json.loads(f.read_text(encoding="utf-8")))
