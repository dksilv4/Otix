# TODO: Review this file
"""Deezer album seeding task — Tier 1 fast ingestion.

Seed an album from the Deezer API (10 rps, free, no auth), then chain
into Tier 2 (MusicBrainz cross-platform IDs) and Tier 3 (TheAudioDB).

Flow:
    sync.deezer.seed_album(deezer_id)
        -> sync.musicbrainz.match_by_isrc  (Tier 2: cross-platform IDs)
        -> sync.theaudiodb.enrich_album    (Tier 3: supplementary)
        -> sync.lastfm.enrich_album
        -> sync.fanart.enrich
        -> embedding.generate
"""

from __future__ import annotations

import structlog
from sqlalchemy import select

from otix.domain.asset import MediaAsset
from otix.domain.media import Album, ExternalID, MediaItem, Track
from otix.services.external_id_service import ExternalIDService
from otix.domain.people import MediaCredit, Person
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.lib.task_guard import TaskGuard
from otix.providers.deezer.client import DeezerProvider
from otix.providers.deezer.transformer import _extract_cover_url, to_album

logger = structlog.get_logger()


@app.task(
    name="sync.deezer.seed_album",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_deezer_seed_album_task(self, deezer_id: str) -> dict | None:
    """Seed an album from Deezer by its ID, then chain enrichments."""
    return run_async(_sync_deezer_seed_album(deezer_id))


async def _sync_deezer_seed_album(deezer_id: str) -> dict | None:
    redis = await get_redis()
    guard = TaskGuard(redis, "deezer")

    if await guard.should_skip("seed_album", deezer_id):
        logger.info("deezer seed_album skipped: poison pill", deezer_id=deezer_id)
        return None

    if await guard.is_duplicate("seed_album", deezer_id):
        return {"skipped": True, "reason": "duplicate"}

    async with async_session() as session:
        # Check if already seeded
        existing = await session.scalar(
            select(ExternalID.media_item_id).where(
                ExternalID.provider == "deezer",
                ExternalID.external_id == str(deezer_id),
            )
        )
        if existing is not None:
            await guard.reset_failures("seed_album", deezer_id)
            return {"otix_id": existing, "deezer_id": deezer_id, "status": "already_exists"}

        provider = DeezerProvider(redis)

        try:
            raw = await provider.get_album(deezer_id)
            track_data = await provider.get_album_tracks(deezer_id)
        except Exception:
            await guard.record_failure("seed_album", deezer_id)
            logger.warning("deezer seed album fetch failed", deezer_id=deezer_id)
            return None

        if not raw or not raw.get("id"):
            await guard.record_failure("seed_album", deezer_id)
            return None

        # Build domain models from API data
        album = to_album(raw, track_data)
        item = album.media_item

        # Extract non-persisted attributes before clearing relationships
        deezer_id_str = getattr(album, "_deezer_id", str(deezer_id))
        upc = getattr(album, "_upc", None)
        deezer_artist_id = getattr(album, "_deezer_artist_id", None)
        genre_names = getattr(album, "_genre_names", [])

        # Tracks are stored on _tracks (not album.tracks) to avoid
        # SQLAlchemy relationship back-population that interferes with FK assignment.
        tracks_for_hydrator = list(getattr(album, "_tracks", []))

        # Set popularity from Deezer fan count (0-1M+ scale, capped at reasonable max)
        fans = raw.get("fans")
        if isinstance(fans, (int, float)) and fans > 0:
            item.popularity = min(fans, 10_000_000) / 10_000.0  # 0-1000 scale
        elif not item.popularity:
            item.popularity = 1.0  # Small baseline for recently charted items

        # 1. Insert MediaItem
        session.add(item)
        await session.flush()

        # 2. Insert Album
        album.media_item_id = item.id
        session.add(album)
        await session.flush()

        # 3. Insert Tracks and collect ISRCs
        isrcs: list[str] = []
        # Extract ISRCs from raw track data (isrc is now an ExternalID descriptor, not a column)
        track_isrcs: list[str | None] = []
        for td in (track_data or []):
            if isinstance(td, dict):
                raw_isrc = td.get("isrc")
                track_isrcs.append(str(raw_isrc) if isinstance(raw_isrc, str) and raw_isrc else None)
            else:
                track_isrcs.append(None)

        for i, t in enumerate(tracks_for_hydrator):
            t.album_id = album.media_item_id
            session.add(t)
            isrc_val = track_isrcs[i] if i < len(track_isrcs) else None
            if isrc_val:
                isrcs.append(isrc_val)
        await session.flush()

        eid_svc = ExternalIDService(session)
        for i, t in enumerate(tracks_for_hydrator):
            isrc_val = track_isrcs[i] if i < len(track_isrcs) else None
            if isrc_val:
                await eid_svc.upsert("isrc", isrc_val, "track", t.id)

        # 4. Insert ExternalIDs (upsert to survive task retries)
        if deezer_id_str:
            await eid_svc.upsert("deezer", str(deezer_id_str), "media_item", item.id)
        if upc:
            await eid_svc.upsert("barcode", upc, "media_item", item.id)

        # 5. Artist credits
        artist_data = raw.get("artist")
        if isinstance(artist_data, dict):
            from sqlalchemy import func as sa_func
            name = str(artist_data.get("name", ""))
            if name:
                person = await session.scalar(
                    select(Person).where(sa_func.lower(Person.name) == name.lower())
                )
                if person is None:
                    pic = artist_data.get("picture_medium") or artist_data.get("picture_big")
                    person = Person(
                        name=name,
                        photo_url=pic if isinstance(pic, str) else None,
                    )
                    session.add(person)
                    await session.flush()

                exists = await session.scalar(
                    select(MediaCredit).where(
                        MediaCredit.media_item_id == item.id,
                        MediaCredit.person_id == person.id,
                        MediaCredit.role == "primary",
                    )
                )
                if not exists:
                    session.add(MediaCredit(
                        media_item_id=item.id,
                        person_id=person.id,
                        role="primary",
                        character_name=name,
                        sort_order=0,
                    ))

        # 6. Genres
        if genre_names:
            from otix.domain.genre import Genre, MediaGenre
            from uuid import uuid4
            from sqlalchemy.dialects.postgresql import insert as pg_insert
            for genre_name in genre_names:
                slug = genre_name.lower().replace(" ", "-").replace("/", "-")
                genre = await session.scalar(select(Genre).where(Genre.slug == slug))
                if genre is None:
                    await session.execute(
                        pg_insert(Genre)
                        .values(id=f"oti_{uuid4().hex[:12]}", name=genre_name, slug=slug)
                        .on_conflict_do_nothing(constraint="genres_slug_key")
                    )
                    genre = await session.scalar(select(Genre).where(Genre.slug == slug))
                if genre:
                    mg_exists = await session.scalar(
                        select(MediaGenre).where(
                            MediaGenre.media_item_id == item.id,
                            MediaGenre.genre_id == genre.id,
                        )
                    )
                    if not mg_exists:
                        session.add(MediaGenre(media_item_id=item.id, genre_id=genre.id))

        await session.commit()

        logger.info("deezer album seeded",
            otix_id=item.id,
            deezer_id=deezer_id,
            title=item.title,
            track_count=len(tracks_for_hydrator),
            isrcs_found=len(isrcs),
        )
        await _progress_incr("deezer_seeded")
        await guard.reset_failures("seed_album", deezer_id)

        # Chain: Tier 2 (cross-platform IDs) + Tier 3 (supplementary) + enrichments
        if isrcs:
            app.send_task("sync.musicbrainz.match_by_isrc", args=[item.id, isrcs], priority=7)
        if upc:
            app.send_task("sync.musicbrainz.match_by_barcode", args=[item.id, upc], priority=7)
        app.send_task("sync.theaudiodb.enrich_album", args=[item.id], priority=6)
        app.send_task("sync.lrclib.enrich_album", args=[item.id], priority=6)
        app.send_task("sync.lastfm.enrich_album", args=[item.id])
        app.send_task("sync.fanart.enrich", args=["music", item.id])

        # Seed the primary artist if we have a Deezer artist ID
        if deezer_artist_id:
            app.send_task("sync.deezer.seed_artist", args=[str(deezer_artist_id)], priority=5)

        return {"otix_id": item.id, "deezer_id": deezer_id, "title": item.title}


@app.task(
    name="sync.deezer.seed_artist",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_deezer_seed_artist_task(self, deezer_artist_id: str) -> dict | None:
    """Fetch artist info from Deezer and create/update Person record."""
    return run_async(_sync_deezer_seed_artist(deezer_artist_id))


async def _sync_deezer_seed_artist(deezer_artist_id: str) -> dict | None:
    redis = await get_redis()
    guard = TaskGuard(redis, "deezer")

    if await guard.should_skip("seed_artist", deezer_artist_id):
        return None
    if await guard.is_duplicate("seed_artist", deezer_artist_id):
        return {"skipped": True, "reason": "duplicate"}

    provider = DeezerProvider(redis)

    try:
        artist = await provider.get_artist(deezer_artist_id)
    except Exception:
        await guard.record_failure("seed_artist", deezer_artist_id)
        return None

    if not artist or not artist.get("id"):
        return None

    async with async_session() as session:
        from sqlalchemy import func as sa_func
        from otix.domain.people import Person

        name = str(artist.get("name", ""))
        if not name:
            return None

        person = await session.scalar(
            select(Person).where(sa_func.lower(Person.name) == name.lower())
        )

        if person is None:
            pic = artist.get("picture_medium") or artist.get("picture_big")
            person = Person(
                name=name,
                photo_url=pic if isinstance(pic, str) else None,
            )
            session.add(person)
            await session.commit()
        elif not person.photo_url:
            pic = artist.get("picture_medium") or artist.get("picture_big")
            if isinstance(pic, str):
                person.photo_url = pic
                await session.commit()

    await guard.reset_failures("seed_artist", deezer_artist_id)
    logger.info("deezer artist seeded", name=name, deezer_id=deezer_artist_id)
    return {"artist_name": name, "deezer_id": deezer_artist_id}


@app.task(
    name="sync.deezer.enrich_cover",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_deezer_enrich_cover_task(self, otix_id: str) -> dict | None:
    """Find album on Deezer by artist+title and store cover art."""
    return run_async(_sync_deezer_enrich_cover(otix_id))


async def _sync_deezer_enrich_cover(otix_id: str) -> dict | None:
    async with async_session() as session:
        from sqlalchemy.orm import joinedload

        album = await session.scalar(
            select(Album).options(joinedload(Album.media_item)).where(Album.media_item_id == otix_id)
        )
        if album is None:
            return None

        # Skip only if already has cover art
        if album.media_item.poster_url:
            return {"skipped": True, "reason": "already_has_poster_url"}

        redis = await get_redis()
        provider = DeezerProvider(redis)

        # If album already has a Deezer ExternalID (from MB URL relations),
        # fetch directly by ID — no search needed.
        deezer_eid = await session.scalar(
            select(ExternalID.external_id).where(
                ExternalID.provider == "deezer",
                ExternalID.media_item_id == otix_id,
            )
        )

        cover_url = None
        matched_deezer_id = None

        if deezer_eid:
            try:
                raw = await provider.get_album(deezer_eid)
                if raw and raw.get("id"):
                    cover_url = _extract_cover_url(raw)
                    matched_deezer_id = str(raw.get("id", ""))
            except Exception:
                pass

        # Fall back to search by artist+title if no Deezer ID or direct fetch failed
        if not cover_url:
            credit = await session.scalar(
                select(Person.name)
                .join(MediaCredit, MediaCredit.person_id == Person.id)
                .where(MediaCredit.media_item_id == otix_id, MediaCredit.role == "primary")
            )
            artist_name = credit or ""
            album_title = album.media_item.title or ""

            if not artist_name or not album_title:
                return None

            query = f"{artist_name} {album_title}"
            try:
                results = await provider.search_album(query, limit=5)
            except Exception:
                return None

            if results:
                best = _find_best_match(results, artist_name, album_title)
                if best is not None:
                    cover_url = _extract_cover_url(best)
                    if not matched_deezer_id:
                        matched_deezer_id = str(best.get("id", ""))

        if not cover_url:
            return None

        album.media_item.poster_url = cover_url
        session.add(MediaAsset(
            media_item_id=otix_id,
            asset_type="poster",
            url=cover_url,
            width=1000,
            height=1000,
            provider="deezer",
        ))

        if matched_deezer_id and not deezer_eid:
            eid_svc = ExternalIDService(session)
            await eid_svc.upsert("deezer", matched_deezer_id, "media_item", otix_id)

        await session.commit()
        logger.info("deezer cover art enriched",
            title=album.media_item.title, otix_id=otix_id, deezer_id=matched_deezer_id)
        return {"otix_id": otix_id, "deezer_id": matched_deezer_id, "cover_url": cover_url}


def _find_best_match(results: list[dict], artist_name: str, album_title: str) -> dict | None:
    """Find the best album match by comparing title and artist name."""
    if not results:
        return None

    target_title = album_title.lower().strip()
    target_artist = artist_name.lower().strip()

    def _score(r: dict) -> int:
        score = 0
        r_title = str(r.get("title", "")).lower().strip()
        r_artist = str(r.get("artist", {}).get("name", "") if isinstance(r.get("artist"), dict) else "").lower().strip()

        # Title is exact or nearly exact
        if r_title == target_title:
            score += 10
        elif target_title in r_title or r_title in target_title:
            score += 5

        # Artist match
        if r_artist == target_artist:
            score += 5
        elif target_artist in r_artist or r_artist in target_artist:
            score += 2

        # Prefer album type over single/EP
        r_type = str(r.get("record_type", "")).lower()
        if r_type == "album":
            score += 1

        return score

    scored = [(r, _score(r)) for r in results if isinstance(r, dict)]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[0][0] if scored and scored[0][1] >= 5 else None


# ── Discovery cycle ────────────────────────────────────────────────────


@app.task(
    name="seed.deezer_cycle",
    bind=True,
    max_retries=1,
    default_retry_delay=60,
)
def seed_deezer_cycle(self) -> dict:
    """Periodic discovery: pull Deezer chart albums, enqueue new ones."""
    return run_async(_seed_deezer_cycle())


async def _seed_deezer_cycle() -> dict:
    redis = await get_redis()
    guard = TaskGuard(redis, "deezer")

    if await guard.should_skip("discovery_cycle", "chart"):
        logger.info("deezer discovery cycle skipped: poison pill")
        return {"status": "skipped"}

    BATCH_LIMIT = 50

    async with async_session() as session:
        provider = DeezerProvider(redis)

        try:
            chart_albums = await provider.get_chart_albums(limit=BATCH_LIMIT)
        except Exception:
            logger.warning("deezer chart fetch failed")
            return {"status": "chart_fetch_failed"}

        new_count = 0
        skipped_count = 0

        for album_data in chart_albums:
            deezer_id = str(album_data.get("id", ""))
            if not deezer_id:
                continue

            existing = await session.scalar(
                select(ExternalID.media_item_id).where(
                    ExternalID.provider == "deezer",
                    ExternalID.external_id == deezer_id,
                )
            )
            if existing is not None:
                skipped_count += 1
                continue

            app.send_task("sync.deezer.seed_album", args=[deezer_id], priority=5)
            new_count += 1

    await _progress_incr("deezer_cycle_albums_enqueued", new_count)
    logger.info("deezer discovery cycle complete",
        chart_total=len(chart_albums),
        new_enqueued=new_count,
        already_known=skipped_count,
    )

    await guard.reset_failures("discovery_cycle", "chart")
    return {
        "status": "complete",
        "chart_total": len(chart_albums),
        "new_enqueued": new_count,
        "already_known": skipped_count,
    }
