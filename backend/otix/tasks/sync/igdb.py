# TODO: Review this file
"""IGDB provider tasks: game sync, discover lists, changes."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

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
from otix.providers.igdb.transformer import (
    _extract_steam_app_id,
    _extract_store_ids,
    extract_external_games,
    to_game,
)
from otix.services.external_id_service import ExternalIDService

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
    "external_games.external_game_source,external_games.uid,"
    "videos.video_id,videos.name,"
    "involved_companies.company.name,involved_companies.company.slug,"
    "involved_companies.company.logo.image_id,"
    "involved_companies.developer,involved_companies.publisher,"
    "involved_companies.porting,involved_companies.supporting,"
    "age_ratings,"
    "franchise.name,franchise.id"
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


async def _update_media_item_from(session, existing: MediaItem, incoming: MediaItem) -> None:
    from otix.services.admin_edit_service import AdminEditService

    existing.title = incoming.title
    existing.overview = incoming.overview
    existing.slug = incoming.slug

    protected = await AdminEditService.get_protected_image_types(session, existing.id)
    for img_type, field in [("poster", "poster_url"), ("backdrop", "backdrop_url")]:
        proposed = getattr(incoming, field, None)
        current = getattr(existing, field, None)
        if proposed and current and img_type in protected and current != proposed:
            svc = AdminEditService(session)
            await svc.create_system_proposal_for_image(existing.id, img_type, proposed)
        elif proposed:
            setattr(existing, field, proposed)

    existing.release_date = incoming.release_date or existing.release_date
    existing.popularity = incoming.popularity
    existing.original_language = incoming.original_language


async def _update_game_from(session, existing: Game, incoming: Game, store_ids: dict | None = None) -> None:
    existing.release_status = incoming.release_status
    existing.website = incoming.website or existing.website
    if store_ids:
        eid_svc = ExternalIDService(session)
        for platform, pid in store_ids.items():
            await eid_svc.upsert(platform, str(pid), "media_item", existing.media_item_id)
    if incoming.is_free is not None:
        existing.is_free = incoming.is_free
    if incoming.has_multiplayer:
        existing.has_multiplayer = True


def _compute_game_next_sync_at(raw: dict[str, JSONValue], hash_match_count: int = 0) -> datetime:
    now = datetime.now(UTC)
    ts = raw.get("first_release_date")
    if ts and isinstance(ts, (int, float)):
        try:
            release_date = datetime.fromtimestamp(float(ts), tz=UTC).date()
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


async def _sync_igdb_game(igdb_id: int, force: bool = False, *, enqueue_enrichment: bool = True) -> dict | None:
    async with async_session() as session:
        igdb_id_str = str(igdb_id)

        ext_id = await session.scalar(
            select(ExternalID).where(ExternalID.provider == "igdb", ExternalID.external_id == igdb_id_str)
        )

        if ext_id is not None and not force:
            media_item = await session.get(MediaItem, ext_id.entity_id or ext_id.media_item_id)
            if media_item is not None and media_item.next_sync_at is not None:
                if media_item.next_sync_at > datetime.now(UTC):
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
            media_item = await session.get(MediaItem, ext_id.entity_id or ext_id.media_item_id)
            if media_item is not None:
                media_item.next_sync_at = _compute_game_next_sync_at(raw, ext_id.hash_match_count)
            await session.commit()
            logger.debug("hash matched, skipping game processing", igdb_id=igdb_id, match_count=ext_id.hash_match_count)
            return None

        game = to_game(raw)
        item = game.media_item

        # Extract store-platform IDs from raw IGDB data (no longer on Game model).
        # external_games carries structured store IDs (xbox, playstation, ...);
        # website-derived IDs are higher quality, so they win on conflict.
        websites_raw = raw.get("websites", []) or []
        steam_app_id_from_raw = _extract_steam_app_id(websites_raw)
        store_ids_from_raw = {**(extract_external_games(raw) or {}), **(_extract_store_ids(websites_raw) or {})}

        merged_into_existing = False
        eid_svc = ExternalIDService(session)
        if steam_app_id_from_raw:
            str_steam = str(steam_app_id_from_raw)
            steam_ext = await eid_svc.get_by_provider_ext_id("steam", str_steam)
            # Skip conflict check if steam_app_id is already assigned to this game
            already_assigned = (
                ext_id is not None
                and steam_ext is not None
                and steam_ext.entity_id == (ext_id.entity_id or ext_id.media_item_id)
            )
            if not already_assigned:
                if steam_ext is not None:
                    conflict = await session.get(Game, steam_ext.entity_id)
                else:
                    conflict = None
                # Avoid matching ourselves when the persisted item already has this steam ID
                if conflict is not None and item.id is not None and conflict.media_item_id == item.id:
                    conflict = None
                if conflict is not None:
                    logger.info(
                        "merging igdb entry into existing steam game",
                        igdb_id=igdb_id,
                        steam_app_id=steam_app_id_from_raw,
                        existing_game_id=conflict.media_item_id,
                        incoming_title=item.title,
                    )
                    existing_item = await session.get(MediaItem, conflict.media_item_id)
                    existing_game = conflict
                    await _update_media_item_from(session, existing_item, item)
                    await _update_game_from(session, existing_game, game, store_ids_from_raw)
                    item = existing_item
                    game = existing_game
                    if ext_id is None:
                        ext_id = await eid_svc.upsert("igdb", igdb_id_str, "media_item", conflict.media_item_id)
                    elif ext_id.entity_id != conflict.media_item_id:
                        ext_id.entity_id = conflict.media_item_id
                    merged_into_existing = True

        if not merged_into_existing:
            if ext_id is not None:
                existing = await session.get(MediaItem, ext_id.entity_id or ext_id.media_item_id)
                if existing is not None:
                    from otix.services.embedding_service import is_embedding_stale

                    old_overview = existing.overview

                    # Asset URLs are resolved at query time (asset_selection);
                    # admin overrides are checked there. Merge the fresh metadata
                    # without touching any URL columns.
                    item.id = existing.id
                    game.media_item_id = existing.id
                    await session.merge(item)

                    if is_embedding_stale(old_overview, item.overview):
                        item.embedding = None
                else:
                    session.add(item)
                    await session.flush()
                    ext_id.entity_id = item.id
            else:
                session.add(item)
                await session.flush()
                ext_id = await eid_svc.upsert("igdb", igdb_id_str, "media_item", item.id)

            game.media_item_id = item.id
            for platform, pid in store_ids_from_raw.items():
                await eid_svc.upsert(platform, str(pid), "media_item", item.id)
            existing_game = await session.get(Game, item.id)
            if existing_game is not None:
                game = await session.merge(game)
            else:
                session.add(game)

        hydrator = IGDBHydrator(provider, session)
        await hydrator.hydrate_all(game, item, raw)

        ext_id.content_hash = content_hash
        ext_id.hash_match_count = 0
        item.synced_at = datetime.now(UTC)
        item.next_sync_at = _compute_game_next_sync_at(raw, 0)
        await session.commit()

        steam_enqueued = False
        steamgrid_enqueued = False

        store_providers = {
            "steam",
            "egs",
            "gog",
            "origin",
            "uplay",
            "bnet",
            "eshop",
            "xbox",
            "playstation",
            "nintendo",
            "itchio",
            "stadia",
        }
        item_store_eids = await session.scalars(
            select(ExternalID).where(
                ExternalID.entity_id == item.id,
                ExternalID.entity_type == "media_item",
                ExternalID.provider.in_(list(store_providers)),
            )
        )
        for store_eid in item_store_eids:
            if store_eid.provider == "steam":
                app.send_task("sync.steam.update_app", args=[int(store_eid.external_id)])
                app.send_task("sync.steamgrid.game", args=[int(store_eid.external_id)])
                steam_enqueued = True
                steamgrid_enqueued = True
            else:
                app.send_task("sync.steamgrid.game_by_platform", args=[store_eid.provider, store_eid.external_id])
                steamgrid_enqueued = True

        # Name-based SGDB lookup for game without any store-platform IDs
        if not steamgrid_enqueued:
            app.send_task("sync.steamgrid.game_by_name", args=[item.id])

        if not enqueue_enrichment:
            return {"otix_id": item.id, "title": item.title, "igdb_id": igdb_id}

        logger.info(
            "igdb game synced",
            title=item.title,
            media_type="game",
            otix_id=item.id,
            igdb_id=igdb_id,
            checklist={
                "genres": "done",
                "images": "done",
                "videos": "done",
                "ratings": "done",
                "companies": "done",
                "platforms": "done",
                "game_modes": "done",
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

    start_ts = int((datetime.now(UTC) - timedelta(hours=lookback_hours)).timestamp())

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

    logger.info(
        "igdb change sync completed", lookback_hours=lookback_hours, changed_ids=len(all_ids), tasks_enqueued=enqueued
    )
    return {"changed_ids": len(all_ids), "tasks_enqueued": enqueued}


# ── Age ratings hydration ──────────────────────────────────────────────


@app.task(
    name="sync.igdb.hydrate_age_ratings",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_igdb_hydrate_age_ratings_task(self, media_item_id: str) -> dict | None:
    """Hydrate age ratings (ESRB, PEGI) for a single game."""
    return run_async(_hydrate_game_age_ratings(media_item_id))


async def _hydrate_game_age_ratings(media_item_id: str) -> dict | None:
    async with async_session() as session:
        ext_id = await session.scalar(
            select(ExternalID).where(
                ExternalID.entity_id == media_item_id,
                ExternalID.entity_type == "media_item",
                ExternalID.provider == "igdb",
            )
        )
        if ext_id is None:
            return None

        item = await session.get(MediaItem, media_item_id)
        if item is None or item.media_type != "game":
            return None

        redis = await get_redis()
        provider = IGDBProvider(redis)
        hydrator = IGDBHydrator(provider, session)

        try:
            raw = await provider.get_game(int(ext_id.external_id))
        except Exception:
            logger.exception("failed to fetch igdb game for age ratings", media_item_id=media_item_id)
            raise

        if raw is None:
            return None

        await hydrator.hydrate_age_ratings(item, raw)
        await session.commit()

        from otix.infrastructure.redis import get_redis as _get_redis

        _redis = await _get_redis()
        cache_pattern = f"media:detail:{media_item_id}:*"
        keys = [key async for key in _redis.scan_iter(match=cache_pattern, count=100)]
        if keys:
            await _redis.delete(*keys)

        logger.info("game age ratings hydrated", media_item_id=media_item_id, title=item.title)
        return {"media_item_id": media_item_id, "title": item.title}
