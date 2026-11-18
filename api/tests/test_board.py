"""Slice 4B, criteria S4B_BE_AC1 to AC11: the board, its global order and `board-move`."""

import uuid
from collections.abc import Callable

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy import Engine, inspect, text

from tests.conftest import CSRF
from tests.test_description import alembic, detail
from tests.test_nodes import add, patch, root_id, view
from tests.test_tasks import add_task, item


def board(client: TestClient, node_id: str) -> dict:
    response = client.get(f"/api/nodes/{node_id}/board")
    assert response.status_code == 200, response.text
    return response.json()


def titles(client: TestClient, node_id: str) -> list[str]:
    return [task["title"] for task in board(client, node_id)["tasks"]]


def board_move(client: TestClient, task: dict, **body: object):
    payload = {"version": task["version"], **body}
    return client.post(f"/api/nodes/{task['id']}/board-move", json=payload, headers=CSRF)


def moved(client: TestClient, task: dict, **body: object) -> dict:
    response = board_move(client, task, **body)
    assert response.status_code == 200, response.text
    return response.json()


def ranks(admin_engine: Engine) -> dict[str, str | None]:
    with admin_engine.connect() as connection:
        rows = connection.execute(text("SELECT title, board_rank FROM nodes")).all()
    return {title: rank for title, rank in rows}


@pytest.fixture
def forest(client: TestClient) -> dict[str, dict]:
    """root ─ P ─ A(task), Q(collapsed idea) ─ B(task, level 2), R ─ S ─ T ─ C(task, level 5)
    root ─ X(idea outside P) ─ D(task)
    Tree order of tasks: A, B, C, D."""
    root = root_id(client)
    p = add(client, root, "P")
    a = add_task(client, p["id"], "A")
    q = add(client, p["id"], "Q")
    b = add_task(client, q["id"], "B")
    assert patch(client, q, collapsed=True).status_code == 200
    r = add(client, p["id"], "R")
    s = add(client, r["id"], "S")
    t = add(client, s["id"], "T")
    c = add_task(client, t["id"], "C")
    x = add(client, root, "X")
    d = add_task(client, x["id"], "D")
    return {"root": {"id": root}, "P": p, "A": a, "Q": q, "B": b, "C": c, "X": x, "D": d}


# --- S4B_BE_AC1: every task under the focus --------------------------------------------------


def test_S4B_BE_AC1_board_has_every_task_descendant_at_any_depth(
    client: TestClient, forest: dict[str, dict]
) -> None:
    result = board(client, forest["P"]["id"])

    assert [t["title"] for t in result["tasks"]] == ["A", "B", "C"]
    assert {t["kind"] for t in result["tasks"]} == {"task"}
    assert result["focus"] == view(client, forest["P"]["id"])["focus"]
    assert result["ancestors"] == view(client, forest["P"]["id"])["ancestors"]


def test_S4B_BE_AC1_root_board_has_every_task_of_the_map(
    client: TestClient, forest: dict[str, dict]
) -> None:
    assert titles(client, forest["root"]["id"]) == ["A", "B", "C", "D"]


def test_S4B_BE_AC1_tasks_carry_their_props(client: TestClient) -> None:
    root = root_id(client)
    props = {"status": "in_progress", "checklist": [item("a", "Go", True)]}
    task = add_task(client, root, "T", props=props)

    [card] = board(client, root)["tasks"]

    assert (card["id"], card["props"], card["parent_id"]) == (task["id"], props, root)


# --- S4B_BE_AC2: ordered by rank --------------------------------------------------------------


def test_S4B_BE_AC2_order_ignores_status_and_tree_position(
    client: TestClient, forest: dict[str, dict]
) -> None:
    moved(client, forest["A"], status="done")
    moved(client, forest["D"], status="to_do", place={"before_id": forest["B"]["id"]})

    assert titles(client, forest["root"]["id"]) == ["A", "D", "B", "C"]


