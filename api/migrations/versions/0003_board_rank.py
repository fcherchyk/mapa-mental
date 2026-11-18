"""Board rank (slice 4B): one global order for the tasks of a map.

Existing tasks get ranks in depth-first tree order (decision D3). Ideas keep NULL.

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from app.nodes.sort_keys import key_between

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("nodes", sa.Column("board_rank", sa.Text(collation="C"), nullable=True))
    op.create_index("ix_nodes_map_id_board_rank", "nodes", ["map_id", "board_rank"])
    backfill()


def downgrade() -> None:
    op.drop_index("ix_nodes_map_id_board_rank", table_name="nodes")
    op.drop_column("nodes", "board_rank")


def backfill() -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, map_id, parent_id, kind, sort_key FROM nodes")
    ).mappings()
    by_map: dict[object, list[dict]] = {}
    for row in rows:
        by_map.setdefault(row["map_id"], []).append(dict(row))
    update = sa.text("UPDATE nodes SET board_rank = :rank WHERE id = :id")
    for nodes in by_map.values():
        tasks = tasks_in_tree_order(nodes)
        for node_id, rank in zip(tasks, spread_keys(None, None, len(tasks)), strict=True):
            connection.execute(update, {"rank": rank, "id": node_id})


def tasks_in_tree_order(nodes: list[dict]) -> list[object]:
    """Ids of the map's tasks, depth first, siblings by `sort_key`."""
    children: dict[object, list[dict]] = {}
    roots = []
    for node in nodes:
        (roots if node["parent_id"] is None else children.setdefault(node["parent_id"], [])).append(
            node
        )
    order: list[object] = []

    def walk(level: list[dict]) -> None:
        for node in sorted(level, key=lambda n: (n["sort_key"], str(n["id"]))):
            if node["kind"] == "task":
                order.append(node["id"])
            walk(children.get(node["id"], []))

    walk(roots)
    return order


def spread_keys(lower: str | None, upper: str | None, count: int) -> list[str]:
    if count == 0:
        return []
    middle = count // 2
    key = key_between(lower, upper)
    return [*spread_keys(lower, key, middle), key, *spread_keys(key, upper, count - middle - 1)]
