"""IGDB game-seed sync engine (registered under provider ``igdb``).

The catalog-seed entry point for the ported async IGDB client (increment 37): a
``SyncJob`` whose ``entity_type`` is ``game`` and whose ``external_id`` is the
game's IGDB id is driven here through the game seed driver in
``apps.media.services.igdb_ingest`` (``fetch_and_seed_game``), which fetches the
game over the async provider client and seeds (or reuses/refreshes) a
``MediaItem`` (``media_type="game"``) + ``Game`` subtype row — see that module
for the same-slug cross-provider merge semantics. Registered via
``register_sync_engine`` so ``execute_sync_job`` can find it; like the other
engines it only publishes intermediate ``igdb:sync`` frames (the orchestrator
owns ``sync_started``/``sync_complete`` and the stored result) and returns a
summary dict, or ``{"error": ...}`` for a handled case (an unsupported
``entity_type``, a blank id, or a non-numeric one).

The engine registry is synchronous while the IGDB provider client is async, so
the engine bridges into a fresh event loop with ``asyncio.run`` — the same
safety argument as the ``tmdb``/``musicbrainz`` engines. Platform/company/
screenshot/video enrichment and SteamGrid artwork stay the deferred
full-hydration pass.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import SyncJob
from apps.integrations.services.sync import register_sync_engine
from apps.media.models import ExternalID, MediaItem
from apps.media.services.igdb_ingest import (  # noqa: F401 - via globals()
    fetch_and_seed_game,
)
from core import progress as progress_lib

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _igdb_mapped(igdb_id: int) -> bool:
    """True when a catalog row already owns the game's IGDB id (pre-state)."""
    return ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="igdb",
        media_type="game",
        external_id=str(igdb_id),
    ).exists()


@register_sync_engine("igdb")
def sync_igdb_game(job: SyncJob) -> dict[str, Any]:
    """Seed a game from its IGDB id; return a summary/error.

    ``matched``/``seeded`` snapshot whether an existing igdb mapping already
    resolved the media before this run, so a re-sync reports ``matched`` (the
    seed refreshes subtype rows/overview) and a first import reports ``seeded``.
    Raised provider/network errors are left to the orchestrator, which turns
    them into an ``error`` terminal frame.
    """
    task_id = str(job.pk)
    progress = progress_lib.igdb_progress

    def emit(event_type: str, **data: Any) -> None:
        progress.publish(task_id, event_type, **data)
        progress.store_progress(task_id, event_type, **data)

    if job.entity_type != "game":
        return {
            "error": f"IGDB sync does not yet support entity_type '{job.entity_type}'"
        }
    igdb_id_raw = (job.external_id or "").strip()
    if not igdb_id_raw:
        return {"error": "Invalid IGDB game id in sync job: blank"}
    try:
        igdb_id = int(igdb_id_raw)
    except (TypeError, ValueError):
        return {
            "error": f"Invalid IGDB game id in sync job: {igdb_id_raw!r}"
        }

    matched = _igdb_mapped(igdb_id)
    emit("fetching_game", igdb_id=igdb_id)
    # Resolved at call time (not bound at import) so tests can patch the module
    # attribute and have the engine pick the replacement up.
    fetcher: Callable[[int], Awaitable[int]] = globals()["fetch_and_seed_game"]
    force = getattr(job, "phase", None) == "force"
    try:
        media_item_id = asyncio.run(fetcher(igdb_id, force=force))
    except TypeError:
        media_item_id = asyncio.run(fetcher(igdb_id))
    emit(
        f"game_{'matched' if matched else 'seeded'}",
        igdb_id=igdb_id,
        media_item_id=media_item_id,
    )
    return {
        "igdb_id": igdb_id,
        "media_item_id": media_item_id,
        "matched": matched,
        "seeded": not matched,
    }
