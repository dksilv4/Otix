"""Library routes.

Mounted at ``/api/v1/library/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). Literal routes
are declared before the generic ``<tab>`` so ``installed``/``plex``/``steam``/
``epic``/``youtube`` are never shadowed.
"""

from django.urls import path, register_converter

from apps.library.converters import SignedIntConverter
from apps.library.views import (
    DesktopNodeHeartbeatView,
    EpicLibraryView,
    EpicStatusView,
    EpicUnmatchedView,
    GameServerAcknowledgeUpdatesView,
    GameServerClaimDirectView,
    GameServerClaimView,
    GameServerConnectionsSyncView,
    GameServerDesktopView,
    GameServerDetailView,
    GameServerDownloadFileView,
    GameServerDownloadsAddView,
    GameServerDownloadsHistoryView,
    GameServerDownloadsListView,
    GameServerDownloadsQueueView,
    GameServerDownloadsSearchView,
    GameServerExplorerBrowseView,
    GameServerExplorerConnectShareView,
    GameServerExplorerCreateFolderView,
    GameServerExplorerRequestPermissionView,
    GameServerExplorerSetPathView,
    GameServerFilesView,
    GameServerInstancesImportView,
    GameServerLibrariesView,
    GameServerListCreateView,
    GameServerOrganizeExecuteView,
    GameServerOrganizePreviewView,
    GameServerOrganizeView,
    GameServerOtixAssetView,
    GameServerOtixMatchView,
    GameServerOtixSettingsView,
    GameServerOtixSyncView,
    GameServerPendingUpdatesView,
    GameServerPendingView,
    GameServerPingView,
    GameServerProbeView,
    GameServerProvidersView,
    GameServerProviderTestView,
    GameServerProwlarrIndexersView,
    GameServerProwlarrSyncView,
    GameServerRadarrConfigView,
    GameServerRadarrHistoryView,
    GameServerRadarrLookupView,
    GameServerRadarrMoviesView,
    GameServerRadarrQualityProfilesView,
    GameServerRadarrQueueView,
    GameServerRadarrRootFoldersView,
    GameServerRadarrTestView,
    GameServerRunningView,
    GameServerSabnzbdQueueControlView,
    GameServerScanClearView,
    GameServerScanView,
    GameServerSessionsView,
    GameServerSonarrConfigView,
    GameServerSonarrHistoryView,
    GameServerSonarrLookupView,
    GameServerSonarrQualityProfilesView,
    GameServerSonarrQueueView,
    GameServerSonarrRootFoldersView,
    GameServerSonarrSeriesView,
    GameServerSonarrTestView,
    GameServerUnclaimView,
    GameServerUsenetConfigView,
    GameServerUsenetDownloadView,
    GameServerUsenetHistoryView,
    GameServerUsenetQueueView,
    GameServerUsenetSearchView,
    GameServerUsenetTestProwlarrView,
    GameServerUsenetTestSabnzbdView,
    GOGLibraryView,
    GOGStatusView,
    GOGUnmatchedView,
    InstalledGamesView,
    LibraryTabView,
    MediaActivityView,
    NodeConnectionsSyncView,
    NodeConnectionsView,
    NodeShareDeleteView,
    NodeShareListCreateView,
    PlexLibraryView,
    PlexStatusView,
    PlexThumbView,
    SteamLibraryView,
    SteamStatusView,
    SteamUnmatchedView,
    SteamWishlistView,
    UserGameRunningView,
    UserGameSessionDetailView,
    UserGameSessionsView,
    UserHomeDetailView,
    UserHomeListCreateView,
    UserMediaRequestDetailView,
    UserMediaRequestsView,
    UserServerMachineDetailView,
    UserServerMachineDetectDrivesView,
    UserServerMachineListCreateView,
    YoutubeLibraryView,
)
from apps.library.views.storage_shares import (
    GameMatchCenterView,
    GameMatchConfirmView,
    GameMatchUnmatchView,
    NodeLibraryPathDetailView,
    NodeLibraryPathsView,
    NodeManifestIngestView,
    StorageShareDetailView,
    StorageSharesView,
)
from apps.library.views.user_hardware import UserHardwareView

register_converter(SignedIntConverter, "sint")

app_name = "library"

