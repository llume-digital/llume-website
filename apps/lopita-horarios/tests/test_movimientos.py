"""Mover turnos entre personas y días, turnos de cocina o camarero, libranzas fijas y contador de vacaciones."""
import datetime as dt

import pytest

from lopita_horarios import Config
from lopita_horarios.edicion import EdicionInvalida, Tramo, aplicar_dia
from lopita_horarios.models import Absence, Assignment, Employee, Puesto, Schedule
from lopita_horarios.movimientos import Casilla, mover_turno
from lopita_horarios.solver import SolveOptions, generate
from lopita_horarios.validator import validate
from lopita_horarios.vacaciones import derecho_anual, saldo

LUN = dt.date(2026, 11, 9)
MIE = LUN + dt.timedelta(days=2)
JUE = LUN + dt.timedelta(days=3)
SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


@pytest.fixture()
def config() -> Config:
    return Config.model_validate({
        "empleados": [
            {"id": "ana", "nombre": "Ana", "horas_semanales": 30, "puede_abrir": True, "puede_cerrar": True, "puestos": ["sala"]},
            {"id": "bea", "nombre": "Bea", "horas_semanales": 30, "puestos": ["cocina", "sala"], "libranzas_fijas": ["jueves"]},
            {"id": "cris", "nombre": "Cris", "horas_semanales": 30, "puestos": ["cocina"]},
        ],
        "turnos": [
            {"id": "AP", "nombre": "Apertura", "inicio": "08:00", "fin": "14:00", "tipo": "apertura"},
            {"id": "M", "nombre": "Mañana", "inicio": "09:00", "fin": "15:00"},
            {"id": "CO", "nombre": "Cocina", "inicio": "10:00", "fin": "16:00", "puesto": "cocina"},
        ],
        "tipos_dia": [{"nombre": "normal", "franjas": [{"inicio": "08:00", "fin": "21:00", "personas": 1}]}],
        "tipo_dia_por_semana": {d: "normal" for d in SEMANA},
        "ausencias": [{"empleado_id": "ana", "desde": "2026-11-11", "hasta": "2026-11-11", "motivo": "vacaciones"}],
    })


@pytest.fixture()
def horario() -> Schedule:
    return Schedule(desde=LUN, hasta=LUN + dt.timedelta(days=6), asignaciones=[
        Assignment(empleado_id="bea", fecha=LUN, turno_id="M", puesto="sala"),
        Assignment(empleado_id="cris", fecha=LUN, turno_id="CO", puesto="cocina"),
    ])


def test_mover_a_otro_dia(config, horario):
    nuevo = mover_turno(config, horario, Casilla("bea", LUN), Casilla("bea", MIE))
    assert {(a.empleado_id, a.fecha) for a in nuevo.asignaciones} == {("bea", MIE), ("cris", LUN)}
    assert {(l.empleado_id, l.fecha) for l in nuevo.bloqueos} == {("bea", LUN), ("bea", MIE)}
    assert len(horario.asignaciones) == 2  # el original no se toca


def test_pasar_a_otra_persona_conserva_horas_a_medida(config, horario):
    horario.asignaciones[0] = Assignment(empleado_id="bea", fecha=LUN, turno_id="M", puesto="sala", inicio="10:00", fin="14:00")
    nuevo = mover_turno(config, horario, Casilla("bea", LUN), Casilla("ana", LUN))
    a = next(x for x in nuevo.asignaciones if x.empleado_id == "ana")
    assert (a.inicio, a.fin, a.puesto) == ("10:00", "14:00", Puesto.sala)


def test_destino_ocupado_intercambia(config, horario):
    horario.asignaciones.append(Assignment(empleado_id="ana", fecha=LUN, turno_id="AP", puesto="sala"))
    horario.asignaciones[0] = Assignment(empleado_id="bea", fecha=LUN, turno_id="M", puesto="sala")
    horario.asignaciones[2] = Assignment(empleado_id="ana", fecha=LUN, turno_id="M", puesto="sala")
    nuevo = mover_turno(config, horario, Casilla("bea", LUN), Casilla("ana", LUN))
    assert {a.empleado_id: a.turno_id for a in nuevo.asignaciones} == {"ana": "M", "bea": "M", "cris": "CO"}


