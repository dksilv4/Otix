"""Media request persistence and lifecycle services."""

from __future__ import annotations

import logging
from typing import Any

from apps.library.models import UserMediaRequest, UserNode
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


def dispatch_media_lifecycle_notification(
    user,
    req: UserMediaRequest,
    stage: str,
    progress: float | None = None,
) -> None:
    """Publish exact-once lifecycle notification with dedupe_key enforcement."""
    if not user or not getattr(user, "is_authenticated", False):
        return

    try:
        from apps.social.models import Notification

        identifier = req.tmdb_id or req.tvdb_id or str(req.id)
        m_type = (req.media_type or "movie").lower()
        service_label = req.service.title() if req.service else "Arr"
        stage_titles = {
            "received": f"Request Received: {req.title}",
            "matched": f"Media Matched: {req.title}",
            "downloading": f"Downloading: {req.title}",
            "ready": f"Ready to Stream: {req.title}",
        }
        stage_bodies = {
            "received": f"Your request for {req.title} ({req.year or ''}) has been accepted.",
            "matched": f"Found matching release on {service_label}. Queued for download.",
            "downloading": f"Download is actively in progress ({int(progress or req.progress or 0)}%).",
            "ready": f"Download complete and indexed in library. Click to stream.",
        }

        title_str = stage_titles.get(stage, f"Media Update: {req.title}")
        body_str = stage_bodies.get(stage, f"Status updated to {stage}")
        link = f"/media/{m_type}/{identifier}" if identifier else "/downloads"

        dedupe = f"media_lifecycle:{user.id}:{m_type}:{identifier}:{stage}"
        Notification.objects.get_or_create(
            dedupe_key=dedupe,
            defaults={
                "user": user,
                "type": f"media_request.{stage}",
                "title": title_str,
                "body": body_str,
                "metadata_json": {
                    "stage": stage,
                    "service": req.service,
                    "mediaType": m_type,
                    "mediaId": identifier,
                    "title": req.title,
                    "year": req.year,
                    "posterUrl": req.poster_url,
                    "requestId": req.id,
                    "link": link,
                },
            },
        )
    except Exception as exc:
        logger.warning("Failed to dispatch media lifecycle notification: %s", exc)


def trigger_pms_library_refresh(user, req: UserMediaRequest) -> None:
    """Trigger background Plex section refresh to immediately index new download."""
    if not user or not getattr(user, "is_authenticated", False):
        return
    try:
        import requests
        from apps.integrations.models import UserPlexServer

        servers = UserPlexServer.objects.filter(user=user)
        for srv in servers:
            if srv.base_url and srv.token:
                try:
                    requests.get(
                        f"{srv.base_url.rstrip('/')}/library/sections/all/refresh",
                        params={"X-Plex-Token": srv.token},
                        timeout=3,
                    )
                except Exception:
                    pass
    except Exception:
        pass


