import copy
import datetime as dt
import json
import pathlib

import pytest
from pydantic import ValidationError

from lopita_horarios import Config, SolveOptions, generate, validate
from lopita_horarios.models import Assignment

DATA = json.loads((pathlib.Path(__file__).parent.parent / "datos" / "ejemplo.json").read_text(encoding="utf-8"))
WEEK = (dt.date(2026, 11, 9), dt.date(2026, 11, 15))   # semana completa sin ausencias
VAC_WEEK = (dt.date(2026, 11, 16), dt.date(2026, 11, 22))  # Elena de vacaciones
FAST = SolveOptions(max_segundos=10)


def cfg(**changes) -> Config:
    data = copy.deepcopy(DATA)
    data.update(changes)
    return Config.model_validate(data)


def errors(schedule):
    return [i for i in schedule.incidencias if i.nivel == "error"]


def codes(schedule):
    return {i.codigo for i in schedule.incidencias}


def test_semana_normal_cubre_demanda_y_cumple_reglas():
    s = generate(cfg(), *WEEK, FAST)
    assert s.estado_solver in ("OPTIMAL", "FEASIBLE")
    assert not errors(s)
    assert "falta_cobertura" not in codes(s)
    # El validador independiente da el mismo veredicto
    assert not [i for i in validate(cfg(), *WEEK, s.asignaciones) if i.nivel == "error"]


def test_respeta_vacaciones_y_libranzas_fijas():
    c = cfg()
    s = generate(c, *VAC_WEEK, FAST)
    for a in s.asignaciones:
        assert not (a.empleado_id == "elena"), "Elena está de vacaciones"
        assert a.fecha.weekday() not in c.employee(a.empleado_id).fixed_off_indexes()


def test_apertura_y_cierre_solo_habilitados():
    c = cfg()
    s = generate(c, *WEEK, FAST)
    for a in s.asignaciones:
        e, sh = c.employee(a.empleado_id), c.shift(a.turno_id)
        if sh.tipo.value == "apertura":
            assert e.puede_abrir
        if sh.tipo.value == "cierre":
            assert e.puede_cerrar


def test_descanso_minimo_entre_jornadas():
    c = cfg()
    s = generate(c, *WEEK, FAST)
    by = {(a.empleado_id, a.fecha): c.shift(a.turno_id) for a in s.asignaciones}
    for (eid, d), sh in by.items():
        nxt = by.get((eid, d + dt.timedelta(days=1)))
        if nxt:
            assert 24 * 60 - sh.end_min + nxt.start_min >= 12 * 60


def test_excepciones_manuales():
    overrides = [
        {"empleado_id": "fran", "fecha": "2026-11-10", "tipo": "libre"},
        {"empleado_id": "gema", "fecha": "2026-11-11", "tipo": "turno", "turno_id": "MI"},
        {"empleado_id": "ana", "fecha": "2026-11-10", "tipo": "trabaja"},  # martes = su libranza fija
    ]
    s = generate(cfg(excepciones_asignacion=overrides), *WEEK, FAST)
    got = {(a.empleado_id, a.fecha): a.turno_id for a in s.asignaciones}
    assert ("fran", dt.date(2026, 11, 10)) not in got
    assert got[("gema", dt.date(2026, 11, 11))] == "MI"
    assert ("ana", dt.date(2026, 11, 10)) in got
    assert not errors(s)


def test_escasez_devuelve_mejor_horario_con_avisos():
    data = copy.deepcopy(DATA)
    for e in data["empleados"]:  # se dan de baja (activo=false) en lugar de borrarse, para conservar el histórico
        if e["id"] in ("fran", "gema", "irene", "julia"):
            e["activo"] = False
    s = generate(Config.model_validate(data), *WEEK, FAST)
    assert s.asignaciones, "Aunque falte gente, debe proponer un horario"
    assert "falta_cobertura" in codes(s)
    assert not errors(s)


def test_cambios_de_plantilla_y_demanda():
    data = copy.deepcopy(DATA)
    data["empleados"].append({"id": "nuevo", "nombre": "Nuevo", "horas_semanales": 25, "puede_cerrar": True})
    data["excepciones_fecha"].append({"fecha": "2026-11-12", "cerrado": True, "nota": "Reforma"})
    c = Config.model_validate(data)
    s = generate(c, *WEEK, FAST)
    assert not [a for a in s.asignaciones if a.fecha == dt.date(2026, 11, 12)]
    assert any(a.empleado_id == "nuevo" for a in s.asignaciones)
    assert not errors(s)


