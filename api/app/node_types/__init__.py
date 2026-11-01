"""Node type registry: each `kind` has its own Pydantic schema for `props` (ADR 0013)."""

from typing import Any

from pydantic import BaseModel, ConfigDict

DEFAULT_KIND = "idea"


class IdeaProps(BaseModel):
    """An idea has no data of its own yet besides the title."""

    model_config = ConfigDict(extra="forbid")


NODE_TYPES: dict[str, type[BaseModel]] = {"idea": IdeaProps}


class UnknownNodeKind(ValueError):
    pass


def is_known_kind(kind: str) -> bool:
    return kind in NODE_TYPES


def validate_props(kind: str, props: dict[str, Any]) -> dict[str, Any]:
    """Validates `props` with the kind's schema; raises `UnknownNodeKind` or `ValidationError`."""
    schema = NODE_TYPES.get(kind)
    if schema is None:
        raise UnknownNodeKind(f"unknown node kind: {kind}")
    return schema.model_validate(props).model_dump(mode="json")
