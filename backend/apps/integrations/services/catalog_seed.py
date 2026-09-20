"""Bulk catalog-seed driver — enqueue + drain seed jobs over the sync engines.

The single-title path (an enqueued ``SyncJob`` + ``run_sync_job`` task) seeds
one external id. This module is the *bulk* counterpart that mirrors the legacy
``otix.tasks.seed.priority_seed`` / ``sync.media.drain_priority`` pair minus the
Redis priority-ZSET and the ``ExternalID``-stub backlog: here the durable
``SyncJob`` table is itself the queue, so "enqueue" = dedupe against
already-mapped rows and persist pending jobs, and "drain" = claim and run the
oldest pending jobs through ``execute_sync_job`` (which routes them to the
registered provider engine — tmdb movie/show via increments 39/40, musicbrainz
album via increment 43).

The discovery sources feed it. ``enqueue_tmdb_popular`` pages the TMDB popular
movie/show list up to a limit; ``enqueue_igdb_popular`` asks the IGDB client for
the most-rated games (the game-kind source); ``enqueue_tmdb_daily`` is the
full-catalog source — it downloads TMDB's daily ``movie_ids`` / ``tv_series_ids``
ID export from files.tmdb.org (today, falling back to yesterday) and enqueues
every id the catalog does not already map. All dedupe against already-mapped
rows before persisting pending jobs. ``run_daily_tmdb_import`` also runs the
upstream-deletion scan (increment 52): after the enqueue passes it re-downloads
each export and records every mapped tmdb id the file no longer lists as a
``TMDBDeletedID`` row, so sync never recreates an upstream-deleted title. The
task wrappers in ``apps.integrations.tasks`` drive a periodic beat schedule
(increment 48): the daily import + a ``run_pending_jobs`` backlog drain (the
drain is provider-agnostic, so igdb game jobs enqueued off popular are consumed
by the same backlog beat). SteamGrid artwork and a MusicBrainz bulk source stay
deferred (the ported inc-36/37 clients and the album engine are already wired
for future sources).
"""

from __future__ import annotations

import asyncio
import gzip
import json
import logging
import os
import tempfile
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError, transaction
from django.utils import timezone as dj_timezone

from apps.integrations.models import SyncJob
from apps.integrations.services.sync import execute_sync_job
from apps.media.models import ExternalID, MediaItem
from apps.proposals.models import TMDBDeletedID
from core.providers.igdb import IGDBProvider
from core.providers.tmdb import TMDBProvider

logger = logging.getLogger(__name__)

# Popular-list fetcher per supported TMDB media kind (maps onto the SyncJob
# ``entity_type`` the tmdb engine dispatches on).
_TMDB_POPULAR: dict[str, str] = {
    "movie": "get_movie_popular",
    "show": "get_show_popular",
}

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _mapped_ids(provider: str, external_ids: set[str]) -> set[str]:
    """Ids from *external_ids* that a catalog row already owns for *provider*."""
    return set(
        ExternalID.objects.filter(
            content_type=_media_ct(),
            provider=provider,
            external_id__in=sorted(external_ids),
        ).values_list("external_id", flat=True)
    )


def enqueue_seed_jobs(
    *,
    provider: str,
    entity_type: str,
    external_ids: Iterable[str],
    priority: int = 5,
    is_bulk: bool = True,
    parent: SyncJob | None = None,
) -> list[SyncJob]:
    """Dedupe *external_ids* and persist one pending ``SyncJob`` per unseen id.

    An id is skipped when a catalog row already owns the provider's id (an
    ``ExternalID`` mapping on the media content type — created only after a
    successful seed, so its presence means "already imported") or when a live
    (pending/running) job already targets it, so repeated catalog runs never
    double-enqueue. Completed jobs do *not* block re-enqueue: an id that was
    seeded once and is still unmapped (no ``ExternalID`` survived) is
    legitimate to seed again. Returns the newly created rows; a caller decides
    whether to dispatch them (``run_pending_jobs`` or the worker task).

    *is_bulk* and *parent* default to the catalog-source posture (bulk, no
    parent). Follow-driven fan-outs pass ``is_bulk=False`` so the engine mirrors
    the seeded title's artwork, and *parent* to tie the child jobs to the
    triggering job.
    """
    ids = {str(i).strip() for i in external_ids if str(i).strip()}
    if not ids:
        return []
    fresh = ids - _mapped_ids(provider, ids)
    if not fresh:
        return []
    live = set(
        SyncJob.objects.filter(
            provider=provider,
            entity_type=entity_type,
            external_id__in=sorted(fresh),
            status__in=("pending", "running"),
        ).values_list("external_id", flat=True)
    )
    jobs = [
        SyncJob(
            provider=provider,
            entity_type=entity_type,
            external_id=external_id,
            status="pending",
            phase="core",
            is_bulk=is_bulk,
            parent=parent,
            priority=priority,
        )
        for external_id in sorted(fresh - live)
    ]
    SyncJob.objects.bulk_create(jobs)
    return jobs


