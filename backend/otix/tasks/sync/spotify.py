"""Spotify provider tasks: user library sync, recently played, album seeding.

Spotify is user-only for catalog purposes. Album seeding from Spotify creates
minimal catalog entries that are then enriched via the Tier 1-2-3 pipeline
(Deezer -> MusicBrainz cross-platform IDs -> TheAudioDB).

No Spotify catalog enrichment occurs — Otix is the source of truth.
"""

from __future__ import annotations

from datetime import UTC, datetime

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
from otix.lib.task_guard import TaskGuard
from otix.lib.types import JSONValue
from otix.providers.base import RateLimitError
from otix.providers.spotify.client import SpotifyProvider
from otix.providers.spotify.transformer import extract_album_upc, extract_track_isrc
from otix.services.external_id_service import ExternalIDService

logger = structlog.get_logger()


# ── Helpers ────────────────────────────────────────────────────────────


async def _get_or_create_spotify_artist(
    session,
    name: str,
    spotify_artist_id: str | None,
    wikidata_id: str | None = None,
) -> Person:
    from sqlalchemy import func as sa_func
    from sqlalchemy import not_ as sa_not

    eid_svc = ExternalIDService(session)

    if spotify_artist_id:
        person_id = await eid_svc.find_entity_id_by_type("spotify", spotify_artist_id, "person")
        person = await session.get(Person, person_id) if person_id else None
        if person is not None:
            if wikidata_id:
                await eid_svc.upsert("wikidata", wikidata_id, "person", person.id)
            return person

    # Check wikidata_id for cross-provider match
    if wikidata_id:
        person_id = await eid_svc.find_entity_id_by_type("wikidata", wikidata_id, "person")
        person = await session.get(Person, person_id) if person_id else None
        if person is not None:
            if spotify_artist_id:
                await eid_svc.upsert("spotify", spotify_artist_id, "person", person.id)
            return person

    name_match_filters = [sa_func.lower(Person.name) == name.lower()]
    if spotify_artist_id:
        name_match_filters.append(
            sa_not(
                select(ExternalID.entity_id)
                .where(
                    ExternalID.entity_id == Person.id,
                    ExternalID.entity_type == "person",
                    ExternalID.provider == "spotify",
                )
                .exists()
            )
        )
    person = await session.scalar(select(Person).where(*name_match_filters))
    if person is not None:
        if spotify_artist_id:
            await eid_svc.upsert("spotify", spotify_artist_id, "person", person.id)
        if wikidata_id:
            await eid_svc.upsert("wikidata", wikidata_id, "person", person.id)
        return person

    person = Person(name=name)
    session.add(person)
    await session.flush()
    if spotify_artist_id:
        await eid_svc.upsert("spotify", spotify_artist_id, "person", person.id)
    if wikidata_id:
        await eid_svc.upsert("wikidata", wikidata_id, "person", person.id)
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


# ── Album seeding ──────────────────────────────────────────────────────


