from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import AuthRateLimiter, client_ip, get_auth_rate_limiter
from otix.domain.user import User
from otix.lib.sse import SseStreamConfig, create_sse_response
from otix.schemas.notification import NotificationListResponse, NotificationOut, UnreadCountOut
from otix.services.notification_service import NotificationService

logger = structlog.get_logger()

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    request: Request,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationListResponse:
    """List the authenticated user's notifications."""
    ip = client_ip(request)
    service = NotificationService(db)
    items, has_more = await service.get_for_user(current_user.id, limit=limit, cursor=cursor)
    next_cursor = items[-1].created_at.isoformat() if items and has_more else None
    logger.info("notifications listed", user_id=current_user.id, count=len(items), ip=ip)
    return NotificationListResponse(
        items=[NotificationOut.model_validate(item) for item in items],
        has_more=has_more,
        next_cursor=next_cursor,
    )


@router.get("/unread-count", response_model=UnreadCountOut)
async def unread_count(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCountOut:
    """Get the unread notification count."""
    ip = request.client.host if request.client else None
    service = NotificationService(db)
    count = await service.get_unread_count(current_user.id)
    logger.info("unread count fetched", user_id=current_user.id, count=count, ip=ip)
    return UnreadCountOut(count=count)


@router.post("/{notification_id}/read", status_code=status.HTTP_200_OK)
async def mark_notification_read(
    notification_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Mark a notification as read."""
    ip = request.client.host if request.client else None
    service = NotificationService(db)
    try:
        notification = await service.mark_read(notification_id, current_user.id)
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("failed to mark notification read", notification_id=notification_id, ip=ip)
        raise

    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    logger.info("notification marked read", notification_id=notification_id, ip=ip)
    return {"message": "Notification marked as read"}


@router.post("/read-all", status_code=status.HTTP_200_OK)
async def mark_all_read(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Mark all notifications as read."""
    ip = request.client.host if request.client else None
    service = NotificationService(db)
    try:
        await service.mark_all_read(current_user.id)
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("failed to mark all notifications read", user_id=current_user.id, ip=ip)
        raise

    logger.info("all notifications marked read", user_id=current_user.id, ip=ip)
    return {"message": "All notifications marked as read"}


@router.get("/stream")
async def notification_stream(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint streaming new notifications via Redis pub/sub."""
    return await create_sse_response(
        SseStreamConfig(channel=f"user:{current_user.id}:notifications"),
        request,
    )
