"""API configuration, read from environment variables."""

import os
from collections.abc import Mapping
from dataclasses import dataclass

DEFAULT_REDIRECT_URI = "http://localhost:5173/api/auth/callback"
TRUE_VALUES = {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Config:
    database_url: str
    session_secret: str
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str = DEFAULT_REDIRECT_URI
    cookie_secure: bool = False
    session_ttl_days: int = 30
    post_login_redirect: str = "/"

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None) -> "Config":
        """Builds the configuration; `DATABASE_URL` and `SESSION_SECRET` are required."""
        env = os.environ if env is None else env
        return cls(
            database_url=env["DATABASE_URL"],
            session_secret=env["SESSION_SECRET"],
            google_client_id=env.get("GOOGLE_CLIENT_ID", ""),
            google_client_secret=env.get("GOOGLE_CLIENT_SECRET", ""),
            google_redirect_uri=env.get("GOOGLE_REDIRECT_URI") or DEFAULT_REDIRECT_URI,
            cookie_secure=env.get("COOKIE_SECURE", "false").strip().lower() in TRUE_VALUES,
            session_ttl_days=int(env.get("SESSION_TTL_DAYS") or 30),
            post_login_redirect=env.get("POST_LOGIN_REDIRECT") or "/",
        )
