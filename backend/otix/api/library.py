from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.media import (
    MediaItemListResponse,
    MediaItemSummary,
    SteamUnmatchedGameSummary,
    SteamUnmatchedListResponse,
    SteamWishlistItemSummary,
    SteamWishlistListResponse,
)
from otix.domain.media import Track, UserSteamGame
from otix.domain.user import User
from otix.services.interaction_service import InteractionService
from otix.services.steam_library_service import (
    get_steam_library,
    get_steam_wishlist,
    get_unmatched_steam_games,
)

library_router = APIRouter(prefix="/library", tags=["library"])

_LIBRARY_TYPES = {
    "watchlist": "watchlisted",
    "like": "liked",
    "watched": "watched",
    "played": "played",
    "listened": "listened",
}


async def _get_spotify_track_lookup(db: AsyncSession, spotify_ids: list[str]) -> dict[str, dict]:
    if not spotify_ids:
        return {}
    result = await db.execute(
        select(Track.spotify_id, Track.id, Track.avg_rating, Track.rating_count)
        .where(Track.spotify_id.in_(spotify_ids))
    )
    return {
        spotify_id: {
            "otixTrackId": track_id,
            "avgRating": avg_rating,
            "ratingCount": rating_count,
        }
        for spotify_id, track_id, avg_rating, rating_count in result.all()
        if spotify_id
    }


@library_router.get("/steam", response_model=MediaItemListResponse)
async def get_steam_library_tab(
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemListResponse:
    if not current_user.steam_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Steam library is only available when Steam is connected",
        )

    item_tuples, has_more, next_cursor = await get_steam_library(
        db, current_user.id, cursor=cursor, limit=limit
    )

    summaries: list[MediaItemSummary] = []
    for media_item, playtime_forever, playtime_2weeks, rtime_last_played in item_tuples:
        summary = MediaItemSummary.model_validate(media_item)
        summary.steam_playtime_forever = playtime_forever
        summary.steam_playtime_2weeks = playtime_2weeks
        summary.steam_rtime_last_played = rtime_last_played
        summaries.append(summary)

    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@library_router.get("/steam/status")
async def get_steam_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.steam_id:
        return {"game_count": 0, "last_scanned_at": None}

    result = await db.execute(
        select(
            func.count(UserSteamGame.id),
            func.max(UserSteamGame.updated_at),
        ).where(UserSteamGame.user_id == current_user.id)
    )
    count, last_scanned = result.one()
    return {
        "game_count": count or 0,
        "last_scanned_at": last_scanned.isoformat() if last_scanned else None,
    }


@library_router.get("/steam/unmatched", response_model=SteamUnmatchedListResponse)
async def get_steam_unmatched_games(
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SteamUnmatchedListResponse:
    if not current_user.steam_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Steam library is only available when Steam is connected",
        )

    items, has_more, next_cursor = await get_unmatched_steam_games(
        db, current_user.id, cursor=cursor, limit=limit
    )

    summaries = [SteamUnmatchedGameSummary.model_validate(g) for g in items]
    return SteamUnmatchedListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@library_router.get("/steam/wishlist", response_model=SteamWishlistListResponse)
async def get_steam_wishlist_tab(
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SteamWishlistListResponse:
    if not current_user.steam_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Steam wishlist is only available when Steam is connected",
        )

    item_tuples, has_more, next_cursor = await get_steam_wishlist(
        db, current_user.id, cursor=cursor, limit=limit
    )

    summaries: list[SteamWishlistItemSummary] = []
    for media_item, priority in item_tuples:
        summary = SteamWishlistItemSummary.model_validate(media_item)
        summary.steam_priority = priority
        summaries.append(summary)

    return SteamWishlistListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@library_router.get("/plex", response_model=MediaItemListResponse)
