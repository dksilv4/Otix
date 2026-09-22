"""IGDB game seed sync engine registration hook.

Mirrors apps/integrations/services/igdb_sync.py.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import SyncJob
from apps.integrations.services.sync import register_sync_engine
from apps.media.models import ExternalID, MediaItem
from apps.media.services.igdb_ingest import fetch_and_seed_game
from core import progress as progress_lib

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _igdb_mapped(igdb_id: int) -> bool:
    """True when a catalog row already owns the game's IGDB ID (pre-state)."""
    return ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="igdb",
        media_type="game",
        external_id=str(igdb_id),
    ).exists()


@register_sync_engine("igdb")
def sync_igdb_game(job: SyncJob) -> dict[str, Any]:
    """Seed a game from its IGDB ID; return a summary or error dict.

    Mirrors apps.integrations.services.igdb_sync.sync_igdb_game.
    """
    task_id = str(job.pk)
    progress = progress_lib.igdb_progress

    def emit(event_type: str, **data: Any) -> None:
        progress.publish(task_id, event_type, **data)
        progress.store_progress(task_id, event_type, **data)

    if job.entity_type != "game":
        return {"error": f"IGDB sync does not yet support entity_type '{job.entity_type}'"}
    igdb_id_raw = (job.external_id or "").strip()
    if not igdb_id_raw:
        return {"error": "Invalid IGDB game id in sync job: blank"}
    try:
        igdb_id = int(igdb_id_raw)
    except (TypeError, ValueError):
        return {"error": f"Invalid IGDB game id in sync job: {igdb_id_raw!r}"}

    matched = _igdb_mapped(igdb_id)
    emit("fetching_game", igdb_id=igdb_id)
    fetcher: Callable[..., Awaitable[int]] = fetch_and_seed_game
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
