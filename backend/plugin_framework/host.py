"""Plugin host — the separate process that RUNS plugin code.

The Django API owns ``Plugin`` rows and never imports plugin code; the host
reads those rows and loads each *enabled* plugin's entry module into an
in-process :class:`PluginRegistry`, invoking its lifecycle hooks. It runs as its
own process/container (``manage.py plugin_host``) and exposes a small internal
control API (``plugins.hostserver``) the API talks to over 127.0.0.1 + a shared
secret.

``sync`` reconciles the live registry with the DB: enabled rows are loaded
(first time / after a version bump), disabled rows are unloaded, rows the DB no
longer has are dropped, and load failures are written back to the row's
``error`` so the admin/API can surface them. This module imports Django models
and is host-side only — plugin code never imports it.
"""

from __future__ import annotations

import logging
from pathlib import Path

from django.conf import settings

from plugin_framework.base import Plugin as LoadedPlugin
from plugin_framework.base import PluginError
from plugin_framework.events import publish_lifecycle
from plugin_framework.framework import build_services
from plugin_framework.manifest import ManifestError, PluginManifest, load_manifest
from plugin_framework.models import Plugin
from plugin_framework.registry import PluginRegistry, load_plugin

logger = logging.getLogger(__name__)


def plugin_folder(name: str) -> Path:
    """The on-disk folder for ``name``: operator root wins, bundled falls back.

    Operator-installed plugins (PLUGINS_ROOT, gitignored) take precedence over a
    same-named first-party plugin (BUNDLED_PLUGINS_ROOT, checked in) — an
    operator override shadows the shipped copy.
    """
    operator = Path(settings.PLUGINS_ROOT) / name
    if (operator / "manifest.yaml").is_file():
        return operator
    bundled = Path(settings.BUNDLED_PLUGINS_ROOT) / name
    if (bundled / "manifest.yaml").is_file():
        return bundled
    return operator


def read_plugin_folder(name: str) -> tuple[PluginManifest | None, str | None]:
    """Validate + parse a plugin folder; ``(manifest, error)`` with one None."""
    folder = plugin_folder(name)
    manifest_file = folder / "manifest.yaml"
    if not folder.is_dir() or not manifest_file.is_file():
        return None, f"folder '{name}' not found under plugins root {settings.PLUGINS_ROOT}"
    try:
        manifest = load_manifest(manifest_file)
    except ManifestError as exc:
        return None, str(exc)
    if manifest.name != folder.name:
        return None, (f"manifest 'name' ({manifest.name}) must match folder name ({folder.name})")
    if not (folder / "__init__.py").is_file():
        return None, "plugin folder must be a Python package (add __init__.py)"
    if not (folder / manifest.entry_main).is_file():
        return None, f"entry module '{manifest.entry_main}' missing"
    return manifest, None