async def get_plex_library_tab(
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    media_type: str | None = Query(None, description="Filter by media type: movie, show, music"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemListResponse:
    if not current_user.plex_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plex library is only available when Plex is connected",
        )

    from otix.domain.media import MediaItem, UserPlexItem
    from otix.domain.people import MediaCredit
    from sqlalchemy.orm import joinedload, selectinload

    query = (
        select(MediaItem, UserPlexItem.view_count, UserPlexItem.last_viewed_at)
        .join(UserPlexItem, UserPlexItem.media_item_id == MediaItem.id)
        .options(
            joinedload(MediaItem.movie),
            joinedload(MediaItem.show),
            joinedload(MediaItem.game),
            joinedload(MediaItem.album),
            selectinload(MediaItem.credits).joinedload(MediaCredit.person),
        )
        .where(
            UserPlexItem.user_id == current_user.id,
            UserPlexItem.media_item_id.isnot(None),
        )
        .order_by(
            UserPlexItem.last_viewed_at.desc().nulls_last(),
            UserPlexItem.id
        )
    )

    if media_type:
        query = query.where(MediaItem.media_type == media_type)
    
    if cursor:
        try:
            offset = int(cursor)
        except ValueError:
            offset = 0
    else:
        offset = 0
        
    query = query.offset(offset).limit(limit + 1)
    
    result = await db.execute(query)
    rows = list(result.unique().all())
    
    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]
        
    next_cursor = str(offset + limit) if has_more else None
            
    summaries = []
    for media_item, view_count, last_viewed_at in rows:
        summary = MediaItemSummary.model_validate(media_item)
        summary.plex_view_count = view_count
        summary.plex_last_viewed_at = last_viewed_at
        if media_item.media_type == "music" and media_item.album:
            summary.album_track_count = media_item.album.track_count
            if media_item.credits:
                artist_credit = next(
                    (c for c in media_item.credits if c.role in ("artist", "primary") and c.person),
                    media_item.credits[0] if media_item.credits[0].person else None,
                )
                if artist_credit and artist_credit.person:
                    summary.album_artist_name = artist_credit.person.name
        summaries.append(summary)
        
    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@library_router.get("/plex/thumb/{media_item_id}")
