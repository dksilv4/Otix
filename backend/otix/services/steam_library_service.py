from __future__ import annotations

import httpx
import structlog
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.domain.media import Game, MediaItem, UserSteamGame, UserSteamWishlist
from otix.domain.user import User
from otix.infrastructure.config import settings

logger = structlog.get_logger()

STEAM_API_BASE = "https://api.steampowered.com"


async def _fetch_owned_games(steam_id: str) -> list[dict]:
    """Fetch owned games from Steam Web API directly (no rate limiter needed for one-off scans)."""
    url = f"{STEAM_API_BASE}/IPlayerService/GetOwnedGames/v1/"
    from otix.infrastructure.http_client import get_http_client

    try:
        client = get_http_client()
        resp = await client.get(url, params={
            "key": settings.steam_api_key,
            "steamid": steam_id,
            "include_appinfo": 1,
            "include_played_free_games": 1,
        })
    except Exception as exc:
        logger.exception("steam owned games request failed")
        raise RuntimeError(f"Failed to connect to Steam API: {exc}") from exc

    if resp.status_code == 403 or resp.status_code == 401:
        logger.warning("steam profile is private or api key invalid", steam_id=steam_id, status=resp.status_code)
        return []
    if resp.status_code != 200:
        logger.error("steam owned games unexpected status", steam_id=steam_id, status=resp.status_code, body=resp.text[:500])
        raise RuntimeError(f"Steam API returned {resp.status_code}")

    data = resp.json()
    games = data.get("response", {}).get("games")
    if isinstance(games, list):
        return games
    return []


async def scan_steam_library(
    db: AsyncSession,
    user: User,
) -> dict:
    """Fetch the user's Steam library, match to Otix games, and store results.

    Returns a summary dict with ``total_in_steam`` and ``matched_in_otix`` counts.
    """
    steam_id = user.steam_id
    if not steam_id:
        raise ValueError("User has no linked Steam account")

    games = await _fetch_owned_games(steam_id)

    if not games:
        return {"total_in_steam": 0, "matched_in_otix": 0}

    steam_app_ids = [g["appid"] for g in games]

    # Batch-lookup matching Game records by steam_app_id
    result = await db.execute(
        select(Game.media_item_id, Game.steam_app_id).where(
            Game.steam_app_id.in_(steam_app_ids)
        )
    )
    appid_to_media: dict[int, str] = {}
    for row in result:
        if row.steam_app_id is not None:
            appid_to_media[row.steam_app_id] = row.media_item_id

    # Upsert into user_steam_games
    matched = 0
    for g in games:
        appid = g["appid"]
        media_item_id = appid_to_media.get(appid)
        if media_item_id:
            matched += 1

        stmt = pg_insert(UserSteamGame).values(
            user_id=user.id,
            steam_app_id=appid,
            media_item_id=media_item_id,
            name=g.get("name", f"Steam App {appid}"),
            playtime_forever=g.get("playtime_forever", 0),
            playtime_2weeks=g.get("playtime_2weeks", 0),
            img_icon_url=g.get("img_icon_url"),
            img_logo_url=g.get("img_logo_url"),
            rtime_last_played=g.get("rtime_last_played"),
        ).on_conflict_do_update(
            constraint="uq_user_steam_game",
            set_={
                "media_item_id": media_item_id,
                "name": g.get("name"),
                "playtime_forever": g.get("playtime_forever", 0),
                "playtime_2weeks": g.get("playtime_2weeks", 0),
                "img_icon_url": g.get("img_icon_url"),
                "img_logo_url": g.get("img_logo_url"),
                "rtime_last_played": g.get("rtime_last_played"),
                "updated_at": func.now(),
            },
        )
        await db.execute(stmt)

    await db.commit()
    logger.info(
        "steam library scanned",
        user_id=user.id,
        total=len(games),
        matched=matched,
    )
    return {"total_in_steam": len(games), "matched_in_otix": matched}


async def get_unmatched_steam_games(
    db: AsyncSession,
    user_id: str,
    cursor: str | None = None,
    limit: int = 48,
) -> tuple[list[UserSteamGame], bool, str | None]:
    """Return unmatched Steam games (no Otix match) sorted by playtime desc.

    Cursor format: ``{playtime_forever}__{steam_app_id}``.
    """
    query = (
        select(UserSteamGame)
        .where(
            UserSteamGame.user_id == user_id,
            UserSteamGame.media_item_id.is_(None),
        )
        .order_by(
            UserSteamGame.playtime_forever.desc(),
            UserSteamGame.steam_app_id,
        )
    )

    if cursor:
        parts = cursor.split("__", 1)
        if len(parts) == 2:
            try:
                cursor_playtime = int(parts[0])
                cursor_appid = int(parts[1])
                query = query.where(
                    (UserSteamGame.playtime_forever < cursor_playtime)
                    | (
                        (UserSteamGame.playtime_forever == cursor_playtime)
                        & (UserSteamGame.steam_app_id > cursor_appid)
                    )
                )
            except (ValueError, TypeError):
                pass

    query = query.limit(limit + 1)
    result = await db.execute(query)
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    next_cursor = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = f"{last.playtime_forever}__{last.steam_app_id}"

    return rows, has_more, next_cursor


