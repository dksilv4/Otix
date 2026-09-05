"""Game save-path routes (track domain, ``/saves`` prefix).

Mounted at ``/api/v1/saves/`` by ``config/urls.py``. No trailing slashes
(FastAPI parity; ``APPEND_SLASH`` off). ``media_item_id`` is an integer
converter.

Only the DB-backed save-path routes are registered here (locations GET +
suggest POST, reading ``GameSaveOfficialPath`` / ``GameSavePathSuggestion``).
The four Google-Drive cloud-sync routes (files/download/upload/delete) are
deferred: they proxy Google Drive via the integrations/real-OAuth platform
(ARCHITECTURE §7) and are intentionally not mounted.
"""

from django.urls import path

from apps.track.views import SaveLocationSuggestView, SaveLocationsView

app_name = "saves"

urlpatterns = [
    path("locations/<int:media_item_id>", SaveLocationsView.as_view(), name="save-locations"),
    path(
        "locations/<int:media_item_id>/suggest",
        SaveLocationSuggestView.as_view(),
        name="save-location-suggest",
    ),
]
