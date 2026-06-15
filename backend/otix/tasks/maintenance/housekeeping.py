# TODO: Review this file
"""Token cleanup, progress summary, embeddings backfill, search gap report, VACUUM."""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import urlparse

import structlog
from sqlalchemy import delete, func, select, text

from otix.domain.media import MediaItem
from otix.domain.people import MediaCredit, Person
from otix.domain.user import RefreshToken
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async
from otix.lib.progress import snapshot_and_reset as _progress_snapshot

logger = structlog.get_logger()


@app.task(name="maintenance.cleanup_expired_tokens")
def cleanup_expired_tokens() -> dict:
    """Remove expired refresh tokens from the database."""
    return run_async(_cleanup_expired_tokens())


async def _cleanup_expired_tokens() -> dict:
    async with async_session() as session:
        now = datetime.now(UTC)
        result = await session.execute(delete(RefreshToken).where(RefreshToken.expires_at < now))
        await session.commit()
        count = result.rowcount
        if count:
            logger.info("expired refresh tokens cleaned up", count=count)
        return {"deleted": count}


@app.task(name="maintenance.progress_summary")
def progress_summary() -> dict:
    """Log a periodic summary of sync activity, queue depths, and DB counts.

    Runs every 60s via Celery beat. Reads and resets the Redis progress
    counters atomically so each window is independent. Silent when idle.
    """
    return run_async(_progress_summary())


async def _progress_summary() -> dict:
    counters = await _progress_snapshot()

    if not counters:
        return {"status": "idle"}

    # Compute per-second rates (window is always 60s)
    window_s = 60
    rated = {}
    for k, v in counters.items():
        rated[f"{k}_rate"] = round(v / window_s, 1)

    # Queue depths
    broker_url = settings.celery_broker
    parsed = urlparse(broker_url)
    broker_redis_url = f"redis://{parsed.hostname}:{parsed.port}/0"

    import redis.asyncio as aioredis

    r = aioredis.from_url(broker_redis_url, decode_responses=True)
    try:
        fast_depth = await r.llen("reactive-fast") or 0
        user_depth = await r.llen("reactive-user") or 0
        control_depth = await r.llen("maintain") or 0
    finally:
        await r.aclose()

    # DB counts per media type
    async with async_session() as session:
        movie_count = await session.scalar(
            select(func.count()).select_from(MediaItem).where(MediaItem.media_type == "movie")
        )
        show_count = await session.scalar(
            select(func.count()).select_from(MediaItem).where(MediaItem.media_type == "show")
        )
        game_count = await session.scalar(
            select(func.count()).select_from(MediaItem).where(MediaItem.media_type == "game")
        )
        music_count = await session.scalar(
            select(func.count()).select_from(MediaItem).where(MediaItem.media_type == "music")
        )
        person_count = await session.scalar(select(func.count()).select_from(Person))

    logger.info(
        "progress summary",
        window_s=window_s,
        **counters,
        **rated,
        db_movies=movie_count or 0,
        db_shows=show_count or 0,
        db_games=game_count or 0,
        db_music=music_count or 0,
        db_people=person_count or 0,
        fast_queue=fast_depth,
        user_queue=user_depth,
        control_queue=control_depth,
    )

    return {
        "counters": counters,
        "db_movies": movie_count,
        "db_shows": show_count,
        "db_games": game_count,
        "db_music": music_count,
        "db_people": person_count,
        "fast_queue": fast_depth,
        "user_queue": user_depth,
        "control_queue": control_depth,
    }


@app.task(name="maintenance.backfill_embeddings")
def backfill_embeddings() -> dict:
    """Enqueue batch embedding generation for items that lack one.

    Runs periodically as a safety net until all items have embeddings.
    Items are grouped into batches for efficient inference.
    """
    return run_async(_backfill_embeddings())


_BACKFILL_BATCH_SIZE = 10


