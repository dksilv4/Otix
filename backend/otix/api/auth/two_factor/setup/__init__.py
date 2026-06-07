from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import TwoFactorSetupResponse
from otix.services.auth.two_factor_service import TwoFactorService

logger = structlog.get_logger()
router = APIRouter()


@router.post("/2fa/setup", response_model=TwoFactorSetupResponse)
async def two_factor_setup(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TwoFactorSetupResponse:
    """Set up two-factor authentication.

    Generates a TOTP secret and returns a QR code SVG for the user
    to scan with their authenticator app. The user must then call
    ``/2fa/enable`` with a verification code to complete setup.
    """
    ip = client_ip(request)
    await limiter.check_two_factor_setup(ip)

    if current_user.two_factor_enabled:
        logger.warning("2fa setup attempted when already enabled", user_id=current_user.id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled. Disable it first to set up again.",
        )
    service = TwoFactorService(db)
    info = await service.setup(current_user)
    logger.info("2fa setup initiated", user_id=current_user.id, ip=ip)
    return TwoFactorSetupResponse(**info)
