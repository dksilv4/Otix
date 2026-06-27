from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.lib.tokens import get_refresh_cookie_config
from otix.schemas.auth import TokenResponse, TwoFactorLoginVerifyRequest
from otix.services.auth.auth_service import AuthService

logger = structlog.get_logger()
router = APIRouter()


@router.post("/2fa/login/verify", response_model=TokenResponse)
async def two_factor_login_verify(
    body: TwoFactorLoginVerifyRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TokenResponse:
    """Verify a TOTP code for a 2FA-protected login.

    Called after ``/login`` returns ``two_factor_required=true`` with a
    challenge token. On success, returns access/refresh tokens.
    """
    ip = client_ip(request)
    await limiter.check_2fa_verify(ip)

    service = AuthService(db)
    result = await service.verify_2fa_login(
        body.challenge_token,
        body.code,
        ip_address=ip,
        user_agent=request.headers.get("User-Agent"),
    )
    if result is None:
        logger.warning("2fa login verify failed", ip=ip)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired challenge token or verification code",
        )

    access_token, refresh_token, user = result
    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    logger.info("2fa login verified", user_id=user.id, ip=ip)
    return TokenResponse(access_token=access_token)
