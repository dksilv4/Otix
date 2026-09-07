"""Server-side ``Plugin`` base + JSON-safe output coercion.

Each plugin folder's ``plugin.py`` imports ``Plugin`` and subclasses it. The
subclass implements *data methods* — the RPC surface the host and, ultimately,
the unchanged React frontend call (legacy ``movies.list`` / ``requests.list`` /
``sync.now`` ...). Method strings use ``.``-separated namespaces; a method
``"movies.list"`` maps to a handler method ``movies_list`` on the subclass.

Execution is in-process (the trusted self-host model). Background/long work
belongs in Celery tasks in a later increment; interactive handlers stay
synchronous here and are expected to return quickly.
"""

from __future__ import annotations

import inspect
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

from plugins.manifest import PluginManifest

# Methods every ``Plugin`` carries that are NOT data methods. A plugin that
# names a handler the same way is rejected rather than silently shadowed.
_RESERVED = frozenset(
    {
        "call",
        "describe",
        "dispatch",
        "install",
        "enable",
        "disable",
        "manifest",
        "handlers",
        "require_permission",
    }
)


class PluginError(Exception):
    """A plugin failed to load, dispatch or return a usable result."""


def to_json_safe(value: Any) -> Any:
    """Coerce a plugin return value to JSON-safe primitives.

    Handles the common non-JSON stdlib types (dates, sets, bytes, Decimal,
    Path). Anything else non-primitive raises so a plugin author notices a
    payload the host API could never serve, instead of shipping a silent
    ``TypeError`` deep in the response stack.
    """
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, set):
        return [to_json_safe(item) for item in sorted(value, key=str)]
    if isinstance(value, (list, tuple)):
        return [to_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): to_json_safe(item) for key, item in value.items()}
    raise PluginError(
        f"plugin returned a non-JSON-safe value of type {type(value).__name__}"
    )


class Plugin:
    """Base class for a server-side plugin.

    Subclasses set ``manifest`` (or receive it at construction) and implement
    data methods. A typical minimal plugin::

        from plugins.base import Plugin
        from plugins.manifest import load_manifest

        class Echo(Plugin):
            manifest = load_manifest(Path(__file__).with_name("manifest.yaml"))

            def ping(self, payload: dict) -> dict:
                return {"pong": payload or {}}
    """

    manifest: PluginManifest

    def __init__(self, manifest: PluginManifest | None = None) -> None:
        if manifest is not None:
            self.manifest = manifest
        if not getattr(self, "manifest", None):
            raise PluginError(f"{type(self).__name__} requires a 'manifest'")
        # The host injects grant-gated framework services before each dispatch;
        # None keeps the base importable by plugin code with no Django context.
        self.services = None

    # ── Lifecycle hooks (called by the registry/host) ────────────────
    def install(self) -> None:
        """Idempotent one-time setup when the plugin is first installed."""

    def enable(self) -> None:
        """Start accepting calls; called when the plugin is turned on."""

    def disable(self) -> None:
        """Stop accepting calls; called when the plugin is turned off."""

    # ── Dispatch ─────────────────────────────────────────────────────
    def handlers(self) -> dict[str, inspect.Signature]:
        """Public data methods: ``"movies.list" -> signature``."""
        found: dict[str, inspect.Signature] = {}
        for name, member in inspect.getmembers(type(self), inspect.isfunction):
            if name.startswith("_") or name in _RESERVED:
                continue
            method = name.replace("_", ".")
            if hasattr(member, "__wrapped__"):  # decorated; resolve real handler
                member = inspect.unwrap(member)
            try:
                found[method] = inspect.signature(member)
            except (TypeError, ValueError):  # pragma: no cover - builtins etc
                continue
        return found

    def call(self, method: str, payload: Any = None) -> Any:
        """Dispatch a data method (optionally ``.``-namespaced) and JSON-serialise it."""
        if not isinstance(method, str) or not method or len(method) > 200:
            raise PluginError(f"invalid data-method name: {method!r}")
        attr = method.replace(".", "_")
        if not attr.replace("_", "").isalnum():
            raise PluginError(f"invalid data-method name: {method!r}")
        handler = getattr(self, attr, None)
        if handler is None or attr in _RESERVED or attr.startswith("_"):
            raise PluginError(f"plugin '{self.manifest.name}' has no method '{method}'")
        result = handler(payload)
        return to_json_safe(result)

    def describe(self) -> dict:
        """Advertise the plugin surface (manifest + method signatures)."""
        methods = {
            method: _signature_payload(sig)
            for method, sig in self.handlers().items()
        }
        return {
            "id": self.manifest.name,
            "manifest": self.manifest.to_dict(),
            "methods": methods,
        }


def _signature_payload(signature: inspect.Signature) -> dict:
    params = {
        name: {
            "kind": param.kind.name,
            "has_default": param.default is not inspect.Parameter.empty,
        }
        for name, param in signature.parameters.items()
        if name not in {"self", "payload"}
    }
    return {"parameters": params}
