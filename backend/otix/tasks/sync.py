"""Provider sync tasks.

Each task wraps an async pipeline in asyncio.run(). Celery workers are
synchronous, but the provider pipeline is fully async internally.
"""

from __future__ import annotations

import asyncio

import structlog
from sqlalchemy import select

from otix.domain.media import ExternalID, MediaItem
from otix.domain.sync import SyncJob
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session_factory
from otix.infrastructure.redis import get_redis
from otix.lib.metrics import SYNC_ENTITIES_TOTAL, track_entity_duration
from otix.providers.tmdb.client import TMDBProvider
from otix.providers.tmdb.hydrator import TMDBHydrator
from otix.providers.tmdb.transformer import to_movie, to_show

logger = structlog.get_logger()


def run_async(coro):
    """Run an async coroutine with a fresh event loop (safe for Celery retries)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@app.task(
    name="sync.tmdb.movie",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    queue="tmdb",
)
def sync_tmdb_movie_task(self, tmdb_id: int, priority: int = 5) -> dict | None:
    """Sync a single TMDB movie: fetch → transform → upsert → hydrate."""
    return run_async(_sync_tmdb_movie(tmdb_id, priority, self.request.id))


@app.task(
    name="sync.tmdb.show",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    queue="tmdb",
)
def sync_tmdb_show_task(self, tmdb_id: int, priority: int = 5) -> dict | None:
    """Sync a single TMDB show with seasons and episodes."""
    return run_async(_sync_tmdb_show(tmdb_id, priority, self.request.id))


@app.task(
    name="sync.tmdb.popular_movies",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="tmdb",
)
def sync_tmdb_popular_movies_task(self, pages: int = 5) -> dict:
    """Sync popular movies (first N pages). Enqueues individual movie tasks."""
    return run_async(_sync_tmdb_popular("movie", pages))


@app.task(
    name="sync.tmdb.popular_shows",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="tmdb",
)
def sync_tmdb_popular_shows_task(self, pages: int = 5) -> dict:
    """Sync popular shows (first N pages). Enqueues individual show tasks."""
    return run_async(_sync_tmdb_popular("show", pages))


# ── Async implementations ────────────────────────────────────────


async def _sync_tmdb_movie(tmdb_id: int, priority: int, task_id: str | None) -> dict | None:
    with track_entity_duration("tmdb", "movie"):
        async with async_session_factory() as session:
            redis = await get_redis()

            provider = TMDBProvider(redis)
            hydrator = TMDBHydrator(provider, session)

            raw = await provider.get_movie(tmdb_id)
            movie = to_movie(raw)
            media_item = movie.media_item

            existing = await session.scalar(
                select(MediaItem)
                .join(ExternalID)
                .where(
                    ExternalID.provider == "tmdb",
                    ExternalID.external_id == str(tmdb_id),
                )
            )
            if existing:
                media_item.id = existing.id
                await session.merge(media_item)
            else:
                session.add(media_item)
                await session.flush()
                session.add(
                    ExternalID(provider="tmdb", external_id=str(tmdb_id), media_item_id=media_item.id)
                )

            session.add(movie)

            await hydrator.hydrate_genres(media_item, raw)
            await hydrator.hydrate_credits(media_item, raw)
            await hydrator.hydrate_images(media_item, raw)
            await hydrator.hydrate_ratings(media_item, raw)
            await hydrator.hydrate_external_ids(media_item, raw)
            await hydrator.hydrate_collection(movie, raw)

            await session.commit()

            logger.info("tmdb movie synced", tmdb_id=tmdb_id, otix_id=media_item.id)
            SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type="movie", status="success")
            return {"otix_id": media_item.id, "title": media_item.title, "tmdb_id": tmdb_id}


async def _sync_tmdb_show(tmdb_id: int, priority: int, task_id: str | None) -> dict | None:
    with track_entity_duration("tmdb", "show"):
        async with async_session_factory() as session:
            redis = await get_redis()

            provider = TMDBProvider(redis)
            hydrator = TMDBHydrator(provider, session)

            raw = await provider.get_show(tmdb_id)
            show = to_show(raw)
            media_item = show.media_item

            existing = await session.scalar(
                select(MediaItem)
                .join(ExternalID)
                .where(
                    ExternalID.provider == "tmdb",
                    ExternalID.external_id == str(tmdb_id),
                )
            )
            if existing:
                media_item.id = existing.id
                await session.merge(media_item)
            else:
                session.add(media_item)
                await session.flush()
                session.add(
                    ExternalID(provider="tmdb", external_id=str(tmdb_id), media_item_id=media_item.id)
                )

            session.add(show)

            await hydrator.hydrate_genres(media_item, raw)
            await hydrator.hydrate_credits(media_item, raw)
            await hydrator.hydrate_images(media_item, raw)
            await hydrator.hydrate_ratings(media_item, raw)
            await hydrator.hydrate_external_ids(media_item, raw)

            await session.commit()

            logger.info("tmdb show synced", tmdb_id=tmdb_id, otix_id=media_item.id)
            SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type="show", status="success")
            return {"otix_id": media_item.id, "title": media_item.title, "tmdb_id": tmdb_id}


async def _sync_tmdb_popular(media_type: str, pages: int) -> dict:
    redis = await get_redis()
    total = 0

    provider = TMDBProvider(redis)

    for page in range(1, pages + 1):
        if media_type == "movie":
            data = await provider.get_movie_popular(page=page)
        else:
            data = await provider.get_show_popular(page=page)

        for item in data.get("results", []):
            tmdb_id = item["id"]
            task_name = f"sync.tmdb.{media_type}"
            app.send_task(task_name, args=[tmdb_id])
            total += 1

    logger.info("popular sync enqueued", media_type=media_type, pages=pages, tasks_enqueued=total)
    return {"media_type": media_type, "tasks_enqueued": total}
