from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk

if TYPE_CHECKING:
    from otix.domain.user import User


class Follow(Base, TimestampMixin):
    __tablename__ = "follows"

    follower_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    followed_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )

    follower: Mapped[User] = relationship("User", foreign_keys=[follower_id], back_populates="following")
    followed: Mapped[User] = relationship("User", foreign_keys=[followed_id], back_populates="followers")

    __table_args__ = (
        Index("ix_follows_follower", "follower_id"),
        Index("ix_follows_followed", "followed_id"),
        CheckConstraint("follower_id != followed_id", name="ck_follow_no_self"),
    )
