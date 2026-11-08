"""Edición manual de un día (vista diaria): tramos -> turnos, bloqueos y evaluación de alertas."""
import datetime as dt

import pytest
from pydantic import ValidationError

from lopita_horarios import Config
from lopita_horarios.edicion import EdicionInvalida, Tramo, aplicar_dia, evaluar, turno_base
from lopita_horarios.models import Assignment, Lock, Puesto, Schedule

LUN = dt.date(2026, 11, 9)
MAR = LUN + dt.timedelta(days=1)
SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


@pytest.fixture()
def config() -> Config:
    return Config.model_validate({
        "empleados": [
            {"id": "ana", "nombre": "Ana", "horas_semanales": 30, "puede_abrir": True, "puede_cerrar": True, "puestos": ["sala"]},
            {"id": "bea", "nombre": "Bea", "horas_semanales": 30, "puestos": ["cocina", "sala"]},
            {"id": "cris", "nombre": "Cris", "horas_semanales": 30, "puede_cerrar": True},
        ],
        "turnos": [
            {"id": "AP", "nombre": "Apertura", "inicio": "08:00", "fin": "14:00", "tipo": "apertura"},
            {"id": "M", "nombre": "Mañana", "inicio": "09:00", "fin": "15:00"},
            {"id": "CI", "nombre": "Cierre", "inicio": "15:00", "fin": "21:00", "tipo": "cierre"},
        ],
        "tipos_dia": [{"nombre": "normal", "franjas": [{"inicio": "08:00", "fin": "21:00", "personas": 1}]}],
        "tipo_dia_por_semana": {d: "normal" for d in SEMANA},
    })


@pytest.fixture()
def horario() -> Schedule:
    return Schedule(desde=LUN, hasta=MAR, asignaciones=[
        Assignment(empleado_id="ana", fecha=LUN, turno_id="AP", puesto="sala"),
        Assignment(empleado_id="bea", fecha=LUN, turno_id="M", puesto="cocina"),
        Assignment(empleado_id="cris", fecha=LUN, turno_id="CI", puesto="sala"),
        Assignment(empleado_id="ana", fecha=MAR, turno_id="AP", puesto="sala"),
        Assignment(empleado_id="cris", fecha=MAR, turno_id="CI", puesto="sala"),
    ], bloqueos=[Lock(empleado_id="cris", fecha=LUN, turno_id="CI")])


def tramos_de(h: Schedule, fecha: dt.date) -> list[Tramo]:
    """Los tramos que mostraría la vista diaria para ese día, sin tocar nada."""
    c_turnos = {"AP": ("08:00", "14:00"), "M": ("09:00", "15:00"), "CI": ("15:00", "21:00")}
    out = []
    for a in h.asignaciones:
        if a.fecha == fecha:
            ini, fin = (a.inicio, a.fin) if a.inicio else c_turnos[a.turno_id]
            out.append(Tramo(empleado_id=a.empleado_id, inicio=ini, fin=fin, puesto=a.puesto, turno_id=a.turno_id))
    return out


def con(tramos: list[Tramo], empleado: str, **cambios) -> list[Tramo]:
    return [t.model_copy(update=cambios) if t.empleado_id == empleado else t for t in tramos]


# ---------------------------------------------------------------------------- turno base
def test_turno_base_es_el_que_mas_se_solapa_y_respeta_quien_puede_abrir(config):
    assert turno_base(config, "ana", LUN, "08:00", "14:00").id == "AP"
    assert turno_base(config, "ana", LUN, "08:30", "14:30").id == "AP"
    # Bea no puede abrir: de 8 a 14 su turno base es la mañana, con horas a medida
    assert turno_base(config, "bea", LUN, "08:00", "14:00").id == "M"
    assert turno_base(config, "cris", LUN, "16:00", "21:00").id == "CI"


def test_a_igualdad_se_queda_el_turno_que_tenia(config):
    # 11:30-14:30 se solapa 2,5 h con AP y 3 h con M; 11:00-14:00 se solapa 3 h con los dos
    assert turno_base(config, "ana", LUN, "11:00", "14:00", preferido="M").id == "M"
    assert turno_base(config, "ana", LUN, "11:00", "14:00", preferido="AP").id == "AP"


# ---------------------------------------------------------------------------- aplicar
def test_sin_cambios_el_horario_queda_igual(config, horario):
    nuevo = aplicar_dia(config, horario, LUN, tramos_de(horario, LUN))
    assert nuevo.asignaciones == horario.asignaciones and nuevo.bloqueos == horario.bloqueos


def test_mover_y_estirar_crea_un_turno_a_medida_bloqueado(config, horario):
    nuevo = aplicar_dia(config, horario, LUN, con(tramos_de(horario, LUN), "bea", inicio="10:00", fin="16:30"))
    bea = next(a for a in nuevo.asignaciones if a.empleado_id == "bea" and a.fecha == LUN)
    assert (bea.turno_id, bea.inicio, bea.fin, bea.puesto) == ("M", "10:00", "16:30", Puesto.cocina)
    assert Lock(empleado_id="bea", fecha=LUN, turno_id="M", inicio="10:00", fin="16:30", puesto="cocina") in nuevo.bloqueos
    # El resto del horario no cambia, ni el bloqueo que ya había
    assert [a for a in nuevo.asignaciones if a.empleado_id != "bea"] == [a for a in horario.asignaciones if a.empleado_id != "bea"]
    assert Lock(empleado_id="cris", fecha=LUN, turno_id="CI") in nuevo.bloqueos
    assert horario.asignaciones[1].inicio is None  # no toca el original


