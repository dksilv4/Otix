"""Sync a user's Spotify library (liked tracks, saved albums) into Otix.

Matches by Spotify ID, seeds missing albums, and creates 'liked'/'listened' interactions.
"""

from __future__ import annotations

import structlog

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album, ExternalID, Track
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.redis import get_redis
from otix.providers.spotify.client import SpotifyProvider

logger = structlog.get_logger()

SPOTIFY_PAGE_LIMIT = 50  # Spotify's max per page


async def _fetch_all_liked_tracks(access_token: str, spotify: SpotifyProvider) -> list[dict]:
    """Fetch all saved/liked tracks from Spotify, handling pagination."""
    items: list[dict] = []
    offset = 0
    while True:
        resp = await spotify.get_user_saved_tracks(access_token, limit=SPOTIFY_PAGE_LIMIT, offset=offset)
        page_items = resp.get("items", [])
        if not page_items:
            break
        items.extend(page_items)
        offset += len(page_items)
        if resp.get("total") and offset >= resp["total"]:
            break
    return items


async def _fetch_all_saved_albums(access_token: str, spotify: SpotifyProvider) -> list[dict]:
    """Fetch all saved albums from Spotify, handling pagination."""
    items: list[dict] = []
    offset = 0
    while True:
        resp = await spotify.get_user_saved_albums(access_token, limit=SPOTIFY_PAGE_LIMIT, offset=offset)
        page_items = resp.get("items", [])
        if not page_items:
            break
        items.extend(page_items)
        offset += len(page_items)
        if resp.get("total") and offset >= resp["total"]:
            break
    return items


