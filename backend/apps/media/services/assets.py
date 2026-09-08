"""Local mirroring of provider artwork (admin "download images").

Writes the primary MediaAsset artwork (``PRIMARY_ASSET_TYPES`` — the five types
``catalog._pick_asset`` resolves) to disk under ``settings.MEDIA_DIR/assets``
with an unguessable uuid filename, and records the local copy on the row
(``local_name``/``local_size``/``downloaded_at``). Once mirrored, catalog
serves the local copy via ``/api/v1/assets/<name>`` instead of the provider's
remote URL. Best-effort: a failed/404 fetch leaves the row unmirrored so the
remote URL keeps being used.
"""

from __future__ import annotations

import logging
import shutil
import uuid
from datetime import datetime
from pathlib import Path

import httpx
from django.conf import settings
from django.utils import timezone

from apps.media.models import MediaAsset, MediaItem, MediaServerSetting
from apps.media.services.catalog import _best_asset

logger = logging.getLogger(__name__)

PRIMARY_ASSET_TYPES = ("poster", "backdrop", "logo", "textless_poster", "icon")

MIRRORING_ENABLED_KEY = "local_asset_mirroring_enabled"
MIRRORING_DEFAULT_ENABLED = True

FETCH_KEY = "mirror_on_fetch"
DISCOVER_KEY = "mirror_on_discover"
LOCAL_GAMES_KEY = "mirror_local_games_enabled"
SWEEP_LIMIT_KEY = "mirror_sweep_limit"
SWEEP_INTERVAL_KEY = "mirror_sweep_interval_minutes"
SWEEP_LAST_RUN_KEY = "mirror_sweep_last_run_at"
ASSET_TYPES_KEY = "mirror_asset_types"
MIN_FREE_GB_KEY = "mirror_min_free_gb"

DEFAULT_SWEEP_INTERVAL_MINUTES = 10
DEFAULT_MIN_FREE_GB = 5

_TIMEOUT = httpx.Timeout(20.0)

_CONTENT_TYPE_EXT = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
_URL_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def asset_dir() -> Path:
    directory = Path(settings.MEDIA_DIR) / "assets"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def _extension_for(url: str, content_type: str | None) -> str:
    suffix = Path(url.split("?", 1)[0]).suffix.lower()
    if suffix in _URL_EXTS:
        return ".jpg" if suffix == ".jpeg" else suffix
    if content_type:
        primary = content_type.split(";", 1)[0].strip().lower()
        mapped = _CONTENT_TYPE_EXT.get(primary)
        if mapped:
            return mapped
    return ".jpg"


def download_asset(asset: MediaAsset) -> int | None:
    """Mirror ``asset.url`` to disk; returns bytes written (None if skipped/failed)."""
    if asset.local_name and (asset_dir() / asset.local_name).exists():
        return asset.local_size
    if not asset.url:
        return None
    if not disk_safe():
        logger.warning("asset download skipped: free disk below the mirror_min_free_gb cap")
        return None
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
            response = client.get(asset.url)
        if response.status_code != 200 or not response.content:
            logger.warning("asset download failed: %s HTTP %s", asset.url, response.status_code)
            return None
        ext = _extension_for(asset.url, response.headers.get("content-type"))
        filename = f"{uuid.uuid4().hex}{ext}"
        (asset_dir() / filename).write_bytes(response.content)
        asset.local_name = filename
        asset.local_size = len(response.content)
        asset.downloaded_at = timezone.now()
        asset.save(update_fields=["local_name", "local_size", "downloaded_at"])
        logger.info("mirrored %s -> %s (%d bytes)", asset.url, filename, len(response.content))
        return len(response.content)
    except httpx.HTTPError as exc:
        logger.warning("asset download failed: %s %s", asset.url, exc)
        return None


def _bool_setting(key: str, default: bool) -> bool:
    row = MediaServerSetting.objects.filter(key=key).only("value").first()
    if row is None:
        return default
    return row.value != "0"


def _int_setting(key: str, default: int) -> int:
    row = MediaServerSetting.objects.filter(key=key).only("value").first()
    if row is None or row.value == "":
        return default
    try:
        return int(row.value)
    except (TypeError, ValueError):
        return default


