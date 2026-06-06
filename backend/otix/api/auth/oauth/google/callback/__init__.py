from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db, get_optional_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.auth import GoogleCallbackRequest, GoogleCallbackResponse
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.services.google_auth_service import link_google_to_user

logger = structlog.get_logger()
router = APIRouter()


@router.post(
    "/oauth/google/callback",
    response_model=GoogleCallbackResponse,
)
async def google_connect_callback(
    body: GoogleCallbackRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> GoogleCallbackResponse:
    """Complete the Google OAuth link flow.

    The user is resolved from the OAuth state stored in Redis, so this
    endpoint works without a JWT — necessary when the callback page runs
    in a system browser opened via ``openExternal`` (Electron).
    """
    ip = client_ip(request)
    await limiter.check_google_callback(ip)

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google authentication is not configured.",
        )
    try:
        await link_google_to_user(db, current_user, body.code, body.state)
    except HTTPException:
        raise
    except Exception as err:
        user_id = current_user.id if current_user else "unknown"
        logger.exception("google linking failed", user_id=user_id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to link Google account. Please try again.",
        ) from err

    logger.info("google account linked", ip=ip)
    return GoogleCallbackResponse()