def record_media_request(
    user,
    server: UserNode | None = None,
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

    if media_item:
        if title.isdigit() or not title:
            title = media_item.title
        if not poster_url:
            if getattr(media_item, "poster_url", None):
                poster_url = media_item.poster_url
            else:
                try:
                    from apps.media.models import MediaAsset

                    poster = MediaAsset.objects.filter(media_item=media_item, asset_type="poster").first()
                    if poster:
                        poster_url = poster.url
                except Exception:
                    pass
        if not tmdb_id and getattr(media_item, "tmdb_id", None):
            tmdb_id = str(media_item.tmdb_id)
        if not tvdb_id and getattr(media_item, "tvdb_id", None):
            tvdb_id = str(media_item.tvdb_id)
        if year_int is None and media_item.release_date:
            year_int = media_item.release_date.year

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
        dispatch_media_lifecycle_notification(user, existing, "received")
        if existing.external_id:
            dispatch_media_lifecycle_notification(user, existing, "matched")
        return existing

    created = UserMediaRequest.objects.create(
        user=user,
        server=server,
        **defaults,
    )
    dispatch_media_lifecycle_notification(user, created, "received")
    if created.external_id:
        dispatch_media_lifecycle_notification(user, created, "matched")
    return created


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


def reconcile_media_requests(user, requests: list[UserMediaRequest]) -> None:
    """Check pending requests against media activity and mark as available if downloaded."""
    pending = [
        r for r in requests
        if r.status not in (UserMediaRequest.STATUS_AVAILABLE, UserMediaRequest.STATUS_COMPLETED)
    ]
    if not pending:
        return

    try:
        import re

        from django.utils import timezone

        from apps.library.services.media_activity import get_user_media_activity

        activity = get_user_media_activity(user, queue_only=False)
        items = activity.get("items") or {}

        to_update = []
        for req in pending:
            m_type = req.media_type or "movie"
            matched_activity = None

            # 1. Match by tmdb_id
            if req.tmdb_id:
                matched_activity = items.get(f"tmdb:{m_type}:{req.tmdb_id}") or items.get(str(req.tmdb_id))
            # 2. Match by tvdb_id
            if not matched_activity and req.tvdb_id:
                matched_activity = (
                    items.get(f"tvdb:{m_type}:{req.tvdb_id}")
                    or items.get(str(req.tvdb_id))
                    or items.get(f"tmdb:{m_type}:{req.tvdb_id}")
                )
            # 3. Match by normalized title
            if not matched_activity and req.title:
                norm = re.sub(r"[^a-z0-9]", "", str(req.title).lower())
                matched_activity = items.get(f"{m_type}:title:{norm}")

            if matched_activity:
                act_status = matched_activity.get("status")
                if act_status == "available":
                    req.status = UserMediaRequest.STATUS_AVAILABLE
                    if not req.completed_at:
                        req.completed_at = timezone.now()
                    to_update.append(req)
                    dispatch_media_lifecycle_notification(user, req, "ready")
                    trigger_pms_library_refresh(user, req)
                elif act_status == "processing":
                    req.status = UserMediaRequest.STATUS_DOWNLOADING
                    prog = matched_activity.get("progress")
                    if prog is not None:
                        req.progress = float(prog)
                    to_update.append(req)
                    dispatch_media_lifecycle_notification(user, req, "downloading", progress=req.progress)

        if to_update:
            for r in to_update:
                r.save(update_fields=["status", "progress", "completed_at", "updated_at"])
    except Exception as exc:
        logger.warning("Failed to reconcile media requests: %s", exc)


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
    reconcile_media_requests(user, requests)
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


def _send_auto_request_notification(user, media_item, service: str, req: UserMediaRequest) -> None:
    """Dispatch an in-app and desktop/push notification when media is auto-requested."""
    if not user or not getattr(user, "is_authenticated", False):
        return
    try:
        from apps.social.models import Notification

        service_label = "Radarr" if service == "radarr" else "Sonarr"
        media_label = "Movie" if (media_item.media_type or "").lower() == "movie" else "TV Series"
        title_str = f"Auto-Requested: {media_item.title}"
        body_str = (
            f"{media_label} was automatically requested on {service_label} "
            f"from your watchlist."
        )
        dedupe = f"auto_req:{user.id}:{media_item.id}:{service}"
        Notification.objects.get_or_create(
            dedupe_key=dedupe,
            defaults={
                "user": user,
                "type": "media_request",
                "title": title_str,
                "body": body_str,
                "metadata_json": {
                    "kind": "watchlist_auto_request",
                    "service": service,
                    "mediaType": media_item.media_type,
                    "mediaId": media_item.id,
                    "title": media_item.title,
                    "requestId": getattr(req, "id", None),
                    "link": "/downloads?tab=requests",
                },
            },
        )
    except Exception:
        logger.exception("Failed to send auto-request notification for media_item %s", media_item.id)


def auto_request_watchlist_item(user, media_item_id: int) -> UserMediaRequest | None:
    """Automatically request a watchlisted title if Radarr or Sonarr auto-request is enabled."""
    if not user or not getattr(user, "is_authenticated", False):
        return None

    try:
        media_item = MediaItem.objects.filter(id=media_item_id).first()
    except Exception:
        return None

    if not media_item:
        return None

    media_type = (media_item.media_type or "").lower()
    if media_type not in ("movie", "show"):
        return None

    service = "radarr" if media_type == "movie" else "sonarr"

    # Avoid duplicate requests if already requested or owned
    try:
        from apps.social.models import UserMediaInteraction

        if UserMediaInteraction.objects.filter(
            user=user, media_item_id=media_item.id, interaction_type="owned"
        ).exists():
            return None
    except Exception:
        pass

    tmdb_ext = ExternalID.objects.filter(provider="tmdb", object_id=media_item.id).first()
    tmdb_id = tmdb_ext.external_id if tmdb_ext else ""

    tvdb_ext = ExternalID.objects.filter(provider="tvdb", object_id=media_item.id).first()
    tvdb_id = tvdb_ext.external_id if tvdb_ext else ""

    existing = UserMediaRequest.objects.filter(user=user, service=service)
    if tmdb_id and existing.filter(tmdb_id=str(tmdb_id)).exists():
        return None
    if tvdb_id and existing.filter(tvdb_id=str(tvdb_id)).exists():
        return None
    if existing.filter(media_item=media_item).exists() or existing.filter(title__iexact=media_item.title).exists():
        return None

    # Check user nodes or stored node connections to see if auto_request_watchlist is enabled
    from apps.library.services.node import (
        get_cached_node_config,
        radarr_add_movie,
        radarr_get_config,
        sonarr_add_series,
        sonarr_get_config,
    )

    user_nodes = list(
        UserNode.objects.filter(user=user, is_active=True).order_by("-is_online", "-created_at")
    )

    target_node = None
    target_instance = None
    target_cfg = None
    is_auto_request_enabled = False

    for node in user_nodes:
        cfg = get_cached_node_config(node.id, f"{service}_config")
        if not cfg and node.is_online:
            _, cfg = radarr_get_config(node) if service == "radarr" else sonarr_get_config(node)

        if isinstance(cfg, dict):
            instances = cfg.get("instances") or []
            # Check per-instance setting first
            for inst in instances:
                if inst.get("enabled", True) and (
                    inst.get("auto_request_watchlist") or inst.get("autoRequestWatchlist")
                ):
                    target_node = node
                    target_instance = inst
                    target_cfg = cfg
                    is_auto_request_enabled = True
                    break
            if is_auto_request_enabled:
                break

            # Check root config setting
            if cfg.get("auto_request_watchlist") or cfg.get("autoRequestWatchlist"):
                target_node = node
                target_cfg = cfg
                if instances:
                    target_instance = next(
                        (i for i in instances if i.get("enabled", True)), instances[0]
                    )
                is_auto_request_enabled = True
                break

    # If not found on active nodes, check account-level UserNodeConnection
    if not is_auto_request_enabled:
        from apps.library.models import UserNodeConnection

        conn = UserNodeConnection.objects.filter(user=user).first()
        if conn:
            stored_cfg = getattr(conn, service, None) or {}
            if stored_cfg.get("auto_request_watchlist") or stored_cfg.get("autoRequestWatchlist"):
                is_auto_request_enabled = True
                target_cfg = stored_cfg
                if user_nodes:
                    target_node = user_nodes[0]
                instances = stored_cfg.get("instances") or []
                if instances:
                    target_instance = next(
                        (
                            i
                            for i in instances
                            if i.get("enabled", True)
                            and (i.get("auto_request_watchlist") or i.get("autoRequestWatchlist"))
                        ),
                        instances[0],
                    )

    if not is_auto_request_enabled:
        return None

    year = media_item.release_date.year if media_item.release_date else None
    poster_url = None
    try:
        from apps.media.models import MediaAsset

        poster = MediaAsset.objects.filter(media_item=media_item, asset_type="poster").first()
        if poster:
            poster_url = poster.url
    except Exception:
        pass

    if service == "radarr":
        payload = {
            "title": media_item.title,
            "tmdb_id": int(tmdb_id) if tmdb_id and str(tmdb_id).isdigit() else None,
            "year": year,
            "monitored": True,
            "search_for_movie": True,
            "media_item_id": media_item.id,
        }
        if poster_url:
            payload["poster_url"] = poster_url
        if target_instance:
            if target_instance.get("id"):
                payload["instance_id"] = target_instance["id"]
            if target_instance.get("quality_profile_id"):
                payload["quality_profile_id"] = target_instance["quality_profile_id"]
            if target_instance.get("root_folder_path"):
                payload["root_folder_path"] = target_instance["root_folder_path"]
        elif target_cfg:
            if target_cfg.get("quality_profile_id"):
                payload["quality_profile_id"] = target_cfg["quality_profile_id"]
            if target_cfg.get("root_folder_path"):
                payload["root_folder_path"] = target_cfg["root_folder_path"]

        res = None
        if target_node:
            try:
                _status, res = radarr_add_movie(target_node, payload)
            except Exception:
                logger.exception("Failed to dispatch radarr_add_movie on node %s", target_node.id)

        req = record_media_request(
            user=user,
            server=target_node,
            service="radarr",
            media_type="movie",
            payload=payload,
            result=res,
        )
        if req:
            _send_auto_request_notification(user, media_item, "radarr", req)
        return req
    else:
        payload = {
            "title": media_item.title,
            "tvdb_id": int(tvdb_id) if tvdb_id and str(tvdb_id).isdigit() else None,
            "tmdb_id": int(tmdb_id) if tmdb_id and str(tmdb_id).isdigit() else None,
            "year": year,
            "monitored": True,
            "search_for_missing_episodes": True,
            "series_type": (
                target_instance.get("series_type", "standard")
                if target_instance
                else target_cfg.get("series_type", "standard")
                if target_cfg
                else "standard"
            ),
            "season_folder": (
                target_instance.get("season_folder", True)
                if target_instance
                else target_cfg.get("season_folder", True)
                if target_cfg
                else True
            ),
            "media_item_id": media_item.id,
        }
        if poster_url:
            payload["poster_url"] = poster_url
        if target_instance:
            if target_instance.get("id"):
                payload["instance_id"] = target_instance["id"]
            if target_instance.get("quality_profile_id"):
                payload["quality_profile_id"] = target_instance["quality_profile_id"]
            if target_instance.get("root_folder_path"):
                payload["root_folder_path"] = target_instance["root_folder_path"]
        elif target_cfg:
            if target_cfg.get("quality_profile_id"):
                payload["quality_profile_id"] = target_cfg["quality_profile_id"]
            if target_cfg.get("root_folder_path"):
                payload["root_folder_path"] = target_cfg["root_folder_path"]

        res = None
        if target_node:
            try:
                _status, res = sonarr_add_series(target_node, payload)
            except Exception:
                logger.exception("Failed to dispatch sonarr_add_series on node %s", target_node.id)

        req = record_media_request(
            user=user,
            server=target_node,
            service="sonarr",
            media_type="show",
            payload=payload,
            result=res,
        )
        if req:
            _send_auto_request_notification(user, media_item, "sonarr", req)
        return req


def sync_watchlist_auto_requests(user, service: str | None = None) -> list[UserMediaRequest]:
    """Scan watchlisted items for this user and auto-request any that have not been requested."""
    if not user or not getattr(user, "is_authenticated", False):
        return []

    from apps.social.models import UserMediaInteraction

    qs = UserMediaInteraction.objects.filter(
        user=user, interaction_type="watchlisted"
    ).select_related("media_item")
    if service == "radarr":
        qs = qs.filter(media_item__media_type="movie")
    elif service == "sonarr":
        qs = qs.filter(media_item__media_type="show")

    created_requests = []
    for item in qs:
        req = auto_request_watchlist_item(user, item.media_item_id)
        if req:
            created_requests.append(req)
        else:
            # If already requested previously, ensure notification exists
            existing_req = UserMediaRequest.objects.filter(user=user, media_item=item.media_item).first()
            if existing_req:
                _send_auto_request_notification(user, item.media_item, existing_req.service, existing_req)

    return created_requests
