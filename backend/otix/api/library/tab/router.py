from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.interaction import UserInteractionState
from otix.schemas.media import MediaItemListResponse, MediaItemSummary
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.interaction_service import InteractionService

logger = structlog.get_logger()

router = APIRouter()

_LIBRARY_TYPES = {
    "watchlist": "watchlisted",
    "like": "liked",
    "watched": "watched",
    "played": "played",
    "listened": "listened",
    "owned": "owned",
}


@router.get("/{tab}", response_model=MediaItemListResponse)
async def get_library_tab(
    tab: str,
    request: Request,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(50, ge=1, le=100),
    source: str | None = Query(None, description="Filter by interaction source (e.g. youtube_liked_videos)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemListResponse:
    """Get items from the authenticated user's library by interaction type.

    Supported tabs: watchlist, like, watched, played, listened.
    """
    ip = request.client.host if request.client else None

    interaction_type = _LIBRARY_TYPES.get(tab)
    if interaction_type is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown library tab. Must be one of: {', '.join(sorted(_LIBRARY_TYPES))}",
        )

    service = InteractionService(db)
    try:
        items, has_more, next_cursor = await service.list_user_interactions(
            user_id=current_user.id,
            interaction_type=interaction_type,
            cursor=cursor,
            limit=limit,
            source=source,
        )
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch library tab", tab=tab, user_id=current_user.id, ip=ip)
        raise

    await enrich_items_with_assets(db, items)
    summaries = [MediaItemSummary.model_validate(item) for item in items]

    auto_state = {
        t: t == interaction_type for t in ("liked", "watchlisted", "watched", "played", "started", "listened", "owned")
    }
    for summary in summaries:
        summary.user_interactions = UserInteractionState(**auto_state)

    logger.info("library tab fetched", tab=tab, user_id=current_user.id, count=len(summaries), ip=ip)
    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )
