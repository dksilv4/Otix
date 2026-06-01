"""Feed refresh, provider health check, and Plex account sync."""

from __future__ import annotations

import structlog
from sqlalchemy import select

from otix.domain.user import User
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async
from otix.lib.metrics import get_registry

logger = structlog.get_logger()


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


@app.task(name="maintenance.provider_health_check")
def provider_health_check() -> dict:
    """Check provider circuit breaker states and log warnings."""
    return run_async(_provider_health_check())


@app.task(name="maintenance.sync_plex_accounts")
def sync_plex_accounts() -> dict:
    return run_async(_sync_plex_accounts())


async def _provider_health_check() -> dict:
    registry = get_registry()
    snapshot = registry.snapshot()
    circuit_breakers = snapshot.get("gauges", {}).get("otix_circuit_breaker_state", {}).get("values", {})

    open_breakers = [k for k, v in circuit_breakers.items() if v >= 1.0]
    if open_breakers:
        logger.warning("circuit breakers open", providers=open_breakers)

    return {"circuit_breakers": circuit_breakers, "open": open_breakers}


async def _sync_plex_accounts() -> dict:
    from otix.services.plex_sync_service import sync_plex

    synced = 0
    failed = 0
    async with async_session() as session:
        users = list((await session.scalars(select(User).where(User.plex_auth_token.isnot(None)).limit(500))).all())
        for user in users:
            try:
                await sync_plex(session, user)
                synced += 1
            except Exception:
                logger.exception("scheduled plex sync failed", user_id=user.id)
                failed += 1
    return {"synced": synced, "failed": failed}
