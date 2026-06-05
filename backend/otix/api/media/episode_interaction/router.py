from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.schemas.episode_interaction import (
    BulkMarkResponse,
    EpisodeInteractionOut,
    EpisodeInteractionsOut,
    EpisodeToggleResponse,
    ShowProgressOut,
)
from otix.domain.media import Episode, Season, Show
from otix.domain.user import User
from otix.services.episode_interaction_service import EpisodeInteractionService

episode_interaction_router = APIRouter(prefix="/media", tags=["episode-interactions"])


def _episode_interaction_out(ep_id: str, watched: bool, watched_at: str | None) -> EpisodeInteractionOut:
    return EpisodeInteractionOut(episode_id=ep_id, watched=watched, watched_at=watched_at)


@episode_interaction_router.get(
    "/{media_id}/episode-interactions",
    response_model=EpisodeInteractionsOut,
)
async def get_episode_interactions(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EpisodeInteractionsOut:
    show = await db.get(Show, media_id)
    if show is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Show not found",
        )

    service = EpisodeInteractionService(db)
    state = await service.get_episode_interactions(
        user_id=current_user.id, show_id=media_id
    )
    return EpisodeInteractionsOut(
        episodes={
            ep_id: _episode_interaction_out(ep_id, data["watched"], data["watched_at"])
            for ep_id, data in state.items()
        }
    )


@episode_interaction_router.put(
    "/{media_id}/episodes/{episode_id}/watched",
    response_model=EpisodeToggleResponse,
)
async def mark_episode_watched(
    media_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EpisodeToggleResponse:
    episode = await db.get(Episode, episode_id)
    if episode is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Episode not found",
        )

    # Validate episode belongs to the show
    season = await db.get(Season, episode.season_id)
    if season is None or season.show_id != media_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Episode does not belong to this show",
        )

    service = EpisodeInteractionService(db)
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


@episode_interaction_router.delete(
    "/{media_id}/episodes/{episode_id}/watched",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def unmark_episode_watched(
    media_id: str,
    episode_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    episode = await db.get(Episode, episode_id)
    if episode is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Episode not found",
        )

    season = await db.get(Season, episode.season_id)
    if season is None or season.show_id != media_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Episode does not belong to this show",
        )

    service = EpisodeInteractionService(db)
    deleted = await service.remove_episode_watched(
        user_id=current_user.id, episode_id=episode_id
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Episode interaction not found",
        )


@episode_interaction_router.put(
    "/{media_id}/seasons/{season_number}/watched",
    response_model=BulkMarkResponse,
)
async def mark_season_watched(
    media_id: str,
    season_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkMarkResponse:
    show = await db.get(Show, media_id)
    if show is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Show not found",
        )

    season = (await db.execute(
        select(Season).where(
            Season.show_id == media_id,
            Season.season_number == season_number,
        ).limit(1)
    )).scalar()
    if season is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Season not found",
        )

    service = EpisodeInteractionService(db)
    count = await service.set_season_watched(
        user_id=current_user.id, season_id=season.id
    )
    return BulkMarkResponse(episodes_marked=count)


@episode_interaction_router.delete(
    "/{media_id}/seasons/{season_number}/watched",
    response_model=BulkMarkResponse,
)
async def unmark_season_watched(
    media_id: str,
    season_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkMarkResponse:
    show = await db.get(Show, media_id)
    if show is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Show not found",
        )

    season = (await db.execute(
        select(Season).where(
            Season.show_id == media_id,
            Season.season_number == season_number,
        ).limit(1)
    )).scalar()
    if season is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Season not found",
        )

    service = EpisodeInteractionService(db)
    count = await service.remove_season_watched(
        user_id=current_user.id, season_id=season.id
    )
    return BulkMarkResponse(episodes_marked=count)


@episode_interaction_router.put(
    "/{media_id}/show-watched",
    response_model=BulkMarkResponse,
)
async def mark_show_watched(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkMarkResponse:
    show = await db.get(Show, media_id)
    if show is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Show not found",
        )

    service = EpisodeInteractionService(db)
    count = await service.set_show_watched(
        user_id=current_user.id, show_id=media_id
    )
    return BulkMarkResponse(episodes_marked=count)


@episode_interaction_router.delete(
    "/{media_id}/show-watched",
    response_model=BulkMarkResponse,
)
async def unmark_show_watched(
    media_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BulkMarkResponse:
    show = await db.get(Show, media_id)
    if show is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Show not found",
        )

    service = EpisodeInteractionService(db)
    count = await service.remove_show_watched(
        user_id=current_user.id, show_id=media_id
    )
    return BulkMarkResponse(episodes_marked=count)
