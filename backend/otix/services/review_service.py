from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.media import MediaItem
from otix.domain.review import Review
from otix.infrastructure.celery import app
from otix.lib.xp import REVIEW_SCORE_ONLY, REVIEW_WITH_CONTENT


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

        if existing:
            existing.score = score
            existing.title = title
            existing.content = content
            existing.is_spoiler = is_spoiler
            existing.is_private = is_private
        else:
            existing = Review(
                user_id=user_id,
                media_item_id=media_item_id,
                score=score,
                title=title,
                content=content,
                is_spoiler=is_spoiler,
                is_private=is_private,
            )
            self.session.add(existing)

        await self.session.flush()
        await self._recalc_rating_aggregates(media_item_id)

        if is_new:
            amount = REVIEW_WITH_CONTENT if content else REVIEW_SCORE_ONLY
            app.send_task("xp.award", args=[user_id, amount])

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
    ) -> tuple[list[Review], bool]:
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
    ) -> tuple[list[Review], bool]:
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
