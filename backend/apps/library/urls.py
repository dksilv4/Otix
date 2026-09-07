"""Library routes.

Mounted at ``/api/v1/library/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). Literal routes
are declared before the generic ``<tab>`` so ``installed``/``plex``/``steam``/
``youtube`` are never shadowed.
"""

from django.urls import path

from apps.library.views import (
    InstalledGamesView,
    LibraryTabView,
    PlexLibraryView,
    PlexStatusView,
    PlexThumbView,
    SteamLibraryView,
    SteamStatusView,
    SteamUnmatchedView,
    SteamWishlistView,
    YoutubeLibraryView,
)

app_name = "library"

urlpatterns = [
    path("installed", InstalledGamesView.as_view(), name="library-installed"),
    path("plex", PlexLibraryView.as_view(), name="library-plex"),
    path("plex/status", PlexStatusView.as_view(), name="library-plex-status"),
    path("plex/thumb/<media_item_id>", PlexThumbView.as_view(), name="library-plex-thumb"),
    path("steam", SteamLibraryView.as_view(), name="library-steam"),
    path("steam/status", SteamStatusView.as_view(), name="library-steam-status"),
    path("steam/unmatched", SteamUnmatchedView.as_view(), name="library-steam-unmatched"),
    path("steam/wishlist", SteamWishlistView.as_view(), name="library-steam-wishlist"),
    path("youtube", YoutubeLibraryView.as_view(), name="library-youtube"),
    path("<tab>", LibraryTabView.as_view(), name="library-tab"),
]
