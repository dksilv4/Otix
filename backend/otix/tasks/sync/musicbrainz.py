# TODO: Review this file
"""MusicBrainz album sync task."""

from __future__ import annotations

from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from otix.domain.base import flush_pending_external_ids
from otix.domain.media import Album, ExternalID, MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.providers.musicbrainz.client import MusicBrainzProvider
from otix.providers.musicbrainz.hydrator import MusicBrainzHydrator
from otix.providers.musicbrainz.transformer import to_album
from otix.services.external_id_service import ExternalIDService

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
        eid_svc = ExternalIDService(session)
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
        existing_item: MediaItem | None = None

        from otix.services.embedding_service import is_embedding_stale

        if ext_id is not None:
            existing_item = await session.get(MediaItem, ext_id.media_item_id)
            if existing_item is not None:
                old_overview = existing_item.overview
                existing_item.title = item.title
                existing_item.overview = item.overview or existing_item.overview
                if is_embedding_stale(old_overview, existing_item.overview):
                    existing_item.embedding = None
                existing_item.poster_url = item.poster_url or existing_item.poster_url
                existing_item.release_date = item.release_date or existing_item.release_date
                # Detach MB-generated tracks from their album to prevent cascade
                # insert of the transient album during autoflush.
                mb_tracks = list(album.tracks)
                album.tracks = []
                for t in mb_tracks:
                    t.album = None
                    t.album_id = existing_item.id
                album._mb_tracks = mb_tracks  # stash for hydrator
                album.media_item_id = existing_item.id
                item = existing_item
            else:
                item.album = None
                item.id = ext_id.media_item_id
                item = await session.merge(item)
                album.media_item = item
                await session.flush()
                ext_id = await ExternalIDService(session).upsert(
                    "musicbrainz", str(mbid),
                    "media_item", item.id,
                )
        else:
            session.add(item)
            await session.flush()
            ext_id = await ExternalIDService(session).upsert(
                "musicbrainz", str(mbid),
                "media_item", item.id,
            )
            ext_id.content_hash = content_hash

        album.media_item_id = item.id

        existing_album = await session.get(Album, item.id)
        if existing_album is not None:
            existing_album.release_type = album.release_type
            existing_album.track_count = album.track_count
            existing_album.disc_count = album.disc_count
            existing_album.duration_ms = album.duration_ms
            await eid_svc.upsert("musicbrainz", str(mbid), "media_item", existing_album.media_item_id)
            if album.catalog_number:
                existing_album.catalog_number = album.catalog_number
            if album.barcode:
                existing_album.barcode = album.barcode
        else:
            session.add(album)

        hydrator = MusicBrainzHydrator(provider, session)
        if ext_id is not None and existing_item is not None:
            # For existing items, skip track hydration (tracks were seeded by Deezer
            # with ISRCs). Only hydrate artists, labels, genres, and cover art.
            await hydrator.hydrate_artists(album, raw)
            await hydrator.hydrate_labels(album, raw)
            await hydrator.hydrate_genres(album, raw)
            await hydrator.hydrate_cover_art(album, raw)
        else:
            await hydrator.hydrate_all(album, raw)

        # Flush ExternalID records set via descriptors on detached objects
        await flush_pending_external_ids(album, session)
        for t in album.tracks:
            await flush_pending_external_ids(t, session)

        # Save all URL relationship external IDs (Spotify, YouTube Music, Apple Music, etc.)
        await _upsert_url_external_ids(session, item.id, getattr(album, "_url_external_ids", []))

        # Save barcode as ExternalID if present
        barcode = getattr(album, "_barcode", None)
        if barcode:
            await _upsert_url_external_ids(session, item.id, [("barcode", barcode)])

        item.content_hash = content_hash
        item.synced_at = datetime.now(UTC)
        item.next_sync_at = compute_next_sync_at("album", raw, 0)
        await session.commit()

        logger.info("musicbrainz album synced", title=item.title, media_type="music", otix_id=item.id, mbid=mbid)
        await _progress_incr("musicbrainz_enqueued")

        # Chain enrichments (no Spotify catalog tasks)
        app.send_task("sync.deezer.enrich_cover", args=[item.id], priority=7)
        app.send_task("sync.theaudiodb.enrich_album", args=[item.id], priority=6)
        app.send_task("sync.lrclib.enrich_album", args=[item.id], priority=6)
        app.send_task("sync.lastfm.enrich_album", args=[item.id])
        app.send_task("sync.fanart.enrich", args=["music", item.id])

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
            index_elements=["provider", "external_id", "entity_type"]
        )
    )


