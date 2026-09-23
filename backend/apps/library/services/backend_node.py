"""The Otix backend *is* the product node: storage, explorer, and downloaders live here."""

from __future__ import annotations

from typing import Any

import httpx

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
    "gamesInstallPath": "",
}

# Kept for older imports/tests; Django-as-node no longer rejects disk actions.
WORKER_ONLY_DETAIL = "Unsupported backend node route."


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

    from apps.library.services.node_fs import disk_usage
    from apps.library.services.node_indexer import index_stats, libraries_for_user

    now = timezone.now()
    stats = index_stats()
    free_bytes = 0
    total_bytes = 0
    for lib in libraries_for_user(user):
        from pathlib import Path

        path = Path(lib["path"])
        if path.exists():
            free_bytes, total_bytes = disk_usage(path)
            break
    return {
        "id": BACKEND_NODE_ID,
        "name": BACKEND_NODE_NAME,
        "local_url": BACKEND_NODE_URL,
        "remote_url": BACKEND_NODE_URL,
        "primary_url": BACKEND_NODE_URL,
        "auth_token": None,
        "is_online": True,
        "last_seen_at": now,
        "total_files": stats.get("total_files") or 0,
        "storage_free_bytes": free_bytes,
        "storage_total_bytes": total_bytes,
        "is_active": True,
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


def _arr_base_url(host: str, port: int, use_ssl: bool, url_base: str = "") -> str:
    scheme = "https" if use_ssl else "http"
    base = (url_base or "").strip().rstrip("/")
    if base and not base.startswith("/"):
        base = f"/{base}"
    return f"{scheme}://{host}:{port}{base}"


def _resolve_cfg(user, kind: str, subkey: str | None, body: dict) -> dict:
    stored = stored_connection(user, kind) or {}
    if subkey:
        stored = stored.get(subkey) or {}
    merged = dict(stored)
    for k, v in body.items():
        if v not in (None, "", "***"):
            merged[k] = v
    return merged


def _test_sabnzbd(cfg: dict) -> tuple[int, dict]:
    host = cfg.get("host") or "127.0.0.1"
    port = cfg.get("port") or 8080
    use_ssl = bool(cfg.get("use_ssl") or cfg.get("useSsl"))
    url_base = cfg.get("url_base") or cfg.get("urlBase") or ""
    api_key = cfg.get("api_key") or cfg.get("apiKey") or ""
    base = _arr_base_url(host, port, use_ssl, url_base)
    url = f"{base}/api?mode=version&output=json&apikey={api_key}"
    try:
        with httpx.Client(timeout=5.0, verify=False) as client:
            resp = client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if "version" in data:
                    return 200, {"ok": True, "version": data["version"], "message": f"Connected to SABnzbd v{data['version']}"}
                if data.get("status") is False:
                    return 200, {"ok": False, "message": data.get("error", "SABnzbd error (check API key)")}
            elif resp.status_code in (401, 403):
                return 200, {"ok": False, "message": "Invalid SABnzbd API Key"}
            return 200, {"ok": False, "message": f"HTTP {resp.status_code} from SABnzbd"}
    except Exception as exc:
        return 200, {"ok": False, "message": f"Cannot connect to SABnzbd at {host}:{port} ({exc})"}


def _test_prowlarr(cfg: dict) -> tuple[int, dict]:
    host = cfg.get("host") or "127.0.0.1"
    port = cfg.get("port") or 9696
    use_ssl = bool(cfg.get("use_ssl") or cfg.get("useSsl"))
    url_base = cfg.get("url_base") or cfg.get("urlBase") or ""
    api_key = cfg.get("api_key") or cfg.get("apiKey") or ""
    base = _arr_base_url(host, port, use_ssl, url_base)
    headers = {"X-Api-Key": api_key} if api_key else {}
    try:
        with httpx.Client(timeout=5.0, verify=False) as client:
            resp = client.get(f"{base}/api/v1/system/status", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                version = data.get("version", "Unknown")
                return 200, {"ok": True, "version": version, "message": f"Connected to Prowlarr v{version}"}
            elif resp.status_code in (401, 403):
                return 200, {"ok": False, "message": "Invalid Prowlarr API Key"}
            return 200, {"ok": False, "message": f"HTTP {resp.status_code} from Prowlarr"}
    except Exception as exc:
        return 200, {"ok": False, "message": f"Cannot connect to Prowlarr at {host}:{port} ({exc})"}


def _test_arr(app_name: str, cfg: dict, default_port: int) -> tuple[int, dict]:
    host = cfg.get("host") or "127.0.0.1"
    port = cfg.get("port") or default_port
    use_ssl = bool(cfg.get("use_ssl") or cfg.get("useSsl"))
    url_base = cfg.get("url_base") or cfg.get("urlBase") or ""
    api_key = cfg.get("api_key") or cfg.get("apiKey") or ""
    if not api_key:
        return 200, {"ok": False, "message": f"{app_name.capitalize()} API key is missing"}
    base = _arr_base_url(host, port, use_ssl, url_base)
    url = f"{base}/api/v3/system/status"
    headers = {"X-Api-Key": api_key}
    try:
        with httpx.Client(timeout=5.0, verify=False) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                version = data.get("version", "unknown")
                return 200, {"ok": True, "version": version, "message": f"Connected to {app_name.capitalize()} v{version}"}
            elif resp.status_code in (401, 403):
                return 200, {"ok": False, "message": f"Invalid {app_name.capitalize()} API key"}
            return 200, {"ok": False, "message": f"HTTP {resp.status_code} from {app_name.capitalize()}"}
    except Exception as exc:
        return 200, {"ok": False, "message": f"Cannot connect to {app_name.capitalize()}: {exc}"}


def _fetch_arr_list(cfg: dict, endpoint: str, default_port: int) -> tuple[int, list]:
    host = cfg.get("host") or "127.0.0.1"
    port = cfg.get("port") or default_port
    use_ssl = bool(cfg.get("use_ssl") or cfg.get("useSsl"))
    url_base = cfg.get("url_base") or cfg.get("urlBase") or ""
    api_key = cfg.get("api_key") or cfg.get("apiKey") or ""
    if not api_key or not host:
        return 200, []
    base = _arr_base_url(host, port, use_ssl, url_base)
    url = f"{base}/api/v3/{endpoint}"
    headers = {"X-Api-Key": api_key}
    try:
        with httpx.Client(timeout=5.0, verify=False) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code == 200:
                items = resp.json()
                return 200, items if isinstance(items, list) else []
    except Exception:
        pass
    return 200, []


def _fetch_prowlarr_indexers(cfg: dict) -> tuple[int, list]:
    host = cfg.get("host") or "127.0.0.1"
    port = cfg.get("port") or 9696
    use_ssl = bool(cfg.get("use_ssl") or cfg.get("useSsl"))
    url_base = cfg.get("url_base") or cfg.get("urlBase") or ""
    api_key = cfg.get("api_key") or cfg.get("apiKey") or ""
    if not api_key or not host:
        return 200, []
    base = _arr_base_url(host, port, use_ssl, url_base)
    headers = {"X-Api-Key": api_key}
    try:
        with httpx.Client(timeout=5.0, verify=False) as client:
            resp = client.get(f"{base}/api/v1/indexer", headers=headers)
            if resp.status_code == 200:
                items = resp.json()
                return 200, items if isinstance(items, list) else []
    except Exception:
        pass
    return 200, []


def _usenet_cfg(user, body: dict | None = None) -> dict:
    return _resolve_cfg(user, "usenet", "sabnzbd", body or {})


def _prowlarr_cfg(user, body: dict | None = None) -> dict:
    return _resolve_cfg(user, "usenet", "prowlarr", body or {})


def handle_backend_proxy(
    user,
    method: str,
    path: str,
    payload: dict | None = None,
    params: dict | None = None,
) -> tuple[int, dict | list]:
    from apps.library.services import node_explorer, node_indexer, node_usenet

    route = (path or "").rstrip("/")
    verb = (method or "GET").upper()
    body = payload if isinstance(payload, dict) else {}
    include_secrets = _wants_secrets(params)
    query = params if isinstance(params, dict) else {}

    if route == "/api/v1/status":
        stats = node_indexer.index_stats()
        return 200, {
            "status": "online",
            "server_name": BACKEND_NODE_NAME,
            "total_files": stats.get("total_files") or 0,
        }

    if route == "/api/v1/files":
        files = node_indexer.list_indexed_files(ensure_scanned=True, user=user)
        return 200, [item.as_api_dict() for item in files]

    if route == "/api/v1/scan":
        indexed = node_indexer.scan_user_libraries(user)
        return 200, {"status": "ok", "total_files": len(indexed)}

    if route == "/api/v1/explorer/browse" or route == "/api/v1/explorer":
        row = _connection_row(user)
        organize = row.organize if isinstance(row.organize, dict) else {}
        active = (
            organize.get("gamesDownloadPath")
            or organize.get("games_download_path")
            or organize.get("isoDownloadPath")
            or ""
        )
        libs = [str(item.get("path")) for item in (row.libraries or []) if isinstance(item, dict)]
        try:
            data = node_explorer.browse_directory(
                query.get("path"),
                active_download_path=str(active or ""),
                extra_library_paths=libs,
            )
            return 200, data
        except FileNotFoundError as exc:
            return 404, {"detail": str(exc)}
        except NotADirectoryError as exc:
            return 400, {"detail": str(exc)}
        except PermissionError as exc:
            return 403, {"detail": str(exc)}

    if route == "/api/v1/explorer/set-download-path":
        path_value = body.get("path")
        if not path_value:
            return 400, {"detail": "path is required"}
        try:
            data = node_explorer.set_download_path(
                user,
                str(path_value),
                create_if_missing=bool(body.get("create_if_missing", body.get("createIfMissing", True))),
                add_as_library=bool(body.get("add_as_library", body.get("addAsLibrary", True))),
            )
            return 200, data
        except FileNotFoundError as exc:
            return 404, {"detail": str(exc)}
        except OSError as exc:
            return 400, {"detail": str(exc)}

    if route == "/api/v1/explorer/create-folder":
        try:
            data = node_explorer.create_folder(
                str(body.get("parent_path") or body.get("parentPath") or ""),
                str(body.get("folder_name") or body.get("folderName") or ""),
            )
            return 200, data
        except ValueError as exc:
            return 400, {"detail": str(exc)}
        except FileNotFoundError as exc:
            return 404, {"detail": str(exc)}
        except FileExistsError:
            return 400, {"detail": "Folder already exists"}
        except OSError as exc:
            return 400, {"detail": str(exc)}

    if route == "/api/v1/usenet/config":
        if verb == "GET":
            stored = stored_connection(user, "usenet")
            data = _empty_usenet()
            if stored:
                data = {**data, **_maybe_mask(stored, include_secrets)}
            return 200, data
        store_connection(user, "usenet", body)
        return 200, {"status": "ok", "stored": True}

    if route == "/api/v1/usenet/test-sabnzbd":
        return _test_sabnzbd(_resolve_cfg(user, "usenet", "sabnzbd", body))

    if route == "/api/v1/usenet/test-prowlarr":
        return _test_prowlarr(_resolve_cfg(user, "usenet", "prowlarr", body))

    if route == "/api/v1/usenet/search" or route == "/api/v1/downloads/search":
        query_text = str(query.get("q") or query.get("query") or body.get("query") or "").strip()
        categories = query.get("categories") or body.get("categories")
        if isinstance(categories, str):
            categories = [int(part) for part in categories.split(",") if part.strip().isdigit()]
        elif not isinstance(categories, list):
            categories = None
        releases = node_usenet.search_prowlarr(_prowlarr_cfg(user), query_text, categories)
        return 200, {"results": releases, "total": len(releases)}

    if route == "/api/v1/usenet/download" or route == "/api/v1/downloads/add":
        nzb_url = str(body.get("download_url") or body.get("downloadUrl") or body.get("nzb_url") or "")
        if not nzb_url:
            return 400, {"detail": "download_url is required"}
        result = node_usenet.send_nzb_to_sabnzbd(
            _usenet_cfg(user),
            nzb_url=nzb_url,
            title=str(body.get("title") or ""),
            category=str(body.get("category") or ""),
        )
        if not result.get("status"):
            return 400, {"detail": result.get("error") or "Failed to queue download"}
        return 200, result

    if route == "/api/v1/usenet/queue" or route == "/api/v1/downloads/queue":
        return 200, node_usenet.fetch_sabnzbd_queue(_usenet_cfg(user))

    if route == "/api/v1/usenet/history" or route == "/api/v1/downloads/history":
        limit = int(query.get("limit") or 50)
        return 200, node_usenet.fetch_sabnzbd_history(_usenet_cfg(user), limit=limit)

    if route.startswith("/api/v1/usenet/queue/") or route.startswith("/api/v1/downloads/"):
        nzo_id = route.rsplit("/", 1)[-1]
        if verb == "DELETE" and nzo_id:
            return 200, node_usenet.delete_sabnzbd_slot(_usenet_cfg(user), nzo_id)

    if route == "/api/v1/sabnzbd/queue/pause":
        return 200, node_usenet.pause_sabnzbd_queue(_usenet_cfg(user))

    if route == "/api/v1/sabnzbd/queue/resume":
        return 200, node_usenet.resume_sabnzbd_queue(_usenet_cfg(user))

    if route.startswith("/api/v1/sabnzbd/queue"):
        return 200, {"status": "ok"}

    if route == "/api/v1/prowlarr/indexers":
        return 200, node_usenet.fetch_prowlarr_indexers(_prowlarr_cfg(user))

    if route == "/api/v1/prowlarr/sync":
        indexers = node_usenet.fetch_prowlarr_indexers(_prowlarr_cfg(user))
        return 200, {"status": "ok", "message": "Prowlarr sync completed", "indexers": indexers}

    if route == "/api/v1/providers":
        usenet = stored_connection(user, "usenet") or {}
        sab = usenet.get("sabnzbd") if isinstance(usenet.get("sabnzbd"), dict) else {}
        prowlarr = usenet.get("prowlarr") if isinstance(usenet.get("prowlarr"), dict) else {}
        return 200, {
            "providers": [
                {
                    "type": "prowlarr",
                    "name": "prowlarr",
                    "configured": bool(prowlarr.get("api_key") or prowlarr.get("apiKey")),
                    "protocol": "usenet",
                },
                {
                    "type": "sabnzbd",
                    "name": "sabnzbd",
                    "configured": bool(sab.get("api_key") or sab.get("apiKey")),
                    "protocol": "usenet",
                },
            ]
        }

    if route == "/api/v1/radarr/config":
        if verb == "GET":
            stored = stored_connection(user, "radarr")
            if stored:
                return 200, _maybe_mask(stored, include_secrets)
            return 200, _empty_arr(7878)
        store_connection(user, "radarr", body)
        return 200, {"status": "ok", "stored": True}

    if route == "/api/v1/radarr/test":
        return _test_arr("radarr", _resolve_cfg(user, "radarr", None, body), 7878)

    if route == "/api/v1/radarr/rootfolders":
        return _fetch_arr_list(_resolve_cfg(user, "radarr", None, {}), "rootfolder", 7878)

    if route == "/api/v1/radarr/qualityprofiles":
        return _fetch_arr_list(_resolve_cfg(user, "radarr", None, {}), "qualityprofile", 7878)

    if route == "/api/v1/radarr/movies":
        return _fetch_arr_list(_resolve_cfg(user, "radarr", None, {}), "movie", 7878)

    if route == "/api/v1/radarr/queue":
        items = _fetch_arr_list(_resolve_cfg(user, "radarr", None, {}), "queue", 7878)[1]
        return 200, {"totalRecords": len(items) if isinstance(items, list) else 0, "records": items or []}

    if route == "/api/v1/radarr/history":
        return 200, {"totalRecords": 0, "records": []}

    if route == "/api/v1/radarr/lookup":
        term = str(query.get("term") or body.get("term") or "").strip()
        if not term:
            return 200, []
        return _fetch_arr_lookup(_resolve_cfg(user, "radarr", None, {}), "movie/lookup", term, 7878)

    if route == "/api/v1/sonarr/config":
        if verb == "GET":
            stored = stored_connection(user, "sonarr")
            if stored:
                return 200, _maybe_mask(stored, include_secrets)
            return 200, _empty_arr(8989)
        store_connection(user, "sonarr", body)
        return 200, {"status": "ok", "stored": True}

    if route == "/api/v1/sonarr/test":
        return _test_arr("sonarr", _resolve_cfg(user, "sonarr", None, body), 8989)

    if route == "/api/v1/sonarr/rootfolders":
        return _fetch_arr_list(_resolve_cfg(user, "sonarr", None, {}), "rootfolder", 8989)

    if route == "/api/v1/sonarr/qualityprofiles":
        return _fetch_arr_list(_resolve_cfg(user, "sonarr", None, {}), "qualityprofile", 8989)

    if route == "/api/v1/sonarr/series":
        return _fetch_arr_list(_resolve_cfg(user, "sonarr", None, {}), "series", 8989)

    if route == "/api/v1/sonarr/queue":
        items = _fetch_arr_list(_resolve_cfg(user, "sonarr", None, {}), "queue", 8989)[1]
        return 200, {"totalRecords": len(items) if isinstance(items, list) else 0, "records": items or []}

    if route == "/api/v1/sonarr/history":
        return 200, {"totalRecords": 0, "records": []}

    if route == "/api/v1/sonarr/lookup":
        term = str(query.get("term") or body.get("term") or "").strip()
        if not term:
            return 200, []
        return _fetch_arr_lookup(_resolve_cfg(user, "sonarr", None, {}), "series/lookup", term, 8989)

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
                merged["gamesDownloadPath"] = (
                    body.get("gamesDownloadPath") or body.get("games_download_path") or ""
                )
            if "gamesInstallPath" in body or "games_install_path" in body:
                merged["gamesInstallPath"] = (
                    body.get("gamesInstallPath") or body.get("games_install_path") or ""
                )
            if "scanOnLaunch" in body or "scan_on_launch" in body:
                merged["scanOnLaunch"] = bool(body.get("scanOnLaunch", body.get("scan_on_launch")))
            row.organize = merged
            row.save(update_fields=["organize", "updated_at"])
            current = merged
        download_path = (
            current.get("gamesDownloadPath") or current.get("games_download_path") or ""
        )
        install_path = (
            current.get("gamesInstallPath") or current.get("games_install_path") or ""
        )
        return 200, {
            "platform": "backend",
            "supported": False,
            "serverName": BACKEND_NODE_NAME,
            "serverId": BACKEND_NODE_ID,
            "gamesDownloadPath": download_path,
            "gamesInstallPath": install_path,
            "scanOnLaunch": bool(current.get("scanOnLaunch", current.get("scan_on_launch"))),
        }

    if route == "/api/v1/epic/status":
        from apps.integrations.services.epic_auth import epic_status

        return 200, epic_status(user)

    if route == "/api/v1/epic/auth":
        from apps.integrations.services.epic_auth import EpicAuthError, epic_auth

        try:
            return 200, epic_auth(user, str(body.get("code") or ""))
        except EpicAuthError as exc:
            return exc.status_code, {"detail": exc.detail}

    if route == "/api/v1/epic/scan":
        from apps.integrations.services.epic_auth import EpicAuthError, epic_scan

        try:
            return 200, epic_scan(user)
        except EpicAuthError as exc:
            return exc.status_code, {"detail": exc.detail}

    if route == "/api/v1/epic/disconnect":
        from apps.integrations.services.epic_auth import epic_disconnect

        return 200, epic_disconnect(user)

    return 400, {"detail": WORKER_ONLY_DETAIL}


def _fetch_arr_lookup(cfg: dict, endpoint: str, term: str, default_port: int) -> tuple[int, list]:
    host = cfg.get("host") or "127.0.0.1"
    port = cfg.get("port") or default_port
    use_ssl = bool(cfg.get("use_ssl") or cfg.get("useSsl"))
    url_base = cfg.get("url_base") or cfg.get("urlBase") or ""
    api_key = cfg.get("api_key") or cfg.get("apiKey") or ""
    if not api_key or not host or not term:
        return 200, []
    base = _arr_base_url(host, port, use_ssl, url_base)
    url = f"{base}/api/v3/{endpoint}"
    headers = {"X-Api-Key": api_key}
    try:
        with httpx.Client(timeout=10.0, verify=False) as client:
            resp = client.get(url, headers=headers, params={"term": term})
            if resp.status_code == 200:
                items = resp.json()
                return 200, items if isinstance(items, list) else []
    except Exception:
        pass
    return 200, []


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
