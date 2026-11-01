"""Fixtures: ephemeral PostgreSQL 16, test app and fake Google.

The test database is picked in this order: `TEST_DATABASE_URL`, testcontainers if Docker responds,
or an embedded PostgreSQL with `pgserver`. If none is available, only the tests that use it skip.
"""

import importlib.util
import os
import tempfile
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import docker
import httpx
import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker
from testcontainers.postgres import PostgresContainer

from app.config import Config
from app.main import create_app
from tests.fake_google import FakeGoogle

API_DIR = Path(__file__).resolve().parent.parent
CLIENT_ID = "test-client-id.apps.googleusercontent.com"
CSRF = {"X-CSRF": "1"}


def migrate(database_url: str) -> None:
    alembic_config = AlembicConfig(str(API_DIR / "alembic.ini"))
    alembic_config.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(alembic_config, "head")


def docker_available() -> bool:
    try:
        client = docker.from_env(timeout=3)
        try:
            return bool(client.ping())
        finally:
            client.close()
    except Exception:
        return False


def database_backend() -> str | None:
    """Where the test database comes from: "url", "docker", "pgserver" or None if none."""
    if os.environ.get("TEST_DATABASE_URL"):
        return "url"
    if docker_available():
        return "docker"
    if importlib.util.find_spec("pgserver") is not None:
        return "pgserver"
    return None


def pytest_report_header() -> str:
    backend = database_backend()
    labels = {
        "url": "TEST_DATABASE_URL",
        "docker": "testcontainers (Docker)",
        "pgserver": "embedded PostgreSQL (pgserver)",
    }
    return f"test database: {labels.get(backend, 'none, database tests will be skipped')}"


@contextmanager
def embedded_postgres() -> Iterator[str]:
    """pgserver PostgreSQL 16 in a temporary folder, over a Unix socket; removed when done."""
    import pgserver

    with tempfile.TemporaryDirectory(prefix="mindmap-pg-") as pgdata:
        server = pgserver.get_server(pgdata, cleanup_mode="delete")
        try:
            yield server.get_uri().replace("postgresql://", "postgresql+psycopg://", 1)
        finally:
            server.cleanup()


@pytest.fixture(scope="session")
def postgres_url() -> Iterator[str]:
    """One PostgreSQL 16 per test session, migrated with Alembic; never the dev database."""
    backend = database_backend()
    if backend == "url":
        # It must be an empty, disposable database: the tests truncate its tables.
        url = os.environ["TEST_DATABASE_URL"]
        migrate(url)
        yield url
    elif backend == "docker":
        with PostgresContainer("postgres:16", driver="psycopg") as postgres:
            url = postgres.get_connection_url()
            migrate(url)
            yield url
    elif backend == "pgserver":
        with embedded_postgres() as url:
            migrate(url)
            yield url
    else:
        pytest.skip(
            "No PostgreSQL available: set TEST_DATABASE_URL, start Docker or install pgserver"
        )


def make_config(postgres_url: str, **overrides: object) -> Config:
    values: dict = {
        "database_url": postgres_url,
        "session_secret": "test-session-secret-0123456789abcdef",
        "google_client_id": CLIENT_ID,
        "google_client_secret": "test-client-secret",
        "google_redirect_uri": "http://testserver/api/auth/callback",
    }
    values.update(overrides)
    return Config(**values)


@pytest.fixture
def make_app(postgres_url: str) -> Iterator[Callable[..., FastAPI]]:
    apps: list[FastAPI] = []

    def factory(**overrides: object) -> FastAPI:
        app = create_app(make_config(postgres_url, **overrides))
        apps.append(app)
        return app

    yield factory
    for app in apps:
        app.state.engine.dispose()


@pytest.fixture
def app(make_app: Callable[..., FastAPI]) -> FastAPI:
    return make_app()


@pytest.fixture
def db(app: FastAPI) -> Iterator[Session]:
    factory: sessionmaker[Session] = app.state.session_factory
    with factory() as session:
        yield session


@pytest.fixture(scope="session")
def admin_engine(postgres_url: str) -> Iterator[Engine]:
    engine = create_engine(postgres_url)
    yield engine
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_tables(request: pytest.FixtureRequest) -> None:
    """Every test that uses the database starts with empty tables."""
    if "postgres_url" not in request.fixturenames:
        return
    with request.getfixturevalue("admin_engine").begin() as connection:
        connection.execute(text("TRUNCATE users, sessions, maps, nodes CASCADE"))


@pytest.fixture(autouse=True)
def fake_google(monkeypatch: pytest.MonkeyPatch) -> FakeGoogle:
    """Outgoing HTTP traffic (Authlib's) is served by the fake Google; nothing goes out."""
    fake = FakeGoogle(CLIENT_ID)

    async def handle(_transport: httpx.AsyncHTTPTransport, request: httpx.Request):
        return await fake.handle(request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", handle)
    return fake


def start_login(client: TestClient) -> dict[str, str]:
    """Starts the login and returns the parameters of the redirect to Google."""
    response = client.get("/api/auth/login", follow_redirects=False)
    assert response.status_code in (302, 303, 307)
    query = parse_qs(urlsplit(response.headers["location"]).query)
    return {key: values[0] for key, values in query.items()}


def complete_login(
    client: TestClient,
    fake: FakeGoogle,
    sub: str = "google-sub-ana",
    name: str = "Ana Pérez",
    email: str = "ana@example.com",
) -> httpx.Response:
    params = start_login(client)
    fake.prepare(nonce=params["nonce"], sub=sub, name=name, email=email)
    return client.get(
        "/api/auth/callback",
        params={"code": fake.code, "state": params["state"]},
        follow_redirects=False,
    )


@pytest.fixture
def login(app: FastAPI, fake_google: FakeGoogle) -> Callable[..., TestClient]:
    """Returns a new client with a signed-in session for the given Google user."""

    def do_login(sub: str = "google-sub-ana", name: str = "Ana Pérez") -> TestClient:
        client = TestClient(app, base_url="http://testserver")
        response = complete_login(client, fake_google, sub=sub, name=name)
        assert response.status_code == 303, response.text
        return client

    return do_login


@pytest.fixture
def client(login: Callable[..., TestClient]) -> TestClient:
    return login()
