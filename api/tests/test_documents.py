"""Slice 5, criteria S5_BE_AC1 to AC9: the `document` kind and its Markdown body."""

from collections.abc import Callable

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import Engine, inspect, text

from app.nodes.schemas import CONTENT_MAX_LENGTH
from tests.conftest import CSRF
from tests.test_description import alembic, detail
from tests.test_nodes import add, patch, root_id, view
from tests.test_tasks import add_task, create, window_node

MARKDOWN = "# Plan\n\n  - [ ] first\n  - [x] second\n\n```py\nprint('hi')\n```\n"


def add_document(client: TestClient, parent_id: str, title: str = "Notes", **extra: object) -> dict:
    return add(client, parent_id, title, kind="document", **extra)


def stored_content(admin_engine: Engine, node_id: str) -> str | None:
    with admin_engine.connect() as connection:
        return connection.execute(
            text("SELECT content FROM node_documents WHERE node_id = :id"), {"id": node_id}
        ).scalar_one_or_none()


# --- S5_BE_AC1: migration -------------------------------------------------------------------


def test_S5_BE_AC1_migration_creates_and_drops_the_documents_table(
    client: TestClient, postgres_url: str, admin_engine: Engine
) -> None:
    add(client, root_id(client), "Before the migration")
    config = alembic(postgres_url)

    command.downgrade(config, "0003")
    try:
        assert "node_documents" not in inspect(admin_engine).get_table_names()
    finally:
        command.upgrade(config, "head")

    columns = {c["name"]: c for c in inspect(admin_engine).get_columns("node_documents")}
    assert set(columns) == {"node_id", "content"}
    assert columns["content"]["nullable"] is False
    foreign_keys = inspect(admin_engine).get_foreign_keys("node_documents")
    assert foreign_keys[0]["referred_table"] == "nodes"
    assert foreign_keys[0]["options"].get("ondelete") == "CASCADE"


# --- S5_BE_AC2: create a document -----------------------------------------------------------


def test_S5_BE_AC2_document_is_created_with_empty_props_and_content(
    client: TestClient, admin_engine: Engine
) -> None:
    root = root_id(client)

    document = add_document(client, root, "Meeting notes")

    assert (document["kind"], document["props"], document["child_count"]) == ("document", {}, 0)
    assert detail(client, document["id"])["content"] == ""
    assert stored_content(admin_engine, document["id"]) == ""


def test_S5_BE_AC2_the_window_carries_the_kind_but_never_the_content(client: TestClient) -> None:
    root = root_id(client)
    document = add_document(client, root)
    patch(client, document, content=MARKDOWN)

    in_window = window_node(client, root, document["id"])

    assert in_window["kind"] == "document"
    assert "content" not in in_window
    assert "content" not in view(client, root)["focus"]


def test_S5_BE_AC2_other_kinds_have_an_empty_content_and_no_row(
    client: TestClient, admin_engine: Engine
) -> None:
    root = root_id(client)
    idea = add(client, root, "Idea")
    task = add_task(client, root)

    assert [detail(client, n)["content"] for n in (root, idea["id"], task["id"])] == ["", "", ""]
    assert stored_content(admin_engine, idea["id"]) is None


# --- S5_BE_AC3: what a document refuses at creation ------------------------------------------


@pytest.mark.parametrize(
    "body",
    [
        {"title": "D", "kind": "document", "props": {"content": "# no"}},
        {"title": "D", "kind": "document", "content": "# no"},
        {
            "title": "D",
            "kind": "document",
            "board_place": {"before_id": "00000000-0000-0000-0000-000000000001"},
        },
    ],
)
def test_S5_BE_AC3_props_content_or_board_place_at_creation_return_422(
    client: TestClient, body: dict
) -> None:
    root = root_id(client)

    response = create(client, root, **body)

    assert response.status_code == 422, response.text
    assert view(client, root)["focus"]["child_count"] == 0


# --- S5_BE_AC4: edit the content ------------------------------------------------------------


def test_S5_BE_AC4_content_is_stored_exactly_and_bumps_version(
    client: TestClient, admin_engine: Engine
) -> None:
    document = add_document(client, root_id(client))

    response = patch(client, document, content=MARKDOWN)

    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["content"], body["version"]) == (MARKDOWN, document["version"] + 1)
    assert detail(client, document["id"])["content"] == MARKDOWN
    assert stored_content(admin_engine, document["id"]) == MARKDOWN


def test_S5_BE_AC4_same_content_does_not_bump_version(client: TestClient) -> None:
    document = add_document(client, root_id(client))
    saved = patch(client, document, content=MARKDOWN).json()

    again = patch(client, saved, content=MARKDOWN)

    assert again.status_code == 200
    assert again.json()["version"] == saved["version"]


def test_S5_BE_AC4_empty_string_clears_the_content(client: TestClient) -> None:
    document = add_document(client, root_id(client))
    saved = patch(client, document, content=MARKDOWN).json()

    cleared = patch(client, saved, content="")

    assert cleared.json()["content"] == ""
    assert detail(client, document["id"])["content"] == ""


def test_S5_BE_AC4_title_and_content_in_one_patch_bump_version_once(client: TestClient) -> None:
    document = add_document(client, root_id(client))

    body = patch(client, document, title="Renamed", content=MARKDOWN).json()

    assert (body["title"], body["content"]) == ("Renamed", MARKDOWN)
    assert body["version"] == document["version"] + 1


def test_S5_BE_AC4_patching_the_title_alone_keeps_the_content(client: TestClient) -> None:
    document = add_document(client, root_id(client))
    saved = patch(client, document, content=MARKDOWN).json()

    body = patch(client, saved, title="Renamed").json()

    assert body["content"] == MARKDOWN


