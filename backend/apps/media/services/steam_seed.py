"""Seed catalog games from Steam store search when IGDB is not configured."""

from __future__ import annotations

import logging
import re
import time
from datetime import datetime
from pathlib import Path

import httpx
from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from apps.library.models import UserGameServer
from apps.library.services.server_catalog import match_files_to_catalog, unmatched_scan_titles
from apps.media.models import ExternalID, Game, MediaAsset, MediaItem
from apps.media.services.game_matcher import _comparison_key, _igdb_search_query

logger = logging.getLogger(__name__)

_STEAM_UA = "Mozilla/5.0 (compatible; OtixCatalogSeed/1.0)"
_STEAM_SEARCH = "https://store.steampowered.com/api/storesearch"
_STEAM_DETAILS = "https://store.steampowered.com/api/appdetails"
_HTML_TAG = re.compile(r"<[^>]+>")
_SCENE_TAG = re.compile(
    r"\b(?:razor1911|flt|codex|skidrow|repack|fitgirl|dodi|elamigos|rune|gog|unleashed)\b",
    re.IGNORECASE,
)
_NOISE_TAG = re.compile(
    r"\b(?:early\s+build|voices\d*|win64(?:\s+shipping)?|uninst|i\s+know)\b",
    re.IGNORECASE,
)
_YEAR_TAIL = re.compile(r"\s+(?:19|20)\d{2}$")
_SKIP_TITLES = {
    "setup", "install", "installer", "launcher", "dx", "ereg", "easyinfo", "speed",
    "dowser", "crashpad handler", "unitycrashhandler64", "steam api64 rne",
    "foundrybugreporter", "foundryrestarter", "epiconlineservicesinstaller",
    "vc redist", "vcredist",
}


def steam_asset_urls(appid: int) -> list[tuple[str, str, int]]:
    base = f"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/{appid}"
    return [
        ("poster", f"{base}/library_600x900.jpg", 100),
        ("backdrop", f"{base}/library_hero.jpg", 100),
        ("logo", f"{base}/logo.png", 90),
    ]


def _steam_get(url: str, params: dict | None = None) -> dict | list | None:
    with httpx.Client(timeout=20.0, headers={"User-Agent": _STEAM_UA}, follow_redirects=True) as client:
        response = client.get(url, params=params)
        if response.status_code != 200:
            logger.warning("steam GET failed status=%s url=%s", response.status_code, url)
            return None
        try:
            return response.json()
        except ValueError:
            return None


def search_steam_store(term: str) -> list[dict]:
    payload = _steam_get(_STEAM_SEARCH, {"term": term, "l": "en", "cc": "US"})
    if not isinstance(payload, dict):
        return []
    items = payload.get("items")
    return items if isinstance(items, list) else []


def fetch_steam_appdetails(appid: int) -> dict | None:
    payload = _steam_get(_STEAM_DETAILS, {"appids": str(appid), "filters": "basic"})
    if not isinstance(payload, dict):
        return None
    entry = payload.get(str(appid))
    if not isinstance(entry, dict) or not entry.get("success"):
        return None
    data = entry.get("data")
    return data if isinstance(data, dict) else None


def seed_key(title: str) -> str:
    title = re.sub(r"[™®©]", "", title)
    key = _comparison_key(title).replace("'", "").replace("’", "")
    key = key.replace("spiderman", "spider man")
    return re.sub(r"\s+", " ", key).strip()