def _set_setting(key: str, value: str) -> None:
    MediaServerSetting.objects.update_or_create(key=key, defaults={"value": value})


def mirroring_enabled() -> bool:
    """Master switch: may new artwork be mirrored to local disk at all."""
    return _bool_setting(MIRRORING_ENABLED_KEY, MIRRORING_DEFAULT_ENABLED)


def set_mirroring_enabled(enabled: bool) -> None:
    _set_setting(MIRRORING_ENABLED_KEY, "1" if enabled else "0")


def fetch_enabled() -> bool:
    """Auto-mirror after single-title fetches (not bulk backfills)."""
    return _bool_setting(FETCH_KEY, True)


def discover_enabled() -> bool:
    """Auto-mirror during the periodic discover sweep."""
    return _bool_setting(DISCOVER_KEY, True)


def local_games_enabled() -> bool:
    """Auto-mirror artwork for claimed/owned local games."""
    return _bool_setting(LOCAL_GAMES_KEY, False)


def set_fetch_enabled(enabled: bool) -> None:
    _set_setting(FETCH_KEY, "1" if enabled else "0")


def set_discover_enabled(enabled: bool) -> None:
    _set_setting(DISCOVER_KEY, "1" if enabled else "0")


def set_local_games_enabled(enabled: bool) -> None:
    _set_setting(LOCAL_GAMES_KEY, "1" if enabled else "0")


def sweep_limit() -> int:
    return _int_setting(SWEEP_LIMIT_KEY, settings.MIRROR_SWEEP_LIMIT)


def sweep_interval_minutes() -> int:
    return _int_setting(SWEEP_INTERVAL_KEY, DEFAULT_SWEEP_INTERVAL_MINUTES)


def sweep_last_run_at() -> datetime | None:
    row = MediaServerSetting.objects.filter(key=SWEEP_LAST_RUN_KEY).only("value").first()
    if row is None or not row.value:
        return None
    try:
        return datetime.fromisoformat(row.value)
    except ValueError:
        return None


def record_sweep_run() -> None:
    _set_setting(SWEEP_LAST_RUN_KEY, timezone.now().isoformat())


def should_run_sweep() -> bool:
    """Whether the interval since the last sweep run has elapsed (beat throttle)."""
    last = sweep_last_run_at()
    if last is None:
        return True
    interval = sweep_interval_minutes()
    if interval <= 0:
        return True
    return (timezone.now() - last).total_seconds() >= interval * 60


def set_sweep_limit(limit: int) -> None:
    _set_setting(SWEEP_LIMIT_KEY, str(limit))


def set_sweep_interval_minutes(minutes: int) -> None:
    _set_setting(SWEEP_INTERVAL_KEY, str(minutes))


def enabled_asset_types() -> tuple[str, ...]:
    """Primary asset types selected for mirroring, in canonical order."""
    row = MediaServerSetting.objects.filter(key=ASSET_TYPES_KEY).only("value").first()
    if row is None or not row.value.strip():
        return PRIMARY_ASSET_TYPES
    selected = {part.strip().lower() for part in row.value.split(",") if part.strip()}
    chosen = tuple(t for t in PRIMARY_ASSET_TYPES if t in selected)
    return chosen or PRIMARY_ASSET_TYPES


def set_asset_types(types) -> None:
    selected = set(types or [])
    chosen = tuple(t for t in PRIMARY_ASSET_TYPES if t in selected)
    if not chosen:
        raise ValueError("at least one asset type is required")
    _set_setting(ASSET_TYPES_KEY, ",".join(chosen))


def min_free_gb() -> int:
    """Disk cap in GB; <=0 disables the safety check."""
    return _int_setting(MIN_FREE_GB_KEY, DEFAULT_MIN_FREE_GB)


def disk_free_bytes() -> int:
    return shutil.disk_usage(asset_dir()).free


def disk_safe() -> bool:
    gb = min_free_gb()
    if gb <= 0:
        return True
    return disk_free_bytes() >= gb * 1024**3


def set_min_free_gb(gb: int) -> None:
    _set_setting(MIN_FREE_GB_KEY, str(gb))


