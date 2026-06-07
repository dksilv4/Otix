from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from otix.api._utils import get_current_user
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.schemas.auth import GoogleInitiateResponse
from otix.services.google_auth_service import build_google_link_url

logger = structlog.get_logger()
router = APIRouter()


@router.post(
    "/oauth/google",
    response_model=GoogleInitiateResponse,
)
async def google_connect_initiate(
    request: Request,
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> GoogleInitiateResponse:
    """Initiate the Google OAuth link flow.

    Returns an authorization URL and state token. The client should
    redirect the user to *auth_url* and then POST the callback code
    to ``/auth/oauth/google/callback``.
    """
    ip = client_ip(request)
    await limiter.check_google_initiate(ip)

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google authentication is not configured.",
        )
    url, state = await build_google_link_url(user_id=current_user.id)

    logger.info("google linking initiated", user_id=current_user.id, ip=ip)
    return GoogleInitiateResponse(auth_url=url, state=state)
