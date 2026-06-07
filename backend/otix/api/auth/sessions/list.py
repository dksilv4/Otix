from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.lib.tokens import decode_token
from otix.schemas.auth import SessionListResponse
from otix.services.session_service import SessionService

logger = structlog.get_logger()

router = APIRouter()


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> SessionListResponse:
    ip = client_ip(request)
    await limiter.check_list_sessions(ip)

    service = SessionService(db)
    sessions = await service.list_user_sessions(current_user.id)

    current_session_key = None
    refresh_token = request.cookies.get(settings.auth_refresh_cookie_name)
    if refresh_token:
        try:
            payload = decode_token(refresh_token)
            current_session_key = payload.get("session_key")
        except Exception:
            pass

    logger.info("sessions listed", user_id=current_user.id, session_count=len(sessions), ip=ip)
    return SessionListResponse(sessions=sessions, current_session_key=current_session_key)
