"""Sugerencias de configuración: qué cambiar en Equipo, Turnos o Demanda para que las alertas dejen de salir.

Muchas alertas no se arreglan moviendo turnos (el solucionador ya ha hecho lo que podía), sino cambiando
la configuración: libranzas fijas que dejan cortos unos días, poca gente habilitada para abrir o cerrar,
turnos más largos que el pico que cubren o tareas que la demanda no recoge. Este módulo mira el horario y
sus alertas y propone cambios concretos, con nombres, días y horas.

Son pistas, no garantías: el motor tiene que volver a generar con la configuración nueva para saberlo.
Es dominio puro y determinista.
"""
from __future__ import annotations

import datetime as dt
from collections import defaultdict
from typing import Literal

from pydantic import BaseModel, Field

from .alertas import Alerta
from .models import Config, Schedule, fmt_hhmm
from .planning import daterange, demand_for, shift_steps, target_minutes, with_locks
from .plantilla import capacidad_minutos
from .validator import compute_stats

_DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]


class Sugerencia(BaseModel):
    clave: str
    pantalla: Literal["equipo", "turnos", "demanda", "reglas"] = Field(description="Dónde se hace el cambio")
    titulo: str
    detalle: str
    alivia: list[str] = Field(default_factory=list, description="Códigos de las alertas que ayudaría a quitar")


def _lista(items: list[str], y: str = "y") -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + f" {y} " + items[-1]


def _frase(texto: str) -> str:
    return texto[:1].upper() + texto[1:]


def _horas(x: float) -> str:
    return f"{round(x, 1):g}".replace(".", ",")


def _rangos(pasos: list[int], res: int) -> list[tuple[int, int]]:
    out: list[list[int]] = []
    for t in sorted(pasos):
        if out and out[-1][1] == t:
            out[-1][1] = t + res
        else:
            out.append([t, t + res])
    return [(a, b) for a, b in out]


def _tramo(a: int, b: int) -> str:
    return f"{fmt_hhmm(a)} a {fmt_hhmm(b)}"


class _Perfil:
    """Cobertura del horario sumada por hora del día: dónde sobra y dónde falta gente, y qué turnos sobran."""

    def __init__(self, config: Config, h: Schedule):
        res = config.reglas.resolucion_minutos
        turnos = {s.id for s in config.turnos}
        self.sobra: dict[int, int] = defaultdict(int)
        self.falta: dict[int, int] = defaultdict(int)
        self.dias_falta: dict[int, set[dt.date]] = defaultdict(set)
        self.culpa: dict[str, float] = defaultdict(float)  # turno -> horas-persona de más que aporta
        self.ventana: tuple[int, int] | None = None  # primer y último minuto con demanda
        por_dia: dict[dt.date, list[tuple[str, frozenset[int]]]] = defaultdict(list)  # día -> [(turno, pasos)]
        for a in h.asignaciones:
            if a.turno_id in turnos:
                por_dia[a.fecha].append((a.turno_id, shift_steps(config.turno_de(a), res)))
        for d in daterange(h.desde, h.hasta):
            dem = demand_for(config, d)
            if dem.closed:
                continue
            if dem.required:
                lo, hi = min(dem.required), max(dem.required) + res
                self.ventana = (min(lo, self.ventana[0]), max(hi, self.ventana[1])) if self.ventana else (lo, hi)
            del_dia = por_dia.get(d, [])
            for t in set(dem.required) | {t for _, pasos in del_dia for t in pasos}:
                aqui = [s for s, pasos in del_dia if t in pasos]
                req = dem.required.get(t, 0)
                if len(aqui) > req:
                    self.sobra[t] += len(aqui) - req
                    for s in aqui:
                        self.culpa[s] += (len(aqui) - req) / len(aqui) * res / 60
                elif len(aqui) < req:
                    self.falta[t] += req - len(aqui)
                    self.dias_falta[t].add(d)


