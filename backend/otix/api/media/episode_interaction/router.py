from __future__ import annotations

from fastapi import APIRouter

from otix.api.media.episode_interaction.media_id.episode_interactions.router import router as ep_inter_router
from otix.api.media.episode_interaction.media_id.episodes.episode_id.watched.router import router as ep_watched_router
from otix.api.media.episode_interaction.media_id.seasons.season_number.watched.router import router as season_watched_router
from otix.api.media.episode_interaction.media_id.show_watched.router import router as show_watched_router

episode_interaction_router = APIRouter(prefix="/media", tags=["episode-interactions"])
episode_interaction_router.include_router(ep_inter_router)
episode_interaction_router.include_router(ep_watched_router)
episode_interaction_router.include_router(season_watched_router)
episode_interaction_router.include_router(show_watched_router)
