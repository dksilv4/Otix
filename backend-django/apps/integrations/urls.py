"""Routes for the integrations domain (provider read/library-state surface).

Mounted at ``/api/v1/integrations/`` by ``config/urls.py``. No trailing slashes
on routes (FastAPI parity; APPEND_SLASH is off project-wide). Literal routes
precede any parameterised sibling.
"""

from django.urls import path

from apps.integrations.views import (
    PlexAlbumTracksView,
    PlexConnectInfoView,
    PlexLibrariesView,
    PlexServersView,
    PlexSessionsView,
    PlexWebhookView,
    SteamOwnedAppIdsView,
)

app_name = "integrations"

urlpatterns = [
    # Plex read/library-state surface.
    path("plex/servers", PlexServersView.as_view(), name="plex-servers"),
    path("plex/libraries", PlexLibrariesView.as_view(), name="plex-libraries"),
    path(
        "plex/connect-info/<int:media_item_id>",
        PlexConnectInfoView.as_view(),
        name="plex-connect-info",
    ),
    path(
        "plex/album-tracks/<int:media_item_id>",
        PlexAlbumTracksView.as_view(),
        name="plex-album-tracks",
    ),
    path("plex/sessions", PlexSessionsView.as_view(), name="plex-sessions"),
    # Inbound provider webhook (AllowAny; HMAC-verified).
    path("plex/webhook", PlexWebhookView.as_view(), name="plex-webhook"),
    # Steam read surface.
    path("steam/owned-appids", SteamOwnedAppIdsView.as_view(), name="steam-owned-appids"),
]