urlpatterns = [
    path("installed", InstalledGamesView.as_view(), name="library-installed"),
    path("requests", UserMediaRequestsView.as_view(), name="library-media-requests-list"),
    path(
        "requests/<int:request_id>",
        UserMediaRequestDetailView.as_view(),
        name="library-media-requests-detail",
    ),
    path("homes", UserHomeListCreateView.as_view(), name="library-homes"),
    path("homes/<int:home_id>", UserHomeDetailView.as_view(), name="library-home-detail"),
    path(
        "server-machines", UserServerMachineListCreateView.as_view(), name="library-server-machines"
    ),
    path(
        "server-machines/detect-drives",
        UserServerMachineDetectDrivesView.as_view(),
        name="library-server-machine-detect-drives-direct",
    ),
    path(
        "server-machines/<int:server_id>",
        UserServerMachineDetailView.as_view(),
        name="library-server-machine-detail",
    ),
    path(
        "server-machines/<int:server_id>/detect-drives",
        UserServerMachineDetectDrivesView.as_view(),
        name="library-server-machine-detect-drives",
    ),
    path("node-connections", NodeConnectionsView.as_view(), name="library-node-connections"),
    path(
        "node-connections/sync",
        NodeConnectionsSyncView.as_view(),
        name="library-node-connections-sync",
    ),
    path("game-sessions", UserGameSessionsView.as_view(), name="library-user-game-sessions"),
    path(
        "users/<str:username>/hardware",
        UserHardwareView.as_view(),
        name="library-user-hardware",
    ),
    path(
        "game-sessions/<int:session_id>",
        UserGameSessionDetailView.as_view(),
        name="library-user-game-session-detail",
    ),
    path("game-running", UserGameRunningView.as_view(), name="library-user-game-running"),
    path("nodes", GameServerListCreateView.as_view(), name="library-nodes"),
    path(
        "nodes/desktop-heartbeat",
        DesktopNodeHeartbeatView.as_view(),
        name="library-nodes-desktop-heartbeat",
    ),
    path(
        "servers/desktop-heartbeat",
        DesktopNodeHeartbeatView.as_view(),
        name="library-servers-desktop-heartbeat",
    ),
    path("nodes/claim", GameServerClaimView.as_view(), name="library-nodes-claim"),
    path(
        "nodes/claim-direct",
        GameServerClaimDirectView.as_view(),
        name="library-nodes-claim-direct",
    ),
    path("nodes/media-activity", MediaActivityView.as_view(), name="library-nodes-media-activity"),
    path(
        "servers/media-activity", MediaActivityView.as_view(), name="library-servers-media-activity"
    ),
    path("nodes/pending", GameServerPendingView.as_view(), name="library-nodes-pending"),
    path("nodes/<sint:server_id>", GameServerDetailView.as_view(), name="library-node-detail"),
    path(
        "nodes/<sint:server_id>/shares",
        NodeShareListCreateView.as_view(),
        name="library-node-shares",
    ),
    path(
        "nodes/<sint:server_id>/shares/<int:share_id>",
        NodeShareDeleteView.as_view(),
        name="library-node-share-delete",
    ),
    path("nodes/<sint:server_id>/ping", GameServerPingView.as_view(), name="library-node-ping"),
    path("nodes/<sint:server_id>/probe", GameServerProbeView.as_view(), name="library-node-probe"),
    path(
        "nodes/<sint:server_id>/sessions",
        GameServerSessionsView.as_view(),
        name="library-node-sessions",
    ),
    path(
        "nodes/<sint:server_id>/running",
        GameServerRunningView.as_view(),
        name="library-node-running",
    ),
    path(
        "nodes/<sint:server_id>/pending-updates",
        GameServerPendingUpdatesView.as_view(),
        name="library-node-pending-updates",
    ),
    path(
        "nodes/<sint:server_id>/acknowledge-updates",
        GameServerAcknowledgeUpdatesView.as_view(),
        name="library-node-acknowledge-updates",
    ),
    path("servers", GameServerListCreateView.as_view(), name="library-servers"),
    path(
        "servers/<sint:server_id>/shares",
        NodeShareListCreateView.as_view(),
        name="library-server-shares",
    ),
    path(
        "servers/<sint:server_id>/shares/<int:share_id>",
        NodeShareDeleteView.as_view(),
        name="library-server-share-delete",
    ),
    path("servers/claim", GameServerClaimView.as_view(), name="library-servers-claim"),
    path(
        "servers/claim-direct",
        GameServerClaimDirectView.as_view(),
        name="library-servers-claim-direct",
    ),
    path("servers/unclaim", GameServerUnclaimView.as_view(), name="library-servers-unclaim"),
    path("nodes/unclaim", GameServerUnclaimView.as_view(), name="library-nodes-unclaim"),
    path("servers/pending", GameServerPendingView.as_view(), name="library-servers-pending"),
    path(
        "servers/downloads", GameServerDownloadsListView.as_view(), name="library-servers-downloads"
    ),
    path(
        "servers/downloads/file/<str:filename>",
        GameServerDownloadFileView.as_view(),
        name="library-servers-download-file",
    ),
    path("servers/<sint:server_id>", GameServerDetailView.as_view(), name="library-server-detail"),
    path("servers/<sint:server_id>/ping", GameServerPingView.as_view(), name="library-server-ping"),
    path(
        "servers/<sint:server_id>/probe", GameServerProbeView.as_view(), name="library-server-probe"
    ),
    path(
        "servers/<sint:server_id>/sessions",
        GameServerSessionsView.as_view(),
        name="library-server-sessions",
    ),
    path(
        "servers/<sint:server_id>/running",
        GameServerRunningView.as_view(),
        name="library-server-running",
    ),
    path(
        "servers/<sint:server_id>/connections/sync",
        GameServerConnectionsSyncView.as_view(),
        name="library-server-connections-sync",
    ),
    path(
        "servers/<sint:server_id>/instances/import",
        GameServerInstancesImportView.as_view(),
        name="library-server-instances-import",
    ),
    path(
        "servers/<sint:server_id>/explorer",
        GameServerExplorerBrowseView.as_view(),
        name="library-server-explorer-browse",
    ),
    path(
        "servers/<sint:server_id>/explorer/set-download-path",
        GameServerExplorerSetPathView.as_view(),
        name="library-server-explorer-set-path",
    ),
    path(
        "servers/<sint:server_id>/explorer/create-folder",
        GameServerExplorerCreateFolderView.as_view(),
        name="library-server-explorer-create-folder",
    ),
    path(
        "servers/<sint:server_id>/explorer/request-permission",
        GameServerExplorerRequestPermissionView.as_view(),
        name="library-server-explorer-request-permission",
    ),
    path(
        "servers/<sint:server_id>/explorer/connect-share",
        GameServerExplorerConnectShareView.as_view(),
        name="library-server-explorer-connect-share",
    ),
    # Modular Providers & Downloads Framework
    path(
        "servers/<sint:server_id>/providers",
        GameServerProvidersView.as_view(),
        name="library-server-providers",
    ),
    path(
        "servers/<sint:server_id>/providers/<str:provider_type>/<str:name>/test",
        GameServerProviderTestView.as_view(),
        name="library-server-provider-test",
    ),
    path(
        "servers/<sint:server_id>/downloads/search",
        GameServerDownloadsSearchView.as_view(),
        name="library-server-downloads-search",
    ),
    path(
        "servers/<sint:server_id>/downloads/add",
        GameServerDownloadsAddView.as_view(),
        name="library-server-downloads-add",
    ),
    path(
        "servers/<sint:server_id>/downloads/queue",
        GameServerDownloadsQueueView.as_view(),
        name="library-server-downloads-queue",
    ),
    path(
        "servers/<sint:server_id>/downloads/queue/<str:download_id>",
        GameServerDownloadsQueueView.as_view(),
        name="library-server-downloads-queue-item",
    ),
    path(
        "servers/<sint:server_id>/downloads/history",
        GameServerDownloadsHistoryView.as_view(),
        name="library-server-downloads-history",
    ),
    # Backward compatibility aliases for Usenet
    path(
        "servers/<sint:server_id>/usenet/config",
        GameServerUsenetConfigView.as_view(),
        name="library-server-usenet-config",
    ),
    path(
        "servers/<sint:server_id>/usenet/test-sabnzbd",
        GameServerUsenetTestSabnzbdView.as_view(),
        name="library-server-usenet-test-sabnzbd",
    ),
    path(
        "servers/<sint:server_id>/usenet/test-prowlarr",
        GameServerUsenetTestProwlarrView.as_view(),
        name="library-server-usenet-test-prowlarr",
    ),
    path(
        "servers/<sint:server_id>/usenet/search",
        GameServerUsenetSearchView.as_view(),
        name="library-server-usenet-search",
    ),
    path(
        "servers/<sint:server_id>/usenet/download",
        GameServerUsenetDownloadView.as_view(),
        name="library-server-usenet-download",
    ),
    path(
        "servers/<sint:server_id>/usenet/queue",
        GameServerUsenetQueueView.as_view(),
        name="library-server-usenet-queue",
    ),
    path(
        "servers/<sint:server_id>/usenet/queue/<str:nzo_id>",
        GameServerUsenetQueueView.as_view(),
        name="library-server-usenet-queue-item",
    ),
    path(
        "servers/<sint:server_id>/usenet/history",
        GameServerUsenetHistoryView.as_view(),
        name="library-server-usenet-history",
    ),
    # Prowlarr & SABnzbd specific routes
    path(
        "servers/<sint:server_id>/prowlarr/indexers",
        GameServerProwlarrIndexersView.as_view(),
        name="library-server-prowlarr-indexers",
    ),
    path(
        "servers/<sint:server_id>/prowlarr/sync",
        GameServerProwlarrSyncView.as_view(),
        name="library-server-prowlarr-sync",
    ),
    path(
        "servers/<sint:server_id>/sabnzbd/queue/<str:action>",
        GameServerSabnzbdQueueControlView.as_view(),
        name="library-server-sabnzbd-queue-control",
    ),
    path("servers/<sint:server_id>/scan", GameServerScanView.as_view(), name="library-server-scan"),
    path(
        "servers/<sint:server_id>/scan/clear",
        GameServerScanClearView.as_view(),
        name="library-server-scan-clear",
    ),
    path(
        "servers/<sint:server_id>/otix/settings",
        GameServerOtixSettingsView.as_view(),
        name="library-server-otix-settings",
    ),
    path(
        "servers/<sint:server_id>/otix/sync",
        GameServerOtixSyncView.as_view(),
        name="library-server-otix-sync",
    ),
    path(
        "servers/<sint:server_id>/otix/match",
        GameServerOtixMatchView.as_view(),
        name="library-server-otix-match",
    ),
    path(
        "servers/<sint:server_id>/files/<str:file_id>/otix/asset/<str:role>",
        GameServerOtixAssetView.as_view(),
        name="library-server-otix-asset",
    ),
    # Radarr routes
    path(
        "servers/<sint:server_id>/radarr/config",
        GameServerRadarrConfigView.as_view(),
        name="library-server-radarr-config",
    ),
    path(
        "servers/<sint:server_id>/radarr/test",
        GameServerRadarrTestView.as_view(),
        name="library-server-radarr-test",
    ),
    path(
        "servers/<sint:server_id>/radarr/rootfolders",
        GameServerRadarrRootFoldersView.as_view(),
        name="library-server-radarr-rootfolders",
    ),
    path(
        "servers/<sint:server_id>/radarr/qualityprofiles",
        GameServerRadarrQualityProfilesView.as_view(),
        name="library-server-radarr-qualityprofiles",
    ),
    path(
        "servers/<sint:server_id>/radarr/movies",
        GameServerRadarrMoviesView.as_view(),
        name="library-server-radarr-movies",
    ),
    path(
        "servers/<sint:server_id>/radarr/lookup",
        GameServerRadarrLookupView.as_view(),
        name="library-server-radarr-lookup",
    ),
    path(
        "servers/<sint:server_id>/radarr/queue",
        GameServerRadarrQueueView.as_view(),
        name="library-server-radarr-queue",
    ),
    path(
        "servers/<sint:server_id>/radarr/queue/<str:queue_id>",
        GameServerRadarrQueueView.as_view(),
        name="library-server-radarr-queue-item",
    ),
    path(
        "servers/<sint:server_id>/radarr/history",
        GameServerRadarrHistoryView.as_view(),
        name="library-server-radarr-history",
    ),
    # Sonarr routes
    path(
        "servers/<sint:server_id>/sonarr/config",
        GameServerSonarrConfigView.as_view(),
        name="library-server-sonarr-config",
    ),
    path(
        "servers/<sint:server_id>/sonarr/test",
        GameServerSonarrTestView.as_view(),
        name="library-server-sonarr-test",
    ),
    path(
        "servers/<sint:server_id>/sonarr/rootfolders",
        GameServerSonarrRootFoldersView.as_view(),
        name="library-server-sonarr-rootfolders",
    ),
    path(
        "servers/<sint:server_id>/sonarr/qualityprofiles",
        GameServerSonarrQualityProfilesView.as_view(),
        name="library-server-sonarr-qualityprofiles",
    ),
    path(
        "servers/<sint:server_id>/sonarr/series",
        GameServerSonarrSeriesView.as_view(),
        name="library-server-sonarr-series",
    ),
    path(
        "servers/<sint:server_id>/sonarr/lookup",
        GameServerSonarrLookupView.as_view(),
        name="library-server-sonarr-lookup",
    ),
    path(
        "servers/<sint:server_id>/sonarr/queue",
        GameServerSonarrQueueView.as_view(),
        name="library-server-sonarr-queue",
    ),
    path(
        "servers/<sint:server_id>/sonarr/queue/<str:queue_id>",
        GameServerSonarrQueueView.as_view(),
        name="library-server-sonarr-queue-item",
    ),
    path(
        "servers/<sint:server_id>/sonarr/history",
        GameServerSonarrHistoryView.as_view(),
        name="library-server-sonarr-history",
    ),
    path(
        "servers/<sint:server_id>/desktop",
        GameServerDesktopView.as_view(),
        name="library-server-desktop",
    ),
    path(
        "servers/<sint:server_id>/libraries",
        GameServerLibrariesView.as_view(),
        name="library-server-libraries",
    ),
    path(
        "servers/<sint:server_id>/organize",
        GameServerOrganizeView.as_view(),
        name="library-server-organize",
    ),
    path(
        "servers/<sint:server_id>/organize/preview",
        GameServerOrganizePreviewView.as_view(),
        name="library-server-organize-preview",
    ),
    path(
        "servers/<sint:server_id>/organize/execute",
        GameServerOrganizeExecuteView.as_view(),
        name="library-server-organize-execute",
    ),
    path(
        "servers/<sint:server_id>/pending-updates",
        GameServerPendingUpdatesView.as_view(),
        name="library-server-pending-updates",
    ),
    path(
        "servers/<sint:server_id>/acknowledge-updates",
        GameServerAcknowledgeUpdatesView.as_view(),
        name="library-server-acknowledge-updates",
    ),
    path("server-games", GameServerFilesView.as_view(), name="library-server-games"),
    path("plex", PlexLibraryView.as_view(), name="library-plex"),
    path("plex/status", PlexStatusView.as_view(), name="library-plex-status"),
    path("plex/thumb/<media_item_id>", PlexThumbView.as_view(), name="library-plex-thumb"),
    path("steam", SteamLibraryView.as_view(), name="library-steam"),
    path("steam/status", SteamStatusView.as_view(), name="library-steam-status"),
    path("steam/unmatched", SteamUnmatchedView.as_view(), name="library-steam-unmatched"),
    path("steam/wishlist", SteamWishlistView.as_view(), name="library-steam-wishlist"),
    path("epic", EpicLibraryView.as_view(), name="library-epic"),
    path("epic/status", EpicStatusView.as_view(), name="library-epic-status"),
    path("epic/unmatched", EpicUnmatchedView.as_view(), name="library-epic-unmatched"),
    path("gog", GOGLibraryView.as_view(), name="library-gog"),
    path("gog/status", GOGStatusView.as_view(), name="library-gog-status"),
    path("gog/unmatched", GOGUnmatchedView.as_view(), name="library-gog-unmatched"),
    path("youtube", YoutubeLibraryView.as_view(), name="library-youtube"),
    # Storage Shares, Node Paths & Match Center
    path("shares", StorageSharesView.as_view(), name="library-storage-shares"),
    path("shares/<int:pk>", StorageShareDetailView.as_view(), name="library-storage-share-detail"),
    path("nodes/<sint:node_id>/paths", NodeLibraryPathsView.as_view(), name="library-node-paths"),
    path(
        "nodes/<sint:node_id>/paths/<int:path_id>",
        NodeLibraryPathDetailView.as_view(),
        name="library-node-path-detail",
    ),
    path(
        "nodes/<sint:node_id>/manifest",
        NodeManifestIngestView.as_view(),
        name="library-node-manifest",
    ),
    path("matches", GameMatchCenterView.as_view(), name="library-game-matches"),
    path(
        "matches/<int:record_id>/confirm",
        GameMatchConfirmView.as_view(),
        name="library-game-match-confirm",
    ),
    path(
        "matches/<int:record_id>/unmatch",
        GameMatchUnmatchView.as_view(),
        name="library-game-match-unmatch",
    ),
    path("<tab>", LibraryTabView.as_view(), name="library-tab"),
]