async def _backfill_embeddings() -> dict:
    from sqlalchemy import select

    from otix.domain.media import MediaItem

    async with async_session() as session:
        result = await session.execute(select(MediaItem.id).where(MediaItem.embedding.is_(None)).limit(1000))
        rows = result.all()

        all_ids = [row[0] for row in rows]
        enqueued = 0
        for i in range(0, len(all_ids), _BACKFILL_BATCH_SIZE):
            batch = all_ids[i : i + _BACKFILL_BATCH_SIZE]
            app.send_task("embedding.generate_batch", args=[batch])
            enqueued += len(batch)

        if enqueued:
            logger.info(
                "backfill_embeddings: enqueued batch tasks",
                count=enqueued,
                batches=len(all_ids) // _BACKFILL_BATCH_SIZE + 1,
            )

    return {"enqueued": enqueued}


@app.task(name="maintenance.backfill_user_embeddings")
def backfill_user_embeddings() -> dict:
    """Enqueue batch embedding generation for users that lack one."""
    return run_async(_backfill_user_embeddings())


async def _backfill_user_embeddings() -> dict:
    from sqlalchemy import select
    from otix.domain.user import User

    async with async_session() as session:
        result = await session.execute(select(User.id).where(User.embedding.is_(None)).limit(1000))
        rows = result.all()

        all_ids = [row[0] for row in rows]
        enqueued = 0
        for i in range(0, len(all_ids), _BACKFILL_BATCH_SIZE):
            batch = all_ids[i : i + _BACKFILL_BATCH_SIZE]
            app.send_task("embedding.generate_user_batch", args=[batch])
            enqueued += len(batch)

        if enqueued:
            logger.info(
                "backfill_user_embeddings: enqueued batch tasks",
                count=enqueued,
                batches=len(all_ids) // _BACKFILL_BATCH_SIZE + 1,
            )

    return {"enqueued": enqueued}


@app.task(name="maintenance.backfill_person_embeddings")
def backfill_person_embeddings() -> dict:
    """Enqueue batch embedding generation for people that lack one."""
    return run_async(_backfill_person_embeddings())


async def _backfill_person_embeddings() -> dict:
    from sqlalchemy import select
    from otix.domain.people import Person

    async with async_session() as session:
        result = await session.execute(select(Person.id).where(Person.embedding.is_(None)).limit(1000))
        rows = result.all()

        all_ids = [row[0] for row in rows]
        enqueued = 0
        for i in range(0, len(all_ids), _BACKFILL_BATCH_SIZE):
            batch = all_ids[i : i + _BACKFILL_BATCH_SIZE]
            app.send_task("embedding.generate_person_batch", args=[batch])
            enqueued += len(batch)

        if enqueued:
            logger.info(
                "backfill_person_embeddings: enqueued batch tasks",
                count=enqueued,
                batches=len(all_ids) // _BACKFILL_BATCH_SIZE + 1,
            )

    return {"enqueued": enqueued}


@app.task(name="maintenance.backfill_company_embeddings")
def backfill_company_embeddings() -> dict:
    """Enqueue batch embedding generation for companies that lack one."""
    return run_async(_backfill_company_embeddings())


async def _backfill_company_embeddings() -> dict:
    from sqlalchemy import select
    from otix.domain.company import Company

    async with async_session() as session:
        result = await session.execute(select(Company.id).where(Company.embedding.is_(None)).limit(1000))
        rows = result.all()

        all_ids = [row[0] for row in rows]
        enqueued = 0
        for i in range(0, len(all_ids), _BACKFILL_BATCH_SIZE):
            batch = all_ids[i : i + _BACKFILL_BATCH_SIZE]
            app.send_task("embedding.generate_company_batch", args=[batch])
            enqueued += len(batch)

        if enqueued:
            logger.info(
                "backfill_company_embeddings: enqueued batch tasks",
                count=enqueued,
                batches=len(all_ids) // _BACKFILL_BATCH_SIZE + 1,
            )

    return {"enqueued": enqueued}


@app.task(name="maintenance.search_gap_report")
def search_gap_report() -> dict:
    """Analyze search_logs for zero/low-result queries from the last 24h."""
    return run_async(_search_gap_report())


