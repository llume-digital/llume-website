"""Elige con qué resolutor se construye y resuelve el modelo del motor.

- «cpsat»: OR-Tools CP-SAT, el de producción.
- «highs»: HiGHS (`cp_highs.py`), para donde no hay OR-Tools, como la app offline del navegador.
- «auto» (por defecto): CP-SAT si está instalado; si no, HiGHS. La variable de entorno LOPITA_RESOLUTOR
  permite forzar uno de los dos.
"""
from __future__ import annotations

import os
from types import ModuleType

RESOLUTORES = ("auto", "cpsat", "highs")


def cargar(nombre: str = "auto") -> ModuleType:
    if nombre == "auto":
        nombre = os.environ.get("LOPITA_RESOLUTOR", "auto").strip().lower() or "auto"
    if nombre not in RESOLUTORES:
        raise ValueError(f"Resolutor desconocido: {nombre!r} (opciones: {', '.join(RESOLUTORES)})")
    if nombre in ("auto", "cpsat"):
        try:
            from ortools.sat.python import cp_model
            return cp_model
        except ImportError:
            if nombre == "cpsat":
                raise
    from . import cp_highs
    return cp_highs
