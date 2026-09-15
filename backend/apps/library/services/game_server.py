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
                server.storage_free_bytes = data.get(
                    "disk_free_bytes", server.storage_free_bytes
                )
                server.storage_total_bytes = data.get(
                    "disk_total_bytes", server.storage_total_bytes
                )
                server.save(update_fields=[
                    "is_online", "last_seen_at", "total_files",
                    "storage_free_bytes", "storage_total_bytes", "updated_at"
                ])
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


def explorer_browse(server: UserGameServer, path: str | None = None) -> tuple[int, dict]:
    """Proxy directory browse request to connected otix-server node."""
    target_url = (server.primary_url or "").rstrip("/")
    if not target_url:
        return 400, {"error": "Server URL not configured"}

    headers = {}
    if server.auth_token:
        headers["Authorization"] = f"Bearer {server.auth_token}"

    params = {}
    if path:
        params["path"] = path

    try:
        with httpx.Client(timeout=6.0) as client:
            resp = client.get(f"{target_url}/api/v1/explorer/browse", params=params, headers=headers)
            try:
                data = resp.json()
            except Exception:
                data = {"detail": resp.text}
            return resp.status_code, data
    except Exception as exc:
        return 502, {"detail": f"Failed to contact game server node: {exc}"}


def explorer_set_download_path(
    server: UserGameServer,
    path: str,
    create_if_missing: bool = True,
    add_as_library: bool = True,
) -> tuple[int, dict]:
    """Proxy set-download-path request to connected otix-server node."""
    target_url = (server.primary_url or "").rstrip("/")
    if not target_url:
        return 400, {"error": "Server URL not configured"}

    headers = {}
    if server.auth_token:
        headers["Authorization"] = f"Bearer {server.auth_token}"

    payload = {
        "path": path,
        "create_if_missing": create_if_missing,
        "add_as_library": add_as_library,
    }

    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(
                f"{target_url}/api/v1/explorer/set-download-path",
                json=payload,
                headers=headers,
            )
            try:
                data = resp.json()
            except Exception:
                data = {"detail": resp.text}
            return resp.status_code, data
    except Exception as exc:
        return 502, {"detail": f"Failed to contact game server node: {exc}"}


def explorer_create_folder(
    server: UserGameServer,
    parent_path: str,
    folder_name: str,
) -> tuple[int, dict]:
    """Proxy create-folder request to connected otix-server node."""
    target_url = (server.primary_url or "").rstrip("/")
    if not target_url:
        return 400, {"error": "Server URL not configured"}

    headers = {}
    if server.auth_token:
        headers["Authorization"] = f"Bearer {server.auth_token}"

    payload = {
        "parent_path": parent_path,
        "folder_name": folder_name,
    }

    try:
        with httpx.Client(timeout=6.0) as client:
            resp = client.post(
                f"{target_url}/api/v1/explorer/create-folder",
                json=payload,
                headers=headers,
            )
            try:
                data = resp.json()
            except Exception:
                data = {"detail": resp.text}
            return resp.status_code, data
    except Exception as exc:
        return 502, {"detail": f"Failed to contact game server node: {exc}"}


# ── Usenet (SABnzbd & Prowlarr) Operations ──────────────────────────────

def usenet_proxy_request(
    server: UserGameServer,
    method: str,
    path: str,
    params: dict | None = None,
    json: dict | None = None,
    timeout: float = 6.0,
) -> tuple[int, dict | list]:
    """Generic helper to proxy Usenet requests to connected otix-server node."""
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


def usenet_get_config(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/usenet/config")


def usenet_save_config(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/usenet/config", json=payload)


def usenet_test_sabnzbd(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/usenet/test-sabnzbd", json=payload)


def usenet_test_prowlarr(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/usenet/test-prowlarr", json=payload)


def usenet_search(server: UserGameServer, query: str) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/usenet/search", params={"query": query}, timeout=30.0)


def usenet_download(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/usenet/download", json=payload, timeout=10.0)


def usenet_get_queue(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/usenet/queue", timeout=4.0)


def usenet_delete_queue(server: UserGameServer, nzo_id: str) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "DELETE", f"/api/v1/usenet/queue/{nzo_id}", timeout=5.0)


# ── Modular Provider & Download Operations ──────────────────────────────

def provider_list(server: UserGameServer) -> tuple[int, dict | list]:
    """List registered downloaders and search providers configured on the server node."""
    return usenet_proxy_request(server, "GET", "/api/v1/providers")


def provider_test(server: UserGameServer, provider_type: str, name: str) -> tuple[int, dict | list]:
    """Test connectivity for a registered provider."""
    return usenet_proxy_request(server, "POST", f"/api/v1/providers/{provider_type}/{name}/test")


def downloads_search(server: UserGameServer, query: str, provider: str | None = None) -> tuple[int, dict | list]:
    """Search game releases across registered search providers (Prowlarr, etc)."""
    params = {"query": query}
    if provider:
        params["provider"] = provider
    return usenet_proxy_request(server, "GET", "/api/v1/downloads/search", params=params, timeout=30.0)


def downloads_add(server: UserGameServer, payload: dict, downloader: str | None = None) -> tuple[int, dict | list]:
    """Dispatch a release download to the target or active downloader (SABnzbd, etc)."""
    params = {"downloader": downloader} if downloader else None
    return usenet_proxy_request(server, "POST", "/api/v1/downloads/add", params=params, json=payload, timeout=10.0)


def downloads_queue(server: UserGameServer, downloader: str | None = None) -> tuple[int, dict | list]:
    """Fetch live download queue from the downloader."""
    params = {"downloader": downloader} if downloader else None
    return usenet_proxy_request(server, "GET", "/api/v1/downloads/queue", params=params, timeout=4.0)


def downloads_cancel(server: UserGameServer, download_id: str, downloader: str | None = None) -> tuple[int, dict | list]:
    """Cancel or remove an item from the download queue."""
    params = {"downloader": downloader} if downloader else None
    return usenet_proxy_request(server, "DELETE", f"/api/v1/downloads/queue/{download_id}", params=params, timeout=5.0)


def prowlarr_get_indexers(server: UserGameServer, protocol: str | None = None) -> tuple[int, dict | list]:
    """Fetch indexers from Prowlarr on the game server node."""
    params = {"protocol": protocol} if protocol else None
    return usenet_proxy_request(server, "GET", "/api/v1/prowlarr/indexers", params=params, timeout=10.0)


def prowlarr_sync_indexers(server: UserGameServer, protocol: str | None = None) -> tuple[int, dict | list]:
    """Trigger ApplicationIndexerSync in Prowlarr on the game server node."""
    params = {"protocol": protocol} if protocol else None
    return usenet_proxy_request(server, "POST", "/api/v1/prowlarr/sync", params=params, timeout=15.0)


def sabnzbd_pause_queue(server: UserGameServer) -> tuple[int, dict | list]:
    """Pause SABnzbd queue on the game server node."""
    return usenet_proxy_request(server, "POST", "/api/v1/sabnzbd/pause", timeout=5.0)


def sabnzbd_resume_queue(server: UserGameServer) -> tuple[int, dict | list]:
    """Resume SABnzbd queue on the game server node."""
    return usenet_proxy_request(server, "POST", "/api/v1/sabnzbd/resume", timeout=5.0)



