from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.infrastructure.config import settings
from otix.schemas.auth import SpotifyInitiateResponse
from otix.services.spotify_auth_service import build_spotify_login_url

logger = structlog.get_logger()

router = APIRouter()


@router.post("/spotify/initiate", response_model=SpotifyInitiateResponse)
async def spotify_login_initiate(
    request: Request,
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SpotifyInitiateResponse:
    ip = client_ip(request)
    await limiter.check_spotify_initiate(ip)

    if not settings.spotify_client_id or not settings.spotify_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Spotify authentication is not configured.",
        )

    url, state = await build_spotify_login_url()
    logger.info("spotify login initiated", ip=ip)
    return SpotifyInitiateResponse(auth_url=url, state=state)
