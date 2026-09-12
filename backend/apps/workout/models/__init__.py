"""Workout domain models.

Ported from legacy FastAPI modules: ``workout.py`` (Exercise/Workout/
WorkoutExercise) and ``UserRating`` from ``user.py``. ``user_ratings`` is
grouped under this app per ARCHITECTURE §3.
"""

from apps.workout.models.rating import UserRating
from apps.workout.models.workout import Exercise, Workout, WorkoutExercise

__all__ = [
    "Exercise",
    "UserRating",
    "Workout",
    "WorkoutExercise",
]