_MUSIC_ENTITY_TYPES = frozenset({"music", "album"})
_MUSIC_PROVIDERS = frozenset({"musicbrainz"})
_HYDRATED_TYPES = ("movie", "show", "game")


def ensure_catalog_job(
    provider: str,
    entity_type: str,
    external_id: str,
    *,
    priority: int = 5,
    force: bool = False,
    dispatch: bool | None = None,
) -> SyncJob | None:
    """Enqueue (or bump) one live seed/rehydrate job for a canonical provider id.

    Already-mapped ids are allowed (rehydrate). Music is rejected. A live
    pending/running job is unique; a worse priority is bumped. P0 jobs are
    dispatched immediately unless *dispatch* is False.
    """
    if entity_type in _MUSIC_ENTITY_TYPES or provider in _MUSIC_PROVIDERS:
        return None
    if entity_type not in _HYDRATED_TYPES:
        return None
    ext = str(external_id).strip()
    if not provider or not ext:
        return None
    if not force and _fresh_enough(provider, entity_type, ext):
        return None

    live = (
        SyncJob.objects.filter(
            provider=provider,
            entity_type=entity_type,
            external_id=ext,
            status__in=("pending", "running"),
        )
        .order_by("pk")
        .first()
    )
    if live is not None:
        if live.status == "pending" and live.priority > priority:
            live.priority = priority
            if force:
                live.phase = "force"
            live.save(update_fields=("priority", "phase"))
        if dispatch is True or (
            dispatch is None and live.priority <= 0 and live.status == "pending"
        ):
            _dispatch_job(live)
        return live

    job = SyncJob(
        provider=provider,
        entity_type=entity_type,
        external_id=ext,
        status="pending",
        phase="force" if force else "core",
        is_bulk=False,
        priority=priority,
    )
    try:
        with transaction.atomic():
            job.save()
    except IntegrityError:
        return ensure_catalog_job(
            provider, entity_type, ext, priority=priority, force=force, dispatch=dispatch
        )
    if dispatch is True or (dispatch is None and priority <= 0):
        _dispatch_job(job)
    return job


def _fresh_enough(provider: str, entity_type: str, external_id: str) -> bool:
    from apps.media.services.completeness import COMPLETE_THRESHOLD
    from apps.media.services.identity import find_media_id

    media_id = find_media_id(provider, external_id, entity_type)
    if media_id is None:
        return False
    media = MediaItem.objects.filter(pk=media_id).only("completeness_score", "next_sync_at").first()
    if media is None:
        return False
    if float(media.completeness_score or 0) < COMPLETE_THRESHOLD:
        return False
    if media.next_sync_at is None or media.next_sync_at <= dj_timezone.now():
        return False
    return True


def _dispatch_job(job: SyncJob) -> None:
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        return
    try:
        from apps.integrations.tasks import run_sync_job

        run_sync_job.delay(job.pk)
    except Exception:  # noqa: BLE001 - enqueue must survive a down worker
        logger.exception("could not dispatch catalog job pk=%s", job.pk)


