"""Cuentas: correo, entrar y registrarse con Google (token verificado aquí, sin librerías) y restablecer contraseñas."""
import base64
import hashlib
import json
import time

import pytest
from fastapi.testclient import TestClient

from app import google
from app.main import create_app
from app.slack import Slack

PW = "contraseña-segura"
CID = "1234567890-abcdefghijklmnop.apps.googleusercontent.com"
# Clave RSA de 2048 bits solo para los tests
N = int("e3f233c60c95bf0ed7557c58cf5144871298f87bdcf47a2d188f4768b4c08f0c22710439c9491b8f0414f36ee3319b4d679a333352f7bcd012d6f66e2bd1a454ecc91aac93b5ca36b07663e43ef5f078dd4dd0c3d049e8fc6560e9fcc78878f2216a01c7d9ed6df63c546ceaea83b314177cda92f241693376c8a6e016cde9e19c7ffe8f67e935ee1fec0a1f37f21b94a9e6a66ca73da6c39bf686a54111404ce002ca1d9f52fee1af5220a186714af0c9acfa88956127fb86319549073ff6c8ce059521d0ecb87fa96ba78bdd88ae9cfe120ef3648f1923c8cd38a7ab15412056c47b3e3031ab38c2f0e54999d8460a9ad9b3795d366c70dcf9c2ef5261196f", 16)
D = int("111fe382d7f43207cfe694b26954ce24a5a1875d6ad29511293cae5d2fe31d7c08645c30692e4c5b38afc84006e275abe18224a190f49aa3391f1c2157ba66b1989e5d1a24f8adc9e104ebe93c4fa6b2b5d180430db557c30a6cb6f76e18131a01a7a09d9e8227562ddf1bd5a42ba3baf92ec08ef493346f90d76f2dfb98999edc9cc0110a4c78bbf8705a667adb499d2ff8d8ed0b76280a3da53cbc39080c33960fe41e10a815bd8301ac0ed4d5d69716f0cbff884d42b51746d54a4517afc7e745c12f3ba69ebb4e3d30e5422ae46fd25a814608656cfd95c29e44cc9b5349953fc40b5bca7af7c807332d8c3b1730d7a9bdecc49df38abe60bff65ad7f47d", 16)


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


JWK = {"kty": "RSA", "kid": "k1", "alg": "RS256", "n": _b64(N.to_bytes(256, "big")), "e": _b64((65537).to_bytes(3, "big"))}


def token(sub="g-1", email="toni@gmail.com", aud=CID, exp=None, verificado=True, nombre="Toni", kid="k1"):
    cab = _b64(json.dumps({"alg": "RS256", "kid": kid, "typ": "JWT"}).encode())
    datos = _b64(json.dumps({"iss": "https://accounts.google.com", "aud": aud, "sub": sub, "email": email,
                             "email_verified": verificado, "name": nombre,
                             "exp": exp if exp is not None else time.time() + 3600}).encode())
    t = google._SHA256_DIGESTINFO + hashlib.sha256(f"{cab}.{datos}".encode()).digest()
    em = b"\x00\x01" + b"\xff" * (256 - len(t) - 3) + b"\x00" + t
    firma = pow(int.from_bytes(em, "big"), D, N).to_bytes(256, "big")
    return f"{cab}.{datos}.{_b64(firma)}"


@pytest.fixture(autouse=True)
def claves_falsas(monkeypatch):
    monkeypatch.setitem(google._cache, "claves", {"k1": JWK})
    monkeypatch.setitem(google._cache, "hasta", time.time() + 3600)


def test_verificar_token():
    assert google.verificar(token(), CID)["email"] == "toni@gmail.com"
    malo = token()[:-4] + ("AAAA" if not token().endswith("AAAA") else "BBBB")
    for t, msg in ((malo, "firma"), (token(aud="otra"), "otra aplicación"), (token(exp=time.time() - 3600), "caducado"),
                   (token(verificado=False), "verificado"), ("basura", "no es válido"), (token(kid="zz"), "firma")):
        with pytest.raises(google.TokenInvalido, match=msg):
            google.verificar(t, CID)


@pytest.fixture()
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("LOPITA_ADMIN_PASSWORD", PW)
    monkeypatch.setenv("LOPITA_SEED", "ejemplo")
    monkeypatch.delenv("LOPITA_GOOGLE_CLIENT_ID", raising=False)
    app = create_app(str(tmp_path / "t.db"), slack=Slack(token="", channel="#h"), secret="test", solve_seconds=8)
    admin = TestClient(app)
    assert admin.post("/api/login", json={"usuario": "admin", "password": PW}).status_code == 200
    return app, admin


def test_correo_en_mi_cuenta_y_unico(env):
    app, admin = env
    r = admin.put("/api/mi/cuenta", json={"email": " Miguel@Ejemplo.com "})
    assert r.status_code == 200 and r.json()["email"] == "miguel@ejemplo.com"
    assert admin.put("/api/mi/cuenta", json={"email": "no-es-correo"}).status_code == 400
    admin.post("/api/usuarios", json={"usuario": "toni", "password": "temporal-123", "rol": "admin"})
    r = admin.put("/api/usuarios/toni/email", json={"email": "MIGUEL@ejemplo.com"})
    assert r.status_code == 400 and "admin" in r.json()["detail"]
    assert admin.get("/api/me").json()["email"] == "miguel@ejemplo.com"


