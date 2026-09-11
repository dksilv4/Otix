"""Plugin registry service — the API's interface to plugin state.

Registering (scan), enabling, disabling, granting and uninstalling never execute
plugin code: they read a manifest from disk, sync the ``Plugin`` row (operator
intent / the API's source of truth), and leave actually *loading* code to the
separate host process, which reacts to the rows. HTTP-free, so the manage.py
commands and the future config/PluginAPI endpoints share it.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from django.conf import settings

from plugins.discovery import scan
from plugins.gateway import deactivate_plugin_tokens, ensure_plugin_token
from plugins.manifest import PluginManifest
from plugins.models import Plugin

logger = logging.getLogger(__name__)


class PluginStateError(ValueError):
    """A plugin state transition was rejected (unknown/missing grants/etc.)."""


def plugin_root() -> Path:
    return Path(settings.PLUGINS_ROOT)


def bundled_root() -> Path:
    return Path(settings.BUNDLED_PLUGINS_ROOT)


def _manifest_defaults(manifest: PluginManifest) -> dict[str, Any]:
    return {
        "version": manifest.version,
        "description": manifest.description,
        "author": manifest.author,
        "repository": manifest.repository,
        "icon": manifest.icon or "",
        "stage": manifest.stage,
        "min_app_version": manifest.min_app_version,
        "manifest": manifest.to_dict(),
        "permissions_declared": list(manifest.permissions),
    }


def _dedupe(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def register_plugin(
    manifest: PluginManifest, *, system: bool = False, grant: list[str] | None = None
) -> tuple[Plugin, bool]:
    """Create or refresh the registry row for ``manifest``.

    Creating seeds ``enabled=False`` (unless ``system``), empty config/instances
    and grants = declared + extra ``grant`` tokens. Refreshing keeps the
    operator's enabled/config/instances/granted, re-seeds freshly declared
    permissions into granted (trusted-self-host default: a version that starts
    asking for more still runs) and preserves operator-added grants such as
    ``table:any``. Returns ``(plugin, created)``.
    """
    granted = _dedupe((grant or []) + list(manifest.permissions))
    existing = Plugin.objects.filter(name=manifest.name).first()
    if existing is None:
        plugin = Plugin(
            name=manifest.name,
            permissions_granted=granted,
            config={},
            instances=[],
            enabled=system,
            system=system,
            error="",
            **_manifest_defaults(manifest),
        )
        plugin.save()
        if plugin.enabled:
            # Auto-enabled (system) plugins come up with their token live, so the
            # registry and the gateway never disagree about enabled == has token.
            ensure_plugin_token(plugin=plugin.name)
        return plugin, True
    for key, value in _manifest_defaults(manifest).items():
        setattr(existing, key, value)
    existing.permissions_granted = _dedupe(
        list(existing.permissions_granted or []) + granted
    )
    existing.system = existing.system or system
    existing.error = ""
    existing.save()
    return existing, False


def _get_plugin(name: str) -> Plugin:
    plugin = Plugin.objects.filter(name=name).first()
    if plugin is None:
        raise PluginStateError(f"plugin '{name}' is not registered (run plugins_scan)")
    return plugin


def enable_plugin(name: str) -> Plugin:
    """Enable a registered plugin, refusing until every declared grant is present."""
    plugin = _get_plugin(name)
    if plugin.system:
        raise PluginStateError(f"plugin '{name}' is a system plugin and always enabled")
    missing = plugin.missing_grants()
    if missing:
        raise PluginStateError(
            f"plugin '{name}' declares permissions not granted: {', '.join(missing)}"
        )
    invalid = plugin.invalid_grants()
    if invalid:
        raise PluginStateError(
            f"plugin '{name}' has unknown granted permissions: {', '.join(invalid)}"
        )
    plugin.enabled = True
    plugin.error = ""
    plugin.save(update_fields=("enabled", "error", "updated_at"))
    # An enabled plugin owns an active scoped token; mint it when missing so the
    # registry and gateway agree (existing shared secrets are kept on re-enable).
    ensure_plugin_token(plugin=plugin.name)
    return plugin


def disable_plugin(name: str) -> Plugin:
    plugin = _get_plugin(name)
    if plugin.system:
        raise PluginStateError(f"plugin '{name}' is a system plugin and cannot be disabled")
    plugin.enabled = False
    plugin.save(update_fields=("enabled", "updated_at"))
    # Disabling cuts third-party access: deactivate the plugin's tokens so any
    # previously-shared secret stops resolving immediately.
    deactivate_plugin_tokens(plugin.name)
    return plugin


def unregister_plugin(name: str) -> None:
    plugin = _get_plugin(name)
    if plugin.system:
        raise PluginStateError(f"plugin '{name}' is a system plugin and cannot be uninstalled")
    plugin.delete()


def scan_root(root: str | Path | None = None) -> list[dict]:
    """Register every healthy plugin folder under ``root``; report per folder.

    A broken folder never blocks the rest: it is reported and its error is
    surfaced on any existing registry row. Returns a JSON-friendly per-folder
    report (``ok``/``created``/``enabled``/``version`` or ``ok=False``+``error``).
    """
    records = scan(plugin_root() if root is None else root)
    report: list[dict] = []
    for record in records:
        if not record.ok:
            existing = Plugin.objects.filter(name=record.id).first()
            if existing is not None:
                existing.error = record.error or ""
                existing.save(update_fields=("error", "updated_at"))
            report.append({"id": record.id, "ok": False, "error": record.error})
            continue
        plugin, created = register_plugin(record.manifest)
        report.append(
            {
                "id": plugin.name,
                "ok": True,
                "created": created,
                "enabled": plugin.enabled,
                "version": plugin.version,
            }
        )
    return report


def scan_bundled() -> list[dict]:
    """Seed first-party plugins (BUNDLED_PLUGINS_ROOT) as auto-enabled system rows.

    Bundled plugins are shipped with the app and never disabled/uninstalled — the
    Nextcloud shipped-apps analog. A same-named plugin the operator installed
    under PLUGINS_ROOT shadows the bundled copy (their row stays operator-owned).
    """
    records = scan(bundled_root())
    report: list[dict] = []
    for record in records:
        if not record.ok:
            existing = Plugin.objects.filter(name=record.id).first()
            if existing is not None:
                existing.error = record.error or ""
                existing.save(update_fields=("error", "updated_at"))
            report.append({"id": record.id, "ok": False, "error": record.error})
            continue
        if Plugin.objects.filter(name=record.id, system=False).exists():
            report.append(
                {"id": record.id, "ok": True, "created": False, "skipped": "operator copy wins"}
            )
            continue
        plugin, created = register_plugin(record.manifest, system=True)
        if plugin.system and not plugin.enabled:
            plugin.enabled = True
            plugin.save(update_fields=("enabled", "updated_at"))
            ensure_plugin_token(plugin=plugin.name)
        report.append(
            {
                "id": plugin.name,
                "ok": True,
                "created": created,
                "enabled": plugin.enabled,
                "version": plugin.version,
            }
        )
    return report
