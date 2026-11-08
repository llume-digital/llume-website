"""Horarios que valen: generar con reintentos y arreglar los que una ausencia ha dejado sin gente.

Orquesta el dominio (generacion.asegurar) con la base de datos y deja una notificación al encargado cuando
algo necesita su atención: una generación que sigue con alertas críticas tras los reintentos, o un arreglo
preparado tras una ausencia. Nunca publica: un horario publicado solo cambia cuando el encargado publica el
arreglo (un borrador que lo sustituye); hasta entonces el equipo sigue viendo el que había.
"""
from __future__ import annotations

import datetime as dt
from typing import Optional

from lopita_horarios.criticas import Problema
from lopita_horarios.generacion import Resultado, asegurar
from lopita_horarios.models import Config, Lock, Schedule
from lopita_horarios.solucionador import congelar_antes
from lopita_horarios.solver import SolveOptions

from . import horas, linea_tiempo
from .db import Store

_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


def periodo(h: Schedule) -> str:
    return f"del {h.desde.day:02d}/{h.desde.month:02d} al {h.hasta.day:02d}/{h.hasta.month:02d}"


def primer_dia_cambiable(estado: str, h: Schedule, hoy: dt.date) -> dt.date:
    """Lo ya pasado no se toca; en un horario publicado tampoco el día de hoy, que ya está en marcha."""
    return max(h.desde, hoy + dt.timedelta(days=1) if estado == "publicado" else hoy)


def _texto(p: Problema) -> str:
    return p.texto + (f" {p.causa}" if p.causa else "")


def informe(res: Resultado) -> dict:
    """Lo que la interfaz necesita para contar qué ha pasado al generar o arreglar."""
    return {"valido": res.valido, "motivo": res.motivo,
            "intentos": [i.model_dump(mode="json") for i in res.intentos],
            "reintentos": sum(1 for i in res.intentos if i.metodo != "generar"),
            "problemas": [_texto(p) for p in res.problemas]}


def generar(store: Store, config: Config, desde: dt.date, hasta: dt.date, *, segundos: float,
            excluir: Optional[int] = None, bloqueos: Optional[list[Lock]] = None,
            congelados: Optional[list[Lock]] = None, partir_de: Optional[Schedule] = None,
            cambiable_desde: Optional[dt.date] = None) -> Resultado:
    """Genera (o arregla 'partir_de') con el contexto de la base de datos: periodo anterior y saldo de horas."""
    previo = store.assignments_around(desde, hasta, exclude=excluir)
    saldo = horas.saldo_arrastrado(config, store.previous_contiguous(desde, exclude=excluir),
                                   store.list_requests(tipo="correccion", estado="aprobada"))
    return asegurar(config, partir_de, desde=desde, hasta=hasta, opciones=SolveOptions(max_segundos=segundos),
                    previo=previo, bloqueos=bloqueos, saldo_horas=saldo, congelados=congelados,
                    cambiable_desde=cambiable_desde)


def _lista_problemas(res: Resultado) -> str:
    n = len(res.problemas)
    return f"{n} alerta{'s' if n != 1 else ''} crítica{'s' if n != 1 else ''}"


def notificar_generacion(store: Store, sid: int, res: Resultado, regenerado: bool = False) -> None:
    """Solo si, tras los reintentos, el horario sigue sin valer."""
    if res.valido:
        return
    h = res.horario
    reintentos = sum(1 for i in res.intentos if i.metodo != "generar")
    texto = (f"Ha quedado con {_lista_problemas(res)}"
             + (f" después de {reintentos} reintento{'s' if reintentos != 1 else ''}" if reintentos else "")
             + f". {res.motivo or 'Es posible que haya que cambiar algo para arreglarlo.'} "
               "No lo publiques sin revisarlo: si lo publicas, la app te pedirá confirmarlo.")
    store.create_notification(
        "generacion_fallida", sid,
        f"El horario {periodo(h)} no se ha {'regenerado' if regenerado else 'generado'} correctamente",
        " ".join(texto.split()), informe(res))


