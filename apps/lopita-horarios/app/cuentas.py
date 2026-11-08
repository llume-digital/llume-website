"""Cuentas: correo de cada usuario, entrar y registrarse con Google, y restablecer contraseñas.

- Cada usuario asocia su correo en «Mi cuenta». Si ese correo es el de su cuenta de Google, puede entrar con Google.
- Quien entra con Google sin tener cuenta queda como registro pendiente: un encargado lo aprueba (eligiendo si es
  encargado o trabajador, y quién es del equipo) o lo rechaza. Nadie entra solo por tener cuenta de Google.
- Un encargado puede poner una contraseña temporal a otra persona (que la cambiará al entrar): es la forma de
  recuperar el acceso sin correo.
- El ID de cliente de Google lo pega el encargado en Ajustes (o llega por LOPITA_GOOGLE_CLIENT_ID).
"""
from __future__ import annotations

import os
import re
import secrets
from collections.abc import Callable
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from . import google
from .db import Store
from .seguridad import LimiteIntentos

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CLIENT_ID_RE = re.compile(r"^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$")


class GoogleIn(BaseModel):
    credential: str = Field(min_length=20, max_length=8000)


class CuentaIn(BaseModel):
    email: Optional[str] = Field(default=None, max_length=200)
    nombre: Optional[str] = Field(default=None, max_length=100)


class ResetIn(BaseModel):
    password: str


class EmailIn(BaseModel):
    email: Optional[str] = Field(default=None, max_length=200)


class AprobarIn(BaseModel):
    usuario: str = Field(min_length=1, max_length=60)
    nombre: Optional[str] = Field(default=None, max_length=100)
    rol: Literal["admin", "empleado"] = "empleado"
    empleado_id: Optional[str] = None


class GoogleCfgIn(BaseModel):
    client_id: Optional[str] = Field(default=None, max_length=200)


def limpiar_email(email: Optional[str]) -> Optional[str]:
    email = (email or "").strip().lower()
    if not email:
        return None
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "Ese correo no parece válido")
    return email


def client_id(store: Store) -> Optional[str]:
    return os.environ.get("LOPITA_GOOGLE_CLIENT_ID") or store.ajuste("google_client_id") or None


