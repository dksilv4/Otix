"""Proposal routes (community match + edit proposals).

Mounted at ``/api/v1/proposals/`` by ``config/urls.py``. No trailing slashes
(FastAPI parity; ``APPEND_SLASH`` off). ``proposal_id`` is an integer
converter. Literal routes before any ``<...>`` (here: none conflict).
"""

from django.urls import path

from apps.proposals.views import (
    ProposalApproveView,
    ProposalDetailView,
    ProposalListCreateView,
    ProposalRejectView,
    ProposalUndoView,
    ProposalVoteView,
)

app_name = "proposals"

urlpatterns = [
    path("", ProposalListCreateView.as_view(), name="proposal-list-create"),
    path("<int:proposal_id>", ProposalDetailView.as_view(), name="proposal-detail"),
    path("<int:proposal_id>/approve", ProposalApproveView.as_view(), name="proposal-approve"),
    path("<int:proposal_id>/reject", ProposalRejectView.as_view(), name="proposal-reject"),
    path("<int:proposal_id>/undo", ProposalUndoView.as_view(), name="proposal-undo"),
    path("<int:proposal_id>/vote", ProposalVoteView.as_view(), name="proposal-vote"),
]
