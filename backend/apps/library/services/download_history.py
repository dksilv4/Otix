"""Persist and sync game-server download jobs against SABnzbd queue/history."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.library.models import GameServerDownload, UserGameServer
from apps.media.models import MediaItem

PROXY_DOWNLOAD_KEYS = ("title", "download_url", "category", "protocol")


def proxy_download_payload(payload: dict | None) -> dict:
    """Drop Otix-only fields before forwarding to otix-server."""
    data = payload if isinstance(payload, dict) else {}
    return {key: data[key] for key in PROXY_DOWNLOAD_KEYS if key in data and data[key] is not None}


def normalize_download_status(raw: str | None) -> str:
    status = (raw or "").strip().lower()
    if status in ("completed", "complete"):
        return GameServerDownload.STATUS_COMPLETED
    if status in ("failed", "fail"):
        return GameServerDownload.STATUS_FAILED
    if status in ("cancelled", "canceled", "deleted"):
        return GameServerDownload.STATUS_CANCELLED
    if any(token in status for token in ("extract", "repair", "verif", "unpack", "post")):
        return GameServerDownload.STATUS_PROCESSING
    if "pause" in status:
        return GameServerDownload.STATUS_PAUSED
    if "queue" in status:
        return GameServerDownload.STATUS_QUEUED
    if any(token in status for token in ("download", "grab", "fetch", "running")):
        return GameServerDownload.STATUS_DOWNLOADING
    return status or GameServerDownload.STATUS_QUEUED


def _nzo_id_from_result(result: object) -> str:
    if isinstance(result, str):
        return result.strip()
    if isinstance(result, dict):
        return str(result.get("nzo_id") or result.get("id") or "").strip()
    return ""


def _media_item_from_payload(payload: dict | None) -> MediaItem | None:
    data = payload if isinstance(payload, dict) else {}
    raw = data.get("media_item_id")
    if raw in (None, ""):
        return None
    return MediaItem.objects.filter(pk=raw).first()


def _size_from_payload(payload: dict | None) -> int:
    data = payload if isinstance(payload, dict) else {}
    raw = data.get("size")
    if raw in (None, ""):
        raw = data.get("size_bytes")
    try:
        return max(0, int(float(raw)))
    except (TypeError, ValueError):
        return 0


def record_queued_download(
    server: UserGameServer,
    payload: dict | None,
    result: object,
    user=None,
) -> GameServerDownload | None:
    """Create or refresh a history row after a successful queue request."""
    nzo_id = _nzo_id_from_result(result)
    data = payload if isinstance(payload, dict) else {}
    title = str(data.get("title") or "").strip()
    if isinstance(result, dict) and not title:
        title = str(result.get("title") or "").strip()
    if not nzo_id or not title:
        return None

    owner = user if getattr(user, "is_authenticated", False) else server.user
    protocol = str(data.get("protocol") or "usenet").strip().lower() or "usenet"
    defaults = {
        "user": owner,
        "title": title[:1000],
        "protocol": protocol[:20],
        "status": GameServerDownload.STATUS_QUEUED,
        "percentage": 0,
        "error_message": None,
    }
    size_bytes = _size_from_payload(data)
    if size_bytes:
        defaults["size_bytes"] = size_bytes
    media_item = _media_item_from_payload(data)
    if media_item is not None:
        defaults["media_item"] = media_item

    row, _created = GameServerDownload.objects.update_or_create(
        server=server,
        nzo_id=nzo_id[:128],
        defaults=defaults,
    )
    return row


def apply_queue_progress(server: UserGameServer, queue_data: object) -> None:
    """Refresh in-progress rows from a live SABnzbd queue payload."""
    if not isinstance(queue_data, dict):
        return
    items = queue_data.get("items") or []
    active_ids: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        nzo_id = str(item.get("nzo_id") or "").strip()
        if not nzo_id:
            continue
        active_ids.add(nzo_id)
        filename = str(item.get("filename") or "").strip() or nzo_id
        try:
            percentage = float(item.get("percentage") or 0)
        except (TypeError, ValueError):
            percentage = 0.0
        try:
            size_mb = float(item.get("size_mb") or 0)
        except (TypeError, ValueError):
            size_mb = 0.0
        size_bytes = int(size_mb * 1024 * 1024) if size_mb else 0
        status = normalize_download_status(str(item.get("status") or "Downloading"))
        if status in (
            GameServerDownload.STATUS_COMPLETED,
            GameServerDownload.STATUS_FAILED,
            GameServerDownload.STATUS_CANCELLED,
        ):
            status = GameServerDownload.STATUS_DOWNLOADING
        defaults = {
            "title": filename[:1000],
            "status": status,
            "percentage": max(0.0, min(100.0, percentage)),
            "user": server.user,
        }
        if size_bytes:
            defaults["size_bytes"] = size_bytes
        GameServerDownload.objects.update_or_create(
            server=server,
            nzo_id=nzo_id[:128],
            defaults=defaults,
        )

    leaving_queue = (
        GameServerDownload.STATUS_QUEUED,
        GameServerDownload.STATUS_DOWNLOADING,
        GameServerDownload.STATUS_PAUSED,
    )
    stale = GameServerDownload.objects.filter(server=server, status__in=leaving_queue)
    if active_ids:
        stale = stale.exclude(nzo_id__in=active_ids)
    stale.filter(updated_at__lte=timezone.now() - timedelta(seconds=20)).update(
        status=GameServerDownload.STATUS_COMPLETED,
        percentage=100,
        completed_at=timezone.now(),
    )


def _parse_completed_at(value: object):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    parsed = parse_datetime(text)
    if parsed is not None:
        return parsed
    try:
        return datetime.fromtimestamp(float(text), tz=UTC)
    except (TypeError, ValueError, OSError):
        return None


def apply_history_slots(server: UserGameServer, history_data: object) -> None:
    """Upsert completed/failed SAB history into Otix records."""
    if not isinstance(history_data, dict):
        return
    items = history_data.get("items") or []
    for item in items:
        if not isinstance(item, dict):
            continue
        nzo_id = str(item.get("nzo_id") or "").strip()
        filename = str(item.get("filename") or "").strip()
        if not nzo_id or not filename:
            continue
        existing = GameServerDownload.objects.filter(server=server, nzo_id=nzo_id).first()
        if existing and existing.status == GameServerDownload.STATUS_CANCELLED:
            continue
        status = normalize_download_status(str(item.get("status") or "Completed"))
        if status not in (
            GameServerDownload.STATUS_COMPLETED,
            GameServerDownload.STATUS_FAILED,
            GameServerDownload.STATUS_CANCELLED,
            GameServerDownload.STATUS_PROCESSING,
        ):
            status = GameServerDownload.STATUS_COMPLETED
        try:
            size_bytes = max(0, int(float(item.get("size_bytes") or 0)))
        except (TypeError, ValueError):
            size_bytes = 0
        fail_message = str(item.get("fail_message") or "").strip() or None
        completed_at = _parse_completed_at(item.get("completed_at"))
        defaults = {
            "title": filename[:1000],
            "status": status,
            "percentage": 100 if status == GameServerDownload.STATUS_COMPLETED else 0,
            "user": server.user,
            "error_message": fail_message,
            "completed_at": completed_at,
        }
        if size_bytes:
            defaults["size_bytes"] = size_bytes
        if status == GameServerDownload.STATUS_COMPLETED:
            defaults["percentage"] = 100
        GameServerDownload.objects.update_or_create(
            server=server,
            nzo_id=nzo_id[:128],
            defaults=defaults,
        )


def mark_download_cancelled(server: UserGameServer, nzo_id: str) -> None:
    row = GameServerDownload.objects.filter(server=server, nzo_id=nzo_id).first()
    if not row:
        return
    row.status = GameServerDownload.STATUS_CANCELLED
    row.save(update_fields=["status", "updated_at"])


def serialize_download(row: GameServerDownload) -> dict:
    return {
        "id": row.id,
        "nzo_id": row.nzo_id,
        "title": row.title,
        "protocol": row.protocol,
        "status": row.status,
        "percentage": row.percentage,
        "size_bytes": row.size_bytes,
        "error_message": row.error_message,
        "media_item_id": str(row.media_item_id) if row.media_item_id else None,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def list_download_history(server: UserGameServer, limit: int = 50) -> list[dict]:
    rows = GameServerDownload.objects.filter(server=server).order_by("-created_at")[
        : max(1, min(int(limit), 200))
    ]
    return [serialize_download(row) for row in rows]
