# TODO: Review this file
"""TheAudioDB album enrichment task — Tier 3 supplementary metadata.

Enriches albums with cross-platform IDs, artwork, and metadata from TheAudioDB.
Runs after Tier 1 (Deezer seed) or Tier 2 (MusicBrainz match).

Task:
    sync.theaudiodb.enrich_album(otix_id)
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
from otix.providers.theaudiodb.client import TheAudioDBProvider
from otix.providers.theaudiodb.hydrator import TheAudioDBHydrator

logger = structlog.get_logger()


@app.task(
    name="sync.theaudiodb.enrich_album",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_theaudiodb_enrich_album_task(self, otix_id: str) -> dict | None:
    """Enrich an album from TheAudioDB: cross-platform IDs, artwork, metadata."""
    return run_async(_sync_theaudiodb_enrich_album(otix_id))


async def _sync_theaudiodb_enrich_album(otix_id: str) -> dict | None:
    async with async_session() as session:
        album = await session.scalar(
            select(Album).options(joinedload(Album.media_item)).where(Album.media_item_id == otix_id)
        )
        if album is None:
            return None

        redis = await get_redis()
        provider = TheAudioDBProvider(redis)
        hydrator = TheAudioDBHydrator(provider, session)

        ids_added = await hydrator.hydrate_album(album)
        await session.commit()

        logger.info("theaudiodb album enriched",
            title=album.media_item.title,
            otix_id=otix_id,
            external_ids_added=ids_added,
        )
        await _progress_incr("theaudiodb_enqueued")
        return {"otix_id": otix_id, "external_ids_added": ids_added}