async def sync_spotify_user_library(
    session: AsyncSession,
    user: User,
    access_token: str,
    task_id: str | None = None,
) -> dict:
    """Sync user's liked tracks and saved albums into Otix.

    If task_id is provided, publishes progress events via Redis pub/sub for SSE streaming.
    Returns summary: {liked_total, liked_matched, liked_seeded}
    """
    from otix.lib.spotify_progress import publish_progress, store_result, store_progress

    async def _emit(event_type: str, **kwargs) -> None:
        if task_id:
            await publish_progress(task_id, event_type, **kwargs)
            await store_progress(task_id, event_type, **kwargs)

    redis = await get_redis()
    spotify = SpotifyProvider(redis)

    await _emit("sync_started")

    try:
        # ── 1. Fetch liked tracks ───────────────────────────────────────
        await _emit("fetching_tracks")
        liked_items = await _fetch_all_liked_tracks(access_token, spotify)
        await _emit("tracks_fetched", count=len(liked_items))

        # Extract unique album and track Spotify IDs
        track_spotify_ids: list[str] = []
        album_spotify_ids: set[str] = set()
        track_to_album: dict[str, str] = {}  # track_spotify_id -> album_spotify_id
        album_meta: dict[str, dict] = {}  # album_spotify_id -> {name, artist_name}

        for item in liked_items:
            track_data = item.get("track")
            if not track_data or not track_data.get("id"):
                continue
            track_id = track_data["id"]
            track_spotify_ids.append(track_id)

            album_data = track_data.get("album", {})
            album_id = album_data.get("id")
            if album_id:
                album_spotify_ids.add(album_id)
                track_to_album[track_id] = album_id
                if album_id not in album_meta:
                    artists = album_data.get("artists", [])
                    album_meta[album_id] = {
                        "name": album_data.get("name", "Unknown Album"),
                        "artist_name": artists[0].get("name", "Unknown Artist") if artists else "Unknown Artist",
                    }

        liked_total = len(track_spotify_ids)

        # ── 2. Batch-lookup existing tracks by spotify_id ────────────────
        await _emit("matching_tracks", count=liked_total)
        existing_tracks: set[str] = set()
        if track_spotify_ids:
            result = await session.execute(
                select(ExternalID.external_id).where(
                    ExternalID.provider == "spotify",
                    ExternalID.entity_type == "track",
                    ExternalID.external_id.in_(track_spotify_ids),
                )
            )
            existing_tracks = {row[0] for row in result if row[0]}

        # ── 3. Find which albums already exist in Otix ────────────────────
        existing_albums: dict[str, str] = {}  # album_spotify_id -> media_item_id
        if album_spotify_ids:
            album_result = await session.execute(
                select(ExternalID.external_id, ExternalID.entity_id).where(
                    ExternalID.provider == "spotify",
                    ExternalID.entity_type == "media_item",
                    ExternalID.external_id.in_(list(album_spotify_ids)),
                )
            )
            for row in album_result:
                if row.external_id:
                    existing_albums[row.external_id] = row.entity_id

        # ── 4. For matched tracks, get Track -> MediaItem mapping ────────
        track_media_map: dict[str, str] = {}  # track_spotify_id -> media_item_id
        if track_spotify_ids:
            tr_result = await session.execute(
                select(ExternalID.external_id, Track.album_id)
                .join(Track, Track.id == ExternalID.entity_id)
                .where(
                    ExternalID.provider == "spotify",
                    ExternalID.entity_type == "track",
                    ExternalID.external_id.in_(track_spotify_ids),
                )
            )
            for row in tr_result:
                if row.external_id:
                    track_media_map[row.external_id] = row.album_id  # album_id IS media_item_id

        # ── 5. Count matched tracks (no interaction records — Spotify tab
        #        queries by Album.spotify_id directly, matching Steam pattern)
        liked_matched = 0
        for track_id in track_spotify_ids:
            media_item_id = track_media_map.get(track_id) or existing_albums.get(track_to_album.get(track_id, ""))
            if media_item_id:
                liked_matched += 1

        await _emit("tracks_matched", matched=liked_matched, total=liked_total)

        # ── 6. Seed missing albums via existing Spotify catalog pipeline ─
        liked_seeded = 0
        missing_albums = album_spotify_ids - set(existing_albums)
        if missing_albums:
            await _emit("seeding_albums", count=len(missing_albums))
        for album_spotify_id in missing_albums:
            _seed_album_from_spotify(album_spotify_id)
            liked_seeded += 1
        if missing_albums:
            await _emit("albums_seeded", count=liked_seeded)

        await session.flush()

        # Store album Spotify IDs in Redis so /library/spotify can query them.
        # Also store matched media_item_ids for items already in the catalog.
        matched_album_spotify_ids = {
            aid for aid in album_spotify_ids if aid in existing_albums
        }
        all_album_spotify_ids = album_spotify_ids | set(existing_albums)
        if all_album_spotify_ids:
            key = f"spotify:library:{user.id}:albums"
            await redis.sadd(key, *all_album_spotify_ids)
            # Keep the set fresh for 7 days; re-sync resets the TTL
            await redis.expire(key, 7 * 24 * 3600)

        logger.info(
            "spotify library synced",
            user_id=user.id,
            liked_total=liked_total,
            liked_matched=liked_matched,
            liked_seeded=liked_seeded,
        )

        result = {
            "liked_total": liked_total,
            "liked_matched": liked_matched,
            "liked_seeded": liked_seeded,
        }
        await _emit("sync_complete", **result)
        if task_id:
            await store_result(task_id, result)
        return result

    except Exception:
        logger.exception("spotify library sync failed", user_id=user.id)
        await _emit("error", message="Spotify library sync failed. Please try again.")
        if task_id:
            await store_result(task_id, {"error": "Sync failed"})
        raise


