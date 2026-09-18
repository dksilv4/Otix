"""Game server service operations: connectivity probes, health checks, and metrics sync."""

import time

import httpx
from django.utils import timezone

from apps.library.models import UserGameServer


def ping_server_sync(server: UserGameServer) -> dict:
    """Probe server /api/v1/status or /api/v1/ping and update server model state."""
    target_url = (server.primary_url or "").rstrip("/")
    if not target_url:
        server.is_online = False
        server.save(update_fields=["is_online", "updated_at"])
        return {"online": False, "error": "No server URL provided"}

    headers = {}
    if server.auth_token:
        headers["Authorization"] = f"Bearer {server.auth_token}"

    start_t = time.perf_counter()
    try:
        with httpx.Client(timeout=3.0) as client:
            resp = client.get(f"{target_url}/api/v1/status", headers=headers)
            latency_ms = int((time.perf_counter() - start_t) * 1000)
            if resp.status_code == 200:
                data = resp.json()
                server.is_online = True
                server.last_seen_at = timezone.now()
                server.total_files = data.get("total_files", server.total_files)
                server.storage_free_bytes = data.get("disk_free_bytes", server.storage_free_bytes)
                server.storage_total_bytes = data.get(
                    "disk_total_bytes", server.storage_total_bytes
                )
                server.save(
                    update_fields=[
                        "is_online",
                        "last_seen_at",
                        "total_files",
                        "storage_free_bytes",
                        "storage_total_bytes",
                        "updated_at",
                    ]
                )
                return {"online": True, "latency_ms": latency_ms, "status_data": data}
            elif resp.status_code == 401:
                server.is_online = False
                server.save(update_fields=["is_online", "updated_at"])
                return {"online": False, "error": "Unauthorized (invalid auth token)"}
    except Exception as exc:
        server.is_online = False
        server.save(update_fields=["is_online", "updated_at"])
        return {"online": False, "error": str(exc)}

    server.is_online = False
    server.save(update_fields=["is_online", "updated_at"])
    return {"online": False, "error": f"HTTP {resp.status_code}"}


def server_proxy_request(
    server: UserGameServer,
    method: str,
    path: str,
    params: dict | None = None,
    json: dict | None = None,
    timeout: float = 6.0,
) -> tuple[int, dict | list]:
    """Generic helper to proxy requests to connected otix-server node."""
    target_url = (server.primary_url or "").rstrip("/")
    if not target_url:
        return 400, {"error": "Server URL not configured"}

    headers = {}
    if server.auth_token:
        headers["Authorization"] = f"Bearer {server.auth_token}"

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.request(
                method=method,
                url=f"{target_url}{path}",
                params=params,
                json=json,
                headers=headers,
            )
            try:
                data = resp.json()
            except Exception:
                data = {"detail": resp.text}
            return resp.status_code, data
    except Exception as exc:
        return 502, {"detail": f"Failed to contact game server node: {exc}"}


# Backward-compatible alias
usenet_proxy_request = server_proxy_request


def explorer_browse(server: UserGameServer, path: str | None = None) -> tuple[int, dict | list]:
    """Proxy directory browse request to connected otix-server node."""
    params = {"path": path} if path else None
    return server_proxy_request(
        server, "GET", "/api/v1/explorer/browse", params=params, timeout=6.0
    )


def explorer_set_download_path(
    server: UserGameServer,
    path: str,
    create_if_missing: bool = True,
    add_as_library: bool = True,
) -> tuple[int, dict | list]:
    """Proxy set-download-path request to connected otix-server node."""
    payload = {
        "path": path,
        "create_if_missing": create_if_missing,
        "add_as_library": add_as_library,
    }
    return server_proxy_request(
        server, "POST", "/api/v1/explorer/set-download-path", json=payload, timeout=8.0
    )


