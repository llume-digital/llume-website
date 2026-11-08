"""Informe de horas por trabajador: horas previstas (horario publicado) y ajustadas (correcciones aprobadas)."""
from __future__ import annotations

import datetime as dt
from typing import Optional

from lopita_horarios.models import Config, Schedule, parse_hhmm
from lopita_horarios.planning import target_minutes

from . import linea_tiempo

CLASES = {
    "horas": "Horas distintas",
    "turno": "Turno distinto",
    "no_trabajado": "No trabajé",
    "extra": "Día extra",
}


def correction_minutes(config: Config, datos: dict) -> int:
    """Minutos realmente trabajados según una corrección."""
    clase = datos.get("clase")
    if clase == "no_trabajado":
        return 0
    if clase == "turno" or (clase == "extra" and datos.get("turno_id")):
        return config.shift(datos["turno_id"]).minutes
    ini, fin = parse_hhmm(datos["inicio"]), parse_hhmm(datos["fin"])
    if fin <= ini:
        raise ValueError("La hora de salida debe ser posterior a la de entrada")
    return fin - ini


def validate_correction(config: Config, datos: dict) -> dict:
    """Normaliza y valida los datos de una corrección. Lanza ValueError con un mensaje claro."""
    clase = datos.get("clase")
    if clase not in CLASES:
        raise ValueError("Tipo de corrección desconocido")
    out = {"clase": clase, "fecha": str(datos.get("fecha") or "")}
    try:
        dt.date.fromisoformat(out["fecha"])
    except ValueError:
        raise ValueError("Indica la fecha")
    if clase == "turno" or (clase == "extra" and datos.get("turno_id")):
        tid = datos.get("turno_id")
        if not tid or tid not in {s.id for s in config.turnos}:
            raise ValueError("Elige el turno que hiciste")
        out["turno_id"] = tid
    elif clase in ("horas", "extra"):
        for k in ("inicio", "fin"):
            try:
                parse_hhmm(str(datos.get(k)))
            except Exception:
                raise ValueError("Indica la hora de entrada y la de salida")
            out[k] = str(datos[k])
    out["minutos"] = correction_minutes(config, out)
    if out["minutos"] > 16 * 60:
        raise ValueError("Una jornada no puede superar las 16 horas")
    return out


def best_schedules(rows: list[dict], solo_publicados: bool = True) -> dict[dt.date, Schedule]:
    """Para cada fecha, el horario que manda en ella (el publicado de la línea de tiempo; si no hay, el borrador más
    reciente cuando se piden también los borradores)."""
    return {d: r["horario"] for d, r in linea_tiempo.por_dia(rows, solo_publicados=solo_publicados).items()}


def planned_minutes(config: Config, h: Schedule, emp_id: str, fecha: dt.date) -> tuple[Optional[str], int]:
    a = next((x for x in h.asignaciones if x.empleado_id == emp_id and x.fecha == fecha), None)
    if not a:
        return None, 0
    return a.turno_id, config.turno_de(a).minutes


def approved_by_day(requests: list[dict]) -> dict[tuple[str, str], dict]:
    """Última corrección aprobada de cada (empleado, fecha)."""
    out: dict[tuple[str, str], dict] = {}
    for r in sorted((r for r in requests if r["tipo"] == "correccion" and r["estado"] == "aprobada"), key=lambda r: r["id"]):
        out[(r["empleado_id"], r["datos"]["fecha"])] = r
    return out


