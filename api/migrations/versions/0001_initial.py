"""Tablas iniciales: users, sessions, maps y nodes.

Revision ID: 0001
Revises:
Create Date: 2026-10-28
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def timestamp(name: str) -> sa.Column:
    return sa.Column(name, sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("google_sub", sa.Text(), nullable=False, unique=True),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("avatar_url", sa.Text()),
        sa.Column(
            "settings",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("""'{"depth": 3}'::jsonb"""),
        ),
        timestamp("created_at"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        timestamp("created_at"),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_table(
        "maps",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "owner_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("root_node_id", sa.Uuid()),
        timestamp("created_at"),
        sa.UniqueConstraint("owner_id", name="uq_maps_owner_id"),
    )
    op.create_table(
        "nodes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "map_id",
            sa.Uuid(),
            sa.ForeignKey("maps.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("parent_id", sa.Uuid(), sa.ForeignKey("nodes.id", ondelete="CASCADE")),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("sort_key", sa.Text(collation="C"), nullable=False),
        sa.Column("collapsed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("props", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        timestamp("created_at"),
        timestamp("updated_at"),
    )
    op.create_index("ix_nodes_map_id", "nodes", ["map_id"])
    op.create_index("ix_nodes_parent_id_sort_key", "nodes", ["parent_id", "sort_key"])
    op.create_foreign_key(
        "fk_maps_root_node_id",
        "maps",
        "nodes",
        ["root_node_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_maps_root_node_id", "maps", type_="foreignkey")
    op.drop_table("nodes")
    op.drop_table("maps")
    op.drop_table("sessions")
    op.drop_table("users")
