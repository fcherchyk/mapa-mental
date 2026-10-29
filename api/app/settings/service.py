"""Lectura y escritura de `users.settings`."""

from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.models import User
from app.settings.schemas import SettingsPatch, UserSettings


def read_settings(user: User) -> UserSettings:
    """Preferencias guardadas, o las de por defecto si lo guardado no es válido."""
    try:
        return UserSettings.model_validate(user.settings or {})
    except ValidationError:
        return UserSettings()


def update_settings(db: Session, user: User, patch: SettingsPatch) -> UserSettings:
    # Se reasigna el dict entero para que SQLAlchemy detecte el cambio en el jsonb.
    user.settings = {**(user.settings or {}), **patch.model_dump()}
    db.commit()
    return read_settings(user)
