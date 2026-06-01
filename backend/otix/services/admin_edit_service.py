from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from otix.domain.admin_edit import MediaEditProposal, MediaImageOverride, ProposalVote
from otix.domain.media import MediaItem
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.redis import get_redis
from otix.lib.xp import (
    EDIT_PROPOSAL_CREATE,
    EDIT_PROPOSAL_APPROVE,
    EDIT_PROPOSAL_REJECT,
    PROPOSAL_VOTE_UPVOTE,
    PROPOSAL_VOTE_DOWNVOTE,
)

_ALLOWED_FIELDS = {
    "title", "overview", "poster_url", "textless_poster_url",
    "backdrop_url", "logo_url", "original_language", "release_date",
    "tagline", "status", "runtime",
}


class AdminEditService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_proposal(
        self,
        media_item_id: str,
        proposer_user_id: str | None,
        changes: dict,
        image_overrides: list[dict] | None = None,
    ) -> MediaEditProposal:
        # Snapshot original values for fields being changed so undo can restore them
        media_item = await self.session.scalar(
            select(MediaItem).where(MediaItem.id == media_item_id)
        )
        if media_item is None:
            raise ValueError("Media item not found")

        original_values = {}
        for field in _ALLOWED_FIELDS:
            if field in (changes or {}) and hasattr(media_item, field):
                original_values[field] = getattr(media_item, field)

        proposal = MediaEditProposal(
            media_item_id=media_item_id,
            proposer_user_id=proposer_user_id,
            changes=changes,
            image_overrides=image_overrides,
            original_values=original_values or None,
        )
        self.session.add(proposal)
        await self.session.flush()

        proposal = await self.session.scalar(
            select(MediaEditProposal)
            .options(
                joinedload(MediaEditProposal.proposer),
                joinedload(MediaEditProposal.approver),
            )
            .where(MediaEditProposal.id == proposal.id)
        )

        if proposer_user_id:
            app.send_task("xp.award", args=[proposer_user_id, EDIT_PROPOSAL_CREATE])
            app.send_task("streak.update", args=[proposer_user_id])
            app.send_task("gamification.check_badges", args=[proposer_user_id])

        return proposal

    async def approve_proposal(self, proposal_id: str, approver_user_id: str) -> MediaEditProposal:
        proposal = await self.session.scalar(
            select(MediaEditProposal)
            .options(joinedload(MediaEditProposal.media_item))
            .where(MediaEditProposal.id == proposal_id)
        )
        if proposal is None:
            raise ValueError("Proposal not found")
        if proposal.status != "pending":
            raise ValueError("Proposal is not pending")
        if proposal.proposer_user_id is not None and proposal.proposer_user_id == approver_user_id:
            raise ValueError("Cannot approve your own proposal")

        proposal.status = "approved"
        proposal.approver_user_id = approver_user_id

        # Apply field changes to the media item
        media_item = proposal.media_item
        if media_item is None:
            media_item = await self.session.scalar(
                select(MediaItem).where(MediaItem.id == proposal.media_item_id)
            )
        if media_item is None:
            raise ValueError("Media item not found")

        for field, value in (proposal.changes or {}).items():
            if field in _ALLOWED_FIELDS and hasattr(media_item, field):
                setattr(media_item, field, value)

        # Upsert image overrides
        if proposal.image_overrides:
            for override in proposal.image_overrides:
                image_type = override.get("image_type")
                language_code = override.get("language_code")
                url = override.get("url")
                if not image_type or not language_code or not url:
                    continue

                existing = await self.session.scalar(
                    select(MediaImageOverride).where(
                        MediaImageOverride.media_item_id == proposal.media_item_id,
                        MediaImageOverride.image_type == image_type,
                        MediaImageOverride.language_code == language_code,
                    )
                )
                if existing:
                    existing.url = url
                    existing.is_active = True
                else:
                    new_override = MediaImageOverride(
                        media_item_id=proposal.media_item_id,
                        image_type=image_type,
                        language_code=language_code,
                        url=url,
                        created_by_user_id=approver_user_id,
                    )
                    self.session.add(new_override)

        await self.session.flush()

        # Invalidate cached media detail for all country codes
        redis = await get_redis()
        cache_pattern = f"media:detail:{proposal.media_item_id}:*"
        keys = [key async for key in redis.scan_iter(match=cache_pattern, count=100)]
        if keys:
            await redis.delete(*keys)

        proposal = await self.session.scalar(
            select(MediaEditProposal)
            .options(
                joinedload(MediaEditProposal.proposer),
                joinedload(MediaEditProposal.approver),
                joinedload(MediaEditProposal.media_item),
            )
            .where(MediaEditProposal.id == proposal.id)
        )

        app.send_task("xp.award", args=[approver_user_id, EDIT_PROPOSAL_APPROVE])
        app.send_task("streak.update", args=[approver_user_id])
        app.send_task("gamification.check_badges", args=[approver_user_id])

        # Notify proposer
        if proposal.proposer_user_id and proposal.media_item:
            await self._notify_proposer(
                proposal.proposer_user_id,
                "proposal_approved",
                "Your edit proposal was approved",
                proposal.media_item.title,
                proposal.id,
            )

        return proposal

    async def undo_approval(self, proposal_id: str, user_id: str) -> MediaEditProposal:
        proposal = await self.session.scalar(
            select(MediaEditProposal)
            .options(joinedload(MediaEditProposal.media_item))
            .where(MediaEditProposal.id == proposal_id)
        )
        if proposal is None:
            raise ValueError("Proposal not found")
        if proposal.status != "approved":
            raise ValueError("Proposal is not approved")
        if proposal.approver_user_id != user_id:
            raise ValueError("Only the original approver can undo this approval")

        # Delete image overrides that were created by this approval
        if proposal.image_overrides:
            for override in proposal.image_overrides:
                image_type = override.get("image_type")
                language_code = override.get("language_code")
                if not image_type or not language_code:
                    continue
                existing = await self.session.scalar(
                    select(MediaImageOverride).where(
                        MediaImageOverride.media_item_id == proposal.media_item_id,
                        MediaImageOverride.image_type == image_type,
                        MediaImageOverride.language_code == language_code,
                    )
                )
                if existing:
                    await self.session.delete(existing)

        # Restore original field values from the snapshot
        if proposal.original_values:
            media_item = proposal.media_item
            if media_item is None:
                media_item = await self.session.scalar(
                    select(MediaItem).where(MediaItem.id == proposal.media_item_id)
                )
            if media_item:
                for field, value in proposal.original_values.items():
                    if hasattr(media_item, field):
                        setattr(media_item, field, value)

        # Reset proposal to pending
        proposal.status = "pending"
        proposal.approver_user_id = None

        await self.session.flush()

        # Invalidate cached media detail for all country codes
        redis = await get_redis()
        cache_pattern = f"media:detail:{proposal.media_item_id}:*"
        keys = [key async for key in redis.scan_iter(match=cache_pattern, count=100)]
        if keys:
            await redis.delete(*keys)

        proposal = await self.session.scalar(
            select(MediaEditProposal)
            .options(
                joinedload(MediaEditProposal.proposer),
                joinedload(MediaEditProposal.approver),
            )
            .where(MediaEditProposal.id == proposal.id)
        )
        return proposal

    async def reject_proposal(
        self, proposal_id: str, approver_user_id: str, reason: str | None = None
    ) -> MediaEditProposal:
        proposal = await self.session.scalar(
            select(MediaEditProposal)
            .options(joinedload(MediaEditProposal.media_item))
            .where(MediaEditProposal.id == proposal_id)
        )
        if proposal is None:
            raise ValueError("Proposal not found")
        if proposal.status != "pending":
            raise ValueError("Proposal is not pending")
        if proposal.proposer_user_id is not None and proposal.proposer_user_id == approver_user_id:
            raise ValueError("Cannot reject your own proposal")

        proposal.status = "rejected"
        proposal.approver_user_id = approver_user_id
        proposal.rejection_reason = reason

        await self.session.flush()

        proposal = await self.session.scalar(
            select(MediaEditProposal)
            .options(
                joinedload(MediaEditProposal.proposer),
                joinedload(MediaEditProposal.approver),
                joinedload(MediaEditProposal.media_item),
            )
            .where(MediaEditProposal.id == proposal.id)
        )

        app.send_task("xp.award", args=[approver_user_id, EDIT_PROPOSAL_REJECT])
        app.send_task("streak.update", args=[approver_user_id])
        app.send_task("gamification.check_badges", args=[approver_user_id])

        # Notify proposer
        if proposal.proposer_user_id and proposal.media_item:
            await self._notify_proposer(
                proposal.proposer_user_id,
                "proposal_rejected",
                "Your edit proposal was rejected",
                proposal.media_item.title,
                proposal.id,
            )

        return proposal

    async def vote(
        self, proposal_id: str, user_id: str, vote_type: str
    ) -> str | None:
        """Cast or toggle a vote. Returns the resulting vote_type or None if toggled off."""
        proposal = await self.session.scalar(
            select(MediaEditProposal).where(MediaEditProposal.id == proposal_id)
        )
        if proposal is None:
            raise ValueError("Proposal not found")
        if proposal.status != "pending":
            raise ValueError("Can only vote on pending proposals")
        if proposal.proposer_user_id == user_id:
            raise ValueError("Cannot vote on your own proposal")

        existing = await self.session.scalar(
            select(ProposalVote).where(
                ProposalVote.user_id == user_id,
                ProposalVote.proposal_id == proposal_id,
            )
        )

        if existing:
            if existing.vote_type == vote_type:
                # Toggle off
                await self.session.delete(existing)
                if vote_type == "up":
                    proposal.upvote_count = max(0, proposal.upvote_count - 1)
                else:
                    proposal.downvote_count = max(0, proposal.downvote_count - 1)
                await self.session.flush()
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
                await self.session.flush()
                return vote_type
        else:
            vote = ProposalVote(
                user_id=user_id, proposal_id=proposal_id, vote_type=vote_type,
            )
            self.session.add(vote)
            if vote_type == "up":
                proposal.upvote_count += 1
                app.send_task("xp.award", args=[user_id, PROPOSAL_VOTE_UPVOTE])
            else:
                proposal.downvote_count += 1
            await self.session.flush()
            return vote_type

    async def remove_vote(self, proposal_id: str, user_id: str) -> bool:
        existing = await self.session.scalar(
            select(ProposalVote).where(
                ProposalVote.user_id == user_id,
                ProposalVote.proposal_id == proposal_id,
            )
        )
        if not existing:
            return False

        proposal = await self.session.scalar(
            select(MediaEditProposal).where(MediaEditProposal.id == proposal_id)
        )
        if existing.vote_type == "up":
            proposal.upvote_count = max(0, proposal.upvote_count - 1)
        else:
            proposal.downvote_count = max(0, proposal.downvote_count - 1)

        await self.session.delete(existing)
        await self.session.flush()
        return True

    async def get_all_proposals(
        self, status: str | None = None, limit: int = 50, offset: int = 0,
    ) -> tuple[list[MediaEditProposal], int]:
        query = (
            select(MediaEditProposal)
            .options(
                joinedload(MediaEditProposal.proposer),
                joinedload(MediaEditProposal.approver),
                joinedload(MediaEditProposal.media_item),
            )
            .order_by(MediaEditProposal.created_at.desc())
        )
        count_query = select(func.count(MediaEditProposal.id))
        if status:
            query = query.where(MediaEditProposal.status == status)
            count_query = count_query.where(MediaEditProposal.status == status)

        total = await self.session.scalar(count_query) or 0
        result = await self.session.scalars(query.offset(offset).limit(limit))
        return list(result), total

    async def get_proposals_for_media(self, media_item_id: str) -> list[MediaEditProposal]:
        proposals = await self.session.scalars(
            select(MediaEditProposal)
            .options(
                joinedload(MediaEditProposal.proposer),
                joinedload(MediaEditProposal.approver),
            )
            .where(MediaEditProposal.media_item_id == media_item_id)
            .order_by(MediaEditProposal.created_at.desc())
        )
        return list(proposals)

    async def get_pending_proposals(self) -> list[MediaEditProposal]:
        items, _ = await self.get_all_proposals(status="pending", limit=999999, offset=0)
        return items

    async def get_proposal(self, proposal_id: str) -> MediaEditProposal | None:
        return await self.session.scalar(
            select(MediaEditProposal)
            .options(
                joinedload(MediaEditProposal.proposer),
                joinedload(MediaEditProposal.approver),
            )
            .where(MediaEditProposal.id == proposal_id)
        )

    async def get_user_votes_for_proposals(
        self, user_id: str, proposal_ids: list[str]
    ) -> dict[str, str]:
        """Return {proposal_id: vote_type} for a user across a batch of proposals."""
        votes = await self.session.scalars(
            select(ProposalVote).where(
                ProposalVote.user_id == user_id,
                ProposalVote.proposal_id.in_(proposal_ids),
            )
        )
        return {v.proposal_id: v.vote_type for v in votes}

    async def get_image_overrides_for_media(
        self, media_item_id: str
    ) -> dict[str, dict[str, str]]:
        """Return {image_type: {language_code: url}} for active overrides."""
        overrides = await self.session.scalars(
            select(MediaImageOverride).where(
                MediaImageOverride.media_item_id == media_item_id,
                MediaImageOverride.is_active == True,
            )
        )
        result: dict[str, dict[str, str]] = {}
        for o in overrides:
            result.setdefault(o.image_type, {})[o.language_code] = o.url
        return result

    @staticmethod
    async def get_protected_image_types(
        session: AsyncSession, media_item_id: str
    ) -> set[str]:
        """Return image types that have an active '*' override (protected from syncs)."""
        overrides = await session.scalars(
            select(MediaImageOverride.image_type).where(
                MediaImageOverride.media_item_id == media_item_id,
                MediaImageOverride.is_active == True,
                MediaImageOverride.language_code == "*",
            )
        )
        return set(overrides)

    async def create_system_proposal_for_image(
        self,
        media_item_id: str,
        image_type: str,
        proposed_url: str,
    ) -> MediaEditProposal | None:
        """Create a system proposal for an image change. Returns None if no-op."""
        field_map = {
            "poster": "poster_url",
            "backdrop": "backdrop_url",
            "logo": "logo_url",
            "textless_poster": "textless_poster_url",
        }
        field = field_map.get(image_type)
        if not field:
            return None

        return await self.create_proposal(
            media_item_id=media_item_id,
            proposer_user_id=None,
            changes={field: proposed_url},
            image_overrides=None,
        )

    async def _notify_proposer(
        self, user_id: str, type_: str, title: str, media_title: str, proposal_id: str,
    ) -> None:
        from otix.services.notification_service import NotificationService

        ns = NotificationService(self.session)
        await ns.create(
            user_id=user_id,
            type_=type_,
            title=title,
            body=f"Your proposal for '{media_title}' was {title.split()[-1]}.",
            metadata_json={"proposal_id": proposal_id},
        )
