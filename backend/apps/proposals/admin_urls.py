"""Admin/moderator read routes (proposals domain).

Mounted at ``/api/v1/admin/`` by ``config/urls.py`` — distinct prefix from the
``/proposals`` routes but maps to the same ``proposals`` app per the
ARCHITECTURE fan-out map. No trailing slashes (``APPEND_SLASH`` off). Literal
``hydration/summary`` before ``hydration`` so it is never shadowed.
"""

from django.urls import path

from apps.proposals.views import (
    DeletedTMDBIdsView,
    EditProposalsView,
    HydrationSummaryView,
    HydrationView,
    MetricsView,
    StatsView,
)

app_name = "proposals-admin"

urlpatterns = [
    path("deleted-tmdb-ids", DeletedTMDBIdsView.as_view(), name="admin-deleted-tmdb-ids"),
    path("edit-proposals", EditProposalsView.as_view(), name="admin-edit-proposals"),
    path("hydration/summary", HydrationSummaryView.as_view(), name="admin-hydration-summary"),
    path("hydration", HydrationView.as_view(), name="admin-hydration"),
    path("metrics", MetricsView.as_view(), name="admin-metrics"),
    path("stats", StatsView.as_view(), name="admin-stats"),
]
