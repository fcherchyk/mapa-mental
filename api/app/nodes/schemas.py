"""Esquemas de entrada y salida de la API de nodos."""

import uuid
from typing import Annotated, Any

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from app.node_types import DEFAULT_KIND, is_known_kind, validate_props
from app.nodes.sort_keys import SORT_KEY_PATTERN

TITLE_MAX_LENGTH = 200

Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=TITLE_MAX_LENGTH)
]
SortKey = Annotated[str, StringConstraints(pattern=SORT_KEY_PATTERN, max_length=128)]


def check_known_kind(kind: str | None) -> str | None:
    if kind is not None and not is_known_kind(kind):
        raise ValueError(f"tipo de nodo desconocido: {kind}")
    return kind


class NodeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    after_sort_key: SortKey | None = None
    kind: str = DEFAULT_KIND
    props: dict[str, Any] = Field(default_factory=dict)

    @field_validator("kind")
    @classmethod
    def check_kind(cls, kind: str) -> str:
        return check_known_kind(kind)

    @model_validator(mode="after")
    def check_props_for_kind(self) -> "NodeCreate":
        try:
            self.props = validate_props(self.kind, self.props)
        except ValueError as exc:
            raise ValueError(f"props inválidos para {self.kind}: {exc}") from None
        return self


class NodePatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Annotated[int, Field(strict=True, ge=1)]
    title: Title | None = None
    collapsed: bool | None = None
    sort_key: SortKey | None = None
    kind: str | None = None
    props: dict[str, Any] | None = None

    @field_validator("kind")
    @classmethod
    def check_kind(cls, kind: str | None) -> str | None:
        return check_known_kind(kind)


class NodeOut(BaseModel):
    id: uuid.UUID
    parent_id: uuid.UUID | None
    kind: str
    title: str
    sort_key: str
    collapsed: bool
    props: dict[str, Any]
    version: int
    child_count: int


class WindowNode(NodeOut):
    level: int = Field(description="Distancia al foco: 1 son sus hijos directos.")


class NodeView(BaseModel):
    focus: NodeOut
    ancestors: list[NodeOut] = Field(description="De la raíz al padre del foco.")
    nodes: list[WindowNode] = Field(description="Por nivel; los hermanos, por sort_key.")
