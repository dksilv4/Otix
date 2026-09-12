"""Steam library/wishlist scan services.

Ports the fetch+upsert core of the legacy ``steam_library_service`` ``scan``
functions (``POST /integrations/steam/scan`` and ``/steam/wishlist/scan``):
fetch the user's owned games (Steam Web API) or wishlist (Steam Store), match
appids to catalog games via existing ``steam`` ``ExternalID`` rows (stage 1),
then upsert ``UserSteamGame`` / ``UserSteamWishlist`` rows. The outbound call
goes through the module ``_request`` leaf (urllib, no rate limiter — legacy
noted these are one-off scans).

The legacy ``scan_steam_library`` ends by delegating unmatched games to the
IGDB ``GameMatcher`` resolver (4-stage pipeline) which is not ported (platform
wave). We keep the full 5-field response shape: ``resolved``/``synced`` stay 0
and ``failed`` reports the apps that remain unmatched after the stage-1 pass.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings
from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import UserSteamGame, UserSteamWishlist
from apps.media.models import ExternalID, MediaItem

logger = logging.getLogger(__name__)

STEAM_API_BASE = "https://api.steampowered.com"
STEAM_WISHLIST_TMPL = (
    "https://store.steampowered.com/wishlist/profiles/{steam_id}/wishlistdata/?p=0"
)


def _request(url: str, *, timeout: float = 30.0) -> tuple[int, str]:
    """Return ``(status, body_text)``; raises ``urllib``/``OSError`` on network
    failure (callers wrap those as the legacy RuntimeError)."""
    request = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")


def _coerce_int(value) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _steam_external_id_map(steam_app_ids: list[int]) -> dict[int, int]:
    """Map owned/wishlisted steam appids to catalog ``MediaItem`` ids (stage 1)."""
    appid_strs = [str(appid) for appid in steam_app_ids]
    rows = ExternalID.objects.filter(
        content_type=_media_content_type(),
        provider="steam",
        external_id__in=appid_strs,
    ).values_list("external_id", "object_id")
    return {int(external_id): media_id for external_id, media_id in rows}


def _fetch_owned_games(steam_id: str) -> list[dict]:
    """Fetch owned games from the Steam Web API; ``[]`` on a private profile."""
    query = urllib.parse.urlencode(
        {
            "key": settings.STEAM_API_KEY,
            "steamid": steam_id,
            "include_appinfo": 1,
            "include_played_free_games": 1,
        }
    )
    url = f"{STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/?{query}"
    try:
        status, body = _request(url)
    except Exception as exc:
        raise RuntimeError(f"Failed to connect to Steam API: {exc}") from exc

    if status in (401, 403):
        logger.warning("steam profile is private or api key invalid steam_id=%s", steam_id)
        return []
    if status != 200:
        logger.warning("steam owned game unexpected status=%s steam_id=%s", status, steam_id)
        raise RuntimeError(f"Steam API returned {status}")

    data = json.loads(body)
    games = (data.get("response") or {}).get("games") or (data.get("response") or {}).get("game")
    if isinstance(games, list):
        return games
    return []


def _fetch_wishlist(steam_id: str) -> list[dict]:
    """Fetch a wishlist from the Steam Store API; ``[]`` when private/inaccessible."""
    url = STEAM_WISHLIST_TMPL.format(steam_id=steam_id)
    try:
        status, body = _request(url)
    except Exception as exc:
        raise RuntimeError(f"Failed to connect to Steam Store: {exc}") from exc

    if status in (301, 302, 303, 307, 308, 401, 403):
        logger.warning("steam wishlist is private or inaccessible steam_id=%s", steam_id)
        return []
    if status != 200:
        logger.warning("steam wishlist unexpected status=%s steam_id=%s", status, steam_id)
        raise RuntimeError(f"Steam Store returned {status}")
    if body.lstrip().lower().startswith(("<!doctype", "<html")):
        logger.warning("steam wishlist returned HTML (likely private) steam_id=%s", steam_id)
        return []
    try:
        data = json.loads(body)
    except ValueError:
        logger.warning("steam wishlist response is not valid JSON steam_id=%s", steam_id)
        return []
    if not isinstance(data, dict):
        return []

    items: list[dict] = []
    for appid_str, info in data.items():
        if not isinstance(info, dict):
            continue
        appid = _coerce_int(appid_str)
        if appid is None:
            continue
        items.append(
            {
                "appid": appid,
                "name": info.get("name", f"Steam App {appid}"),
                "priority": _coerce_int(info.get("priority")) or 0,
                "added_date": _coerce_int(info.get("added")),
                "is_free": bool(info.get("is_free_game", False)),
            }
        )
    return items


def scan_steam_library(user) -> dict:
    """Fetch the user's Steam library, match to catalog games, store the rows.

    Returns ``{total_in_steam, matched_in_otix, resolved, synced, failed}`` —
    ``resolved``/``synced`` are the IGDB resolver's counters (deferred) and
    stay 0; ``failed`` is the count left unmatched after the stage-1 pass.
    """
    steam_id = user.steam_id
    if not steam_id:
        raise ValueError("User has no linked Steam account")

    games = _fetch_owned_games(steam_id)
    if not games:
        return {"total_in_steam": 0, "matched_in_otix": 0, "resolved": 0, "synced": 0, "failed": 0}

    appids = [int(game["appid"]) for game in games]
    appid_to_media = _steam_external_id_map(appids)
    existing = {
        row.steam_app_id: row
        for row in UserSteamGame.objects.filter(user=user, steam_app_id__in=appids)
    }

    matched = 0
    new_rows = []
    for game in games:
        appid = int(game["appid"])
        media_id = appid_to_media.get(appid)
        if media_id is not None:
            matched += 1
        defaults = {
            "media_item_id": media_id,
            "name": game.get("name", f"Steam App {appid}"),
            "playtime_forever": _coerce_int(game.get("playtime_forever")) or 0,
            "playtime_2weeks": _coerce_int(game.get("playtime_2weeks")) or 0,
            "img_icon_url": game.get("img_icon_url"),
            "img_logo_url": game.get("img_logo_url"),
            "rtime_last_played": _coerce_int(game.get("rtime_last_played")),
        }
        row = existing.get(appid)
        if row is None:
            new_rows.append(UserSteamGame(user=user, steam_app_id=appid, **defaults))
            continue
        if any(getattr(row, field) != value for field, value in defaults.items()):
            for field, value in defaults.items():
                setattr(row, field, value)
            row.save(update_fields=tuple(defaults) + ("updated_at",))

    if new_rows:
        UserSteamGame.objects.bulk_create(new_rows)

    logger.info(
        "steam library scanned user=%s total=%s matched=%s", user.id, len(games), matched
    )
    return {
        "total_in_steam": len(games),
        "matched_in_otix": matched,
        "resolved": 0,
        "synced": 0,
        "failed": len(games) - matched,
    }


def scan_steam_wishlist(user) -> dict:
    """Fetch the user's Steam wishlist, match to catalog games, store the rows."""
    steam_id = user.steam_id
    if not steam_id:
        raise ValueError("User has no linked Steam account")

    items = _fetch_wishlist(steam_id)
    if not items:
        return {"total": 0, "matched": 0, "private": True}

    appids = [item["appid"] for item in items]
    appid_to_media = _steam_external_id_map(appids)
    existing = {
        row.steam_app_id: row
        for row in UserSteamWishlist.objects.filter(user=user, steam_app_id__in=appids)
    }

    matched = 0
    new_rows = []
    for item in items:
        appid = item["appid"]
        media_id = appid_to_media.get(appid)
        if media_id is not None:
            matched += 1
        defaults = {
            "media_item_id": media_id,
            "name": item.get("name", f"Steam App {appid}"),
            "priority": item.get("priority", 0),
            "added_date": item.get("added_date"),
            "is_free": item.get("is_free", False),
        }
        row = existing.get(appid)
        if row is None:
            # The store wishlist API never returns icons.
            new_rows.append(
                UserSteamWishlist(user=user, steam_app_id=appid, img_icon_url=None, **defaults)
            )
            continue
        if any(getattr(row, field) != value for field, value in defaults.items()):
            for field, value in defaults.items():
                setattr(row, field, value)
            row.save(update_fields=tuple(defaults) + ("updated_at",))

    if new_rows:
        UserSteamWishlist.objects.bulk_create(new_rows)

    logger.info("steam wishlist scanned user=%s total=%s matched=%s", user.id, len(items), matched)
    return {"total": len(items), "matched": matched, "private": False}