def explorer_create_folder(
    server: UserGameServer,
    parent_path: str,
    folder_name: str,
) -> tuple[int, dict | list]:
    """Proxy create-folder request to connected otix-server node."""
    payload = {
        "parent_path": parent_path,
        "folder_name": folder_name,
    }
    return server_proxy_request(
        server, "POST", "/api/v1/explorer/create-folder", json=payload, timeout=6.0
    )


# ── Usenet (SABnzbd & Prowlarr) Operations ──────────────────────────────


def usenet_get_config(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/usenet/config")


def usenet_save_config(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/usenet/config", json=payload)


def usenet_test_sabnzbd(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/usenet/test-sabnzbd", json=payload)


def usenet_test_prowlarr(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/usenet/test-prowlarr", json=payload)


def usenet_search(server: UserGameServer, query: str) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server, "GET", "/api/v1/usenet/search", params={"query": query}, timeout=30.0
    )


def usenet_download(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server, "POST", "/api/v1/usenet/download", json=payload, timeout=60.0
    )


def usenet_get_queue(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/usenet/queue", timeout=4.0)


def usenet_get_history(server: UserGameServer, limit: int = 50) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server,
        "GET",
        "/api/v1/usenet/history",
        params={"limit": limit},
        timeout=6.0,
    )


def usenet_delete_queue(server: UserGameServer, nzo_id: str) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "DELETE", f"/api/v1/usenet/queue/{nzo_id}", timeout=5.0)


# ── Modular Provider & Download Operations ──────────────────────────────


def provider_list(server: UserGameServer) -> tuple[int, dict | list]:
    """List registered downloaders and search providers configured on the server node."""
    return usenet_proxy_request(server, "GET", "/api/v1/providers")


def provider_test(server: UserGameServer, provider_type: str, name: str) -> tuple[int, dict | list]:
    """Test connectivity for a registered provider."""
    return usenet_proxy_request(server, "POST", f"/api/v1/providers/{provider_type}/{name}/test")


def downloads_search(
    server: UserGameServer, query: str, provider: str | None = None
) -> tuple[int, dict | list]:
    """Search game releases across registered search providers (Prowlarr, etc)."""
    params = {"query": query}
    if provider:
        params["provider"] = provider
    return usenet_proxy_request(
        server, "GET", "/api/v1/downloads/search", params=params, timeout=30.0
    )


def downloads_add(
    server: UserGameServer, payload: dict, downloader: str | None = None
) -> tuple[int, dict | list]:
    """Dispatch a release download to the target or active downloader (SABnzbd, etc)."""
    params = {"downloader": downloader} if downloader else None
    return usenet_proxy_request(
        server, "POST", "/api/v1/downloads/add", params=params, json=payload, timeout=10.0
    )


def downloads_queue(
    server: UserGameServer, downloader: str | None = None
) -> tuple[int, dict | list]:
    """Fetch live download queue from the downloader."""
    params = {"downloader": downloader} if downloader else None
    return usenet_proxy_request(
        server, "GET", "/api/v1/downloads/queue", params=params, timeout=4.0
    )


def downloads_history(
    server: UserGameServer, downloader: str | None = None, limit: int = 50
) -> tuple[int, dict | list]:
    """Fetch completed and failed downloads from the downloader."""
    params: dict = {"limit": limit}
    if downloader:
        params["downloader"] = downloader
    return usenet_proxy_request(
        server, "GET", "/api/v1/downloads/history", params=params, timeout=6.0
    )


def downloads_cancel(
    server: UserGameServer, download_id: str, downloader: str | None = None
) -> tuple[int, dict | list]:
    """Cancel or remove an item from the download queue."""
    params = {"downloader": downloader} if downloader else None
    return usenet_proxy_request(
        server, "DELETE", f"/api/v1/downloads/queue/{download_id}", params=params, timeout=5.0
    )


def prowlarr_get_indexers(
    server: UserGameServer, protocol: str | None = None
) -> tuple[int, dict | list]:
    """Fetch indexers from Prowlarr on the game server node."""
    params = {"protocol": protocol} if protocol else None
    return usenet_proxy_request(
        server, "GET", "/api/v1/prowlarr/indexers", params=params, timeout=10.0
    )


def prowlarr_sync_indexers(
    server: UserGameServer, protocol: str | None = None
) -> tuple[int, dict | list]:
    """Trigger ApplicationIndexerSync in Prowlarr on the game server node."""
    params = {"protocol": protocol} if protocol else None
    return usenet_proxy_request(
        server, "POST", "/api/v1/prowlarr/sync", params=params, timeout=15.0
    )


def sabnzbd_pause_queue(server: UserGameServer) -> tuple[int, dict | list]:
    """Pause SABnzbd queue on the game server node."""
    return usenet_proxy_request(server, "POST", "/api/v1/sabnzbd/pause", timeout=5.0)


def sabnzbd_resume_queue(server: UserGameServer) -> tuple[int, dict | list]:
    """Resume SABnzbd queue on the game server node."""
    return usenet_proxy_request(server, "POST", "/api/v1/sabnzbd/resume", timeout=5.0)


def scan_game_libraries(server: UserGameServer) -> tuple[int, dict | list]:
    """Ask the game server to re-index installer files after a download completes."""
    return usenet_proxy_request(server, "POST", "/api/v1/scan", timeout=30.0)


# ── Radarr Operations ───────────────────────────────────────────────────


def _instance_params(params: dict | None, instance_id: str | None) -> dict | None:
    if instance_id:
        merged = dict(params or {})
        merged["instance_id"] = instance_id
        return merged
    return params


def radarr_get_config(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/radarr/config", timeout=6.0)


def radarr_save_config(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/radarr/config", json=payload, timeout=8.0)


def radarr_test(server: UserGameServer, payload: dict | None = None) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server, "POST", "/api/v1/radarr/test", json=payload or {}, timeout=15.0
    )


def radarr_get_root_folders(
    server: UserGameServer, instance_id: str | None = None
) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server,
        "GET",
        "/api/v1/radarr/rootfolders",
        params=_instance_params(None, instance_id),
        timeout=10.0,
    )


def radarr_get_quality_profiles(
    server: UserGameServer, instance_id: str | None = None
) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server,
        "GET",
        "/api/v1/radarr/qualityprofiles",
        params=_instance_params(None, instance_id),
        timeout=10.0,
    )


def radarr_get_movies(
    server: UserGameServer, instance_id: str | None = None
) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server,
        "GET",
        "/api/v1/radarr/movies",
        params=_instance_params(None, instance_id),
        timeout=20.0,
    )


