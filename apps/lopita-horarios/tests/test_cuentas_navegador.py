"""Recorrido en Chromium de las cuentas: Mi cuenta (correo y contraseña), registros con Google pendientes, restablecer
contraseña y la configuración de «Entrar con Google». Sin red: el botón de Google no carga y se dice sin romper nada.

Necesita Playwright con Chromium (ver test_vista_diaria_navegador.py); si no está, se salta.
"""
import time

import pytest

from app import google
from tests.test_cuentas import CID, JWK, token
from tests.test_feedback_cliente_navegador import _entrar

pytest.importorskip("playwright.sync_api")


def test_cuentas_correo_registros_y_restablecer(url, browser, monkeypatch):  # noqa: F811
    monkeypatch.setitem(google._cache, "claves", {"k1": JWK})
    monkeypatch.setitem(google._cache, "hasta", time.time() + 3600)
    ctx, page, errores = _entrar(browser, url)
    page.on("dialog", lambda d: d.accept())
    o = {"Origin": url}

    # Activar Google en Ajustes
    page.goto(f"{url}/#/ajustes")
    page.wait_for_selector("#google-form")
    page.fill("#google-form input[name=client_id]", "no-vale")
    page.click("#google-form button[type=submit]")
    page.wait_for_selector(".toast.bad")
    page.fill("#google-form input[name=client_id]", CID)
    page.click("#google-form button[type=submit]")
    page.wait_for_selector("#google-form >> xpath=.. >> .notice.ok")

    # Mi cuenta: correo
    page.click(".userbox [data-act=cuentaDialog]")
    page.fill("#cuenta-form input[name=email]", "Jefe@Ejemplo.com")
    page.click("#cuenta-form button[type=submit]")
    page.wait_for_selector("#cuenta-form input[value='jefe@ejemplo.com']")
    assert page.locator(".cuenta-google #g-vincular").count() == 1  # sin red el botón no llega a pintarse, pero no rompe
    page.click("[data-act=closeOverlay]")

    # Alguien se registra con Google: sale el aviso y el registro pendiente; se le da acceso como trabajador
    anon = browser.new_context().request
    r = anon.post(f"{url}/api/login/google", headers=o, data={"credential": token(sub="g-7", email="lucia@gmail.com", nombre="Lucía")})
    assert r.ok and r.json()["pendiente"]
    page.goto(f"{url}/#/horarios")
    page.reload()
    page.wait_for_selector(".notif.acceso_pedido")
    page.click("[data-act=verAccesos]")
    page.wait_for_selector("form.acceso")
    page.fill("form.acceso input[name=usuario]", "lucia")
    page.click("form.acceso button[type=submit]")
    page.wait_for_selector("text=lucia@gmail.com >> xpath=ancestor::tr")
    assert page.locator("form.acceso").count() == 0
    r = anon.post(f"{url}/api/login/google", headers=o, data={"credential": token(sub="g-7", email="lucia@gmail.com")})
    assert r.ok and r.json()["username"] == "lucia"

    # Restablecer la contraseña de otra persona
    fila = page.locator("tr", has=page.locator("[data-act=resetUser][data-u=lucia]"))
    fila.locator("[data-act=resetUser]").click()
    clave = page.input_value("#reset-form input[name=password]")
    assert len(clave) >= 8
    page.click("#reset-form button[type=submit]")
    page.wait_for_selector("tr:has([data-u=lucia]) >> text=contraseña temporal")
    r = browser.new_context().request.post(f"{url}/api/login", headers=o, data={"usuario": "lucia", "password": clave})
    assert r.ok and r.json()["cambiar_clave"]

    # Pantalla de entrada: hueco para el botón de Google, sin errores aunque Google no cargue
    page.click("[data-act=logout]")
    page.wait_for_selector("#login-form")
    page.wait_for_selector("#g-login")
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert not errores, errores
    ctx.close()
