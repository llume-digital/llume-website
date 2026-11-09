"""Los errores de un formulario salen junto al campo que los causa, marcados y anunciados."""
import pytest

from tests.test_feedback_cliente_navegador import _entrar

pytest.importorskip("playwright.sync_api")


def test_error_de_baja_junto_a_su_campo(url, browser):  # noqa: F811
    ctx, page, errores = _entrar(browser, url, movil=False)
    emp = page.request.get(f"{url}/api/config").json()["config"]["empleados"][0]["id"]
    page.goto(f"{url}/#/equipo/{emp}")
    page.click(f"[data-act=bajaDialog][data-emp='{emp}']")
    page.fill("#baja-form input[name=desde]", "2026-12-10")
    page.fill("#baja-form input[name=hasta]", "2026-12-01")
    page.click("#baja-form button[type=submit]")
    page.wait_for_selector("#baja-form .field-error")
    campo = page.locator("#baja-form input[name=hasta]")
    assert campo.get_attribute("aria-invalid") == "true"
    assert "no puede acabar antes" in page.inner_text("#baja-form .field-error")
    assert page.evaluate("document.activeElement.name") == "hasta"
    assert page.locator("#baja-form .form-error").count() == 0
    # Al corregirlo y reenviar, el aviso desaparece.
    page.fill("#baja-form input[name=hasta]", "2026-12-20")
    page.click("#baja-form button[type=submit]")
    page.wait_for_selector("#baja-form", state="detached")
    assert errores == []
    ctx.close()
