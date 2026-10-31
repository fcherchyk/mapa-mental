"""Google OAuth client (Authorization Code with `state` and `nonce`, via Authlib)."""

from dataclasses import dataclass
from typing import Any

from authlib.integrations.starlette_client import OAuth

from app.config import Config

GOOGLE_METADATA_URL = "https://accounts.google.com/.well-known/openid-configuration"
# Identity only; Drive is requested incrementally in slice 2 (ADR 0007).
GOOGLE_SCOPES = "openid email profile"


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    name: str
    avatar_url: str | None

    @classmethod
    def from_claims(cls, claims: dict[str, Any]) -> "GoogleIdentity":
        """Takes only the identity from the already validated `id_token`; tokens are dropped."""
        email = claims.get("email") or ""
        return cls(
            sub=str(claims["sub"]),
            email=email,
            name=claims.get("name") or email,
            avatar_url=claims.get("picture"),
        )


def build_oauth(config: Config) -> OAuth:
    oauth = OAuth()
    oauth.register(
        "google",
        client_id=config.google_client_id,
        client_secret=config.google_client_secret,
        server_metadata_url=GOOGLE_METADATA_URL,
        client_kwargs={"scope": GOOGLE_SCOPES},
    )
    return oauth
