from __future__ import annotations

import asyncio
import os
import socket
from pathlib import Path
from urllib.parse import urlparse

import httpx
from otix_server.config import AppConfig

_LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1"}
_DOCKER_REGISTRY = "http://api:8000/api"


def get_local_ip() -> str:
    """Find local LAN IP address."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def resolve_registry_url(config: AppConfig, *, in_docker: bool | None = None) -> str:
    """Registry the node should heartbeat to.

    Host-run nodes keep config.yaml (usually http://127.0.0.1:8000/api).
    Inside Docker that loopback is the storage container itself, so we send
    heartbeats to the compose api service unless OTIX_REGISTRY_URL is set.
    """
    override = (os.environ.get("OTIX_REGISTRY_URL") or "").strip()
    if override:
        return override.rstrip("/")
    registry = (config.server.registry_url or "").rstrip("/")
    if not registry:
        return ""
    host = (urlparse(registry).hostname or "").lower()
    docker = Path("/.dockerenv").exists() if in_docker is None else in_docker
    if docker and host in _LOOPBACK_HOSTS:
        return _DOCKER_REGISTRY
    return registry


async def announce_heartbeat(config: AppConfig):
    """Periodically announce WAN/LAN endpoints to the Otix API registry."""
    if not config.server.enable_heartbeat:
        return

    registry_url = resolve_registry_url(config)
    if not registry_url:
        return

    local_ip = get_local_ip()
    port = config.server.port

    payload = {
        "server_name": config.server.name,
        "local_endpoints": [f"http://{local_ip}:{port}", f"http://127.0.0.1:{port}"],
        "port": port,
        "auth_token": config.server.auth_token,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        delay = 5
        while True:
            try:
                resp = await client.post(f"{registry_url}/v1/servers/heartbeat", json=payload)
                if resp.status_code == 200:
                    print(f"[Heartbeat] Server heartbeat announced to {registry_url}")
                    delay = 300
                else:
                    print(f"[Heartbeat] {registry_url} returned HTTP {resp.status_code}")
                    delay = 15
            except Exception as exc:
                print(f"[Heartbeat] Failed to reach {registry_url}: {exc}")
                delay = 15

            await asyncio.sleep(delay)