def artwork_settings_payload() -> dict:
    """Current settings + disk state, as served by the admin settings view."""
    usage = shutil.disk_usage(asset_dir())
    cap_bytes = min_free_gb() * 1024**3
    return {
        "fetch_enabled": fetch_enabled(),
        "discover_enabled": discover_enabled(),
        "local_games_enabled": local_games_enabled(),
        "sweep_limit": sweep_limit(),
        "sweep_interval_minutes": sweep_interval_minutes(),
        "asset_types": list(enabled_asset_types()),
        "min_free_gb": min_free_gb(),
        "disk": {
            "total": usage.total,
            "used": usage.used,
            "free": usage.free,
            "tripped": cap_bytes > 0 and usage.free < cap_bytes,
        },
    }


def _remove_local_file(asset: MediaAsset) -> int:
    """Unlink the asset's mirrored file if present; returns bytes removed."""
    if not asset.local_name:
        return 0
    name = Path(asset.local_name).name
    if name != asset.local_name:
        return 0
    path = asset_dir() / name
    if not path.is_file():
        return 0
    size = path.stat().st_size
    path.unlink()
    return size


def _clear_asset_row(asset: MediaAsset) -> None:
    asset.local_name = None
    asset.local_size = None
    asset.downloaded_at = None
    asset.save(update_fields=["local_name", "local_size", "downloaded_at"])


def _discard_local_copy(asset: MediaAsset) -> int:
    """Remove an asset's mirrored file and clear its download fields."""
    freed = _remove_local_file(asset)
    _clear_asset_row(asset)
    return freed


def purge_downloaded_assets() -> dict:
    """Delete every locally mirrored file and clear its download fields.

    Best-effort per file (missing file just clears the row). Returns a summary
    of how many files were removed and how many bytes were freed.
    """
    freed = 0
    deleted = 0
    for asset in MediaAsset.objects.filter(local_name__isnull=False).iterator():
        asset_freed = _discard_local_copy(asset)
        freed += asset_freed
        if asset_freed > 0:
            deleted += 1
    return {"deleted": deleted, "bytes_freed": freed}


def download_primary_assets(media_item: MediaItem) -> dict:
    """Mirror the single best asset per primary type for a media item.

    Reconciles each type so exactly one row carries the local copy: if an
    earlier run mirrored a row that is no longer the best (e.g. a duplicate
    from a score tie), its file is deleted and its download fields cleared
    before the current best is mirrored. When no asset of the type resolves,
    any existing local copy is left untouched.
    """
    downloaded_types: list[str] = []
    count = 0
    total_bytes = 0
    for asset_type in enabled_asset_types():
        best = _best_asset(media_item, asset_type)
        stale = (
            MediaAsset.objects.filter(
                media_item=media_item,
                asset_type__iexact=asset_type,
                local_name__isnull=False,
            )
            if best is not None
            else MediaAsset.objects.none()
        )
        if best is not None:
            stale = stale.exclude(pk=best.pk)
        for asset in stale.iterator():
            _discard_local_copy(asset)
        if best is None:
            continue
        written = download_asset(best)
        if written:
            count += 1
            total_bytes += written
            downloaded_types.append(asset_type)
    return {
        "media_item_id": media_item.pk,
        "title": media_item.title,
        "downloaded": count,
        "bytes": total_bytes,
        "types": downloaded_types,
    }


def _mirror_item(media_item_id: int, kind: str) -> bool:
    item = MediaItem.objects.filter(pk=media_item_id).prefetch_related("assets").first()
    if item is None:
        return False
    try:
        download_primary_assets(item)
        return True
    except Exception:  # noqa: BLE001 - never let artwork break an ingest
        logger.exception("auto-mirror failed for %s %s", kind, media_item_id)
        return False


def mirror_media_artwork(media_item_id: int) -> bool:
    """Auto-mirror a freshly fetched item's primary artwork (best-effort).

    Gated on the master switch + the fetch toggle; swallows any error so a
    mirroring failure never breaks the ingest that triggered it. Returns True
    only when mirroring ran (the underlying downloads are best-effort).
    """
    if not mirroring_enabled() or not fetch_enabled():
        return False
    return _mirror_item(media_item_id, "media")


