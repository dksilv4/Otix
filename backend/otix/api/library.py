from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.interaction import UserInteractionState
from otix.api.schemas.media import MediaItemListResponse, MediaItemSummary
from otix.domain.user import User
from otix.services.interaction_service import InteractionService

library_router = APIRouter(prefix="/library", tags=["library"])

_LIBRARY_TYPES = {
    "watchlist": "watchlisted",
    "like": "liked",
    "watched": "watched",
    "played": "played",
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
    auto_state = {t: t == interaction_type for t in ("liked", "watchlisted", "watched", "played")}
    for summary in summaries:
        summary.user_interactions = UserInteractionState(**auto_state)

    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )
