"""MusicBrainz-backed full-hydration adapter for music albums."""

from __future__ import annotations

import time
from collections.abc import Awaitable

import structlog

from otix.hydration.analytics import record_hydration_run
from otix.hydration.protocol import FullHydration, RelatedCandidate
from otix.infrastructure.database import async_session
from otix.lib.metrics import HYDRATION_ITEM_DURATION, HYDRATION_STAGE_DURATION
from otix.services.completeness import set_completeness

logger = structlog.get_logger()


class MusicbrainzHydration(FullHydration):
    provider_name = "musicbrainz"

    async def hydrate_complete(
        self, media_type: str, external_id: int | str, *, force: bool = False
    ) -> dict | None:
        from otix.tasks.sync.deezer import _sync_deezer_enrich_cover
        from otix.tasks.sync.embedding import _generate_embedding
        from otix.tasks.sync.fanart import _sync_fanart_enrich
        from otix.tasks.sync.musicbrainz import _sync_musicbrainz_album
        from otix.tasks.sync.theaudiodb import _sync_theaudiodb_enrich_album

        start = time.monotonic()
        stages: dict[str, float] = {}
        status = "success"
        error: str | None = None
        item_id: str | None = None
        title: str | None = None

        async def staged(stage: str, coro: Awaitable):
            t0 = time.monotonic()
            try:
                return await coro
            finally:
                elapsed = time.monotonic() - t0
                stages[stage] = elapsed
                HYDRATION_STAGE_DURATION.observe(elapsed, provider="musicbrainz", media_type="music", stage=stage)

        try:
            result = await staged(
                "primary",
                _sync_musicbrainz_album(str(external_id), force=force, enqueue_enrichment=False),
            )
            if result is not None:
                item_id = result.get("otix_id")
                title = result.get("title")
            if item_id is None:
                return None

            await staged("fanart", _sync_fanart_enrich("music", item_id))
            await staged("deezer", _sync_deezer_enrich_cover(item_id))
            await staged("theaudiodb", _sync_theaudiodb_enrich_album(item_id))
            await staged("embedding", _generate_embedding(item_id))

            t0 = time.monotonic()
            async with async_session() as session:
                score = await set_completeness(session, item_id)
                await session.commit()
            stages["completeness"] = time.monotonic() - t0

            logger.info(
                "album fully processed",
                title=title, media_type="music", provider="musicbrainz",
                otix_id=item_id, completeness=score, stages=stages,
            )
            return {"otix_id": item_id, "title": title, "stages": stages, "status": "success"}
        except Exception as exc:  # noqa: BLE001
            status = "error"
            error = str(exc)
            logger.exception(
                "album full hydration failed", media_type="music", provider="musicbrainz", external_id=external_id
            )
            raise
        finally:
            total = time.monotonic() - start
            HYDRATION_ITEM_DURATION.observe(total, provider="musicbrainz", media_type="music")
            await record_hydration_run(
                item_id=item_id, title=title, media_type="music", provider="musicbrainz",
                stages=stages, total_seconds=total, status=status, error=error,
            )

    async def discover_seed(self, media_type: str, limit: int) -> list[int]:
        return []

    async def related_candidates(self, media_item_id: str) -> list[RelatedCandidate]:
        return []
