"""Exercise routes.

Mounted at ``/api/v1/exercises/`` by ``config/urls.py`` (the two exercise
routes live under a separate prefix from the workout routes but both map to the
``workout`` domain app per the ARCHITECTURE fan-out map). No trailing slashes
(FastAPI parity; ``APPEND_SLASH`` off).
"""

from django.urls import path

from apps.workout.views import ExerciseCategoryListView, ExerciseListView

app_name = "exercises"

urlpatterns = [
    path("", ExerciseListView.as_view(), name="exercise-list"),
    path("categories", ExerciseCategoryListView.as_view(), name="exercise-categories"),
]
