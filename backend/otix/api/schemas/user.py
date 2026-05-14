from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from otix.api.schemas.friend import FriendshipStatusOut


class SteamIntegrationPublic(BaseModel):
    personaname: str | None = None
    avatarfull: str | None = None
    profileurl: str | None = None
    loccountrycode: str | None = None
    personastate: int | None = None


class PlexIntegrationPublic(BaseModel):
    username: str | None = None
    thumb: str | None = None


class UserProfileOut(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None
    bio: str | None = None
    background_url: str | None = None
    created_at: datetime
    review_count: int = 0
    total_xp: int = 0
    avg_user_rating: float | None = None
    user_rating_count: int = 0
    composite_score: float | None = None
    profile_sections: list[str] | None = None
    steam: SteamIntegrationPublic | None = None
    plex: PlexIntegrationPublic | None = None
    tmdb_username: str | None = None
    friendship_status: FriendshipStatusOut | None = None
