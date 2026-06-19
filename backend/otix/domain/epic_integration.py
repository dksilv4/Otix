"""Epic Games Store integration models."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.media import MediaItem
    from otix.domain.user import User


class UserEpicGame(Base):
    """Links a user to an Epic game they own.

    One row per (user, epic_app_id). If media_item_id is set, the game has
    been matched to a canonical Otix game record; otherwise it's unmatched.
    """

    __tablename__ = "user_epic_games"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
    )
    epic_app_id: Mapped[str] = mapped_column(String(128))
    title: Mapped[str] = mapped_column(String(512))
    developer: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    publisher: Mapped[str | None] = mapped_column(String(255), nullable=True, default=None)
    is_installed: Mapped[bool] = mapped_column(Boolean, default=False)
    install_size: Mapped[int | None] = mapped_column(BigInteger, nullable=True, default=None)
    platform: Mapped[str | None] = mapped_column(String(32), nullable=True, default=None)
    last_played: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, default=None,
    )

    # Link to canonical game (NULL = unmatched)
    media_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("media_items.id", ondelete="SET NULL"),
        nullable=True,
        default=None,
        index=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(),
    )

    # ── Relations ──────────────────────────────────────────────────────
    user: Mapped[User] = relationship("User", back_populates="epic_games")

    __table_args__ = (
        Index("ix_user_epic_games_user_app", "user_id", "epic_app_id", unique=True),
    )

    def __repr__(self) -> str:
        return (
            f"<UserEpicGame(user={self.user_id}, epic_app_id={self.epic_app_id}, "
            f"matched={self.media_item_id is not None})>"
        )


class EpicFreeGameClaim(Base):
    """Tracks Epic free-game promotions.

    Used by the free-game notification background task. Each row is one game
    offered in a weekly promotion window. ``notified_user_ids`` lists users
    who were already notified so they don't get spammed.
    """

    __tablename__ = "epic_free_game_claims"

    id: Mapped[otix_pk]
    promotion_id: Mapped[str] = mapped_column(String(128), index=True)
    """Unique promotion-run identifier, e.g. 'freegame-2026-W25'."""

    epic_app_id: Mapped[str] = mapped_column(String(128))
    title: Mapped[str] = mapped_column(String(512))
    original_price: Mapped[str | None] = mapped_column(String(32), nullable=True, default=None)
    promotion_url: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(),
    )

    notified_user_ids: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    """User IDs who've been notified about this game. Prevents duplicates."""

    __table_args__ = (
        Index("ix_epic_free_game_promo_app", "promotion_id", "epic_app_id", unique=True),
    )

    def __repr__(self) -> str:
        return f"<EpicFreeGameClaim(promotion={self.promotion_id}, game={self.title})>"