# ---------------------------------------------------------------------------
# Cada tipo de sugerencia
# ---------------------------------------------------------------------------
def _libranzas(config: Config, h: Schedule, codigos: dict[str, list[Alerta]]) -> list[Sugerencia]:
    """Libranzas fijas amontonadas en los días en que falta gente."""
    huecos = codigos.get("falta_cobertura", [])
    if not huecos:
        return []
    activos = config.active_employees()
    disponibles = [sum(1 for e in activos if i not in e.fixed_off_indexes()) for i in range(7)]
    abiertos = {d.weekday() for d in daterange(h.desde, h.hasta) if not demand_for(config, d).closed}
    if len(abiertos) < 2:
        return []
    veces = defaultdict(int)
    for a in huecos:
        if a.fecha:
            veces[a.fecha.weekday()] += 1
    corto = max(veces, key=lambda i: (veces[i], -disponibles[i]))
    sobrados = {a.fecha.weekday() for a in codigos.get("exceso_personal", []) if a.fecha} - set(veces)
    candidatos = [i for i in abiertos if i not in veces] or [i for i in abiertos if i != corto]
    holgado = max(candidatos, key=lambda i: (disponibles[i], i in sobrados))
    if disponibles[holgado] <= disponibles[corto] and holgado not in sobrados:
        return []
    quien = sorted((e for e in activos if corto in e.fixed_off_indexes() and holgado not in e.fixed_off_indexes()),
                   key=lambda e: (-e.horas_semanales, e.nombre))
    dias_corto = [i for i in sorted(veces)]
    detalle = (f"Faltan personas sobre todo los {_lista([_DIAS[i] for i in dias_corto])}. Los {_DIAS[corto]} solo pueden "
               f"trabajar {disponibles[corto]} personas por las libranzas fijas, y los {_DIAS[holgado]} "
               f"{disponibles[holgado]}.")
    if quien:
        detalle += (f" Por ejemplo, en Equipo cambia la libranza de {quien[0].nombre} del {_DIAS[corto]} al "
                    f"{_DIAS[holgado]}, o deja que el motor elija sus días libres.")
    else:
        detalle += f" Mueve alguna libranza del {_DIAS[corto]} a otro día en Equipo."
    return [Sugerencia(clave=f"libranzas:{corto}:{holgado}", pantalla="equipo", titulo="Repartir mejor las libranzas",
                       detalle=detalle, alivia=["falta_cobertura", "horas_extra", "exceso_personal"])]


def _habilitar(config: Config, h: Schedule, codigos: dict[str, list[Alerta]]) -> list[Sugerencia]:
    """Poca gente habilitada para abrir o cerrar: los turnos recaen siempre en los mismos."""
    out = []
    stats = {s.empleado_id: s for s in compute_stats(config, h.desde, h.hasta, h.asignaciones, h.saldo_anterior)}
    activos = config.active_employees()
    maximo = config.alertas.reparto_cierres
    for verbo, campo, cuenta, los, critica in (
            ("cerrar", "puede_cerrar", "cierres", "los", "cierre_sin_habilitado"),
            ("abrir", "puede_abrir", "aperturas", "las", "apertura_sin_habilitado")):
        habilitados = [e for e in activos if getattr(e, campo)]
        resto = sorted((e for e in activos if not getattr(e, campo)), key=lambda e: (-e.horas_semanales, e.nombre))
        if not resto:
            continue
        valores = {e.id: getattr(stats[e.id], cuenta) for e in habilitados if e.id in stats and not e.comodin}
        desigual = len(valores) >= 2 and max(valores.values()) - min(valores.values()) > maximo
        falta = bool(codigos.get(critica)) or any(verbo in a.detalle for a in codigos.get("dia_sin_habilitados", []))
        if not (desigual or falta or (verbo == "cerrar" and codigos.get("reparto_cierres"))):
            continue
        n = len(habilitados)
        quienes = _lista([e.nombre for e in habilitados]) or "nadie"
        detalle = (f"Solo {quienes} puede{'n' if n > 1 else ''} {verbo}" if n * 2 <= len(activos)
                   else f"Pueden {verbo} {quienes}")
        if valores:
            alto = max(habilitados, key=lambda e: valores.get(e.id, 0))
            detalle += f", y {los} {cuenta} recaen sobre todo en {alto.nombre} ({valores[alto.id]} en el periodo)"
        detalle += (f". Habilitar a {resto[0].nombre} para {verbo} (en Equipo) repartiría la carga y daría más "
                    f"opciones al motor los días justos.")
        out.append(Sugerencia(clave=f"habilitar:{verbo}", pantalla="equipo", titulo=f"Más gente que pueda {verbo}",
                              detalle=detalle, alivia=["reparto_cierres", critica, "dia_sin_habilitados"]))
    return out


