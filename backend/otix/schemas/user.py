# TODO: Review this file
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from otix.schemas.common import PaginatedResponse
from otix.schemas.friend import FriendshipStatusOut


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
    hall_of_fame_media_ids: dict[str, list[str]] = {}
    steam: SteamIntegrationPublic | None = None
    plex: PlexIntegrationPublic | None = None
    tmdb_username: str | None = None
    friendship_status: FriendshipStatusOut | None = None
    # Follow
    is_following: bool = False
    is_private: bool = False
    follower_count: int = 0
    following_count: int = 0
    # Gamification
    level: int = 1
    level_title: str = "Novice"
    xp_rank: int | None = None
    xp_percentile: float | None = None
    # Proposals
    proposal_count: int = 0
    proposal_approval_rate: float | None = None
    # Admin
    is_admin: bool = False
    # Streaks
    current_login_streak: int = 0
    longest_login_streak: int = 0
    current_review_streak: int = 0
    longest_review_streak: int = 0


class HallOfFameItem(BaseModel):
    id: str
    title: str
    media_type: str
    poster_url: str | None = None
    release_year: int | None = None


class LibraryStatsOut(BaseModel):
    total_items: int = 0
    by_media_type: dict[str, int] = {}
    total_watch_time_minutes: int = 0
    completion_rate: float = 0.0
    most_active_day: str | None = None
    most_active_hour: int | None = None


class MoodCheckinOut(BaseModel):
    date: str
    mood: str
    feeling: str | None = None
    note: str | None = None


class MoodTimelineOut(BaseModel):
    checkins: list[MoodCheckinOut] = []


class UserSearchResult(BaseModel):
    id: str
    username: str
    avatar_url: str | None = None
    bio: str | None = None
    level: int = 1
    level_title: str = "Novice"
    is_admin: bool = False
    media_type: str = "user"

    model_config = {"from_attributes": True}


class UserSearchListResponse(PaginatedResponse):
    items: list[UserSearchResult]


class RatingDistributionItem(BaseModel):
    score: int
    movie: int = 0
    show: int = 0
    game: int = 0
    music: int = 0


class RatingDistributionOut(BaseModel):
    distribution: list[RatingDistributionItem]
    total_ratings: int
