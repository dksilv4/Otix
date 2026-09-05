"""User-metric route (social domain).

Mounted at ``/api/v1/metric/`` by ``config/urls.py`` (leaf route, no trailing
slash in the contract; ``APPEND_SLASH`` off). Populated by the social
endpoint-port owner (wave #4).
"""

from django.urls import path

from apps.social.views import MetricView

app_name = "metric"

urlpatterns = [
    path("", MetricView.as_view(), name="metric"),
]
