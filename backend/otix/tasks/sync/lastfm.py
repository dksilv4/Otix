# TODO: Review this file
"""Last.fm album enrichment task."""

from __future__ import annotations

import structlog
from sqlalchemy import select

from otix.domain.media import Album
from otix.domain.people import MediaCredit, Person
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.providers.lastfm.client import LastFMProvider
from otix.providers.lastfm.hydrator import LastFMHydrator

logger = structlog.get_logger()


@app.task(
    name="sync.lastfm.enrich_album",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_lastfm_enrich_album_task(self, otix_id: str) -> dict | None:
    """Enrich an album from Last.fm: wiki, tags, playcounts."""
    return run_async(_sync_lastfm_enrich_album(otix_id))


async def _sync_lastfm_enrich_album(otix_id: str) -> dict | None:
    async with async_session() as session:
        from sqlalchemy.orm import joinedload

        album = await session.scalar(
            select(Album).options(joinedload(Album.media_item)).where(Album.media_item_id == otix_id)
        )
        if album is None:
            return None

        credit = await session.scalar(
            select(Person.name)
            .join(MediaCredit, MediaCredit.person_id == Person.id)
            .where(MediaCredit.media_item_id == otix_id, MediaCredit.role == "primary")
        )
        artist_name = credit or ""

        redis = await get_redis()
        provider = LastFMProvider(redis)
        hydrator = LastFMHydrator(provider, session)

        await hydrator.hydrate_album(album, artist_name, album.media_item.title)
        await session.commit()

        logger.info("lastfm album enriched",
            title=album.media_item.title,
            artist=artist_name,
        )
        await _progress_incr("lastfm_enqueued")
        return {"otix_id": otix_id}
