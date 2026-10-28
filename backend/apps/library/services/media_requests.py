"""Media request persistence and lifecycle services."""

from __future__ import annotations

import logging
from typing import Any

from apps.library.models import UserGameServer, UserMediaRequest, UserNode
from apps.media.models import ExternalID, MediaItem

logger = logging.getLogger(__name__)


def _extract_media_item(
    tmdb_id: str | None = None,
    tvdb_id: str | None = None,
    title: str | None = None,
) -> MediaItem | None:
    """Best-effort lookup of MediaItem in the local database."""
    try:
        if tmdb_id:
            ext = ExternalID.objects.filter(provider="tmdb", external_id=str(tmdb_id)).first()
            if ext and isinstance(ext.target, MediaItem):
                return ext.target
        if tvdb_id:
            ext = ExternalID.objects.filter(provider="tvdb", external_id=str(tvdb_id)).first()
            if ext and isinstance(ext.target, MediaItem):
                return ext.target
        if title:
            item = MediaItem.objects.filter(title__iexact=str(title).strip()).first()
            if item:
                return item
    except Exception:
        pass
    return None


def record_media_request(
    user,
    server: UserNode | UserGameServer | None = None,
    service: str = "radarr",
    media_type: str = "movie",
    payload: dict | None = None,
    result: Any = None,
) -> UserMediaRequest | None:
    """Create or refresh a media request row after sending to a node or directly."""
    if not user or not getattr(user, "is_authenticated", False):
        return None

    data = payload if isinstance(payload, dict) else {}
    res = result if isinstance(result, dict) else {}

    title = str(data.get("title") or res.get("title") or "").strip()
    if not title and isinstance(result, list) and result and isinstance(result[0], dict):
        title = str(result[0].get("title") or "").strip()
    if not title:
        return None

    tmdb_id = str(
        data.get("tmdb_id") or data.get("tmdbId") or res.get("tmdbId") or res.get("tmdb_id") or ""
    ).strip()
    tvdb_id = str(
        data.get("tvdb_id") or data.get("tvdbId") or res.get("tvdbId") or res.get("tvdb_id") or ""
    ).strip()
    year = data.get("year") or res.get("year")
    try:
        year_int = int(year) if year else None
    except (TypeError, ValueError):
        year_int = None

    poster_url = str(data.get("poster_url") or data.get("posterUrl") or "").strip()
    if not poster_url and isinstance(res.get("images"), list):
        for img in res.get("images", []):
            if isinstance(img, dict) and img.get("coverType") == "poster":
                poster_url = img.get("remoteUrl") or img.get("url") or ""
                break

    instance_id = str(data.get("instance_id") or data.get("instanceId") or "").strip()
    instance_name = str(data.get("instance_name") or data.get("instanceName") or "").strip()
    quality_profile_name = str(
        data.get("quality_profile_name")
        or data.get("qualityProfileName")
        or data.get("quality_profile_id")
        or ""
    ).strip()
    root_folder_path = str(data.get("root_folder_path") or data.get("rootFolderPath") or "").strip()

    search_now = bool(
        data.get("search_now")
        if data.get("search_now") is not None
        else data.get("search_for_movie")
        if data.get("search_for_movie") is not None
        else data.get("search_for_missing_episodes", True)
    )
    monitored = bool(data.get("monitored", True))

    external_id = str(res.get("id") or data.get("external_id") or "").strip()

    media_item = _extract_media_item(tmdb_id=tmdb_id, tvdb_id=tvdb_id, title=title)
    if not media_item and (data.get("media_item_id") or data.get("mediaItemId")):
        try:
            m_id = int(data.get("media_item_id") or data.get("mediaItemId"))
            media_item = MediaItem.objects.filter(id=m_id).first()
        except (TypeError, ValueError):
            pass

    req_status = str(data.get("status") or "").strip().lower()
    if not req_status or req_status not in [c[0] for c in UserMediaRequest.STATUS_CHOICES]:
        req_status = (
            UserMediaRequest.STATUS_DOWNLOADING
            if service in ("usenet", "torrent", "sabnzbd", "game") and external_id
            else UserMediaRequest.STATUS_REQUESTED
        )

    defaults = {
        "title": title[:500],
        "media_type": media_type[:32],
        "year": year_int,
        "tmdb_id": tmdb_id[:64],
        "tvdb_id": tvdb_id[:64],
        "service": service[:32],
        "instance_id": instance_id[:128],
        "instance_name": instance_name[:255],
        "quality_profile_name": quality_profile_name[:128],
        "root_folder_path": root_folder_path[:500],
        "status": req_status,
        "search_now": search_now,
        "monitored": monitored,
        "external_id": external_id[:128],
        "media_item": media_item,
    }
    if poster_url:
        defaults["poster_url"] = poster_url

    # Check for an existing pending request for this user + media identifier
    query = UserMediaRequest.objects.filter(user=user, service=service)
    if server:
        query = query.filter(server=server)

    existing = None
    if tmdb_id:
        existing = query.filter(tmdb_id=tmdb_id).first()
    elif tvdb_id:
        existing = query.filter(tvdb_id=tvdb_id).first()
    if not existing:
        existing = query.filter(title__iexact=title).first()

    if existing:
        for k, v in defaults.items():
            if v or k not in ("poster_url", "media_item"):
                setattr(existing, k, v)
        if server:
            existing.server = server
        existing.save()
        return existing

    return UserMediaRequest.objects.create(
        user=user,
        server=server,
        **defaults,
    )


def serialize_media_request(req: UserMediaRequest) -> dict[str, Any]:
    """Serialize a UserMediaRequest row to snake_case dict (converted to camelCase for API)."""
    server_name = req.server.name if req.server else ""
    return {
        "id": req.id,
        "user_id": req.user_id,
        "server_id": req.server_id,
        "server_name": server_name,
        "media_type": req.media_type,
        "media_item_id": req.media_item_id,
        "title": req.title,
        "year": req.year,
        "tmdb_id": req.tmdb_id or None,
        "tvdb_id": req.tvdb_id or None,
        "poster_url": req.poster_url or None,
        "service": req.service,
        "instance_id": req.instance_id or None,
        "instance_name": req.instance_name or None,
        "quality_profile_name": req.quality_profile_name or None,
        "root_folder_path": req.root_folder_path or None,
        "status": req.status,
        "progress": req.progress,
        "search_now": req.search_now,
        "monitored": req.monitored,
        "external_id": req.external_id or None,
        "error_message": req.error_message or None,
        "completed_at": req.completed_at.isoformat() if req.completed_at else None,
        "created_at": req.created_at.isoformat() if req.created_at else None,
        "updated_at": req.updated_at.isoformat() if req.updated_at else None,
    }


def list_media_requests(
    user,
    server_id: int | None = None,
    media_type: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    """List persisted media requests for a user with optional filters."""
    if not user or not getattr(user, "is_authenticated", False):
        return []

    qs = UserMediaRequest.objects.filter(user=user).select_related("server", "media_item")
    if server_id:
        qs = qs.filter(server_id=server_id)
    if media_type:
        qs = qs.filter(media_type=media_type)
    if status:
        qs = qs.filter(status=status)

    requests = list(qs[:limit])
    return [serialize_media_request(r) for r in requests]


def delete_media_request(user, request_id: int) -> bool:
    """Delete a user-owned media request."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    row = UserMediaRequest.objects.filter(user=user, id=request_id).first()
    if not row:
        return False
    row.delete()
    return True
