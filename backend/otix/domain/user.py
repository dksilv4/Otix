from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.follow import Follow
    from otix.domain.friend import FriendRequest
    from otix.domain.interaction import UserMediaInteraction
    from otix.domain.episode_interaction import UserEpisodeInteraction
    from otix.domain.karma_transaction import KarmaTransaction
    from otix.domain.list import UserList
    from otix.domain.mood import UserMoodCheckIn
    from otix.domain.notification import Notification
    from otix.domain.people import UserPersonFollow
    from otix.domain.review import Review
    from otix.domain.review_vote import ReviewVote
    from otix.domain.user_badge import UserBadge
    from otix.domain.user_streak import UserStreak
    from otix.domain.workout import Workout


DEFAULT_PROFILE_SECTIONS: list[str] = ["hof_movie", "hof_show", "hof_game", "hof_music", "library_breakdown", "mood_timeline"]


class AuthActionType(str, enum.Enum):
    VERIFY_EMAIL = "verify_email"
    PASSWORD_RESET = "password_reset"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[otix_pk]
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    two_factor_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    two_factor_secret: Mapped[str | None] = mapped_column(String(32), nullable=True, default=None)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    global_logout_marker: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True, default=None)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    background_url: Mapped[str | None] = mapped_column(String(2048), nullable=True, default=None)
    steam_id: Mapped[str | None] = mapped_column(String(17), unique=True, nullable=True, default=None)
    plex_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, default=None)
    plex_username: Mapped[str | None] = mapped_column(String(150), nullable=True, default=None)
    plex_email: Mapped[str | None] = mapped_column(String(320), nullable=True, default=None)
    plex_thumb: Mapped[str | None] = mapped_column(String(2048), nullable=True, default=None)
    plex_auth_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    plex_watch_history_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    tmdb_session_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, default=None)
    tmdb_account_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True, default=None)
    tmdb_username: Mapped[str | None] = mapped_column(String(150), nullable=True, default=None)
    tmdb_avatar_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    tmdb_rating_sync_direction: Mapped[str] = mapped_column(String(16), default="disabled", server_default="disabled", nullable=False)
    tmdb_rating_last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    spotify_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, default=None)
    spotify_username: Mapped[str | None] = mapped_column(String(150), nullable=True, default=None)
    spotify_email: Mapped[str | None] = mapped_column(String(320), nullable=True, default=None)
    spotify_avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True, default=None)
    spotify_access_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    spotify_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    spotify_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    google_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, default=None)
    google_email: Mapped[str | None] = mapped_column(String(320), nullable=True, default=None)
    google_name: Mapped[str | None] = mapped_column(String(150), nullable=True, default=None)
    google_avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True, default=None)
    google_access_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    google_refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    google_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    integration_visibility: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    total_xp: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    daily_mood_checkins_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)
    avg_user_rating: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    user_rating_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    profile_sections: Mapped[list] = mapped_column(JSON, default=lambda: DEFAULT_PROFILE_SECTIONS.copy(), nullable=False)
    profile_card_sections: Mapped[list] = mapped_column(JSON, default=lambda: ["reviews", "stats", "top_rated", "recent_activity"], nullable=False)
    hall_of_fame_media_ids: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    preferred_media_types: Mapped[list] = mapped_column(JSON, default=lambda: ["movie", "show", "game", "music"], nullable=False)
    preferred_genres: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    preferred_languages: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    discover_emphases: Mapped[list] = mapped_column(JSON, default=list, nullable=False)

    @property
    def hof_ids(self) -> dict[str, list[str]]:
        """Normalize hall_of_fame_media_ids to the current dict format.

        Handles legacy list-format data stored before the per-media-type change.
        Non-empty lists from old data would break Pydantic validation since
        ``or {}`` only triggers for falsy values (empty lists).
        """
        raw = self.hall_of_fame_media_ids
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, list):
            return {}
        return {}

    karma: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0", nullable=False)

    interactions: Mapped[list[UserMediaInteraction]] = relationship("UserMediaInteraction", back_populates="user")
    episode_interactions: Mapped[list["UserEpisodeInteraction"]] = relationship("UserEpisodeInteraction", back_populates="user")
    reviews: Mapped[list[Review]] = relationship("Review", back_populates="user")
    lists: Mapped[list[UserList]] = relationship("UserList", back_populates="user")
    workouts: Mapped[list[Workout]] = relationship("Workout", back_populates="user")
    refresh_tokens: Mapped[list[RefreshToken]] = relationship("RefreshToken", back_populates="user")
    sent_requests: Mapped[list[FriendRequest]] = relationship(
        "FriendRequest", foreign_keys="FriendRequest.sender_id", back_populates="sender"
    )
    received_requests: Mapped[list[FriendRequest]] = relationship(
        "FriendRequest", foreign_keys="FriendRequest.receiver_id", back_populates="receiver"
    )
    notifications: Mapped[list[Notification]] = relationship("Notification", back_populates="user")
    mood_checkins: Mapped[list[UserMoodCheckIn]] = relationship("UserMoodCheckIn", back_populates="user")
    ratings_given: Mapped[list[UserRating]] = relationship(
        "UserRating", foreign_keys="UserRating.rater_id", back_populates="rater"
    )
    ratings_received: Mapped[list[UserRating]] = relationship(
        "UserRating", foreign_keys="UserRating.rated_user_id", back_populates="rated_user"
    )
    badges: Mapped[list[UserBadge]] = relationship("UserBadge", back_populates="user")
    karma_transactions: Mapped[list[KarmaTransaction]] = relationship("KarmaTransaction", back_populates="user")
    streak: Mapped[UserStreak] = relationship("UserStreak", back_populates="user", uselist=False)
    followers: Mapped[list[Follow]] = relationship(
        "Follow", foreign_keys="Follow.followed_id", back_populates="followed"
    )
    following: Mapped[list[Follow]] = relationship(
        "Follow", foreign_keys="Follow.follower_id", back_populates="follower"
    )
    given_votes: Mapped[list[ReviewVote]] = relationship(
        "ReviewVote", foreign_keys="ReviewVote.user_id", back_populates="voter"
    )
    person_follows: Mapped[list[UserPersonFollow]] = relationship("UserPersonFollow", back_populates="user")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    jti: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User", back_populates="refresh_tokens")


class UserRating(Base, TimestampMixin):
    __tablename__ = "user_ratings"

    rater_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    rated_user_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)

    rater: Mapped[User] = relationship("User", foreign_keys=[rater_id], back_populates="ratings_given")
    rated_user: Mapped[User] = relationship("User", foreign_keys=[rated_user_id], back_populates="ratings_received")

    __table_args__ = (
        CheckConstraint("score >= 1 AND score <= 10", name="ck_user_rating_score_range"),
    )


class AuthActionToken(Base):
    __tablename__ = "auth_action_tokens"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    purpose: Mapped[str] = mapped_column(String(20), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User", backref="action_tokens")

    __table_args__ = (
        Index("ix_auth_action_tokens_user_purpose", "user_id", "purpose"),
        Index("ix_auth_action_tokens_token_hash", "token_hash"),
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    session_key: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[str | None] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User", backref="sessions")

    __table_args__ = (
        Index("ix_user_sessions_user_active", "user_id", "revoked_at"),
    )
