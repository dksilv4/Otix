"""Celery tasks for awarding XP to users."""

from __future__ import annotations

from sqlalchemy import select, update

from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async


async def _award_xp(user_id: str, amount: int) -> None:
    async with async_session() as session:
        await session.execute(
            update(User).where(User.id == user_id).values(total_xp=User.total_xp + amount)
        )
        await session.commit()


@app.task(name="xp.award", bind=True, max_retries=3, default_retry_delay=5, autoretry_for=(Exception,))
def award_xp_task(self, user_id: str, amount: int) -> None:
    run_async(_award_xp(user_id, amount))


async def _backfill_xp() -> dict:
    from sqlalchemy import func

    from otix.domain.interaction import UserMediaInteraction
    from otix.domain.list import UserList
    from otix.domain.review import Review
    from otix.domain.workout import Workout
    from otix.lib.xp import (
        INTERACTION_LIKE_WATCHLIST_STARTED,
        INTERACTION_WATCHED_PLAYED,
        LIST_CREATE,
        REVIEW_SCORE_ONLY,
        REVIEW_WITH_CONTENT,
        WORKOUT_COMPLETE,
    )

    async with async_session() as session:
        # Clear all XP
        await session.execute(update(User).values(total_xp=0))

        # Reviews
        reviews = (await session.execute(select(Review.user_id, Review.content, Review.score))).all()
        for user_id, content, score in reviews:
            amount = REVIEW_WITH_CONTENT if content else REVIEW_SCORE_ONLY
            await session.execute(
                update(User).where(User.id == user_id).values(total_xp=User.total_xp + amount)
            )

        # Interactions (one XP per interaction row, type-dependent)
        interactions = (
            await session.execute(select(UserMediaInteraction.user_id, UserMediaInteraction.interaction_type))
        ).all()
        for user_id, itype in interactions:
            amount = INTERACTION_WATCHED_PLAYED if itype in ("watched", "played") else INTERACTION_LIKE_WATCHLIST_STARTED
            await session.execute(
                update(User).where(User.id == user_id).values(total_xp=User.total_xp + amount)
            )

        # Workouts
        workouts = (await session.execute(select(Workout.user_id))).all()
        for (user_id,) in workouts:
            await session.execute(
                update(User).where(User.id == user_id).values(total_xp=User.total_xp + WORKOUT_COMPLETE)
            )

        # Lists
        lists = (await session.execute(select(UserList.user_id))).all()
        for (user_id,) in lists:
            await session.execute(
                update(User).where(User.id == user_id).values(total_xp=User.total_xp + LIST_CREATE)
            )

        await session.commit()

        # Count results
        result = await session.execute(select(func.sum(User.total_xp)))
        total = result.scalar() or 0
        user_count = (await session.execute(select(func.count()).select_from(User).where(User.total_xp > 0))).scalar() or 0

    return {"total_xp_awarded": total, "users_with_xp": user_count}


@app.task(name="xp.backfill", bind=True, max_retries=1, queue="slow")
def backfill_xp_task(self) -> dict:
    return run_async(_backfill_xp())
