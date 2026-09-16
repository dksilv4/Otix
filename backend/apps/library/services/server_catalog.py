"""Match scanned game-server files to Otix catalog titles and artwork."""

from __future__ import annotations

import re
from pathlib import Path

from apps.media.models import MediaItem
from apps.media.services.catalog import attach_media_urls
from apps.media.services.game_matcher import _comparison_key, _normalize_title

_UPDATE_TAIL = re.compile(
    r"[\s._-]+(?:updates?d?|patches?|hotfix(?:es)?|dlcs?|expansions?)(?:[\s._-]*v?\d[\w._-]*)?$",
    re.IGNORECASE,
)
_ADDON_MARK = re.compile(
    r"(?:^|[^a-z0-9])(?:updates?d?|patch(?:es)?|hotfix(?:es)?|crackfix(?:es)?|dlcs?|expansions?)(?=$|[^a-z])",
    re.IGNORECASE,
)
_NOISE_TAIL = re.compile(
    r"[\s._-]+(?:early\s+build|deluxe(?:\s+edition)?|ultimate(?:\s+edition)?|"
    r"goty(?:\s+edition)?|voices\d*|razor1911|repack|i\s+know|"
    r"win64(?:\s+shipping)?|\bvr\b|(?:19|20)\d{2})$",
    re.IGNORECASE,
)


GENERIC_INSTALLER_STEMS = {
    "setup", "install", "installer", "autorun", "start", "play", "unins000", "uninstall",
}
GENERIC_FOLDER_NAMES = GENERIC_INSTALLER_STEMS | {
    "bin", "crack", "cracks", "redist", "commonredist", "directx", "vcredist",
    "windows", "win", "files", "data", "game", "games", "disk1", "disc1", "cd1",
    "dvd", "iso", "unpacked", "extracted", "temp", "tmp", "update", "updates",
    "patch", "dlc", "support", "docs", "documentation", "payloads",
}


def _lookup_key(title: str) -> str:
    key = _normalize_title(title).lower().replace("-", " ").replace(":", " ")
    return re.sub(r"\s+", " ", key).strip()


def _match_keys(title: str) -> list[str]:
    keys: list[str] = []
    for raw in (
        _lookup_key(title),
        _comparison_key(title),
        _comparison_key(title).replace("'", "").replace("’", ""),
    ):
        key = re.sub(r"\s+", " ", raw).strip()
        if key and key not in keys:
            keys.append(key)
    return keys


_SCENE_FOLDER_TAGS = re.compile(
    r"\b(?:repack|fitgirl|dodi|gog|elamigos|codex|skidrow|flt|rune|setup)\b",
    re.IGNORECASE,
)


def folder_titles_from_path(path: str | None) -> list[str]:
    """Parent folder names nearest-first, skipping generic installer dirs."""
    if not path:
        return []
    parts = list(Path(str(path).replace("\\", "/")).parts)
    if parts and Path(parts[-1]).suffix.lower() in {
        ".iso", ".img", ".bin", ".cue", ".exe", ".msi", ".zip", ".7z", ".rar", ".chd", ".rvz",
    }:
        parts = parts[:-1]
    titles: list[str] = []
    seen: set[str] = set()
    for part in reversed(parts):
        if not part or part in (".", "..", "/", "\\") or len(part) <= 1:
            continue
        if part.lower() in GENERIC_FOLDER_NAMES:
            continue
        spaced = re.sub(r"[\._]+", " ", part)
        spaced = spaced.replace("-", " ")
        spaced = _SCENE_FOLDER_TAGS.sub(" ", spaced)
        spaced = re.sub(r"\s+", " ", spaced).strip()
        key = _lookup_key(spaced)
        if not key or key in GENERIC_FOLDER_NAMES or key in seen:
            continue
        seen.add(key)
        titles.append(spaced)
    return titles


def _stripped_title(title: str) -> str:
    return _NOISE_TAIL.sub("", _UPDATE_TAIL.sub("", title).strip()).strip()


def _extend_keys(keys: list[str], title: str) -> None:
    for extra in _match_keys(title):
        if extra and extra not in keys:
            keys.append(extra)


def _keys_from_title(raw: str, keys: list[str]) -> None:
    if not raw:
        return
    spaced = re.sub(r"[\._]+", " ", raw)
    spaced = re.sub(r"\s+", " ", spaced).strip()
    for title in (raw, spaced, _stripped_title(spaced)):
        if title:
            _extend_keys(keys, title)


