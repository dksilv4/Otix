"""Workout domain models: exercise catalog, workouts, and workout exercises.

Ported from the legacy FastAPI ``backend/otix/domain/workout.py``. Exercises are
shared reference rows; a workout belongs to a user and groups exercises with a
per-link ``sort_order`` and ``sets`` payload.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import BaseModel, TimestampedModel


class Exercise(TimestampedModel):
    """A reference exercise a workout can reference."""

    name = models.CharField(max_length=100, unique=True)
    category = models.CharField(max_length=50, null=True, blank=True)
    aliases = models.JSONField(default=list)

    class Meta(TimestampedModel.Meta):
        db_table = "exercises"

    def __str__(self) -> str:
        return self.name


class Workout(TimestampedModel):
    """A user workout session with optional free-form input and notes."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="workouts",
    )
    raw_input = models.TextField(null=True, blank=True)
    notes = models.TextField(null=True, blank=True)
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "workouts"

    def __str__(self) -> str:
        return f"Workout {self.pk}"


class WorkoutExercise(BaseModel):
    """A single exercise performed within a workout, in display order.

    Legacy table used a composite primary key of ``workout_id`` +
    ``exercise_id`` + ``sort_order`` (the same exercise may appear more than
    once in a workout at different positions). Django models get a surrogate
    ``id`` plus a ``UniqueConstraint`` over those same natural-key columns.
    """

    workout = models.ForeignKey(
        Workout,
        on_delete=models.CASCADE,
        related_name="workout_exercises",
    )
    # Legacy FK omitted ON DELETE (NO ACTION): an exercise still referenced by a
    # workout cannot be removed. PROTECT preserves that integrity.
    exercise = models.ForeignKey(
        Exercise,
        on_delete=models.PROTECT,
        related_name="workout_exercises",
    )
    sort_order = models.IntegerField(default=0)
    sets = models.JSONField(default=list)

    class Meta(BaseModel.Meta):
        db_table = "workout_exercises"
        ordering = ("sort_order",)
        constraints = [
            models.UniqueConstraint(
                fields=["workout", "exercise", "sort_order"],
                name="uq_workout_exercise",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.workout_id}:{self.exercise_id}:{self.sort_order}"