@app.task(
    name="sync.spotify.seed_album",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_spotify_seed_album_task(self, spotify_id: str) -> dict | None:
    """Fetch an album from Spotify by ID and create a minimal entry in Otix.

    Does NOT enrich from Spotify. After creation, chains into the Tier 1-2-3
    pipeline: MusicBrainz cross-platform IDs, TheAudioDB, LastFM, FanArt.
    """
    try:
        return run_async(_sync_spotify_seed_album(spotify_id))
    except RateLimitError as e:
        raise self.retry(countdown=e.retry_after or 60) from e


async def _sync_spotify_seed_album(spotify_id: str) -> dict | None:
    redis = await get_redis()
    guard = TaskGuard(redis, "spotify")

    if await guard.should_skip("seed_album", spotify_id):
        logger.info("seed_album skipped: poison pill", spotify_id=spotify_id)
        return None

    async with async_session() as session:
        eid_svc = ExternalIDService(session)
        entity_id = await eid_svc.find_entity_id("spotify", spotify_id)
        existing = await session.get(Album, entity_id) if entity_id else None
        if existing is not None:
            await guard.reset_failures("seed_album", spotify_id)
            return {"otix_id": existing.media_item_id, "spotify_id": spotify_id, "status": "already_exists"}

        provider = SpotifyProvider(redis)

        try:
            raw = await provider.get_album(spotify_id)
        except RateLimitError:
            raise
        except Exception:
            await guard.record_failure("seed_album", spotify_id)
            logger.warning("spotify seed album fetch failed", spotify_id=spotify_id)
            return None

        if not raw or not raw.get("id"):
            await guard.record_failure("seed_album", spotify_id)
            return None

        title = raw.get("name", "Unknown Album")
        artists_data = _spotify_album_artists(raw)
        primary_artist_name = "Unknown Artist"
        if artists_data and isinstance(artists_data[0], dict):
            primary_artist_name = str(artists_data[0].get("name") or primary_artist_name)

        images = raw.get("images", [])
        poster_url = images[0].get("url") if images else None

        release_date_raw = raw.get("release_date")
        release_date = None
        if release_date_raw:
            try:
                parts = str(release_date_raw).split("-")
                if len(parts) == 3:
                    from datetime import date

                    release_date = date.fromisoformat(str(release_date_raw))
                elif len(parts) == 2:
                    from datetime import date

                    release_date = date(int(parts[0]), int(parts[1]), 1)
                elif len(parts) == 1:
                    from datetime import date

                    release_date = date(int(parts[0]), 1, 1)
            except (ValueError, IndexError):
                pass

        item = MediaItem(
            title=title,
            slug=slugify(title),
            media_type="music",
            poster_url=poster_url,
            release_date=release_date,
            synced_at=datetime.now(UTC),
        )
        session.add(item)
        await session.flush()

        upc = extract_album_upc(raw)

        album = Album(
            media_item_id=item.id,
            release_type=raw.get("album_type", "album"),
            track_count=raw.get("total_tracks", 0),
            spotify_url=raw.get("external_urls", {}).get("spotify"),
            preview_url=None,
            barcode=upc,
        )
        session.add(album)
        await _create_spotify_artist_credits(session, item.id, artists_data)

        # Store Spotify ID as ExternalID
        session.add(
            ExternalID(
                provider="spotify",
                external_id=spotify_id,
                media_item_id=item.id,
                media_type="music",
            )
        )

        # Track ISRCs for downstream MB matching
        isrcs: list[str] = []
        track_sync_data: list[tuple[Track, str | None, str | None]] = []
        for track_data in raw.get("tracks", {}).get("items", []):
            isrc = extract_track_isrc(track_data)
            spotify_track_id = str(track_data.get("id") or "")
            track = Track(
                album_id=item.id,
                track_number=track_data.get("track_number", 0),
                disc_number=track_data.get("disc_number", 1),
                title=track_data.get("name", "Untitled"),
                duration_ms=track_data.get("duration_ms"),
            )
            session.add(track)
            track_sync_data.append((track, spotify_track_id or None, isrc))
            if isrc:
                isrcs.append(isrc)

        await session.flush()

        for track, spotify_id_val, isrc_val in track_sync_data:
            if spotify_id_val:
                await eid_svc.upsert("spotify", spotify_id_val, "track", track.id)
            if isrc_val:
                await eid_svc.upsert("isrc", isrc_val, "track", track.id)

        # Store barcode if available
        if upc:
            session.add(
                ExternalID(
                    provider="barcode",
                    external_id=upc,
                    media_item_id=item.id,
                    media_type="music",
                )
            )

        await session.commit()

        logger.info(
            "spotify album seeded",
            otix_id=item.id,
            spotify_id=spotify_id,
            title=title,
            artist=primary_artist_name,
        )

        # Chain into Tier 1-2-3 pipeline (no Spotify enrichment)
        if isrcs:
            app.send_task("sync.musicbrainz.match_by_isrc", args=[item.id, isrcs], priority=7)
        app.send_task("sync.theaudiodb.enrich_album", args=[item.id], priority=6)
        app.send_task("sync.lastfm.enrich_album", args=[item.id])
        app.send_task("sync.fanart.enrich", args=["music", item.id])

        await _progress_incr("spotify_seeded")
        await guard.reset_failures("seed_album", spotify_id)
        return {"otix_id": item.id, "spotify_id": spotify_id, "title": title}


# ── User library sync ──────────────────────────────────────────────────


@app.task(
    name="sync.spotify.user_library",
    bind=True,
    max_retries=1,
)
def sync_spotify_user_library_task(self, user_id: str, task_id: str | None = None) -> dict | None:
    """Sync a user's Spotify liked tracks and saved albums into Otix."""
    try:
        return run_async(_sync_spotify_user_library(user_id, task_id))
    except RateLimitError as e:
        raise self.retry(countdown=e.retry_after or 120) from e

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


# ── Recently played sync ─────────────────────────────────────────────────


@app.task(
    name="sync.spotify.recently_played",
    bind=True,
    max_retries=1,
)
def sync_spotify_recently_played_task(self, user_id: str, task_id: str | None = None) -> dict | None:
    """Sync a user's recently played Spotify tracks into Otix as listened interactions."""
    try:
        return run_async(_sync_spotify_recently_played(user_id, task_id))
    except RateLimitError as e:
        raise self.retry(countdown=e.retry_after or 120) from e

async def _sync_spotify_recently_played(user_id: str, task_id: str | None = None) -> dict | None:
    from otix.services.spotify_auth_service import get_user_access_token
    from otix.services.spotify_library_service import sync_spotify_recently_played

    async with async_session() as session:
        user = await session.get(User, user_id)
        if user is None or user.spotify_id is None:
            return None

        token = await get_user_access_token(user)
        if token is None:
            logger.warning("spotify recently played sync failed, no valid token", user_id=user_id)
            return None

        result = await sync_spotify_recently_played(session, user, token, task_id=task_id)
        await session.commit()
        return result


# ── Playlist sync ──────────────────────────────────────────────────


@app.task(
    name="sync.spotify.sync_playlist",
    bind=True,
    max_retries=1,
)
def sync_spotify_playlist_task(
    self, user_id: str, playlist_id: str, playlist_name: str, task_id: str | None = None
) -> dict | None:
    """Sync a single Spotify playlist for a user into Otix."""
    try:
        return run_async(_sync_spotify_playlist(user_id, playlist_id, playlist_name, task_id))
    except RateLimitError as e:
        raise self.retry(countdown=e.retry_after or 120) from e

async def _sync_spotify_playlist(
    user_id: str, playlist_id: str, playlist_name: str, task_id: str | None = None
) -> dict | None:
    from otix.services.spotify_auth_service import get_user_access_token
    from otix.services.spotify_playlist_service import sync_playlist_to_library

    async with async_session() as session:
        user = await session.get(User, user_id)
        if user is None or user.spotify_id is None:
            return None

        token = await get_user_access_token(user)
        if token is None:
            logger.warning("spotify playlist sync failed, no valid token", user_id=user_id, playlist_id=playlist_id)
            return None

        result = await sync_playlist_to_library(
            session,
            user,
            token,
            playlist_id=playlist_id,
            playlist_name=playlist_name,
            task_id=task_id,
        )

        # Update subscription snapshot_id and last_synced_at
        from sqlalchemy import text

        snapshot = result.get("snapshot_id")
        if snapshot:
            await session.execute(
                text("""
                    UPDATE spotify_playlist_subscriptions
                    SET playlist_snapshot = :snapshot,
                        last_synced_at = :now
                    WHERE user_id = :user_id AND playlist_id = :playlist_id
                """),
                {
                    "snapshot": snapshot,
                    "now": datetime.now(UTC),
                    "user_id": user_id,
                    "playlist_id": playlist_id,
                },
            )

        await session.commit()
        return result


@app.task(
    name="sync.spotify.refresh_all_playlists",
    bind=True,
    max_retries=0,
)
def refresh_all_playlists_task(self) -> dict:
    """Refresh all subscribed playlists across all users.

    Queries subscriptions with auto_sync=True, checks snapshot_id,
    only syncs playlists that have changed.
    """
    try:
        return run_async(_refresh_all_playlists())
    except Exception:
        logger.exception("refresh all playlists failed")
        return {"error": "Refresh failed"}


async def _refresh_all_playlists() -> dict:
    from otix.services.spotify_auth_service import get_user_access_token
    from otix.services.spotify_playlist_service import sync_playlist_to_library

    async with async_session() as session:
        from sqlalchemy import text

        result = await session.execute(
            text("""
                SELECT sps.user_id, sps.playlist_id, sps.playlist_name, sps.playlist_snapshot,
                       u.spotify_id, u.spotify_access_token, u.spotify_refresh_token, u.spotify_token_expires_at
                FROM spotify_playlist_subscriptions sps
                JOIN users u ON u.id = sps.user_id
                WHERE sps.auto_sync = true
                ORDER BY sps.last_synced_at ASC NULLS FIRST
                LIMIT 50
            """)
        )
        rows = result.all()

        total = 0
        synced = 0
        skipped = 0

        for row in rows:
            import uuid

            user_id = str(row.user_id) if not isinstance(row.user_id, str) else row.user_id

            # Build user object with enough data for get_user_access_token
            user = User(
                id=user_id,
                spotify_id=row.spotify_id,
                spotify_access_token=row.spotify_access_token,
                spotify_refresh_token=row.spotify_refresh_token,
                spotify_token_expires_at=row.spotify_token_expires_at,
            )

            token = await get_user_access_token(user)
            if token is None:
                skipped += 1
                continue

            total += 1
            redis = await get_redis()

            # Check if playlist has changed
            from otix.providers.spotify.client import SpotifyProvider

            spotify = SpotifyProvider(redis)
            current_snapshot = row.playlist_snapshot

            try:
                playlist_info = await spotify.get_playlist(token, row.playlist_id, fields="snapshot_id")
                new_snapshot = playlist_info.get("snapshot_id")
                if new_snapshot and new_snapshot == current_snapshot:
                    skipped += 1
                    continue
            except Exception:
                skipped += 1
                continue

            # Playlist changed — sync it
            task_id = uuid.uuid4().hex[:16]
            await sync_playlist_to_library(
                session,
                user,
                token,
                playlist_id=row.playlist_id,
                playlist_name=row.playlist_name or "Unknown",
                task_id=task_id,
            )

            # Update snapshot
            await session.execute(
                text("""
                    UPDATE spotify_playlist_subscriptions
                    SET playlist_snapshot = :snapshot,
                        last_synced_at = :now
                    WHERE user_id = :user_id AND playlist_id = :playlist_id
                """),
                {
                    "snapshot": new_snapshot,
                    "now": datetime.now(UTC),
                    "user_id": user_id,
                    "playlist_id": row.playlist_id,
                },
            )

            synced += 1

        await session.commit()
        logger.info("spotify playlists refresh completed", total=total, synced=synced, skipped=skipped)
        return {"total": total, "synced": synced, "skipped": skipped}
