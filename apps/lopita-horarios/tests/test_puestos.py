"""Puestos (cocina y sala) y turnos a medida: modelo, demanda, motor, validador, alertas e informes."""
import datetime as dt

import pytest
from pydantic import ValidationError

from lopita_horarios import Config, SolveOptions, generate, validate
from lopita_horarios.alertas import evaluar
from lopita_horarios.cambios import diferencias, firma, leer_firma
from lopita_horarios.models import Assignment, Lock, Puesto, Schedule
from lopita_horarios.planning import demand_for
from lopita_horarios.report import coverage, hours_csv
from lopita_horarios.validator import compute_stats

LUN = dt.date(2026, 11, 9)
FAST = SolveOptions(max_segundos=10, hilos=1)
SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


def cocina_y_sala(franja=None, tareas=None, **empleados) -> Config:
    """Cuatro personas de 30 h y un turno de 8:00 a 14:00; por defecto 2 personas, al menos 1 en cocina y 1 en sala."""
    puestos = {"ana": ["sala"], "bea": ["cocina"], "cris": ["sala", "cocina"], "dani": ["cocina", "sala"], **empleados}
    return Config.model_validate({
        "empleados": [{"id": e, "nombre": e.capitalize(), "horas_semanales": 30, "puestos": p,
                       "puede_abrir": True, "puede_cerrar": True} for e, p in puestos.items()],
        "turnos": [{"id": "M", "nombre": "Mañana", "inicio": "08:00", "fin": "14:00"},
                   {"id": "T", "nombre": "Tarde", "inicio": "14:00", "fin": "20:00"}],
        "tipos_dia": [{"nombre": "normal", "franjas": [
            franja or {"inicio": "08:00", "fin": "14:00", "personas": 2, "cocina": 1, "sala": 1}]}],
        "tipo_dia_por_semana": {d: "normal" for d in SEMANA},
        "tareas": tareas or [],
    })


def un_dia(*asignaciones, bloqueos=None) -> Schedule:
    return Schedule(desde=LUN, hasta=LUN, asignaciones=list(asignaciones), bloqueos=bloqueos or [])


def a(emp, turno="M", puesto=None, inicio=None, fin=None) -> Assignment:
    return Assignment(empleado_id=emp, fecha=LUN, turno_id=turno, puesto=puesto, inicio=inicio, fin=fin)


# ---------------------------------------------------------------------------- modelo
def test_por_defecto_todos_hacen_sala_y_cocina_con_sala_como_principal():
    c = Config.model_validate({"empleados": [{"id": "x", "nombre": "X", "horas_semanales": 10}], "turnos": [],
                               "tipos_dia": [{"nombre": "n"}], "tipo_dia_por_semana": {d: "n" for d in SEMANA}})
    assert c.empleados[0].puestos == [Puesto.sala, Puesto.cocina]
    assert c.empleados[0].puesto_principal == Puesto.sala


@pytest.mark.parametrize("puestos", [[], ["sala", "sala"], ["barra"]])
def test_puestos_invalidos(puestos):
    with pytest.raises(ValidationError):
        cocina_y_sala(ana=puestos)


def test_cocina_y_sala_no_pueden_sumar_mas_que_el_total():
    with pytest.raises(ValidationError, match="suman más personas"):
        cocina_y_sala(franja={"inicio": "08:00", "fin": "14:00", "personas": 1, "cocina": 1, "sala": 1})


@pytest.mark.parametrize("inicio, fin", [("09:00", None), (None, "12:00"), ("12:00", "09:00")])
def test_horas_a_medida_tienen_que_ir_juntas_y_en_orden(inicio, fin):
    with pytest.raises(ValidationError):
        a("ana", inicio=inicio, fin=fin)


def test_turno_de_usa_las_horas_a_medida_y_conserva_el_tipo():
    c = cocina_y_sala()
    assert c.turno_de(a("ana")).minutes == 360
    medida = c.turno_de(a("ana", inicio="09:00", fin="13:30"))
    assert (medida.id, medida.inicio, medida.fin, medida.minutes) == ("M", "09:00", "13:30", 270)
    assert c.shift("M").inicio == "08:00"  # el turno definido no cambia


def test_puesto_de_una_asignacion_antigua_es_el_principal():
    c = cocina_y_sala()
    assert c.puesto_de(a("dani")) == Puesto.cocina
    assert c.puesto_de(a("dani", puesto="sala")) == Puesto.sala


