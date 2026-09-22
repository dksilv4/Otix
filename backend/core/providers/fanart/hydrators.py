"""Fanart.tv artwork enrichment into Django MediaAsset models.

Mirrors and expands ``apps.media.services.fanart_ingest`` to provide
complete supplementary artwork enrichment for movies and shows.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType

from apps.media.models import ExternalID, MediaAsset, MediaItem
from apps.media.services.completeness import recompute_completeness
from core.providers.fanart.transformers import (
    MOVIE_CATEGORIES,
    SHOW_CATEGORIES,
    fanart_asset_specs,
)
from core.providers.framework import NormalizedAsset

if TYPE_CHECKING:
    from core.providers.fanart.client import FanartProvider


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _context(media_item_id: int) -> dict[str, Any] | None:
    """The (kind, lookup_id) Fanart resolves on; ``None`` when inapplicable."""
    media = MediaItem.objects.filter(pk=media_item_id).only("media_type").first()
    if media is None or media.media_type not in ("movie", "show"):
        return None
    provider = "tmdb" if media.media_type == "movie" else "tvdb"
    raw_id = (
        ExternalID.objects.filter(
            content_type=_media_content_type(), provider=provider, object_id=media_item_id
        )
        .values_list("external_id", flat=True)
        .first()
    )
    if raw_id is None:
        return None
    try:
        lookup_id = int(raw_id)
    except (TypeError, ValueError):
        return None
    return {"kind": media.media_type, "lookup_id": lookup_id}


def _apply_assets(media_item_id: int, rows: list[dict[str, Any]]) -> int:
    """Store Fanart asset rows as ``MediaAsset``; return how many were new."""
    media = MediaItem.objects.get(pk=media_item_id)
    added = 0
    for row in rows:
        _, created = MediaAsset.objects.get_or_create(
            media_item=media,
            url=row["url"],
            asset_type=row["asset_type"],
            defaults={
                "label": row.get("label"),
                "provider": "fanart",
                "lang": row.get("lang"),
                "width": row.get("width"),
                "height": row.get("height"),
                "score": row.get("score", 0),
            },
        )
        added += int(created)
    if added:
        recompute_completeness(media)
    return added


def hydrate_normalized_assets(media_item_id: int, assets: list[NormalizedAsset]) -> int:
    """Hydrate NormalizedAsset instances into MediaAsset records."""
    if not assets:
        return 0
    media = MediaItem.objects.get(pk=media_item_id)
    added = 0
    for asset in assets:
        _, created = MediaAsset.objects.get_or_create(
            media_item=media,
            url=asset.url,
            asset_type=asset.asset_type,
            defaults={
                "provider": asset.provider,
                "lang": asset.language,
                "width": asset.width,
                "height": asset.height,
                "score": asset.score,
            },
        )
        added += int(created)
    if added:
        recompute_completeness(media)
    return added


async def fanart_enrich_images(
    media_item_id: int,
    *,
    provider: FanartProvider | None = None,
) -> dict[str, Any]:
    """Fetch + attach a movie/show's Fanart artwork; benign no-op when inapplicable."""
    context = await sync_to_async(_context)(media_item_id)
    if context is None:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no context",
        }
    if provider is None:
        from core.providers.fanart.client import FanartProvider

        provider = FanartProvider()
    if context["kind"] == "movie":
        raw = await provider.get_movie_images(context["lookup_id"])
        categories = MOVIE_CATEGORIES
    else:
        raw = await provider.get_show_images(context["lookup_id"])
        categories = SHOW_CATEGORIES
    if not raw:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no result",
        }
    rows = fanart_asset_specs(raw, categories)
    if not rows:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no assets",
        }
    added = await sync_to_async(_apply_assets)(media_item_id, rows)
    return {
        "media_item_id": media_item_id,
        "kind": context["kind"],
        "assets": added,
        "enriched": added > 0,
        "reason": None,
    }
