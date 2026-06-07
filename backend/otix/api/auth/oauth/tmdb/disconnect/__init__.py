from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.auth import TmdbDisconnectResponse
from otix.services.tmdb_auth_service import unlink_tmdb_from_user

logger = structlog.get_logger()
router = APIRouter()


@router.delete(
    "/oauth/tmdb/disconnect",
    response_model=TmdbDisconnectResponse,
)
async def tmdb_disconnect(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> TmdbDisconnectResponse:
    ip = client_ip(request)
    await limiter.check_tmdb_disconnect(ip)

    try:
        await unlink_tmdb_from_user(db, current_user)
    except HTTPException:
        raise
    except Exception:
        logger.exception("tmdb disconnect failed", user_id=current_user.id, ip=ip)
        raise

    logger.info("tmdb account unlinked", user_id=current_user.id, ip=ip)
    return TmdbDisconnectResponse()