def _turnos_largos(config: Config, perfil: _Perfil, codigos: dict[str, list[Alerta]]) -> list[Sugerencia]:
    """Personal de más porque los turnos duran más de lo que pide la demanda."""
    if not codigos.get("exceso_personal") or not perfil.sobra:
        return []
    res = config.reglas.resolucion_minutos
    pico = max(perfil.sobra.values())
    zonas = _rangos([t for t, n in perfil.sobra.items() if n >= pico * 0.5], res)
    total = sum(perfil.sobra.values()) * res / 60
    culpables = sorted(perfil.culpa, key=lambda s: -perfil.culpa[s])[:2]
    turnos = [f"{config.shift(s).nombre} ({config.shift(s).inicio}–{config.shift(s).fin})" for s in culpables]
    detalle = (f"La gente de más se concentra de {_lista([_tramo(a, b) for a, b in zonas[:3]])} "
               f"({_horas(total)} horas-persona de más en todo el periodo). ")
    if turnos:
        detalle += (f"Los turnos {_lista(turnos)} son los que más gente dejan de sobra. En Turnos, prueba a acortarlos "
                    f"o a mover su entrada o su salida, o añade un turno más corto que cubra solo el pico.")
    return [Sugerencia(clave="turnos_largos", pantalla="turnos", titulo="Turnos más largos de lo que pide la demanda",
                       detalle=detalle, alivia=["exceso_personal", "horas_extra"])]


def _turno_pico(config: Config, perfil: _Perfil, codigos: dict[str, list[Alerta]]) -> list[Sugerencia]:
    """Huecos cortos en el pico: un turno corto los cubre sin meter a alguien toda la tarde."""
    if not codigos.get("falta_cobertura") or not perfil.falta:
        return []
    res = config.reglas.resolucion_minutos
    zonas = _rangos(list(perfil.falta), res)
    a, b = max(zonas, key=lambda z: sum(perfil.falta[t] for t in range(z[0], z[1], res)))
    if b - a > 4 * 60:
        return []
    inicio, fin = a - 60, b + 60
    if fin - inicio < 4 * 60:
        fin = inicio + 4 * 60
    if perfil.ventana:
        lo, hi = perfil.ventana
        if fin > hi:
            inicio, fin = max(lo, inicio - (fin - hi)), hi
        if inicio < lo:
            inicio, fin = lo, min(hi, fin + (lo - inicio))
    if any(s.start_min >= inicio - 60 and s.end_min <= fin + 60 and s.start_min <= a and s.end_min >= b
           for s in config.turnos if s.minutes <= 5 * 60):
        return []
    dias = sorted(set().union(*(perfil.dias_falta[t] for t in range(a, b, res) if t in perfil.dias_falta)))
    corto = min((s.minutes for s in config.turnos), default=0) / 60
    detalle = (f"Faltan personas de {_tramo(a, b)} ({len(dias)} día{'s' if len(dias) != 1 else ''}). Cubrir ese rato con "
               f"turnos de {_horas(corto)} h o más obliga a meter a alguien muchas horas para un hueco corto. "
               f"Un turno de {fmt_hhmm(inicio)} a {fmt_hhmm(fin)} (en Turnos) se lo pondría más fácil al motor, "
               f"sobre todo con quien va corto de horas.")
    return [Sugerencia(clave=f"turno_pico:{a}:{b}", pantalla="turnos", titulo="Un turno corto para el pico",
                       detalle=detalle, alivia=["falta_cobertura", "exceso_personal"])]


def _tareas(config: Config, codigos: dict[str, list[Alerta]]) -> list[Sugerencia]:
    """La gente «de más» quizá está haciendo trabajo que la demanda no recoge."""
    if not (codigos.get("exceso_personal") or codigos.get("plantilla_sobrante")):
        return []
    hay = f" Ya hay {len(config.tareas)} definida{'s' if len(config.tareas) != 1 else ''}: revisa si falta alguna." if config.tareas else ""
    return [Sugerencia(
        clave="tareas", pantalla="demanda", titulo="Tareas que no dependen de la clientela",
        detalle="La demanda solo cuenta a la clientela. Si a esas horas hay trabajo que no depende de ella (preparar la "
                "cafetería al abrir, limpiar al cerrar, reponer, recibir pedidos), añádelo en Demanda → Tareas fijas: el "
                "motor sabrá que hace falta esa gente y dejará de contarla como personal de más." + hay,
        alivia=["exceso_personal", "plantilla_sobrante"])]


