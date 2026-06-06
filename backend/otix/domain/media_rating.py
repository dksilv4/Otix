# TODO: Review this file
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk

if TYPE_CHECKING:
    from otix.domain.media import MediaItem
    from otix.domain.user import User


class MediaItemRating(Base, TimestampMixin):
    __tablename__ = "media_item_ratings"

    user_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    media_item_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True
    )
    score: Mapped[int] = mapped_column(Integer, nullable=False)

    user: Mapped[User] = relationship("User", back_populates="media_ratings")
    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="ratings")

    __table_args__ = (
        CheckConstraint(
            "score >= 1 AND score <= 10",
            name="ck_media_item_rating_score_range",
        ),
    )
