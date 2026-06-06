from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.schemas.auth import ResetPasswordRequest, ResetPasswordResponse
from otix.services.auth.auth_service import AuthService

logger = structlog.get_logger()
router = APIRouter()


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    body: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> ResetPasswordResponse:
    """Reset the user's password using a token from the forgot-password flow."""
    ip = client_ip(request)
    await limiter.check_reset_password(ip)

    service = AuthService(db)
    try:
        success = await service.reset_password(body.token, body.password)
    except Exception:
        logger.exception("password reset failed", ip=ip)
        raise

    if not success:
        logger.warning("password reset with invalid or expired token", ip=ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )

    logger.info("password reset successful", ip=ip)
    return ResetPasswordResponse()
