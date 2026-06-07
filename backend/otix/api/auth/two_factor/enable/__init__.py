from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import TwoFactorEnableRequest, TwoFactorEnableResponse
from otix.services.auth.two_factor_service import TwoFactorService

logger = structlog.get_logger()
router = APIRouter()


@router.post("/2fa/enable", response_model=TwoFactorEnableResponse)
async def two_factor_enable(
    body: TwoFactorEnableRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TwoFactorEnableResponse:
    """Enable two-factor authentication after verifying the TOTP code."""
    ip = client_ip(request)
    await limiter.check_two_factor_enable(ip)

    if current_user.two_factor_enabled:
        logger.warning("2fa enable attempted when already enabled", user_id=current_user.id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled",
        )
    service = TwoFactorService(db)
    success = await service.enable(current_user, body.code)
    if not success:
        logger.warning("2fa enable with invalid code", user_id=current_user.id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code. Make sure you've set up 2FA first.",
        )
    logger.info("2fa enabled", user_id=current_user.id, ip=ip)
    return TwoFactorEnableResponse()
