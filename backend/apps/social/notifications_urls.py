"""Notification routes (social domain).

Mounted at ``/api/v1/notifications/`` by ``config/urls.py``. No trailing
slashes (FastAPI parity; ``APPEND_SLASH`` off). ``notification_id`` is an
integer converter. Literal routes (``unread-count``, ``read-all``) precede the
``<int:notification_id>/read`` route. ``stream`` is a persistent Redis pub/sub
SSE feed on channel ``user:{id}:notifications``.
"""

from django.urls import path

from apps.social.views import (
    NotificationListView,
    NotificationReadAllView,
    NotificationReadView,
    NotificationStreamView,
    NotificationUnreadCountView,
)

app_name = "notifications"

urlpatterns = [
    path("", NotificationListView.as_view(), name="notification-list"),
    path("unread-count", NotificationUnreadCountView.as_view(), name="notification-unread-count"),
    path("read-all", NotificationReadAllView.as_view(), name="notification-read-all"),
    path("stream", NotificationStreamView.as_view(), name="notification-stream"),
    path(
        "<int:notification_id>/read",
        NotificationReadView.as_view(),
        name="notification-read",
    ),
]
