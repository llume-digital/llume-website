"""Línea de comandos.

Ejemplos:
  python -m lopita_horarios generar --config datos/ejemplo.json --semana 2026-11-02
  python -m lopita_horarios generar --config datos/ejemplo.json --mes 2026-11 --pdf
  python -m lopita_horarios validar --config datos/ejemplo.json --horario salida/horario_2026-11-02.json
"""
from __future__ import annotations

import argparse
import calendar
import datetime as dt
import json
import pathlib
import sys

from . import load_config
from .models import Schedule
from .render import html_to_pdf, render_html
from .solver import SolveOptions, generate
from .validator import compute_stats, validate


def _period(args) -> tuple[dt.date, dt.date]:
    if args.semana:
        start = dt.date.fromisoformat(args.semana)
        start -= dt.timedelta(days=start.weekday())
        return start, start + dt.timedelta(days=6)
    if args.mes:
        y, m = map(int, args.mes.split("-"))
        return dt.date(y, m, 1), dt.date(y, m, calendar.monthrange(y, m)[1])
    if args.desde and args.hasta:
        return dt.date.fromisoformat(args.desde), dt.date.fromisoformat(args.hasta)
    sys.exit("Indica --semana AAAA-MM-DD, --mes AAAA-MM o --desde/--hasta")


def _write_outputs(config, schedule: Schedule, out_dir: pathlib.Path, pdf: bool) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = f"horario_{schedule.desde}_{schedule.hasta}"
    json_path = out_dir / f"{stem}.json"
    html_path = out_dir / f"{stem}.html"
    json_path.write_text(schedule.model_dump_json(indent=2), encoding="utf-8")
    html_path.write_text(render_html(config, schedule, fuentes="inline"), encoding="utf-8")
    print(f"Guardado: {json_path}\nGuardado: {html_path}")
    if pdf:
        pdf_path = out_dir / f"{stem}.pdf"
        html_to_pdf(str(html_path), str(pdf_path))
        print(f"Guardado: {pdf_path}")


def _print_summary(schedule: Schedule) -> None:
    errors = [i for i in schedule.incidencias if i.nivel == "error"]
    warns = [i for i in schedule.incidencias if i.nivel == "aviso"]
    print(f"\n{len(schedule.asignaciones)} turnos asignados · {len(errors)} errores · {len(warns)} avisos")
    for i in errors + warns:
        print(f"  [{i.nivel}] {i.mensaje}")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="lopita_horarios", description="Gestor de horarios de Lopita")
    sub = ap.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generar", help="Genera un horario optimizado")
    g.add_argument("--config", required=True)
    g.add_argument("--semana", help="Cualquier fecha de la semana a generar (AAAA-MM-DD)")
    g.add_argument("--mes", help="Mes a generar (AAAA-MM)")
    g.add_argument("--desde")
    g.add_argument("--hasta")
    g.add_argument("--segundos", type=float, default=30, help="Tiempo máximo de cálculo")
    g.add_argument("--salida", default="salida")
    g.add_argument("--pdf", action="store_true", help="Exportar también a PDF")

    v = sub.add_parser("validar", help="Valida un horario (por ejemplo, tras editarlo a mano)")
    v.add_argument("--config", required=True)
    v.add_argument("--horario", required=True)
    v.add_argument("--salida", help="Si se indica, regenera HTML/JSON con el resultado de la validación")
    v.add_argument("--pdf", action="store_true")

    args = ap.parse_args(argv)
    config = load_config(args.config)

    if args.cmd == "generar":
        desde, hasta = _period(args)
        print(f"Generando horario del {desde} al {hasta} para {len(config.active_employees())} empleados...")
        schedule = generate(config, desde, hasta, SolveOptions(max_segundos=args.segundos))
        print(f"Resultado del motor: {schedule.estado_solver}")
        _print_summary(schedule)
        if schedule.asignaciones:
            _write_outputs(config, schedule, pathlib.Path(args.salida), args.pdf)
    else:
        schedule = Schedule.model_validate(json.loads(pathlib.Path(args.horario).read_text(encoding="utf-8")))
        schedule.incidencias = validate(config, schedule.desde, schedule.hasta, schedule.asignaciones)
        schedule.resumen = compute_stats(config, schedule.desde, schedule.hasta, schedule.asignaciones)
        _print_summary(schedule)
        if args.salida:
            _write_outputs(config, schedule, pathlib.Path(args.salida), args.pdf)
        sys.exit(1 if any(i.nivel == "error" for i in schedule.incidencias) else 0)


if __name__ == "__main__":
    main()
