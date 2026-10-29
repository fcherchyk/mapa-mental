"""Sesiones de login: la cookie lleva un token aleatorio y la base guarda solo su hash."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import Config
from app.models import User, UserSession

SESSION_COOKIE = "sid"


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user_id: uuid.UUID, ttl: timedelta) -> str:
    """Crea la fila en `sessions` y devuelve el token para la cookie (sin commit)."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + ttl
    db.add(UserSession(id=hash_token(token), user_id=user_id, expires_at=expires_at))
    return token


def find_session_user(db: Session, token: str) -> User | None:
    query = (
        select(User)
        .join(UserSession, UserSession.user_id == User.id)
        .where(UserSession.id == hash_token(token), UserSession.expires_at > datetime.now(UTC))
    )
    return db.scalar(query)


def delete_session(db: Session, token: str) -> None:
    db.execute(delete(UserSession).where(UserSession.id == hash_token(token)))
    db.commit()


def set_session_cookie(response: Response, token: str, config: Config) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(timedelta(days=config.session_ttl_days).total_seconds()),
        path="/",
        httponly=True,
        samesite="lax",
        secure=config.cookie_secure,
    )


def clear_session_cookie(response: Response, config: Config) -> None:
    response.delete_cookie(
        SESSION_COOKIE, path="/", httponly=True, samesite="lax", secure=config.cookie_secure
    )
