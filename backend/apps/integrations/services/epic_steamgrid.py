"""SteamGridDB resolution for unmatched Epic games.

Queries SteamGridDB for unmatched UserEpicGame entries via platform EGS id or title
search. Seeds MediaItem + Game catalog records, attaches ExternalIDs, links
UserEpicGame.media_item_id, and attaches SteamGridDB grids, heroes, logos, and icons.
"""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any

from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from apps.integrations.models import UserEpicGame
from apps.media.models import ExternalID, Game, MediaItem
from apps.media.services.game_matcher import _comparison_key
from apps.media.services.steamgrid_artwork import (
    _pick_search_match,
    attach_steamgrid_assets,
)
from core.providers.steamgrid import SteamGridDBProvider

logger = logging.getLogger(__name__)


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def clean_search_title(title: str) -> str:
    """Strip trademarks, edition tags, and extra spaces for autocomplete query."""
    text = re.sub(r"[™®©℠]", "", str(title or ""))
    return re.sub(r"\s+", " ", text).strip()


async def fetch_steamgrid_game_data(
    provider: SteamGridDBProvider,
    *,
    catalog_item_id: str | None,
    app_name: str | None,
    title: str,
) -> dict[str, Any] | None:
    """Fetch game details and artwork payloads from SteamGridDB async client."""
    sgdb_game = None
    resolved_by = "none"

    # 1. Try platform egs lookup
    for ext_id in [catalog_item_id, app_name]:
        if ext_id:
            try:
                sgdb_game = await provider.get_game_by_platform_id("egs", ext_id)
                if sgdb_game and sgdb_game.get("id"):
                    resolved_by = "egs"
                    break
            except Exception:
                pass

    # 2. Fallback to title autocomplete search
    if sgdb_game is None or not sgdb_game.get("id"):
        query = clean_search_title(title)
        if query:
            try:
                candidates = await provider.search_games(query)
                sgdb_game = _pick_search_match(candidates, title)
                if sgdb_game and sgdb_game.get("id"):
                    resolved_by = "search"
            except Exception:
                pass

    if sgdb_game is None or not sgdb_game.get("id"):
        return None

    sgdb_id = int(sgdb_game["id"])
    canonical_title = str(sgdb_game.get("name") or title).strip()

    # 3. Fetch artwork payloads concurrently
    grids, heroes, logos, icons = await asyncio.gather(
        provider.get_grids(sgdb_id),
        provider.get_heroes(sgdb_id),
        provider.get_logos(sgdb_id),
        provider.get_icons(sgdb_id),
    )

    return {
        "sgdb_id": sgdb_id,
        "title": canonical_title,
        "grids": grids,
        "heroes": heroes,
        "logos": logos,
        "icons": icons,
        "resolved_by": resolved_by,
    }


def match_epic_game_with_sgdb_data(
    epic_game: UserEpicGame,
    sgdb_data: dict[str, Any],
) -> dict[str, Any]:
    """Synchronously link or create the MediaItem catalog game and attach SteamGridDB artwork."""
    content_type = _media_content_type()
    sgdb_id = sgdb_data["sgdb_id"]
    canonical_title = sgdb_data["title"]

    existing_sg = (
        ExternalID.objects.filter(
            content_type=content_type,
            provider="steamgrid",
            external_id=str(sgdb_id),
            media_type="game",
        )
        .values_list("object_id", flat=True)
        .first()
    )

    media = None
    if existing_sg:
        media = MediaItem.objects.filter(pk=existing_sg).first()

    if media is None:
        key = _comparison_key(canonical_title)
        for m in MediaItem.objects.filter(media_type="game").only("id", "title"):
            if _comparison_key(m.title) == key:
                media = m
                break

    created_media = False
    if media is None:
        base_slug = slugify(canonical_title) or f"game-{sgdb_id}"
        slug = base_slug
        idx = 1
        while MediaItem.objects.filter(slug=slug, media_type="game").exists():
            idx += 1
            slug = f"{base_slug}-{idx}"

        media = MediaItem.objects.create(
            media_type="game",
            title=canonical_title,
            slug=slug,
        )
        Game.objects.create(media_item=media)
        created_media = True

    ExternalID.objects.get_or_create(
        content_type=content_type,
        provider="steamgrid",
        external_id=str(sgdb_id),
        media_type="game",
        defaults={"object_id": media.id},
    )
    for ext in [epic_game.catalog_item_id, epic_game.offer_id, epic_game.app_name]:
        if ext:
            ExternalID.objects.get_or_create(
                content_type=content_type,
                provider="epic",
                external_id=str(ext),
                media_type="game",
                defaults={"object_id": media.id},
            )

    epic_game.media_item_id = media.id
    epic_game.save(update_fields=("media_item_id", "updated_at"))

    assets_added = attach_steamgrid_assets(
        media.id,
        sgdb_id,
        sgdb_data.get("grids") or [],
        sgdb_data.get("heroes") or [],
        sgdb_data.get("logos") or [],
        sgdb_data.get("icons") or [],
    )

    return {
        "matched": True,
        "media_item_id": media.id,
        "created_media": created_media,
        "sgdb_game_id": sgdb_id,
        "title": canonical_title,
        "assets_added": assets_added,
        "resolved_by": sgdb_data.get("resolved_by"),
    }


