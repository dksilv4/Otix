"""Game server service operations: connectivity probes, health checks, and metrics sync."""

import os
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import httpx
from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone

from apps.library.models import UserGameServer

_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
PENDING_CACHE_KEY = "otix:pending-game-nodes"
PENDING_TTL = 600


def contact_urls(stored_url: str) -> list[str]:
    """URLs to try when the API talks to an otix-server node.

    Browsers can reach ``http://127.0.0.1:8090`` on the host; the Django API
    inside Docker cannot. When ``OTIX_SERVER_DOCKER_HOST`` is set (compose
    uses ``storage-server``), loopback URLs are also tried on that hostname
    and on ``host.docker.internal`` so a host-entered localhost URL still
    probes the published storage node.
    """
    base = (stored_url or "").rstrip("/")
    if not base:
        return []
    parsed = urlparse(base)
    host = (parsed.hostname or "").lower()
    if host not in _LOOPBACK_HOSTS:
        return [base]
    extras: list[str] = []
    docker_host = (os.environ.get("OTIX_SERVER_DOCKER_HOST") or "").strip()
    if docker_host:
        extras.append(docker_host)
    if docker_host or Path("/.dockerenv").exists():
        extras.append("host.docker.internal")
    rewritten: list[str] = []
    for extra in extras:
        netloc = f"{extra}:{parsed.port}" if parsed.port else extra
        candidate = urlunparse(parsed._replace(netloc=netloc)).rstrip("/")
        if candidate not in rewritten and candidate != base:
            rewritten.append(candidate)
    # Docker-reachable hosts first: 127.0.0.1 inside the API container is the
    # API itself, so trying loopback first 502s every Radarr/Sonarr poll.
    return [*rewritten, base]


def _is_docker_bridge_host(host: str) -> bool:
    if not host.startswith("172."):
        return False
    try:
        second = int(host.split(".")[1])
    except (IndexError, ValueError):
        return False
    return 16 <= second <= 31


def browser_url_for_node(port: int, advertised: str | None) -> str:
    """URL the Otix UI should store so the browser can reach a published port."""
    if advertised:
        parsed = urlparse(advertised)
        host = (parsed.hostname or "").lower()
        if host and host not in _LOOPBACK_HOSTS and not _is_docker_bridge_host(host):
            return advertised.rstrip("/")
        if parsed.port:
            port = parsed.port
    return f"http://127.0.0.1:{port}"


def _strip_url(url: str | None) -> str:
    return (url or "").rstrip("/")


def heartbeat_identity_urls(node: dict) -> list[str]:
    """URLs that identify the same node as a heartbeat (LAN, Docker, or localhost)."""
    try:
        port = int(node.get("port") or 8090)
    except (TypeError, ValueError):
        port = 8090
    urls: list[str] = []
    for raw in (node.get("local_url"), node.get("advertised_url")):
        stripped = _strip_url(raw)
        if stripped:
            urls.append(stripped)
    urls.extend([f"http://127.0.0.1:{port}", f"http://localhost:{port}"])
    seen: set[str] = set()
    unique: list[str] = []
    for url in urls:
        if url not in seen:
            seen.add(url)
            unique.append(url)
    return unique


def record_node_heartbeat(payload: dict) -> dict:
    """Remember a node announcement until a signed-in user auto-connects it."""
    try:
        port = int(payload.get("port") or 8090)
    except (TypeError, ValueError):
        port = 8090
    endpoints = payload.get("local_endpoints") or []
    advertised = endpoints[0] if endpoints else ""
    node = {
        "server_name": (payload.get("server_name") or "Otix Game Server").strip(),
        "local_url": browser_url_for_node(port, advertised),
        "advertised_url": advertised,
        "port": port,
        "auth_token": payload.get("auth_token") or "",
    }
    nodes = [
        row
        for row in (cache.get(PENDING_CACHE_KEY) or [])
        if row.get("local_url") != node["local_url"]
    ]
    nodes.append(node)
    cache.set(PENDING_CACHE_KEY, nodes, PENDING_TTL)
    return node


def apply_node_heartbeat(payload: dict) -> dict:
    """Record a pending node and relink any already-saved UserGameServer rows.

    This is the original auto-connect path: a live node posting heartbeat marks
    matching saved servers online and fills in the access token, including when
    the user added ``http://127.0.0.1:8090`` and the node advertised a LAN IP.
    """
    node = record_node_heartbeat(payload)
    urls = heartbeat_identity_urls(node)
    token = node.get("auth_token") or ""
    query = Q()
    for url in urls:
        query |= (
            Q(local_url=url) | Q(local_url=f"{url}/") | Q(remote_url=url) | Q(remote_url=f"{url}/")
        )
    if token:
        query |= Q(auth_token=token)
    now = timezone.now()
    for server in UserGameServer.objects.filter(query):
        fields = ["is_online", "last_seen_at", "updated_at"]
        server.is_online = True
        server.last_seen_at = now
        if token and server.auth_token != token:
            server.auth_token = token
            fields.append("auth_token")
        name = (node.get("server_name") or "").strip()
        if name and server.name != name:
            server.name = name
            fields.append("name")
        server.save(update_fields=fields)
    return node


