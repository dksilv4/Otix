"""Node service operations: connectivity probes, health checks, and metrics sync."""

import os
import time
from datetime import timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse

import httpx
from django.conf import settings
from django.core.cache import cache
from django.db.models import Q
from django.utils import timezone

from apps.library.models import UserNode

UserGameServer = UserNode

_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
PENDING_CACHE_KEY = "otix:pending-nodes"
PENDING_TTL = 600


def contact_urls(stored_url: str) -> list[str]:
    """URLs to try when the API talks to an otix node.

    Browsers can reach ``http://127.0.0.1:8090`` on the host; the Django API
    inside Docker cannot. When ``OTIX_SERVER_DOCKER_HOST`` is set (compose
    uses ``node``), loopback URLs are also tried on that hostname
    and on ``host.docker.internal`` so a host-entered localhost URL still
    probes the published node.
    """
    base = (stored_url or "").rstrip("/")
    if not base or base.startswith("otix://"):
        return []
    parsed = urlparse(base)
    host = (parsed.hostname or "").lower()
    is_local = (
        host in _LOOPBACK_HOSTS
        or host.startswith("192.168.")
        or host.startswith("10.")
        or host.startswith("172.")
    )
    if not is_local:
        return [base]
    extras: list[str] = []
    docker_host = (os.environ.get("OTIX_SERVER_DOCKER_HOST") or "").strip()
    if docker_host:
        extras.append(docker_host)
    is_docker = Path("/.dockerenv").exists() and not getattr(settings, "TESTING", False)
    if docker_host or is_docker:
        extras.append("host.docker.internal")
    rewritten: list[str] = []
    for extra in extras:
        netloc = f"{extra}:{parsed.port}" if parsed.port else extra
        candidate = urlunparse(parsed._replace(netloc=netloc)).rstrip("/")
        if candidate not in rewritten and candidate != base:
            rewritten.append(candidate)
    # Docker-reachable hosts first: 127.0.0.1 or LAN host IPs inside the API container cannot
    # reliably reach the Mac/Windows host directly, so trying rewritten (host.docker.internal)
    # first avoids 502 connection timeouts on Radarr/Sonarr/downloads polls.
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
        "wan_ip": payload.get("wan_ip") or "",
        "port": port,
        "auth_token": payload.get("auth_token") or "",
        "claim_code": payload.get("claim_code") or "",
        "claimed": bool(payload.get("claimed", False)),
    }

    def _is_same_node(row: dict, current: dict) -> bool:
        if current.get("auth_token") and row.get("auth_token") == current.get("auth_token"):
            return True
        if current.get("claim_code") and row.get("claim_code") == current.get("claim_code"):
            return True
        if row.get("local_url") and current.get("local_url") and row.get("local_url") == current.get("local_url"):
            return True
        return False

    nodes = [
        row
        for row in (cache.get(PENDING_CACHE_KEY) or [])
        if not _is_same_node(row, node)
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
    claim_code = (payload.get("claim_code") or "").strip().upper()
    cached_claim = None
    if claim_code:
        for cached in (cache.get(PENDING_CACHE_KEY) or []):
            if (
                str(cached.get("claim_code") or "").strip().upper() == claim_code
                and cached.get("claimed")
                and cached.get("auth_token")
            ):
                cached_claim = cached
                break

    node = record_node_heartbeat(payload)
    if cached_claim:
        node["claimed"] = True
        node["auth_token"] = cached_claim.get("auth_token")
        node["claimed_by"] = cached_claim.get("claimed_by", "")
        if not node.get("server_name") or node.get("server_name") in ("Otix Game Server", "Otix Node"):
            node["server_name"] = cached_claim.get("server_name", node.get("server_name"))
        # Rendezvous claim delivered: prune from pending cache
        remaining = [
            r
            for r in (cache.get(PENDING_CACHE_KEY) or [])
            if str(r.get("claim_code") or "").strip().upper() != claim_code
        ]
        cache.set(PENDING_CACHE_KEY, remaining, PENDING_TTL)
    urls = heartbeat_identity_urls(node)
    token = node.get("auth_token") or ""
    is_claimed = bool(node.get("claimed") or token)

    if not is_claimed:
        # Node explicitly announced itself as UNCLAIMED (or lacks auth_token).
        # It must NEVER be forced into a claimed state by database URL matching!
        node["claimed"] = False
        node["auth_token"] = ""
        node["claimed_by"] = ""

        # Any existing DB server rows with these URLs cannot be online with this unclaimed node.
        query = Q()
        for url in urls:
            query |= (
                Q(local_url=url) | Q(local_url=f"{url}/") | Q(remote_url=url) | Q(remote_url=f"{url}/")
            )
        UserGameServer.objects.filter(query, is_online=True).update(is_online=False, updated_at=timezone.now())
        return node

    # Genuinely claimed node: match existing servers by token or URL and update state
    query = Q()
    for url in urls:
        query |= (
            Q(local_url=url) | Q(local_url=f"{url}/") | Q(remote_url=url) | Q(remote_url=f"{url}/")
        )
    if token:
        query |= Q(auth_token=token)
    now = timezone.now()
    matched_servers = list(UserGameServer.objects.filter(query).select_related("user"))
    for server in matched_servers:
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

        # Reflect server user & name on the returned node announcement
        node["claimed"] = True
        node["claimed_by"] = getattr(server.user, "username", node.get("claimed_by", "admin"))
        node["auth_token"] = server.auth_token or token
        node["server_name"] = server.name

        running_game = payload.get("running_game")
        if running_game and isinstance(running_game, dict) and (running_game.get("title") or running_game.get("id")):
            cache_key = f"user_running_game:{server.user_id}"
            cache.set(cache_key, {
                "running": True,
                "game": running_game,
                "games": [running_game],
            }, timeout=90)
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
        if node.get("claimed"):
            continue
        token = node.get("auth_token") or ""
        if token and token in claimed_tokens:
            continue
        if any(_strip_url(url) in claimed_urls for url in heartbeat_identity_urls(node)):
            continue
        pending.append(node)
    return pending


def claim_node_by_pin(
    user,
    claim_code: str,
    node_url: str | None = None,
    server_name: str | None = None,
    is_local: bool | None = None,
) -> tuple[UserNode, bool]:
    """Claim a pending or specified node using its 6-character claim PIN.

    Validates reachability BEFORE creating or updating the database record.
    """
    import secrets

    code = (claim_code or "").strip().upper()
    if not code:
        raise ValueError("Claim PIN code is required")

    target_node = None
    target_url = (node_url or "").strip().rstrip("/")

    # Search pending nodes for this PIN
    pending_nodes = list_pending_nodes()
    for n in pending_nodes:
        if n.get("claim_code") and str(n.get("claim_code")).strip().upper() == code:
            target_node = n
            if not target_url:
                target_url = n.get("local_url") or n.get("advertised_url")
            break

    if not target_url:
        raise ValueError(
            f"No pending node found for claim PIN '{code}'. Enter the node URL or ensure the node is running."
        )

    # Auto-naming fallback: Node ID:<X>
    user_nodes_count = UserNode.objects.filter(user=user).count() + 1
    raw_name = (server_name or "").strip()
    announced_name = (target_node.get("server_name") if target_node else None) or ""
    if raw_name and raw_name not in ("Otix Game Server", "Otix Node") and not raw_name.startswith("Node ID:"):
        resolved_name = raw_name
    elif announced_name and announced_name not in ("Otix Game Server", "Otix Node") and not announced_name.startswith("Node ID:"):
        resolved_name = announced_name
    elif raw_name:
        resolved_name = raw_name
    else:
        resolved_name = f"Node ID:{user_nodes_count}"

    auth_token = secrets.token_hex(24)

    confirm_payload = {
        "claim_code": code,
        "auth_token": auth_token,
        "server_name": resolved_name,
        "username": getattr(user, "username", "user"),
    }

    targets = contact_urls(target_url)
    last_error = "Could not contact node"
    confirmed = False

    for target in targets:
        try:
            with httpx.Client(timeout=6.0) as client:
                resp = client.post(f"{target}/api/v1/claim/confirm", json=confirm_payload)
                if resp.status_code == 200:
                    confirmed = True
                    break
                try:
                    err_data = resp.json()
                    last_error = (
                        err_data.get("error")
                        or err_data.get("detail")
                        or f"HTTP {resp.status_code}"
                    )
                except Exception:
                    last_error = f"HTTP {resp.status_code}"
                if 400 <= resp.status_code < 500:
                    break
        except Exception as exc:
            last_error = str(exc)

    confirmed_directly = confirmed
    if not confirmed:
        if target_node:
            # Backend could not reach node directly (e.g. node is behind NAT/firewall),
            # but node actively announced this claim PIN to this backend via heartbeat.
            confirmed = True
            target_node["claimed"] = True
            target_node["claimed_by"] = getattr(user, "username", "user")
            target_node["auth_token"] = auth_token
            target_node["server_name"] = resolved_name
            nodes = [
                r
                for r in (cache.get(PENDING_CACHE_KEY) or [])
                if str(r.get("claim_code") or "").strip().upper() != code
            ]
            nodes.append(target_node)
            cache.set(PENDING_CACHE_KEY, nodes, PENDING_TTL)
        else:
            raise ValueError(f"Failed to claim node: {last_error}")

    # Determine is_local
    node_is_local = is_local
    if node_is_local is None:
        parsed_target = urlparse(target_url)
        target_h = (parsed_target.hostname or "").lower()
        node_is_local = (
            target_h in _LOOPBACK_HOSTS
            or target_h.startswith("192.168.")
            or target_h.startswith("10.")
            or target_h.startswith("172.")
        )

    # Create / link UserNode
    server_data = {
        "name": resolved_name,
        "local_url": target_url,
        "auth_token": auth_token,
        "is_local": node_is_local,
    }
    if not node_is_local and target_node and target_node.get("wan_ip"):
        wan_port = target_node.get("port") or 8090
        server_data["remote_url"] = f"http://{target_node['wan_ip']}:{wan_port}"

    server, created = link_or_create_node(user, server_data)
    if target_node:
        server.is_online = True
        server.last_seen_at = timezone.now()
        server.save(update_fields=["is_online", "last_seen_at", "updated_at"])
    else:
        result = ping_server_sync(server)
        if not result.get("online"):
            if created:
                server.delete()
            raise ValueError(
                f"Could not connect to node at {target_url} ({result.get('error') or 'unreachable'}). Ensure the node is online."
            )
        server.refresh_from_db()

    # Prune from pending cache if directly confirmed
    if confirmed_directly:
        remaining = [
            r
            for r in (cache.get(PENDING_CACHE_KEY) or [])
            if str(r.get("claim_code") or "").strip().upper() != code
        ]
        cache.set(PENDING_CACHE_KEY, remaining, PENDING_TTL)

    return server, created


def claim_node_direct(
    user,
    payload: dict,
    remote_ip: str | None = None,
) -> tuple[UserNode, bool]:
    """Claim and bind a node directly using an outbound authenticated request from the node.

    Because the node connects outbound directly to the Otix backend, remote reachability
    and inbound port forwarding are not required.
    """
    import secrets

    server_name = (
        payload.get("server_name")
        or payload.get("serverName")
        or payload.get("name")
        or ""
    ).strip()

    auth_token = (
        payload.get("auth_token")
        or payload.get("authToken")
        or secrets.token_hex(24)
    ).strip()

    port = int(payload.get("port") or 8090)
    endpoints = payload.get("local_endpoints") or payload.get("localEndpoints") or []

    user_nodes_count = UserNode.objects.filter(user=user).count() + 1
    if not server_name or server_name in ("Otix Game Server", "Otix Node") or server_name.startswith("Node ID:"):
        pending_matches = [
            n
            for n in list_pending_nodes()
            if (auth_token and n.get("auth_token") == auth_token)
            or any(ep and n.get("local_url") == ep for ep in endpoints)
        ]
        announced = pending_matches[0].get("server_name") if pending_matches else ""
        if announced and announced not in ("Otix Game Server", "Otix Node") and not announced.startswith("Node ID:"):
            resolved_name = announced
        elif server_name:
            resolved_name = server_name
        else:
            resolved_name = f"Node ID:{user_nodes_count}"
    else:
        resolved_name = server_name

    local_url = ""
    if isinstance(endpoints, list):
        for ep in endpoints:
            if ep and isinstance(ep, str):
                ep_clean = ep.strip().rstrip("/")
                if "127.0.0.1" not in ep_clean and "localhost" not in ep_clean:
                    local_url = ep_clean
                    break
        if not local_url and endpoints:
            local_url = str(endpoints[0]).strip().rstrip("/")
    if not local_url:
        local_url = f"http://127.0.0.1:{port}"

    is_local = payload.get("is_local") if "is_local" in payload else payload.get("isLocal")
    if is_local is None:
        parsed_target = urlparse(local_url)
        target_h = (parsed_target.hostname or "").lower()
        is_local = (
            target_h in _LOOPBACK_HOSTS
            or target_h.startswith("192.168.")
            or target_h.startswith("10.")
            or target_h.startswith("172.")
        )

    is_local_desktop = (
        payload.get("is_local_desktop")
        if "is_local_desktop" in payload
        else payload.get("isLocalDesktop")
    )

    server_data = {
        "name": resolved_name,
        "local_url": local_url,
        "auth_token": auth_token,
        "is_local": bool(is_local),
    }
    if is_local_desktop is not None:
        server_data["is_local_desktop"] = bool(is_local_desktop)

    clean_ip = (remote_ip or "").strip()
    if clean_ip and clean_ip not in _LOOPBACK_HOSTS:
        server_data["remote_url"] = f"http://{clean_ip}:{port}"

    server, created = link_or_create_node(user, server_data)
    server.is_online = True
    server.last_seen_at = timezone.now()
    server.save(update_fields=["is_online", "last_seen_at", "updated_at"])

    # Prune any pending cache entries that match this node or its claim code
    claim_code = (payload.get("claim_code") or payload.get("claimCode") or "").strip().upper()
    cached_pending = cache.get(PENDING_CACHE_KEY) or []
    if cached_pending:
        new_pending = []
        for r in cached_pending:
            if claim_code and str(r.get("claim_code") or "").strip().upper() == claim_code:
                continue
            r_eps = r.get("local_endpoints") or []
            if local_url in r_eps or local_url == r.get("local_url"):
                continue
            new_pending.append(r)
        cache.set(PENDING_CACHE_KEY, new_pending, PENDING_TTL)

    return server, created


def unclaim_node(token: str = "", urls: list[str] | None = None, user=None) -> int:
    """Unclaim and delete UserGameServer record(s) matching token or URLs, and purge pending cache."""
    query = Q()
    clean_token = (token or "").strip()
    if clean_token:
        query |= Q(auth_token=clean_token)
    if urls:
        for url in urls:
            cleaned = _strip_url(url)
            if cleaned:
                query |= (
                    Q(local_url=cleaned)
                    | Q(local_url=f"{cleaned}/")
                    | Q(remote_url=cleaned)
                    | Q(remote_url=f"{cleaned}/")
                )
    if user and getattr(user, "is_authenticated", False):
        query &= Q(user=user)

    if not query:
        return 0

    servers = list(UserGameServer.objects.filter(query))
    count = len(servers)
    deleted_urls: set[str] = set()
    deleted_tokens: set[str] = set()
    if clean_token:
        deleted_tokens.add(clean_token)
    for s in servers:
        if s.auth_token:
            deleted_tokens.add(s.auth_token)
        if s.local_url:
            deleted_urls.add(_strip_url(s.local_url))
        if s.remote_url:
            deleted_urls.add(_strip_url(s.remote_url))
        s.delete()

    # Clean pending cache of matching claimed records
    remaining: list[dict] = []
    for r in cache.get(PENDING_CACHE_KEY) or []:
        r_token = r.get("auth_token") or ""
        if r_token and r_token in deleted_tokens:
            continue
        r_urls = {_strip_url(u) for u in heartbeat_identity_urls(r)}
        if r_urls & deleted_urls and r.get("claimed"):
            continue
        remaining.append(r)
    cache.set(PENDING_CACHE_KEY, remaining, PENDING_TTL)

    return count




def probe_node_reachability(server: UserGameServer) -> dict:
    """Test remote and local network connectivity to an Otix node."""
    if getattr(server, "is_local_desktop", False):
        cutoff = timezone.now() - timedelta(seconds=90)
        is_online = bool(server.is_online and server.last_seen_at and server.last_seen_at >= cutoff)
        if server.is_online != is_online:
            server.is_online = is_online
            server.save(update_fields=["is_online", "updated_at"])
        return {
            "reachable": is_online,
            "remote_accessible": False,
            "local_accessible": is_online,
            "status": "online" if is_online else "offline",
            "latency_ms": 1 if is_online else None,
            "tested_url": server.local_url or "otix://desktop",
            "message": "Local desktop node is active." if is_online else "Local desktop node is inactive.",
        }
    headers = _auth_headers(server)

    # 1. Test remote WAN URL first if configured
    probe_target = (server.remote_url or "").strip().rstrip("/")
    if probe_target:
        start_t = time.perf_counter()
        try:
            with httpx.Client(timeout=4.0) as client:
                resp = client.get(f"{probe_target}/api/v1/ping", headers=headers)
                latency_ms = int((time.perf_counter() - start_t) * 1000)
                if resp.status_code == 200:
                    server.is_online = True
                    server.last_seen_at = timezone.now()
                    server.save(update_fields=["is_online", "last_seen_at", "updated_at"])
                    return {
                        "reachable": True,
                        "remote_accessible": True,
                        "local_accessible": True,
                        "status": "online",
                        "latency_ms": latency_ms,
                        "remote_url": probe_target,
                        "tested_url": probe_target,
                        "message": f"Accessible from the internet ({latency_ms}ms)",
                    }
        except Exception:
            pass

    # 2. Test primary_url and local_url if remote access was unreachable or not configured
    local_targets: list[str] = []
    if server.primary_url and server.primary_url != probe_target:
        local_targets.extend(contact_urls(server.primary_url))
    if server.local_url and server.local_url != probe_target:
        local_targets.extend(contact_urls(server.local_url))

    seen: set[str] = set()
    deduped_local: list[str] = []
    for t in local_targets:
        if t not in seen:
            seen.add(t)
            deduped_local.append(t)

    for target in deduped_local:
        start_t = time.perf_counter()
        try:
            with httpx.Client(timeout=3.0) as client:
                resp = client.get(f"{target.rstrip('/')}/api/v1/ping", headers=headers)
                if resp.status_code != 200:
                    resp = client.get(f"{target.rstrip('/')}/api/v1/status", headers=headers)
                latency_ms = int((time.perf_counter() - start_t) * 1000)
                if resp.status_code == 200:
                    server.is_online = True
                    server.last_seen_at = timezone.now()
                    server.save(update_fields=["is_online", "last_seen_at", "updated_at"])
                    return {
                        "reachable": True,
                        "remote_accessible": False,
                        "local_accessible": True,
                        "status": "online",
                        "latency_ms": latency_ms,
                        "tested_url": target,
                        "message": f"Accessible locally on LAN ({latency_ms}ms)",
                        "suggestion": (
                            "Node is reachable on your local network. Configure a Remote URL or port forwarding (8090) if you wish to access it away from home."
                            if not probe_target
                            else "Node is reachable locally, but unreachable via WAN IP. Check router port forwarding (8090)."
                        ),
                    }
        except Exception:
            continue

    # 3. Not reachable through any target
    server.is_online = False
    server.save(update_fields=["is_online", "updated_at"])
    return {
        "reachable": False,
        "remote_accessible": False,
        "local_accessible": False,
        "status": "unreachable",
        "latency_ms": None,
        "error": "Node unreachable",
        "message": "Node is offline or unreachable. Check that the Otix Node daemon is running and network is connected.",
        "suggestion": "Check that the Otix daemon is started on your server and port 8090 is accessible.",
    }


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


def server_match_keys(
    local_url: str | None, remote_url: str | None, auth_token: str | None
) -> set[str]:
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
    if extra.last_seen_at and (
        keeper.last_seen_at is None or extra.last_seen_at > keeper.last_seen_at
    ):
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


def link_or_create_node(user, data: dict) -> tuple[UserNode, bool]:
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
        for field in ("name", "local_url", "remote_url", "auth_token", "is_active", "is_local", "is_local_desktop"):
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


def ping_node_sync(server: UserNode) -> dict:
    """Probe node /api/v1/status and update node model state."""
    if getattr(server, "is_local_desktop", False):
        cutoff = timezone.now() - timedelta(seconds=90)
        is_online = bool(server.is_online and server.last_seen_at and server.last_seen_at >= cutoff)
        if server.is_online != is_online:
            server.is_online = is_online
            server.save(update_fields=["is_online", "updated_at"])
        return {"online": is_online, "latency_ms": 0}

    targets: list[str] = []
    if getattr(server, "is_local", False):
        if server.local_url:
            targets.extend(contact_urls(server.local_url))
        if server.remote_url:
            targets.extend(contact_urls(server.remote_url))
    else:
        if server.primary_url:
            targets.extend(contact_urls(server.primary_url))
        if server.local_url and server.local_url != server.primary_url:
            targets.extend(contact_urls(server.local_url))

    seen_t: set[str] = set()
    deduped_targets: list[str] = []
    for t in targets:
        if t not in seen_t:
            seen_t.add(t)
            deduped_targets.append(t)
    targets = deduped_targets

    if not targets:
        return _mark_offline(server, "No node URL provided")

    headers = _auth_headers(server)
    start_t = time.perf_counter()
    last_error = "No node URL provided"
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
                    tf = data.get("total_files")
                    server.total_files = tf if tf is not None else 0
                    df = data.get("disk_free_bytes")
                    server.storage_free_bytes = df if df is not None else 0
                    dt = data.get("disk_total_bytes")
                    server.storage_total_bytes = dt if dt is not None else 0
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


ping_server_sync = ping_node_sync


def server_proxy_request(
    server: UserGameServer,
    method: str,
    path: str,
    params: dict | None = None,
    json: dict | None = None,
    timeout: float = 6.0,
) -> tuple[int, dict | list]:
    """Generic helper to proxy requests to connected otix-server node."""
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


def explorer_request_permission(
    server: UserGameServer,
    path: str,
) -> tuple[int, dict | list]:
    """Proxy request-permission request to connected otix-server node."""
    payload = {"path": path}
    return server_proxy_request(
        server, "POST", "/api/v1/explorer/request-permission", json=payload, timeout=10.0
    )


def explorer_connect_share(
    server: UserGameServer,
    payload: dict,
) -> tuple[int, dict | list]:
    """Proxy connect-share request to connected otix-server node."""
    return server_proxy_request(
        server, "POST", "/api/v1/explorer/connect-share", json=payload, timeout=15.0
    )


# ── Usenet (SABnzbd & Prowlarr) Operations ──────────────────────────────


def usenet_get_config(
    server: UserGameServer, include_secrets: bool = False
) -> tuple[int, dict | list]:
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
        server, "GET", "/api/v1/usenet/search", params={"query": query}, timeout=60.0
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
        server, "GET", "/api/v1/downloads/search", params=params, timeout=60.0
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


def scan_game_libraries(server: UserGameServer, params: dict | None = None) -> tuple[int, dict | list]:
    """Ask the game server to re-index installer files after a download completes."""
    return usenet_proxy_request(server, "POST", "/api/v1/scan", params=params, timeout=120.0)


def clear_scanned_game_libraries(server: UserGameServer) -> tuple[int, dict | list]:
    """Clear the node's in-memory hosted file index (does not delete files on disk)."""
    return usenet_proxy_request(server, "POST", "/api/v1/scan/clear", timeout=15.0)


def node_get_sessions(
    server: UserGameServer, limit: int = 100
) -> tuple[int, dict | list]:
    """Fetch recorded gameplay sessions and performance metrics from the node."""
    params = {"limit": limit}
    return usenet_proxy_request(server, "GET", "/api/v1/games/sessions", params=params, timeout=6.0)


def node_get_running_games(server: UserGameServer) -> tuple[int, dict | list]:
    """Fetch currently running game(s) from the node."""
    if not server.primary_url or server.primary_url.startswith("otix://"):
        return 200, {"running": False, "game": None, "games": []}
    return usenet_proxy_request(server, "GET", "/api/v1/games/running", timeout=4.0)


# ── Radarr Operations ───────────────────────────────────────────────────


def _instance_params(params: dict | None, instance_id: str | None) -> dict | None:
    if instance_id:
        merged = dict(params or {})
        merged["instance_id"] = instance_id
        return merged
    return params


def radarr_get_config(
    server: UserGameServer, include_secrets: bool = False
) -> tuple[int, dict | list]:
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


def sonarr_get_config(
    server: UserGameServer, include_secrets: bool = False
) -> tuple[int, dict | list]:
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
NO_GOG_NODE = "Connect an Otix Server to link GOG."


# ── Desktop Operations ──────────────────────────────────────────────────


# Node offline configuration caching & pending update queue helpers
NODE_CACHE_TTL = 60 * 60 * 24 * 30  # 30 days


def get_node_pending_updates(server_id: int) -> list[dict]:
    """Retrieve all configuration updates queued for this node while it was offline."""
    return cache.get(f"node_pending_updates:{server_id}") or []


def queue_node_update(server_id: int, update_type: str, data: Any) -> dict:
    """Queue a configuration update for an offline node so it can receive it when returning online."""
    import uuid

    updates = get_node_pending_updates(server_id)
    entry = {
        "id": str(uuid.uuid4()),
        "type": update_type,
        "data": data,
        "created_at": timezone.now().isoformat(),
    }
    updates.append(entry)
    cache.set(f"node_pending_updates:{server_id}", updates, timeout=NODE_CACHE_TTL)
    return entry


def acknowledge_node_updates(server_id: int, update_ids: list[str] | None = None) -> list[dict]:
    """Acknowledge and clear received updates for a node."""
    updates = get_node_pending_updates(server_id)
    if not update_ids:
        cache.delete(f"node_pending_updates:{server_id}")
        return []
    remaining = [u for u in updates if u.get("id") not in update_ids]
    cache.set(f"node_pending_updates:{server_id}", remaining, timeout=NODE_CACHE_TTL)
    return remaining


def get_cached_node_config(server_id: int, config_type: str) -> Any:
    """Retrieve staged/cached configuration for a node."""
    return cache.get(f"node_cached_config:{server_id}:{config_type}")


def set_cached_node_config(server_id: int, config_type: str, data: Any):
    """Store staged/cached configuration for a node so it remains available offline."""
    cache.set(f"node_cached_config:{server_id}:{config_type}", data, timeout=NODE_CACHE_TTL)


def desktop_get_settings(
    server: UserGameServer, params: dict | None = None
) -> tuple[int, dict | list]:
    cached = get_cached_node_config(server.id, "desktop_settings")
    target_url = server.primary_url or server.local_url or ""
    if not server.is_online or not target_url or target_url.startswith("otix://"):
        return 200, cached if cached is not None else {}
    status_code, data = usenet_proxy_request(server, "GET", "/api/v1/desktop/settings", params=params, timeout=10.0)
    if status_code < 400 and isinstance(data, dict):
        if not data.get("hardware"):
            hw_code, hw_data = usenet_proxy_request(server, "GET", "/api/v1/hardware", timeout=6.0)
            if hw_code < 400 and isinstance(hw_data, dict):
                data["hardware"] = hw_data
        set_cached_node_config(server.id, "desktop_settings", data)
        return status_code, data
    # Fallback to direct hardware probe if desktop/settings failed
    hw_code, hw_data = usenet_proxy_request(server, "GET", "/api/v1/hardware", timeout=6.0)
    if hw_code < 400 and isinstance(hw_data, dict):
        fallback_data = dict(cached) if isinstance(cached, dict) else {}
        fallback_data["hardware"] = hw_data
        set_cached_node_config(server.id, "desktop_settings", fallback_data)
        return 200, fallback_data
    if cached is not None:
        return 200, cached
    return 200, {}


def node_list_libraries(server: UserGameServer) -> tuple[int, dict | list]:
    cached = get_cached_node_config(server.id, "libraries")
    target_url = server.primary_url or server.local_url or ""
    if not server.is_online or not target_url or target_url.startswith("otix://"):
        return 200, cached if cached is not None else []
    status_code, data = usenet_proxy_request(server, "GET", "/api/v1/libraries", timeout=8.0)
    if status_code < 400:
        set_cached_node_config(server.id, "libraries", data)
        return status_code, data
    if cached is not None:
        return 200, cached
    return 200, []


def node_replace_libraries(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    set_cached_node_config(server.id, "libraries", payload)
    target_url = server.primary_url or server.local_url or ""
    if not server.is_online or not target_url or target_url.startswith("otix://"):
        queue_node_update(server.id, "libraries", payload)
        return 200, {"status": "queued", "message": "Libraries saved and queued for sync", "queued": True}
    status_code, data = usenet_proxy_request(server, "PUT", "/api/v1/libraries", json=payload, timeout=20.0)
    if status_code >= 400:
        queue_node_update(server.id, "libraries", payload)
        return 200, {"status": "queued", "message": "Node unreachable; changes saved and queued for sync", "queued": True}
    return status_code, data


def node_get_organize(server: UserGameServer) -> tuple[int, dict | list]:
    cached = get_cached_node_config(server.id, "organize")
    target_url = server.primary_url or server.local_url or ""
    if not server.is_online or not target_url or target_url.startswith("otix://"):
        return 200, cached if cached is not None else {"enabled": False, "rules": []}
    status_code, data = usenet_proxy_request(server, "GET", "/api/v1/organize", timeout=6.0)
    if status_code < 400:
        set_cached_node_config(server.id, "organize", data)
        return status_code, data
    if cached is not None:
        return 200, cached
    return 200, {"enabled": False, "rules": []}


def node_save_organize(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    set_cached_node_config(server.id, "organize", payload)
    target_url = server.primary_url or server.local_url or ""
    if not server.is_online or not target_url or target_url.startswith("otix://"):
        queue_node_update(server.id, "organize", payload)
        return 200, {"status": "queued", "message": "Organize settings saved and queued for sync", "queued": True}
    status_code, data = usenet_proxy_request(server, "POST", "/api/v1/organize", json=payload, timeout=10.0)
    if status_code >= 400:
        queue_node_update(server.id, "organize", payload)
        return 200, {"status": "queued", "message": "Node unreachable; changes saved and queued for sync", "queued": True}
    return status_code, data


def node_preview_organize(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    if not server.primary_url or server.primary_url.startswith("otix://"):
        return 400, {"error": "Local desktop client node does not support server-side organization preview."}
    status_code, data = usenet_proxy_request(server, "POST", "/api/v1/organize/preview", json=payload, timeout=15.0)
    if status_code >= 400:
        detail = ""
        if isinstance(data, dict):
            detail = data.get("error") or data.get("detail") or ""
        if not detail:
            detail = f"Otix node '{server.name}' returned status {status_code} while previewing organization rules."
        return status_code, {"error": detail, "detail": detail}
    return status_code, data


def node_execute_organize(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    if not server.primary_url or server.primary_url.startswith("otix://"):
        return 400, {"error": "Local desktop client node does not support server-side organization execution."}
    return usenet_proxy_request(server, "POST", "/api/v1/organize/execute", json=payload, timeout=30.0)


def desktop_save_settings(server: UserGameServer, payload: dict) -> tuple[int, dict | list]:
    set_cached_node_config(server.id, "desktop_settings", payload)
    target_url = server.primary_url or server.local_url or ""
    if not server.is_online or not target_url or target_url.startswith("otix://"):
        queue_node_update(server.id, "desktop_settings", payload)
        return 200, {"status": "queued", "message": "Desktop settings saved and queued for sync", "queued": True}
    status_code, data = usenet_proxy_request(
        server, "POST", "/api/v1/desktop/settings", json=payload, timeout=10.0
    )
    if status_code >= 400:
        queue_node_update(server.id, "desktop_settings", payload)
        return 200, {"status": "queued", "message": "Node unreachable; changes saved and queued for sync", "queued": True}
    return status_code, data


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


def proxy_gog_auth(server: UserGameServer, code: str) -> tuple[int, dict]:
    return server_proxy_request(
        server, "POST", "/api/v1/gog/auth", json={"code": code}, timeout=20.0
    )


def proxy_gog_status(server: UserGameServer) -> tuple[int, dict]:
    return server_proxy_request(server, "GET", "/api/v1/gog/status")


def proxy_gog_scan(server: UserGameServer) -> tuple[int, dict]:
    return server_proxy_request(server, "POST", "/api/v1/gog/scan", timeout=60.0)


def proxy_gog_disconnect(server: UserGameServer) -> tuple[int, dict]:
    return server_proxy_request(server, "DELETE", "/api/v1/gog/auth")


link_or_create_game_server = link_or_create_node

pick_online_node = pick_online_game_server

collapse_duplicate_nodes = collapse_duplicate_game_servers
