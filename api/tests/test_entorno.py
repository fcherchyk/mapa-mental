"""Criterios 1, 2 y 18: compose, migraciones y aislamiento de la base de tests."""

import json
import os
import subprocess
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy import Engine, inspect, make_url

from app.config import DEFAULT_REDIRECT_URI, Config

REPO_DIR = Path(__file__).resolve().parents[2]
ENV_EXAMPLE = REPO_DIR / ".env.example"
SECRET_VARIABLES = {
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "SESSION_SECRET",
    "POSTGRES_PASSWORD",
}
REQUIRED_VARIABLES = SECRET_VARIABLES | {"DATABASE_URL", "COOKIE_SECURE"}


def read_env_example() -> dict[str, str]:
    values = {}
    for line in ENV_EXAMPLE.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            key, _, value = line.partition("=")
            values[key.strip()] = value.strip()
    return values


def compose_config() -> dict:
    result = subprocess.run(
        ["docker", "compose", "--env-file", str(ENV_EXAMPLE), "config", "--format", "json"],
        cwd=REPO_DIR,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def test_criterio_1_compose_solo_db_y_api_con_puertos_en_localhost() -> None:
    config = compose_config()

    assert set(config["services"]) == {"db", "api"}
    db = config["services"]["db"]
    assert db["image"] == "postgres:16"
    named_volumes = [v for v in db["volumes"] if v["type"] == "volume"]
    assert named_volumes and named_volumes[0]["source"] in config["volumes"]
    for service in config["services"].values():
        for port in service.get("ports", []):
            assert port["host_ip"] == "127.0.0.1"


def test_criterio_1_env_example_sin_valores_reales_y_env_fuera_del_repo() -> None:
    values = read_env_example()

    assert REQUIRED_VARIABLES <= set(values)
    assert all(values[name] == "" for name in SECRET_VARIABLES)
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=REPO_DIR, capture_output=True, text=True, check=True
    ).stdout.splitlines()
    assert ".env" not in tracked


def test_criterio_2_migraciones_crean_tablas_unique_e_indices(admin_engine: Engine) -> None:
    inspector = inspect(admin_engine)

    assert {"users", "sessions", "maps", "nodes"} <= set(inspector.get_table_names())
    unique_columns = [c["column_names"] for c in inspector.get_unique_constraints("maps")]
    assert ["owner_id"] in unique_columns
    node_indexes = [i["column_names"] for i in inspector.get_indexes("nodes")]
    assert ["map_id"] in node_indexes
    assert ["parent_id", "sort_key"] in node_indexes


def test_criterio_18_la_app_de_tests_usa_el_postgres_de_testcontainers(
    app: FastAPI, postgres_url: str
) -> None:
    engine_url = app.state.engine.url

    assert engine_url == make_url(postgres_url)
    dev_url = os.environ.get("DATABASE_URL")
    assert dev_url is None or engine_url != make_url(dev_url)


def test_config_lee_variables_de_entorno() -> None:
    config = Config.from_env(
        {
            "DATABASE_URL": "postgresql+psycopg://u:p@db/x",
            "SESSION_SECRET": "s",
            "COOKIE_SECURE": "true",
        }
    )

    assert config.cookie_secure is True
    assert config.google_redirect_uri == DEFAULT_REDIRECT_URI
    assert config.session_ttl_days == 30
    assert Config.from_env({"DATABASE_URL": "x", "SESSION_SECRET": "s"}).cookie_secure is False
