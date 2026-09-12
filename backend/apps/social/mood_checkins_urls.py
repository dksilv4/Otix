"""Mood check-in routes (social domain).

Mounted at ``/api/v1/mood-checkins/`` by ``config/urls.py``. No trailing
slashes (FastAPI parity; ``APPEND_SLASH`` off). Literal routes (``today``,
``dismiss``) only -- no dynamic converters here.
"""

from django.urls import path

from apps.social.views import (
    MoodCheckInCreateView,
    MoodCheckInDismissView,
    MoodCheckInTodayView,
)

app_name = "mood-checkins"

urlpatterns = [
    path("", MoodCheckInCreateView.as_view(), name="mood-checkins-create"),
    path("today", MoodCheckInTodayView.as_view(), name="mood-checkins-today"),
    path("dismiss", MoodCheckInDismissView.as_view(), name="mood-checkins-dismiss"),
]
