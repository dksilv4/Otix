# TODO: Review this file
"""Spotify OAuth2 service: authorization-code grant, token refresh, link/unlink.

Docs: https://developer.spotify.com/documentation/web-api/concepts/authorization
"""

from __future__ import annotations

import base64
import json
import secrets
import urllib.parse
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
import structlog
from fastapi import HTTPException, status
from sqlalchemy import select

from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"
STATE_TTL = 600  # 10 minutes

SCOPES = [
    "user-library-read",
    "user-library-modify",
    "user-read-email",
    "user-read-private",
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-recently-played",
    "playlist-read-private",
    "playlist-read-collaborative",
]


class TokenRevokedError(Exception):
    """Raised when the OAuth provider indicates the user has revoked access.

    Callers that have a DB session available should auto-unlink the
    integration via ``get_user_access_token(user, session=session)``.
    """


def _state_key(state: str) -> str:
    return f"spotify_oauth:state:{state}"


def _build_callback_url() -> str:
    return f"{settings.frontend_base_url}/auth/spotify/connect/callback"


def _basic_auth() -> str:
    raw = f"{settings.spotify_client_id}:{settings.spotify_client_secret}"
    return base64.b64encode(raw.encode()).decode()


async def build_spotify_link_url(user_id: str | None = None) -> tuple[str, str]:
    """Build the Spotify OAuth2 authorization URL and return (url, state).

    If *user_id* is provided it is stored alongside the state in Redis so
    the callback can resolve the user without a JWT (Electron openExternal).
    """
    state = secrets.token_urlsafe(32)
    redis = await get_redis()
    payload = {"v": "1"}
    if user_id:
        payload["user_id"] = user_id
    await redis.set(_state_key(state), json.dumps(payload), ex=STATE_TTL)

    callback = _build_callback_url()
    params = {
        "client_id": settings.spotify_client_id,
        "response_type": "code",
        "redirect_uri": callback,
        "state": state,
        "scope": " ".join(SCOPES),
    }
    url = f"{SPOTIFY_AUTH_URL}?{urllib.parse.urlencode(params)}"
    return url, state


