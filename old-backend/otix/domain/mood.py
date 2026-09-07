# TODO: Review this file
from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class UserMoodCheckIn(Base, TimestampMixin):
    __tablename__ = "user_mood_checkins"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    checkin_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    mood: Mapped[str | None] = mapped_column(String(20), nullable=True)
    feeling: Mapped[str | None] = mapped_column(String(32), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship("User", back_populates="mood_checkins")

    __table_args__ = (
        UniqueConstraint("user_id", "checkin_date", name="uq_user_mood_checkins_user_date"),
        CheckConstraint("status IN ('submitted', 'dismissed')", name="ck_user_mood_checkins_status"),
        CheckConstraint(
            "mood IS NULL OR mood IN ('bad', 'low', 'okay', 'good', 'great')",
            name="ck_user_mood_checkins_mood",
        ),
        CheckConstraint(
            "feeling IS NULL OR feeling IN ("
            "'heartbroken', 'stressed', 'anxious', 'tired', 'lonely', "
            "'bored', 'calm', 'focused', 'excited', 'grateful'"
            ")",
            name="ck_user_mood_checkins_feeling",
        ),
        CheckConstraint(
            "status = 'dismissed' OR mood IS NOT NULL",
            name="ck_user_mood_checkins_submitted_mood",
        ),
        Index("ix_user_mood_checkins_user_date", "user_id", "checkin_date"),
    )
