"""Resolutor HiGHS (cp_highs.py): misma API que la parte de CP-SAT que usa el motor y mismos resultados."""
import copy
from collections import Counter
import datetime as dt
import json
import pathlib

import pytest

from lopita_horarios import Config, SolveOptions, generate
from lopita_horarios import cp_highs as cp
from lopita_horarios import resolutor

DATA = json.loads((pathlib.Path(__file__).parent.parent / "datos" / "ejemplo.json").read_text(encoding="utf-8"))
WEEK = (dt.date(2026, 11, 9), dt.date(2026, 11, 15))


def resolver(model: cp.CpModel) -> cp.CpSolver:
    s = cp.CpSolver()
    s.parameters.max_time_in_seconds = 10
    s.estado = s.Solve(model)  # type: ignore[attr-defined]
    return s


def test_expresiones_y_restricciones_lineales():
    m = cp.CpModel()
    a, b = m.NewIntVar(0, 10, "a"), m.NewIntVar(0, 10, "b")
    flag = m.NewBoolVar("f")
    m.Add(a + 2 * b >= 7)
    m.Add(sum([a, b]) <= 5)
    m.Add(a - b == 1 - flag)
    m.AddBoolOr([flag, flag.Not()])
    m.Minimize(3 * a + b + 10 * (1 - flag))
    s = resolver(m)
    assert s.StatusName(s.estado) == "OPTIMAL"
    va, vb, vf = s.Value(a), s.Value(b), s.Value(flag)
    assert va + 2 * vb >= 7 and va + vb <= 5 and va - vb == 1 - vf
    assert (va, vb, vf) == (3, 2, 0)  # con flag=1 haría falta a=b>=3, que pasa del tope a+b<=5


def test_sumas_largas_se_aplanan_sin_recursion():
    m = cp.CpModel()
    xs = [m.NewBoolVar(f"x{i}") for i in range(50000)]
    coefs, constante = cp._aplanar(sum(2 * x for x in xs) - xs[0] + 7)  # árbol de 50 000 niveles
    assert constante == 7 and len(coefs) == 50000
    assert coefs[xs[0].indice] == 1 and coefs[xs[-1].indice] == 2


def test_al_menos_uno_y_como_mucho_uno():
    m = cp.CpModel()
    xs = [m.NewBoolVar(f"x{i}") for i in range(40)]
    m.Add(sum(xs) == 3)
    m.AddAtMostOne(xs[:10])
    m.AddBoolOr([xs[5].Not(), xs[6].Not()])
    m.Minimize(sum(i * x for i, x in enumerate(xs)))
    s = resolver(m)
    assert s.StatusName(s.estado) == "OPTIMAL"
    assert [i for i, x in enumerate(xs) if s.Value(x)] == [0, 10, 11]


def test_imposible_y_constantes():
    m = cp.CpModel()
    x = m.NewBoolVar("x")
    m.Add(x >= 2)
    s = resolver(m)
    assert s.StatusName(s.estado) == "INFEASIBLE"
    with pytest.raises(RuntimeError):
        s.Value(x)

    m = cp.CpModel()
    y = m.NewBoolVar("y")
    m.Add(y - y >= 1)  # sin variables efectivas, pero imposible: que lo diga el resolutor
    m.Add(y + 0 >= 0)  # siempre cierta
    assert resolver(m).estado == cp.INFEASIBLE  # type: ignore[attr-defined]


def test_errores_de_uso():
    m = cp.CpModel()
    x = m.NewBoolVar("x")
    with pytest.raises(TypeError):
        bool(x + 1)  # «if expr:» por error
    with pytest.raises(TypeError):
        m.Add(x + 1)  # falta la comparación
    with pytest.raises(TypeError):
        x * 1.5
    with pytest.raises(ValueError):
        m.NewIntVar(3, 1, "vacía")


def test_la_pista_no_cambia_el_optimo():
    m = cp.CpModel()
    xs = [m.NewBoolVar(f"x{i}") for i in range(5)]
    m.Add(sum(xs) == 2)
    for x in xs:
        m.AddHint(x, 1)  # pista imposible: se ignora
    m.Minimize(sum((5 - i) * x for i, x in enumerate(xs)))
    s = resolver(m)
    assert [s.Value(x) for x in xs] == [0, 0, 0, 1, 1]


def test_elegir_resolutor(monkeypatch):
    assert resolutor.cargar("highs") is cp
    monkeypatch.setenv("LOPITA_RESOLUTOR", "highs")
    assert resolutor.cargar() is cp
    with pytest.raises(ValueError):
        resolutor.cargar("glpk")


def test_misma_semana_con_los_dos_resolutores():
    """Los dos llegan al óptimo de la semana de ejemplo, sin errores y con los mismos tipos de aviso."""
    pytest.importorskip("ortools")
    config = Config.model_validate(copy.deepcopy(DATA))
    hs = {r: generate(config, *WEEK, SolveOptions(max_segundos=30, hilos=1, resolutor=r)) for r in ("cpsat", "highs")}
    assert {h.estado_solver for h in hs.values()} == {"OPTIMAL"}
    for h in hs.values():
        assert not [i for i in h.incidencias if i.nivel == "error"]
    codigos = {r: Counter(i.codigo for i in h.incidencias) for r, h in hs.items()}
    assert codigos["cpsat"] == codigos["highs"]
    total = {r: sum(e.horas for e in h.resumen) for r, h in hs.items()}
    assert total["cpsat"] == total["highs"]
