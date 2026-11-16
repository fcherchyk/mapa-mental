"""Slice 2, criteria S2_BE_AC1 to AC13: moving a node to a new parent and position."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.nodes.sort_keys import is_valid_sort_key
from tests.conftest import CSRF
from tests.test_nodes import add, children_titles, patch, root_id, view

LAST = "last"
FIRST = "first"


def move(
    client: TestClient,
    node: dict,
    parent_id: str,
    place: Any = LAST,
    version: int | None = None,
):
    body = {
        "parent_id": parent_id,
        "place": place,
        "version": node["version"] if version is None else version,
    }
    return client.post(f"/api/nodes/{node['id']}/move", json=body, headers=CSRF)


def after(node: dict) -> dict[str, str]:
    return {"after_id": node["id"]}


def order_under(client: TestClient, parent_id: str) -> list[str]:
    return children_titles(view(client, parent_id, depth=1), parent_id)


def child_count(client: TestClient, node_id: str) -> int:
    return view(client, node_id, depth=1)["focus"]["child_count"]


def test_S2_BE_AC1_move_answers_with_the_new_parent_sort_key_and_version(
    client: TestClient,
) -> None:
    root = root_id(client)
    a = add(client, root, "A")
    n = add(client, root, "N")
    add(client, n["id"], "c")

    response = move(client, n, a["id"])

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parent_id"] == a["id"]
    assert body["version"] == n["version"] + 1
    assert is_valid_sort_key(body["sort_key"])
    assert body["child_count"] == 1


def test_S2_BE_AC2_after_a_sibling_puts_the_node_in_that_gap(client: TestClient) -> None:
    root = root_id(client)
    a = add(client, root, "A")
    b = add(client, root, "B")
    n = add(client, root, "N")

    assert move(client, n, root, after(a)).status_code == 200

    assert order_under(client, root) == ["A", "N", "B"]
    unchanged = {x["id"]: (x["sort_key"], x["version"]) for x in view(client, root, 1)["nodes"]}
    assert unchanged[a["id"]] == (a["sort_key"], a["version"])
    assert unchanged[b["id"]] == (b["sort_key"], b["version"])


def test_S2_BE_AC2_first_puts_the_node_before_every_sibling(client: TestClient) -> None:
    root = root_id(client)
    add(client, root, "A")
    add(client, root, "B")
    n = add(client, root, "N")

    assert move(client, n, root, FIRST).status_code == 200

    assert order_under(client, root) == ["N", "A", "B"]


def test_S2_BE_AC2_last_puts_the_node_after_every_sibling(client: TestClient) -> None:
    root = root_id(client)
    n = add(client, root, "N")
    add(client, root, "A")
    add(client, root, "B")

    assert move(client, n, root, LAST).status_code == 200

    assert order_under(client, root) == ["A", "B", "N"]


def test_S2_BE_AC3_last_appends_without_naming_any_sibling(client: TestClient) -> None:
    root = root_id(client)
    destination = add(client, root, "D")
    for title in ("d1", "d2", "d3"):
        add(client, destination["id"], title)
    n = add(client, root, "N")

    assert move(client, n, destination["id"], LAST).status_code == 200

    assert order_under(client, destination["id"]) == ["d1", "d2", "d3", "N"]


def test_S2_BE_AC4_the_subtree_travels_with_the_node(client: TestClient) -> None:
    root = root_id(client)
    old_parent = add(client, root, "P")
    destination = add(client, root, "D")
    n = add(client, old_parent["id"], "N")
    kid = add(client, n["id"], "c1")
    add(client, n["id"], "c2")
    add(client, kid["id"], "deep")
    before = view(client, n["id"], depth=5)["nodes"]

    assert move(client, n, destination["id"]).status_code == 200

    assert view(client, n["id"], depth=5)["nodes"] == before
    assert order_under(client, destination["id"]) == ["N"]
    assert order_under(client, old_parent["id"]) == []
    assert child_count(client, old_parent["id"]) == 0
    assert child_count(client, destination["id"]) == 1


def test_S2_BE_AC5_moving_a_node_inside_itself_returns_422(client: TestClient) -> None:
    root = root_id(client)
    n = add(client, root, "N")

    response = move(client, n, n["id"])

    assert response.status_code == 422
    assert order_under(client, root) == ["N"]


def test_S2_BE_AC5_moving_a_node_inside_its_own_descendant_returns_422(
    client: TestClient,
) -> None:
    root = root_id(client)
    n = add(client, root, "N")
    child = add(client, n["id"], "c")
    grandchild = add(client, child["id"], "g")

    assert move(client, n, grandchild["id"]).status_code == 422

    assert order_under(client, root) == ["N"]
    assert order_under(client, n["id"]) == ["c"]


def test_S2_BE_AC5_moving_a_node_to_its_current_parent_is_allowed(client: TestClient) -> None:
    root = root_id(client)
    add(client, root, "A")
    n = add(client, root, "N")

    assert move(client, n, root, FIRST).status_code == 200

    assert order_under(client, root) == ["N", "A"]


def test_S2_BE_AC6_the_root_cannot_be_moved(client: TestClient) -> None:
    root = root_id(client)
    a = add(client, root, "A")

    response = move(client, {"id": root, "version": 1}, a["id"])

    assert response.status_code == 422
    assert order_under(client, root) == ["A"]


def test_S2_BE_AC7_moving_someone_elses_node_returns_404(
    login: Callable[..., TestClient],
) -> None:
    owner = login(sub="sub-o", name="O")
    owner_root = root_id(owner)
    a = add(owner, owner_root, "A")
    n = add(owner, owner_root, "N")
    intruder = login(sub="sub-i", name="I")

    assert move(intruder, n, a["id"]).status_code == 404

    assert order_under(owner, owner_root) == ["A", "N"]


def test_S2_BE_AC7_a_parent_in_someone_elses_map_returns_404(
    login: Callable[..., TestClient],
) -> None:
    owner = login(sub="sub-o", name="O")
    stranger = login(sub="sub-s", name="S")
    stranger_node = add(stranger, root_id(stranger), "X")
    n = add(owner, root_id(owner), "N")

    assert move(owner, n, stranger_node["id"]).status_code == 404

    assert order_under(owner, root_id(owner)) == ["N"]
    assert order_under(stranger, root_id(stranger)) == ["X"]


def test_S2_BE_AC7_an_after_id_in_someone_elses_map_returns_404(
    login: Callable[..., TestClient],
) -> None:
    owner = login(sub="sub-o", name="O")
    stranger = login(sub="sub-s", name="S")
    stranger_node = add(stranger, root_id(stranger), "X")
    owner_root = root_id(owner)
    n = add(owner, owner_root, "N")

    assert move(owner, n, owner_root, after(stranger_node)).status_code == 404

    assert order_under(owner, owner_root) == ["N"]


def test_S2_BE_AC7_a_missing_node_returns_404(client: TestClient) -> None:
    missing = "00000000-0000-0000-0000-000000000000"
    root = root_id(client)

    assert move(client, {"id": missing, "version": 1}, root).status_code == 404
    assert move(client, add(client, root, "N"), missing).status_code == 404


def test_S2_BE_AC8_an_after_id_outside_the_destination_returns_422(client: TestClient) -> None:
    root = root_id(client)
    other = add(client, root, "O")
    stray = add(client, other["id"], "stray")
    destination = add(client, root, "D")
    n = add(client, root, "N")

    response = move(client, n, destination["id"], after(stray))

    assert response.status_code == 422
    assert order_under(client, root) == ["O", "D", "N"]


def test_S2_BE_AC8_an_after_id_equal_to_the_moved_node_returns_422(client: TestClient) -> None:
    root = root_id(client)
    add(client, root, "A")
    n = add(client, root, "N")

    assert move(client, n, root, after(n)).status_code == 422

    assert order_under(client, root) == ["A", "N"]


@pytest.mark.parametrize("offset", [-1, 1])
def test_S2_BE_AC9_a_stale_or_future_version_returns_409(client: TestClient, offset: int) -> None:
    root = root_id(client)
    a = add(client, root, "A")
    # Renamed first, so that version - 1 is still a valid version number and reaches the check.
    n = patch(client, add(client, root, "N"), title="N2").json()
    assert n["version"] > 1

    response = move(client, n, a["id"], version=n["version"] + offset)

    assert response.status_code == 409
    assert order_under(client, root) == ["A", "N2"]


def test_S2_BE_AC10_moving_a_node_where_it_already_is_writes_nothing(client: TestClient) -> None:
    root = root_id(client)
    add(client, root, "A")
    n = add(client, root, "N")

    response = move(client, n, root, LAST)

    assert response.status_code == 200
    assert order_under(client, root) == ["A", "N"]
    # The computed position is the one it already holds, so the row is not written.
    assert response.json()["version"] == n["version"]
    assert response.json()["sort_key"] == n["sort_key"]


def test_S2_BE_AC10_a_move_that_does_change_the_position_bumps_the_version(
    client: TestClient,
) -> None:
    root = root_id(client)
    add(client, root, "A")
    n = add(client, root, "N")

    response = move(client, n, root, FIRST)

    assert response.status_code == 200
    assert response.json()["version"] == n["version"] + 1
    assert order_under(client, root) == ["N", "A"]


def test_S2_BE_AC11_a_move_without_the_csrf_header_returns_403(client: TestClient) -> None:
    root = root_id(client)
    a = add(client, root, "A")
    n = add(client, root, "N")

    body = {"parent_id": a["id"], "place": LAST, "version": n["version"]}
    response = client.post(f"/api/nodes/{n['id']}/move", json=body)

    assert response.status_code == 403
    assert order_under(client, root) == ["A", "N"]


@pytest.mark.parametrize(
    "body",
    [
        {"place": LAST},
        {"version": 1},
        {"place": LAST, "version": 1, "unknown": "x"},
        {"parent_id": "not-a-uuid", "place": LAST, "version": 1},
        {"place": "middle", "version": 1},
        {"place": {"after_id": "not-a-uuid"}, "version": 1},
        {"place": {"before_id": "00000000-0000-0000-0000-000000000000"}, "version": 1},
        {"place": LAST, "version": 0},
    ],
)
def test_S2_BE_AC11_an_invalid_body_returns_422(client: TestClient, body: dict) -> None:
    root = root_id(client)
    a = add(client, root, "A")
    n = add(client, root, "N")
    sent = {"parent_id": a["id"], **body}

    response = client.post(f"/api/nodes/{n['id']}/move", json=sent, headers=CSRF)

    assert response.status_code == 422
    assert order_under(client, root) == ["A", "N"]


def test_S2_BE_AC12_repeated_moves_into_the_same_gap_keep_the_keys_short(
    client: TestClient,
) -> None:
    root = root_id(client)
    a = add(client, root, "A")
    add(client, root, "B")
    x = add(client, root, "X")
    y = add(client, root, "Y")

    for _ in range(25):
        for node in (x, y):
            response = move(client, node, root, after(a))
            assert response.status_code == 200, response.text
            node.update(response.json())

    window = view(client, root, depth=1)["nodes"]
    keys = [node["sort_key"] for node in window]
    assert len(set(keys)) == len(keys)
    assert all(is_valid_sort_key(key) for key in keys)
    assert max(len(key) for key in keys) < 128
    # The last one moved sits right after A, and the other one right after it.
    assert order_under(client, root) == ["A", "Y", "X", "B"]


def test_S2_BE_AC13_a_failed_move_leaves_everything_as_it_was(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = root_id(client)
    destination = add(client, root, "D")
    n = add(client, root, "N")
    add(client, n["id"], "c")

    def boom(_session: Session) -> None:
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(Session, "commit", boom)
    with pytest.raises(RuntimeError):
        move(client, n, destination["id"])
    monkeypatch.undo()

    assert order_under(client, root) == ["D", "N"]
    assert order_under(client, n["id"]) == ["c"]
    assert order_under(client, destination["id"]) == []
