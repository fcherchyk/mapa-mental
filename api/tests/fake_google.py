"""Fake Google OIDC: its own metadata, token endpoint and JWKS, without reaching the network.

It signs the `id_token` with its own RSA key, so Authlib really validates the signature,
`iss`, `aud` and `nonce`.
"""

import base64
import json
import time
from urllib.parse import parse_qs

import httpx
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa

ISSUER = "https://accounts.google.com"
METADATA_URL = f"{ISSUER}/.well-known/openid-configuration"
AUTHORIZE_URL = f"{ISSUER}/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
KEY_ID = "fake-key"

_PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def int_to_b64url(value: int) -> str:
    return b64url(value.to_bytes((value.bit_length() + 7) // 8, "big"))


def sign_jwt(claims: dict) -> str:
    header = {"alg": "RS256", "typ": "JWT", "kid": KEY_ID}
    signing_input = f"{b64url(json.dumps(header).encode())}.{b64url(json.dumps(claims).encode())}"
    signature = _PRIVATE_KEY.sign(signing_input.encode(), padding.PKCS1v15(), hashes.SHA256())
    return f"{signing_input}.{b64url(signature)}"


def public_jwks() -> dict:
    numbers = _PRIVATE_KEY.public_key().public_numbers()
    key = {
        "kty": "RSA",
        "alg": "RS256",
        "use": "sig",
        "kid": KEY_ID,
        "n": int_to_b64url(numbers.n),
        "e": int_to_b64url(numbers.e),
    }
    return {"keys": [key]}


class FakeGoogle:
    """Simulates Google; `prepare` sets who signs in and with which `nonce` before the callback."""

    def __init__(self, client_id: str) -> None:
        self.client_id = client_id
        self.code = "fake-auth-code"
        self.nonce: str | None = None
        self.identity: dict = {}
        self.issued: list[dict] = []

    def prepare(self, nonce: str, sub: str, name: str, email: str) -> None:
        self.nonce = nonce
        self.identity = {"sub": sub, "name": name, "email": email, "email_verified": True}

    async def handle(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url).split("?")[0]
        if url == METADATA_URL:
            return httpx.Response(200, json=self.metadata(), request=request)
        if url == JWKS_URL:
            return httpx.Response(200, json=public_jwks(), request=request)
        if url == TOKEN_URL and request.method == "POST":
            return self.token_response(request)
        raise RuntimeError(f"tests do not reach the network: {request.method} {request.url}")

    def metadata(self) -> dict:
        return {
            "issuer": ISSUER,
            "authorization_endpoint": AUTHORIZE_URL,
            "token_endpoint": TOKEN_URL,
            "jwks_uri": JWKS_URL,
            "response_types_supported": ["code"],
            "subject_types_supported": ["public"],
            "id_token_signing_alg_values_supported": ["RS256"],
        }

    def token_response(self, request: httpx.Request) -> httpx.Response:
        form = parse_qs(request.content.decode())
        if form.get("code") != [self.code] or form.get("grant_type") != ["authorization_code"]:
            return httpx.Response(400, json={"error": "invalid_grant"}, request=request)
        now = int(time.time())
        claims = {
            "iss": ISSUER,
            "aud": self.client_id,
            "iat": now,
            "exp": now + 3600,
            "nonce": self.nonce,
            **self.identity,
        }
        token = {
            "access_token": f"ya29.fake-access-{len(self.issued)}",
            "refresh_token": f"1//fake-refresh-{len(self.issued)}",
            "id_token": sign_jwt(claims),
            "token_type": "Bearer",
            "expires_in": 3600,
            "scope": "openid email profile",
        }
        self.issued.append(token)
        return httpx.Response(200, json=token, request=request)
