from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.schemas.auth import GoogleInitiateResponse
from otix.services.google_auth_service import build_google_link_url, get_user_google_access_token

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
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured.",
        )
    url, state = await build_google_link_url(user_id=current_user.id)

    logger.info("google linking initiated", user_id=current_user.id, ip=ip)
    return GoogleInitiateResponse(auth_url=url, state=state)


@router.get(
    "/oauth/google/token",
    response_model=dict,
)
async def get_google_token(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Retrieve the user's active Google access token, refreshing if expired."""
    token = await get_user_google_access_token(current_user, session=db)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Google account is not linked or token has expired."
        )
    return {"access_token": token}
