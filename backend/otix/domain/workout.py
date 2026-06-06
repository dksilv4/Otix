# TODO: Review this file
from __future__ import annotations

from typing import TYPE_CHECKING

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from otix.domain.base import Base, TimestampMixin, otix_fk, otix_pk

if TYPE_CHECKING:
    from otix.domain.user import User


class Exercise(Base, TimestampMixin):
    __tablename__ = "exercises"

    id: Mapped[otix_pk]
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    aliases: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    workout_exercises: Mapped[list[WorkoutExercise]] = relationship(
        "WorkoutExercise", back_populates="exercise"
    )


class Workout(Base, TimestampMixin):
    __tablename__ = "workouts"

    id: Mapped[otix_pk]
    user_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    raw_input: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="workouts")
    workout_exercises: Mapped[list[WorkoutExercise]] = relationship(
        "WorkoutExercise", back_populates="workout", order_by="WorkoutExercise.sort_order"
    )


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"

    workout_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("workouts.id", ondelete="CASCADE"), primary_key=True
    )
    exercise_id: Mapped[otix_fk] = mapped_column(
        ForeignKey("exercises.id"), primary_key=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, primary_key=True, default=0)
    sets: Mapped[list] = mapped_column(JSONB, default=list, nullable=False)

    workout: Mapped[Workout] = relationship("Workout", back_populates="workout_exercises")
    exercise: Mapped[Exercise] = relationship("Exercise", back_populates="workout_exercises")
