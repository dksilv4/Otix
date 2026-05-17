from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk

if TYPE_CHECKING:
    from otix.domain.user import User


class ReviewVote(Base, TimestampMixin):
    __tablename__ = "review_votes"

    user_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    review_user_id: Mapped[otix_fk] = mapped_column(primary_key=True)
    review_media_item_id: Mapped[otix_fk] = mapped_column(primary_key=True)
    vote_type: Mapped[str] = mapped_column(nullable=False)

    voter: Mapped[User] = relationship("User", foreign_keys=[user_id], back_populates="given_votes")

    __table_args__ = (
        CheckConstraint("vote_type IN ('up', 'down')", name="ck_review_vote_type"),
    )
