from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.episode_interaction import BulkMarkResponse
from otix.services.episode_interaction_service import EpisodeInteractionService

router = APIRouter()

@router.put("/{media_type}/{media_id}/seasons/{season_number}/watched", response_model=BulkMarkResponse)
async def mark_season_watched(
    media_type: str,
    media_id: str,
    season_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkMarkResponse:
    service = EpisodeInteractionService(db)
    try:
        await service.get_show(media_id)
        season = await service.get_season_by_show_and_number(media_id, season_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    count = await service.set_season_watched(
        user_id=current_user.id, season_id=season.id
    )
    return BulkMarkResponse(episodes_marked=count)

@router.delete("/{media_type}/{media_id}/seasons/{season_number}/watched", response_model=BulkMarkResponse)
async def unmark_season_watched(
    media_type: str,
    media_id: str,
    season_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkMarkResponse:
    service = EpisodeInteractionService(db)
    try:
        await service.get_show(media_id)
        season = await service.get_season_by_show_and_number(media_id, season_number)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    count = await service.remove_season_watched(
        user_id=current_user.id, season_id=season.id
    )
    return BulkMarkResponse(episodes_marked=count)
