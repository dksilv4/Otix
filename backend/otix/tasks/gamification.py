# TODO: Review this file
"""Celery tasks for gamification: streaks, badges, and karma."""

from __future__ import annotations

from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async
from otix.services.gamification_service import GamificationService


async def _update_streaks(user_id: str) -> dict:
    async with async_session() as session:
        service = GamificationService(session)
        login_result = await service.update_login_streak(user_id)
        await session.commit()
        return login_result


async def _update_review_streak(user_id: str) -> dict:
    async with async_session() as session:
        service = GamificationService(session)
        result = await service.update_review_streak(user_id)
        await session.commit()
        return result


async def _update_workout_streak(user_id: str) -> dict:
    async with async_session() as session:
        service = GamificationService(session)
        result = await service.update_workout_streak(user_id)
        await session.commit()
        return result


async def _check_badges(user_id: str) -> list[str]:
    async with async_session() as session:
        service = GamificationService(session)
        new_badges = await service.check_and_award_badges(user_id)
        await session.commit()
        return new_badges


@app.task(name="streak.update", bind=True, max_retries=3, default_retry_delay=5, autoretry_for=(Exception,))
def streak_update_task(self, user_id: str) -> dict:
    return run_async(_update_streaks(user_id))


@app.task(name="streak.update_review", bind=True, max_retries=3, default_retry_delay=5, autoretry_for=(Exception,))
def streak_update_review_task(self, user_id: str) -> dict:
    return run_async(_update_review_streak(user_id))


@app.task(name="streak.update_workout", bind=True, max_retries=3, default_retry_delay=5, autoretry_for=(Exception,))
def streak_update_workout_task(self, user_id: str) -> dict:
    return run_async(_update_workout_streak(user_id))


@app.task(name="gamification.check_badges", bind=True, max_retries=3, default_retry_delay=5, autoretry_for=(Exception,))
def check_badges_task(self, user_id: str) -> list[str]:
    return run_async(_check_badges(user_id))
