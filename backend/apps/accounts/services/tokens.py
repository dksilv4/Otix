"""JWT minting/decoding for the auth slice.

Three stateless token kinds, all HS256 over ``settings.JWT_SECRET_KEY``:

- **access** — carried in ``Authorization: Bearer``; 15 min. ``sub`` is the
  string form of the user PK.
- **refresh** — carried only in the ``otix_refresh`` httpOnly cookie; 7 days.
  Claims ``jti`` (uuid4, mirrored by a ``RefreshToken`` row) and
  ``session_key`` so rotation and server-side listing are possible.
- **2fa_challenge** — issued by login when a user has TOTP enabled; 5 min,
  stateless proof that the password half of a 2FA login already succeeded.
"""

import time
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import jwt
from django.conf import settings


class TokenError(Exception):
    """Raised when a JWT is missing, malformed, expired or wrong type."""


def _now_epoch() -> int:
    return int(time.time())


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _decode(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError as exc:  # expired, bad sig, malformed
        raise TokenError("Invalid or expired token") from exc


def create_access_token(user_id: int) -> str:
    """15-minute bearer token. ``user_id`` is the Django PK."""
    now = _now_epoch()
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": now,
        "exp": now + settings.ACCESS_TOKEN_LIFETIME_MINUTES * 60,
    }
    return _encode(payload)


def create_refresh_token(user_id: int, session_key: str) -> tuple[str, str, datetime]:
    """7-day refresh token. Returns ``(jwt, jti, expires_at)``.

    The caller stores a ``RefreshToken`` row for the ``jti`` and hands the JWT
    to the client via the ``otix_refresh`` cookie.
    """
    now = _now_epoch()
    jti = str(uuid4())
    expires_at = datetime.fromtimestamp(now + settings.REFRESH_TOKEN_LIFETIME_DAYS * 86400, UTC)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "jti": jti,
        "session_key": session_key,
        "iat": now,
        "exp": now + settings.REFRESH_TOKEN_LIFETIME_DAYS * 86400,
    }
    return _encode(payload), jti, expires_at


def create_challenge_token(user_id: int) -> str:
    """5-minute stateless proof that a 2FA login's password step succeeded."""
    now = _now_epoch()
    payload = {
        "sub": str(user_id),
        "type": "2fa_challenge",
        "iat": now,
        "exp": now + settings.CHALLENGE_TOKEN_LIFETIME_MINUTES * 60,
    }
    return _encode(payload)


def decode_token(token: str) -> dict[str, Any]:
    """Decode + verify a JWT, raising :class:`TokenError` on any failure."""
    return _decode(token)
