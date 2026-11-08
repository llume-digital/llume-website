"""Comentarios sobre la app: se envían desde cualquier pantalla, quedan guardados y el encargado los gestiona."""
from fastapi.testclient import TestClient

from tests.test_roles import env, make_worker  # noqa: F401  (fixture)


def test_enviar_gestionar_y_responder(env):  # noqa: F811
    app, admin = env
    assert TestClient(app).post("/api/comentarios", json={"texto": "hola que tal"}).status_code == 401
    w = make_worker(app, admin)
    r = w.post("/api/comentarios", json={"tipo": "error", "texto": "No veo mis horas del mes", "pantalla": "Mis horas"})
    assert r.status_code == 200 and r.json()["estado"] == "nuevo"
    cid = r.json()["id"]
    admin.post("/api/comentarios", json={"texto": "Idea del encargado"})
    assert len(w.get("/api/comentarios").json()) == 1  # cada trabajador ve solo los suyos
    assert len(admin.get("/api/comentarios").json()) == 2
    assert admin.get("/api/me").json()["comentarios"] == 2
    assert w.patch(f"/api/comentarios/{cid}", json={"estado": "hecho"}).status_code == 403
    r = admin.patch(f"/api/comentarios/{cid}", json={"estado": "hecho", "respuesta": "Arreglado, gracias"})
    assert r.json()["estado"] == "hecho" and r.json()["respondido_por"] == "admin"
    mio = w.get("/api/comentarios").json()[0]
    assert mio["respuesta"] == "Arreglado, gracias" and mio["pantalla"] == "Mis horas"
    csv = admin.get("/api/comentarios.csv")
    assert csv.status_code == 200 and "No veo mis horas del mes" in csv.text and "Hecho" in csv.text
    assert admin.post("/api/comentarios", json={"texto": "  "}).status_code in (400, 422)
