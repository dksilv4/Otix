# TODO: Review this file
from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import MediaItem
from otix.domain.media_rating import MediaItemRating
from otix.infrastructure.celery import app
from otix.lib.xp import RATE_MEDIA


class MediaRatingService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _recalc_rating_aggregates(self, media_item_id: str) -> None:
        result = await self.session.execute(
            select(
                func.round(func.avg(MediaItemRating.score), 2).label("avg"),
                func.count(MediaItemRating.score).label("cnt"),
            ).where(MediaItemRating.media_item_id == media_item_id)
        )
        row = result.one_or_none()
        avg = float(row.avg) if row and row.avg is not None else None
        cnt = row.cnt if row else 0

        await self.session.execute(
            update(MediaItem)
            .where(MediaItem.id == media_item_id)
            .values(avg_rating=avg, rating_count=cnt)
        )

    async def get_my_rating(self, user_id: str, media_item_id: str) -> MediaItemRating | None:
        return await self.session.scalar(
            select(MediaItemRating).where(
                MediaItemRating.user_id == user_id,
                MediaItemRating.media_item_id == media_item_id,
            )
        )

    async def upsert_rating(self, user_id: str, media_item_id: str, score: int) -> tuple[MediaItemRating, float | None, int]:
        """Upsert a rating and return (rating, avg_rating, rating_count)."""
        existing = await self.get_my_rating(user_id, media_item_id)
        is_new = existing is None

        if existing:
            existing.score = score
        else:
            existing = MediaItemRating(
                user_id=user_id,
                media_item_id=media_item_id,
                score=score,
            )
            self.session.add(existing)

        await self.session.flush()
        await self._recalc_rating_aggregates(media_item_id)

        if is_new:
            app.send_task("xp.award", args=[user_id, RATE_MEDIA])

        media = await self.session.get(MediaItem, media_item_id)
        return existing, media.avg_rating if media else None, media.rating_count if media else 0

    async def delete_rating(self, user_id: str, media_item_id: str) -> bool:
        result = await self.session.execute(
            delete(MediaItemRating).where(
                MediaItemRating.user_id == user_id,
                MediaItemRating.media_item_id == media_item_id,
            )
        )
        if result.rowcount == 0:
            return False

        await self._recalc_rating_aggregates(media_item_id)
        return True
