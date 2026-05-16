"""Spotify provider tasks: album seeding, enrichment, matching, and artist backfill."""

from __future__ import annotations

from datetime import date, datetime, timezone

import structlog
from sqlalchemy import select

from otix.domain.media import Album, ExternalID, MediaItem, Track
from otix.domain.people import MediaCredit, Person
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.lib.slug import slugify
from otix.lib.types import JSONValue
from otix.providers.base import RateLimitError
from otix.providers.spotify.client import SpotifyProvider
from otix.providers.spotify.hydrator import SpotifyHydrator
from otix.providers.spotify.transformer import extract_artist_spotify_ids, extract_track_isrc, extract_album_upc

logger = structlog.get_logger()


# ── Helpers ────────────────────────────────────────────────────────────


async def _get_or_create_spotify_artist(
    session,
    name: str,
    spotify_artist_id: str | None,
) -> Person:
    person = None
    if spotify_artist_id:
        person = await session.scalar(
            select(Person).where(Person.spotify_artist_id == spotify_artist_id)
        )
        if person is not None:
            return person

    name_match_filters = [Person.name == name]
    if spotify_artist_id:
        name_match_filters.append(Person.spotify_artist_id.is_(None))
    person = await session.scalar(select(Person).where(*name_match_filters))
    if person is not None:
        if spotify_artist_id and not person.spotify_artist_id:
            person.spotify_artist_id = spotify_artist_id
        return person

    person = Person(name=name, spotify_artist_id=spotify_artist_id)
    session.add(person)
    await session.flush()
    return person


async def _create_spotify_artist_credits(
    session,
    media_item_id: str,
    artists_data: list[JSONValue],
) -> int:
    credited_person_ids: set[str] = set()
    created = 0

    for artist_data in artists_data:
        if not isinstance(artist_data, dict):
            continue

        name = str(artist_data.get("name") or "").strip()
        spotify_artist_id = str(artist_data.get("id") or "").strip() or None
        if not name:
            continue

        person = await _get_or_create_spotify_artist(session, name, spotify_artist_id)
        if person.id in credited_person_ids:
            continue

        sort_order = len(credited_person_ids)
        role = "primary" if sort_order == 0 else "artist"
        exists = await session.scalar(
            select(MediaCredit).where(
                MediaCredit.media_item_id == media_item_id,
                MediaCredit.person_id == person.id,
            )
        )
        if exists is None:
            session.add(
                MediaCredit(
                    media_item_id=media_item_id,
                    person_id=person.id,
                    role=role,
                    character_name=name,
                    sort_order=sort_order,
                )
            )
            created += 1
        credited_person_ids.add(person.id)

    return created


def _spotify_album_artists(raw: dict) -> list[JSONValue]:
    artists_data = raw.get("artists", [])
    return artists_data if isinstance(artists_data, list) else []


def _parse_spotify_release_date(raw: dict) -> date | None:
    release_date_raw = raw.get("release_date")
    if not release_date_raw:
        return None

    try:
        parts = str(release_date_raw).split("-")
        if len(parts) == 3:
            return date.fromisoformat(str(release_date_raw))
        if len(parts) == 2:
            return date(int(parts[0]), int(parts[1]), 1)
        if len(parts) == 1:
            return date(int(parts[0]), 1, 1)
    except (ValueError, IndexError):
        return None

    return None


async def _apply_spotify_album_metadata(session, item: MediaItem, raw: dict) -> dict[str, int]:
    title_updates = 0
    release_date_updates = 0

    title = str(raw.get("name") or "").strip()
    if title and item.title != title:
        item.title = title
        item.slug = slugify(title)
        title_updates = 1

    release_date = _parse_spotify_release_date(raw)
    if release_date is not None and item.release_date != release_date:
        item.release_date = release_date
        release_date_updates = 1

    credits_created = await _create_spotify_artist_credits(
        session,
        item.id,
        _spotify_album_artists(raw),
    )

    return {
        "title_updates": title_updates,
        "release_date_updates": release_date_updates,
        "credits_created": credits_created,
    }


def _split_legacy_spotify_album_title(title: str) -> tuple[str, str] | None:
    if " — " not in title:
        return None

    artist_name, album_title = title.split(" — ", 1)
    artist_name = artist_name.strip()
    album_title = album_title.strip()
    if not artist_name or not album_title:
        return None
    return artist_name, album_title


