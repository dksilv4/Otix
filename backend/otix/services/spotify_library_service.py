"""Sync a user's Spotify library (liked tracks, saved albums) into Otix.

Matches by Spotify ID, seeds missing albums, and creates 'liked'/'listened' interactions.
"""

from __future__ import annotations

import structlog

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import Album, Track, UserSpotifyPlaylist, UserSpotifyPlaylistTrack
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


async def _fetch_all_playlists(access_token: str, spotify: SpotifyProvider) -> list[dict]:
    """Fetch all user playlists from Spotify, handling pagination."""
    playlists: list[dict] = []
    offset = 0
    while True:
        resp = await spotify.get_user_playlists(access_token, limit=SPOTIFY_PAGE_LIMIT, offset=offset)
        page_items = resp.get("items", [])
        if not page_items:
            break
        playlists.extend(page_items)
        offset += len(page_items)
        if resp.get("total") and offset >= resp["total"]:
            break
    return playlists


async def _fetch_all_playlist_tracks(access_token: str, spotify: SpotifyProvider, playlist_id: str) -> list[dict]:
    """Fetch all tracks for a playlist from Spotify, handling pagination."""
    items: list[dict] = []
    offset = 0
    while True:
        resp = await spotify.get_playlist_tracks(access_token, playlist_id, limit=100, offset=offset)
        page_items = resp.get("items", [])
        if not page_items:
            break
        for item in page_items:
            track = item.get("track")
            if track and track.get("id"):
                items.append(track)
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

        # ── 7. Sync user playlists ─────────────────────────────────────────
        await _emit("fetching_playlists")
        playlists = await _fetch_all_playlists(access_token, spotify)
        await _emit("playlists_fetched", count=len(playlists))

        playlist_count = 0
        if playlists:
            # Get existing playlist IDs for this user
            existing_pl_result = await session.execute(
                select(UserSpotifyPlaylist.spotify_id).where(
                    UserSpotifyPlaylist.user_id == user.id
                )
            )
            existing_spotify_ids = {row[0] for row in existing_pl_result}

            for pl in playlists:
                spotify_id = pl.get("id")
                if not spotify_id:
                    continue

                images = pl.get("images", [])
                image_url = images[0].get("url") if images else None
                owner = pl.get("owner", {})
                name = pl.get("name") or "Untitled"
                description = pl.get("description")
                track_count = pl.get("tracks", {}).get("total", 0) or 0

                if spotify_id in existing_spotify_ids:
                    # Update existing
                    result = await session.execute(
                        select(UserSpotifyPlaylist).where(
                            UserSpotifyPlaylist.user_id == user.id,
                            UserSpotifyPlaylist.spotify_id == spotify_id,
                        )
                    )
                    existing = result.scalar_one_or_none()
                    if existing:
                        existing.name = name
                        existing.description = description
                        existing.image_url = image_url
                        existing.track_count = track_count
                else:
                    session.add(
                        UserSpotifyPlaylist(
                            user_id=user.id,
                            spotify_id=spotify_id,
                            name=name,
                            description=description,
                            image_url=image_url,
                            track_count=track_count,
                            spotify_url=pl.get("external_urls", {}).get("spotify"),
                        )
                    )
                playlist_count += 1

        await session.flush()

        # ── 8. Sync playlist tracks ───────────────────────────────────────
        playlist_track_count = 0
        if playlists:
            await _emit("fetching_playlist_tracks", count=len(playlists))

            for pl in playlists:
                pl_spotify_id = pl.get("id")
                if not pl_spotify_id:
                    continue

                # Get the persistent playlist row
                pl_result = await session.execute(
                    select(UserSpotifyPlaylist).where(
                        UserSpotifyPlaylist.user_id == user.id,
                        UserSpotifyPlaylist.spotify_id == pl_spotify_id,
                    )
                )
                pl_row = pl_result.scalar_one_or_none()
                if not pl_row:
                    continue

                # Fetch all tracks for this playlist
                sp_tracks = await _fetch_all_playlist_tracks(access_token, spotify, pl_spotify_id)

                # Delete removed tracks (ones no longer in Spotify)
                incoming_ids = {t["id"] for t in sp_tracks if t.get("id")}
                existing_track_ids = await session.execute(
                    select(UserSpotifyPlaylistTrack.id, UserSpotifyPlaylistTrack.spotify_track_id).where(
                        UserSpotifyPlaylistTrack.playlist_id == pl_row.id
                    )
                )
                for track_id, spotify_track_id in existing_track_ids.all():
                    if spotify_track_id not in incoming_ids:
                        await session.delete(
                            await session.get(UserSpotifyPlaylistTrack, track_id)
                        )

                # Upsert incoming tracks
                for i, t in enumerate(sp_tracks):
                    stid = t.get("id")
                    if not stid:
                        continue
                    album = t.get("album", {})
                    album_images = album.get("images", [])
                    artists = t.get("artists", [])

                    existing_track = await session.scalar(
                        select(UserSpotifyPlaylistTrack).where(
                            UserSpotifyPlaylistTrack.playlist_id == pl_row.id,
                            UserSpotifyPlaylistTrack.spotify_track_id == stid,
                        )
                    )
                    if existing_track:
                        existing_track.name = t.get("name") or "Untitled"
                        existing_track.artist_name = artists[0].get("name") if artists else "Unknown Artist"
                        existing_track.album_name = album.get("name")
                        existing_track.album_image_url = album_images[0].get("url") if album_images else None
                        existing_track.duration_ms = t.get("duration_ms")
                        existing_track.uri = t.get("uri")
                        existing_track.preview_url = t.get("preview_url")
                        existing_track.position = i
                    else:
                        session.add(
                            UserSpotifyPlaylistTrack(
                                playlist_id=pl_row.id,
                                spotify_track_id=stid,
                                name=t.get("name") or "Untitled",
                                artist_name=artists[0].get("name") if artists else "Unknown Artist",
                                album_name=album.get("name"),
                                album_image_url=album_images[0].get("url") if album_images else None,
                                duration_ms=t.get("duration_ms"),
                                uri=t.get("uri"),
                                preview_url=t.get("preview_url"),
                                position=i,
                                added_at=t.get("added_at"),
                            )
                        )
                    playlist_track_count += 1

            await session.flush()
            await _emit("playlist_tracks_synced", count=playlist_track_count)

        logger.info(
            "spotify library synced",
            user_id=user.id,
            liked_total=liked_total,
            liked_matched=liked_matched,
            liked_seeded=liked_seeded,
            playlist_count=playlist_count,
            playlist_track_count=playlist_track_count,
        )

        result = {
            "liked_total": liked_total,
            "liked_matched": liked_matched,
            "liked_seeded": liked_seeded,
            "playlist_count": playlist_count,
            "playlist_track_count": playlist_track_count,
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
