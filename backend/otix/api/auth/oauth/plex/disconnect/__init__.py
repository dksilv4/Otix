from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import PlexDisconnectResponse
from otix.services.plex_auth_service import unlink_plex_from_user

logger = structlog.get_logger()
router = APIRouter()


@router.delete(
    "/oauth/plex/disconnect",
    response_model=PlexDisconnectResponse,
)
async def plex_disconnect(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> PlexDisconnectResponse:
    ip = client_ip(request)
    await limiter.check_plex_disconnect(ip)

    try:
        await unlink_plex_from_user(db, current_user)
    except HTTPException:
        raise
    except Exception:
        logger.exception("plex disconnect failed", user_id=current_user.id, ip=ip)
        raise

    logger.info("plex account unlinked", user_id=current_user.id, ip=ip)
    return PlexDisconnectResponse()
