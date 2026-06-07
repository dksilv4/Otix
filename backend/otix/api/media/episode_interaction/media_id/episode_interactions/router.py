from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api._utils import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.episode_interaction import EpisodeInteractionOut, EpisodeInteractionsOut
from otix.services.episode_interaction_service import EpisodeInteractionService

router = APIRouter()

def _episode_interaction_out(ep_id: str, watched: bool, watched_at: str | None) -> EpisodeInteractionOut:
    return EpisodeInteractionOut(episode_id=ep_id, watched=watched, watched_at=watched_at)

@router.get("/{media_id}/episode-interactions", response_model=EpisodeInteractionsOut)
async def get_episode_interactions(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EpisodeInteractionsOut:
    service = EpisodeInteractionService(db)
    try:
        await service.get_show(media_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    state = await service.get_episode_interactions(
        user_id=current_user.id, show_id=media_id
    )
    return EpisodeInteractionsOut(
        episodes={
            ep_id: _episode_interaction_out(ep_id, data["watched"], data["watched_at"])
            for ep_id, data in state.items()
        }
    )
