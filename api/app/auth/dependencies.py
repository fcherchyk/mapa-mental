"""FastAPI dependencies: the session's user and the anti-CSRF header."""

from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.auth.sessions import SESSION_COOKIE, find_session_user
from app.db import get_db
from app.models import User

CSRF_HEADER = "X-CSRF"
CSRF_VALUE = "1"


def current_user(request: Request, db: Annotated[Session, Depends(get_db)]) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user = find_session_user(db, token) if token else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid or expired session")
    return user


def require_csrf(x_csrf: Annotated[str | None, Header(alias=CSRF_HEADER)] = None) -> None:
    """A form on another site cannot send custom headers without a CORS preflight."""
    if x_csrf != CSRF_VALUE:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"missing header {CSRF_HEADER}: 1")
