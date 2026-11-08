"""API y servidor web del gestor de horarios de Lopita."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import secrets
import sys
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware

from lopita_horarios.alertas import catalogo
from lopita_horarios.cambios import diferencias
from lopita_horarios.edicion import EdicionInvalida, Tramo, aplicar_dia, rol_manual
from lopita_horarios.edicion import evaluar as evaluar_edicion
from lopita_horarios.models import Absence, Assignment, Config, Lock, Preference, Puesto, Schedule
from lopita_horarios.render import FONT_DIR, html_to_pdf_bytes, render_html
from lopita_horarios.report import coverage, hours_csv
from lopita_horarios.solucionador import CambioPropuesto, HorarioCambiado, aplicar, congelar_antes, solucionar
from lopita_horarios.solver import SolveOptions
from lopita_horarios.sugerencias import sugerir
from lopita_horarios.validator import compute_stats, validate

from . import alertas as alertas_app
from . import arreglos, avisos, calendario, comentarios, cuentas, horas, linea_tiempo
from . import web as web_publica
from .db import Store, default_db_path
from .seguridad import LimiteIntentos, MismoOrigen
from .slack import Slack

ROOT = Path(__file__).resolve().parent
EXAMPLE = ROOT.parent / "datos" / "ejemplo.json"


class _StaticSinCache(StaticFiles):
    """Obliga al navegador a revalidar (ETag) para que vea siempre la última versión."""

    def file_response(self, *args, **kwargs):
        resp = super().file_response(*args, **kwargs)
        resp.headers["Cache-Control"] = "no-cache"
        return resp


def _validation_message(exc: ValidationError) -> str:
    msgs = []
    for e in exc.errors():
        loc = " › ".join(str(x) for x in e.get("loc", ()) if x not in ("body",))
        msg = e.get("msg", "").removeprefix("Value error, ")
        msgs.append(f"{loc}: {msg}" if loc else msg)
    return "; ".join(msgs[:5])


class LoginIn(BaseModel):
    usuario: str
    password: str


class GenerateIn(BaseModel):
    desde: dt.date
    hasta: dt.date
    segundos: Optional[float] = None


class CellIn(BaseModel):
    empleado_id: str
    fecha: dt.date
    turno_id: Optional[str] = None
    puesto: Optional[Puesto] = Field(default=None, description="Vacío: el que tenía ese día, o su puesto principal")
    funcion: Optional[str] = Field(default=None, description="Rol (caja, cafetera...). Vacío: el que tenía si le sigue "
                                   "valiendo o su rol principal si ese día se reparten roles; '' = sin rol")
    conservar_horas: bool = Field(default=False, description="Si es el mismo turno, mantener sus horas a medida")
    bloquear: bool = True


class UserIn(BaseModel):
    usuario: str
    password: str
    nombre: Optional[str] = None
    rol: Literal["admin", "empleado"] = "admin"
    empleado_id: Optional[str] = None


class PasswordIn(BaseModel):
    actual: str
    nueva: str


class PrefIn(BaseModel):
    tipo: Literal["prefiere", "evita"]
    turnos: list[str]
    dias: Optional[list[str]] = None
    peso: int = 3


class PrefsIn(BaseModel):
    preferencias: list[PrefIn]


class AbsenceReqIn(BaseModel):
    desde: dt.date
    hasta: dt.date
    motivo: Literal["vacaciones", "permiso", "otro"] = "vacaciones"
    nota: Optional[str] = None


class CorrectionIn(BaseModel):
    fecha: dt.date
    clase: Literal["horas", "turno", "no_trabajado", "extra"]
    turno_id: Optional[str] = None
    inicio: Optional[str] = None
    fin: Optional[str] = None
    motivo: str


class RegenIn(BaseModel):
    desde: Optional[dt.date] = None


class FixIn(BaseModel):
    desde: Optional[dt.date] = None


class ApplyFixIn(BaseModel):
    cambios: list[CambioPropuesto] = Field(min_length=1, max_length=2000)


class DayEditIn(BaseModel):
    fecha: dt.date
    tramos: list[Tramo] = Field(max_length=200)
    base: Optional[str] = Field(default=None, description="«version» del horario cuando se empezó a editar")


class AckIn(BaseModel):
    clave: str
    nota: Optional[str] = None


class ReadIn(BaseModel):
    ids: Optional[list[int]] = None


class PublishIn(BaseModel):
    confirmar_criticas: bool = Field(default=False, description="Publicar aunque tenga alertas críticas (el horario no vale tal cual)")


class ReadNotificationsIn(BaseModel):
    ids: Optional[list[int]] = Field(default=None, max_length=500)


class ResolveIn(BaseModel):
    accion: Literal["aprobar", "rechazar"]
    respuesta: Optional[str] = None


# Clave de ajustes_app con la versión de la configuración de antes del cambio que dejó un arreglo pendiente.
ARREGLO_PENDIENTE = "arreglo_pendiente"


class CalIn(BaseModel):
    renovar: bool = False


def create_app(db_path: str | None = None, slack: Slack | None = None, secret: str | None = None,
               solve_seconds: float | None = None, arreglos_aparte: bool = False,
               arreglo_seconds: float | None = None) -> FastAPI:
    """arreglos_aparte: guardar una ausencia (o un cambio de plantilla) responde al momento y el arreglo de los
    horarios afectados queda pendiente hasta que la interfaz llama a POST /api/arreglos. Lo usa la app sin servidor,
    donde el motor corre en el dispositivo y atiende las peticiones de una en una: con el arreglo dentro del guardado,
    recalcular un mes dejaba la app sin cargar ni guardar varios minutos.
    arreglo_seconds: segundos del motor para cada intento de esos arreglos (por defecto, los de generar).
    """
    store = Store(db_path or default_db_path())
    slack = slack or Slack()
    seconds = solve_seconds or float(os.environ.get("LOPITA_SOLVER_SEGUNDOS", "30"))
    seconds_arreglo = arreglo_seconds or seconds
    public_url = os.environ.get("LOPITA_PUBLIC_URL", "").rstrip("/")
    # Dónde se sirven los calendarios .ics. Con servidor, en /cal de la propia app; sin servidor (app en el navegador
    # con los datos en Cloudflare) los sirve el Worker y la app le sube los calendarios tras cada cambio.
    cal_base_env = os.environ.get("LOPITA_CAL_URL", "").rstrip("/")
    cal_disponible = bool(cal_base_env) or sys.platform != "emscripten"

    # Datos iniciales
    if store.current_config() is None:
        seed = os.environ.get("LOPITA_SEED", "ejemplo")
        if seed == "ejemplo" and EXAMPLE.exists():
            store.save_config(Config.model_validate_json(EXAMPLE.read_text(encoding="utf-8")), "sistema", "Datos de ejemplo")
        else:
            store.save_config(Config(empleados=[], turnos=[], tipos_dia=[{"nombre": "normal", "franjas": []}],
                                     tipo_dia_por_semana={d: "normal" for d in
                                                          ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"]}),
                              "sistema", "Configuración vacía")
    admin_user, admin_pw = os.environ.get("LOPITA_ADMIN_USER", "admin"), os.environ.get("LOPITA_ADMIN_PASSWORD")
    if admin_pw and not store.users():
        store.upsert_user(admin_user, admin_pw, "Administrador")

    https = os.environ.get("LOPITA_HTTPS", "0") == "1"
    secret = secret or os.environ.get("LOPITA_SECRET")
    if not secret:
        if https:  # en producción, un secreto aleatorio cerraría todas las sesiones en cada reinicio
            raise RuntimeError("Falta LOPITA_SECRET: pon una cadena larga y aleatoria en el .env (ver .env.example)")
        secret = secrets.token_hex(32)
    # La documentación interactiva de la API solo se publica si se pide (LOPITA_DOCS=1): enseña todas las rutas.
    docs = os.environ.get("LOPITA_DOCS", "0") == "1"
    app = FastAPI(title="Lopita · Horarios", docs_url="/api/docs" if docs else None, redoc_url=None,
                  openapi_url="/api/openapi.json" if docs else None)
    app.add_middleware(SessionMiddleware, secret_key=secret, session_cookie="lopita_sesion", max_age=60 * 60 * 24 * 30,
                       same_site="lax", https_only=https)
    app.add_middleware(MismoOrigen)
    # Comprime las respuestas grandes (un horario de 9 semanas en JSON pesa cientos de KB): en el móvil se nota.
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    app.state.store, app.state.slack = store, slack
    evaluaciones = alertas_app.CacheEvaluaciones()  # una por app: en los tests, cada app empieza sin nada
    intentos = LimiteIntentos()

    # ------------------------------------------------------------------ utilidades
    # Con una contraseña temporal solo se puede ver quién eres, cambiarla o salir.
    rutas_con_clave_temporal = {"/api/me", "/api/mi/clave", "/api/logout"}

    def user(request: Request) -> dict:
        s = request.session.get("user")
        u = store.get_user(s["username"]) if s else None
        if not u:
            request.session.clear()
            raise HTTPException(401, "Inicia sesión")
        if u["cambiar_clave"] and request.url.path not in rutas_con_clave_temporal:
            raise HTTPException(403, "Cambia tu contraseña temporal antes de seguir")
        return u

    def admin(u=Depends(user)) -> dict:
        if u["rol"] != "admin":
            raise HTTPException(403, "Esta acción es solo para encargados")
        return u

    def worker(u=Depends(user)) -> dict:
        if u["rol"] != "empleado" or not u["empleado_id"]:
            raise HTTPException(403, "Esta sección es para trabajadores")
        return u

    en_calculo: set[str] = set()
    cerrojo_calculo = threading.Lock()

    @contextmanager
    def calculando(clave: str):
        """Un mismo cálculo (generar este periodo, regenerar este horario) no corre dos veces a la vez: un doble clic
        o un reintento tras un corte de red no crea horarios repetidos ni gasta el motor dos veces."""
        with cerrojo_calculo:
            if clave in en_calculo:
                raise HTTPException(409, "Ya se está calculando este horario; espera a que termine.")
            en_calculo.add(clave)
        try:
            yield
        finally:
            with cerrojo_calculo:
                en_calculo.discard(clave)

    def config_now() -> Config:
        return store.current_config()[0]

    def load(sid: int) -> dict:
        row = store.get_schedule(sid)
        if not row:
            raise HTTPException(404, "Horario no encontrado")
        return row

    def base_url(request: Request) -> str:
        return public_url or str(request.base_url).rstrip("/")

    def view_url(request: Request, token: str) -> str:
        return f"{base_url(request)}/ver/{token}"

    def refresh(config: Config, h: Schedule, sid: int | None) -> Schedule:
        previo = store.assignments_around(h.desde, h.hasta, exclude=sid)
        h.incidencias = validate(config, h.desde, h.hasta, h.asignaciones, previo=previo,
                                 saldo_horas=h.saldo_anterior, bloqueos=h.bloqueos)
        h.resumen = compute_stats(config, h.desde, h.hasta, h.asignaciones, h.saldo_anterior)
        return h

    def saldo_esperado(config: Config, row: dict, filas: list[dict] | None = None,
                       correcciones: list[dict] | None = None) -> dict[str, float]:
        h: Schedule = row["horario"]
        if correcciones is None:
            correcciones = store.list_requests(tipo="correccion", estado="aprobada")
        return horas.saldo_arrastrado(config, store.previous_contiguous(h.desde, exclude=row["id"], filas=filas),
                                      correcciones)

    def alert_report(row: dict, config: Config | None = None, filas: list[dict] | None = None,
                     contexto: dict | None = None) -> dict:
        """Alertas del encargado para un horario: las del horario más las que dependen del contexto.

        filas y contexto (lo que es igual para todos los horarios) se pasan cuando se calculan las alertas de
        varios horarios seguidos, para leerlos de la base de datos una sola vez.
        """
        config = config or config_now()
        ctx = contexto or contexto_alertas(config)
        h: Schedule = row["horario"]
        previo = store.assignments_around(h.desde, h.hasta, exclude=row["id"], filas=filas)
        todas = evaluaciones.evaluar(config, h, previo, ctx["clave_config"]) + alertas_app.contexto(
            config, row, ctx["solicitudes"], ctx["avisos"], saldo_esperado(config, row, filas, ctx["correcciones"]),
            ctx["hoy"])
        return alertas_app.informe(todas, store.acknowledged(row["id"]))

    def contexto_alertas(config: Config) -> dict:
        return {"hoy": dt.date.today(), "clave_config": evaluaciones.clave_config(config),
                "solicitudes": store.list_requests(tipo="ausencia", estado="pendiente"),
                "avisos": store.notices(solo_sin_leer=True),
                "correcciones": store.list_requests(tipo="correccion", estado="aprobada")}

    def global_alerts() -> dict:
        """Alertas activas de todos los horarios que aún no han terminado, de más a menos importantes."""
        hoy = dt.date.today()
        config = config_now()
        ctx = contexto_alertas(config)
        horarios, alertas = [], []
        total = {"critica": 0, "alta": 0, "media": 0, "baja": 0}
        filas = store.list_schedules()
        publicados = {r["id"] for r in filas if r["estado"] == "publicado"}
        for r in filas:
            h: Schedule = r["horario"]
            if h.hasta < hoy or r.get("reemplaza") in publicados or linea_tiempo.sustituido(r):
                continue  # terminado, arreglo pendiente de un publicado (sus alertas ya salen en el publicado) o sustituido
            rep = alert_report(r, config, filas, ctx)
            horarios.append({"id": r["id"], "desde": h.desde.isoformat(), "hasta": h.hasta.isoformat(), "estado": r["estado"],
                             "resumen": rep["resumen"], "regenerar_desde": rep["regenerar_desde"]})
            for k, n in rep["resumen"].items():
                total[k] += n
            alertas += [{**a, "horario_id": r["id"], "horario_desde": h.desde.isoformat(),
                         "horario_hasta": h.hasta.isoformat(), "horario_estado": r["estado"]} for a in rep["activas"]]
        alertas.sort(key=lambda a: (-a["importancia"], a["fecha"] or "9999", a["clave"]))
        return {"resumen": total, "horarios": horarios, "alertas": alertas, "catalogo": catalogo()}

    def version_of(row: dict) -> str:
        """Huella del contenido del horario: cambia con cualquier edición (la fecha de modificación va por segundos)."""
        h: Schedule = row["horario"]
        return hashlib.sha256(f"{row['estado']}|{h.model_dump_json(include={'asignaciones', 'bloqueos'})}"
                              .encode()).hexdigest()[:16]

    def summary(row: dict, report: dict | None = None) -> dict:
        h: Schedule = row["horario"]
        report = report or alert_report(row)
        return {
            "alertas": report["resumen"], "regenerar_desde": report["regenerar_desde"],
            "id": row["id"], "desde": h.desde, "hasta": h.hasta, "estado": row["estado"],
            "errores": sum(1 for i in h.incidencias if i.nivel == "error"),
            "avisos": sum(1 for i in h.incidencias if i.nivel == "aviso"),
            "huecos": sum(1 for i in h.incidencias if i.codigo == "falta_cobertura"),
            "turnos": len(h.asignaciones), "bloqueos": len(h.bloqueos),
            "cambios_pendientes": row["cambios_pendientes"], "token": row["token"], "reemplaza": row.get("reemplaza"),
            # Publicado: en cuántas de sus fechas manda (las demás las ha ocupado otro publicado después)
            "dias_vigentes": len(list(linea_tiempo.fechas(row))) if row["estado"] == "publicado" else None,
            "sustituido": linea_tiempo.sustituido(row),
            "creado": row["created_at"], "actualizado": row["updated_at"], "publicado": row["published_at"],
            "version": version_of(row),
            "autor": row["autor"],
        }

    def detail(row: dict, request: Request) -> dict:
        config = config_now()
        h: Schedule = row["horario"]
        report = alert_report(row, config)
        pendiente = store.replacement_of(row["id"]) if row["estado"] == "publicado" else None
        previo = store.assignments_around(h.desde, h.hasta, exclude=row["id"])
        sugerencias = sugerir(config, h, evaluaciones.evaluar(config, h, previo))
        return {**summary(row, report), "alertas_detalle": report,
                "sugerencias": [s.model_dump(mode="json") for s in sugerencias], "horario": h.model_dump(mode="json"), "cobertura": coverage(config, h),
                "url_publica": view_url(request, row["token"]) if row["token"] else None,
                "arreglo_pendiente": pendiente["id"] if pendiente else None,
                "registro": store.actions(row["id"])}

    def criticas_de(row: dict, config: Config) -> list[dict]:
        return [a for a in alert_report(row, config)["activas"] if a["severidad"] == "critica"]

    def repair_after_absences(antes: Optional[Config] = None) -> list[int]:
        """Tras un cambio de ausencias o de plantilla: arregla los horarios afectados (sin publicar nada).

        Con la configuración de antes del cambio, además avisa de los turnos ya asignados que una ausencia nueva
        (una baja, por ejemplo) deja sin hacer.
        Con arreglos_aparte no arregla nada aún: apunta la versión de antes (la más antigua si se acumulan varios
        cambios) y devuelve [] hasta que se pida POST /api/arreglos.
        """
        if arreglos_aparte:
            if store.ajuste(ARREGLO_PENDIENTE) is None:
                previa = store.previous_config_version(store.current_config()[1]) if antes is not None else None
                store.set_ajuste(ARREGLO_PENDIENTE, str(previa or 0))
            return []
        return run_repairs(antes)

    def run_repairs(antes: Optional[Config]) -> list[int]:
        hoy = dt.date.today()
        perdidos = arreglos.turnos_perdidos(store, antes, config_now(), hoy) if antes is not None else []
        hechos = arreglos.arreglar_tras_ausencias(store, config_now(), hoy, seconds_arreglo,
                                                  avisados=frozenset(t["horario_id"] for t in perdidos))
        if perdidos:
            arreglos.avisar_turnos_perdidos(store, perdidos, hechos)
        return hechos

    def diff_employees(a: Schedule, b: Schedule) -> set[str]:
        return {c.empleado_id for c in diferencias(a.asignaciones, b.asignaciones)}

    # ------------------------------------------------------------------ sesión

    @app.post("/api/login")
    def login(body: LoginIn, request: Request):
        usuario = body.usuario.strip()
        claves = [f"usuario:{usuario.lower()}", f"ip:{request.client.host if request.client else '?'}"]
        espera = intentos.segundos_de_espera(claves)
        if espera > 0:
            minutos = max(1, round(espera / 60))
            raise HTTPException(429, f"Demasiados intentos fallidos. Prueba de nuevo dentro de {minutos} "
                                     f"minuto{'s' if minutos > 1 else ''}.", headers={"Retry-After": str(int(espera) + 1)})
        u = store.authenticate(usuario, body.password)
        if not u:
            intentos.fallo(claves)
            raise HTTPException(401, "Usuario o contraseña incorrectos")
        intentos.acierto(claves)
        request.session.clear()  # sesión nueva al entrar
        request.session["user"] = {"username": u["username"]}
        return u

    @app.post("/api/logout")
    def logout(request: Request):
        request.session.clear()
        return {"ok": True}

    @app.get("/api/me")
    def me(request: Request, u=Depends(user)):
        out = {**u, "url_publica": public_url or None, "via_google": bool(request.session.get("google")),
               "google_client_id": cuentas.client_id(store)}
        if u["rol"] == "admin":
            out["slack"] = {"configurado": slack.configured, "canal": slack.channel}
            out["pendientes"] = len(store.list_requests(estado="pendiente"))
            res = global_alerts()["resumen"]
            out["alertas"] = res["critica"] + res["alta"]
            out["criticas"] = res["critica"]
            out["notificaciones"] = len(store.notifications(solo_sin_leer=True))
            out["mensajes_web"] = len(store.web_messages(estado="nuevo"))
            out["comentarios"] = comentarios.nuevos(store)
            out["accesos"] = len(store.accesos())
            out["alertas_catalogo"] = catalogo()
            out["arreglos_pendientes"] = store.ajuste(ARREGLO_PENDIENTE) is not None
        elif u["empleado_id"]:
            out["avisos"] = sum(1 for a in worker_notices(u) if not a["leido"])
        return out

    @app.post("/api/mi/clave")
    def change_password(body: PasswordIn, request: Request, u=Depends(user)):
        # Quien ha entrado con Google puede ponerse contraseña sin saber la anterior (ya ha demostrado quién es).
        if not request.session.get("google") and not store.password_ok(u["username"], body.actual):
            raise HTTPException(400, "La contraseña actual no es correcta")
        if len(body.nueva) < 8:
            raise HTTPException(400, "La nueva contraseña debe tener al menos 8 caracteres")
        if body.nueva == body.actual:
            raise HTTPException(400, "Elige una contraseña distinta de la actual")
        store.set_password(u["username"], body.nueva)
        return {**store.get_user(u["username"])}

    # ------------------------------------------------------------------ configuración
    @app.get("/api/config")
    def get_config(u=Depends(admin)):
        config, version, ts = store.current_config()
        return {"config": config.model_dump(mode="json"), "version": version, "actualizado": ts}

    @app.put("/api/config")
    async def put_config(request: Request, u=Depends(admin)):
        try:
            body = await request.json()
        except json.JSONDecodeError:
            raise HTTPException(400, "El cuerpo no es JSON válido")
        raw = body.get("config", body)
        base = body.get("base") if isinstance(body.get("config"), dict) else None
        if base is None:
            raise HTTPException(400, "Falta «base»: la versión de la configuración sobre la que has hecho los cambios")
        if base != store.current_config()[1]:
            raise HTTPException(409, "La configuración ha cambiado mientras la editabas (por ejemplo, al aprobar una "
                                     "solicitud o al cambiar un trabajador sus preferencias). Recárgala y repite tus cambios.")
        try:
            config = Config.model_validate(raw)
        except ValidationError as exc:
            raise HTTPException(422, _validation_message(exc))
        antes = config_now()
        version = store.save_config(config, u["username"], body.get("nota"))
        return {"config": config.model_dump(mode="json"), "version": version, "arreglos": repair_after_absences(antes),
                "arreglos_pendientes": store.ajuste(ARREGLO_PENDIENTE) is not None}

    @app.get("/api/config/historial")
    def config_history(u=Depends(admin)):
        return store.config_history()

    @app.post("/api/config/restaurar/{version}")
    def restore_config(version: int, u=Depends(admin)):
        config = store.config_version(version)
        if not config:
            raise HTTPException(404, "Versión no encontrada")
        antes = config_now()
        new = store.save_config(config, u["username"], f"Restaurada la versión {version}")
        return {"config": config.model_dump(mode="json"), "version": new, "arreglos": repair_after_absences(antes),
                "arreglos_pendientes": store.ajuste(ARREGLO_PENDIENTE) is not None}

    @app.post("/api/arreglos")
    def run_pending_repairs(u=Depends(admin)):
        """Arregla los horarios afectados por los cambios guardados con arreglos_aparte (si queda alguno pendiente)."""
        pendiente = store.ajuste(ARREGLO_PENDIENTE)
        if pendiente is None:
            return {"arreglos": []}
        antes = store.config_version(int(pendiente)) if int(pendiente) else None
        hechos = run_repairs(antes)
        store.set_ajuste(ARREGLO_PENDIENTE, None)
        return {"arreglos": hechos}

    # ------------------------------------------------------------------ horarios

    @app.get("/api/horarios")
    def list_schedules(u=Depends(admin)):
        config, filas = config_now(), store.list_schedules()
        ctx = contexto_alertas(config)
        return [summary(r, alert_report(r, config, filas, ctx)) for r in filas]

    @app.get("/api/calendario")
    def calendar(desde: dt.date, hasta: dt.date, u=Depends(admin)):
        """Todos los horarios juntos entre dos fechas (vistas de semana y mes del Calendario).

        Cada día sale del horario que manda en esa fecha: el publicado y, si no hay, el borrador más reciente.
        """
        if hasta < desde:
            raise HTTPException(400, "La fecha final es anterior a la inicial")
        if (hasta - desde).days > 62:
            raise HTTPException(400, "El calendario enseña como mucho dos meses a la vez")
        config = config_now()
        mejor = linea_tiempo.por_dia(store.list_schedules(), desde, hasta)
        dias, asignaciones = {}, []
        for d, r in mejor.items():
            h: Schedule = r["horario"]
            del_dia = [a for a in h.asignaciones if a.fecha == d]
            cob = coverage(config, Schedule(desde=d, hasta=d, asignaciones=del_dia))[d.isoformat()]
            dias[d.isoformat()] = {**cob, "horario_id": r["id"], "estado": r["estado"],
                                   "bloqueos": [b.empleado_id for b in h.bloqueos if b.fecha == d]}
            asignaciones += [{**a.model_dump(mode="json"), "horario_id": r["id"]} for a in del_dia]
        return {"desde": desde, "hasta": hasta, "dias": dias, "asignaciones": asignaciones}

    # ------------------------------------------------------------------ alertas del encargado
    @app.get("/api/alertas")
    def all_alerts(u=Depends(admin)):
        return global_alerts()

    @app.get("/api/notificaciones")
    def notifications(u=Depends(admin)):
        return store.notifications()

    @app.post("/api/notificaciones/leer")
    def read_notifications(body: ReadNotificationsIn, u=Depends(admin)):
        store.mark_notifications_read(u["username"], body.ids)
        return store.notifications()

    @app.get("/api/horarios/{sid}/alertas")
    def schedule_alerts(sid: int, u=Depends(admin)):
        return alert_report(load(sid))

    @app.post("/api/horarios/{sid}/alertas/reconocer")
    def acknowledge_alert(sid: int, body: AckIn, request: Request, u=Depends(admin)):
        row = load(sid)
        actual = next((a for a in alert_report(row)["activas"] if a["clave"] == body.clave), None)
        if not actual:
            raise HTTPException(404, "Esa alerta ya no existe o ya estaba reconocida")
        if actual["severidad"] == "critica":
            raise HTTPException(400, "Las alertas críticas no se pueden dar por vistas: arréglalas o, si lo resuelves "
                                     "fuera de la app, publica el horario confirmándolo.")
        store.acknowledge(sid, body.clave, actual["huella"], u["username"], (body.nota or "").strip() or None)
        return detail(load(sid), request)

    @app.delete("/api/horarios/{sid}/alertas/reconocer")
    def reopen_alert(sid: int, clave: str, request: Request, u=Depends(admin)):
        load(sid)
        store.unacknowledge(sid, clave)
        return detail(load(sid), request)

    @app.post("/api/horarios/generar")
    def create_schedule(body: GenerateIn, request: Request, u=Depends(admin)):
        if body.hasta < body.desde:
            raise HTTPException(400, "La fecha final es anterior a la inicial")
        if (body.hasta - body.desde).days > 62:
            raise HTTPException(400, "El periodo máximo es de 9 semanas")
        with calculando(f"generar:{body.desde}:{body.hasta}"):
            res = arreglos.generar(store, config_now(), body.desde, body.hasta, segundos=seconds)
            h = res.horario
            if not h.asignaciones:
                raise HTTPException(409, h.incidencias[0].mensaje if h.incidencias else "No se pudo generar")
            sid = store.create_schedule(h, u["username"])
        arreglos.notificar_generacion(store, sid, res)
        return {**detail(store.get_schedule(sid), request), "generacion": arreglos.informe(res)}

    @app.get("/api/horarios/{sid}")
    def get_schedule(sid: int, request: Request, u=Depends(admin)):
        return detail(load(sid), request)

    @app.post("/api/horarios/{sid}/regenerar")
    def regenerate(sid: int, request: Request, body: RegenIn | None = None, u=Depends(admin)):
        row = load(sid)
        old: Schedule = row["horario"]
        config = config_now()
        desde = body.desde if body else None
        if desde is not None and not old.desde <= desde <= old.hasta:
            raise HTTPException(400, "La fecha desde la que regenerar está fuera del periodo del horario")
        congelados = congelar_antes(config, old, desde) if desde and desde > old.desde else []
        with calculando(f"regenerar:{sid}"):
            res = arreglos.generar(store, config, old.desde, old.hasta, segundos=seconds, excluir=sid,
                                   bloqueos=old.bloqueos, congelados=congelados, cambiable_desde=desde)
        h = res.horario
        if not h.asignaciones:
            raise HTTPException(409, h.incidencias[0].mensaje if h.incidencias else "No se pudo generar")
        h.estado = row["estado"]
        cambios = None
        if row["estado"] == "publicado":
            cambios = set(row["cambios_pendientes"]) | diff_employees(old, h)
        store.update_schedule(sid, h, sorted(cambios) if cambios is not None else None)
        if row["estado"] == "publicado":
            avisos.registrar_cambios(store, sid, old, h)
        arreglos.notificar_generacion(store, sid, res, regenerado=True)
        return {**detail(load(sid), request), "generacion": arreglos.informe(res)}

    # ------------------------------------------------------------------ solucionador de alertas
    def first_changeable_day(row: dict) -> dt.date:
        return arreglos.primer_dia_cambiable(row["estado"], row["horario"], dt.date.today())

    @app.post("/api/horarios/{sid}/solucionar")
    def propose_fix(sid: int, body: FixIn | None = None, u=Depends(admin)):
        row = load(sid)
        h: Schedule = row["horario"]
        minimo = first_changeable_day(row)
        desde = max(body.desde, minimo) if body and body.desde else minimo
        propuesta = solucionar(config_now(), h, store.assignments_around(h.desde, h.hasta, exclude=sid), desde,
                               SolveOptions(max_segundos=seconds))
        return {**propuesta.model_dump(mode="json"), "estado": row["estado"]}

    @app.post("/api/horarios/{sid}/solucionar/aplicar")
    def apply_fix(sid: int, body: ApplyFixIn, request: Request, u=Depends(admin)):
        row = load(sid)
        config = config_now()
        old: Schedule = row["horario"]
        minimo = first_changeable_day(row)
        if any(c.fecha < minimo and not config.is_absent(c.empleado_id, c.fecha) for c in body.cambios):
            raise HTTPException(409, "La propuesta cambia días que ya no se pueden tocar; vuelve a calcularla")
        try:
            h = aplicar(old, body.cambios)
        except HorarioCambiado as exc:
            raise HTTPException(409, f"{exc}; vuelve a calcularla") from None
        previo = store.assignments_around(h.desde, h.hasta, exclude=sid)
        errores = lambda x: sum(1 for i in validate(config, x.desde, x.hasta, x.asignaciones, previo=previo,  # noqa: E731
                                                     saldo_horas=x.saldo_anterior, bloqueos=x.bloqueos) if i.nivel == "error")
        if errores(h) > errores(old):
            raise HTTPException(409, "Con la configuración actual la propuesta incumpliría reglas; vuelve a calcularla")
        refresh(config, h, sid)
        cambios = None
        if row["estado"] == "publicado":
            cambios = sorted(set(row["cambios_pendientes"]) | diff_employees(old, h))
        store.update_schedule(sid, h, cambios)
        if row["estado"] == "publicado":
            avisos.registrar_cambios(store, sid, old, h)
        return detail(load(sid), request)

    @app.post("/api/horarios/{sid}/revalidar")
    def revalidate(sid: int, request: Request, u=Depends(admin)):
        row = load(sid)
        store.update_schedule(sid, refresh(config_now(), row["horario"], sid))
        return detail(load(sid), request)


    @app.patch("/api/horarios/{sid}/celda")
    def edit_cell(sid: int, body: CellIn, request: Request, u=Depends(admin)):
        row = load(sid)
        config = config_now()
        h: Schedule = row["horario"]
        if not h.desde <= body.fecha <= h.hasta:
            raise HTTPException(400, "La fecha está fuera del periodo")
        if body.empleado_id not in {e.id for e in config.empleados}:
            raise HTTPException(400, "Empleado desconocido")
        if body.turno_id and body.turno_id not in {s.id for s in config.turnos}:
            raise HTTPException(400, "Turno desconocido")
        emp = config.employee(body.empleado_id)
        if body.puesto and body.puesto not in emp.puestos:
            raise HTTPException(400, f"{emp.nombre} no trabaja en {body.puesto.value}")
        antes = h.model_copy(deep=True)
        previa = next((a for a in h.asignaciones if a.empleado_id == body.empleado_id and a.fecha == body.fecha), None)
        h.asignaciones = [a for a in h.asignaciones if not (a.empleado_id == body.empleado_id and a.fecha == body.fecha)]
        nueva = None
        if body.turno_id:
            puesto = body.puesto or (previa.puesto if previa and previa.puesto in emp.puestos else emp.puesto_principal)
            mismas = body.conservar_horas and previa is not None and previa.turno_id == body.turno_id
            try:
                funcion = rol_manual(config, emp, body.fecha, puesto, body.funcion, previa)
            except EdicionInvalida as exc:
                raise HTTPException(400, str(exc)) from None
            nueva = Assignment(empleado_id=body.empleado_id, fecha=body.fecha, turno_id=body.turno_id, puesto=puesto,
                               funcion=funcion, inicio=previa.inicio if mismas else None, fin=previa.fin if mismas else None)
            h.asignaciones.append(nueva)
            h.asignaciones.sort(key=lambda a: (a.fecha, a.empleado_id))
        h.bloqueos = [b for b in h.bloqueos if not (b.empleado_id == body.empleado_id and b.fecha == body.fecha)]
        if body.bloquear:
            h.bloqueos.append(Lock.de(nueva, body.empleado_id, body.fecha))
        refresh(config, h, sid)
        cambios = row["cambios_pendientes"] + [body.empleado_id] if row["estado"] == "publicado" else None
        store.update_schedule(sid, h, cambios)
        if row["estado"] == "publicado":
            avisos.registrar_cambios(store, sid, antes, h)
        return detail(load(sid), request)

    # ------------------------------------------------------------------ vista diaria: edición manual de un día
    def day_edit(row: dict, body: DayEditIn, config: Config) -> Schedule:
        if body.base is not None and body.base != version_of(row):
            raise HTTPException(409, "El horario ha cambiado mientras lo editabas (otra persona o la app lo ha "
                                     "modificado). Recarga el día y repite tus cambios.")
        try:
            return aplicar_dia(config, row["horario"], body.fecha, body.tramos)
        except EdicionInvalida as exc:
            raise HTTPException(400, str(exc)) from None

    def editable(row: dict) -> None:
        if row["estado"] == "publicado" and store.replacement_of(row["id"]):
            raise HTTPException(409, "Este horario ya tiene un arreglo pendiente de publicar: haz los cambios en él.")

    @app.post("/api/horarios/{sid}/dia/evaluar")
    def evaluate_day(sid: int, body: DayEditIn, u=Depends(admin)):
        """Cómo quedaría el horario con los cambios del día, sin guardar nada."""
        row = load(sid)
        editable(row)
        config = config_now()
        nuevo = day_edit(row, body, config)
        previo = store.assignments_around(nuevo.desde, nuevo.hasta, exclude=sid)
        ev = evaluar_edicion(config, row["horario"], nuevo, body.fecha, previo)
        return {**ev.model_dump(mode="json"), "estado": row["estado"],
                "destino": "arreglo" if row["estado"] == "publicado" else "borrador"}

    @app.post("/api/horarios/{sid}/dia/aplicar")
    def apply_day(sid: int, body: DayEditIn, request: Request, u=Depends(admin)):
        """Guarda los cambios del día. En un horario publicado no cambia lo que ve el equipo: se guardan en un
        arreglo (borrador que lo sustituye al publicarlo)."""
        row = load(sid)
        editable(row)
        config = config_now()
        old: Schedule = row["horario"]
        nuevo = refresh(config, day_edit(row, body, config), sid)
        if not diferencias(old.asignaciones, nuevo.asignaciones) and nuevo.bloqueos == old.bloqueos:
            return {**detail(row, request), "guardado_en": sid}
        if row["estado"] == "publicado":
            nuevo.estado = "borrador"
            destino = store.create_schedule(nuevo, u["username"], reemplaza=sid)
            store.log_action(destino, u["username"], "edicion_dia", {"fecha": body.fecha.isoformat(), "horario": sid})
        else:
            store.update_schedule(sid, nuevo)
            destino = sid
        return {**detail(load(destino), request), "guardado_en": destino}

    @app.delete("/api/horarios/{sid}/bloqueos")
    def clear_locks(sid: int, request: Request, u=Depends(admin)):
        row = load(sid)
        h = row["horario"]
        h.bloqueos = []
        store.update_schedule(sid, refresh(config_now(), h, sid))
        return detail(load(sid), request)

    @app.post("/api/horarios/{sid}/publicar")
    def publish(sid: int, request: Request, body: PublishIn | None = None, u=Depends(admin)):
        row = load(sid)
        config = config_now()
        h = refresh(config, row["horario"], sid)
        if any(i.nivel == "error" for i in h.incidencias):
            raise HTTPException(409, "El horario tiene errores (reglas incumplidas). Corrígelos antes de publicar.")
        criticas = criticas_de(row, config)
        if criticas and not (body and body.confirmar_criticas):
            n = len(criticas)
            return JSONResponse(status_code=409, content={
                "detail": f"El horario tiene {n} alerta{'s' if n > 1 else ''} crítica{'s' if n > 1 else ''}: tal cual no vale. "
                          "Si lo vas a resolver fuera de la app, confirma que quieres publicarlo así.",
                "codigo": "criticas", "criticas": criticas})
        destino = store.get_schedule(row["reemplaza"]) if row.get("reemplaza") else None
        if destino and destino["estado"] == "publicado":
            return publish_replacement(row, destino, h, criticas, request, u)
        primera = row["estado"] != "publicado"
        h.estado = "publicado"
        token = store.publish_schedule(sid, h)
        if primera:
            avisos.registrar_publicacion(store, sid, h)
        if criticas:
            store.log_action(sid, u["username"], "publicado_con_criticas", {"criticas": [a["detalle"] for a in criticas]})
        res = slack.publish(config, h, slack_url(request, token), calendario=slack_cal(request))
        store.log_send(sid, "publicacion", res.ok, res.as_dict())
        return {**detail(load(sid), request), "slack": res.as_dict()}

    def publish_replacement(row: dict, destino: dict, h: Schedule, criticas: list[dict], request: Request, u: dict) -> dict:
        """Publica un arreglo pendiente: sus turnos pasan al horario publicado y el borrador desaparece.

        Como cualquier cambio de un horario publicado, quien cambia lo ve en su portal y queda pendiente
        de avisar por Slack (lo decide el encargado).
        """
        did, old = destino["id"], destino["horario"]
        h.estado = "publicado"
        store.update_schedule(did, h, sorted(set(destino["cambios_pendientes"]) | diff_employees(old, h)))
        avisos.registrar_cambios(store, did, old, h)
        store.delete_schedule(row["id"])
        store.log_action(did, u["username"], "arreglo_publicado", {"borrador": row["id"]})
        if criticas:
            store.log_action(did, u["username"], "publicado_con_criticas", {"criticas": [a["detalle"] for a in criticas]})
        return {**detail(load(did), request), "slack": None, "reemplazado": did}

    @app.post("/api/horarios/{sid}/notificar")
    def notify_changes(sid: int, request: Request, u=Depends(admin)):
        row = load(sid)
        if row["estado"] != "publicado":
            raise HTTPException(409, "Solo se notifican cambios de horarios publicados")
        config = config_now()
        h = refresh(config, row["horario"], sid)
        if any(i.nivel == "error" for i in h.incidencias):
            raise HTTPException(409, "El horario tiene errores. Corrígelos antes de avisar al equipo.")
        store.update_schedule(sid, h)
        res = slack.publish(config, h, slack_url(request, row["token"]), solo=row["cambios_pendientes"], cambio=True,
                            calendario=slack_cal(request))
        store.log_send(sid, "cambios", res.ok, res.as_dict())
        if res.ok:
            store.clear_changes(sid)
        return {**detail(load(sid), request), "slack": res.as_dict()}

    @app.post("/api/horarios/{sid}/despublicar")
    def unpublish(sid: int, request: Request, u=Depends(admin)):
        row = load(sid)
        h = row["horario"]
        if row["estado"] == "publicado":
            avisos.registrar_retirada(store, sid, h)
        h.estado = "borrador"
        store.update_schedule(sid, h, [])
        return detail(load(sid), request)

    @app.get("/api/horarios/{sid}/envios")
    def sends(sid: int, u=Depends(admin)):
        load(sid)
        return store.sends(sid)

    @app.delete("/api/horarios/{sid}")
    def delete_schedule(sid: int, u=Depends(admin)):
        row = load(sid)
        if row["estado"] == "publicado":
            avisos.registrar_retirada(store, sid, row["horario"])
        store.delete_schedule(sid)
        return {"ok": True}

    @app.get("/api/horarios/{sid}/html", response_class=HTMLResponse)
    def schedule_html(sid: int, u=Depends(admin)):
        return render_html(config_now(), load(sid)["horario"])

    @app.get("/api/horarios/{sid}/pdf")
    def schedule_pdf(sid: int, u=Depends(admin)):
        row = load(sid)
        try:
            data = html_to_pdf_bytes(render_html(config_now(), row["horario"], fuentes="inline"))
        except Exception:
            raise HTTPException(501, "La exportación a PDF no está disponible en este servidor; usa Imprimir → Guardar como PDF.")
        name = f"horario_{row['horario'].desde}_{row['horario'].hasta}.pdf"
        return Response(data, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{name}"'})

    @app.get("/api/horarios/{sid}/csv")
    def schedule_csv(sid: int, u=Depends(admin)):
        row = load(sid)
        name = f"horas_{row['horario'].desde}_{row['horario'].hasta}.csv"
        return Response(hours_csv(config_now(), row["horario"]), media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="{name}"'})

    # ------------------------------------------------------------------ usuarios y Slack

    @app.get("/api/usuarios")
    def list_users(u=Depends(admin)):
        return store.users()

    @app.post("/api/usuarios")
    def save_user(body: UserIn, u=Depends(admin)):
        if len(body.password) < 8:
            raise HTTPException(400, "La contraseña debe tener al menos 8 caracteres")
        username = body.usuario.strip()
        if not username:
            raise HTTPException(400, "Falta el usuario")
        existing = store.get_user(username)
        emp_id = None
        if body.rol == "empleado":
            if body.empleado_id not in {e.id for e in config_now().empleados}:
                raise HTTPException(400, "Elige a qué persona del equipo corresponde esta cuenta")
            clash = next((x for x in store.users() if x["empleado_id"] == body.empleado_id and x["username"] != username), None)
            if clash:
                raise HTTPException(400, f"Esa persona ya tiene cuenta ({clash['username']})")
            emp_id = body.empleado_id
        if existing and existing["rol"] == "admin" and body.rol != "admin" and \
                sum(1 for x in store.users() if x["rol"] == "admin") <= 1:
            raise HTTPException(400, "Debe quedar al menos un encargado")
        store.upsert_user(username, body.password, body.nombre, rol=body.rol, empleado_id=emp_id,
                          cambiar_clave=body.rol == "empleado")
        return store.users()

    @app.delete("/api/usuarios/{username}")
    def remove_user(username: str, u=Depends(admin)):
        if username == u["username"]:
            raise HTTPException(400, "No puedes borrar tu propio usuario")
        store.delete_user(username)
        return store.users()

    @app.get("/api/slack")
    def slack_status(u=Depends(admin)):
        return slack.status()

    # ------------------------------------------------------------------ calendario de cada persona (.ics)
    def cal_links(request: Request, emp_id: str, crear: bool, renovar: bool = False) -> dict | None:
        if not cal_disponible:
            return None
        token = store.calendar_token(emp_id, crear=crear, renovar=renovar)
        if not token:
            return None
        base = cal_base_env or f"{base_url(request)}/cal"
        return calendario.enlaces(f"{base}/{token}.ics")

    def cal_view(request: Request, emp_id: str, crear: bool = False, renovar: bool = False) -> dict:
        return {"disponible": cal_disponible, "enlaces": cal_links(request, emp_id, crear, renovar)}

    @app.get("/api/mi/calendario")
    def my_calendar(request: Request, u=Depends(worker)):
        return cal_view(request, u["empleado_id"])

    @app.post("/api/mi/calendario")
    def my_calendar_create(request: Request, body: CalIn | None = None, u=Depends(worker)):
        if not cal_disponible:
            raise HTTPException(409, "En esta versión de la app no se pueden publicar calendarios")
        return cal_view(request, u["empleado_id"], crear=True, renovar=bool(body and body.renovar))

    @app.get("/api/calendarios")
    def team_calendars(request: Request, u=Depends(admin)):
        return {"disponible": cal_disponible, "personas": [
            {"empleado_id": e.id, "nombre": e.nombre, "enlaces": cal_links(request, e.id, crear=False)}
            for e in config_now().active_employees()]}

    @app.post("/api/calendarios/{emp_id}")
    def team_calendar_create(emp_id: str, request: Request, body: CalIn | None = None, u=Depends(admin)):
        if not cal_disponible:
            raise HTTPException(409, "En esta versión de la app no se pueden publicar calendarios")
        if not any(e.id == emp_id for e in config_now().empleados):
            raise HTTPException(404, "Esa persona no está en el equipo")
        return cal_view(request, emp_id, crear=True, renovar=bool(body and body.renovar))

    def calendarios_publicados() -> dict[str, str]:
        """token → contenido .ics de cada calendario creado (la app sin servidor se los sube al Worker)."""
        config, rows = config_now(), store.list_schedules()
        ids = {e.id for e in config.empleados}
        return {token: calendario.ics(config, rows, emp_id, url=public_url or None)
                for emp_id, token in store.calendar_tokens().items() if emp_id in ids}

    app.state.calendarios = calendarios_publicados

    def slack_url(request: Request, token: str) -> str | None:
        # Sin servidor, /ver/<enlace> solo se abre dentro de la propia app: no se manda un enlace que fuera no va.
        return None if sys.platform == "emscripten" else view_url(request, token)

    def slack_cal(request: Request):
        """Para los mensajes de Slack: crea (si hace falta) el enlace del calendario de cada persona."""
        return (lambda emp_id: cal_links(request, emp_id, crear=True)) if cal_disponible else None

    # ------------------------------------------------------------------ portal del trabajador
    def req_out(r: dict, config: Config) -> dict:
        emp = next((e for e in config.empleados if e.id == r["empleado_id"]), None)
        return {**r, "nombre": emp.nombre if emp else r["empleado_id"]}

    def save_cfg(config: Config, u: dict, nota: str) -> int:
        try:
            config = Config.model_validate(config.model_dump(mode="json"))
        except ValidationError as exc:
            raise HTTPException(422, _validation_message(exc))
        return store.save_config(config, u["username"], nota)

    def check_correction(config: Config, emp_id: str, datos: dict, nueva: bool) -> dict:
        try:
            datos = horas.validate_correction(config, datos)
        except ValueError as exc:
            raise HTTPException(400, str(exc))
        f = dt.date.fromisoformat(datos["fecha"])
        today = dt.date.today()
        if nueva and f > today:
            raise HTTPException(400, "Solo puedes corregir días que ya han pasado o el de hoy")
        if nueva and (today - f).days > 62:
            raise HTTPException(400, "Han pasado más de dos meses; habla con tu encargado")
        h = horas.best_schedules(store.list_schedules()).get(f)
        if h is None:
            raise HTTPException(400, "Ese día no está en ningún horario publicado")
        turno, _ = horas.planned_minutes(config, h, emp_id, f)
        if datos["clase"] == "extra" and turno:
            raise HTTPException(400, "Ese día tenías turno asignado; usa «Turno distinto» u «Horas distintas»")
        if datos["clase"] != "extra" and not turno:
            raise HTTPException(400, "Ese día no tenías turno asignado; usa «Día extra»")
        if datos["clase"] == "turno" and datos.get("turno_id") == turno:
            raise HTTPException(400, "Es el mismo turno que tenías asignado")
        datos["turno_previsto"] = turno
        return datos

    def worker_notices(u: dict) -> list[dict]:
        return avisos.vista(config_now(), store.notices(empleado_id=u["empleado_id"]), dt.date.today())

    def my_view(u: dict, request: Request) -> dict:
        config = config_now()
        emp = config.employee(u["empleado_id"])
        rows = store.list_schedules()
        cover = horas.best_schedules(rows)
        today = dt.date.today()
        proximos = []
        for d in sorted(cover):
            if d < today - dt.timedelta(days=7) or d > today + dt.timedelta(days=62):
                continue
            a = next((x for x in cover[d].asignaciones if x.empleado_id == emp.id and x.fecha == d), None)
            if a:
                sh = config.turno_de(a)
                proximos.append({"fecha": d.isoformat(), "turno_id": sh.id, "turno": sh.nombre, "inicio": sh.inicio, "fin": sh.fin,
                                 "puesto": config.puesto_de(a).value,
                                 "rol": rol.nombre if (rol := config.rol_de(a)) else None})
        pubs = [{"id": r["id"], "desde": r["horario"].desde, "hasta": r["horario"].hasta,
                 "url": view_url(request, r["token"]) + f"?e={emp.id}"} for r in rows
                if r["estado"] == "publicado" and not linea_tiempo.sustituido(r)]
        return {
            "empleado": {"id": emp.id, "nombre": emp.nombre, "horas_semanales": emp.horas_semanales,
                         "libranzas_fijas": emp.libranzas_fijas},
            "turnos": [{"id": s.id, "nombre": s.nombre, "inicio": s.inicio, "fin": s.fin} for s in config.turnos],
            "preferencias": [p.model_dump(mode="json") for p in config.preferencias if p.empleado_id == emp.id],
            "ausencias": [a.model_dump(mode="json") for a in config.ausencias if a.empleado_id == emp.id],
            "proximos": proximos, "horarios": pubs, "avisos": worker_notices(u),
            "solicitudes": [req_out(r, config) for r in store.list_requests(empleado_id=emp.id)],
        }

    @app.get("/api/mi/perfil")
    def my_profile(request: Request, u=Depends(worker)):
        return my_view(u, request)

    @app.post("/api/mi/avisos/leer")
    def read_notices(body: ReadIn, request: Request, u=Depends(worker)):
        store.mark_notices_read(u["empleado_id"], body.ids)
        return my_view(u, request)

    @app.put("/api/mi/preferencias")
    def my_preferences(body: PrefsIn, request: Request, u=Depends(worker)):
        if len(body.preferencias) > 10:
            raise HTTPException(400, "Demasiadas preferencias (máximo 10)")
        config = config_now().model_copy(deep=True)
        new = []
        for p in body.preferencias:
            if not p.turnos:
                raise HTTPException(400, "Cada preferencia necesita al menos un turno")
            if not 1 <= p.peso <= 10:
                raise HTTPException(400, "La importancia va de 1 a 10")
            new.append(Preference(empleado_id=u["empleado_id"], tipo=p.tipo, turnos=p.turnos, dias=p.dias or None, peso=p.peso))
        config.preferencias = [p for p in config.preferencias if p.empleado_id != u["empleado_id"]] + new
        save_cfg(config, u, f"Preferencias de {u['nombre']}")
        return my_view(u, request)

    @app.post("/api/mi/ausencias")
    def request_absence(body: AbsenceReqIn, request: Request, u=Depends(worker)):
        config = config_now()
        if body.hasta < body.desde:
            raise HTTPException(400, "La fecha final es anterior a la inicial")
        if body.desde < dt.date.today():
            raise HTTPException(400, "Solo puedes pedir fechas futuras; para días pasados habla con tu encargado")
        if (body.hasta - body.desde).days > 62:
            raise HTTPException(400, "El periodo máximo es de 9 semanas")
        emp = u["empleado_id"]
        for a in config.ausencias:
            if a.empleado_id == emp and a.desde <= body.hasta and body.desde <= a.hasta:
                raise HTTPException(400, f"Ya tienes una ausencia aprobada que coincide ({a.desde} – {a.hasta})")
        for r in store.list_requests(empleado_id=emp, tipo="ausencia", estado="pendiente"):
            d = r["datos"]
            if d["desde"] <= body.hasta.isoformat() and body.desde.isoformat() <= d["hasta"]:
                raise HTTPException(400, "Ya tienes una solicitud pendiente que coincide con esas fechas")
        store.create_request("ausencia", emp, {"desde": body.desde.isoformat(), "hasta": body.hasta.isoformat(),
                                               "motivo": body.motivo}, (body.nota or "").strip() or None, u["username"])
        return my_view(u, request)

    @app.post("/api/mi/correcciones")
    def request_correction(body: CorrectionIn, request: Request, u=Depends(worker)):
        if not body.motivo.strip():
            raise HTTPException(400, "Cuenta brevemente qué pasó")
        config = config_now()
        emp = u["empleado_id"]
        datos = check_correction(config, emp, body.model_dump(mode="json", exclude={"motivo"}), nueva=True)
        for r in store.list_requests(empleado_id=emp, tipo="correccion", estado="pendiente"):
            if r["datos"]["fecha"] == datos["fecha"]:
                raise HTTPException(400, "Ya tienes una corrección pendiente para ese día")
        store.create_request("correccion", emp, datos, body.motivo.strip(), u["username"])
        return my_view(u, request)

    @app.delete("/api/mi/solicitudes/{rid}")
    def cancel_request(rid: int, request: Request, u=Depends(worker)):
        r = store.get_request(rid)
        if not r or r["empleado_id"] != u["empleado_id"]:
            raise HTTPException(404, "Solicitud no encontrada")
        if r["estado"] != "pendiente":
            raise HTTPException(409, "Solo se pueden retirar las solicitudes pendientes")
        store.cancel_request(rid)
        return my_view(u, request)

    def period_args(desde: Optional[dt.date], hasta: Optional[dt.date]) -> tuple[dt.date, dt.date]:
        today = dt.date.today()
        desde = desde or today.replace(day=1)
        hasta = hasta or ((desde.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1))
        if hasta < desde:
            raise HTTPException(400, "La fecha final es anterior a la inicial")
        if (hasta - desde).days > 400:
            raise HTTPException(400, "El periodo máximo es de un año")
        return desde, hasta

    @app.get("/api/mi/horas")
    def my_hours(desde: Optional[dt.date] = None, hasta: Optional[dt.date] = None, u=Depends(worker)):
        desde, hasta = period_args(desde, hasta)
        return horas.employee_report(config_now(), store.list_schedules(), store.list_requests(tipo="correccion"),
                                     u["empleado_id"], desde, hasta)

    # ------------------------------------------------------------------ solicitudes e informes (encargados)
    @app.get("/api/solicitudes")
    def list_requests(estado: Optional[str] = None, tipo: Optional[str] = None, u=Depends(admin)):
        config = config_now()
        return [req_out(r, config) for r in store.list_requests(estado=estado, tipo=tipo)]

    @app.post("/api/solicitudes/{rid}/resolver")
    def resolve_request(rid: int, body: ResolveIn, u=Depends(admin)):
        r = store.get_request(rid)
        if not r:
            raise HTTPException(404, "Solicitud no encontrada")
        if r["estado"] != "pendiente":
            raise HTTPException(409, "Esta solicitud ya está resuelta")
        config = config_now()
        resp = (body.respuesta or "").strip() or None
        impacto = None
        if body.accion == "aprobar":
            if r["tipo"] == "ausencia":
                d = r["datos"]
                cfg = config.model_copy(deep=True)
                cfg.ausencias.append(Absence(empleado_id=r["empleado_id"], desde=d["desde"], hasta=d["hasta"], motivo=d["motivo"]))
                version = save_cfg(cfg, u, f"Ausencia aprobada: {config.employee(r['empleado_id']).nombre}")
                afectados = [s["id"] for s in store.list_schedules()
                             if s["horario"].desde <= dt.date.fromisoformat(d["hasta"]) and dt.date.fromisoformat(d["desde"]) <= s["horario"].hasta]
                impacto = {"version": version, "horarios_afectados": afectados}
            else:
                datos = check_correction(config, r["empleado_id"], dict(r["datos"]), nueva=False)
                datos["minutos"] = horas.correction_minutes(config, datos)
                with store.conn() as c:
                    c.execute("UPDATE solicitudes SET datos=? WHERE id=?", (json.dumps(datos), rid))
                _, pm = horas.planned_minutes(config, horas.best_schedules(store.list_schedules())[dt.date.fromisoformat(datos["fecha"])],
                                              r["empleado_id"], dt.date.fromisoformat(datos["fecha"]))
                impacto = {"diferencia_horas": round((datos["minutos"] - pm) / 60, 2)}
        store.resolve_request(rid, "aprobada" if body.accion == "aprobar" else "rechazada", u["username"], resp)
        if impacto and "horarios_afectados" in impacto:
            impacto["arreglos"] = repair_after_absences(config)
            impacto["arreglos_pendientes"] = store.ajuste(ARREGLO_PENDIENTE) is not None
        return {"solicitud": req_out(store.get_request(rid), config_now()), "impacto": impacto,
                "pendientes": len(store.list_requests(estado="pendiente"))}

    def informe(desde: dt.date, hasta: dt.date, borradores: bool) -> list[dict]:
        config = config_now()
        rows, reqs = store.list_schedules(), store.list_requests(tipo="correccion")
        return [horas.employee_report(config, rows, reqs, e.id, desde, hasta, solo_publicados=not borradores)
                for e in config.empleados if e.activo]

    @app.get("/api/informes/horas")
    def hours_report(desde: Optional[dt.date] = None, hasta: Optional[dt.date] = None, borradores: bool = False,
                     u=Depends(admin)):
        desde, hasta = period_args(desde, hasta)
        return {"desde": desde, "hasta": hasta, "borradores": borradores, "empleados": informe(desde, hasta, borradores)}

    @app.get("/api/informes/horas.csv")
    def hours_report_csv(desde: Optional[dt.date] = None, hasta: Optional[dt.date] = None, borradores: bool = False,
                         u=Depends(admin)):
        desde, hasta = period_args(desde, hasta)
        f = lambda x: f"{x:.2f}".replace(".", ",")  # noqa: E731
        lines = ["Persona;Mes;Horas previstas;Horas ajustadas;Objetivo de contrato;Horas extra;Horas de menos;"
                 "Días trabajados;Fines de semana;Festivos;Aperturas;Cierres;Diferencia por correcciones;"
                 "Correcciones pendientes"]
        for r in informe(desde, hasta, borradores):
            filas = r["meses"] + ([{**r, "mes": "Total"}] if len(r["meses"]) > 1 else [])
            for m in filas:
                lines.append(";".join([r["nombre"], m["mes"], f(m["previstas"]), f(m["ajustadas"]), f(m["objetivo"]),
                                       f(m["extra"]), f(m["de_menos"]), str(m.get("dias", m.get("dias_trabajados"))),
                                       str(m["fines_de_semana"]), str(m["festivos"]), str(m["aperturas"]),
                                       str(m["cierres"]), f(m["diferencia"]), str(r["pendientes"])]))
        return Response("\ufeff" + "\n".join(lines) + "\n", media_type="text/csv; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="informe_horas_{desde}_{hasta}.csv"'})

    # ------------------------------------------------------------------ web pública: formularios y carta
    web_publica.registrar(app, store, admin)
    comentarios.registrar(app, store, user, admin)
    cuentas.registrar(app, store, user, admin, intentos, config_now)

    # ------------------------------------------------------------------ vista de solo lectura (empleados)
    # Por defecto solo la ve quien ha entrado en la app: los enlaces que llegan por Slack o se copian muestran nombres
    # y turnos del personal. LOPITA_VISTA_PUBLICA=1 la abre a cualquiera que tenga el enlace, como al principio.
    vista_publica = os.environ.get("LOPITA_VISTA_PUBLICA", "0") == "1"

    @app.get("/ver/{token}", response_class=HTMLResponse)
    def public_view(token: str, request: Request, e: Optional[str] = None):
        s = request.session.get("user")
        if not vista_publica and not (s and store.get_user(s["username"])):
            return HTMLResponse('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">'
                                '<meta name="robots" content="noindex"><title>Horario</title>'
                                '<h1>Entra para ver el horario</h1><p>Este horario solo lo puede ver el equipo. '
                                '<a href="/">Inicia sesión</a> y vuelve a abrir el enlace.</p>', 401)
        row = store.get_schedule_by_token(token)
        if not row:
            return HTMLResponse("<h1>Horario no disponible</h1><p>Puede que se haya retirado o que el enlace no sea correcto.</p>", 404)
        # Un enlace viejo enseña lo que vale hoy en sus fechas (la línea de tiempo), no los turnos que otro publicado
        # posterior ya ha sustituido.
        return render_html(config_now(), linea_tiempo.vigente(store.list_schedules(), row["horario"]), publico=True, resaltar=e)

    # El enlace es secreto (como el de «dirección secreta» de Google Calendar): Google y Apple lo leen sin sesión.
    @app.get("/cal/{nombre}", include_in_schema=False)
    def calendar_feed(nombre: str):
        token = nombre.removesuffix(".ics")
        emp_id = store.calendar_owner(token) if token != nombre else None
        config = config_now()
        if not emp_id or not any(e.id == emp_id for e in config.empleados):
            return Response("Calendario no encontrado", 404, media_type="text/plain; charset=utf-8")
        return Response(calendario.ics(config, store.list_schedules(), emp_id, url=public_url or None),
                        media_type="text/calendar; charset=utf-8",
                        headers={"Cache-Control": "no-cache", "X-Robots-Tag": "noindex",
                                 "Content-Disposition": 'inline; filename="turnos.ics"'})

    # ------------------------------------------------------------------ frontend
    @app.get("/healthz")
    def health():
        store.comprobar()  # si la base de datos no responde, da 500 y el contenedor se marca como enfermo
        return {"ok": True}

    app.mount("/static", _StaticSinCache(directory=ROOT / "static"), name="static")
    app.mount("/fonts", StaticFiles(directory=FONT_DIR), name="fonts")

    recarga = os.environ.get("LOPITA_RECARGA", "0") == "1"
    arranque = secrets.token_hex(4)

    if recarga:
        @app.get("/dev/recarga", include_in_schema=False)
        def dev_recarga():
            # Cambia al reiniciar el servidor (uvicorn --reload) o al tocar un archivo de la interfaz.
            ultimo = max(f.stat().st_mtime_ns for f in (ROOT / "static").rglob("*") if f.is_file())
            return JSONResponse({"version": f"{arranque}-{ultimo}"}, headers={"Cache-Control": "no-store"})

    # La interfaz se sirve bajo /i/<huella>/…: el service worker (sw.js) la guarda en el móvil y la sirve sin ir a la
    # red, y cuando un archivo cambia cambia la huella y con ella la URL, así que nunca se queda una versión vieja. Como
    # la huella va en la ruta y no en ?v=, un `import './js/…'` relativo hereda la versión sin tocar el código.
    STATIC = (ROOT / "static").resolve()
    SOLO_SERVIDOR = {"index.html", "sw.js", "recarga.js"}  # la página, el service worker y la recarga de desarrollo

    def archivos_interfaz() -> list[str]:
        """Rutas relativas de todo lo que pide la interfaz: se recorre static/, no hay lista escrita a mano."""
        return sorted(p.relative_to(STATIC).as_posix() for p in STATIC.rglob("*")
                      if p.is_file() and p.name not in SOLO_SERVIDOR and "__pycache__" not in p.parts)

    def huella_interfaz() -> str:
        h = hashlib.blake2b(digest_size=6)
        for base in (STATIC, FONT_DIR):
            for f in sorted(p for p in base.rglob("*") if p.is_file()):
                h.update(f.relative_to(base).as_posix().encode() + f.read_bytes())
        return h.hexdigest()

    version_interfaz = huella_interfaz()

    def version_actual() -> str:
        return huella_interfaz() if recarga else version_interfaz

    @app.get("/i/{version}/{ruta:path}", include_in_schema=False)
    def interfaz(version: str, ruta: str):
        archivo = (STATIC / ruta).resolve()
        if not archivo.is_relative_to(STATIC) or not archivo.is_file() or archivo.name in SOLO_SERVIDOR:
            return Response("No encontrado", 404, media_type="text/plain; charset=utf-8")
        # Con la huella vigente, el archivo no cambiará nunca en esa URL; con otra (una pestaña vieja), se sirve el
        # actual pero sin dejar que se guarde.
        cache = "public, max-age=31536000, immutable" if version == version_actual() else "no-cache"
        return FileResponse(archivo, headers={"Cache-Control": cache})

    @app.get("/", include_in_schema=False)
    def index():
        html, v = (ROOT / "static" / "index.html").read_text(encoding="utf-8"), version_actual()
        for nombre in ("app.js", "styles.css"):
            html = html.replace(f'"/static/{nombre}"', f'"/i/{v}/{nombre}"')
        html = html.replace('"/fonts/fonts.css"', f'"/fonts/fonts.css?v={v}"')
        if recarga:  # en desarrollo no se registra el service worker: la página se recarga sola con cada cambio
            html = html.replace("navigator.serviceWorker.register('/sw.js')", "false")
            html = html.replace("</body>", '  <script src="/static/recarga.js"></script>\n</body>')
        return HTMLResponse(html, headers={"Cache-Control": "no-cache"})

    @app.get("/sw.js", include_in_schema=False)
    def service_worker():
        v = version_actual()
        fuentes = sorted(f"/fonts/{f.name}" for f in FONT_DIR.glob("*.woff2"))
        archivos = ["/", *(f"/i/{v}/{a}" for a in archivos_interfaz()), f"/fonts/fonts.css?v={v}",
                    "/static/manifest.webmanifest", "/static/favicon.svg", "/static/icono-192.png",
                    "/static/icono-512.png", *fuentes]
        js = (ROOT / "static" / "sw.js").read_text(encoding="utf-8")
        js = js.replace("'__VERSION__'", json.dumps(v)).replace("__ARCHIVOS__", json.dumps(archivos))
        return Response(js, media_type="text/javascript", headers={"Cache-Control": "no-cache"})

    @app.exception_handler(StopIteration)
    def _stop(request, exc):
        return JSONResponse({"detail": "Referencia desconocida en la configuración"}, 400)

    return app

