# TODO: Review this file
"""TMDB provider tasks: movie, show, person, collection, company, keyword sync."""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import UTC, datetime

import structlog
from sqlalchemy import delete, func, select

from otix.domain.asset import ExternalRating
from otix.domain.collection import Collection
from otix.domain.company import Company
from otix.domain.genre import Keyword
from otix.domain.media import Episode, ExternalID, MediaItem, Season, Show
from otix.domain.people import Person
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.metrics import SYNC_ENTITIES_TOTAL, track_entity_duration
from otix.lib.progress import incr as _progress_incr
from otix.providers.tmdb.client import TMDBProvider
from otix.providers.tmdb.hydrator import TMDBHydrator
from otix.providers.tmdb.transformer import _image_url, _parse_date, to_movie, to_person, to_show
from otix.services.external_id_service import ExternalIDService

from ._common import (
    check_fast_queue_backlog,
    compute_content_hash,
    compute_next_sync_at,
    enqueue_list_items,
    filter_missing_ids,
    filter_stale_ids,
    get_last_change_check,
    set_last_change_check,
)

logger = structlog.get_logger()


# ── Task definitions ───────────────────────────────────────────────────


@app.task(
    name="sync.tmdb.movie",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def sync_tmdb_movie_task(self, tmdb_id: int, force: bool = False) -> dict | None:
    """Sync a single TMDB movie: fetch → hash-check → transform → upsert → hydrate."""
    return run_async(_sync_tmdb_media(tmdb_id, "movie", force))


@app.task(
    name="sync.tmdb.show",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def sync_tmdb_show_task(self, tmdb_id: int, force: bool = False) -> dict | None:
    """Sync a single TMDB show with seasons and episodes."""
    return run_async(_sync_tmdb_media(tmdb_id, "show", force))


@app.task(
    name="sync.tmdb.person",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def sync_tmdb_person_task(self, tmdb_id: int, force: bool = False) -> dict | None:
    """Sync a single TMDB person: fetch → hash-check → transform → upsert."""
    return run_async(_sync_tmdb_person(tmdb_id, force))


@app.task(
    name="sync.tmdb.discover_list",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def sync_tmdb_discover_list_task(self, list_type: str, media_type: str, pages: int = 3) -> dict:
    """Sync a TMDB discover list. Enqueues individual movie/show tasks."""
    return run_async(_sync_tmdb_discover_list(list_type, media_type, pages))


@app.task(
    name="sync.tmdb.changes",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
)
def sync_tmdb_changes_task(self, entity_type: str, lookback_hours: int = 24) -> dict:
    """Fetch changed IDs from TMDB and enqueue individual syncs."""
    return run_async(_sync_tmdb_changes(entity_type, lookback_hours))


@app.task(
    name="sync.tmdb.collection",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def sync_tmdb_collection_task(self, tmdb_id: int) -> dict | None:
    """Fetch a TMDB collection and upsert the Collection row."""
    return run_async(_sync_tmdb_collection(tmdb_id))


@app.task(
    name="sync.tmdb.company",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def sync_tmdb_company_task(self, tmdb_id: int, entity_type: str = "company") -> dict | None:
    """Fetch a TMDB company or network and upsert the Company row.

    entity_type is "company" for production companies (hits /company/{id})
    or "network" for TV networks (hits /network/{id}).
    """
    return run_async(_sync_tmdb_company(tmdb_id, entity_type))


@app.task(
    name="sync.tmdb.keyword",
    bind=True,
    max_retries=2,
    default_retry_delay=10,
    autoretry_for=(Exception,),
)
def sync_tmdb_keyword_task(self, tmdb_id: int) -> dict | None:
    """Fetch a TMDB keyword and upsert the Keyword row."""
    return run_async(_sync_tmdb_keyword(tmdb_id))


# ── Helpers ────────────────────────────────────────────────────────────


async def _resolve_external_id(session, tmdb_id: str, media_type: str) -> tuple[MediaItem | None, ExternalID | None]:
    """Look up media_item by TMDB ID, filtering strictly by entity_type and media_type.

    TMDB reuses numeric IDs across entity types (movie 350, person 350,
    company 350 are all different things). Without the entity_type filter,
    we'd resolve a movie to a person's ExternalID row and create a duplicate.
    """
    ext_id = await session.scalar(
        select(ExternalID)
        .join(MediaItem, ExternalID.entity_id == MediaItem.id)
        .where(
            ExternalID.provider == "tmdb",
            ExternalID.external_id == tmdb_id,
            ExternalID.entity_type == "media_item",
            MediaItem.media_type == media_type,
        )
    )
    if ext_id is None:
        # Backward compat: check legacy stubs with NULL entity_type.
        # Filter by media_type to prevent matching stubs of other entity types.
        ext_id = await session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "tmdb",
                ExternalID.external_id == tmdb_id,
                ExternalID.entity_type.is_(None),
                ExternalID.media_type == media_type,
            )
        )
    if ext_id is None:
        return None, None
    entity_id = ext_id.entity_id or ext_id.media_item_id
    if entity_id is None:
        return None, ext_id
    media_item = await session.get(MediaItem, entity_id)
    return media_item, ext_id


# ── Individual entity sync ─────────────────────────────────────────────


async def _sync_tmdb_media(
    tmdb_id: int, media_type: str, force: bool = False, *, enqueue_enrichment: bool = True
) -> dict | None:
    """Sync a TMDB movie or show: fetch → hash-check → transform → upsert → hydrate.

    When ``enqueue_enrichment=False`` the follow-up fanart/omdb tasks are NOT
    fired asynchronously; the caller (full-hydration orchestrator) awaits them
    inline so the item is fully processed before this returns.
    """
    with track_entity_duration("tmdb", media_type):
        async with async_session() as session:
            tmdb_id_str = str(tmdb_id)
            media_item, ext_id = await _resolve_external_id(session, tmdb_id_str, media_type)

            if not force and media_item is not None and media_item.next_sync_at is not None:
                if media_item.next_sync_at > datetime.now(UTC):
                    logger.debug("skipping media not due for sync", tmdb_id=tmdb_id, media_type=media_type)
                    return None

            redis = await get_redis()
            provider = TMDBProvider(redis)
            hydrator = TMDBHydrator(provider, session)

            if media_type == "movie":
                raw = await provider.get_movie(tmdb_id)
            else:
                raw = await provider.get_show(tmdb_id)

            content_hash = compute_content_hash(raw)

            if ext_id is not None and not force and ext_id.content_hash == content_hash:
                skip = True
                if media_type == "show" and media_item is not None:
                    season_count = await session.scalar(
                        select(func.count()).select_from(Season).where(Season.show_id == media_item.id)
                    )
                    if season_count and season_count > 0:
                        episode_count = await session.scalar(
                            select(func.count()).select_from(Episode).join(Season).where(Season.show_id == media_item.id)
                        )
                        if not episode_count:
                            logger.info("hash matched but episodes missing, forcing re-sync",
                                tmdb_id=tmdb_id, season_count=season_count)
                            skip = False
                if skip:
                    ext_id.hash_match_count += 1
                    media_item.next_sync_at = compute_next_sync_at(media_type, raw, ext_id.hash_match_count)
                    await session.commit()
                    logger.debug("hash matched, skipping processing", tmdb_id=tmdb_id, media_type=media_type, match_count=ext_id.hash_match_count)
                    return None

            # ── Transform & upsert ──────────────────────────────────
            new_seasons: list[Season] = []
            total_episodes = 0

            if media_type == "movie":
                movie = to_movie(raw)
                item = movie.media_item

                if media_item is not None:
                    # Asset URLs are resolved at query time (asset_selection);
                    # admin overrides are checked there. Merge the fresh metadata
                    # without touching any URL columns.
                    item.id = media_item.id
                    movie.media_item_id = media_item.id
                    managed_item = await session.merge(item)
                    item = managed_item
                    movie = managed_item.movie
                else:
                    session.add(item)
                    await session.flush()
                    eid_svc = ExternalIDService(session)
                    ext_id = await eid_svc.upsert(
                        "tmdb", tmdb_id_str,
                        "media_item", item.id,
                    )
                    if raw.get("adult", False):
                        ext_id.is_adult = True
                    session.add(movie)
            else:
                show = to_show(raw)
                item = show.media_item

                if media_item is not None:
                    from otix.services.embedding_service import is_embedding_stale

                    old_overview = media_item.overview
                    media_item.title = item.title
                    media_item.overview = item.overview
                    if is_embedding_stale(old_overview, media_item.overview):
                        media_item.embedding = None
                    media_item.slug = item.slug
                    media_item.release_date = item.release_date
                    media_item.popularity = item.popularity
                    media_item.original_language = item.original_language
                    media_item.is_adult = item.is_adult

                    existing_show = await session.get(Show, media_item.id)
                    if existing_show is not None:
                        existing_show.status = show.status
                        existing_show.first_air_date = show.first_air_date
                        existing_show.last_air_date = show.last_air_date
                        existing_show.number_of_seasons = show.number_of_seasons
                        existing_show.number_of_episodes = show.number_of_episodes
                        existing_show.is_anime = show.is_anime
                    else:
                        show.media_item_id = media_item.id
                        show.media_item = media_item
                        session.add(show)

                    await session.execute(delete(Season).where(Season.show_id == media_item.id))
                    await session.flush()

                    for season_data in raw.get("seasons", []):
                        sn = season_data.get("season_number", 0)
                        if sn <= 0:
                            continue
                        s = Season(
                            season_number=sn, name=season_data.get("name"),
                            overview=season_data.get("overview"),
                            poster_url=_image_url(season_data.get("poster_path")),
                            show_id=media_item.id,
                        )
                        session.add(s)
                        new_seasons.append(s)
                    await session.flush()
                    item = media_item
                else:
                    session.add(item)
                    await session.flush()
                    eid_svc = ExternalIDService(session)
                    ext_id = await eid_svc.upsert(
                        "tmdb", tmdb_id_str,
                        "media_item", item.id,
                    )
                    if raw.get("adult", False):
                        ext_id.is_adult = True
                    _seasons = list(show.seasons)
                    session.add(show)
                    await session.flush()
                    for s in _seasons:
                        s.show_id = show.media_item_id
                        session.add(s)
                    await session.flush()
                    new_seasons = _seasons

            await session.flush()

            # ── Common hydration ────────────────────────────────────
            await hydrator.hydrate_genres(item, raw)
            await hydrator.hydrate_keywords(item, raw)
            await hydrator.hydrate_credits(item, raw)
            await hydrator.hydrate_images(item, raw)
            await hydrator.hydrate_videos(item, raw)
            await hydrator.hydrate_releases(item, raw)
            if media_type == "show":
                await hydrator.hydrate_content_ratings(item, raw)
            await hydrator.hydrate_ratings(item, raw)
            await hydrator.hydrate_external_ids(item, raw)
            await hydrator.hydrate_involved_companies(item, raw)

            # ── Media-type-specific hydration ───────────────────────
            if media_type == "movie":
                await hydrator.hydrate_collection(movie, raw)
            else:
                # Fetch all seasons' episodes in parallel, then process sequentially
                async def _fetch_season(season):
                    try:
                        raw = await provider.get_season(tmdb_id, season.season_number)
                        return (season, raw)
                    except Exception:
                        logger.warning("failed to fetch season episodes",
                            tmdb_id=tmdb_id, season_number=season.season_number, exc_info=True)
                        return (season, None)

                season_results = await asyncio.gather(*[_fetch_season(s) for s in new_seasons])

                episode_votes: list[tuple[Episode, float, int | None]] = []
                for season, season_raw in season_results:
                    if season_raw is None:
                        continue
                    for ep_data in season_raw.get("episodes", []):
                        ep = Episode(
                            season_id=season.id,
                            episode_number=ep_data.get("episode_number", 0),
                            name=ep_data.get("name"),
                            overview=ep_data.get("overview"),
                            runtime=ep_data.get("runtime"),
                            air_date=_parse_date(ep_data.get("air_date")),
                            still_url=_image_url(ep_data.get("still_path")),
                        )
                        session.add(ep)
                        total_episodes += 1
                        vote_average = ep_data.get("vote_average")
                        if vote_average is not None and vote_average > 0:
                            episode_votes.append((ep, float(vote_average), ep_data.get("vote_count")))

                await session.flush()

                for ep, vote_avg, vote_cnt in episode_votes:
                    existing_rating = await session.scalar(
                        select(ExternalRating).where(
                            ExternalRating.episode_id == ep.id,
                            ExternalRating.provider == "tmdb",
                        )
                    )
                    if existing_rating:
                        existing_rating.score = vote_avg
                        existing_rating.vote_count = vote_cnt
                    else:
                        session.add(ExternalRating(
                            episode_id=ep.id, provider="tmdb",
                            score=vote_avg, max_score=10.0, vote_count=vote_cnt,
                        ))

            # ── Watch providers (JustWatch via TMDB) ────────────────
            try:
                if media_type == "movie":
                    watch_raw = await provider.get_movie_watch_providers(tmdb_id)
                else:
                    watch_raw = await provider.get_show_watch_providers(tmdb_id)
                await hydrator.hydrate_watch_providers(item, watch_raw)
            except Exception:
                logger.warning("failed to fetch watch providers",
                    tmdb_id=tmdb_id, media_type=media_type, exc_info=True)

            # ── Finalize ────────────────────────────────────────────
            ext_id.content_hash = content_hash
            ext_id.hash_match_count = 0
            item.synced_at = datetime.now(UTC)
            item.next_sync_at = compute_next_sync_at(media_type, raw, 0)
            await session.commit()

            if new_seasons and media_type == "show":
                await _notify_new_season_watchers(item)

            logger.info("tmdb media synced",
                title=item.title, media_type=media_type, otix_id=item.id, tmdb_id=tmdb_id,
            )
            SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type=media_type, status="success")
            await _progress_incr(f"{media_type}_synced")
            if enqueue_enrichment:
                app.send_task("sync.fanart.enrich", args=[media_type, item.id])
                app.send_task("sync.omdb.ratings", args=[item.id])
            return {"otix_id": item.id, "title": item.title, "tmdb_id": tmdb_id}


async def _notify_new_season_watchers(item: MediaItem) -> None:
    from sqlalchemy import text

    from otix.infrastructure.database import async_session as async_session_factory
    from otix.services.notification_service import NotificationService

    async with async_session_factory() as notif_session:
        query = text("""
            SELECT umi.user_id
            FROM user_media_interactions umi
            WHERE umi.media_item_id = :media_item_id
              AND umi.interaction_type = 'watched'
              AND NOT EXISTS (
                  SELECT 1 FROM notifications n
                  WHERE n.user_id = umi.user_id
                    AND n.type = 'new_season'
                    AND n.metadata_json->>'media_item_id' = :media_item_id_str
              )
        """)
        result = await notif_session.execute(query, {
            "media_item_id": item.id,
            "media_item_id_str": item.id,
        })
        rows = result.fetchall()
        if not rows:
            logger.debug("no watched users for new season notification",
                media_item_id=item.id, title=item.title)
            return

        svc = NotificationService(notif_session)
        for row in rows:
            await svc.create(
                user_id=row[0],
                type_="new_season",
                title="New Season Available",
                body=f"{item.title} has a new season",
                metadata_json={
                    "media_item_id": item.id,
                    "media_title": item.title,
                    "media_slug": item.slug,
                    "media_type": "show",
                },
            )

        await notif_session.commit()
        logger.info("notified watched users about new season",
            media_item_id=item.id, title=item.title, user_count=len(rows))


async def _sync_tmdb_person(tmdb_id: int, force: bool = False) -> dict | None:
    with track_entity_duration("tmdb", "person"):
        async with async_session() as session:
            eid_svc = ExternalIDService(session)
            entity_id = await eid_svc.find_entity_id_by_type("tmdb", str(tmdb_id), "person")
            existing = await session.get(Person, entity_id) if entity_id else None

            if not force and existing is not None and existing.next_sync_at is not None:
                if existing.next_sync_at > datetime.now(UTC):
                    logger.debug("skipping person not due for sync", tmdb_id=tmdb_id)
                    return None

            redis = await get_redis()
            provider = TMDBProvider(redis)
            hydrator = TMDBHydrator(provider, session)

            raw = await provider.get_person(tmdb_id)
            content_hash = compute_content_hash(raw)

            if existing is not None and existing.content_hash == content_hash:
                existing.hash_match_count += 1
                existing.next_sync_at = compute_next_sync_at("person", raw, existing.hash_match_count)
                await session.commit()
                logger.debug("hash matched, skipping person processing", tmdb_id=tmdb_id, match_count=existing.hash_match_count)
                return None

            # Extract external ID values from raw before creating Person
            raw_imdb_id = raw.get("imdb_id") or None
            raw_wikidata_raw = raw.get("external_ids")
            raw_wikidata_id = raw_wikidata_raw.get("wikidata_id") if isinstance(raw_wikidata_raw, dict) else None

            person = to_person(raw)
            now = datetime.now(UTC)

            if existing is not None:
                person.id = existing.id
                person = await session.merge(person)
                await session.flush()
                # Set external IDs via service on the merged record
                if raw_imdb_id:
                    dup_entity_id = await eid_svc.find_entity_id_by_type("imdb", raw_imdb_id, "person")
                    if dup_entity_id is None or dup_entity_id == str(existing.id):
                        await eid_svc.upsert("imdb", raw_imdb_id, "person", existing.id)
                if raw_wikidata_id:
                    await eid_svc.upsert("wikidata", raw_wikidata_id, "person", existing.id)
            else:
                # Check for cross-provider match via wikidata_id
                if raw_wikidata_id:
                    wiki_entity_id = await eid_svc.find_entity_id_by_type("wikidata", raw_wikidata_id, "person")
                    if wiki_entity_id is not None:
                        wiki_match = await session.get(Person, wiki_entity_id)
                        if wiki_match is not None:
                            # Merge into existing record from another provider
                            wiki_match.photo_url = wiki_match.photo_url or person.photo_url
                            wiki_match.biography = wiki_match.biography or person.biography
                            wiki_match.birthday = wiki_match.birthday or person.birthday
                            wiki_match.deathday = wiki_match.deathday or person.deathday
                            wiki_match.place_of_birth = wiki_match.place_of_birth or person.place_of_birth
                            await eid_svc.upsert("tmdb", str(tmdb_id), "person", wiki_match.id)
                            if raw_imdb_id:
                                dup_entity_id = await eid_svc.find_entity_id_by_type("imdb", raw_imdb_id, "person")
                                if dup_entity_id is None or dup_entity_id == wiki_match.id:
                                    await eid_svc.upsert("imdb", raw_imdb_id, "person", wiki_match.id)
                            person = wiki_match
                        else:
                            session.add(person)
                            await session.flush()
                            await eid_svc.upsert("tmdb", str(tmdb_id), "person", person.id)
                            if raw_imdb_id:
                                await eid_svc.upsert("imdb", raw_imdb_id, "person", person.id)
                            if raw_wikidata_id:
                                await eid_svc.upsert("wikidata", raw_wikidata_id, "person", person.id)
                    else:
                        session.add(person)
                        await session.flush()
                        await eid_svc.upsert("tmdb", str(tmdb_id), "person", person.id)
                        if raw_imdb_id:
                            await eid_svc.upsert("imdb", raw_imdb_id, "person", person.id)
                        if raw_wikidata_id:
                            await eid_svc.upsert("wikidata", raw_wikidata_id, "person", person.id)
                else:
                    session.add(person)
                    await session.flush()
                    await eid_svc.upsert("tmdb", str(tmdb_id), "person", person.id)
                    if raw_imdb_id:
                        await eid_svc.upsert("imdb", raw_imdb_id, "person", person.id)

            await hydrator.hydrate_person_images(person, raw)

            person.content_hash = content_hash
            person.hash_match_count = 0
            person.synced_at = now
            person.next_sync_at = compute_next_sync_at("person", raw, 0)
            await session.commit()

            logger.info("tmdb person synced",
                name=person.name, media_type="person", otix_id=person.id, tmdb_id=tmdb_id,
                checklist={"images": "done", "filmography": "enqueued"},
            )
            SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type="person", status="success")
            await _progress_incr("person_synced")

            credits_result = await _sync_person_credits(tmdb_id, provider)
            return {"otix_id": person.id, "name": person.name, "tmdb_id": tmdb_id, "credits": credits_result}


async def _sync_person_credits(tmdb_id: int, provider: TMDBProvider) -> dict:
    _, throttled = await check_fast_queue_backlog()
    if throttled:
        logger.debug("skipping person credits cascade due to fast queue backlog", tmdb_id=tmdb_id)
        return {"status": "throttled", "movies_enqueued": 0, "shows_enqueued": 0}

    raw = await provider.get_person_combined_credits(tmdb_id)

    movie_ids: set[str] = set()
    show_ids: set[str] = set()

    for credit in raw.get("cast", []) + raw.get("crew", []):
        mid = credit.get("id")
        if not mid:
            continue
        media_type = credit.get("media_type", "")
        if media_type == "movie":
            movie_ids.add(str(mid))
        elif media_type == "tv":
            show_ids.add(str(mid))

    movie_enqueued = movie_skipped = 0
    show_enqueued = show_skipped = 0

    if movie_ids:
        movie_enqueued, movie_skipped = await enqueue_list_items("tmdb", "movie", movie_ids)
    if show_ids:
        show_enqueued, show_skipped = await enqueue_list_items("tmdb", "show", show_ids)

    total_enqueued = movie_enqueued + show_enqueued
    if total_enqueued:
        logger.info("person credits cascade enqueued",
            tmdb_id=tmdb_id,
            movies_enqueued=movie_enqueued, movies_skipped=movie_skipped,
            shows_enqueued=show_enqueued, shows_skipped=show_skipped,
        )

    return {
        "movies_enqueued": movie_enqueued, "movies_skipped": movie_skipped,
        "shows_enqueued": show_enqueued, "shows_skipped": show_skipped,
    }


# ── Discover list orchestrator ─────────────────────────────────────────

_DISCOVER_DISPATCH: dict[tuple[str, str], tuple[str, dict]] = {
    ("popular", "movie"): ("get_movie_popular", {}),
    ("popular", "show"): ("get_show_popular", {}),
    ("top_rated", "movie"): ("get_movie_top_rated", {}),
    ("top_rated", "show"): ("get_show_top_rated", {}),
    ("upcoming", "movie"): ("get_movie_upcoming", {}),
    ("now_playing", "movie"): ("get_movie_now_playing", {}),
    ("on_the_air", "show"): ("get_show_on_the_air", {}),
    ("airing_today", "show"): ("get_show_airing_today", {}),
    ("trending", "movie"): ("get_trending", {"media_type": "movie", "time_window": "week"}),
    ("trending", "show"): ("get_trending", {"media_type": "tv", "time_window": "week"}),
}


async def _sync_tmdb_discover_list(list_type: str, media_type: str, pages: int) -> dict:
    redis = await get_redis()
    provider = TMDBProvider(redis)

    method_name, extra_kwargs = _DISCOVER_DISPATCH[(list_type, media_type)]
    method = getattr(provider, method_name)

    coros = [method(page=p, **extra_kwargs) for p in range(1, pages + 1)]
    page_results = await asyncio.gather(*coros)

    all_ids: set[str] = set()
    for data in page_results:
        for item in data.get("results", []):
            all_ids.add(str(item["id"]))

    enqueued, skipped = await enqueue_list_items("tmdb", media_type, all_ids)

    logger.info("discover sync enqueued",
        list_type=list_type, media_type=media_type, pages=pages,
        tasks_enqueued=enqueued, tasks_skipped=skipped,
    )
    return {"list_type": list_type, "media_type": media_type, "tasks_enqueued": enqueued, "tasks_skipped": skipped}


# ── Change-based sync orchestrator ─────────────────────────────────────


async def _sync_tmdb_changes(entity_type: str, lookback_hours: int) -> dict:
    if entity_type == "person":
        _, throttled = await check_fast_queue_backlog()
        if throttled:
            logger.info("skipping person changes sync due to fast queue backlog", entity_type=entity_type)
            return {"entity_type": entity_type, "status": "throttled", "enqueued": 0}

    redis = await get_redis()
    provider = TMDBProvider(redis)

    last_check = await get_last_change_check("tmdb")
    start_date = last_check.strftime("%Y-%m-%d")
    end_date = datetime.now(UTC).strftime("%Y-%m-%d")

    if entity_type == "movie":
        changes_method = provider.get_movie_changes
        task_name = "sync.tmdb.movie"
    elif entity_type == "show":
        changes_method = provider.get_show_changes
        task_name = "sync.tmdb.show"
    else:
        changes_method = provider.get_person_changes
        task_name = "sync.tmdb.person"

    first_page = await changes_method(start_date, end_date, page=1)
    total_pages = first_page.get("total_pages", 1)

    if total_pages > 1:
        coros = [changes_method(start_date, end_date, page=p) for p in range(2, total_pages + 1)]
        remaining = await asyncio.gather(*coros)
    else:
        remaining = []

    all_pages = [first_page] + list(remaining)
    all_changed_ids: set[str] = set()
    for data in all_pages:
        for item in data.get("results", []):
            all_changed_ids.add(str(item["id"]))

    now = datetime.now(UTC)

    if not all_changed_ids:
        await set_last_change_check("tmdb", now)
        logger.info("change sync — no changed IDs", entity_type=entity_type)
        return {"entity_type": entity_type, "changed_ids": 0, "tasks_enqueued": 0}

    # Filter to IDs we actually have in our catalog
    missing_ids = await filter_missing_ids("tmdb", all_changed_ids)
    our_ids = all_changed_ids - missing_ids

    if not our_ids:
        await set_last_change_check("tmdb", now)
        logger.info("change sync — no matching items in catalog",
            entity_type=entity_type, all_changed=len(all_changed_ids),
        )
        return {"entity_type": entity_type, "changed_ids": len(all_changed_ids), "our_ids": 0, "tasks_enqueued": 0}

    # Skip items synced recently (not yet stale)
    stale_ids = await filter_stale_ids("tmdb", our_ids)

    enqueued = 0
    for tmdb_id in stale_ids:
        app.send_task(task_name, args=[int(tmdb_id)])
        enqueued += 1

    await set_last_change_check("tmdb", now)

    logger.info("change sync completed",
        entity_type=entity_type, start_date=start_date, end_date=end_date,
        total_pages=total_pages, all_changed=len(all_changed_ids),
        our_ids=len(our_ids), skipped_stale=len(our_ids) - len(stale_ids),
        tasks_enqueued=enqueued,
    )
    return {
        "entity_type": entity_type, "start_date": start_date, "end_date": end_date,
        "total_pages": total_pages, "changed_ids": len(all_changed_ids),
        "our_ids": len(our_ids), "skipped_stale": len(our_ids) - len(stale_ids),
        "tasks_enqueued": enqueued,
    }


# ── Collection / company / keyword sync ──────────────────────────────────


async def _sync_tmdb_collection(tmdb_id: int) -> dict | None:
    """Fetch a TMDB collection, upsert with content hash dedup."""
    async with async_session() as session:
        redis = await get_redis()
        provider = TMDBProvider(redis)

        try:
            raw = await provider.get_collection(tmdb_id)
        except Exception:
            logger.warning("failed to fetch collection", tmdb_id=tmdb_id, exc_info=True)
            return None

        coll_hash = hashlib.sha256(
            json.dumps(raw, sort_keys=True, default=str).encode()
        ).hexdigest()

        eid_svc = ExternalIDService(session)
        entity_id = await eid_svc.find_entity_id_by_type("tmdb", str(tmdb_id), "collection")
        collection = await session.get(Collection, entity_id) if entity_id else None

        if collection is not None and collection.content_hash == coll_hash:
            logger.debug("collection hash matched, skipping", tmdb_id=tmdb_id)
            return None

        if collection is None:
            collection = Collection()
            session.add(collection)
            await session.flush()
            collection.tmdb_id = tmdb_id

        collection.name = raw.get("name", "")
        collection.overview = raw.get("overview")
        collection.poster_url = _tmdb_image(raw.get("poster_path"))
        collection.backdrop_url = _tmdb_image(raw.get("backdrop_path"))
        collection.content_hash = coll_hash

        await session.commit()

        logger.info("tmdb collection synced", name=collection.name, tmdb_id=tmdb_id)
        SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type="collection", status="success")
        return {"otix_id": collection.id, "name": collection.name, "tmdb_id": tmdb_id}


async def _sync_tmdb_company(tmdb_id: int, entity_type: str = "company") -> dict | None:
    """Fetch a TMDB company or network and upsert the Company row."""
    async with async_session() as session:
        redis = await get_redis()
        provider = TMDBProvider(redis)
        hydrator = TMDBHydrator(provider, session)

        try:
            if entity_type == "network":
                raw = await provider.get_network(tmdb_id)
            else:
                raw = await provider.get_company(tmdb_id)
        except Exception:
            logger.warning("failed to fetch company/network", tmdb_id=tmdb_id, entity_type=entity_type, exc_info=True)
            return None

        eid_svc = ExternalIDService(session)
        entity_id = await eid_svc.find_entity_id_by_type("tmdb", str(tmdb_id), "company")
        company = await session.get(Company, entity_id) if entity_id else None

        if company is None:
            company = Company()
            session.add(company)
            await session.flush()
            company.tmdb_id = tmdb_id

        await hydrator.hydrate_company(company, raw)
        await session.commit()

        logger.info("tmdb company synced", name=company.name, tmdb_id=tmdb_id, entity_type=entity_type)
        SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type="company", status="success")
        return {"otix_id": company.id, "name": company.name, "tmdb_id": tmdb_id}


