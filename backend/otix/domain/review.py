from __future__ import annotations

from typing import TYPE_CHECKING

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk

if TYPE_CHECKING:
    from otix.domain.media import MediaItem
    from otix.domain.user import User


class Review(Base, TimestampMixin):
    __tablename__ = "reviews"

    user_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    media_item_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True
    )
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_spoiler: Mapped[bool] = mapped_column(Boolean, default=False)
    is_private: Mapped[bool] = mapped_column(Boolean, default=False)
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="reviews")
    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="reviews")

    __table_args__ = (
        CheckConstraint(
            "(score IS NULL) OR (score >= 1 AND score <= 10)",
            name="ck_review_score_range",
        ),
        CheckConstraint(
            "content IS NOT NULL OR score IS NOT NULL",
            name="ck_review_content_or_score",
        ),
    )
