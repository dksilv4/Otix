"""Media routes.

Mounted at ``/api/v1/media/`` by ``config/urls.py``. No trailing slashes on
routes (FastAPI parity; ``APPEND_SLASH`` is off project-wide). ``media_type``
is the legacy string discriminator (movie/show/game/album/...); ``media_id`` is
an integer matching the greenfield integer PKs.

Literal routes are declared before ``<...>`` converters so e.g. ``genres`` is
never shadowed by ``<media_id>``.
"""

from django.urls import path

from apps.media.views import (
    ArtworkSelectionView,
    ArtworkSettingsView,
    AssetMirrorView,
    CatalogStreamView,
    CertificationListView,
    ClaimView,
    CompanyLookupView,
    DownloadAssetsView,
    EditProposalListCreateView,
    EditProposalModerationView,
    EditProposalVoteView,
    EpisodeInteractionsView,
    EpisodeWatchedView,
    GenreListView,
    ImportIgdbView,
    ImportView,
    InteractionView,
    MatchBatchView,
    MatchConfirmView,
    MatchGameView,
    MatchProposalAdminListView,
    MatchProposalModerationView,
    MatchProposeView,
    MatchScanView,
    MatchStreamView,
    MatchUnlinkView,
    MediaAssetsView,
    MediaDetailView,
    MediaListView,
    MirroringView,
    PurgeAssetsView,
    RatingView,
    RecommendationView,
    RehydrateStreamView,
    RehydrateView,
    ReviewListView,
    ReviewView,
    SeasonWatchedView,
    ShowWatchedView,
    SimilarMediaView,
    StorageUsageView,
    SyncLocalGamesView,
    TextlessPickView,
)
from apps.search.views import ProvidersView, SuggestionsView

app_name = "media"

