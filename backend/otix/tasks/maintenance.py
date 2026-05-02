"""Maintenance and scheduled tasks.

These run on the 'control' queue via Celery beat.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import delete

from otix.domain.asset import ExternalRating, MediaAsset
from otix.domain.media import ExternalID, Game, MediaItem
from otix.domain.user import RefreshToken
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session_factory
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.metrics import SYNC_JOBS_ACTIVE, get_registry
from otix.providers.steam.client import SteamProvider

logger = structlog.get_logger()


@app.task(name="maintenance.refresh_discover_feed", queue="slow")
def refresh_discover_feed() -> dict:
    """Enqueue discover list and change-based syncs to keep the catalog fresh.

    Runs hourly via Celery beat. Individual items skip via next_sync_at and
    content_hash guards.
    """
    # Change-based sync — catches items modified in the last 24h
    app.send_task("sync.tmdb.movie_changes", args=[24])
    app.send_task("sync.tmdb.show_changes", args=[24])
    app.send_task("sync.tmdb.person_changes", args=[24])

    # Discover lists — broad coverage across multiple list types
    app.send_task("sync.tmdb.popular_movies", args=[3])
    app.send_task("sync.tmdb.popular_shows", args=[3])
    app.send_task("sync.tmdb.trending_movies", args=[3])
    app.send_task("sync.tmdb.trending_shows", args=[3])
    app.send_task("sync.tmdb.top_rated_movies", args=[2])
    app.send_task("sync.tmdb.top_rated_shows", args=[2])
    app.send_task("sync.tmdb.upcoming_movies", args=[2])
    app.send_task("sync.tmdb.now_playing_movies", args=[2])
    app.send_task("sync.tmdb.on_the_air_shows", args=[2])
    app.send_task("sync.tmdb.airing_today_shows", args=[2])

    logger.info("discover feed refresh enqueued")
    return {"status": "ok", "message": "discover and change syncs enqueued"}


@app.task(name="maintenance.refresh_game_feed", queue="slow")
def refresh_game_feed() -> dict:
    """Enqueue game discover and change-based syncs.

    Runs every 2 hours via Celery beat. IGDB has a 4 rps rate limit so this
    is staggered from the hourly TMDB refresh.
    """
    # Change-based sync (24h lookback)
    app.send_task("sync.igdb.game_changes", args=[24])

    # Discover lists
    app.send_task("sync.igdb.popular_games", args=[25])
    app.send_task("sync.igdb.recent_games", args=[50])
    app.send_task("sync.igdb.upcoming_games", args=[25])

    logger.info("game feed refresh enqueued")
    return {"status": "ok", "message": "game discover and change syncs enqueued"}


@app.task(name="maintenance.provider_health_check", queue="slow")
def provider_health_check() -> dict:
    """Check provider circuit breaker states and log warnings."""
    return run_async(_provider_health_check())


@app.task(name="maintenance.cleanup_expired_tokens", queue="slow")
def cleanup_expired_tokens() -> dict:
    """Remove expired refresh tokens from the database."""
    return run_async(_cleanup_expired_tokens())


async def _provider_health_check() -> dict:
    registry = get_registry()
    snapshot = registry.snapshot()
    circuit_breakers = snapshot.get("gauges", {}).get("otix_circuit_breaker_state", {}).get("values", {})

    open_breakers = [k for k, v in circuit_breakers.items() if v >= 1.0]
    if open_breakers:
        logger.warning("circuit breakers open", providers=open_breakers)

    return {"circuit_breakers": circuit_breakers, "open": open_breakers}


async def _cleanup_expired_tokens() -> dict:
    async with async_session_factory() as session:
        now = datetime.now(timezone.utc)
        result = await session.execute(
            delete(RefreshToken).where(RefreshToken.expires_at < now)
        )
        await session.commit()
        count = result.rowcount
        if count:
            logger.info("expired refresh tokens cleaned up", count=count)
        return {"deleted": count}


@app.task(name="maintenance.enrich_fanart", queue="slow")
def enrich_fanart() -> dict:
    """Scan recently-synced items for missing Fanart assets and enqueue enrichment.

    Runs periodically (every 30 min). Only picks up items synced in the last
    48 hours that have the required external IDs but no Fanart assets yet.
    """
    return run_async(_enrich_fanart())


async def _enrich_fanart() -> dict:
    async with async_session_factory() as session:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=48)

        # Subquery: media_item_ids that already have at least one Fanart asset
        enriched = (
            select(MediaAsset.media_item_id)
            .where(MediaAsset.provider == "fanart")
            .distinct()
        ).subquery()

        # Movies: have tmdb ID, synced recently, no Fanart yet
        movie_query = (
            select(MediaItem.id, ExternalID.external_id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type == "movie",
                MediaItem.synced_at >= cutoff,
                ExternalID.provider == "tmdb",
                MediaItem.id.not_in(select(enriched.c.media_item_id)),
            )
            .limit(50)
        )
        movie_result = await session.execute(movie_query)
        movie_rows = movie_result.all()

        # Shows: have tvdb ID, synced recently, no Fanart yet
        show_query = (
            select(MediaItem.id, ExternalID.external_id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type == "show",
                MediaItem.synced_at >= cutoff,
                ExternalID.provider == "tvdb",
                MediaItem.id.not_in(select(enriched.c.media_item_id)),
            )
            .limit(50)
        )
        show_result = await session.execute(show_query)
        show_rows = show_result.all()

        # Games: have Fanart ID, synced recently, no Fanart assets yet
        game_query = (
            select(MediaItem.id, ExternalID.external_id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type == "game",
                MediaItem.synced_at >= cutoff,
                ExternalID.provider == "fanart",
                MediaItem.id.not_in(select(enriched.c.media_item_id)),
            )
            .limit(50)
        )
        game_result = await session.execute(game_query)
        game_rows = game_result.all()

    movies_enqueued = 0
    shows_enqueued = 0
    games_enqueued = 0

    for media_item_id, _ in movie_rows:
        app.send_task("sync.fanart.movie", args=[media_item_id])
        movies_enqueued += 1

    for media_item_id, _ in show_rows:
        app.send_task("sync.fanart.show", args=[media_item_id])
        shows_enqueued += 1

    for media_item_id, _ in game_rows:
        app.send_task("sync.fanart.game", args=[media_item_id])
        games_enqueued += 1

    total = movies_enqueued + shows_enqueued + games_enqueued
    if total:
        logger.info(
            "fanart enrichment enqueued",
            movies=movies_enqueued,
            shows=shows_enqueued,
            games=games_enqueued,
        )

    return {
        "movies_enqueued": movies_enqueued,
        "shows_enqueued": shows_enqueued,
        "games_enqueued": games_enqueued,
    }


@app.task(name="maintenance.enrich_omdb", queue="slow")
def enrich_omdb() -> dict:
    """Scan recently-synced items for missing OMDb ratings and enqueue enrichment.

    Only picks up items synced in the last 48 hours that have an IMDb ID
    but no OMDb-sourced ratings yet.
    """
    return run_async(_enrich_omdb())


async def _enrich_omdb() -> dict:
    async with async_session_factory() as session:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=48)

        # Subquery: media_item_ids that already have an OMDb-sourced rating
        enriched = (
            select(ExternalRating.media_item_id)
            .where(ExternalRating.provider.in_(["imdb", "rotten_tomatoes", "metacritic"]))
            .distinct()
        ).subquery()

        # Movies and shows with an IMDb ID, synced recently, no OMDb ratings yet
        query = (
            select(MediaItem.id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type.in_(["movie", "show"]),
                MediaItem.synced_at >= cutoff,
                ExternalID.provider == "imdb",
                MediaItem.id.not_in(select(enriched.c.media_item_id)),
            )
            .limit(100)
        )
        result = await session.execute(query)
        rows = result.all()

    enqueued = 0
    for (media_item_id,) in rows:
        app.send_task("sync.omdb.ratings", args=[media_item_id])
        enqueued += 1

    if enqueued:
        logger.info("omdb enrichment enqueued", count=enqueued)

    return {"enqueued": enqueued}


@app.task(name="maintenance.enrich_steam", queue="slow")
def enrich_steam() -> dict:
    """Scan recently-synced games for Steam app IDs and enqueue updates.

    Runs every 15 min. Finds games with a steam_app_id that were synced
    recently and enqueues individual Steam update tasks.
    """
    return run_async(_enrich_steam())


async def _enrich_steam() -> dict:
    async with async_session_factory() as session:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

        # Games with steam_app_id, synced recently, not enriched in last hour
        query = (
            select(Game.media_item_id, Game.steam_app_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .where(
                MediaItem.media_type == "game",
                MediaItem.synced_at >= cutoff,
                Game.steam_app_id.isnot(None),
            )
            .limit(50)
        )
        result = await session.execute(query)
        rows = result.all()

    enqueued = 0
    for _, steam_app_id in rows:
        app.send_task("sync.steam.update_app", args=[steam_app_id])
        enqueued += 1

    if enqueued:
        logger.info("steam enrichment enqueued", count=enqueued)

    return {"enqueued": enqueued}


@app.task(name="maintenance.steam_ccu_batch", queue="ccu")
def steam_ccu_batch() -> dict:
    """Batch update current player counts for all games with a Steam app ID.

    Runs frequently (every 5 min) on the dedicated CCU queue to avoid
    contending with other tasks.
    """
    return run_async(_steam_ccu_batch())


async def _steam_ccu_batch() -> dict:
    async with async_session_factory() as session:
        from sqlalchemy import select

        result = await session.execute(
            select(Game.steam_app_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .where(
                MediaItem.media_type == "game",
                Game.steam_app_id.isnot(None),
            )
            .limit(50)
        )
        app_ids = [row[0] for row in result.all()]

    if not app_ids:
        return {"apps_checked": 0, "updated": 0}

    redis = await get_redis()
    provider = SteamProvider(redis)

    async with async_session_factory() as session:
        from sqlalchemy import select

        games = await session.scalars(
            select(Game).where(Game.steam_app_id.in_(app_ids))
        )
        games_by_app = {g.steam_app_id: g for g in games}

        updated = 0
        for app_id in app_ids:
            try:
                data = await provider.get_current_players(app_id)
                count = data.get("response", {}).get("player_count")
                if isinstance(count, (int, float)):
                    game = games_by_app.get(app_id)
                    if game is not None:
                        game.current_players = int(count)
                        updated += 1
            except Exception:
                pass

        await session.commit()

    if updated:
        logger.info("steam ccu batch updated", count=updated)

    return {"apps_checked": len(app_ids), "updated": updated}
