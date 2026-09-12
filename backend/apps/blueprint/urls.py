"""Routes for the blueprint domain.

Mounted at ``/api/v1/blueprints/`` by ``config/urls.py``. Routes carry no
trailing slashes (FastAPI parity; ``APPEND_SLASH`` off project-wide), so the
list/create route resolves at ``/api/v1/blueprints/`` (the include's prefix) and
the sub-routes at ``/api/v1/blueprints/{id}``.
"""

from django.urls import path

from apps.blueprint.views import (
    BlueprintDetailView,
    BlueprintDownloadView,
    BlueprintLikeView,
    BlueprintListCreateView,
)

app_name = "blueprint"

urlpatterns = [
    path("", BlueprintListCreateView.as_view(), name="blueprint-list"),
    path("<blueprint_id>", BlueprintDetailView.as_view(), name="blueprint-detail"),
    path("<blueprint_id>/like", BlueprintLikeView.as_view(), name="blueprint-like"),
    path(
        "<blueprint_id>/download",
        BlueprintDownloadView.as_view(),
        name="blueprint-download",
    ),
]
