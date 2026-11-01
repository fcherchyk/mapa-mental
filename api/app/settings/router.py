"""Preferences endpoint: `PATCH /me/settings`."""

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth.dependencies import current_user, require_csrf
from app.db import get_db
from app.models import User
from app.settings.schemas import SettingsPatch, UserSettings
from app.settings.service import update_settings

router = APIRouter(prefix="/me", tags=["settings"])


@router.patch("/settings", response_model=UserSettings, dependencies=[Depends(require_csrf)])
def patch_settings(
    patch: SettingsPatch,
    user: Annotated[User, Depends(current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> UserSettings:
    return update_settings(db, user, patch)