async def _async_fetch_all(
    unmatched: list[UserEpicGame],
    delay: float,
    provider: SteamGridDBProvider | None,
) -> list[tuple[UserEpicGame, dict[str, Any] | None]]:
    if provider is None:
        sg_provider = SteamGridDBProvider()
    else:
        sg_provider = provider

    results: list[tuple[UserEpicGame, dict[str, Any] | None]] = []
    try:
        for game in unmatched:
            sgdb_data = await fetch_steamgrid_game_data(
                sg_provider,
                catalog_item_id=game.catalog_item_id,
                app_name=game.app_name,
                title=game.title,
            )
            results.append((game, sgdb_data))
            if delay > 0:
                await asyncio.sleep(delay)
    finally:
        try:
            from core.providers.steamgrid.client import close_http_client

            await close_http_client()
        except Exception:
            pass

    return results


def resolve_unmatched_epic_with_steamgrid(
    user,
    *,
    limit: int | None = None,
    delay: float = 0.2,
    provider: SteamGridDBProvider | None = None,
    on_progress: Any | None = None,
) -> dict[str, Any]:
    """Resolve unmatched Epic games using SteamGridDB metadata and artwork.

    Raises ValueError if STEAMGRID_API_KEY is not configured and no custom provider is passed.
    """
    if provider is None:
        api_key = getattr(settings, "STEAMGRID_API_KEY", "")
        if not api_key:
            raise ValueError("SteamGridDB API key is not configured")

    queryset = UserEpicGame.objects.filter(user=user, media_item__isnull=True).order_by(
        "title", "id"
    )
    if limit is not None and limit > 0:
        unmatched = list(queryset[:limit])
    else:
        unmatched = list(queryset)

    if not unmatched:
        return {"total": 0, "matched": 0, "failed": 0, "assets_added": 0}

    batch_size = 10
    matched_count = 0
    total_assets = 0

    for i in range(0, len(unmatched), batch_size):
        chunk = unmatched[i : i + batch_size]
        fetched = asyncio.run(_async_fetch_all(chunk, delay, provider))
        for game, sgdb_data in fetched:
            if sgdb_data is not None:
                res = match_epic_game_with_sgdb_data(game, sgdb_data)
                if res.get("matched"):
                    matched_count += 1
                    total_assets += res.get("assets_added", 0)

        processed = min(i + len(chunk), len(unmatched))
        if on_progress:
            on_progress(processed, len(unmatched), matched_count, total_assets)

    failed_count = len(unmatched) - matched_count

    logger.info(
        "epic-steamgrid resolver user=%s total=%s matched=%s failed=%s assets=%s",
        user.id,
        len(unmatched),
        matched_count,
        failed_count,
        total_assets,
    )
    return {
        "total": len(unmatched),
        "matched": matched_count,
        "failed": failed_count,
        "assets_added": total_assets,
    }