async def _search_gap_report() -> dict:
    from sqlalchemy import func, select, text

    from otix.domain.search_log import SearchLog
    from otix.infrastructure.database import async_session

    cutoff = func.now() - text("INTERVAL '24 hours'")

    async with async_session() as session:
        # Top 20 zero-result queries (bot searches only)
        zero_q = (
            select(
                SearchLog.query,
                SearchLog.media_type,
                func.count().label("search_count"),
            )
            .where(
                SearchLog.result_count == 0,
                SearchLog.created_at >= cutoff,
                SearchLog.is_bot.is_(True),
            )
            .group_by(SearchLog.query, SearchLog.media_type)
            .order_by(func.count().desc())
            .limit(20)
        )
        zero_result = (await session.execute(zero_q)).all()

        # Top 20 popular queries (all users)
        popular_q = (
            select(
                SearchLog.query,
                SearchLog.media_type,
                func.count().label("search_count"),
                func.avg(SearchLog.result_count).label("avg_results"),
            )
            .where(SearchLog.created_at >= cutoff)
            .group_by(SearchLog.query, SearchLog.media_type)
            .order_by(func.count().desc())
            .limit(20)
        )
        popular = (await session.execute(popular_q)).all()

        # Aggregate counts
        total_searches = await session.scalar(
            select(func.count()).select_from(SearchLog).where(SearchLog.created_at >= cutoff)
        )
        zero_total = await session.scalar(
            select(func.count())
            .select_from(SearchLog)
            .where(
                SearchLog.result_count == 0,
                SearchLog.created_at >= cutoff,
            )
        )
        backfill_total = await session.scalar(
            select(func.count())
            .select_from(SearchLog)
            .where(
                SearchLog.backfill_triggered.is_(True),
                SearchLog.created_at >= cutoff,
            )
        )

    report = {
        "window_hours": 24,
        "total_searches": total_searches or 0,
        "zero_result_searches": zero_total or 0,
        "backfill_triggers": backfill_total or 0,
        "zero_result_queries": [dict(r._mapping) for r in zero_result[:10]],
        "popular_queries": [dict(r._mapping) for r in popular[:10]],
    }

    logger.info("search_gap_report", **report)
    return report


# ── Periodic VACUUM ──────────────────────────────────────────────────────


@app.task(name="maintenance.vacuum_high_churn_tables")
def vacuum_high_churn_tables() -> dict:
    """Vacuum tables that experience heavy DELETE+INSERT churn from sync tasks.

    Runs every hour to keep dead tuple ratios low. Uses VACUUM (not FULL)
    so the tables remain available for reads/writes.
    """
    return run_async(_vacuum_high_churn_tables())


async def _vacuum_high_churn_tables() -> dict:
    HIGH_CHURN_TABLES = [
        "media_credits",
        "external_ids",
        "external_ratings",
        "media_genres",
        "media_releases",
        "media_videos",
        "media_platforms",
    ]

    async with async_session() as session:
        for table in HIGH_CHURN_TABLES:
            await session.execute(text(f"VACUUM ANALYZE {table}"))
        await session.commit()

    logger.info("periodic_vacuum_complete", tables=HIGH_CHURN_TABLES)
    return {"vacuumed": HIGH_CHURN_TABLES}


@app.task(name="maintenance.cleanup_orphan_credits")
def cleanup_orphan_credits() -> dict:
    """Remove MediaCredit rows whose person_id no longer exists in the people table.

    These orphans can occur when the FK constraint on media_credits.person_id
    was added after the table was created, leaving stale references to deleted
    Person records. They surface as "Person not found" 404 errors in the UI.
    """
    return run_async(_cleanup_orphan_credits())


async def _cleanup_orphan_credits() -> dict:
    from sqlalchemy import delete, select

    from otix.infrastructure.database import async_session

    async with async_session() as session:
        # Find orphaned credits
        orphaned = await session.scalars(select(MediaCredit.id).where(~MediaCredit.person_id.in_(select(Person.id))))
        orphan_ids = list(orphaned.all())

        if not orphan_ids:
            return {"deleted": 0}

        # Delete them
        result = await session.execute(delete(MediaCredit).where(MediaCredit.id.in_(orphan_ids)))
        await session.commit()

        count = result.rowcount
        logger.warning(
            "cleaned up orphaned media credits",
            count=count,
        )

    return {"deleted": count}
