"""Node endpoints: visible window, create, edit and delete."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import current_user, require_csrf
from app.db import get_db
from app.models import User
from app.nodes import board, service
from app.nodes.schemas import (
    BoardMove,
    BoardView,
    NodeCreate,
    NodeDetail,
    NodeMove,
    NodeOut,
    NodePatch,
    NodeView,
)
from app.settings.schemas import DEPTH_MAX, DEPTH_MIN
from app.settings.service import read_settings

router = APIRouter(prefix="/nodes", tags=["nodes"])

CurrentUser = Annotated[User, Depends(current_user)]
Db = Annotated[Session, Depends(get_db)]


@router.get("/{node_id}/view", response_model=NodeView)
def view_node(
    node_id: uuid.UUID,
    user: CurrentUser,
    db: Db,
    depth: Annotated[int | None, Query(ge=DEPTH_MIN, le=DEPTH_MAX)] = None,
) -> NodeView:
    """Focus, ancestors and up to `depth` levels; without `depth` it uses the user's preference."""
    return service.get_view(db, user.id, node_id, depth or read_settings(user).depth)


@router.get("/{node_id}/board", response_model=BoardView)
def board_view(node_id: uuid.UUID, user: CurrentUser, db: Db) -> BoardView:
    """Every task under the node, at any depth, in board order (slice 4B)."""
    return board.get_board(db, user.id, node_id)


@router.post("/{node_id}/board-move", response_model=NodeOut, dependencies=[Depends(require_csrf)])
def board_move(node_id: uuid.UUID, data: BoardMove, user: CurrentUser, db: Db) -> NodeOut:
    """Sets a task's status and, with `place`, its position among the map's tasks."""
    return board.board_move(db, user.id, node_id, data)


@router.post(
    "/{node_id}/children",
    response_model=NodeOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_child(node_id: uuid.UUID, data: NodeCreate, user: CurrentUser, db: Db) -> NodeOut:
    return service.create_child(db, user.id, node_id, data)


@router.get("/{node_id}", response_model=NodeDetail)
def get_node(node_id: uuid.UUID, user: CurrentUser, db: Db) -> NodeDetail:
    """A single node with its description (slice 3); the window does not carry it."""
    return service.get_node(db, user.id, node_id)


@router.patch("/{node_id}", response_model=NodeDetail, dependencies=[Depends(require_csrf)])
def update_node(node_id: uuid.UUID, patch: NodePatch, user: CurrentUser, db: Db) -> NodeDetail:
    return service.update_node(db, user.id, node_id, patch)


@router.post("/{node_id}/move", response_model=NodeOut, dependencies=[Depends(require_csrf)])
def move_node(node_id: uuid.UUID, data: NodeMove, user: CurrentUser, db: Db) -> NodeOut:
    """Moves the node, with its whole subtree, to `parent_id` at `place`."""
    return service.move_node(db, user.id, node_id, data)


@router.delete(
    "/{node_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)]
)
def delete_node(
    node_id: uuid.UUID,
    user: CurrentUser,
    db: Db,
    children: Annotated[Literal["cascade", "reparent"], Query()] = "cascade",
) -> Response:
    """`children=cascade` deletes the subtree; `reparent` moves the direct children up."""
    service.delete_subtree(db, user.id, node_id, reparent=children == "reparent")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
