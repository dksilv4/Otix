from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status

from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.infrastructure.config import settings
from otix.schemas.auth import SteamInitiateResponse
from otix.services.google_auth_service import build_google_login_url

logger = structlog.get_logger()

router = APIRouter()


@router.post("/google/initiate", response_model=SteamInitiateResponse)
async def google_login_initiate(
    request: Request,
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SteamInitiateResponse:
    ip = client_ip(request)
    await limiter.check_google_initiate(ip)

    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google authentication is not configured.",
        )

    url, state = await build_google_login_url()
    logger.info("google login initiated", ip=ip)
    return SteamInitiateResponse(auth_url=url, state=state)
