"""Criterios 3 a 9: login con Google, cookie, `state`, sesión, CSRF y logout."""

from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import text, update
from sqlalchemy.orm import Session

from app.auth.google import GoogleIdentity
from app.auth.onboarding import DEFAULT_ROOT_TITLE, root_title
from app.auth.sessions import SESSION_COOKIE, hash_token
from app.models import UserSession
from tests.conftest import CSRF, complete_login, start_login
from tests.fake_google import FakeGoogle

TABLES = ("users", "sessions", "maps", "nodes")


def count(db: Session, table: str) -> int:
    return db.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()


def dump_tables(db: Session) -> str:
    return " ".join(
        str(row) for table in TABLES for row in db.execute(text(f"SELECT * FROM {table}")).all()
    )


def session_cookie_header(response) -> str:
    cookies = [c for c in response.headers.get_list("set-cookie") if c.startswith(SESSION_COOKIE)]
    assert len(cookies) == 1
    return cookies[0]


def test_criterio_3_login_redirige_a_google_con_scopes_minimos_state_y_nonce(
    app: FastAPI,
) -> None:
    params = start_login(TestClient(app))

    assert params["scope"].split() == ["openid", "email", "profile"]
    assert params["state"]
    assert params["nonce"]
    assert params["response_type"] == "code"


def test_criterio_4_primer_login_crea_user_map_y_raiz(
    login: Callable[..., TestClient], db: Session
) -> None:
    client = login(sub="sub-nueva", name="Ana Pérez")

    me = client.get("/api/me")
    assert me.status_code == 200
    body = me.json()
    assert body["settings"]["depth"] == 3
    root = db.execute(
        text("SELECT kind, title, parent_id FROM nodes WHERE id = :id"),
        {"id": body["root_node_id"]},
    ).one()
    assert (root.kind, root.title, root.parent_id) == ("idea", "Ana Pérez", None)
    assert (count(db, "users"), count(db, "maps"), count(db, "nodes")) == (1, 1, 1)


def test_criterio_4_reingreso_mantiene_un_solo_user_y_map(
    login: Callable[..., TestClient], db: Session
) -> None:
    first = login(sub="sub-repetida").get("/api/me").json()
    second = login(sub="sub-repetida", name="Ana Renombrada").get("/api/me").json()

    assert second["root_node_id"] == first["root_node_id"]
    assert second["name"] == "Ana Renombrada"
    assert (count(db, "users"), count(db, "maps"), count(db, "sessions")) == (1, 1, 2)


def test_criterio_5_cookie_httponly_samesite_lax_sin_secure_por_defecto(
    app: FastAPI, fake_google: FakeGoogle, db: Session
) -> None:
    response = complete_login(TestClient(app), fake_google)

    cookie = session_cookie_header(response).lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie
    assert "secure" not in cookie
    token = response.cookies[SESSION_COOKIE]
    session_ids = db.execute(text("SELECT id FROM sessions")).scalars().all()
    assert session_ids == [hash_token(token)]
    assert token not in session_ids


def test_criterio_5_cookie_secure_si_la_variable_lo_activa(
    make_app: Callable[..., FastAPI], fake_google: FakeGoogle
) -> None:
    app = make_app(cookie_secure=True, google_redirect_uri="https://testserver/api/auth/callback")
    client = TestClient(app, base_url="https://testserver")

    response = complete_login(client, fake_google)

    assert response.status_code == 303
    assert "secure" in session_cookie_header(response).lower()


def test_criterio_5_ningun_token_de_google_en_respuestas_ni_tablas(
    app: FastAPI, fake_google: FakeGoogle, db: Session
) -> None:
    client = TestClient(app)
    callback = complete_login(client, fake_google)
    me = client.get("/api/me")

    issued = fake_google.issued[-1]
    google_tokens = [issued["access_token"], issued["refresh_token"], issued["id_token"]]
    exposed = callback.text + str(callback.headers) + me.text + str(me.headers)
    stored = dump_tables(db)
    for token in google_tokens:
        assert token not in exposed
        assert token not in stored
    for field in ("access_token", "id_token", "refresh_token"):
        assert field not in me.text


def test_criterio_6_callback_sin_state_se_rechaza_sin_crear_filas(
    app: FastAPI, fake_google: FakeGoogle, db: Session
) -> None:
    client = TestClient(app)
    params = start_login(client)
    fake_google.prepare(params["nonce"], "sub-x", "X", "x@example.com")

    response = client.get(
        "/api/auth/callback", params={"code": fake_google.code}, follow_redirects=False
    )

    assert 400 <= response.status_code < 500
    assert SESSION_COOKIE not in response.cookies
    assert (count(db, "users"), count(db, "sessions")) == (0, 0)


