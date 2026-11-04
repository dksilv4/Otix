"""Library routes.

Mounted at ``/api/v1/library/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). Literal routes
are declared before the generic ``<tab>`` so ``installed``/``plex``/``steam``/
``epic``/``youtube`` are never shadowed.
"""

from django.urls import include, path, register_converter

from apps.library.converters import SignedIntConverter
from apps.library.views import (
    EpicLibraryView,
    EpicStatusView,
    EpicUnmatchedView,
    GOGLibraryView,
    GOGStatusView,
    GOGUnmatchedView,
    CanonicalGamesView,
    InstalledGamesView,
    LibraryTabView,
    MediaActivityView,
    NodeConnectionsSyncView,
    NodeConnectionsView,
    NodeFilesView,
    NodeListCreateView,
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
    UserMachineDetailView,
    UserMachineDetectDrivesView,
    UserMachineListCreateView,
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
    StorageShareDetailView,
    StorageSharesView,
)
from apps.library.views.user_hardware import UserHardwareView

try:
    register_converter(SignedIntConverter, "sint")
except Exception:
    pass

app_name = "library"

urlpatterns = [
    path("games", CanonicalGamesView.as_view(), name="library-games"),
    path("installed", InstalledGamesView.as_view(), name="library-installed"),
    path("requests", UserMediaRequestsView.as_view(), name="library-media-requests-list"),
    path(
        "requests/<int:request_id>",
        UserMediaRequestDetailView.as_view(),
        name="library-media-requests-detail",
    ),
    path("homes", UserHomeListCreateView.as_view(), name="library-homes"),
    path("homes/<int:home_id>", UserHomeDetailView.as_view(), name="library-home-detail"),
    path("machines", UserMachineListCreateView.as_view(), name="library-machines"),
    path(
        "machines/detect-drives",
        UserMachineDetectDrivesView.as_view(),
        name="library-machine-detect-drives-direct",
    ),
    path(
        "machines/<int:machine_id>",
        UserMachineDetailView.as_view(),
        name="library-machine-detail",
    ),
    path(
        "machines/<int:machine_id>/detect-drives",
        UserMachineDetectDrivesView.as_view(),
        name="library-machine-detect-drives",
    ),
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
    
    # ── Unified Node Routes (/api/v1/library/nodes/*) ────────────────────────
    path("nodes", NodeListCreateView.as_view(), name="library-nodes-root"),
    path("nodes/", include("apps.library.node_urls")),
    path("server-games", NodeFilesView.as_view(), name="library-server-games"),

    # ── Platform Library Scans & Tabs ────────────────────────────────────────
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

    # ── Storage Shares & Match Center ────────────────────────────────────────
    path("shares", StorageSharesView.as_view(), name="library-storage-shares"),
    path("shares/<int:pk>", StorageShareDetailView.as_view(), name="library-storage-share-detail"),
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
