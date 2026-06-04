"""Maintenance and scheduled tasks.

These run on the 'control' queue via Celery beat.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import structlog
from sqlalchemy import and_, delete, func, not_, or_, select, text
from sqlalchemy import exists as sa_exists
from sqlalchemy.orm import joinedload

from otix.domain.asset import ExternalRating, MediaAsset
from otix.domain.media import Album, ExternalID, Game, MediaItem
from otix.domain.list import UserList, UserListItem
from otix.domain.people import MediaCredit, Person
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
        ("popular", "movie", 3), ("popular", "show", 3),
        ("trending", "movie", 3), ("trending", "show", 3),
        ("top_rated", "movie", 2), ("top_rated", "show", 2),
        ("upcoming", "movie", 2), ("now_playing", "movie", 2),
        ("on_the_air", "show", 2), ("airing_today", "show", 2),
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


async def _sync_plex_accounts() -> dict:
    import uuid

    synced = 0
    failed = 0
    async with async_session() as session:
        users = list((await session.scalars(
            select(User).where(User.plex_auth_token.isnot(None)).limit(500)
        )).all())
        for user in users:
            try:
                task_id = f"scheduled-{uuid.uuid4().hex[:8]}"
                app.send_task("maintenance.plex_sync_user", args=[task_id, user.id], queue="reactive-fast")
                synced += 1
            except Exception:
                logger.exception("scheduled plex sync enqueue failed", user_id=user.id)
                failed += 1
    return {"synced": synced, "failed": failed}


@app.task(name="maintenance.sync_spotify_recently_played")
def sync_spotify_recently_played() -> dict:
    return run_async(_sync_spotify_recently_played())


async def _sync_spotify_recently_played() -> dict:
    from otix.infrastructure.celery import app as celery_app

    synced = 0
    failed = 0
    async with async_session() as session:
        users = list((await session.scalars(
            select(User).where(User.spotify_refresh_token.isnot(None)).limit(200)
        )).all())
        for user in users:
            try:
                celery_app.send_task("sync.spotify.recently_played", args=[user.id])
                synced += 1
            except Exception:
                logger.exception("scheduled spotify recently played sync enqueue failed", user_id=user.id)
                failed += 1
    return {"synced": synced, "failed": failed}


@app.task(name="maintenance.sync_youtube_watch_history")
def sync_youtube_watch_history() -> dict:
    return run_async(_sync_youtube_watch_history())


async def _sync_youtube_watch_history() -> dict:
    from otix.infrastructure.celery import app as celery_app

    synced = 0
    failed = 0
    async with async_session() as session:
        users = list((await session.scalars(
            select(User).where(User.google_refresh_token.isnot(None)).limit(200)
        )).all())
        for user in users:
            try:
                celery_app.send_task("sync.youtube.watch_history", args=[user.id])
                synced += 1
            except Exception:
                logger.exception("scheduled youtube watch history sync enqueue failed", user_id=user.id)
                failed += 1
    return {"synced": synced, "failed": failed}


@app.task(name="maintenance.plex_sync_user", acks_late=True, reject_on_worker_lost=True)
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


@app.task(name="maintenance.cleanup_expired_tokens")
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


@app.task(name="maintenance.enrich_fanart")
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

        # Music: have primary artist with MBID, synced recently, no Fanart assets yet
        has_mb = sa_exists().where(
            ExternalID.provider == "musicbrainz",
            ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        music_query = (
            select(MediaItem.id)
            .join(MediaCredit, MediaCredit.media_item_id == MediaItem.id)
            .join(Person, Person.id == MediaCredit.person_id)
            .where(
                MediaItem.media_type == "music",
                MediaItem.synced_at >= cutoff,
                MediaCredit.role == "primary",
                has_mb,
                MediaItem.id.not_in(select(enriched.c.media_item_id)),
            )
            .limit(200)
        )
        music_result = await session.execute(music_query)
        music_rows = music_result.all()

        # ── Watchlist priority: items in user watchlists missing artwork ──
        watchlist_sub = (
            select(UserListItem.media_item_id)
            .join(UserList, UserList.id == UserListItem.list_id)
            .where(UserList.user_id.isnot(None))
            .distinct()
        ).subquery()

        # Watchlisted movies without textless poster
        wl_movie_query = (
            select(MediaItem.id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type == "movie",
                MediaItem.textless_poster_url.is_(None),
                ExternalID.provider == "tmdb",
                MediaItem.id.in_(select(watchlist_sub.c.media_item_id)),
                MediaItem.id.not_in(select(enriched.c.media_item_id)),
            )
            .limit(200)
        )
        wl_movie_result = await session.execute(wl_movie_query)
        wl_movie_ids = [row[0] for row in wl_movie_result.all()]

        # Watchlisted shows without textless poster
        wl_show_query = (
            select(MediaItem.id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type == "show",
                MediaItem.textless_poster_url.is_(None),
                ExternalID.provider == "tvdb",
                MediaItem.id.in_(select(watchlist_sub.c.media_item_id)),
                MediaItem.id.not_in(select(enriched.c.media_item_id)),
            )
            .limit(200)
        )
        wl_show_result = await session.execute(wl_show_query)
        wl_show_ids = [row[0] for row in wl_show_result.all()]

        # Watchlisted music without poster
        wl_music_query = (
            select(MediaItem.id)
            .join(MediaCredit, MediaCredit.media_item_id == MediaItem.id)
            .join(Person, Person.id == MediaCredit.person_id)
            .where(
                MediaItem.media_type == "music",
                MediaItem.poster_url.is_(None),
                MediaCredit.role == "primary",
                has_mb,
                MediaItem.id.in_(select(watchlist_sub.c.media_item_id)),
                MediaItem.id.not_in(select(enriched.c.media_item_id)),
            )
            .limit(200)
        )
        wl_music_result = await session.execute(wl_music_query)
        wl_music_ids = [row[0] for row in wl_music_result.all()]

    movies_enqueued = 0
    shows_enqueued = 0
    music_enqueued = 0

    # Enqueue watchlist items first, then the rest
    for mid in wl_movie_ids:
        app.send_task("sync.fanart.enrich", args=["movie",mid])
        movies_enqueued += 1

    for mid in wl_show_ids:
        app.send_task("sync.fanart.enrich", args=["show",mid])
        shows_enqueued += 1

    for mid in wl_music_ids:
        app.send_task("sync.fanart.enrich", args=["music",mid])
        music_enqueued += 1

    # Already-enriched watchlist items, skip in the main loop
    wl_seen_by_type = {
        "movie": set(wl_movie_ids),
        "show": set(wl_show_ids),
        "music": set(wl_music_ids),
    }

    for media_item_id, _ in movie_rows:
        if media_item_id not in wl_seen_by_type["movie"]:
            app.send_task("sync.fanart.enrich", args=["movie",media_item_id])
            movies_enqueued += 1

    for media_item_id, _ in show_rows:
        if media_item_id not in wl_seen_by_type["show"]:
            app.send_task("sync.fanart.enrich", args=["show",media_item_id])
            shows_enqueued += 1

    for (media_item_id,) in music_rows:
        if media_item_id not in wl_seen_by_type["music"]:
            app.send_task("sync.fanart.enrich", args=["music",media_item_id])
            music_enqueued += 1

    wl_total = len(wl_movie_ids) + len(wl_show_ids) + len(wl_music_ids)
    total = movies_enqueued + shows_enqueued + music_enqueued
    if total:
        logger.info(
            "fanart enrichment enqueued",
            movies=movies_enqueued,
            shows=shows_enqueued,
            music=music_enqueued,
            watchlist_priority=wl_total,
        )

    return {
        "movies_enqueued": movies_enqueued,
        "shows_enqueued": shows_enqueued,
        "music_enqueued": music_enqueued,
    }


@app.task(name="maintenance.enrich_omdb")
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


@app.task(name="maintenance.enrich_production_companies")
def enrich_production_companies() -> dict:
    """Scan movies/shows for missing production company data and enqueue hydration.

    Runs every 5 min. Finds items with a TMDB ID that have no production=True
    involved companies and enqueues a focused TMDB hydration task per item.
    Batch size of 200/cycle = ~2,400/hr, well under TMDB's 50 rps limit.
    """
    return run_async(_enrich_production_companies())


async def _enrich_production_companies() -> dict:
    from otix.domain.company import InvolvedCompany

    async with async_session() as session:
        enriched = (
            select(InvolvedCompany.media_item_id)
            .where(InvolvedCompany.production == True)  # noqa: E712
            .distinct()
        ).subquery()

        query = (
            select(MediaItem.id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type.in_(["movie", "show"]),
                ExternalID.provider == "tmdb",
                MediaItem.id.not_in(select(enriched.c.media_item_id)),
            )
            .limit(200)
        )
        result = await session.execute(query)
        rows = result.all()

    enqueued = 0
    for (media_item_id,) in rows:
        app.send_task("sync.tmdb.hydrate_production_companies", args=[media_item_id], queue="maintain")
        enqueued += 1

    if enqueued:
        logger.info("production companies enrichment enqueued", count=enqueued)

    return {"enqueued": enqueued}


@app.task(name="maintenance.enrich_content_ratings")
def enrich_content_ratings() -> dict:
    """Scan shows for missing TV content ratings and enqueue hydration.

    Runs every 5 min. Finds shows with a TMDB ID that have no MediaRelease
    rows and enqueues a focused content_ratings hydration task per item.
    Batch size of 200/cycle = ~2,400/hr.
    """
    return run_async(_enrich_content_ratings())


async def _enrich_content_ratings() -> dict:
    from otix.domain.asset import MediaRelease

    async with async_session() as session:
        rated = (
            select(MediaRelease.media_item_id)
            .distinct()
        ).subquery()

        query = (
            select(MediaItem.id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type == "show",
                ExternalID.provider == "tmdb",
                MediaItem.id.not_in(select(rated.c.media_item_id)),
            )
            .limit(200)
        )
        result = await session.execute(query)
        rows = result.all()

    enqueued = 0
    for (media_item_id,) in rows:
        app.send_task("sync.tmdb.hydrate_content_ratings", args=[media_item_id], queue="reactive-fast")
        enqueued += 1

    if enqueued:
        logger.info("content ratings enrichment enqueued", count=enqueued)

    return {"enqueued": enqueued}


@app.task(name="maintenance.enrich_game_age_ratings")
def enrich_game_age_ratings() -> dict:
    """Scan games for missing age ratings (ESRB, PEGI) and enqueue hydration.

    Runs every 5 min. Finds games with an IGDB ID that have no MediaRelease
    rows and enqueues a focused age_ratings hydration task per item.
    Batch size of 200/cycle.
    """
    return run_async(_enrich_game_age_ratings())


async def _enrich_game_age_ratings() -> dict:
    from otix.domain.asset import MediaRelease

    async with async_session() as session:
        rated = (
            select(MediaRelease.media_item_id)
            .distinct()
        ).subquery()

        query = (
            select(MediaItem.id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                MediaItem.media_type == "game",
                ExternalID.provider == "igdb",
                MediaItem.id.not_in(select(rated.c.media_item_id)),
            )
            .limit(200)
        )
        result = await session.execute(query)
        rows = result.all()

    enqueued = 0
    for (media_item_id,) in rows:
        app.send_task("sync.igdb.hydrate_age_ratings", args=[media_item_id], queue="ingest-igdb")
        enqueued += 1

    if enqueued:
        logger.info("game age ratings enrichment enqueued", count=enqueued)

    return {"enqueued": enqueued}


@app.task(name="maintenance.enrich_steam")
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
            select(Game.media_item_id, ExternalID.external_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .join(ExternalID, and_(
                ExternalID.entity_id == Game.media_item_id,
                ExternalID.entity_type == "media_item",
                ExternalID.provider == "steam",
            ))
            .where(
                MediaItem.media_type == "game",
                MediaItem.synced_at >= cutoff,
            )
            .limit(50)
        )
        result = await session.execute(query)
        rows = result.all()

    enqueued = 0
    for _, steam_app_id in rows:
        app.send_task("sync.steam.update_app", args=[int(steam_app_id)])
        enqueued += 1

    if enqueued:
        logger.info("steam enrichment enqueued", count=enqueued)

    return {"enqueued": enqueued}


@app.task(name="maintenance.enrich_steamgrid")
def enrich_steamgrid() -> dict:
    """Scan games for missing SteamGridDB artwork across all supported platforms.

    Runs every 30 min. Finds games with any platform ID (steam_app_id or
    entries in store_ids) that are missing textless_poster_url, backdrop_url,
    or logo_url.
    """
    return run_async(_enrich_steamgrid())


async def _enrich_steamgrid() -> dict:
    missing = or_(
        MediaItem.textless_poster_url.is_(None),
        MediaItem.backdrop_url.is_(None),
        MediaItem.logo_url.is_(None),
    )

    async with async_session() as session:
        # Steam games (dedicated column, fast query)
        steam_result = await session.execute(
            select(Game.media_item_id, ExternalID.external_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .join(ExternalID, and_(
                ExternalID.entity_id == Game.media_item_id,
                ExternalID.entity_type == "media_item",
                ExternalID.provider == "steam",
            ))
            .where(
                MediaItem.media_type == "game",
                missing,
            )
            .limit(30)
        )
        steam_rows = steam_result.all()

        # Non-Steam games (store IDs via ExternalID)
        store_providers = {"epic", "gog", "origin", "uplay", "bnet", "eshop",
                          "xbox", "playstation", "nintendo", "itchio", "stadia"}
        other_result = await session.execute(
            select(Game.media_item_id, ExternalID.provider, ExternalID.external_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .join(ExternalID, and_(
                ExternalID.entity_id == Game.media_item_id,
                ExternalID.entity_type == "media_item",
                ExternalID.provider.in_(store_providers),
            ))
            .where(
                MediaItem.media_type == "game",
                missing,
            )
            .limit(30)
        )
        other_rows_raw = other_result.all()

        # Games without any store IDs — use name-based SGDB lookup
        no_store_result = await session.execute(
            select(Game.media_item_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .outerjoin(ExternalID, and_(
                ExternalID.entity_id == Game.media_item_id,
                ExternalID.entity_type == "media_item",
                ExternalID.provider.in_(list(store_providers | {"steam"})),
            ))
            .where(
                MediaItem.media_type == "game",
                missing,
                ExternalID.id.is_(None),
            )
            .limit(30)
        )
        no_store_ids = [mid for (mid,) in no_store_result.all()]

    # Group store IDs by media_item_id
    other_rows: dict[str, dict[str, str]] = {}
    for mid, provider, ext_id in other_rows_raw:
        if mid not in other_rows:
            other_rows[mid] = {}
        other_rows[mid][provider] = ext_id

    enqueued = 0
    for _, steam_app_id in steam_rows:
        app.send_task("sync.steamgrid.game", args=[int(steam_app_id)])
        enqueued += 1

    seen: set[str] = set()
    for _media_item_id, store_ids in other_rows.items():
        for platform, pid in store_ids.items():
            if platform == "steam":
                continue
            key = f"{platform}:{pid}"
            if key in seen:
                continue
            seen.add(key)
            app.send_task("sync.steamgrid.game_by_platform", args=[platform, pid])
            enqueued += 1

    for mid in no_store_ids:
        app.send_task("sync.steamgrid.game_by_name", args=[mid])
        enqueued += 1

    if enqueued:
        logger.info("steamgrid enrichment enqueued", count=enqueued)

    return {"enqueued": enqueued}


@app.task(name="maintenance.enrich_lastfm")
def enrich_lastfm() -> dict:
    """Scan recently-synced albums and enqueue Last.fm enrichment.

    Runs every 30 min. Finds albums synced in the last 48h and enqueues
    individual Last.fm tasks for wiki summaries, tags, and playcounts.
    """
    return run_async(_enrich_lastfm())


async def _enrich_lastfm() -> dict:
    async with async_session() as session:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=48)

        query = (
            select(Album.media_item_id)
            .join(MediaItem, MediaItem.id == Album.media_item_id)
            .where(
                MediaItem.media_type == "music",
                MediaItem.synced_at >= cutoff,
            )
            .limit(50)
        )
        result = await session.execute(query)
        rows = result.all()

    enqueued = 0
    for row in rows:
        app.send_task("sync.lastfm.enrich_album", args=[row[0]])
        enqueued += 1

    if enqueued:
        logger.info("lastfm enrichment enqueued", count=enqueued)

    return {"enqueued": enqueued}


@app.task(name="maintenance.steam_name_match")
def steam_name_match() -> dict:
    """Find games without a steam_app_id by searching the Steam store by name.

    Runs every 30 min. Limited to 25 games per cycle to stay under rate limits.
    """
    return run_async(_steam_name_match())


async def _steam_name_match() -> dict:
    import asyncio

    async with async_session() as session:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=72)

        has_steam = sa_exists().where(
            ExternalID.provider == "steam",
            ExternalID.entity_type == "media_item",
            ExternalID.entity_id == Game.media_item_id,
        )
        result = await session.execute(
            select(Game.media_item_id, MediaItem.title)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .where(
                MediaItem.media_type == "game",
                MediaItem.synced_at >= cutoff,
                not_(has_steam),
            )
            .limit(25)
        )
        rows = result.all()

    if not rows:
        return {"searched": 0, "matched": 0}

    redis = await get_redis()
    provider = SteamProvider(redis)
    sem = asyncio.Semaphore(5)

    async def _search_one(media_item_id: str, title: str) -> tuple[str, str, list | None]:
        async with sem:
            try:
                items = await provider.search_apps(title)
                return media_item_id, title, items
            except Exception:
                return media_item_id, title, None

    search_results = await asyncio.gather(
        *[_search_one(mid, title) for mid, title in rows]
    )

    matched = 0
    async with async_session() as session:
        for media_item_id, title, items in search_results:
            if not items:
                continue

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

            game = await session.scalar(
                select(Game)
                .where(Game.media_item_id == media_item_id)
                .options(joinedload(Game._external_ids))
            )
            if game is not None and game.steam_app_id is None:
                conflict = await session.scalar(
                    select(Game)
                    .join(ExternalID, and_(
                        ExternalID.entity_id == Game.media_item_id,
                        ExternalID.entity_type == "media_item",
                        ExternalID.provider == "steam",
                    ))
                    .where(
                        ExternalID.external_id == str(app_id),
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


@app.task(name="maintenance.steam_ccu_batch", queue="maintain")
def steam_ccu_batch() -> dict:
    """Batch update current player counts for games with a Steam app ID.

    Runs every 5 min. Limit of 250 games/cycle (~72k calls/day) keeps
    well within Steam's 100k daily budget, leaving headroom for enrichment.
    Popular games (by current player count) get priority.
    """
    return run_async(_steam_ccu_batch())


async def _steam_ccu_batch() -> dict:
    import asyncio

    async with async_session() as session:
        from sqlalchemy import select

        result = await session.execute(
            select(ExternalID.external_id)
            .select_from(Game)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .join(ExternalID, and_(
                ExternalID.entity_id == Game.media_item_id,
                ExternalID.entity_type == "media_item",
                ExternalID.provider == "steam",
            ))
            .where(
                MediaItem.media_type == "game",
            )
            .order_by(Game.current_players.desc().nulls_first())
            .limit(250)
        )
        app_ids = [int(row[0]) for row in result.all()]

    if not app_ids:
        return {"apps_checked": 0, "updated": 0}

    redis = await get_redis()
    provider = SteamProvider(redis)

    sem = asyncio.Semaphore(10)

    async def _fetch_one(app_id: int) -> tuple[int, dict | None]:
        async with sem:
            try:
                data = await provider.get_current_players(app_id)
                return app_id, data
            except Exception:
                return app_id, None

    results = await asyncio.gather(*[_fetch_one(aid) for aid in app_ids])

    async with async_session() as session:
        from sqlalchemy import select

        subq = (
            select(ExternalID.entity_id)
            .where(
                ExternalID.provider == "steam",
                ExternalID.entity_type == "media_item",
                ExternalID.external_id.in_([str(x) for x in app_ids]),
            )
        ).subquery()
        games = await session.scalars(
            select(Game)
            .options(joinedload(Game._external_ids))
            .where(Game.media_item_id.in_(select(subq)))
        )
        games_by_app = {}
        for g in games:
            if g.steam_app_id is not None:
                games_by_app[g.steam_app_id] = g

        updated = 0
        cleared = 0
        for app_id, data in results:
            if data is None:
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


@app.task(name="maintenance.catalog_hydration")
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
    "music": {"provider": "musicbrainz", "task": "sync.musicbrainz.album"},
}


async def _catalog_hydration() -> dict:
    now = datetime.now(timezone.utc)
    provider_map = _MEDIA_SYNC_MAP

    async with async_session() as session:
        # Stale items (past their next_sync_at) or never-synced stubs (Plex-created, completeness <= 0.2)
        result = await session.execute(
            select(MediaItem.id, MediaItem.media_type, ExternalID.external_id)
            .join(ExternalID, ExternalID.media_item_id == MediaItem.id)
            .where(
                or_(
                    and_(
                        MediaItem.next_sync_at.isnot(None),
                        MediaItem.next_sync_at < now,
                    ),
                    and_(
                        MediaItem.next_sync_at.is_(None),
                        MediaItem.completeness_score <= 0.2,
                    ),
                ),
                or_(
                    and_(
                        MediaItem.media_type.in_(["movie", "show"]),
                        ExternalID.provider == "tmdb",
                    ),
                    and_(
                        MediaItem.media_type == "game",
                        ExternalID.provider == "igdb",
                    ),
                    and_(
                        MediaItem.media_type == "music",
                        ExternalID.provider == "musicbrainz",
                    ),
                ),
            )
            .order_by(MediaItem.next_sync_at.asc().nullsfirst())
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


@app.task(name="maintenance.progress_summary")
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
        fast_depth = await r.llen("reactive-fast") or 0
        user_depth = await r.llen("reactive-user") or 0
        control_depth = await r.llen("maintain") or 0
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
        music_count = await session.scalar(
            select(func.count()).select_from(MediaItem).where(MediaItem.media_type == "music")
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
        db_music=music_count or 0,
        db_people=person_count or 0,
        fast_queue=fast_depth,
        user_queue=user_depth,
        control_queue=control_depth,
    )

    return {
        "counters": counters,
        "db_movies": movie_count,
        "db_shows": show_count,
        "db_games": game_count,
        "db_music": music_count,
        "db_people": person_count,
        "fast_queue": fast_depth,
        "user_queue": user_depth,
        "control_queue": control_depth,
    }


@app.task(name="maintenance.backfill_embeddings")
def backfill_embeddings() -> dict:
    """Enqueue batch embedding generation for items that lack one.

    Runs periodically as a safety net until all items have embeddings.
    Items are grouped into batches for efficient inference.
    """
    return run_async(_backfill_embeddings())


_BACKFILL_BATCH_SIZE = 10


async def _backfill_embeddings() -> dict:
    from sqlalchemy import select

    from otix.domain.media import MediaItem

    async with async_session() as session:
        result = await session.execute(
            select(MediaItem.id)
            .where(MediaItem.embedding.is_(None))
            .limit(1000)
        )
        rows = result.all()

        all_ids = [row[0] for row in rows]
        enqueued = 0
        for i in range(0, len(all_ids), _BACKFILL_BATCH_SIZE):
            batch = all_ids[i:i + _BACKFILL_BATCH_SIZE]
            app.send_task("embedding.generate_batch", args=[batch])
            enqueued += len(batch)

        if enqueued:
            logger.info("backfill_embeddings: enqueued batch tasks", count=enqueued, batches=len(all_ids) // _BACKFILL_BATCH_SIZE + 1)

    return {"enqueued": enqueued}


@app.task(name="maintenance.dedupe_people")
def dedupe_people() -> dict:
    """Merge duplicate Person records (same case-insensitive name).

    Runs safe dedup (at least one record has zero external IDs) followed by
    cross-provider dedup (wikidata_id, name+birthday, non-overlapping providers).
    Can be triggered manually or scheduled via Celery beat.
    """
    return run_async(_dedupe_people())


async def _dedupe_people() -> dict:
    from otix.services.person_service import dedupe_all_people, find_all_cross_provider_duplicates, merge_person

    async with async_session() as session:
        # Phase 1: Safe dedup (name-based, at least one has no external IDs)
        safe_result = await dedupe_all_people(session, cross_provider=False)

        # Phase 2: Cross-provider dedup (wikidata, name+birthday, non-overlapping)
        cross_result = await dedupe_all_people(session, cross_provider=True)

    return {
        "safe": safe_result,
        "cross_provider": cross_result,
        "total_merged": safe_result["people_merged"] + cross_result["people_merged"],
        "total_credits": safe_result["credits_reassigned"] + cross_result["credits_reassigned"],
    }


@app.task(name="maintenance.backfill_person_wikidata")
def backfill_person_wikidata() -> dict:
    """Backfill wikidata_id on Person records that have TMDB or MusicBrainz IDs.

    Fetches person/artist details from TMDB and MusicBrainz APIs, extracts
    wikidata_id, and stores it on the Person record. After backfill, the
    cross-provider dedup can merge records that now share a wikidata_id.
    """
    return run_async(_backfill_person_wikidata())


async def _backfill_person_wikidata() -> dict:
    from otix.providers.tmdb.client import TMDBProvider
    from otix.providers.tmdb.transformer import to_person
    from otix.providers.musicbrainz.client import MusicBrainzProvider
    from otix.providers.musicbrainz.transformer import extract_wikidata_id

    redis = await get_redis()
    tmdb = TMDBProvider(redis)
    mb = MusicBrainzProvider(redis)

    async with async_session() as session:
        # Backfill TMDB people (with tmdb_id but no wikidata_id)
        has_tmdb = sa_exists().where(
            ExternalID.provider == "tmdb",
            ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        no_wikidata = sa_exists().where(
            ExternalID.provider == "wikidata",
            ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        tmdb_people = list((await session.scalars(
            select(Person)
            .options(joinedload(Person._external_ids))
            .where(
                has_tmdb,
                not_(no_wikidata),
            )
            .limit(100)
        )).unique().all())

        tmdb_filled = 0
        for person in tmdb_people:
            try:
                raw = await tmdb.get_person(person.tmdb_id)
                wiki_id = (
                    raw.get("external_ids", {}).get("wikidata_id")
                    if isinstance(raw.get("external_ids"), dict)
                    else None
                )
                if wiki_id:
                    # Check for conflict
                    conflict = await session.scalar(
                        select(Person)
                        .join(ExternalID, and_(
                            ExternalID.entity_id == Person.id,
                            ExternalID.entity_type == "person",
                            ExternalID.provider == "wikidata",
                            ExternalID.external_id == str(wiki_id),
                        ))
                        .where(
                            Person.id != person.id,
                        )
                    )
                    if conflict is not None:
                        logger.info(
                            "wikidata_backfill_conflict",
                            person_id=person.id,
                            person_name=person.name,
                            wikidata_id=wiki_id,
                            conflict_id=conflict.id,
                            conflict_name=conflict.name,
                        )
                        continue
                    person.wikidata_id = wiki_id
                    tmdb_filled += 1
            except Exception:
                logger.debug("wikidata_backfill_tmdb_failed", tmdb_id=person.tmdb_id)

        if tmdb_filled:
            await session.commit()
            logger.info("wikidata_backfill_tmdb_complete", filled=tmdb_filled)

        # Backfill MusicBrainz artists (with MBID but no wikidata_id)
        has_mb = sa_exists().where(
            ExternalID.provider == "musicbrainz",
            ExternalID.entity_type == "person",
            ExternalID.entity_id == Person.id,
        )
        mb_people = list((await session.scalars(
            select(Person)
            .options(joinedload(Person._external_ids))
            .where(
                has_mb,
                not_(no_wikidata),
            )
            .limit(50)
        )).unique().all())

        mb_filled = 0
        for person in mb_people:
            try:
                raw = await mb.get_artist(person.musicbrainz_artist_id)
                relations = raw.get("relations")
                wiki_id = extract_wikidata_id(relations if isinstance(relations, list) else None)
                if wiki_id:
                    conflict = await session.scalar(
                        select(Person)
                        .join(ExternalID, and_(
                            ExternalID.entity_id == Person.id,
                            ExternalID.entity_type == "person",
                            ExternalID.provider == "wikidata",
                            ExternalID.external_id == str(wiki_id),
                        ))
                        .where(
                            Person.id != person.id,
                        )
                    )
                    if conflict is not None:
                        logger.info(
                            "wikidata_backfill_mb_conflict",
                            person_id=person.id,
                            person_name=person.name,
                            wikidata_id=wiki_id,
                            conflict_id=conflict.id,
                            conflict_name=conflict.name,
                        )
                        continue
                    person.wikidata_id = wiki_id
                    mb_filled += 1
            except Exception:
                logger.debug("wikidata_backfill_mb_failed", mbid=person.musicbrainz_artist_id)

        if mb_filled:
            await session.commit()
            logger.info("wikidata_backfill_mb_complete", filled=mb_filled)

    return {"tmdb_filled": tmdb_filled, "mb_filled": mb_filled}


@app.task(name="maintenance.search_gap_report")
def search_gap_report() -> dict:
    """Analyze search_logs for zero/low-result queries from the last 24h."""
    return run_async(_search_gap_report())


async def _search_gap_report() -> dict:
    from sqlalchemy import func, select, text

    from otix.domain.search_log import SearchLog
    from otix.infrastructure.database import async_session

    cutoff = func.now() - text("INTERVAL '24 hours'")

    async with async_session() as session:
        # Top 20 zero-result queries (bot searches only)
        zero_q = (
            select(
                SearchLog.query,
                SearchLog.media_type,
                func.count().label("search_count"),
            )
            .where(
                SearchLog.result_count == 0,
                SearchLog.created_at >= cutoff,
                SearchLog.is_bot.is_(True),
            )
            .group_by(SearchLog.query, SearchLog.media_type)
            .order_by(func.count().desc())
            .limit(20)
        )
        zero_result = (await session.execute(zero_q)).all()

        # Top 20 popular queries (all users)
        popular_q = (
            select(
                SearchLog.query,
                SearchLog.media_type,
                func.count().label("search_count"),
                func.avg(SearchLog.result_count).label("avg_results"),
            )
            .where(SearchLog.created_at >= cutoff)
            .group_by(SearchLog.query, SearchLog.media_type)
            .order_by(func.count().desc())
            .limit(20)
        )
        popular = (await session.execute(popular_q)).all()

        # Aggregate counts
        total_searches = await session.scalar(
            select(func.count()).select_from(SearchLog).where(
                SearchLog.created_at >= cutoff
            )
        )
        zero_total = await session.scalar(
            select(func.count()).select_from(SearchLog).where(
                SearchLog.result_count == 0,
                SearchLog.created_at >= cutoff,
            )
        )
        backfill_total = await session.scalar(
            select(func.count()).select_from(SearchLog).where(
                SearchLog.backfill_triggered.is_(True),
                SearchLog.created_at >= cutoff,
            )
        )

    report = {
        "window_hours": 24,
        "total_searches": total_searches or 0,
        "zero_result_searches": zero_total or 0,
        "backfill_triggers": backfill_total or 0,
        "zero_result_queries": [dict(r._mapping) for r in zero_result[:10]],
        "popular_queries": [dict(r._mapping) for r in popular[:10]],
    }

    logger.info("search_gap_report", **report)
    return report


# ── Periodic VACUUM ──────────────────────────────────────────────────────


@app.task(name="maintenance.vacuum_high_churn_tables")
def vacuum_high_churn_tables() -> dict:
    """Vacuum tables that experience heavy DELETE+INSERT churn from sync tasks.

    Runs every hour to keep dead tuple ratios low. Uses VACUUM (not FULL)
    so the tables remain available for reads/writes.
    """
    import asyncio

    from otix.infrastructure.database import async_session

    HIGH_CHURN_TABLES = [
        "media_credits",
        "external_ids",
        "external_ratings",
        "media_genres",
        "media_releases",
        "media_videos",
        "media_platforms",
    ]

    async def _vacuum():
        async with async_session() as session:
            for table in HIGH_CHURN_TABLES:
                await session.execute(text(f"VACUUM ANALYZE {table}"))
            await session.commit()
        return {"vacuumed": HIGH_CHURN_TABLES}

    loop = asyncio.get_event_loop()
    result = loop.run_until_complete(_vacuum())
    logger.info("periodic_vacuum_complete", tables=HIGH_CHURN_TABLES)
    return result
