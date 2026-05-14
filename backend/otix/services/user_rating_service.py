from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.interaction import UserMediaInteraction
from otix.domain.list import UserList
from otix.domain.review import Review
from otix.domain.user import User, UserRating
from otix.domain.workout import Workout
from otix.infrastructure.celery import app
from otix.lib.xp import RATE_USER


class UserRatingService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _recalc_user_rating_aggregates(self, user_id: str) -> None:
        result = await self.session.execute(
            select(
                func.round(func.avg(UserRating.score), 2).label("avg"),
                func.count(UserRating.score).label("cnt"),
            ).where(UserRating.rated_user_id == user_id)
        )
        row = result.one_or_none()
        avg = float(row.avg) if row and row.avg is not None else None
        cnt = row.cnt if row else 0

        await self.session.execute(
            update(User)
            .where(User.id == user_id)
            .values(avg_user_rating=avg, user_rating_count=cnt)
        )

    async def get_my_rating(self, rater_id: str, rated_user_id: str) -> UserRating | None:
        return await self.session.scalar(
            select(UserRating).where(
                UserRating.rater_id == rater_id,
                UserRating.rated_user_id == rated_user_id,
            )
        )

    async def upsert_rating(self, rater_id: str, rated_user_id: str, score: int) -> UserRating:
        existing = await self.get_my_rating(rater_id, rated_user_id)
        is_new = existing is None

        if existing:
            existing.score = score
        else:
            existing = UserRating(rater_id=rater_id, rated_user_id=rated_user_id, score=score)
            self.session.add(existing)

        await self.session.flush()
        await self._recalc_user_rating_aggregates(rated_user_id)

        if is_new:
            app.send_task("xp.award", args=[rater_id, RATE_USER])

        return existing

    async def delete_rating(self, rater_id: str, rated_user_id: str) -> bool:
        result = await self.session.execute(
            delete(UserRating).where(
                UserRating.rater_id == rater_id,
                UserRating.rated_user_id == rated_user_id,
            )
        )
        if result.rowcount == 0:
            return False

        await self._recalc_user_rating_aggregates(rated_user_id)
        return True

    async def compute_composite_score(self, user_id: str) -> dict:
        """Compute the composite reputation score (70% ratings, 30% activity)."""
        user = await self.session.scalar(
            select(
                User.avg_user_rating,
                User.user_rating_count,
                User.total_xp,
            ).where(User.id == user_id)
        )
        if user is None:
            return {"composite_score": None, "activity_score": None, "direct_rating": None, "components": {}}

        avg_rating, rating_count, total_xp = user

        # Activity counts
        review_count = await self.session.scalar(
            select(func.count()).select_from(Review).where(
                Review.user_id == user_id,
                Review.content.isnot(None),
                Review.is_private == False,  # noqa: E712
            )
        ) or 0

        interaction_count = await self.session.scalar(
            select(func.count()).select_from(UserMediaInteraction).where(
                UserMediaInteraction.user_id == user_id,
            )
        ) or 0

        workout_count = await self.session.scalar(
            select(func.count()).select_from(Workout).where(Workout.user_id == user_id)
        ) or 0

        list_count = await self.session.scalar(
            select(func.count()).select_from(UserList).where(UserList.user_id == user_id)
        ) or 0

        def clamp(v: float, lo: float = 0, hi: float = 10) -> float:
            return max(lo, min(hi, v))

        components = {
            "xp": clamp(total_xp / 300),
            "reviews": clamp(review_count * 2),
            "interactions": clamp(interaction_count / 10),
            "workouts": clamp(workout_count),
            "lists": clamp(list_count * 2),
        }
        activity_score = round(sum(components.values()) / len(components), 1)

        direct_rating = float(avg_rating) if avg_rating is not None else None

        if rating_count == 0:
            composite_score = activity_score
        else:
            composite_score = round((direct_rating or 0) * 0.7 + activity_score * 0.3, 1)

        composite_score = clamp(composite_score)

        return {
            "composite_score": composite_score,
            "activity_score": activity_score,
            "direct_rating": direct_rating,
            "components": components,
        }
