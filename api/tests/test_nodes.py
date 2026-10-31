"""Criteria 8 and 11 to 17: visible window, isolation and node editing."""

import uuid
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from tests.conftest import CSRF


def root_id(client: TestClient) -> str:
    return client.get("/api/me").json()["root_node_id"]


def add(client: TestClient, parent_id: str, title: str, **extra: object) -> dict:
    response = client.post(
        f"/api/nodes/{parent_id}/children", json={"title": title, **extra}, headers=CSRF
    )
    assert response.status_code == 201, response.text
    return response.json()


def view(client: TestClient, node_id: str, depth: int | None = None) -> dict:
    params = {} if depth is None else {"depth": depth}
    response = client.get(f"/api/nodes/{node_id}/view", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def patch(client: TestClient, node: dict, **changes: object):
    body = {"version": node["version"], **changes}
    return client.patch(f"/api/nodes/{node['id']}", json=body, headers=CSRF)


def children_titles(window: dict, parent_id: str) -> list[str]:
    return [n["title"] for n in window["nodes"] if n["parent_id"] == parent_id]


@pytest.fixture
def tree(client: TestClient) -> dict[str, dict]:
    """root › A › F, and five levels under F; L2a has 4 children and a chain down to level 5."""
    nodes: dict[str, dict] = {"root": {"id": root_id(client)}}
    nodes["A"] = add(client, nodes["root"]["id"], "A")
    nodes["F"] = add(client, nodes["A"]["id"], "F")
    nodes["L1a"] = add(client, nodes["F"]["id"], "L1a")
    nodes["L1b"] = add(client, nodes["F"]["id"], "L1b")
    nodes["L2a"] = add(client, nodes["L1a"]["id"], "L2a")
    nodes["L2b"] = add(client, nodes["L1a"]["id"], "L2b")
    for name in ("L3a", "L3b", "L3c", "L3d"):
        nodes[name] = add(client, nodes["L2a"]["id"], name)
    nodes["L4"] = add(client, nodes["L3a"]["id"], "L4")
    nodes["L5"] = add(client, nodes["L4"]["id"], "L5")
    return nodes


def test_criterion_11_window_has_focus_ancestors_and_two_levels(
    client: TestClient, tree: dict[str, dict]
) -> None:
    window = view(client, tree["F"]["id"], depth=2)

    assert window["focus"]["id"] == tree["F"]["id"]
    assert [a["id"] for a in window["ancestors"]] == [tree["root"]["id"], tree["A"]["id"]]
    by_title = {n["title"]: n for n in window["nodes"]}
    assert set(by_title) == {"L1a", "L1b", "L2a", "L2b"}
    assert {n["level"] for n in window["nodes"]} == {1, 2}
    assert children_titles(window, tree["F"]["id"]) == ["L1a", "L1b"]
    assert children_titles(window, tree["L1a"]["id"]) == ["L2a", "L2b"]


def test_criterion_11_each_node_has_its_real_child_count(
    client: TestClient, tree: dict[str, dict]
) -> None:
    window = view(client, tree["F"]["id"], depth=2)

    counts = {n["title"]: n["child_count"] for n in window["nodes"]}
    assert counts == {"L1a": 2, "L1b": 0, "L2a": 4, "L2b": 0}
    assert window["focus"]["child_count"] == 2
    assert [a["child_count"] for a in window["ancestors"]] == [1, 1]


def test_criterion_11_collapsed_node_hides_children_and_keeps_child_count(
    client: TestClient, tree: dict[str, dict]
) -> None:
    assert patch(client, tree["L1a"], collapsed=True).status_code == 200

    window = view(client, tree["F"]["id"], depth=2)

    assert [n["title"] for n in window["nodes"]] == ["L1a", "L1b"]
    collapsed = window["nodes"][0]
    assert collapsed["collapsed"] is True
    assert collapsed["child_count"] == 2


def test_criterion_11_maximum_depth_reaches_level_5(
    client: TestClient, tree: dict[str, dict]
) -> None:
    window = view(client, tree["F"]["id"], depth=10)

    assert max(n["level"] for n in window["nodes"]) == 5
    assert len(window["nodes"]) == 10


def test_criterion_11_root_has_no_ancestors(client: TestClient) -> None:
    window = view(client, root_id(client))

    assert window["ancestors"] == []
    assert window["focus"]["parent_id"] is None


def test_criterion_11_siblings_strictly_ordered_by_sort_key(client: TestClient) -> None:
    root = root_id(client)
    parent = add(client, root, "Parent")
    h1 = add(client, parent["id"], "H1")
    add(client, parent["id"], "H3")
    # Insert H2 in the middle, between H1 and H3
    add(client, parent["id"], "H2", after_sort_key=h1["sort_key"])

    window = view(client, parent["id"], depth=1)
    titles = [n["title"] for n in window["nodes"]]
    sort_keys = [n["sort_key"] for n in window["nodes"]]
    assert titles == ["H1", "H2", "H3"]
    assert sort_keys == sorted(sort_keys)


def test_criterion_11_focus_on_leaf_returns_empty_nodes_and_all_ancestors(
    client: TestClient, tree: dict[str, dict]
) -> None:
    window = view(client, tree["L5"]["id"], depth=2)

    assert window["focus"]["id"] == tree["L5"]["id"]
    assert window["focus"]["child_count"] == 0
    assert window["nodes"] == []
    expected_ancestor_ids = [
        tree["root"]["id"],
        tree["A"]["id"],
        tree["F"]["id"],
        tree["L1a"]["id"],
        tree["L2a"]["id"],
        tree["L3a"]["id"],
        tree["L4"]["id"],
    ]
    assert [a["id"] for a in window["ancestors"]] == expected_ancestor_ids


def test_criterion_12_without_depth_uses_the_user_preference(
    client: TestClient, tree: dict[str, dict]
) -> None:
    client.patch("/api/me/settings", json={"depth": 1}, headers=CSRF)

    window = view(client, tree["F"]["id"])

    assert [n["title"] for n in window["nodes"]] == ["L1a", "L1b"]


def test_criterion_12_depth_boundary_values_1_and_10_are_valid(
    client: TestClient, tree: dict[str, dict]
) -> None:
    w1 = view(client, tree["F"]["id"], depth=1)
    assert max(n["level"] for n in w1["nodes"]) == 1

    w10 = view(client, tree["F"]["id"], depth=10)
    assert max(n["level"] for n in w10["nodes"]) == 5


@pytest.mark.parametrize("depth", [0, 11, -1, 100, "abc"])
def test_criterion_12_out_of_range_depth_returns_422(client: TestClient, depth: object) -> None:
    response = client.get(f"/api/nodes/{root_id(client)}/view", params={"depth": depth})

    assert response.status_code == 422


def test_criterion_13_someone_elses_node_returns_404_and_does_not_change(
    login: Callable[..., TestClient],
) -> None:
    owner = login(sub="sub-b", name="B")
    x = add(owner, root_id(owner), "B's X")
    before = view(owner, root_id(owner), depth=10)
    intruder = login(sub="sub-a", name="A")

    requests = [
        intruder.get(f"/api/nodes/{x['id']}/view"),
        intruder.post(f"/api/nodes/{x['id']}/children", json={"title": "intruder"}, headers=CSRF),
        patch(intruder, x, title="overwritten"),
        intruder.delete(f"/api/nodes/{x['id']}", headers=CSRF),
    ]

    assert [r.status_code for r in requests] == [404, 404, 404, 404]
    assert view(owner, root_id(owner), depth=10) == before


def test_criterion_13_missing_id_returns_404(client: TestClient) -> None:
    missing = str(uuid.uuid4())

    requests = [
        client.get(f"/api/nodes/{missing}/view"),
        client.post(f"/api/nodes/{missing}/children", json={"title": "x"}, headers=CSRF),
        client.patch(f"/api/nodes/{missing}", json={"version": 1, "title": "x"}, headers=CSRF),
        client.delete(f"/api/nodes/{missing}", headers=CSRF),
    ]

    assert [r.status_code for r in requests] == [404, 404, 404, 404]
    assert {r.json()["detail"] for r in requests} == {"node not found"}


def test_criterion_13_someone_elses_root_returns_404_to_every_operation(
    login: Callable[..., TestClient],
) -> None:
    owner = login(sub="sub-owner", name="Owner")
    root_owner = root_id(owner)
    intruder = login(sub="sub-intruder", name="Intruder")

    requests = [
        intruder.get(f"/api/nodes/{root_owner}/view"),
        intruder.post(f"/api/nodes/{root_owner}/children", json={"title": "child"}, headers=CSRF),
        intruder.patch(
            f"/api/nodes/{root_owner}", json={"version": 1, "title": "hack"}, headers=CSRF
        ),
        intruder.delete(f"/api/nodes/{root_owner}", headers=CSRF),
    ]

    assert [r.status_code for r in requests] == [404, 404, 404, 404]


def test_criterion_13_malformed_non_uuid_id_returns_422(client: TestClient) -> None:
    malformed = "not-a-uuid"
    requests = [
        client.get(f"/api/nodes/{malformed}/view"),
        client.post(f"/api/nodes/{malformed}/children", json={"title": "x"}, headers=CSRF),
        client.patch(f"/api/nodes/{malformed}", json={"version": 1, "title": "x"}, headers=CSRF),
        client.delete(f"/api/nodes/{malformed}", headers=CSRF),
    ]
    assert [r.status_code for r in requests] == [422, 422, 422, 422]


def test_criterion_14_creating_after_a_sibling_inserts_it_in_order(client: TestClient) -> None:
    parent = add(client, root_id(client), "P")
    h1 = add(client, parent["id"], "H1")
    add(client, parent["id"], "H2")

    add(client, parent["id"], "N", after_sort_key=h1["sort_key"])

    window = view(client, parent["id"], depth=1)
    assert children_titles(window, parent["id"]) == ["H1", "N", "H2"]


def test_criterion_14_creating_without_after_sort_key_goes_last(client: TestClient) -> None:
    parent = add(client, root_id(client), "P")
    h1 = add(client, parent["id"], "H1")
    add(client, parent["id"], "H2")
    add(client, parent["id"], "H3", after_sort_key=h1["sort_key"])

    add(client, parent["id"], "Last")

    window = view(client, parent["id"], depth=1)
    assert children_titles(window, parent["id"]) == ["H1", "H3", "H2", "Last"]


def test_criterion_14_new_node_has_initial_values(client: TestClient) -> None:
    node = add(client, root_id(client), "  New idea  ")

    assert node["title"] == "New idea"
    assert node["kind"] == "idea"
    assert node["props"] == {}
    assert node["collapsed"] is False
    assert node["version"] == 1
    assert node["child_count"] == 0


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_criterion_14_empty_or_long_title_returns_422(client: TestClient, title: str) -> None:
    root = root_id(client)

    response = client.post(f"/api/nodes/{root}/children", json={"title": title}, headers=CSRF)

    assert response.status_code == 422
    assert view(client, root)["focus"]["child_count"] == 0


def test_criterion_14_title_is_trimmed_and_allows_maximum_length_200(client: TestClient) -> None:
    root = root_id(client)
    max_title = "A" * 200
    padded = f"   {max_title}   "

    response = client.post(f"/api/nodes/{root}/children", json={"title": padded}, headers=CSRF)

    assert response.status_code == 201
    assert response.json()["title"] == max_title


def test_criterion_14_invalid_after_sort_key_returns_422(client: TestClient) -> None:
    root = root_id(client)

    response = client.post(
        f"/api/nodes/{root}/children",
        json={"title": "New", "after_sort_key": "invalid@#$"},
        headers=CSRF,
    )

    assert response.status_code == 422


def test_criterion_15_patch_with_current_version_increments_version(client: TestClient) -> None:
    node = add(client, root_id(client), "Before")

    response = patch(client, node, title="After")

    assert response.status_code == 200
    assert response.json()["title"] == "After"
    assert response.json()["version"] == node["version"] + 1


def test_criterion_15_patch_with_stale_version_returns_409_and_does_not_change(
    client: TestClient,
) -> None:
    node = add(client, root_id(client), "Original")
    updated = patch(client, node, title="First").json()

    response = patch(client, {**updated, "version": updated["version"] - 1}, title="Overwritten")

    assert response.status_code == 409
    assert response.json()["detail"] == "the node changed; fetch it again"
    child = view(client, root_id(client), depth=1)["nodes"][0]
    assert (child["title"], child["version"]) == ("First", updated["version"])


def test_criterion_15_patch_with_future_version_returns_409(client: TestClient) -> None:
    node = add(client, root_id(client), "Original")

    response = patch(client, {**node, "version": node["version"] + 5}, title="Future")

    assert response.status_code == 409
    child = view(client, root_id(client), depth=1)["nodes"][0]
    assert child["title"] == "Original"
    assert child["version"] == node["version"]


def test_criterion_15_patch_without_version_returns_422(client: TestClient) -> None:
    node = add(client, root_id(client), "No version")

    response = client.patch(f"/api/nodes/{node['id']}", json={"title": "x"}, headers=CSRF)

    assert response.status_code == 422


@pytest.mark.parametrize("ver", [0, -1, "one", 1.5])
def test_criterion_15_patch_invalid_version_returns_422(client: TestClient, ver: object) -> None:
    node = add(client, root_id(client), "Node")

    response = client.patch(
        f"/api/nodes/{node['id']}", json={"version": ver, "title": "x"}, headers=CSRF
    )

    assert response.status_code == 422


@pytest.mark.parametrize("title", ["", "   ", "x" * 201])
def test_criterion_15_patch_empty_or_long_title_returns_422(client: TestClient, title: str) -> None:
    node = add(client, root_id(client), "Original")

    response = patch(client, node, title=title)

    assert response.status_code == 422
    child = view(client, root_id(client), depth=1)["nodes"][0]
    assert child["title"] == "Original"
    assert child["version"] == node["version"]


def test_criterion_15_patch_unknown_fields_returns_422(client: TestClient) -> None:
    node = add(client, root_id(client), "Original")

    response = client.patch(
        f"/api/nodes/{node['id']}",
        json={"version": node["version"], "invalid": "no"},
        headers=CSRF,
    )

    assert response.status_code == 422


def test_criterion_15_patch_sort_key_reorders_and_validates_format(client: TestClient) -> None:
    parent = add(client, root_id(client), "P")
    first = add(client, parent["id"], "First")
    add(client, parent["id"], "Second")

    assert patch(client, first, sort_key="z").status_code == 200
    assert patch(client, first, sort_key="a-b").status_code == 422

    window = view(client, parent["id"], depth=1)
    assert children_titles(window, parent["id"]) == ["Second", "First"]


def test_criterion_16_delete_removes_the_subtree_and_lowers_child_count(
    client: TestClient,
) -> None:
    root = root_id(client)
    target = add(client, root, "Delete")
    add(client, root, "Stays")
    level1 = [add(client, target["id"], f"h{i}") for i in range(3)]
    level2 = [add(client, level1[0]["id"], f"n{i}") for i in range(3)]
    add(client, level2[0]["id"], "deep")
    assert view(client, target["id"], depth=10)["focus"]["child_count"] == 3
    assert len(view(client, target["id"], depth=10)["nodes"]) == 7

    response = client.delete(f"/api/nodes/{target['id']}", headers=CSRF)

    assert response.status_code == 204
    window = view(client, root, depth=10)
    assert window["focus"]["child_count"] == 1
    assert [n["title"] for n in window["nodes"]] == ["Stays"]
    gone = client.get(f"/api/nodes/{level2[0]['id']}/view")
    assert gone.status_code == 404


def test_criterion_16_deleting_the_root_returns_422(client: TestClient) -> None:
    root = root_id(client)
    add(client, root, "child")

    response = client.delete(f"/api/nodes/{root}", headers=CSRF)

    assert response.status_code == 422
    assert view(client, root)["focus"]["child_count"] == 1


def test_criterion_16_deleting_a_leaf_lowers_the_parent_child_count(client: TestClient) -> None:
    root = root_id(client)
    leaf = add(client, root, "Leaf")
    assert view(client, root)["focus"]["child_count"] == 1

    response = client.delete(f"/api/nodes/{leaf['id']}", headers=CSRF)

    assert response.status_code == 204
    assert view(client, root)["focus"]["child_count"] == 0
    assert client.get(f"/api/nodes/{leaf['id']}/view").status_code == 404


def test_criterion_16_repeated_delete_returns_404(client: TestClient) -> None:
    root = root_id(client)
    node = add(client, root, "Deletable")

    res1 = client.delete(f"/api/nodes/{node['id']}", headers=CSRF)
    assert res1.status_code == 204

    res2 = client.delete(f"/api/nodes/{node['id']}", headers=CSRF)
    assert res2.status_code == 404


@pytest.mark.parametrize(
    "extra", [{"kind": "document"}, {"props": {"url": "https://x"}}, {"props": "text"}]
)
def test_criterion_17_post_with_invalid_kind_or_props_returns_422(
    client: TestClient, extra: dict
) -> None:
    root = root_id(client)

    response = client.post(
        f"/api/nodes/{root}/children", json={"title": "x", **extra}, headers=CSRF
    )

    assert response.status_code == 422
    assert view(client, root)["focus"]["child_count"] == 0


def test_criterion_17_props_with_unknown_keys_for_idea_returns_422(
    client: TestClient,
) -> None:
    root = root_id(client)

    # POST with unknown props
    res_post = client.post(
        f"/api/nodes/{root}/children",
        json={"title": "x", "props": {"extra_key": "not_allowed"}},
        headers=CSRF,
    )
    assert res_post.status_code == 422

    # PATCH with unknown props
    node = add(client, root, "Idea")
    res_patch = patch(client, node, props={"other_key": 123})
    assert res_patch.status_code == 422


def test_criterion_17_patch_changing_kind_returns_422(client: TestClient) -> None:
    root = root_id(client)
    node = add(client, root, "Idea")

    # Trying to change from "idea" to another kind returns 422
    response = patch(client, node, kind="document")
    assert response.status_code == 422


@pytest.mark.parametrize("extra", [{"kind": "document"}, {"props": {"url": "https://x"}}])
def test_criterion_17_patch_with_invalid_kind_or_props_returns_422(
    client: TestClient, extra: dict
) -> None:
    node = add(client, root_id(client), "Idea")

    response = patch(client, node, title="changed", **extra)

    assert response.status_code == 422
    child = view(client, root_id(client), depth=1)["nodes"][0]
    assert (child["title"], child["kind"], child["props"], child["version"]) == (
        "Idea",
        "idea",
        {},
        1,
    )


def test_criterion_17_patch_with_valid_kind_and_props_is_accepted(client: TestClient) -> None:
    node = add(client, root_id(client), "Idea")

    response = patch(client, node, kind="idea", props={})

    assert response.status_code == 200


def test_criterion_8_node_mutations_without_csrf_header_return_403(
    client: TestClient,
) -> None:
    root = root_id(client)
    node = add(client, root, "Untouched")
    before = view(client, root, depth=10)

    requests = [
        client.post(f"/api/nodes/{root}/children", json={"title": "new"}),
        client.patch(f"/api/nodes/{node['id']}", json={"version": 1, "title": "changed"}),
        client.delete(f"/api/nodes/{node['id']}"),
    ]

    assert [r.status_code for r in requests] == [403, 403, 403]
    assert view(client, root, depth=10) == before
