"""Proposals domain models.

Ported from legacy FastAPI domain modules under ``backend/otix/domain/``.
One module per aggregate/concern:
- ``proposal``:       unified Proposal (single-table, type-discriminated)
- ``match_proposal``: MatchProposal (source game -> catalog item)
- ``admin_edit``:     MediaEditProposal + MediaImageOverride + ProposalVote
- ``bookkeeping``:    MatchSkip + TMDBDeletedID (from legacy media.py)
"""

from apps.proposals.models.admin_edit import (
    MediaEditProposal,
    MediaImageOverride,
    ProposalVote,
)
from apps.proposals.models.bookkeeping import MatchSkip, TMDBDeletedID
from apps.proposals.models.match_proposal import MatchProposal
from apps.proposals.models.proposal import Proposal

__all__ = [
    "MatchProposal",
    "MatchSkip",
    "MediaEditProposal",
    "MediaImageOverride",
    "Proposal",
    "ProposalVote",
    "TMDBDeletedID",
]
