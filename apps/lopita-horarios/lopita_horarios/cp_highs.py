"""Resolutor alternativo con HiGHS que imita la parte de `ortools.sat.python.cp_model` que usa el motor.

OR-Tools no existe para el navegador (Pyodide), pero HiGHS sí. Todas las restricciones del motor son
lineales sobre variables enteras, así que el mismo modelo se resuelve como un problema lineal entero (MILP).
Este módulo ofrece los mismos nombres (`CpModel`, `CpSolver`, `OPTIMAL`, `FEASIBLE`…) para que `solver.py`
no tenga que saber con qué resolutor trabaja.

Las expresiones se guardan como un árbol y se aplanan solo al añadirlas al modelo: `sum()` de miles de
términos encadena sumas binarias, y copiar los coeficientes en cada suma sería cuadrático.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import highspy
import numpy as np

# La clase `highspy.Highs` engancha al crearse un callback de Python (enableCallbacks). En Pyodide, crear un segundo
# objeto después de haber resuelto con otro hace que Python aborte («_PyThreadState_Attach: non-NULL old thread
# state»): el motor del navegador moría al solucionar alertas tras haber generado un horario, y la app se quedaba
# esperando para siempre. El motor no usa callbacks, así que se usa la clase de C++ sin ellos.
_HighsSinCallbacks = highspy._core._Highs

OPTIMAL = 4
FEASIBLE = 2
INFEASIBLE = 3
UNKNOWN = 0
_NOMBRES = {OPTIMAL: "OPTIMAL", FEASIBLE: "FEASIBLE", INFEASIBLE: "INFEASIBLE", UNKNOWN: "UNKNOWN"}


class LinearExpr:
    """Expresión lineal inmutable: nodo de un árbol de sumas y productos por constante."""

    __slots__ = ()

    def __add__(self, other) -> LinearExpr:
        return _Suma(self, _expr(other))

    def __radd__(self, other) -> LinearExpr:
        return _Suma(_expr(other), self)

    def __sub__(self, other) -> LinearExpr:
        return _Suma(self, _Escala(_expr(other), -1))

    def __rsub__(self, other) -> LinearExpr:
        return _Suma(_expr(other), _Escala(self, -1))

    def __neg__(self) -> LinearExpr:
        return _Escala(self, -1)

    def __mul__(self, k) -> LinearExpr:
        if not isinstance(k, int):
            raise TypeError("Solo se puede multiplicar por un entero")
        return _Escala(self, k)

    __rmul__ = __mul__

    def __le__(self, other) -> _Restriccion:
        return _Restriccion.de(self - other, None, 0)

    def __ge__(self, other) -> _Restriccion:
        return _Restriccion.de(self - other, 0, None)

    def __eq__(self, other) -> _Restriccion:  # type: ignore[override]
        return _Restriccion.de(self - other, 0, 0)

    def __hash__(self) -> int:
        return id(self)

    def __bool__(self) -> bool:
        raise TypeError("Una expresión lineal no tiene valor de verdad; ¿falta model.Add(...)?")


class IntVar(LinearExpr):
    __slots__ = ("indice", "nombre")

    def __init__(self, indice: int, nombre: str):
        self.indice = indice
        self.nombre = nombre

    def Not(self) -> LinearExpr:  # noqa: N802 (nombre de la API de OR-Tools)
        return 1 - self

    def __repr__(self) -> str:
        return self.nombre or f"v{self.indice}"


class _Constante(LinearExpr):
    __slots__ = ("valor",)

    def __init__(self, valor: int):
        self.valor = valor


class _Suma(LinearExpr):
    __slots__ = ("a", "b")

    def __init__(self, a: LinearExpr, b: LinearExpr):
        self.a, self.b = a, b


class _Escala(LinearExpr):
    __slots__ = ("e", "k")

    def __init__(self, e: LinearExpr, k: int):
        self.e, self.k = e, k


def _expr(valor) -> LinearExpr:
    if isinstance(valor, LinearExpr):
        return valor
    if isinstance(valor, int):
        return _Constante(valor)
    raise TypeError(f"No es una expresión lineal: {valor!r}")


def _aplanar(expr: LinearExpr) -> tuple[dict[int, int], int]:
    """Coeficientes por variable y término constante, recorriendo el árbol sin recursión."""
    coefs: dict[int, int] = {}
    constante = 0
    pila: list[tuple[LinearExpr, int]] = [(expr, 1)]
    while pila:
        nodo, k = pila.pop()
        if isinstance(nodo, IntVar):
            coefs[nodo.indice] = coefs.get(nodo.indice, 0) + k
        elif isinstance(nodo, _Suma):
            pila.append((nodo.a, k))
            pila.append((nodo.b, k))
        elif isinstance(nodo, _Escala):
            pila.append((nodo.e, k * nodo.k))
        else:
            constante += k * nodo.valor  # type: ignore[attr-defined]
    return coefs, constante


@dataclass
class _Restriccion:
    """lo <= Σ coefs·x <= hi (None = sin límite)."""
    coefs: dict[int, int]
    lo: float | None
    hi: float | None

    @classmethod
    def de(cls, diferencia: LinearExpr, lo: int | None, hi: int | None) -> _Restriccion:
        coefs, constante = _aplanar(diferencia)
        return cls(coefs, None if lo is None else lo - constante, None if hi is None else hi - constante)


@dataclass
class CpModel:
    _lb: list[int] = field(default_factory=list)
    _ub: list[int] = field(default_factory=list)
    _vars: list[IntVar] = field(default_factory=list)
    _filas: list[_Restriccion] = field(default_factory=list)
    _objetivo: dict[int, int] = field(default_factory=dict)
    _pistas: dict[int, int] = field(default_factory=dict)

    def NewIntVar(self, lb: int, ub: int, nombre: str) -> IntVar:  # noqa: N802
        if ub < lb:
            raise ValueError(f"Dominio vacío para {nombre}: [{lb}, {ub}]")
        v = IntVar(len(self._vars), nombre)
        self._vars.append(v)
        self._lb.append(lb)
        self._ub.append(ub)
        return v

    def NewBoolVar(self, nombre: str) -> IntVar:  # noqa: N802
        return self.NewIntVar(0, 1, nombre)

    def Add(self, restriccion: _Restriccion) -> None:  # noqa: N802
        if not isinstance(restriccion, _Restriccion):
            raise TypeError("model.Add espera una comparación (<=, >= o ==) entre expresiones")
        if restriccion.coefs:
            self._filas.append(restriccion)
        elif (restriccion.lo is not None and restriccion.lo > 0) or (restriccion.hi is not None and restriccion.hi < 0):
            self._filas.append(restriccion)  # 0 fuera de [lo, hi]: imposible, que lo detecte el resolutor

    def AddAtMostOne(self, literales) -> None:  # noqa: N802
        self.Add(sum(literales) <= 1)

    def AddBoolOr(self, literales) -> None:  # noqa: N802
        self.Add(sum(literales) >= 1)

    def AddHint(self, var: IntVar, valor: int) -> None:  # noqa: N802
        self._pistas[var.indice] = valor

    def Minimize(self, expr) -> None:  # noqa: N802
        self._objetivo, _ = _aplanar(_expr(expr))


@dataclass
class _Parametros:
    max_time_in_seconds: float = 30.0
    num_workers: int = 1  # sin efecto: HiGHS resuelve en un hilo (y en el navegador no hay hilos)
    random_seed: int = 0


class CpSolver:
    def __init__(self) -> None:
        self.parameters = _Parametros()
        self._valores: np.ndarray | None = None

    def Solve(self, model: CpModel) -> int:  # noqa: N802
        h = _HighsSinCallbacks()
        h.setOptionValue("output_flag", False)
        h.setOptionValue("time_limit", float(self.parameters.max_time_in_seconds))
        h.setOptionValue("random_seed", int(self.parameters.random_seed))
        n = len(model._vars)
        if n == 0:
            self._valores = np.zeros(0)
            return OPTIMAL
        inf = highspy.kHighsInf
        h.addVars(n, np.array(model._lb, dtype=np.float64), np.array(model._ub, dtype=np.float64))
        h.changeColsIntegrality(n, np.arange(n, dtype=np.int32),
                                np.full(n, highspy.HighsVarType.kInteger, dtype=np.uint8))
        if model._objetivo:
            idx = np.fromiter(model._objetivo.keys(), dtype=np.int32)
            h.changeColsCost(len(idx), idx, np.fromiter(model._objetivo.values(), dtype=np.float64))

        filas = model._filas
        if filas:
            inicios, indices, valores = [], [], []
            for r in filas:
                inicios.append(len(indices))
                indices.extend(r.coefs.keys())
                valores.extend(r.coefs.values())
            h.addRows(len(filas),
                      np.array([-inf if r.lo is None else r.lo for r in filas], dtype=np.float64),
                      np.array([inf if r.hi is None else r.hi for r in filas], dtype=np.float64),
                      len(indices), np.array(inicios, dtype=np.int32),
                      np.array(indices, dtype=np.int32), np.array(valores, dtype=np.float64))
        if model._pistas:
            idx = np.fromiter(model._pistas.keys(), dtype=np.int32)
            h.setSolution(len(idx), idx, np.fromiter(model._pistas.values(), dtype=np.float64))

        h.run()
        estado = h.getModelStatus()
        if estado == highspy.HighsModelStatus.kOptimal:
            resultado = OPTIMAL
        elif estado == highspy.HighsModelStatus.kInfeasible:
            resultado = INFEASIBLE
        elif h.getInfo().primal_solution_status == 2:  # hay solución factible (tiempo agotado u otro límite)
            resultado = FEASIBLE
        else:
            resultado = UNKNOWN
        if resultado in (OPTIMAL, FEASIBLE):
            self._valores = np.asarray(h.getSolution().col_value)
        return resultado

    def Value(self, var: IntVar) -> int:  # noqa: N802
        if self._valores is None:
            raise RuntimeError("No hay solución")
        return int(round(self._valores[var.indice]))

    @staticmethod
    def StatusName(estado: int) -> str:  # noqa: N802
        return _NOMBRES[estado]
