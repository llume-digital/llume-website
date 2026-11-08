"""Cuadrante en HTML imprimible con la identidad de Lopita & Co (y PDF opcional con Chromium)."""
from __future__ import annotations

import base64
import datetime as dt
import html
from pathlib import Path

from .models import Config, Puesto, Schedule
from .planning import daterange, week_chunks

DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
PUESTO = {Puesto.cocina: "Cocina", Puesto.sala: "Sala"}

FONT_DIR = Path(__file__).resolve().parent / "assets" / "fonts"


def _fonts(mode: str) -> str:
    """'link' enlaza /fonts/fonts.css (servido por la app); 'inline' incrusta las fuentes (para PDF); 'none' nada."""
    if mode == "link":
        return "<link rel='stylesheet' href='/fonts/fonts.css'>"
    if mode == "inline":
        css = (FONT_DIR / "fonts.css").read_text(encoding="utf-8")
        for f in FONT_DIR.glob("*.woff2"):
            css = css.replace(f"url('{f.name}')", "url(data:font/woff2;base64," + base64.b64encode(f.read_bytes()).decode() + ")")
        return f"<style>{css}</style>"
    return ""

CSS = """
:root { --gold:#B0904C; --brown:#764A09; --ink:#2A2118; --muted:#7A6E62; --line:#E6DED2; --paper:#FBF8F3; --bad:#B42318; --warn:#8A5A00; }
* { box-sizing:border-box; }
body { font-family: Raleway, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color:var(--ink); background:var(--paper); margin:24px; font-size:13px; }
.brand { font-family: Oswald, 'Arial Narrow', sans-serif; font-weight:300; letter-spacing:.18em; text-transform:uppercase; color:var(--brown); font-size:14px; }
h1 { font-family: Oswald, 'Arial Narrow', sans-serif; font-weight:400; letter-spacing:.06em; text-transform:uppercase; font-size:24px; margin:4px 0 2px; }
.sub { color:var(--muted); margin-bottom:16px; }
h2 { font-family: Oswald, 'Arial Narrow', sans-serif; font-weight:400; letter-spacing:.05em; text-transform:uppercase; font-size:15px; margin:24px 0 8px; color:var(--brown); }
.scroll { overflow-x:auto; }
table { border-collapse:collapse; width:100%; margin-bottom:8px; table-layout:fixed; min-width:720px; background:#fff; }
th, td { border:1px solid var(--line); padding:4px 6px; text-align:center; vertical-align:middle; }
th { background:#F3EDE3; font-weight:600; }
th.emp, td.emp { text-align:left; width:120px; }
td.tot { width:80px; font-variant-numeric:tabular-nums; }
tr.me td { background:#FFF7E6; }
tr.me td.emp { font-weight:700; }
.shift { display:block; border-radius:8px; padding:3px 2px; font-weight:600; color:#2A2118; }
.shift small { display:block; font-weight:500; font-size:10.5px; }
.off { color:var(--muted); font-size:11px; }
.abs { color:var(--warn); font-size:11px; }
tr.cov td { font-size:11px; }
.gap { color:var(--bad); font-weight:600; }
.okc { color:#2E7D32; }
td.out, th.out { background:#F6F2EC; color:#C9BFB2; }
.legend span { display:inline-block; margin:0 12px 6px 0; }
.legend i { display:inline-block; width:12px; height:12px; border-radius:3px; vertical-align:-2px; margin-right:4px; }
ul.issues { padding-left:18px; }
ul.issues li.error { color:var(--bad); }
ul.issues li.aviso { color:var(--warn); }
.over { color:var(--warn); font-weight:600; }
.mine { background:#fff; border:1px solid var(--line); border-left:4px solid var(--gold); border-radius:10px; padding:12px 16px; margin:8px 0 16px; }
.mine ul { margin:6px 0 0; padding-left:18px; }
@page { size: A4 landscape; margin: 10mm; }
@media print { body { margin:0; background:#fff; } .week { break-inside: avoid; } table { min-width:0; } .scroll { overflow:visible; } }
@media (max-width:640px) { body { margin:16px; } }
"""


def _esc(s) -> str:
    return html.escape(str(s))


def _label(d: dt.date) -> str:
    return f"{DIAS_CORTOS[d.weekday()]} {d.day} {MESES[d.month - 1]}"


