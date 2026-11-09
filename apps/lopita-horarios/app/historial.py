"""Historial de lo publicado en unas fechas: qué versiones mandaron en ellas, cuántos días y hasta cuándo.

Sale de la línea de tiempo (`dias_publicados`, lo que manda hoy) y de `dias_historial` (lo que mandaba antes y quién
lo sustituyó). Cada versión es un horario guardado: se puede abrir, comparar con lo de hoy y restaurar como borrador.
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict

from .db import Store


def versiones(store: Store, desde: dt.date, hasta: dt.date) -> list[dict]:
    """Horarios que mandan o mandaron en alguna fecha de [desde, hasta], del más reciente al más antiguo."""
    filas = {r["id"]: r for r in store.list_schedules()}
    ahora: dict[int, list[dt.date]] = defaultdict(list)
    for d, sid in store.timeline().items():
        if desde <= d <= hasta:
            ahora[sid].append(d)
    antes: dict[int, list[dict]] = defaultdict(list)
    for h in store.history_between(desde, hasta):
        antes[h["schedule_id"]].append(h)
    out = []
    for sid in set(ahora) | set(antes):
        r = filas.get(sid)
        if not r:
            continue  # borrado
        hist = antes.get(sid, [])
        out.append({
            "id": sid, "nombre": r.get("nombre"), "estado": r["estado"],
            "desde": r["horario"].desde, "hasta": r["horario"].hasta,
            "publicado": r.get("published_at"), "creado": r["created_at"],
            "dias_ahora": len(ahora.get(sid, [])),
            "dias_antes": len({h["fecha"] for h in hist}),
            "sustituido_at": max((h["hasta_at"] for h in hist), default=None),
            "sustituido_por": sorted({h["sustituido_por"] for h in hist if h["sustituido_por"]}),
        })
    out.sort(key=lambda v: (v["publicado"] or v["creado"], v["id"]), reverse=True)
    return out
