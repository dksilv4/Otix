"""Edit proposal handler — media metadata changes.

When a trusted user proposes changes to media metadata (title, overview, images),
this handler:
- Auto-approves if proposer is an admin
- On approve: applies field changes to MediaItem, upserts image overrides
- On reject: no-op (just status change)
- On undo: restores original values from snapshot, deletes created image overrides
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.proposal import Proposal
from otix.domain.user import User

# Fields that can be edited via proposals
# Image URLs are edited via image_overrides (media_image_overrides), which the
# query-time asset resolver honors — never via MediaItem columns.
_IMAGE_URL_FIELDS = {"poster_url", "textless_poster_url", "backdrop_url", "logo_url"}

_ALLOWED_CHANGE_FIELDS = {
    "title",
    "overview",
    "original_language",
    "release_date",
    "tagline",
    "status",
    "runtime",
}


class EditProposalHandler:
    """Handler for proposal_type='edit' — media metadata edits."""

    @property
    def proposal_type(self) -> str:
        return "edit"

    def validate_payload(self, payload: dict) -> None:
        changes = payload.get("changes", {})
        if not isinstance(changes, dict):
            raise ValueError("Edit proposal payload must have a 'changes' dict")

        for key in changes:
            if key not in _ALLOWED_CHANGE_FIELDS:
                raise ValueError(f"Field {key!r} is not allowed for editing")

            val = changes[key]
            if val is not None and not isinstance(val, str):
                raise ValueError(f"Field {key!r} must be a string or null")

        image_overrides = payload.get("image_overrides")
        if image_overrides is not None:
            if not isinstance(image_overrides, list):
                raise ValueError("image_overrides must be a list")
            for ov in image_overrides:
                if not isinstance(ov, dict):
                    raise ValueError("Each image override must be a dict")
                for k in ("image_type", "language_code", "url"):
                    if k not in ov:
                        raise ValueError(f"Image override missing field: {k!r}")
                if ov.get("image_type") not in ("poster", "backdrop", "logo", "textless_poster"):
                    raise ValueError(f"Invalid image_type: {ov.get('image_type')!r}")

    def auto_approve(self, proposal: Proposal, proposer: User | None) -> bool:
        """Auto-approve if proposer is an admin."""
        return proposer is not None and proposer.is_admin

    async def on_approve(
        self, proposal: Proposal, db: AsyncSession
    ) -> None:
        """Apply field changes to MediaItem + upsert image overrides."""
        changes = proposal.payload.get("changes", {})
        image_overrides = proposal.payload.get("image_overrides")

        # Fetch media item
        from otix.domain.media import MediaItem

        media_item = await db.scalar(
            select(MediaItem).where(MediaItem.id == proposal.target_id)
        )
        if media_item is None:
            raise ValueError(f"Media item not found: {proposal.target_id}")

        # Apply field changes
        for field, value in changes.items():
            if field in _ALLOWED_CHANGE_FIELDS and hasattr(media_item, field):
                setattr(media_item, field, value)

        # Upsert image overrides
        if image_overrides:
            await self._upsert_image_overrides(
                db, proposal.target_id, image_overrides, proposal.reviewer_id or proposal.proposer_id,
            )

        # Invalidate Redis cache
        await self._invalidate_cache(proposal.target_id)

    async def on_reject(
        self, proposal: Proposal, db: AsyncSession
    ) -> None:
        """No side effects on reject — just status change."""
        pass

    async def on_undo(
        self, proposal: Proposal, db: AsyncSession
    ) -> None:
        """Restore original values from snapshot + delete image overrides."""
        snapshot = proposal.snapshot or {}
        changes_snapshot = snapshot.get("changes", {})

        from otix.domain.media import MediaItem

        media_item = await db.scalar(
            select(MediaItem).where(MediaItem.id == proposal.target_id)
        )
        if media_item is None:
            return

        # Restore field values from snapshot (image URLs are restored via the
        # image overrides deletion below — they're not MediaItem columns).
        for field, value in changes_snapshot.items():
            if field in _IMAGE_URL_FIELDS:
                continue
            if hasattr(media_item, field):
                setattr(media_item, field, value)

        # Delete image overrides that were created by this approval
        override_ids = snapshot.get("created_override_ids", [])
        if override_ids:
            from otix.domain.admin_edit import MediaImageOverride

            for oid in override_ids:
                override = await db.scalar(
                    select(MediaImageOverride).where(MediaImageOverride.id == oid)
                )
                if override:
                    await db.delete(override)

        # Invalidate Redis cache
        await self._invalidate_cache(proposal.target_id)

    # ── Internal helpers ──────────────────────────────────────────

    async def _upsert_image_overrides(
        self,
        db: AsyncSession,
        media_item_id: str,
        image_overrides: list[dict],
        user_id: str | None,
    ) -> None:
        """Upsert image override rows."""
        from otix.domain.admin_edit import MediaImageOverride

        for override in image_overrides:
            image_type = override.get("image_type")
            language_code = override.get("language_code")
            url = override.get("url")
            if not image_type or not language_code or not url:
                continue

            existing = await db.scalar(
                select(MediaImageOverride).where(
                    MediaImageOverride.media_item_id == media_item_id,
                    MediaImageOverride.image_type == image_type,
                    MediaImageOverride.language_code == language_code,
                )
            )
            if existing:
                existing.url = url
                existing.is_active = True
            else:
                new_override = MediaImageOverride(
                    media_item_id=media_item_id,
                    image_type=image_type,
                    language_code=language_code,
                    url=url,
                    created_by_user_id=user_id or "system",
                )
                db.add(new_override)

    async def _invalidate_cache(self, media_item_id: str) -> None:
        """Invalidate Redis cache for media detail."""
        try:
            from otix.infrastructure.redis import get_redis

            redis = await get_redis()
            cache_pattern = f"media:detail:{media_item_id}:*"
            keys = [key async for key in redis.scan_iter(match=cache_pattern, count=100)]
            if keys:
                await redis.delete(*keys)
        except Exception:
            pass  # Cache invalidation is best-effort


# ── Auto-register ────────────────────────────────────────────────────
from otix.services.proposal_handlers import register

register(EditProposalHandler())
