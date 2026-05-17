"""Sync a user's Spotify library (liked tracks, saved albums) into Otix.

Matches by Spotify ID, seeds missing albums, and creates 'liked'/'listened' interactions.
"""

from __future__ import annotations

import structlog

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album, Track
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
                select(Track.spotify_id).where(
                    Track.spotify_id.in_(track_spotify_ids)
                )
            )
            existing_tracks = {row[0] for row in result if row[0]}

        # ── 3. Find which albums already exist in Otix ────────────────────
        existing_albums: dict[str, str] = {}  # album_spotify_id -> media_item_id
        if album_spotify_ids:
            album_result = await session.execute(
                select(Album.spotify_id, Album.media_item_id).where(
                    Album.spotify_id.in_(list(album_spotify_ids))
                )
            )
            for row in album_result:
                if row[0]:
                    existing_albums[row[0]] = row[1]

        # ── 4. For matched tracks, get Track -> MediaItem mapping ────────
        track_media_map: dict[str, str] = {}  # track_spotify_id -> media_item_id
        if track_spotify_ids:
            tr_result = await session.execute(
                select(Track.spotify_id, Track.album_id).where(
                    Track.spotify_id.in_(track_spotify_ids)
                )
            )
            for row in tr_result:
                if row[0]:
                    track_media_map[row[0]] = row[1]  # album_id IS media_item_id

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


def _seed_album_from_spotify(spotify_id: str) -> None:
    """Enqueue a Spotify album seeding task via the existing pipeline."""
    app.send_task("sync.spotify.seed_album", args=[spotify_id])
