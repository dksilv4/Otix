from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.services.session_service import SessionService

logger = structlog.get_logger()

router = APIRouter()


@router.delete("/sessions/{session_key}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_session(
    session_key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> None:
    ip = client_ip(request)
    await limiter.check_revoke_session(ip)

    service = SessionService(db)
    success = await service.revoke_session(session_key, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    logger.info("session revoked", user_id=current_user.id, session_key=session_key, ip=ip)
