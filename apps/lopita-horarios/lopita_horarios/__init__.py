"""Gestor de horarios de Lopita."""
from .models import Config, Schedule
from .solver import SolveOptions, generate
from .validator import validate

__all__ = ["Config", "Schedule", "SolveOptions", "generate", "validate", "load_config"]


def load_config(path: str) -> Config:
    import json
    with open(path, encoding="utf-8") as f:
        return Config.model_validate(json.load(f))
