"""Criteria 3 to 9: Google login, cookie, `state`, session, CSRF and logout."""

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


def test_criterion_3_login_redirects_to_google_with_minimal_scopes_state_and_nonce(
    app: FastAPI,
) -> None:
    params = start_login(TestClient(app))

    assert params["scope"].split() == ["openid", "email", "profile"]
    assert params["state"]
    assert params["nonce"]
    assert params["response_type"] == "code"


def test_criterion_3_login_generates_different_state_and_nonce_per_request(app: FastAPI) -> None:
    client = TestClient(app)
    params1 = start_login(client)
    params2 = start_login(client)

    assert params1["state"] != params2["state"]
    assert params1["nonce"] != params2["nonce"]


def test_criterion_4_first_login_creates_user_map_and_root(
    login: Callable[..., TestClient], db: Session
) -> None:
    client = login(sub="sub-new", name="Ana Pérez")

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


def test_criterion_4_signing_in_again_keeps_a_single_user_and_map(
    login: Callable[..., TestClient], db: Session
) -> None:
    first = login(sub="sub-repeated").get("/api/me").json()
    second = login(sub="sub-repeated", name="Ana Renamed").get("/api/me").json()

    assert second["root_node_id"] == first["root_node_id"]
    assert second["name"] == "Ana Renamed"
    assert (count(db, "users"), count(db, "maps"), count(db, "sessions")) == (1, 1, 2)


def test_criterion_4_name_with_spaces_empty_or_long_is_normalized(
    login: Callable[..., TestClient], db: Session
) -> None:
    c1 = login(sub="sub-spaces", name="   Juan    Carlos   ")
    root_id1 = c1.get("/api/me").json()["root_node_id"]
    title1 = db.execute(
        text("SELECT title FROM nodes WHERE id = :id"), {"id": root_id1}
    ).scalar_one()
    assert title1 == "Juan Carlos"

    c2 = login(sub="sub-empty", name="   ")
    root_id2 = c2.get("/api/me").json()["root_node_id"]
    title2 = db.execute(
        text("SELECT title FROM nodes WHERE id = :id"), {"id": root_id2}
    ).scalar_one()
    assert title2 == DEFAULT_ROOT_TITLE

    c3 = login(sub="sub-long", name="L" * 300)
    root_id3 = c3.get("/api/me").json()["root_node_id"]
    title3 = db.execute(
        text("SELECT title FROM nodes WHERE id = :id"), {"id": root_id3}
    ).scalar_one()
    assert len(title3) == 200
    assert title3 == "L" * 200


