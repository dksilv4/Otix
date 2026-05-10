from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.notification import NotificationOut, UnreadCountOut
from otix.domain.user import User
from otix.services.notification_service import NotificationService

notification_router = APIRouter(prefix="/notifications", tags=["notifications"])


@notification_router.get("", response_model=list[NotificationOut])
async def list_notifications(
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[NotificationOut]:
    service = NotificationService(db)
    items, _ = await service.get_for_user(current_user.id, limit=limit, cursor=cursor)
    return [NotificationOut.model_validate(item) for item in items]


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
