"""Proposals domain services, re-exported for convenient imports.

Plain callables over the models (see ``proposals.py`` and ``admin.py``); views
stay thin and serializers declarative, delegating the state machine, handler
side effects and dashboard aggregations here.
"""

from apps.proposals.services.admin import (
    get_hydration_status,
    get_metrics,
    get_stats,
    hydration_summary,
    list_deleted_tmdb_ids,
    list_edit_proposals,
)
from apps.proposals.services.proposals import (
    ProposalError,
    approve_proposal,
    build_proposal_context,
    create_proposal,
    filter_proposals,
    get_proposal,
    get_user_votes,
    is_trusted_user,
    reject_proposal,
    remove_proposal_vote,
    undo_proposal,
    vote_on_proposal,
)

__all__ = [
    "ProposalError",
    "approve_proposal",
    "build_proposal_context",
    "create_proposal",
    "filter_proposals",
    "get_hydration_status",
    "get_metrics",
    "get_proposal",
    "get_stats",
    "get_user_votes",
    "hydration_summary",
    "is_trusted_user",
    "list_deleted_tmdb_ids",
    "list_edit_proposals",
    "reject_proposal",
    "remove_proposal_vote",
    "undo_proposal",
    "vote_on_proposal",
]
