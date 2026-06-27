from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api.deps import get_current_user, get_db
from otix.domain.episode_interaction import UserEpisodeInteraction
from otix.domain.interaction import UserMediaInteraction
from otix.domain.media import Episode, MediaItem, Season
from otix.domain.user import User
from otix.schemas.media import MediaItemSummary

logger = structlog.get_logger()

router = APIRouter()


class ContinueItem(MediaItemSummary):
    interaction_type: str
    interacted_at: str
    episode_context: str | None = None


@router.get("/me/continue")
async def get_continue_watching(
    request: Request,
    limit: int = 10,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ContinueItem]:
    """Get media items the user has recently interacted with and may want to continue."""
    ip = request.client.host if request.client else None
    user_id = current_user.id

    # Get recent media interactions (watched, played, listened, started)
    interaction_result = await db.execute(
        select(UserMediaInteraction, MediaItem)
        .join(MediaItem, UserMediaInteraction.media_item_id == MediaItem.id)
        .options(
            joinedload(MediaItem.movie),
            joinedload(MediaItem.show),
            joinedload(MediaItem.game),
        )
        .where(
            UserMediaInteraction.user_id == user_id,
            UserMediaInteraction.interaction_type.in_(["watched", "played", "listened", "started"]),
        )
        .order_by(UserMediaInteraction.created_at.desc())
        .limit(limit * 2)
    )

    # Get recent episode interactions (watching shows)
    episode_result = await db.execute(
        select(UserEpisodeInteraction, Episode, Season, MediaItem)
        .join(Episode, Episode.id == UserEpisodeInteraction.episode_id)
        .join(Season, Season.id == Episode.season_id)
        .join(MediaItem, MediaItem.id == Season.show_id)
        .where(UserEpisodeInteraction.user_id == user_id)
        .order_by(UserEpisodeInteraction.created_at.desc())
        .limit(limit)
    )

    seen_ids: set[str] = set()
    items: list[ContinueItem] = []

    # Process episode interactions first (most important for "continue watching")
    for row in episode_result:
        ei, episode, season, media = row
        if media.id in seen_ids:
            continue
        seen_ids.add(media.id)
        items.append(
            ContinueItem(
                id=media.id,
                media_type=media.media_type,
                title=media.title,
                slug=media.slug,
                poster_url=media.poster_url,
                backdrop_url=media.backdrop_url,
                logo_url=media.logo_url,
                release_date=media.release_date,
                popularity=media.popularity,
                interaction_type="episode_watched",
                interacted_at=ei.created_at.isoformat(),
                episode_context=f"S{season.season_number}E{episode.episode_number}",
            )
        )
        if len(items) >= limit:
            break

    # Process media interactions
    for interaction, media in interaction_result:
        if media.id in seen_ids:
            continue
        if len(items) >= limit:
            break
        seen_ids.add(media.id)
        items.append(
            ContinueItem(
                id=media.id,
                media_type=media.media_type,
                title=media.title,
                slug=media.slug,
                poster_url=media.poster_url,
                backdrop_url=media.backdrop_url,
                logo_url=media.logo_url,
                release_date=media.release_date,
                popularity=media.popularity,
                interaction_type=interaction.interaction_type,
                interacted_at=interaction.created_at.isoformat(),
            )
        )

    logger.info("continue watching fetched", user_id=user_id, count=len(items), ip=ip)
    return items
