"""Proposals API views, re-exported for convenient imports."""

from apps.proposals.views.admin import (
    DeletedTMDBIdsView,
    EditProposalsView,
    HydrationSummaryView,
    HydrationView,
    MetricsView,
    StatsView,
)
from apps.proposals.views.proposals import (
    ProposalApproveView,
    ProposalDetailView,
    ProposalListCreateView,
    ProposalRejectView,
    ProposalUndoView,
    ProposalVoteView,
)

__all__ = [
    "DeletedTMDBIdsView",
    "EditProposalsView",
    "HydrationSummaryView",
    "HydrationView",
    "MetricsView",
    "StatsView",
    "ProposalApproveView",
    "ProposalDetailView",
    "ProposalListCreateView",
    "ProposalRejectView",
    "ProposalUndoView",
    "ProposalVoteView",
]