def test_S4B_BE_AC2_board_without_tasks_is_empty(client: TestClient) -> None:
    root = root_id(client)
    idea = add(client, root, "Only ideas")

    assert board(client, idea["id"])["tasks"] == []
    assert board(client, root)["tasks"] == []


def test_S4B_BE_AC2_a_task_as_focus_has_no_cards(client: TestClient) -> None:
    task = add_task(client, root_id(client), "T")

    assert board(client, task["id"])["tasks"] == []


# --- S4B_BE_AC3: new tasks land in tree order -------------------------------------------------


def test_S4B_BE_AC3_task_created_between_siblings_lands_between_them(
    client: TestClient,
) -> None:
    root = root_id(client)
    a = add_task(client, root, "A")
    add_task(client, root, "C")

    add_task(client, root, "B", after_sort_key=a["sort_key"])

    assert titles(client, root) == ["A", "B", "C"]


def test_S4B_BE_AC3_task_under_an_idea_between_two_tasks_lands_between_them(
    client: TestClient,
) -> None:
    root = root_id(client)
    add_task(client, root, "A")
    idea = add(client, root, "Idea")
    add_task(client, root, "C")

    add_task(client, idea["id"], "B")

    assert titles(client, root) == ["A", "B", "C"]


def test_S4B_BE_AC3_first_task_of_the_map_and_one_before_every_other(
    client: TestClient,
) -> None:
    root = root_id(client)
    first = add_task(client, root, "First")
    assert titles(client, root) == ["First"]

    add(client, root, "Idea before", after_sort_key=None)
    add_task(client, root, "Zero", after_sort_key=None)  # last sibling, but...
    early = add(client, root, "Early")
    assert patch(client, early, sort_key="0" + first["sort_key"]).status_code == 200
    add_task(client, early["id"], "Earliest")

    assert titles(client, root) == ["Earliest", "First", "Zero"]


def test_S4B_BE_AC3_tasks_deeper_in_the_tree_keep_depth_first_order(
    client: TestClient, forest: dict[str, dict]
) -> None:
    # A new task under P after R goes after C (R's subtree) and before D (X's subtree).
    add_task(client, forest["P"]["id"], "E")

    assert titles(client, forest["root"]["id"]) == ["A", "B", "C", "E", "D"]


# --- S4B_BE_AC4: board_place on create --------------------------------------------------------


def test_S4B_BE_AC4_board_place_after_and_before(client: TestClient) -> None:
    root = root_id(client)
    a = add_task(client, root, "A")
    c = add_task(client, root, "C")
    other = add(client, root, "Other branch")

    add_task(client, other["id"], "After A", board_place={"after_id": a["id"]})
    add_task(client, other["id"], "Before C", board_place={"before_id": c["id"]})
    add_task(client, other["id"], "Last", board_place={"after_id": c["id"]})

    assert titles(client, root) == ["A", "After A", "Before C", "C", "Last"]


@pytest.mark.parametrize("kind", ["idea", None])
def test_S4B_BE_AC4_board_place_on_an_idea_returns_422(
    client: TestClient, kind: str | None
) -> None:
    root = root_id(client)
    anchor = add_task(client, root, "Anchor")
    body: dict = {"title": "I", "board_place": {"after_id": anchor["id"]}}
    if kind:
        body["kind"] = kind

    response = client.post(f"/api/nodes/{root}/children", json=body, headers=CSRF)

    assert response.status_code == 422
    assert titles(client, root) == ["Anchor"]
    assert [n["title"] for n in view(client, root, depth=1)["nodes"]] == ["Anchor"]


def test_S4B_BE_AC4_board_place_naming_an_idea_missing_or_foreign_node_fails(
    login: Callable[..., TestClient],
) -> None:
    client = login()
    root = root_id(client)
    idea = add(client, root, "Idea")
    other = login(sub="sub-other", name="Other")
    foreign = add_task(other, root_id(other), "Foreign")

    def create(place: dict):
        body = {"title": "T", "kind": "task", "board_place": place}
        return client.post(f"/api/nodes/{root}/children", json=body, headers=CSRF)

    assert create({"after_id": idea["id"]}).status_code == 422
    assert create({"after_id": str(uuid.uuid4())}).status_code == 404
    assert create({"before_id": foreign["id"]}).status_code == 404
    assert create({"before_id": idea["id"], "after_id": idea["id"]}).status_code == 422
    assert titles(client, root) == []


