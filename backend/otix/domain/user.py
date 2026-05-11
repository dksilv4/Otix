from __future__ import annotations

import enum
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.friend import FriendRequest
    from otix.domain.interaction import UserMediaInteraction
    from otix.domain.list import UserList
    from otix.domain.notification import Notification
    from otix.domain.review import Review
    from otix.domain.workout import Workout


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
    tmdb_session_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, default=None)
    tmdb_account_id: Mapped[int | None] = mapped_column(BigInteger, unique=True, nullable=True, default=None)
    tmdb_username: Mapped[str | None] = mapped_column(String(150), nullable=True, default=None)
    tmdb_avatar_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    tmdb_rating_sync_direction: Mapped[str] = mapped_column(String(16), default="disabled", server_default="disabled", nullable=False)
    tmdb_rating_last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    integration_visibility: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    total_xp: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    interactions: Mapped[list[UserMediaInteraction]] = relationship("UserMediaInteraction", back_populates="user")
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


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    jti: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User", back_populates="refresh_tokens")


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
