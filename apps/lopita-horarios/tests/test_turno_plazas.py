"""Un turno con varias plazas se reparte entre esas personas el mismo día."""
import datetime as dt

from lopita_horarios import Config, SolveOptions, generate

LUN = dt.date(2026, 11, 9)
TODOS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


def _config(plazas: int) -> Config:
    return Config.model_validate({
        "empleados": [{"id": f"e{i}", "nombre": f"E{i}", "horas_semanales": 30} for i in range(3)],
        "turnos": [{"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "14:00", "plazas": plazas}],
        "tipos_dia": [{"nombre": "normal", "franjas": [{"inicio": "08:00", "fin": "14:00", "personas": 1}]}],
        "tipo_dia_por_semana": {d: "normal" for d in TODOS},
    })


def _por_dia(plazas: int) -> list[int]:
    sch = generate(_config(plazas), LUN, LUN + dt.timedelta(days=2), SolveOptions(max_segundos=10, hilos=1))
    cuenta: dict[dt.date, int] = {}
    for a in sch.asignaciones:
        cuenta[a.fecha] = cuenta.get(a.fecha, 0) + 1
    return list(cuenta.values())


def test_plazas_pone_varias_personas_por_dia():
    assert all(n >= 2 for n in _por_dia(2))


def test_por_defecto_una_plaza():
    assert _config(1).turnos[0].plazas == 1