def render_html(config: Config, schedule: Schedule, publico: bool = False, resaltar: str | None = None,
                fuentes: str = "link") -> str:
    """publico=True oculta horas, resumen y avisos internos; resaltar=id de empleado destaca su fila."""
    days = daterange(schedule.desde, schedule.hasta)
    by = {(a.empleado_id, a.fecha): a for a in schedule.asignaciones}
    shift_ids = {s.id for s in config.turnos}
    stats = {s.empleado_id: s for s in schedule.resumen}
    gaps_by_day: dict[dt.date, int] = {}
    for i in schedule.incidencias:
        if i.codigo == "falta_cobertura" and i.fecha:
            gaps_by_day[i.fecha] = gaps_by_day.get(i.fecha, 0) + 1
    employees = config.active_employees()
    me = next((e for e in employees if e.id == resaltar), None)

    parts = [f"<div class='brand'>{_esc(config.negocio)}</div>",
             "<h1>Horario</h1>",
             f"<div class='sub'>Del {_label(schedule.desde)} al {_label(schedule.hasta)} {schedule.hasta.year}"
             + ("" if publico else f" · {_esc(schedule.estado)}") + "</div>"]

    if me:
        mine = sorted((a for a in schedule.asignaciones if a.empleado_id == me.id and a.turno_id in shift_ids),
                      key=lambda a: a.fecha)
        items = "".join(
            f"<li><b>{DIAS[a.fecha.weekday()]} {a.fecha.day} {MESES[a.fecha.month - 1]}</b>: "
            f"{_esc(config.turno_de(a).nombre)}, {config.turno_de(a).inicio}–{config.turno_de(a).fin}"
            f" ({PUESTO[config.puesto_de(a)]}{_rol(config, a, ', ')})</li>"
            for a in mine) or "<li>No tienes turnos en este periodo.</li>"
        total = sum(config.turno_de(a).minutes for a in mine) / 60
        parts.append(f"<div class='mine'><b>Tus turnos, {_esc(me.nombre)}</b> · {total:g} h<ul>{items}</ul></div>")

    parts.append("<div class='legend'>" + "".join(
        f"<span><i style='background:{_esc(s.color or '#eee')}'></i>{_esc(s.id)} · {_esc(s.nombre)} {s.inicio}–{s.fin}</span>"
        for s in config.turnos) + "</div>")

    period = set(days)
    for chunk in week_chunks(days):
        monday = chunk[0] - dt.timedelta(days=chunk[0].weekday())
        parts.append("<div class='week'>")
        parts.append(f"<h2>Semana del {_label(monday)}</h2><div class='scroll'><table><thead><tr><th class='emp'>Empleado</th>")
        parts += [f"<th{'' if d in period else ' class=out'}>{_label(d)}</th>" for d in chunk]
        parts.append(("" if publico else "<th class='tot'>Horas</th>") + "</tr></thead><tbody>")
        for e in employees:
            parts.append(f"<tr{' class=me' if me and e.id == me.id else ''}><td class='emp'>{_esc(e.nombre)}</td>")
            week_min = 0
            for d in chunk:
                if d not in period:
                    parts.append("<td class='out'></td>")
                    continue
                a = by.get((e.id, d))
                if a and a.turno_id in shift_ids:
                    s = config.turno_de(a)
                    week_min += s.minutes
                    parts.append(f"<td><span class='shift' style='background:{_esc(s.color or '#eee')}'>{_esc(s.id)}"
                                 f"<small>{s.inicio}–{s.fin}</small><small>{PUESTO[config.puesto_de(a)]}"
                                 f"{_rol(config, a, ' · ')}</small></span></td>")
                else:
                    ab = config.is_absent(e.id, d)
                    parts.append(f"<td><span class='abs'>{_esc(ab.motivo)}</span></td>" if ab
                                 else "<td><span class='off'>libre</span></td>")
            parts.append(("" if publico else f"<td class='tot'>{week_min / 60:g} h</td>") + "</tr>")
        if not publico:
            parts.append("<tr class='cov'><td class='emp'>Cobertura</td>")
            for d in chunk:
                if d not in period:
                    parts.append("<td class='out'></td>")
                    continue
                n = gaps_by_day.get(d, 0)
                parts.append(f"<td class='gap'>{n} hueco{'s' if n > 1 else ''}</td>" if n else "<td class='okc'>completa</td>")
            parts.append("<td></td></tr>")
        parts.append("</tbody></table></div></div>")

    if not publico:
        parts.append("<h2>Resumen por empleado</h2><div class='scroll'><table><thead><tr><th class='emp'>Empleado</th><th>Horas</th>"
                     "<th>Objetivo</th><th>Extra</th><th>Días</th><th>Fines de semana</th><th>Aperturas</th><th>Cierres</th></tr></thead><tbody>")
        for e in employees:
            st = stats.get(e.id)
            if not st:
                continue
            extra = f"<span class='over'>{st.horas_extra:g}</span>" if st.horas_extra else "0"
            parts.append(f"<tr><td class='emp'>{_esc(e.nombre)}</td><td>{st.horas:g}</td><td>{st.horas_objetivo:g}</td>"
                         f"<td>{extra}</td><td>{st.dias_trabajados}</td><td>{st.fines_de_semana}</td>"
                         f"<td>{st.aperturas}</td><td>{st.cierres}</td></tr>")
        parts.append("</tbody></table></div>")

        if schedule.incidencias:
            parts.append(f"<h2>Avisos ({len(schedule.incidencias)})</h2><ul class='issues'>")
            parts += [f"<li class='{i.nivel}'>{_esc(i.mensaje)}</li>" for i in schedule.incidencias]
            parts.append("</ul>")
        else:
            parts.append("<h2>Sin avisos</h2><p>El horario cubre toda la demanda y cumple todas las reglas.</p>")

    return ("<!doctype html><html lang='es'><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width, initial-scale=1'>"
            f"<title>Horario {_esc(config.negocio)} · {schedule.desde}</title>{_fonts(fuentes)}<style>{CSS}</style></head><body>"
            + "".join(parts) + "</body></html>")


def html_to_pdf_bytes(html_text: str) -> bytes:
    """Convierte HTML a PDF con Chromium (requiere 'playwright' y su navegador instalados)."""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html_text, wait_until="networkidle")
        data = page.pdf(format="A4", landscape=True, print_background=True,
                        margin={"top": "10mm", "bottom": "10mm", "left": "10mm", "right": "10mm"})
        browser.close()
    return data


def html_to_pdf(html_path: str, pdf_path: str) -> None:
    import pathlib

    pathlib.Path(pdf_path).write_bytes(html_to_pdf_bytes(pathlib.Path(html_path).read_text(encoding="utf-8")))


def _rol(config: Config, a, sep: str) -> str:
    """El rol de la asignación (caja, cafetera...) precedido del separador, o nada si no tiene."""
    f = config.rol_de(a)
    return f"{sep}{_esc(f.nombre)}" if f else ""
