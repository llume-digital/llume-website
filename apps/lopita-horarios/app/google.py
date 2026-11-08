"""Entrar con Google: comprueba el «ID token» que da el botón de Google (Google Identity Services).

Se valida aquí, sin librerías: firma RS256 con las claves públicas de Google, emisor, audiencia (el ID de cliente de
la app), caducidad y correo verificado. Funciona igual en el servidor y en el navegador (app offline con Pyodide),
donde las claves se descargan con una petición síncrona del propio navegador.
"""
from __future__ import annotations

import base64
import hashlib
import json
import sys
import time
from typing import Callable, Optional

CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs"
EMISORES = {"accounts.google.com", "https://accounts.google.com"}
_SHA256_DIGESTINFO = bytes.fromhex("3031300d060960864801650304020105000420")
_cache: dict = {"claves": None, "hasta": 0.0}


class TokenInvalido(ValueError):
    pass


def _b64(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _descargar(url: str) -> str:
    if sys.platform == "emscripten":  # navegador: XHR síncrono (la app corre en un worker)
        from pyodide.http import open_url  # type: ignore
        return open_url(url).read()
    import urllib.request
    with urllib.request.urlopen(url, timeout=10) as r:  # noqa: S310 (URL fija de Google)
        return r.read().decode()


def claves_google(descargar: Callable[[str], str] = _descargar) -> dict:
    """Claves públicas de Google por «kid», guardadas una hora."""
    if _cache["claves"] is None or time.time() > _cache["hasta"]:
        datos = json.loads(descargar(CERTS_URL))
        _cache["claves"] = {k["kid"]: k for k in datos["keys"] if k.get("kty") == "RSA"}
        _cache["hasta"] = time.time() + 3600
    return _cache["claves"]


def _rs256_ok(mensaje: bytes, firma: bytes, jwk: dict) -> bool:
    n = int.from_bytes(_b64(jwk["n"]), "big")
    e = int.from_bytes(_b64(jwk["e"]), "big")
    k = (n.bit_length() + 7) // 8
    if len(firma) != k:
        return False
    em = pow(int.from_bytes(firma, "big"), e, n).to_bytes(k, "big")
    t = _SHA256_DIGESTINFO + hashlib.sha256(mensaje).digest()
    esperado = b"\x00\x01" + b"\xff" * (k - len(t) - 3) + b"\x00" + t
    return len(t) + 11 <= k and em == esperado


def verificar(token: str, client_id: str, claves: Optional[dict] = None, ahora: Optional[float] = None) -> dict:
    """Devuelve los datos del token (sub, email, name...) o lanza TokenInvalido."""
    try:
        cab_b64, datos_b64, firma_b64 = token.split(".")
        cab = json.loads(_b64(cab_b64))
        datos = json.loads(_b64(datos_b64))
        firma = _b64(firma_b64)
    except Exception as exc:  # noqa: BLE001
        raise TokenInvalido("El token de Google no es válido") from exc
    if cab.get("alg") != "RS256":
        raise TokenInvalido("Algoritmo no admitido")
    if claves is not None:
        jwk = claves.get(cab.get("kid"))
    else:
        jwk = claves_google().get(cab.get("kid"))
        if jwk is None:  # Google ha rotado sus claves: se vuelven a pedir una vez
            _cache["claves"] = None
            jwk = claves_google().get(cab.get("kid"))
    if jwk is None or not _rs256_ok(f"{cab_b64}.{datos_b64}".encode(), firma, jwk):
        raise TokenInvalido("La firma del token de Google no es válida")
    ahora = time.time() if ahora is None else ahora
    if datos.get("iss") not in EMISORES:
        raise TokenInvalido("El token no lo ha emitido Google")
    if datos.get("aud") != client_id:
        raise TokenInvalido("El token es para otra aplicación")
    if float(datos.get("exp", 0)) < ahora - 60:
        raise TokenInvalido("El token de Google ha caducado: vuelve a intentarlo")
    if not datos.get("email") or datos.get("email_verified") not in (True, "true"):
        raise TokenInvalido("Tu cuenta de Google no tiene un correo verificado")
    return datos
