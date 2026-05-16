"""Steam and SteamGridDB enrichment tasks."""

from __future__ import annotations

import structlog
from sqlalchemy import select

from otix.domain.media import Game, MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.providers.steam.client import SteamProvider
from otix.providers.steam.hydrator import SteamHydrator
from otix.providers.steamgrid.client import SteamGridDBProvider
from otix.providers.steamgrid.hydrator import SteamGridDBHydrator

logger = structlog.get_logger()


# ── Steam update ──────────────────────────────────────────────────────


@app.task(
    name="sync.steam.update_app",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_steam_update_app_task(self, steam_app_id: int) -> dict | None:
    """Fetch Steam player counts and store data for an app."""
    return run_async(_sync_steam_update_app(steam_app_id))


async def _sync_steam_update_app(steam_app_id: int) -> dict | None:
    async with async_session() as session:
        from sqlalchemy.orm import joinedload

        game = await session.scalar(
            select(Game).options(joinedload(Game.media_item)).where(Game.steam_app_id == steam_app_id)
        )
        if game is None:
            logger.debug("no game found for steam app", steam_app_id=steam_app_id)
            return None

        redis = await get_redis()
        provider = SteamProvider(redis)
        hydrator = SteamHydrator(provider, session)

        await hydrator.hydrate(game)
        await session.commit()

        logger.info("steam app updated",
            title=game.media_item.title if game.media_item else None,
            media_type="game", steam_app_id=steam_app_id, otix_id=game.media_item_id,
            current_players=game.current_players,
        )
        await _progress_incr("steam_enqueued")
        return {"otix_id": game.media_item_id, "steam_app_id": steam_app_id, "current_players": game.current_players}


# ── SteamGridDB ───────────────────────────────────────────────────────


@app.task(
    name="sync.steamgrid.game",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
)
def sync_steamgrid_game_task(self, steam_app_id: int) -> dict | None:
    """Fetch SteamGridDB artwork for a Steam game."""
    return run_async(_sync_steamgrid_game_by_platform("steam", steam_app_id))


@app.task(
    name="sync.steamgrid.game_by_platform",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
)
def sync_steamgrid_game_by_platform_task(self, platform: str, platform_id: str | int) -> dict | None:
    """Fetch SteamGridDB artwork for a game on any supported platform."""
    return run_async(_sync_steamgrid_game_by_platform(platform, platform_id))


async def _sync_steamgrid_game_by_platform(platform: str, platform_id: str | int) -> dict | None:
    async with async_session() as session:
        from sqlalchemy.orm import joinedload

        if platform == "steam":
            game = await session.scalar(
                select(Game).options(joinedload(Game.media_item)).where(Game.steam_app_id == platform_id)
            )
        else:
            game = await session.scalar(
                select(Game).options(joinedload(Game.media_item)).where(
                    Game.store_ids[platform].as_string() == str(platform_id)
                )
            )

        if game is None:
            logger.debug("no game found for steamgrid enrichment", platform=platform, platform_id=platform_id)
            return None

        redis = await get_redis()
        provider = SteamGridDBProvider(redis)
        hydrator = SteamGridDBHydrator(provider, session)

        added = await hydrator.hydrate(game, platform=platform, platform_id=platform_id)
        await session.commit()

        logger.info("steamgrid game enriched",
            title=game.media_item.title if game.media_item else None,
            media_type="game", platform=platform, platform_id=platform_id,
            otix_id=game.media_item_id, assets_added=added,
        )
        await _progress_incr("steamgrid_enqueued")
        return {"otix_id": game.media_item_id, "platform": platform, "platform_id": platform_id, "assets_added": added}
