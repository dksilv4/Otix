from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.interaction import UserMediaInteraction
    from otix.domain.list import UserList
    from otix.domain.review import Review
    from otix.domain.workout import Workout


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[otix_pk]
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    global_logout_marker: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    avatar_url: Mapped[str | None] = mapped_column(String(2048), nullable=True, default=None)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    background_url: Mapped[str | None] = mapped_column(String(2048), nullable=True, default=None)

    interactions: Mapped[list[UserMediaInteraction]] = relationship("UserMediaInteraction", back_populates="user")
    reviews: Mapped[list[Review]] = relationship("Review", back_populates="user")
    lists: Mapped[list[UserList]] = relationship("UserList", back_populates="user")
    workouts: Mapped[list[Workout]] = relationship("Workout", back_populates="user")
    refresh_tokens: Mapped[list[RefreshToken]] = relationship("RefreshToken", back_populates="user")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    jti: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship("User", back_populates="refresh_tokens")
