# TODO: Review this file
"""LRCLIB lyrics enrichment task — Tier 3 supplementary metadata.

Fetches lyrics for album tracks from the free LRCLIB API.
Runs after MusicBrainz/TADB enrichment when track metadata is assembled.

Task:
    sync.lrclib.enrich_album(otix_id)
"""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from otix.domain.media import Album
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.providers.lrclib.client import LRCLIBProvider
from otix.providers.lrclib.hydrator import LRCLIBHydrator

logger = structlog.get_logger()


@app.task(
    name="sync.lrclib.enrich_album",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_lrclib_enrich_album_task(self, otix_id: str) -> dict | None:
    """Fetch lyrics for an album's tracks from LRCLIB."""
    return run_async(_sync_lrclib_enrich_album(otix_id))


async def _sync_lrclib_enrich_album(otix_id: str) -> dict | None:
    async with async_session() as session:
        album = await session.scalar(
            select(Album).options(joinedload(Album.media_item)).where(Album.media_item_id == otix_id)
        )
        if album is None:
            return None

        redis = await get_redis()
        provider = LRCLIBProvider(redis)
        hydrator = LRCLIBHydrator(provider, session)

        enriched = await hydrator.hydrate_album(album)
        await session.commit()

        logger.info("lrclib album enriched",
            title=album.media_item.title,
            otix_id=otix_id,
            tracks_enriched=enriched,
        )
        await _progress_incr("lrclib_enqueued")
        return {"otix_id": otix_id, "tracks_enriched": enriched}
