"""Library routes.

Mounted at ``/api/v1/library/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). Literal routes
are declared before the generic ``<tab>`` so ``installed``/``plex``/``steam``/
``youtube`` are never shadowed.
"""

from django.urls import path

from apps.library.views import (
    GameServerDetailView,
    GameServerDownloadsAddView,
    GameServerDownloadsQueueView,
    GameServerDownloadsSearchView,
    GameServerExplorerBrowseView,
    GameServerExplorerCreateFolderView,
    GameServerExplorerSetPathView,
    GameServerFilesView,
    GameServerListCreateView,
    GameServerPingView,
    GameServerProvidersView,
    GameServerProviderTestView,
    GameServerUsenetConfigView,
    GameServerUsenetDownloadView,
    GameServerUsenetQueueView,
    GameServerUsenetSearchView,
    GameServerUsenetTestProwlarrView,
    GameServerUsenetTestSabnzbdView,
    GameServerProwlarrIndexersView,
    GameServerProwlarrSyncView,
    GameServerSabnzbdQueueControlView,
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
    path("servers", GameServerListCreateView.as_view(), name="library-servers"),
    path("servers/<int:server_id>", GameServerDetailView.as_view(), name="library-server-detail"),
    path("servers/<int:server_id>/ping", GameServerPingView.as_view(), name="library-server-ping"),
    path("servers/<int:server_id>/explorer", GameServerExplorerBrowseView.as_view(), name="library-server-explorer-browse"),
    path("servers/<int:server_id>/explorer/set-download-path", GameServerExplorerSetPathView.as_view(), name="library-server-explorer-set-path"),
    path("servers/<int:server_id>/explorer/create-folder", GameServerExplorerCreateFolderView.as_view(), name="library-server-explorer-create-folder"),
    # Modular Providers & Downloads Framework
    path("servers/<int:server_id>/providers", GameServerProvidersView.as_view(), name="library-server-providers"),
    path("servers/<int:server_id>/providers/<str:provider_type>/<str:name>/test", GameServerProviderTestView.as_view(), name="library-server-provider-test"),
    path("servers/<int:server_id>/downloads/search", GameServerDownloadsSearchView.as_view(), name="library-server-downloads-search"),
    path("servers/<int:server_id>/downloads/add", GameServerDownloadsAddView.as_view(), name="library-server-downloads-add"),
    path("servers/<int:server_id>/downloads/queue", GameServerDownloadsQueueView.as_view(), name="library-server-downloads-queue"),
    path("servers/<int:server_id>/downloads/queue/<str:download_id>", GameServerDownloadsQueueView.as_view(), name="library-server-downloads-queue-item"),
    # Backward compatibility aliases for Usenet
    path("servers/<int:server_id>/usenet/config", GameServerUsenetConfigView.as_view(), name="library-server-usenet-config"),
    path("servers/<int:server_id>/usenet/test-sabnzbd", GameServerUsenetTestSabnzbdView.as_view(), name="library-server-usenet-test-sabnzbd"),
    path("servers/<int:server_id>/usenet/test-prowlarr", GameServerUsenetTestProwlarrView.as_view(), name="library-server-usenet-test-prowlarr"),
    path("servers/<int:server_id>/usenet/search", GameServerUsenetSearchView.as_view(), name="library-server-usenet-search"),
    path("servers/<int:server_id>/usenet/download", GameServerUsenetDownloadView.as_view(), name="library-server-usenet-download"),
    path("servers/<int:server_id>/usenet/queue", GameServerUsenetQueueView.as_view(), name="library-server-usenet-queue"),
    path("servers/<int:server_id>/usenet/queue/<str:nzo_id>", GameServerUsenetQueueView.as_view(), name="library-server-usenet-queue-item"),
    # Prowlarr & SABnzbd specific routes
    path("servers/<int:server_id>/prowlarr/indexers", GameServerProwlarrIndexersView.as_view(), name="library-server-prowlarr-indexers"),
    path("servers/<int:server_id>/prowlarr/sync", GameServerProwlarrSyncView.as_view(), name="library-server-prowlarr-sync"),
    path("servers/<int:server_id>/sabnzbd/queue/<str:action>", GameServerSabnzbdQueueControlView.as_view(), name="library-server-sabnzbd-queue-control"),
    path("server-games", GameServerFilesView.as_view(), name="library-server-games"),


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
