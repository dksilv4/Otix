from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import SpotifyInitiateResponse
from otix.services.spotify_auth_service import (
    build_spotify_link_url,
    get_spotify_user_profile,
    get_user_access_token,
)

logger = structlog.get_logger()
router = APIRouter()


async def _spotify_stats(user: User, db: AsyncSession) -> dict | None:
    """Fetch Spotify profile stats (followers, product tier, country).

    NOTE: This function may commit the DB session to persist a
    refreshed access token via ``get_user_access_token()``.
    If the user has revoked access externally, the integration
    is auto-disconnected (token + ID fields cleared).
    """
    if user.spotify_id is None:
        return None
    try:
        token = await get_user_access_token(user, session=db)
        if not token:
            logger.warning(
                "spotify stats unavailable — no valid token", user_id=user.id
            )
            return None
        profile = await get_spotify_user_profile(token)
        if not profile:
            logger.warning(
                "spotify stats unavailable — profile fetch returned empty",
                user_id=user.id,
            )
            return None
        await db.commit()
        return {
            "followers": (profile.get("followers") or {}).get("total", 0),
            "product": profile.get("product"),
            "country": profile.get("country"),
        }
    except Exception:
        logger.exception("spotify stats fetch failed", user_id=user.id)
        return None


@router.post("/oauth/spotify", response_model=SpotifyInitiateResponse)
async def spotify_connect_initiate(
    request: Request,
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SpotifyInitiateResponse:
    """Initiate the Spotify OAuth link flow.

    Returns an authorization URL and state token. The client should
    redirect the user to *auth_url* and then POST the callback code
    to ``/auth/oauth/spotify/callback``.
    """
    ip = client_ip(request)
    await limiter.check_spotify_initiate(ip)

    url, state = await build_spotify_link_url(user_id=current_user.id)
    logger.info("spotify linking initiated", user_id=current_user.id, ip=ip)
    return SpotifyInitiateResponse(auth_url=url, state=state)
