"""Music-specific maintenance tasks.

Backfill poster_url from Fanart/MediaAsset poster assets so music items
show up in discover lists that filter by `has_artwork`.
"""

from __future__ import annotations

import structlog
from sqlalchemy import text

from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async

logger = structlog.get_logger()

BATCH_SIZE = 200


@app.task(name="maintenance.backfill_music_poster_url")
def backfill_music_poster_url() -> dict:
    """Backfill media_items.poster_url from Fanart poster MediaAssets.

    Runs until all music items that have a Fanart poster asset have their
    poster_url populated. Idempotent — skips items that already have one.
    Uses batched updates (BATCH_SIZE per round) to avoid pgbouncer
    connection timeouts on large transactional updates.
    """
    return run_async(_backfill_music_poster_url())


async def _backfill_music_poster_url() -> dict:
    total_poster = 0
    total_backdrop = 0

    # --- Batch poster_url fill ---
    while True:
        async with async_session() as session:
            result = await session.execute(
                text("""
                    UPDATE media_items mi
                    SET poster_url = (
                        SELECT ma.url FROM media_assets ma
                        WHERE ma.media_item_id = mi.id
                          AND ma.asset_type IN ('poster', 'albumcover')
                          AND ma.url IS NOT NULL
                        ORDER BY ma.width DESC LIMIT 1
                    )
                    WHERE mi.id IN (
                        SELECT mi2.id FROM media_items mi2
                        WHERE mi2.media_type = 'music'
                          AND mi2.poster_url IS NULL
                          AND EXISTS (
                            SELECT 1 FROM media_assets ma
                            WHERE ma.media_item_id = mi2.id
                              AND ma.asset_type IN ('poster', 'albumcover')
                              AND ma.url IS NOT NULL
                            LIMIT 1
                          )
                        LIMIT :batch
                    )
                """),
                {"batch": BATCH_SIZE},
            )
            cnt = result.rowcount
            await session.commit()
            if cnt == 0:
                break
            total_poster += cnt

    # --- Batch backdrop_url fill ---
    while True:
        async with async_session() as session:
            result = await session.execute(
                text("""
                    UPDATE media_items mi
                    SET backdrop_url = (
                        SELECT ma.url FROM media_assets ma
                        WHERE ma.media_item_id = mi.id
                          AND ma.asset_type = 'backdrop'
                          AND ma.url IS NOT NULL
                        ORDER BY ma.width DESC LIMIT 1
                    )
                    WHERE mi.id IN (
                        SELECT mi2.id FROM media_items mi2
                        WHERE mi2.media_type = 'music'
                          AND mi2.backdrop_url IS NULL
                          AND EXISTS (
                            SELECT 1 FROM media_assets ma
                            WHERE ma.media_item_id = mi2.id
                              AND ma.asset_type = 'backdrop'
                              AND ma.url IS NOT NULL
                            LIMIT 1
                          )
                        LIMIT :batch
                    )
                """),
                {"batch": BATCH_SIZE},
            )
            cnt = result.rowcount
            await session.commit()
            if cnt == 0:
                break
            total_backdrop += cnt

    logger.info(
        "music artwork backfill complete",
        poster_urls_filled=total_poster,
        backdrop_urls_filled=total_backdrop,
    )

    # Check remaining gap
    async with async_session() as session:
        remaining = await session.scalar(
            text("SELECT count(*) FROM media_items WHERE media_type = 'music' AND poster_url IS NULL")
        )
        total_result = await session.scalar(
            text("SELECT count(*) FROM media_items WHERE media_type = 'music'")
        )

    logger.info(
        "music poster_url coverage",
        remaining_without_poster=remaining or 0,
        total_music_items=total_result or 0,
    )

    return {
        "poster_urls_filled": total_poster,
        "backdrop_urls_filled": total_backdrop,
        "remaining_without_poster": remaining or 0,
    }