def registrar(app: FastAPI, store: Store, user: Callable, admin: Callable, intentos: LimiteIntentos,
              config_now: Callable) -> None:

    def email_libre(email: Optional[str], username: str) -> None:
        if email:
            otro = store.user_by_email(email)
            if otro and otro["username"] != username:
                raise HTTPException(400, f"Ese correo ya está asociado a otra cuenta ({otro['username']})")

    @app.get("/api/acceso")
    def acceso():
        """Público: lo que necesita la pantalla de entrada (si hay botón de Google)."""
        return {"google_client_id": client_id(store)}

    @app.post("/api/login/google")
    def login_google(body: GoogleIn, request: Request):
        cid = client_id(store)
        if not cid:
            raise HTTPException(400, "Entrar con Google no está activado")
        ip = f"ip:{request.client.host if request.client else '?'}"
        if intentos.segundos_de_espera([ip]) > 0:
            raise HTTPException(429, "Demasiados intentos. Prueba de nuevo en unos minutos.")
        try:
            datos = google.verificar(body.credential, cid)
        except google.TokenInvalido as exc:
            intentos.fallo([ip])
            raise HTTPException(401, str(exc))
        except Exception:  # noqa: BLE001  (sin red para descargar las claves de Google, etc.)
            raise HTTPException(503, "No se ha podido comprobar la cuenta de Google. Inténtalo de nuevo.")
        email = datos["email"].lower()
        u = store.user_by_google(datos["sub"]) or store.user_by_email(email)
        if not u:
            if any(a["google_sub"] == datos["sub"] and a["estado"] == "rechazado" for a in store.accesos(None)):
                raise HTTPException(403, "Un encargado ha rechazado el acceso de esta cuenta de Google")
            ya = any(a["google_sub"] == datos["sub"] for a in store.accesos())
            acc = store.pedir_acceso(email, datos.get("name"), datos["sub"])
            if not ya:
                store.create_notification(
                    "acceso_pedido", None, f"{datos.get('name') or email} pide acceso",
                    f"{datos.get('name') or 'Alguien'} ({email}) se ha registrado con Google. Apruébalo o recházalo en "
                    "Ajustes → Cuentas de acceso.", {"acceso": acc["id"], "email": email})
            return {"pendiente": True, "email": email, "nombre": datos.get("name")}
        intentos.acierto([ip])
        store.set_google(u["username"], datos["sub"])
        if not u["email"]:
            store.set_email(u["username"], email)
        if u["cambiar_clave"]:  # con Google ya ha demostrado quién es: la temporal sobra
            store.set_password(u["username"], secrets.token_urlsafe(24))
        request.session.clear()
        request.session["user"] = {"username": u["username"]}
        request.session["google"] = True
        return store.get_user(u["username"])

    @app.put("/api/mi/cuenta")
    def mi_cuenta(body: CuentaIn, u=Depends(user)):
        email = limpiar_email(body.email)
        email_libre(email, u["username"])
        if email != (u["email"] or None) and u["google"]:
            store.set_google(u["username"], None)  # el correo nuevo tendrá que volver a vincularse con Google
        store.set_email(u["username"], email)
        if body.nombre is not None and body.nombre.strip():
            with store.conn() as c:
                c.execute("UPDATE users SET nombre=? WHERE username=?", (body.nombre.strip(), u["username"]))
        return store.get_user(u["username"])

    @app.post("/api/mi/google")
    def vincular(body: GoogleIn, u=Depends(user)):
        """Vincula la cuenta de Google con la que se pulsa el botón a la cuenta con la que ya se ha entrado."""
        cid = client_id(store)
        if not cid:
            raise HTTPException(400, "Entrar con Google no está activado")
        try:
            datos = google.verificar(body.credential, cid)
        except google.TokenInvalido as exc:
            raise HTTPException(401, str(exc))
        except Exception:  # noqa: BLE001
            raise HTTPException(503, "No se ha podido comprobar la cuenta de Google. Inténtalo de nuevo.")
        otro = store.user_by_google(datos["sub"])
        if otro and otro["username"] != u["username"]:
            raise HTTPException(400, f"Esa cuenta de Google ya está vinculada a otro usuario ({otro['username']})")
        if not u["email"]:
            email = datos["email"].lower()
            if not store.user_by_email(email):
                store.set_email(u["username"], email)
        store.set_google(u["username"], datos["sub"])
        return store.get_user(u["username"])

    @app.delete("/api/mi/google")
    def desvincular(u=Depends(user)):
        store.set_google(u["username"], None)
        return store.get_user(u["username"])

    @app.post("/api/usuarios/{username}/clave")
    def restablecer(username: str, body: ResetIn, u=Depends(admin)):
        if username == u["username"]:
            raise HTTPException(400, "Tu propia contraseña cámbiala en «Mi cuenta»")
        if not store.get_user(username):
            raise HTTPException(404, "No existe ese usuario")
        if len(body.password) < 8:
            raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
        store.set_password(username, body.password, cambiar_clave=True)
        return store.users()

    @app.put("/api/usuarios/{username}/email")
    def email_de(username: str, body: EmailIn, u=Depends(admin)):
        if not store.get_user(username):
            raise HTTPException(404, "No existe ese usuario")
        email = limpiar_email(body.email)
        email_libre(email, username)
        store.set_email(username, email)
        return store.users()

    @app.get("/api/accesos")
    def accesos(u=Depends(admin)):
        return store.accesos()

    @app.post("/api/accesos/{aid}/aprobar")
    def aprobar(aid: int, body: AprobarIn, u=Depends(admin)):
        acc = store.get_acceso(aid)
        if not acc or acc["estado"] != "pendiente":
            raise HTTPException(404, "Ese registro ya no está pendiente")
        username = body.usuario.strip()
        if store.get_user(username):
            raise HTTPException(400, "Ya hay una cuenta con ese usuario: elige otro")
        email_libre(acc["email"], username)
        emp_id = None
        if body.rol == "empleado":
            if body.empleado_id not in {e.id for e in config_now().empleados}:
                raise HTTPException(400, "Elige a qué persona del equipo corresponde esta cuenta")
            if any(x["empleado_id"] == body.empleado_id for x in store.users()):
                raise HTTPException(400, "Esa persona ya tiene cuenta")
            emp_id = body.empleado_id
        store.upsert_user(username, secrets.token_urlsafe(24), (body.nombre or acc["nombre"] or username).strip(),
                          rol=body.rol, empleado_id=emp_id)
        store.set_email(username, acc["email"])
        store.set_google(username, acc["google_sub"])
        store.resolver_acceso(aid, "aprobado", u["username"], username)
        return {"accesos": store.accesos(), "usuarios": store.users()}

    @app.post("/api/accesos/{aid}/rechazar")
    def rechazar(aid: int, u=Depends(admin)):
        acc = store.get_acceso(aid)
        if not acc or acc["estado"] != "pendiente":
            raise HTTPException(404, "Ese registro ya no está pendiente")
        store.resolver_acceso(aid, "rechazado", u["username"])
        return {"accesos": store.accesos(), "usuarios": store.users()}

    @app.get("/api/ajustes/google")
    def google_cfg(u=Depends(admin)):
        return {"client_id": client_id(store), "desde_entorno": bool(os.environ.get("LOPITA_GOOGLE_CLIENT_ID"))}

    @app.put("/api/ajustes/google")
    def set_google_cfg(body: GoogleCfgIn, u=Depends(admin)):
        cid = (body.client_id or "").strip() or None
        if cid and not CLIENT_ID_RE.match(cid):
            raise HTTPException(400, "Eso no parece un ID de cliente de Google (acaba en .apps.googleusercontent.com)")
        store.set_ajuste("google_client_id", cid)
        return {"client_id": client_id(store), "desde_entorno": bool(os.environ.get("LOPITA_GOOGLE_CLIENT_ID"))}