# --- S5_BE_AC5: limits ----------------------------------------------------------------------


def test_S5_BE_AC5_exactly_the_maximum_length_is_accepted(client: TestClient) -> None:
    document = add_document(client, root_id(client))

    response = patch(client, document, content="x" * CONTENT_MAX_LENGTH)

    assert response.status_code == 200, response.text
    assert len(detail(client, document["id"])["content"]) == CONTENT_MAX_LENGTH


@pytest.mark.parametrize("content", ["x" * (CONTENT_MAX_LENGTH + 1), None, 42])
def test_S5_BE_AC5_too_long_null_or_not_text_returns_422_and_does_not_change(
    client: TestClient, content: object
) -> None:
    document = add_document(client, root_id(client))
    saved = patch(client, document, content=MARKDOWN).json()

    response = patch(client, saved, title="Renamed", content=content)

    assert response.status_code == 422
    after = detail(client, document["id"])
    assert (after["content"], after["title"], after["version"]) == (
        MARKDOWN,
        "Notes",
        saved["version"],
    )


# --- S5_BE_AC6: content belongs to documents, descriptions to the rest ------------------------


def test_S5_BE_AC6_content_on_an_idea_or_a_task_returns_422(client: TestClient) -> None:
    root = root_id(client)
    idea = add(client, root, "Idea")
    task = add_task(client, root)

    responses = [patch(client, node, title="Renamed", content="# x") for node in (idea, task)]

    assert [r.status_code for r in responses] == [422, 422]
    assert [detail(client, n["id"])["title"] for n in (idea, task)] == ["Idea", "A task"]


def test_S5_BE_AC6_description_on_a_document_returns_422(client: TestClient) -> None:
    document = add_document(client, root_id(client))

    response = patch(client, document, title="Renamed", description="not here")

    assert response.status_code == 422
    after = detail(client, document["id"])
    assert (after["title"], after["description"], after["version"]) == ("Notes", "", 1)


def test_S5_BE_AC6_document_props_take_no_keys(client: TestClient) -> None:
    document = add_document(client, root_id(client))

    response = patch(client, document, props={"status": "done"})

    assert response.status_code == 422
    assert detail(client, document["id"])["props"] == {}


# --- S5_BE_AC7: a document cannot have children ----------------------------------------------


def test_S5_BE_AC7_creating_inside_a_document_returns_422(client: TestClient) -> None:
    document = add_document(client, root_id(client))

    response = create(client, document["id"], title="Child")

    assert response.status_code == 422
    assert detail(client, document["id"])["child_count"] == 0


def test_S5_BE_AC7_moving_into_a_document_returns_422_and_changes_nothing(
    client: TestClient,
) -> None:
    root = root_id(client)
    document = add_document(client, root)
    idea = add(client, root, "Idea")

    response = client.post(
        f"/api/nodes/{idea['id']}/move",
        json={"parent_id": document["id"], "place": "last", "version": idea["version"]},
        headers=CSRF,
    )

    assert response.status_code == 422
    after = detail(client, idea["id"])
    assert (after["parent_id"], after["sort_key"]) == (root, idea["sort_key"])


# --- S5_BE_AC8: moves, deletes and the board ---------------------------------------------------


def test_S5_BE_AC8_a_document_moves_and_keeps_its_content(client: TestClient) -> None:
    root = root_id(client)
    target = add(client, root, "Target")
    document = patch(client, add_document(client, root), content=MARKDOWN).json()

    response = client.post(
        f"/api/nodes/{document['id']}/move",
        json={"parent_id": target["id"], "place": "first", "version": document["version"]},
        headers=CSRF,
    )

    assert response.status_code == 200, response.text
    after = detail(client, document["id"])
    assert (after["parent_id"], after["content"]) == (target["id"], MARKDOWN)


def test_S5_BE_AC8_deleting_a_document_or_its_ancestor_removes_the_body(
    client: TestClient, admin_engine: Engine
) -> None:
    root = root_id(client)
    first = patch(client, add_document(client, root), content="one").json()
    parent = add(client, root, "Parent")
    second = patch(client, add_document(client, parent["id"]), content="two").json()

    responses = [
        client.delete(f"/api/nodes/{first['id']}", headers=CSRF),
        client.delete(f"/api/nodes/{parent['id']}", headers=CSRF),
    ]

    assert [r.status_code for r in responses] == [204, 204]
    assert stored_content(admin_engine, first["id"]) is None
    assert stored_content(admin_engine, second["id"]) is None


def test_S5_BE_AC8_documents_are_not_on_the_board(client: TestClient) -> None:
    root = root_id(client)
    add_document(client, root)
    task = add_task(client, root)

    board = client.get(f"/api/nodes/{root}/board").json()

    assert [t["id"] for t in board["tasks"]] == [task["id"]]


# --- S5_BE_AC9: version and isolation ---------------------------------------------------------


def test_S5_BE_AC9_stale_version_returns_409_and_does_not_change(client: TestClient) -> None:
    document = add_document(client, root_id(client))
    saved = patch(client, document, content="first").json()

    response = patch(client, document, content="stale")

    assert response.status_code == 409
    assert detail(client, document["id"])["content"] == "first"
    assert detail(client, document["id"])["version"] == saved["version"]


def test_S5_BE_AC9_someone_elses_document_returns_404(login: Callable[..., TestClient]) -> None:
    owner = login(sub="sub-b", name="B")
    document = patch(owner, add_document(owner, root_id(owner)), content="mine").json()
    intruder = login(sub="sub-a", name="A")

    responses = [
        intruder.get(f"/api/nodes/{document['id']}"),
        patch(intruder, document, content="theirs"),
    ]

    assert [r.status_code for r in responses] == [404, 404]
    assert detail(owner, document["id"])["content"] == "mine"
