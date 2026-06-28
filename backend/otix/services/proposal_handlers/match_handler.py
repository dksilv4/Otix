"""Match proposal handler — game ID linking.

When a scanned game is auto-matched to an Otix media item, this handler:
- Auto-approves high-confidence matches (>= 0.95)
- On approve: creates ExternalID mapping + increments confirmed_count
- On reject: creates MatchSkip entry to prevent re-processing
- On undo: deletes ExternalID mapping
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.proposal import Proposal
from otix.domain.user import User


class MatchProposalHandler:
    """Handler for proposal_type='match' — game-to-Otix ID linking."""

    @property
    def proposal_type(self) -> str:
        return "match"

    # ── Fields required in the payload ────────────────────────────
    _REQUIRED_FIELDS = [
        "source",
        "source_game_id",
        "source_title",
        "otix_media_id",
        "otix_confidence",
        "match_type",
    ]

    def validate_payload(self, payload: dict) -> None:
        for field in self._REQUIRED_FIELDS:
            if field not in payload:
                raise ValueError(f"Match proposal payload missing required field: {field!r}")

    def auto_approve(self, proposal: Proposal, proposer: User | None) -> bool:
        """Manual review required for all match proposals.

        No auto-approval — every match must be reviewed by a human.
        """
        return False

    async def on_approve(
        self, proposal: Proposal, db: AsyncSession
    ) -> None:
        """Create ExternalID mapping + increment confirmed_count."""
        source = proposal.payload["source"]
        source_game_id = proposal.payload["source_game_id"]
        media_item_id = proposal.payload["otix_media_id"]

        eid_svc = self._get_external_id_service(db)
        await eid_svc.upsert(source, source_game_id, "media_item", media_item_id)
        await eid_svc.increment_confirmed(source, source_game_id, "auto")

    async def on_reject(
        self, proposal: Proposal, db: AsyncSession
    ) -> None:
        """Create MatchSkip to prevent re-processing this external ID."""
        from otix.domain.media import MatchSkip

        source = proposal.payload["source"]
        source_game_id = proposal.payload["source_game_id"]

        existing = await db.scalar(
            select(MatchSkip).where(
                MatchSkip.provider == source,
                MatchSkip.external_id == source_game_id,
            )
        )
        if not existing:
            db.add(MatchSkip(provider=source, external_id=source_game_id))

    async def on_undo(
        self, proposal: Proposal, db: AsyncSession
    ) -> None:
        """Delete the ExternalID mapping created by approval.

        Uses the snapshot (stored at create time) to know which
        ExternalID to delete.
        """
        snapshot = proposal.snapshot or {}
        source = snapshot.get("source") or proposal.payload.get("source")
        source_game_id = snapshot.get("source_game_id") or proposal.payload.get("source_game_id")

        if not source or not source_game_id:
            return

        # Delete ExternalID where provider=source, external_id=source_game_id, entity_type='media_item'
        from sqlalchemy import delete as sa_delete
        from otix.domain.media import ExternalID

        await db.execute(
            sa_delete(ExternalID).where(
                ExternalID.provider == source,
                ExternalID.external_id == source_game_id,
                ExternalID.entity_type == "media_item",
            )
        )

        # Also remove MatchSkip if one exists
        from otix.domain.media import MatchSkip

        skip = await db.scalar(
            select(MatchSkip).where(
                MatchSkip.provider == source,
                MatchSkip.external_id == source_game_id,
            )
        )
        if skip:
            await db.delete(skip)

    # ── Internal ──────────────────────────────────────────────────

    def _get_external_id_service(self, db: AsyncSession):
        from otix.services.external_id_service import ExternalIDService

        return ExternalIDService(db)


# ── Auto-register ────────────────────────────────────────────────────
from otix.services.proposal_handlers import register

register(MatchProposalHandler())
