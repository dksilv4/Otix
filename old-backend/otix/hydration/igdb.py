"""IGDB-backed full-hydration adapter for games."""

from __future__ import annotations

import time
from collections.abc import Awaitable

import structlog
from sqlalchemy import select

from otix.hydration.analytics import record_hydration_run
from otix.hydration.protocol import FullHydration, RelatedCandidate
from otix.infrastructure.database import async_session
from otix.lib.metrics import HYDRATION_ITEM_DURATION, HYDRATION_STAGE_DURATION
from otix.services.completeness import set_completeness

logger = structlog.get_logger()


class IgdbHydration(FullHydration):
    provider_name = "igdb"

    async def hydrate_complete(
        self, media_type: str, external_id: int | str, *, force: bool = False
    ) -> dict | None:
        from otix.tasks.sync.embedding import _generate_embedding
        from otix.tasks.sync.igdb import _hydrate_game_age_ratings, _sync_igdb_game
        from otix.tasks.sync.steam import _sync_steam_update_app, _sync_steamgrid_game_by_platform

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
                HYDRATION_STAGE_DURATION.observe(elapsed, provider="igdb", media_type="game", stage=stage)

        try:
            result = await staged(
                "primary",
                _sync_igdb_game(int(external_id), force=force, enqueue_enrichment=False),
            )
            if result is not None:
                item_id = result.get("otix_id")
                title = result.get("title")
            if item_id is None:
                item_id = await _resolve_game_item_id(external_id)
            if item_id is None:
                return None

            await staged("age_ratings", _hydrate_game_age_ratings(item_id))

            # Steam store update (for linked Steam App IDs)
            from otix.domain.media import ExternalID, Game, MediaItem
            from sqlalchemy.orm import joinedload

            async with async_session() as session:
                steam_eids = list(
                    (await session.scalars(
                        select(ExternalID).where(
                            ExternalID.entity_type == "media_item",
                            ExternalID.entity_id == item_id,
                            ExternalID.provider == "steam",
                        )
                    )).all()
                )
                steam_ids = sorted({int(e.external_id) for e in steam_eids})
            for sid in steam_ids:
                await staged("steam_update", _sync_steam_update_app(sid))

            # SteamGridDB artwork hydration (all platforms + name search fallback)
            async with async_session() as session:
                game_obj = await session.scalar(
                    select(Game).options(joinedload(Game.media_item)).where(Game.media_item_id == item_id)
                )
                if game_obj and game_obj.media_item:
                    from otix.infrastructure.redis import get_redis
                    from otix.providers.steamgrid.client import SteamGridDBProvider
                    from otix.providers.steamgrid.hydrator import SteamGridDBHydrator

                    redis = await get_redis()
                    provider = SteamGridDBProvider(redis)
                    hydrator = SteamGridDBHydrator(provider, session)
                    added = await hydrator.hydrate(game_obj, title=game_obj.media_item.title)
                    await session.commit()
                    stages["steamgrid_assets_added"] = added

            await staged("embedding", _generate_embedding(item_id))

            t0 = time.monotonic()
            async with async_session() as session:
                score = await set_completeness(session, item_id)
                await session.commit()
            stages["completeness"] = time.monotonic() - t0

            logger.info(
                "game fully processed",
                title=title, media_type="game", provider="igdb",
                otix_id=item_id, completeness=score, stages=stages,
            )
            return {"otix_id": item_id, "title": title, "stages": stages, "status": "success"}
        except Exception as exc:  # noqa: BLE001
            status = "error"
            error = str(exc)
            logger.exception(
                "game full hydration failed", media_type="game", provider="igdb", external_id=external_id
            )
            raise
        finally:
            total = time.monotonic() - start
            HYDRATION_ITEM_DURATION.observe(total, provider="igdb", media_type="game")
            await record_hydration_run(
                item_id=item_id, title=title, media_type="game", provider="igdb",
                stages=stages, total_seconds=total, status=status, error=error,
            )

    async def discover_seed(self, media_type: str, limit: int) -> list[int]:
        # Games are seeded via a dedicated IGDB cycle; TMDB popular is the
        # initial top-N source.
        return []

    async def related_candidates(self, media_item_id: str) -> list[RelatedCandidate]:
        return []


async def _resolve_game_item_id(igdb_id: int | str) -> str | None:
    from otix.domain.media import ExternalID

    async with async_session() as session:
        ext = await session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id == str(igdb_id),
                ExternalID.entity_type == "media_item",
            )
        )
        return ext.entity_id if ext is not None else None
