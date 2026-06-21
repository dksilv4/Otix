# TODO: Review this file
from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.notification import Notification


class NotificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: str,
        type_: str,
        title: str,
        body: str | None = None,
        metadata_json: dict | None = None,
    ) -> Notification:
        notification = Notification(
            user_id=user_id,
            type=type_,
            title=title,
            body=body,
            metadata_json=metadata_json or {},
        )
        self.session.add(notification)
        await self.session.flush()

        # Fire-and-forget push delivery — create new session for background task
        try:
            from otix.infrastructure.database import async_session as async_session_factory
            from otix.services.push_service import PushService
            from otix.services.vapid import get_vapid_public_key, vapid_private_key

            async def _deliver():
                async with async_session_factory() as session:
                    push_service = PushService(session, vapid_private_key, get_vapid_public_key())
                    await push_service.send_notification(
                        user_id=notification.user_id,
                        title=notification.title,
                        body=notification.body,
                        type_=notification.type,
                        metadata=notification.metadata_json,
                    )

            asyncio.create_task(_deliver())
        except Exception:
            pass

        return notification

    async def get_for_user(
        self,
        user_id: str,
        limit: int = 20,
        cursor: str | None = None,
    ) -> tuple[list[Notification], bool]:
        query = (
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
        )

        if cursor:
            query = query.where(Notification.created_at < cursor)

        query = query.limit(limit + 1)
        result = await self.session.scalars(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more

    async def mark_read(self, notification_id: str, user_id: str) -> Notification | None:
        notification = await self.session.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        if notification:
            notification.is_read = True
            notification.read_at = datetime.now(UTC)
            await self.session.flush()
        return notification

    async def mark_all_read(self, user_id: str) -> None:
        await self.session.execute(
            update(Notification)
            .where(Notification.user_id == user_id, Notification.is_read == False)  # noqa: E712
            .values(is_read=True, read_at=datetime.now(UTC))
        )
        await self.session.flush()

    async def get_unread_count(self, user_id: str) -> int:
        result = await self.session.scalar(
            select(func.count()).where(
                Notification.user_id == user_id,
                Notification.is_read == False,  # noqa: E712
            )
        )
        return result or 0
