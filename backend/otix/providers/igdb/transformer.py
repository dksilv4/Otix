# TODO: Review this file
"""IGDB JSON → domain models.

Stateless pure functions. Converts IGDB API v4 responses to Game, MediaItem,
and related domain objects.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime

from otix.domain.media import Game, MediaItem
from otix.lib.slug import slugify as _slugify
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
        return datetime.fromtimestamp(float(ts), tz=UTC).date()
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


def extract_platforms(platforms: list[JSONValue]) -> list[dict]:
    """Convert IGDB platforms list to hydrator-ready dicts.

    [{"name": "PC"}, {"name": "PlayStation 5"}] → [{"name": "PC", "slug": "pc"}, ...]
    """
    if not platforms:
        return []
    result: list[dict] = []
    seen: set[str] = set()
    for p in platforms:
        if not isinstance(p, dict):
            continue
        name = p.get("name")
        if not isinstance(name, str) or not name:
            continue
        slug = _slugify(name)
        if slug in seen:
            continue
        seen.add(slug)
        entry: dict = {"name": name, "slug": slug}
        logo = p.get("platform_logo", {})
        if isinstance(logo, dict) and logo.get("image_id"):
            entry["logo_image_id"] = logo["image_id"]
        result.append(entry)
    return result


def extract_modes(game_modes: list[JSONValue]) -> list[dict]:
    """Convert IGDB game_modes list to hydrator-ready dicts.

    [{"name": "Single player"}, {"name": "Multiplayer"}] → [{"name": "Single player", "slug": "single-player"}, ...]
    """
    if not game_modes:
        return []
    result: list[dict] = []
    seen: set[str] = set()
    for m in game_modes:
        if not isinstance(m, dict):
            continue
        name = m.get("name")
        if not isinstance(name, str) or not name:
            continue
        slug = _slugify(name)
        if slug in seen:
            continue
        seen.add(slug)
        result.append({"name": name, "slug": slug})
    return result


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
    """Extract the Steam app ID from IGDB websites (type 13 = Steam).

    Parses URLs like https://store.steampowered.com/app/292030/ or
    https://steamcommunity.com/app/292030.
    """
    if not websites:
        return None
    for w in websites:
        if not isinstance(w, dict):
            continue
        if w.get("type") == 13:
            url = w.get("url", "")
            if isinstance(url, str):
                match = re.search(r"/app/(\d+)", url)
                if match:
                    return int(match.group(1))
    return None


# SGDB-supported platforms. Maps URL pattern → (platform_slug, id_cast).
# Patterns are tried in order; first match wins per website entry.
_STORE_PATTERNS: list[tuple[str, str, type]] = [
    (r"store\.steampowered\.com/app/(\d+)", "steam", int),
    (r"steamcommunity\.com/app/(\d+)", "steam", int),
    # EGS: two URL formats — /p/slug (short) and /product/slug/... (full)
    (r"epicgames\.com.*/p/([^/?&#]+)", "egs", str),
    (r"epicgames\.com.*/product/([^/?&#]+)", "egs", str),
    (r"ea\.com/(?:[a-z]{2}-[a-z]{2}/)?game/[^/]+/([^/?&#]+)", "origin", str),
    (r"origin\.com.*/store/[^/]+/([^/?&#]+)", "origin", str),
    (r"ubisoft\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?game/[^/]+/([^/?&#]+)", "uplay", str),
    (r"store\.ubi\.com.*/([^/?&#]+)", "uplay", str),
    (r"play\.nintendo\.com.*/([^/?&#]+)", "eshop", str),
    (r"nintendo\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?store/products/([^/?&#]+)", "eshop", str),
    (r"nintendo\.com/game/detail/([^/?&#]+)", "eshop", str),
    (r"battle\.net.*/([^/?&#]+)", "bnet", str),
    (r"gog\.com/(?:[a-z]{2}/)?game/([^/?&#]+)", "gog", str),
    (r"gog\.com/game/([^/?&#]+)", "gog", str),
    (r"store\.playstation\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?product/([^/?&#]+)", "playstation", str),
    (r"playstation\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?game/[^/]+/([^/?&#]+)", "playstation", str),
    (r"xbox\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?game/store/[^/]+/([^/?&#]+)", "xbox", str),
    (r"microsoft\.com/(?:[a-z]{2}(?:-[a-z]{2})?/)?store/p/[^/]+/([^/?&#]+)", "xbox", str),
    (r"itch\.io/s/(\d+)", "itchio", int),
    (r"itch\.io.*/([^/?&#]+)", "itchio", str),
]


def _extract_store_ids(websites: list[JSONValue]) -> dict[str, str | int] | None:
    """Extract all platform store IDs from IGDB websites.

    Matches URLs against known store patterns (Steam, EGS, Origin, Uplay,
    Battle.net, Nintendo eShop). Stores every matched platform → id mapping.
    """
    if not websites:
        return None
    result: dict[str, str | int] = {}
    for w in websites:
        if not isinstance(w, dict):
            continue
        url = w.get("url", "")
        if not isinstance(url, str) or not url:
            continue
        for pattern, platform, cast in _STORE_PATTERNS:
            match = re.search(pattern, url, re.IGNORECASE)
            if match:
                try:
                    result[platform] = cast(match.group(1))
                except (ValueError, TypeError):
                    pass
                break  # first matching pattern per website wins
    return result if result else None


# IGDB external_games.external_game_source enum → Otix provider slug.
# Only storefronts carrying a usable store/product ID are mapped; social
# (YouTube 10, Twitch 14), retail (Amazon 20/22/23) and cloud-only
# (Game Pass Cloud 54) sources are skipped. 3 is undocumented/legacy.
_EXTERNAL_GAME_SOURCES: dict[int, str] = {
    1: "steam",        # Steam
    5: "gog",          # GOG
    11: "microsoft",   # Microsoft Store
    13: "apple",       # Apple App Store
    15: "android",     # Google Play / Android
    26: "egs",         # Epic Games Store
    30: "itchio",      # Itch.io
    31: "xbox",        # Xbox Marketplace
    36: "playstation", # PlayStation Store (US)
}


def extract_external_games(raw: dict[str, JSONValue]) -> dict[str, str] | None:
    """Extract store IDs from IGDB external_games.

    Returns ``{provider_slug: external_id}`` for each entry whose
    external_game_source maps to a known storefront. Website-derived store
    IDs (``extract_store_ids``) are higher quality, so callers should merge
    this dict *under* those (website wins on conflict). First UID wins per
    provider.
    """
    entries = raw.get("external_games")
    if not isinstance(entries, list) or not entries:
        return None
    result: dict[str, str] = {}
    for e in entries:
        if not isinstance(e, dict):
            continue
        provider = _EXTERNAL_GAME_SOURCES.get(e.get("external_game_source"))
        uid = e.get("uid")
        if provider and isinstance(uid, str) and uid:
            result.setdefault(provider, uid)
    return result if result else None


def extract_involved_companies(raw: dict[str, JSONValue]) -> list[dict]:
    """Extract involved companies from IGDB response.

    Returns a list of {company_name, company_slug, igdb_id, logo_image_id,
    developer, publisher, porting, supporting}.
    """
    involved = raw.get("involved_companies", [])
    if not isinstance(involved, list):
        return []

    result: list[dict] = []
    for ic in involved:
        if not isinstance(ic, dict):
            continue
        company = ic.get("company")
        if not isinstance(company, dict):
            continue
        name = company.get("name")
        if not isinstance(name, str) or not name:
            continue

        # Extract logo image_id if present
        logo_image_id = None
        logo = company.get("logo")
        if isinstance(logo, dict):
            lid = logo.get("image_id")
            if isinstance(lid, str) and lid:
                logo_image_id = lid

        result.append(
            {
                "company_name": name,
                "company_slug": company.get("slug") or _slugify(name),
                "igdb_id": company.get("id"),
                "logo_image_id": logo_image_id,
                "developer": bool(ic.get("developer")),
                "publisher": bool(ic.get("publisher")),
                "porting": bool(ic.get("porting")),
                "supporting": bool(ic.get("supporting")),
            }
        )
    return result


def to_media_item(raw: dict[str, JSONValue]) -> MediaItem:
    """Convert IGDB game JSON to a MediaItem."""
    title = raw.get("name") or ""
    overview = raw.get("storyline") or raw.get("summary")

    return MediaItem(
        media_type="game",
        title=title,
        overview=overview,
        slug=raw.get("slug") or _slugify(title),
        release_date=_parse_timestamp(raw.get("first_release_date")),
        popularity=float(raw.get("hypes", 0) or 0),
    )


def extract_franchise(raw: dict[str, JSONValue]) -> dict[str, int | str] | None:
    """Extract IGDB franchise data from a game response.

    Returns ``{"id": int, "name": str}`` or None.
    """
    franchise = raw.get("franchise")
    if isinstance(franchise, dict):
        fid = franchise.get("id")
        fname = franchise.get("name")
        if isinstance(fid, (int, float)) and isinstance(fname, str) and fname:
            return {"id": int(fid), "name": fname}
    return None


def to_game(raw: dict[str, JSONValue]) -> Game:
    """Convert IGDB game JSON to a Game with its MediaItem.

    Maps IGDB fields to the Game domain model:
      - status → release_status (human-readable)
      - websites → website (single URL, prefers official)

    Platforms, game modes, and companies are hydrated separately via
    IGDBHydrator. steam_app_id and store_ids are extracted separately
    via _extract_steam_app_id / _extract_store_ids helpers.
    """
    websites = raw.get("websites", [])
    modes = raw.get("game_modes", [])
    modes_list = modes if isinstance(modes, list) else []
    has_multiplayer = any(
        "multiplayer" in _slugify(m.get("name", "")) for m in modes_list if isinstance(m, dict) and m.get("name")
    )

    website_list = websites if isinstance(websites, list) else []
    game = Game(
        release_status=_STATUS_MAP.get(raw.get("status")),
        website=_extract_website(website_list),
        has_multiplayer=has_multiplayer,
        is_free=False,  # explicit default; Steam enrichment updates later
        time_to_beat=raw.get("time_to_beat"),
    )
    game.media_item = to_media_item(raw)
    return game