def _contratos(config: Config, h: Schedule, codigos: dict[str, list[Alerta]]) -> list[Sugerencia]:
    """Contratos que no encajan: quien no puede llegar a sus horas y quien siempre hace de más."""
    out = []
    dias = daterange(h.desde, h.hasta)
    semanas = len(dias) / 7
    config_bloq = with_locks(config, h.bloqueos)
    stats = {s.empleado_id: s for s in compute_stats(config, h.desde, h.hasta, h.asignaciones, h.saldo_anterior)}
    for a in codigos.get("horas_por_debajo", []) + codigos.get("sin_turnos", []):
        if not a.empleado_id:
            continue
        e = config.employee(a.empleado_id)
        objetivo = target_minutes(config, e, dias)
        tope = capacidad_minutos(config_bloq, e.id, dias)
        if tope >= objetivo - config.reglas.margen_periodo_horas * 60:
            continue
        opciones = ["quita una de sus libranzas fijas"]
        if e.restricciones_horarias:
            opciones.append("amplía las horas en que puede trabajar")
        if not e.puede_abrir or not e.puede_cerrar:
            opciones.append(f"marca «Puede {'abrir' if not e.puede_abrir else 'cerrar'}» en su ficha (esos turnos son más largos)")
        opciones.append(f"ajusta su contrato a unas {_horas(tope / 60 / semanas)} h semanales")
        out.append(Sugerencia(
            clave=f"contrato_corto:{e.id}", pantalla="equipo", titulo=f"{e.nombre} no puede llegar a su contrato",
            detalle=f"Con sus libranzas y los turnos que puede hacer, {e.nombre} suma como mucho unas {_horas(tope / 60)} h "
                    f"de las {_horas(objetivo / 60)} h que le tocan. En Equipo, {_lista(opciones, 'o')}.",
            alivia=["horas_por_debajo", "saldo_desbordado", "reparto_horas"]))
    extra = []
    for a in codigos.get("horas_extra", []):
        if a.empleado_id and a.empleado_id in stats:
            e, st = config.employee(a.empleado_id), stats[a.empleado_id]
            extra.append(f"{e.nombre} ({_horas((st.horas - st.horas_objetivo) / semanas)} h por semana sobre su "
                         f"contrato de {_horas(e.horas_semanales)} h)")
    if extra:
        out.append(Sugerencia(
            clave="contrato_largo", pantalla="equipo", titulo="Horas de más que se repiten",
            detalle=f"Hacen horas de más {_lista(extra)}, porque cubren huecos que nadie más puede. Si se repite "
                    f"de un horario a otro, amplía su contrato en Equipo o reparte mejor las libranzas para que esos "
                    f"huecos los cubra otra persona.",
            alivia=["horas_extra", "saldo_desbordado", "reparto_horas"]))
    return out


def _fines_semana(config: Config, h: Schedule, codigos: dict[str, list[Alerta]]) -> list[Sugerencia]:
    """Fines de semana mal repartidos por culpa de libranzas fijas que nunca caen en fin de semana."""
    if not codigos.get("reparto_fines_semana"):
        return []
    stats = [s for s in compute_stats(config, h.desde, h.hasta, h.asignaciones, h.saldo_anterior) if not s.comodin]
    maximo = max((s.fines_de_semana for s in stats), default=0)
    siempre = [config.employee(s.empleado_id) for s in stats if s.fines_de_semana == maximo]
    siempre = [e for e in siempre if e.libranzas_fijas and not e.fixed_off_indexes() & {5, 6}]
    nunca = [e for e in config.active_employees() if not e.comodin and {5, 6} <= e.fixed_off_indexes()]
    if not siempre and not nunca:
        return []
    partes = []
    if siempre:
        partes.append(f"{_lista([e.nombre for e in siempre])} libra{'n' if len(siempre) > 1 else ''} siempre entre semana, "
                      f"así que trabaja{'n' if len(siempre) > 1 else ''} todos los fines de semana")
    if nunca:
        partes.append(f"{_lista([e.nombre for e in nunca])} libra{'n' if len(nunca) > 1 else ''} sábado y domingo")
    detalle = (f"{_frase('; '.join(partes))}. Con libranzas fijas así, el motor no puede igualar los fines de semana. "
               f"En Equipo, pasa una de esas libranzas a sábado o domingo, o quita las libranzas fijas a alguien para que "
               f"el motor reparta sus días libres.")
    return [Sugerencia(clave="fines_semana", pantalla="equipo", titulo="Libranzas que no rotan los fines de semana",
                       detalle=detalle, alivia=["reparto_fines_semana"])]


