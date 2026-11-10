"""Motor de generación de horarios con OR-Tools CP-SAT (o HiGHS donde no hay OR-Tools, ver resolutor.py).

Variable central: x[e, d, s, p, r] = 1 si el empleado e hace el turno s el día d en el puesto p (cocina o sala)
con el rol r (caja, cafetera...; None si ese día no hay roles que repartir o no tiene ninguno de ese puesto).
Los días en que la demanda no pide puestos, cada persona solo tiene su puesto principal (no hay nada que elegir);
los días sin reglas para los roles de un puesto, nadie tiene rol en él.
Las reglas duras son restricciones; la cobertura, las horas de contrato, las
preferencias y el reparto se optimizan con pesos (ver Weights en models.py).

Con un horario de referencia, cada casilla (persona, día) que cambie respecto a él se penaliza
(peso `cambio_turno`) y la referencia se usa como punto de partida: así se ajusta un horario
existente tocando lo mínimo, en lugar de rehacerlo (lo usa el solucionador de alertas).
"""
from __future__ import annotations

import datetime as dt
import threading
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Optional

from . import resolutor
from .models import Assignment, Config, Issue, Lock, Puesto, Schedule, Shift
from .planning import (
    allowed_posts,
    allowed_roles,
    allowed_shifts,
    carry_after,
    carry_from,
    comodin_min_minutes,
    daterange,
    demand_for,
    function_caps,
    function_demand,
    is_weekend,
    marco_semana,
    max_worked_days,
    rest_minutes_between,
    role_posts,
    shift_steps,
    target_minutes,
    upper_minutes,
    week_chunks,
    with_locks,
)
from .validator import compute_stats, validate


@dataclass
class SolveOptions:
    max_segundos: float = 30.0
    hilos: int = 8
    semilla: int = 0
    resolutor: str = "auto"  # ver resolutor.py


# CP-SAT ya usa todos los núcleos en cada cálculo; dos a la vez solo se quitan CPU el uno al otro.
_UN_CALCULO_A_LA_VEZ = threading.Lock()


