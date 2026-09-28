"""TMDB media-seed sync engine (registered under provider ``tmdb``).

The catalog-seed entry point for the ported async TMDB client: a ``SyncJob``
whose ``entity_type`` is a supported TMDB media kind (``movie``, ``show``) and
whose ``external_id`` is that media's TMDB id is driven here through the
matching seed driver in ``apps.media.services.tmdb_ingest``
(``fetch_and_seed_movie`` / ``fetch_and_seed_show``), which fetches the TMDB
detail over the async provider client and seeds (or reuses/refreshes) a minimal
``MediaItem`` + subtype row — see that module for the dedup/top-up semantics.
Registered via ``register_sync_engine`` so ``execute_sync_job`` can find it;
like the other engines it only publishes intermediate ``tmdb:sync`` frames (the
orchestrator owns ``sync_started``/``sync_complete`` and the stored result) and
returns a summary dict, or ``{"error": ...}`` for handled cases (an unsupported
``entity_type`` or a non-numeric TMDB id).

The engine registry is synchronous while the TMDB provider client is async, so
the engine bridges into a fresh event loop with ``asyncio.run``. That is safe
here: ``execute_sync_job`` runs engines on a worker thread/process (Celery
eager mode or a prefork worker) with no live event loop, and both the shared
httpx client (``core.providers.tmdb.get_http_client``) and the per-call async
redis client tolerate a new loop. ``movie`` (increment 39) and ``show``
(increment 40) are supported; per-season episodes + credits, the MusicBrainz
album ingest, and the bulk catalog-seed driver are the deferred next pieces.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import SyncJob
from apps.integrations.services.sync import register_sync_engine
from apps.media.models import ExternalID, MediaItem
from apps.media.services.tmdb_company import (  # noqa: F401 - resolved via globals()
    fetch_and_seed_company,
)
from apps.media.services.tmdb_ingest import (  # noqa: F401 - resolved via globals()
    fetch_and_seed_movie,
    fetch_and_seed_show,
)
from core import progress as progress_lib

logger = logging.getLogger(__name__)

# entity_type → the module attribute holding that media kind's async seed driver.
# Resolved via globals() at call time (not bound at import) so tests can patch
# ``apps.integrations.services.tmdb_sync.fetch_and_seed_*`` and have the engine
# pick the replacement up.
_FETCH_NAMES: dict[str, str] = {
    "movie": "fetch_and_seed_movie",
    "show": "fetch_and_seed_show",
}

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _tmdb_mapped(tmdb_id: int, media_type: str) -> bool:
    """True when a catalog row already owns the TMDB id (pre-state snapshot)."""
    return ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="tmdb",
        media_type=media_type,
        external_id=str(tmdb_id),
    ).exists()


def _notify_followed_studios(media_item_id: int) -> None:
    """Enqueue release notifications when a followed studio is on a new title.

    Runs inline after a first-time seed (by which point the ingest tails — incl.
    the Wikidata distributor enrich — have attached every company). The cheap
    follower-existence check keeps bulk seeding of unfollowed titles from
    enqueuing anything; the task applies the announced/available split and the
    recent-release window. Imported locally to keep the social task graph off
    this module's import path and to stay patchable in tests; a dispatch failure
    is logged, never raised — it must not fail the seed that produced the row.
    """
    from apps.social.services.release_notify import media_has_followed_company
    from apps.social.tasks import release_notify_task

    try:
        if media_has_followed_company(media_item_id):
            release_notify_task.delay(media_item_id)
    except Exception:
        logger.exception("release notify dispatch failed for media %s", media_item_id)


def _dispatch_child(child_id: int) -> None:
    """Dispatch a follow-discovered child seed job so it seeds immediately.

    Module-level so tests can patch the dispatch, and imported lazily to keep
    ``apps.integrations.tasks`` off this module's import path.
    """
    from apps.integrations.tasks import run_sync_job

    run_sync_job.delay(child_id)


def _sync_tmdb_company(job: SyncJob, emit: Callable[..., None]) -> dict[str, Any]:
    """Full company sync: refresh the row, discover its titles, enqueue them.

    The discovered child jobs are dispatched here (rather than left pending for
    the daily drain) so a follow immediately starts seeding the studio's titles;
    a dispatch failure is logged, never raised — the child rows stay pending and
    the next drain picks them up.
    """
    try:
        tmdb_id = int(job.external_id)
    except (TypeError, ValueError):
        return {"error": f"Invalid TMDB company id in sync job: {job.external_id!r}"}

    emit("fetching_company", tmdb_id=tmdb_id)
    summary: dict[str, Any] = asyncio.run(
        globals()["fetch_and_seed_company"](tmdb_id, parent_job=job)
    )
    emit(
        "company_synced",
        tmdb_id=tmdb_id,
        company_id=summary.get("company_id"),
        enqueued=summary.get("enqueued", 0),
    )
    for child_id in summary.get("child_job_ids") or []:
        try:
            _dispatch_child(child_id)
        except Exception:
            logger.exception("failed to dispatch company child job %s", child_id)
    return summary


@register_sync_engine("tmdb")
def sync_tmdb_media(job: SyncJob) -> dict[str, Any]:
    """Seed a movie/show from its TMDB id; return a summary or a handled error.

    ``matched``/``seeded`` snapshot whether an existing TMDB mapping already
    resolved the media before this run, so a re-sync of a known title reports
    ``matched`` (the seed reuses/refreshes the row) and a first import reports
    ``seeded``. Raised provider/network errors are left to the orchestrator,
    which turns them into an ``error`` terminal frame.
    """
    task_id = str(job.pk)
    progress = progress_lib.tmdb_progress

    def emit(event_type: str, **data: Any) -> None:
        progress.publish(task_id, event_type, **data)
        progress.store_progress(task_id, event_type, **data)

    if job.entity_type == "company":
        return _sync_tmdb_company(job, emit)

    fetch_name = _FETCH_NAMES.get(job.entity_type)
    if fetch_name is None:
        return {"error": f"TMDB sync does not yet support entity_type '{job.entity_type}'"}
    fetcher: Callable[[int], Awaitable[int]] = globals()[fetch_name]

    try:
        tmdb_id = int(job.external_id)
    except (TypeError, ValueError):
        return {"error": f"Invalid TMDB {job.entity_type} id in sync job: {job.external_id!r}"}

    matched = _tmdb_mapped(tmdb_id, job.entity_type)
    emit(f"fetching_{job.entity_type}", tmdb_id=tmdb_id)
    force = getattr(job, "phase", None) == "force"
    try:
        media_item_id = asyncio.run(fetcher(tmdb_id, force=force))
    except TypeError:
        media_item_id = asyncio.run(fetcher(tmdb_id))
    emit(
        f"{job.entity_type}_{'matched' if matched else 'seeded'}",
        tmdb_id=tmdb_id,
        media_item_id=media_item_id,
    )
    if not matched:
        _notify_followed_studios(media_item_id)
    return {
        "tmdb_id": tmdb_id,
        "media_item_id": media_item_id,
        "matched": matched,
        "seeded": not matched,
    }
