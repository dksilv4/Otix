"""Proposal type handler protocol + registry.

Each proposal type registers a handler that implements ProposalTypeHandler.
The registry is populated at import time by each handler module.
"""

from __future__ import annotations

from typing import Protocol, runtime_checkable

from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.proposal import Proposal
from otix.domain.user import User


@runtime_checkable
class ProposalTypeHandler(Protocol):
    """Interface that each proposal type handler implements.

    A handler defines type-specific behavior:
    - validate_payload: validate the proposal's payload dict
    - auto_approve: determine if the proposal should skip review
    - on_approve: side effects on approval (e.g. create ExternalID)
    - on_reject: side effects on rejection (e.g. create MatchSkip)
    - on_undo: side effects on undo (e.g. restore original values)
    """

    @property
    def proposal_type(self) -> str:
        """Unique type identifier, e.g. 'match', 'edit'."""
        ...

    def validate_payload(self, payload: dict) -> None:
        """Validate the payload dict. Raises ValueError on invalid."""
        ...

    def auto_approve(self, proposal: Proposal, proposer: User | None) -> bool:
        """Return True if the proposal should auto-approve (skip review)."""
        ...

    async def on_approve(
        self, proposal: Proposal, db: AsyncSession
    ) -> None:
        """Side effects executed when a pending proposal is approved.

        Called AFTER proposal.status is set to 'approved'.
        """
        ...

    async def on_reject(
        self, proposal: Proposal, db: AsyncSession
    ) -> None:
        """Side effects executed when a pending proposal is rejected.

        Called AFTER proposal.status is set to 'rejected'.
        """
        ...

    async def on_undo(
        self, proposal: Proposal, db: AsyncSession
    ) -> None:
        """Side effects executed when an approved proposal is undone.

        Called AFTER proposal.status is reset to 'pending'.
        The handler must reverse the effects of on_approve.
        """
        ...


# ── Registry ──────────────────────────────────────────────────────────

_registry: dict[str, ProposalTypeHandler] = {}


def register(handler: ProposalTypeHandler) -> None:
    """Register a proposal type handler."""
    type_ = handler.proposal_type
    if type_ in _registry:
        raise ValueError(f"Handler already registered for proposal type: {type_}")
    _registry[type_] = handler


def get_handler(proposal_type: str) -> ProposalTypeHandler:
    """Get the handler for a proposal type, or raise KeyError."""
    handler = _registry.get(proposal_type)
    if handler is None:
        raise KeyError(
            f"Unknown proposal type: {proposal_type!r}. "
            f"Registered types: {list(_registry)}"
        )
    return handler


def list_types() -> list[str]:
    """Return all registered proposal type names."""
    return list(_registry)


# ── Auto-register built-in handlers ─────────────────────────────────
# Importing these modules triggers their module-level register() calls.

from otix.services.proposal_handlers import match_handler  # noqa: F401, E402
from otix.services.proposal_handlers import edit_handler  # noqa: F401, E402