def title_keys_for_file(
    filename: str | None,
    game_title: str | None,
    relative_path: str | None = None,
    filepath: str | None = None,
) -> list[str]:
    """Build normalized lookup keys from a scanned filename / indexer title / folder path."""
    keys: list[str] = []
    _keys_from_title((game_title or "").strip(), keys)
    if filename:
        _keys_from_title(Path(filename).stem, keys)
    folder_keys: list[str] = []
    for title in folder_titles_from_path(relative_path or filepath):
        _extend_keys(folder_keys, title)
        _extend_keys(folder_keys, _stripped_title(title))
    folder_keys = [key for key in folder_keys if key not in keys]
    stem = Path(filename or "").stem.lower()
    if stem in GENERIC_INSTALLER_STEMS:
        return [key for key in folder_keys + keys if key not in GENERIC_INSTALLER_STEMS]
    return keys + folder_keys


def is_addon_title(filename: str | None, game_title: str | None) -> bool:
    haystack = f"{game_title or ''} {filename or ''}"
    return bool(_ADDON_MARK.search(haystack) or _UPDATE_TAIL.search(f" {haystack}"))


def match_catalog_row(keys: list[str], by_key: dict[str, dict], addon: bool) -> dict | None:
    for key in keys:
        row = by_key.get(key)
        if row:
            return row
    for key in keys:
        if len(key.split()) < 3:
            continue
        hits = [row for catalog_key, row in by_key.items() if catalog_key.startswith(key + " ")]
        ids = {row["id"] for row in hits}
        if len(ids) == 1:
            return hits[0]
    if not addon:
        return None
    # Named DLC ("Cyberpunk 2077 Phantom Liberty DLC") still belongs to the parent title.
    for key in keys:
        parts = key.split()
        while len(parts) >= 2:
            parts.pop()
            row = by_key.get(" ".join(parts))
            if row:
                return row
    return None


def catalog_payload(item: MediaItem) -> dict:
    return {
        "id": str(item.id),
        "title": item.title,
        "slug": item.slug,
        "overview": item.overview,
        "poster_url": getattr(item, "poster_url", None),
        "backdrop_url": getattr(item, "backdrop_url", None),
        "logo_url": getattr(item, "logo_url", None),
        "textless_poster_url": getattr(item, "textless_poster_url", None),
        "icon_url": getattr(item, "icon_url", None),
    }


def match_files_to_catalog(files: list[dict]) -> None:
    """Attach ``catalog_item`` (with artwork) onto each scanned file dict."""
    if not files:
        return

    catalog_rows = list(
        MediaItem.objects.filter(media_type="game").values("id", "title", "slug")
    )
    by_key: dict[str, dict] = {}
    for row in catalog_rows:
        for extra in _match_keys(row["title"] or ""):
            if extra and extra not in by_key:
                by_key[extra] = row

    matched_ids: set[int] = set()
    file_match: dict[int, int] = {}
    for index, file in enumerate(files):
        filename = file.get("filename")
        game_title = file.get("game_title")
        row = match_catalog_row(
            title_keys_for_file(
                filename,
                game_title,
                relative_path=file.get("relative_path"),
                filepath=file.get("filepath"),
            ),
            by_key,
            is_addon_title(filename, game_title),
        )
        if row:
            matched_ids.add(row["id"])
            file_match[index] = row["id"]

    items_by_id: dict[int, MediaItem] = {}
    if matched_ids:
        items = list(
            MediaItem.objects.filter(id__in=matched_ids).prefetch_related("assets")
        )
        attach_media_urls(items)
        items_by_id = {item.id: item for item in items}

    for index, file in enumerate(files):
        media_id = file_match.get(index)
        item = items_by_id.get(media_id) if media_id is not None else None
        file["catalog_item"] = catalog_payload(item) if item is not None else None


def _is_bin_file(file: dict) -> bool:
    ext = (file.get("extension") or "").lower().lstrip(".")
    name = (file.get("filename") or "").lower()
    return ext == "bin" or name.endswith(".bin")


def unmatched_scan_titles(files: list[dict], *, limit: int = 100) -> list[str]:
    """Human titles for unmatched base releases (skip .bin, updates, DLC)."""
    titles: list[str] = []
    seen: set[str] = set()
    for file in files:
        if _is_bin_file(file):
            continue
        if file.get("catalog_item"):
            continue
        if is_addon_title(file.get("filename"), file.get("game_title")):
            continue
        candidates: list[str] = []
        game_title = (file.get("game_title") or "").strip()
        if game_title:
            candidates.append(game_title)
        candidates.extend(
            title_keys_for_file(
                file.get("filename"),
                file.get("game_title"),
                relative_path=file.get("relative_path"),
                filepath=file.get("filepath"),
            )
        )
        for raw in candidates:
            key = _lookup_key(raw)
            if not key or key in seen or len(key) < 2:
                continue
            seen.add(key)
            titles.append(game_title or raw)
            break
        if len(titles) >= limit:
            break
    return titles