def test_google_desactivado_y_activarlo(env):
    app, admin = env
    anon = TestClient(app)
    assert anon.get("/api/acceso").json() == {"google_client_id": None}
    assert anon.post("/api/login/google", json={"credential": token()}).status_code == 400
    assert admin.put("/api/ajustes/google", json={"client_id": "cualquier-cosa"}).status_code == 400
    assert admin.put("/api/ajustes/google", json={"client_id": CID}).json()["client_id"] == CID
    assert anon.get("/api/acceso").json() == {"google_client_id": CID}


def test_entrar_con_google_si_el_correo_coincide(env):
    app, admin = env
    admin.put("/api/ajustes/google", json={"client_id": CID})
    admin.post("/api/usuarios", json={"usuario": "toni", "password": "temporal-123", "rol": "admin"})
    admin.put("/api/usuarios/toni/email", json={"email": "toni@gmail.com"})
    c = TestClient(app)
    r = c.post("/api/login/google", json={"credential": token()})
    assert r.status_code == 200 and r.json()["username"] == "toni" and r.json()["google"]
    me = c.get("/api/me").json()
    assert me["via_google"] and not me["cambiar_clave"]  # con Google, la temporal sobra
    # Puede ponerse contraseña sin saber la anterior y luego entrar con ella
    assert c.post("/api/mi/clave", json={"actual": "", "nueva": "propia-1234"}).status_code == 200
    assert TestClient(app).post("/api/login", json={"usuario": "toni", "password": "propia-1234"}).status_code == 200
    # Vinculado por su cuenta de Google: entra aunque cambie el correo de Google
    assert TestClient(app).post("/api/login/google", json={"credential": token(email="otro@gmail.com")}).json()["username"] == "toni"
    # Un token falso no entra
    assert TestClient(app).post("/api/login/google", json={"credential": token(aud="otra")}).status_code == 401


def test_registro_con_google_pendiente_hasta_que_lo_aprueba_un_encargado(env):
    app, admin = env
    admin.put("/api/ajustes/google", json={"client_id": CID})
    c = TestClient(app)
    r = c.post("/api/login/google", json={"credential": token(sub="g-2", email="lucia@gmail.com", nombre="Lucía")})
    assert r.status_code == 200 and r.json()["pendiente"]
    assert c.get("/api/me").status_code == 401
    c.post("/api/login/google", json={"credential": token(sub="g-2", email="lucia@gmail.com", nombre="Lucía")})
    [acc] = admin.get("/api/accesos").json()
    assert acc["email"] == "lucia@gmail.com" and admin.get("/api/me").json()["accesos"] == 1
    assert len([n for n in admin.get("/api/notificaciones").json() if n["tipo"] == "acceso_pedido"]) == 1

    assert admin.post(f"/api/accesos/{acc['id']}/aprobar", json={"usuario": "lucia", "rol": "empleado"}).status_code == 400
    r = admin.post(f"/api/accesos/{acc['id']}/aprobar", json={"usuario": "lucia", "rol": "empleado", "empleado_id": "ana"})
    assert r.status_code == 200 and r.json()["accesos"] == []
    u = next(x for x in r.json()["usuarios"] if x["username"] == "lucia")
    assert u["email"] == "lucia@gmail.com" and u["google"] and u["empleado_id"] == "ana"
    r = c.post("/api/login/google", json={"credential": token(sub="g-2", email="lucia@gmail.com")})
    assert r.json()["username"] == "lucia" and c.get("/api/me").json()["rol"] == "empleado"

    # Rechazado: no vuelve a pedir acceso
    c2 = TestClient(app)
    c2.post("/api/login/google", json={"credential": token(sub="g-3", email="x@gmail.com")})
    [acc] = admin.get("/api/accesos").json()
    admin.post(f"/api/accesos/{acc['id']}/rechazar")
    assert c2.post("/api/login/google", json={"credential": token(sub="g-3", email="x@gmail.com")}).status_code == 403
    assert admin.get("/api/accesos").json() == []


def test_encargado_restablece_la_contrasena(env):
    app, admin = env
    admin.post("/api/usuarios", json={"usuario": "toni", "password": "temporal-123", "rol": "admin"})
    c = TestClient(app)
    assert c.post("/api/login", json={"usuario": "toni", "password": "temporal-123"}).status_code == 200
    assert admin.post("/api/usuarios/toni/clave", json={"password": "corta"}).status_code == 400
    assert admin.post("/api/usuarios/admin/clave", json={"password": "otra-larga-1"}).status_code == 400
    assert admin.post("/api/usuarios/toni/clave", json={"password": "nueva-temporal"}).status_code == 200
    c = TestClient(app)
    r = c.post("/api/login", json={"usuario": "toni", "password": "nueva-temporal"})
    assert r.status_code == 200 and r.json()["cambiar_clave"]
    assert c.get("/api/config").status_code == 403  # primero tiene que cambiarla


def test_vincular_google_desde_mi_cuenta(env):
    app, admin = env
    admin.put("/api/ajustes/google", json={"client_id": CID})
    r = admin.post("/api/mi/google", json={"credential": token(sub="g-9", email="jefe@gmail.com")})
    assert r.status_code == 200 and r.json()["google"] and r.json()["email"] == "jefe@gmail.com"
    assert TestClient(app).post("/api/login/google", json={"credential": token(sub="g-9", email="jefe@gmail.com")}).json()["username"] == "admin"
    assert admin.delete("/api/mi/google").json()["google"] is False