# --- S4B_BE_AC5: board-move reorders ----------------------------------------------------------


@pytest.fixture
def abcd(client: TestClient) -> dict[str, dict]:
    root = root_id(client)
    tasks = {name: add_task(client, root, name) for name in "ABCD"}
    tasks["root"] = {"id": root}
    return tasks


def test_S4B_BE_AC5_after_id_moves_to_the_end(client: TestClient, abcd: dict[str, dict]) -> None:
    result = moved(client, abcd["B"], status="to_do", place={"after_id": abcd["D"]["id"]})

    assert titles(client, abcd["root"]["id"]) == ["A", "C", "D", "B"]
    assert result["version"] == abcd["B"]["version"] + 1


def test_S4B_BE_AC5_before_id_moves_to_the_front(client: TestClient, abcd: dict[str, dict]) -> None:
    moved(client, abcd["B"], status="to_do", place={"before_id": abcd["A"]["id"]})

    assert titles(client, abcd["root"]["id"]) == ["B", "A", "C", "D"]


def test_S4B_BE_AC5_only_the_moved_row_changes(
    client: TestClient, abcd: dict[str, dict], admin_engine: Engine
) -> None:
    before = ranks(admin_engine)

    moved(client, abcd["B"], status="to_do", place={"after_id": abcd["C"]["id"]})

    after = ranks(admin_engine)
    assert {k: v for k, v in after.items() if k != "B"} == {
        k: v for k, v in before.items() if k != "B"
    }
    assert after["B"] != before["B"]
    for name in "ACD":
        assert detail(client, abcd[name]["id"])["version"] == abcd[name]["version"]


# --- S4B_BE_AC6: status and checklist ---------------------------------------------------------


def test_S4B_BE_AC6_status_changes_and_checklist_is_kept(client: TestClient) -> None:
    root = root_id(client)
    checklist = [item("a", "One", True), item("b", "Two")]
    a = add_task(client, root, "A", props={"checklist": checklist})
    b = add_task(client, root, "B")

    result = moved(client, a, status="done", place={"after_id": b["id"]})

    assert result["props"] == {"status": "done", "checklist": checklist}
    assert titles(client, root) == ["B", "A"]
    assert detail(client, a["id"])["props"] == {"status": "done", "checklist": checklist}


def test_S4B_BE_AC6_without_place_only_the_status_changes(
    client: TestClient, abcd: dict[str, dict]
) -> None:
    result = moved(client, abcd["B"], status="in_progress")

    assert result["props"]["status"] == "in_progress"
    assert result["version"] == abcd["B"]["version"] + 1
    assert titles(client, abcd["root"]["id"]) == ["A", "B", "C", "D"]


def test_S4B_BE_AC6_a_move_that_changes_nothing_keeps_the_version(
    client: TestClient, abcd: dict[str, dict]
) -> None:
    same_place = moved(client, abcd["B"], status="to_do", place={"after_id": abcd["A"]["id"]})
    same_before = moved(client, abcd["B"], status="to_do", place={"before_id": abcd["C"]["id"]})
    no_place = moved(client, abcd["B"], status="to_do")

    assert same_place["version"] == same_before["version"] == no_place["version"]
    assert no_place["version"] == abcd["B"]["version"]
    assert titles(client, abcd["root"]["id"]) == ["A", "B", "C", "D"]


# --- S4B_BE_AC7: refusals ---------------------------------------------------------------------


def test_S4B_BE_AC7_moving_an_idea_returns_422(client: TestClient) -> None:
    idea = add(client, root_id(client), "Idea")

    assert board_move(client, idea, status="done").status_code == 422
    assert detail(client, idea["id"])["props"] == {}


