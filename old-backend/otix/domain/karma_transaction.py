# TODO: Review this file
from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class KarmaTransaction(Base, TimestampMixin):
    __tablename__ = "karma_transactions"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    reference_id: Mapped[str | None] = mapped_column(String(100), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="karma_transactions")

    __table_args__ = (
        Index("ix_karma_transactions_user", "user_id"),
    )
