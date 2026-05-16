"""IGDB provider tasks: game sync, discover lists, changes."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select

from otix.domain.media import ExternalID, Game, MediaItem
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.metrics import SYNC_ENTITIES_TOTAL
from otix.lib.progress import incr as _progress_incr
from otix.lib.types import JSONValue
from otix.providers.igdb.client import IGDBProvider
from otix.providers.igdb.hydrator import IGDBHydrator
from otix.providers.igdb.transformer import to_game

from ._common import compute_content_hash, enqueue_list_items

logger = structlog.get_logger()


GAME_FIELDS = (
    "id,name,summary,storyline,first_release_date,"
    "rating,aggregated_rating,rating_count,aggregated_rating_count,"
    "hypes,url,slug,status,"
    "cover.image_id,"
    "screenshots.image_id,"
    "artworks.image_id,"
    "genres.name,themes.name,"
    "platforms.name,platforms.platform_logo.image_id,"
    "game_modes.name,"
    "websites.url,websites.type,"
    "videos.video_id,videos.name,"
    "involved_companies.company.name,involved_companies.company.slug,"
    "involved_companies.developer,involved_companies.publisher,"
    "involved_companies.porting,involved_companies.supporting"
)


# ── Task definitions ───────────────────────────────────────────────────


@app.task(
    name="sync.igdb.game",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def sync_igdb_game_task(self, igdb_id: int, force: bool = False) -> dict | None:
    """Sync a single IGDB game: fetch → transform → upsert → hydrate."""
    return run_async(_sync_igdb_game(igdb_id, force))


@app.task(
    name="sync.igdb.discover_list",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def sync_igdb_discover_list_task(self, list_type: str, limit: int = 50) -> dict:
    """Sync an IGDB discover list. Enqueues individual game tasks."""
    return run_async(_sync_igdb_discover_list(list_type, limit))


@app.task(
    name="sync.igdb.game_changes",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
)
def sync_igdb_game_changes_task(self, lookback_hours: int = 24) -> dict:
    """Fetch changed game IDs from IGDB and enqueue individual syncs."""
    return run_async(_sync_igdb_game_changes(lookback_hours))


# ── Helpers ────────────────────────────────────────────────────────────


def _update_media_item_from(existing: MediaItem, incoming: MediaItem) -> None:
    existing.title = incoming.title
    existing.overview = incoming.overview
    existing.slug = incoming.slug
    existing.poster_url = incoming.poster_url or existing.poster_url
    existing.backdrop_url = incoming.backdrop_url or existing.backdrop_url
    existing.release_date = incoming.release_date or existing.release_date
    existing.popularity = incoming.popularity
    existing.original_language = incoming.original_language


def _update_game_from(existing: Game, incoming: Game) -> None:
    existing.release_status = incoming.release_status
    existing.website = incoming.website or existing.website
    if incoming.store_ids:
        existing.store_ids = {**(existing.store_ids or {}), **incoming.store_ids}
    if incoming.is_free is not None:
        existing.is_free = incoming.is_free
    if incoming.has_multiplayer:
        existing.has_multiplayer = True


def _compute_game_next_sync_at(raw: dict[str, JSONValue], hash_match_count: int = 0) -> datetime:
    now = datetime.now(timezone.utc)
    ts = raw.get("first_release_date")
    if ts and isinstance(ts, (int, float)):
        try:
            release_date = datetime.fromtimestamp(float(ts), tz=timezone.utc).date()
            age_days = (now.date() - release_date).days
        except (ValueError, OSError):
            age_days = None
    else:
        age_days = None

    if age_days is None or age_days < 0:
        hours = 12
    elif age_days <= 90:
        hours = 24
    elif age_days <= 730:
        hours = 24 * 7
    else:
        hours = 24 * 30

    escalation = 2 ** min(hash_match_count, 5)
    max_hours = settings.tmdb_sync_max_escalation_days * 24
    hours = min(hours * escalation, max_hours)

    return now + timedelta(hours=hours)


# ── Game sync ──────────────────────────────────────────────────────────


async def _sync_igdb_game(igdb_id: int, force: bool = False) -> dict | None:
    async with async_session() as session:
        igdb_id_str = str(igdb_id)

        ext_id = await session.scalar(
            select(ExternalID).where(ExternalID.provider == "igdb", ExternalID.external_id == igdb_id_str)
        )

        if ext_id is not None and not force:
            media_item = await session.get(MediaItem, ext_id.media_item_id)
            if media_item is not None and media_item.next_sync_at is not None:
                if media_item.next_sync_at > datetime.now(timezone.utc):
                    logger.debug("skipping game not due for sync", igdb_id=igdb_id)
                    return None

        redis = await get_redis()
        provider = IGDBProvider(redis)

        raw = await provider.get_game(igdb_id, GAME_FIELDS)
        if raw is None:
            logger.warning("igdb game not found", igdb_id=igdb_id)
            return None

        content_hash = compute_content_hash(raw)

        if ext_id is not None and not force and ext_id.content_hash == content_hash:
            ext_id.hash_match_count += 1
            media_item = await session.get(MediaItem, ext_id.media_item_id)
            if media_item is not None:
                media_item.next_sync_at = _compute_game_next_sync_at(raw, ext_id.hash_match_count)
            await session.commit()
            logger.debug("hash matched, skipping game processing", igdb_id=igdb_id, match_count=ext_id.hash_match_count)
            return None

        game = to_game(raw)
        item = game.media_item

        merged_into_existing = False
        if game.steam_app_id and (
            ext_id is None or not await session.scalar(
                select(Game).where(Game.media_item_id == ext_id.media_item_id, Game.steam_app_id == game.steam_app_id)
            )
        ):
            if item.id is not None:
                conflict = await session.scalar(
                    select(Game).where(Game.steam_app_id == game.steam_app_id, Game.media_item_id != item.id)
                )
            else:
                conflict = await session.scalar(select(Game).where(Game.steam_app_id == game.steam_app_id))
            if conflict is not None:
                logger.info("merging igdb entry into existing steam game",
                    igdb_id=igdb_id, steam_app_id=game.steam_app_id,
                    existing_game_id=conflict.media_item_id, incoming_title=item.title,
                )
                existing_item = await session.get(MediaItem, conflict.media_item_id)
                existing_game = conflict
                _update_media_item_from(existing_item, item)
                _update_game_from(existing_game, game)
                item = existing_item
                game = existing_game
                if ext_id is None:
                    ext_id = ExternalID(provider="igdb", external_id=igdb_id_str, media_item_id=conflict.media_item_id)
                    session.add(ext_id)
                elif ext_id.media_item_id != conflict.media_item_id:
                    ext_id.media_item_id = conflict.media_item_id
                merged_into_existing = True

        if not merged_into_existing:
            if ext_id is not None:
                existing = await session.get(MediaItem, ext_id.media_item_id)
                if existing is not None:
                    item.id = existing.id
                    game.media_item_id = existing.id
                    await session.merge(item)
                else:
                    session.add(item)
                    await session.flush()
                    ext_id.media_item_id = item.id
            else:
                session.add(item)
                await session.flush()
                ext_id = ExternalID(provider="igdb", external_id=igdb_id_str, media_item_id=item.id)
                session.add(ext_id)

            game.media_item_id = item.id
            existing_game = await session.get(Game, item.id)
            if existing_game is not None:
                game = await session.merge(game)
            else:
                session.add(game)

        hydrator = IGDBHydrator(provider, session)
        await hydrator.hydrate_all(item, raw)

        ext_id.content_hash = content_hash
        ext_id.hash_match_count = 0
        item.synced_at = datetime.now(timezone.utc)
        item.next_sync_at = _compute_game_next_sync_at(raw, 0)
        await session.commit()

        steam_enqueued = False
        steamgrid_enqueued = False

        if game.steam_app_id:
            app.send_task("sync.steam.update_app", args=[game.steam_app_id])
            app.send_task("sync.steamgrid.game", args=[game.steam_app_id])
            steam_enqueued = True
            steamgrid_enqueued = True
        if game.store_ids:
            for platform, pid in game.store_ids.items():
                if platform != "steam":
                    app.send_task("sync.steamgrid.game_by_platform", args=[platform, pid])
                    steamgrid_enqueued = True

        logger.info("igdb game synced",
            title=item.title, media_type="game", otix_id=item.id, igdb_id=igdb_id,
            checklist={
                "genres": "done", "images": "done", "videos": "done",
                "ratings": "done", "companies": "done",
                "platforms": "done", "game_modes": "done",
                "steam": "enqueued" if steam_enqueued else None,
                "steamgrid": "enqueued" if steamgrid_enqueued else None,
                "embedding": "enqueued",
            },
        )
        SYNC_ENTITIES_TOTAL.inc(provider="igdb", entity_type="game", status="success")
        await _progress_incr("game_synced")
        if steam_enqueued:
            await _progress_incr("steam_enqueued")
        if steamgrid_enqueued:
            await _progress_incr("steamgrid_enqueued")

        app.send_task("embedding.generate", args=[item.id])
        await _progress_incr("embedding_enqueued")
        return {"otix_id": item.id, "title": item.title, "igdb_id": igdb_id}


# ── Discover list orchestrator ─────────────────────────────────────────


async def _sync_igdb_discover_list(list_type: str, limit: int) -> dict:
    redis = await get_redis()
    provider = IGDBProvider(redis)

    if list_type == "popular":
        results = await provider.get_popular_games(limit, "id")
    elif list_type == "recent":
        results = await provider.get_recently_released_games(limit, "id")
    else:
        results = await provider.get_upcoming_games(limit, "id")

    all_ids = {str(item["id"]) for item in results if item.get("id")}
    enqueued, skipped = await enqueue_list_items("igdb", "game", all_ids)

    logger.info("igdb discover sync enqueued", list_type=list_type, tasks_enqueued=enqueued, tasks_skipped=skipped)
    return {"list_type": list_type, "tasks_enqueued": enqueued, "tasks_skipped": skipped}


# ── Change-based sync ──────────────────────────────────────────────────


async def _sync_igdb_game_changes(lookback_hours: int) -> dict:
    redis = await get_redis()
    provider = IGDBProvider(redis)

    start_ts = int((datetime.now(timezone.utc) - timedelta(hours=lookback_hours)).timestamp())

    all_ids: set[str] = set()
    max_pages = 10

    for _ in range(max_pages):
        batch = await provider.get_changed_game_ids(start_ts, limit=100)
        if not batch:
            break

        for item in batch:
            game_id = item.get("id")
            if game_id:
                all_ids.add(str(game_id))

        if len(batch) < 100:
            break

        last_updated = batch[-1].get("updated_at", start_ts)
        if isinstance(last_updated, (int, float)) and int(last_updated) > start_ts:
            start_ts = int(last_updated)
        else:
            break

    enqueued = 0
    for igdb_id in all_ids:
        app.send_task("sync.igdb.game", args=[int(igdb_id)])
        enqueued += 1

    logger.info("igdb change sync completed", lookback_hours=lookback_hours, changed_ids=len(all_ids), tasks_enqueued=enqueued)
    return {"changed_ids": len(all_ids), "tasks_enqueued": enqueued}