async def sync_spotify_recently_played(
    session: AsyncSession,
    user: User,
    access_token: str,
    task_id: str | None = None,
) -> dict:
    """Sync user's recently played tracks from Spotify, creating 'listened' interactions.

    Uses a Redis cursor so each poll only fetches plays since the last sync.
    Returns summary: {total, matched, seeded}
    """
    from otix.lib.spotify_progress import publish_progress, store_result, store_progress
    from otix.services.interaction_service import InteractionService

    async def _emit(event_type: str, **kwargs) -> None:
        if task_id:
            await publish_progress(task_id, event_type, **kwargs)
            await store_progress(task_id, event_type, **kwargs)

    redis = await get_redis()
    spotify = SpotifyProvider(redis)
    interaction_service = InteractionService(session)

    await _emit("sync_started")

    try:
        # ── 1. Read cursor ───────────────────────────────────────────────
        cursor_key = f"spotify:recently_played:{user.id}:after"
        cursor_raw = await redis.get(cursor_key)
        after_ms: int | None = int(cursor_raw) if cursor_raw else None

        # ── 2. Fetch recently played ─────────────────────────────────────
        await _emit("fetching_tracks")
        resp = await spotify.get_user_recently_played(access_token, limit=50, after=after_ms)
        items = resp.get("items", []) or []
        await _emit("tracks_fetched", count=len(items))

        if not items:
            await _emit("sync_complete", total=0, matched=0, seeded=0)
            if task_id:
                await store_result(task_id, {"total": 0, "matched": 0, "seeded": 0})
            return {"total": 0, "matched": 0, "seeded": 0}

        # ── 3. Extract track → album mappings ────────────────────────────
        track_spotify_ids: list[str] = []
        track_played_at: dict[str, str] = {}  # track_spotify_id -> played_at ISO8601
        track_to_album: dict[str, str] = {}  # track_spotify_id -> album_spotify_id

        for entry in items:
            track_data = entry.get("track")
            if not track_data or not track_data.get("id"):
                continue
            track_id = track_data["id"]
            track_spotify_ids.append(track_id)
            track_played_at[track_id] = entry.get("played_at", "")

            album_data = track_data.get("album", {})
            album_id = album_data.get("id")
            if album_id:
                track_to_album[track_id] = album_id

        total = len(track_spotify_ids)

        # ── 4. Match tracks to Otix albums ───────────────────────────────
        await _emit("matching_tracks", count=total)
        track_album_map: dict[str, str] = {}  # track_spotify_id -> album media_item_id
        missing_album_ids: set[str] = set()
        seen_album_media_ids: set[str] = set()

        if track_spotify_ids:
            result = await session.execute(
                select(ExternalID.external_id, Track.album_id)
                .join(Track, Track.id == ExternalID.entity_id)
                .where(
                    ExternalID.provider == "spotify",
                    ExternalID.entity_type == "track",
                    ExternalID.external_id.in_(track_spotify_ids),
                )
            )
            for row in result:
                if row.external_id:
                    track_album_map[row.external_id] = row.album_id

        matched = 0
        seeded = 0
        for track_id in track_spotify_ids:
            media_item_id = track_album_map.get(track_id)
            if media_item_id:
                matched += 1
                seen_album_media_ids.add(media_item_id)
            else:
                album_spotify_id = track_to_album.get(track_id)
                if album_spotify_id:
                    missing_album_ids.add(album_spotify_id)

        await _emit("tracks_matched", matched=matched, total=total)

        # ── 5. Create listened interactions (batch upsert) ──────────────
        if seen_album_media_ids:
            # Build album_id -> latest_played_at map efficiently
            album_played_at: dict[str, str] = {}
            for track_id, album_id in track_album_map.items():
                at = track_played_at.get(track_id, "")
                if at > album_played_at.get(album_id, ""):
                    album_played_at[album_id] = at

            batch = []
            for media_item_id in seen_album_media_ids:
                extra = {"source": "spotify_recently_played"}
                latest = album_played_at.get(media_item_id, "")
                if latest:
                    extra["played_at"] = latest
                batch.append((media_item_id, "listened", extra))

            listened_count = await interaction_service.set_interactions_batch(
                user.id, batch
            )
        else:
            listened_count = 0

        if listened_count:
            await _emit("interactions_created", count=listened_count)

        # ── 6. Seed missing albums ───────────────────────────────────────
        if missing_album_ids:
            await _emit("seeding_albums", count=len(missing_album_ids))
        for album_spotify_id in missing_album_ids:
            _seed_album_from_spotify(album_spotify_id)
            seeded += 1
        if missing_album_ids:
            await _emit("albums_seeded", count=seeded)

        await session.flush()

        # ── 7. Update cursor to newest played_at ────────────────────────
        newest_played_at = max(
            (e.get("played_at", "") for e in items if e.get("played_at")),
            default="",
        )
        if newest_played_at:
            # Convert ISO8601 to Unix ms for the Spotify API `after` param
            try:
                from datetime import datetime, timezone
                dt = datetime.fromisoformat(newest_played_at.replace("Z", "+00:00"))
                new_cursor = int(dt.timestamp() * 1000)
                await redis.set(cursor_key, new_cursor, ex=7 * 24 * 3600)
            except (ValueError, OSError):
                pass

        result = {"total": total, "matched": matched, "seeded": seeded}
        logger.info(
            "spotify recently played synced",
            user_id=user.id, **result, listened_count=listened_count,
        )
        await _emit("sync_complete", **result)
        if task_id:
            await store_result(task_id, result)
        return result

    except Exception:
        logger.exception("spotify recently played sync failed", user_id=user.id)
        await _emit("error", message="Spotify recently played sync failed. Please try again.")
        if task_id:
            await store_result(task_id, {"error": "Sync failed"})
        raise


def _seed_album_from_spotify(spotify_id: str) -> None:
    """Enqueue a Spotify album seeding task via the existing pipeline."""
    app.send_task("sync.spotify.seed_album", args=[spotify_id])
