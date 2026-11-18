"""Slice 3, criteria S3_BE_AC1 to AC10: a node's description and reading one node by id."""

import uuid
from collections.abc import Callable

import pytest
from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, inspect, text

from app.nodes.schemas import DESCRIPTION_MAX_LENGTH
from tests.conftest import API_DIR, CSRF
from tests.test_nodes import add, patch, root_id, view


def detail(client: TestClient, node_id: str) -> dict:
    response = client.get(f"/api/nodes/{node_id}")
    assert response.status_code == 200, response.text
    return response.json()


def alembic(postgres_url: str) -> AlembicConfig:
    config = AlembicConfig(str(API_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", postgres_url)
    return config


# --- S3_BE_AC1: migration -------------------------------------------------------------------


def test_S3_BE_AC1_migration_adds_a_not_null_column_and_fills_existing_rows(
    client: TestClient, postgres_url: str, admin_engine: Engine
) -> None:
    node = add(client, root_id(client), "Before the migration")
    config = alembic(postgres_url)

    command.downgrade(config, "0001")
    try:
        assert "description" not in {c["name"] for c in inspect(admin_engine).get_columns("nodes")}
    finally:
        command.upgrade(config, "head")

    columns = inspect(admin_engine).get_columns("nodes")
    column = next(c for c in columns if c["name"] == "description")
    assert column["nullable"] is False
    with admin_engine.connect() as connection:
        stored = connection.execute(
            text("SELECT description FROM nodes WHERE id = :id"), {"id": node["id"]}
        ).scalar_one()
    assert stored == ""


# --- S3_BE_AC2: new nodes start empty -------------------------------------------------------


def test_S3_BE_AC2_root_and_new_children_have_an_empty_description(client: TestClient) -> None:
    root = root_id(client)
    child = add(client, root, "Child")

    assert detail(client, root)["description"] == ""
    assert detail(client, child["id"])["description"] == ""


def test_S3_BE_AC2_creating_with_a_description_returns_422(client: TestClient) -> None:
    response = client.post(
        f"/api/nodes/{root_id(client)}/children",
        json={"title": "X", "description": "not here"},
        headers=CSRF,
    )

    assert response.status_code == 422
    assert view(client, root_id(client), depth=1)["nodes"] == []


# --- S3_BE_AC3: read one node ---------------------------------------------------------------


def test_S3_BE_AC3_get_returns_the_node_out_fields_plus_description(client: TestClient) -> None:
    root = root_id(client)
    node = add(client, root, "N")
    add(client, node["id"], "child")
    from_window = next(n for n in view(client, root, depth=2)["nodes"] if n["id"] == node["id"])

    body = detail(client, node["id"])

    expected = {k: v for k, v in from_window.items() if k != "level"}
    # `path` joined the detail in slice 4B (decision D12); it is covered by S4B_BE_AC10.
    assert {k: v for k, v in body.items() if k not in ("description", "path")} == expected
    assert body["description"] == ""
    assert body["child_count"] == 1


# --- S3_BE_AC4: the window stays light ------------------------------------------------------


def test_S3_BE_AC4_view_carries_no_description(client: TestClient) -> None:
    root = root_id(client)
    a = add(client, root, "A")
    patch(client, a, description="secret")
    b = add(client, a["id"], "B")

    window = view(client, a["id"], depth=2)
    assert b["id"] in {n["id"] for n in window["nodes"]}

    for node in [window["focus"], *window["ancestors"], *window["nodes"]]:
        assert "description" not in node


# --- S3_BE_AC5: edit the description --------------------------------------------------------


def test_S3_BE_AC5_patch_stores_the_text_exactly_and_bumps_version(client: TestClient) -> None:
    node = add(client, root_id(client), "N")
    text_with_layout = "  First line\n\n\tindented\nlast  "

    response = patch(client, node, description=text_with_layout)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["description"] == text_with_layout
    assert body["version"] == node["version"] + 1
    assert body["title"] == "N"
    assert detail(client, node["id"])["description"] == text_with_layout


def test_S3_BE_AC5_empty_string_clears_the_description(client: TestClient) -> None:
    node = add(client, root_id(client), "N")
    node = patch(client, node, description="something").json()

    response = patch(client, node, description="")

    assert response.status_code == 200
    assert detail(client, node["id"])["description"] == ""


def test_S3_BE_AC5_patching_the_title_alone_keeps_the_description(client: TestClient) -> None:
    node = add(client, root_id(client), "N")
    node = patch(client, node, description="kept").json()

    body = patch(client, node, title="Renamed").json()

    assert body["title"] == "Renamed"
    assert body["description"] == "kept"


# --- S3_BE_AC6: length limit ----------------------------------------------------------------


def test_S3_BE_AC6_exactly_the_maximum_length_is_accepted(client: TestClient) -> None:
    node = add(client, root_id(client), "N")

    response = patch(client, node, description="x" * DESCRIPTION_MAX_LENGTH)

    assert DESCRIPTION_MAX_LENGTH == 1000
    assert response.status_code == 200
    assert len(detail(client, node["id"])["description"]) == 1000


@pytest.mark.parametrize("value", ["x" * 1001, None, 42])
def test_S3_BE_AC6_too_long_or_null_returns_422_and_does_not_change(
    client: TestClient, value: object
) -> None:
    node = add(client, root_id(client), "N")

    response = patch(client, node, description=value)

    assert response.status_code == 422
    after = detail(client, node["id"])
    assert after["description"] == ""
    assert after["version"] == node["version"]


# --- S3_BE_AC7: title and description together ----------------------------------------------


def test_S3_BE_AC7_title_and_description_in_one_patch_bump_version_once(
    client: TestClient,
) -> None:
    node = add(client, root_id(client), "N")

    body = patch(client, node, title="T", description="D").json()

    assert (body["title"], body["description"]) == ("T", "D")
    assert body["version"] == node["version"] + 1


@pytest.mark.parametrize("title", ["", "   "])
def test_S3_BE_AC7_invalid_title_rejects_the_description_too(
    client: TestClient, title: str
) -> None:
    node = add(client, root_id(client), "N")

    response = patch(client, node, title=title, description="D")

    assert response.status_code == 422
    after = detail(client, node["id"])
    assert (after["title"], after["description"]) == ("N", "")


# --- S3_BE_AC8: version ---------------------------------------------------------------------


@pytest.mark.parametrize("offset", [-1, 1])
def test_S3_BE_AC8_wrong_version_returns_409_and_does_not_change(
    client: TestClient, offset: int
) -> None:
    node = add(client, root_id(client), "N")
    node = patch(client, node, description="v2").json()

    response = patch(client, node, description="lost", version=node["version"] + offset)

    assert response.status_code == 409
    assert detail(client, node["id"])["description"] == "v2"


def test_S3_BE_AC8_same_description_does_not_bump_version(client: TestClient) -> None:
    node = add(client, root_id(client), "N")
    node = patch(client, node, description="same").json()

    response = patch(client, node, description="same")

    assert response.status_code == 200
    assert response.json()["version"] == node["version"]


# --- S3_BE_AC9: the root is editable --------------------------------------------------------


def test_S3_BE_AC9_root_title_and_description_can_be_patched(client: TestClient) -> None:
    root = detail(client, root_id(client))

    response = patch(client, root, title="My map", description="What this map is about")

    assert response.status_code == 200, response.text
    after = detail(client, root["id"])
    assert (after["title"], after["description"]) == ("My map", "What this map is about")


# --- S3_BE_AC10: isolation and CSRF ---------------------------------------------------------


def test_S3_BE_AC10_someone_elses_node_returns_404_and_does_not_change(
    login: Callable[..., TestClient],
) -> None:
    owner = login(sub="sub-b", name="B")
    x = add(owner, root_id(owner), "B's X")
    intruder = login(sub="sub-a", name="A")

    responses = [
        intruder.get(f"/api/nodes/{x['id']}"),
        patch(intruder, x, description="overwritten"),
    ]

    assert [r.status_code for r in responses] == [404, 404]
    assert detail(owner, x["id"])["description"] == ""


def test_S3_BE_AC10_missing_and_malformed_ids(client: TestClient) -> None:
    assert client.get(f"/api/nodes/{uuid.uuid4()}").status_code == 404
    assert client.get("/api/nodes/not-a-uuid").status_code == 422


def test_S3_BE_AC10_patch_without_csrf_returns_403(client: TestClient) -> None:
    node = add(client, root_id(client), "N")

    response = client.patch(
        f"/api/nodes/{node['id']}", json={"version": node["version"], "description": "x"}
    )

    assert response.status_code == 403
    assert detail(client, node["id"])["description"] == ""


def test_S3_BE_AC10_get_without_a_session_returns_401(app: FastAPI, client: TestClient) -> None:
    node_id = root_id(client)

    with TestClient(app) as anonymous:
        assert anonymous.get(f"/api/nodes/{node_id}").status_code == 401
