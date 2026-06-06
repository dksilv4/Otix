from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import structlog
from jose import JWTError, jwt

from otix.infrastructure.config import settings

logger = structlog.get_logger()

__all__ = [
    "create_access_token",
    "create_refresh_token",
    "create_challenge_token",
    "decode_token",
    "get_refresh_cookie_config",
]


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_lifetime_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def create_refresh_token(user_id: str, session_key: str = "") -> tuple[str, str, datetime]:
    now = datetime.now(timezone.utc)
    jti = str(uuid.uuid4())
    exp = now + timedelta(days=settings.refresh_token_lifetime_days)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": jti,
        "session_key": session_key,
        "iat": now,
        "exp": exp,
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")
    return token, jti, exp


def create_challenge_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "2fa_challenge",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])


def get_refresh_cookie_config() -> dict:
    return {
        "key": settings.auth_refresh_cookie_name,
        "path": settings.auth_refresh_cookie_path,
        "domain": settings.auth_refresh_cookie_domain or None,
        "secure": settings.auth_refresh_cookie_secure,
        "httponly": settings.auth_refresh_cookie_httponly,
        "samesite": settings.auth_refresh_cookie_samesite,
        "max_age": settings.refresh_token_lifetime_days * 86400,
    }


def get_refresh_cookie_delete_config() -> dict:
    """Cookie config suitable for ``Response.delete_cookie()``.

    ``delete_cookie()`` in Starlette >=1.0 does not accept ``max_age``
    (it sets the expiry to 0 internally), so we omit it here.
    """
    config = get_refresh_cookie_config()
    config.pop("max_age", None)
    return config
