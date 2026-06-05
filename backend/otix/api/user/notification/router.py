from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.notification import NotificationOut, NotificationListResponse, UnreadCountOut
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.services.notification_service import NotificationService

notification_router = APIRouter(prefix="/notifications", tags=["notifications"])


@notification_router.get("", response_model=NotificationListResponse)
async def list_notifications(
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationListResponse:
    service = NotificationService(db)
    items, has_more = await service.get_for_user(current_user.id, limit=limit, cursor=cursor)
    next_cursor = items[-1].created_at.isoformat() if items and has_more else None
    return NotificationListResponse(
        items=[NotificationOut.model_validate(item) for item in items],
        has_more=has_more,
        next_cursor=next_cursor,
    )


@notification_router.get("/unread-count", response_model=UnreadCountOut)
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCountOut:
    service = NotificationService(db)
    count = await service.get_unread_count(current_user.id)
    return UnreadCountOut(count=count)


@notification_router.post("/{notification_id}/read", status_code=status.HTTP_200_OK)
async def mark_notification_read(
    notification_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = NotificationService(db)
    notification = await service.mark_read(notification_id, current_user.id)
    await db.commit()
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found"
        )
    return {"message": "Notification marked as read"}


@notification_router.post("/read-all", status_code=status.HTTP_200_OK)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    service = NotificationService(db)
    await service.mark_all_read(current_user.id)
    await db.commit()
    return {"message": "All notifications marked as read"}


@notification_router.get("/stream")
async def notification_stream(
    current_user: User = Depends(get_current_user),
):
    """SSE endpoint that streams new notifications to the authenticated user via Redis pub/sub."""
    channel = f"user:{current_user.id}:notifications"

    async def event_generator():
        redis = await get_redis()
        pubsub = redis.pubsub()
        await pubsub.subscribe(channel)
        try:
            deadline = time.monotonic() + 300.0
            while True:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message is None:
                    if time.monotonic() > deadline:
                        break
                    yield ":keepalive\n\n"
                    continue

                data = message["data"]
                yield f"data: {data}\n\n"
                deadline = time.monotonic() + 300.0
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
