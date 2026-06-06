from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api._utils import get_current_user, get_db
from otix.schemas.media import MediaItemListResponse, MediaItemSummary
from otix.domain.media import Album, ExternalID, MediaItem
from otix.domain.user import User
from otix.services.spotify_auth_service import get_user_access_token

logger = structlog.get_logger()

router = APIRouter()


async def _get_spotify_track_lookup(db: AsyncSession, spotify_ids: list[str]) -> dict[str, dict]:
    """Look up Otix track IDs for a list of Spotify track IDs."""
    if not spotify_ids:
        return {}
    from otix.domain.media import Track
    result = await db.execute(
        select(ExternalID.external_id, Track.id, Track.avg_rating, Track.rating_count)
        .join(Track, Track.id == ExternalID.entity_id)
        .where(
            ExternalID.provider == "spotify",
            ExternalID.entity_type == "track",
            ExternalID.external_id.in_(spotify_ids),
        )
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


@router.get("/spotify", response_model=MediaItemListResponse)
async def get_spotify_library_tab(
    request: Request,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemListResponse:
    """Get the authenticated user's Spotify library (saved albums)."""
    ip = request.client.host if request.client else None

    if not current_user.spotify_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Spotify library is only available when Spotify is connected",
        )

    from otix.infrastructure.redis import get_redis

    try:
        redis = await get_redis()
        key = f"spotify:library:{current_user.id}:albums"
        all_album_ids = await redis.smembers(key)
    except Exception:
        logger.exception("failed to fetch spotify library from redis", user_id=current_user.id, ip=ip)
        raise

    if not all_album_ids:
        return MediaItemListResponse(items=[], next_cursor=None, has_more=False)

    album_id_list = [aid.decode() if isinstance(aid, bytes) else aid for aid in all_album_ids]

    query = (
        select(MediaItem)
        .join(Album, Album.media_item_id == MediaItem.id)
        .join(ExternalID, and_(
            ExternalID.entity_id == Album.media_item_id,
            ExternalID.entity_type == "media_item",
            ExternalID.provider == "spotify",
        ))
        .options(
            joinedload(MediaItem.movie),
            joinedload(MediaItem.show),
            joinedload(MediaItem.game),
            joinedload(MediaItem.album),
        )
        .where(ExternalID.external_id.in_(album_id_list))
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

    try:
        result = await db.execute(query)
        rows = list(result.unique().scalars().all())
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch spotify library", user_id=current_user.id, ip=ip)
        raise

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = f"{last.popularity}__{last.id}"

    summaries = [MediaItemSummary.model_validate(item) for item in rows]
    logger.info("spotify library fetched", user_id=current_user.id, count=len(summaries), ip=ip)
    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/spotify/status")
async def get_spotify_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get Spotify library sync status (track count, last scanned)."""
    ip = request.client.host if request.client else None

    if not current_user.spotify_id:
        return {"track_count": 0, "last_scanned_at": None}

    from otix.infrastructure.redis import get_redis

    try:
        redis = await get_redis()
        key = f"spotify:library:{current_user.id}:albums"
        count = await redis.scard(key)

        ttl = await redis.ttl(key)
        last_scanned_at = None
        if ttl > 0:
            from datetime import datetime, timezone
            last_scanned_at = datetime.now(timezone.utc).isoformat()
    except Exception:
        logger.exception("failed to fetch spotify status", user_id=current_user.id, ip=ip)
        raise

    logger.info("spotify status fetched", user_id=current_user.id, ip=ip)
    return {
        "track_count": count or 0,
        "last_scanned_at": last_scanned_at,
    }


@router.get("/spotify/tracks")
async def get_spotify_liked_tracks(
    request: Request,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Return the user's Spotify liked/saved tracks with pagination."""
    ip = request.client.host if request.client else None

    if not current_user.spotify_id:
        raise HTTPException(status_code=400, detail="Spotify account not linked")

    from otix.infrastructure.redis import get_redis
    from otix.providers.spotify.client import SpotifyProvider

    try:
        token = await get_user_access_token(current_user, session=db)
        if not token:
            if current_user.spotify_id is None:
                raise HTTPException(
                    status_code=status.HTTP_410_GONE,
                    detail="Spotify account was disconnected because access was revoked externally. "
                    "Please re-link your account.",
                )
            raise HTTPException(status_code=502, detail="Unable to get Spotify token")

        redis = await get_redis()
        provider = SpotifyProvider(redis)

        raw = await provider.get_user_saved_tracks(token, limit=limit, offset=offset)
    except HTTPException:
        raise
    except Exception:
        logger.exception("failed to fetch spotify liked tracks", user_id=current_user.id, ip=ip)
        raise

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

    logger.info("spotify liked tracks fetched", user_id=current_user.id, count=len(tracks), ip=ip)
    return {
        "tracks": tracks,
        "total": total,
        "next_offset": next_offset if has_more else None,
        "has_more": has_more,
    }


@router.put("/spotify/tracks/{track_id}/liked")
async def save_spotify_track_to_liked(
    track_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
) -> dict:
    """Save a Spotify track to the user's liked songs."""
    ip = request.client.host if request.client else None

    if not current_user.spotify_id:
        raise HTTPException(status_code=400, detail="Spotify account not linked")

    from otix.infrastructure.redis import get_redis
    from otix.providers.spotify.client import SpotifyProvider

    try:
        token = await get_user_access_token(current_user)
        if not token:
            raise HTTPException(status_code=502, detail="Unable to get Spotify token")

        redis = await get_redis()
        provider = SpotifyProvider(redis)
        await provider.save_user_tracks(token, [track_id])
    except HTTPException:
        raise
    except Exception:
        logger.exception("failed to save track to spotify", track_id=track_id, user_id=current_user.id, ip=ip)
        raise

    logger.info("spotify track saved to liked", track_id=track_id, user_id=current_user.id, ip=ip)
    return {"id": track_id, "spotifyLiked": True}