def enqueue_due_and_incomplete(*, limit: int = 200) -> dict[str, int]:
    """Enqueue rehydrate jobs for incomplete or due movie/show/game rows."""
    from apps.media.services.completeness import COMPLETE_THRESHOLD
    from apps.media.services.identity import CANONICAL_PROVIDER

    now = dj_timezone.now()
    qs = (
        MediaItem.objects.filter(media_type__in=_HYDRATED_TYPES)
        .filter(models_q_due_or_incomplete(now, COMPLETE_THRESHOLD))
        .order_by("next_sync_at", "pk")[:limit]
    )
    enqueued = 0
    skipped = 0
    for media in qs:
        provider = CANONICAL_PROVIDER.get(media.media_type)
        if not provider:
            skipped += 1
            continue
        ext = (
            ExternalID.objects.filter(
                content_type=_media_ct(),
                object_id=media.pk,
                provider=provider,
                media_type=media.media_type,
            )
            .values_list("external_id", flat=True)
            .first()
        )
        if not ext:
            skipped += 1
            continue
        job = ensure_catalog_job(provider, media.media_type, ext, priority=4, dispatch=False)
        if job is not None:
            enqueued += 1
        else:
            skipped += 1
    return {"enqueued": enqueued, "skipped": skipped, "scanned": enqueued + skipped}


def models_q_due_or_incomplete(now, threshold):
    from django.db.models import Q

    return (
        Q(completeness_score__lt=threshold)
        | Q(next_sync_at__isnull=True)
        | Q(next_sync_at__lte=now)
    )


def drain_catalog(*, limit: int | None = None, rehydrate_limit: int | None = None) -> dict:
    """Enqueue due/incomplete rows, then drain pending jobs by priority."""
    rehydrate = enqueue_due_and_incomplete(
        limit=rehydrate_limit if rehydrate_limit is not None else settings.CATALOG_REHYDRATE_LIMIT
    )
    drain = run_pending_jobs(limit=limit if limit is not None else settings.CATALOG_DRAIN_LIMIT)
    return {"rehydrate": rehydrate, "drain": drain}