def test_criterio_6_callback_con_state_distinto_se_rechaza_sin_crear_filas(
    app: FastAPI, fake_google: FakeGoogle, db: Session
) -> None:
    client = TestClient(app)
    params = start_login(client)
    fake_google.prepare(params["nonce"], "sub-x", "X", "x@example.com")

    response = client.get(
        "/api/auth/callback",
        params={"code": fake_google.code, "state": "state-inventado"},
        follow_redirects=False,
    )

    assert 400 <= response.status_code < 500
    assert SESSION_COOKIE not in response.cookies
    assert (count(db, "users"), count(db, "sessions")) == (0, 0)


def test_criterio_6_callback_con_nonce_distinto_se_rechaza(
    app: FastAPI, fake_google: FakeGoogle, db: Session
) -> None:
    client = TestClient(app)
    params = start_login(client)
    fake_google.prepare("nonce-de-otro-flujo", "sub-x", "X", "x@example.com")

    response = client.get(
        "/api/auth/callback",
        params={"code": fake_google.code, "state": params["state"]},
        follow_redirects=False,
    )

    assert 400 <= response.status_code < 500
    assert (count(db, "users"), count(db, "sessions")) == (0, 0)


PROTECTED_REQUESTS = [
    ("GET", "/api/me", None),
    ("PATCH", "/api/me/settings", {"depth": 5}),
    ("GET", "/api/nodes/{root}/view", None),
    ("POST", "/api/nodes/{root}/children", {"title": "hijo"}),
    ("PATCH", "/api/nodes/{root}", {"title": "otro", "version": 1}),
    ("DELETE", "/api/nodes/{root}", None),
]


def assert_all_unauthorized(app: FastAPI, root_id: str, cookie: str | None) -> None:
    """Pide cada endpoint protegido desde un cliente sin cookies guardadas."""
    headers = dict(CSRF)
    if cookie is not None:
        headers["Cookie"] = f"{SESSION_COOKIE}={cookie}"
    anonymous = TestClient(app)
    for method, path, body in PROTECTED_REQUESTS:
        response = anonymous.request(method, path.format(root=root_id), json=body, headers=headers)
        assert response.status_code == 401, (method, path)


def test_criterio_7_sin_cookie_o_cookie_inventada_responde_401(
    app: FastAPI, client: TestClient
) -> None:
    root_id = client.get("/api/me").json()["root_node_id"]

    assert_all_unauthorized(app, root_id, cookie=None)
    assert_all_unauthorized(app, root_id, cookie="cookie-inventada")


def test_criterio_7_sesion_vencida_responde_401(
    app: FastAPI, client: TestClient, db: Session
) -> None:
    root_id = client.get("/api/me").json()["root_node_id"]
    db.execute(update(UserSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
    db.commit()

    assert_all_unauthorized(app, root_id, cookie=client.cookies[SESSION_COOKIE])
    assert client.get("/api/me").status_code == 401


def test_criterio_8_patch_settings_sin_header_csrf_responde_403(client: TestClient) -> None:
    response = client.patch("/api/me/settings", json={"depth": 5})

    assert response.status_code == 403
    assert client.get("/api/me").json()["settings"]["depth"] == 3


def test_criterio_8_header_csrf_con_valor_incorrecto_responde_403(client: TestClient) -> None:
    response = client.patch("/api/me/settings", json={"depth": 5}, headers={"X-CSRF": "0"})

    assert response.status_code == 403


def test_criterio_9_logout_invalida_la_sesion(
    app: FastAPI, client: TestClient, db: Session
) -> None:
    token = client.cookies[SESSION_COOKIE]

    response = client.post("/api/auth/logout", headers=CSRF)

    assert response.status_code == 204
    assert count(db, "sessions") == 0
    reused = TestClient(app).get("/api/me", headers={"Cookie": f"{SESSION_COOKIE}={token}"})
    assert reused.status_code == 401


def test_criterio_9_logout_exige_header_csrf(client: TestClient, db: Session) -> None:
    assert client.post("/api/auth/logout").status_code == 403
    assert count(db, "sessions") == 1


def test_titulo_de_raiz_normaliza_espacios_y_tiene_valor_por_defecto() -> None:
    def identity(name: str) -> GoogleIdentity:
        return GoogleIdentity(sub="s", email="", name=name, avatar_url=None)

    assert root_title(identity("  Ana   Pérez ")) == "Ana Pérez"
    assert root_title(identity("   ")) == DEFAULT_ROOT_TITLE
    assert len(root_title(identity("x" * 500))) == 200
