from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.schemas.list import ListLikeStatus
from otix.services.list_service import ListService

logger = structlog.get_logger()

router = APIRouter()


@router.post("/{list_id}/like", response_model=ListLikeStatus)
async def like_list(
    list_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> ListLikeStatus:
    """Like a list.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_like(ip)

    service = ListService(db)
    try:
        await service.like_list(list_id=list_id, user_id=current_user.id)
        count, is_liked = await service.get_like_status(list_id, current_user.id)
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to like list",
            list_id=list_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info("list liked", list_id=list_id, user_id=current_user.id, ip=ip)
    return ListLikeStatus(like_count=count, is_liked=is_liked)


@router.delete("/{list_id}/like", response_model=ListLikeStatus)
async def unlike_list(
    list_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limiter: AuthRateLimiter = Depends(get_auth_rate_limiter),
) -> ListLikeStatus:
    """Unlike a list.

    Rate-limited per IP address.
    """
    ip = client_ip(request)
    await limiter.check_list_like(ip)

    service = ListService(db)
    try:
        await service.unlike_list(list_id=list_id, user_id=current_user.id)
        count, is_liked = await service.get_like_status(list_id, current_user.id)
    except Exception:
        await db.rollback()
        logger.exception(
            "failed to unlike list",
            list_id=list_id,
            user_id=current_user.id,
            ip=ip,
        )
        raise

    logger.info("list unliked", list_id=list_id, user_id=current_user.id, ip=ip)
    return ListLikeStatus(like_count=count, is_liked=is_liked)