def mirror_local_game_artwork(media_item_id: int) -> bool:
    """Auto-mirror a claimed/owned local game's primary artwork.

    Gated on the master switch + the local-games toggle, and only fires for
    ``media_type="game"`` rows. Best-effort like ``mirror_media_artwork``.
    """
    if not mirroring_enabled() or not local_games_enabled():
        return False
    if not MediaItem.objects.filter(pk=media_item_id, media_type="game").exists():
        return False
    return _mirror_item(media_item_id, "local game")


def current_primary_asset_ids(media_item: MediaItem) -> set[int]:
    """Pks of the winning asset per primary type (flags what the UI serves)."""
    return {
        best.pk
        for asset_type in PRIMARY_ASSET_TYPES
        if (best := _best_asset(media_item, asset_type)) is not None
    }


def select_asset(media_item: MediaItem, asset: MediaAsset) -> bool:
    """Pin ``asset`` as the chosen artwork for its type (admin override).

    Clears any sibling selection of the same type first, then mirrors the choice
    when the master switch is on. An explicit pick mirrors regardless of the
    per-type auto toggle (``enabled_asset_types()``) — a manual action always
    downloads.
    """
    MediaAsset.objects.filter(
        media_item=media_item, asset_type__iexact=asset.asset_type
    ).exclude(pk=asset.pk).update(is_selected=False)
    asset.is_selected = True
    asset.save(update_fields=["is_selected"])
    if mirroring_enabled():
        _mirror_selected_asset(media_item, asset)
    return True


def clear_asset_selection(asset: MediaAsset) -> None:
    """Drop the admin pin so scoring picks the artwork again."""
    if not asset.is_selected:
        return
    asset.is_selected = False
    asset.save(update_fields=["is_selected"])


def _mirror_selected_asset(media_item: MediaItem, asset: MediaAsset) -> int | None:
    """Mirror the admin-pinned asset, dropping sibling local copies of its type."""
    stale = MediaAsset.objects.filter(
        media_item=media_item,
        asset_type__iexact=asset.asset_type,
        local_name__isnull=False,
    ).exclude(pk=asset.pk)
    for sibling in stale.iterator():
        _discard_local_copy(sibling)
    return download_asset(asset)


def sweep_unmirrored_media(limit: int | None = None) -> dict:
    """Mirror artwork for the highest-profile items with an uncovered type.

    An item counts as a candidate only when it has an enabled primary type whose
    artwork is entirely remote — that is, a type it carries a URL for but has no
    local copy of at all. Items that already mirror their best per type but still
    hold leftover lower-scored sibling URLs (TMDB ships many backdrops/logos per
    title) are NOT re-scanned: only the single best per type is ever mirrored, so
    re-visiting them would burn a sweep slot and download nothing. Highest
    popularity first, up to ``limit`` items per run (defaults to the configured
    ``sweep_limit()``). Gated on the master mirroring switch + the discover
    toggle (either off => no-op). Drives the ``mirror_discover_artwork`` beat
    task and the ``mirror_artwork`` operator command.
    """
    if not mirroring_enabled() or not discover_enabled():
        return {"scanned": 0, "mirrored": 0, "bytes": 0}
    bound = limit if limit is not None else sweep_limit()
    rows = MediaAsset.objects.filter(
        asset_type__in=enabled_asset_types(),
    ).values_list("media_item_id", "asset_type", "local_name", "url")
    present: dict[int, set[str]] = {}
    covered: dict[int, set[str]] = {}
    for media_item_id, asset_type, local_name, url in rows:
        present.setdefault(media_item_id, set())
        covered.setdefault(media_item_id, set())
        if url:
            present[media_item_id].add(asset_type)
        if local_name:
            covered[media_item_id].add(asset_type)
    candidate_ids = [
        item_id
        for item_id, types in present.items()
        if types.difference(covered[item_id])
    ]
    candidates = (
        MediaItem.objects.filter(pk__in=candidate_ids)
        .order_by("-popularity", "id")[:bound]
        .prefetch_related("assets")
    )
    scanned = mirrored = bytes_written = 0
    for item in candidates:
        scanned += 1
        report = download_primary_assets(item)
        if report["downloaded"]:
            mirrored += 1
            bytes_written += report["bytes"]
    return {"scanned": scanned, "mirrored": mirrored, "bytes": bytes_written}
