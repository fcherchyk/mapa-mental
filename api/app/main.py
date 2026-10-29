"""Armado de la app FastAPI. Se levanta con `uvicorn --factory app.main:create_app`."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.auth.google import build_oauth
from app.auth.router import auth_router, me_router
from app.config import Config
from app.db import build_engine, build_session_factory
from app.nodes.router import router as nodes_router
from app.settings.router import router as settings_router

# Cookie firmada que solo guarda `state` y `nonce` mientras dura el flujo con Google.
OAUTH_FLOW_COOKIE = "oauth_flow"
OAUTH_FLOW_MAX_AGE = 600


def create_app(config: Config | None = None) -> FastAPI:
    config = config or Config.from_env()
    engine = build_engine(config.database_url)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        engine.dispose()

    app = FastAPI(title="mapa-mental API", version="0.1.0", lifespan=lifespan)
    app.state.config = config
    app.state.engine = engine
    app.state.session_factory = build_session_factory(engine)
    app.state.oauth = build_oauth(config)
    app.add_middleware(
        SessionMiddleware,
        secret_key=config.session_secret,
        session_cookie=OAUTH_FLOW_COOKIE,
        max_age=OAUTH_FLOW_MAX_AGE,
        same_site="lax",
        https_only=config.cookie_secure,
    )
    app.include_router(build_api_router())
    return app


def build_api_router() -> APIRouter:
    # Prefijo /api: el proxy de Vite lo reenvía tal cual, sin reescribir rutas.
    api = APIRouter(prefix="/api")
    api.include_router(auth_router)
    api.include_router(me_router)
    api.include_router(settings_router)
    api.include_router(nodes_router)
    return api
