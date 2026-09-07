"""Thin HTTP client the Django API uses to reach the plugin host.

The API never imports plugin code; it talks to the host's internal control API
(``plugins.hostserver``) over 127.0.0.1 + ``PLUGIN_HOST_SECRET``. Lifecycle and
config stay DB-only and work when the host is down; only dispatching a plugin
data method (``call``/``describe``) actually needs the host.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from django.conf import settings


class HostUnreachableError(ConnectionError):
    """The plugin host control API could not be reached."""


def host_base_url() -> str:
    return f"http://{settings.PLUGIN_HOST_BIND}:{settings.PLUGIN_HOST_PORT}"


def _request(method: str, path: str, payload: dict | None = None, timeout: float = 5.0) -> dict:
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(
        host_base_url() + path,
        data=body,
        method=method,
        headers={
            "Authorization": f"Bearer {settings.PLUGIN_HOST_SECRET}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise HostUnreachableError(f"plugin host returned {exc.code}: {detail}") from exc
    except (urllib.error.URLError, OSError) as exc:
        raise HostUnreachableError(f"plugin host unreachable: {exc}") from exc


def health() -> dict:
    return _request("GET", "/health")


def status() -> dict:
    return _request("GET", "/plugins")


def describe(name: str, timeout: float = 5.0) -> dict:
    return _request("GET", f"/plugins/{name}/describe", timeout=timeout)


def reload(name: str) -> dict:
    return _request("POST", f"/plugins/{name}/reload")


def reload_all() -> dict:
    return _request("POST", "/plugins/reload-all")


def call(name: str, method: str, payload: Any = None, timeout: float = 30.0) -> dict:
    return _request(
        "POST",
        f"/plugins/{name}/call",
        {"method": method, "payload": payload},
        timeout=timeout,
    )
