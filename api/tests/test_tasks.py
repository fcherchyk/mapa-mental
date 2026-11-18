"""Slice 4A, criteria S4A_BE_AC1 to AC10: the `task` kind, its props and the leaf rule."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.node_types import CHECKLIST_MAX_ITEMS, ITEM_TEXT_MAX_LENGTH
from tests.conftest import CSRF
from tests.test_description import detail
from tests.test_nodes import add, patch, root_id, view

EMPTY_TASK = {"status": "to_do", "checklist": []}


def item(id_: str, text: str, done: bool = False) -> dict:
    return {"id": id_, "text": text, "done": done}


def add_task(client: TestClient, parent_id: str, title: str = "A task", **extra: object) -> dict:
    return add(client, parent_id, title, kind="task", **extra)


def create(client: TestClient, parent_id: str, **body: object):
    return client.post(f"/api/nodes/{parent_id}/children", json=body, headers=CSRF)


def window_node(client: TestClient, parent_id: str, node_id: str) -> dict:
    return next(n for n in view(client, parent_id, depth=1)["nodes"] if n["id"] == node_id)


# --- S4A_BE_AC1: create a task with defaults -------------------------------------------------


def test_S4A_BE_AC1_task_without_props_gets_defaults(client: TestClient) -> None:
    root = root_id(client)

    task = add_task(client, root, "Buy milk")

    assert (task["kind"], task["props"], task["child_count"]) == ("task", EMPTY_TASK, 0)


def test_S4A_BE_AC1_the_window_carries_kind_and_props(client: TestClient) -> None:
    root = root_id(client)
    task = add_task(client, root, "Buy milk")

    in_window = window_node(client, root, task["id"])

    assert (in_window["kind"], in_window["props"]) == ("task", EMPTY_TASK)


# --- S4A_BE_AC2: create a task with props ----------------------------------------------------


def test_S4A_BE_AC2_props_are_stored_as_sent(client: TestClient) -> None:
    props = {
        "status": "in_progress",
        "checklist": [item("a", "Go to the shop", True), {"id": "b", "text": "Pay"}],
    }

    task = add_task(client, root_id(client), props=props)

    assert task["props"] == {
        "status": "in_progress",
        "checklist": [item("a", "Go to the shop", True), item("b", "Pay", False)],
    }


def test_S4A_BE_AC2_item_text_is_trimmed(client: TestClient) -> None:
    props = {"checklist": [item("a", "  Go to the shop  ")]}

    task = add_task(client, root_id(client), props=props)

    assert task["props"]["checklist"][0]["text"] == "Go to the shop"


@pytest.mark.parametrize(
    "props",
    [
        {"checklist": [item("a", "x") for _ in range(0)], "status": "done"},
        {"checklist": [item(str(n), f"item {n}") for n in range(CHECKLIST_MAX_ITEMS)]},
        {"checklist": [item("a", "x" * ITEM_TEXT_MAX_LENGTH)]},
    ],
)
def test_S4A_BE_AC2_values_at_the_limits_are_accepted(client: TestClient, props: dict) -> None:
    response = create(client, root_id(client), title="T", kind="task", props=props)

    assert response.status_code == 201, response.text


# --- S4A_BE_AC3: invalid task props ----------------------------------------------------------


@pytest.mark.parametrize(
    "props",
    [
        {"status": "blocked"},
        {"status": None},
        {"checklist": [item(str(n), f"item {n}") for n in range(CHECKLIST_MAX_ITEMS + 1)]},
        {"checklist": [item("a", "")]},
        {"checklist": [item("a", "   ")]},
        {"checklist": [item("a", "x" * (ITEM_TEXT_MAX_LENGTH + 1))]},
        {"checklist": [item("a", "one"), item("a", "two")]},
        {"checklist": [{"text": "no id"}]},
        {"checklist": [{"id": "a"}]},
        {"checklist": [item("", "empty id")]},
        {"checklist": [{"id": "a", "text": "x", "due": "tomorrow"}]},
        {"checklist": "not a list"},
        {"priority": "high"},
    ],
)
def test_S4A_BE_AC3_invalid_props_return_422_and_create_nothing(
    client: TestClient, props: dict
) -> None:
    root = root_id(client)

    response = create(client, root, title="T", kind="task", props=props)

    assert response.status_code == 422, response.text
    assert view(client, root)["focus"]["child_count"] == 0


# --- S4A_BE_AC4: idea props stay empty -------------------------------------------------------


def test_S4A_BE_AC4_task_props_on_an_idea_return_422(client: TestClient) -> None:
    root = root_id(client)

    response = create(client, root, title="T", kind="idea", props={"status": "done"})

    assert response.status_code == 422
    assert view(client, root)["focus"]["child_count"] == 0


def test_S4A_BE_AC4_patching_an_idea_with_task_props_returns_422(client: TestClient) -> None:
    idea = add(client, root_id(client), "Idea")

    response = patch(client, idea, props={"status": "done"})

    assert response.status_code == 422
    assert detail(client, idea["id"])["props"] == {}


# --- S4A_BE_AC5: edit task props -------------------------------------------------------------


def test_S4A_BE_AC5_props_are_replaced_and_version_bumps(client: TestClient) -> None:
    root = root_id(client)
    task = add_task(client, root, props={"checklist": [item("a", "One"), item("b", "Two")]})
    new_props = {"status": "done", "checklist": [item("b", "Two", True), item("a", "One renamed")]}

    response = patch(client, task, props=new_props)

    assert response.status_code == 200, response.text
    assert response.json()["props"] == new_props
    assert response.json()["version"] == task["version"] + 1
    assert detail(client, task["id"])["props"] == new_props
    assert window_node(client, root, task["id"])["props"] == new_props


def test_S4A_BE_AC5_patch_with_the_same_props_does_not_bump_version(client: TestClient) -> None:
    task = add_task(client, root_id(client), props={"checklist": [item("a", "One")]})

    response = patch(client, task, props=task["props"])

    assert response.status_code == 200, response.text
    assert response.json()["version"] == task["version"]


# --- S4A_BE_AC6: invalid props on PATCH ------------------------------------------------------


def test_S4A_BE_AC6_invalid_props_change_nothing(client: TestClient) -> None:
    task = add_task(client, root_id(client), "Original", props={"status": "in_progress"})

    response = patch(client, task, title="Changed", props={"status": "blocked"})

    assert response.status_code == 422
    after = detail(client, task["id"])
    assert (after["title"], after["props"]["status"], after["version"]) == (
        "Original",
        "in_progress",
        task["version"],
    )


# --- S4A_BE_AC7: kind cannot be patched ------------------------------------------------------


@pytest.mark.parametrize("kind", ["task", "idea", "document"])
def test_S4A_BE_AC7_patching_kind_returns_422(client: TestClient, kind: str) -> None:
    idea = add(client, root_id(client), "Idea")

    response = patch(client, idea, kind=kind)

    assert response.status_code == 422
    assert detail(client, idea["id"])["kind"] == "idea"


def test_S4A_BE_AC7_patching_a_task_kind_returns_422(client: TestClient) -> None:
    task = add_task(client, root_id(client))

    response = patch(client, task, kind="idea")

    assert response.status_code == 422
    assert detail(client, task["id"])["kind"] == "task"


# --- S4A_BE_AC8: a task cannot have children -------------------------------------------------


def test_S4A_BE_AC8_creating_a_child_of_a_task_returns_422(client: TestClient) -> None:
    task = add_task(client, root_id(client))

    response = create(client, task["id"], title="Child")

    assert response.status_code == 422
    assert response.json()["detail"] == "a task cannot have children"
    assert detail(client, task["id"])["child_count"] == 0


def test_S4A_BE_AC8_creating_a_task_inside_a_task_returns_422(client: TestClient) -> None:
    task = add_task(client, root_id(client))

    response = create(client, task["id"], title="Child", kind="task")

    assert response.status_code == 422


def test_S4A_BE_AC8_moving_a_node_into_a_task_returns_422(client: TestClient) -> None:
    root = root_id(client)
    idea = add(client, root, "Idea")
    task = add_task(client, root)

    response = client.post(
        f"/api/nodes/{idea['id']}/move",
        json={"parent_id": task["id"], "place": "last", "version": idea["version"]},
        headers=CSRF,
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "a task cannot have children"
    after = detail(client, idea["id"])
    assert (after["parent_id"], after["sort_key"]) == (root, idea["sort_key"])


# --- S4A_BE_AC9: tasks move and delete like ideas --------------------------------------------


def test_S4A_BE_AC9_a_task_moves_among_and_into_ideas(client: TestClient) -> None:
    root = root_id(client)
    first = add(client, root, "First")
    second = add(client, root, "Second")
    task = add_task(client, root, "Task")

    to_first = client.post(
        f"/api/nodes/{task['id']}/move",
        json={"parent_id": first["id"], "place": "last", "version": task["version"]},
        headers=CSRF,
    )
    assert to_first.status_code == 200, to_first.text

    moved = to_first.json()
    back = client.post(
        f"/api/nodes/{task['id']}/move",
        json={
            "parent_id": root,
            "place": {"after_id": second["id"]},
            "version": moved["version"],
        },
        headers=CSRF,
    )

    assert back.status_code == 200, back.text
    assert [n["title"] for n in view(client, root, depth=1)["nodes"]] == [
        "First",
        "Second",
        "Task",
    ]


def test_S4A_BE_AC9_a_task_is_deleted_like_a_leaf(client: TestClient) -> None:
    root = root_id(client)
    task = add_task(client, root)

    response = client.delete(f"/api/nodes/{task['id']}", headers=CSRF)

    assert response.status_code == 204
    assert view(client, root)["focus"]["child_count"] == 0


def test_S4A_BE_AC9_the_root_is_an_idea(client: TestClient) -> None:
    assert detail(client, root_id(client))["kind"] == "idea"


# --- S4A_BE_AC10: version and isolation ------------------------------------------------------


def test_S4A_BE_AC10_stale_version_returns_409(client: TestClient) -> None:
    task = add_task(client, root_id(client))

    response = client.patch(
        f"/api/nodes/{task['id']}",
        json={"props": {"status": "done"}, "version": task["version"] + 7},
        headers=CSRF,
    )

    assert response.status_code == 409
    assert detail(client, task["id"])["props"]["status"] == "to_do"


def test_S4A_BE_AC10_someone_elses_task_returns_404(login: Callable[..., TestClient]) -> None:
    owner = login(sub="sub-b", name="B")
    task = add_task(owner, root_id(owner), "B's task")
    intruder = login(sub="sub-a", name="A")

    responses = [
        create(intruder, task["id"], title="Child"),
        patch(intruder, task, props={"status": "done"}),
    ]

    assert [r.status_code for r in responses] == [404, 404]
    assert detail(owner, task["id"])["props"]["status"] == "to_do"
