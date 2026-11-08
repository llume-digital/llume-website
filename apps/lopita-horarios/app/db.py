"""Almacenamiento en SQLite: configuración versionada, horarios, usuarios y registro de envíos."""
from __future__ import annotations

import datetime as dt
import functools
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import sys
import threading
from contextlib import contextmanager
from pathlib import Path

from lopita_horarios.models import Config, Schedule

from . import linea_tiempo

SCHEMA = """
CREATE TABLE IF NOT EXISTS config_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    autor TEXT,
    nota TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    desde TEXT NOT NULL,
    hasta TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'borrador',
    data TEXT NOT NULL,
    token TEXT UNIQUE,
    cambios_pendientes TEXT NOT NULL DEFAULT '[]',
    autor TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    published_at TEXT
);
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    nombre TEXT,
    pw_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'admin',
    empleado_id TEXT,
    cambiar_clave INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS solicitudes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    empleado_id TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    datos TEXT NOT NULL,
    motivo TEXT,
    respuesta TEXT,
    solicitante TEXT,
    resuelto_por TEXT,
    created_at TEXT NOT NULL,
    resuelto_at TEXT
);
CREATE TABLE IF NOT EXISTS alertas_reconocidas (
    schedule_id INTEGER NOT NULL,
    clave TEXT NOT NULL,
    huella TEXT NOT NULL,
    usuario TEXT,
    nota TEXT,
    created_at TEXT NOT NULL,
    PRIMARY KEY (schedule_id, clave)
);
CREATE TABLE IF NOT EXISTS avisos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    empleado_id TEXT NOT NULL,
    schedule_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    fecha TEXT,
    fecha_fin TEXT,
    antes TEXT,
    despues TEXT,
    cantidad INTEGER,
    created_at TEXT NOT NULL,
    leido_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_avisos_emp ON avisos (empleado_id, leido_at);
CREATE TABLE IF NOT EXISTS notificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    schedule_id INTEGER,
    titulo TEXT NOT NULL,
    texto TEXT NOT NULL,
    detalle TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    leida_por TEXT,
    leida_at TEXT
);
CREATE TABLE IF NOT EXISTS registro (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER,
    usuario TEXT,
    accion TEXT NOT NULL,
    detalle TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mensajes_web (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL,
    telefono TEXT,
    datos TEXT NOT NULL DEFAULT '{}',
    adjunto BLOB,
    adjunto_nombre TEXT,
    adjunto_tipo TEXT,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    created_at TEXT NOT NULL,
    atendido_por TEXT,
    atendido_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_mensajes_web ON mensajes_web (tipo, estado);
CREATE TABLE IF NOT EXISTS documentos_web (
    clave TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL,
    datos BLOB NOT NULL,
    autor TEXT,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS comentarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    autor TEXT NOT NULL,
    nombre TEXT NOT NULL,
    rol TEXT NOT NULL,
    tipo TEXT NOT NULL,
    pantalla TEXT,
    texto TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'nuevo',
    respuesta TEXT,
    respondido_por TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    schedule_id INTEGER,
    tipo TEXT,
    ok INTEGER,
    detalle TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS accesos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    nombre TEXT,
    google_sub TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    usuario TEXT,
    resuelto_por TEXT,
    created_at TEXT NOT NULL,
    resuelto_at TEXT
);
CREATE TABLE IF NOT EXISTS ajustes_app (
    clave TEXT PRIMARY KEY,
    valor TEXT
);
CREATE TABLE IF NOT EXISTS calendarios (
    empleado_id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL
);
-- Línea de tiempo de lo publicado (app/linea_tiempo.py): el horario publicado que manda en cada fecha
CREATE TABLE IF NOT EXISTS dias_publicados (
    fecha TEXT PRIMARY KEY,
    schedule_id INTEGER NOT NULL,
    desde_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dias_publicados_horario ON dias_publicados (schedule_id);
-- Quién mandaba antes en cada fecha y quién lo sustituyó (NULL si el día se quedó sin horario publicado)
CREATE TABLE IF NOT EXISTS dias_historial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    schedule_id INTEGER NOT NULL,
    sustituido_por INTEGER,
    motivo TEXT NOT NULL,
    desde_at TEXT NOT NULL,
    hasta_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dias_historial_fecha ON dias_historial (fecha, id);
"""

# Versión del esquema (PRAGMA user_version). 1: línea de tiempo de lo publicado, creada a partir de los horarios ya
# publicados la primera vez que se abre la base (Store._migrar_linea_tiempo).
VERSION_ESQUEMA = 1


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 240_000)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def check_password(password: str, stored: str) -> bool:
    try:
        _, salt, digest = stored.split("$")
    except ValueError:
        return False
    candidate = hash_password(password, bytes.fromhex(salt)).split("$")[2]
    return hmac.compare_digest(candidate, digest)


@functools.cache
def _hash_falso() -> str:
    # Se calcula al primer uso, no al importar: la app offline pone su pbkdf2_hmac después de importar la app.
    return hash_password(secrets.token_hex(16))