async def get_steam_library(
    db: AsyncSession,
    user_id: str,
    cursor: str | None = None,
    limit: int = 48,
) -> tuple[list[tuple[MediaItem, int, int, int | None]], bool, str | None]:
    """Return the user's Steam library joined with MediaItem, sorted by playtime.

    Returns ``(items, has_more, next_cursor)`` where each item is a tuple of
    ``(media_item, playtime_forever, playtime_2weeks, rtime_last_played)``.

    Cursor format: ``{playtime_forever}__{steam_app_id}``.
    Unmatched games (NULL media_item_id) are excluded from results.
    """
    query = (
        select(MediaItem, UserSteamGame.playtime_forever, UserSteamGame.playtime_2weeks, UserSteamGame.rtime_last_played)
        .join(UserSteamGame, UserSteamGame.media_item_id == MediaItem.id)
        .options(
            joinedload(MediaItem.movie),
            joinedload(MediaItem.show),
            joinedload(MediaItem.game),
        )
        .where(
            UserSteamGame.user_id == user_id,
            UserSteamGame.media_item_id.isnot(None),
        )
        .order_by(
            UserSteamGame.playtime_forever.desc(),
            UserSteamGame.steam_app_id,
        )
    )

    if cursor:
        parts = cursor.split("__", 1)
        if len(parts) == 2:
            try:
                cursor_playtime = int(parts[0])
                cursor_appid = int(parts[1])
                query = query.where(
                    (UserSteamGame.playtime_forever < cursor_playtime)
                    | (
                        (UserSteamGame.playtime_forever == cursor_playtime)
                        & (UserSteamGame.steam_app_id > cursor_appid)
                    )
                )
            except (ValueError, TypeError):
                pass

    query = query.limit(limit + 1)
    result = await db.execute(query)
    rows = list(result.unique().all())

    items: list[tuple[MediaItem, int, int, int | None]] = [
        (row[0], row[1] or 0, row[2] or 0, row[3]) for row in rows
    ]

    has_more = len(items) > limit
    if has_more:
        items = items[:limit]

    next_cursor = None
    if has_more and items:
        last_item = items[-1][0]
        last_steam_game = await db.scalar(
            select(UserSteamGame).where(
                UserSteamGame.user_id == user_id,
                UserSteamGame.media_item_id == last_item.id,
            )
        )
        if last_steam_game:
            next_cursor = f"{last_steam_game.playtime_forever}__{last_steam_game.steam_app_id}"

    return items, has_more, next_cursor


# ── Steam Wishlist ──────────────────────────────────────────────────────


async def _fetch_wishlist(steam_id: str) -> list[dict]:
    """Fetch wishlist from Steam Store API (no API key needed).

    Uses the undocumented store endpoint. Only works for public Steam profiles.
    Returns an empty list if the wishlist is private or inaccessible.
    """
    url = f"https://store.steampowered.com/wishlist/profiles/{steam_id}/wishlistdata/?p=0"
    try:
        from otix.infrastructure.http_client import get_http_client
        client = get_http_client()
        resp = await client.get(url, follow_redirects=False)
    except Exception as exc:
        logger.exception("steam wishlist request failed")
        raise RuntimeError(f"Failed to connect to Steam Store: {exc}") from exc

    # Private wishlist → Steam redirects to login/home page
    if resp.status_code in (301, 302, 303, 307, 308):
        logger.warning(
            "steam wishlist is private or inaccessible (redirect)",
            steam_id=steam_id,
            status=resp.status_code,
        )
        return []
    if resp.status_code == 403 or resp.status_code == 401:
        logger.warning("steam wishlist is private", steam_id=steam_id, status=resp.status_code)
        return []
    if resp.status_code != 200:
        logger.error("steam wishlist unexpected status", steam_id=steam_id, status=resp.status_code, body=resp.text[:500])
        raise RuntimeError(f"Steam Store returned {resp.status_code}")

    content_type = resp.headers.get("content-type", "")
    if "text/html" in content_type or resp.text.strip().startswith("<!DOCTYPE"):
        logger.warning("steam wishlist returned HTML (likely private)", steam_id=steam_id)
        return []

    try:
        data = resp.json()
    except Exception:
        logger.warning("steam wishlist response is not valid JSON", steam_id=steam_id)
        return []

    if not isinstance(data, dict):
        return []

    items: list[dict] = []
    for appid_str, info in data.items():
        if not isinstance(info, dict):
            continue
        try:
            appid = int(appid_str)
        except (ValueError, TypeError):
            continue
        items.append({
            "appid": appid,
            "name": info.get("name", f"Steam App {appid}"),
            "priority": info.get("priority", 0),
            "added": info.get("added"),
            "is_free": info.get("is_free_game", False),
        })
    return items