urlpatterns = [
    # Literal catalog browse / admin routes (must precede <int:media_id> paths).
    path("", MediaListView.as_view(), name="media-list"),
    path("stream", CatalogStreamView.as_view(), name="media-stream"),
    path("genres", GenreListView.as_view(), name="genre-list"),
    path("suggestions", SuggestionsView.as_view(), name="media-suggestions"),
    path("search-providers", ProvidersView.as_view(), name="media-search-providers"),
    path("certifications", CertificationListView.as_view(), name="certification-list"),
    path("company", CompanyLookupView.as_view(), name="company-lookup"),
    path(
        "admin/match-proposals",
        MatchProposalAdminListView.as_view(),
        name="match-proposal-list",
    ),
    path(
        "admin/match-proposals/<int:proposal_id>/approve",
        MatchProposalModerationView.as_view(action="approve"),
        name="match-proposal-approve",
    ),
    path(
        "admin/match-proposals/<int:proposal_id>/reject",
        MatchProposalModerationView.as_view(action="reject"),
        name="match-proposal-reject",
    ),
    path(
        "admin/media-items/<int:media_id>/download-assets",
        DownloadAssetsView.as_view(),
        name="admin-download-assets",
    ),
    path(
        "admin/media-items/<int:media_id>/assets/<int:asset_id>/select",
        ArtworkSelectionView.as_view(),
        name="admin-artwork-select",
    ),
    path(
        "admin/media-items/<int:media_id>/assets/<int:asset_id>/textless",
        TextlessPickView.as_view(),
        name="admin-artwork-textless",
    ),
    path(
        "admin/media-items/<int:media_id>/assets/<int:asset_id>/mirror",
        AssetMirrorView.as_view(),
        name="admin-artwork-mirror",
    ),
    path("admin/mirroring", MirroringView.as_view(), name="admin-mirroring"),
    path(
        "admin/artwork-settings",
        ArtworkSettingsView.as_view(),
        name="admin-artwork-settings",
    ),
    path("admin/assets", PurgeAssetsView.as_view(), name="admin-purge-assets"),
    path("admin/storage", StorageUsageView.as_view(), name="admin-storage"),
    # Import / match / sync-local-games (literal verbs; no media_id prefix).
    path("import", ImportView.as_view(), name="media-import"),
    path("import/igdb", ImportIgdbView.as_view(), name="media-import-igdb"),
    path("match", MatchGameView.as_view(), name="match-game"),
    path("match/batch", MatchBatchView.as_view(), name="match-batch"),
    path("match/stream", MatchStreamView.as_view(), name="match-stream"),
    path("match/scan", MatchScanView.as_view(), name="match-scan"),
    path("match/confirm", MatchConfirmView.as_view(), name="match-confirm"),
    path("match/unlink", MatchUnlinkView.as_view(), name="match-unlink"),
    path("match/propose", MatchProposeView.as_view(), name="match-propose"),
    path("sync-local-games", SyncLocalGamesView.as_view(), name="sync-local-games"),
    # Media-item-scoped literal sub-resources (media_id is the hub PK).
    path("<int:media_id>/claim", ClaimView.as_view(), name="media-claim"),
    path(
        "<int:media_id>/edit-proposals",
        EditProposalListCreateView.as_view(),
        name="edit-proposal-list-create",
    ),
    path(
        "<int:media_id>/edit-proposals/<int:proposal_id>/approve",
        EditProposalModerationView.as_view(action="approve"),
        name="edit-proposal-approve",
    ),
    path(
        "<int:media_id>/edit-proposals/<int:proposal_id>/reject",
        EditProposalModerationView.as_view(action="reject"),
        name="edit-proposal-reject",
    ),
    path(
        "<int:media_id>/edit-proposals/<int:proposal_id>/undo",
        EditProposalModerationView.as_view(action="undo"),
        name="edit-proposal-undo",
    ),
    path(
        "<int:media_id>/edit-proposals/<int:proposal_id>/vote",
        EditProposalVoteView.as_view(),
        name="edit-proposal-vote",
    ),
    path("<int:media_id>/rehydrate", RehydrateView.as_view(), name="media-rehydrate"),
    path(
        "<int:media_id>/rehydrate/<str:task_id>/stream",
        RehydrateStreamView.as_view(),
        name="media-rehydrate-stream",
    ),
    # media_type-scoped detail + sub-resources.
    path(
        "<str:media_type>/<str:media_id>",
        MediaDetailView.as_view(),
        name="media-detail",
    ),
    path(
        "<str:media_type>/<int:media_id>/assets",
        MediaAssetsView.as_view(),
        name="media-assets",
    ),
    path(
        "<str:media_type>/<str:media_id>/similar",
        SimilarMediaView.as_view(),
        name="media-similar",
    ),
    path(
        "<str:media_type>/<str:media_id>/recommendations",
        RecommendationView.as_view(),
        name="media-recommendations",
    ),
    path(
        "<str:media_type>/<int:media_id>/rating",
        RatingView.as_view(),
        name="media-rating",
    ),
    path(
        "<str:media_type>/<int:media_id>/review",
        ReviewView.as_view(),
        name="media-review",
    ),
    path(
        "<str:media_type>/<str:media_id>/reviews",
        ReviewListView.as_view(),
        name="media-reviews",
    ),
    path(
        "<str:media_type>/<int:media_id>/interactions",
        InteractionView.as_view(),
        name="media-interactions",
    ),
    path(
        "<str:media_type>/<int:media_id>/interactions/<str:interaction_type>",
        InteractionView.as_view(),
        name="media-interaction-toggle",
    ),
    path(
        "<str:media_type>/<int:media_id>/episode-interactions",
        EpisodeInteractionsView.as_view(),
        name="media-episode-interactions",
    ),
    path(
        "<str:media_type>/<int:media_id>/episodes/<int:episode_id>/watched",
        EpisodeWatchedView.as_view(),
        name="media-episode-watched",
    ),
    path(
        "<str:media_type>/<int:media_id>/seasons/<int:season_number>/watched",
        SeasonWatchedView.as_view(),
        name="media-season-watched",
    ),
    path(
        "<str:media_type>/<int:media_id>/show-watched",
        ShowWatchedView.as_view(),
        name="media-show-watched",
    ),
]
