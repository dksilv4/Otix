# TODO: Review this file
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