@app.task(
    name="sync.musicbrainz.match_by_isrc",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_musicbrainz_match_by_isrc_task(self, otix_id: str, isrcs: list[str]) -> dict | None:
    """Find the MusicBrainz release via track ISRCs and sync cross-platform IDs.

    Called after a Deezer or Spotify seed to harvest all 15+ external platform IDs
    from MusicBrainz URL relationships.
    """
    return run_async(_sync_musicbrainz_match_by_isrc(otix_id, isrcs))


async def _sync_musicbrainz_match_by_isrc(otix_id: str, isrcs: list[str]) -> dict | None:
    import asyncio

    if not isrcs:
        return None

    redis = await get_redis()
    provider = MusicBrainzProvider(redis)

    async with async_session() as session:
        eid_svc = ExternalIDService(session)
        album = await session.get(Album, otix_id)
        if album is None:
            return None

        # Phase 1: Look up all ISRCs in parallel (max 5)
        async def _fetch_isrc(isrc: str) -> list[dict]:
            try:
                resp = await provider._get(f"isrc/{isrc}")
                recs = resp.get("recordings", [])
                return recs if isinstance(recs, list) else []
            except Exception:
                return []

        isrc_results = await asyncio.gather(
            *[_fetch_isrc(isrc) for isrc in isrcs[:5]]
        )

        # Collect recording IDs (up to 3 per ISRC)
        all_recording_ids: list[str] = []
        for recordings in isrc_results:
            for recording in recordings[:3]:
                rid = recording.get("id")
                if rid:
                    all_recording_ids.append(str(rid))

        # Phase 2: Look up all recordings in parallel
        async def _fetch_recording(recording_id: str) -> list[tuple[str, str]]:
            try:
                rec_resp = await provider._get(
                    f"recording/{recording_id}", {"inc": "releases"}
                )
                releases = rec_resp.get("releases", [])
                results = []
                if isinstance(releases, list):
                    for rel in releases:
                        rg = rel.get("release-group", {}) if isinstance(rel.get("release-group"), dict) else {}
                        rg_type = rg.get("primary-type", "") if isinstance(rg, dict) else ""
                        rel_id = rel.get("id")
                        if rel_id:
                            results.append((str(rel_id), rg_type))
                return results
            except Exception:
                return []

        rec_results = await asyncio.gather(
            *[_fetch_recording(rid) for rid in all_recording_ids[:15]]
        )

        # Flatten candidates
        candidates: list[tuple[str, str]] = []
        for results in rec_results:
            candidates.extend(results)

        # Prefer album/EP over single/other
        mbid = None
        if candidates:
            type_rank = {"Album": 0, "EP": 1, "Single": 2, "": 3}
            candidates.sort(key=lambda x: type_rank.get(x[1] or "", 3))
            mbid = candidates[0][0]

        if not mbid:
            logger.info("musicbrainz isrc match: no release found", otix_id=otix_id, isrcs=isrcs[:3])
            return None

        # Run full MB sync to get all URL relationships + cross-platform IDs.
        # Create the musicbrainz ExternalID so the album sync task finds our
        # existing media item and merges instead of creating a duplicate.
        await eid_svc.upsert("musicbrainz", str(mbid), "media_item", album.media_item_id)
        await session.commit()

    # Dispatch the full MB album sync (which will populate ExternalIDs)
    app.send_task("sync.musicbrainz.album", args=[str(mbid)], priority=7)
    logger.info("musicbrainz isrc match: found release", otix_id=otix_id, mbid=mbid)
    return {"otix_id": otix_id, "mbid": mbid, "matched_by": "isrc"}


@app.task(
    name="sync.musicbrainz.match_by_barcode",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_musicbrainz_match_by_barcode_task(self, otix_id: str, barcode: str) -> dict | None:
    """Find the MusicBrainz release via barcode/UPC and sync cross-platform IDs."""
    return run_async(_sync_musicbrainz_match_by_barcode(otix_id, barcode))


async def _sync_musicbrainz_match_by_barcode(otix_id: str, barcode: str) -> dict | None:
    if not barcode:
        return None

    redis = await get_redis()
    provider = MusicBrainzProvider(redis)

    async with async_session() as session:
        eid_svc = ExternalIDService(session)
        album = await session.get(Album, otix_id)
        if album is None:
            return None

        mbid = None
        try:
            resp = await provider._get("release", {"query": f"barcode:{barcode}", "limit": 5})
            releases = resp.get("releases", [])
            if isinstance(releases, list) and releases:
                mbid = releases[0].get("id")
        except Exception:
            pass

        if not mbid:
            logger.info("musicbrainz barcode match: no release found", otix_id=otix_id, barcode=barcode)
            return None

        await eid_svc.upsert("musicbrainz", str(mbid), "media_item", album.media_item_id)
        await session.commit()

    app.send_task("sync.musicbrainz.album", args=[str(mbid)], priority=7)
    logger.info("musicbrainz barcode match: found release", otix_id=otix_id, mbid=mbid)
    return {"otix_id": otix_id, "mbid": mbid, "matched_by": "barcode"}