async def _apply_legacy_spotify_album_title_split(session, item: MediaItem) -> dict[str, int]:
    split_title = _split_legacy_spotify_album_title(item.title)
    if split_title is None:
        return {"title_updates": 0, "credits_created": 0}

    artist_name, album_title = split_title
    item.title = album_title
    item.slug = slugify(album_title)
    credits_created = await _create_spotify_artist_credits(
        session,
        item.id,
        [{"name": artist_name}],
    )
    return {"title_updates": 1, "credits_created": credits_created}


# ── Album match / enrich ───────────────────────────────────────────────


@app.task(
    name="sync.spotify.match_album",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_spotify_match_album_task(self, otix_id: str) -> dict | None:
    """Search Spotify for an album and cross-link by artist+title."""
    return run_async(_sync_spotify_match_album(otix_id))


async def _sync_spotify_match_album(otix_id: str) -> dict | None:
    async with async_session() as session:
        album = await session.get(Album, otix_id)
        if album is None or album.spotify_id:
            return None

        redis = await get_redis()
        provider = SpotifyProvider(redis)

        try:
            results = await provider.search(album.media_item.title, "album", limit=3)
        except Exception:
            return None

        if not results:
            return None

        spotify_id = results[0].get("id")
        if spotify_id:
            album.spotify_id = spotify_id
            await session.commit()

            app.send_task("sync.spotify.enrich_album", args=[otix_id, spotify_id])

        return {"otix_id": otix_id, "spotify_id": spotify_id}


@app.task(
    name="sync.spotify.enrich_album",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_spotify_enrich_album_task(self, otix_id: str, spotify_id: str) -> dict | None:
    """Enrich an Album from Spotify: audio features, popularity, track linking."""
    return run_async(_sync_spotify_enrich_album(otix_id, spotify_id))


async def _sync_spotify_enrich_album(otix_id: str, spotify_id: str) -> dict | None:
    async with async_session() as session:
        from sqlalchemy.orm import joinedload

        album = await session.scalar(
            select(Album).options(joinedload(Album.media_item)).where(Album.media_item_id == otix_id)
        )
        if album is None:
            return None

        album.spotify_id = spotify_id

        redis = await get_redis()
        provider = SpotifyProvider(redis)
        hydrator = SpotifyHydrator(provider, session)

        await hydrator.hydrate(album)
        await hydrator.hydrate_tracks(album)

        await session.commit()

        logger.info("spotify album enriched",
            title=album.media_item.title,
            spotify_id=spotify_id,
            popularity=album.spotify_popularity,
        )
        await _progress_incr("spotify_enqueued")
        return {"otix_id": otix_id, "spotify_id": spotify_id}


# ── Album seeding ──────────────────────────────────────────────────────


@app.task(
    name="sync.spotify.seed_album",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_spotify_seed_album_task(self, spotify_id: str) -> dict | None:
    """Fetch an album from Spotify by ID and create it in the Otix catalog."""
    return run_async(_sync_spotify_seed_album(spotify_id))


async def _sync_spotify_seed_album(spotify_id: str) -> dict | None:
    async with async_session() as session:
        existing = await session.scalar(
            select(Album).where(Album.spotify_id == spotify_id)
        )
        if existing is not None:
            return {"otix_id": existing.media_item_id, "spotify_id": spotify_id, "status": "already_exists"}

        redis = await get_redis()
        provider = SpotifyProvider(redis)

        try:
            raw = await provider.get_album(spotify_id)
        except RateLimitError:
            raise
        except Exception:
            logger.warning("spotify seed album fetch failed", spotify_id=spotify_id)
            return None

        if not raw or not raw.get("id"):
            return None

        title = raw.get("name", "Unknown Album")
        artists_data = _spotify_album_artists(raw)
        primary_artist_name = "Unknown Artist"
        if artists_data and isinstance(artists_data[0], dict):
            primary_artist_name = str(artists_data[0].get("name") or primary_artist_name)

        images = raw.get("images", [])
        poster_url = images[0].get("url") if images else None

        release_date = _parse_spotify_release_date(raw)

        item = MediaItem(
            title=title,
            slug=slugify(title),
            media_type="music",
            poster_url=poster_url,
            release_date=release_date,
            synced_at=datetime.now(timezone.utc),
        )
        session.add(item)
        await session.flush()

        album = Album(
            media_item_id=item.id,
            release_type=raw.get("album_type", "album"),
            track_count=raw.get("total_tracks", 0),
            spotify_id=spotify_id,
            spotify_url=raw.get("external_urls", {}).get("spotify"),
            spotify_popularity=raw.get("popularity"),
            preview_url=None,
            barcode=extract_album_upc(raw),
        )
        session.add(album)
        await _create_spotify_artist_credits(session, item.id, artists_data)

        for track_data in raw.get("tracks", {}).get("items", []):
            track = Track(
                album_id=item.id,
                track_number=track_data.get("track_number", 0),
                disc_number=track_data.get("disc_number", 1),
                title=track_data.get("name", "Untitled"),
                duration_ms=track_data.get("duration_ms"),
                preview_url=track_data.get("preview_url"),
                spotify_id=track_data.get("id"),
                isrc=extract_track_isrc(track_data),
            )
            session.add(track)

        await session.commit()

        logger.info("spotify album seeded",
            otix_id=item.id, spotify_id=spotify_id, title=title, artist=primary_artist_name,
        )

        app.send_task("sync.spotify.enrich_album", args=[item.id, spotify_id])
        app.send_task("sync.fanart.enrich", args=["music", item.id])
        app.send_task("sync.lastfm.enrich_album", args=[item.id])
        app.send_task("embedding.generate", args=[item.id])

        for a in artists_data:
            aid = a.get("id") if isinstance(a, dict) else None
            if aid:
                app.send_task("sync.spotify.enrich_artist", args=[aid])

        await _progress_incr("spotify_seeded")
        return {"otix_id": item.id, "spotify_id": spotify_id, "title": title}


# ── Artist enrichment ──────────────────────────────────────────────────


@app.task(
    name="sync.spotify.related_artists",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def sync_related_artists_task(self, spotify_artist_id: str) -> dict:
    """Fetch related artists from Spotify, find-or-create Person records, enqueue enrichment."""
    return run_async(_sync_related_artists(spotify_artist_id))


async def _sync_related_artists(spotify_artist_id: str) -> dict:
    redis = await get_redis()
    provider = SpotifyProvider(redis)

    try:
        related = await provider.get_related_artists(spotify_artist_id)
    except Exception:
        logger.warning("related_artists: fetch failed", spotify_artist_id=spotify_artist_id)
        return {"artist_id": spotify_artist_id, "count": 0, "error": "fetch failed"}

    if not related:
        return {"artist_id": spotify_artist_id, "count": 0}

    created = 0
    for ra in related[:20]:
        ra_id = ra.get("id")
        if not ra_id:
            continue

        async with async_session() as session:
            person = await session.scalar(
                select(Person).where(Person.spotify_artist_id == ra_id)
            )
            if not person:
                ra_name = ra.get("name")
                if ra_name:
                    person = await session.scalar(
                        select(Person).where(Person.name == ra_name)
                    )
                    if person and not person.spotify_artist_id:
                        person.spotify_artist_id = ra_id
                        await session.commit()

            if not person:
                ra_name = ra.get("name", "Unknown")
                images = ra.get("images", [])
                async with async_session() as s2:
                    person = Person(
                        name=ra_name,
                        spotify_artist_id=ra_id,
                        spotify_popularity=ra.get("popularity"),
                        spotify_follower_count=ra.get("followers", {}).get("total"),
                        spotify_genres=ra.get("genres"),
                        spotify_image_url=images[0].get("url") if images else None,
                    )
                    s2.add(person)
                    await s2.commit()
                    created += 1

        app.send_task("sync.spotify.enrich_artist", args=[ra_id])

    logger.info(
        "related_artists: done",
        spotify_artist_id=spotify_artist_id,
        total=len(related),
        created=created,
    )
    return {"artist_id": spotify_artist_id, "count": len(related), "created": created}


@app.task(
    name="sync.spotify.enrich_artist",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def enrich_spotify_artist_task(self, spotify_artist_id: str, trigger_discography: bool = True) -> dict:
    """Enrich a Person record with Spotify artist metadata."""
    return run_async(_enrich_spotify_artist(spotify_artist_id, trigger_discography))


async def _enrich_spotify_artist(spotify_artist_id: str, trigger_discography: bool = True) -> dict:
    redis = await get_redis()
    provider = SpotifyProvider(redis)

    try:
        artist = await provider.get_artist(spotify_artist_id)
    except Exception:
        logger.warning("enrich_artist: fetch failed", spotify_artist_id=spotify_artist_id)
        return {"artist_id": spotify_artist_id, "error": "fetch failed"}

    if not artist or not artist.get("id"):
        return {"artist_id": spotify_artist_id, "error": "not found"}

    async with async_session() as session:
        person = await session.scalar(
            select(Person).where(Person.spotify_artist_id == spotify_artist_id)
        )

        if not person:
            name = artist.get("name")
            if name:
                person = await session.scalar(
                    select(Person).where(Person.name == name)
                )
                if person and not person.spotify_artist_id:
                    person.spotify_artist_id = spotify_artist_id

        if not person:
            images = artist.get("images", [])
            image_url = images[0].get("url") if images else None
            person = Person(
                name=artist.get("name"),
                spotify_artist_id=spotify_artist_id,
                spotify_popularity=artist.get("popularity"),
                spotify_follower_count=(artist.get("followers") or {}).get("total"),
                spotify_genres=artist.get("genres"),
                spotify_image_url=image_url,
                photo_url=image_url,
            )
            session.add(person)
            await session.commit()
        else:
            person.spotify_popularity = artist.get("popularity")
            person.spotify_follower_count = (artist.get("followers") or {}).get("total")
            person.spotify_genres = artist.get("genres")

            images = artist.get("images", [])
            if images:
                person.spotify_image_url = images[0].get("url")

            if not person.photo_url and person.spotify_image_url:
                person.photo_url = person.spotify_image_url

            await session.commit()

    if trigger_discography:
        app.send_task("sync.spotify.artist_discography", args=[spotify_artist_id])

    logger.info(
        "enrich_artist: done",
        spotify_artist_id=spotify_artist_id,
        name=artist.get("name"),
        popularity=artist.get("popularity"),
    )
    return {
        "artist_id": spotify_artist_id,
        "name": artist.get("name"),
        "popularity": artist.get("popularity"),
        "genres": artist.get("genres"),
        "matched": True,
    }


# ── Artist discography ─────────────────────────────────────────────────


async def _fetch_all_artist_albums(provider: SpotifyProvider, artist_id: str) -> list[dict]:
    albums: list[dict] = []
    offset = 0
    while True:
        page = await provider.get_artist_albums(artist_id, offset=offset)
        items = page.get("items", [])
        if not items:
            break
        albums.extend(items)
        offset += len(items)
        if not page.get("next"):
            break
    return albums


@app.task(
    name="sync.spotify.artist_discography",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def sync_artist_discography_task(self, spotify_artist_id: str) -> dict:
    """Fetch all albums for a Spotify artist, seed missing ones into Otix."""
    return run_async(_sync_artist_discography(spotify_artist_id))


async def _sync_artist_discography(spotify_artist_id: str) -> dict:
    redis = await get_redis()
    provider = SpotifyProvider(redis)

    try:
        albums = await _fetch_all_artist_albums(provider, spotify_artist_id)
    except Exception:
        logger.warning("artist_discography: fetch failed", spotify_artist_id=spotify_artist_id)
        return {"artist_id": spotify_artist_id, "total": 0, "new": 0, "error": "fetch failed"}

    if not albums:
        return {"artist_id": spotify_artist_id, "total": 0, "new": 0}

    album_ids = [a.get("id") for a in albums if a.get("id")]

    async with async_session() as session:
        result = await session.execute(
            select(Album.spotify_id).where(Album.spotify_id.in_(album_ids))
        )
        existing_ids = {row[0] for row in result if row[0]}

    new_ids = [aid for aid in album_ids if aid not in existing_ids]

    for aid in new_ids:
        app.send_task("sync.spotify.seed_album", args=[aid])

    logger.info(
        "artist_discography: done",
        spotify_artist_id=spotify_artist_id,
        total=len(album_ids),
        existing=len(existing_ids),
        new=len(new_ids),
    )
    return {
        "artist_id": spotify_artist_id,
        "total": len(album_ids),
        "existing": len(existing_ids),
        "new": len(new_ids),
    }


# ── Backfill tasks ─────────────────────────────────────────────────────


@app.task(
    name="sync.spotify.backfill_album_titles",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def backfill_spotify_album_titles_task(self, limit: int = 500) -> dict:
    """Backfill Spotify-seeded albums to separate album title from artist credits."""
    return run_async(_backfill_spotify_album_titles(limit))


async def _backfill_spotify_album_titles(limit: int = 500) -> dict:
    redis = await get_redis()
    provider = SpotifyProvider(redis)

    scanned = 0
    updated_titles = 0
    updated_release_dates = 0
    created_credits = 0
    failed = 0
    rate_limited = False

    async with async_session() as session:
        result = await session.execute(
            select(Album, MediaItem)
            .join(MediaItem, MediaItem.id == Album.media_item_id)
            .where(
                MediaItem.media_type == "music",
                Album.spotify_id.isnot(None),
            )
            .order_by(MediaItem.created_at.desc())
            .limit(limit)
        )
        rows = result.all()

        for album, item in rows:
            scanned += 1
            spotify_id = album.spotify_id
            if not spotify_id:
                continue

            try:
                legacy_updates = await _apply_legacy_spotify_album_title_split(session, item)
                updated_titles += legacy_updates["title_updates"]
                created_credits += legacy_updates["credits_created"]
                if legacy_updates["title_updates"]:
                    await session.commit()
                    continue

                if rate_limited:
                    continue

                raw = await provider.get_album(spotify_id)
                if not raw or not raw.get("id"):
                    failed += 1
                    continue

                updates = await _apply_spotify_album_metadata(session, item, raw)
                updated_titles += updates["title_updates"]
                updated_release_dates += updates["release_date_updates"]
                created_credits += updates["credits_created"]
                await session.commit()
            except RateLimitError:
                rate_limited = True
                await session.rollback()
                logger.warning(
                    "spotify album title backfill rate limited; continuing with local title-split fallback",
                    retry_later=True,
                )
            except Exception:
                failed += 1
                await session.rollback()
                logger.warning(
                    "spotify album title backfill failed",
                    otix_id=item.id,
                    spotify_id=spotify_id,
                    exc_info=True,
                )

    logger.info(
        "spotify album title backfill complete",
        scanned=scanned,
        updated_titles=updated_titles,
        updated_release_dates=updated_release_dates,
        created_credits=created_credits,
        failed=failed,
        rate_limited=rate_limited,
    )
    return {
        "scanned": scanned,
        "updated_titles": updated_titles,
        "updated_release_dates": updated_release_dates,
        "created_credits": created_credits,
        "failed": failed,
        "rate_limited": rate_limited,
    }


@app.task(
    name="sync.spotify.backfill_album_artists",
    bind=True,
    max_retries=1,
    default_retry_delay=120,
)
def backfill_album_artists_task(self, limit: int | None = None) -> dict:
    """Find all albums with Spotify IDs and ensure every artist has a Person record."""
    return run_async(_backfill_album_artists(limit))


async def _backfill_album_artists(limit: int | None = None) -> dict:
    redis = await get_redis()
    provider = SpotifyProvider(redis)

    async with async_session() as session:
        stmt = (
            select(Album.spotify_id, Album.media_item_id)
            .where(Album.spotify_id.isnot(None))
            .order_by(Album.created_at.desc())
        )
        if limit:
            stmt = stmt.limit(limit)
        result = await session.execute(stmt)
        album_rows = [(row[0], row[1]) for row in result.all()]

    if not album_rows:
        return {"albums_processed": 0, "artists_missing": 0, "enqueued": 0}

    seen_artist_ids: set[str] = set()
    albums_processed = 0
    api_errors = 0

    for spotify_id, _media_item_id in album_rows:
        try:
            sp_album = await provider.get_album(spotify_id)
        except Exception:
            api_errors += 1
            continue

        if not sp_album:
            continue

        artist_ids = extract_artist_spotify_ids(sp_album)
        for aid in artist_ids:
            seen_artist_ids.add(aid)
        albums_processed += 1

    if not seen_artist_ids:
        return {
            "albums_processed": albums_processed,
            "api_errors": api_errors,
            "artists_missing": 0,
            "enqueued": 0,
        }

    async with async_session() as session:
        result = await session.execute(
            select(Person.spotify_artist_id).where(
                Person.spotify_artist_id.in_(list(seen_artist_ids))
            )
        )
        existing_ids = {row[0] for row in result.all()}

    missing_ids = seen_artist_ids - existing_ids

    enqueued = 0
    for aid in missing_ids:
        app.send_task("sync.spotify.enrich_artist", args=[aid])
        enqueued += 1

    logger.info(
        "backfill_album_artists: done",
        albums_processed=albums_processed,
        total_artist_ids=len(seen_artist_ids),
        existing=len(existing_ids),
        missing=len(missing_ids),
        enqueued=enqueued,
        api_errors=api_errors,
    )
    return {
        "albums_processed": albums_processed,
        "total_artist_ids": len(seen_artist_ids),
        "existing_persons": len(existing_ids),
        "artists_missing": len(missing_ids),
        "enqueued": enqueued,
        "api_errors": api_errors,
    }


@app.task(
    name="sync.spotify.backfill_audio_features",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def backfill_audio_features_task(self, batch_size: int = 500) -> dict:
    """Backfill per-track audio features for tracks missing them."""
    return run_async(_backfill_audio_features(batch_size))


async def _backfill_audio_features(batch_size: int = 500) -> dict:
    from otix.providers.spotify.client import SpotifyProvider
    from otix.providers.spotify.transformer import extract_audio_features

    redis = await get_redis()
    provider = SpotifyProvider(redis)

    async with async_session() as session:
        result = await session.execute(
            select(Track.spotify_id)
            .where(
                Track.spotify_id.isnot(None),
                Track.audio_features.is_(None),
            )
            .limit(batch_size)
        )
        missing_ids = [row[0] for row in result if row[0]]

    if not missing_ids:
        logger.info("audio_features_backfill: nothing to do")
        return {"scanned": 0, "updated": 0}

    updated = 0
    failed = 0

    for i in range(0, len(missing_ids), 100):
        chunk = missing_ids[i:i + 100]
        try:
            features_list = await provider.get_audio_features_batch(chunk)
        except Exception:
            failed += len(chunk)
            continue

        features_map: dict[str, dict] = {}
        for f in features_list:
            if f and f.get("id"):
                features_map[f["id"]] = extract_audio_features(f)

        if not features_map:
            failed += len(chunk)
            continue

        async with async_session() as session:
            result = await session.execute(
                select(Track).where(Track.spotify_id.in_(list(features_map)))
            )
            tracks = result.scalars().all()
            for track in tracks:
                feat = features_map.get(track.spotify_id)
                if feat:
                    track.audio_features = feat
                    updated += 1
            await session.commit()

    logger.info("audio_features_backfill: done", scanned=len(missing_ids), updated=updated, failed=failed)
    return {"scanned": len(missing_ids), "updated": updated, "failed": failed}


@app.task(
    name="sync.spotify.backfill_album_audio_features",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def backfill_album_audio_features_task(self, limit: int = 500) -> dict:
    """Recalculate album-level averaged audio features from tracks."""
    return run_async(_backfill_album_audio_features(limit))


async def _backfill_album_audio_features(limit: int = 500) -> dict:
    KEYS = ["tempo", "energy", "danceability", "valence", "acousticness", "instrumentalness", "liveness", "speechiness"]

    async with async_session() as session:
        result = await session.execute(
            select(Album)
            .where(Album.spotify_id.isnot(None))
            .order_by(Album.created_at.desc())
            .limit(limit)
        )
        albums = result.scalars().all()

    updated = 0
    for album in albums:
        async with async_session() as session:
            tr_result = await session.execute(
                select(Track.audio_features)
                .where(
                    Track.album_id == album.media_item_id,
                    Track.audio_features.isnot(None),
                )
            )
            all_feats = [row[0] for row in tr_result if row[0]]
            if not all_feats:
                continue

            avg: dict[str, float] = {}
            for k in KEYS:
                vals = [f[k] for f in all_feats if k in f and f[k] is not None]
                if vals:
                    avg[k] = round(sum(vals) / len(vals), 4)

            if avg:
                album.audio_features = avg
                await session.commit()
                updated += 1

    logger.info("album_audio_features_backfill: done", scanned=len(albums), updated=updated)
    return {"scanned": len(albums), "updated": updated}


# ── User library sync ──────────────────────────────────────────────────


@app.task(
    name="sync.spotify.user_library",
    bind=True,
    max_retries=1,
)
def sync_spotify_user_library_task(self, user_id: str, task_id: str | None = None) -> dict | None:
    """Sync a user's Spotify liked tracks and saved albums into Otix."""
    return run_async(_sync_spotify_user_library(user_id, task_id))


async def _sync_spotify_user_library(user_id: str, task_id: str | None = None) -> dict | None:
    from otix.services.spotify_auth_service import get_user_access_token
    from otix.services.spotify_library_service import sync_spotify_user_library

    async with async_session() as session:
        user = await session.get(User, user_id)
        if user is None or user.spotify_id is None:
            return None

        token = await get_user_access_token(user)
        if token is None:
            logger.warning("spotify library sync failed, no valid token", user_id=user_id)
            return None

        result = await sync_spotify_user_library(session, user, token, task_id=task_id)
        await session.commit()
        return result
