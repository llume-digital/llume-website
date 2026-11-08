"""Comentarios sobre la app: cualquiera que haya entrado deja una sugerencia, un fallo o una duda desde la ventana
«Comentarios» y queda guardado en la propia app, con la pantalla desde la que se envió.

Los encargados los ven todos en la pestaña Comentarios, les cambian el estado (nuevo, en curso, hecho, descartado) y
pueden responder; cada persona ve los suyos con la respuesta. Así queda documentado qué se pidió y qué se hizo.
"""
from __future__ import annotations

import csv
import io
from collections.abc import Callable
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from .db import Store, now

TIPOS = {"sugerencia": "Sugerencia", "error": "Algo no funciona", "duda": "Duda"}
ESTADOS = {"nuevo": "Nuevo", "en_curso": "En curso", "hecho": "Hecho", "descartado": "Descartado"}


class ComentarioIn(BaseModel):
    tipo: Literal["sugerencia", "error", "duda"] = "sugerencia"
    texto: str = Field(min_length=3, max_length=4000)
    pantalla: Optional[str] = Field(default=None, max_length=200)


class ComentarioUpd(BaseModel):
    estado: Optional[Literal["nuevo", "en_curso", "hecho", "descartado"]] = None
    respuesta: Optional[str] = Field(default=None, max_length=4000)


def _fila(r) -> dict:
    return dict(r)


def nuevos(store: Store) -> int:
    with store.conn() as c:
        return c.execute("SELECT COUNT(*) FROM comentarios WHERE estado = 'nuevo'").fetchone()[0]


def registrar(app: FastAPI, store: Store, user: Callable, admin: Callable) -> None:
    @app.post("/api/comentarios")
    def crear(body: ComentarioIn, u=Depends(user)):
        texto = body.texto.strip()
        if len(texto) < 3:
            raise HTTPException(400, "Escribe el comentario")
        t = now()
        with store.conn() as c:
            cid = c.execute(
                "INSERT INTO comentarios (autor, nombre, rol, tipo, pantalla, texto, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (u["username"], u.get("nombre") or u["username"], u["rol"], body.tipo, body.pantalla, texto, t, t),
            ).lastrowid
            return _fila(c.execute("SELECT * FROM comentarios WHERE id = ?", (cid,)).fetchone())

    @app.get("/api/comentarios")
    def listar(u=Depends(user)):
        with store.conn() as c:
            if u["rol"] == "admin":
                rows = c.execute("SELECT * FROM comentarios ORDER BY id DESC").fetchall()
            else:
                rows = c.execute("SELECT * FROM comentarios WHERE autor = ? ORDER BY id DESC", (u["username"],)).fetchall()
        return [_fila(r) for r in rows]

    @app.patch("/api/comentarios/{cid}")
    def actualizar(cid: int, body: ComentarioUpd, u=Depends(admin)):
        with store.conn() as c:
            row = c.execute("SELECT * FROM comentarios WHERE id = ?", (cid,)).fetchone()
            if not row:
                raise HTTPException(404, "Comentario no encontrado")
            estado = body.estado or row["estado"]
            respuesta, por = row["respuesta"], row["respondido_por"]
            if body.respuesta is not None:
                respuesta = body.respuesta.strip() or None
                por = u["username"] if respuesta else None
            c.execute("UPDATE comentarios SET estado = ?, respuesta = ?, respondido_por = ?, updated_at = ? WHERE id = ?",
                      (estado, respuesta, por, now(), cid))
            return _fila(c.execute("SELECT * FROM comentarios WHERE id = ?", (cid,)).fetchone())

    @app.get("/api/comentarios.csv")
    def exportar(u=Depends(admin)):
        with store.conn() as c:
            rows = c.execute("SELECT * FROM comentarios ORDER BY id").fetchall()
        buf = io.StringIO()
        w = csv.writer(buf, delimiter=";")
        w.writerow(["Nº", "Fecha", "Quién", "Tipo", "Pantalla", "Comentario", "Estado", "Respuesta", "Actualizado"])
        for r in rows:
            w.writerow([r["id"], r["created_at"], r["nombre"], TIPOS.get(r["tipo"], r["tipo"]), r["pantalla"] or "",
                        r["texto"], ESTADOS.get(r["estado"], r["estado"]), r["respuesta"] or "", r["updated_at"]])
        return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": 'attachment; filename="comentarios.csv"'})
