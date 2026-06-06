# TODO: Review this file
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class EpisodeInteractionOut(BaseModel):
    episode_id: str
    watched: bool
    watched_at: str | None = None


class EpisodeInteractionsOut(BaseModel):
    episodes: dict[str, EpisodeInteractionOut]


class ShowProgressOut(BaseModel):
    watched_episodes: int
    total_episodes: int
    progress_pct: float
    completed_seasons: list[int]


class EpisodeToggleResponse(BaseModel):
    interaction: EpisodeInteractionOut
    show_progress: ShowProgressOut


class BulkMarkResponse(BaseModel):
    episodes_marked: int
