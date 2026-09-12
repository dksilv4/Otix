"""User media-calendar route (media domain, distinct ``/calendar`` prefix).

Mounted at ``/api/v1/calendar/`` by ``config/urls.py`` (leaf route — the
contract path is ``/api/v1/calendar`` with no trailing slash; ``APPEND_SLASH``
off). Upcoming-release calendar derived from the current user's activity
(watchlist/watched) joined against media release + franchise dates.
"""

from django.urls import path

from apps.media.views.calendar import CalendarView

app_name = "calendar"

urlpatterns = [
    path("", CalendarView.as_view(), name="calendar"),
]
