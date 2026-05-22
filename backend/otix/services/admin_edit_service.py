from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload

from otix.domain.admin_edit import MediaEditProposal, MediaImageOverride
from otix.domain.media import MediaItem
from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.lib.xp import EDIT_PROPOSAL_CREATE, EDIT_PROPOSAL_APPROVE, EDIT_PROPOSAL_REJECT


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
        proposal = MediaEditProposal(
            media_item_id=media_item_id,
            proposer_user_id=proposer_user_id,
            changes=changes,
            image_overrides=image_overrides,
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
            select(MediaEditProposal).where(MediaEditProposal.id == proposal_id)
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
        media_item = await self.session.scalar(
            select(MediaItem).where(MediaItem.id == proposal.media_item_id)
        )
        if media_item is None:
            raise ValueError("Media item not found")

        allowed_fields = {
            "title", "overview", "poster_url", "textless_poster_url",
            "backdrop_url", "logo_url", "original_language", "release_date",
        }
        # Also allow type-specific fields
        allowed_fields.update({"tagline", "status", "runtime"})

        for field, value in (proposal.changes or {}).items():
            if field in allowed_fields and hasattr(media_item, field):
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

        proposal = await self.session.scalar(
            select(MediaEditProposal)
            .options(
                joinedload(MediaEditProposal.proposer),
                joinedload(MediaEditProposal.approver),
            )
            .where(MediaEditProposal.id == proposal.id)
        )

        app.send_task("xp.award", args=[approver_user_id, EDIT_PROPOSAL_APPROVE])
        app.send_task("streak.update", args=[approver_user_id])
        app.send_task("gamification.check_badges", args=[approver_user_id])

        return proposal

    async def undo_approval(self, proposal_id: str, user_id: str) -> MediaEditProposal:
        proposal = await self.session.scalar(
            select(MediaEditProposal).where(MediaEditProposal.id == proposal_id)
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

        # Reset proposal to pending
        proposal.status = "pending"
        proposal.approver_user_id = None

        await self.session.flush()

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
            select(MediaEditProposal).where(MediaEditProposal.id == proposal_id)
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
            )
            .where(MediaEditProposal.id == proposal.id)
        )

        app.send_task("xp.award", args=[approver_user_id, EDIT_PROPOSAL_REJECT])
        app.send_task("streak.update", args=[approver_user_id])
        app.send_task("gamification.check_badges", args=[approver_user_id])

        return proposal

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
