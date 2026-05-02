"""Provider sync tasks.

Each task wraps an async pipeline in asyncio.run(). Celery workers are
synchronous, but the provider pipeline is fully async internally.

Sync guard: content_hash comparison prevents re-processing when TMDB data
hasn't changed. hash_match_count escalates next_sync_at on repeated matches.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import select

from otix.domain.media import ExternalID, Game, MediaItem
from otix.domain.people import Person
from otix.domain.sync import ProviderState
from otix.infrastructure.celery import app
from otix.infrastructure.config import settings
from otix.infrastructure.database import async_session_factory
from otix.infrastructure.redis import get_redis
from otix.lib.concurrency import run_async
from otix.lib.metrics import SYNC_ENTITIES_TOTAL, track_entity_duration
from otix.lib.types import JSONValue
from otix.providers.fanart.client import FanartProvider
from otix.providers.fanart.hydrator import FanartHydrator
from otix.providers.igdb.client import IGDBProvider
from otix.providers.igdb.hydrator import IGDBHydrator
from otix.providers.igdb.transformer import to_game
from otix.providers.omdb.client import OMDbProvider
from otix.providers.omdb.hydrator import OMDbHydrator
from otix.providers.steam.client import SteamProvider
from otix.providers.steam.hydrator import SteamHydrator
from otix.providers.tmdb.client import TMDBProvider
from otix.providers.tmdb.hydrator import TMDBHydrator
from otix.providers.tmdb.transformer import to_movie, to_person, to_show

logger = structlog.get_logger()


# ── Hash helpers ───────────────────────────────────────────────────────


def _compute_hash(raw: dict) -> str:
    """SHA256 of provider response, excluding volatile fields that change on every fetch."""
    stable = {k: v for k, v in raw.items() if k not in ("popularity", "hypes")}
    return hashlib.sha256(
        json.dumps(stable, sort_keys=True, default=str).encode()
    ).hexdigest()


def _compute_next_sync_at(entity_type: str, raw: dict, hash_match_count: int = 0) -> datetime:
    """Compute when this item should next be synced based on its lifecycle.

    Movies:
      - Released within 90 days → 12h
      - Released within 2 years → 7d
      - Older → 30d

    Shows:
      - Airing (Returning Series / In Production / Planned) → 6h
      - Ended/Canceled within 2 years → 7d
      - Ended/Canceled older → 30d

    People:
      - Popular (popularity > 5) → 7d
      - Others → 30d

    Escalation: base interval * 2^hash_match_count, capped at max_escalation_days.
    """
    now = datetime.now(timezone.utc)

    if entity_type == "movie":
        release_str = raw.get("release_date", "")
        if release_str:
            try:
                release_date = datetime.strptime(release_str, "%Y-%m-%d").date()
                age_days = (now.date() - release_date).days
            except (ValueError, TypeError):
                age_days = 9999
        else:
            age_days = 9999

        if age_days <= 90:
            base_hours = 12
        elif age_days <= 730:
            base_hours = 24 * 7
        else:
            base_hours = 24 * 30
    elif entity_type == "show":
        status = raw.get("status", "")
        if status in ("Returning Series", "In Production", "Planned"):
            base_hours = 6
        elif status in ("Ended", "Canceled"):
            last_air_str = raw.get("last_air_date", "")
            if last_air_str:
                try:
                    last_air = datetime.strptime(last_air_str, "%Y-%m-%d").date()
                    age_days = (now.date() - last_air).days
                except (ValueError, TypeError):
                    age_days = 9999
            else:
                age_days = 9999

            if age_days <= 730:
                base_hours = 24 * 7
            else:
                base_hours = 24 * 30
        else:
            base_hours = 24 * 7
    else:  # person
        popularity = raw.get("popularity", 0) or 0
        base_hours = 24 * 7 if popularity > 5 else 24 * 30

    escalation = 2 ** min(hash_match_count, 5)
    max_hours = settings.tmdb_sync_max_escalation_days * 24
    hours = min(base_hours * escalation, max_hours)

    return now + timedelta(hours=hours)


# ── ProviderState helpers ─────────────────────────────────────────────


async def _get_last_change_check(provider: str) -> datetime:
    """Get the last time we checked for changes, or default to 24h ago."""
    async with async_session_factory() as session:
        state = await session.get(ProviderState, provider)
        if state and state.last_sync_at:
            return state.last_sync_at
        return datetime.now(timezone.utc) - timedelta(hours=24)


async def _set_last_change_check(provider: str, dt: datetime) -> None:
    """Update the last change check timestamp."""
    async with async_session_factory() as session:
        state = await session.get(ProviderState, provider)
        if state:
            state.last_sync_at = dt
        else:
            session.add(ProviderState(provider=provider, last_sync_at=dt))
        await session.commit()


# ── Task definitions ───────────────────────────────────────────────────


@app.task(
    name="sync.tmdb.movie",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    queue="fast",
)
def sync_tmdb_movie_task(self, tmdb_id: int, priority: int = 5, force: bool = False) -> dict | None:
    """Sync a single TMDB movie: fetch → hash-check → transform → upsert → hydrate."""
    return run_async(_sync_tmdb_movie(tmdb_id, force))


@app.task(
    name="sync.tmdb.show",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    queue="fast",
)
def sync_tmdb_show_task(self, tmdb_id: int, priority: int = 5, force: bool = False) -> dict | None:
    """Sync a single TMDB show with seasons and episodes."""
    return run_async(_sync_tmdb_show(tmdb_id, force))


@app.task(
    name="sync.tmdb.person",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    queue="fast",
)
def sync_tmdb_person_task(self, tmdb_id: int, priority: int = 5, force: bool = False) -> dict | None:
    """Sync a single TMDB person: fetch → hash-check → transform → upsert."""
    return run_async(_sync_tmdb_person(tmdb_id, force))


# ── Discover list tasks ────────────────────────────────────────────────


@app.task(
    name="sync.tmdb.popular_movies",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_popular_movies_task(self, pages: int = 5) -> dict:
    """Sync popular movies (first N pages). Enqueues individual movie tasks."""
    return run_async(_sync_tmdb_discover_list("popular", "movie", pages))


@app.task(
    name="sync.tmdb.popular_shows",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_popular_shows_task(self, pages: int = 5) -> dict:
    """Sync popular shows (first N pages). Enqueues individual show tasks."""
    return run_async(_sync_tmdb_discover_list("popular", "show", pages))


@app.task(
    name="sync.tmdb.trending_movies",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_trending_movies_task(self, pages: int = 3) -> dict:
    """Sync trending movies (week). Enqueues individual movie tasks."""
    return run_async(_sync_tmdb_discover_list("trending", "movie", pages))


@app.task(
    name="sync.tmdb.trending_shows",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_trending_shows_task(self, pages: int = 3) -> dict:
    """Sync trending shows (week). Enqueues individual show tasks."""
    return run_async(_sync_tmdb_discover_list("trending", "show", pages))


@app.task(
    name="sync.tmdb.top_rated_movies",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_top_rated_movies_task(self, pages: int = 3) -> dict:
    """Sync top-rated movies. Enqueues individual movie tasks."""
    return run_async(_sync_tmdb_discover_list("top_rated", "movie", pages))


@app.task(
    name="sync.tmdb.top_rated_shows",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_top_rated_shows_task(self, pages: int = 3) -> dict:
    """Sync top-rated shows. Enqueues individual show tasks."""
    return run_async(_sync_tmdb_discover_list("top_rated", "show", pages))


@app.task(
    name="sync.tmdb.upcoming_movies",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_upcoming_movies_task(self, pages: int = 3) -> dict:
    """Sync upcoming movies. Enqueues individual movie tasks."""
    return run_async(_sync_tmdb_discover_list("upcoming", "movie", pages))


@app.task(
    name="sync.tmdb.now_playing_movies",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_now_playing_movies_task(self, pages: int = 3) -> dict:
    """Sync now-playing movies. Enqueues individual movie tasks."""
    return run_async(_sync_tmdb_discover_list("now_playing", "movie", pages))


@app.task(
    name="sync.tmdb.on_the_air_shows",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_on_the_air_shows_task(self, pages: int = 3) -> dict:
    """Sync on-the-air shows. Enqueues individual show tasks."""
    return run_async(_sync_tmdb_discover_list("on_the_air", "show", pages))


@app.task(
    name="sync.tmdb.airing_today_shows",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="fast",
)
def sync_tmdb_airing_today_shows_task(self, pages: int = 3) -> dict:
    """Sync shows airing today. Enqueues individual show tasks."""
    return run_async(_sync_tmdb_discover_list("airing_today", "show", pages))


# ── Change-based sync tasks ────────────────────────────────────────────


@app.task(
    name="sync.tmdb.movie_changes",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="fast",
)
def sync_tmdb_movie_changes_task(self, lookback_hours: int = 24) -> dict:
    """Fetch changed movie IDs from TMDB and enqueue individual syncs."""
    return run_async(_sync_tmdb_changes("movie", lookback_hours))


@app.task(
    name="sync.tmdb.show_changes",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="fast",
)
def sync_tmdb_show_changes_task(self, lookback_hours: int = 24) -> dict:
    """Fetch changed show IDs from TMDB and enqueue individual syncs."""
    return run_async(_sync_tmdb_changes("show", lookback_hours))


@app.task(
    name="sync.tmdb.person_changes",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="fast",
)
def sync_tmdb_person_changes_task(self, lookback_hours: int = 24) -> dict:
    """Fetch changed person IDs from TMDB and enqueue individual syncs."""
    return run_async(_sync_tmdb_changes("person", lookback_hours))


# ── Individual entity sync ─────────────────────────────────────────────


async def _resolve_external_id(session, tmdb_id: str) -> tuple[MediaItem | None, ExternalID | None]:
    """Return (media_item, external_id) for a given TMDB id, or (None, None)."""
    ext_id = await session.scalar(
        select(ExternalID).where(
            ExternalID.provider == "tmdb",
            ExternalID.external_id == tmdb_id,
        )
    )
    if ext_id is None:
        return None, None
    media_item = await session.get(MediaItem, ext_id.media_item_id)
    return media_item, ext_id


async def _sync_tmdb_movie(tmdb_id: int, force: bool = False) -> dict | None:
    with track_entity_duration("tmdb", "movie"):
        async with async_session_factory() as session:
            tmdb_id_str = str(tmdb_id)
            media_item, ext_id = await _resolve_external_id(session, tmdb_id_str)

            if not force and media_item is not None and media_item.next_sync_at is not None:
                if media_item.next_sync_at > datetime.now(timezone.utc):
                    logger.debug("skipping movie not due for sync", tmdb_id=tmdb_id)
                    return None

            redis = await get_redis()
            provider = TMDBProvider(redis)
            hydrator = TMDBHydrator(provider, session)

            raw = await provider.get_movie(tmdb_id)
            content_hash = _compute_hash(raw)

            # Hash matched — escalate and skip processing
            if ext_id is not None and ext_id.content_hash == content_hash:
                ext_id.hash_match_count += 1
                media_item.next_sync_at = _compute_next_sync_at(
                    "movie", raw, ext_id.hash_match_count
                )
                await session.commit()
                logger.debug(
                    "hash matched, skipping processing",
                    tmdb_id=tmdb_id,
                    match_count=ext_id.hash_match_count,
                )
                return None

            # Process: transform → upsert → hydrate
            movie = to_movie(raw)
            item = movie.media_item

            if media_item is not None:
                item.id = media_item.id
                await session.merge(item)
            else:
                session.add(item)
                await session.flush()
                ext_id = ExternalID(
                    provider="tmdb",
                    external_id=tmdb_id_str,
                    media_item_id=item.id,
                )
                session.add(ext_id)

            session.add(movie)

            await hydrator.hydrate_genres(item, raw)
            await hydrator.hydrate_credits(item, raw)
            await hydrator.hydrate_images(item, raw)
            await hydrator.hydrate_videos(item, raw)
            await hydrator.hydrate_releases(item, raw)
            await hydrator.hydrate_ratings(item, raw)
            await hydrator.hydrate_external_ids(item, raw)
            await hydrator.hydrate_collection(movie, raw)

            ext_id.content_hash = content_hash
            ext_id.hash_match_count = 0
            item.synced_at = datetime.now(timezone.utc)
            item.next_sync_at = _compute_next_sync_at("movie", raw, 0)
            await session.commit()

            logger.info("tmdb movie synced", tmdb_id=tmdb_id, otix_id=item.id)
            SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type="movie", status="success")
            return {"otix_id": item.id, "title": item.title, "tmdb_id": tmdb_id}


async def _sync_tmdb_show(tmdb_id: int, force: bool = False) -> dict | None:
    with track_entity_duration("tmdb", "show"):
        async with async_session_factory() as session:
            tmdb_id_str = str(tmdb_id)
            media_item, ext_id = await _resolve_external_id(session, tmdb_id_str)

            if not force and media_item is not None and media_item.next_sync_at is not None:
                if media_item.next_sync_at > datetime.now(timezone.utc):
                    logger.debug("skipping show not due for sync", tmdb_id=tmdb_id)
                    return None

            redis = await get_redis()
            provider = TMDBProvider(redis)
            hydrator = TMDBHydrator(provider, session)

            raw = await provider.get_show(tmdb_id)
            content_hash = _compute_hash(raw)

            # Hash matched — escalate and skip processing
            if ext_id is not None and ext_id.content_hash == content_hash:
                ext_id.hash_match_count += 1
                media_item.next_sync_at = _compute_next_sync_at(
                    "show", raw, ext_id.hash_match_count
                )
                await session.commit()
                logger.debug(
                    "hash matched, skipping processing",
                    tmdb_id=tmdb_id,
                    match_count=ext_id.hash_match_count,
                )
                return None

            # Process: transform → upsert → hydrate
            show = to_show(raw)
            item = show.media_item

            if media_item is not None:
                item.id = media_item.id
                await session.merge(item)
            else:
                session.add(item)
                await session.flush()
                ext_id = ExternalID(
                    provider="tmdb",
                    external_id=tmdb_id_str,
                    media_item_id=item.id,
                )
                session.add(ext_id)

            session.add(show)

            await hydrator.hydrate_genres(item, raw)
            await hydrator.hydrate_credits(item, raw)
            await hydrator.hydrate_images(item, raw)
            await hydrator.hydrate_videos(item, raw)
            await hydrator.hydrate_releases(item, raw)
            await hydrator.hydrate_ratings(item, raw)
            await hydrator.hydrate_external_ids(item, raw)

            ext_id.content_hash = content_hash
            ext_id.hash_match_count = 0
            item.synced_at = datetime.now(timezone.utc)
            item.next_sync_at = _compute_next_sync_at("show", raw, 0)
            await session.commit()

            logger.info("tmdb show synced", tmdb_id=tmdb_id, otix_id=item.id)
            SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type="show", status="success")
            return {"otix_id": item.id, "title": item.title, "tmdb_id": tmdb_id}


async def _sync_tmdb_person(tmdb_id: int, force: bool = False) -> dict | None:
    """Sync a single TMDB person: fetch → hash-check → transform → hydrate → upsert.

    After successful sync, cascades to enqueue media syncs for the person's
    filmography via combined_credits.
    """
    with track_entity_duration("tmdb", "person"):
        async with async_session_factory() as session:
            existing = await session.scalar(
                select(Person).where(Person.tmdb_id == tmdb_id)
            )

            if not force and existing is not None and existing.next_sync_at is not None:
                if existing.next_sync_at > datetime.now(timezone.utc):
                    logger.debug("skipping person not due for sync", tmdb_id=tmdb_id)
                    return None

            redis = await get_redis()
            provider = TMDBProvider(redis)
            hydrator = TMDBHydrator(provider, session)

            raw = await provider.get_person(tmdb_id)
            content_hash = _compute_hash(raw)

            # Hash matched — escalate and skip processing
            if existing is not None and existing.content_hash == content_hash:
                existing.hash_match_count += 1
                existing.next_sync_at = _compute_next_sync_at(
                    "person", raw, existing.hash_match_count
                )
                await session.commit()
                logger.debug(
                    "hash matched, skipping person processing",
                    tmdb_id=tmdb_id,
                    match_count=existing.hash_match_count,
                )
                return None

            person = to_person(raw)
            now = datetime.now(timezone.utc)

            if existing is not None:
                person.id = existing.id
                person = await session.merge(person)
            else:
                session.add(person)
                await session.flush()

            await hydrator.hydrate_person_images(person, raw)

            person.content_hash = content_hash
            person.hash_match_count = 0
            person.synced_at = now
            person.next_sync_at = _compute_next_sync_at("person", raw, 0)
            await session.commit()

            logger.info("tmdb person synced", tmdb_id=tmdb_id, otix_id=person.id)
            SYNC_ENTITIES_TOTAL.inc(provider="tmdb", entity_type="person", status="success")

            # Cascade: enqueue media syncs for the person's filmography
            credits_result = await _sync_person_credits(tmdb_id, provider)

            return {
                "otix_id": person.id,
                "name": person.name,
                "tmdb_id": tmdb_id,
                "credits": credits_result,
            }


async def _sync_person_credits(tmdb_id: int, provider: TMDBProvider) -> dict:
    """Enqueue media sync tasks for a person's combined filmography.

    Fetches cast + crew credits, extracts unique movie/show IDs, filters
    stale ones via batch DB query, and enqueues individual sync tasks.
    """
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
        movie_enqueued, movie_skipped = await _enqueue_list_items("tmdb", "movie", movie_ids)
    if show_ids:
        show_enqueued, show_skipped = await _enqueue_list_items("tmdb", "show", show_ids)

    total_enqueued = movie_enqueued + show_enqueued
    if total_enqueued:
        logger.info(
            "person credits cascade enqueued",
            tmdb_id=tmdb_id,
            movies_enqueued=movie_enqueued,
            movies_skipped=movie_skipped,
            shows_enqueued=show_enqueued,
            shows_skipped=show_skipped,
        )

    return {
        "movies_enqueued": movie_enqueued,
        "movies_skipped": movie_skipped,
        "shows_enqueued": show_enqueued,
        "shows_skipped": show_skipped,
    }


# ── List-type enqueue helpers ──────────────────────────────────────────


async def _filter_stale_ids(provider: str, external_ids: set[str]) -> set[str]:
    """Return IDs where next_sync_at is in the past or unset (due for sync)."""
    if not external_ids:
        return set()

    now = datetime.now(timezone.utc)
    async with async_session_factory() as session:
        result = await session.scalars(
            select(ExternalID.external_id)
            .join(MediaItem)
            .where(
                ExternalID.provider == provider,
                ExternalID.external_id.in_(external_ids),
                MediaItem.next_sync_at > now,
            )
        )
        fresh = {r for r in result}
    return external_ids - fresh


async def _enqueue_list_items(
    provider: str, media_type: str, external_ids: set[str]
) -> tuple[int, int]:
    """Enqueue individual sync tasks for stale items.

    Returns (enqueued, skipped).
    """
    stale_ids = await _filter_stale_ids(provider, external_ids)
    task_name = f"sync.{provider}.{media_type}"
    enqueued = 0
    for ext_id in stale_ids:
        app.send_task(task_name, args=[int(ext_id) if ext_id.isdigit() else ext_id])
        enqueued += 1

    skipped = len(external_ids) - enqueued
    return enqueued, skipped


# ── Discover list orchestrator ─────────────────────────────────────────

# Map (list_type, media_type) → (provider_method_name, extra_kwargs)
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
    """Generic discover list sync — fetches pages, enqueues individual tasks."""
    redis = await get_redis()
    provider = TMDBProvider(redis)

    method_name, extra_kwargs = _DISCOVER_DISPATCH[(list_type, media_type)]
    method = getattr(provider, method_name)

    coros = [
        method(page=p, **extra_kwargs)
        for p in range(1, pages + 1)
    ]
    page_results = await asyncio.gather(*coros)

    all_ids: set[str] = set()
    for data in page_results:
        for item in data.get("results", []):
            all_ids.add(str(item["id"]))

    enqueued, skipped = await _enqueue_list_items("tmdb", media_type, all_ids)

    logger.info(
        "discover sync enqueued",
        list_type=list_type,
        media_type=media_type,
        pages=pages,
        tasks_enqueued=enqueued,
        tasks_skipped=skipped,
    )
    return {
        "list_type": list_type,
        "media_type": media_type,
        "tasks_enqueued": enqueued,
        "tasks_skipped": skipped,
    }


# ── Change-based sync orchestrator ─────────────────────────────────────


async def _sync_tmdb_changes(entity_type: str, lookback_hours: int) -> dict:
    """Fetch changed IDs from TMDB changes endpoint and enqueue individual syncs.

    Unlike discover lists, change-based sync enqueues ALL changed IDs without
    freshness filtering — the individual tasks already guard via next_sync_at
    and content_hash.
    """
    redis = await get_redis()
    provider = TMDBProvider(redis)

    last_check = await _get_last_change_check("tmdb")
    start_date = last_check.strftime("%Y-%m-%d")
    end_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Map entity_type to changes method and task name
    if entity_type == "movie":
        changes_method = provider.get_movie_changes
        task_name = "sync.tmdb.movie"
    elif entity_type == "show":
        changes_method = provider.get_show_changes
        task_name = "sync.tmdb.show"
    else:
        changes_method = provider.get_person_changes
        task_name = "sync.tmdb.person"

    # Fetch first page to get total_pages
    first_page = await changes_method(start_date, end_date, page=1)
    total_pages = first_page.get("total_pages", 1)

    # Fetch remaining pages in parallel
    if total_pages > 1:
        coros = [
            changes_method(start_date, end_date, page=p)
            for p in range(2, total_pages + 1)
        ]
        remaining = await asyncio.gather(*coros)
    else:
        remaining = []

    # Collect all changed IDs
    all_pages = [first_page] + list(remaining)
    all_ids: set[str] = set()
    for data in all_pages:
        for item in data.get("results", []):
            all_ids.add(str(item["id"]))

    # Enqueue all changed IDs (no freshness filter — changes mean re-check)
    enqueued = 0
    for tmdb_id in all_ids:
        app.send_task(task_name, args=[int(tmdb_id)])
        enqueued += 1

    # Update the last check timestamp
    now = datetime.now(timezone.utc)
    await _set_last_change_check("tmdb", now)

    logger.info(
        "change sync completed",
        entity_type=entity_type,
        start_date=start_date,
        end_date=end_date,
        total_pages=total_pages,
        changed_ids=len(all_ids),
        tasks_enqueued=enqueued,
    )
    return {
        "entity_type": entity_type,
        "start_date": start_date,
        "end_date": end_date,
        "total_pages": total_pages,
        "changed_ids": len(all_ids),
        "tasks_enqueued": enqueued,
    }


# ── Fanart enrichment tasks ──────────────────────────────────────────────


@app.task(
    name="sync.fanart.movie",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    queue="slow",
)
def sync_fanart_movie_task(self, media_item_id: str) -> dict | None:
    """Fetch Fanart images for a movie and store as MediaAsset rows."""
    return run_async(_sync_fanart_movie(media_item_id))


@app.task(
    name="sync.fanart.show",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    queue="slow",
)
def sync_fanart_show_task(self, media_item_id: str) -> dict | None:
    """Fetch Fanart images for a show and store as MediaAsset rows."""
    return run_async(_sync_fanart_show(media_item_id))


async def _sync_fanart_movie(media_item_id: str) -> dict | None:
    async with async_session_factory() as session:
        media_item = await session.get(MediaItem, media_item_id)
        if media_item is None:
            return None

        redis = await get_redis()
        provider = FanartProvider(redis)
        hydrator = FanartHydrator(provider, session)

        added = await hydrator.hydrate_movie_images(media_item)
        await session.commit()

        if added:
            logger.info("fanart movie images added", otix_id=media_item_id)
        return {"otix_id": media_item_id, "added": added}


async def _sync_fanart_show(media_item_id: str) -> dict | None:
    async with async_session_factory() as session:
        media_item = await session.get(MediaItem, media_item_id)
        if media_item is None:
            return None

        redis = await get_redis()
        provider = FanartProvider(redis)
        hydrator = FanartHydrator(provider, session)

        added = await hydrator.hydrate_show_images(media_item)
        await session.commit()

        if added:
            logger.info("fanart show images added", otix_id=media_item_id)
        return {"otix_id": media_item_id, "added": added}


@app.task(
    name="sync.fanart.game",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    queue="slow",
)
def sync_fanart_game_task(self, media_item_id: str) -> dict | None:
    """Fetch Fanart images for a game and store as MediaAsset rows."""
    return run_async(_sync_fanart_game(media_item_id))


async def _sync_fanart_game(media_item_id: str) -> dict | None:
    async with async_session_factory() as session:
        media_item = await session.get(MediaItem, media_item_id)
        if media_item is None:
            return None

        redis = await get_redis()
        provider = FanartProvider(redis)
        hydrator = FanartHydrator(provider, session)

        added = await hydrator.hydrate_game_images(media_item)
        await session.commit()

        if added:
            logger.info("fanart game images added", otix_id=media_item_id)
        return {"otix_id": media_item_id, "added": added}


# ── OMDb enrichment tasks ──────────────────────────────────────────────


@app.task(
    name="sync.omdb.ratings",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    autoretry_for=(Exception,),
    queue="slow",
)
def sync_omdb_ratings_task(self, media_item_id: str) -> dict | None:
    """Fetch OMDb ratings for a movie/show and store as ExternalRating rows."""
    return run_async(_sync_omdb_ratings(media_item_id))


async def _sync_omdb_ratings(media_item_id: str) -> dict | None:
    async with async_session_factory() as session:
        media_item = await session.get(MediaItem, media_item_id)
        if media_item is None:
            return None

        redis = await get_redis()
        provider = OMDbProvider(redis)
        hydrator = OMDbHydrator(provider, session)

        added = await hydrator.hydrate_ratings(media_item)
        await session.commit()

        if added:
            logger.info("omdb ratings updated", otix_id=media_item_id)
        return {"otix_id": media_item_id, "added": added}


# ── IGDB fields ─────────────────────────────────────────────────────────

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
    "websites.url,websites.category,"
    "videos.video_id,videos.name"
)


# ── IGDB game sync ─────────────────────────────────────────────────────


@app.task(
    name="sync.igdb.game",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    autoretry_for=(Exception,),
    queue="slow",
)
def sync_igdb_game_task(self, igdb_id: int, force: bool = False) -> dict | None:
    """Sync a single IGDB game: fetch → transform → upsert → hydrate."""
    return run_async(_sync_igdb_game(igdb_id, force))


async def _sync_igdb_game(igdb_id: int, force: bool = False) -> dict | None:
    async with async_session_factory() as session:
        igdb_id_str = str(igdb_id)

        # Check existing by IGDB external ID
        ext_id = await session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id == igdb_id_str,
            )
        )

        if ext_id is not None and not force:
            media_item = await session.get(MediaItem, ext_id.media_item_id)
            if media_item is not None and media_item.next_sync_at is not None:
                if media_item.next_sync_at > datetime.now(timezone.utc):
                    logger.debug("skipping game not due for sync", igdb_id=igdb_id)
                    return None

        redis = await get_redis()
        provider = IGDBProvider(redis)

        raw = await provider.get_game(igdb_id, GAME_FIELDS)
        if raw is None:
            logger.warning("igdb game not found", igdb_id=igdb_id)
            return None

        content_hash = _compute_hash(raw)

        # Hash matched — escalate and skip processing
        if ext_id is not None and not force and ext_id.content_hash == content_hash:
            ext_id.hash_match_count += 1
            media_item = await session.get(MediaItem, ext_id.media_item_id)
            if media_item is not None:
                media_item.next_sync_at = _compute_game_next_sync_at(raw, ext_id.hash_match_count)
            await session.commit()
            logger.debug(
                "hash matched, skipping game processing",
                igdb_id=igdb_id,
                match_count=ext_id.hash_match_count,
            )
            return None

        game = to_game(raw)
        item = game.media_item

        # Upsert MediaItem
        if ext_id is not None:
            existing = await session.get(MediaItem, ext_id.media_item_id)
            if existing is not None:
                item.id = existing.id
                await session.merge(item)
            else:
                session.add(item)
                await session.flush()
                ext_id.media_item_id = item.id
        else:
            session.add(item)
            await session.flush()
            ext_id = ExternalID(
                provider="igdb",
                external_id=igdb_id_str,
                media_item_id=item.id,
            )
            session.add(ext_id)

        # Upsert Game (shares PK with MediaItem)
        game.media_item_id = item.id
        existing_game = await session.get(Game, item.id)
        if existing_game is not None:
            game = await session.merge(game)
        else:
            session.add(game)

        # Hydrate relations
        hydrator = IGDBHydrator(provider, session)
        await hydrator.hydrate_all(item, raw)

        ext_id.content_hash = content_hash
        ext_id.hash_match_count = 0
        item.synced_at = datetime.now(timezone.utc)
        item.next_sync_at = _compute_game_next_sync_at(raw, 0)
        await session.commit()

        logger.info("igdb game synced", igdb_id=igdb_id, otix_id=item.id)
        SYNC_ENTITIES_TOTAL.inc(provider="igdb", entity_type="game", status="success")
        return {"otix_id": item.id, "title": item.title, "igdb_id": igdb_id}


def _compute_game_next_sync_at(raw: dict[str, JSONValue], hash_match_count: int = 0) -> datetime:
    """Compute when a game should next be synced.

    - Unreleased (future or no release_date) → 12h
    - Released within 90 days → 24h
    - Released within 2 years → 7d
    - Older → 30d

    Escalation: base interval * 2^hash_match_count, capped at max_escalation_days.
    """
    now = datetime.now(timezone.utc)
    ts = raw.get("first_release_date")
    if ts and isinstance(ts, (int, float)):
        try:
            release_date = datetime.fromtimestamp(float(ts), tz=timezone.utc).date()
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


# ── IGDB discover list tasks ───────────────────────────────────────────


@app.task(
    name="sync.igdb.popular_games",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="slow",
)
def sync_igdb_popular_games_task(self, limit: int = 50) -> dict:
    """Sync popular games. Enqueues individual game tasks."""
    return run_async(_sync_igdb_discover_list("popular", limit))


@app.task(
    name="sync.igdb.recent_games",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="slow",
)
def sync_igdb_recent_games_task(self, limit: int = 100) -> dict:
    """Sync recently released games. Enqueues individual game tasks."""
    return run_async(_sync_igdb_discover_list("recent", limit))


@app.task(
    name="sync.igdb.upcoming_games",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    queue="slow",
)
def sync_igdb_upcoming_games_task(self, limit: int = 100) -> dict:
    """Sync upcoming games. Enqueues individual game tasks."""
    return run_async(_sync_igdb_discover_list("upcoming", limit))


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
    enqueued, skipped = await _enqueue_list_items("igdb", "game", all_ids)

    logger.info(
        "igdb discover sync enqueued",
        list_type=list_type,
        tasks_enqueued=enqueued,
        tasks_skipped=skipped,
    )
    return {
        "list_type": list_type,
        "tasks_enqueued": enqueued,
        "tasks_skipped": skipped,
    }


# ── IGDB change-based sync ─────────────────────────────────────────────


@app.task(
    name="sync.igdb.game_changes",
    bind=True,
    max_retries=2,
    default_retry_delay=60,
    queue="slow",
)
def sync_igdb_game_changes_task(self, lookback_hours: int = 24) -> dict:
    """Fetch changed game IDs from IGDB and enqueue individual syncs."""
    return run_async(_sync_igdb_game_changes(lookback_hours))


async def _sync_igdb_game_changes(lookback_hours: int) -> dict:
    redis = await get_redis()
    provider = IGDBProvider(redis)

    start_ts = int((datetime.now(timezone.utc) - timedelta(hours=lookback_hours)).timestamp())

    all_ids: set[str] = set()
    max_pages = 10  # safety: max 1000 changed games per run

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

        # Advance cursor; break if no progress
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
        "igdb change sync completed",
        lookback_hours=lookback_hours,
        changed_ids=len(all_ids),
        tasks_enqueued=enqueued,
    )
    return {
        "changed_ids": len(all_ids),
        "tasks_enqueued": enqueued,
    }


# ── Steam enrichment tasks ────────────────────────────────────────────


@app.task(
    name="sync.steam.update_app",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
    autoretry_for=(Exception,),
    queue="fast",
)
def sync_steam_update_app_task(self, steam_app_id: int) -> dict | None:
    """Fetch Steam player counts and store data for an app."""
    return run_async(_sync_steam_update_app(steam_app_id))


async def _sync_steam_update_app(steam_app_id: int) -> dict | None:
    async with async_session_factory() as session:
        from sqlalchemy import select

        game = await session.scalar(
            select(Game).where(Game.steam_app_id == steam_app_id)
        )
        if game is None:
            logger.debug("no game found for steam app", steam_app_id=steam_app_id)
            return None

        redis = await get_redis()
        provider = SteamProvider(redis)
        hydrator = SteamHydrator(provider, session)

        await hydrator.hydrate(game)

        await session.commit()
        logger.info(
            "steam app updated",
            steam_app_id=steam_app_id,
            otix_id=game.media_item_id,
            current_players=game.current_players,
        )
        return {
            "otix_id": game.media_item_id,
            "steam_app_id": steam_app_id,
            "current_players": game.current_players,
        }
