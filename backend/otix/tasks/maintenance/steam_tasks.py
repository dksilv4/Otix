# TODO: Review this file
"""Steam name matching and CCU batch update tasks."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import and_, not_, select
from sqlalchemy import exists as sa_exists
from sqlalchemy.orm import joinedload

from otix.domain.media import ExternalID, Game, MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.providers.steam.client import SteamProvider

logger = structlog.get_logger()


@app.task(name="maintenance.steam_name_match")
def steam_name_match() -> dict:
    """Find games without a steam_app_id by searching the Steam store by name.

    Runs every 30 min. Limited to 25 games per cycle to stay under rate limits.
    """
    return run_async(_steam_name_match())


async def _steam_name_match() -> dict:
    import asyncio

    async with async_session() as session:
        cutoff = datetime.now(UTC) - timedelta(hours=72)

        has_steam = sa_exists().where(
            ExternalID.provider == "steam",
            ExternalID.entity_type == "media_item",
            ExternalID.entity_id == Game.media_item_id,
        )
        result = await session.execute(
            select(Game.media_item_id, MediaItem.title)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .where(
                MediaItem.media_type == "game",
                MediaItem.synced_at >= cutoff,
                not_(has_steam),
            )
            .limit(25)
        )
        rows = result.all()

    if not rows:
        return {"searched": 0, "matched": 0}

    redis = await get_redis()
    provider = SteamProvider(redis)
    sem = asyncio.Semaphore(5)

    async def _search_one(media_item_id: str, title: str) -> tuple[str, str, list | None]:
        async with sem:
            try:
                items = await provider.search_apps(title)
                return media_item_id, title, items
            except Exception:
                return media_item_id, title, None

    search_results = await asyncio.gather(*[_search_one(mid, title) for mid, title in rows])

    matched = 0
    async with async_session() as session:
        for media_item_id, title, items in search_results:
            if not items:
                continue

            title_lower = title.strip().lower()
            best = None
            for item in items:
                name = item.get("name")
                if isinstance(name, str) and name.strip().lower() == title_lower:
                    best = item
                    break

            if best is None:
                continue

            app_id = best.get("id")
            if not isinstance(app_id, int):
                continue

            game = await session.scalar(
                select(Game).where(Game.media_item_id == media_item_id).options(joinedload(Game._external_ids))
            )
            if game is not None and game.steam_app_id is None:
                conflict = await session.scalar(
                    select(Game)
                    .join(
                        ExternalID,
                        and_(
                            ExternalID.entity_id == Game.media_item_id,
                            ExternalID.entity_type == "media_item",
                            ExternalID.provider == "steam",
                        ),
                    )
                    .where(
                        ExternalID.external_id == str(app_id),
                        Game.media_item_id != media_item_id,
                    )
                )
                if conflict is not None:
                    logger.debug(
                        "steam app_id already claimed, skipping name match",
                        title=title,
                        app_id=app_id,
                        existing_game_id=conflict.media_item_id,
                    )
                    continue
                game.steam_app_id = app_id
                matched += 1

        if matched:
            await session.commit()

    if matched:
        logger.info("steam name match updated", count=matched)

    return {"searched": len(rows), "matched": matched}


@app.task(name="maintenance.steam_ccu_batch", queue="maintain")
def steam_ccu_batch() -> dict:
    """Batch update current player counts for games with a Steam app ID.

    Runs every 5 min. Limit of 250 games/cycle (~72k calls/day) keeps
    well within Steam's 100k daily budget, leaving headroom for enrichment.
    Popular games (by current player count) get priority.
    """
    return run_async(_steam_ccu_batch())


async def _steam_ccu_batch() -> dict:
    import asyncio

    async with async_session() as session:
        from sqlalchemy import select

        result = await session.execute(
            select(ExternalID.external_id)
            .select_from(Game)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .join(
                ExternalID,
                and_(
                    ExternalID.entity_id == Game.media_item_id,
                    ExternalID.entity_type == "media_item",
                    ExternalID.provider == "steam",
                ),
            )
            .where(
                MediaItem.media_type == "game",
            )
            .order_by(Game.current_players.desc().nulls_first())
            .limit(250)
        )
        app_ids = [int(row[0]) for row in result.all()]

    if not app_ids:
        return {"apps_checked": 0, "updated": 0}

    redis = await get_redis()
    provider = SteamProvider(redis)

    sem = asyncio.Semaphore(10)

    async def _fetch_one(app_id: int) -> tuple[int, dict | None]:
        async with sem:
            try:
                data = await provider.get_current_players(app_id)
                return app_id, data
            except Exception:
                return app_id, None

    results = await asyncio.gather(*[_fetch_one(aid) for aid in app_ids])

    async with async_session() as session:
        from sqlalchemy import select

        subq = (
            select(ExternalID.entity_id).where(
                ExternalID.provider == "steam",
                ExternalID.entity_type == "media_item",
                ExternalID.external_id.in_([str(x) for x in app_ids]),
            )
        ).subquery()
        games = await session.scalars(
            select(Game).options(joinedload(Game._external_ids)).where(Game.media_item_id.in_(select(subq)))
        )
        games_by_app = {}
        for g in games:
            if g.steam_app_id is not None:
                games_by_app[g.steam_app_id] = g

        updated = 0
        cleared = 0
        for app_id, data in results:
            if data is None:
                game = games_by_app.get(app_id)
                if game is not None:
                    game.steam_app_id = None
                    cleared += 1
                continue

            count = data.get("response", {}).get("player_count")
            if isinstance(count, (int, float)):
                game = games_by_app.get(app_id)
                if game is not None:
                    game.current_players = int(count)
                    updated += 1

        await session.commit()

    if updated or cleared:
        logger.info("steam ccu batch updated", count=updated, cleared=cleared)

    return {"apps_checked": len(app_ids), "updated": updated}