def list_pending_nodes() -> list[dict]:
    return list(cache.get(PENDING_CACHE_KEY) or [])


def list_pending_nodes_for(user) -> list[dict]:
    """Pending heartbeats that this user has not already linked."""
    if user is None or not getattr(user, "is_authenticated", False):
        return []
    nodes = list_pending_nodes()
    if not nodes:
        return []
    servers = UserGameServer.objects.filter(user=user).only("local_url", "remote_url", "auth_token")
    claimed_urls: set[str] = set()
    claimed_tokens: set[str] = set()
    for server in servers:
        for url in (server.local_url, server.remote_url):
            stripped = _strip_url(url)
            if stripped:
                claimed_urls.add(stripped)
        if server.auth_token:
            claimed_tokens.add(server.auth_token)
    pending: list[dict] = []
    for node in nodes:
        token = node.get("auth_token") or ""
        if token and token in claimed_tokens:
            continue
        if any(_strip_url(url) in claimed_urls for url in heartbeat_identity_urls(node)):
            continue
        pending.append(node)
    return pending


def _normalized_url_keys(local_url: str | None, remote_url: str | None) -> set[str]:
    keys: set[str] = set()
    for url in (local_url, remote_url):
        stripped = _strip_url(url)
        if not stripped:
            continue
        parsed = urlparse(stripped)
        host = (parsed.hostname or "").lower()
        if host in _LOOPBACK_HOSTS:
            host = "127.0.0.1"
        if not host:
            keys.add(stripped)
            continue
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        keys.add(f"{host}:{port}")
    return keys


def server_match_keys(local_url: str | None, remote_url: str | None, auth_token: str | None) -> set[str]:
    """Identity keys used to treat two UserGameServer rows as the same node."""
    keys = {f"url:{key}" for key in _normalized_url_keys(local_url, remote_url)}
    token = (auth_token or "").strip()
    if token:
        keys.add(f"token:{token}")
    return keys


def _merge_game_server_into(keeper: UserGameServer, extra: UserGameServer) -> None:
    """Move downloads onto ``keeper`` and copy any missing connection fields."""
    from apps.library.models import GameServerDownload

    fields: list[str] = []
    if extra.auth_token and extra.auth_token != keeper.auth_token:
        keeper.auth_token = extra.auth_token
        fields.append("auth_token")
    if extra.name and keeper.name != extra.name:
        keeper.name = extra.name
        fields.append("name")
    if extra.local_url and not keeper.local_url:
        keeper.local_url = extra.local_url
        fields.append("local_url")
    if extra.remote_url and not keeper.remote_url:
        keeper.remote_url = extra.remote_url
        fields.append("remote_url")
    if extra.is_online and not keeper.is_online:
        keeper.is_online = True
        fields.append("is_online")
    if extra.last_seen_at and (keeper.last_seen_at is None or extra.last_seen_at > keeper.last_seen_at):
        keeper.last_seen_at = extra.last_seen_at
        fields.append("last_seen_at")
    if fields:
        keeper.save(update_fields=[*fields, "updated_at"])

    for download in GameServerDownload.objects.filter(server=extra):
        if GameServerDownload.objects.filter(server=keeper, nzo_id=download.nzo_id).exists():
            download.delete()
        else:
            download.server = keeper
            download.save(update_fields=["server"])
    extra.delete()


def collapse_duplicate_game_servers(user) -> int:
    """Keep one row per node (token or normalized URL) and delete extras."""
    servers = list(UserGameServer.objects.filter(user=user).order_by("created_at", "id"))
    groups: list[tuple[set[str], UserGameServer]] = []
    extras: list[tuple[UserGameServer, UserGameServer]] = []
    for server in servers:
        keys = server_match_keys(server.local_url, server.remote_url, server.auth_token)
        matched: UserGameServer | None = None
        for group_keys, keeper in groups:
            if keys & group_keys:
                matched = keeper
                group_keys |= keys
                break
        if matched is None:
            groups.append((keys, server))
        else:
            extras.append((server, matched))
    for extra, keeper in extras:
        _merge_game_server_into(keeper, extra)
    return len(extras)


