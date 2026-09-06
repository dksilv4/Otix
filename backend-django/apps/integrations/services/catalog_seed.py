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
rows before persisting pending jobs. The task wrappers in
``apps.integrations.tasks`` drive a periodic beat schedule (increment 48): the
daily import + a ``run_pending_jobs`` backlog drain (the drain is provider-agnostic,
so igdb game jobs enqueued off popular are consumed by the same backlog beat).
SteamGrid artwork and a MusicBrainz bulk source stay deferred (the ported
inc-36/37 clients and the album engine are already wired for future sources).
"""

from __future__ import annotations

import asyncio
import gzip
import json
import os
import tempfile
from collections.abc import Iterable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import SyncJob
from apps.integrations.services.sync import execute_sync_job
from apps.media.models import ExternalID, MediaItem
from core.providers.igdb import IGDBProvider
from core.providers.tmdb import TMDBProvider

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
            priority=priority,
        )
        for external_id in sorted(fresh - live)
    ]
    SyncJob.objects.bulk_create(jobs)
    return jobs


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
    qs = SyncJob.objects.filter(status="pending").order_by("created_at", "pk")
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
        raise ValueError(
            f"TMDB popular seeding does not yet support entity_type '{entity_type}'"
        )
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

    ids: list[str] = []
    seen: set[int] = set()
    for game in results:
        raw_id = game.get("id")
        if not isinstance(raw_id, int) or raw_id in seen:
            continue
        seen.add(raw_id)
        ids.append(str(raw_id))

    created = await sync_to_async(enqueue_seed_jobs)(
        provider="igdb", entity_type="game", external_ids=ids
    )
    return {
        "provider": "igdb",
        "entity_type": "game",
        "discovered": len(ids),
        "enqueued": len(created),
        "external_ids": [job.external_id for job in created],
    }


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
    ``seed.tmdb_daily_import`` minus the ExternalID-stub backlog + deletion
    scan): downloads today's ``movie_ids`` / ``tv_series_ids`` dump from
    files.tmdb.org and enqueues a tmdb sync job per id the catalog does not
    already map — so a re-run after the catalog is built is a cheap no-op that
    only picks up new ids. *limit* bounds the walk (None = whole file, the
    operator-facing full rebuild); ids are fed to ``enqueue_seed_jobs`` in fixed
    batches so the dedupe IN stays bounded for a very large dump. The DB write
    crosses to a worker thread via ``sync_to_async``; the export being
    unavailable (None) is reported, not raised. *api_key*/*client* are injectable
    for tests.
    """
    export_type = _TMDB_EXPORT_FILE.get(entity_type)
    if export_type is None:
        raise ValueError(
            f"TMDB daily-export seeding does not yet support entity_type '{entity_type}'"
        )
    path = await download_tmdb_export(
        export_type, client=client, api_key=api_key
    )
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

    Two sequential ``asyncio.run`` passes (each owns its event loop + the HTTP
    client it downloads with), so a missing movie export never blocks the show
    pass. Sync wrapper for the beat worker over the async service.
    """
    return {
        "movie": asyncio.run(enqueue_tmdb_daily("movie", limit=limit)),
        "show": asyncio.run(enqueue_tmdb_daily("show", limit=limit)),
    }
