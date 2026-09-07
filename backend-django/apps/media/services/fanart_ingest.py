"""Fanart.tv artwork enrichment — movie/show logo/textless/backdrop assets.

The keyed secondary-provider enrich stage of the ingestion overhaul for
movies/shows (plan item 1.8; ``core.providers.fanart`` is the ported async
client). Fanart is authoritative for the logo/textless families TMDB doesn't
ship well, so a TMDB-seeded movie (resolved by its ``tmdb`` ExternalID) or show
(resolved by its ``tvdb`` ExternalID) is looked up on Fanart and its artwork
maps onto the Django ``MediaAsset`` graph as one row per (item, url, type):

- multicolor logos (``hdmovielogo``/``movielogo``/``hdtvlogo``/``clearlogo``/
  ``tvlogo``) -> ``logo``,
- official posters (``movieposter``/``tvposter``/``seasonposter``) whose ``lang``
  marks them language-neutral (``None``/``""``/``0``/``00``/``zxx``) ->
  ``textless_poster``; other posters -> ``poster``,
- backgrounds (``moviebackground``/``showbackground``) -> ``backdrop``.

The music endpoint is deferred by the 2026-09-07 audio scope cut (no artist
logos / album covers). Enrichment is best-effort + media-first: an unset
``FANART_API_KEY``, a movie/show with no resolvable tmdb/tvdb ExternalID, or a
Fanart miss are all benign no-ops. The async driver runs its DB read + write via
``sync_to_async`` (worker-thread), so its async tests stub those helpers — real
DB behavior is covered by the sync ``TestCase`` methods.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType

from apps.media.models import ExternalID, MediaAsset, MediaItem
from apps.media.services.completeness import recompute_completeness

if TYPE_CHECKING:
    from core.providers.fanart import FanartProvider

# (fanart_category, family) — the movie/show categories that map onto the tracked
# MediaAsset families. Textless handling is resolved per entry inside the extractor.
_MOVIE_CATEGORIES: list[tuple[str, str]] = [
    ("hdmovielogo", "logo"),
    ("movielogo", "logo"),
    ("movieposter", "poster"),
    ("moviebackground", "backdrop"),
]

_SHOW_CATEGORIES: list[tuple[str, str]] = [
    ("hdtvlogo", "logo"),
    ("clearlogo", "logo"),
    ("tvlogo", "logo"),
    ("tvposter", "poster"),
    ("seasonposter", "poster"),
    ("showbackground", "backdrop"),
]

# Fanart category -> label. Movie/TV logos are multicolor art on transparent
# backgrounds; the poster/backdrop categories are official renders.
_FAMILY_LABELS: dict[str, str] = {
    "hdmovielogo": "multicolor",
    "movielogo": "multicolor",
    "hdtvlogo": "multicolor",
    "clearlogo": "multicolor",
    "tvlogo": "multicolor",
    "movieposter": "official",
    "tvposter": "official",
    "seasonposter": "official",
    "moviebackground": "official",
    "showbackground": "official",
}

# Scores keep the TMDB primary poster/backdrop (100) ahead of Fanart variants,
# while Fanart logos/textless posters (90) rank above TMDB's 60-series secondary
# artwork — Fanart is authoritative for those families.
_TYPE_SCORES: dict[str, int] = {
    "logo": 90,
    "textless_poster": 90,
    "poster": 55,
    "backdrop": 55,
}

# Fanart marks textless artwork with a blank/"0"/"00"/"zxx" language code.
_TEXTLESS_LANGS = {"", "0", "00", "zxx"}

_MAX_PER_TYPE = 8


def _int_or_none(raw: Any) -> int | None:
    if isinstance(raw, bool) or not isinstance(raw, int):
        return None
    return raw


def _fanart_assets(
    raw: dict[str, Any],
    categories: list[tuple[str, str]],
    *,
    max_per_type: int = _MAX_PER_TYPE,
) -> list[dict[str, Any]]:
    """Extract one deduped asset row per (url, type) for the tracked families.

    Poster-family entries whose ``lang`` marks them language-neutral become
    ``textless_poster``; the rest stay ``poster``. Rows are capped per type so a
    well-stocked Fanart page never floods the item.
    """
    counts: dict[str, int] = {}
    rows: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for category, family in categories:
        for entry in raw.get(category) or []:
            if not isinstance(entry, dict):
                continue
            url = entry.get("url")
            if not isinstance(url, str) or not url:
                continue
            lang_raw = entry.get("lang")
            lang = lang_raw[:10] if isinstance(lang_raw, str) and lang_raw else None
            asset_type = family
            if family == "poster" and lang in _TEXTLESS_LANGS:
                asset_type = "textless_poster"
            if (url, asset_type) in seen or counts.get(asset_type, 0) >= max_per_type:
                continue
            seen.add((url, asset_type))
            counts[asset_type] = counts.get(asset_type, 0) + 1
            rows.append(
                {
                    "asset_type": asset_type,
                    "url": url,
                    "label": _FAMILY_LABELS.get(category, "official"),
                    "lang": None if asset_type == "textless_poster" else lang,
                    "width": _int_or_none(entry.get("width")),
                    "height": _int_or_none(entry.get("height")),
                    "score": _TYPE_SCORES[asset_type],
                }
            )
    return rows


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _context(media_item_id: int) -> dict[str, Any] | None:
    """The (kind, lookup_id) Fanart resolves on; ``None`` when inapplicable.

    Movies resolve by TMDB id, shows by TVDB id (Fanart's key space). ``None``
    for a game/music row or a movie/show with no usable external id — nothing to
    look up by.
    """
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
    """Store Fanart asset rows as ``MediaAsset``; return how many were new.

    Idempotent on (item, url, type); recomputes the item's completeness score
    whenever at least one new asset landed (logos/textless/backdrops flip flags).
    """
    media = MediaItem.objects.get(pk=media_item_id)
    added = 0
    for row in rows:
        _, created = MediaAsset.objects.get_or_create(
            media_item=media,
            url=row["url"],
            asset_type=row["asset_type"],
            defaults={
                "label": row["label"],
                "provider": "fanart",
                "lang": row["lang"],
                "width": row["width"],
                "height": row["height"],
                "score": row["score"],
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
    """Fetch + attach a movie/show's Fanart artwork; benign no-op when inapplicable.

    Media-first: a movie/show with no resolvable external id returns without a
    fetch; a Fanart miss or an item Fanart has no tracked artwork for is also a
    benign no-op, never a hard failure — enrichment is best-effort. *provider* is
    injectable for tests and defaults to a real Fanart client.
    """
    context = await sync_to_async(_context)(media_item_id)
    if context is None:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no context",
        }
    if provider is None:
        from core.providers.fanart import FanartProvider  # local: avoid eager build

        provider = FanartProvider()
    if context["kind"] == "movie":
        raw = await provider.get_movie_images(context["lookup_id"])
        categories = _MOVIE_CATEGORIES
    else:
        raw = await provider.get_show_images(context["lookup_id"])
        categories = _SHOW_CATEGORIES
    if not raw:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "reason": "no result",
        }
    rows = _fanart_assets(raw, categories)
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
