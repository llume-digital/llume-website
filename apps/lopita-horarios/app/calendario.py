"""Calendario de cada persona en formato iCalendar (.ics), para suscribirse desde Google Calendar o el iPhone.

Cada persona tiene un enlace secreto (/cal/<token>.ics). Google, Apple y Outlook lo vuelven a leer cada cierto
tiempo, así que el calendario se actualiza solo cuando se publica o se cambia un horario. Solo entran los horarios
publicados (los borradores y los arreglos sin publicar no los ve el equipo) y las ausencias aprobadas.

No usa zonas horarias de Python: las horas van en hora local con TZID=Europe/Madrid y la definición de la zona
dentro del propio archivo, que funciona igual en el servidor y en la app sin servidor (Pyodide).
"""
from __future__ import annotations

import datetime as dt

from lopita_horarios.models import Config

from . import horas

# Cuánto pasado se incluye: lo justo para revisar las últimas semanas sin que el archivo crezca sin fin.
DIAS_ATRAS = 120

MOTIVOS = {"vacaciones": "Vacaciones", "baja": "Baja", "permiso": "Permiso", "otro": "Ausencia"}

VTIMEZONE = [
    "BEGIN:VTIMEZONE", "TZID:Europe/Madrid", "X-LIC-LOCATION:Europe/Madrid",
    "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST",
    "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
    "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET",
    "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
    "END:VTIMEZONE",
]


def _texto(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\r\n", "\\n").replace("\n", "\\n")


def _plegar(linea: str) -> str:
    """RFC 5545: líneas de 75 octetos como mucho; las siguientes empiezan con un espacio."""
    datos = linea.encode("utf-8")
    if len(datos) <= 75:
        return linea
    partes, actual, limite = [], b"", 75
    for ch in linea:
        b = ch.encode("utf-8")
        if len(actual) + len(b) > limite:
            partes.append(actual.decode("utf-8"))
            actual, limite = b"", 74
        actual += b
    partes.append(actual.decode("utf-8"))
    return "\r\n ".join(partes)


def _local(d: dt.date, hhmm: str) -> str:
    h, m = (int(x) for x in hhmm.split(":"))
    momento = dt.datetime.combine(d, dt.time()) + dt.timedelta(hours=h, minutes=m)  # «24:00» pasa al día siguiente
    return momento.strftime("%Y%m%dT%H%M%S")


def _sello(iso: str | None) -> str:
    """DTSTAMP en UTC. Sale de la fecha del horario y no de «ahora», para que el archivo no cambie si nada cambia."""
    try:
        t = dt.datetime.fromisoformat(iso) if iso else None
    except ValueError:
        t = None
    t = t or dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)
    if t.tzinfo is None:
        t = t.replace(tzinfo=dt.timezone.utc)
    return t.astimezone(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def ics(config: Config, rows: list[dict], emp_id: str, hoy: dt.date | None = None, url: str | None = None) -> str:
    """El calendario de una persona: un evento por turno publicado y uno de día completo por ausencia aprobada."""
    hoy = hoy or dt.date.today()
    emp = config.employee(emp_id)
    negocio = config.negocio or "Lopita"
    desde = hoy - dt.timedelta(days=DIAS_ATRAS)
    publicados = [r for r in rows if r["estado"] == "publicado"]
    cover = horas.best_schedules(publicados)
    sello_de = {id(r["horario"]): _sello(r.get("updated_at")) for r in publicados}

    lineas = [
        "BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:-//{_texto(negocio)}//Horarios//ES", "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH", f"X-WR-CALNAME:{_texto(f'{negocio} · Turnos de {emp.nombre}')}",
        "X-WR-TIMEZONE:Europe/Madrid", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
        *VTIMEZONE,
    ]
    for d in sorted(cover):
        if d < desde:
            continue
        h = cover[d]
        a = next((x for x in h.asignaciones if x.empleado_id == emp_id and x.fecha == d), None)
        if not a:
            continue
        s = config.turno_de(a)
        puesto = config.puesto_de(a).value
        horas_turno = s.minutes / 60
        rol = config.rol_de(a)
        if rol:
            puesto += f", {rol.nombre}"
        detalle = [f"Turno: {s.nombre} ({s.inicio}–{s.fin}), {horas_turno:g} h", f"Puesto: {puesto}"]
        if url:
            detalle.append(f"Horario completo: {url}")
        lineas += [
            "BEGIN:VEVENT",
            f"UID:turno-{emp_id}-{d.isoformat()}@lopita-horarios",
            f"DTSTAMP:{sello_de.get(id(h), _sello(None))}",
            f"DTSTART;TZID=Europe/Madrid:{_local(d, s.inicio)}",
            f"DTEND;TZID=Europe/Madrid:{_local(d, s.fin)}",
            f"SUMMARY:{_texto(f'{negocio} · {s.nombre} ({puesto})')}",
            f"DESCRIPTION:{_texto(chr(10).join(detalle))}",
            "TRANSP:OPAQUE",
            "END:VEVENT",
        ]
    for i, au in enumerate(sorted((x for x in config.ausencias if x.empleado_id == emp_id), key=lambda x: x.desde)):
        if au.hasta < desde:
            continue
        lineas += [
            "BEGIN:VEVENT",
            f"UID:ausencia-{emp_id}-{au.desde.isoformat()}-{au.motivo}@lopita-horarios",
            f"DTSTAMP:{_sello(None)}",
            f"DTSTART;VALUE=DATE:{au.desde.strftime('%Y%m%d')}",
            f"DTEND;VALUE=DATE:{(au.hasta + dt.timedelta(days=1)).strftime('%Y%m%d')}",
            f"SUMMARY:{_texto(MOTIVOS.get(au.motivo, 'Ausencia'))}",
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
        ]
    lineas.append("END:VCALENDAR")
    return "\r\n".join(_plegar(x) for x in lineas) + "\r\n"


def enlaces(url_ics: str) -> dict:
    """Las formas de añadir el calendario: suscribirse en Google, en Apple (webcal://) o copiar el enlace."""
    from urllib.parse import quote

    webcal = "webcal://" + url_ics.split("://", 1)[-1]
    return {
        "url": url_ics,
        "webcal": webcal,
        "google": "https://calendar.google.com/calendar/render?cid=" + quote(webcal, safe=""),
    }
