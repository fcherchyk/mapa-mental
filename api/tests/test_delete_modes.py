"""Node deletion with two modes: `children=cascade` (the default) and `children=reparent`."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.nodes import service
from app.nodes.sort_keys import is_valid_sort_key
from tests.conftest import CSRF
from tests.test_nodes import add, children_titles, root_id, view


def order_under(client: TestClient, parent_id: str) -> list[str]:
    return children_titles(view(client, parent_id, depth=1), parent_id)


def reparent(client: TestClient, node: dict):
    return client.delete(f"/api/nodes/{node['id']}", params={"children": "reparent"}, headers=CSRF)


def test_ac1_explicit_and_default_cascade_delete_the_subtree(client: TestClient) -> None:
    root = root_id(client)
    for params in ({}, {"children": "cascade"}):
        n = add(client, root, "N")
        child = add(client, n["id"], "h")
        grandchild = add(client, child["id"], "grandchild")

        response = client.delete(f"/api/nodes/{n['id']}", params=params, headers=CSRF)

        assert response.status_code == 204
        for gone in (n, child, grandchild):
            assert client.get(f"/api/nodes/{gone['id']}/view").status_code == 404


def test_ac2_reparent_in_the_middle_keeps_position_and_order(client: TestClient) -> None:
    root = root_id(client)
    a = add(client, root, "A")
    n = add(client, root, "N", after_sort_key=a["sort_key"])
    add(client, root, "B")
    kids = [add(client, n["id"], f"c{i}") for i in (1, 2, 3)]
    deep = add(client, kids[0]["id"], "deep")
    add(client, deep["id"], "more")
    before = view(client, kids[0]["id"], depth=5)["nodes"]

    assert reparent(client, n).status_code == 204

    assert order_under(client, root) == ["A", "c1", "c2", "c3", "B"]
    keys = [x["sort_key"] for x in view(client, root, depth=1)["nodes"]]
    assert len(set(keys)) == len(keys)
    assert all(is_valid_sort_key(k) for k in keys)
    assert view(client, kids[0]["id"], depth=5)["nodes"] == before


def test_ac2_reparent_as_first_child(client: TestClient) -> None:
    root = root_id(client)
    n = add(client, root, "N")
    add(client, root, "B")
    for title in ("c1", "c2"):
        add(client, n["id"], title)

    assert reparent(client, n).status_code == 204

    assert order_under(client, root) == ["c1", "c2", "B"]


def test_ac2_reparent_as_last_child(client: TestClient) -> None:
    root = root_id(client)
    add(client, root, "A")
    n = add(client, root, "N")
    for title in ("c1", "c2"):
        add(client, n["id"], title)

    assert reparent(client, n).status_code == 204

    assert order_under(client, root) == ["A", "c1", "c2"]


def test_ac2_reparent_bumps_the_version_of_moved_children(client: TestClient) -> None:
    root = root_id(client)
    n = add(client, root, "N")
    child = add(client, n["id"], "c")

    reparent(client, n)

    moved = view(client, child["id"])["focus"]
    assert moved["parent_id"] == root
    assert moved["version"] > child["version"]


def test_ac2_reparent_of_a_leaf_just_deletes_it(client: TestClient) -> None:
    root = root_id(client)
    leaf = add(client, root, "leaf")

    assert reparent(client, leaf).status_code == 204
    assert order_under(client, root) == []


def test_reparent_of_many_children_keeps_keys_short(client: TestClient) -> None:
    root = root_id(client)
    n = add(client, root, "N")
    add(client, root, "B")
    for i in range(40):
        add(client, n["id"], f"c{i:02d}")

    assert reparent(client, n).status_code == 204

    assert order_under(client, root) == [f"c{i:02d}" for i in range(40)] + ["B"]
    keys = [x["sort_key"] for x in view(client, root, depth=1)["nodes"]]
    assert max(len(k) for k in keys) < 20


def test_ac3_reparent_is_atomic(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    root = root_id(client)
    n = add(client, root, "N")
    add(client, n["id"], "c1")
    add(client, n["id"], "c2")

    def boom(*_args: object) -> None:
        raise RuntimeError("simulated failure")

    monkeypatch.setattr(service, "remove_row", boom)
    with pytest.raises(RuntimeError):
        reparent(client, n)
    monkeypatch.undo()

    assert order_under(client, root) == ["N"]
    assert order_under(client, n["id"]) == ["c1", "c2"]


def test_ac4_reparent_without_csrf_returns_403(client: TestClient) -> None:
    n = add(client, root_id(client), "N")
    add(client, n["id"], "c")

    response = client.delete(f"/api/nodes/{n['id']}", params={"children": "reparent"})

    assert response.status_code == 403
    assert order_under(client, n["id"]) == ["c"]


def test_ac4_reparent_of_someone_elses_node_returns_404(login: Callable[..., TestClient]) -> None:
    owner = login(sub="sub-o", name="O")
    n = add(owner, root_id(owner), "N")
    add(owner, n["id"], "c")
    intruder = login(sub="sub-i", name="I")

    assert reparent(intruder, n).status_code == 404
    assert order_under(owner, n["id"]) == ["c"]


def test_ac4_reparent_of_the_root_returns_422(client: TestClient) -> None:
    root = root_id(client)
    add(client, root, "h")

    assert reparent(client, {"id": root}).status_code == 422
    assert order_under(client, root) == ["h"]


def test_ac4_invalid_children_value_returns_422(client: TestClient) -> None:
    n = add(client, root_id(client), "N")

    response = client.delete(f"/api/nodes/{n['id']}", params={"children": "foo"}, headers=CSRF)

    assert response.status_code == 422
    assert client.get(f"/api/nodes/{n['id']}/view").status_code == 200
