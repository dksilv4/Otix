"""Unified proposals service — generic framework for proposal lifecycle.

Handles CRUD, state machine (pending→approved|rejected), voting,
XP awards, notifications, and cache invalidation.
Type-specific behavior is delegated to registered handlers.
"""

from __future__ import annotations

import structlog
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.admin_edit import ProposalVote
from otix.domain.proposal import Proposal
from otix.domain.user import User
from otix.infrastructure.celery import app as celery_app
from otix.lib.xp import (
    EDIT_PROPOSAL_APPROVE,
    EDIT_PROPOSAL_CREATE,
    EDIT_PROPOSAL_REJECT,
    PROPOSAL_VOTE_UPVOTE,
)

logger = structlog.get_logger()

# Minimum XP required to be a "trusted user" (can create/vote)
TRUSTED_XP_THRESHOLD = 500


class ProposalError(Exception):
    """Raised on proposal state machine violations."""


class ProposalsService:
    """Unified service for the entire proposal lifecycle."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ── CRUD ─────────────────────────────────────────────────────────

    async def create(
        self,
        proposal_type: str,
        target_type: str,
        target_id: str,
        payload: dict,
        proposer: User | None = None,
    ) -> Proposal:
        """Create a new proposal. Auto-approves if handler says so."""
        from otix.services.proposal_handlers import get_handler

        handler = get_handler(proposal_type)
        handler.validate_payload(payload)

        # Build snapshot for undo support
        snapshot = self._build_snapshot(proposal_type, payload)

        proposal = Proposal(
            proposal_type=proposal_type,
            target_type=target_type,
            target_id=target_id,
            payload=payload,
            proposer_id=proposer.id if proposer else None,
            status="pending",
            snapshot=snapshot,
        )

        # Check auto-approval
        if handler.auto_approve(proposal, proposer):
            proposal.status = "approved"
            proposal.reviewer_id = proposer.id if proposer else None
            self.db.add(proposal)
            await self.db.flush()
            await handler.on_approve(proposal, self.db)
            await self._award_xp(proposer, EDIT_PROPOSAL_APPROVE)
            await self._award_streak_and_badges(proposer)
        else:
            self.db.add(proposal)
            await self.db.flush()

        # XP for creating
        await self._award_xp(proposer, EDIT_PROPOSAL_CREATE)

        # Re-fetch with relationships
        return await self._reload(proposal.id)

    async def get(self, proposal_id: str) -> Proposal | None:
        """Get a single proposal by ID with all relationships loaded."""
        return await self.db.scalar(
            select(Proposal)
            .options(joinedload(Proposal.proposer), joinedload(Proposal.reviewer))
            .where(Proposal.id == proposal_id)
        )

    async def list(
        self,
        *,
        proposal_type: str | None = None,
        status: str | None = None,
        target_type: str | None = None,
        target_id: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Proposal], int]:
        """List proposals with optional filters. Returns (items, total)."""
        query = (
            select(Proposal)
            .options(joinedload(Proposal.proposer), joinedload(Proposal.reviewer))
        )
        count_query = select(func.count(Proposal.id))

        if proposal_type:
            query = query.where(Proposal.proposal_type == proposal_type)
            count_query = count_query.where(Proposal.proposal_type == proposal_type)
        if status:
            query = query.where(Proposal.status == status)
            count_query = count_query.where(Proposal.status == status)
        if target_type:
            query = query.where(Proposal.target_type == target_type)
            count_query = count_query.where(Proposal.target_type == target_type)
        if target_id:
            query = query.where(Proposal.target_id == target_id)
            count_query = count_query.where(Proposal.target_id == target_id)

        total = await self.db.scalar(count_query) or 0
        query = query.order_by(Proposal.created_at.desc()).offset(offset).limit(limit)
        result = await self.db.scalars(query)
        return list(result.all()), total

    # ── State machine ────────────────────────────────────────────────

    async def approve(self, proposal_id: str, reviewer: User) -> Proposal:
        """Approve a pending proposal. Calls type handler's on_approve."""
        proposal = await self._get_for_review(proposal_id)

        if proposal.status != "pending":
            raise ProposalError("Proposal is not pending")
        if proposer_self_action(proposal, reviewer):
            raise ProposalError("Cannot approve your own proposal")

        proposal.status = "approved"
        proposal.reviewer_id = reviewer.id
        await self.db.flush()

        from otix.services.proposal_handlers import get_handler
        handler = get_handler(proposal.proposal_type)
        await handler.on_approve(proposal, self.db)

        # Cross-cutting concerns
        await self._award_xp(reviewer, EDIT_PROPOSAL_APPROVE)
        await self._award_streak_and_badges(reviewer)
        await self._notify_proposer(proposal, "proposal_approved", "approved")
        await self._invalidate_caches(proposal)

        return await self._reload(proposal.id)

    async def reject(
        self, proposal_id: str, reviewer: User, reason: str | None = None
    ) -> Proposal:
        """Reject a pending proposal. Calls type handler's on_reject."""
        proposal = await self._get_for_review(proposal_id)

        if proposal.status != "pending":
            raise ProposalError("Proposal is not pending")
        if proposer_self_action(proposal, reviewer):
            raise ProposalError("Cannot reject your own proposal")

        proposal.status = "rejected"
        proposal.reviewer_id = reviewer.id
        proposal.rejection_reason = reason
        await self.db.flush()

        from otix.services.proposal_handlers import get_handler
        handler = get_handler(proposal.proposal_type)
        await handler.on_reject(proposal, self.db)

        # Cross-cutting concerns
        await self._award_xp(reviewer, EDIT_PROPOSAL_REJECT)
        await self._award_streak_and_badges(reviewer)
        await self._notify_proposer(proposal, "proposal_rejected", "rejected")

        return await self._reload(proposal.id)

    async def undo(self, proposal_id: str, user: User) -> Proposal:
        """Undo an approved proposal. Resets to pending."""
        proposal = await self._get_for_review(proposal_id)

        if proposal.status != "approved":
            raise ProposalError("Only approved proposals can be undone")

        # Restore snapshot values
        if proposal.snapshot:
            await self._restore_from_snapshot(proposal)

        proposal.status = "pending"
        proposal.reviewer_id = None
        await self.db.flush()

        from otix.services.proposal_handlers import get_handler
        handler = get_handler(proposal.proposal_type)
        await handler.on_undo(proposal, self.db)

        await self._invalidate_caches(proposal)

        return await self._reload(proposal.id)

    # ── Voting ───────────────────────────────────────────────────────

    async def vote(
        self, proposal_id: str, user: User, vote_type: str
    ) -> str | None:
        """Cast or toggle a vote. Returns resulting vote_type or None if toggled off."""
        if vote_type not in ("up", "down"):
            raise ProposalError("vote_type must be 'up' or 'down'")

        proposal = await self.get(proposal_id)
        if proposal is None:
            raise ProposalError("Proposal not found")
        if proposal.status != "pending":
            raise ProposalError("Can only vote on pending proposals")
        if proposer_self_action(proposal, user):
            raise ProposalError("Cannot vote on your own proposal")

        existing = await self.db.scalar(
            select(ProposalVote).where(
                ProposalVote.user_id == user.id,
                ProposalVote.proposal_id == proposal_id,
            )
        )

        if existing:
            if existing.vote_type == vote_type:
                # Toggle off
                await self.db.delete(existing)
                if vote_type == "up":
                    proposal.upvote_count = max(0, proposal.upvote_count - 1)
                else:
                    proposal.downvote_count = max(0, proposal.downvote_count - 1)
                await self.db.flush()
                return None
            else:
                # Flip vote
                if existing.vote_type == "up":
                    proposal.upvote_count = max(0, proposal.upvote_count - 1)
                else:
                    proposal.downvote_count = max(0, proposal.downvote_count - 1)
                existing.vote_type = vote_type
                if vote_type == "up":
                    proposal.upvote_count += 1
                else:
                    proposal.downvote_count += 1
                await self.db.flush()
                return vote_type
        else:
            vote = ProposalVote(
                user_id=user.id,
                proposal_id=proposal_id,
                vote_type=vote_type,
            )
            self.db.add(vote)
            if vote_type == "up":
                proposal.upvote_count += 1
                await self._award_xp(user, PROPOSAL_VOTE_UPVOTE)
            else:
                proposal.downvote_count += 1
            await self.db.flush()
            return vote_type

    async def remove_vote(self, proposal_id: str, user: User) -> bool:
        """Remove a user's vote. Returns True if a vote was removed."""
        existing = await self.db.scalar(
            select(ProposalVote).where(
                ProposalVote.user_id == user.id,
                ProposalVote.proposal_id == proposal_id,
            )
        )
        if not existing:
            return False

        proposal = await self.get(proposal_id)
        if existing.vote_type == "up":
            proposal.upvote_count = max(0, proposal.upvote_count - 1)
        else:
            proposal.downvote_count = max(0, proposal.downvote_count - 1)

        await self.db.delete(existing)
        await self.db.flush()
        return True

    async def get_user_votes(
        self, user_id: str, proposal_ids: list[str]
    ) -> dict[str, str]:
        """Return {proposal_id: vote_type} for a user across a batch."""
        if not proposal_ids:
            return {}
        votes = await self.db.scalars(
            select(ProposalVote).where(
                ProposalVote.user_id == user_id,
                ProposalVote.proposal_id.in_(proposal_ids),
            )
        )
        return {v.proposal_id: v.vote_type for v in votes}

    # ── Internal helpers ───────────────────────────────────────────

    async def _get_for_review(self, proposal_id: str) -> Proposal:
        """Get a proposal with proposer/reviewer joined, or raise."""
        proposal = await self.db.scalar(
            select(Proposal)
            .options(joinedload(Proposal.proposer), joinedload(Proposal.reviewer))
            .where(Proposal.id == proposal_id)
        )
        if proposal is None:
            raise ProposalError("Proposal not found")
        return proposal

    async def _reload(self, proposal_id: str) -> Proposal:
        """Re-fetch proposal with all relationships loaded."""
        return await self._get_for_review(proposal_id)

    def _build_snapshot(self, proposal_type: str, payload: dict) -> dict | None:
        """Build a snapshot dict for undo support."""
        if proposal_type == "match":
            return {
                "source": payload.get("source"),
                "source_game_id": payload.get("source_game_id"),
            }
        elif proposal_type == "edit":
            return {
                "changes": dict(payload.get("changes", {})),
                "created_override_ids": [],
            }
        return None

    async def _restore_from_snapshot(self, proposal: Proposal) -> None:
        """Restore original values from snapshot on undo.

        The type handler's on_undo handles type-specific restoration.
        This method handles framework-level restoration if needed.
        """
        pass  # Type handler handles this

    # ── XP, Streaks, Badges ───────────────────────────────────────

    async def _award_xp(self, user: User | None, amount: int) -> None:
        if user is None or amount <= 0:
            return
        try:
            celery_app.send_task("xp.award", args=[user.id, amount])
        except Exception:
            logger.warning("xp_award_failed", user_id=user.id, amount=amount)

    async def _award_streak_and_badges(self, user: User | None) -> None:
        if user is None:
            return
        try:
            celery_app.send_task("streak.update", args=[user.id])
            celery_app.send_task("gamification.check_badges", args=[user.id])
        except Exception:
            logger.warning("streak_badges_failed", user_id=user.id)

    async def _notify_proposer(
        self, proposal: Proposal, type_: str, action_label: str
    ) -> None:
        """Send a notification to the proposal's proposer (if any)."""
        if not proposal.proposer_id:
            return

        target_title = proposal.payload.get(
            "otix_title",
            proposal.payload.get("source_title", "a media item"),
        )
        body = f"Your proposal for '{target_title}' was {action_label}."

        from otix.services.notification_service import NotificationService

        try:
            ns = NotificationService(self.db)
            await ns.create(
                user_id=proposal.proposer_id,
                type_=type_,
                title=f"Proposal {action_label}",
                body=body,
                metadata_json={"proposal_id": proposal.id},
            )
        except Exception:
            logger.warning("notification_failed", user_id=proposal.proposer_id)

    async def _invalidate_caches(self, proposal: Proposal) -> None:
        """Invalidate relevant caches based on proposal type."""
        if proposal.target_type == "media_item":
            try:
                from otix.infrastructure.redis import get_redis

                redis = await get_redis()
                cache_pattern = f"media:detail:{proposal.target_id}:*"
                keys = [
                    key async for key in redis.scan_iter(match=cache_pattern, count=100)
                ]
                if keys:
                    await redis.delete(*keys)
            except Exception:
                pass


def proposer_self_action(proposal: Proposal, user: User) -> bool:
    """True if the user is the proposer of the proposal."""
    return (
        proposal.proposer_id is not None
        and user.id is not None
        and proposal.proposer_id == user.id
    )


def is_trusted_user(user: User | None) -> bool:
    """Check if a user has enough XP to create/vote on proposals."""
    if user is None:
        return False
    if user.is_admin:
        return True
    return (user.total_xp or 0) >= TRUSTED_XP_THRESHOLD