async def _sync_tmdb_keyword(tmdb_id: int) -> dict | None:
    """Fetch a TMDB keyword and upsert the Keyword row."""
    async with async_session() as session:
        redis = await get_redis()
        provider = TMDBProvider(redis)
        hydrator = TMDBHydrator(provider, session)

        try:
            raw = await provider.get_keyword(tmdb_id)
        except Exception:
            logger.warning("failed to fetch keyword", tmdb_id=tmdb_id, exc_info=True)
            return None

        eid_svc = ExternalIDService(session)
        entity_id = await eid_svc.find_entity_id_by_type("tmdb", str(tmdb_id), "keyword")
        keyword = await session.get(Keyword, entity_id) if entity_id else None

        if keyword is None:
            keyword = Keyword()
            session.add(keyword)
            await session.flush()
            keyword.tmdb_id = tmdb_id

        await hydrator.hydrate_keyword(keyword, raw)
        await session.commit()

        logger.info("tmdb keyword synced", name=keyword.name, tmdb_id=tmdb_id)
        SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type="keyword", status="success")
        return {"otix_id": keyword.id, "name": keyword.name, "tmdb_id": tmdb_id}


# ── Production companies hydration ─────────────────────────────────────


@app.task(
    name="sync.tmdb.hydrate_production_companies",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_tmdb_hydrate_production_companies_task(self, media_item_id: str) -> dict | None:
    """Hydrate involved companies with production=True for a single media item."""
    return run_async(_hydrate_production_companies(media_item_id))


async def _hydrate_production_companies(media_item_id: str) -> dict | None:
    async with async_session() as session:
        ext_id = await session.scalar(
            select(ExternalID).where(
                ExternalID.media_item_id == media_item_id,
                ExternalID.provider == "tmdb",
            )
        )
        if ext_id is None:
            logger.warning("no tmdb external id for media item", media_item_id=media_item_id)
            return None

        item = await session.get(MediaItem, media_item_id)
        if item is None or item.media_type not in ("movie", "show"):
            return None

        redis = await get_redis()
        provider = TMDBProvider(redis)
        hydrator = TMDBHydrator(provider, session)

        try:
            if item.media_type == "movie":
                raw = await provider.get_movie(int(ext_id.external_id))
            else:
                raw = await provider.get_show(int(ext_id.external_id))
        except Exception:
            logger.exception("failed to fetch tmdb data for production companies", media_item_id=media_item_id)
            raise

        await hydrator.hydrate_involved_companies(item, raw)
        await session.commit()

        # Invalidate media detail caches so fresh data is served immediately
        from otix.infrastructure.redis import get_redis as _get_redis
        _redis = await _get_redis()
        cache_pattern = f"media:detail:{media_item_id}:*"
        keys = [key async for key in _redis.scan_iter(match=cache_pattern, count=100)]
        if keys:
            await _redis.delete(*keys)

        logger.info("production companies hydrated", media_item_id=media_item_id, title=item.title)
        return {"media_item_id": media_item_id, "title": item.title}


# ── Content ratings hydration (TV shows) ──────────────────────────────


@app.task(
    name="sync.tmdb.hydrate_content_ratings",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
)
def sync_tmdb_hydrate_content_ratings_task(self, media_item_id: str) -> dict | None:
    """Hydrate TV content ratings (TV-G, TV-14, etc.) for a single show."""
    return run_async(_hydrate_content_ratings(media_item_id))


async def _hydrate_content_ratings(media_item_id: str) -> dict | None:
    async with async_session() as session:
        ext_id = await session.scalar(
            select(ExternalID).where(
                ExternalID.media_item_id == media_item_id,
                ExternalID.provider == "tmdb",
            )
        )
        if ext_id is None:
            return None

        item = await session.get(MediaItem, media_item_id)
        if item is None or item.media_type != "show":
            return None

        redis = await get_redis()
        provider = TMDBProvider(redis)
        hydrator = TMDBHydrator(provider, session)

        try:
            raw = await provider.get_show_content_ratings(int(ext_id.external_id))
        except Exception:
            logger.exception("failed to fetch content ratings", media_item_id=media_item_id)
            raise

        # Wrap in the format hydrate_content_ratings expects
        await hydrator.hydrate_content_ratings(item, {"content_ratings": raw})
        await session.commit()

        # Invalidate media detail caches
        from otix.infrastructure.redis import get_redis as _get_redis
        _redis = await _get_redis()
        cache_pattern = f"media:detail:{media_item_id}:*"
        keys = [key async for key in _redis.scan_iter(match=cache_pattern, count=100)]
        if keys:
            await _redis.delete(*keys)

        logger.info("content ratings hydrated", media_item_id=media_item_id, title=item.title)
        return {"media_item_id": media_item_id, "title": item.title}


def _tmdb_image(path: str | None, size: str = "w500") -> str | None:
    if not path:
        return None
    return f"https://image.tmdb.org/t/p/{size}{path}"
