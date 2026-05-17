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
    # Follow
    is_following: bool = False
    follower_count: int = 0
    following_count: int = 0
    # Gamification
    level: int = 1
    level_title: str = "Novice"
    xp_rank: int | None = None
    xp_percentile: float | None = None
    # Admin
    is_admin: bool = False
    # Karma
    karma: int = 0
    # Streaks (populated in Phase 4)
    current_login_streak: int = 0
    longest_login_streak: int = 0
    current_review_streak: int = 0
    longest_review_streak: int = 0
