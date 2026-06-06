# TODO: Review this file
from __future__ import annotations

import asyncio
import json
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, JSON, String, Text, event, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(255))
    body: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    user: Mapped[User] = relationship("User", back_populates="notifications")

    __table_args__ = (
        Index("ix_notifications_user_unread", "user_id", "is_read"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )


async def _publish_notification(notification: Notification) -> None:
    from otix.infrastructure.redis import get_redis

    try:
        redis = await get_redis()
        payload = json.dumps(
            {
                "id": notification.id,
                "type": notification.type,
                "title": notification.title,
                "body": notification.body,
                "is_read": notification.is_read,
                "created_at": notification.created_at.isoformat(),
            },
            default=str,
        )
        await redis.publish(f"user:{notification.user_id}:notifications", payload)
    except Exception:
        pass


@event.listens_for(Notification, "after_insert")
def _on_notification_insert(_mapper, _connection, target: Notification) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(_publish_notification(target))
