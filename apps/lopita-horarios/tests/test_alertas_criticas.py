"""Alertas críticas: con ellas el horario no vale (nadie en el local, nadie que pueda abrir o cerrar)."""
import datetime as dt

import pytest

from lopita_horarios import Config, SolveOptions
from lopita_horarios import generacion
from lopita_horarios.alertas import Severidad, evaluar
from lopita_horarios.criticas import TipoCritico, problemas
from lopita_horarios.generacion import asegurar
from lopita_horarios.models import Assignment, Schedule

LUN = dt.date(2026, 11, 9)  # lunes
DOM = LUN + dt.timedelta(days=6)
# Con varios hilos CP-SAT demuestra el óptimo enseguida; con uno solo, el peso tan alto de lo crítico le cuesta más.
FAST = SolveOptions(max_segundos=10)
DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


def config(ausencias=(), **reglas) -> Config:
    """Un día de 8:00 a 20:00 con una persona: Ana y Bea pueden abrir; Bea y Cris, cerrar; Dani, ninguna de las dos."""
    return Config.model_validate({
        "empleados": [
            {"id": "ana", "nombre": "Ana", "horas_semanales": 30, "puede_abrir": True},
            {"id": "bea", "nombre": "Bea", "horas_semanales": 30, "puede_abrir": True, "puede_cerrar": True},
            {"id": "cris", "nombre": "Cris", "horas_semanales": 30, "puede_cerrar": True},
            {"id": "dani", "nombre": "Dani", "horas_semanales": 12},
        ],
        "turnos": [{"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "14:00"},
                   {"id": "T", "nombre": "Tarde", "inicio": "14:00", "fin": "20:00"}],
        "tipos_dia": [{"nombre": "normal", "franjas": [{"inicio": "08:00", "fin": "20:00", "personas": 1}]}],
        "tipo_dia_por_semana": {d: "normal" for d in DIAS},
        "ausencias": list(ausencias),
        "reglas": {"margen_periodo_horas": 2, **reglas},
    })


def horario(asignaciones, estado="borrador") -> Schedule:
    return Schedule(desde=LUN, hasta=DOM, estado=estado, asignaciones=[
        Assignment(empleado_id=e, fecha=LUN + dt.timedelta(days=d), turno_id=t) for e, d, t in asignaciones])


# Semana correcta: siempre abre alguien habilitado (Ana o Bea) y cierra alguien habilitado (Bea o Cris).
BUENA = [("ana", 0, "M"), ("cris", 0, "T"), ("ana", 1, "M"), ("cris", 1, "T"), ("bea", 2, "M"), ("cris", 2, "T"),
         ("ana", 3, "M"), ("bea", 3, "T"), ("ana", 4, "M"), ("cris", 4, "T"), ("bea", 5, "M"), ("cris", 5, "T"),
         ("ana", 6, "M"), ("bea", 6, "T")]


def sin(lista, *quitar):
    return [x for x in lista if x not in quitar]


def criticas(config, h):
    return [a for a in evaluar(config, h) if a.severidad == Severidad.critica]


def test_un_horario_bien_cubierto_no_tiene_alertas_criticas():
    assert problemas(config(), horario(BUENA)) == []
    assert criticas(config(), horario(BUENA)) == []


def test_un_momento_sin_nadie_es_critico():
    # El martes por la tarde no hay nadie
    [a] = criticas(config(), horario(sin(BUENA, ("cris", 1, "T"))))
    assert a.codigo == "sin_nadie" and a.categoria.value == "critica" and a.importancia == 100
    assert "martes 10/11: no hay nadie en el local de 14:00 a 20:00" in a.detalle
    assert not a.silenciable


def test_quien_esta_ausente_no_cuenta_aunque_tenga_turno():
    # Cris tiene turno el martes por la tarde, pero está de baja: en la práctica no hay nadie
    c = config(ausencias=[{"empleado_id": "cris", "desde": "2026-11-10", "hasta": "2026-11-10", "motivo": "baja"}])
    [p] = problemas(c, horario(BUENA))
    assert p.tipo == TipoCritico.sin_nadie and p.ausentes == ["Cris"]
    assert "Cris tenía turno, pero no va a venir" in p.texto
    # Igual si ya no está en la plantilla
    c = config()
    c.empleados[2].activo = False
    assert [p.tipo for p in problemas(c, horario(BUENA))] == [TipoCritico.sin_nadie] * 5


def test_abrir_y_cerrar_piden_a_alguien_habilitado():
    # El lunes abre Dani y cierra Ana: hay gente, pero ninguna de las dos está habilitada para eso
    h = horario(sin(BUENA, ("ana", 0, "M"), ("cris", 0, "T")) + [("dani", 0, "M"), ("ana", 0, "T")])
    al = {a.codigo: a for a in criticas(config(), h)}
    assert set(al) == {"apertura_sin_habilitado", "cierre_sin_habilitado"}
    assert "a las 08:00, al empezar el día, no hay nadie habilitado para abrir (Dani está, pero no puede)" in al["apertura_sin_habilitado"].detalle
    assert "hasta las 20:00, al terminar el día, no hay nadie habilitado para cerrar" in al["cierre_sin_habilitado"].detalle


def test_cierra_quien_se_queda_hasta_el_final():
    # Cris (puede cerrar) se va a las 18:00 y se queda Dani: al final del día no queda nadie habilitado
    c = config()
    c.turnos.append(c.turnos[1].model_copy(update={"id": "T2", "nombre": "Tarde corta", "fin": "18:00"}))
    c.turnos.append(c.turnos[1].model_copy(update={"id": "TT", "nombre": "Última hora", "inicio": "18:00"}))
    h = horario(sin(BUENA, ("cris", 0, "T")) + [("cris", 0, "T2"), ("dani", 0, "TT")])
    assert [a.codigo for a in criticas(c, h)] == ["cierre_sin_habilitado"]


def test_no_se_pueden_silenciar():
    c = config()
    c.alertas.desactivadas = ["sin_nadie", "apertura_sin_habilitado"]
    assert [a.codigo for a in criticas(c, horario(sin(BUENA, ("cris", 1, "T"))))] == ["sin_nadie"]


def test_dice_si_tiene_arreglo_y_por_que_no():
    # El miércoles Ana está de vacaciones y Bea libra: nadie que pueda abrir puede estar a las 8:00
    c = config(ausencias=[{"empleado_id": "ana", "desde": "2026-11-11", "hasta": "2026-11-11", "motivo": "vacaciones"}])
    c.empleados[1].libranzas_fijas = ["miercoles"]
    h = horario(sin(BUENA, ("bea", 2, "M")) + [("dani", 2, "M")])
    [p] = problemas(c, h)
    assert p.tipo == TipoCritico.apertura_sin_habilitado and not p.arreglable
    assert p.causa == ("Nadie habilitado para abrir puede estar ese día a esa hora: Ana está de vacaciones "
                       "y Bea libra los miércoles.")
    [a] = criticas(c, h)
    assert p.causa in a.detalle and "No se arregla moviendo turnos" in a.sugerencia
    # Con alguien habilitado disponible sí tiene arreglo
    [p] = problemas(config(), h)
    assert p.arreglable and p.causa is None


def test_un_hueco_sin_nadie_disponible_no_tiene_arreglo():
    c = config(ausencias=[{"empleado_id": e, "desde": "2026-11-10", "hasta": "2026-11-10", "motivo": "vacaciones"}
                          for e in ("ana", "bea", "cris", "dani")])
    [p] = problemas(c, horario([x for x in BUENA if x[1] != 1]))
    assert p.tipo == TipoCritico.sin_nadie and not p.arreglable
    assert p.causa.startswith("No hay personal suficiente: de 08:00 a 20:00 no hay nadie disponible (Ana está de vacaciones")


# ---------------------------------------------------------------- el motor
def test_el_motor_los_evita_aunque_cueste_otras_cosas():
    # Dani no puede abrir ni cerrar; aun así el motor deja siempre a alguien habilitado al principio y al final
    h = asegurar(config(), None, desde=LUN, hasta=DOM, opciones=FAST).horario
    assert problemas(config(), h) == []


# ---------------------------------------------------------------- generar con reintentos
def test_si_sale_bien_a_la_primera_no_reintenta():
    r = asegurar(config(), None, desde=LUN, hasta=DOM, opciones=FAST)
    assert r.valido and [i.metodo for i in r.intentos] == ["generar"] and r.motivo is None


def test_sin_arreglo_posible_no_reintenta_y_explica_por_que():
    c = config(ausencias=[{"empleado_id": "ana", "desde": "2026-11-11", "hasta": "2026-11-11", "motivo": "vacaciones"}])
    c.empleados[1].libranzas_fijas = ["miercoles"]
    r = asegurar(c, None, desde=LUN, hasta=DOM, opciones=FAST)
    assert not r.valido and len(r.intentos) == 1
    assert [p.tipo for p in r.problemas] == [TipoCritico.apertura_sin_habilitado]
    assert "se puede arreglar moviendo turnos: hay que cambiar algo fuera del horario" in r.motivo


def test_si_el_motor_ya_dio_el_optimo_no_repite():
    # Solo Ana puede abrir y debe librar dos días a la semana: siempre está disponible, pero no puede abrir los 7 días
    c = config()
    c.empleados[1].puede_abrir = False
    r = asegurar(c, None, desde=LUN, hasta=DOM, opciones=FAST)
    assert not r.valido and len(r.intentos) == 1 and r.intentos[0].estado_solver == "OPTIMAL"
    assert len(r.problemas) == 2 and all(p.arreglable for p in r.problemas)
    assert "repetir daría el mismo resultado" in r.motivo


@pytest.fixture()
def motor_falso(monkeypatch):
    """Sustituye el motor por respuestas preparadas, para ver la secuencia de reintentos sin depender del solver."""
    llamadas = []

    def preparar(respuestas):
        def falso(config, desde, hasta, opciones=None, **kw):
            llamadas.append({"segundos": opciones.max_segundos, "referencia": kw.get("referencia") is not None})
            asignaciones, estado = respuestas[min(len(llamadas) - 1, len(respuestas) - 1)]
            return horario(asignaciones).model_copy(update={"estado_solver": estado})
        monkeypatch.setattr(generacion, "generate", falso)
        return llamadas
    return preparar


MALA = sin(BUENA, ("cris", 1, "T"))          # el martes por la tarde no hay nadie
PEOR = sin(MALA, ("cris", 2, "T"))           # y el miércoles tampoco


def test_reintenta_solucionando_y_se_queda_con_el_que_vale(motor_falso):
    llamadas = motor_falso([(MALA, "FEASIBLE"), (BUENA, "FEASIBLE")])
    r = asegurar(config(), None, desde=LUN, hasta=DOM, opciones=FAST)
    assert r.valido and [i.metodo for i in r.intentos] == ["generar", "solucionar"]
    assert [i.criticos for i in r.intentos] == [1, 0]
    assert llamadas[1]["referencia"]  # solucionar parte del horario generado


def test_como_mucho_dos_reintentos_y_el_ultimo_con_mas_tiempo(motor_falso):
    llamadas = motor_falso([(PEOR, "FEASIBLE"), (MALA, "FEASIBLE"), (PEOR, "FEASIBLE")])
    r = asegurar(config(), None, desde=LUN, hasta=DOM, opciones=FAST)
    assert [i.metodo for i in r.intentos] == ["generar", "solucionar", "regenerar"]
    assert [c["segundos"] for c in llamadas] == [10, 10, 20]
    assert not r.valido and len(r.problemas) == 1  # se queda con el mejor intento (el segundo)
    assert "reintentado 2 veces" in r.motivo


def test_si_un_reintento_da_lo_mismo_sigue_con_el_siguiente(motor_falso):
    motor_falso([(MALA, "FEASIBLE"), (MALA, "FEASIBLE"), (BUENA, "FEASIBLE")])
    r = asegurar(config(), None, desde=LUN, hasta=DOM, opciones=FAST)
    assert r.valido and [i.metodo for i in r.intentos] == ["generar", "solucionar", "regenerar"]


# ---------------------------------------------------------------- arreglar uno existente
def test_arreglar_parte_del_horario_y_quita_los_turnos_de_quien_no_viene():
    # Cris se da de baja el martes; el resto de la semana se queda como estaba si se puede
    c = config(ausencias=[{"empleado_id": "cris", "desde": "2026-11-10", "hasta": "2026-11-10", "motivo": "baja"}])
    r = asegurar(c, horario(BUENA), desde=LUN, hasta=DOM, opciones=FAST)
    assert r.valido and [i.metodo for i in r.intentos] == ["solucionar"]
    martes = LUN + dt.timedelta(days=1)
    assert not any(a.empleado_id == "cris" and a.fecha == martes for a in r.horario.asignaciones)
    assert any(a.fecha == martes and a.turno_id == "T" for a in r.horario.asignaciones)


def test_arreglar_sin_nada_critico_igual_quita_turnos_de_ausentes():
    # Dani tiene un turno de refuerzo el lunes y se va de vacaciones: no deja a nadie sin cubrir, pero ese turno sobra
    c = config(ausencias=[{"empleado_id": "dani", "desde": "2026-11-09", "hasta": "2026-11-09", "motivo": "vacaciones"}])
    h = horario(BUENA + [("dani", 0, "M")])
    assert problemas(c, h) == []
    r = asegurar(c, h, desde=LUN, hasta=DOM, opciones=FAST)
    assert r.valido and not any(a.empleado_id == "dani" and a.fecha == LUN for a in r.horario.asignaciones)
    assert not [i for i in r.horario.incidencias if i.nivel == "error"]


def test_arreglar_no_toca_los_dias_que_no_se_pueden_cambiar():
    from lopita_horarios.solucionador import congelar_antes
    c = config(ausencias=[{"empleado_id": "cris", "desde": "2026-11-13", "hasta": "2026-11-13", "motivo": "baja"}])
    h = horario(BUENA)  # Cris tenía turno el viernes
    jueves = LUN + dt.timedelta(days=3)
    r = asegurar(c, h, desde=LUN, hasta=DOM, opciones=FAST, congelados=congelar_antes(c, h, jueves), cambiable_desde=jueves)
    assert r.valido and r.horario.bloqueos == []
    antes = lambda hh: {(a.empleado_id, a.fecha, a.turno_id) for a in hh.asignaciones if a.fecha < jueves}  # noqa: E731
    assert antes(r.horario) == antes(h)
