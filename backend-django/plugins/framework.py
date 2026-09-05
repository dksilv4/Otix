"""Grant-gated framework services the host hands to running plugins.

Plugins run in the host process. Instead of raw DB/network handles they get a
typed surface (:class:`PluginServices`) whose every action is checked against
the grants the operator granted (the row's ``permissions_granted``): an action
requires a capability token, and unless the grant covers it
(``missing_grants`` / ``table:any``/``network:any`` wildcards) the service
raises :class:`PluginPermissionDenied`. Server-enforced today:

- ``network:external`` (or ``network:any``) → :class:`HttpService` (outbound
  http/https)
- ``storage:local`` → :class:`StoreService` (per-plugin JSON key/value)

The remaining manifest permissions (``ui:*``, ``events:subscribe``,
``api:proxy``, ``notifications``, ``table:*``) are UI/browser metadata or map
to a future server surface until a service implements them. The host injects a
fresh ``PluginServices`` onto each plugin instance before every data-method
dispatch (``build_services``), so config/grant edits apply without a reload.
"""

from __future__ import annotations

import json as _json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from plugins.base import PluginError, to_json_safe
from plugins.models import Plugin, PluginStore
from plugins.permissions import missing_grants

_NETWORK_READ_LIMIT = 5_000_000  # cap a plugin's outbound response body
_ALLOWED_SCHEMES = ("http", "https")


class PluginPermissionDenied(PluginError):
    """A plugin called a framework service it was not granted."""

    def __init__(self, token: str) -> None:
        super().__init__(
            f"plugin is not granted '{token}' — ask the operator to grant it"
        )
        self.token = token


def _require(granted: set[str], token: str) -> None:
    if missing_grants([token], granted):
        raise PluginPermissionDenied(token)


class HttpService:
    """Outbound HTTP gated by a ``network:*`` grant."""

    REQUIRED = "network:external"

    def __init__(self, granted: set[str]) -> None:
        self._granted = granted

    def request(
        self,
        url: str,
        *,
        method: str = "GET",
        headers: dict | None = None,
        body: Any = None,
        timeout: float = 15.0,
    ) -> dict:
        """Perform an http(s) request; returns ``{status, ok, data}`` where
        ``data`` is the parsed JSON when the body is JSON, else the text."""
        _require(self._granted, self.REQUIRED)
        if not isinstance(url, str):
            raise PluginError("url must be a string")
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in _ALLOWED_SCHEMES or not parsed.netloc:
            raise PluginError("only http(s) URLs are allowed")
        payload = None
        if body is not None:
            if isinstance(body, (dict, list)):
                payload = _json.dumps(body).encode("utf-8")
            elif isinstance(body, bytes):
                payload = body
            else:
                payload = str(body).encode("utf-8")
        headers = dict(headers or {})
        if payload is not None and "Content-Type" not in headers:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            url, data=payload, method=method, headers=headers
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                status = response.status
                raw = response.read(_NETWORK_READ_LIMIT + 1)
        except urllib.error.HTTPError as exc:
            status = exc.code
            raw = exc.read(_NETWORK_READ_LIMIT + 1)
        except (urllib.error.URLError, OSError) as exc:
            raise PluginError(f"request to {url} failed: {exc}") from exc
        if len(raw) > _NETWORK_READ_LIMIT:
            raise PluginError("response body too large")
        return self._respond(status, raw)

    def get_json(self, url: str, *, headers: dict | None = None, timeout: float = 15.0):
        """GET and return the parsed JSON body (raises on non-2xx/non-JSON)."""
        result = self.request(url, headers=headers, timeout=timeout)
        if not result["ok"]:
            raise PluginError(f"http {result['status']} from {url}")
        if not isinstance(result["data"], (dict, list)):
            raise PluginError(f"expected a JSON body from {url}")
        return result["data"]

    @staticmethod
    def _respond(status: int, raw: bytes) -> dict:
        text = raw.decode("utf-8", errors="replace")
        try:
            data: Any = _json.loads(text)
        except ValueError:
            data = text
        return {"status": status, "ok": 200 <= status < 300, "data": data}


class StoreService:
    """Per-plugin JSON key/value storage gated by the ``storage:local`` grant."""

    REQUIRED = "storage:local"

    def __init__(self, plugin_id: str, granted: set[str]) -> None:
        self._plugin_id = plugin_id
        self._granted = granted

    def _check_key(self, key: str) -> None:
        if not isinstance(key, str) or not key:
            raise PluginError("store key must be a non-empty string")

    def get(self, key: str, default: Any = None) -> Any:
        _require(self._granted, self.REQUIRED)
        self._check_key(key)
        item = PluginStore.objects.filter(plugin__name=self._plugin_id, key=key).first()
        return item.value if item is not None else default

    def set(self, key: str, value: Any) -> Any:
        _require(self._granted, self.REQUIRED)
        self._check_key(key)
        safe = to_json_safe(value)
        plugin = Plugin.objects.get(name=self._plugin_id)
        PluginStore.objects.update_or_create(
            plugin=plugin, key=key, defaults={"value": safe}
        )
        return safe

    def delete(self, key: str) -> None:
        _require(self._granted, self.REQUIRED)
        self._check_key(key)
        PluginStore.objects.filter(plugin__name=self._plugin_id, key=key).delete()

    def keys(self) -> list[str]:
        _require(self._granted, self.REQUIRED)
        return list(
            PluginStore.objects.filter(plugin__name=self._plugin_id)
            .order_by("key")
            .values_list("key", flat=True)
        )


class PluginServices:
    """The typed surface a plugin's data methods use while running in the host.

    ``config`` / ``instances`` are the operator's current values (refreshed each
    dispatch); ``http`` and ``store`` are grant-checked capability services.
    """

    def __init__(
        self,
        *,
        plugin_id: str,
        granted: set[str],
        config: dict | None = None,
        instances: list | None = None,
    ) -> None:
        self.config = dict(config or {})
        self.instances = list(instances or [])
        self.http = HttpService(granted)
        self.store = StoreService(plugin_id, granted)


def build_services(row: Plugin) -> PluginServices:
    """Build fresh services from a registry row's current grants/config."""
    return PluginServices(
        plugin_id=row.name,
        granted=set(row.permissions_granted or []),
        config=row.config or {},
        instances=row.instances or [],
    )
