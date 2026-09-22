"""Pure transformer functions for Fanart.tv API payloads.

Extracts and normalizes movie and show artwork into canonical ``NormalizedAsset``
instances defined in ``core.providers.framework``.
"""

from __future__ import annotations

from typing import Any

from core.providers.framework import NormalizedAsset

# (fanart_category, family)
MOVIE_CATEGORIES: list[tuple[str, str]] = [
    ("hdmovielogo", "logo"),
    ("movielogo", "logo"),
    ("movieposter", "poster"),
    ("moviebackground", "backdrop"),
]

SHOW_CATEGORIES: list[tuple[str, str]] = [
    ("hdtvlogo", "logo"),
    ("clearlogo", "logo"),
    ("tvlogo", "logo"),
    ("tvposter", "poster"),
    ("seasonposter", "poster"),
    ("showbackground", "backdrop"),
]

FAMILY_LABELS: dict[str, str] = {
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

TYPE_SCORES: dict[str, int] = {
    "logo": 90,
    "textless_poster": 90,
    "poster": 55,
    "backdrop": 55,
}

TEXTLESS_LANGS: frozenset[str] = frozenset({"", "0", "00", "zxx"})
MAX_PER_TYPE: int = 8


def _int_or_none(raw: Any) -> int | None:
    if isinstance(raw, bool) or not isinstance(raw, int):
        return None
    return raw


def transform_fanart_assets(
    raw: dict[str, Any],
    categories: list[tuple[str, str]],
    *,
    max_per_type: int = MAX_PER_TYPE,
) -> list[NormalizedAsset]:
    """Extract deduped NormalizedAsset instances for the given category mapping.

    Poster-family entries whose ``lang`` marks them language-neutral become
    ``textless_poster`` with a null language; the rest retain their language
    and stay ``poster``.
    """
    counts: dict[str, int] = {}
    assets: list[NormalizedAsset] = []
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
            if family == "poster" and (lang is None or lang in TEXTLESS_LANGS):
                asset_type = "textless_poster"
                lang = None

            if (url, asset_type) in seen or counts.get(asset_type, 0) >= max_per_type:
                continue

            seen.add((url, asset_type))
            counts[asset_type] = counts.get(asset_type, 0) + 1

            assets.append(
                NormalizedAsset(
                    asset_type=asset_type,
                    url=url,
                    provider="fanart",
                    score=TYPE_SCORES.get(asset_type, 50),
                    width=_int_or_none(entry.get("width")),
                    height=_int_or_none(entry.get("height")),
                    language=lang,
                )
            )

    return assets


def transform_movie_assets(
    raw: dict[str, Any],
    *,
    max_per_type: int = MAX_PER_TYPE,
) -> list[NormalizedAsset]:
    """Transform raw Fanart movie artwork payload into NormalizedAsset instances."""
    return transform_fanart_assets(raw, MOVIE_CATEGORIES, max_per_type=max_per_type)


def transform_show_assets(
    raw: dict[str, Any],
    *,
    max_per_type: int = MAX_PER_TYPE,
) -> list[NormalizedAsset]:
    """Transform raw Fanart show artwork payload into NormalizedAsset instances."""
    return transform_fanart_assets(raw, SHOW_CATEGORIES, max_per_type=max_per_type)


def fanart_asset_specs(
    raw: dict[str, Any],
    categories: list[tuple[str, str]],
    *,
    max_per_type: int = MAX_PER_TYPE,
) -> list[dict[str, Any]]:
    """Extract dict specs suitable for MediaAsset persistence."""
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
            if family == "poster" and (lang is None or lang in TEXTLESS_LANGS):
                asset_type = "textless_poster"

            if (url, asset_type) in seen or counts.get(asset_type, 0) >= max_per_type:
                continue

            seen.add((url, asset_type))
            counts[asset_type] = counts.get(asset_type, 0) + 1

            rows.append(
                {
                    "asset_type": asset_type,
                    "url": url,
                    "label": FAMILY_LABELS.get(category, "official"),
                    "lang": None if asset_type == "textless_poster" else lang,
                    "width": _int_or_none(entry.get("width")),
                    "height": _int_or_none(entry.get("height")),
                    "score": TYPE_SCORES.get(asset_type, 50),
                }
            )

    return rows
