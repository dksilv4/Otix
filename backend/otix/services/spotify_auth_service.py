"""Spotify OAuth2 service: authorization-code grant, token refresh, link/unlink.

Docs: https://developer.spotify.com/documentation/web-api/concepts/authorization
"""

from __future__ import annotations

import base64
import secrets
import urllib.parse
from datetime import datetime, timedelta, timezone

import httpx
import structlog
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.infrastructure.redis import get_redis

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
]


def _state_key(state: str) -> str:
    return f"spotify_oauth:state:{state}"


def _build_callback_url() -> str:
    return f"{settings.frontend_base_url}/auth/spotify/connect/callback"


def _basic_auth() -> str:
    raw = f"{settings.spotify_client_id}:{settings.spotify_client_secret}"
    return base64.b64encode(raw.encode()).decode()


async def build_spotify_link_url() -> tuple[str, str]:
    """Build the Spotify OAuth2 authorization URL and return (url, state)."""
    state = secrets.token_urlsafe(32)
    redis = await get_redis()
    await redis.set(_state_key(state), "1", ex=STATE_TTL)

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
    """Refresh an expired access token. Returns tokens dict or raises."""
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
            if resp.status_code != 200:
                logger.warning("spotify token refresh failed", status=resp.status_code)
                raise HTTPException(status_code=401, detail="Spotify session expired. Please reconnect your account.")
    except HTTPException:
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


async def consume_state(state: str) -> None:
    """Validate and consume an OAuth state parameter."""
    redis = await get_redis()
    key = _state_key(state)
    if not await redis.get(key):
        raise HTTPException(status_code=400, detail="Spotify linking session expired. Please try again.")
    await redis.delete(key)


async def link_spotify_to_user(session: AsyncSession, user: User, code: str, state: str) -> None:
    """Link a Spotify account to an existing user via OAuth code + state."""
    if user.spotify_id is not None:
        raise HTTPException(status_code=400, detail="Spotify account already linked")

    await consume_state(state)

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
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This Spotify account is already linked to another Otix account.")

    user.spotify_id = spotify_id
    user.spotify_username = profile.get("display_name")
    user.spotify_email = profile.get("email")
    images = profile.get("images", [])
    if images and isinstance(images[0], dict):
        user.spotify_avatar_url = images[0].get("url")
    user.spotify_access_token = access_token
    user.spotify_refresh_token = refresh_token
    user.spotify_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

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


async def get_user_access_token(user: User) -> str | None:
    """Get a valid access token for the user, refreshing if expired.

    Returns the access token, or None if the user has no Spotify link.
    """
    if not user.spotify_refresh_token:
        return None

    expires_at = user.spotify_token_expires_at
    if expires_at and isinstance(expires_at, datetime):
        if datetime.now(timezone.utc) < expires_at - timedelta(seconds=60):
            return user.spotify_access_token

    # Token expired or about to expire — refresh
    try:
        tokens = await refresh_spotify_token(user.spotify_refresh_token)
    except Exception:
        return None

    new_access = tokens.get("access_token")
    if not new_access:
        return None

    # Store new token on user. Caller must commit.
    user.spotify_access_token = new_access
    expires_in = tokens.get("expires_in", 3600)
    user.spotify_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

    # Spotify may rotate the refresh token
    if tokens.get("refresh_token"):
        user.spotify_refresh_token = tokens["refresh_token"]

    return new_access