class Store:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self.preparar()

    def preparar(self) -> None:
        """Crea las tablas que falten y migra la base al esquema actual. Es idempotente.

        La app offline con datos compartidos la vuelve a llamar cada vez que baja una base nueva de la nube, porque
        puede venir de un dispositivo con una versión anterior de la app."""
        with self.conn() as c:
            if sys.platform != "emscripten":
                # WAL: las lecturas no esperan a las escrituras y cada escritura cuesta menos. En el navegador (app
                # offline) no hay memoria compartida para el fichero -shm, así que allí se queda el modo por defecto.
                c.execute("PRAGMA journal_mode=WAL")
            c.executescript(SCHEMA)
            cols = {r["name"] for r in c.execute("PRAGMA table_info(users)")}
            if "rol" not in cols:
                c.execute("ALTER TABLE users ADD COLUMN rol TEXT NOT NULL DEFAULT 'admin'")
            if "empleado_id" not in cols:
                c.execute("ALTER TABLE users ADD COLUMN empleado_id TEXT")
            if "cambiar_clave" not in cols:
                c.execute("ALTER TABLE users ADD COLUMN cambiar_clave INTEGER NOT NULL DEFAULT 0")
            if "email" not in cols:
                c.execute("ALTER TABLE users ADD COLUMN email TEXT")
            if "google_sub" not in cols:
                c.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")
            if "reemplaza" not in {r["name"] for r in c.execute("PRAGMA table_info(schedules)")}:
                # Borrador que, al publicarse, sustituye a un horario publicado (un arreglo pendiente)
                c.execute("ALTER TABLE schedules ADD COLUMN reemplaza INTEGER")
            if c.execute("PRAGMA user_version").fetchone()[0] < 1:
                self._migrar_linea_tiempo(c)
                c.execute(f"PRAGMA user_version = {VERSION_ESQUEMA}")

    @contextmanager
    def conn(self):
        c = sqlite3.connect(self.path, timeout=5)  # espera hasta 5 s a otra escritura en vez de fallar con «database is locked»
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA synchronous=NORMAL")  # con WAL es seguro ante cortes de luz y evita un fsync por cada escritura
        try:
            with self._lock:
                yield c
                c.commit()
        finally:
            c.close()

    def comprobar(self) -> None:
        with self.conn() as c:
            c.execute("SELECT 1 FROM config_versions LIMIT 1").fetchall()

    def copia(self, destino: str) -> None:
        """Copia coherente de la base de datos, aunque la app esté en marcha (API de copia de SQLite)."""
        Path(destino).parent.mkdir(parents=True, exist_ok=True)
        with self.conn() as c, sqlite3.connect(destino) as d:
            c.backup(d)
        d.close()

    # ------------------------------------------------------------ configuración
    def current_config(self) -> tuple[Config, int, str] | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM config_versions ORDER BY id DESC LIMIT 1").fetchone()
        if not row:
            return None
        return Config.model_validate_json(row["data"]), row["id"], row["created_at"]

    def save_config(self, config: Config, autor: str | None, nota: str | None = None) -> int:
        with self.conn() as c:
            cur = c.execute(
                "INSERT INTO config_versions (data, autor, nota, created_at) VALUES (?, ?, ?, ?)",
                (config.model_dump_json(), autor, nota, now()),
            )
            return cur.lastrowid

    def config_history(self, limit: int = 50) -> list[dict]:
        with self.conn() as c:
            rows = c.execute(
                "SELECT id, autor, nota, created_at FROM config_versions ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def previous_config_version(self, version: int) -> int | None:
        with self.conn() as c:
            row = c.execute("SELECT MAX(id) AS v FROM config_versions WHERE id < ?", (version,)).fetchone()
        return row["v"] if row else None

    def config_version(self, version: int) -> Config | None:
        with self.conn() as c:
            row = c.execute("SELECT data FROM config_versions WHERE id = ?", (version,)).fetchone()
        return Config.model_validate_json(row["data"]) if row else None

    # ------------------------------------------------------------ horarios
    def _row_to_dict(self, row, vigentes: dict[int, set[dt.date]] | None = None) -> dict:
        d = dict(row)
        d["horario"] = Schedule.model_validate_json(d.pop("data"))
        d["cambios_pendientes"] = json.loads(d["cambios_pendientes"])
        if d["estado"] == "publicado" and vigentes is not None:
            d["vigentes"] = frozenset(vigentes.get(d["id"], ()))
        return d

    @staticmethod
    def _vigentes(c, sid: int | None = None) -> dict[int, set[dt.date]]:
        """Fechas en las que manda cada horario publicado (de uno solo si se da 'sid')."""
        q, args = "SELECT fecha, schedule_id FROM dias_publicados", ()
        if sid is not None:
            q, args = q + " WHERE schedule_id=?", (sid,)
        out: dict[int, set[dt.date]] = {}
        for r in c.execute(q, args):
            out.setdefault(r["schedule_id"], set()).add(dt.date.fromisoformat(r["fecha"]))
        return out

    # ------------------------------------------------------------ línea de tiempo de lo publicado
    @staticmethod
    def _ocupar(c, sid: int, desde: dt.date, hasta: dt.date, motivo: str, ts: str) -> list[tuple[str, int]]:
        """El horario 'sid' pasa a mandar en todas sus fechas. Lo que mandaba antes en ellas va al historial.

        Devuelve (fecha, horario que mandaba) de cada fecha que tenía otro horario."""
        pisados = []
        d = desde
        while d <= hasta:
            f = d.isoformat()
            prev = c.execute("SELECT schedule_id, desde_at FROM dias_publicados WHERE fecha=?", (f,)).fetchone()
            if prev and prev["schedule_id"] != sid:
                c.execute("INSERT INTO dias_historial (fecha, schedule_id, sustituido_por, motivo, desde_at, hasta_at) "
                          "VALUES (?,?,?,?,?,?)", (f, prev["schedule_id"], sid, motivo, prev["desde_at"], ts))
                pisados.append((f, prev["schedule_id"]))
            if not prev or prev["schedule_id"] != sid:
                c.execute("INSERT INTO dias_publicados (fecha, schedule_id, desde_at) VALUES (?,?,?) "
                          "ON CONFLICT(fecha) DO UPDATE SET schedule_id=excluded.schedule_id, desde_at=excluded.desde_at",
                          (f, sid, ts))
            d += dt.timedelta(days=1)
        return pisados

    @staticmethod
    def _liberar(c, sid: int, ts: str) -> None:
        """El horario 'sid' deja de mandar (se borra). En cada fecha suya vuelve a mandar el último horario publicado
        que aún existe y la cubre, como pasaba antes de la línea de tiempo; si no queda ninguno, la fecha se queda sin
        horario publicado."""
        for r in c.execute("SELECT fecha, desde_at FROM dias_publicados WHERE schedule_id=?", (sid,)).fetchall():
            f = r["fecha"]
            vuelve = c.execute(
                "SELECT h.schedule_id FROM dias_historial h JOIN schedules s ON s.id = h.schedule_id "
                "WHERE h.fecha=? AND s.estado='publicado' AND s.id != ? AND s.desde <= ? AND s.hasta >= ? "
                "ORDER BY h.id DESC LIMIT 1", (f, sid, f, f)).fetchone()
            nuevo = vuelve["schedule_id"] if vuelve else None
            c.execute("INSERT INTO dias_historial (fecha, schedule_id, sustituido_por, motivo, desde_at, hasta_at) "
                      "VALUES (?,?,?,?,?,?)", (f, sid, nuevo, "retirada", r["desde_at"], ts))
            if nuevo is None:
                c.execute("DELETE FROM dias_publicados WHERE fecha=?", (f,))
            else:
                c.execute("UPDATE dias_publicados SET schedule_id=?, desde_at=? WHERE fecha=?", (nuevo, ts, f))

    def _migrar_linea_tiempo(self, c) -> None:
        """Crea la línea de tiempo con los horarios ya publicados, del publicado antes al publicado después: donde dos
        se solapan manda el último publicado y el otro queda en el historial.

        Hasta ahora mandaba el modificado más tarde, que no siempre es el mismo; si hay solapes se deja una
        notificación al encargado con las fechas, y marcadas las que cambian de horario."""
        if c.execute("SELECT 1 FROM dias_publicados LIMIT 1").fetchone():
            return
        filas = c.execute("SELECT id, desde, hasta, updated_at, published_at, created_at FROM schedules "
                          "WHERE estado='publicado' ORDER BY COALESCE(published_at, created_at), id").fetchall()
        antes: dict[str, tuple[str, int]] = {}  # fecha → (updated_at, id) del que mandaba hasta ahora
        solapes: dict[str, set[int]] = {}
        ts = now()
        for r in filas:
            desde, hasta = dt.date.fromisoformat(r["desde"]), dt.date.fromisoformat(r["hasta"])
            for f, prev in self._ocupar(c, r["id"], desde, hasta, "migracion", ts):
                solapes.setdefault(f, {prev}).add(r["id"])
            d = desde
            while d <= hasta:
                f = d.isoformat()
                if f not in antes or (r["updated_at"], r["id"]) > antes[f]:
                    antes[f] = (r["updated_at"], r["id"])
                d += dt.timedelta(days=1)
        if not solapes:
            return
        manda = {r["fecha"]: r["schedule_id"] for r in c.execute("SELECT fecha, schedule_id FROM dias_publicados")}
        dias = [{"fecha": f, "horarios": sorted(ids), "manda": manda[f], "antes": antes[f][1]}
                for f, ids in sorted(solapes.items())]
        cambian = [d["fecha"] for d in dias if d["manda"] != d["antes"]]
        texto = (f"Había {len(dias)} día{'s' if len(dias) != 1 else ''} con más de un horario publicado. Ahora cada día "
                 "tiene uno solo: el último que se publicó.")
        if cambian:
            texto += (f" En {len(cambian)} de ellos el equipo veía otro (el modificado más tarde): revisa "
                      f"{', '.join(cambian[:5])}{'…' if len(cambian) > 5 else ''}.")
        c.execute("INSERT INTO notificaciones (tipo, schedule_id, titulo, texto, detalle, created_at) VALUES (?,?,?,?,?,?)",
                  ("linea_tiempo_migrada", None, "Horarios publicados solapados", texto,
                   json.dumps({"dias": dias, "cambian": cambian}), ts))

    def timeline(self) -> dict[dt.date, int]:
        """Fecha → horario publicado que manda en ella."""
        with self.conn() as c:
            return {dt.date.fromisoformat(r["fecha"]): r["schedule_id"]
                    for r in c.execute("SELECT fecha, schedule_id FROM dias_publicados ORDER BY fecha")}

    def day_history(self, fecha: dt.date) -> list[dict]:
        """Quién mandó antes en una fecha, del cambio más reciente al más antiguo."""
        with self.conn() as c:
            return [dict(r) for r in c.execute("SELECT * FROM dias_historial WHERE fecha=? ORDER BY id DESC",
                                               (fecha.isoformat(),))]

    def create_schedule(self, schedule: Schedule, autor: str | None, reemplaza: int | None = None) -> int:
        ts = now()
        with self.conn() as c:
            cur = c.execute(
                "INSERT INTO schedules (desde, hasta, estado, data, autor, created_at, updated_at, reemplaza) "
                "VALUES (?,?,?,?,?,?,?,?)",
                (schedule.desde.isoformat(), schedule.hasta.isoformat(), schedule.estado,
                 schedule.model_dump_json(), autor, ts, ts, reemplaza),
            )
            return cur.lastrowid

    def replacement_of(self, sid: int) -> dict | None:
        """Arreglo pendiente (borrador) de un horario publicado, si lo hay."""
        with self.conn() as c:
            row = c.execute("SELECT * FROM schedules WHERE reemplaza=? ORDER BY id DESC", (sid,)).fetchone()
        return self._row_to_dict(row) if row else None

    def update_schedule(self, sid: int, schedule: Schedule, cambios: list[str] | None = None) -> None:
        with self.conn() as c:
            if schedule.estado != "publicado":
                self._liberar(c, sid, now())  # despublicado: deja de mandar en sus fechas
            if cambios is None:
                c.execute("UPDATE schedules SET data=?, estado=?, updated_at=? WHERE id=?",
                          (schedule.model_dump_json(), schedule.estado, now(), sid))
            else:
                c.execute("UPDATE schedules SET data=?, estado=?, updated_at=?, cambios_pendientes=? WHERE id=?",
                          (schedule.model_dump_json(), schedule.estado, now(), json.dumps(sorted(set(cambios))), sid))

    def publish_schedule(self, sid: int, schedule: Schedule) -> str:
        """Publica el horario. La primera vez pasa a mandar en todas sus fechas de la línea de tiempo; volver a
        publicar uno ya publicado no le devuelve las fechas que le haya quitado otro publicado después."""
        ts = now()
        with self.conn() as c:
            row = c.execute("SELECT token, estado FROM schedules WHERE id=?", (sid,)).fetchone()
            token = row["token"] or secrets.token_urlsafe(16)
            c.execute(
                "UPDATE schedules SET data=?, estado='publicado', token=?, published_at=?, updated_at=?, "
                "cambios_pendientes='[]' WHERE id=?",
                (schedule.model_dump_json(), token, ts, ts, sid),
            )
            if row["estado"] != "publicado":
                self._ocupar(c, sid, schedule.desde, schedule.hasta, "publicacion", ts)
            return token

    def clear_changes(self, sid: int) -> None:
        with self.conn() as c:
            c.execute("UPDATE schedules SET cambios_pendientes='[]' WHERE id=?", (sid,))

    def get_schedule(self, sid: int) -> dict | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM schedules WHERE id=?", (sid,)).fetchone()
            vigentes = self._vigentes(c, sid) if row else None
        return self._row_to_dict(row, vigentes) if row else None

    def get_schedule_by_token(self, token: str) -> dict | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM schedules WHERE token=? AND estado='publicado'", (token,)).fetchone()
            vigentes = self._vigentes(c, row["id"]) if row else None
        return self._row_to_dict(row, vigentes) if row else None

    def list_schedules(self) -> list[dict]:
        with self.conn() as c:
            rows = c.execute("SELECT * FROM schedules ORDER BY desde DESC, id DESC").fetchall()
            vigentes = self._vigentes(c)
        return [self._row_to_dict(r, vigentes) for r in rows]

    def delete_schedule(self, sid: int) -> None:
        with self.conn() as c:
            self._liberar(c, sid, now())
            c.execute("DELETE FROM schedules WHERE id=?", (sid,))
            c.execute("DELETE FROM alertas_reconocidas WHERE schedule_id=?", (sid,))
            c.execute("DELETE FROM avisos WHERE schedule_id=? AND leido_at IS NULL AND tipo!='retirado'", (sid,))
            c.execute("UPDATE notificaciones SET leida_at=?, leida_por='sistema' WHERE schedule_id=? AND leida_at IS NULL",
                      (now(), sid))

    def assignments_before(self, desde: dt.date, days: int = 7, exclude: int | None = None,
                           filas: list[dict] | None = None):
        """Asignaciones de los 'days' días previos a 'desde', tomadas del horario que manda en cada fecha (el
        publicado de la línea de tiempo; si no hay, el borrador más reciente). None si no hay ninguno.

        filas: los horarios ya leídos con `list_schedules`, para no volver a leerlos todos en cada llamada."""
        start = desde - dt.timedelta(days=days)
        rows = self.list_schedules() if filas is None else filas
        mandan = linea_tiempo.por_dia(rows, start, desde - dt.timedelta(days=1), excluir=exclude)
        if not mandan:
            return None
        return [a for d, r in mandan.items() for a in r["horario"].asignaciones if a.fecha == d]

    def previous_contiguous(self, desde: dt.date, exclude: int | None = None,
                            filas: list[dict] | None = None) -> Schedule | None:
        """Horario que termina justo el día anterior a 'desde': el publicado que manda ese día y, si no, el borrador
        más reciente."""
        dia = desde - dt.timedelta(days=1)
        cands = [s for s in (self.list_schedules() if filas is None else filas)
                 if s["id"] != exclude and s["horario"].hasta == dia]
        cands.sort(key=lambda s: (s["estado"] == "publicado", dia in linea_tiempo.fechas(s) if s["estado"] == "publicado"
                                  else False, s["updated_at"]), reverse=True)
        return cands[0]["horario"] if cands else None

    # ------------------------------------------------------------ usuarios
    @staticmethod
    def _user(row) -> dict:
        return {"username": row["username"], "nombre": row["nombre"] or row["username"], "rol": row["rol"],
                "empleado_id": row["empleado_id"], "cambiar_clave": bool(row["cambiar_clave"]),
                "email": row["email"], "google": bool(row["google_sub"])}

    def users(self) -> list[dict]:
        with self.conn() as c:
            rows = c.execute("SELECT * FROM users ORDER BY rol, username").fetchall()
        return [{**self._user(r), "created_at": r["created_at"]} for r in rows]

    def get_user(self, username: str) -> dict | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        return self._user(row) if row else None

    def upsert_user(self, username: str, password: str, nombre: str | None = None, rol: str = "admin",
                    empleado_id: str | None = None, cambiar_clave: bool = False) -> None:
        with self.conn() as c:
            c.execute(
                "INSERT INTO users (username, nombre, pw_hash, created_at, rol, empleado_id, cambiar_clave) "
                "VALUES (?,?,?,?,?,?,?) "
                "ON CONFLICT(username) DO UPDATE SET pw_hash=excluded.pw_hash, "
                "nombre=COALESCE(excluded.nombre, users.nombre), rol=excluded.rol, "
                "empleado_id=excluded.empleado_id, cambiar_clave=excluded.cambiar_clave",
                (username, nombre, hash_password(password), now(), rol, empleado_id, int(cambiar_clave)),
            )

    def set_password(self, username: str, password: str, cambiar_clave: bool = False) -> None:
        with self.conn() as c:
            c.execute("UPDATE users SET pw_hash=?, cambiar_clave=? WHERE username=?",
                      (hash_password(password), int(cambiar_clave), username))

    def delete_user(self, username: str) -> None:
        with self.conn() as c:
            c.execute("DELETE FROM users WHERE username=?", (username,))

    def authenticate(self, username: str, password: str) -> dict | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        if row is None:
            # Se calcula igualmente un hash para que un usuario inexistente tarde lo mismo que una contraseña mala
            # (si no, el tiempo de respuesta delata qué usuarios existen).
            check_password(password, _hash_falso())
            return None
        return self._user(row) if check_password(password, row["pw_hash"]) else None

    def password_ok(self, username: str, password: str) -> bool:
        return self.authenticate(username, password) is not None

    # ------------------------------------------------------------ correo, Google y registros
    def set_email(self, username: str, email: str | None) -> None:
        with self.conn() as c:
            c.execute("UPDATE users SET email=? WHERE username=?", (email, username))

    def user_by_email(self, email: str) -> dict | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM users WHERE lower(email)=lower(?)", (email,)).fetchone()
        return self._user(row) if row else None

    def user_by_google(self, sub: str) -> dict | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM users WHERE google_sub=?", (sub,)).fetchone()
        return self._user(row) if row else None

    def set_google(self, username: str, sub: str | None) -> None:
        with self.conn() as c:
            c.execute("UPDATE users SET google_sub=? WHERE username=?", (sub, username))

    def pedir_acceso(self, email: str, nombre: str | None, sub: str) -> dict:
        """Registro con Google: queda pendiente hasta que un encargado lo apruebe (uno por cuenta de Google)."""
        with self.conn() as c:
            row = c.execute("SELECT * FROM accesos WHERE google_sub=? AND estado='pendiente'", (sub,)).fetchone()
            if row is None:
                c.execute("INSERT INTO accesos (email, nombre, google_sub, created_at) VALUES (?,?,?,?)",
                          (email, nombre, sub, now()))
                row = c.execute("SELECT * FROM accesos WHERE google_sub=? AND estado='pendiente'", (sub,)).fetchone()
        return dict(row)

    def accesos(self, estado: str | None = "pendiente") -> list[dict]:
        with self.conn() as c:
            rows = c.execute("SELECT * FROM accesos" + (" WHERE estado=?" if estado else "") + " ORDER BY id DESC",
                             (estado,) if estado else ()).fetchall()
        return [dict(r) for r in rows]

    def get_acceso(self, aid: int) -> dict | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM accesos WHERE id=?", (aid,)).fetchone()
        return dict(row) if row else None

    def resolver_acceso(self, aid: int, estado: str, por: str, usuario: str | None = None) -> None:
        with self.conn() as c:
            c.execute("UPDATE accesos SET estado=?, resuelto_por=?, usuario=?, resuelto_at=? WHERE id=?",
                      (estado, por, usuario, now(), aid))

    def ajuste(self, clave: str) -> str | None:
        with self.conn() as c:
            row = c.execute("SELECT valor FROM ajustes_app WHERE clave=?", (clave,)).fetchone()
        return row["valor"] if row else None

    def set_ajuste(self, clave: str, valor: str | None) -> None:
        with self.conn() as c:
            c.execute("INSERT INTO ajustes_app (clave, valor) VALUES (?,?) "
                      "ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor", (clave, valor))

    # ------------------------------------------------------------ calendarios (.ics de cada persona)
    def calendar_token(self, empleado_id: str, crear: bool = True, renovar: bool = False) -> str | None:
        """Enlace secreto del calendario de una persona. Renovarlo invalida el anterior al momento."""
        with self.conn() as c:
            row = c.execute("SELECT token FROM calendarios WHERE empleado_id=?", (empleado_id,)).fetchone()
            if row and not renovar:
                return row["token"]
            if not row and not crear:
                return None
            token = secrets.token_urlsafe(24)
            c.execute("INSERT INTO calendarios (empleado_id, token, created_at) VALUES (?,?,?) "
                      "ON CONFLICT(empleado_id) DO UPDATE SET token=excluded.token, created_at=excluded.created_at",
                      (empleado_id, token, now()))
            return token

    def calendar_owner(self, token: str) -> str | None:
        with self.conn() as c:
            row = c.execute("SELECT empleado_id FROM calendarios WHERE token=?", (token,)).fetchone()
        return row["empleado_id"] if row else None

    def calendar_tokens(self) -> dict[str, str]:
        """empleado_id → token de todos los calendarios creados."""
        with self.conn() as c:
            return {r["empleado_id"]: r["token"] for r in c.execute("SELECT empleado_id, token FROM calendarios")}

    # ------------------------------------------------------------ solicitudes
    @staticmethod
    def _req(row) -> dict:
        d = dict(row)
        d["datos"] = json.loads(d["datos"])
        return d

    def create_request(self, tipo: str, empleado_id: str, datos: dict, motivo: str | None, solicitante: str) -> int:
        with self.conn() as c:
            cur = c.execute(
                "INSERT INTO solicitudes (tipo, empleado_id, datos, motivo, solicitante, created_at) VALUES (?,?,?,?,?,?)",
                (tipo, empleado_id, json.dumps(datos, ensure_ascii=False, default=str), motivo, solicitante, now()))
            return cur.lastrowid

    def get_request(self, rid: int) -> dict | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM solicitudes WHERE id=?", (rid,)).fetchone()
        return self._req(row) if row else None

    def list_requests(self, empleado_id: str | None = None, tipo: str | None = None,
                      estado: str | None = None) -> list[dict]:
        q, args = "SELECT * FROM solicitudes WHERE 1=1", []
        for col, val in (("empleado_id", empleado_id), ("tipo", tipo), ("estado", estado)):
            if val:
                q += f" AND {col}=?"
                args.append(val)
        q += " ORDER BY (estado='pendiente') DESC, id DESC"
        with self.conn() as c:
            return [self._req(r) for r in c.execute(q, args).fetchall()]

    def resolve_request(self, rid: int, estado: str, por: str, respuesta: str | None) -> None:
        with self.conn() as c:
            c.execute("UPDATE solicitudes SET estado=?, resuelto_por=?, respuesta=?, resuelto_at=? WHERE id=?",
                      (estado, por, respuesta, now(), rid))

    def cancel_request(self, rid: int) -> None:
        with self.conn() as c:
            c.execute("DELETE FROM solicitudes WHERE id=?", (rid,))

    # ------------------------------------------------------------ alertas reconocidas
    def acknowledged(self, sid: int) -> dict[str, dict]:
        with self.conn() as c:
            rows = c.execute("SELECT * FROM alertas_reconocidas WHERE schedule_id=?", (sid,)).fetchall()
        return {r["clave"]: dict(r) for r in rows}

    def acknowledge(self, sid: int, clave: str, huella: str, usuario: str, nota: str | None) -> None:
        with self.conn() as c:
            c.execute("INSERT OR REPLACE INTO alertas_reconocidas (schedule_id, clave, huella, usuario, nota, created_at) "
                      "VALUES (?,?,?,?,?,?)", (sid, clave, huella, usuario, nota, now()))

    def unacknowledge(self, sid: int, clave: str) -> None:
        with self.conn() as c:
            c.execute("DELETE FROM alertas_reconocidas WHERE schedule_id=? AND clave=?", (sid, clave))

    # ------------------------------------------------------------ avisos al trabajador
    def record_shift_change(self, empleado_id: str, sid: int, fecha: dt.date, antes: str | None, despues: str | None) -> None:
        """Anota que el turno de una persona un día cambió. Si ya había un aviso sin leer de esa casilla
        se funde con él (conserva el 'antes' original) y, si todo vuelve a como estaba, desaparece."""
        f = fecha.isoformat()
        with self.conn() as c:
            row = c.execute("SELECT * FROM avisos WHERE empleado_id=? AND schedule_id=? AND tipo='turno' AND fecha=? "
                            "AND leido_at IS NULL", (empleado_id, sid, f)).fetchone()
            if row:
                if row["antes"] == despues:
                    c.execute("DELETE FROM avisos WHERE id=?", (row["id"],))
                else:
                    c.execute("UPDATE avisos SET despues=?, created_at=? WHERE id=?", (despues, now(), row["id"]))
            elif antes != despues:
                c.execute("INSERT INTO avisos (empleado_id, schedule_id, tipo, fecha, antes, despues, created_at) "
                          "VALUES (?,?,?,?,?,?,?)", (empleado_id, sid, "turno", f, antes, despues, now()))

    def record_notice(self, empleado_id: str, sid: int, tipo: str, fecha: dt.date | None = None,
                      fecha_fin: dt.date | None = None, cantidad: int | None = None) -> None:
        """Aviso de horario completo ('nuevo_horario' o 'retirado'). Sustituye al sin leer anterior del mismo horario."""
        with self.conn() as c:
            c.execute("DELETE FROM avisos WHERE empleado_id=? AND schedule_id=? AND tipo IN ('nuevo_horario','retirado') "
                      "AND leido_at IS NULL", (empleado_id, sid))
            if tipo == "retirado":  # los cambios sueltos sin leer ya no tienen sentido
                c.execute("DELETE FROM avisos WHERE empleado_id=? AND schedule_id=? AND tipo='turno' AND leido_at IS NULL",
                          (empleado_id, sid))
            c.execute("INSERT INTO avisos (empleado_id, schedule_id, tipo, fecha, fecha_fin, cantidad, created_at) "
                      "VALUES (?,?,?,?,?,?,?)", (empleado_id, sid, tipo, fecha.isoformat() if fecha else None,
                                                  fecha_fin.isoformat() if fecha_fin else None, cantidad, now()))

    def notices(self, empleado_id: str | None = None, solo_sin_leer: bool = False, desde_dias: int = 30) -> list[dict]:
        q, args = "SELECT * FROM avisos WHERE 1=1", []
        if empleado_id:
            q += " AND empleado_id=?"
            args.append(empleado_id)
        if solo_sin_leer:
            q += " AND leido_at IS NULL"
        else:
            limite = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=desde_dias)).isoformat(timespec="seconds")
            q += " AND (leido_at IS NULL OR leido_at >= ?)"
            args.append(limite)
        q += " ORDER BY (leido_at IS NULL) DESC, created_at DESC, id DESC"
        with self.conn() as c:
            return [dict(r) for r in c.execute(q, args).fetchall()]

    def mark_notices_read(self, empleado_id: str, ids: list[int] | None = None) -> None:
        q, args = "UPDATE avisos SET leido_at=? WHERE empleado_id=? AND leido_at IS NULL", [now(), empleado_id]
        if ids is not None:
            q += f" AND id IN ({','.join('?' * len(ids))})" if ids else " AND 0"
            args += ids
        with self.conn() as c:
            c.execute(q, args)

    # ------------------------------------------------------------ notificaciones a los encargados
    def create_notification(self, tipo: str, schedule_id: int | None, titulo: str, texto: str, detalle: dict) -> int:
        with self.conn() as c:
            cur = c.execute(
                "INSERT INTO notificaciones (tipo, schedule_id, titulo, texto, detalle, created_at) VALUES (?,?,?,?,?,?)",
                (tipo, schedule_id, titulo, texto, json.dumps(detalle, ensure_ascii=False, default=str), now()))
            return cur.lastrowid

    def notifications(self, solo_sin_leer: bool = False, limit: int = 50) -> list[dict]:
        q = "SELECT * FROM notificaciones" + (" WHERE leida_at IS NULL" if solo_sin_leer else "") + " ORDER BY id DESC LIMIT ?"
        with self.conn() as c:
            rows = c.execute(q, (limit,)).fetchall()
        return [{**dict(r), "detalle": json.loads(r["detalle"])} for r in rows]

    def mark_notifications_read(self, usuario: str, ids: list[int] | None = None) -> None:
        q, args = "UPDATE notificaciones SET leida_at=?, leida_por=? WHERE leida_at IS NULL", [now(), usuario]
        if ids is not None:
            q += f" AND id IN ({','.join('?' * len(ids))})" if ids else " AND 0"
            args += ids
        with self.conn() as c:
            c.execute(q, args)

    # ------------------------------------------------------------ registro de acciones delicadas
    def log_action(self, schedule_id: int | None, usuario: str, accion: str, detalle: dict) -> None:
        with self.conn() as c:
            c.execute("INSERT INTO registro (schedule_id, usuario, accion, detalle, created_at) VALUES (?,?,?,?,?)",
                      (schedule_id, usuario, accion, json.dumps(detalle, ensure_ascii=False, default=str), now()))

    def actions(self, schedule_id: int) -> list[dict]:
        with self.conn() as c:
            rows = c.execute("SELECT * FROM registro WHERE schedule_id=? ORDER BY id DESC", (schedule_id,)).fetchall()
        return [{**dict(r), "detalle": json.loads(r["detalle"])} for r in rows]

    # ------------------------------------------------------------ envíos
    def log_send(self, schedule_id: int, tipo: str, ok: bool, detalle) -> None:
        with self.conn() as c:
            c.execute("INSERT INTO envios (schedule_id, tipo, ok, detalle, created_at) VALUES (?,?,?,?,?)",
                      (schedule_id, tipo, int(ok), json.dumps(detalle, ensure_ascii=False, default=str), now()))

    def sends(self, schedule_id: int) -> list[dict]:
        with self.conn() as c:
            rows = c.execute("SELECT * FROM envios WHERE schedule_id=? ORDER BY id DESC", (schedule_id,)).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["detalle"] = json.loads(d["detalle"])
            out.append(d)
        return out


    # ------------------------------------------------------------ web pública: formularios y documentos
    @staticmethod
    def _mensaje(row) -> dict:
        d = {k: row[k] for k in row.keys() if k != "adjunto"}
        d["datos"] = json.loads(d["datos"])
        return d

    def create_web_message(self, tipo: str, nombre: str, email: str, telefono: str | None, datos: dict,
                           adjunto: tuple[str, str, bytes] | None = None) -> int:
        """`adjunto` = (nombre del fichero, tipo MIME, contenido)."""
        a_nombre, a_tipo, a_datos = adjunto or (None, None, None)
        with self.conn() as c:
            cur = c.execute(
                "INSERT INTO mensajes_web (tipo, nombre, email, telefono, datos, adjunto, adjunto_nombre, adjunto_tipo, "
                "created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (tipo, nombre, email, telefono, json.dumps(datos, ensure_ascii=False), a_datos, a_nombre, a_tipo, now()),
            )
            return cur.lastrowid

    def web_messages(self, tipo: str | None = None, estado: str | None = None) -> list[dict]:
        sql, args = "SELECT * FROM mensajes_web WHERE 1=1", []
        if tipo:
            sql, args = sql + " AND tipo = ?", [*args, tipo]
        if estado:
            sql, args = sql + " AND estado = ?", [*args, estado]
        with self.conn() as c:
            return [self._mensaje(r) for r in c.execute(sql + " ORDER BY id DESC", args)]

    def web_message(self, mid: int) -> dict | None:
        with self.conn() as c:
            row = c.execute("SELECT * FROM mensajes_web WHERE id = ?", (mid,)).fetchone()
        return self._mensaje(row) if row else None

    def web_message_attachment(self, mid: int) -> tuple[str, str, bytes] | None:
        with self.conn() as c:
            row = c.execute("SELECT adjunto_nombre, adjunto_tipo, adjunto FROM mensajes_web WHERE id = ?", (mid,)).fetchone()
        return (row[0], row[1], row[2]) if row and row[2] is not None else None

    def set_web_message_state(self, mid: int, estado: str, usuario: str) -> None:
        with self.conn() as c:
            c.execute("UPDATE mensajes_web SET estado = ?, atendido_por = ?, atendido_at = ? WHERE id = ?",
                      (estado, usuario if estado != "nuevo" else None, now() if estado != "nuevo" else None, mid))

    def delete_web_message(self, mid: int) -> None:
        with self.conn() as c:
            c.execute("DELETE FROM mensajes_web WHERE id = ?", (mid,))

    def save_web_document(self, clave: str, nombre: str, tipo: str, datos: bytes, autor: str) -> None:
        with self.conn() as c:
            c.execute(
                "INSERT INTO documentos_web (clave, nombre, tipo, datos, autor, updated_at) VALUES (?, ?, ?, ?, ?, ?) "
                "ON CONFLICT(clave) DO UPDATE SET nombre=excluded.nombre, tipo=excluded.tipo, datos=excluded.datos, "
                "autor=excluded.autor, updated_at=excluded.updated_at",
                (clave, nombre, tipo, datos, autor, now()),
            )

    def web_document(self, clave: str) -> tuple[str, str, bytes] | None:
        with self.conn() as c:
            row = c.execute("SELECT nombre, tipo, datos FROM documentos_web WHERE clave = ?", (clave,)).fetchone()
        return (row[0], row[1], row[2]) if row else None

    def web_documents(self) -> list[dict]:
        with self.conn() as c:
            return [dict(r) for r in c.execute(
                "SELECT clave, nombre, tipo, length(datos) AS bytes, autor, updated_at FROM documentos_web ORDER BY clave")]


def default_db_path() -> str:
    return os.environ.get("LOPITA_DB", str(Path(__file__).resolve().parent.parent / "datos" / "lopita.db"))
