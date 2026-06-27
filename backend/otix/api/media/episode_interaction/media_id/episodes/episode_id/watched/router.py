from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.episode_interaction import EpisodeInteractionOut, EpisodeToggleResponse, ShowProgressOut
from otix.services.episode_interaction_service import EpisodeInteractionService

router = APIRouter()

def _episode_interaction_out(ep_id: str, watched: bool, watched_at: str | None) -> EpisodeInteractionOut:
    return EpisodeInteractionOut(episode_id=ep_id, watched=watched, watched_at=watched_at)

@router.put("/{media_type}/{media_id}/episodes/{episode_id}/watched", response_model=EpisodeToggleResponse)
async def mark_episode_watched(
    media_type: str,
    media_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EpisodeToggleResponse:
    service = EpisodeInteractionService(db)
    try:
        await service.validate_episode_in_show(episode_id, media_id)
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    await service.set_episode_watched(
        user_id=current_user.id, episode_id=episode_id
    )
    progress = await service.get_show_progress(
        user_id=current_user.id, show_id=media_id
    )
    return EpisodeToggleResponse(
        interaction=_episode_interaction_out(episode_id, True, None),
        show_progress=ShowProgressOut(**progress),
    )

@router.delete("/{media_type}/{media_id}/episodes/{episode_id}/watched", status_code=status.HTTP_204_NO_CONTENT)
async def unmark_episode_watched(
    media_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    service = EpisodeInteractionService(db)
    try:
        await service.validate_episode_in_show(episode_id, media_id)
    except ValueError as e:
        if "not found" in str(e):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    deleted = await service.remove_episode_watched(
        user_id=current_user.id, episode_id=episode_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Episode interaction not found",
        )
