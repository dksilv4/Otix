"""Maintenance and scheduled tasks.

These run on the 'control' queue via Celery beat.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import structlog
from sqlalchemy import and_, delete, func, or_, select

from otix.domain.asset import ExternalRating, MediaAsset
from otix.domain.media import ExternalID, Game, MediaItem
from otix.domain.people import Person
from otix.domain.user import RefreshToken, User
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.metrics import SYNC_JOBS_ACTIVE, get_registry
from otix.lib.progress import snapshot_and_reset as _progress_snapshot
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


@app.task(name="maintenance.sync_plex_accounts", queue="slow")
def sync_plex_accounts() -> dict:
    return run_async(_sync_plex_accounts())


async def _sync_plex_accounts() -> dict:
    from otix.services.plex_sync_service import sync_plex

    synced = 0
    failed = 0
    async with async_session() as session:
        users = list((await session.scalars(select(User).where(User.plex_auth_token.isnot(None)))).all())
        for user in users:
            try:
                await sync_plex(session, user)
                synced += 1
            except Exception:
                logger.exception("scheduled plex sync failed", user_id=user.id)
                failed += 1
    return {"synced": synced, "failed": failed}


@app.task(name="maintenance.plex_sync_user", queue="fast", acks_late=True, reject_on_worker_lost=True)
def plex_sync_user(task_id: str, user_id: str) -> dict:
    """Sync Plex libraries for a single user, publishing progress via Redis pub/sub.

    Called on-demand from the API. Runs on the fast queue so it starts immediately.
    """
    return run_async(_plex_sync_user(task_id, user_id))


async def _plex_sync_user(task_id: str, user_id: str) -> dict:
    from typing import Any

    from otix.services.plex_sync_service import sync_plex
    from otix.lib.plex_progress import publish_progress, store_result

    async def progress(event_type: str, **data: Any) -> None:
        try:
            await publish_progress(task_id, event_type, **data)
        except Exception:
            logger.exception("failed to publish plex sync progress", task_id=task_id, event_type=event_type)

    async with async_session() as session:
        user = await session.scalar(select(User).where(User.id == user_id))
        if not user:
            await progress("error", message="User not found")
            raise ValueError(f"User {user_id} not found")

        try:
            result = await sync_plex(session, user, progress=progress)
            await store_result(task_id, result)
            logger.info("plex sync completed for user", user_id=user_id, task_id=task_id, **result)
            return {"status": "success", **result}
        except Exception:
            await progress("error", message="Sync failed unexpectedly")
            raise


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
    async with async_session() as session:
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

    Runs periodically (every 15 min) as a safety net for items missed by inline
    enqueuing from TMDB sync. Only picks up items synced in the last 48 hours
    that have the required external IDs but no Fanart assets yet.
    """
    return run_async(_enrich_fanart())


async def _enrich_fanart() -> dict:
    async with async_session() as session:
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
            .limit(200)
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
            .limit(200)
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
            .limit(200)
        )
        game_result = await session.execute(game_query)
        game_rows = game_result.all()

    movies_enqueued = 0
    shows_enqueued = 0
    games_enqueued = 0

    for media_item_id, _ in movie_rows:
        app.send_task("sync.fanart.movie", args=[media_item_id], queue="fast")
        movies_enqueued += 1

    for media_item_id, _ in show_rows:
        app.send_task("sync.fanart.show", args=[media_item_id], queue="fast")
        shows_enqueued += 1

    for media_item_id, _ in game_rows:
        app.send_task("sync.fanart.game", args=[media_item_id], queue="fast")
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
    async with async_session() as session:
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
    async with async_session() as session:
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


@app.task(name="maintenance.enrich_steamgrid", queue="slow")
def enrich_steamgrid() -> dict:
    """Scan games for missing SteamGridDB artwork across all supported platforms.

    Runs every 30 min. Finds games with any platform ID (steam_app_id or
    entries in store_ids) that are missing textless_poster_url or logo_url.
    """
    return run_async(_enrich_steamgrid())


