"""Endpoints de nodos: ventana visible, crear, editar y borrar."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.auth.dependencies import current_user, require_csrf
from app.db import get_db
from app.models import User
from app.nodes import service
from app.nodes.schemas import NodeCreate, NodeOut, NodePatch, NodeView
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
    """Foco, ancestros y hasta `depth` niveles; sin `depth` usa la preferencia del usuario."""
    return service.get_view(db, user.id, node_id, depth or read_settings(user).depth)


@router.post(
    "/{node_id}/children",
    response_model=NodeOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_csrf)],
)
def create_child(node_id: uuid.UUID, data: NodeCreate, user: CurrentUser, db: Db) -> NodeOut:
    return service.create_child(db, user.id, node_id, data)


@router.patch("/{node_id}", response_model=NodeOut, dependencies=[Depends(require_csrf)])
def update_node(node_id: uuid.UUID, patch: NodePatch, user: CurrentUser, db: Db) -> NodeOut:
    return service.update_node(db, user.id, node_id, patch)


@router.delete(
    "/{node_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)]
)
def delete_node(
    node_id: uuid.UUID,
    user: CurrentUser,
    db: Db,
    children: Annotated[Literal["cascade", "reparent"], Query()] = "cascade",
) -> Response:
    """`children=cascade` borra el subárbol; `reparent` sube los hijos directos al padre."""
    service.delete_subtree(db, user.id, node_id, reparent=children == "reparent")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
