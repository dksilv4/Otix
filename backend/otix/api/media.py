from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db
from otix.api.schemas.media import (
    MediaItemDetail,
    MediaItemListResponse,
    MediaItemSummary,
)
from otix.services.media_service import MediaService

media_router = APIRouter(prefix="/media", tags=["media"])


@media_router.get("", response_model=MediaItemListResponse)
async def list_media(
    media_type: str | None = Query(None, description="movie, show, or game"),
    genre: str | None = Query(None, description="Genre slug"),
    cursor: str | None = Query(None, description="Pagination cursor (media item id)"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> MediaItemListResponse:
    service = MediaService(db)
    items, has_more = await service.list_media(
        media_type=media_type,
        genre=genre,
        cursor=cursor,
        limit=limit,
    )

    next_cursor = items[-1].id if has_more and items else None

    return MediaItemListResponse(
        items=[MediaItemSummary.model_validate(item) for item in items],
        next_cursor=next_cursor,
        has_more=has_more,
    )


@media_router.get("/search", response_model=MediaItemListResponse)
async def search_media(
    q: str = Query(..., min_length=1, description="Search query"),
    media_type: str | None = Query(None, description="movie, show, or game"),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> MediaItemListResponse:
    service = MediaService(db)
    items = await service.search_media(query_str=q, media_type=media_type, limit=limit)

    return MediaItemListResponse(
        items=[MediaItemSummary.model_validate(item) for item in items],
        has_more=False,
    )


@media_router.get("/{media_id}", response_model=MediaItemDetail)
async def get_media_item(
    media_id: str,
    db: AsyncSession = Depends(get_db),
) -> MediaItemDetail:
    service = MediaService(db)
    item = await service.get_media_item(media_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Media item not found")

    return MediaItemDetail.model_validate(item)
