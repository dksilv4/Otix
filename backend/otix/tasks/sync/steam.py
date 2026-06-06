# TODO: Review this file
"""Steam and SteamGridDB enrichment tasks."""

from __future__ import annotations

from datetime import datetime, timezone

import structlog
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from otix.domain.base import gen_otix_id
from otix.domain.media import Game, MediaItem
from otix.services.external_id_service import ExternalIDService
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr
from otix.lib.slug import slugify
from otix.providers.steam.client import SteamProvider
from otix.providers.steam.hydrator import SteamHydrator
from otix.providers.steamgrid.client import SteamGridDBProvider
from otix.providers.steamgrid.hydrator import SteamGridDBHydrator

logger = structlog.get_logger()


# ── Steam seed (create game from Steam store) ─────────────────────────


@app.task(
    name="sync.steam.seed_app",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_steam_seed_app_task(self, steam_app_id: int) -> dict | None:
    """Seed a game from Steam store data. Creates MediaItem + Game + ExternalID(steam)."""
    return run_async(_sync_steam_seed_app(steam_app_id))


async def _sync_steam_seed_app(steam_app_id: int) -> dict | None:
    steam_id_str = str(steam_app_id)
    async with async_session() as session:
        ext_id = await session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "steam",
                ExternalID.external_id == steam_id_str,
            )
        )

        redis = await get_redis()
        provider = SteamProvider(redis)

        store = await provider.get_app_details(steam_app_id)
        if not store:
            logger.debug("steam app not found in store", steam_app_id=steam_app_id)
            return None

        name = str(store.get("name", "Unknown Game"))

        if ext_id is not None:
            game = await session.scalar(
                select(Game).options(joinedload(Game.media_item)).where(
                    Game.media_item_id == ext_id.entity_id
                )
            )
            if game is None:
                logger.warning("steam external_id exists but game missing", steam_app_id=steam_app_id)
                return None
        else:
            item = MediaItem(
                id=gen_otix_id(),
                media_type="game",
                title=name,
                overview=str(store.get("short_description", "") or ""),
                slug=slugify(name),
                poster_url=_extract_header_image(store),
                synced_at=datetime.now(timezone.utc),
            )
            session.add(item)
            await session.flush()

            game = Game(
                media_item_id=item.id,
                is_free=store.get("is_free", False),
            )
            session.add(game)

            ext_id = await ExternalIDService(session).upsert(
                "steam", steam_id_str, "media_item", item.id,
            )
            await session.flush()

        hydrator = SteamHydrator(provider, session)
        await hydrator.hydrate(game)
        await session.commit()

        logger.info("steam app seeded",
            title=game.media_item.title if game.media_item else None,
            steam_app_id=steam_app_id, otix_id=game.media_item_id,
        )
        await _progress_incr("steam_enqueued")
        return {"otix_id": game.media_item_id, "steam_app_id": steam_app_id, "title": name}


# ── Steam update (enrich existing game with Steam data) ───────────────


@app.task(
    name="sync.steam.update_app",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_steam_update_app_task(self, steam_app_id: int) -> dict | None:
    """Fetch Steam player counts and store data for an existing game."""
    return run_async(_sync_steam_update_app(steam_app_id))


async def _sync_steam_update_app(steam_app_id: int) -> dict | None:
    async with async_session() as session:
        # Resolve via ExternalID first — universal cross-provider connector
        ext_id = await session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "steam",
                ExternalID.external_id == str(steam_app_id),
            )
        )
        game = None
        if ext_id is not None:
            game = await session.scalar(
                select(Game).options(joinedload(Game.media_item)).where(
                    Game.media_item_id == ext_id.entity_id
                )
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


def _extract_header_image(store: dict) -> str | None:
    header = store.get("header_image")
    if isinstance(header, str) and header:
        return header
    return None


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

        # Resolve via ExternalID
        ext_id = await session.scalar(
            select(ExternalID).where(
                ExternalID.provider == platform,
                ExternalID.external_id == str(platform_id),
            )
        )
        if ext_id is not None and ext_id.entity_id:
            game = await session.scalar(
                select(Game).options(joinedload(Game.media_item)).where(
                    Game.media_item_id == ext_id.entity_id
                )
            )
        else:
            game = None

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


@app.task(
    name="sync.steamgrid.game_by_name",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def sync_steamgrid_game_by_name_task(self, media_item_id: str) -> dict | None:
    """Fetch SteamGridDB artwork for any game, using name search as fallback."""
    return run_async(_sync_steamgrid_game_by_name(media_item_id))


async def _sync_steamgrid_game_by_name(media_item_id: str) -> dict | None:
    async with async_session() as session:
        from sqlalchemy.orm import joinedload

        game = await session.scalar(
            select(Game).options(joinedload(Game.media_item)).where(
                Game.media_item_id == media_item_id
            )
        )
        if game is None:
            logger.debug("no game found for steamgrid name enrichment", media_item_id=media_item_id)
            return None

        title = game.media_item.title if game.media_item else None
        if not title:
            return None

        redis = await get_redis()
        provider = SteamGridDBProvider(redis)
        hydrator = SteamGridDBHydrator(provider, session)

        added = await hydrator.hydrate(game, title=title)
        await session.commit()

        logger.info("steamgrid game enriched by name",
            title=title, media_type="game", otix_id=media_item_id, assets_added=added,
        )
        await _progress_incr("steamgrid_enqueued")
        return {"otix_id": media_item_id, "assets_added": added}
