from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.infrastructure.config import settings
from otix.lib.tokens import get_refresh_cookie_config, get_refresh_cookie_delete_config
from otix.schemas.auth import RefreshResponse
from otix.services.auth.refresh_service import (
    RefreshError,
    RefreshService,
    TokenReuseError,
    UserInactiveError,
)

logger = structlog.get_logger()

router = APIRouter()


@router.post("/refresh", response_model=RefreshResponse)
async def refresh(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> RefreshResponse:
    ip = client_ip(request)
    await limiter.check_refresh(ip)

    refresh_token = request.cookies.get(settings.auth_refresh_cookie_name)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="No refresh token provided",
        )

    service = RefreshService(db)
    try:
        access_token, new_refresh_token, user = await service.refresh(refresh_token)
    except TokenReuseError:
        logger.warning("refresh token reuse detected", ip=ip)
        response.delete_cookie(**get_refresh_cookie_delete_config())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    except UserInactiveError:
        logger.warning("refresh attempted for inactive user", ip=ip)
        response.delete_cookie(**get_refresh_cookie_delete_config())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
    except RefreshError:
        logger.info("refresh token rejected", ip=ip)
        response.delete_cookie(**get_refresh_cookie_delete_config())
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    response.set_cookie(value=new_refresh_token, **get_refresh_cookie_config())
    logger.info("token refreshed", user_id=user.id, ip=ip)
    return RefreshResponse(access_token=access_token)
