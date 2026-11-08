"""Envío del horario a Slack.

Si no hay SLACK_BOT_TOKEN configurado se trabaja en modo simulación: se construyen los
mensajes exactamente igual pero no se envían, y se devuelven para mostrarlos en la app.

Sin servidor propio (la app que corre en el navegador, con los datos en Cloudflare) el token no puede estar en la
app: cualquiera que abra la app lo vería. Entonces se usa un «relevo» (`relay`): las llamadas van a una ruta del
Worker de Cloudflare con la clave de los datos, y es el Worker el que pone el token y habla con Slack. El Worker
devuelve el canal en auth.test y responde «sin_token» si aún no se ha configurado (se sigue en modo simulación).
"""
from __future__ import annotations

import datetime as dt
import os
from dataclasses import dataclass, field

import httpx

from lopita_horarios.models import Config, Schedule

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]


def fecha_larga(d: dt.date) -> str:
    return f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month - 1]}"


def periodo(s: Schedule) -> str:
    return f"del {fecha_larga(s.desde)} al {fecha_larga(s.hasta)}"


@dataclass
class SlackResult:
    simulado: bool
    mensajes: list[dict] = field(default_factory=list)  # {destino, texto, ok, error}

    @property
    def ok(self) -> bool:
        return all(m.get("ok", True) for m in self.mensajes)

    def as_dict(self) -> dict:
        return {"simulado": self.simulado, "ok": self.ok, "mensajes": self.mensajes}


