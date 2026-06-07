from __future__ import annotations

import hashlib

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.lib.tokens import get_refresh_cookie_config
from otix.schemas.auth import LoginRequest, LoginResponse
from otix.services.auth.auth_service import AuthService

logger = structlog.get_logger()

router = APIRouter()


@router.post("/login", response_model=LoginResponse)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> LoginResponse:
    ip = client_ip(request)
    await limiter.check_login_by_ip(ip)
    await limiter.check_login_by_identity(body.identity)

    service = AuthService(db)
    try:
        result = await service.login(
            body.identity,
            body.password,
            ip_address=ip,
            user_agent=request.headers.get("User-Agent"),
        )
    except Exception:
        logger.exception("login service error", ip=ip)
        raise

    if result is None:
        logger.warning("login failed — invalid credentials", identity_hash=hashlib.sha256(body.identity.lower().encode()).hexdigest()[:16], ip=ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    access_token, second_token, user = result

    if access_token is None:
        logger.info("2fa challenge issued", user_id=user.id, ip=ip)
        return LoginResponse(
            two_factor_required=True,
            challenge_token=second_token,
        )

    response.set_cookie(value=second_token, **get_refresh_cookie_config())
    logger.info("login successful", user_id=user.id, ip=ip)
    return LoginResponse(access_token=access_token)
