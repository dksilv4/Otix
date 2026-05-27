from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.media import MediaItem
from otix.domain.review import Review
from otix.infrastructure.celery import app
from otix.lib.xp import REVIEW_SCORE_ONLY, REVIEW_WITH_CONTENT

REVIEW_COOLDOWN_MINUTES = 15


class ReviewService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _recalc_rating_aggregates(self, media_item_id: str) -> None:
        result = await self.session.execute(
            select(
                func.round(func.avg(Review.score), 2).label("avg"),
                func.count(Review.score).label("cnt"),
            ).where(
                Review.media_item_id == media_item_id,
                Review.score.isnot(None),
            )
        )
        row = result.one_or_none()
        avg = float(row.avg) if row and row.avg is not None else None
        cnt = row.cnt if row else 0

        await self.session.execute(
            update(MediaItem)
            .where(MediaItem.id == media_item_id)
            .values(avg_rating=avg, rating_count=cnt)
        )

    async def upsert_review(
        self,
        user_id: str,
        media_item_id: str,
        score: int | None,
        title: str | None,
        content: str | None,
        is_spoiler: bool,
        is_private: bool = False,
    ) -> Review:
        existing = await self.session.scalar(
            select(Review).where(
                Review.user_id == user_id,
                Review.media_item_id == media_item_id,
            )
        )

        is_new = existing is None
        now = datetime.now(timezone.utc)
        cooldown_until = now + timedelta(minutes=REVIEW_COOLDOWN_MINUTES)

        if existing:
            in_cooldown = existing.cooldown_until is not None and existing.cooldown_until > now
            existing.score = score
            if in_cooldown:
                existing.title = title
                existing.content = content
                existing.is_spoiler = is_spoiler
                existing.is_private = is_private
                existing.cooldown_until = cooldown_until
        else:
            existing = Review(
                user_id=user_id,
                media_item_id=media_item_id,
                score=score,
                title=title,
                content=content,
                is_spoiler=is_spoiler,
                is_private=is_private,
                cooldown_until=cooldown_until,
            )
            self.session.add(existing)

        await self.session.flush()
        await self._recalc_rating_aggregates(media_item_id)

        if is_new:
            amount = REVIEW_WITH_CONTENT if content else REVIEW_SCORE_ONLY
            app.send_task("xp.award", args=[user_id, amount])

        app.send_task("streak.update", args=[user_id])
        app.send_task("streak.update_review", args=[user_id])
        app.send_task("gamification.check_badges", args=[user_id])

        return existing

    async def get_my_review(self, user_id: str, media_item_id: str) -> Review | None:
        return await self.session.scalar(
            select(Review).where(
                Review.user_id == user_id,
                Review.media_item_id == media_item_id,
            )
        )

    async def get_reviews_for_media(
        self,
        media_item_id: str,
        cursor: str | None = None,
        limit: int = 20,
        current_user_id: str | None = None,
    ) -> tuple[list[Review], bool]:
        now = datetime.now(timezone.utc)
        query = (
            select(Review)
            .options(joinedload(Review.user))
            .where(
                Review.media_item_id == media_item_id,
                Review.content.isnot(None),
                Review.is_private == False,  # noqa: E712
            )
            .order_by(Review.created_at.desc(), Review.user_id)
        )
        # Hide reviews still in cooldown from other users
        if current_user_id is not None:
            query = query.where(
                (Review.cooldown_until <= now) | (Review.user_id == current_user_id)
            )
        else:
            query = query.where(Review.cooldown_until <= now)

        if cursor:
            parts = cursor.split("__", 1)
            if len(parts) == 2:
                cursor_created_at, cursor_user_id = parts[0], parts[1]
                query = query.where(
                    (Review.created_at < cursor_created_at)
                    | (
                        (Review.created_at == cursor_created_at)
                        & (Review.user_id > cursor_user_id)
                    )
                )

        query = query.limit(limit + 1)
        result = await self.session.scalars(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more

    async def get_reviews_by_user(
        self,
        user_id: str,
        cursor: str | None = None,
        limit: int = 20,
        current_user_id: str | None = None,
    ) -> tuple[list[Review], bool]:
        now = datetime.now(timezone.utc)
        query = (
            select(Review)
            .options(joinedload(Review.user))
            .where(
                Review.user_id == user_id,
                Review.content.isnot(None),
                Review.is_private == False,  # noqa: E712
            )
            .order_by(Review.created_at.desc())
        )
        # Hide reviews still in cooldown from other users
        if current_user_id is not None and current_user_id == user_id:
            pass  # viewing own profile — show all
        else:
            query = query.where(Review.cooldown_until <= now)

        if cursor:
            query = query.where(Review.created_at < cursor)

        query = query.limit(limit + 1)
        result = await self.session.scalars(query)
        items = list(result)

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]

        return items, has_more

    async def delete_review(self, user_id: str, media_item_id: str) -> bool:
        result = await self.session.execute(
            delete(Review).where(
                Review.user_id == user_id,
                Review.media_item_id == media_item_id,
            )
        )
        if result.rowcount == 0:
            return False

        await self._recalc_rating_aggregates(media_item_id)
        return True