async def exchange_code_for_tokens(code: str) -> dict:
    """Exchange an authorization code for access/refresh tokens.

    Returns dict with: access_token, refresh_token, expires_in
    """
    callback = _build_callback_url()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                SPOTIFY_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": callback,
                },
                headers={
                    "Authorization": f"Basic {_basic_auth()}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            data = resp.json()
            if resp.status_code != 200:
                logger.warning("spotify token exchange failed", status=resp.status_code, response=data)
                raise HTTPException(status_code=400, detail="Spotify authorization failed. Please try linking again.")
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("spotify token exchange request failed")
        raise HTTPException(status_code=502, detail="Unable to connect to Spotify. Please try again.") from err

    return data


async def refresh_spotify_token(refresh_token: str) -> dict:
    """Refresh an expired access token. Returns tokens dict or raises.

    Raises:
        TokenRevokedError — the user revoked access on Spotify's side.
        HTTPException(401) — session expired / needs re-link.
        HTTPException(502) — network / transient error.
    """
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                SPOTIFY_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                },
                headers={
                    "Authorization": f"Basic {_basic_auth()}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            )
            data = resp.json()
            if resp.status_code == 400 and data.get("error") == "invalid_grant":
                logger.warning("spotify token revoked externally")
                raise TokenRevokedError("Spotify access was revoked externally")
            if resp.status_code != 200:
                logger.warning("spotify token refresh failed", status=resp.status_code)
                raise HTTPException(status_code=401, detail="Spotify session expired. Please reconnect your account.")
    except (HTTPException, TokenRevokedError):
        raise
    except Exception as err:
        logger.exception("spotify token refresh request failed")
        raise HTTPException(status_code=502, detail="Unable to connect to Spotify. Please try again.") from err

    return data


async def get_spotify_user_profile(access_token: str) -> dict | None:
    """Fetch the current user's Spotify profile."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{SPOTIFY_API_BASE}/me",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            resp.raise_for_status()
            return resp.json()
    except Exception:
        logger.exception("spotify user profile fetch failed")
        return None


async def consume_state(state: str) -> str | None:
    """Validate and consume an OAuth state parameter. Returns user_id if stored."""
    redis = await get_redis()
    key = _state_key(state)
    raw = await redis.get(key)
    if not raw:
        raise HTTPException(status_code=400, detail="Spotify linking session expired. Please try again.")
    await redis.delete(key)

    try:
        payload = json.loads(raw) if isinstance(raw, str) else {}
        return payload.get("user_id")
    except (json.JSONDecodeError, TypeError):
        return None


async def link_spotify_to_user(session: AsyncSession, user: User | None = None, code: str = "", state: str = "") -> None:
    """Link a Spotify account to an existing user via OAuth code + state.

    The user can be provided directly or looked up from the OAuth state
    stored in Redis (set during the initiate phase).
    """
    state_user_id = await consume_state(state)

    resolved_user = user
    if resolved_user is None and state_user_id:
        resolved_user = await session.scalar(
            select(User).where(User.id == state_user_id)
        )

    if resolved_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in and try again.",
        )

    if resolved_user.spotify_id is not None:
        raise HTTPException(status_code=400, detail="Spotify account already linked")

    user = resolved_user  # keep using `user` alias below

    tokens = await exchange_code_for_tokens(code)

    access_token = tokens.get("access_token")
    refresh_token = tokens.get("refresh_token")
    expires_in = tokens.get("expires_in", 3600)

    if not access_token:
        raise HTTPException(status_code=502, detail="Spotify returned an invalid response. Please try again.")

    profile = await get_spotify_user_profile(access_token)
    if not profile:
        raise HTTPException(status_code=502, detail="Unable to fetch Spotify profile. Please try again.")

    spotify_id = profile.get("id")
    if not spotify_id:
        raise HTTPException(status_code=502, detail="Spotify returned an invalid profile. Please try again.")

    # Check for duplicate links
    existing = await session.scalar(select(User).where(User.spotify_id == spotify_id))
    if existing is not None and existing.id != user.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This Spotify account is already linked to another Otix account.",
        )

    user.spotify_id = spotify_id
    user.spotify_username = profile.get("display_name")
    user.spotify_email = profile.get("email")
    images = profile.get("images", [])
    if images and isinstance(images[0], dict):
        user.spotify_avatar_url = images[0].get("url")
    user.spotify_access_token = access_token
    user.spotify_refresh_token = refresh_token
    user.spotify_token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

    await session.flush()
    logger.info("spotify account linked", user_id=user.id, spotify_id=spotify_id)


async def unlink_spotify_from_user(session: AsyncSession, user: User) -> None:
    """Remove the Spotify link from a user."""
    if user.spotify_id is None:
        raise HTTPException(status_code=400, detail="No Spotify account linked")
    spotify_id = user.spotify_id
    user.spotify_id = None
    user.spotify_username = None
    user.spotify_email = None
    user.spotify_avatar_url = None
    user.spotify_access_token = None
    user.spotify_refresh_token = None
    user.spotify_token_expires_at = None
    await session.flush()
    logger.info("spotify account unlinked", user_id=user.id, spotify_id=spotify_id)


async def get_user_access_token(
    user: User,
    session: AsyncSession | None = None,
) -> str | None:
    """Get a valid access token for the user, refreshing if expired.

    When *session* is provided and the token has been revoked externally,
    the integration is automatically unlinked so the UI shows the
    correct disconnected state.

    Returns the access token, or None if the user has no Spotify link
    or the token could not be obtained.
    """
    if not user.spotify_refresh_token:
        return None

    expires_at = user.spotify_token_expires_at
    if expires_at and isinstance(expires_at, datetime):
        if datetime.now(UTC) < expires_at - timedelta(seconds=60):
            return user.spotify_access_token

    # Token expired or about to expire — refresh
    try:
        tokens = await refresh_spotify_token(user.spotify_refresh_token)
    except TokenRevokedError:
        logger.warning(
            "spotify token revoked externally — auto-disconnecting",
            user_id=user.id,
        )
        if session is not None:
            await _unlink_spotify_quietly(session, user)
        return None
    except Exception:
        logger.exception(
            "spotify token refresh exception in get_user_access_token",
            user_id=user.id,
        )
        return None

    new_access = tokens.get("access_token")
    if not new_access:
        return None

    # Store new token on user. Caller must commit.
    user.spotify_access_token = new_access
    expires_in = tokens.get("expires_in", 3600)
    user.spotify_token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in)

    # Spotify may rotate the refresh token
    if tokens.get("refresh_token"):
        user.spotify_refresh_token = tokens["refresh_token"]

    return new_access


async def _unlink_spotify_quietly(session: AsyncSession, user: User) -> None:
    """Unlink Spotify from the user without raising on already-unlinked.

    Intended for auto-disconnect on external revocation — unlike
    :func:`unlink_spotify_from_user`, this does not raise when the
    account is already unlinked (e.g. a concurrent request beat us).
    Sends a notification to the user about the disconnect.
    """
    if user.spotify_id is None:
        return
    spotify_id = user.spotify_id
    user.spotify_id = None
    user.spotify_username = None
    user.spotify_email = None
    user.spotify_avatar_url = None
    user.spotify_access_token = None
    user.spotify_refresh_token = None
    user.spotify_token_expires_at = None
    try:
        await session.flush()
        from otix.services.notification_service import NotificationService

        nsvc = NotificationService(session)
        await nsvc.create(
            user_id=user.id,
            type_="integration_disconnected",
            title="Spotify disconnected",
            body="Your Spotify account was disconnected because access was revoked externally. "
            "Re-link your account in Settings to continue syncing.",
            metadata_json={"provider": "spotify", "reason": "external_revocation"},
        )
        await session.commit()
        logger.info(
            "spotify auto-disconnected due to external revocation",
            user_id=user.id,
            spotify_id=spotify_id,
        )
    except Exception:
        await session.rollback()
        logger.exception(
            "spotify auto-disconnect failed",
            user_id=user.id,
            spotify_id=spotify_id,
        )
