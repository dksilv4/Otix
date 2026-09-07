# TODO: Review this file
"""Fanart image enrichment task."""

from __future__ import annotations

import structlog

from otix.domain.media import MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.providers.fanart.client import FanartProvider
from otix.providers.fanart.hydrator import FanartHydrator

logger = structlog.get_logger()

_FANART_HYDRATE_METHODS = {
    "movie": "hydrate_movie_images",
    "show": "hydrate_show_images",
    "music": "hydrate_music_images",
}


@app.task(
    name="sync.fanart.enrich",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def sync_fanart_enrich_task(self, media_type: str, media_item_id: str) -> dict | None:
    """Fetch Fanart images for a media item and store as MediaAsset rows."""
    return run_async(_sync_fanart_enrich(media_type, media_item_id))


async def _sync_fanart_enrich(media_type: str, media_item_id: str) -> dict | None:
    method_name = _FANART_HYDRATE_METHODS.get(media_type)
    if method_name is None:
        logger.warning("fanart enrich called with unsupported media_type", media_type=media_type)
        return None

    async with async_session() as session:
        media_item = await session.get(MediaItem, media_item_id)
        if media_item is None:
            return None

        redis = await get_redis()
        provider = FanartProvider(redis)
        hydrator = FanartHydrator(provider, session)

        added = await getattr(hydrator, method_name)(media_item)
        await session.commit()

        if added:
            logger.info("fanart images added",
                title=media_item.title, media_type=media_type, otix_id=media_item_id,
            )
        else:
            logger.debug("fanart — no new assets",
                title=media_item.title, otix_id=media_item_id,
            )
        await _progress_incr("fanart_enqueued")
        return {"otix_id": media_item_id, "added": added}