def test_horas_iguales_a_un_turno_no_son_a_medida(config, horario):
    nuevo = aplicar_dia(config, horario, LUN, con(tramos_de(horario, LUN), "bea", inicio="15:00", fin="21:00", turno_id=None))
    bea = next(a for a in nuevo.asignaciones if a.empleado_id == "bea" and a.fecha == LUN)
    assert (bea.turno_id, bea.inicio, bea.fin) == ("M", "15:00", "21:00")  # Bea no puede cerrar: CI no vale de base
    nuevo = aplicar_dia(config, horario, LUN, con(tramos_de(horario, LUN), "ana", inicio="15:00", fin="21:00", turno_id=None))
    ana = next(a for a in nuevo.asignaciones if a.empleado_id == "ana" and a.fecha == LUN)
    assert (ana.turno_id, ana.inicio, ana.fin) == ("CI", None, None)


def test_quitar_y_anadir_tramos(config, horario):
    tramos = [t for t in tramos_de(horario, MAR) if t.empleado_id != "ana"]
    tramos.append(Tramo(empleado_id="bea", inicio="08:00", fin="15:00"))
    nuevo = aplicar_dia(config, horario, MAR, tramos)
    del_dia = {a.empleado_id: a for a in nuevo.asignaciones if a.fecha == MAR}
    assert set(del_dia) == {"bea", "cris"}
    assert del_dia["bea"].puesto == Puesto.cocina  # su puesto principal
    assert Lock(empleado_id="ana", fecha=MAR) in nuevo.bloqueos  # libra por decisión del encargado
    assert {(b.empleado_id, b.fecha) for b in nuevo.bloqueos} == {("cris", LUN), ("ana", MAR), ("bea", MAR)}


def test_cambiar_solo_el_puesto(config, horario):
    nuevo = aplicar_dia(config, horario, LUN, con(tramos_de(horario, LUN), "bea", puesto="sala"))
    assert next(a for a in nuevo.asignaciones if a.empleado_id == "bea" and a.fecha == LUN).puesto == Puesto.sala


@pytest.mark.parametrize("tramos, mensaje", [
    ([Tramo(empleado_id="zoe", inicio="08:00", fin="12:00")], "desconocida"),
    ([Tramo(empleado_id="ana", inicio="08:00", fin="12:00"), Tramo(empleado_id="ana", inicio="16:00", fin="20:00")], "dos tramos"),
    ([Tramo(empleado_id="ana", inicio="08:00", fin="12:00", puesto="cocina")], "no trabaja en cocina"),
])
def test_tramos_invalidos(config, horario, tramos, mensaje):
    with pytest.raises(EdicionInvalida, match=mensaje):
        aplicar_dia(config, horario, LUN, tramos)


def test_fecha_fuera_del_periodo_y_tramo_al_reves(config, horario):
    with pytest.raises(EdicionInvalida, match="fuera del periodo"):
        aplicar_dia(config, horario, LUN - dt.timedelta(days=1), [])
    with pytest.raises(ValidationError):
        Tramo(empleado_id="ana", inicio="12:00", fin="08:00")


# ---------------------------------------------------------------------------- evaluar
def test_evaluar_dice_que_alertas_y_reglas_trae_un_cambio(config, horario):
    # Quitar a Cris el lunes deja la tarde sin nadie (crítica) y la persona que queda no cierra
    tramos = [t for t in tramos_de(horario, LUN) if t.empleado_id != "cris"]
    nuevo = aplicar_dia(config, horario, LUN, tramos)
    ev = evaluar(config, horario, nuevo, LUN)
    assert [(c.empleado_id, c.antes, c.despues) for c in ev.cambios] == [("cris", "CI#sala", None)]
    assert any("Cris libra" in m.texto for m in ev.movimientos)
    assert {a.codigo for a in ev.nuevas} >= {"sin_nadie"}
    assert ev.criticas and all(a.severidad == "critica" for a in ev.criticas)
    assert ev.alertas_despues["critica"] > ev.alertas_antes["critica"]
    assert [h.empleado_id for h in ev.horas] == ["cris"] and ev.horas[0].antes - ev.horas[0].despues == 6


def test_evaluar_una_regla_incumplida(config, horario):
    # Ana cierra el lunes hasta las 23:00 y abre el martes a las 8:00: menos de 12 h de descanso
    nuevo = aplicar_dia(config, horario, LUN, con(tramos_de(horario, LUN), "ana", inicio="15:00", fin="23:00"))
    ev = evaluar(config, horario, nuevo, LUN)
    assert ev.errores_despues > ev.errores_antes
    assert any("descansa solo 9 h" in r for r in ev.reglas_nuevas)
