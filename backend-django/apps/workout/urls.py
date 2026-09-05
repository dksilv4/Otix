"""Workout routes.

Mounted at ``/api/v1/workout/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). ``workout_id``
is an integer path converter matching the greenfield integer PKs. Literal
routes (``today``, ``heatmap``) are declared before ``<int:workout_id>`` so
they are never shadowed.
"""

from django.urls import path

from apps.workout.views import (
    TodayWorkoutView,
    WorkoutCollectionView,
    WorkoutDetailView,
    WorkoutHeatmapView,
)

app_name = "workout"

urlpatterns = [
    path("", WorkoutCollectionView.as_view(), name="workout-collection"),
    path("today", TodayWorkoutView.as_view(), name="workout-today"),
    path("heatmap", WorkoutHeatmapView.as_view(), name="workout-heatmap"),
    path("<int:workout_id>", WorkoutDetailView.as_view(), name="workout-detail"),
]
