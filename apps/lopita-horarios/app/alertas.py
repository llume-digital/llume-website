"""Alertas del encargado que dependen de datos fuera del horario (solicitudes, avisos, saldo, estado de publicación)."""
from __future__ import annotations

import datetime as dt
import hashlib
import threading
from collections import OrderedDict, defaultdict
from typing import Optional

from lopita_horarios.alertas import Alerta, Categoria, _alerta, _fecha, _lista, evaluar, ordenar, regenerar_desde, resumen
from lopita_horarios.cambios import firma
from lopita_horarios.models import Assignment, Config, Schedule



def _huella(texto: str) -> str:
    return hashlib.blake2b(texto.encode(), digest_size=16).hexdigest()


class CacheEvaluaciones:
    """Recuerda el resultado de `evaluar` para no recalcular las alertas de cada horario en cada petición.

    `evaluar` es una función pura de (configuración, horario, asignaciones previas), así que la clave es el contenido
    de esos tres: si cualquiera cambia (una edición, una nueva versión de la configuración o un cambio en el horario
    anterior), la clave cambia y se recalcula. No hace falta invalidar nada a mano.
    """

    def __init__(self, capacidad: int = 512):
        self._capacidad = capacidad
        self._datos: OrderedDict[tuple, list[Alerta]] = OrderedDict()
        self._candado = threading.Lock()

    @staticmethod
    def clave_config(config: Config) -> str:
        return _huella(config.model_dump_json())

    def evaluar(self, config: Config, horario: Schedule, previo: Optional[list[Assignment]],
                clave_config: Optional[str] = None) -> list[Alerta]:
        previo_clave = None if previo is None else hash(tuple((a.empleado_id, a.fecha, firma(a)) for a in previo))
        clave = (clave_config or self.clave_config(config), _huella(horario.model_dump_json()), previo_clave)
        with self._candado:
            if clave in self._datos:
                self._datos.move_to_end(clave)
                return list(self._datos[clave])
        alertas = evaluar(config, horario, previo)
        with self._candado:
            self._datos[clave] = alertas
            while len(self._datos) > self._capacidad:
                self._datos.popitem(last=False)
        return list(alertas)


def contexto(config: Config, row: dict, solicitudes: list[dict], avisos_sin_leer: list[dict],
             saldo_esperado: dict[str, float], hoy: dt.date) -> list[Alerta]:
    h: Schedule = row["horario"]
    publicado = row["estado"] == "publicado"
    nombre = lambda emp: next((e.nombre for e in config.empleados if e.id == emp), emp)  # noqa: E731
    out: list[Alerta] = []

    if publicado and row["cambios_pendientes"]:
        quienes = _lista([nombre(e) for e in row["cambios_pendientes"]])
        out.append(_alerta(
            "cambios_sin_avisar", Categoria.contexto, 65, "Cambios sin avisar por Slack",
            f"Has cambiado el horario publicado de {quienes} y todavía no se lo has notificado por Slack.",
            clave="cambios_sin_avisar::", sugerencia="Pulsa «Avisar por Slack» para notificar solo a quien le afecta.",
            silenciable=False))

    for r in solicitudes:
        d = r["datos"]
        desde, hasta = dt.date.fromisoformat(d["desde"]), dt.date.fromisoformat(d["hasta"])
        if desde > h.hasta or hasta < h.desde:
            continue
        inicio = max(desde, h.desde)
        out.append(_alerta(
            "solicitud_pendiente", Categoria.contexto, 55 if publicado else 45, "Solicitud pendiente que afecta a este horario",
            f"{nombre(r['empleado_id'])} ha pedido {d['motivo']} del {_fecha(desde)} al {_fecha(hasta)}, "
            f"que coincide con este horario. Si la apruebas, habrá que regenerarlo a partir del {_fecha(inicio)}.",
            empleado_id=r["empleado_id"], fecha=desde, fecha_fin=hasta, clave=f"solicitud_pendiente:{r['empleado_id']}:{r['id']}",
            sugerencia="Resuélvela en Solicitudes.", silenciable=False))

    if config.reglas.arrastrar_saldo:
        cambiados = [e for e in set(saldo_esperado) | set(h.saldo_anterior)
                     if abs(saldo_esperado.get(e, 0) - h.saldo_anterior.get(e, 0)) >= 0.5]
        if cambiados:
            partes = [f"{nombre(e)} ({h.saldo_anterior.get(e, 0):+g} h → {saldo_esperado.get(e, 0):+g} h)" for e in sorted(cambiados)]
            out.append(_alerta(
                "saldo_desactualizado", Categoria.desfase, 50, "Saldo de horas desactualizado",
                f"El saldo arrastrado del periodo anterior ha cambiado (por ejemplo, tras aprobar correcciones de horas): "
                f"{_lista(partes)}. Este horario se calculó con el saldo antiguo: regenéralo a partir del {_fecha(h.desde)}.",
                regenerar_desde=h.desde, clave="saldo_desactualizado::", silenciable=False))

    por_persona: dict[str, list[dt.date]] = defaultdict(list)
    for a in avisos_sin_leer:
        if a["schedule_id"] == row["id"] and a["tipo"] == "turno" and dt.date.fromisoformat(a["fecha"]) >= hoy:
            por_persona[a["empleado_id"]].append(dt.date.fromisoformat(a["fecha"]))
    if por_persona:
        proxima = min(min(f) for f in por_persona.values())
        dias = (proxima - hoy).days
        imp = 62 if dias <= 2 else 45 if dias <= 7 else 30
        out.append(_alerta(
            "cambios_sin_leer", Categoria.contexto, imp, "Cambios que el equipo aún no ha visto",
            f"{_lista([nombre(e) for e in sorted(por_persona)])} no ha{'n' if len(por_persona) > 1 else ''} marcado como "
            f"visto{'s' if len(por_persona) > 1 else ''} el cambio de su turno; el más cercano es el {_fecha(proxima)}.",
            clave="cambios_sin_leer::", sugerencia="Avísales por Slack o habla con ellos.", silenciable=False))
    return out


def informe(alertas: list[Alerta], reconocidas: dict[str, dict]) -> dict:
    """Separa las alertas activas de las que el encargado ya ha reconocido (si su contenido cambia, vuelven a estar activas)."""
    activas, vistas = [], []
    for a in ordenar(alertas):
        r = reconocidas.get(a.clave)
        d = a.model_dump(mode="json")
        if r and r["huella"] == a.huella:
            vistas.append({**d, "reconocida": {"usuario": r["usuario"], "nota": r["nota"], "fecha": r["created_at"]}})
        else:
            activas.append({**d, "cambiada": bool(r)})
    activas_obj = [a for a in alertas if not (a.clave in reconocidas and reconocidas[a.clave]["huella"] == a.huella)]
    desde = regenerar_desde(activas_obj)
    return {"resumen": resumen(activas_obj), "regenerar_desde": desde.isoformat() if desde else None,
            "activas": activas, "reconocidas": vistas}
