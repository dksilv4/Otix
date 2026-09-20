"""The Otix backend itself is an Otix node: settings live in Django, not on a worker."""

from __future__ import annotations

from typing import Any

from apps.library.models import UserGameServer
from apps.library.services.node_connections import (
    _mask_secrets,
    store_connection,
    stored_connection,
)

BACKEND_NODE_ID = -2
BACKEND_NODE_NAME = "Otix backend"
BACKEND_NODE_URL = "otix://backend"

DEFAULT_ORGANIZE: dict[str, Any] = {
    "postProcessEnabled": False,
    "autoSearchWishlist": False,
    "wishlistIntervalHours": 12,
    "preferredRepackers": "",
    "allowHypervisor": False,
    "autoOrganizeEnabled": False,
    "namingTemplate": "",
    "isoDownloadPath": "",
    "scanOnLaunch": False,
    "gamesDownloadPath": "",
}

WORKER_ONLY_DETAIL = (
    "This action needs a worker Otix node. The Otix backend stores settings "
    "for this account but does not scan disks or run local downloaders."
)


def is_backend_node_id(server_id: int | None) -> bool:
    try:
        return int(server_id) == BACKEND_NODE_ID
    except (TypeError, ValueError):
        return False


def is_backend_node(server: Any) -> bool:
    if server is None:
        return False
    if getattr(server, "is_backend", False):
        return True
    return is_backend_node_id(getattr(server, "id", None))


def backend_node_payload(user) -> dict[str, Any]:
    from django.utils import timezone

    now = timezone.now()
    return {
        "id": BACKEND_NODE_ID,
        "name": BACKEND_NODE_NAME,
        "local_url": BACKEND_NODE_URL,
        "remote_url": BACKEND_NODE_URL,
        "primary_url": BACKEND_NODE_URL,
        "auth_token": None,
        "is_online": True,
        "last_seen_at": now,
        "total_files": 0,
        "storage_free_bytes": 0,
        "storage_total_bytes": 0,
        "is_active": False,
        "created_at": getattr(user, "created_at", now),
        "updated_at": now,
        "is_backend": True,
    }


def backend_server_stub(user) -> UserGameServer:
    server = UserGameServer(
        user=user,
        name=BACKEND_NODE_NAME,
        local_url=BACKEND_NODE_URL,
        remote_url=BACKEND_NODE_URL,
        is_online=True,
        is_active=False,
    )
    server.id = BACKEND_NODE_ID
    server.is_backend = True  # type: ignore[attr-defined]
    return server


def _empty_usenet() -> dict[str, Any]:
    return {
        "enabled": False,
        "sabnzbd": {"host": "", "port": 8080, "configured": False},
        "prowlarr": {"host": "", "port": 9696, "configured": False},
    }


def _empty_arr(port: int) -> dict[str, Any]:
    return {"enabled": False, "host": "", "port": port, "configured": False}


def _wants_secrets(params: dict | None) -> bool:
    if not isinstance(params, dict):
        return False
    raw = params.get("include_secrets", params.get("includeSecrets"))
    if raw is True:
        return True
    return str(raw or "").strip().lower() in {"1", "true", "yes"}


def _maybe_mask(payload: dict, include_secrets: bool) -> dict:
    if include_secrets:
        return payload
    return _mask_secrets(payload)


