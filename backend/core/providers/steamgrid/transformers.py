"""Pure transformer functions for SteamGridDB API payloads.

Transforms upstream grid, hero, logo, and icon responses into canonical
``NormalizedAsset`` instances defined in ``core.providers.framework``.
"""

from __future__ import annotations

from typing import Any

from core.providers.framework import NormalizedAsset

# Style -> label mapping per artwork family
_LOGO_LABELS: dict[str, str] = {
    "official": "multicolor",
    "white": "white",
    "black": "black",
    "custom": "custom",
}
_GRID_LABELS: dict[str, str] = {
    "no_logo": "textless",
    "material": "material",
    "alternate": "alternate",
    "blurred": "blurred",
    "white": "white",
    "white_logo": "white_logo",
}
_HERO_LABELS: dict[str, str] = {
    "material": "material",
    "blurred": "blurred",
    "alternate": "alternate",
}
_ICON_LABELS: dict[str, str] = {
    "official": "official",
    "custom": "custom",
}
_TEXTLESS_STYLES: frozenset[str] = frozenset({"no_logo", "material"})


def get_style_label(kind: str, style: str | None) -> str | None:
    """Resolve the display label for a SteamGridDB artwork style."""
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


def get_asset_type(kind: str) -> str:
    """Map a SteamGridDB entity kind to a canonical asset type."""
    if kind == "grid":
        return "poster"
    if kind == "hero":
        return "backdrop"
    return kind  # logo/icon map 1:1


def _safe_int(val: Any, default: int | None = None) -> int | None:
    if val is None or isinstance(val, bool):
        return default
    try:
        return int(val)
    except (ValueError, TypeError):
        return default


def _color_guess_for(kind: str, style: str | None) -> str | None:
    if not style:
        return None
    s = str(style).lower().strip()
    if kind == "logo":
        if s == "white":
            return "guess_white"
        if s == "black":
            return "guess_black"
        if s == "official":
            return "guess_multicolor"
    elif kind == "grid":
        if s in ("white", "white_logo"):
            return "guess_white"
    return None


def transform_grid(entry: dict[str, Any]) -> list[NormalizedAsset]:
    """Transform a single SteamGridDB grid dictionary into NormalizedAsset instances.

    A grid styled as ``no_logo`` or ``material`` yields both a ``poster`` asset
    and a ``textless_poster`` asset sharing the same URL.
    """
    url = entry.get("url")
    if not url or not isinstance(url, str):
        return []

    style = entry.get("style")
    score = _safe_int(entry.get("score"), 0) or 0
    width = _safe_int(entry.get("width"))
    height = _safe_int(entry.get("height"))
    language = entry.get("language") if isinstance(entry.get("language"), str) else None
    color_guess = _color_guess_for("grid", style)

    primary = NormalizedAsset(
        asset_type="poster",
        url=url,
        provider="steamgrid",
        score=score,
        width=width,
        height=height,
        language=language,
        style=style,
        color_guess=color_guess,
    )

    if style in _TEXTLESS_STYLES:
        textless = NormalizedAsset(
            asset_type="textless_poster",
            url=url,
            provider="steamgrid",
            score=score,
            width=width,
            height=height,
            language=language,
            style=style,
            color_guess=color_guess,
        )
        return [primary, textless]

    return [primary]


def transform_hero(entry: dict[str, Any]) -> NormalizedAsset | None:
    """Transform a single SteamGridDB hero dictionary into a NormalizedAsset backdrop."""
    url = entry.get("url")
    if not url or not isinstance(url, str):
        return None

    style = entry.get("style")
    score = _safe_int(entry.get("score"), 0) or 0
    width = _safe_int(entry.get("width"))
    height = _safe_int(entry.get("height"))
    language = entry.get("language") if isinstance(entry.get("language"), str) else None

    return NormalizedAsset(
        asset_type="backdrop",
        url=url,
        provider="steamgrid",
        score=score,
        width=width,
        height=height,
        language=language,
        style=style,
        color_guess=_color_guess_for("hero", style),
    )


def transform_logo(entry: dict[str, Any]) -> NormalizedAsset | None:
    """Transform a single SteamGridDB logo dictionary into a NormalizedAsset logo."""
    url = entry.get("url")
    if not url or not isinstance(url, str):
        return None

    style = entry.get("style")
    score = _safe_int(entry.get("score"), 0) or 0
    width = _safe_int(entry.get("width"))
    height = _safe_int(entry.get("height"))
    language = entry.get("language") if isinstance(entry.get("language"), str) else None

    return NormalizedAsset(
        asset_type="logo",
        url=url,
        provider="steamgrid",
        score=score,
        width=width,
        height=height,
        language=language,
        style=style,
        color_guess=_color_guess_for("logo", style),
    )


def transform_icon(entry: dict[str, Any]) -> NormalizedAsset | None:
    """Transform a single SteamGridDB icon dictionary into a NormalizedAsset icon."""
    url = entry.get("url")
    if not url or not isinstance(url, str):
        return None

    style = entry.get("style")
    score = _safe_int(entry.get("score"), 0) or 0
    width = _safe_int(entry.get("width"))
    height = _safe_int(entry.get("height"))
    language = entry.get("language") if isinstance(entry.get("language"), str) else None

    return NormalizedAsset(
        asset_type="icon",
        url=url,
        provider="steamgrid",
        score=score,
        width=width,
        height=height,
        language=language,
        style=style,
        color_guess=_color_guess_for("icon", style),
    )


def transform_assets(
    grids: list[dict[str, Any]] | None = None,
    heroes: list[dict[str, Any]] | None = None,
    logos: list[dict[str, Any]] | None = None,
    icons: list[dict[str, Any]] | None = None,
) -> list[NormalizedAsset]:
    """Transform combined SteamGridDB response collections into a unified list of
    NormalizedAsset.
    """
    results: list[NormalizedAsset] = []

    for entry in grids or []:
        if isinstance(entry, dict):
            results.extend(transform_grid(entry))

    for entry in heroes or []:
        if isinstance(entry, dict):
            asset = transform_hero(entry)
            if asset is not None:
                results.append(asset)

    for entry in logos or []:
        if isinstance(entry, dict):
            asset = transform_logo(entry)
            if asset is not None:
                results.append(asset)

    for entry in icons or []:
        if isinstance(entry, dict):
            asset = transform_icon(entry)
            if asset is not None:
                results.append(asset)

    return results
