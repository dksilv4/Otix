"""SteamGridDB artwork sync engine (registered under provider ``steamgrid``).

The artwork half of the game full-hydration tail: a ``SyncJob`` whose
``entity_type`` is ``game`` and whose ``external_id`` is a Steam App ID is
driven here through the async attach driver
``apps.media.services.steamgrid_artwork.fetch_and_attach_game_artwork``. The
target catalog game is resolved through the Steam link every Steam-linked game
already carries — a ``provider="steam"`` ``ExternalID`` whose ``external_id`` is
the App ID. Artwork is best-effort enrichment: a game with no SteamGridDB entry
(``sgdb_game_id`` ``None``) is a benign no-op, not a failure. Registered via
``register_sync_engine`` so ``execute_sync_job`` can find it; like the other
engines it only publishes intermediate ``steamgrid:sync`` frames (the
orchestrator owns ``sync_started``/``sync_complete`` and the stored result) and
returns a summary dict, or ``{"error": ...}`` for a handled case (an unsupported
``entity_type``, a blank/non-numeric App ID, or an App ID with no catalog game
linked to it).

The engine registry is synchronous while the SteamGridDB provider client is
async, so the engine bridges into a fresh event loop with ``asyncio.run`` — the
same safety argument as the other engines.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import SyncJob
from apps.integrations.services.sync import register_sync_engine
from apps.media.models import ExternalID, MediaItem
from apps.media.services.steamgrid_artwork import (  # noqa: F401 - via globals()
    fetch_and_attach_game_artwork,
)
from core import progress as progress_lib

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _catalog_media_for_steam_app(app_id: int) -> int | None:
    """Map a Steam App ID to its linked catalog ``MediaItem`` id (``None`` if none)."""
    return ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="steam",
        media_type="game",
        external_id=str(app_id),
    ).values_list("object_id", flat=True).first()


def _steamgrid_mapped(media_item_id: int) -> bool:
    """True when the row already owns a SteamGridDB id (pre-state)."""
    return ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="steamgrid",
        media_type="game",
        object_id=media_item_id,
    ).exists()


@register_sync_engine("steamgrid")
def sync_steamgrid_artwork(job: SyncJob) -> dict[str, Any]:
    """Attach SteamGridDB artwork to a Steam-linked game; return a summary/error.

    ``matched`` snapshots whether the game already owns a SteamGridDB id before
    this run, so a re-sync reports ``matched`` (the attach refreshes only what is
    missing) and a first attach reports a fresh ``attached`` flag. Raised
    provider/network errors are left to the orchestrator, which turns them into
    an ``error`` terminal frame.
    """
    task_id = str(job.pk)
    progress = progress_lib.steamgrid_progress

    def emit(event_type: str, **data: Any) -> None:
        progress.publish(task_id, event_type, **data)
        progress.store_progress(task_id, event_type, **data)

    if job.entity_type != "game":
        return {
            "error": f"SteamGrid sync does not yet support entity_type '{job.entity_type}'"
        }
    app_id_raw = (job.external_id or "").strip()
    if not app_id_raw:
        return {"error": "Invalid Steam App ID in sync job: blank"}
    try:
        app_id = int(app_id_raw)
    except (TypeError, ValueError):
        return {"error": f"Invalid Steam App ID in sync job: {app_id_raw!r}"}

    media_item_id = _catalog_media_for_steam_app(app_id)
    if media_item_id is None:
        return {"error": f"No catalog game linked to Steam App ID {app_id}"}

    matched = _steamgrid_mapped(media_item_id)
    emit("attaching_artwork", steam_app_id=app_id, media_item_id=media_item_id)
    # Resolved at call time (not bound at import) so tests can patch the module
    # attribute and have the engine pick the replacement up.
    driver: Callable[[int, int], Awaitable[dict[str, Any]]] = globals()[
        "fetch_and_attach_game_artwork"
    ]
    result = asyncio.run(driver(media_item_id, app_id))
    emit(
        "artwork_attached",
        steam_app_id=app_id,
        media_item_id=media_item_id,
        sgdb_game_id=result.get("sgdb_game_id"),
        assets_added=result.get("assets_added", 0),
    )
    return {
        "steam_app_id": app_id,
        "media_item_id": media_item_id,
        "sgdb_game_id": result.get("sgdb_game_id"),
        "attached": result.get("attached", False),
        "assets_added": result.get("assets_added", 0),
        "matched": matched,
    }
