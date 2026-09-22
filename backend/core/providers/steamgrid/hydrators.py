"""SteamGridDB artwork hydration into Django MediaAsset models.

Mirrors and expands ``apps.media.services.steamgrid_artwork`` to provide
complete artwork hydration for games.
"""

from __future__ import annotations

import asyncio
import re
from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType

from apps.media.models import ExternalID, MediaAsset, MediaItem
from apps.media.services.completeness import recompute_completeness
from core.providers.framework import NormalizedAsset
from core.providers.steamgrid.transformers import (
    _TEXTLESS_STYLES,
    get_asset_type,
    get_style_label,
)

if TYPE_CHECKING:
    from core.providers.steamgrid.client import SteamGridDBProvider

_MEDIA_CT: ContentType | None = None


def _media_ct() -> ContentType:
    global _MEDIA_CT
    if _MEDIA_CT is None:
        _MEDIA_CT = ContentType.objects.get_for_model(MediaItem)
    return _MEDIA_CT


def _specs_for(kind: str, entry: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Map one SteamGridDB artwork entry to its MediaAsset insert spec(s).

    Returns ``(asset_type, spec)`` pairs; a ``no_logo``/``material`` grid yields
    both a ``poster`` and a ``textless_poster`` spec sharing the same URL.
    Entries without a ``url`` are dropped.
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
        "label": get_style_label(kind, style),
    }
    asset_type = get_asset_type(kind)
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


def hydrate_normalized_assets(
    media_item_id: int,
    assets: list[NormalizedAsset],
    *,
    sgdb_game_id: int | None = None,
) -> int:
    """Hydrate a sequence of NormalizedAsset instances into MediaAsset records."""
    if sgdb_game_id is not None:
        _ensure_steamgrid_external(media_item_id, sgdb_game_id)

    added = 0
    for asset in assets:
        _, created = MediaAsset.objects.get_or_create(
            media_item_id=media_item_id,
            url=asset.url,
            asset_type=asset.asset_type,
            defaults={
                "provider": asset.provider,
                "score": asset.score,
                "width": asset.width,
                "height": asset.height,
                "lang": asset.language,
            },
        )
        if created:
            added += 1

    if added:
        recompute_completeness(MediaItem.objects.get(pk=media_item_id))
    return added


def _stored_steamgrid_game_id(media_item_id: int) -> int | None:
    """The media row's stored SteamGridDB game id, if a prior attach wrote one."""
    value = (
        ExternalID.objects.filter(
            content_type=_media_ct(),
            provider="steamgrid",
            media_type="game",
            object_id=media_item_id,
        )
        .values_list("external_id", flat=True)
        .first()
    )
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
    """Pick the SteamGridDB autocomplete hit whose name exactly equals the title."""
    if not candidates:
        return None
    want = _normalize(title)
    for candidate in candidates:
        name = str(candidate.get("name") or "")
        if name and _normalize(name) == want:
            return candidate
    return candidates[0]


async def _resolve_sgdb_game(
    provider: SteamGridDBProvider,
    media_item_id: int,
    steam_app_id: int | None,
) -> tuple[int | None, str]:
    """Resolve the SteamGridDB game id for a media row (reuse → steam → name)."""
    sgdb_game_id = await sync_to_async(_stored_steamgrid_game_id)(media_item_id)
    if sgdb_game_id is not None:
        return sgdb_game_id, "steamgrid"
    if steam_app_id is not None:
        game = await provider.get_game_by_steam_app_id(int(steam_app_id))
        if game is not None:
            return int(game.get("id")), "steam"
    title = await sync_to_async(_media_title)(media_item_id)
    game = _pick_search_match(
        await provider.search_games(title) if title else [], title or ""
    )
    if game is None:
        return None, "name"
    return int(game.get("id")), "name"


async def fetch_and_attach_game_artwork(
    media_item_id: int,
    steam_app_id: int,
    *,
    provider: SteamGridDBProvider | None = None,
) -> dict[str, Any]:
    """Resolve a game's SteamGridDB artwork and attach it to the media row."""
    if provider is None:
        from core.providers.steamgrid.client import SteamGridDBProvider

        provider = SteamGridDBProvider()
    sgdb_game_id, resolved_by = await _resolve_sgdb_game(
        provider, media_item_id, steam_app_id
    )
    if sgdb_game_id is None:
        return {
            "steam_app_id": steam_app_id,
            "media_item_id": media_item_id,
            "sgdb_game_id": None,
            "attached": False,
            "assets_added": 0,
            "resolved_by": resolved_by,
        }
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


async def fetch_and_attach_game_logos(
    media_item_id: int,
    steam_app_id: int | None = None,
    *,
    provider: SteamGridDBProvider | None = None,
) -> dict[str, Any]:
    """Attach the logo/icon artwork SteamGridDB has for a catalog game."""
    if provider is None:
        from core.providers.steamgrid.client import SteamGridDBProvider

        provider = SteamGridDBProvider()
    sgdb_game_id, resolved_by = await _resolve_sgdb_game(
        provider, media_item_id, steam_app_id
    )
    if sgdb_game_id is None:
        return {
            "steam_app_id": steam_app_id,
            "media_item_id": media_item_id,
            "sgdb_game_id": None,
            "attached": False,
            "assets_added": 0,
            "resolved_by": resolved_by,
        }
    logos, icons = await asyncio.gather(
        provider.get_logos(sgdb_game_id),
        provider.get_icons(sgdb_game_id),
    )
    added = await sync_to_async(attach_steamgrid_assets)(
        media_item_id, sgdb_game_id, [], [], logos, icons
    )
    return {
        "steam_app_id": steam_app_id,
        "media_item_id": media_item_id,
        "sgdb_game_id": sgdb_game_id,
        "attached": added > 0,
        "assets_added": added,
        "resolved_by": resolved_by,
    }
