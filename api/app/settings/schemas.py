"""User preference schemas."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

DEPTH_MIN = 1
DEPTH_MAX = 10
DEPTH_DEFAULT = 3

Depth = Annotated[int, Field(strict=True, ge=DEPTH_MIN, le=DEPTH_MAX)]


class UserSettings(BaseModel):
    depth: Depth = DEPTH_DEFAULT


class SettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    depth: Depth
