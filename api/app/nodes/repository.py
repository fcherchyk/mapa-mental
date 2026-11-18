"""Tree queries. All of them filter by `maps.owner_id` to prevent IDOR (ADR 0012)."""

import uuid
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.models import Map, Node

NODE_COLUMNS = """
    n.id, n.parent_id, n.kind, n.title, n.sort_key, n.collapsed, n.props, n.version,
    (SELECT count(*) FROM nodes k WHERE k.parent_id = n.id) AS child_count
"""

# Walks down from the focus up to `depth` levels; a collapsed node does not expand its children.
WINDOW_SQL = text(f"""
WITH RECURSIVE window_nodes AS (
    SELECT n.id, n.collapsed, 0 AS level
    FROM nodes n JOIN maps m ON m.id = n.map_id
    WHERE n.id = :focus_id AND m.owner_id = :owner_id
  UNION ALL
    SELECT c.id, c.collapsed, w.level + 1
    FROM window_nodes w JOIN nodes c ON c.parent_id = w.id
    WHERE w.level < :depth AND NOT w.collapsed
)
SELECT {NODE_COLUMNS}, w.level
FROM window_nodes w JOIN nodes n ON n.id = w.id
ORDER BY w.level, n.parent_id, n.sort_key, n.id
""")

# Walks up from the focus's parent to the root; returned from the root downwards.
ANCESTORS_SQL = text(f"""
WITH RECURSIVE chain AS (
    SELECT p.id, p.parent_id, 1 AS distance
    FROM nodes f JOIN nodes p ON p.id = f.parent_id
    WHERE f.id = :focus_id
  UNION ALL
    SELECT p.id, p.parent_id, c.distance + 1
    FROM chain c JOIN nodes p ON p.id = c.parent_id
)
SELECT {NODE_COLUMNS}
FROM chain c
JOIN nodes n ON n.id = c.id
JOIN maps m ON m.id = n.map_id AND m.owner_id = :owner_id
ORDER BY c.distance DESC
""")


# Walks up from a node to the root, to tell whether another node is one of its ancestors.
IS_DESCENDANT_SQL = text("""
WITH RECURSIVE chain AS (
    SELECT n.parent_id FROM nodes n WHERE n.id = :node_id
  UNION ALL
    SELECT p.parent_id FROM chain c JOIN nodes p ON p.id = c.parent_id
)
SELECT EXISTS (SELECT 1 FROM chain WHERE parent_id = :ancestor_id)
""")


# Every task under the focus, at any depth and whether or not something is collapsed, in the
# map's board order (slice 4B, decision D2). The focus itself is never a card.
BOARD_SQL = text(f"""
WITH RECURSIVE subtree AS (
    SELECT n.id, 0 AS level
    FROM nodes n JOIN maps m ON m.id = n.map_id
    WHERE n.id = :focus_id AND m.owner_id = :owner_id
  UNION ALL
    SELECT c.id, s.level + 1
    FROM subtree s JOIN nodes c ON c.parent_id = s.id
)
SELECT {NODE_COLUMNS}
FROM subtree s JOIN nodes n ON n.id = s.id
WHERE s.level > 0 AND n.kind = :task_kind
ORDER BY n.board_rank, n.id
""")


def fetch_window(
    db: Session, owner_id: uuid.UUID, focus_id: uuid.UUID, depth: int
) -> list[dict[str, Any]]:
    """Focus (level 0) and descendants down to `depth`; empty if the user does not own the focus."""
    params = {"focus_id": focus_id, "owner_id": owner_id, "depth": depth}
    return [dict(row) for row in db.execute(WINDOW_SQL, params).mappings()]


def fetch_ancestors(db: Session, owner_id: uuid.UUID, focus_id: uuid.UUID) -> list[dict[str, Any]]:
    params = {"focus_id": focus_id, "owner_id": owner_id}
    return [dict(row) for row in db.execute(ANCESTORS_SQL, params).mappings()]


def get_owned_node(db: Session, owner_id: uuid.UUID, node_id: uuid.UUID) -> Node | None:
    query = (
        select(Node)
        .join(Map, Map.id == Node.map_id)
        .where(Node.id == node_id, Map.owner_id == owner_id)
    )
    return db.scalar(query)