@pytest.mark.parametrize(
    "make_body",
    [
        lambda tasks: {"status": "done", "place": {"after_id": tasks["B"]["id"]}},
        lambda tasks: {"status": "done", "place": {"before_id": tasks["idea"]["id"]}},
        lambda tasks: {"status": "done", "place": {"after_id": str(uuid.uuid4())}},
        lambda tasks: {"status": "later"},
        lambda tasks: {
            "status": "done",
            "place": {"before_id": tasks["A"]["id"], "after_id": tasks["A"]["id"]},
        },
        lambda tasks: {"status": "done", "place": {"first": True}},
        lambda tasks: {"status": "done", "sort_key": "x"},
        lambda tasks: {"place": {"after_id": tasks["A"]["id"]}},
    ],
    ids=[
        "itself",
        "an idea",
        "missing",
        "unknown status",
        "both",
        "other key",
        "extra",
        "no status",
    ],
)
def test_S4B_BE_AC7_invalid_moves_change_nothing(client: TestClient, make_body: Callable) -> None:
    root = root_id(client)
    tasks = {"A": add_task(client, root, "A"), "B": add_task(client, root, "B")}
    tasks["idea"] = add(client, root, "Idea")

    response = board_move(client, tasks["B"], **make_body(tasks))

    assert response.status_code in (404, 422), response.text
    assert titles(client, root) == ["A", "B"]
    assert detail(client, tasks["B"]["id"])["props"]["status"] == "to_do"
    assert detail(client, tasks["B"]["id"])["version"] == tasks["B"]["version"]


def test_S4B_BE_AC7_stale_version_returns_409(client: TestClient, abcd: dict[str, dict]) -> None:
    moved(client, abcd["B"], status="done")

    response = board_move(client, abcd["B"], status="to_do")

    assert response.status_code == 409
    assert detail(client, abcd["B"]["id"])["props"]["status"] == "done"


def test_S4B_BE_AC7_someone_elses_task_is_not_found_or_refused(
    login: Callable[..., TestClient],
) -> None:
    owner = login(sub="sub-owner", name="Owner")
    theirs = add_task(owner, root_id(owner), "Theirs")
    intruder = login(sub="sub-intruder", name="Intruder")
    mine = add_task(intruder, root_id(intruder), "Mine")

    as_target = board_move(intruder, theirs, status="done")
    as_place = board_move(intruder, mine, status="done", place={"after_id": theirs["id"]})

    assert as_target.status_code == 404
    assert as_place.status_code == 404
    assert detail(owner, theirs["id"])["props"]["status"] == "to_do"
    assert detail(intruder, mine["id"])["props"]["status"] == "to_do"


def test_S4B_BE_AC7_missing_csrf_header_returns_403(client: TestClient) -> None:
    task = add_task(client, root_id(client), "T")

    response = client.post(
        f"/api/nodes/{task['id']}/board-move", json={"status": "done", "version": 1}
    )

    assert response.status_code == 403


# --- S4B_BE_AC8: tree changes keep ranks ------------------------------------------------------


def test_S4B_BE_AC8_tree_moves_patches_and_reparent_keep_every_rank(
    client: TestClient, forest: dict[str, dict], admin_engine: Engine
) -> None:
    before = ranks(admin_engine)
    a = forest["A"]

    # A task moves to another idea.
    move = {"parent_id": forest["X"]["id"], "place": "first", "version": a["version"]}
    assert client.post(f"/api/nodes/{a['id']}/move", json=move, headers=CSRF).status_code == 200
    # An idea with tasks inside moves.
    q = detail(client, forest["Q"]["id"])
    move = {"parent_id": forest["X"]["id"], "place": "last", "version": q["version"]}
    assert client.post(f"/api/nodes/{q['id']}/move", json=move, headers=CSRF).status_code == 200
    # Title and props patches.
    assert patch(client, detail(client, a["id"]), title="A renamed").status_code == 200
    c = detail(client, forest["C"]["id"])
    assert patch(client, c, props={"status": "done", "checklist": []}).status_code == 200
    # Reparent delete of X: its children (D, A, Q) move up to the root.
    response = client.delete(
        f"/api/nodes/{forest['X']['id']}", params={"children": "reparent"}, headers=CSRF
    )
    assert response.status_code == 204

    after = ranks(admin_engine)
    after["A"] = after.pop("A renamed")
    assert after == {k: v for k, v in before.items() if k != "X"}
    assert titles(client, forest["root"]["id"]) == ["A renamed", "B", "C", "D"]


