"""Twitch OAuth2 client-credentials grant logic and Redis token caching."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx
from django.conf import settings

from core.providers.framework import ProviderAuthError

if TYPE_CHECKING:
    from redis.asyncio import Redis

logger = logging.getLogger(__name__)

TOKEN_KEY = "igdb:access_token"
OAUTH_URL = "https://id.twitch.tv/oauth2/token"


class IGDBAuthError(ProviderAuthError):
    """Twitch OAuth token acquisition or validation error."""


async def get_app_access_token(
    http_client: httpx.AsyncClient,
    redis: Redis | None = None,
    *,
    force_refresh: bool = False,
) -> str:
    """Fetch an active Twitch OAuth app access token, reading from Redis cache if available.

    Args:
        http_client: httpx.AsyncClient to execute the OAuth request.
        redis: Optional async Redis client; falls back to core.redis seam if None.
        force_refresh: If True, bypasses cache and forces token refresh.

    Returns:
        The valid access token string.

    Raises:
        IGDBAuthError: If credentials are unset or the OAuth exchange fails.
    """
    if redis is None:
        from core.redis import get_async_client

        redis = get_async_client()

    if not force_refresh:
        try:
            cached = await redis.get(TOKEN_KEY)
            if cached:
                if isinstance(cached, bytes):
                    return cached.decode("utf-8")
                return str(cached)
        except Exception as exc:
            logger.debug("IGDB token cache read error: %s", exc)

    client_id = getattr(settings, "IGDB_CLIENT_ID", "")
    client_secret = getattr(settings, "IGDB_CLIENT_SECRET", "")

    response = await http_client.post(
        OAUTH_URL,
        params={
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "client_credentials",
        },
    )
    if response.status_code != 200:
        raise IGDBAuthError(
            f"Twitch OAuth failed: {response.status_code} {response.text}",
            status_code=response.status_code,
        )

    data = response.json()
    token = data.get("access_token")
    if not token:
        raise IGDBAuthError("No access_token in Twitch OAuth response")

    token_str = str(token)
    ttl = getattr(settings, "IGDB_TOKEN_TTL_SECONDS", 50 * 86400)
    try:
        await redis.set(TOKEN_KEY, token_str, ex=ttl)
    except Exception as exc:
        logger.debug("IGDB token cache write error: %s", exc)

    return token_str


async def invalidate_access_token(redis: Redis | None = None) -> None:
    """Evict the cached Twitch access token from Redis."""
    if redis is None:
        from core.redis import get_async_client

        redis = get_async_client()

    try:
        await redis.delete(TOKEN_KEY)
    except Exception as exc:
        logger.debug("IGDB token cache invalidation error: %s", exc)