# ---------------------------------------------------------------------------- demanda
def test_demanda_por_puesto_con_tareas():
    c = cocina_y_sala(tareas=[{"nombre": "Limpiar cocina", "inicio": "13:00", "fin": "14:00", "puesto": "cocina"},
                              {"nombre": "Pedidos", "inicio": "08:00", "fin": "08:30"}])
    dem = demand_for(c, LUN)
    assert dem.required[8 * 60] == 3 and dem.required[13 * 60] == 3 and dem.required[12 * 60] == 2
    assert dem.by_post[Puesto.cocina][8 * 60] == 1 and dem.by_post[Puesto.cocina][13 * 60] == 2
    assert dem.by_post[Puesto.sala][13 * 60] == 1


def test_sin_minimos_no_hay_demanda_por_puesto():
    c = cocina_y_sala(franja={"inicio": "08:00", "fin": "14:00", "personas": 2})
    assert demand_for(c, LUN).by_post == {}


# ---------------------------------------------------------------------------- motor
def test_el_motor_pone_un_cocinero_y_un_camarero():
    c = cocina_y_sala(ana=["sala"], bea=["cocina"], cris=["sala"], dani=["cocina"])
    h = generate(c, LUN, LUN + dt.timedelta(days=6), FAST)
    for d in range(7):
        dia = [x for x in h.asignaciones if x.fecha == LUN + dt.timedelta(days=d) and x.turno_id == "M"]
        assert {x.puesto for x in dia} == {Puesto.cocina, Puesto.sala}, dia
        assert all(x.empleado_id in ("bea", "dani") for x in dia if x.puesto == Puesto.cocina)
    assert not [i for i in h.incidencias if i.codigo == "falta_cobertura"]
    assert all(x.puesto in c.employee(x.empleado_id).puestos for x in h.asignaciones)


def test_quien_hace_los_dos_puestos_cubre_el_que_falta_y_si_no_va_a_su_principal():
    # Nadie más hace cocina: Dani (principal cocina) y Cris (principal sala) pueden hacerla.
    c = cocina_y_sala(ana=["sala"], bea=["sala"])
    h = generate(c, LUN, LUN + dt.timedelta(days=6), FAST)
    for d in range(7):
        dia = [x for x in h.asignaciones if x.fecha == LUN + dt.timedelta(days=d) and x.turno_id == "M"]
        assert [x.puesto for x in dia].count(Puesto.cocina) >= 1
        assert all(x.empleado_id in ("cris", "dani") for x in dia if x.puesto == Puesto.cocina)
    assert not [i for i in h.incidencias if i.codigo == "falta_cobertura" or i.nivel == "error"]
    # Dani tiene la cocina como principal: si hace cocina alguien, mejor él que Cris
    cocina = [x.empleado_id for x in h.asignaciones if x.puesto == Puesto.cocina]
    assert cocina.count("dani") >= cocina.count("cris")


def test_sin_demanda_por_puesto_cada_uno_va_a_su_principal():
    c = cocina_y_sala(franja={"inicio": "08:00", "fin": "14:00", "personas": 2})
    h = generate(c, LUN, LUN + dt.timedelta(days=6), FAST)
    assert h.asignaciones
    assert all(x.puesto == c.employee(x.empleado_id).puesto_principal for x in h.asignaciones)


def test_bloqueo_con_horas_a_medida_y_puesto_se_respeta_al_regenerar():
    c = cocina_y_sala()
    lock = Lock(empleado_id="dani", fecha=LUN, turno_id="M", inicio="09:00", fin="13:00", puesto="sala")
    h = generate(c, LUN, LUN, FAST, bloqueos=[lock])
    dani = next(x for x in h.asignaciones if x.empleado_id == "dani")
    assert (dani.turno_id, dani.inicio, dani.fin, dani.puesto) == ("M", "09:00", "13:00", Puesto.sala)
    # Dani no cubre de 8:00 a 9:00 ni de 13:00 a 14:00: el motor no puede contar con él ahí
    assert next(st for st in h.resumen if st.empleado_id == "dani").horas == 4


