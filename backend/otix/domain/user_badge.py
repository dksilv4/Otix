# TODO: Review this file
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class UserBadge(Base, TimestampMixin):
    __tablename__ = "user_badges"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    badge_key: Mapped[str] = mapped_column(nullable=False)
    claimed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)

    user: Mapped[User] = relationship("User", back_populates="badges")

    __table_args__ = (
        UniqueConstraint("user_id", "badge_key", name="uq_user_badge"),
        Index("ix_user_badges_user", "user_id"),
    )