def generate(
    config: Config,
    desde: dt.date,
    hasta: dt.date,
    opciones: SolveOptions | None = None,
    previo: list[Assignment] | None = None,
    bloqueos: list[Lock] | None = None,
    saldo_horas: dict[str, float] | None = None,
    referencia: list[Assignment] | None = None,
) -> Schedule:
    """Genera el horario de [desde, hasta].

    previo: asignaciones de fuera del periodo, de antes y de después (para el descanso entre jornadas, la semana
        partida y las rachas). Las de después son lo ya publicado que sigue al periodo y no se toca.
    bloqueos: cambios manuales que deben respetarse.
    saldo_horas: horas de más (+) o de menos (-) que cada empleado arrastra; se compensan en este periodo.
    referencia: horario del que partir; cada casilla que cambie respecto a él cuesta `pesos.cambio_turno`.
    """
    opciones = opciones or SolveOptions()
    if hasta < desde:
        raise ValueError("La fecha final es anterior a la inicial")
    bloqueos = bloqueos or []
    saldo_horas = saldo_horas or {}
    base_config = config
    config = with_locks(config, bloqueos)

    rules, w = config.reglas, config.pesos
    res = rules.resolucion_minutos
    days = daterange(desde, hasta)
    weeks = week_chunks(days)
    employees = config.active_employees()
    carry = carry_from(config, desde, previo)
    despues = carry_after(config, hasta, previo)
    cp_model = resolutor.cargar(opciones.resolutor)
    model = cp_model.CpModel()

    # ------------------------------------------------------------------ variables
    demands = {d: demand_for(config, d) for d in days}
    repartir = {d: role_posts(config, d) for d in days}
    x: dict[tuple[str, dt.date, str, Puesto, Optional[str]], Any] = {}
    shift_of: dict[tuple[str, dt.date, str], Shift] = {}  # con las horas a medida de los bloqueos
    for e in employees:
        for d in days:
            posts = allowed_posts(config, e, d) if demands[d].by_post else [_fixed_post(config, e, d)]
            for s in allowed_shifts(config, e, d):
                shift_of[e.id, d, s.id] = s
                # Un turno de cocina o de camarero solo se hace en ese puesto.
                for p in [s.puesto] if s.puesto else posts:
                    for r in allowed_roles(config, e, d, p, p in repartir[d]):
                        x[e.id, d, s.id, p, r] = model.NewBoolVar(f"x_{e.id}_{d}_{s.id}_{p.value}_{r or ''}")

    res_steps = {key: shift_steps(s, res) for key, s in shift_of.items()}
    by_emp_day = defaultdict(list)  # (empleado, día) -> [(turno, var)]
    by_day = defaultdict(list)  # día -> [(empleado, pasos que cubre, puesto, rol, var)]
    for (eid, d, sid, p, r), var in x.items():
        by_emp_day[eid, d].append((shift_of[eid, d, sid], var))
        by_day[d].append((eid, res_steps[eid, d, sid], p, r, var))

    # ------------------------------------------------------------------ reglas duras
    for e in employees:
        for d in days:
            vars_today = [v for _, v in by_emp_day[e.id, d]]
            if vars_today:
                model.AddAtMostOne(vars_today)
            override = config.override_for(e.id, d)
            if override and override.tipo in ("turno", "trabaja") and vars_today:
                model.Add(sum(vars_today) == 1)

    # Descanso mínimo entre jornadas consecutivas (también respecto al periodo anterior)
    min_rest = int(rules.descanso_minimo_horas * 60)
    for e in employees:
        if carry and e.id in carry.last_day:
            for b, vb in by_emp_day[e.id, desde]:
                if rest_minutes_between(carry.last_day[e.id], b) < min_rest:
                    model.Add(vb == 0)
        if despues and e.id in despues.first_day:
            for a, va in by_emp_day[e.id, hasta]:
                if rest_minutes_between(a, despues.first_day[e.id]) < min_rest:
                    model.Add(va == 0)
        for d in days[:-1]:
            nxt = d + dt.timedelta(days=1)
            for a, va in by_emp_day[e.id, d]:
                for b, vb in by_emp_day[e.id, nxt]:
                    if rest_minutes_between(a, b) < min_rest:
                        model.AddBoolOr([va.Not(), vb.Not()])

    marcos = [marco_semana(i, weeks, carry, despues) for i in range(len(weeks))]

    # Descanso semanal mínimo
    for e in employees:
        for i, chunk in enumerate(weeks):
            worked = [v for d in chunk for _, v in by_emp_day[e.id, d]]
            if not worked:
                continue
            frame, ya_dias, _ = marcos[i]
            model.Add(sum(worked) + ya_dias.get(e.id, 0) <= max_worked_days(config, len(frame)))

    # ------------------------------------------------------------------ horas de contrato (bolsa)
    penalties: list = []
    totals: dict[str, tuple] = {}  # empleado -> (minutos trabajados, objetivo del periodo); sin los comodines
    for e in employees:
        all_terms = [s.minutes * v for d in days for s, v in by_emp_day[e.id, d]]
        total = model.NewIntVar(0, 24 * 60 * len(days), f"total_{e.id}")
        model.Add(total == sum(all_terms)) if all_terms else model.Add(total == 0)
        if e.comodin:
            # Sin contrato: cada minuto cuesta, así que solo trabaja donde el resto no llega (o para su mínimo).
            penalties.append(w.uso_comodin * total)
        else:
            target = max(0, target_minutes(config, e, days) - int(saldo_horas.get(e.id, 0) * 60))
            totals[e.id] = (total, target)
            tol = int(rules.margen_periodo_horas * 60)
            max_extra = int(rules.max_horas_extra_semana * 60 * len(days) / 7)
            over = model.NewIntVar(0, max_extra, f"over_{e.id}")
            under = model.NewIntVar(0, max(target, 0), f"under_{e.id}")
            model.Add(over >= total - target - tol)
            model.Add(under >= target - tol - total)
            penalties.append(w.horas_extra * over)
            penalties.append(w.horas_por_debajo_contrato * under)

        # Por semana: tope duro por arriba y defecto blando por abajo (margen del contrato o mínimo del comodín)
        for i, chunk in enumerate(weeks):
            terms = [s.minutes * v for d in chunk for s, v in by_emp_day[e.id, d]]
            if not terms:
                continue
            frame, _, ya_minutos = marcos[i]
            n = len(frame)
            already = ya_minutos.get(e.id, 0)
            upper = upper_minutes(config, e, frame)
            if upper is not None:
                model.Add(sum(terms) + already <= upper)
            if e.comodin:
                lower = comodin_min_minutes(config, e, frame)
            else:
                lower = target_minutes(config, e, frame) - int(rules.margen_semanal_horas * 60 * n / 7)
            if lower > 0:
                wk_under = model.NewIntVar(0, lower, f"wkunder_{e.id}_{i}")
                model.Add(wk_under >= lower - already - sum(terms))
                penalties.append(w.horas_por_debajo_contrato * wk_under)

    # ------------------------------------------------------------------ cobertura
    for d in days:
        dem = demands[d]
        candidate_steps = set(dem.required)
        for _, steps, _, _, _ in by_day[d]:
            candidate_steps |= steps
        for t in sorted(candidate_steps):
            covering = [v for _, steps, _, _, v in by_day[d] if t in steps]
            req = dem.required.get(t, 0)
            cov = sum(covering) if covering else 0
            if req > 0:
                short = model.NewIntVar(0, req, f"short_{d}_{t}")
                model.Add(short >= req - cov)
                penalties.append(w.falta_cobertura * res * short)
            excess = model.NewIntVar(0, len(employees), f"excess_{d}_{t}")
            model.Add(excess >= cov - req)
            penalties.append(w.exceso_cobertura * res * excess)

            if rules.encargado_siempre and req > 0:
                mgr = [v for eid, steps, _, _, v in by_day[d]
                       if t in steps and config.employee(eid).es_encargado]
                miss = model.NewBoolVar(f"nomgr_{d}_{t}")
                model.Add(sum(mgr) + miss >= 1) if mgr else model.Add(miss == 1)
                penalties.append(w.falta_encargado * res * miss)

        # Mínimos por puesto: faltar un cocinero pesa como faltar una persona.
        for post, needed in dem.by_post.items():
            for t, req in sorted(needed.items()):
                covering = [v for _, steps, p, _, v in by_day[d] if p == post and t in steps]
                short = model.NewIntVar(0, req, f"short_{post.value}_{d}_{t}")
                model.Add(short >= req - (sum(covering) if covering else 0))
                penalties.append(w.falta_cobertura * res * short)
        # Reglas de las funciones: en esos tramos hace falta gente con la función (preparar pinchos...) o, en los
        # roles de un puesto (caja, lava...), gente haciendo ese rol, y como mucho los que diga la regla.
        for fid, needed in function_demand(config, d).items():
            f = config.funcion(fid)
            for t, req in sorted(needed.items()):
                covering = [v for eid, steps, _, r, v in by_day[d] if t in steps
                            and (r == fid if f.es_rol else fid in config.employee(eid).funciones)]
                short = model.NewIntVar(0, req, f"short_f_{fid}_{d}_{t}")
                model.Add(short >= req - (sum(covering) if covering else 0))
                penalties.append(w.falta_funcion * res * short)
        for fid, caps in function_caps(config, d).items():
            for t, cap in sorted(caps.items()):
                covering = [v for _, steps, _, r, v in by_day[d] if t in steps and r == fid]
                if len(covering) <= cap:
                    continue
                over = model.NewIntVar(0, len(covering), f"over_f_{fid}_{d}_{t}")
                model.Add(over >= sum(covering) - cap)
                penalties.append(w.exceso_funcion * res * over)
        if dem.by_post:
            for eid, _, p, _, v in by_day[d]:
                if p != config.employee(eid).puesto_principal:
                    penalties.append(w.puesto_secundario * v)
        for eid, _, p, r, v in by_day[d]:
            if r is not None and r not in config.roles_de(config.employee(eid), p)[:1]:  # no es su rol principal
                penalties.append(w.rol_secundario * v)

    # ------------------------------------------------------------------ problemas críticos (ver criticas.py)
    # Con ellos el horario no vale: momentos sin nadie y días sin nadie habilitado al abrir o al cerrar. Pesan
    # mucho más que cualquier otra cosa, así que el motor solo los deja si no hay forma de evitarlos.
    for d in days:
        pasos = sorted(t for t, n in demands[d].required.items() if n > 0)
        if not pasos:
            continue
        for t in pasos:
            covering = [v for _, steps, _, _, v in by_day[d] if t in steps]
            if covering:
                nadie = model.NewBoolVar(f"nadie_{d}_{t}")
                model.Add(sum(covering) + nadie >= 1)
                penalties.append(w.critica * nadie)
        for paso, habilitado in ((pasos[0], "puede_abrir"), (pasos[-1], "puede_cerrar")):
            quienes = [v for eid, steps, _, _, v in by_day[d]
                       if paso in steps and getattr(config.employee(eid), habilitado)]
            if quienes:
                miss = model.NewBoolVar(f"sin_{habilitado}_{d}")
                model.Add(sum(quienes) + miss >= 1)
                penalties.append(w.critica * miss)

    # ------------------------------------------------------------------ rachas de días seguidos
    penalties += _streak_terms(model, config, employees, days, by_emp_day, previo, w.racha_larga,
                               con_despues=despues is not None)

    # ------------------------------------------------------------------ horas: reparto entre personas y saldo
    penalties += _hours_balance_terms(model, config, totals, len(days), w.reparto_horas)
    if rules.arrastrar_saldo:
        cap = int(rules.max_saldo_horas * 60)
        for e in employees:
            if e.comodin:
                continue  # sin contrato no hay saldo que arrastrar
            total, _ = totals[e.id]
            gross = target_minutes(config, e, days)  # sin saldo: lo que se arrastraría al siguiente periodo
            spill = model.NewIntVar(0, 24 * 60 * len(days), f"spill_{e.id}")
            model.Add(spill >= total - gross - cap)
            model.Add(spill >= gross - cap - total)
            penalties.append(w.saldo_desbordado * spill)

    # ------------------------------------------------------------------ preferencias (blandas)
    for p in config.preferencias:
        for d in days:
            if not p.applies_on(d):
                continue
            for s, v in by_emp_day[p.empleado_id, d]:
                bad = (s.id in p.turnos) if p.tipo == "evita" else (s.id not in p.turnos)
                if bad:
                    penalties.append(w.preferencia * p.peso * 60 * v)

    # ------------------------------------------------------------------ reparto justo
    def balance(counts: list, max_gap: int):
        """Reparto lo más igualado posible y, con más fuerza, sin pasar de la diferencia que dispara la alerta."""
        if len(counts) < 2:
            return
        hi = model.NewIntVar(0, len(days), "")
        lo = model.NewIntVar(0, len(days), "")
        for c in counts:
            model.Add(hi >= c)
            model.Add(lo <= c)
        penalties.append(w.reparto_desigual * 60 * (hi - lo))
        over = model.NewIntVar(0, len(days), "")
        model.Add(over >= hi - lo - max_gap)
        penalties.append(w.reparto_turnos * over)

    weekend_counts, close_counts = [], []
    for e in employees:
        if e.comodin:
            continue  # cubre huecos: no entra en el reparto de fines de semana y cierres
        wk = [v for d in days if is_weekend(d) for _, v in by_emp_day[e.id, d]]
        if wk and not ({5, 6} <= e.fixed_off_indexes()):
            c = model.NewIntVar(0, len(days), f"wk_{e.id}")
            model.Add(c == sum(wk))
            weekend_counts.append(c)
        cl = [v for d in days for s, v in by_emp_day[e.id, d] if s.tipo.value == "cierre"]
        if cl:
            c = model.NewIntVar(0, len(days), f"cl_{e.id}")
            model.Add(c == sum(cl))
            close_counts.append(c)
    balance(weekend_counts, config.alertas.reparto_fines_semana)
    balance(close_counts, config.alertas.reparto_cierres)

    # ------------------------------------------------------------------ estabilidad respecto a la referencia
    if referencia is not None:
        penalties += _stability_terms(model, x, by_emp_day, employees, days, referencia, w.cambio_turno, config)

    model.Minimize(sum(penalties))

    # ------------------------------------------------------------------ resolver
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = opciones.max_segundos
    solver.parameters.num_workers = opciones.hilos
    solver.parameters.random_seed = opciones.semilla
    with _UN_CALCULO_A_LA_VEZ:
        status = solver.Solve(model)
    status_name = solver.StatusName(status)

    common = dict(desde=desde, hasta=hasta, estado_solver=status_name, bloqueos=bloqueos, saldo_anterior=saldo_horas)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return Schedule(
            asignaciones=[], **common,
            incidencias=[Issue(nivel="error", codigo="sin_solucion",
                               mensaje="No existe ningún horario que cumpla las reglas duras. "
                                       "Revisa libranzas fijas, ausencias y cambios manuales bloqueados.")],
        )

    assignments = [
        _assignment(config, eid, d, sid, p, r, shift_of[eid, d, sid])
        for (eid, d, sid, p, r), v in x.items() if solver.Value(v)
    ]
    assignments.sort(key=lambda a: (a.fecha, config.turno_de(a).start_min, a.empleado_id))
    # Se valida contra la configuración sin bloqueos: los bloqueos son decisiones del encargado,
    # pero si chocan con una libranza fija o una ausencia conviene seguir viéndolo.
    issues = validate(base_config, desde, hasta, assignments, previo=previo, saldo_horas=saldo_horas, bloqueos=bloqueos)
    return Schedule(
        asignaciones=assignments, incidencias=issues, **common,
        resumen=compute_stats(base_config, desde, hasta, assignments, saldo_horas),
    )


