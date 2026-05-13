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
from otix.domain.media import UserSteamGame
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
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemListResponse:
    if not current_user.plex_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plex library is only available when Plex is connected",
        )

    from otix.domain.media import MediaItem, UserPlexItem
    from sqlalchemy.orm import joinedload
    
    query = (
        select(MediaItem, UserPlexItem.view_count, UserPlexItem.last_viewed_at)
        .join(UserPlexItem, UserPlexItem.media_item_id == MediaItem.id)
        .options(
            joinedload(MediaItem.movie),
            joinedload(MediaItem.show),
            joinedload(MediaItem.game),
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
        summaries.append(summary)
        
    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


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