async def _enrich_steamgrid() -> dict:
    missing = or_(
        MediaItem.textless_poster_url.is_(None),
        MediaItem.logo_url.is_(None),
    )

    async with async_session() as session:
        # Steam games (dedicated column, fast query)
        steam_result = await session.execute(
            select(Game.media_item_id, Game.steam_app_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .where(
                MediaItem.media_type == "game",
                Game.steam_app_id.isnot(None),
                missing,
            )
            .limit(30)
        )
        steam_rows = steam_result.all()

        # Non-Steam games (store_ids JSONB)
        other_result = await session.execute(
            select(Game.media_item_id, Game.store_ids)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .where(
                MediaItem.media_type == "game",
                Game.store_ids.isnot(None),
                missing,
            )
            .limit(30)
        )
        other_rows = other_result.all()

    enqueued = 0
    for _, steam_app_id in steam_rows:
        app.send_task("sync.steamgrid.game", args=[steam_app_id])
        enqueued += 1

    seen: set[str] = set()
    for media_item_id, store_ids in other_rows:
        if not store_ids:
            continue
        for platform, pid in store_ids.items():
            if platform == "steam":
                continue
            key = f"{platform}:{pid}"
            if key in seen:
                continue
            seen.add(key)
            app.send_task("sync.steamgrid.game_by_platform", args=[platform, pid])
            enqueued += 1

    if enqueued:
        logger.info("steamgrid enrichment enqueued", count=enqueued)

    return {"enqueued": enqueued}


@app.task(name="maintenance.steam_name_match", queue="slow")
def steam_name_match() -> dict:
    """Find games without a steam_app_id by searching the Steam store by name.

    Runs every 30 min. Limited to 25 games per cycle to stay under rate limits.
    """
    return run_async(_steam_name_match())


async def _steam_name_match() -> dict:
    async with async_session() as session:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=72)

        result = await session.execute(
            select(Game.media_item_id, MediaItem.title)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .where(
                MediaItem.media_type == "game",
                MediaItem.synced_at >= cutoff,
                Game.steam_app_id.is_(None),
            )
            .limit(25)
        )
        rows = result.all()

    if not rows:
        return {"searched": 0, "matched": 0}

    redis = await get_redis()
    provider = SteamProvider(redis)

    matched = 0
    async with async_session() as session:
        for media_item_id, title in rows:
            try:
                items = await provider.search_apps(title)
            except Exception:
                continue

            if not items:
                continue

            # Match by case-insensitive name, prefer exact match
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

            game = await session.get(Game, media_item_id)
            if game is not None and game.steam_app_id is None:
                # Check the app_id isn't already claimed by a different game
                conflict = await session.scalar(
                    select(Game).where(
                        Game.steam_app_id == app_id,
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


@app.task(name="maintenance.steam_ccu_batch", queue="ccu")
def steam_ccu_batch() -> dict:
    """Batch update current player counts for games with a Steam app ID.

    Runs every 5 min. Limit of 250 games/cycle (~72k calls/day) keeps
    well within Steam's 100k daily budget, leaving headroom for enrichment.
    Popular games (by current player count) get priority.
    """
    return run_async(_steam_ccu_batch())


async def _steam_ccu_batch() -> dict:
    async with async_session() as session:
        from sqlalchemy import select

        result = await session.execute(
            select(Game.steam_app_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .where(
                MediaItem.media_type == "game",
                Game.steam_app_id.isnot(None),
            )
            .order_by(Game.current_players.desc().nulls_first())
            .limit(250)
        )
        app_ids = [row[0] for row in result.all()]

    if not app_ids:
        return {"apps_checked": 0, "updated": 0}

    redis = await get_redis()
    provider = SteamProvider(redis)

    async with async_session() as session:
        from sqlalchemy import select

        games = await session.scalars(
            select(Game).where(Game.steam_app_id.in_(app_ids))
        )
        games_by_app = {g.steam_app_id: g for g in games}

        updated = 0
        cleared = 0
        for app_id in app_ids:
            try:
                data = await provider.get_current_players(app_id)
            except Exception:
                continue

            if data is None:
                # 404 — app ID doesn't exist on Steam, clear it permanently
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


@app.task(name="maintenance.catalog_hydration", queue="slow")
def catalog_hydration() -> dict:
    """Background scan: find stale catalog items and re-enqueue provider syncs.

    Runs every 5 min. Walks MediaItems past their next_sync_at, oldest
    first, and enqueues the appropriate provider task. Small batch size
    keeps queue load low so user-facing operations take priority.
    """
    return run_async(_catalog_hydration())


_MEDIA_SYNC_MAP = {
    "movie": {"provider": "tmdb", "task": "sync.tmdb.movie"},
    "show": {"provider": "tmdb", "task": "sync.tmdb.show"},
    "game": {"provider": "igdb", "task": "sync.igdb.game"},
}


async def _catalog_hydration() -> dict:
    now = datetime.now(timezone.utc)
    provider_map = _MEDIA_SYNC_MAP

    async with async_session() as session:
        # Single join: stale items with their primary external ID
        result = await session.execute(
            select(MediaItem.id, MediaItem.media_type, ExternalID.external_id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.next_sync_at.isnot(None),
                MediaItem.next_sync_at < now,
                or_(
                    and_(
                        MediaItem.media_type.in_(["movie", "show"]),
                        ExternalID.provider == "tmdb",
                    ),
                    and_(
                        MediaItem.media_type == "game",
                        ExternalID.provider == "igdb",
                    ),
                ),
            )
            .order_by(MediaItem.next_sync_at.asc())
            .limit(50)
        )
        rows = result.all()

    if not rows:
        return {"stale_found": 0, "enqueued": 0}

    enqueued = 0
    seen: set[str] = set()
    for mi_id, mi_type, ext_id in rows:
        if mi_id in seen:
            continue
        seen.add(mi_id)

        entry = provider_map.get(mi_type)
        if entry is None:
            continue

        app.send_task(entry["task"], args=[int(ext_id) if ext_id.isdigit() else ext_id])
        enqueued += 1

    if enqueued:
        logger.info(
            "catalog hydration enqueued",
            stale_found=len(rows),
            enqueued=enqueued,
        )

    return {"stale_found": len(rows), "enqueued": enqueued}


@app.task(name="maintenance.progress_summary", queue="slow")
def progress_summary() -> dict:
    """Log a periodic summary of sync activity, queue depths, and DB counts.

    Runs every 60s via Celery beat. Reads and resets the Redis progress
    counters atomically so each window is independent. Silent when idle.
    """
    return run_async(_progress_summary())


async def _progress_summary() -> dict:
    counters = await _progress_snapshot()

    if not counters:
        return {"status": "idle"}

    # Compute per-second rates (window is always 60s)
    window_s = 60
    rated = {}
    for k, v in counters.items():
        rated[f"{k}_rate"] = round(v / window_s, 1)

    # Queue depths
    broker_url = settings.celery_broker
    parsed = urlparse(broker_url)
    broker_redis_url = f"redis://{parsed.hostname}:{parsed.port}/0"

    import redis.asyncio as aioredis
    r = aioredis.from_url(broker_redis_url, decode_responses=True)
    try:
        fast_depth = await r.llen("fast") or 0
        slow_depth = await r.llen("slow") or 0
    finally:
        await r.aclose()

    # DB counts per media type
    async with async_session() as session:
        movie_count = await session.scalar(
            select(func.count()).select_from(MediaItem).where(MediaItem.media_type == "movie")
        )
        show_count = await session.scalar(
            select(func.count()).select_from(MediaItem).where(MediaItem.media_type == "show")
        )
        game_count = await session.scalar(
            select(func.count()).select_from(MediaItem).where(MediaItem.media_type == "game")
        )
        person_count = await session.scalar(
            select(func.count()).select_from(Person)
        )

    logger.info(
        "progress summary",
        window_s=window_s,
        **counters,
        **rated,
        db_movies=movie_count or 0,
        db_shows=show_count or 0,
        db_games=game_count or 0,
        db_people=person_count or 0,
        fast_queue=fast_depth,
        slow_queue=slow_depth,
    )

    return {
        "counters": counters,
        "db_movies": movie_count,
        "db_shows": show_count,
        "db_games": game_count,
        "db_people": person_count,
        "fast_queue": fast_depth,
        "slow_queue": slow_depth,
    }
