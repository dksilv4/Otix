from __future__ import annotations

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Track, TrackRating


class TrackRatingService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _recalc_rating_aggregates(self, track_id: str) -> tuple[float | None, int]:
        result = await self.session.execute(
            select(
                func.round(func.avg(TrackRating.score), 2).label("avg"),
                func.count(TrackRating.score).label("cnt"),
            ).where(TrackRating.track_id == track_id)
        )
        row = result.one_or_none()
        avg = float(row.avg) if row and row.avg is not None else None
        count = int(row.cnt) if row else 0

        await self.session.execute(
            update(Track)
            .where(Track.id == track_id)
            .values(avg_rating=avg, rating_count=count)
        )
        return avg, count

    async def get_my_rating(self, user_id: str, track_id: str) -> TrackRating | None:
        return await self.session.scalar(
            select(TrackRating).where(
                TrackRating.user_id == user_id,
                TrackRating.track_id == track_id,
            )
        )

    async def upsert_rating(self, user_id: str, track_id: str, score: int) -> tuple[TrackRating, float | None, int]:
        existing = await self.get_my_rating(user_id, track_id)
        if existing is None:
            existing = TrackRating(user_id=user_id, track_id=track_id, score=score)
            self.session.add(existing)
        else:
            existing.score = score

        await self.session.flush()
        avg, count = await self._recalc_rating_aggregates(track_id)
        await self.session.refresh(existing)
        return existing, avg, count
