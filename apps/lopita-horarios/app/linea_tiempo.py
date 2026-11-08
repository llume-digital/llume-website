"""Línea de tiempo de lo publicado: qué horario manda en cada fecha.

Cada fecha tiene como mucho un horario publicado que manda en ella (tabla `dias_publicados`). Al publicar un horario
se queda con todos sus días, también los que ya tenía otro publicado, y lo que había pasa al historial
(`dias_historial`). Así, aunque haya dos horarios publicados sobre las mismas fechas, el equipo ve una sola versión
de cada día, y tocar el viejo no hace que vuelva a mandar.

`Store.list_schedules` y `Store.get_schedule` dejan en cada horario publicado `vigentes`: las fechas en las que manda.
Una fila sin `vigentes` (la que se arma a mano en algunos tests) se trata como si mandara en todo su periodo.
"""
from __future__ import annotations

import datetime as dt
from collections.abc import Iterable

from lopita_horarios.models import Schedule


def es_publicado(row: dict) -> bool:
    return row["estado"] == "publicado"


def fechas(row: dict) -> Iterable[dt.date]:
    """Las fechas en las que manda el horario: las suyas en la línea de tiempo si está publicado, todas si no."""
    h: Schedule = row["horario"]
    vigentes = row.get("vigentes")
    if es_publicado(row) and vigentes is not None:
        return sorted(vigentes)
    return (h.desde + dt.timedelta(days=i) for i in range((h.hasta - h.desde).days + 1))


def sustituido(row: dict) -> bool:
    """Publicado y sin ningún día en el que mande: otros horarios publicados después han ocupado todas sus fechas."""
    return es_publicado(row) and row.get("vigentes") is not None and not row["vigentes"]


def por_dia(rows: Iterable[dict], desde: dt.date | None = None, hasta: dt.date | None = None,
            solo_publicados: bool = False, excluir: int | None = None) -> dict[dt.date, dict]:
    """Para cada fecha, el horario que manda: el publicado de la línea de tiempo y, si no hay, el borrador más reciente.

    Entre filas sin `vigentes` gana, como antes, la modificada más tarde.
    """
    mejor: dict[dt.date, tuple[tuple, dict]] = {}
    for r in rows:
        if r["id"] == excluir or (solo_publicados and not es_publicado(r)):
            continue
        rank = (es_publicado(r), r.get("vigentes") is not None and es_publicado(r), r["updated_at"])
        for d in fechas(r):
            if (desde and d < desde) or (hasta and d > hasta):
                continue
            if d not in mejor or rank > mejor[d][0]:
                mejor[d] = (rank, r)
    return {d: r for d, (_, r) in sorted(mejor.items())}


def vigente(rows: Iterable[dict], h: Schedule) -> Schedule:
    """El horario 'h' con los turnos que valen hoy en sus fechas: en cada una, los del publicado que manda en ella
    (ninguno si la fecha se ha quedado sin horario publicado). Es lo que enseña un enlace viejo de Slack."""
    mandan = por_dia(rows, h.desde, h.hasta, solo_publicados=True)
    return h.model_copy(update={"asignaciones": [a for d, r in mandan.items() for a in r["horario"].asignaciones
                                                 if a.fecha == d]})
