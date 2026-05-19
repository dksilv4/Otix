"""YouTube watch history sync tasks."""

from __future__ import annotations

import structlog

from sqlalchemy import select

from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async

logger = structlog.get_logger()


@app.task(
    name="sync.youtube.watch_history",
    bind=True,
    max_retries=1,
)
def sync_youtube_watch_history_task(self, user_id: str, task_id: str | None = None) -> dict | None:
    """Sync a user's YouTube watch history into Otix."""
    return run_async(_sync_youtube_watch_history(user_id, task_id))


async def _sync_youtube_watch_history(user_id: str, task_id: str | None = None) -> dict | None:
    from otix.services.youtube_sync_service import sync_youtube_watch_history

    async with async_session() as session:
        user = await session.get(User, user_id)
        if user is None or user.google_id is None:
            return None

        result = await sync_youtube_watch_history(session, user, task_id=task_id)
        await session.commit()
        return result