def link_or_create_game_server(user, data: dict) -> tuple[UserGameServer, bool]:
    """Register a node, or update the user's existing row for the same node."""
    local_url = data.get("local_url") or ""
    remote_url = data.get("remote_url") or ""
    auth_token = data.get("auth_token") or ""
    incoming = server_match_keys(local_url, remote_url, auth_token)
    for server in UserGameServer.objects.filter(user=user).order_by("created_at", "id"):
        existing = server_match_keys(server.local_url, server.remote_url, server.auth_token)
        if not (incoming & existing):
            continue
        fields: list[str] = []
        for field in ("name", "local_url", "remote_url", "auth_token", "is_active"):
            value = data.get(field)
            if value in (None, "") or getattr(server, field) == value:
                continue
            setattr(server, field, value)
            fields.append(field)
        if fields:
            server.save(update_fields=[*fields, "updated_at"])
        return server, False
    return UserGameServer.objects.create(user=user, **data), True


def _auth_headers(server: UserGameServer) -> dict[str, str]:
    if not server.auth_token:
        return {}
    return {"Authorization": f"Bearer {server.auth_token}"}


def _mark_offline(server: UserGameServer, error: str) -> dict:
    server.is_online = False
    server.save(update_fields=["is_online", "updated_at"])
    return {"online": False, "error": error}


def ping_server_sync(server: UserGameServer) -> dict:
    """Probe server /api/v1/status and update server model state."""
    from apps.library.services.backend_node import is_backend_node

    if is_backend_node(server):
        return {"online": True, "latency_ms": 0}

    targets = contact_urls(server.primary_url)
    if not targets:
        return _mark_offline(server, "No server URL provided")

    headers = _auth_headers(server)
    start_t = time.perf_counter()
    last_error = "No server URL provided"
    resp = None
    try:
        with httpx.Client(timeout=3.0) as client:
            for target_url in targets:
                try:
                    resp = client.get(f"{target_url}/api/v1/status", headers=headers)
                except Exception as exc:
                    last_error = str(exc)
                    continue
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
                if resp.status_code == 401:
                    return _mark_offline(server, "Unauthorized (invalid auth token)")
                last_error = f"HTTP {resp.status_code}"
    except Exception as exc:
        return _mark_offline(server, str(exc))

    return _mark_offline(server, last_error)


def server_proxy_request(
    server: UserGameServer,
    method: str,
    path: str,
    params: dict | None = None,
    json: dict | None = None,
    timeout: float = 6.0,
) -> tuple[int, dict | list]:
    """Generic helper to proxy requests to connected otix-server node."""
    from apps.library.services.backend_node import handle_backend_proxy, is_backend_node

    if is_backend_node(server):
        return handle_backend_proxy(server.user, method, path, json, params)

    targets = contact_urls(server.primary_url)
    if not targets:
        return 400, {"error": "Server URL not configured"}

    headers = _auth_headers(server)
    last_error: Exception | str = "Server URL not configured"
    for target_url in targets:
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
            last_error = exc
            continue
    return 502, {"detail": f"Failed to contact game server node: {last_error}"}


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


def usenet_get_config(server: UserGameServer, include_secrets: bool = False) -> tuple[int, dict | list]:
    params = {"include_secrets": True} if include_secrets else None
    return usenet_proxy_request(server, "GET", "/api/v1/usenet/config", params=params)


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


def radarr_get_config(server: UserGameServer, include_secrets: bool = False) -> tuple[int, dict | list]:
    params = {"include_secrets": True} if include_secrets else None
    return usenet_proxy_request(server, "GET", "/api/v1/radarr/config", params=params, timeout=6.0)


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


def sonarr_get_config(server: UserGameServer, include_secrets: bool = False) -> tuple[int, dict | list]:
    params = {"include_secrets": True} if include_secrets else None
    return usenet_proxy_request(server, "GET", "/api/v1/sonarr/config", params=params, timeout=6.0)


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


# ── Desktop Operations ──────────────────────────────────────────────────


def desktop_get_settings(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/desktop/settings", timeout=6.0)


def node_list_libraries(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/libraries", timeout=8.0)


def node_replace_libraries(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "PUT", "/api/v1/libraries", json=payload, timeout=20.0)


def node_get_organize(server: UserGameServer) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "GET", "/api/v1/organize", timeout=6.0)


def node_save_organize(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(server, "POST", "/api/v1/organize", json=payload, timeout=10.0)


def desktop_save_settings(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    return usenet_proxy_request(
        server, "POST", "/api/v1/desktop/settings", json=payload, timeout=10.0
    )


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
