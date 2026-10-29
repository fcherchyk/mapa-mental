"""Registro de tipos de nodo: cada `kind` tiene su esquema Pydantic para `props` (ADR 0013)."""

from typing import Any

from pydantic import BaseModel, ConfigDict

DEFAULT_KIND = "idea"


class IdeaProps(BaseModel):
    """Una idea todavía no tiene datos propios además del título."""

    model_config = ConfigDict(extra="forbid")


NODE_TYPES: dict[str, type[BaseModel]] = {"idea": IdeaProps}


class UnknownNodeKind(ValueError):
    pass


def is_known_kind(kind: str) -> bool:
    return kind in NODE_TYPES


def validate_props(kind: str, props: dict[str, Any]) -> dict[str, Any]:
    """Valida `props` con el esquema del tipo; lanza `UnknownNodeKind` o `ValidationError`."""
    schema = NODE_TYPES.get(kind)
    if schema is None:
        raise UnknownNodeKind(f"tipo de nodo desconocido: {kind}")
    return schema.model_validate(props).model_dump(mode="json")
