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

``enqueue_tmdb_popular`` is the first concrete discovery source: it pages the
TMDB popular movie/show list up to a limit and enqueues every id that does not
already own a tmdb mapping. IGDB/SteamGrid/MusicBrainz bulk sources and a
periodic beat schedule stay deferred (the ported inc-36/37 clients and the album
engine are already wired for future sources).
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import SyncJob
from apps.integrations.services.sync import execute_sync_job
from apps.media.models import ExternalID, MediaItem
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