def test_highs_tambien_resuelve_los_puestos():
    pytest.importorskip("highspy")
    c = cocina_y_sala(ana=["sala"], bea=["cocina"], cris=["sala"], dani=["cocina"])
    h = generate(c, LUN, LUN + dt.timedelta(days=2), SolveOptions(max_segundos=10, hilos=1, resolutor="highs"))
    for d in range(3):
        dia = [x for x in h.asignaciones if x.fecha == LUN + dt.timedelta(days=d) and x.turno_id == "M"]
        assert {x.puesto for x in dia} == {Puesto.cocina, Puesto.sala}


# ---------------------------------------------------------------------------- validador, alertas e informes
def test_puesto_que_no_tiene_es_un_error():
    c = cocina_y_sala()
    issues = validate(c, LUN, LUN, [a("ana", puesto="cocina"), a("bea", puesto="cocina")])
    assert [(i.codigo, i.empleado_id) for i in issues if i.codigo == "puesto_no_habilitado"] == [("puesto_no_habilitado", "ana")]


def test_falta_de_cocina_se_avisa_aunque_haya_gente_de_sobra():
    c = cocina_y_sala()
    h = un_dia(a("ana", puesto="sala"), a("cris", puesto="sala"), a("dani", puesto="sala"))
    avisos = [i.mensaje for i in validate(c, LUN, LUN, h.asignaciones) if i.codigo == "falta_cobertura"]
    assert avisos == ["Lunes 09/11 08:00–14:00: falta 1 en cocina"]
    cob = [x for x in evaluar(c, h) if x.codigo == "falta_cobertura"]
    assert len(cob) == 1 and "en cocina faltan 08:00–14:00 (1)" in cob[0].detalle


def test_horas_a_medida_cuentan_en_horas_cobertura_e_informes():
    c = cocina_y_sala()
    h = un_dia(a("ana", puesto="sala", inicio="10:00", fin="14:00"), a("bea", puesto="cocina"))
    st = {s.empleado_id: s for s in compute_stats(c, LUN, LUN, h.asignaciones)}
    assert st["ana"].horas == 4 and st["bea"].horas == 6
    huecos = [i.mensaje for i in validate(c, LUN, LUN, h.asignaciones) if i.codigo == "falta_cobertura"]
    assert huecos == ["Lunes 09/11 08:00–10:00: falta 1 persona", "Lunes 09/11 08:00–10:00: falta 1 en sala"]
    cov = coverage(c, h)[LUN.isoformat()]
    assert cov["pasos"][0] == [8 * 60, 2, 1] and cov["puestos"]["sala"][0] == [8 * 60, 1, 0]
    csv = hours_csv(c, h)
    assert "2026-11-09;Ana;Mañana;sala;10:00;14:00;4" in csv


def test_descanso_entre_jornadas_con_horas_a_medida():
    c = cocina_y_sala()
    c.reglas.descanso_minimo_horas = 12
    martes = LUN + dt.timedelta(days=1)
    asign = [a("ana", "T", inicio="14:00", fin="22:00"),
             Assignment(empleado_id="ana", fecha=martes, turno_id="M", inicio="10:00", fin="14:00")]
    assert not [i for i in validate(c, LUN, martes, asign) if i.codigo == "descanso_corto"]
    asign[1] = Assignment(empleado_id="ana", fecha=martes, turno_id="M")
    assert [i for i in validate(c, LUN, martes, asign) if i.codigo == "descanso_corto"]


# ---------------------------------------------------------------------------- diferencias (avisos al equipo)
def test_firma_ida_y_vuelta():
    x = a("ana", "M", "cocina", "09:00", "13:00")
    assert firma(x) == "M@09:00-13:00#cocina"
    assert leer_firma(firma(x)) == ("M", "09:00", "13:00", Puesto.cocina, None)
    assert leer_firma("M") == ("M", None, None, None, None)


def test_cambiar_horas_o_puesto_es_un_cambio_pero_rellenar_el_puesto_no():
    base = [a("ana"), a("dani", puesto="cocina")]
    assert diferencias(base, [a("ana", puesto="sala"), a("dani", puesto="cocina")]) == []
    assert [c.empleado_id for c in diferencias(base, [a("ana"), a("dani", puesto="sala")])] == ["dani"]
    cambio = diferencias(base, [a("ana", inicio="09:00", fin="14:00"), a("dani", puesto="cocina")])
    assert [(c.antes, c.despues) for c in cambio] == [("M", "M@09:00-14:00")]
