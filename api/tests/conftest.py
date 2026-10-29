"""Fixtures: PostgreSQL 16 efímero (testcontainers), app de tests y Google falso."""

from collections.abc import Callable, Iterator
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

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


@pytest.fixture(scope="session")
def postgres_url() -> Iterator[str]:
    """Un PostgreSQL 16 por sesión de tests, migrado con Alembic; nunca la base de desarrollo."""
    with PostgresContainer("postgres:16", driver="psycopg") as postgres:
        url = postgres.get_connection_url()
        migrate(url)
        yield url


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
    """Cada test que usa la base arranca con las tablas vacías."""
    if "postgres_url" not in request.fixturenames:
        return
    with request.getfixturevalue("admin_engine").begin() as connection:
        connection.execute(text("TRUNCATE users, sessions, maps, nodes CASCADE"))


@pytest.fixture(autouse=True)
def fake_google(monkeypatch: pytest.MonkeyPatch) -> FakeGoogle:
    """El tráfico HTTP saliente (el de Authlib) lo atiende el Google falso; nada sale a la red."""
    fake = FakeGoogle(CLIENT_ID)

    async def handle(_transport: httpx.AsyncHTTPTransport, request: httpx.Request):
        return await fake.handle(request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", handle)
    return fake


def start_login(client: TestClient) -> dict[str, str]:
    """Pide el inicio del login y devuelve los parámetros de la redirección a Google."""
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
    """Devuelve un cliente nuevo con sesión iniciada para el usuario de Google indicado."""

    def do_login(sub: str = "google-sub-ana", name: str = "Ana Pérez") -> TestClient:
        client = TestClient(app, base_url="http://testserver")
        response = complete_login(client, fake_google, sub=sub, name=name)
        assert response.status_code == 303, response.text
        return client

    return do_login


@pytest.fixture
def client(login: Callable[..., TestClient]) -> TestClient:
    return login()