def count_children(db: Session, node_id: uuid.UUID) -> int:
    return db.scalar(select(func.count()).select_from(Node).where(Node.parent_id == node_id)) or 0


def is_descendant(db: Session, ancestor_id: uuid.UUID, node_id: uuid.UUID) -> bool:
    """True if `ancestor_id` is one of `node_id`'s ancestors, however far up."""
    params = {"ancestor_id": ancestor_id, "node_id": node_id}
    return bool(db.scalar(IS_DESCENDANT_SQL, params))


def siblings(parent_id: uuid.UUID, exclude_id: uuid.UUID | None) -> list[Any]:
    """Conditions for the children of `parent_id`, leaving out the node being moved."""
    conditions = [Node.parent_id == parent_id]
    if exclude_id is not None:
        conditions.append(Node.id != exclude_id)
    return conditions


def first_child_sort_key(
    db: Session, parent_id: uuid.UUID, exclude_id: uuid.UUID | None = None
) -> str | None:
    query = select(func.min(Node.sort_key)).where(*siblings(parent_id, exclude_id))
    return db.scalar(query)


def last_child_sort_key(
    db: Session, parent_id: uuid.UUID, exclude_id: uuid.UUID | None = None
) -> str | None:
    query = select(func.max(Node.sort_key)).where(*siblings(parent_id, exclude_id))
    return db.scalar(query)


def next_sibling_sort_key(
    db: Session, parent_id: uuid.UUID, after: str, exclude_id: uuid.UUID | None = None
) -> str | None:
    """Smallest `sort_key` among the children of `parent_id` that is greater than `after`."""
    query = select(func.min(Node.sort_key)).where(
        *siblings(parent_id, exclude_id), Node.sort_key > after
    )
    return db.scalar(query)


def previous_sibling_sort_key(
    db: Session, parent_id: uuid.UUID, before: str, exclude_id: uuid.UUID | None = None
) -> str | None:
    """Largest `sort_key` among the children of `parent_id` that is less than `before`."""
    query = select(func.max(Node.sort_key)).where(
        *siblings(parent_id, exclude_id), Node.sort_key < before
    )
    return db.scalar(query)


def ordered_children(db: Session, parent_id: uuid.UUID) -> list[Node]:
    query = select(Node).where(Node.parent_id == parent_id).order_by(Node.sort_key, Node.id)
    return list(db.scalars(query))


def fetch_board_tasks(
    db: Session, owner_id: uuid.UUID, focus_id: uuid.UUID, task_kind: str
) -> list[dict[str, Any]]:
    params = {"focus_id": focus_id, "owner_id": owner_id, "task_kind": task_kind}
    return [dict(row) for row in db.execute(BOARD_SQL, params).mappings()]


def map_outline(db: Session, map_id: uuid.UUID) -> list[Node]:
    """Every node of the map; enough to lay the tree out in memory and find tree neighbours."""
    return list(db.scalars(select(Node).where(Node.map_id == map_id)))


def ranked(map_id: uuid.UUID, exclude_id: uuid.UUID | None) -> list[Any]:
    conditions = [Node.map_id == map_id, Node.board_rank.is_not(None)]
    if exclude_id is not None:
        conditions.append(Node.id != exclude_id)
    return conditions


def next_board_rank(
    db: Session, map_id: uuid.UUID, after: str, exclude_id: uuid.UUID | None = None
) -> str | None:
    """Smallest `board_rank` in the map greater than `after`."""
    query = select(func.min(Node.board_rank)).where(
        *ranked(map_id, exclude_id), Node.board_rank > after
    )
    return db.scalar(query)


def previous_board_rank(
    db: Session, map_id: uuid.UUID, before: str, exclude_id: uuid.UUID | None = None
) -> str | None:
    """Largest `board_rank` in the map less than `before`."""
    query = select(func.max(Node.board_rank)).where(
        *ranked(map_id, exclude_id), Node.board_rank < before
    )
    return db.scalar(query)