async def get_plex_thumb(
    media_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Redirect to the Plex server's authenticated thumbnail for a media item."""
    from fastapi.responses import RedirectResponse

    from otix.domain.media import UserPlexItem, UserPlexServer

    plex_item = await db.scalar(
        select(UserPlexItem).where(
            UserPlexItem.user_id == current_user.id,
            UserPlexItem.media_item_id == media_item_id,
        )
    )
    if plex_item is None or not plex_item.thumb_url:
        raise HTTPException(status_code=404, detail="No Plex thumbnail for this item")

    server = await db.get(UserPlexServer, plex_item.server_id)
    if server is None or not server.base_url:
        raise HTTPException(status_code=404, detail="Plex server not found")

    token = server.access_token or current_user.plex_auth_token
    if not token:
        raise HTTPException(status_code=404, detail="No Plex auth token")

    thumb = plex_item.thumb_url
    url = f"{server.base_url}{thumb}" if thumb.startswith("/") else thumb
    url = f"{url}{'&' if '?' in url else '?'}X-Plex-Token={token}"

    return RedirectResponse(url=url)


@library_router.get("/plex/status")
async def get_plex_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.plex_id:
        return {"item_count": 0, "last_scanned_at": None}

    from otix.domain.media import UserPlexItem
    result = await db.execute(
        select(
            func.count(UserPlexItem.id),
            func.max(UserPlexItem.updated_at),
        ).where(UserPlexItem.user_id == current_user.id)
    )
    count, last_scanned = result.one()
    return {
        "item_count": count or 0,
        "last_scanned_at": last_scanned.isoformat() if last_scanned else None,
    }


@library_router.get("/spotify", response_model=MediaItemListResponse)
async def get_spotify_library_tab(
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemListResponse:
    if not current_user.spotify_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spotify library is only available when Spotify is connected",
        )

    from sqlalchemy.orm import joinedload
    from otix.domain.media import Album, MediaItem
    from otix.infrastructure.redis import get_redis

    redis = await get_redis()
    key = f"spotify:library:{current_user.id}:albums"
    all_album_ids = await redis.smembers(key)

    if not all_album_ids:
        return MediaItemListResponse(items=[], next_cursor=None, has_more=False)

    album_id_list = [aid.decode() if isinstance(aid, bytes) else aid for aid in all_album_ids]

    query = (
        select(MediaItem)
        .join(Album, Album.media_item_id == MediaItem.id)
        .options(
            joinedload(MediaItem.movie),
            joinedload(MediaItem.show),
            joinedload(MediaItem.game),
            joinedload(MediaItem.album),
        )
        .where(Album.spotify_id.in_(album_id_list))
        .order_by(MediaItem.popularity.desc(), MediaItem.id)
    )

    if cursor:
        try:
            cursor_pop, cursor_id = cursor.split("__", 1)
            cursor_pop = float(cursor_pop)
            query = query.where(
                (MediaItem.popularity < cursor_pop)
                | ((MediaItem.popularity == cursor_pop) & (MediaItem.id > cursor_id))
            )
        except (ValueError, TypeError):
            pass

    query = query.limit(limit + 1)
    result = await db.execute(query)
    rows = list(result.unique().scalars().all())

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = f"{last.popularity}__{last.id}"

    summaries = [MediaItemSummary.model_validate(item) for item in rows]
    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@library_router.get("/spotify/status")
async def get_spotify_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.spotify_id:
        return {"track_count": 0, "last_scanned_at": None}

    from otix.infrastructure.redis import get_redis

    redis = await get_redis()
    key = f"spotify:library:{current_user.id}:albums"
    count = await redis.scard(key)

    ttl = await redis.ttl(key)
    last_scanned_at = None
    if ttl > 0:
        from datetime import datetime, timezone
        last_scanned_at = datetime.now(timezone.utc).isoformat()

    return {
        "track_count": count or 0,
        "last_scanned_at": last_scanned_at,
    }



@library_router.get("/spotify/tracks")
async def get_spotify_liked_tracks(
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return the user's Spotify liked/saved tracks with pagination."""
    if not current_user.spotify_id:
        raise HTTPException(status_code=400, detail="Spotify account not linked")

    from otix.infrastructure.redis import get_redis
    from otix.providers.spotify.client import SpotifyProvider
    from otix.services.spotify_auth_service import get_user_access_token

    token = await get_user_access_token(current_user)
    if not token:
        raise HTTPException(status_code=502, detail="Unable to get Spotify token")

    redis = await get_redis()
    provider = SpotifyProvider(redis)

    try:
        raw = await provider.get_user_saved_tracks(token, limit=limit, offset=offset)
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to fetch liked tracks")

    raw_items = raw.get("items") or []
    tracks = []
    for item in raw_items:
        t = item.get("track")
        if not t:
            continue
        album = t.get("album", {})
        album_images = album.get("images", [])
        artists = t.get("artists", [])
        tracks.append({
            "id": t.get("id"),
            "name": t.get("name"),
            "artist": artists[0].get("name") if artists else "Unknown",
            "albumName": album.get("name"),
            "albumArt": album_images[0].get("url") if album_images else None,
            "durationMs": t.get("duration_ms"),
            "uri": t.get("uri"),
            "previewUrl": t.get("preview_url"),
            "spotifyLiked": True,
        })

    track_lookup = await _get_spotify_track_lookup(db, [t["id"] for t in tracks if t.get("id")])
    for track in tracks:
        track.update(track_lookup.get(track["id"], {"otixTrackId": None, "avgRating": None, "ratingCount": 0}))

    total = raw.get("total", 0) or 0
    next_offset = offset + len(raw_items)
    has_more = next_offset > offset and (bool(raw.get("next")) or next_offset < total)

    return {
        "tracks": tracks,
        "total": total,
        "next_offset": next_offset if has_more else None,
        "has_more": has_more,
    }


@library_router.put("/spotify/tracks/{track_id}/liked")
async def save_spotify_track_to_liked(
    track_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Save a Spotify track to the user's liked songs."""
    if not current_user.spotify_id:
        raise HTTPException(status_code=400, detail="Spotify account not linked")

    from otix.infrastructure.redis import get_redis
    from otix.providers.spotify.client import SpotifyProvider
    from otix.services.spotify_auth_service import get_user_access_token

    token = await get_user_access_token(current_user)
    if not token:
        raise HTTPException(status_code=502, detail="Unable to get Spotify token")

    redis = await get_redis()
    provider = SpotifyProvider(redis)

    try:
        await provider.save_user_tracks(token, [track_id])
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to save track to Spotify")

    return {"id": track_id, "spotifyLiked": True}


@library_router.get("/{tab}", response_model=MediaItemListResponse)
async def get_library_tab(
    tab: str,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemListResponse:
    interaction_type = _LIBRARY_TYPES.get(tab)
    if interaction_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown library tab. Must be one of: {', '.join(sorted(_LIBRARY_TYPES))}",
        )

    service = InteractionService(db)
    items, has_more, next_cursor = await service.list_user_interactions(
        user_id=current_user.id,
        interaction_type=interaction_type,
        cursor=cursor,
        limit=limit,
    )

    summaries = [MediaItemSummary.model_validate(item) for item in items]

    # All items in this tab have this interaction_type active
    auto_state = {t: t == interaction_type for t in ("liked", "watchlisted", "watched", "played", "started", "listened")}
    for summary in summaries:
        summary.user_interactions = UserInteractionState(**auto_state)

    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )
