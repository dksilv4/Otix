from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import GoogleDisconnectResponse
from otix.services.google_auth_service import unlink_google_drive_from_user

logger = structlog.get_logger()
router = APIRouter()


@router.delete(
    "/oauth/google-drive/disconnect",
    response_model=GoogleDisconnectResponse,
)
async def google_drive_disconnect(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> GoogleDisconnectResponse:
    ip = client_ip(request)
    await limiter.check_google_disconnect(ip)

    try:
        await unlink_google_drive_from_user(db, current_user)
    except HTTPException:
        raise
    except Exception:
        logger.exception("google drive disconnect failed", user_id=current_user.id, ip=ip)
        raise

    logger.info("google drive unlinked", user_id=current_user.id, ip=ip)
    return GoogleDisconnectResponse(message="Google Drive account unlinked successfully")