def _turnos_imposibles(config: Config, h: Schedule, desde: dt.date) -> bool:
    """Si hay turnos que ya no se van a hacer: la persona está ausente o ya no está en la plantilla."""
    activos = {e.id for e in config.active_employees()}
    return any(a.fecha >= desde and (a.empleado_id not in activos or config.is_absent(a.empleado_id, a.fecha))
               for a in h.asignaciones)


def arreglar_tras_ausencias(store: Store, config: Config, hoy: dt.date, segundos: float,
                            avisados: frozenset[int] = frozenset()) -> list[int]:
    """Arregla los horarios en curso o futuros con turnos que ya no se van a hacer (ausencias, bajas en la plantilla).

    Un borrador se arregla tal cual. Un horario publicado no se toca: el arreglo se guarda como un borrador que
    lo sustituye cuando el encargado lo publique. Devuelve los ids de los borradores creados o arreglados.
    En los horarios de 'avisados' ya hay un aviso de turnos perdidos que cuenta el arreglo: solo se añade
    el aviso del arreglo si este no ha quedado bien.
    """
    filas = store.list_schedules()
    publicados = {r["id"] for r in filas if r["estado"] == "publicado"}
    hechos = []
    for row in filas:
        h: Schedule = row["horario"]
        if h.hasta < hoy or (row["estado"] != "publicado" and row.get("reemplaza") in publicados) \
                or linea_tiempo.sustituido(row):
            continue  # ya terminado, arreglo pendiente de un publicado (se trata junto a él) o sustituido por otro
        publicado = row["estado"] == "publicado"
        pendiente = store.replacement_of(row["id"]) if publicado else None
        base_row = pendiente or row
        base: Schedule = base_row["horario"]
        desde = primer_dia_cambiable("publicado" if publicado else "borrador", base, hoy)
        if desde > base.hasta or not _turnos_imposibles(config, base, desde):
            continue
        res = generar(store, config, base.desde, base.hasta, segundos=segundos, excluir=row["id"],
                      bloqueos=base.bloqueos, partir_de=base, cambiable_desde=desde,
                      congelados=congelar_antes(config, base, desde) if desde > base.desde else [])
        nuevo = res.horario
        nuevo.estado = "borrador"
        if pendiente:
            store.update_schedule(pendiente["id"], nuevo)
            sid = pendiente["id"]
        elif publicado:
            sid = store.create_schedule(nuevo, "sistema", reemplaza=row["id"])
        else:
            store.update_schedule(row["id"], nuevo)
            sid = row["id"]
        hechos.append(sid)
        if row["id"] not in avisados or not res.valido:
            _notificar_arreglo(store, sid, res, publicado)
    return hechos


def _notificar_arreglo(store: Store, sid: int, res: Resultado, publicado: bool) -> None:
    h = res.horario
    if publicado:
        titulo = f"Arreglo preparado para el horario publicado {periodo(h)}"
        texto = ("Una ausencia ha dejado turnos que nadie va a hacer. He preparado el arreglo como borrador: revísalo y "
                 "publícalo. Hasta entonces el equipo sigue viendo el horario actual.")
    else:
        titulo = f"Borrador {periodo(h)} arreglado"
        texto = "Una ausencia había dejado turnos que nadie iba a hacer en este borrador y lo he ajustado."
    if not res.valido:
        titulo = (f"Arreglo incompleto del horario publicado {periodo(h)}" if publicado
                  else f"El borrador {periodo(h)} sigue sin valer")
        texto += f" Aun así queda{'n' if len(res.problemas) != 1 else ''} {_lista_problemas(res)}. {res.motivo or ''}"
    store.create_notification("arreglo_preparado" if publicado else "arreglo_borrador", sid, titulo,
                              " ".join(texto.split()), informe(res))


