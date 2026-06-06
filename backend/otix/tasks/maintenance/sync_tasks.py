# TODO: Review this file
"""Spotify, YouTube, and Plex user sync; catalog hydration sweep."""

from __future__ import annotations

from datetime import UTC, datetime

import structlog
from sqlalchemy import and_, or_, select

from otix.domain.media import ExternalID, MediaItem
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async

logger = structlog.get_logger()


@app.task(name="maintenance.sync_spotify_recently_played")
def sync_spotify_recently_played() -> dict:
    return run_async(_sync_spotify_recently_played())


async def _sync_spotify_recently_played() -> dict:
    from otix.infrastructure.celery import app as celery_app

    synced = 0
    failed = 0
    async with async_session() as session:
        users = list(
            (await session.scalars(select(User).where(User.spotify_refresh_token.isnot(None)).limit(200))).all()
        )
        for user in users:
            try:
                celery_app.send_task("sync.spotify.recently_played", args=[user.id])
                synced += 1
            except Exception:
                logger.exception("scheduled spotify recently played sync enqueue failed", user_id=user.id)
                failed += 1
    return {"synced": synced, "failed": failed}


@app.task(name="maintenance.sync_youtube_watch_history")
def sync_youtube_watch_history() -> dict:
    return run_async(_sync_youtube_watch_history())


async def _sync_youtube_watch_history() -> dict:
    from otix.infrastructure.celery import app as celery_app

    synced = 0
    failed = 0
    async with async_session() as session:
        users = list(
            (await session.scalars(select(User).where(User.google_refresh_token.isnot(None)).limit(200))).all()
        )
        for user in users:
            try:
                celery_app.send_task("sync.youtube.watch_history", args=[user.id])
                synced += 1
            except Exception:
                logger.exception("scheduled youtube watch history sync enqueue failed", user_id=user.id)
                failed += 1
    return {"synced": synced, "failed": failed}


@app.task(name="maintenance.plex_sync_user", acks_late=True, reject_on_worker_lost=True)
def plex_sync_user(task_id: str, user_id: str) -> dict:
    """Sync Plex libraries for a single user, publishing progress via Redis pub/sub.

    Called on-demand from the API. Runs on the fast queue so it starts immediately.
    """
    return run_async(_plex_sync_user(task_id, user_id))


async def _plex_sync_user(task_id: str, user_id: str) -> dict:
    from typing import Any

    from otix.lib.plex_progress import publish_progress, store_result
    from otix.services.plex_sync_service import sync_plex

    async def progress(event_type: str, **data: Any) -> None:
        try:
            await publish_progress(task_id, event_type, **data)
        except Exception:
            logger.exception("failed to publish plex sync progress", task_id=task_id, event_type=event_type)

    async with async_session() as session:
        user = await session.scalar(select(User).where(User.id == user_id))
        if not user:
            await progress("error", message="User not found")
            raise ValueError(f"User {user_id} not found")

        try:
            result = await sync_plex(session, user, progress=progress)
            await store_result(task_id, result)
            logger.info("plex sync completed for user", user_id=user_id, task_id=task_id, **result)
            return {"status": "success", **result}
        except Exception:
            await progress("error", message="Sync failed unexpectedly")
            raise


@app.task(name="maintenance.catalog_hydration")
def catalog_hydration() -> dict:
    """Background scan: find stale catalog items and re-enqueue provider syncs.

    Runs every 5 min. Walks MediaItems past their next_sync_at, oldest
    first, and enqueues the appropriate provider task. Small batch size
    keeps queue load low so user-facing operations take priority.
    """
    return run_async(_catalog_hydration())


_MEDIA_SYNC_MAP = {
    "movie": {"provider": "tmdb", "task": "sync.tmdb.movie"},
    "show": {"provider": "tmdb", "task": "sync.tmdb.show"},
    "game": {"provider": "igdb", "task": "sync.igdb.game"},
    "music": {"provider": "musicbrainz", "task": "sync.musicbrainz.album"},
}


async def _catalog_hydration() -> dict:
    now = datetime.now(UTC)
    provider_map = _MEDIA_SYNC_MAP

    async with async_session() as session:
        # Stale items (past their next_sync_at) or never-synced stubs (Plex-created, completeness <= 0.2)
        result = await session.execute(
            select(MediaItem.id, MediaItem.media_type, ExternalID.external_id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                or_(
                    and_(
                        MediaItem.next_sync_at.isnot(None),
                        MediaItem.next_sync_at < now,
                    ),
                    and_(
                        MediaItem.next_sync_at.is_(None),
                        MediaItem.completeness_score <= 0.2,
                    ),
                ),
                or_(
                    and_(
                        MediaItem.media_type.in_(["movie", "show"]),
                        ExternalID.provider == "tmdb",
                    ),
                    and_(
                        MediaItem.media_type == "game",
                        ExternalID.provider == "igdb",
                    ),
                    and_(
                        MediaItem.media_type == "music",
                        ExternalID.provider == "musicbrainz",
                    ),
                ),
            )
            .order_by(MediaItem.next_sync_at.asc().nullsfirst())
            .limit(50)
        )
        rows = result.all()

    if not rows:
        return {"stale_found": 0, "enqueued": 0}

    enqueued = 0
    seen: set[str] = set()
    for mi_id, mi_type, ext_id in rows:
        if mi_id in seen:
            continue
        seen.add(mi_id)

        entry = provider_map.get(mi_type)
        if entry is None:
            continue

        app.send_task(entry["task"], args=[int(ext_id) if ext_id.isdigit() else ext_id])
        enqueued += 1

    if enqueued:
        logger.info(
            "catalog hydration enqueued",
            stale_found=len(rows),
            enqueued=enqueued,
        )

    return {"stale_found": len(rows), "enqueued": enqueued}
