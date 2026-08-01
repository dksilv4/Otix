from __future__ import annotations

from datetime import date

from pydantic import BaseModel

from otix.schemas.media import EpisodeOut


class CalendarEvent(BaseModel):
    id: str
    media_item_id: str
    media_type: str
    title: str
    poster_url: str | None = None
    slug: str
    release_date: date
    event_type: str  # "watchlist_release", "new_episode", "new_season", "sequel"
    reason: str
    episode_info: EpisodeOut | None = None
    season_number: int | None = None


class CalendarResponse(BaseModel):
    events: list[CalendarEvent]
