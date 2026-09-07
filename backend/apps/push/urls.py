"""Routes for the push domain.

Mounted by ``config/urls.py`` at ``/api/v1/push/`` (see ARCHITECTURE §12 for the
prefix). No trailing slashes on routes (FastAPI parity; APPEND_SLASH is off
project-wide). Both routes are literal, so declaration order is irrelevant.
"""

from django.urls import path

from apps.push.views import SubscribeView, VapidPublicKeyView

app_name = "push"

urlpatterns = [
    path("vapid-public-key", VapidPublicKeyView.as_view(), name="vapid-public-key"),
    path("subscribe", SubscribeView.as_view(), name="subscribe"),
]
