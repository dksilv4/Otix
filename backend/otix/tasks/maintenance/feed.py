# TODO: Review this file
"""Feed refresh and provider health check."""

from __future__ import annotations

import hashlib
from datetime import date, timedelta

import structlog

from otix.api.ttl import TTL
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.metrics import get_registry
from otix.schemas.media import MediaItemListResponse, MediaItemSummary

logger = structlog.get_logger()

_LISTS = {
    "popular": ("popularity", "desc", None),
    "trending": ("popularity", "desc", "trending_window"),
    "top_rated": ("rating", "desc", None),
    "upcoming": ("release_date", "asc", "future"),
    "now_playing": ("popularity", "desc", "recent"),
}
_MEDIA_TYPES = ["movie", "show", "game", "music"]


def _date_filter(name: str | None) -> tuple[date | None, date | None]:
    today = date.today()
    if name == "future":
        return (today, None)
    if name == "recent":
        return (today - timedelta(days=90), None)
    if name == "trending_window":
        return (today - timedelta(days=365), today + timedelta(days=180))
    return (None, None)


@app.task(name="maintenance.refresh_discover_feed")
def refresh_discover_feed() -> dict:
    """Enqueue discover list and change-based syncs to keep the catalog fresh.

    Runs hourly via Celery beat. Individual items skip via next_sync_at and
    content_hash guards.
    """
    # Change-based sync — catches items modified in the last 24h
    for entity_type in ("movie", "show", "person"):
        app.send_task("sync.tmdb.changes", args=[entity_type, 24])

    # Discover lists — broad coverage across multiple list types
    discover_lists = [
        ("popular", "movie", 3),
        ("popular", "show", 3),
        ("trending", "movie", 3),
        ("trending", "show", 3),
        ("top_rated", "movie", 2),
        ("top_rated", "show", 2),
        ("upcoming", "movie", 2),
        ("now_playing", "movie", 2),
        ("on_the_air", "show", 2),
        ("airing_today", "show", 2),
    ]
    for list_type, media_type, pages in discover_lists:
        app.send_task("sync.tmdb.discover_list", args=[list_type, media_type, pages])

    logger.info("discover feed refresh enqueued")
    return {"status": "ok", "message": "discover and change syncs enqueued"}


@app.task(name="maintenance.refresh_game_feed")
def refresh_game_feed() -> dict:
    """Enqueue game discover and change-based syncs.

    Runs every 2 hours via Celery beat. IGDB has a 4 rps rate limit so this
    is staggered from the hourly TMDB refresh.
    """
    # Change-based sync (24h lookback)
    app.send_task("sync.igdb.game_changes", args=[24])

    # Discover lists
    app.send_task("sync.igdb.discover_list", args=["popular", 25])
    app.send_task("sync.igdb.discover_list", args=["recent", 50])
    app.send_task("sync.igdb.discover_list", args=["upcoming", 25])

    logger.info("game feed refresh enqueued")
    return {"status": "ok", "message": "game discover and change syncs enqueued"}


@app.task(name="maintenance.refresh_discover_cache")
def refresh_discover_cache() -> dict:
    """Pre-warm the discover Redis cache for anonymous (default) queries.

    Runs daily at 3am after the feed syncs. Fetches hero and common list
    data for each media type and stores results in Redis so the first user
    of the day gets a cache hit instead of a cold query.
    """
    return run_async(_refresh_discover_cache())


async def _refresh_discover_cache() -> dict:
    from otix.services.asset_selection import enrich_items_with_assets
    from otix.services.media_service import MediaService

    redis = await get_redis()
    warmed = 0

    async with async_session() as db:
        service = MediaService(db)

        # ── Hero cache (limit=9, adult excluded, anonymous) ──────────
        for exclude_adult in [True, False]:
            cache_key = f"discover:hero:9:adult{0 if exclude_adult else 1}"
            items, has_more, _ = await service.list_media(
                has_artwork=True,
                limit=9,
                exclude_adult=exclude_adult,
            )
            await enrich_items_with_assets(db, items)
            summaries = [MediaItemSummary.model_validate(item) for item in items]
            response = MediaItemListResponse(
                items=summaries,
                next_cursor=items[-1].id if has_more and items else None,
                has_more=has_more,
            )
            await redis.set(cache_key, response.model_dump_json(), ex=TTL["FEED"]["DISCOVER"])
            warmed += 1

        # ── Discover list caches (anonymous, no language/anime filter) ─
        for media_type in _MEDIA_TYPES:
            for list_type, (sort_by, sort_dir, date_filter_name) in _LISTS.items():
                date_from, date_to = _date_filter(date_filter_name)

                # Match the cache key format from the endpoint
                raw = f"{media_type}:{list_type}:::None::20:adult0"
                cache_key = f"discover:list:{hashlib.sha256(raw.encode()).hexdigest()[:16]}"

                items, has_more, _ = await service.list_media(
                    media_type=media_type,
                    has_artwork=True,
                    has_logo=True,
                    sort_by=sort_by,
                    sort_dir=sort_dir,
                    limit=20,
                    date_from=date_from,
                    date_to=date_to,
                    exclude_adult=True,
                )

                await enrich_items_with_assets(db, items)
                summaries = [MediaItemSummary.model_validate(item) for item in items]
                response = MediaItemListResponse(
                    items=summaries,
                    next_cursor=items[-1].id if has_more and items else None,
                    has_more=has_more,
                )
                await redis.set(cache_key, response.model_dump_json(), ex=TTL["FEED"]["DISCOVER"])
                warmed += 1

    logger.info("discover cache warmed", entries=warmed)
    return {"status": "ok", "warmed": warmed}


@app.task(name="maintenance.provider_health_check")
def provider_health_check() -> dict:
    """Check provider circuit breaker states and log warnings."""
    return run_async(_provider_health_check())


async def _provider_health_check() -> dict:
    registry = get_registry()
    snapshot = registry.snapshot()
    circuit_breakers = snapshot.get("gauges", {}).get("otix_circuit_breaker_state", {}).get("values", {})

    open_breakers = [k for k, v in circuit_breakers.items() if v >= 1.0]
    if open_breakers:
        logger.warning("circuit breakers open", providers=open_breakers)

    return {"circuit_breakers": circuit_breakers, "open": open_breakers}
