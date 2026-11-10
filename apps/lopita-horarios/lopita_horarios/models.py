"""Modelo de datos del gestor de horarios de Lopita.

Todo lo que puede cambiar con el tiempo (plantilla, turnos, demanda, reglas,
pesos del optimizador) vive en la configuración, nunca en el código.
"""
from __future__ import annotations

import datetime as dt
from enum import Enum
from functools import cache
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

WEEKDAYS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]


@cache  # se llama cientos de miles de veces al validar y evaluar alertas, siempre con las mismas pocas horas
def parse_hhmm(value: str) -> int:
    """'07:30' -> 450 minutos desde medianoche. Admite '24:00'."""
    h, m = value.split(":")
    minutes = int(h) * 60 + int(m)
    if not 0 <= minutes <= 24 * 60:
        raise ValueError(f"Hora fuera de rango: {value}")
    return minutes


def fmt_hhmm(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


@cache
def weekday_index(name: str) -> int:
    key = name.strip().lower().replace("é", "e").replace("á", "a")
    if key not in WEEKDAYS:
        raise ValueError(f"Día de la semana desconocido: {name}")
    return WEEKDAYS.index(key)


class ShiftKind(str, Enum):
    apertura = "apertura"
    normal = "normal"
    cierre = "cierre"


class Puesto(str, Enum):
    """Lo que hace una persona en un turno: cocinar o atender en sala."""
    cocina = "cocina"
    sala = "sala"


def _check_hours(inicio: Optional[str], fin: Optional[str], what: str) -> None:
    """Horas a medida: las dos o ninguna, y el final después del inicio."""
    if (inicio is None) != (fin is None):
        raise ValueError(f"{what}: indica la hora de inicio y la de fin, o ninguna")
    if inicio is not None and parse_hhmm(fin) <= parse_hhmm(inicio):
        raise ValueError(f"{what}: debe terminar después de empezar")


# ---------------------------------------------------------------------------
# Plantilla y turnos
# ---------------------------------------------------------------------------
class RestriccionHoraria(BaseModel):
    """Horas del día en que una persona puede trabajar: no empieza antes de ``desde`` ni termina después de ``hasta``.

    Se aplica los días indicados (vacío = todos). Es una regla dura, como las libranzas fijas: el generador solo le
    da turnos que caben enteros en la franja.
    """
    dias: Optional[list[str]] = Field(default=None, description="Días de la semana en que se aplica; vacío = todos")
    desde: Optional[str] = Field(default=None, description="No puede empezar antes de esta hora (vacío = sin límite)")
    hasta: Optional[str] = Field(default=None, description="No puede terminar después de esta hora (vacío = sin límite)")

    @model_validator(mode="after")
    def _check(self) -> "RestriccionHoraria":
        if self.desde is None and self.hasta is None:
            raise ValueError("Restricción horaria: indica desde qué hora o hasta qué hora puede trabajar")
        if self.desde is not None and self.hasta is not None and parse_hhmm(self.hasta) <= parse_hhmm(self.desde):
            raise ValueError(f"Restricción horaria {self.desde}–{self.hasta}: la hora final debe ser posterior")
        for d in self.dias or []:
            weekday_index(d)
        return self

    def applies_on(self, date: dt.date) -> bool:
        return not self.dias or date.weekday() in {weekday_index(d) for d in self.dias}


class Employee(BaseModel):
    """Una persona de la plantilla.

    Un comodín (``comodin=True``) no tiene horas de contrato: el motor solo le da turnos para cubrir lo que el resto
    de la plantilla no llega a cubrir, entre un mínimo y un máximo semanales opcionales que fija el encargado.
    """
    id: str
    nombre: str
    horas_semanales: float = Field(default=0, ge=0, le=60,
                                   description="Horas de contrato por semana (no se usa en los comodines)")
    comodin: bool = Field(default=False, description="Sin horas de contrato: solo trabaja para cubrir huecos")
    horas_min_semana: Optional[float] = Field(default=None, ge=0, le=60,
                                              description="Comodín: horas mínimas por semana (vacío = sin mínimo)")
    horas_max_semana: Optional[float] = Field(default=None, gt=0, le=60,
                                              description="Comodín: horas máximas por semana (vacío = sin máximo)")
    puede_abrir: bool = False
    puede_cerrar: bool = False
    es_encargado: bool = False
    puestos: list[Puesto] = Field(default_factory=lambda: [Puesto.sala, Puesto.cocina], min_length=1,
                                  description="Qué puede hacer: cocina, sala o ambos. El primero es su puesto principal")
    libranzas_fijas: list[str] = Field(default_factory=list, description="Días de la semana que libra habitualmente")
    restricciones_horarias: list[RestriccionHoraria] = Field(
        default_factory=list, description="Horas del día en que puede trabajar, todos los días o algunos")
    funciones: list[str] = Field(default_factory=list,
                                 description="Funciones que puede hacer, definidas por el encargado (p. ej. preparar pinchos)")
    fecha_alta: Optional[dt.date] = Field(default=None, description="Día en que entró; si fue durante el año, "
                                          "las vacaciones de ese año son proporcionales")
    dias_vacaciones: int = Field(default=30, ge=30, le=60, description="Días naturales de vacaciones al año; el "
                                 "Estatuto de los Trabajadores fija un mínimo de 30")
    slack_user_id: Optional[str] = None
    email: Optional[str] = None
    activo: bool = True

    @field_validator("libranzas_fijas")
    @classmethod
    def _check_days(cls, v: list[str]) -> list[str]:
        for d in v:
            weekday_index(d)
        return v

    @field_validator("puestos")
    @classmethod
    def _check_puestos(cls, v: list[Puesto]) -> list[Puesto]:
        if len(set(v)) != len(v):
            raise ValueError("Hay puestos repetidos")
        return v

    @model_validator(mode="after")
    def _check_horas(self) -> "Employee":
        if not self.comodin:
            if self.horas_semanales <= 0:
                raise ValueError(f"{self.nombre}: indica sus horas de contrato por semana (o márcalo como comodín)")
            if self.horas_min_semana is not None or self.horas_max_semana is not None:
                raise ValueError(f"{self.nombre}: las horas mínimas y máximas solo se usan en los comodines")
        elif (self.horas_min_semana is not None and self.horas_max_semana is not None
              and self.horas_min_semana > self.horas_max_semana):
            raise ValueError(f"{self.nombre}: el mínimo de horas no puede pasar del máximo")
        return self

    def fixed_off_indexes(self) -> set[int]:
        return {weekday_index(d) for d in self.libranzas_fijas}

    def franja(self, date: dt.date) -> tuple[int, int]:
        """Minutos (desde, hasta) en que puede trabajar ese día; si varias restricciones se aplican, vale la más estrecha."""
        desde, hasta = 0, 24 * 60
        for r in self.restricciones_horarias:
            if r.applies_on(date):
                desde = max(desde, parse_hhmm(r.desde) if r.desde else 0)
                hasta = min(hasta, parse_hhmm(r.hasta) if r.hasta else 24 * 60)
        return desde, hasta

    def cabe_en_franja(self, inicio_min: int, fin_min: int, date: dt.date) -> bool:
        desde, hasta = self.franja(date)
        return desde <= inicio_min and fin_min <= hasta

    @property
    def puesto_principal(self) -> Puesto:
        return self.puestos[0]


class ReglaFuncion(BaseModel):
    """Regla de una función: en ese tramo tiene que haber al menos N personas con la función trabajando.

    Los roles de un puesto (ver Funcion.puesto) admiten además un máximo: «en lava, como mucho uno».
    """
    inicio: str
    fin: str
    personas: int = Field(default=1, ge=0, le=20, description="Mínimo de personas (0 = sin mínimo)")
    maximo: Optional[int] = Field(default=None, ge=0, le=20, description="Máximo de personas (vacío = sin máximo)")
    dias: Optional[list[str]] = Field(default=None, description="Días de la semana en que se aplica; vacío = todos")

    @model_validator(mode="after")
    def _check(self) -> "ReglaFuncion":
        if parse_hhmm(self.fin) <= parse_hhmm(self.inicio):
            raise ValueError(f"Regla {self.inicio}–{self.fin}: debe terminar después de empezar")
        if self.personas == 0 and self.maximo is None:
            raise ValueError(f"Regla {self.inicio}–{self.fin}: indica un mínimo o un máximo de personas")
        if self.maximo is not None and self.maximo < self.personas:
            raise ValueError(f"Regla {self.inicio}–{self.fin}: el máximo no puede ser menor que el mínimo")
        for d in self.dias or []:
            weekday_index(d)
        return self

    def applies_on(self, date: dt.date) -> bool:
        return not self.dias or date.weekday() in {weekday_index(d) for d in self.dias}


class Funcion(BaseModel):
    """Función o categoría que solo hacen algunas personas (preparar pinchos, hacer caja, recibir pedidos...).

    Se asigna a las personas en Equipo. Sus reglas piden presencia mínima (o máxima) de gente con la función en
    ciertos tramos; solo cuentan los días en que el local abre. Hay dos clases:

    - Tarea de apoyo (sin puesto): cuenta cualquiera que sepa hacerla y esté trabajando (preparar pinchos).
    - Rol de un puesto (con puesto): las funciones de los camareros, como caja, cafetera, sala o lava. Los días en
      que alguna regla de los roles de ese puesto se aplica, cada persona que trabaja en él hace uno de sus roles
      durante todo el turno (lo elige el motor o el encargado) y solo cuenta para las reglas de ese rol.
    """
    id: str
    nombre: str
    color: Optional[str] = None
    puesto: Optional[Puesto] = Field(default=None, description="Si se indica, es un rol de ese puesto: cada persona "
                                     "hace uno de sus roles en el turno")
    reglas: list[ReglaFuncion] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check(self) -> "Funcion":
        if self.puesto is None and any(r.maximo is not None for r in self.reglas):
            raise ValueError(f"«{self.nombre}»: el máximo de personas solo vale para los roles de un puesto "
                             "(en una tarea de apoyo, saber hacerla no significa estar haciéndola)")
        return self

    @property
    def es_rol(self) -> bool:
        return self.puesto is not None


class Shift(BaseModel):
    id: str
    nombre: str
    inicio: str
    fin: str
    tipo: ShiftKind = ShiftKind.normal
    dias: Optional[list[str]] = Field(default=None, description="Días en que existe el turno; vacío = todos")
    color: Optional[str] = None
    puesto: Optional[Puesto] = Field(default=None, description="Si el turno es de cocina o de camarero (sala); "
                                     "vacío = lo puede hacer cualquiera")

    @model_validator(mode="after")
    def _check_times(self) -> "Shift":
        if parse_hhmm(self.fin) <= parse_hhmm(self.inicio):
            raise ValueError(f"El turno {self.id} debe terminar después de empezar (no se admiten turnos que crucen medianoche)")
        if self.dias:
            for d in self.dias:
                weekday_index(d)
        return self

    @property
    def start_min(self) -> int:
        return parse_hhmm(self.inicio)

    @property
    def end_min(self) -> int:
        return parse_hhmm(self.fin)

    @property
    def minutes(self) -> int:
        return self.end_min - self.start_min

    @property
    def hours(self) -> float:
        return self.minutes / 60

    def available_on(self, date: dt.date) -> bool:
        if not self.dias:
            return True
        return date.weekday() in {weekday_index(d) for d in self.dias}


# ---------------------------------------------------------------------------
# Demanda
# ---------------------------------------------------------------------------
class DemandSlot(BaseModel):
    inicio: str
    fin: str
    personas: int = Field(ge=0, description="Personas en total")
    cocina: int = Field(default=0, ge=0, description="De ellas, mínimo en cocina")
    sala: int = Field(default=0, ge=0, description="De ellas, mínimo en sala")

    @model_validator(mode="after")
    def _check(self) -> "DemandSlot":
        if parse_hhmm(self.fin) <= parse_hhmm(self.inicio):
            raise ValueError("Una franja de demanda debe terminar después de empezar")
        if self.cocina + self.sala > self.personas:
            raise ValueError(f"Franja {self.inicio}–{self.fin}: cocina y sala suman más personas que el total")
        return self


class Task(BaseModel):
    """Trabajo que no depende de la clientela (preparar la cafetería al abrir, limpiar al cerrar, recibir pedidos...).

    Se suma a la demanda: en esas horas hacen falta las personas de la franja más las de la tarea.
    Solo cuenta los días en que el local abre.
    """
    nombre: str
    inicio: str
    fin: str
    personas: int = Field(default=1, ge=1, le=20)
    dias: Optional[list[str]] = Field(default=None, description="Días de la semana en que se hace; vacío = todos")
    puesto: Optional[Puesto] = Field(default=None, description="Si la tarea es de cocina o de sala; vacío = cualquiera")

    @model_validator(mode="after")
    def _check(self) -> "Task":
        if parse_hhmm(self.fin) <= parse_hhmm(self.inicio):
            raise ValueError(f"La tarea «{self.nombre}» debe terminar después de empezar")
        for d in self.dias or []:
            weekday_index(d)
        return self

    def applies_on(self, date: dt.date) -> bool:
        return not self.dias or date.weekday() in {weekday_index(d) for d in self.dias}


class DayType(BaseModel):
    nombre: str
    cerrado: bool = False
    franjas: list[DemandSlot] = Field(default_factory=list)


class DateOverride(BaseModel):
    """Excepción para una fecha concreta: forzar un tipo de día o una demanda propia."""
    fecha: dt.date
    tipo_dia: Optional[str] = None
    franjas: Optional[list[DemandSlot]] = None
    cerrado: Optional[bool] = None
    nota: Optional[str] = None


# ---------------------------------------------------------------------------
# Ausencias, excepciones de asignación y preferencias
# ---------------------------------------------------------------------------
class Absence(BaseModel):
    empleado_id: str
    desde: dt.date
    hasta: dt.date
    motivo: Literal["vacaciones", "baja", "permiso", "otro"] = "vacaciones"

    @model_validator(mode="after")
    def _check(self) -> "Absence":
        if self.hasta < self.desde:
            raise ValueError("La ausencia termina antes de empezar")
        return self

    def covers(self, date: dt.date) -> bool:
        return self.desde <= date <= self.hasta


class AssignmentOverride(BaseModel):
    """Fija algo a mano: un día libre extra, trabajar en una libranza fija o un turno concreto.

    Un turno concreto puede llevar horas a medida (inicio y fin distintos de los del turno) y un puesto.
    """
    empleado_id: str
    fecha: dt.date
    tipo: Literal["libre", "trabaja", "turno"]
    turno_id: Optional[str] = None
    inicio: Optional[str] = None
    fin: Optional[str] = None
    puesto: Optional[Puesto] = None
    funcion: Optional[str] = Field(default=None, description="Rol fijado a mano (caja, cafetera...)")

    @model_validator(mode="after")
    def _check(self) -> "AssignmentOverride":
        if self.tipo == "turno" and not self.turno_id:
            raise ValueError("Una excepción de tipo 'turno' necesita turno_id")
        _check_hours(self.inicio, self.fin, "Excepción")
        return self


class Preference(BaseModel):
    """Preferencia blanda: se respeta si no compromete la cobertura."""
    empleado_id: str
    tipo: Literal["prefiere", "evita"]
    turnos: list[str]
    dias: Optional[list[str]] = None
    peso: int = Field(default=1, ge=1, le=10)

    def applies_on(self, date: dt.date) -> bool:
        if not self.dias:
            return True
        return date.weekday() in {weekday_index(d) for d in self.dias}


# ---------------------------------------------------------------------------
# Reglas y pesos
# ---------------------------------------------------------------------------
class Rules(BaseModel):
    descanso_minimo_horas: float = 12
    dias_libres_por_semana: float = Field(default=2, description="Mínimo de días libres por semana natural")
    max_horas_dia: float = 9
    margen_semanal_horas: float = Field(default=5, description="Cuánto puede desviarse una semana del contrato (bolsa de horas)")
    margen_periodo_horas: float = Field(default=2, description="Tolerancia sin penalizar sobre el total del periodo")
    max_horas_extra_semana: float = 5
    encargado_siempre: bool = False
    arrastrar_saldo: bool = Field(default=True, description="Compensar en un periodo las horas de más o de menos del anterior")
    max_saldo_horas: float = Field(default=10, description="Saldo máximo que se arrastra de un periodo a otro")
    resolucion_minutos: int = Field(default=30, description="Granularidad con la que se mide la cobertura")

    @field_validator("resolucion_minutos")
    @classmethod
    def _res(cls, v: int) -> int:
        if v not in (15, 30, 60):
            raise ValueError("resolucion_minutos debe ser 15, 30 o 60")
        return v


class Weights(BaseModel):
    """Pesos del objetivo. Cuanto mayor, más importa evitarlo."""
    falta_cobertura: int = 1000
    falta_encargado: int = 800
    falta_funcion: int = Field(default=800, ge=0, description="Por cada paso en que falta alguien con una función que "
                               "pide una regla (p. ej. nadie que prepare pinchos)")
    horas_extra: int = 40
    horas_por_debajo_contrato: int = 30
    exceso_cobertura: int = 2
    preferencia: int = 5
    reparto_desigual: int = 10
    critica: int = Field(default=1_000_000, ge=0, description="Por cada problema crítico: cada media hora (paso) sin nadie "
                         "en el local y cada día sin nadie habilitado al abrir o al cerrar")
    racha_larga: int = Field(default=10000, ge=0, description="Por cada día de más en una racha de días seguidos trabajando")
    reparto_horas: int = Field(default=50, ge=0, description="Por cada milésima de diferencia en el cumplimiento del "
                               "contrato entre personas, sobre el umbral de alertas")
    reparto_turnos: int = Field(default=5000, ge=0, description="Por cada fin de semana o cierre de diferencia entre "
                                "personas, sobre el umbral de alertas")
    saldo_desbordado: int = Field(default=40, ge=0, description="Por cada minuto de saldo que no se podría arrastrar al siguiente periodo")
    cambio_turno: int = Field(default=1500, ge=0, description="Coste de cambiar una casilla al solucionar alertas de un horario ya hecho")
    uso_comodin: int = Field(default=20, ge=0, description="Por cada minuto que trabaja un comodín. Más barato que "
                             "las horas extra y que dejar a alguien por debajo de su contrato no lo compensa: el "
                             "comodín solo entra cuando el resto de la plantilla no llega")
    puesto_secundario: int = Field(default=30, ge=0, description="Por cada turno en el puesto que no es el principal de "
                                   "la persona (solo los días en que la demanda pide cocina o sala)")
    exceso_funcion: int = Field(default=400, ge=0, description="Por cada paso en que hay más gente en un rol de la "
                                "que permite su regla (p. ej. dos en lava)")
    rol_secundario: int = Field(default=10, ge=0, description="Por cada turno en un rol que no es el principal de la "
                                "persona (el primero de sus roles de ese puesto)")


class AlertSettings(BaseModel):
    """Umbrales del sistema de alertas del encargado.

    Deciden qué se avisa y con qué fuerza. El motor también intenta no pasarse de los de reparto de horas
    y de días seguidos, para que el horario salga (o se arregle) sin esas alertas.
    """
    reparto_horas_pct: float = Field(default=20, ge=0, description="Diferencia máxima (puntos %) entre quien más y quien menos se acerca a su contrato")
    reparto_fines_semana: int = Field(default=2, ge=0, description="Diferencia máxima de fines de semana trabajados entre dos personas")
    reparto_cierres: int = Field(default=2, ge=0, description="Diferencia máxima de cierres entre dos personas")
    preferencias_incumplidas_pct: float = Field(default=50, ge=0, le=100, description="% de días con preferencia no respetada a partir del cual se avisa")
    racha_dias_max: int = Field(default=6, ge=1, description="Días seguidos trabajando a partir de los cuales se avisa")
    exceso_personal_horas_dia: float = Field(default=3, ge=0, description="Horas-persona de más en un día a partir de las cuales se avisa")
    plantilla_sobra_pct: float = Field(default=15, ge=0, description="% en que las horas de contrato pueden superar a la "
                                       "demanda de una semana antes de avisar de que sobra personal")
    desactivadas: list[str] = Field(default_factory=list, description="Códigos de alerta que el encargado ha silenciado")


class Config(BaseModel):
    negocio: str = "Lopita"
    empleados: list[Employee]
    turnos: list[Shift]
    tipos_dia: list[DayType]
    tipo_dia_por_semana: dict[str, str] = Field(
        description="Qué tipo de día corresponde a cada día de la semana, p. ej. {'lunes': 'laborable'}"
    )
    tipo_dia_festivo: Optional[str] = None
    festivos: list[dt.date] = Field(default_factory=list)
    excepciones_fecha: list[DateOverride] = Field(default_factory=list)
    tareas: list[Task] = Field(default_factory=list, description="Tareas fijas que se suman a la demanda")
    funciones: list[Funcion] = Field(default_factory=list, description="Funciones que define el encargado, con sus reglas")
    ausencias: list[Absence] = Field(default_factory=list)
    excepciones_asignacion: list[AssignmentOverride] = Field(default_factory=list)
    preferencias: list[Preference] = Field(default_factory=list)
    reglas: Rules = Field(default_factory=Rules)
    pesos: Weights = Field(default_factory=Weights)
    alertas: AlertSettings = Field(default_factory=AlertSettings)

    @model_validator(mode="after")
    def _cross_checks(self) -> "Config":
        emp_ids = {e.id for e in self.empleados}
        shift_ids = {s.id for s in self.turnos}
        day_types = {d.nombre for d in self.tipos_dia}
        if len(emp_ids) != len(self.empleados):
            raise ValueError("Hay ids de empleado repetidos")
        if len(shift_ids) != len(self.turnos):
            raise ValueError("Hay ids de turno repetidos")
        for day, dtype in self.tipo_dia_por_semana.items():
            weekday_index(day)
            if dtype not in day_types:
                raise ValueError(f"Tipo de día desconocido: {dtype}")
        missing = set(range(7)) - {weekday_index(d) for d in self.tipo_dia_por_semana}
        if missing:
            raise ValueError("Falta el tipo de día para: " + ", ".join(WEEKDAYS[i] for i in sorted(missing)))
        if self.tipo_dia_festivo and self.tipo_dia_festivo not in day_types:
            raise ValueError(f"Tipo de día festivo desconocido: {self.tipo_dia_festivo}")
        for o in self.excepciones_fecha:
            if o.tipo_dia and o.tipo_dia not in day_types:
                raise ValueError(f"Tipo de día desconocido en excepción {o.fecha}: {o.tipo_dia}")
        fun_ids = {f.id for f in self.funciones}
        if len(fun_ids) != len(self.funciones):
            raise ValueError("Hay ids de función repetidos")
        for e in self.empleados:
            for f in e.funciones:
                if f not in fun_ids:
                    raise ValueError(f"{e.nombre}: función desconocida «{f}»")
        refs = [a.empleado_id for a in self.ausencias] + [o.empleado_id for o in self.excepciones_asignacion] + [
            p.empleado_id for p in self.preferencias
        ]
        for r in refs:
            if r not in emp_ids:
                raise ValueError(f"Empleado desconocido: {r}")
        for o in self.excepciones_asignacion:
            if o.turno_id and o.turno_id not in shift_ids:
                raise ValueError(f"Turno desconocido: {o.turno_id}")
            if o.funcion and o.funcion not in fun_ids:
                raise ValueError(f"Función desconocida: {o.funcion}")
        for p in self.preferencias:
            for s in p.turnos:
                if s not in shift_ids:
                    raise ValueError(f"Turno desconocido en preferencia: {s}")
        return self

    # --- utilidades -------------------------------------------------------
    def employee(self, emp_id: str) -> Employee:
        return next(e for e in self.empleados if e.id == emp_id)

    def shift(self, shift_id: str) -> Shift:
        return next(s for s in self.turnos if s.id == shift_id)

    def active_employees(self) -> list[Employee]:
        return [e for e in self.empleados if e.activo]

    def day_type_for(self, date: dt.date) -> DayType:
        """Resuelve la demanda de un día: excepción > festivo > día de la semana."""
        by_name = {d.nombre: d for d in self.tipos_dia}
        override = next((o for o in self.excepciones_fecha if o.fecha == date), None)
        base_name = None
        if override and override.tipo_dia:
            base_name = override.tipo_dia
        elif date in self.festivos and self.tipo_dia_festivo:
            base_name = self.tipo_dia_festivo
        else:
            base_name = next(v for k, v in self.tipo_dia_por_semana.items() if weekday_index(k) == date.weekday())
        base = by_name[base_name]
        if override and (override.franjas is not None or override.cerrado is not None):
            return DayType(
                nombre=f"{base.nombre} (excepción)",
                cerrado=override.cerrado if override.cerrado is not None else base.cerrado,
                franjas=override.franjas if override.franjas is not None else base.franjas,
            )
        return base

    def is_absent(self, emp_id: str, date: dt.date) -> Optional[Absence]:
        return next((a for a in self.ausencias if a.empleado_id == emp_id and a.covers(date)), None)

    def override_for(self, emp_id: str, date: dt.date) -> Optional[AssignmentOverride]:
        return next(
            (o for o in self.excepciones_asignacion if o.empleado_id == emp_id and o.fecha == date), None
        )

    def turno_de(self, a: "Assignment | AssignmentOverride | Lock") -> Shift:
        """El turno que se hace de verdad: el definido o, si lleva horas a medida, ese turno con esas horas."""
        base = self.shift(a.turno_id)
        if a.inicio is None or (a.inicio == base.inicio and a.fin == base.fin):
            return base
        return base.model_copy(update={"inicio": a.inicio, "fin": a.fin})

    def funcion(self, fid: str) -> "Funcion":
        return next(f for f in self.funciones if f.id == fid)

    def roles_de(self, e: Employee, puesto: Puesto) -> list[str]:
        """Roles de ese puesto que puede hacer la persona, en su orden (el primero es su rol principal)."""
        roles = {f.id for f in self.funciones if f.puesto == puesto}
        return [fid for fid in e.funciones if fid in roles]

    def rol_de(self, a: "Assignment") -> Optional["Funcion"]:
        """El rol que hace en esa asignación (caja, cafetera...), si tiene uno y sigue existiendo."""
        return next((f for f in self.funciones if f.id == a.funcion and f.es_rol), None) if a.funcion else None

    def hace_funcion(self, f: "Funcion", a: "Assignment", e: Employee) -> bool:
        """Si quien hace la asignación cuenta para las reglas de la función.

        Una tarea de apoyo la cubre cualquiera que sepa hacerla; un rol, solo quien lo tiene asignado en ese turno.
        """
        if f.puesto is None:
            return f.id in e.funciones
        return a.funcion == f.id and self.puesto_de(a) == f.puesto

    def puesto_de(self, a: "Assignment") -> Puesto:
        """Puesto de una asignación; las de antes de que hubiera puestos cuentan como el principal de la persona."""
        return a.puesto or self.employee(a.empleado_id).puesto_principal


# ---------------------------------------------------------------------------
# Resultado
# ---------------------------------------------------------------------------
class Assignment(BaseModel):
    """Un turno de una persona un día. Con inicio y fin es un turno a medida: el turno base con otras horas."""
    empleado_id: str
    fecha: dt.date
    turno_id: str
    puesto: Optional[Puesto] = None
    inicio: Optional[str] = None
    fin: Optional[str] = None
    funcion: Optional[str] = Field(default=None, description="Rol de su puesto que hace en el turno (caja, cafetera...)")

    @model_validator(mode="after")
    def _check(self) -> "Assignment":
        _check_hours(self.inicio, self.fin, "Turno a medida")
        return self


class Lock(BaseModel):
    """Cambio manual que se respeta al regenerar: un turno concreto o un día libre (turno_id = None).

    Un turno concreto puede llevar horas a medida y puesto, que también se respetan.
    """
    empleado_id: str
    fecha: dt.date
    turno_id: Optional[str] = None
    puesto: Optional[Puesto] = None
    inicio: Optional[str] = None
    fin: Optional[str] = None
    funcion: Optional[str] = None

    @model_validator(mode="after")
    def _check(self) -> "Lock":
        _check_hours(self.inicio, self.fin, "Bloqueo")
        return self

    @classmethod
    def de(cls, a: Optional[Assignment], empleado_id: str, fecha: dt.date) -> "Lock":
        """Bloqueo que deja la casilla tal como está (con su turno, horas, puesto y rol, o libre)."""
        if a is None:
            return cls(empleado_id=empleado_id, fecha=fecha)
        return cls(empleado_id=empleado_id, fecha=fecha, turno_id=a.turno_id, puesto=a.puesto, inicio=a.inicio, fin=a.fin,
                   funcion=a.funcion)


class Issue(BaseModel):
    nivel: Literal["error", "aviso"]
    codigo: str
    mensaje: str
    fecha: Optional[dt.date] = None
    empleado_id: Optional[str] = None


class EmployeeStats(BaseModel):
    empleado_id: str
    comodin: bool = False  # sin contrato: horas_objetivo y horas_extra son 0
    horas: float
    horas_objetivo: float
    saldo_anterior: float = 0
    horas_extra: float
    dias_trabajados: int
    fines_de_semana: int
    cierres: int
    aperturas: int


class Schedule(BaseModel):
    desde: dt.date
    hasta: dt.date
    estado: Literal["borrador", "publicado"] = "borrador"
    asignaciones: list[Assignment]
    incidencias: list[Issue] = Field(default_factory=list)
    resumen: list[EmployeeStats] = Field(default_factory=list)
    estado_solver: Optional[str] = None
    bloqueos: list[Lock] = Field(default_factory=list)
    saldo_anterior: dict[str, float] = Field(default_factory=dict, description="Horas de más (+) o de menos (-) arrastradas del periodo anterior")
