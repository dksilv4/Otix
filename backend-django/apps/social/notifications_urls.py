"""Notification routes (social domain).

Mounted at ``/api/v1/notifications/`` by ``config/urls.py``. No trailing
slashes (FastAPI parity; ``APPEND_SLASH`` off). ``notification_id`` is an
integer converter. Literal routes (``unread-count``, ``read-all``) precede the
``<int:notification_id>/read`` route.

``GET /notifications/stream`` is intentionally NOT registered: legacy serves it
as a Redis pub/sub SSE stream, and realtime/SSE is deferred platform work
(ARCHITECTURE §7). It will return 404 until that machinery lands.
"""

from django.urls import path

from apps.social.views import (
    NotificationListView,
    NotificationReadAllView,
    NotificationReadView,
    NotificationUnreadCountView,
)

app_name = "notifications"

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("unread-count", NotificationUnreadCountView.as_view(), name="notification-unread-count"),
    path("read-all", NotificationReadAllView.as_view(), name="notification-read-all"),
    path(
        "<int:notification_id>/read",
        NotificationReadView.as_view(),
        name="notification-read",
    ),
]