def run_pending_jobs(
    *,
    provider: str | None = None,
    entity_type: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    """Drain the oldest *limit* pending jobs through the engine orchestrator.

    The backlog consumer of the driver: rows are claimed oldest-first by
    ``execute_sync_job`` (claim → engine → terminal frame + stored result), so
    this doubles as the body of a beat task or management-command drain.
    ``provider``/``entity_type`` narrow the drain. Returns a summary with the
    per-job outcomes so callers can surface progress.
    """
    qs = (
        SyncJob.objects.filter(status="pending")
        .exclude(entity_type__in=_MUSIC_ENTITY_TYPES)
        .exclude(provider__in=_MUSIC_PROVIDERS)
        .order_by("priority", "created_at", "pk")
    )
    if provider is not None:
        qs = qs.filter(provider=provider)
    if entity_type is not None:
        qs = qs.filter(entity_type=entity_type)
    outcomes = [execute_sync_job(job.pk) for job in qs[:limit]]
    succeeded = sum(1 for o in outcomes if o.get("status") == "success")
    failed = sum(1 for o in outcomes if o.get("status") == "failed")
    skipped = len(outcomes) - succeeded - failed
    return {
        "ran": len(outcomes),
        "succeeded": succeeded,
        "failed": failed,
        "skipped": skipped,
        "outcomes": outcomes,
    }


async def enqueue_tmdb_popular(
    entity_type: str,
    *,
    limit: int = 50,
    provider: TMDBProvider | None = None,
) -> dict[str, Any]:
    """Page the TMDB popular {entity_type} list and enqueue the unseen ids.

    The driver's first discovery source (the legacy ``priority_seed`` TMDB
    discover step): fetches popular-list pages until *limit* unique ids are
    collected or a page comes back empty, then enqueues a tmdb sync job per id
    that is not already mapped. Dedupe and pending-job checks live in
    ``enqueue_seed_jobs``; the DB write crosses to a worker thread via
    ``sync_to_async`` (the async service → sync write rule). *provider* is
    injectable for tests and defaults to a real TMDB client.
    """
    fetch_name = _TMDB_POPULAR.get(entity_type)
    if fetch_name is None:
        raise ValueError(f"TMDB popular seeding does not yet support entity_type '{entity_type}'")
    if provider is None:
        provider = TMDBProvider()
    fetcher = getattr(provider, fetch_name)

    ids: list[str] = []
    seen: set[int] = set()
    page = 1
    while len(ids) < limit:
        results = (await fetcher(page=page)).get("results") or []
        if not results:
            break
        for item in results:
            raw_id = item.get("id")
            if raw_id is None or raw_id in seen:
                continue
            seen.add(raw_id)
            ids.append(str(raw_id))
            if len(ids) >= limit:
                break
        page += 1

    created = await sync_to_async(enqueue_seed_jobs)(
        provider="tmdb", entity_type=entity_type, external_ids=ids
    )
    return {
        "provider": "tmdb",
        "entity_type": entity_type,
        "discovered": len(ids),
        "enqueued": len(created),
        "external_ids": [job.external_id for job in created],
    }


# IGDB's popular query is one-shot (no offset paging) and the API caps a single
# request at 500 rows, so that is also the largest discovery slice worth asking for.
_IGDB_QUERY_LIMIT = 500


async def enqueue_igdb_popular(
    *,
    limit: int = 500,
    provider: IGDBProvider | None = None,
) -> dict[str, Any]:
    """Enqueue the unseen ids from IGDB's most-rated games list.

    The game-kind discovery source (the legacy ``popular_games`` task only ever
    walked Steam app ids, so this is the IGDB-native replacement): asks the
    client for up to *limit* popular games (``get_popular_games`` sorts by
    ``aggregated_rating``; the query is clamped to ``_IGDB_QUERY_LIMIT``), then
    enqueues one ``SyncJob`` per id the catalog does not already map, which the
    igdb engine (increment 45) consumes and the generic backlog-drain beat picks
    up. Rows without an integer ``id`` (and duplicate ids within a page) are
    skipped. Dedupe and pending-job checks live in ``enqueue_seed_jobs``; the DB
    write crosses to a worker thread via ``sync_to_async``. *provider* is
    injectable for tests and defaults to a real IGDB client.
    """
    if provider is None:
        provider = IGDBProvider()
    results = await provider.get_popular_games(limit=min(limit, _IGDB_QUERY_LIMIT))
    return await _enqueue_game_ids(_collect_game_ids(results))


# IGDB platform ids backing the "best of <platform>" discover lists, keyed by the
# Otix platform slug used to filter the discover feed (the slug source is the
# ``_PLATFORM_NORMALIZATION`` table in apps.media.services.igdb).
_IGDB_BEST_PLATFORMS: dict[str, int] = {
    "windows": 6,
    "playstation-5": 167,
    "xbox-series-x-s": 169,
    "nintendo-switch": 130,
}

# Named game discovery lists ``enqueue_igdb_discover`` can fan out over.
_IGDB_DISCOVER_SOURCES = frozenset(("popular", "recently_released", "upcoming", "platforms"))


def _collect_game_ids(results: list[dict[str, Any]]) -> list[str]:
    """Pull the unique integer ``id`` values out of an IGDB discovery response."""
    ids: list[str] = []
    seen: set[int] = set()
    for game in results:
        raw_id = game.get("id")
        if not isinstance(raw_id, int) or raw_id in seen:
            continue
        seen.add(raw_id)
        ids.append(str(raw_id))
    return ids


async def _enqueue_game_ids(external_ids: list[str]) -> dict[str, Any]:
    """Enqueue *external_ids* as pending igdb game sync jobs; summarize."""
    created = await sync_to_async(enqueue_seed_jobs)(
        provider="igdb", entity_type="game", external_ids=external_ids
    )
    return {
        "provider": "igdb",
        "entity_type": "game",
        "discovered": len(external_ids),
        "enqueued": len(created),
        "external_ids": [job.external_id for job in created],
    }


async def enqueue_igdb_discover(
    *,
    limit: int = 100,
    provider: IGDBProvider | None = None,
    sources: Iterable[str] | None = None,
) -> dict[str, Any]:
    """Enqueue unseen ids across a set of IGDB game discovery lists.

    The broad game-kind discovery source: fetches each named *sources* list
    (default all of them) — the most-rated games, games released in the last 90
    days, upcoming games, and the top-rated games per major platform — each
    capped at *limit* ids, then unions the ids (deduped across lists) and
    enqueues one ``SyncJob`` per id the catalog does not already map. Fanning out
    this way keeps the catalog stocked with newly released / upcoming /
    per-platform titles rather than only the all-time most-rated set. Rows
    without an integer ``id`` are skipped; dedupe and pending-job checks live in
    ``enqueue_seed_jobs``. *provider* injectable for tests.
    """
    if provider is None:
        provider = IGDBProvider()
    if sources is None:
        sources = ("popular", "recently_released", "upcoming", "platforms")
    unknown = set(sources) - _IGDB_DISCOVER_SOURCES
    if unknown:
        raise ValueError(f"Unknown IGDB discovery source(s): {sorted(unknown)}")
    cap = min(limit, _IGDB_QUERY_LIMIT)

    fetched: list[list[dict[str, Any]]] = []
    for source in sources:
        if source == "popular":
            fetched.append(await provider.get_popular_games(limit=cap, fields="id"))
        elif source == "recently_released":
            fetched.append(await provider.get_recently_released_games(limit=cap, fields="id"))
        elif source == "upcoming":
            fetched.append(await provider.get_upcoming_games(limit=cap, fields="id"))
        elif source == "platforms":
            for platform_id in _IGDB_BEST_PLATFORMS.values():
                fetched.append(
                    await provider.get_games_for_platform(
                        platform_id=platform_id, limit=cap, fields="id"
                    )
                )

    ids: list[str] = []
    seen: set[int] = set()
    for results in fetched:
        for game in results:
            raw_id = game.get("id")
            if not isinstance(raw_id, int) or raw_id in seen:
                continue
            seen.add(raw_id)
            ids.append(str(raw_id))
    return await _enqueue_game_ids(ids)


# TMDB daily-ID export files (files.tmdb.org) -> the tmdb engine entity_type they
# feed. Only movie/show are seeded today (the tmdb engine dispatches those);
# the legacy person/collection/network/company/keyword + adult dumps map to no
# Django engine yet and stay out.
TMDB_EXPORT_BASE = "https://files.tmdb.org/p/exports"
_TMDB_EXPORT_FILE: dict[str, str] = {
    "movie": "movie_ids",
    "show": "tv_series_ids",
}

# Ids handed to enqueue_seed_jobs per call — bounds the dedupe IN + bulk_create
# no matter how large a requested export slice is.
_ENQUEUE_BATCH_SIZE = 2000


def _export_dates() -> tuple[str, str]:
    """Today's + yesterday's TMDB export date stamps (the file name format)."""
    now = datetime.now(UTC)
    yesterday = now - timedelta(days=1)
    return now.strftime("%m_%d_%Y"), yesterday.strftime("%m_%d_%Y")


async def download_tmdb_export(
    export_type: str,
    *,
    client: httpx.AsyncClient | None = None,
    api_key: str | None = None,
) -> Path | None:
    """Stream today's (then yesterday's) TMDB ID export to a temp file.

    Returns the temp file path (the caller deletes it) or None when neither
    day's file is published — 403/404 (not uploaded yet / pruned) move to the
    previous day; any real HTTP/transport error propagates so a beat run
    surfaces it rather than silently serving a stale catalog.
    """
    owned = client is None
    if owned:
        client = httpx.AsyncClient(
            timeout=httpx.Timeout(300, connect=30),
            follow_redirects=True,
        )
    params = {"api_key": api_key} if api_key else {}
    try:
        for date_str in _export_dates():
            url = f"{TMDB_EXPORT_BASE}/{export_type}_{date_str}.json.gz"
            tmp = tempfile.NamedTemporaryFile(
                delete=False, prefix=f"otix_{export_type}_", suffix=".json.gz"
            )
            try:
                async with client.stream("GET", url, params=params) as response:
                    if response.status_code in (403, 404):
                        tmp.close()
                        os.unlink(tmp.name)
                        continue
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(chunk_size=65536):
                        tmp.write(chunk)
                tmp.close()
                return Path(tmp.name)
            except Exception:
                tmp.close()
                try:
                    os.unlink(tmp.name)
                except OSError:
                    pass
                raise
        return None
    finally:
        if owned:
            await client.aclose()


def iter_export_ids(path: str | os.PathLike, *, limit: int | None = None) -> Iterator[str]:
    """Yield every integer ``id`` in a gzip'd TMDB export file, oldest first.

    The dumps are gzip'd newline-DELIMITED JSON rows bracketed as one array, so
    the bare opening/closing markers and a trailing comma per row are skipped and
    rows that fail to parse are ignored. *limit* stops the walk early.
    """
    count = 0
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line in ("[", "]", "{", "}"):
                continue
            if line.endswith(","):
                line = line[:-1]
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            row_id = row.get("id")
            if not isinstance(row_id, int):
                continue
            yield str(row_id)
            count += 1
            if limit is not None and count >= limit:
                return


async def enqueue_tmdb_daily(
    entity_type: str,
    *,
    limit: int | None = None,
    api_key: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Enqueue the unseen ids from TMDB's daily {entity_type} ID export.

    The driver's full-catalog discovery source (mirrors the legacy
    ``seed.tmdb_daily_import`` minus the ExternalID-stub backlog; the
    upstream-deletion scan is the sibling ``detect_tmdb_deletions`` pass in
    ``run_daily_tmdb_import``): downloads today's ``movie_ids`` /
    ``tv_series_ids`` dump from files.tmdb.org and enqueues a tmdb sync job per
    id the catalog does not already map — so a re-run after the catalog is built
    is a cheap no-op that only picks up new ids. *limit* bounds the walk (None =
    whole file, the operator-facing full rebuild); ids are fed to
    ``enqueue_seed_jobs`` in fixed batches so the dedupe IN stays bounded for a
    very large dump. The DB write
    crosses to a worker thread via ``sync_to_async``; the export being
    unavailable (None) is reported, not raised. *api_key*/*client* are injectable
    for tests.
    """
    export_type = _TMDB_EXPORT_FILE.get(entity_type)
    if export_type is None:
        raise ValueError(
            f"TMDB daily-export seeding does not yet support entity_type '{entity_type}'"
        )
    path = await download_tmdb_export(export_type, client=client, api_key=api_key)
    if path is None:
        return {
            "provider": "tmdb",
            "entity_type": entity_type,
            "export": "unavailable",
            "discovered": 0,
            "enqueued": 0,
        }
    try:
        created: list[SyncJob] = []
        walked = 0
        batch: list[str] = []
        for external_id in iter_export_ids(path, limit=limit):
            batch.append(external_id)
            walked += 1
            if len(batch) >= _ENQUEUE_BATCH_SIZE:
                created += await sync_to_async(enqueue_seed_jobs)(
                    provider="tmdb", entity_type=entity_type, external_ids=batch
                )
                batch = []
        if batch:
            created += await sync_to_async(enqueue_seed_jobs)(
                provider="tmdb", entity_type=entity_type, external_ids=batch
            )
    finally:
        try:
            path.unlink()
        except OSError:
            pass
    return {
        "provider": "tmdb",
        "entity_type": entity_type,
        "discovered": walked,
        "enqueued": len(created),
        "external_ids": [job.external_id for job in created],
    }


def run_daily_tmdb_import(limit: int | None = None) -> dict[str, Any]:
    """Beat body for the daily refresh: enqueue unseen movie + show export ids.

    Runs the enqueue passes (two sequential ``asyncio.run`` calls, each owning
    its event loop + the HTTP client it downloads with, so a missing movie
    export never blocks the show pass) then the upstream-deletion scan, which
    records TMDB ids that left the exports as ``TMDBDeletedID`` rows. Sync
    wrapper for the beat worker over the async services.
    """
    return {
        "movie": asyncio.run(enqueue_tmdb_daily("movie", limit=limit)),
        "show": asyncio.run(enqueue_tmdb_daily("show", limit=limit)),
        "deletions": run_tmdb_deletion_scan(),
    }


def seed_popular_catalog(limit: int | None = 50) -> dict[str, Any]:
    """Beat body for periodic catalog seeding: enqueue popular movies, shows, and games.

    Enqueues unseen IDs from TMDB popular movies and shows (if TMDB credentials
    are configured) and IGDB popular games (if IGDB credentials are configured).
    Returns a unified summary dict for beat/worker reporting.
    """
    effective_limit = limit if limit is not None else 50
    result: dict[str, Any] = {}

    if settings.TMDB_API_KEY or settings.TMDB_RAT:
        result["tmdb"] = {
            "movie": asyncio.run(enqueue_tmdb_popular("movie", limit=effective_limit)),
            "show": asyncio.run(enqueue_tmdb_popular("show", limit=effective_limit)),
        }
    else:
        result["tmdb"] = {"status": "unconfigured"}

    if settings.IGDB_CLIENT_ID and settings.IGDB_CLIENT_SECRET:
        result["igdb"] = {
            "game": asyncio.run(enqueue_igdb_popular(limit=effective_limit)),
        }
    else:
        result["igdb"] = {"status": "unconfigured"}

    return result


def _enqueue_change_ids(provider: str, entity_type: str, external_ids: list[str]) -> list[str]:
    enqueued: list[str] = []
    for ext_id in external_ids:
        job = ensure_catalog_job(
            provider, entity_type, ext_id, priority=3, force=True, dispatch=False
        )
        if job is not None:
            enqueued.append(ext_id)
    return enqueued


async def enqueue_tmdb_changes(
    entity_type: str,
    *,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int = 50,
    provider: TMDBProvider | None = None,
) -> dict[str, Any]:
    """Fetch changed movie/show IDs from TMDB's /changes endpoint and enqueue them."""
    if entity_type not in ("movie", "show"):
        raise ValueError(f"TMDB changes only supports movie/show; got {entity_type!r}")
    if provider is None:
        provider = TMDBProvider()
    now = datetime.now(UTC)
    if not start_date:
        start_date = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    if not end_date:
        end_date = now.strftime("%Y-%m-%d")

    fetcher = provider.get_movie_changes if entity_type == "movie" else provider.get_show_changes
    ids: list[str] = []
    seen: set[int] = set()
    page = 1
    while len(ids) < limit:
        data = await fetcher(start_date=start_date, end_date=end_date, page=page)
        results = data.get("results") or []
        if not results:
            break
        for item in results:
            raw_id = item.get("id")
            if raw_id is None or raw_id in seen:
                continue
            seen.add(raw_id)
            ids.append(str(raw_id))
            if len(ids) >= limit:
                break
        page += 1
        total_pages = data.get("total_pages") or page
        if page > total_pages:
            break

    enqueued = await sync_to_async(_enqueue_change_ids)(
        provider="tmdb", entity_type=entity_type, external_ids=ids
    )
    return {
        "provider": "tmdb",
        "entity_type": entity_type,
        "discovered": len(ids),
        "enqueued": len(enqueued),
        "external_ids": enqueued,
    }


async def enqueue_igdb_changes(
    *,
    start_timestamp: int | None = None,
    limit: int = 50,
    provider: IGDBProvider | None = None,
) -> dict[str, Any]:
    """Fetch changed game IDs from IGDB's updated_at endpoint and enqueue them."""
    if provider is None:
        provider = IGDBProvider()
    if start_timestamp is None:
        start_timestamp = int((datetime.now(UTC) - timedelta(days=1)).timestamp())

    results = await provider.get_changed_game_ids(start_timestamp=start_timestamp, limit=limit)
    ids: list[str] = []
    seen: set[int] = set()
    for game in results:
        raw_id = game.get("id")
        if not isinstance(raw_id, int) or raw_id in seen:
            continue
        seen.add(raw_id)
        ids.append(str(raw_id))

    enqueued = await sync_to_async(_enqueue_change_ids)(
        provider="igdb", entity_type="game", external_ids=ids
    )
    return {
        "provider": "igdb",
        "entity_type": "game",
        "discovered": len(ids),
        "enqueued": len(enqueued),
        "external_ids": enqueued,
    }


def seed_updated_catalog(limit: int | None = 50) -> dict[str, Any]:
    """Beat body for changed/updated catalog seeding across supported providers."""
    effective_limit = limit if limit is not None else 50
    result: dict[str, Any] = {}

    if settings.TMDB_API_KEY or settings.TMDB_RAT:
        result["tmdb"] = {
            "movie": asyncio.run(enqueue_tmdb_changes("movie", limit=effective_limit)),
            "show": asyncio.run(enqueue_tmdb_changes("show", limit=effective_limit)),
        }
    else:
        result["tmdb"] = {"status": "unconfigured"}

    if settings.IGDB_CLIENT_ID and settings.IGDB_CLIENT_SECRET:
        result["igdb"] = {
            "game": asyncio.run(enqueue_igdb_changes(limit=effective_limit)),
        }
    else:
        result["igdb"] = {"status": "unconfigured"}

    return result


def run_tmdb_deletion_scan() -> dict[str, Any]:
    """Sync wrapper over the async deletion-detection passes (movie then show)."""
    return {
        "movie": asyncio.run(detect_tmdb_deletions("movie")),
        "show": asyncio.run(detect_tmdb_deletions("show")),
    }


async def detect_tmdb_deletions(entity_type: str) -> dict[str, Any]:
    """Record TMDB ids we mapped that are no longer in today's official dump.

    The inc-48 daily import enqueues brand-new ids; this scan (the legacy
    ``seed.tmdb_daily`` deletion half, increment 52) finds the reverse — tmdb
    ``ExternalID`` rows whose id the current ``movie_ids``/``tv_series_ids``
    export no longer lists — and records them as ``TMDBDeletedID`` rows keyed on
    (tmdb_id, media_type) so a later sync never recreates an upstream-deleted
    title. Detection re-downloads the export (the enqueue pass already deleted
    its temp file) and streams the valid-id set to discard mapped ids; only ids
    never seen are reported. DB reads/writes cross to a worker thread via
    ``sync_to_async``.
    """
    export_type = _TMDB_EXPORT_FILE.get(entity_type)
    if export_type is None:
        raise ValueError(f"deletion scan only covers movie/show; got {entity_type!r}")

    rows = await sync_to_async(_mapped_tmdb_rows)(entity_type)
    mapped: dict[int, tuple[int | None, str | None]] = {}
    for ext_id, media_pk, title in rows:
        try:
            mapped[int(ext_id)] = (media_pk, title)
        except (TypeError, ValueError):
            continue
    if not mapped:
        return _scan_summary(entity_type, 0, 0)

    path = await download_tmdb_export(export_type)
    if path is None:
        return {**_scan_summary(entity_type, 0, 0), "export": "unavailable"}
    try:
        for file_id in iter_export_ids(path):
            mapped.pop(int(file_id), None)
    finally:
        try:
            path.unlink()
        except OSError:
            pass
    deleted = list(mapped.items())
    recorded = await sync_to_async(_record_deleted)(entity_type, deleted)
    return _scan_summary(entity_type, len(deleted), recorded)


def _scan_summary(entity_type: str, deleted: int, recorded: int, **extra) -> dict[str, Any]:
    return {
        "provider": "tmdb",
        "entity_type": entity_type,
        "deleted": deleted,
        "recorded": recorded,
        **extra,
    }


def _mapped_tmdb_rows(entity_type: str) -> list[tuple[str, int | None, str | None]]:
    """The catalog's tmdb ``ExternalID`` rows for a movie/show entity type.

    ``ExternalID`` reaches its ``MediaItem`` through a ``GenericForeignKey``, so
    the title is resolved with a second pk lookup rather than an ORM join.
    """
    ext_rows = list(
        ExternalID.objects.filter(provider="tmdb", media_type=entity_type).values_list(
            "external_id", "object_id"
        )
    )
    pks = {pk for _, pk in ext_rows}
    titles = dict(MediaItem.objects.filter(pk__in=pks).values_list("pk", "title"))
    return [(ext_id, pk, titles.get(pk)) for ext_id, pk in ext_rows]


def _record_deleted(
    entity_type: str,
    deleted: list[tuple[int, tuple[int | None, str | None]]],
) -> int:
    """Persist detected-upstream-deleted ids as TMDBDeletedID rows (idempotent)."""
    created = 0
    for tmdb_id, (media_pk, title) in deleted:
        _, was_created = TMDBDeletedID.objects.get_or_create(
            tmdb_id=tmdb_id,
            media_type=entity_type,
            defaults={"media_item_id": media_pk, "title": title},
        )
        if was_created:
            created += 1
    return created
