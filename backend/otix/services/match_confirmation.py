"""Match confirmation service — handles user accept/reject of match candidates.

This is the **write path** of the matching workflow.  The read path
(``GameMatcher``) returns ranked candidates without mutating anything.
This service handles:

- Confirming a match (creating external_id mappings)
- Importing IGDB games on confirm (kicking off IGDB sync + SGDB hydration)
- Recording permanent rejections so they aren't re-suggested

"""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, MatchSkip
from otix.schemas.media import ConfirmMatchRequest, ConfirmMatchResponse
from otix.services.external_id_service import ExternalIDService

logger = structlog.get_logger()

# Celery app reference — imported lazily to avoid circular imports at module level.
_celery_app = None


def _get_celery_app():
    global _celery_app
    if _celery_app is None:
        from otix.infrastructure.celery import app

        _celery_app = app
    return _celery_app


class MatchConfirmationService:
    """Persist user match decisions.

    Usage::

        svc = MatchConfirmationService(session)
        result = await svc.confirm(ConfirmMatchRequest(
            query_id="epic:AppName",
            media_item_id="otix_xxx",
            igdb_id=12345,
        ))
    """

    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._eid_svc = ExternalIDService(session)

    async def confirm(self, req: ConfirmMatchRequest) -> ConfirmMatchResponse:
        """Handle a user's match decision.

        Actions:
        - rejected_permanently: insert into match_skips
        - rejected: no-op (just acknowledge)
        - confirmed with igdb_id: import IGDB game first
        - confirmed: create external_id mappings
        """
        provider, external_id = self._parse_query_id(req.query_id)
        if not provider or not external_id:
            return ConfirmMatchResponse(
                success=False,
                error=f"Invalid query_id format: {req.query_id!r}. Expected 'provider:id'.",
            )

        # ── Permanent rejection ─────────────────────────────────────────────
        if req.rejected_permanently:
            return await self._handle_reject_permanent(provider, external_id)

        # ── Soft rejection ─────────────────────────────────────────────────
        if req.rejected:
            logger.info(
                "match rejected (soft)",
                provider=provider,
                external_id=external_id,
            )
            return ConfirmMatchResponse(success=True, media_item_id=None)

        # ── Confirmation ────────────────────────────────────────────────────
        media_item_id = req.media_item_id

        # If the game isn't in Otix yet, import from IGDB
        if media_item_id is None and req.igdb_id is not None:
            media_item_id = await self._import_igdb_game(req.igdb_id)
            if media_item_id is None:
                return ConfirmMatchResponse(
                    success=False,
                    error=f"Failed to import IGDB game {req.igdb_id}",
                )

        if media_item_id is None:
            return ConfirmMatchResponse(
                success=False,
                error="Either media_item_id or igdb_id must be provided for confirmation.",
            )

        # ── Create external_id mappings ─────────────────────────────────────
        try:
            # Map the original provider ID → Otix media item
            await self._eid_svc.upsert(provider, external_id, "media_item", media_item_id)

            # Increment confirmed_count (user confirmed = +1 signal)
            user_id = "desktop_user"  # Single-user desktop; multi-user would extract from request
            await self._eid_svc.increment_confirmed(provider, external_id, user_id, "media_item")

            # Also map IGDB → Otix if we have it
            if req.igdb_id is not None:
                await self._eid_svc.upsert("igdb", str(req.igdb_id), "media_item", media_item_id)

            # Fire-and-forget SGDB hydration for the newly matched game
            self._enqueue_sgdb_hydration(media_item_id)

        except Exception:
            logger.exception(
                "failed to persist external_id mapping",
                provider=provider,
                external_id=external_id,
                media_item_id=media_item_id,
            )
            return ConfirmMatchResponse(
                success=False,
                error="Database error while saving match.",
            )

        logger.info(
            "match confirmed",
            provider=provider,
            external_id=external_id,
            media_item_id=media_item_id,
            igdb_id=req.igdb_id,
        )
        return ConfirmMatchResponse(success=True, media_item_id=media_item_id)

    async def unlink(self, query_id: str) -> ConfirmMatchResponse:
        """Remove an external_id mapping so the game can be re-matched.

        Also removes any match_skip entry for the same provider+external_id.
        """
        provider, external_id = self._parse_query_id(query_id)
        if not provider or not external_id:
            return ConfirmMatchResponse(
                success=False,
                error=f"Invalid query_id format: {query_id!r}",
            )

        # Remove external_id mapping by natural key
        from sqlalchemy import delete as sa_delete

        # Delete by (provider, external_id) — removes the mapping regardless of entity_id
        result = await self._session.execute(
            sa_delete(ExternalID).where(
                ExternalID.provider == provider,
                ExternalID.external_id == external_id,
            )
        )
        deleted = result.rowcount > 0

        # Remove match_skip if any
        await self._session.execute(
            sa_delete(MatchSkip).where(
                MatchSkip.provider == provider,
                MatchSkip.external_id == external_id,
            )
        )

        logger.info(
            "match unlinked",
            provider=provider,
            external_id=external_id,
            deleted=deleted,
        )
        return ConfirmMatchResponse(success=True, media_item_id=None)

    # ── Helpers ─────────────────────────────────────────────────────────────

    @staticmethod
    def _parse_query_id(query_id: str) -> tuple[str, str]:
        """Split 'provider:external_id' into (provider, external_id)."""
        if ":" not in query_id:
            return ("", "")
        parts = query_id.split(":", 1)
        return parts[0].strip().lower(), parts[1].strip()

    async def _handle_reject_permanent(self, provider: str, external_id: str) -> ConfirmMatchResponse:
        """Insert a permanent rejection record."""
        existing = await self._session.scalar(
            select(MatchSkip).where(
                MatchSkip.provider == provider,
                MatchSkip.external_id == external_id,
            )
        )
        if existing is None:
            self._session.add(MatchSkip(provider=provider, external_id=external_id))
            logger.info(
                "match rejected permanently",
                provider=provider,
                external_id=external_id,
            )

        return ConfirmMatchResponse(success=True, media_item_id=None)

    async def _import_igdb_game(self, igdb_id: int) -> str | None:
        """Synchronously import an IGDB game into the catalog.

        Uses the existing ``_sync_igdb_game`` function (same as the old
        auto-import path, but now only runs on explicit user confirmation).
        """
        from otix.tasks.sync.igdb import _sync_igdb_game

        try:
            result = await _sync_igdb_game(igdb_id, force=False)
        except Exception:
            logger.exception("IGDB import failed", igdb_id=igdb_id)
            return None

        if result is None:
            logger.warning(
                "IGDB import returned no result",
                igdb_id=igdb_id,
            )
            return None

        # Success case: result = {"otix_id": "...", "igdb_id": igdb_id, ...}
        # After import, re-query ExternalID to get the entity_id
        ext = await self._session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id == str(igdb_id),
            )
        )
        if ext:
            return ext.entity_id or ext.media_item_id

        # Fallback: use the id from the result dict
        otix_id = result.get("otix_id") if isinstance(result, dict) else None
        if otix_id:
            return str(otix_id)

        return None

    @staticmethod
    def _enqueue_sgdb_hydration(media_item_id: str) -> None:
        """Fire-and-forget SteamGridDB hydration for a game.

        This runs asynchronously — the API response does not wait for it.
        """
        try:
            app = _get_celery_app()
            app.send_task(
                "sync.steamgrid.game_by_name",
                args=[media_item_id],
                priority=5,
            )
        except Exception:
            logger.warning(
                "failed to enqueue steamgrid hydration",
                media_item_id=media_item_id,
                exc_info=True,
            )
