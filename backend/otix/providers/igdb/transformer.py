"""IGDB JSON → domain models.

Stateless pure functions. Converts IGDB API v4 responses to Game, MediaItem,
and related domain objects.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

from otix.domain.media import Game, MediaItem
from otix.lib.types import JSONValue

_STATUS_MAP: dict[int, str] = {
    0: "released",
    2: "alpha",
    3: "beta",
    4: "early_access",
    5: "offline",
    6: "cancelled",
}


def _parse_timestamp(ts: int | float | None) -> date | None:
    """Convert a Unix timestamp to a date."""
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(float(ts), tz=timezone.utc).date()
    except (ValueError, TypeError, OSError):
        return None


def _cover_url(image_id: str | None, size: str = "t_cover_big") -> str | None:
    """Build an IGDB image URL from an image_id.

    Size options: t_cover_small, t_cover_big, t_screenshot_med, t_screenshot_big,
    t_720p, t_1080p, t_logo_med, t_thumb, t_micro.
    """
    if not image_id:
        return None
    return f"https://images.igdb.com/igdb/image/upload/{size}/{image_id}.jpg"


def _slugify(title: str) -> str:
    slug = title.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    if len(slug) > 200:
        slug = slug[:200].rsplit("-", 1)[0]
    return slug


def _extract_platforms(platforms: list[JSONValue]) -> dict[str, dict] | None:
    """Convert IGDB platforms list to a name-keyed dict for JSONB storage.

    [{"name": "PC"}, {"name": "PlayStation 5"}] → {"pc": {"name": "PC"}, ...}
    """
    if not platforms:
        return None
    result: dict[str, dict] = {}
    for p in platforms:
        if not isinstance(p, dict):
            continue
        name = p.get("name")
        if not isinstance(name, str) or not name:
            continue
        key = _slugify(name)
        result[key] = {"name": name}
        logo_id = p.get("platform_logo", {})
        if isinstance(logo_id, dict) and logo_id.get("image_id"):
            result[key]["logo_image_id"] = logo_id["image_id"]
    return result or None


def _extract_modes(game_modes: list[JSONValue]) -> dict[str, dict] | None:
    """Convert IGDB game_modes list to a name-keyed dict for JSONB storage.

    [{"name": "Single player"}, {"name": "Multiplayer"}] → {"single-player": {"name": "Single player"}, ...}
    """
    if not game_modes:
        return None
    result: dict[str, dict] = {}
    for m in game_modes:
        if not isinstance(m, dict):
            continue
        name = m.get("name")
        if not isinstance(name, str) or not name:
            continue
        result[_slugify(name)] = {"name": name}
    return result or None


def _extract_website(websites: list[JSONValue]) -> str | None:
    """Extract the official website URL from IGDB websites list.

    Prefers category 1 (official), falls back to first URL.
    """
    if not websites:
        return None
    for w in websites:
        if not isinstance(w, dict):
            continue
        if w.get("category") == 1:
            url = w.get("url")
            if isinstance(url, str) and url:
                return url
    # Fallback: first URL
    first = websites[0]
    if isinstance(first, dict):
        url = first.get("url")
        if isinstance(url, str) and url:
            return url
    return None


def _extract_steam_app_id(websites: list[JSONValue]) -> int | None:
    """Extract the Steam app ID from IGDB websites (category 13).

    Parses URLs like https://store.steampowered.com/app/292030/ or
    https://steamcommunity.com/app/292030.
    """
    if not websites:
        return None
    for w in websites:
        if not isinstance(w, dict):
            continue
        if w.get("category") == 13:
            url = w.get("url", "")
            if isinstance(url, str):
                match = re.search(r"/app/(\d+)", url)
                if match:
                    return int(match.group(1))
    return None


def to_media_item(raw: dict[str, JSONValue]) -> MediaItem:
    """Convert IGDB game JSON to a MediaItem."""
    title = raw.get("name") or ""
    overview = raw.get("storyline") or raw.get("summary")

    # Backdrop: first artwork (typically landscape/wallpaper format)
    backdrop_url = None
    artworks = raw.get("artworks")
    if isinstance(artworks, list) and artworks:
        first = artworks[0]
        if isinstance(first, dict):
            backdrop_url = _cover_url(first.get("image_id"), "t_1080p")

    return MediaItem(
        media_type="game",
        title=title,
        overview=overview,
        slug=raw.get("slug") or _slugify(title),
        poster_url=_cover_url(
            (raw.get("cover") or {}).get("image_id") if isinstance(raw.get("cover"), dict) else None
        ),
        backdrop_url=backdrop_url,
        release_date=_parse_timestamp(raw.get("first_release_date")),
        popularity=float(raw.get("hypes", 0) or 0),
    )


def to_game(raw: dict[str, JSONValue]) -> Game:
    """Convert IGDB game JSON to a Game with its MediaItem.

    Maps IGDB fields to the Game domain model:
      - status → release_status (human-readable)
      - websites → website (single URL, prefers official)
      - platforms → JSONB dict
      - game_modes → JSONB dict
    """
    websites = raw.get("websites", [])
    platforms = raw.get("platforms", [])
    modes = raw.get("game_modes", [])

    modes_list = modes if isinstance(modes, list) else []
    modes_dict = _extract_modes(modes_list)
    has_multiplayer = any(
        "multiplayer" in _slugify(m.get("name", ""))
        for m in modes_list
        if isinstance(m, dict) and m.get("name")
    )

    website_list = websites if isinstance(websites, list) else []
    game = Game(
        release_status=_STATUS_MAP.get(raw.get("status")),
        website=_extract_website(website_list),
        steam_app_id=_extract_steam_app_id(website_list),
        platforms=_extract_platforms(platforms if isinstance(platforms, list) else []),
        modes=modes_dict,
        has_multiplayer=has_multiplayer,
    )
    game.media_item = to_media_item(raw)
    return game
