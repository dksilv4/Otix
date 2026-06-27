from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_optional_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import TmdbCallbackRequest, TmdbCallbackResponse
from otix.services.tmdb_auth_service import link_tmdb_state_to_user, link_tmdb_to_user

logger = structlog.get_logger()
router = APIRouter()


@router.post(
    "/oauth/tmdb/callback",
    response_model=TmdbCallbackResponse,
)
async def tmdb_connect_callback(
    body: TmdbCallbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TmdbCallbackResponse:
    """Complete the TMDb OAuth link flow.

    The user is resolved from the OAuth state stored in Redis (which
    records the user_id from the initiate phase), so this endpoint works
    without a JWT — necessary when the callback page runs in a system
    browser opened via ``openExternal`` (Electron).
    """
    ip = client_ip(request)
    await limiter.check_tmdb_callback(ip)

    try:
        if current_user is not None:
            await link_tmdb_to_user(db, current_user, body.state, body.request_token)
        else:
            await link_tmdb_state_to_user(db, body.state, body.request_token)
    except HTTPException:
        raise
    except Exception as err:
        user_id = current_user.id if current_user else "unknown"
        logger.exception("tmdb linking failed", user_id=user_id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to link TMDb account. Please try again.",
        ) from err

    logger.info("tmdb account linked", ip=ip)
    return TmdbCallbackResponse()