# --- S4B_BE_AC9: migration --------------------------------------------------------------------


def test_S4B_BE_AC9_backfill_ranks_tasks_in_tree_order_per_map(
    login: Callable[..., TestClient], postgres_url: str, admin_engine: Engine
) -> None:
    ana = login(sub="sub-ana", name="Ana")
    root_a = root_id(ana)
    p = add(ana, root_a, "P")
    add_task(ana, p["id"], "A")
    q = add(ana, p["id"], "Q")
    add_task(ana, q["id"], "B")
    add_task(ana, root_a, "C")
    bob = login(sub="sub-bob", name="Bob")
    root_b = root_id(bob)
    add_task(bob, root_b, "Y")
    add_task(bob, root_b, "X", after_sort_key=None)
    x = detail(bob, board(bob, root_b)["tasks"][1]["id"])
    assert (
        patch(bob, x, sort_key="0" + board(bob, root_b)["tasks"][0]["sort_key"]).status_code == 200
    )
    # Scramble the ranks as if they had never been computed.
    with admin_engine.begin() as connection:
        connection.execute(text("UPDATE nodes SET board_rank = 'zz' WHERE kind = 'task'"))
    config = alembic(postgres_url)

    command.downgrade(config, "0002")
    try:
        assert "board_rank" not in {c["name"] for c in inspect(admin_engine).get_columns("nodes")}
    finally:
        command.upgrade(config, "head")

    stored = ranks(admin_engine)
    assert stored["P"] is None and stored["Q"] is None and stored["Ana"] is None
    assert all(stored[t] for t in ("A", "B", "C", "X", "Y"))
    assert titles(ana, root_a) == ["A", "B", "C"]
    assert titles(bob, root_b) == ["X", "Y"]
    index_names = {i["name"] for i in inspect(admin_engine).get_indexes("nodes")}
    assert "ix_nodes_map_id_board_rank" in index_names


# --- S4B_BE_AC10: path in the detail ----------------------------------------------------------


def test_S4B_BE_AC10_detail_carries_the_path_from_the_root(
    client: TestClient, forest: dict[str, dict]
) -> None:
    body = detail(client, forest["C"]["id"])

    assert [entry["title"] for entry in body["path"]] == ["Ana Pérez", "P", "R", "S", "T"]
    assert body["path"][1]["id"] == forest["P"]["id"]
    assert detail(client, forest["root"]["id"])["path"] == []


def test_S4B_BE_AC10_path_has_current_titles_and_comes_with_patch(
    client: TestClient, forest: dict[str, dict]
) -> None:
    assert patch(client, forest["P"], title="Project").status_code == 200

    patched = patch(client, forest["A"], title="A2")

    assert patched.status_code == 200
    assert [e["title"] for e in patched.json()["path"]] == ["Ana Pérez", "Project"]
    assert [e["title"] for e in detail(client, forest["A"]["id"])["path"]] == [
        "Ana Pérez",
        "Project",
    ]


# --- S4B_BE_AC11: isolation -------------------------------------------------------------------


def test_S4B_BE_AC11_someone_elses_board_returns_404(login: Callable[..., TestClient]) -> None:
    owner = login(sub="sub-owner", name="Owner")
    intruder = login(sub="sub-intruder", name="Intruder")

    assert intruder.get(f"/api/nodes/{root_id(owner)}/board").status_code == 404
    assert intruder.get(f"/api/nodes/{uuid.uuid4()}/board").status_code == 404
