"""Routes for the proxy-fetch client surface (mounted at /api/v1/fetch/).

Separate from ``apps/integrations/urls.py`` so it mounts under the top-level
``/api/v1/fetch/`` prefix the desktop companion targets rather than under
``/api/v1/integrations/``. All three routes are Bearer-authenticated.
"""

from django.urls import path

from apps.integrations.views import (
    FetchDeviceView,
    FetchRequestStreamView,
    FetchResultView,
)

app_name = "fetch"

urlpatterns = [
    path("stream", FetchRequestStreamView.as_view(), name="fetch-request-stream"),
    path("device", FetchDeviceView.as_view(), name="fetch-device"),
    path("result", FetchResultView.as_view(), name="fetch-result"),
]