def _plantilla(codigos: dict[str, list[Alerta]]) -> list[Sugerencia]:
    sobra, insuficiente = codigos.get("plantilla_sobrante", []), codigos.get("plantilla_insuficiente", [])
    out = []
    if sobra:
        out.append(Sugerencia(
            clave="plantilla_sobrante", pantalla="equipo", titulo="Más horas de contrato que demanda",
            detalle=f"En {len(sobra)} semana{'s' if len(sobra) != 1 else ''} los contratos suman bastantes más horas de las "
                    f"que pide la demanda. Si la demanda es correcta, es buen momento para dar vacaciones (Ausencias) o, "
                    f"si se repite, para reducir alguna jornada. Si no lo es, revisa la demanda y las tareas fijas.",
            alivia=["plantilla_sobrante", "exceso_personal", "horas_por_debajo"]))
    if insuficiente:
        out.append(Sugerencia(
            clave="plantilla_insuficiente", pantalla="equipo", titulo="Falta plantilla",
            detalle=f"En {len(insuficiente)} semana{'s' if len(insuficiente) != 1 else ''} ni con horas extra se llega a la "
                    f"demanda. Hace falta ampliar jornadas o contratar refuerzo (Equipo), o mover vacaciones (Ausencias).",
            alivia=["plantilla_insuficiente", "falta_cobertura"]))
    return out


# ---------------------------------------------------------------------------
# API pública
# ---------------------------------------------------------------------------
def _funciones(config: Config, codigos: dict[str, list[Alerta]]) -> list[Sugerencia]:
    """Faltan personas con una función (preparar pinchos...): pocas la tienen o caen en días que libran."""
    out = []
    activos = config.active_employees()
    for f in config.funciones:
        alertas = [a for a in codigos.get("falta_funcion", []) if a.clave.startswith(f"falta_funcion:{f.id}:")]
        if not alertas:
            continue
        con = [e for e in activos if f.id in e.funciones]
        sin = sorted((e for e in activos if f.id not in e.funciones), key=lambda e: (-e.horas_semanales, e.nombre))
        dias = sorted({a.fecha.weekday() for a in alertas if a.fecha})
        n = len(alertas)
        detalle = (f"{n} día{'s' if n > 1 else ''} sin nadie para «{f.nombre}»"
                   + (f" (sobre todo {_lista([_DIAS[i] for i in dias[:3]])})" if dias else "") + ". ")
        detalle += (f"Ahora solo {'la tiene' if len(con) == 1 else 'la tienen'} {_lista([e.nombre for e in con])}."
                    if con else "Nadie del equipo tiene esta función.")
        if sin:
            detalle += f" Dar la función a {sin[0].nombre} (en Equipo) daría más opciones al motor."
        out.append(Sugerencia(clave=f"funcion:{f.id}", pantalla="equipo", titulo=f"Más gente para «{f.nombre}»",
                              detalle=detalle, alivia=["falta_funcion"]))
    return out


def sugerir(config: Config, horario: Schedule, alertas: list[Alerta]) -> list[Sugerencia]:
    """Cambios de configuración que ayudarían con las alertas que quedan, de más a menos útil."""
    codigos: dict[str, list[Alerta]] = defaultdict(list)
    for a in alertas:
        codigos[a.codigo].append(a)
    if not codigos:
        return []
    perfil = _Perfil(config, horario)
    todas = (_libranzas(config, horario, codigos) + _habilitar(config, horario, codigos)
             + _contratos(config, horario, codigos) + _turno_pico(config, perfil, codigos)
             + _turnos_largos(config, perfil, codigos) + _tareas(config, codigos)
             + _fines_semana(config, horario, codigos) + _funciones(config, codigos) + _plantilla(codigos))
    cuantas = lambda s: sum(len(codigos.get(c, [])) for c in s.alivia)  # noqa: E731
    return sorted(todas, key=lambda s: -cuantas(s))