def handle_backend_proxy(
    user,
    method: str,
    path: str,
    payload: dict | None = None,
    params: dict | None = None,
) -> tuple[int, dict | list]:
    route = (path or "").rstrip("/")
    verb = (method or "GET").upper()
    body = payload if isinstance(payload, dict) else {}
    include_secrets = _wants_secrets(params)

    if route == "/api/v1/status":
        return 200, {"status": "online", "server_name": BACKEND_NODE_NAME, "total_files": 0}

    if route == "/api/v1/usenet/config":
        if verb == "GET":
            stored = stored_connection(user, "usenet")
            data = _empty_usenet()
            if stored:
                data = {**data, **_maybe_mask(stored, include_secrets)}
            return 200, data
        store_connection(user, "usenet", body)
        return 200, {"status": "ok", "stored": True}

    if route == "/api/v1/radarr/config":
        if verb == "GET":
            stored = stored_connection(user, "radarr")
            if stored:
                return 200, _maybe_mask(stored, include_secrets)
            return 200, _empty_arr(7878)
        store_connection(user, "radarr", body)
        return 200, {"status": "ok", "stored": True}

    if route == "/api/v1/sonarr/config":
        if verb == "GET":
            stored = stored_connection(user, "sonarr")
            if stored:
                return 200, _maybe_mask(stored, include_secrets)
            return 200, _empty_arr(8989)
        store_connection(user, "sonarr", body)
        return 200, {"status": "ok", "stored": True}

    if route == "/api/v1/libraries":
        row = _connection_row(user)
        if verb == "GET":
            libraries = row.libraries if isinstance(row.libraries, list) else []
            return 200, libraries
        libraries = body.get("libraries") if isinstance(body.get("libraries"), list) else []
        if not libraries and isinstance(payload, list):
            libraries = payload
        row.libraries = [_sanitize_library(item) for item in libraries if isinstance(item, dict)]
        row.save(update_fields=["libraries", "updated_at"])
        return 200, row.libraries

    if route == "/api/v1/organize":
        row = _connection_row(user)
        current = {**DEFAULT_ORGANIZE, **(row.organize if isinstance(row.organize, dict) else {})}
        if verb == "GET":
            return 200, current
        merged = dict(current)
        for key, value in body.items():
            merged[key] = value
        row.organize = merged
        row.save(update_fields=["organize", "updated_at"])
        return 200, merged

    if route == "/api/v1/desktop/settings":
        row = _connection_row(user)
        current = {**DEFAULT_ORGANIZE, **(row.organize if isinstance(row.organize, dict) else {})}
        tray_keys = {
            "launchOnStartup",
            "launch_on_startup",
            "minimizeToTray",
            "minimize_to_tray",
            "closeToTray",
            "close_to_tray",
            "alwaysOnTop",
            "always_on_top",
            "startMinimized",
            "start_minimized",
        }
        if verb != "GET" and any(key in body for key in tray_keys):
            return 400, {"detail": "The Otix backend node has no machine tray or startup settings."}
        if verb != "GET":
            merged = dict(current)
            if "gamesDownloadPath" in body or "games_download_path" in body:
                merged["gamesDownloadPath"] = body.get("gamesDownloadPath") or body.get("games_download_path") or ""
            if "scanOnLaunch" in body or "scan_on_launch" in body:
                merged["scanOnLaunch"] = bool(body.get("scanOnLaunch", body.get("scan_on_launch")))
            row.organize = merged
            row.save(update_fields=["organize", "updated_at"])
            current = merged
        return 200, {
            "platform": "backend",
            "supported": False,
            "serverName": BACKEND_NODE_NAME,
            "serverId": BACKEND_NODE_ID,
            "gamesDownloadPath": current.get("gamesDownloadPath") or current.get("games_download_path") or "",
            "scanOnLaunch": bool(current.get("scanOnLaunch", current.get("scan_on_launch"))),
        }

    return 400, {"detail": WORKER_ONLY_DETAIL}


def _connection_row(user):
    from apps.library.services.node_connections import get_or_create_connections

    return get_or_create_connections(user)


def _sanitize_library(item: dict) -> dict[str, Any]:
    path = str(item.get("path") or "").strip()
    kind = str(item.get("kind") or item.get("type") or "game").strip().lower()
    if kind not in ("game", "iso"):
        kind = "game"
    name = str(item.get("name") or "").strip() or path.rsplit("/", 1)[-1] or kind
    return {"name": name, "path": path, "kind": kind}
