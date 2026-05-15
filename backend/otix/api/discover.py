from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_db, get_optional_user
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.media import MediaItemListResponse, MediaItemSummary
from otix.domain.user import User
from otix.services.interaction_service import InteractionService
from otix.services.media_service import MediaService

discover_router = APIRouter(prefix="/discover", tags=["discover"])

VALID_MEDIA_TYPES = {"movie", "show", "game", "music"}
VALID_LIST_TYPES = {
    "trending",
    "popular",
    "top_rated",
    "upcoming",
    "now_playing",
}

# (list_type) → (sort_by, sort_dir, date_filter)
_LIST_CONFIG: dict[str, tuple[str, str, str | None]] = {
    "trending": ("popularity", "desc", None),
    "popular": ("popularity", "desc", None),
    "top_rated": ("rating", "desc", None),
    "upcoming": ("release_date", "asc", "future"),
    "now_playing": ("popularity", "desc", "recent"),
}


def _date_filter(name: str | None) -> tuple[date | None, date | None]:
    today = date.today()
    if name == "future":
        return (today, None)
    if name == "recent":
        return (today - timedelta(days=90), None)
    return (None, None)


async def _build_response(
    db: AsyncSession,
    items: list,
    has_more: bool,
    current_user: User | None,
) -> MediaItemListResponse:
    next_cursor = items[-1].id if has_more and items else None
    summaries = [MediaItemSummary.model_validate(item) for item in items]

    if current_user is not None and summaries:
        interaction_service = InteractionService(db)
        batch = await interaction_service.get_batch_interactions(
            user_id=current_user.id,
            media_item_ids=[s.id for s in summaries],
        )
        for summary in summaries:
            state = batch.get(summary.id, {})
            summary.user_interactions = UserInteractionState(**state)

    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@discover_router.get("/hero", response_model=MediaItemListResponse)
async def discover_hero(
    limit: int = Query(6, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    service = MediaService(db)
    items, has_more, _ = await service.list_media(
        has_artwork=True,
        limit=limit,
    )
    return await _build_response(db, items, has_more, current_user)


@discover_router.get("/{media_type}/{list_type}", response_model=MediaItemListResponse)
async def discover_list(
    media_type: str,
    list_type: str,
    genre: str | None = Query(None, description="Genre slug"),
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> MediaItemListResponse:
    if media_type not in VALID_MEDIA_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid media_type: {media_type}")
    if list_type not in VALID_LIST_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid list_type: {list_type}")

    sort_by, sort_dir, date_filter_name = _LIST_CONFIG[list_type]
    date_from, date_to = _date_filter(date_filter_name)

    service = MediaService(db)
    items, has_more, _ = await service.list_media(
        media_type=media_type,
        genre=genre,
        sort_by=sort_by,
        sort_dir=sort_dir,
        cursor=cursor,
        limit=limit,
        date_from=date_from,
        date_to=date_to,
    )
    return await _build_response(db, items, has_more, current_user)