class PluginHost:
    """Owns the live plugin registry for this process and reconciles it with DB."""

    def __init__(self, registry: PluginRegistry | None = None) -> None:
        self.registry = registry or PluginRegistry()

    # ── Reconcile registry ↔ DB ────────────────────────────────────────
    def sync(self) -> dict:
        """Load enabled / unload disabled, mirroring the current DB rows."""
        reconciled: list[dict] = []
        for row in Plugin.objects.all():
            reconciled.append(self._reconcile_row(row))
        for name in self.registry.ids():
            if not Plugin.objects.filter(name=name).exists():
                self._unload(name)
                reconciled.append({"id": name, "ok": True, "action": "unloaded"})
        return {"reconciled": reconciled}

    def reload(self, name: str) -> dict:
        """Re-read one plugin's DB row and load/unload to match it."""
        row = Plugin.objects.filter(name=name).first()
        if row is None:
            return {"id": name, "ok": False, "error": "not registered"}
        return self._reconcile_row(row)

    def reload_all(self) -> dict:
        return self.sync()

    def _reconcile_row(self, row: Plugin) -> dict:
        name = row.name
        if not row.enabled:
            if self.registry.get(name) is not None:
                self._unload(name)
                return {"id": name, "ok": True, "action": "disabled"}
            return {"id": name, "ok": True, "action": "disabled"}
        if self._load_row(row) is None:
            return {"id": name, "ok": False, "action": "error"}
        return {"id": name, "ok": True, "action": "enabled", "version": row.version}

    def _load_row(self, row: Plugin) -> LoadedPlugin | None:
        """Load + enable ``row``; on failure record the error on the row."""
        missing = row.missing_grants()
        if missing:
            return self._fail(row, "missing grants: " + ", ".join(missing))
        manifest, error = read_plugin_folder(row.name)
        if error:
            return self._fail(row, error)
        existing = self.registry.get(row.name)
        if existing is not None and existing.manifest.version == manifest.version:
            row.error = ""
            row.save(update_fields=("error", "updated_at"))
            return existing
        if existing is not None:
            self._unload(row.name)
        try:
            plugin = load_plugin(manifest, plugin_folder(row.name))
            plugin.services = build_services(row)
            plugin.enable()
        except Exception as exc:  # noqa: BLE001 - an enable() bug must not kill the host
            message = str(exc) if isinstance(exc, PluginError) else f"{type(exc).__name__}: {exc}"
            return self._fail(row, message)
        self.registry.register(plugin)
        row.error = ""
        row.save(update_fields=("error", "updated_at"))
        logger.info("host loaded plugin %s %s", row.name, manifest.version)
        publish_lifecycle("loaded", row.name, version=manifest.version)
        return plugin

    def _fail(self, row: Plugin, message: str) -> None:
        if self.registry.get(row.name) is not None:
            self._unload(row.name)
        row.error = message
        row.save(update_fields=("error", "updated_at"))
        logger.error("plugin %s error: %s", row.name, message)
        publish_lifecycle("error", row.name, version=row.version, error=message)
        return None

    def _unload(self, name: str) -> None:
        plugin = self.registry.unregister(name)
        if plugin is None:
            return
        try:
            plugin.disable()
        except Exception:  # noqa: BLE001 - a disable hook must never block the host
            logger.exception("plugin %s disable() hook raised", name)
        logger.info("host unloaded plugin %s", name)
        publish_lifecycle("unloaded", name, version=plugin.manifest.version)

    # ── Status / call surface (served by HostControlServer) ────────────
    def status(self) -> list[dict]:
        rows = {row.name: row for row in Plugin.objects.all()}
        loaded = set(self.registry.ids())
        out: list[dict] = []
        for name in sorted(set(rows) | loaded):
            row = rows.get(name)
            out.append(
                {
                    "id": name,
                    "version": row.version if row else None,
                    "enabled": bool(row and row.enabled),
                    "loaded": name in loaded,
                    "error": self._row_error(row, name, loaded),
                    "config": row.config if row else {},
                    "instances": row.instances if row else [],
                    "granted": list(row.permissions_granted) if row else [],
                }
            )
        return out

    @staticmethod
    def _row_error(row: Plugin | None, name: str, loaded: set[str]) -> str:
        if row is not None:
            return row.error or ""
        return "not in registry db" if name in loaded else ""

    def call(self, name: str, method: str, payload: object = None) -> dict:
        """Dispatch a data method on a loaded plugin (API proxies this)."""
        row = Plugin.objects.filter(name=name).first()
        plugin = self.registry.get(name)
        if row is None:
            return {"ok": False, "error": "not registered"}
        if not row.enabled:
            return {"ok": False, "error": "plugin disabled"}
        if plugin is None:
            return {"ok": False, "error": "plugin not loaded (see error on the row)"}
        if row.missing_grants():
            return {"ok": False, "error": "missing grants: " + ", ".join(row.missing_grants())}
        plugin.services = build_services(row)  # fresh config/grants each dispatch
        try:
            result = plugin.call(method, payload)
        except PluginError as exc:
            return {"ok": False, "error": str(exc)}
        except Exception as exc:  # noqa: BLE001 - a plugin bug must not kill the host
            return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
        return {"ok": True, "result": result}

    def describe(self, name: str) -> dict:
        """Advertise a loaded plugin's methods + manifest (host-side only)."""
        plugin = self.registry.get(name)
        if plugin is None:
            return {"ok": False, "error": "plugin not loaded"}
        try:
            return {"ok": True, "result": plugin.describe()}
        except Exception as exc:  # noqa: BLE001 - plugin describe must not kill host
            return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}
