"""TMDB media-seed sync engine registration hook.

Mirrors and integrates with ``apps.integrations.services.tmdb_sync`` to register
the TMDB sync engine handler for movies, shows, and companies.
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
from apps.media.services.tmdb_company import fetch_and_seed_company
from apps.media.services.tmdb_ingest import fetch_and_seed_movie, fetch_and_seed_show
from core import progress as progress_lib

logger = logging.getLogger(__name__)

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
    """True when a catalog row already owns the TMDB id."""
    return ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="tmdb",
        media_type=media_type,
        external_id=str(tmdb_id),
    ).exists()


def _notify_followed_studios(media_item_id: int) -> None:
    """Enqueue release notifications when a followed studio is on a new title."""
    try:
        from apps.social.services.release_notify import media_has_followed_company
        from apps.social.tasks import release_notify_task

        if media_has_followed_company(media_item_id):
            release_notify_task.delay(media_item_id)
    except Exception:
        logger.exception("release notify dispatch failed for media %s", media_item_id)


def _dispatch_child(child_id: int) -> None:
    from apps.integrations.tasks import run_sync_job

    run_sync_job.delay(child_id)


def _sync_tmdb_company(job: SyncJob, emit: Callable[..., None]) -> dict[str, Any]:
    try:
        tmdb_id = int(job.external_id)
    except (TypeError, ValueError):
        return {"error": f"Invalid TMDB company id in sync job: {job.external_id!r}"}

    emit("fetching_company", tmdb_id=tmdb_id)
    summary: dict[str, Any] = asyncio.run(fetch_and_seed_company(tmdb_id, parent_job=job))
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
    """Seed a movie/show/company from its TMDB id; return a summary or handled error."""
    task_id = str(job.pk)
    progress = progress_lib.tmdb_progress

    def emit(event_type: str, **data: Any) -> None:
        progress.publish(task_id, event_type, **data)
        progress.store_progress(task_id, event_type, **data)

    if job.entity_type == "company":
        return _sync_tmdb_company(job, emit)

    fetcher_map: dict[str, Callable[..., Awaitable[int]]] = {
        "movie": fetch_and_seed_movie,
        "show": fetch_and_seed_show,
    }
    fetcher = fetcher_map.get(job.entity_type)
    if fetcher is None:
        return {"error": f"TMDB sync does not yet support entity_type '{job.entity_type}'"}

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
