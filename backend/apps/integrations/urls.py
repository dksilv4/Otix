"""Routes for the integrations domain (provider read/library-state surface).

Mounted at ``/api/v1/integrations/`` by ``config/urls.py``. No trailing slashes
on routes (FastAPI parity; APPEND_SLASH is off project-wide). Literal routes
precede any parameterised sibling.
"""

from django.urls import path

from apps.integrations.views import (
    EpicLibraryScanView,
    EpicStatusView,
    PlexAlbumTracksView,
    PlexConnectInfoView,
    PlexLibrariesView,
    PlexServersView,
    PlexSessionsView,
    PlexStreamView,
    PlexSyncStreamView,
    PlexSyncView,
    PlexWatchlistSyncView,
    PlexWebhookView,
    SteamLibraryScanView,
    SteamOwnedAppIdsView,
    SteamResolveUnmatchedView,
    SteamWishlistScanView,
    TMDbRatingSyncView,
    TMDbWatchlistImportView,
    YoutubeSyncStreamView,
    YoutubeSyncView,
)

app_name = "integrations"

urlpatterns = [
    # Plex read/library-state surface.
    path("plex/servers", PlexServersView.as_view(), name="plex-servers"),
    path("plex/libraries", PlexLibrariesView.as_view(), name="plex-libraries"),
    path("plex/stream/<str:rating_key>", PlexStreamView.as_view(), name="plex-stream"),
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
    path(
        "plex/watchlist/sync",
        PlexWatchlistSyncView.as_view(),
        name="plex-watchlist-sync",
    ),
    # Inbound provider webhook (AllowAny; HMAC-verified).
    path("plex/webhook", PlexWebhookView.as_view(), name="plex-webhook"),
    # Provider background sync: enqueue (POST) + SSE progress stream (GET).
    path("plex/sync", PlexSyncView.as_view(), name="plex-sync"),
    path(
        "plex/sync/<str:task_id>/stream",
        PlexSyncStreamView.as_view(),
        name="plex-sync-stream",
    ),
    path("youtube/sync", YoutubeSyncView.as_view(), name="youtube-sync"),
    path(
        "youtube/sync/<str:task_id>/stream",
        YoutubeSyncStreamView.as_view(),
        name="youtube-sync-stream",
    ),
    # Steam read + scan surface.
    path("steam/owned-appids", SteamOwnedAppIdsView.as_view(), name="steam-owned-appids"),
    path("steam/scan", SteamLibraryScanView.as_view(), name="steam-scan"),
    path(
        "steam/wishlist/scan",
        SteamWishlistScanView.as_view(),
        name="steam-wishlist-scan",
    ),
    path(
        "steam/resolve-unmatched",
        SteamResolveUnmatchedView.as_view(),
        name="steam-resolve-unmatched",
    ),
    # Epic status + scan (token lives on the Otix Server node).
    path("epic/status", EpicStatusView.as_view(), name="epic-status"),
    path("epic/scan", EpicLibraryScanView.as_view(), name="epic-scan"),
    # TMDb account sync (ratings both ways + watchlist import).
    path(
        "tmdb/rating-sync",
        TMDbRatingSyncView.as_view(),
        name="tmdb-rating-sync",
    ),
    path(
        "tmdb/watchlist-import",
        TMDbWatchlistImportView.as_view(),
        name="tmdb-watchlist-import",
    ),
]
