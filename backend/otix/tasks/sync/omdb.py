# TODO: Review this file
"""OMDb rating enrichment task."""

from __future__ import annotations

import structlog

from otix.domain.media import MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.providers.omdb.client import OMDbProvider
from otix.providers.omdb.hydrator import OMDbHydrator

logger = structlog.get_logger()


@app.task(
    name="sync.omdb.ratings",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def sync_omdb_ratings_task(self, media_item_id: str) -> dict | None:
    """Fetch OMDb ratings for a movie/show and store as ExternalRating rows."""
    return run_async(_sync_omdb_ratings(media_item_id))


async def _sync_omdb_ratings(media_item_id: str) -> dict | None:
    async with async_session() as session:
        media_item = await session.get(MediaItem, media_item_id)
        if media_item is None:
            return None

        redis = await get_redis()
        provider = OMDbProvider(redis)
        hydrator = OMDbHydrator(provider, session)

        added = await hydrator.hydrate_ratings(media_item)
        await session.commit()

        if added:
            logger.info("omdb ratings updated",
                title=media_item.title, media_type=media_item.media_type, otix_id=media_item_id,
            )
        await _progress_incr("omdb_enqueued")
        return {"otix_id": media_item_id, "added": added}
