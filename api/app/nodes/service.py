"""Nodes API rules on top of the repository."""

import uuid

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import delete
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.models import Node
from app.node_types import validate_props
from app.nodes import repository
from app.nodes.schemas import (
    AfterSibling,
    NodeCreate,
    NodeDetail,
    NodeMove,
    NodeOut,
    NodePatch,
    NodeView,
    WindowNode,
)
from app.nodes.sort_keys import key_between

NOT_FOUND = "node not found"
VERSION_CONFLICT = "the node changed; fetch it again"


def not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)


def unprocessable(detail: str) -> HTTPException:
    return HTTPException(422, detail)


def to_node_out(db: Session, node: Node) -> NodeOut:
    return NodeOut(
        id=node.id,
        parent_id=node.parent_id,
        kind=node.kind,
        title=node.title,
        sort_key=node.sort_key,
        collapsed=node.collapsed,
        props=node.props,
        version=node.version,
        child_count=repository.count_children(db, node.id),
    )


def to_node_detail(db: Session, node: Node) -> NodeDetail:
    return NodeDetail(**to_node_out(db, node).model_dump(), description=node.description)


def get_node(db: Session, owner_id: uuid.UUID, node_id: uuid.UUID) -> NodeDetail:
    node = repository.get_owned_node(db, owner_id, node_id)
    if node is None:
        raise not_found()
    return to_node_detail(db, node)


def get_view(db: Session, owner_id: uuid.UUID, focus_id: uuid.UUID, depth: int) -> NodeView:
    rows = repository.fetch_window(db, owner_id, focus_id, depth)
    if not rows:
        raise not_found()
    focus, *descendants = rows
    focus.pop("level")
    return NodeView(
        focus=NodeOut(**focus),
        ancestors=[NodeOut(**row) for row in repository.fetch_ancestors(db, owner_id, focus_id)],
        nodes=[WindowNode(**row) for row in descendants],
    )


def create_child(
    db: Session, owner_id: uuid.UUID, parent_id: uuid.UUID, data: NodeCreate
) -> NodeOut:
    parent = repository.get_owned_node(db, owner_id, parent_id)
    if parent is None:
        raise not_found()
    node = Node(
        map_id=parent.map_id,
        parent_id=parent.id,
        kind=data.kind,
        title=data.title,
        sort_key=new_child_sort_key(db, parent.id, data.after_sort_key),
        collapsed=False,
        props=data.props,
    )
    db.add(node)
    db.commit()
    return to_node_out(db, node)


def new_child_sort_key(db: Session, parent_id: uuid.UUID, after: str | None) -> str:
    """Key right after `after`, or at the end if it is not given."""
    if after is None:
        return key_between(repository.last_child_sort_key(db, parent_id), None)
    return key_between(after, repository.next_sibling_sort_key(db, parent_id, after))


def update_node(
    db: Session, owner_id: uuid.UUID, node_id: uuid.UUID, patch: NodePatch
) -> NodeDetail:
    node = repository.get_owned_node(db, owner_id, node_id)
    if node is None:
        raise not_found()
    if patch.version != node.version:
        raise HTTPException(status.HTTP_409_CONFLICT, VERSION_CONFLICT)
    apply_patch(node, patch)
    try:
        db.commit()
    except StaleDataError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, VERSION_CONFLICT) from None
    return to_node_detail(db, node)


def apply_patch(node: Node, patch: NodePatch) -> None:
    if patch.kind is not None and patch.kind != node.kind:
        raise unprocessable("a node's kind cannot be changed")
    if patch.props is not None:
        try:
            node.props = validate_props(node.kind, patch.props)
        except ValidationError as exc:
            raise unprocessable(f"invalid props for {node.kind}: {exc}") from None
    if patch.title is not None:
        node.title = patch.title
    if patch.description is not None:
        node.description = patch.description
    if patch.collapsed is not None:
        node.collapsed = patch.collapsed
    if patch.sort_key is not None:
        node.sort_key = patch.sort_key


def move_node(db: Session, owner_id: uuid.UUID, node_id: uuid.UUID, data: NodeMove) -> NodeOut:
    """Gives the node a new parent, a new position among its siblings, or both.

    The subtree travels with it: only this row changes, because the children point at their
    parent and keep their own `sort_key`.
    """
    node = repository.get_owned_node(db, owner_id, node_id)
    if node is None:
        raise not_found()
    if node.parent_id is None:
        raise unprocessable("the map's root cannot be moved")
    if data.version != node.version:
        raise HTTPException(status.HTTP_409_CONFLICT, VERSION_CONFLICT)
    parent = repository.get_owned_node(db, owner_id, data.parent_id)
    if parent is None:
        raise not_found()
    if parent.id == node.id or repository.is_descendant(db, node.id, parent.id):
        raise unprocessable("a node cannot be moved inside itself")
    sort_key = destination_sort_key(db, owner_id, node, parent.id, data.place)
    try:
        node.parent_id = parent.id
        node.sort_key = sort_key
        db.commit()
    except StaleDataError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, VERSION_CONFLICT) from None
    except Exception:
        db.rollback()
        raise
    return to_node_out(db, node)


def destination_sort_key(
    db: Session,
    owner_id: uuid.UUID,
    node: Node,
    parent_id: uuid.UUID,
    place: str | AfterSibling,
) -> str:
    """Key for `node` at `place` among `parent_id`'s children, ignoring the node's own key."""
    if place == "first":
        return key_between(None, repository.first_child_sort_key(db, parent_id, node.id))
    if place == "last":
        return key_between(repository.last_child_sort_key(db, parent_id, node.id), None)
    assert isinstance(place, AfterSibling)
    after = repository.get_owned_node(db, owner_id, place.after_id)
    if after is None:
        raise not_found()
    if after.id == node.id or after.parent_id != parent_id:
        raise unprocessable("after_id must be a child of parent_id")
    upper = repository.next_sibling_sort_key(db, parent_id, after.sort_key, node.id)
    return key_between(after.sort_key, upper)


def delete_subtree(
    db: Session, owner_id: uuid.UUID, node_id: uuid.UUID, reparent: bool = False
) -> None:
    """Deletes the node; with `reparent` its children move up to the parent, else they cascade."""
    node = repository.get_owned_node(db, owner_id, node_id)
    if node is None:
        raise not_found()
    if node.parent_id is None:
        raise unprocessable("the map's root cannot be deleted")
    try:
        if reparent:
            move_children_to_parent(db, node)
        remove_row(db, node)
        db.commit()
    except Exception:
        db.rollback()
        raise


def remove_row(db: Session, node: Node) -> None:
    db.execute(delete(Node).where(Node.id == node.id))


def move_children_to_parent(db: Session, node: Node) -> None:
    """Moves the children to `node`'s parent, among its siblings and keeping their order."""
    assert node.parent_id is not None
    children = repository.ordered_children(db, node.id)
    lower = repository.previous_sibling_sort_key(db, node.parent_id, node.sort_key)
    upper = repository.next_sibling_sort_key(db, node.parent_id, node.sort_key)
    for child, key in zip(children, spread_keys(lower, upper, len(children)), strict=True):
        child.parent_id = node.parent_id
        child.sort_key = key
    db.flush()


def spread_keys(lower: str | None, upper: str | None, count: int) -> list[str]:
    """`count` increasing keys between `lower` and `upper`, bisecting to keep them short."""
    if count == 0:
        return []
    middle = count // 2
    key = key_between(lower, upper)
    return [*spread_keys(lower, key, middle), key, *spread_keys(key, upper, count - middle - 1)]
