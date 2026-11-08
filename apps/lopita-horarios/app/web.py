"""Rutas que sirven a la web pública de Lopita: sus formularios (candidaturas y catering) y la carta en PDF.

Los formularios no necesitan sesión: los manda cualquier visitante. Por eso validan todo en el servidor, limitan los
envíos por IP y descartan en silencio los que rellenan el campo trampa (`web`), que solo ven los robots. Lo que llega
lo ve el encargado en la pestaña Web de la app.
"""
from __future__ import annotations

import base64
import binascii
import datetime as dt
import hmac
import os
import re
from collections.abc import Callable
from typing import Literal, Optional
from urllib.parse import quote

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .db import Store
from .seguridad import LimiteEnvios

MAX_ADJUNTO = 5 * 1024 * 1024
_B64_MAX = MAX_ADJUNTO * 4 // 3 + 8

# Tipo MIME → cómo empiezan esos ficheros. Se mira el contenido: la extensión y el tipo los elige quien envía.
_CV = {
    "application/pdf": (b"%PDF-",),
    "application/msword": (b"\xd0\xcf\x11\xe0",),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (b"PK\x03\x04",),
}
DOCUMENTOS = {"carta-cafeteria": "Carta de cafetería", "carta-comidas": "Carta de comidas"}
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class AdjuntoIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    tipo: str = Field(max_length=120)
    datos: str = Field(max_length=_B64_MAX, description="Contenido en base64")


class _FormularioIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=200)
    telefono: Optional[str] = Field(default=None, max_length=30)
    acepto_privacidad: bool = False
    web: str = Field(default="", max_length=200, description="Campo trampa: las personas no lo ven y lo dejan vacío")


class CandidaturaIn(_FormularioIn):
    mensaje: Optional[str] = Field(default=None, max_length=2000)
    cv: AdjuntoIn


class CateringIn(_FormularioIn):
    mensaje: str = Field(min_length=1, max_length=4000)
    fecha: Optional[dt.date] = None
    personas: Optional[int] = Field(default=None, ge=1, le=2000)


class EstadoIn(BaseModel):
    estado: Literal["nuevo", "atendido", "archivado"]