def test_regla_encargado_siempre():
    data = copy.deepcopy(DATA)
    data["reglas"]["encargado_siempre"] = True
    s = generate(Config.model_validate(data), *WEEK, FAST)
    assert "sin_encargado" in codes(s)  # solo 2 encargados no pueden cubrir 7 días x 15 h


def test_validador_detecta_edicion_manual_incorrecta():
    c = cfg()
    manual = [
        Assignment(empleado_id="carla", fecha=dt.date(2026, 11, 10), turno_id="CI"),
        Assignment(empleado_id="carla", fecha=dt.date(2026, 11, 11), turno_id="M"),   # descansa 9,5 h
        Assignment(empleado_id="gema", fecha=dt.date(2026, 11, 12), turno_id="AP"),   # no puede abrir
        Assignment(empleado_id="elena", fecha=dt.date(2026, 11, 17), turno_id="T"),   # fuera de periodo
    ]
    found = {i.codigo for i in validate(c, *WEEK, manual)}
    assert {"descanso_corto", "no_puede_abrir", "fuera_de_periodo", "falta_cobertura"} <= found


def test_configuracion_invalida_se_rechaza():
    with pytest.raises(ValidationError):
        cfg(ausencias=[{"empleado_id": "nadie", "desde": "2026-11-01", "hasta": "2026-11-02"}])
    with pytest.raises(ValidationError):
        cfg(turnos=[{"id": "X", "nombre": "Mal", "inicio": "22:00", "fin": "06:00"}])


def test_encadena_con_periodo_anterior():
    c = cfg()
    # Carla cierra el domingo 8 (hasta las 22:30): el lunes 9 no puede entrar antes de las 10:30
    previo = [Assignment(empleado_id="carla", fecha=dt.date(2026, 11, 8), turno_id="CI")]
    from lopita_horarios.models import Lock
    lock = [Lock(empleado_id="carla", fecha=dt.date(2026, 11, 9), turno_id="M")]
    issues = validate(c, *WEEK, [Assignment(empleado_id="carla", fecha=dt.date(2026, 11, 9), turno_id="M")], previo=previo)
    assert "descanso_corto" in {i.codigo for i in issues}
    s = generate(c, *WEEK, FAST, previo=previo)
    first = [a for a in s.asignaciones if a.empleado_id == "carla" and a.fecha == dt.date(2026, 11, 9)]
    assert all(c.shift(a.turno_id).start_min >= 10 * 60 + 30 for a in first)
    assert not errors(s)


def test_semana_partida_cuenta_dias_previos():
    c = cfg()
    # Mes que empieza en jueves: Fran ya ha trabajado lunes, martes y miércoles
    previo = [Assignment(empleado_id="fran", fecha=dt.date(2026, 11, d), turno_id="M") for d in (9, 10, 11)]
    s = generate(c, dt.date(2026, 11, 12), dt.date(2026, 11, 22), FAST, previo=previo)
    fran_week = [a for a in s.asignaciones if a.empleado_id == "fran" and a.fecha <= dt.date(2026, 11, 15)]
    assert len(fran_week) + 3 <= 5


def test_bloqueos_manuales_se_respetan_al_regenerar():
    from lopita_horarios.models import Lock
    locks = [Lock(empleado_id="irene", fecha=dt.date(2026, 11, 11), turno_id="T"),
             Lock(empleado_id="fran", fecha=dt.date(2026, 11, 9), turno_id=None)]
    s = generate(cfg(), *WEEK, FAST, bloqueos=locks)
    got = {(a.empleado_id, a.fecha): a.turno_id for a in s.asignaciones}
    assert got[("irene", dt.date(2026, 11, 11))] == "T"
    assert ("fran", dt.date(2026, 11, 9)) not in got
    assert s.bloqueos == locks


def test_saldo_de_horas_reduce_objetivo():
    s = generate(cfg(), *WEEK, FAST, saldo_horas={"fran": 6})
    st = next(r for r in s.resumen if r.empleado_id == "fran")
    assert st.horas_objetivo == 24 and st.saldo_anterior == 6
