from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk

if TYPE_CHECKING:
    from otix.domain.media import MediaItem
    from otix.domain.user import User


class UserMediaInteraction(Base, TimestampMixin):
    __tablename__ = "user_media_interactions"

    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    media_item_id: Mapped[otix_fk] = mapped_column(ForeignKey("media_items.id", ondelete="CASCADE"), primary_key=True)
    interaction_type: Mapped[str] = mapped_column(String(20), primary_key=True)
    extra_data: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    __table_args__ = (
        CheckConstraint(
            "interaction_type IN ('rated', 'watched', 'liked', 'watchlisted', 'played', 'reviewed', 'started')",
            name="ck_interaction_type",
        ),
    )

    user: Mapped[User] = relationship("User", back_populates="interactions")
    media_item: Mapped[MediaItem] = relationship("MediaItem", back_populates="interactions")