class DocumentoIn(BaseModel):
    nombre: str = Field(min_length=1, max_length=200)
    datos: str = Field(max_length=(10 * 1024 * 1024) * 4 // 3 + 8, description="PDF en base64")


def _decodificar(b64: str, limite: int) -> bytes:
    try:
        datos = base64.b64decode(b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "El archivo no ha llegado bien; vuelve a adjuntarlo") from None
    if not datos:
        raise HTTPException(400, "El archivo está vacío")
    if len(datos) > limite:
        raise HTTPException(413, f"El archivo pesa más de {limite // (1024 * 1024)} MB")
    return datos


def _limpio(texto: Optional[str]) -> Optional[str]:
    texto = (texto or "").strip()
    return texto or None


def _nombre_fichero(nombre: str) -> str:
    return re.sub(r"[^\w.\- ]", "_", nombre).strip() or "archivo"


def _descarga(nombre: str, tipo: str, datos: bytes, adjunto: bool) -> Response:
    modo = "attachment" if adjunto else "inline"
    return Response(datos, media_type=tipo, headers={
        "Content-Disposition": f"{modo}; filename*=UTF-8''{quote(_nombre_fichero(nombre))}",
        "X-Content-Type-Options": "nosniff",
    })


def registrar(app: FastAPI, store: Store, admin: Callable[..., dict], limite: LimiteEnvios | None = None,
              proxy_secreto: str | None = None) -> None:
    limite = limite or LimiteEnvios()
    # Si la web está en otro sitio (Cloudflare Pages), sus formularios llegan reenviados por su función y todos traerían
    # la misma IP. La función manda la IP del visitante en X-Lopita-IP, y solo se cree si trae el secreto compartido.
    proxy_secreto = proxy_secreto if proxy_secreto is not None else os.environ.get("LOPITA_PROXY_SECRETO") or None

    def ip_visitante(request: Request) -> str:
        enviado = request.headers.get("x-lopita-proxy", "")
        if proxy_secreto and enviado and hmac.compare_digest(enviado.encode(), proxy_secreto.encode()):
            return request.headers.get("x-lopita-ip", "?")[:64]
        return request.client.host if request.client else "?"

    def comprobar(body: _FormularioIn, request: Request) -> bool:
        """Valida lo común; devuelve False si es un robot (se responde bien pero no se guarda)."""
        if body.web:
            return False
        if not _EMAIL.match(body.email.strip()):
            raise HTTPException(400, "Revisa el correo electrónico")
        if not body.acepto_privacidad:
            raise HTTPException(400, "Para enviarlo tienes que aceptar la política de privacidad")
        if not limite.permitir(f"ip:{ip_visitante(request)}"):
            raise HTTPException(429, "Has enviado varios formularios seguidos; prueba de nuevo dentro de un rato")
        return True

    # ------------------------------------------------------------------ formularios públicos
    @app.post("/api/web/candidatura")
    def enviar_candidatura(body: CandidaturaIn, request: Request):
        if body.cv.tipo not in _CV:
            raise HTTPException(400, "El CV tiene que ser un PDF o un documento de Word")
        datos = _decodificar(body.cv.datos, MAX_ADJUNTO)
        if not datos.startswith(_CV[body.cv.tipo]):
            raise HTTPException(400, "El CV tiene que ser un PDF o un documento de Word")
        if comprobar(body, request):
            store.create_web_message("candidatura", body.nombre.strip(), body.email.strip(), _limpio(body.telefono),
                                     {"mensaje": _limpio(body.mensaje)},
                                     adjunto=(_nombre_fichero(body.cv.nombre), body.cv.tipo, datos))
        return {"ok": True}

    @app.post("/api/web/catering")
    def enviar_catering(body: CateringIn, request: Request):
        if comprobar(body, request):
            store.create_web_message("catering", body.nombre.strip(), body.email.strip(), _limpio(body.telefono),
                                     {"mensaje": body.mensaje.strip(),
                                      "fecha": body.fecha.isoformat() if body.fecha else None,
                                      "personas": body.personas})
        return {"ok": True}

    @app.get("/api/web/documentos/{clave}")
    def ver_documento(clave: str):
        doc = store.web_document(clave) if clave in DOCUMENTOS else None
        if not doc:
            raise HTTPException(404, "Documento no disponible")
        nombre, tipo, datos = doc
        return _descarga(nombre, tipo, datos, adjunto=False)

    # ------------------------------------------------------------------ panel del encargado
    @app.get("/api/web/mensajes")
    def listar_mensajes(tipo: Optional[Literal["candidatura", "catering"]] = None, u=Depends(admin)):
        return store.web_messages(tipo=tipo)

    @app.get("/api/web/mensajes/{mid}/adjunto")
    def descargar_adjunto(mid: int, u=Depends(admin)):
        adj = store.web_message_attachment(mid)
        if not adj:
            raise HTTPException(404, "Este mensaje no tiene archivo")
        return _descarga(*adj, adjunto=True)

    @app.post("/api/web/mensajes/{mid}/estado")
    def marcar_mensaje(mid: int, body: EstadoIn, u=Depends(admin)):
        if not store.web_message(mid):
            raise HTTPException(404, "Mensaje no encontrado")
        store.set_web_message_state(mid, body.estado, u["username"])
        return store.web_message(mid)

    @app.delete("/api/web/mensajes/{mid}")
    def borrar_mensaje(mid: int, u=Depends(admin)):
        store.delete_web_message(mid)
        return {"ok": True}

    @app.get("/api/web/documentos")
    def listar_documentos(u=Depends(admin)):
        subidos = {d["clave"]: d for d in store.web_documents()}
        return [{"clave": k, "titulo": t, **({"nombre": subidos[k]["nombre"], "bytes": subidos[k]["bytes"],
                                              "updated_at": subidos[k]["updated_at"]} if k in subidos else {})}
                for k, t in DOCUMENTOS.items()]

    @app.put("/api/web/documentos/{clave}")
    def subir_documento(clave: str, body: DocumentoIn, u=Depends(admin)):
        if clave not in DOCUMENTOS:
            raise HTTPException(404, "Documento desconocido")
        datos = _decodificar(body.datos, 10 * 1024 * 1024)
        if not datos.startswith(b"%PDF-"):
            raise HTTPException(400, "La carta tiene que ser un PDF")
        store.save_web_document(clave, _nombre_fichero(body.nombre), "application/pdf", datos, u["username"])
        return listar_documentos(u)
