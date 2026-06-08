# TODO: Review this file
"""Search backfill tasks — enriches sparse local results from external providers."""

from __future__ import annotations

import asyncio
import hashlib

import redis.asyncio as aioredis
import structlog

from otix.infrastructure.celery import app
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.providers.igdb.client import IGDBProvider
from otix.providers.musicbrainz.client import MusicBrainzProvider
from otix.providers.tmdb.client import TMDBProvider

from ._common import filter_missing_ids

logger = structlog.get_logger()

BACKFILL_RESULT_THRESHOLD = 20
BACKFILL_REDIS_TTL = 300


def _backfill_query_hash(query: str, media_type: str | None) -> str:
    raw = f"{query.lower().strip()}:{media_type or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


async def _mark_backfill_provider_done(redis: aioredis.Redis, query_hash: str, provider: str, synced: int) -> None:
    key = f"backfill:{query_hash}:{provider}"
    await redis.set(key, str(synced), ex=BACKFILL_REDIS_TTL)


@app.task(
    name="search.backfill",
    bind=True,
    max_retries=1,
    default_retry_delay=60,
    queue="reactive-fast",
)
def search_backfill_task(self, query: str, media_type: str | None = None) -> dict:
    """Search external providers for missing media and enqueue sync tasks."""
    return run_async(_search_backfill(query, media_type))


async def _search_backfill(query: str, media_type: str | None = None) -> dict:
    redis = await get_redis()
    query_hash = _backfill_query_hash(query, media_type)
    results: dict[str, dict] = {}

    providers = []
    if media_type in (None, "movie"):
        providers.append(("tmdb_movie", _backfill_tmdb_movies(query, redis, query_hash)))
    if media_type in (None, "show"):
        providers.append(("tmdb_show", _backfill_tmdb_shows(query, redis, query_hash)))
    if media_type in (None, "game"):
        providers.append(("igdb_game", _backfill_igdb_games(query, redis, query_hash)))
    if media_type in (None, "music"):
        providers.append(("musicbrainz", _backfill_musicbrainz_albums(query, redis, query_hash)))

    gathered = await asyncio.gather(*[coro for _, coro in providers], return_exceptions=True)

    for (name, _), result in zip(providers, gathered, strict=False):
        if isinstance(result, Exception):
            logger.warning("search backfill provider failed", provider=name, error=str(result))
            results[name] = {"enqueued": 0, "skipped": 0, "error": str(result)}
        else:
            results[name] = result

    total_enqueued = sum(v.get("enqueued", 0) for v in results.values())
    logger.info(
        "search backfill complete", query=query, media_type=media_type, total_enqueued=total_enqueued, breakdown=results
    )
    return {"query": query, "media_type": media_type, "results": results}


async def _backfill_tmdb(query: str, redis: aioredis.Redis, query_hash: str, media_type: str) -> dict:
    provider = TMDBProvider(redis)
    ids: set[str] = set()
    # TMDB API returns "tv" but our task is "sync.tmdb.show"
    entity_kind = "movie" if media_type == "movie" else "tv"
    task_suffix = media_type if media_type == "movie" else "show"

    try:
        coros = [provider.search_multi(query, page=p) for p in range(1, 4)]
        page_data = await asyncio.gather(*coros)
        for data in page_data:
            for item in data.get("results", []):
                if item.get("media_type") == entity_kind and item.get("id"):
                    ids.add(str(item["id"]))
    except Exception:
        logger.warning("search backfill tmdb search failed", query=query, exc_info=True)
        raise

    if not ids:
        await _mark_backfill_provider_done(redis, query_hash, f"tmdb_{media_type}", 0)
        return {"enqueued": 0, "skipped": 0}

    try:
        missing = await filter_missing_ids("tmdb", ids)
    except Exception:
        logger.warning("search backfill db filter failed", provider=f"tmdb_{media_type}", exc_info=True)
        raise

    enqueued = 0
    for ext_id in missing:
        app.send_task(f"sync.tmdb.{task_suffix}", args=[int(ext_id)])
        enqueued += 1
    await _mark_backfill_provider_done(redis, query_hash, f"tmdb_{media_type}", enqueued)
    return {"enqueued": enqueued, "skipped": len(ids) - enqueued}


async def _backfill_igdb_games(query: str, redis: aioredis.Redis, query_hash: str) -> dict:
    provider = IGDBProvider(redis)

    try:
        raw_games = await provider.search_games(query, limit=60, fields="id")
    except Exception:
        logger.warning("search backfill igdb search failed", query=query, exc_info=True)
        raise

    ids = {str(g["id"]) for g in raw_games if g.get("id")}
    if not ids:
        await _mark_backfill_provider_done(redis, query_hash, "igdb_game", 0)
        return {"enqueued": 0, "skipped": 0}

    try:
        missing = await filter_missing_ids("igdb", ids)
    except Exception:
        logger.warning("search backfill db filter failed", provider="igdb_game", exc_info=True)
        raise

    enqueued = 0
    for ext_id in missing:
        app.send_task("sync.igdb.game", args=[int(ext_id)])
        enqueued += 1
    await _mark_backfill_provider_done(redis, query_hash, "igdb_game", enqueued)
    return {"enqueued": enqueued, "skipped": len(ids) - enqueued}


