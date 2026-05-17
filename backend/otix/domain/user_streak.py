from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk

if TYPE_CHECKING:
    from otix.domain.user import User


class UserStreak(Base, TimestampMixin):
    __tablename__ = "user_streaks"

    user_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    current_login_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    longest_login_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_review_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    longest_review_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_activity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_review_week: Mapped[date | None] = mapped_column(Date, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="streak")
