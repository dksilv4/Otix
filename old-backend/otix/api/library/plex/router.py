from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from otix.api.deps import get_current_user, get_db
from otix.domain.media import MediaItem, UserPlexItem, UserPlexServer
from otix.domain.people import MediaCredit, Person
from otix.domain.user import User
from otix.schemas.media import MediaItemListResponse, MediaItemSummary
from otix.services.asset_selection import enrich_items_with_assets

logger = structlog.get_logger()

router = APIRouter()

SORT_OPTIONS = {
    "recent": ("Recently added/played", "default"),
    "artist": ("Artist A-Z", "artist"),
    "title": ("Title A-Z", "title"),
    "year": ("Release year", "year"),
}


@router.get("/plex", response_model=MediaItemListResponse)
async def get_plex_library_tab(
    request: Request,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    media_type: str | None = Query(None, description="Filter by media type: movie, show, music"),
    sort_by: str | None = Query(None, description="Sort order: recent, artist, title, year"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemListResponse:
    """Get the authenticated user's Plex library with pagination and sorting."""
    ip = request.client.host if request.client else None

    if not current_user.plex_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plex library is only available when Plex is connected",
        )

    query = (
        select(MediaItem, UserPlexItem)
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
    )

    if sort_by == "artist":
        artist_subq = (
            select(Person.name)
            .join(MediaCredit, MediaCredit.person_id == Person.id)
            .where(
                MediaCredit.media_item_id == MediaItem.id,
                MediaCredit.role.in_(["artist", "primary"]),
            )
            .order_by(Person.name)
            .limit(1)
            .correlate(MediaItem)
        )
        query = query.order_by(nulls_last(asc(artist_subq)), MediaItem.title.asc())
    elif sort_by == "title":
        query = query.order_by(MediaItem.title.asc(), UserPlexItem.id)
    elif sort_by == "year":
        query = query.order_by(MediaItem.release_date.desc().nulls_last(), UserPlexItem.id)
    else:
        query = query.order_by(UserPlexItem.last_viewed_at.desc().nulls_last(), UserPlexItem.id)

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

    try:
        result = await db.execute(query)
        rows = list(result.unique().all())
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch plex library", user_id=current_user.id, ip=ip)
        raise

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    next_cursor = str(offset + limit) if has_more else None

    unique_items: list[MediaItem] = []
    _seen = set()
    for media_item, _ in rows:
        if media_item.id not in _seen:
            _seen.add(media_item.id)
            unique_items.append(media_item)
    await enrich_items_with_assets(db, unique_items)

    summaries = []
    seen_ids = set()
    for media_item, plex_item in rows:
        if media_item.id in seen_ids:
            continue
        seen_ids.add(media_item.id)

        summary = MediaItemSummary.model_validate(media_item)
        summary.plex_view_count = plex_item.view_count
        summary.plex_last_viewed_at = plex_item.last_viewed_at

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

    logger.info("plex library fetched", user_id=current_user.id, count=len(summaries), ip=ip)
    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/plex/thumb/{media_item_id}")
async def get_plex_thumb(
    media_item_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Redirect to the Plex server's authenticated thumbnail for a media item."""
    ip = request.client.host if request.client else None

    try:
        plex_item = await db.scalar(
            select(UserPlexItem).where(
                UserPlexItem.user_id == current_user.id,
                UserPlexItem.media_item_id == media_item_id,
            )
        )
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch plex thumb", media_item_id=media_item_id, ip=ip)
        raise

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

    logger.info("plex thumb redirected", media_item_id=media_item_id, ip=ip)
    return RedirectResponse(url=url)


@router.get("/plex/status")
async def get_plex_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get Plex library sync status (item count, last scanned)."""
    ip = request.client.host if request.client else None

    if not current_user.plex_id:
        return {"item_count": 0, "last_scanned_at": None}

    try:
        result = await db.execute(
            select(
                func.count(UserPlexItem.id),
                func.max(UserPlexItem.updated_at),
            ).where(UserPlexItem.user_id == current_user.id)
        )
        count, last_scanned = result.one()
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch plex status", user_id=current_user.id, ip=ip)
        raise

    logger.info("plex status fetched", user_id=current_user.id, ip=ip)
    return {
        "item_count": count or 0,
        "last_scanned_at": last_scanned.isoformat() if last_scanned else None,
    }