async def _backfill_musicbrainz_albums(query: str, redis: aioredis.Redis, query_hash: str) -> dict:
    provider = MusicBrainzProvider(redis)

    try:
        results = await provider.search_release(query, limit=20)
    except Exception:
        logger.warning("search backfill musicbrainz search failed", query=query, exc_info=True)
        raise

    ids = {str(r["id"]) for r in results if r.get("id")}
    if not ids:
        await _mark_backfill_provider_done(redis, query_hash, "musicbrainz", 0)
        return {"enqueued": 0, "skipped": 0}

    missing = await filter_missing_ids("musicbrainz", ids)
    enqueued = 0
    for mbid in missing:
        app.send_task("sync.musicbrainz.album", args=[mbid])
        enqueued += 1
    await _mark_backfill_provider_done(redis, query_hash, "musicbrainz", enqueued)
    return {"enqueued": enqueued, "skipped": len(ids) - enqueued}


# Backward-compatible wrappers — tests still reference these names.
async def _backfill_tmdb_movies(query: str, redis: aioredis.Redis, query_hash: str) -> dict:
    return await _backfill_tmdb(query, redis, query_hash, "movie")


async def _backfill_tmdb_shows(query: str, redis: aioredis.Redis, query_hash: str) -> dict:
    return await _backfill_tmdb(query, redis, query_hash, "show")


# ── Seed game titles from desktop scan ───────────────────────────────────


@app.task(
    name="seed.igdb_from_titles",
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    queue="reactive-fast",
    acks_late=True,
)
def seed_igdb_from_titles_task(self, games: list[dict]) -> dict:
    """Seed the catalog with game discovered by the desktop scanner.

    Each entry is a dict with ``title`` (required), ``platform`` (optional),
    and ``steam_app_id`` (optional).

    Games with a Steam App ID get a direct IGDB external_games lookup or
    a Steam store seed. Games without fall through to title-based IGDB search.
    """
    return run_async(_seed_igdb_from_titles(games))


async def _seed_igdb_from_titles(games: list[dict]) -> dict:
    redis = await get_redis()
    provider = IGDBProvider(redis)

    # Split into Steam and non-Steam entries
    steam_games: list[dict] = []
    title_games: list[str] = []
    seen_titles: set[str] = set()

    for g in games:
        title = g.get("title", "").strip()
        if not title or title.lower() in seen_titles:
            continue
        seen_titles.add(title.lower())
        if g.get("steam_app_id"):
            steam_games.append(g)
        else:
            title_games.append(title)

    if not steam_games and not title_games:
        return {
            "enqueued_steam": 0,
            "enqueued_igdb": 0,
            "total_entries": 0,
            "found": 0,
        }

    enqueued_steam = 0
    enqueued_igdb = 0
    all_igdb_ids: set[str] = set()

    # ── Phase 1: Steam App ID direct lookups ──────────────────────────
    if steam_games:
        from otix.infrastructure.database import async_session
        from otix.services.external_id_service import ExternalIDService

        # Dedup Steam App IDs
        steam_app_id_map: dict[int, str] = {}  # app_id (int) -> title
        for g in steam_games:
            aid = g["steam_app_id"]
            if aid is not None and aid not in steam_app_id_map:
                steam_app_id_map[aid] = g["title"]

        # Check which are already in the catalog
        async with async_session() as session:
            eid_svc = ExternalIDService(session)
            existing = await eid_svc.batch_find_entity_ids("steam", [str(a) for a in steam_app_id_map])

        remaining_app_ids = [a for a in steam_app_id_map if str(a) not in existing]

        if remaining_app_ids:
            # Try IGDB external_games mapping for remaining
            igdb_map = await provider.lookup_steam_app_ids(remaining_app_ids)

            for app_id in remaining_app_ids:
                igdb_id = igdb_map.get(app_id)
                if igdb_id is not None:
                    all_igdb_ids.add(str(igdb_id))
                else:
                    # No IGDB mapping — seed directly from Steam store
                    app.send_task("sync.steam.seed_app", args=[app_id], priority=9)
                    enqueued_steam += 1

    # ── Phase 2: Title-based IGDB search for non-Steam game ─────────
    if title_games:
        semaphore = asyncio.Semaphore(5)

        async def _search(title: str) -> set[str]:
            async with semaphore:
                try:
                    results = await provider.search_games(title, limit=3, fields="id")
                    return {str(r["id"]) for r in results if r.get("id")}
                except Exception:
                    return set()

        id_sets = await asyncio.gather(*[_search(t) for t in title_games])
        for ids in id_sets:
            all_igdb_ids |= ids

    # ── Phase 3: Enqueue IGDB sync for all discovered IGDB IDs ──────
    if all_igdb_ids:
        missing = await filter_missing_ids("igdb", all_igdb_ids)
        for ext_id in missing:
            app.send_task("sync.igdb.game", args=[int(ext_id)], priority=9)
            enqueued_igdb += 1

    logger.info(
        "seed_igdb_from_titles_complete",
        total_entries=len(games),
        steam_games=len(steam_games),
        title_games=len(title_games),
        enqueued_steam=enqueued_steam,
        enqueued_igdb=enqueued_igdb,
    )
    return {
        "enqueued_steam": enqueued_steam,
        "enqueued_igdb": enqueued_igdb,
        "total_entries": len(games),
        "found": len(all_igdb_ids),
    }
