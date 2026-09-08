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
import uuid
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


def mirroring_enabled() -> bool:
    """Server-wide toggle: may new artwork be mirrored to local disk."""
    row = MediaServerSetting.objects.filter(key=MIRRORING_ENABLED_KEY).only("value").first()
    if row is None:
        return MIRRORING_DEFAULT_ENABLED
    return row.value != "0"


def set_mirroring_enabled(enabled: bool) -> None:
    MediaServerSetting.objects.update_or_create(
        key=MIRRORING_ENABLED_KEY,
        defaults={"value": "1" if enabled else "0"},
    )


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
    for asset_type in PRIMARY_ASSET_TYPES:
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


def mirror_media_artwork(media_item_id: int) -> bool:
    """Auto-mirror a freshly fetched item's primary artwork (best-effort).

    Runs ``download_primary_assets`` for the item just seeded by a single-title
    fetch. Gated on the mirroring switch and swallows any error so a mirroring
    failure never breaks the ingest that triggered it; returns True only when
    mirroring ran (the underlying downloads are themselves best-effort).
    """
    if not mirroring_enabled():
        return False
    item = (
        MediaItem.objects.filter(pk=media_item_id).prefetch_related("assets").first()
    )
    if item is None:
        return False
    try:
        download_primary_assets(item)
        return True
    except Exception:  # noqa: BLE001 - never let artwork break an ingest
        logger.exception("auto-mirror failed for media %s", media_item_id)
        return False


def sweep_unmirrored_media(limit: int = 50) -> dict:
    """Mirror artwork for the highest-profile items with an uncovered type.

    An item counts as a candidate only when it has a primary type whose artwork
    is entirely remote — that is, a type it carries a URL for but has no local
    copy of at all. Items that already mirror their best per type but still hold
    leftover lower-scored sibling URLs (TMDB ships many backdrops/logos per
    title) are NOT re-scanned: only the single best per type is ever mirrored,
    so re-visiting them would burn a sweep slot and download nothing. Highest
    popularity first, up to ``limit`` items per run. Gated on the mirroring
    switch (off => no-op). Drives the ``mirror_discover_artwork`` beat task and
    the ``mirror_artwork`` operator command.
    """
    if not mirroring_enabled():
        return {"scanned": 0, "mirrored": 0, "bytes": 0}
    rows = MediaAsset.objects.filter(
        asset_type__in=PRIMARY_ASSET_TYPES,
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
        .order_by("-popularity", "id")[:limit]
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
