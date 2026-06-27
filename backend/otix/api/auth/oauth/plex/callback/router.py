from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from starlette import status

from otix.api.deps import get_db, get_optional_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import PlexCallbackRequest, PlexCallbackResponse
from otix.services.plex_auth_service import link_plex_to_user

logger = structlog.get_logger()
router = APIRouter()


@router.post(
    "/oauth/plex/callback",
    response_model=PlexCallbackResponse,
)
async def plex_connect_callback(
    body: PlexCallbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> PlexCallbackResponse:
    """Complete the Plex OAuth link flow.

    The user is resolved from the OAuth state stored in Redis (set during
    the initiate phase), so this endpoint works without a JWT token. This
    is required when the callback page runs in a system browser opened
    via ``openExternal`` (Electron).
    """
    ip = client_ip(request)
    await limiter.check_plex_callback(ip)

    try:
        # Pass current_user (may be None) — link_plex_to_user falls back to
        # the user_id stored alongside the state in Redis.
        await link_plex_to_user(db, current_user, body.state, body.pin_id)
    except HTTPException:
        raise
    except Exception as err:
        user_id = current_user.id if current_user else "unknown"
        logger.exception("plex linking failed", user_id=user_id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to link Plex account. Please try again.",
        ) from err

    logger.info("plex account linked", ip=ip)
    return PlexCallbackResponse()
