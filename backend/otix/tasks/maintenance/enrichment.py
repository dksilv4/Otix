# TODO: Review this file
"""Enrichment tasks: fanart, OMDb, production companies, content/game age
ratings, Steam, SteamGridDB, and Last.fm."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import and_, or_, select
from sqlalchemy import exists as sa_exists

from otix.domain.asset import ExternalRating, MediaAsset
from otix.domain.list import UserList, UserListItem
from otix.domain.media import Album, ExternalID, Game, MediaItem
from otix.domain.people import MediaCredit, Person
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async

logger = structlog.get_logger()


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
        cutoff = datetime.now(UTC) - timedelta(hours=48)

        # Subquery: media_item_ids that already have at least one Fanart asset
        enriched = (select(MediaAsset.media_item_id).where(MediaAsset.provider == "fanart").distinct()).subquery()

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
        app.send_task("sync.fanart.enrich", args=["movie", mid])
        movies_enqueued += 1

    for mid in wl_show_ids:
        app.send_task("sync.fanart.enrich", args=["show", mid])
        shows_enqueued += 1

    for mid in wl_music_ids:
        app.send_task("sync.fanart.enrich", args=["music", mid])
        music_enqueued += 1

    # Already-enriched watchlist items, skip in the main loop
    wl_seen_by_type = {
        "movie": set(wl_movie_ids),
        "show": set(wl_show_ids),
        "music": set(wl_music_ids),
    }

    for media_item_id, _ in movie_rows:
        if media_item_id not in wl_seen_by_type["movie"]:
            app.send_task("sync.fanart.enrich", args=["movie", media_item_id])
            movies_enqueued += 1

    for media_item_id, _ in show_rows:
        if media_item_id not in wl_seen_by_type["show"]:
            app.send_task("sync.fanart.enrich", args=["show", media_item_id])
            shows_enqueued += 1

    for (media_item_id,) in music_rows:
        if media_item_id not in wl_seen_by_type["music"]:
            app.send_task("sync.fanart.enrich", args=["music", media_item_id])
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
        cutoff = datetime.now(UTC) - timedelta(hours=48)

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
        rated = (select(MediaRelease.media_item_id).distinct()).subquery()

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
        rated = (select(MediaRelease.media_item_id).distinct()).subquery()

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
        cutoff = datetime.now(UTC) - timedelta(hours=24)

        # Games with steam_app_id, synced recently, not enriched in last hour
        query = (
            select(Game.media_item_id, ExternalID.external_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .join(
                ExternalID,
                and_(
                    ExternalID.entity_id == Game.media_item_id,
                    ExternalID.entity_type == "media_item",
                    ExternalID.provider == "steam",
                ),
            )
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
            .join(
                ExternalID,
                and_(
                    ExternalID.entity_id == Game.media_item_id,
                    ExternalID.entity_type == "media_item",
                    ExternalID.provider == "steam",
                ),
            )
            .where(
                MediaItem.media_type == "game",
                missing,
            )
            .limit(30)
        )
        steam_rows = steam_result.all()

        # Non-Steam games (store IDs via ExternalID)
        store_providers = {
            "epic",
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
        other_result = await session.execute(
            select(Game.media_item_id, ExternalID.provider, ExternalID.external_id)
            .join(MediaItem, MediaItem.id == Game.media_item_id)
            .join(
                ExternalID,
                and_(
                    ExternalID.entity_id == Game.media_item_id,
                    ExternalID.entity_type == "media_item",
                    ExternalID.provider.in_(store_providers),
                ),
            )
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
            .outerjoin(
                ExternalID,
                and_(
                    ExternalID.entity_id == Game.media_item_id,
                    ExternalID.entity_type == "media_item",
                    ExternalID.provider.in_(list(store_providers | {"steam"})),
                ),
            )
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
        cutoff = datetime.now(UTC) - timedelta(hours=48)

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
