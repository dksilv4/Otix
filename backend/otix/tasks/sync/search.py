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
