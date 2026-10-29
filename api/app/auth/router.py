"""Endpoints de login con Google, logout y `GET /me`."""

import uuid
from datetime import timedelta
from typing import Annotated

from authlib.common.errors import AuthlibBaseError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from joserfc.errors import JoseError
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import current_user, require_csrf
from app.auth.google import GoogleIdentity
from app.auth.onboarding import sign_in
from app.auth.sessions import (
    SESSION_COOKIE,
    clear_session_cookie,
    delete_session,
    set_session_cookie,
)
from app.config import Config
from app.db import get_db
from app.models import Map, User
from app.settings.schemas import UserSettings
from app.settings.service import read_settings

auth_router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["auth"])


class MeOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    avatar_url: str | None
    settings: UserSettings
    root_node_id: uuid.UUID


def app_config(request: Request) -> Config:
    return request.app.state.config


@auth_router.get("/login", status_code=status.HTTP_302_FOUND)
async def login(request: Request) -> RedirectResponse:
    """Redirige a Google; Authlib guarda `state` y `nonce` en la cookie firmada del flujo."""
    google = request.app.state.oauth.google
    return await google.authorize_redirect(request, app_config(request).google_redirect_uri)


@auth_router.get("/callback", status_code=status.HTTP_303_SEE_OTHER)
async def callback(request: Request) -> RedirectResponse:
    """Valida `state`, canjea el código y el `id_token` (con `nonce`) y abre la sesión."""
    config = app_config(request)
    try:
        token = await request.app.state.oauth.google.authorize_access_token(request)
    except (AuthlibBaseError, JoseError):  # `state`, código, firma o `nonce` inválidos
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "login con Google inválido") from None
    claims = token.get("userinfo")
    if not claims or not claims.get("sub"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google no devolvió la identidad")
    session_token = await run_in_threadpool(
        sign_in,
        request.app.state.session_factory,
        GoogleIdentity.from_claims(dict(claims)),
        timedelta(days=config.session_ttl_days),
    )
    response = RedirectResponse(config.post_login_redirect, status_code=status.HTTP_303_SEE_OTHER)
    set_session_cookie(response, session_token, config)
    return response


@auth_router.post(
    "/logout", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_csrf)]
)
def logout(request: Request, db: Annotated[Session, Depends(get_db)]) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        delete_session(db, token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(response, app_config(request))
    return response


@me_router.get("/me", response_model=MeOut)
def me(
    user: Annotated[User, Depends(current_user)], db: Annotated[Session, Depends(get_db)]
) -> MeOut:
    root_node_id = db.scalar(select(Map.root_node_id).where(Map.owner_id == user.id))
    return MeOut(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        settings=read_settings(user),
        root_node_id=root_node_id,
    )
