"""SteamGridDB artwork attach — enrich a catalog game with SteamGrid artwork.

The first consumer of the ported async SteamGridDB client
(``core.providers.steamgrid``, increment 36) and the artwork half of the game
full-hydration tail: a Steam-linked catalog game (its ``MediaItem`` already
carries a ``provider="steam"`` ``ExternalID``) is looked up on SteamGridDB by
Steam App ID, then its grids/heroes/logos/icons are attached as ``MediaAsset``
rows mirroring the legacy ``otix.providers.steamgrid.hydrator`` taxonomy:

- every grid -> ``poster``; grids styled ``no_logo``/``material`` ALSO become a
  ``textless_poster`` copy (the same URL under a second type),
- heroes -> ``backdrop``, logos -> ``logo``, icons -> ``icon``.

Each row records ``provider="steamgrid"`` plus the artwork's ``width``/``height``/
``language``/``style``/``score`` and a style-derived ``label``. Upserts are
idempotent on the ``(media_item, url, asset_type)`` natural key; an existing row
only has a missing ``lang`` backfilled (the legacy ``DO UPDATE ... WHERE lang IS
NULL``). The SteamGridDB internal game id is stored as a ``provider="steamgrid"``
``ExternalID`` and, since increment 56, the async driver honors the reuse promise:
a row that already owns one skips the platform lookup on re-sync (only missing
artwork is fetched). A Steam App ID SteamGridDB has no entry for falls back to a
title search on the catalog title (picking the exact-name candidate) before the
driver gives up. The async fetch is deliberately lenient: entries missing for an
App ID (or an endpoint erroring) are a benign no-op, not a hard failure — artwork
is best-effort enrichment. The pure-DB attach runs in a sync function (crossed
from the async driver via ``sync_to_async``) so its write stays on a worker thread.
"""

from __future__ import annotations

import asyncio
import re
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType

from apps.media.models import ExternalID, MediaAsset, MediaItem
from apps.media.services.completeness import recompute_completeness

if TYPE_CHECKING:
    from core.providers.steamgrid import SteamGridDBProvider

# Style -> label mapping per artwork family (legacy ``_SGDB_LABELS``). Unknown
# styles keep a null label.
_LOGO_LABELS = {"official": "multicolor", "white": "white", "black": "black", "custom": "custom"}
_GRID_LABELS = {
    "no_logo": "textless",
    "material": "material",
    "alternate": "alternate",
    "blurred": "blurred",
    "white": "white",
    "white_logo": "white_logo",
}
_HERO_LABELS = {"material": "material", "blurred": "blurred", "alternate": "alternate"}
_ICON_LABELS = {"official": "official", "custom": "custom"}
_TEXTLESS_STYLES = frozenset({"no_logo", "material"})

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _label_for(kind: str, style: str | None) -> str | None:
    if not style:
        return None
    if kind == "grid":
        return _GRID_LABELS.get(style)
    if kind == "hero":
        return _HERO_LABELS.get(style)
    if kind == "logo":
        return _LOGO_LABELS.get(style)
    if kind == "icon":
        return _ICON_LABELS.get(style)
    return None


def _asset_type_for(kind: str) -> str:
    if kind == "grid":
        return "poster"
    if kind == "hero":
        return "backdrop"
    return kind  # logo/icon map 1:1


