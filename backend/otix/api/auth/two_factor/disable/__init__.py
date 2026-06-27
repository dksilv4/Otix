from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import TwoFactorDisableRequest, TwoFactorDisableResponse
from otix.services.auth.two_factor_service import TwoFactorService

logger = structlog.get_logger()
router = APIRouter()


@router.post("/2fa/disable", response_model=TwoFactorDisableResponse)
async def two_factor_disable(
    body: TwoFactorDisableRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TwoFactorDisableResponse:
    """Disable two-factor authentication after verifying the user's password."""
    ip = client_ip(request)
    await limiter.check_two_factor_disable(ip)

    if not current_user.two_factor_enabled:
        logger.warning("2fa disable attempted when not enabled", user_id=current_user.id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is not enabled",
        )
    service = TwoFactorService(db)
    success = await service.disable(current_user, body.password)
    if not success:
        logger.warning("2fa disable with incorrect password", user_id=current_user.id, ip=ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect password",
        )
    logger.info("2fa disabled", user_id=current_user.id, ip=ip)
    return TwoFactorDisableResponse()