def employee_report(config: Config, schedules: list[dict], requests: list[dict], emp_id: str,
                    desde: dt.date, hasta: dt.date, solo_publicados: bool = True) -> dict:
    """Cuánto ha trabajado una persona en un periodo: horas previstas y ajustadas, objetivo de contrato, horas extra,
    días, fines de semana, aperturas y cierres, en total y mes a mes.

    El objetivo es el contrato prorrateado solo en los días que tienen horario (sin contar ausencias), así que un
    periodo a medio planificar no sale con horas de menos.
    """
    cover = best_schedules(schedules, solo_publicados)
    approved = approved_by_day(requests)
    emp = config.employee(emp_id)
    pendientes = sum(1 for r in requests if r["tipo"] == "correccion" and r["estado"] == "pendiente"
                     and r["empleado_id"] == emp_id and desde.isoformat() <= r["datos"]["fecha"] <= hasta.isoformat())
    dias = []
    meses: dict[str, dict] = {}
    d = desde
    while d <= hasta:
        h = cover.get(d)
        mes = meses.setdefault(d.strftime("%Y-%m"), {"mes": d.strftime("%Y-%m"), "_min_prev": 0, "_min_aj": 0,
                                                     "_dias_plan": [], "dias": 0, "fines_de_semana": 0,
                                                     "aperturas": 0, "cierres": 0, "festivos": 0})
        if h is not None:
            mes["_dias_plan"].append(d)
            a = next((x for x in h.asignaciones if x.empleado_id == emp_id and x.fecha == d), None)
            tid, pm = (a.turno_id, config.turno_de(a).minutes) if a and a.turno_id in {s.id for s in config.turnos} \
                else (None, 0)
            corr = approved.get((emp_id, d.isoformat()))
            am = corr["datos"]["minutos"] if corr else pm
            if tid or corr:
                dias.append({"fecha": d.isoformat(), "turno_id": tid, "previstas": round(pm / 60, 2),
                             "ajustadas": round(am / 60, 2),
                             "correccion": ({"id": corr["id"], "clase": corr["datos"]["clase"], "motivo": corr["motivo"],
                                             "turno_id": corr["datos"].get("turno_id"),
                                             "inicio": corr["datos"].get("inicio"), "fin": corr["datos"].get("fin")}
                                            if corr else None)})
            if am > 0:
                mes["dias"] += 1
                mes["fines_de_semana"] += d.weekday() >= 5
                mes["festivos"] += d in config.festivos
                if tid and am == pm:
                    tipo = config.shift(tid).tipo.value
                    mes["aperturas"] += tipo == "apertura"
                    mes["cierres"] += tipo == "cierre"
            mes["_min_prev"] += pm
            mes["_min_aj"] += am
        d += dt.timedelta(days=1)

    def cerrar(m: dict) -> dict:
        objetivo = target_minutes(config, emp, m.pop("_dias_plan")) if emp.activo else 0
        prev, aj = m.pop("_min_prev"), m.pop("_min_aj")
        # Un comodín no tiene contrato: todo lo que trabaja es lo pactado, no horas extra.
        extra = 0 if emp.comodin else max(0, aj - objetivo)
        return {**m, "previstas": round(prev / 60, 2), "ajustadas": round(aj / 60, 2),
                "objetivo": round(objetivo / 60, 2), "extra": round(extra / 60, 2),
                "de_menos": round(max(0, objetivo - aj) / 60, 2), "diferencia": round((aj - prev) / 60, 2)}

    por_mes = [cerrar(m) for m in meses.values()]
    suma = lambda k: round(sum(m[k] for m in por_mes), 2)  # noqa: E731
    # Las horas extra del total salen del total (no de sumar las de cada mes: un mes de más y otro de menos se compensan).
    balance = 0 if emp.comodin else suma("ajustadas") - suma("objetivo")
    return {"empleado_id": emp_id, "nombre": emp.nombre, "desde": desde.isoformat(),
            "hasta": hasta.isoformat(), "previstas": suma("previstas"), "ajustadas": suma("ajustadas"),
            "diferencia": suma("diferencia"), "objetivo": suma("objetivo"), "extra": round(max(0, balance), 2),
            "de_menos": round(max(0, -balance), 2), "dias_trabajados": int(suma("dias")),
            "fines_de_semana": int(suma("fines_de_semana")), "festivos": int(suma("festivos")),
            "aperturas": int(suma("aperturas")), "cierres": int(suma("cierres")),
            "pendientes": pendientes, "meses": por_mes, "dias": dias}


def saldo_delta(config: Config, h: Schedule, requests: list[dict]) -> dict[str, float]:
    """Horas (+/-) que las correcciones aprobadas añaden al saldo de cada empleado dentro de un horario."""
    out: dict[str, float] = {}
    for (emp, fecha), r in approved_by_day(requests).items():
        f = dt.date.fromisoformat(fecha)
        if not h.desde <= f <= h.hasta:
            continue
        try:
            _, pm = planned_minutes(config, h, emp, f)
        except StopIteration:
            continue
        out[emp] = out.get(emp, 0) + (r["datos"]["minutos"] - pm) / 60
    return {k: round(v, 2) for k, v in out.items()}


def saldo_arrastrado(config: Config, prev: Optional[Schedule], aprobadas: list[dict]) -> dict[str, float]:
    """Saldo de horas (+/-) que cada persona arrastra del horario anterior al siguiente, acotado al máximo configurado."""
    if not config.reglas.arrastrar_saldo or prev is None:
        return {}
    cap = config.reglas.max_saldo_horas
    ajustes = saldo_delta(config, prev, aprobadas)
    saldo = {}
    comodines = {e.id for e in config.empleados if e.comodin}
    for st in prev.resumen:
        if st.comodin or st.empleado_id in comodines:
            continue  # sin contrato no hay saldo que arrastrar
        total = st.horas - st.horas_objetivo + ajustes.get(st.empleado_id, 0)
        if abs(total) >= 0.5:
            saldo[st.empleado_id] = max(-cap, min(cap, round(total, 2)))
    return saldo