def test_intercambio_rechazado_si_no_puede_abrir(config, horario):
    horario.asignaciones[1] = Assignment(empleado_id="ana", fecha=LUN, turno_id="AP", puesto="sala")
    with pytest.raises(EdicionInvalida, match="no está habilitado para abrir"):
        mover_turno(config, horario, Casilla("bea", LUN), Casilla("ana", LUN))


@pytest.mark.parametrize("destino,texto", [
    (Casilla("bea", JUE), "libra los jueves"),
    (Casilla("ana", MIE), "está de vacaciones"),
    (Casilla("bea", LUN - dt.timedelta(days=1)), "fuera del periodo"),
    (Casilla("bea", LUN), "ya está ahí"),
])
def test_reglas_duras_del_destino(config, horario, destino, texto):
    with pytest.raises(EdicionInvalida, match=texto):
        mover_turno(config, horario, Casilla("bea", LUN), destino)


def test_turno_de_cocina_solo_para_quien_cocina(config, horario):
    with pytest.raises(EdicionInvalida, match="no trabaja en cocina"):
        mover_turno(config, horario, Casilla("cris", LUN), Casilla("ana", LUN))


def test_motor_respeta_el_puesto_del_turno(config):
    config.turnos = [s for s in config.turnos if s.id == "CO"]
    config.ausencias = []
    h = generate(config, LUN, LUN + dt.timedelta(days=2), SolveOptions(max_segundos=5))
    assert h.asignaciones
    assert all(a.empleado_id in {"bea", "cris"} and a.puesto.value == "cocina" for a in h.asignaciones)


def test_validador_avisa_si_el_puesto_no_es_el_del_turno(config):
    a = [Assignment(empleado_id="bea", fecha=LUN, turno_id="CO", puesto="sala")]
    errores = [i.codigo for i in validate(config, LUN, LUN, a) if i.nivel == "error"]
    assert "puesto_turno" in errores


def test_vista_diaria_no_pone_a_nadie_en_su_libranza(config, horario):
    horario.hasta = JUE
    with pytest.raises(EdicionInvalida, match="libranza fija"):
        aplicar_dia(config, horario, JUE, [Tramo(empleado_id="bea", inicio="09:00", fin="15:00")])


# --------------------------------------------------------------------- vacaciones
def emp(**kw) -> Employee:
    return Employee(id="x", nombre="X", horas_semanales=20, **kw)


def test_derecho_anual_completo_y_proporcional():
    assert derecho_anual(emp(), 2026) == 30
    assert derecho_anual(emp(fecha_alta=dt.date(2020, 3, 1)), 2026) == 30
    assert derecho_anual(emp(fecha_alta=dt.date(2026, 7, 1)), 2026) == 16  # 184/365 de 30 = 15,1 -> 16
    assert derecho_anual(emp(fecha_alta=dt.date(2026, 8, 1)), 2026) == 13  # 153/365 de 30 = 12,6 -> 13
    assert derecho_anual(emp(fecha_alta=dt.date(2026, 12, 31)), 2026) == 1
    assert derecho_anual(emp(fecha_alta=dt.date(2027, 1, 1)), 2026) == 0
    assert derecho_anual(emp(dias_vacaciones=32), 2026) == 32
    assert derecho_anual(emp(fecha_alta=dt.date(2024, 5, 5)), 2024) == 20  # año bisiesto: 241/366 de 30 = 19,8 -> 20


def test_minimo_legal_de_30_dias():
    with pytest.raises(ValueError):
        emp(dias_vacaciones=22)


def test_saldo_cuenta_dias_naturales_sin_duplicar(config):
    e = config.employee("ana")
    config.ausencias = [
        Absence(empleado_id="ana", desde=dt.date(2026, 8, 1), hasta=dt.date(2026, 8, 10), motivo="vacaciones"),
        Absence(empleado_id="ana", desde=dt.date(2026, 8, 8), hasta=dt.date(2026, 8, 12), motivo="vacaciones"),
        Absence(empleado_id="ana", desde=dt.date(2026, 9, 1), hasta=dt.date(2026, 9, 3), motivo="baja"),
        Absence(empleado_id="ana", desde=dt.date(2026, 12, 30), hasta=dt.date(2027, 1, 5), motivo="vacaciones"),
    ]
    s = saldo(config, e, 2026, dt.date(2026, 8, 5))
    assert (s.derecho, s.disfrutadas, s.programadas, s.quedan) == (30, 5, 7 + 2, 30 - 5 - 9)