def radarr_lookup(
    server: UserGameServer, term: str, instance_id: str | None = None
) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server,
        "GET",
        "/api/v1/radarr/lookup",
        params=_instance_params({"term": term}, instance_id),
        timeout=15.0,
    )


def radarr_add_movie(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/radarr/movies", json=payload, timeout=20.0)


def radarr_get_queue(
    server: UserGameServer, page: int = 1, page_size: int = 50, instance_id: str | None = None
) -> tuple[int, dict | list]:
    params = _instance_params({"page": page, "page_size": page_size}, instance_id)
    return usenet_proxy_request(server, "GET", "/api/v1/radarr/queue", params=params, timeout=10.0)


def radarr_delete_queue(
    server: UserGameServer,
    queue_id: str | int,
    remove_from_client: bool = True,
    blocklist: bool = False,
    instance_id: str | None = None,
) -> tuple[int, dict | list]:
    params = _instance_params(
        {
            "remove_from_client": str(remove_from_client).lower(),
            "blocklist": str(blocklist).lower(),
        },
        instance_id,
    )
    return usenet_proxy_request(
        server, "DELETE", f"/api/v1/radarr/queue/{queue_id}", params=params, timeout=10.0
    )


def radarr_get_history(
    server: UserGameServer, page: int = 1, page_size: int = 50, instance_id: str | None = None
) -> tuple[int, dict | list]:
    params = _instance_params({"page": page, "page_size": page_size}, instance_id)
    return usenet_proxy_request(
        server, "GET", "/api/v1/radarr/history", params=params, timeout=10.0
    )


# ── Sonarr Operations ───────────────────────────────────────────────────


def sonarr_get_config(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/sonarr/config", timeout=6.0)


def sonarr_save_config(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/sonarr/config", json=payload, timeout=8.0)


def sonarr_test(server: UserGameServer, payload: dict | None = None) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server, "POST", "/api/v1/sonarr/test", json=payload or {}, timeout=15.0
    )


def sonarr_get_root_folders(
    server: UserGameServer, instance_id: str | None = None
) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server,
        "GET",
        "/api/v1/sonarr/rootfolders",
        params=_instance_params(None, instance_id),
        timeout=10.0,
    )


def sonarr_get_quality_profiles(
    server: UserGameServer, instance_id: str | None = None
) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server,
        "GET",
        "/api/v1/sonarr/qualityprofiles",
        params=_instance_params(None, instance_id),
        timeout=10.0,
    )