class Slack:
    API = "https://slack.com/api/"

    def __init__(self, token: str | None = None, channel: str | None = None, transport=None,
                 relay: str | None = None, relay_key: str | None = None):
        self.relay = relay.rstrip("/") + "/" if relay else None
        if self.relay:
            self.token = relay_key
            self.channel = channel
            base = self.relay
        else:
            self.token = token if token is not None else os.environ.get("SLACK_BOT_TOKEN") or None
            self.channel = channel if channel is not None else os.environ.get("SLACK_CHANNEL") or None
            base = self.API
        self._relay_ready: bool | None = None  # con relevo: si el Worker tiene token (se pregunta una vez)
        self._client = httpx.Client(base_url=base, timeout=15, transport=transport,
                                    headers={"Authorization": f"Bearer {self.token}"} if self.token else {})

    @property
    def configured(self) -> bool:
        if self.relay:
            if self._relay_ready is None:
                self.status()
            return bool(self._relay_ready)
        return bool(self.token)

    def status(self) -> dict:
        if self.relay:
            try:
                r = self._client.post("auth.test").json()
            except (httpx.HTTPError, ValueError) as exc:
                return {"configurado": False, "canal": self.channel, "relevo": True, "ok": False, "error": str(exc)}
            self._relay_ready = r.get("error") != "sin_token"
            self.channel = r.get("canal") or self.channel
            info = {"configurado": self._relay_ready, "canal": self.channel, "relevo": True}
            if self._relay_ready:
                info.update(ok=r.get("ok", False), equipo=r.get("team"), bot=r.get("user"), error=r.get("error"))
            return info
        info = {"configurado": self.configured, "canal": self.channel}
        if self.configured:
            try:
                r = self._client.post("auth.test").json()
                info.update(ok=r.get("ok", False), equipo=r.get("team"), bot=r.get("user"), error=r.get("error"))
            except httpx.HTTPError as exc:
                info.update(ok=False, error=str(exc))
        return info

    # ------------------------------------------------------------ bajo nivel
    def _resolve_user(self, emp) -> str | None:
        if emp.slack_user_id:
            return emp.slack_user_id
        if emp.email and self.configured:
            try:
                r = self._client.get("users.lookupByEmail", params={"email": emp.email}).json()
                if r.get("ok"):
                    return r["user"]["id"]
            except httpx.HTTPError:
                return None
        return None

    def _post(self, result: SlackResult, destino: str, channel: str | None, text: str, blocks=None) -> None:
        item = {"destino": destino, "texto": text}
        if result.simulado:
            item["ok"] = True
        elif not channel:
            item.update(ok=False, error="sin destino (falta canal o usuario de Slack)")
        else:
            try:
                payload = {"channel": channel, "text": text, "unfurl_links": False}
                if blocks:
                    payload["blocks"] = blocks
                r = self._client.post("chat.postMessage", json=payload).json()
                item.update(ok=bool(r.get("ok")), error=r.get("error"))
            except httpx.HTTPError as exc:
                item.update(ok=False, error=str(exc))
        result.mensajes.append(item)

    # ------------------------------------------------------------ mensajes
    @staticmethod
    def employee_text(config: Config, schedule: Schedule, emp_id: str, url: str | None, cambio: bool = False,
                      calendario: dict | None = None) -> str:
        emp = config.employee(emp_id)
        mine = sorted((a for a in schedule.asignaciones if a.empleado_id == emp_id), key=lambda a: a.fecha)
        head = (f"Hola {emp.nombre}, ha cambiado tu horario {periodo(schedule)}. Así queda:" if cambio
                else f"Hola {emp.nombre}, este es tu horario {periodo(schedule)}:")
        lines = [head]
        for a in mine:
            s = config.turno_de(a)
            lines.append(f"• {fecha_larga(a.fecha).capitalize()}: {s.nombre} de {s.inicio} a {s.fin}"
                         f" ({config.puesto_de(a).value}{', ' + rol.nombre if (rol := config.rol_de(a)) else ''})")
        if not mine:
            lines.append("• No tienes turnos en este periodo.")
        horas = sum(config.turno_de(a).minutes for a in mine) / 60
        lines.append(f"Total: {horas:g} h en {len(mine)} días.")
        if url:
            lines.append(f"Horario completo: {url}")
        if calendario:
            lines.append("Tus turnos en tu calendario (se actualizan solos cuando cambia el horario):")
            lines.append(f"• Google Calendar: {calendario['google']}")
            lines.append(f"• iPhone o Mac: {calendario['webcal']}")
        return "\n".join(lines)

    @staticmethod
    def channel_text(config: Config, schedule: Schedule, url: str | None, cambio: bool = False) -> str:
        gaps = sum(1 for i in schedule.incidencias if i.codigo == "falta_cobertura")
        verb = "Se ha actualizado" if cambio else "Ya está publicado"
        txt = f"{verb} el horario {periodo(schedule)}."
        if url:
            txt += f"\nConsúltalo aquí: {url}"
        txt += "\nCada persona recibirá sus turnos por mensaje privado."
        if gaps:
            txt += f"\n({gaps} {'franja queda' if gaps == 1 else 'franjas quedan'} sin cubrir del todo; el encargado lo revisará.)"
        return txt

    def publish(self, config: Config, schedule: Schedule, url: str | None, solo: list[str] | None = None,
                cambio: bool = False, calendario=None) -> SlackResult:
        """Publica en el canal y manda a cada empleado sus turnos. 'solo' limita los mensajes privados.

        'calendario', si se da, es una función empleado_id → enlaces de su calendario (ver app/calendario.py).
        """
        if self.relay:
            self.status()  # el canal y si hay token los sabe el Worker
        result = SlackResult(simulado=not self.configured)
        self._post(result, f"#canal {self.channel or ''}".strip(), self.channel,
                   self.channel_text(config, schedule, url, cambio))
        ids = solo if solo is not None else [e.id for e in config.active_employees()]
        for emp_id in ids:
            try:
                emp = config.employee(emp_id)
            except StopIteration:
                continue
            personal_url = f"{url}?e={emp.id}" if url else None
            self._post(result, emp.nombre, self._resolve_user(emp) if not result.simulado else "simulado",
                       self.employee_text(config, schedule, emp.id, personal_url, cambio,
                                          calendario(emp.id) if calendario else None))
        return result
