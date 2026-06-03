from __future__ import annotations

import math
from datetime import datetime, timezone

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.list import UserList
from otix.domain.media_rating import MediaItemRating
from otix.domain.review import Review
from otix.domain.user import User, UserRating
from otix.domain.user_streak import UserStreak
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
        """Compute aura score (0–1000, starts at 100).

        Four pillars, log₂-scaled:
        - Contribution (0–250): content reviews, score-only reviews, lists, workouts
        - Trust (–400 to +400): peer ratings, centered at 5.0 so low ratings subtract
        - Tenure (0–150): account age, login streaks, review streaks
        - Impact (0–200): community karma from review upvotes
        """
        row = (await self.session.execute(
            select(
                User.avg_user_rating,
                User.user_rating_count,
                User.created_at,
                User.karma,
            ).where(User.id == user_id)
        )).one_or_none()
        if row is None:
            return {"composite_score": None, "components": {}}

        avg_rating, rating_count, created_at, karma = row

        def log2s(v: float) -> float:
            return math.log2(v + 1)

        # ── Activity counts (single query) ──

        counts = (await self.session.execute(
            select(
                func.coalesce(
                    select(func.count())
                    .select_from(Review)
                    .where(
                        Review.user_id == user_id,
                        Review.content.isnot(None),
                        Review.is_private == False,  # noqa: E712
                    )
                    .scalar_subquery(),
                    0,
                ).label("content_reviews"),
                func.coalesce(
                    select(func.count())
                    .select_from(MediaItemRating)
                    .where(
                        MediaItemRating.user_id == user_id,
                    )
                    .scalar_subquery(),
                    0,
                ).label("score_only_reviews"),
                func.coalesce(
                    select(func.count())
                    .select_from(UserList)
                    .where(UserList.user_id == user_id)
                    .scalar_subquery(),
                    0,
                ).label("list_count"),
                func.coalesce(
                    select(func.count())
                    .select_from(Workout)
                    .where(Workout.user_id == user_id)
                    .scalar_subquery(),
                    0,
                ).label("workout_count"),
            )
        )).one()

        content_reviews = counts.content_reviews
        score_only_reviews = counts.score_only_reviews
        list_count = counts.list_count
        workout_count = counts.workout_count

        # ── Contribution (0–250) ──

        contribution = (
            log2s(content_reviews) * 12 +
            log2s(score_only_reviews) * 4 +
            log2s(list_count) * 10 +
            log2s(workout_count) * 6
        )
        contribution = min(contribution, 250)

        # ── Trust (–400 to +400) — centered at 5.0 ──

        trust = 0.0
        if avg_rating is not None and rating_count > 0:
            rating_factor = (avg_rating - 5.0) / 5.0    # -1.0 to +1.0
            confidence = min(1.0, rating_count / 20.0)
            trust = rating_factor * confidence * 400

        # ── Tenure (0–150) ──

        now = datetime.now(timezone.utc)
        years = max(0.0, (now - created_at).total_seconds() / (365.25 * 24 * 3600))
        tenure_score = log2s(years) * 30

        streak = await self.session.scalar(
            select(UserStreak).where(UserStreak.user_id == user_id)
        )
        longest_login = streak.longest_login_streak if streak else 0
        longest_review = streak.longest_review_streak if streak else 0

        streak_score = log2s(longest_login / 7.0) * 10
        review_streak_score = log2s(longest_review) * 8

        tenure_total = min(tenure_score + streak_score + review_streak_score, 150)

        # ── Impact (0–200) — community karma ──

        impact = min(log2s(max(0, karma)) * 25, 200)

        # ── Final score ──

        raw = 100 + contribution + trust + tenure_total + impact
        aura = min(1000, round(raw))

        return {
            "composite_score": aura,
            "components": {
                "contribution": round(contribution, 1),
                "trust": round(trust, 1),
                "tenure": round(tenure_total, 1),
                "impact": round(impact, 1),
            },
        }