def sonarr_get_series(
    server: UserGameServer, instance_id: str | None = None
) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server,
        "GET",
        "/api/v1/sonarr/series",
        params=_instance_params(None, instance_id),
        timeout=20.0,
    )


def sonarr_lookup(
    server: UserGameServer, term: str, instance_id: str | None = None
) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server,
        "GET",
        "/api/v1/sonarr/lookup",
        params=_instance_params({"term": term}, instance_id),
        timeout=15.0,
    )


def sonarr_add_series(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/sonarr/series", json=payload, timeout=20.0)


def sonarr_get_queue(
    server: UserGameServer, page: int = 1, page_size: int = 50, instance_id: str | None = None
) -> tuple[int, dict | list]:
    params = _instance_params({"page": page, "page_size": page_size}, instance_id)
    return usenet_proxy_request(server, "GET", "/api/v1/sonarr/queue", params=params, timeout=10.0)


def sonarr_delete_queue(
    server: UserGameServer,
    queue_id: str | int,
    remove_from_client: bool = True,
    blocklist: bool = False,
    instance_id: str | None = None,
) -> tuple[int, dict | list]:
    params = _instance_params(
        {
            "remove_from_client": str(remove_from_client).lower(),
            "blocklist": str(blocklist).lower(),
        },
        instance_id,
    )
    return usenet_proxy_request(
        server, "DELETE", f"/api/v1/sonarr/queue/{queue_id}", params=params, timeout=10.0
    )


def sonarr_get_history(
    server: UserGameServer, page: int = 1, page_size: int = 50, instance_id: str | None = None
) -> tuple[int, dict | list]:
    params = _instance_params({"page": page, "page_size": page_size}, instance_id)
    return usenet_proxy_request(
        server, "GET", "/api/v1/sonarr/history", params=params, timeout=10.0
    )


# ── Epic (node-proxied OAuth + library scan) ────────────────────────────

NO_EPIC_NODE = "Connect an Otix Server to link Epic."


def pick_online_game_server(user) -> UserGameServer | None:
    """Return the user's most recently seen online, active Otix Server, if any."""
    return (
        UserGameServer.objects.filter(user=user, is_active=True, is_online=True)
        .order_by("-last_seen_at", "-id")
        .first()
    )


def proxy_epic_auth(server: UserGameServer, code: str) -> tuple[int, dict]:
    return server_proxy_request(
        server, "POST", "/api/v1/epic/auth", json={"code": code}, timeout=20.0
    )


def proxy_epic_status(server: UserGameServer) -> tuple[int, dict]:
    return server_proxy_request(server, "GET", "/api/v1/epic/status")


def proxy_epic_scan(server: UserGameServer) -> tuple[int, dict]:
    return server_proxy_request(server, "POST", "/api/v1/epic/scan", timeout=60.0)


def proxy_epic_disconnect(server: UserGameServer) -> tuple[int, dict]:
    return server_proxy_request(server, "DELETE", "/api/v1/epic/auth")
