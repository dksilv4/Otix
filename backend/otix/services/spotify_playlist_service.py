"""Sync a user's Spotify playlists into Otix.

Matches tracks by Spotify ID, seeds missing albums, creates listened interactions.
Pattern mirrors SpotifyLibraryService.
"""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, Track
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.providers.spotify.client import SpotifyProvider

logger = structlog.get_logger()

SPOTIFY_PAGE_LIMIT_PLAYLISTS = 50
SPOTIFY_PAGE_LIMIT_TRACKS = 100


async def _fetch_all_user_playlists(access_token: str, spotify: SpotifyProvider) -> list[dict]:
    """Fetch all playlists for the current user, handling pagination."""
    items: list[dict] = []
    offset = 0
    while True:
        resp = await spotify.get_user_playlists(access_token, limit=SPOTIFY_PAGE_LIMIT_PLAYLISTS, offset=offset)
        page_items = resp.get("items", [])
        if not page_items:
            break
        items.extend(page_items)
        offset += len(page_items)
        total = resp.get("total")
        if total and offset >= total:
            break
    return items


async def _fetch_all_playlist_tracks(access_token: str, spotify: SpotifyProvider, playlist_id: str) -> list[dict]:
    """Fetch all tracks in a playlist, handling pagination."""
    items: list[dict] = []
    offset = 0
    while True:
        resp = await spotify.get_playlist_tracks(
            access_token, playlist_id, limit=SPOTIFY_PAGE_LIMIT_TRACKS, offset=offset
        )
        page_items = resp.get("items", [])
        if not page_items:
            break
        items.extend(page_items)
        offset += len(page_items)
        total = resp.get("total")
        if total and offset >= total:
            break
    return items


async def sync_playlist_to_library(
    session: AsyncSession,
    user: User,
    access_token: str,
    playlist_id: str,
    playlist_name: str,
    task_id: str | None = None,
) -> dict:
    """Fetch a playlist's tracks and sync them into Otix.

    Matches tracks by Spotify ID, seeds missing albums, creates listened interactions.
    Returns summary: {total_tracks, matched, seeded}
    """
    from otix.infrastructure.celery import app as celery_app  # noqa: I001
    from otix.lib.spotify_progress import publish_progress, store_result, store_progress
    from otix.services.interaction_service import InteractionService

    async def _emit(event_type: str, **kwargs) -> None:
        if task_id:
            await publish_progress(task_id, event_type, **kwargs)
            await store_progress(task_id, event_type, **kwargs)

    redis = await get_redis()
    spotify = SpotifyProvider(redis)

    await _emit("sync_started", playlist_id=playlist_id, playlist_name=playlist_name)

    try:
        # 1. Fetch playlist metadata (for snapshot_id)
        playlist_data = await spotify.get_playlist(access_token, playlist_id, fields="snapshot_id,name,owner")
        snapshot_id = playlist_data.get("snapshot_id")

        # 2. Fetch all tracks
        await _emit("fetching_tracks")
        track_items = await _fetch_all_playlist_tracks(access_token, spotify, playlist_id)
        await _emit("tracks_fetched", count=len(track_items))

        # 3. Extract track IDs and album mappings
        track_spotify_ids: list[str] = []
        album_spotify_ids: set[str] = set()
        track_to_album: dict[str, str] = {}

        for item in track_items:
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

        total_tracks = len(track_spotify_ids)

        # 4. Batch-match existing tracks by spotify_id
        await _emit("matching_tracks", count=total_tracks)
        if track_spotify_ids:
            result = await session.execute(
                select(ExternalID.external_id).where(
                    ExternalID.provider == "spotify",
                    ExternalID.entity_type == "track",
                    ExternalID.external_id.in_(track_spotify_ids),
                )
            )

        # 5. Find which albums already exist
        existing_albums: dict[str, str] = {}
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

        # 6. Match tracks to Otix albums
        track_media_map: dict[str, str] = {}
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
                    track_media_map[row.external_id] = row.album_id

        # 7. Count matched
        matched = 0
        seen_album_media_ids: set[str] = set()
        for track_id in track_spotify_ids:
            media_item_id = track_media_map.get(track_id) or existing_albums.get(track_to_album.get(track_id, ""))
            if media_item_id:
                matched += 1
                seen_album_media_ids.add(media_item_id)

        await _emit("tracks_matched", matched=matched, total=total_tracks)

        # 8. Seed missing albums
        seeded = 0
        missing_albums = album_spotify_ids - set(existing_albums)
        if missing_albums:
            await _emit("seeding_albums", count=len(missing_albums))

            for album_spotify_id in missing_albums:
                celery_app.send_task("sync.spotify.seed_album", args=[album_spotify_id])
                seeded += 1
        if missing_albums:
            await _emit("albums_seeded", count=seeded)

        # 9. Create listened interactions for matched albums
        if seen_album_media_ids:
            await _emit("creating_interactions", count=len(seen_album_media_ids))

            interaction_service = InteractionService(session)
            batch = [
                (mid, "listened", {"source": "spotify_playlist", "playlist_id": playlist_id})
                for mid in seen_album_media_ids
            ]
            await interaction_service.set_interactions_batch(user.id, batch)

        result = {
            "total_tracks": total_tracks,
            "matched": matched,
            "seeded": seeded,
            "snapshot_id": snapshot_id,
        }

        logger.info(
            "spotify playlist synced",
            user_id=user.id,
            playlist_id=playlist_id,
            playlist_name=playlist_name,
            total_tracks=total_tracks,
            matched=matched,
            seeded=seeded,
        )

        await _emit("sync_complete", **result)
        if task_id:
            await store_result(task_id, result)
        return result

    except Exception:
        logger.exception("spotify playlist sync failed", user_id=user.id, playlist_id=playlist_id)
        await _emit("error", message="Spotify playlist sync failed. Please try again.")
        if task_id:
            await store_result(task_id, {"error": "Sync failed"})
        raise
