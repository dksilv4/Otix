from __future__ import annotations

import asyncio
import socket
import httpx
from otix_server.config import AppConfig


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


async def announce_heartbeat(config: AppConfig):
    """Periodically announce WAN/LAN endpoints to central Otix Registry."""
    if not config.server.enable_heartbeat:
        return

    local_ip = get_local_ip()
    port = config.server.port
    registry_url = config.server.registry_url.rstrip("/")

    payload = {
        "server_name": config.server.name,
        "local_endpoints": [f"http://{local_ip}:{port}"],
        "port": port,
        "auth_token": config.server.auth_token,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        while True:
            try:
                resp = await client.post(f"{registry_url}/v1/servers/heartbeat", json=payload)
                if resp.status_code == 200:
                    print(f"[Heartbeat] Server heartbeat announced to {registry_url}")
            except Exception:
                # Silently ignore heartbeat failure if registry unreachable
                pass

            await asyncio.sleep(300)  # Heartbeat every 5 minutes