def _fixed_post(config: Config, e, d: dt.date) -> Puesto:
    """Puesto de un día sin demanda por puesto: el fijado a mano o el principal de la persona."""
    posts = allowed_posts(config, e, d)
    return e.puesto_principal if e.puesto_principal in posts else posts[0]


def _assignment(config: Config, eid: str, d: dt.date, sid: str, p: Puesto, r: Optional[str], s: Shift) -> Assignment:
    base = config.shift(sid)
    custom = (s.inicio, s.fin) != (base.inicio, base.fin)
    return Assignment(empleado_id=eid, fecha=d, turno_id=sid, puesto=p, funcion=r,
                      inicio=s.inicio if custom else None, fin=s.fin if custom else None)


def _stability_terms(model: Any, x: dict, by_emp_day: dict, employees, days: list[dt.date],
                     referencia: list[Assignment], peso: int, config: Config) -> list:
    """Penaliza cada casilla que cambie respecto a la referencia y la da como pista inicial al solver.

    Cambiar de turno o de puesto cuenta como cambio; cambiar solo de rol (de caja a cafetera), como un tercio.
    Las casillas que ya no pueden quedarse como estaban (p. ej. una ausencia aprobada) cambian sí o sí: su coste
    es constante y no se añade. Si el rol de la referencia ya no se puede (o no tenía), cambiarlo no cuesta.
    """
    emp_ids = {e.id for e in config.empleados}
    actual = {(a.empleado_id, a.fecha): (a.turno_id, config.puesto_de(a), a.funcion)
              for a in referencia if a.empleado_id in emp_ids}
    options: dict[tuple[str, dt.date], dict] = defaultdict(dict)
    for (eid, d, sid, p, r), var in x.items():
        options[eid, d][sid, p, r] = var
    for (eid, d), opts in options.items():
        ref = actual.get((eid, d))
        # Si el rol o el puesto de la referencia ya no se pueden, la pista es lo más parecido que quede.
        same_post = [k for k in opts if ref and k[:2] == ref[:2]]
        same_shift = [k for k in opts if ref and k[0] == ref[0]]
        hinted = ref if ref in opts else (same_post or same_shift or [None])[0]
        for k, var in opts.items():
            model.AddHint(var, 1 if k == hinted else 0)
    terms = []
    for e in employees:
        for d in days:
            opts = options.get((e.id, d))
            if not opts:
                continue
            ref = actual.get((e.id, d))
            if ref is None:
                terms.append(peso * sum(opts.values()))  # libraba: trabajar es un cambio
                continue
            same_post = [v for k, v in opts.items() if k[:2] == ref[:2]]
            if same_post:
                terms.append(peso * (1 - sum(same_post)))  # cambia si deja ese turno o ese puesto
                if ref in opts and len(same_post) > 1:
                    terms.append(peso // 3 * (1 - opts[ref]))  # mismo turno con otro rol
            elif any(k[0] == ref[0] for k in opts):
                terms.append(peso * (1 - sum(v for k, v in opts.items() if k[0] == ref[0])))
    return terms


def _streak_terms(model: Any, config: Config, employees, days: list[dt.date], by_emp_day: dict,
                  previo: list[Assignment] | None, peso: int, con_despues: bool = False) -> list:
    """Penaliza cada día de una racha que pase del máximo de días seguidos de las alertas.

    Una racha de L días con máximo M contiene L - M ventanas de M + 1 días todos trabajados; se penaliza
    cada ventana. Se cuentan los días trabajados justo antes del periodo y, si ya hay horario publicado después
    ('con_despues'), los de justo después.
    """
    maximo = config.alertas.racha_dias_max
    antes = [days[0] - dt.timedelta(days=i) for i in range(maximo, 0, -1)]
    luego = [days[-1] + dt.timedelta(days=i) for i in range(1, maximo + 1)] if con_despues else []
    previos = {(a.empleado_id, a.fecha) for a in (previo or [])}
    terms = []
    for e in employees:
        worked: list = [1 if (e.id, d) in previos else 0 for d in antes]
        for d in days:
            vs = [v for _, v in by_emp_day[e.id, d]]
            worked.append(sum(vs) if vs else 0)
        worked += [1 if (e.id, d) in previos else 0 for d in luego]
        for i in range(len(worked) - maximo):
            window = worked[i:i + maximo + 1]
            if i + maximo < len(antes) or i >= len(antes) + len(days) \
                    or any(isinstance(x, int) and x == 0 for x in window):
                continue  # ventana entera fuera del periodo, o con un día que seguro se libra
            over = model.NewBoolVar(f"racha_{e.id}_{i}")
            model.Add(over >= sum(window) - maximo)
            terms.append(peso * over)
    return terms


def _hours_balance_terms(model: Any, config: Config, totals: dict, n_days: int, peso: int) -> list:
    """Penaliza la distancia entre quien más y quien menos cumple su contrato, por encima del umbral de las alertas.

    Se mide en milésimas del objetivo (como la alerta, solo cuenta quien tiene al menos 10 h de objetivo).
    """
    ratios = []
    for eid, (total, target) in totals.items():
        if target < 600:
            continue
        r = model.NewIntVar(0, 1000 * 24 * 60 * n_days // target + 1, f"ratio_{eid}")
        model.Add(target * r <= 1000 * total)
        model.Add(1000 * total <= target * r + target - 1)
        ratios.append(r)
    if len(ratios) < 2:
        return []
    top = max(1000 * 24 * 60 * n_days // 600 + 1, 1)
    hi, lo = model.NewIntVar(0, top, "ratio_hi"), model.NewIntVar(0, top, "ratio_lo")
    for r in ratios:
        model.Add(hi >= r)
        model.Add(lo <= r)
    over = model.NewIntVar(0, top, "ratio_over")
    model.Add(over >= hi - lo - int(config.alertas.reparto_horas_pct * 10))
    return [peso * over]
