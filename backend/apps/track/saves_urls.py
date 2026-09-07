"""Game save routes (track domain, ``/saves`` prefix).

Mounted at ``/api/v1/saves/`` by ``config/urls.py``. No trailing slashes
(FastAPI parity; ``APPEND_SLASH`` off). ``media_item_id`` is an integer
converter, ``game_id``/``file_id`` are strings.

Both halves of the legacy ``saves.py`` router live here: the DB-backed
save-path routes (locations GET + suggest POST, reading
``GameSaveOfficialPath`` / ``GameSavePathSuggestion``) and the four Google-Drive
cloud-sync routes (files/upload/download/delete, proxying the user's Drive
through ``GoogleDriveService``). Literal ``locations/...`` routes precede the
``<str:game_id>`` siblings.
"""

from django.urls import path

from apps.track.views import (
    CloudSaveDeleteView,
    CloudSaveDownloadView,
    CloudSaveFilesView,
    CloudSaveUploadView,
    SaveLocationSuggestView,
    SaveLocationsView,
)

app_name = "saves"

urlpatterns = [
    path("locations/<int:media_item_id>", SaveLocationsView.as_view(), name="save-locations"),
    path(
        "locations/<int:media_item_id>/suggest",
        SaveLocationSuggestView.as_view(),
        name="save-location-suggest",
    ),
    path("<str:game_id>/files", CloudSaveFilesView.as_view(), name="cloud-save-files"),
    path("<str:game_id>/upload", CloudSaveUploadView.as_view(), name="cloud-save-upload"),
    path(
        "<str:game_id>/download/<str:file_id>",
        CloudSaveDownloadView.as_view(),
        name="cloud-save-download",
    ),
    path(
        "<str:game_id>/delete/<str:file_id>",
        CloudSaveDeleteView.as_view(),
        name="cloud-save-delete",
    ),
]