def _specs_for(kind: str, entry: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Map one SteamGridDB artwork entry to its MediaAsset insert spec(s).

    Returns ``(asset_type, spec)`` pairs; a ``no_logo``/``material`` grid yields
    both a ``poster`` and a ``textless_poster`` spec sharing the same URL.
    Entries without a ``url`` are dropped. Values map onto the MediaAsset columns
    the serializers read (``provider``/``style``/``label``/``score``/``width``/
    ``height``/``lang``).
    """
    url = entry.get("url")
    if not url:
        return []
    style = entry.get("style")
    base = {
        "url": url,
        "width": entry.get("width"),
        "height": entry.get("height"),
        "lang": entry.get("language"),
        "style": style,
        "score": entry.get("score"),
        "provider": "steamgrid",
        "label": _label_for(kind, style),
    }
    asset_type = _asset_type_for(kind)
    primary = {**base, "asset_type": asset_type}
    if kind == "grid" and style in _TEXTLESS_STYLES:
        return [
            (asset_type, primary),
            ("textless_poster", {**primary, "asset_type": "textless_poster"}),
        ]
    return [(asset_type, primary)]


def _ensure_steamgrid_external(media_item_id: int, sgdb_game_id: int) -> None:
    """Backfill the SteamGridDB internal game id onto the media row."""
    row, created = ExternalID.objects.get_or_create(
        content_type=_media_ct(),
        provider="steamgrid",
        media_type="game",
        external_id=str(sgdb_game_id),
        defaults={"object_id": media_item_id},
    )
    if not created and row.object_id != media_item_id:
        row.object_id = media_item_id
        row.save(update_fields=("object_id", "updated_at"))


def attach_steamgrid_assets(
    media_item_id: int,
    sgdb_game_id: int,
    grids: list[dict[str, Any]],
    heroes: list[dict[str, Any]],
    logos: list[dict[str, Any]],
    icons: list[dict[str, Any]],
) -> int:
    """Upsert SteamGridDB artwork rows for ``media_item_id``; return new count.

    Idempotent on the ``(media_item, url, asset_type)`` natural key: re-running
    with the same payload creates nothing new. Existing rows only get a missing
    ``lang`` backfilled (never overwriting a set one). Also stores the SteamGridDB
    game id as a ``provider="steamgrid"`` ``ExternalID``.
    """
    _ensure_steamgrid_external(media_item_id, sgdb_game_id)
    added = 0
    for kind, entries in (
        ("grid", grids),
        ("hero", heroes),
        ("logo", logos),
        ("icon", icons),
    ):
        for entry in entries:
            for asset_type, spec in _specs_for(kind, entry):
                lang = spec.pop("lang")
                asset, created = MediaAsset.objects.get_or_create(
                    media_item_id=media_item_id,
                    url=spec["url"],
                    asset_type=asset_type,
                    defaults=spec,
                )
                if created:
                    added += 1
                elif lang and asset.lang is None:
                    asset.lang = lang
                    asset.save(update_fields=("lang",))
    if added:
        recompute_completeness(MediaItem.objects.get(pk=media_item_id))
    return added


def _stored_steamgrid_game_id(media_item_id: int) -> int | None:
    """The media row's stored SteamGridDB game id, if a prior attach wrote one."""
    value = ExternalID.objects.filter(
        content_type=_media_ct(),
        provider="steamgrid",
        media_type="game",
        object_id=media_item_id,
    ).values_list("external_id", flat=True).first()
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _media_title(media_item_id: int) -> str | None:
    """The catalog title used for the name-search fallback (blank-safe)."""
    title = (
        MediaItem.objects.filter(pk=media_item_id)
        .values_list("title", flat=True)
        .first()
    )
    return str(title).strip() if title else None


def _normalize(value: str) -> str:
    """Lowercase alnum-only form used to compare titles case-insensitively."""
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def _pick_search_match(candidates: list[dict[str, Any]], title: str) -> dict[str, Any] | None:
    """Pick the SteamGridDB autocomplete hit whose name exactly equals the title.

    The search endpoint returns prefix matches, so an exact normalized title hit
    is preferred over a merely-prefix title (e.g. "Hades" over "Hades II");
    otherwise the first candidate stands in.
    """
    if not candidates:
        return None
    want = _normalize(title)
    for candidate in candidates:
        name = str(candidate.get("name") or "")
        if name and _normalize(name) == want:
            return candidate
    return candidates[0]


async def fetch_and_attach_game_artwork(
    media_item_id: int,
    steam_app_id: int,
    *,
    provider: SteamGridDBProvider | None = None,
) -> dict[str, Any]:
    """Resolve a game's SteamGridDB artwork and attach it to the media row.

    Resolution is media-first: a row that already owns a ``provider="steamgrid"``
    game id (a prior attach wrote it) reuses it and skips the platform lookup — a
    re-sync only fetches what's missing. Otherwise the Steam App ID lookup runs,
    and a miss falls back to a title search on the catalog title, preferring the
    exact-name candidate. No SteamGridDB entry at all is a benign no-op. The
    grids/heroes/logos/icons are fetched in parallel and crossed to a worker
    thread via ``sync_to_async``. *provider* is injectable for tests and defaults
    to a real SteamGridDB client. ``resolved_by`` reports the path that produced
    the game id: ``steamgrid`` (stored id reused), ``steam``, or ``name``.
    """
    if provider is None:
        from core.providers.steamgrid import SteamGridDBProvider  # local: avoid eager build

        provider = SteamGridDBProvider()
    resolved_by = "steamgrid"
    sgdb_game_id = await sync_to_async(_stored_steamgrid_game_id)(media_item_id)
    if sgdb_game_id is None:
        game = await provider.get_game_by_steam_app_id(steam_app_id)
        if game is not None:
            resolved_by = "steam"
        else:
            resolved_by = "name"
            title = await sync_to_async(_media_title)(media_item_id)
            game = _pick_search_match(
                await provider.search_games(title) if title else [], title or ""
            )
        if game is None:
            return {
                "steam_app_id": steam_app_id,
                "media_item_id": media_item_id,
                "sgdb_game_id": None,
                "attached": False,
                "assets_added": 0,
                "resolved_by": resolved_by,
            }
        sgdb_game_id = int(game.get("id"))
    grids, heroes, logos, icons = await asyncio.gather(
        provider.get_grids(sgdb_game_id),
        provider.get_heroes(sgdb_game_id),
        provider.get_logos(sgdb_game_id),
        provider.get_icons(sgdb_game_id),
    )
    added = await sync_to_async(attach_steamgrid_assets)(
        media_item_id, sgdb_game_id, grids, heroes, logos, icons
    )
    return {
        "steam_app_id": steam_app_id,
        "media_item_id": media_item_id,
        "sgdb_game_id": sgdb_game_id,
        "attached": added > 0,
        "assets_added": added,
        "resolved_by": resolved_by,
    }
