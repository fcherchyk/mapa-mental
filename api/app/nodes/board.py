"""The board: one order for every task of a map, and moves between columns (slice 4B)."""

import uuid
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.models import Node
from app.node_types import TASK_KIND, validate_props
from app.nodes import repository
from app.nodes.schemas import BeforeTask, BoardMove, BoardPlace, BoardView, NodeOut
from app.nodes.sort_keys import key_between

NOT_FOUND = "node not found"
VERSION_CONFLICT = "the node changed; fetch it again"
NOT_A_TASK = "only a task can be moved on the board"
BAD_PLACE = "place must name another task of the same map"


def get_board(db: Session, owner_id: uuid.UUID, focus_id: uuid.UUID) -> BoardView:
    # Imported here: `service` is the module that owns `to_node_out` and the window helpers.
    from app.nodes.service import to_node_out

    focus = repository.get_owned_node(db, owner_id, focus_id)
    if focus is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return BoardView(
        focus=to_node_out(db, focus),
        ancestors=[NodeOut(**row) for row in repository.fetch_ancestors(db, owner_id, focus_id)],
        tasks=[
            NodeOut(**row)
            for row in repository.fetch_board_tasks(db, owner_id, focus_id, TASK_KIND)
        ],
    )


def board_move(db: Session, owner_id: uuid.UUID, node_id: uuid.UUID, data: BoardMove) -> NodeOut:
    """Sets a task's status and, with `place`, its position in the board order, in one write."""
    from app.nodes.service import to_node_out

    node = repository.get_owned_node(db, owner_id, node_id)
    if node is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    if node.kind != TASK_KIND:
        raise HTTPException(422, NOT_A_TASK)
    if data.version != node.version:
        raise HTTPException(status.HTTP_409_CONFLICT, VERSION_CONFLICT)
    props = validate_props(node.kind, {**node.props, "status": data.status})
    rank = node.board_rank
    if data.place is not None:
        rank = rank_at(db, owner_id, node, data.place)
    if props == node.props and rank == node.board_rank:
        return to_node_out(db, node)
    try:
        node.props = props
        node.board_rank = rank
        db.commit()
    except StaleDataError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, VERSION_CONFLICT) from None
    except Exception:
        db.rollback()
        raise
    return to_node_out(db, node)


def rank_at(db: Session, owner_id: uuid.UUID, node: Node, place: BoardPlace) -> str | None:
    """`node`'s rank right before or after the task `place` names; unchanged if already there."""
    target_id = place.before_id if isinstance(place, BeforeTask) else place.after_id
    target = repository.get_owned_node(db, owner_id, target_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    if target.id == node.id or target.map_id != node.map_id or target.board_rank is None:
        raise HTTPException(422, BAD_PLACE)
    return rank_next_to(
        db,
        node.map_id,
        target.board_rank,
        side_of(place),
        exclude_id=node.id,
        current=node.board_rank,
    )


Side = Literal["before", "after"]


def side_of(place: BoardPlace) -> Side:
    return "before" if isinstance(place, BeforeTask) else "after"


def rank_next_to(
    db: Session,
    map_id: uuid.UUID,
    anchor: str,
    side: Side,
    exclude_id: uuid.UUID | None = None,
    current: str | None = None,
) -> str:
    """A rank right before or after `anchor` in the map's order, ignoring `exclude_id`'s own.

    If `current` already sits exactly there, it is returned unchanged, so a no-op move does not
    rewrite the row (S4B_BE_AC6).
    """
    if side == "after":
        upper = repository.next_board_rank(db, map_id, anchor, exclude_id)
        if current is not None and anchor < current and (upper is None or current < upper):
            return current
        return key_between(anchor, upper)
    lower = repository.previous_board_rank(db, map_id, anchor, exclude_id)
    if current is not None and current < anchor and (lower is None or lower < current):
        return current
    return key_between(lower, anchor)


def rank_for_new_task(
    db: Session, parent: Node, sort_key: str, place: BoardPlace | None, owner_id: uuid.UUID
) -> str:
    """Rank of a task about to be created under `parent` with `sort_key` (decision D3).

    With `place`, right before or after the task it names. Otherwise, right after the task that
    precedes it in depth-first tree order; with none, right before the one that follows it; in a
    map without tasks, the first key.
    """
    if place is not None:
        target_id = place.before_id if isinstance(place, BeforeTask) else place.after_id
        target = repository.get_owned_node(db, owner_id, target_id)
        if target is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
        if target.map_id != parent.map_id or target.board_rank is None:
            raise HTTPException(422, BAD_PLACE)
        return rank_next_to(db, parent.map_id, target.board_rank, side_of(place))
    before, after = tree_neighbours(repository.map_outline(db, parent.map_id), parent.id, sort_key)
    if before is not None:
        return rank_next_to(db, parent.map_id, before, "after")
    if after is not None:
        return rank_next_to(db, parent.map_id, after, "before")
    return key_between(None, None)


def tree_neighbours(
    nodes: list[Node], parent_id: uuid.UUID, sort_key: str
) -> tuple[str | None, str | None]:
    """Ranks of the tasks right before and right after a new child of `parent_id` at `sort_key`
    in depth-first tree order. Only tasks with a rank count."""
    children: dict[uuid.UUID | None, list[Node]] = {}
    for node in nodes:
        children.setdefault(node.parent_id, []).append(node)
    marker = object()
    order: list[object] = []

    def walk(parent: uuid.UUID | None) -> None:
        level: list[tuple[tuple[str, str], object]] = [
            ((n.sort_key, str(n.id)), n) for n in children.get(parent, [])
        ]
        if parent == parent_id:
            level.append(((sort_key, ""), marker))
        for _, entry in sorted(level, key=lambda pair: pair[0]):
            if entry is marker:
                order.append(marker)
                continue
            node = entry
            assert isinstance(node, Node)
            if node.board_rank is not None:
                order.append(node.board_rank)
            walk(node.id)

    walk(None)
    position = order.index(marker)
    before = next((r for r in reversed(order[:position]) if isinstance(r, str)), None)
    after = next((r for r in order[position + 1 :] if isinstance(r, str)), None)
    return before, after
