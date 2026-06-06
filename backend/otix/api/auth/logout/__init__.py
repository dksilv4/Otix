from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.lib.tokens import get_refresh_cookie_config
from otix.services.auth.auth_service import AuthService

logger = structlog.get_logger()

router = APIRouter()


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    """Log the current user out by revoking their sessions.

    Deletes the refresh token cookie and revokes all active sessions
    for the authenticated user.
    """
    ip = client_ip(request)
    await limiter.check_logout(ip)

    try:
        await AuthService(db).logout(current_user.id)
    except Exception:
        logger.exception("logout failed", user_id=current_user.id, ip=ip)
        raise

    cookie_config = get_refresh_cookie_config()
    response.delete_cookie(key=cookie_config["key"], path=cookie_config["path"], domain=cookie_config["domain"])
    logger.info("user logged out", user_id=current_user.id, ip=ip)