def turnos_perdidos(store: Store, antes: Config, despues: Config, hoy: dt.date) -> list[dict]:
    """Turnos ya asignados, de hoy en adelante, que una ausencia nueva (una baja, unas vacaciones...) deja sin hacer.

    Se miran los horarios que ve el equipo (los publicados) y los borradores que no son el arreglo de un publicado.
    Solo cuentan las ausencias nuevas: lo que ya estaba ausente antes del cambio ya se avisó en su momento.
    """
    filas = store.list_schedules()
    publicados = {r["id"] for r in filas if r["estado"] == "publicado"}
    out = []
    for row in filas:
        h: Schedule = row["horario"]
        if h.hasta < hoy or (row["estado"] != "publicado" and row.get("reemplaza") in publicados):
            continue
        manda = set(linea_tiempo.fechas(row))  # de un publicado, solo los días en que manda: los demás ya no valen
        for a in sorted(h.asignaciones, key=lambda x: (x.fecha, x.empleado_id)):
            if a.fecha < hoy or a.fecha not in manda or antes.is_absent(a.empleado_id, a.fecha):
                continue
            ausencia = despues.is_absent(a.empleado_id, a.fecha)
            if not ausencia:
                continue
            try:
                turno = despues.shift(a.turno_id)
            except StopIteration:  # turno borrado de la configuración
                turno = None
            e = next((x for x in despues.empleados if x.id == a.empleado_id), None)
            out.append({"empleado_id": a.empleado_id, "nombre": e.nombre if e else a.empleado_id,
                        "fecha": a.fecha.isoformat(), "turno": turno.nombre if turno else a.turno_id,
                        "inicio": a.inicio or (turno.inicio if turno else ""), "fin": a.fin or (turno.fin if turno else ""),
                        "motivo": ausencia.motivo, "horario_id": row["id"], "estado": row["estado"],
                        "periodo": periodo(h)})
    return out


_MOTIVO = {"baja": "de baja", "vacaciones": "de vacaciones", "permiso": "de permiso", "otro": "ausente"}


def avisar_turnos_perdidos(store: Store, perdidos: list[dict], arreglados: list[int]) -> None:
    """Una notificación por persona: qué turnos no va a hacer, en qué horarios, y si ya hay un arreglo preparado."""
    por_persona: dict[str, list[dict]] = {}
    for t in perdidos:
        por_persona.setdefault(t["empleado_id"], []).append(t)
    filas = {r["id"]: r for r in store.list_schedules()}
    for turnos in por_persona.values():
        p = turnos[0]
        n = len(turnos)
        publicados = sorted({t["horario_id"] for t in turnos if t["estado"] == "publicado"})
        arreglo = next((a for a in arreglados if filas.get(a, {}).get("reemplaza") in publicados), None)
        if arreglo is None:
            arreglo = next((a for a in arreglados if a in {t["horario_id"] for t in turnos}), None)
        titulo = f"{p['nombre']} está {_MOTIVO.get(p['motivo'], 'ausente')}: {n} turno{'s' if n != 1 else ''} sin hacer"
        texto = (f"{p['nombre']} tenía {'estos turnos asignados' if n != 1 else 'este turno asignado'} y no "
                 f"{'los' if n != 1 else 'lo'} va a hacer.")
        if publicados:
            texto += (" El horario publicado no se va a cumplir tal cual: el equipo sigue viéndolo con "
                      f"{p['nombre']} hasta que publiques el arreglo.")
        if arreglo and publicados:
            texto += " He preparado un arreglo como borrador: revísalo y publícalo."
        elif arreglo:
            texto += " He ajustado el borrador para que otras personas cubran esos turnos: revísalo."
        else:
            texto += " Revisa el horario para cubrir esos turnos."
        detalle = {"turnos": [{k: t[k] for k in ("fecha", "turno", "inicio", "fin", "periodo", "estado")} for t in turnos],
                   "empleado_id": p["empleado_id"], "motivo": p["motivo"], "arreglo": arreglo}
        store.create_notification("turnos_perdidos", arreglo or turnos[0]["horario_id"], titulo, texto, detalle)