async def scan_steam_wishlist(
    db: AsyncSession,
    user: User,
) -> dict:
    """Fetch the user's Steam wishlist, match to Otix games, and store results."""
    steam_id = user.steam_id
    if not steam_id:
        raise ValueError("User has no linked Steam account")

    items = await _fetch_wishlist(steam_id)

    if not items:
        return {"total": 0, "matched": 0, "private": True}

    steam_app_ids = [i["appid"] for i in items]

    result = await db.execute(
        select(Game.media_item_id, Game.steam_app_id).where(
            Game.steam_app_id.in_(steam_app_ids)
        )
    )
    appid_to_media: dict[int, str] = {}
    for row in result:
        if row.steam_app_id is not None:
            appid_to_media[row.steam_app_id] = row.media_item_id

    matched = 0
    for item in items:
        appid = item["appid"]
        media_item_id = appid_to_media.get(appid)
        if media_item_id:
            matched += 1

        stmt = pg_insert(UserSteamWishlist).values(
            user_id=user.id,
            steam_app_id=appid,
            media_item_id=media_item_id,
            name=item.get("name", f"Steam App {appid}"),
            priority=item.get("priority", 0),
            added_date=item.get("added"),
            is_free=item.get("is_free", False),
            img_icon_url=None,  # wishlist API doesn't return icons
        ).on_conflict_do_update(
            constraint="uq_user_steam_wishlist",
            set_={
                "media_item_id": media_item_id,
                "name": item.get("name"),
                "priority": item.get("priority", 0),
                "added_date": item.get("added"),
                "is_free": item.get("is_free", False),
                "updated_at": func.now(),
            },
        )
        await db.execute(stmt)

    await db.commit()
    logger.info(
        "steam wishlist scanned",
        user_id=user.id,
        total=len(items),
        matched=matched,
    )
    return {"total": len(items), "matched": matched, "private": False}


async def get_steam_wishlist(
    db: AsyncSession,
    user_id: str,
    cursor: str | None = None,
    limit: int = 48,
) -> tuple[list[tuple[MediaItem, int] | tuple[None, int]], bool, str | None]:
    """Return user's Steam wishlist joined with MediaItem, ordered by priority then added_date.

    Returns matched items as ``(media_item, priority)`` and unmatched as ``(None, priority)``.
    Cursor format: ``{priority}__{steam_app_id}``.
    """
    query = (
        select(MediaItem, UserSteamWishlist.priority)
        .join(UserSteamWishlist, UserSteamWishlist.media_item_id == MediaItem.id)
        .options(
            joinedload(MediaItem.movie),
            joinedload(MediaItem.show),
            joinedload(MediaItem.game),
        )
        .where(
            UserSteamWishlist.user_id == user_id,
            UserSteamWishlist.media_item_id.isnot(None),
        )
        .order_by(
            UserSteamWishlist.priority.asc(),
            UserSteamWishlist.steam_app_id,
        )
    )

    if cursor:
        parts = cursor.split("__", 1)
        if len(parts) == 2:
            try:
                cursor_priority = int(parts[0])
                cursor_appid = int(parts[1])
                query = query.where(
                    (UserSteamWishlist.priority > cursor_priority)
                    | (
                        (UserSteamWishlist.priority == cursor_priority)
                        & (UserSteamWishlist.steam_app_id > cursor_appid)
                    )
                )
            except (ValueError, TypeError):
                pass

    query = query.limit(limit + 1)
    result = await db.execute(query)
    rows = list(result.unique().all())

    items: list[tuple[MediaItem, int]] = [
        (row[0], row[1] or 0) for row in rows
    ]

    has_more = len(items) > limit
    if has_more:
        items = items[:limit]

    next_cursor = None
    if has_more and items:
        last_item, _ = items[-1]
        last_wishlist = await db.scalar(
            select(UserSteamWishlist).where(
                UserSteamWishlist.user_id == user_id,
                UserSteamWishlist.media_item_id == last_item.id,
            )
        )
        if last_wishlist:
            next_cursor = f"{last_wishlist.priority}__{last_wishlist.steam_app_id}"

    return items, has_more, next_cursor
