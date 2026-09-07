"""MusicBrainz album-seed sync engine (registered under provider ``musicbrainz``).

The catalog-seed entry point for the ported async MusicBrainz client: a
``SyncJob`` whose ``entity_type`` is ``album`` and whose ``external_id`` is the
release's MBID is driven here through the album seed driver in
``apps.media.services.musicbrainz_ingest`` (``fetch_and_seed_album``), which
fetches the release over the async provider client and seeds (or reuses/
refreshes) a ``MediaItem`` (``media_type="music"``) + ``Album`` subtype + ``Track``
rows — see that module for the add-only track upsert and no-slug-merge semantics.
Registered via ``register_sync_engine`` so ``execute_sync_job`` can find it; like
the other engines it only publishes intermediate ``musicbrainz:sync`` frames (the
orchestrator owns ``sync_started``/``sync_complete`` and the stored result) and
returns a summary dict, or ``{"error": ...}`` for a handled case (an unsupported
``entity_type`` or a blank MBID).

The engine registry is synchronous while the MusicBrainz provider client is
async, so the engine bridges into a fresh event loop with ``asyncio.run`` — the
same safety argument as the ``tmdb`` engine (``execute_sync_job`` runs engines
on a worker thread/process with no live event loop). Per-release episode-style
enrichment (credits/labels/genres/cover art) stays the deferred full-hydration
pass.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import SyncJob
from apps.integrations.services.sync import register_sync_engine
from apps.media.models import ExternalID, MediaItem
from apps.media.services.musicbrainz_ingest import (  # noqa: F401 - via globals()
    fetch_and_seed_album,
)
from core import progress as progress_lib

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _mbz_mapped(mbid: str) -> bool:
    """True when a catalog row already owns the release MBID (pre-state)."""
    return ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="musicbrainz",
        media_type="music",
        external_id=mbid,
    ).exists()


@register_sync_engine("musicbrainz")
def sync_musicbrainz_album(job: SyncJob) -> dict[str, Any]:
    """Seed an album from its MusicBrainz release MBID; return a summary/error.

    ``matched``/``seeded`` snapshot whether an existing musicbrainz mapping
    already resolved the media before this run, so a re-sync reports ``matched``
    (the seed refreshes subtype fields and upserts new tracks) and a first import
    reports ``seeded``. Raised provider/network errors are left to the
    orchestrator, which turns them into an ``error`` terminal frame.
    """
    task_id = str(job.pk)
    progress = progress_lib.musicbrainz_progress

    def emit(event_type: str, **data: Any) -> None:
        progress.publish(task_id, event_type, **data)
        progress.store_progress(task_id, event_type, **data)

    if job.entity_type != "album":
        return {
            "error": f"MusicBrainz sync does not yet support entity_type '{job.entity_type}'"
        }
    mbid = (job.external_id or "").strip()
    if not mbid:
        return {"error": "Invalid MusicBrainz album MBID in sync job: blank"}

    matched = _mbz_mapped(mbid)
    emit("fetching_album", mbid=mbid)
    # Resolved at call time (not bound at import) so tests can patch the module
    # attribute and have the engine pick the replacement up.
    fetcher: Callable[[str], Awaitable[int]] = globals()["fetch_and_seed_album"]
    media_item_id = asyncio.run(fetcher(mbid))
    emit(
        f"album_{'matched' if matched else 'seeded'}",
        mbid=mbid,
        media_item_id=media_item_id,
    )
    return {
        "mbid": mbid,
        "media_item_id": media_item_id,
        "matched": matched,
        "seeded": not matched,
    }