def clean_scan_title(title: str) -> str:
    text = re.sub(r"[\._]+", " ", title)
    text = _SCENE_TAG.sub(" ", text)
    text = _NOISE_TAG.sub(" ", text)
    text = _YEAR_TAIL.sub("", text)
    text = re.sub(r"\band\s+re\s+mind\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"spiderman", "spider man", text, flags=re.IGNORECASE)
    text = re.sub(r"\bvr\b", " ", text, flags=re.IGNORECASE)
    text = _igdb_search_query(text)
    return re.sub(r"\s+", " ", text).strip()


def should_seed_title(title: str) -> bool:
    cleaned = clean_scan_title(title)
    key = seed_key(cleaned or title)
    if not key or len(key) < 3:
        return False
    if key in _SKIP_TITLES or cleaned.lower() in _SKIP_TITLES:
        return False
    if key.endswith(" code") or key.endswith(" uninst"):
        return False
    return True


def pick_steam_app(title: str, items: list[dict]) -> dict | None:
    target = seed_key(clean_scan_title(title) or title)
    if not target:
        return None
    exact: list[dict] = []
    close: list[dict] = []
    apps: list[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("type") or "app").lower()
        if kind in {"dlc", "music", "video", "hardware", "demo"}:
            continue
        name = str(item.get("name") or "")
        key = seed_key(name)
        if not key:
            continue
        apps.append(item)
        if key == target:
            exact.append(item)
            continue
        if target in key or key in target:
            shared = set(target.split()) & set(key.split())
            union = set(target.split()) | set(key.split())
            overlap = len(shared) / max(len(union), 1)
            if overlap >= 0.6:
                close.append(item)
    if exact:
        return exact[0]
    if len(close) == 1:
        return close[0]
    if len(apps) == 1:
        key = seed_key(str(apps[0].get("name") or ""))
        shared = set(target.split()) & set(key.split())
        if len(shared) >= max(1, len(target.split()) - 1):
            return apps[0]
    return None


def parse_steam_release_date(raw: str | None):
    if not raw:
        return None
    text = raw.replace(",", "").strip()
    if not text or text.lower() in {"coming soon", "to be announced", "tba"}:
        return None
    for fmt in ("%d %b %Y", "%b %d %Y", "%b %Y", "%Y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    return None


def _plain_text(raw: str | None) -> str | None:
    if not raw:
        return None
    text = _HTML_TAG.sub(" ", raw)
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def _mapped_steam_ids() -> set[str]:
    content_type = ContentType.objects.get_for_model(MediaItem)
    return set(
        ExternalID.objects.filter(
            content_type=content_type, provider="steam", media_type="game"
        ).values_list("external_id", flat=True)
    )


def _unique_slug(title: str, appid: int) -> str:
    base = slugify(title)[:180] or f"steam-{appid}"
    slug = base
    if not MediaItem.objects.filter(slug=slug).exists():
        return slug
    slug = f"{base}-{appid}"
    n = 2
    while MediaItem.objects.filter(slug=slug).exists():
        slug = f"{base}-{appid}-{n}"
        n += 1
    return slug


def seed_game_from_steam_app(title: str, appid: int, details: dict | None = None) -> MediaItem:
    content_type = ContentType.objects.get_for_model(MediaItem)
    existing = ExternalID.objects.filter(
        content_type=content_type, provider="steam", external_id=str(appid), media_type="game"
    ).first()
    if existing is not None and existing.object_id:
        item = MediaItem.objects.filter(pk=existing.object_id).first()
        if item is not None:
            return item

    catalog_title = str((details or {}).get("name") or title).strip() or title
    overview = _plain_text((details or {}).get("short_description"))
    release_raw = None
    release = (details or {}).get("release_date")
    if isinstance(release, dict):
        release_raw = release.get("date")
    release_date = parse_steam_release_date(release_raw if isinstance(release_raw, str) else None)
    media = MediaItem.objects.create(
        media_type="game",
        title=catalog_title,
        slug=_unique_slug(catalog_title, appid),
        overview=overview,
        release_date=release_date,
        completeness_score=0.55,
        is_adult=bool((details or {}).get("is_adult")),
    )
    Game.objects.get_or_create(media_item=media, defaults={"game_type": "main_game", "release_status": "released"})
    for asset_type, url, score in steam_asset_urls(appid):
        MediaAsset.objects.get_or_create(
            media_item=media,
            asset_type=asset_type,
            url=url,
            defaults={"label": "official", "provider": "steam", "score": score, "selected_context": "general"},
        )
    ExternalID.objects.get_or_create(
        content_type=content_type,
        provider="steam",
        external_id=str(appid),
        media_type="game",
        defaults={"object_id": media.pk},
    )
    return media


def _pause(delay: float) -> None:
    if delay:
        time.sleep(delay)


def seed_games_from_titles(
    titles: list[str],
    *,
    delay: float = 0.2,
    fetch_details: bool = True,
) -> dict:
    """Search Steam for each title and seed missing catalog rows."""
    existing_keys = {
        seed_key(title)
        for title in MediaItem.objects.filter(media_type="game").values_list("title", flat=True)
    }
    existing_keys.discard("")
    mapped_steam = _mapped_steam_ids()
    created: list[str] = []
    skipped: list[str] = []
    unmatched: list[str] = []
    seen: set[str] = set()

    for raw in titles:
        original = " ".join(str(raw or "").split())
        title = clean_scan_title(original) or original
        key = seed_key(title)
        if not original or not key or key in seen:
            continue
        seen.add(key)
        if not should_seed_title(original):
            skipped.append(original)
            continue
        if key in existing_keys:
            skipped.append(original)
            continue
        items = search_steam_store(title)
        app = pick_steam_app(title, items)
        if app is None:
            unmatched.append(original)
            _pause(delay)
            continue
        try:
            appid = int(app.get("id"))
        except (TypeError, ValueError):
            unmatched.append(original)
            continue
        if str(appid) in mapped_steam:
            skipped.append(original)
            _pause(delay)
            continue
        details = fetch_steam_appdetails(appid) if fetch_details else None
        item = seed_game_from_steam_app(title, appid, details)
        created.append(item.title)
        existing_keys.add(seed_key(item.title))
        mapped_steam.add(str(appid))
        _pause(delay)

    return {
        "created": created,
        "skipped": skipped,
        "unmatched": unmatched,
        "searched": len(seen),
    }


def _server_file_row(server: UserGameServer, raw: dict) -> dict:
    relative_path = raw.get("relative_path") or ""
    filepath = raw.get("filepath") or ""
    if not relative_path and filepath:
        parts = [part for part in Path(str(filepath)).parts if part not in ("/", "\\")]
        relative_path = "/".join(parts[-2:]) if len(parts) >= 2 else Path(str(filepath)).name
    return {
        "server_id": server.id,
        "filename": raw.get("filename"),
        "extension": raw.get("extension", ""),
        "game_title": raw.get("game_title", ""),
        "relative_path": relative_path,
        "filepath": filepath,
    }


def collect_active_server_files() -> list[dict]:
    files: list[dict] = []
    for server in UserGameServer.objects.filter(is_active=True):
        target = (server.primary_url or "").rstrip("/")
        if not target:
            continue
        headers = {"User-Agent": _STEAM_UA}
        if server.auth_token:
            headers["Authorization"] = f"Bearer {server.auth_token}"
        try:
            with httpx.Client(timeout=15.0, headers=headers, follow_redirects=True) as client:
                response = client.get(f"{target}/api/v1/files")
        except Exception:  # noqa: BLE001 - a down node must not abort the rest
            logger.exception("could not list files for server %s", server.id)
            continue
        if response.status_code != 200:
            logger.warning("server %s files HTTP %s", server.id, response.status_code)
            continue
        try:
            payload = response.json()
        except ValueError:
            continue
        if not isinstance(payload, list):
            continue
        for raw in payload:
            if isinstance(raw, dict):
                files.append(_server_file_row(server, raw))
    return files


def seed_unmatched_server_games(*, limit: int = 5000, delay: float = 0.2) -> dict:
    files = collect_active_server_files()
    match_files_to_catalog(files)
    titles = unmatched_scan_titles(files, limit=limit)
    result = seed_games_from_titles(titles, delay=delay)
    result["scanned_files"] = len(files)
    result["unmatched_titles"] = titles
    return result