def test_criterion_5_cookie_httponly_samesite_lax_without_secure_by_default(
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


def test_criterion_5_cookie_secure_when_the_variable_enables_it(
    make_app: Callable[..., FastAPI], fake_google: FakeGoogle
) -> None:
    app = make_app(cookie_secure=True, google_redirect_uri="https://testserver/api/auth/callback")
    client = TestClient(app, base_url="https://testserver")

    response = complete_login(client, fake_google)

    assert response.status_code == 303
    assert "secure" in session_cookie_header(response).lower()


def test_criterion_5_no_google_token_in_responses_or_tables(
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


def test_criterion_6_callback_without_state_is_rejected_without_creating_rows(
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


def test_criterion_6_callback_with_different_state_is_rejected_without_creating_rows(
    app: FastAPI, fake_google: FakeGoogle, db: Session
) -> None:
    client = TestClient(app)
    params = start_login(client)
    fake_google.prepare(params["nonce"], "sub-x", "X", "x@example.com")

    response = client.get(
        "/api/auth/callback",
        params={"code": fake_google.code, "state": "made-up-state"},
        follow_redirects=False,
    )

    assert 400 <= response.status_code < 500
    assert SESSION_COOKIE not in response.cookies
    assert (count(db, "users"), count(db, "sessions")) == (0, 0)


def test_criterion_6_callback_with_different_nonce_is_rejected(
    app: FastAPI, fake_google: FakeGoogle, db: Session
) -> None:
    client = TestClient(app)
    params = start_login(client)
    fake_google.prepare("nonce-from-another-flow", "sub-x", "X", "x@example.com")

    response = client.get(
        "/api/auth/callback",
        params={"code": fake_google.code, "state": params["state"]},
        follow_redirects=False,
    )

    assert 400 <= response.status_code < 500
    assert (count(db, "users"), count(db, "sessions")) == (0, 0)


def test_criterion_6_callback_without_flow_cookie_is_rejected(
    app: FastAPI, fake_google: FakeGoogle, db: Session
) -> None:
    """A callback request without a started login (no oauth session cookie) is rejected."""
    client = TestClient(app)
    fake_google.prepare("nonce-x", "sub-x", "X", "x@example.com")

    response = client.get(
        "/api/auth/callback",
        params={"code": fake_google.code, "state": "any-state"},
        follow_redirects=False,
    )

    assert 400 <= response.status_code < 500
    assert SESSION_COOKIE not in response.cookies
    assert (count(db, "users"), count(db, "sessions")) == (0, 0)


PROTECTED_REQUESTS = [
    ("GET", "/api/me", None),
    ("PATCH", "/api/me/settings", {"depth": 5}),
    ("GET", "/api/nodes/{root}/view", None),
    ("POST", "/api/nodes/{root}/children", {"title": "child"}),
    ("PATCH", "/api/nodes/{root}", {"title": "other", "version": 1}),
    ("DELETE", "/api/nodes/{root}", None),
]


def assert_all_unauthorized(app: FastAPI, root_id: str, cookie: str | None) -> None:
    """Requests every protected endpoint from a client with no stored cookies."""
    headers = dict(CSRF)
    if cookie is not None:
        headers["Cookie"] = f"{SESSION_COOKIE}={cookie}"
    anonymous = TestClient(app)
    for method, path, body in PROTECTED_REQUESTS:
        response = anonymous.request(method, path.format(root=root_id), json=body, headers=headers)
        assert response.status_code == 401, (method, path)
        assert response.json()["detail"] == "invalid or expired session", (method, path)


def test_criterion_7_no_cookie_or_made_up_cookie_returns_401(
    app: FastAPI, client: TestClient
) -> None:
    root_id = client.get("/api/me").json()["root_node_id"]

    assert_all_unauthorized(app, root_id, cookie=None)
    assert_all_unauthorized(app, root_id, cookie="")
    assert_all_unauthorized(app, root_id, cookie="made-up-cookie")


def test_criterion_7_expired_session_returns_401(
    app: FastAPI, client: TestClient, db: Session
) -> None:
    root_id = client.get("/api/me").json()["root_node_id"]
    db.execute(update(UserSession).values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
    db.commit()

    assert_all_unauthorized(app, root_id, cookie=client.cookies[SESSION_COOKIE])
    assert client.get("/api/me").status_code == 401


def test_criterion_8_patch_settings_without_csrf_header_returns_403(client: TestClient) -> None:
    response = client.patch("/api/me/settings", json={"depth": 5})

    assert response.status_code == 403
    assert response.json()["detail"] == "missing header X-CSRF: 1"
    assert client.get("/api/me").json()["settings"]["depth"] == 3


def test_criterion_8_csrf_header_with_wrong_value_returns_403(client: TestClient) -> None:
    response = client.patch("/api/me/settings", json={"depth": 5}, headers={"X-CSRF": "0"})

    assert response.status_code == 403
    assert client.get("/api/me").json()["settings"]["depth"] == 3


def test_criterion_8_patch_settings_with_empty_csrf_header_returns_403(client: TestClient) -> None:
    response = client.patch("/api/me/settings", json={"depth": 5}, headers={"X-CSRF": ""})

    assert response.status_code == 403
    assert client.get("/api/me").json()["settings"]["depth"] == 3


def test_criterion_9_logout_invalidates_the_session(
    app: FastAPI, client: TestClient, db: Session
) -> None:
    token = client.cookies[SESSION_COOKIE]

    response = client.post("/api/auth/logout", headers=CSRF)

    assert response.status_code == 204
    assert count(db, "sessions") == 0
    reused = TestClient(app).get("/api/me", headers={"Cookie": f"{SESSION_COOKIE}={token}"})
    assert reused.status_code == 401


def test_criterion_9_logout_clears_the_cookie_in_the_response(client: TestClient) -> None:
    response = client.post("/api/auth/logout", headers=CSRF)

    assert response.status_code == 204
    set_cookies = [
        c for c in response.headers.get_list("set-cookie") if c.startswith(SESSION_COOKIE)
    ]
    assert len(set_cookies) == 1
    cookie = set_cookies[0].lower()
    # The cookie must expire (max-age=0 or an empty value)
    assert "max-age=0" in cookie or 'sid=""' in cookie or "sid=;" in cookie


def test_criterion_9_logout_without_active_session_returns_204(app: FastAPI) -> None:
    anonymous = TestClient(app)
    response = anonymous.post("/api/auth/logout", headers=CSRF)
    assert response.status_code == 204


def test_criterion_9_logout_requires_csrf_header(client: TestClient, db: Session) -> None:
    assert client.post("/api/auth/logout").status_code == 403
    assert count(db, "sessions") == 1


def test_root_title_normalizes_spaces_and_has_a_default_value() -> None:
    def identity(name: str) -> GoogleIdentity:
        return GoogleIdentity(sub="s", email="", name=name, avatar_url=None)

    assert root_title(identity("  Ana   Pérez ")) == "Ana Pérez"
    assert root_title(identity("   ")) == DEFAULT_ROOT_TITLE
    assert len(root_title(identity("x" * 500))) == 200
