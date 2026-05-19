"""MusicBrainz album sync task."""

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from otix.domain.media import Album, ExternalID, MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.providers.musicbrainz.client import MusicBrainzProvider
from otix.providers.musicbrainz.hydrator import MusicBrainzHydrator
from otix.providers.musicbrainz.transformer import to_album

from ._common import compute_content_hash, compute_next_sync_at

logger = structlog.get_logger()


@app.task(
    name="sync.musicbrainz.album",
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def sync_musicbrainz_album_task(self, mbid: str, force: bool = False) -> dict | None:
    """Sync an album from MusicBrainz by MBID."""
    return run_async(_sync_musicbrainz_album(mbid, force))


async def _sync_musicbrainz_album(mbid: str, force: bool = False) -> dict | None:
    async with async_session() as session:
        ext_id = await session.scalar(
            select(ExternalID).where(ExternalID.provider == "musicbrainz", ExternalID.external_id == mbid)
        )

        redis = await get_redis()
        provider = MusicBrainzProvider(redis)

        raw = await provider.get_release(mbid)
        if not raw or not raw.get("id"):
            logger.warning("musicbrainz release not found", mbid=mbid)
            return None

        content_hash = compute_content_hash({"title": raw.get("title"), "id": raw.get("id")})
        if ext_id is not None and not force and ext_id.content_hash == content_hash:
            ext_id.hash_match_count += 1
            await session.commit()
            logger.debug("hash matched, skipping musicbrainz album", mbid=mbid)
            return None

        album = to_album(raw)
        item = album.media_item

        if ext_id is not None:
            item.id = ext_id.media_item_id
            item.album = None
            item = await session.merge(item)
        else:
            session.add(item)
            await session.flush()
            ext_id = ExternalID(
                provider="musicbrainz", external_id=mbid,
                media_item_id=item.id, content_hash=content_hash,
            )
            session.add(ext_id)

        album.media_item_id = item.id

        existing_album = await session.get(Album, item.id)
        if existing_album is not None:
            existing_album.release_type = album.release_type
            existing_album.track_count = album.track_count
            existing_album.disc_count = album.disc_count
            existing_album.duration_ms = album.duration_ms
            existing_album.musicbrainz_id = album.musicbrainz_id
            if album.catalog_number:
                existing_album.catalog_number = album.catalog_number
            if album.barcode:
                existing_album.barcode = album.barcode
        else:
            session.add(album)

        hydrator = MusicBrainzHydrator(provider, session)
        await hydrator.hydrate_all(album, raw)

        # Save all URL relationship external IDs (Spotify, YouTube Music, Apple Music, etc.)
        await _upsert_url_external_ids(session, item.id, getattr(album, "_external_ids", []))

        item.content_hash = content_hash
        item.synced_at = datetime.now(timezone.utc)
        item.next_sync_at = compute_next_sync_at("album", raw, 0)
        await session.commit()

        logger.info("musicbrainz album synced", title=item.title, media_type="music", otix_id=item.id, mbid=mbid)
        await _progress_incr("musicbrainz_enqueued")

        if album.spotify_id:
            app.send_task("sync.spotify.enrich_album", args=[item.id, album.spotify_id])
        else:
            app.send_task("sync.spotify.match_album", args=[item.id])

        app.send_task("sync.lastfm.enrich_album", args=[item.id])
        app.send_task("sync.fanart.enrich", args=["music", item.id])
        app.send_task("embedding.generate", args=[item.id])

        return {"otix_id": item.id, "mbid": mbid, "title": item.title}


async def _upsert_url_external_ids(session, media_item_id: int, external_ids: list[tuple[str, str]]) -> None:
    """Insert ExternalID records for MusicBrainz url-rels, skipping existing."""
    if not external_ids:
        return
    rows = [
        {"provider": provider, "external_id": ext_id, "media_item_id": media_item_id, "media_type": "music"}
        for provider, ext_id in external_ids
    ]
    await session.execute(
        pg_insert(ExternalID.__table__).values(rows).on_conflict_do_nothing(
            index_elements=["provider", "external_id"]
        )
    )
