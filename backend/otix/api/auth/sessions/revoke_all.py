from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.lib.tokens import decode_token
from otix.schemas.auth import RevokeSessionsResponse
from otix.services.session_service import SessionService

logger = structlog.get_logger()

router = APIRouter()


@router.delete("/sessions", response_model=RevokeSessionsResponse)
async def revoke_other_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> RevokeSessionsResponse:
    ip = client_ip(request)
    await limiter.check_revoke_session(ip)

    refresh_token = request.cookies.get(settings.auth_refresh_cookie_name)
    current_session_key = ""
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            current_session_key = payload.get("session_key", "")
        except Exception:
            pass

    service = SessionService(db)
    count = await service.revoke_other_sessions(current_user.id, current_session_key)

    logger.info("other sessions revoked", user_id=current_user.id, revoked_count=count, ip=ip)
    return RevokeSessionsResponse(
        message=f"Revoked {count} other session(s)",
        revoked_count=count,
    )
