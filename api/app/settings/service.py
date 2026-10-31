"""Reading and writing `users.settings`."""

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models import User
from app.settings.schemas import SettingsPatch, UserSettings


def read_settings(user: User) -> UserSettings:
    """Stored preferences, or the defaults if what is stored is not valid."""
    try:
        return UserSettings.model_validate(user.settings or {})
    except ValidationError:
        return UserSettings()


def update_settings(db: Session, user: User, patch: SettingsPatch) -> UserSettings:
    # Reassign the whole dict so SQLAlchemy detects the change in the jsonb column.
    user.settings = {**(user.settings or {}), **patch.model_dump()}
    db.commit()
    return read_settings(user)
