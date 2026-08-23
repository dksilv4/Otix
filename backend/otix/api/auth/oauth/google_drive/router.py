from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.schemas.auth import GoogleInitiateResponse
from otix.services.google_auth_service import build_google_drive_link_url

logger = structlog.get_logger()
router = APIRouter()


@router.post(
    "/oauth/google-drive",
    response_model=GoogleInitiateResponse,
)
async def google_drive_connect_initiate(
    request: Request,
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> GoogleInitiateResponse:
    """Initiate the Google Drive (drive.file) OAuth link flow.

    Requests only the drive.file scope. The YouTube link flow lives at
    ``/oauth/google`` because Google forbids requesting Drive and YouTube
    scopes in the same consent request.
    """
    ip = client_ip(request)
    await limiter.check_google_initiate(ip)

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication not configured.",
        )

    url, state = await build_google_drive_link_url(user_id=current_user.id)
    logger.info("google drive linking initiated", user_id=current_user.id, ip=ip)
    return GoogleInitiateResponse(auth_url=url, state=state)
