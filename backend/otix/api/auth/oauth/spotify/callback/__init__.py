from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db, get_optional_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.auth import SpotifyCallbackRequest, SpotifyCallbackResponse
from otix.domain.user import User
from otix.services.spotify_auth_service import link_spotify_to_user

logger = structlog.get_logger()
router = APIRouter()


@router.post(
    "/oauth/spotify/callback",
    response_model=SpotifyCallbackResponse,
)
async def spotify_connect_callback(
    body: SpotifyCallbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SpotifyCallbackResponse:
    """Complete the Spotify OAuth link flow.

    The user is resolved from the OAuth state stored in Redis, so this
    endpoint works without a JWT — necessary when the callback page runs
    in a system browser opened via ``openExternal`` (Electron).
    """
    ip = client_ip(request)
    await limiter.check_spotify_callback(ip)

    try:
        await link_spotify_to_user(db, current_user, body.code, body.state)
    except HTTPException:
        raise
    except Exception as err:
        user_id = current_user.id if current_user else "unknown"
        logger.exception("spotify linking failed", user_id=user_id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to link Spotify account. Please try again.",
        ) from err

    logger.info("spotify account linked", ip=ip)
    return SpotifyCallbackResponse()
